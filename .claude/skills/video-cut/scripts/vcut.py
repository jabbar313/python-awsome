#!/usr/bin/env python3
"""vcut - cut, split, remove-from, and join video files with ffmpeg.

Wraps the ffmpeg incantations that are easy to get subtly wrong: keyframe-aware
mode selection, unambiguous -ss/-t seeking, stream mapping that does not silently
drop extra audio or subtitle tracks, and concat with a working fallback.

Run `vcut.py <command> --help` for per-command options.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

# A cut start this close to a keyframe is exact under stream copy, so `auto`
# mode keeps the fast path instead of re-encoding for no visible gain.
KEYFRAME_TOLERANCE = 0.05
MP4_LIKE = {".mp4", ".m4v", ".m4a", ".mov"}


class VcutError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# time helpers
# --------------------------------------------------------------------------- #

def parse_time(value):
    """Accept 90, 90.5, '1:30', '01:02:03.250', '90s' -> float seconds."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower()
    if not s:
        return None
    if s.endswith("s") and ":" not in s:
        s = s[:-1]
    parts = s.split(":")
    if len(parts) > 3:
        raise VcutError("cannot parse timestamp %r" % value)
    total = 0.0
    for part in parts:
        if part == "":
            raise VcutError("cannot parse timestamp %r" % value)
        total = total * 60.0 + float(part)
    return total


def fmt_time(seconds):
    """Seconds -> HH:MM:SS.mmm, the format ffmpeg is happiest with."""
    seconds = max(0.0, float(seconds))
    hours, rem = divmod(seconds, 3600.0)
    minutes, secs = divmod(rem, 60.0)
    return "%02d:%02d:%06.3f" % (int(hours), int(minutes), secs)


# --------------------------------------------------------------------------- #
# ffmpeg / ffprobe plumbing
# --------------------------------------------------------------------------- #

def require_tools():
    missing = [t for t in ("ffmpeg", "ffprobe") if shutil.which(t) is None]
    if missing:
        raise VcutError(
            "missing required tool(s): %s. Install ffmpeg "
            "(macOS: brew install ffmpeg / Debian: apt install ffmpeg)."
            % ", ".join(missing)
        )


def run(cmd, capture=True):
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE,
        text=True,
    )
    return proc


def probe(path):
    if not os.path.exists(path):
        raise VcutError("no such file: %s" % path)
    proc = run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ])
    if proc.returncode != 0:
        raise VcutError("ffprobe failed on %s:\n%s" % (path, proc.stderr.strip()))
    return json.loads(proc.stdout)


def duration_of(path, info=None):
    info = info or probe(path)
    fmt_dur = (info.get("format") or {}).get("duration")
    if fmt_dur not in (None, "N/A"):
        return float(fmt_dur)
    best = 0.0
    for stream in info.get("streams", []):
        val = stream.get("duration")
        if val not in (None, "N/A"):
            best = max(best, float(val))
    if best <= 0:
        raise VcutError("could not determine duration of %s" % path)
    return best


def keyframe_times(path, start=None, end=None):
    """Video keyframe timestamps, optionally restricted to a window.

    Restricting the window matters: on a long file a full keyframe scan reads
    the entire container, which turns a one-second decision into minutes.
    """
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey"]
    if start is not None and end is not None:
        cmd += ["-read_intervals", "%s%%%s" % (fmt_time(start), fmt_time(end))]
    # Field name changed across ffmpeg versions; ask for both and take whichever parses.
    cmd += ["-show_entries", "frame=pts_time,pkt_pts_time", "-of", "csv=p=0", path]
    proc = run(cmd)
    if proc.returncode != 0:
        return []
    times = []
    for line in proc.stdout.splitlines():
        for token in line.split(","):
            token = token.strip()
            if not token or token == "N/A":
                continue
            try:
                times.append(float(token))
            except ValueError:
                continue
            break
    return sorted(times)


def keyframe_at_or_before(path, target):
    """Nearest keyframe at or before `target`, or None if the scan finds none."""
    if target is None or target <= 0:
        return 0.0
    for window in (15.0, 60.0, 300.0):
        candidates = keyframe_times(path, max(0.0, target - window), target + 0.5)
        earlier = [t for t in candidates if t <= target + 1e-6]
        if earlier:
            return max(earlier)
    return None


# --------------------------------------------------------------------------- #
# building cut commands
# --------------------------------------------------------------------------- #

def stream_maps(spec):
    if spec:
        maps = []
        for item in spec.split(","):
            maps += ["-map", item.strip()]
        return maps
    # `?` makes each map optional, so a file without subtitles still works.
    return ["-map", "0:v?", "-map", "0:a?", "-map", "0:s?"]


def encode_args(opts):
    args = ["-c:v", opts.vcodec]
    if opts.vcodec != "copy":
        args += ["-preset", opts.preset, "-crf", str(opts.crf), "-pix_fmt", "yuv420p"]
    args += ["-c:a", opts.acodec]
    if opts.acodec != "copy":
        args += ["-b:a", opts.abitrate]
    return args


def container_args(out_path):
    if os.path.splitext(out_path)[1].lower() in MP4_LIKE:
        # Moves the moov atom to the front so the file streams before it fully downloads.
        return ["-movflags", "+faststart"]
    return []


def choose_mode(path, start, requested):
    """Resolve 'auto' into 'copy' or 'precise'.

    Stream copy can only start on a keyframe. If the requested start already sits
    on one, copying is both instant and exact; otherwise ffmpeg would silently
    shift the cut backwards, so re-encoding is the honest choice.
    """
    if requested != "auto":
        return requested, None
    if start is None or start <= 0:
        return "copy", 0.0
    kf = keyframe_at_or_before(path, start)
    if kf is None:
        return "precise", None
    if abs(start - kf) <= KEYFRAME_TOLERANCE:
        return "copy", kf
    return "precise", kf


def ffmpeg_trim(inp, out, start, duration, mode, opts, quiet=False):
    """Write [start, start+duration) of `inp` to `out`."""
    base = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    seek = []
    if start:
        # -ss before -i is fast input seeking, and is frame-accurate when
        # re-encoding on any ffmpeg >= 2.1.
        seek = ["-ss", fmt_time(start)]
    dur = []
    if duration is not None:
        # -t (duration) rather than -to (end time): -to's meaning depends on
        # whether input seeking reset the timestamps, which varies by version.
        dur = ["-t", fmt_time(duration)]

    def build(maps):
        cmd = base + seek + ["-i", inp] + dur + maps + ["-ignore_unknown"]
        if mode == "copy":
            cmd += ["-c", "copy", "-avoid_negative_ts", "make_zero"]
        else:
            cmd += encode_args(opts)
        return cmd + container_args(out) + [out]

    maps = stream_maps(opts.map)
    proc = run(build(maps))
    if proc.returncode != 0 and not opts.map and "0:s?" in maps:
        # Subtitle codecs frequently cannot be muxed into the target container
        # (e.g. subrip into mp4). Losing subtitles beats failing the whole cut.
        fallback = ["-map", "0:v?", "-map", "0:a?"]
        retry = run(build(fallback))
        if retry.returncode == 0:
            if not quiet:
                warn("dropped subtitle streams - they are not compatible with %s"
                     % (os.path.splitext(out)[1] or "this container"))
            return
        proc = retry
    if proc.returncode != 0:
        raise VcutError("ffmpeg failed writing %s:\n%s" % (out, proc.stderr.strip()))


# --------------------------------------------------------------------------- #
# concat
# --------------------------------------------------------------------------- #

def stream_fingerprint(path):
    """The stream parameters that decide whether clips can be joined by copying."""
    info = probe(path)
    video = audio = None
    for stream in info.get("streams", []):
        disposition = stream.get("disposition") or {}
        if stream.get("codec_type") == "video" and not disposition.get("attached_pic"):
            video = video or stream
        elif stream.get("codec_type") == "audio":
            audio = audio or stream
    return {
        "video": (video.get("codec_name"), video.get("width"), video.get("height"),
                  video.get("pix_fmt"), video.get("r_frame_rate")) if video else None,
        "audio": (audio.get("codec_name"), audio.get("sample_rate"),
                  audio.get("channels")) if audio else None,
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "fps": video.get("r_frame_rate") if video else None,
        "has_audio": audio is not None,
        "duration": duration_of(path, info),
    }


def concat_demuxer(out, inputs, opts, reencode=False):
    tmpdir = tempfile.mkdtemp(prefix="vcut-")
    try:
        listfile = os.path.join(tmpdir, "inputs.txt")
        with open(listfile, "w") as fh:
            for item in inputs:
                escaped = os.path.abspath(item).replace("'", "'\\''")
                fh.write("file '%s'\n" % escaped)
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", listfile,
            "-map", "0", "-ignore_unknown",
        ]
        cmd += ["-c", "copy"] if not reencode else encode_args(opts)
        cmd += container_args(out) + [out]
        return run(cmd)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def concat_filter(out, inputs, prints, opts):
    """Join clips whose codecs, resolution, frame rate or audio genuinely differ.

    The concat filter still insists every input share dimensions, frame rate and
    audio layout, so each one is normalised to match the first clip first:
    letterboxed to the same frame, resampled, and given a silent track if it has
    no audio at all. Without that, joining a phone clip to a screen recording
    either errors out or produces a file that only plays back its first segment.
    """
    width = prints[0]["width"] or 1280
    height = prints[0]["height"] or 720
    fps = prints[0]["fps"] or "30"
    want_audio = any(p["has_audio"] for p in prints)

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for item in inputs:
        cmd += ["-i", item]

    silent_index = {}
    if want_audio:
        for idx, fingerprint in enumerate(prints):
            if not fingerprint["has_audio"]:
                silent_index[idx] = len(inputs) + len(silent_index)
                cmd += ["-f", "lavfi", "-t", "%.3f" % fingerprint["duration"],
                        "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]

    chains, labels = [], ""
    for idx in range(len(inputs)):
        chains.append(
            "[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,"
            "pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=%s,format=yuv420p[v%d]"
            % (idx, width, height, width, height, fps, idx))
        labels += "[v%d]" % idx
        if want_audio:
            src = idx if prints[idx]["has_audio"] else silent_index[idx]
            chains.append(
                "[%d:a]aresample=48000,aformat=sample_fmts=fltp:"
                "channel_layouts=stereo[a%d]" % (src, idx))
            labels += "[a%d]" % idx

    graph = ";".join(chains) + ";" + labels + "concat=n=%d:v=1:a=%d[outv]%s" % (
        len(inputs), 1 if want_audio else 0, "[outa]" if want_audio else "")

    cmd += ["-filter_complex", graph, "-map", "[outv]"]
    if want_audio:
        cmd += ["-map", "[outa]"]
    cmd += encode_args(opts) + container_args(out) + [out]
    return run(cmd)


def join(out, inputs, opts, quiet=False):
    if len(inputs) < 2:
        raise VcutError("join needs at least two input files")
    for item in inputs:
        if not os.path.exists(item):
            raise VcutError("no such file: %s" % item)

    prints = [stream_fingerprint(item) for item in inputs]
    uniform = all(p["video"] == prints[0]["video"] and p["audio"] == prints[0]["audio"]
                  for p in prints)

    if uniform:
        # Only safe when the streams really match: the concat demuxer copies
        # mismatched streams without complaining and yields a file that stops
        # playing correctly at the first join.
        proc = concat_demuxer(out, inputs, opts, reencode=False)
        if proc.returncode == 0:
            return "copy"
        if not quiet:
            warn("stream copy join failed, re-encoding instead")
    elif not quiet:
        warn("inputs differ in codec, resolution, frame rate or audio - "
             "re-encoding so the join actually plays through")

    proc = concat_filter(out, inputs, prints, opts)
    if proc.returncode == 0:
        return "reencode"
    raise VcutError("could not join inputs:\n%s" % proc.stderr.strip())


# --------------------------------------------------------------------------- #
# output helpers
# --------------------------------------------------------------------------- #

def warn(msg):
    print("warning: %s" % msg, file=sys.stderr)


def guard_output(path, force):
    if os.path.exists(path) and not force:
        raise VcutError("%s already exists (pass --force to overwrite)" % path)
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)


def report(path):
    try:
        dur = duration_of(path)
    except VcutError:
        dur = float("nan")
    size = os.path.getsize(path) / (1024.0 * 1024.0)
    print("wrote %s  (%s, %.1f MB)" % (path, fmt_time(dur), size))


def resolve_span(start, end, duration, total):
    start = parse_time(start) or 0.0
    end = parse_time(end)
    duration = parse_time(duration)
    if end is not None and duration is not None:
        raise VcutError("give --end or --duration, not both")
    if end is not None:
        if end <= start:
            raise VcutError("--end (%s) must be after --start (%s)"
                            % (fmt_time(end), fmt_time(start)))
        duration = end - start
    if duration is None:
        duration = max(0.0, total - start)
    if start >= total:
        raise VcutError("--start %s is past the end of the file (%s)"
                        % (fmt_time(start), fmt_time(total)))
    return start, min(duration, total - start)


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #

def cmd_probe(opts):
    info = probe(opts.input)
    fmt = info.get("format") or {}
    summary = {
        "path": opts.input,
        "format": fmt.get("format_name"),
        "duration_seconds": round(duration_of(opts.input, info), 3),
        "duration_hms": fmt_time(duration_of(opts.input, info)),
        "size_bytes": int(fmt.get("size", 0) or 0),
        "bit_rate": fmt.get("bit_rate"),
        "streams": [],
    }
    for stream in info.get("streams", []):
        entry = {
            "index": stream.get("index"),
            "type": stream.get("codec_type"),
            "codec": stream.get("codec_name"),
            "language": (stream.get("tags") or {}).get("language"),
        }
        if stream.get("codec_type") == "video":
            entry.update({
                "width": stream.get("width"),
                "height": stream.get("height"),
                "fps": stream.get("r_frame_rate"),
            })
        elif stream.get("codec_type") == "audio":
            entry.update({
                "channels": stream.get("channels"),
                "sample_rate": stream.get("sample_rate"),
            })
        summary["streams"].append(entry)
    print(json.dumps(summary, indent=2))


def cmd_keyframes(opts):
    around = parse_time(opts.around)
    if around is None:
        times = keyframe_times(opts.input)
    else:
        window = float(opts.window)
        times = keyframe_times(opts.input, max(0.0, around - window), around + window)
    print(json.dumps({
        "keyframes": [round(t, 3) for t in times],
        "count": len(times),
    }, indent=2))


def cmd_trim(opts):
    total = duration_of(opts.input)
    start, duration = resolve_span(opts.start, opts.end, opts.duration, total)
    guard_output(opts.output, opts.force)
    mode, kf = choose_mode(opts.input, start, opts.mode)
    if opts.mode == "auto" and mode == "precise" and kf is not None:
        print("start %s is %.2fs after the nearest keyframe (%s) - re-encoding for an exact cut"
              % (fmt_time(start), start - kf, fmt_time(kf)))
    ffmpeg_trim(opts.input, opts.output, start, duration, mode, opts)
    report(opts.output)


def cmd_remove(opts):
    total = duration_of(opts.input)
    cut_from = parse_time(opts.start) or 0.0
    cut_to = parse_time(opts.end)
    if cut_to is None:
        raise VcutError("remove needs --end")
    if cut_to <= cut_from:
        raise VcutError("--end must be after --start")
    guard_output(opts.output, opts.force)

    head = cut_from > 0.01
    tail = cut_to < total - 0.01
    if not head and not tail:
        raise VcutError("that would remove the entire file")

    mode, _ = choose_mode(opts.input, cut_to if tail else 0.0, opts.mode)
    tmpdir = tempfile.mkdtemp(prefix="vcut-")
    try:
        ext = os.path.splitext(opts.input)[1] or ".mp4"
        pieces = []
        if head:
            piece = os.path.join(tmpdir, "head" + ext)
            ffmpeg_trim(opts.input, piece, 0.0, cut_from, mode, opts, quiet=True)
            pieces.append(piece)
        if tail:
            piece = os.path.join(tmpdir, "tail" + ext)
            ffmpeg_trim(opts.input, piece, cut_to, total - cut_to, mode, opts, quiet=True)
            pieces.append(piece)
        if len(pieces) == 1:
            shutil.move(pieces[0], opts.output)
        else:
            join(opts.output, pieces, opts)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    print("removed %s - %s" % (fmt_time(cut_from), fmt_time(cut_to)))
    report(opts.output)


def cmd_split(opts):
    total = duration_of(opts.input)
    given = [opts.at, opts.every, opts.parts]
    if sum(1 for g in given if g) != 1:
        raise VcutError("choose exactly one of --at, --every, --parts")

    if opts.at:
        points = sorted(parse_time(p) for p in opts.at.split(","))
    elif opts.every:
        step = parse_time(opts.every)
        if step <= 0:
            raise VcutError("--every must be positive")
        points, pos = [], step
        while pos < total - 0.05:
            points.append(pos)
            pos += step
    else:
        parts = int(opts.parts)
        if parts < 2:
            raise VcutError("--parts must be 2 or more")
        step = total / parts
        points = [step * i for i in range(1, parts)]

    points = [p for p in points if 0 < p < total]
    if not points:
        raise VcutError("no usable split points inside a %s file" % fmt_time(total))
    bounds = [0.0] + points + [total]

    outdir = opts.outdir or os.path.dirname(os.path.abspath(opts.input))
    os.makedirs(outdir, exist_ok=True)
    stem, ext = os.path.splitext(os.path.basename(opts.input))
    ext = ext or ".mp4"

    targets = []
    for idx in range(len(bounds) - 1):
        target = os.path.join(outdir, "%s_part%03d%s" % (stem, idx + 1, ext))
        guard_output(target, opts.force)
        targets.append(target)

    for idx, target in enumerate(targets):
        start, end = bounds[idx], bounds[idx + 1]
        mode, _ = choose_mode(opts.input, start, opts.mode)
        ffmpeg_trim(opts.input, target, start, end - start, mode, opts, quiet=True)
        report(target)


def cmd_join(opts):
    guard_output(opts.output, opts.force)
    how = join(opts.output, opts.inputs, opts)
    print("joined %d files (%s)" % (len(opts.inputs), how))
    report(opts.output)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def add_encode_opts(parser):
    parser.add_argument("--mode", choices=["auto", "copy", "precise"], default="auto",
                        help="auto (default) copies when the cut lands on a keyframe, "
                             "otherwise re-encodes; copy is fastest but snaps to keyframes; "
                             "precise always re-encodes")
    parser.add_argument("--map", default=None,
                        help="comma-separated ffmpeg -map specs, e.g. '0:v:0,0:a:1'. "
                             "Default keeps all video, audio and subtitle streams.")
    parser.add_argument("--vcodec", default="libx264")
    parser.add_argument("--acodec", default="aac")
    parser.add_argument("--crf", default=18, help="lower is better quality (default 18)")
    parser.add_argument("--preset", default="veryfast")
    parser.add_argument("--abitrate", default="192k")
    parser.add_argument("--force", action="store_true", help="overwrite existing outputs")


def build_parser():
    parser = argparse.ArgumentParser(prog="vcut.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    subs = parser.add_subparsers(dest="command", required=True)

    p = subs.add_parser("probe", help="summarise duration, streams and codecs as JSON")
    p.add_argument("input")
    p.set_defaults(func=cmd_probe)

    p = subs.add_parser("keyframes", help="list video keyframe timestamps")
    p.add_argument("input")
    p.add_argument("--around", help="only scan near this timestamp (much faster)")
    p.add_argument("--window", default=15.0, type=float, help="seconds either side of --around")
    p.set_defaults(func=cmd_keyframes)

    p = subs.add_parser("trim", help="keep one span and discard the rest")
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--start", default=0, help="timestamp, e.g. 12.5, 1:30, 00:01:30.250")
    p.add_argument("--end", help="absolute end timestamp")
    p.add_argument("--duration", help="length to keep, instead of --end")
    add_encode_opts(p)
    p.set_defaults(func=cmd_trim)

    p = subs.add_parser("remove", help="delete a span and stitch the remainder together")
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--start", required=True, help="start of the span to delete")
    p.add_argument("--end", required=True, help="end of the span to delete")
    add_encode_opts(p)
    p.set_defaults(func=cmd_remove)

    p = subs.add_parser("split", help="cut one file into several")
    p.add_argument("input")
    p.add_argument("--outdir", help="defaults to the input's directory")
    p.add_argument("--at", help="comma-separated split timestamps, e.g. '1:30,4:10'")
    p.add_argument("--every", help="split every N seconds/HH:MM:SS")
    p.add_argument("--parts", help="split into N equal parts")
    add_encode_opts(p)
    p.set_defaults(func=cmd_split)

    p = subs.add_parser("join", help="concatenate clips in order")
    p.add_argument("output")
    p.add_argument("inputs", nargs="+")
    add_encode_opts(p)
    p.set_defaults(func=cmd_join)

    return parser


def main(argv=None):
    opts = build_parser().parse_args(argv)
    try:
        require_tools()
        opts.func(opts)
    except VcutError as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
