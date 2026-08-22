#!/usr/bin/env python3
"""detect - find cut points in a video by silence, scene change, or black frames.

Each command prints JSON so the results can be fed straight into vcut.py without
re-reading a wall of ffmpeg log output. Detection is one decode pass, so it costs
roughly the length of the file on a fast machine.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys


class DetectError(RuntimeError):
    pass


def require_tools():
    missing = [t for t in ("ffmpeg", "ffprobe") if shutil.which(t) is None]
    if missing:
        raise DetectError(
            "missing required tool(s): %s. Install ffmpeg "
            "(macOS: brew install ffmpeg / Debian: apt install ffmpeg)."
            % ", ".join(missing))


def duration_of(path):
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        return float(proc.stdout.strip())
    except ValueError:
        raise DetectError("could not read duration of %s" % path)


def analyse(path, filter_args):
    """Run a detection filter and return ffmpeg's stderr.

    The filters report through the log rather than the output stream, so the
    output goes to null and stderr is what actually matters.
    """
    if not os.path.exists(path):
        raise DetectError("no such file: %s" % path)
    cmd = (["ffmpeg", "-hide_banner", "-nostats", "-i", path]
           + filter_args + ["-f", "null", "-"])
    proc = subprocess.run(cmd, stdout=subprocess.DEVNULL,
                          stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise DetectError("ffmpeg analysis failed:\n%s" % proc.stderr.strip()[-2000:])
    return proc.stderr


def invert(spans, total):
    """Turn 'intervals to drop' into 'intervals to keep'."""
    keep, cursor = [], 0.0
    for start, end in spans:
        if start - cursor > 0.05:
            keep.append({"start": round(cursor, 3), "end": round(start, 3)})
        cursor = max(cursor, end)
    if total - cursor > 0.05:
        keep.append({"start": round(cursor, 3), "end": round(total, 3)})
    return keep


def cmd_silence(opts):
    total = duration_of(opts.input)
    stderr = analyse(opts.input, [
        "-af", "silencedetect=noise=%s:d=%s" % (opts.noise, opts.min_duration),
        "-map", "0:a:0",
    ])
    starts = [float(m) for m in re.findall(r"silence_start:\s*(-?[\d.]+)", stderr)]
    ends = [float(m) for m in re.findall(r"silence_end:\s*(-?[\d.]+)", stderr)]
    spans = []
    for idx, start in enumerate(starts):
        end = ends[idx] if idx < len(ends) else total
        spans.append((max(0.0, start), min(total, end)))

    # Trimming flush against speech clips the first syllable, so leave a margin.
    pad = float(opts.pad)
    padded = [(s + pad, e - pad) for s, e in spans if (e - pad) - (s + pad) > 0.05]

    print(json.dumps({
        "duration": round(total, 3),
        "silences": [{"start": round(s, 3), "end": round(e, 3),
                      "duration": round(e - s, 3)} for s, e in spans],
        "keep": invert(padded, total),
    }, indent=2))


def cmd_scenes(opts):
    stderr = analyse(opts.input, [
        "-vf", "select='gt(scene,%s)',showinfo" % opts.threshold,
        "-an", "-vsync", "vfr",
    ])
    times = sorted({round(float(m), 3)
                    for m in re.findall(r"pts_time:([\d.]+)", stderr)})
    print(json.dumps({
        "threshold": float(opts.threshold),
        "scene_changes": times,
        "count": len(times),
    }, indent=2))


def cmd_black(opts):
    total = duration_of(opts.input)
    stderr = analyse(opts.input, [
        "-vf", "blackdetect=d=%s:pic_th=%s" % (opts.min_duration, opts.picture_threshold),
        "-an",
    ])
    spans = [(float(a), float(b)) for a, b in re.findall(
        r"black_start:([\d.]+)\s+black_end:([\d.]+)", stderr)]
    print(json.dumps({
        "duration": round(total, 3),
        "black_spans": [{"start": round(s, 3), "end": round(e, 3),
                         "duration": round(e - s, 3)} for s, e in spans],
        "keep": invert(spans, total),
    }, indent=2))


def build_parser():
    parser = argparse.ArgumentParser(prog="detect.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    subs = parser.add_subparsers(dest="command", required=True)

    p = subs.add_parser("silence", help="find silent stretches (dead air, pauses)")
    p.add_argument("input")
    p.add_argument("--noise", default="-30dB",
                   help="anything quieter counts as silence (default -30dB; "
                        "use -40dB for a quiet room, -20dB for a noisy one)")
    p.add_argument("--min-duration", default="0.5",
                   help="ignore silences shorter than this many seconds")
    p.add_argument("--pad", default="0.15",
                   help="seconds of silence to keep either side of speech")
    p.set_defaults(func=cmd_silence)

    p = subs.add_parser("scenes", help="find visual scene changes / shot boundaries")
    p.add_argument("input")
    p.add_argument("--threshold", default="0.3",
                   help="0-1; lower finds more cuts (default 0.3)")
    p.set_defaults(func=cmd_scenes)

    p = subs.add_parser("black", help="find fully black stretches (fades, ad breaks)")
    p.add_argument("input")
    p.add_argument("--min-duration", default="0.1")
    p.add_argument("--picture-threshold", default="0.98")
    p.set_defaults(func=cmd_black)

    return parser


def main(argv=None):
    opts = build_parser().parse_args(argv)
    try:
        require_tools()
        opts.func(opts)
    except DetectError as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
