# ffmpeg cutting cookbook

Raw commands and failure modes behind `scripts/vcut.py`. Reach for these when a
cut misbehaves in a way the scripts do not explain, or when the request needs
something the scripts do not cover.

## Contents

- [Seeking: -ss, -t, -to](#seeking--ss--t--to)
- [Stream copy vs re-encode](#stream-copy-vs-re-encode)
- [Keyframes and smart cutting](#keyframes-and-smart-cutting)
- [Concatenation](#concatenation)
- [Splitting with the segment muxer](#splitting-with-the-segment-muxer)
- [Stream selection](#stream-selection)
- [Timestamp and sync problems](#timestamp-and-sync-problems)
- [Container quirks](#container-quirks)
- [Frame-exact work](#frame-exact-work)
- [Fades at the cut](#fades-at-the-cut)
- [Cutting from a URL](#cutting-from-a-url)
- [Hardware acceleration](#hardware-acceleration)
- [Reading the output](#reading-the-output)

## Seeking: -ss, -t, -to

Where `-ss` sits relative to `-i` changes what it does.

```bash
ffmpeg -ss 60 -i in.mp4 ...   # input seeking: jumps in the container, fast
ffmpeg -i in.mp4 -ss 60 ...   # output seeking: decodes and discards, slow
```

Input seeking is what you want. Since ffmpeg 2.1 it is also frame-accurate when
re-encoding — ffmpeg seeks to the preceding keyframe, then decodes and drops
frames up to the requested point. Output seeking survives only as a workaround
for badly indexed files where input seeking lands in the wrong place.

**Prefer `-t` (duration) over `-to` (end time).** With input seeking, ffmpeg
resets output timestamps to zero by default, so `-to` is measured from the cut
point, not from the start of the source. Add `-copyts` and it is measured from
the source instead. This has caught out enough people across versions that
computing `duration = end - start` and passing `-t` is simply the safer habit:

```bash
# Keep 00:01:30 to 00:02:45 — pass the 75-second length, not the end time
ffmpeg -ss 00:01:30 -i in.mp4 -t 75 -c copy out.mp4
```

Both accept `SS.mmm` or `HH:MM:SS.mmm`.

## Stream copy vs re-encode

```bash
# Copy: instant, lossless, but starts at the previous keyframe
ffmpeg -ss 90 -i in.mp4 -t 30 -c copy -avoid_negative_ts make_zero out.mp4

# Re-encode: exact, costs time and one generation of quality
ffmpeg -ss 90 -i in.mp4 -t 30 \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k out.mp4
```

CRF is the quality dial: 18 is near-transparent, 23 is the default, 28 is
visibly soft. Presets trade encoding time against file size at the same quality —
`veryfast` is a good default for cutting work, `slow` only if the file is being
archived. Keep `-pix_fmt yuv420p` for anything that must play in browsers or on
phones; other pixel formats are legal and widely unplayable.

A cut is one re-encode, so quality loss is real but minor. Cutting the same file
repeatedly compounds it — cut once from the original rather than re-cutting
outputs.

## Keyframes and smart cutting

List keyframe times:

```bash
ffprobe -v error -select_streams v:0 -skip_frame nokey \
  -show_entries frame=pts_time -of csv=p=0 in.mp4
```

On a long file, restrict the scan or it reads the whole container:

```bash
ffprobe -v error -select_streams v:0 -skip_frame nokey \
  -read_intervals 00:01:20%00:01:40 \
  -show_entries frame=pts_time -of csv=p=0 in.mp4
```

Older builds name the field `pkt_pts_time`; ask for both and use whichever
parses.

**Smart cut** — re-encode only the partial group of pictures at each end and copy
the untouched middle. Worth the complexity only on long files where a full
re-encode is prohibitive:

```bash
# start=95, first keyframe after it=100, end=400
ffmpeg -ss 95 -i in.mp4 -t 5  -c:v libx264 -crf 18 -c:a aac head.mp4
ffmpeg -ss 100 -i in.mp4 -t 300 -c copy middle.mp4
printf "file 'head.mp4'\nfile 'middle.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4
```

The head must be encoded with parameters close enough to the source for the
concat demuxer to accept it. Mismatched profile, level, or pixel format will
either be rejected or produce a glitch at the seam.

Alternatively, force keyframes where you intend to cut, then copy:

```bash
ffmpeg -i in.mp4 -force_key_frames 90,150,210 -c:v libx264 -crf 18 -c:a copy keyed.mp4
```

## Concatenation

**Concat demuxer** — no re-encode, requires genuinely identical streams (same
codec, resolution, pixel format, frame rate, sample rate, channel count):

```bash
printf "file '/abs/path/a.mp4'\nfile '/abs/path/b.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4
```

Single quotes inside paths must be escaped as `'\''`. `-safe 0` is what allows
absolute paths.

The trap: the demuxer **does not verify compatibility**. Hand it clips with
different resolutions and it exits 0, having written a file that plays the first
clip and then breaks. Always compare stream parameters first, or re-encode.

**Concat filter** — handles differing sources, but insists on matching
dimensions, frame rate, and audio layout, so normalise on the way in:

```bash
ffmpeg -i a.mp4 -i b.mp4 -filter_complex \
"[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0]; \
 [1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1]; \
 [0:a]aresample=48000[a0];[1:a]aresample=48000[a1]; \
 [v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" \
 -map "[v]" -map "[a]" -c:v libx264 -crf 18 -c:a aac out.mp4
```

If one input has no audio at all, give it silence rather than dropping audio
from the join:

```bash
-f lavfi -t 8 -i anullsrc=channel_layout=stereo:sample_rate=48000
```

**Concat protocol** — MPEG-TS and a few other streamable formats only:

```bash
ffmpeg -i "concat:a.ts|b.ts" -c copy out.ts
```

## Splitting with the segment muxer

One pass, much faster than repeated trims on a long file:

```bash
# Fixed-length chunks
ffmpeg -i in.mp4 -c copy -f segment -segment_time 600 \
  -reset_timestamps 1 out_%03d.mp4

# Chosen split points
ffmpeg -i in.mp4 -c copy -f segment -segment_times 90,250,600 \
  -reset_timestamps 1 out_%03d.mp4
```

`-reset_timestamps 1` makes each part start at zero; without it players show the
original in-file times and some editors refuse the parts. Under `-c copy`, splits
land on the first keyframe at or after each requested time, so parts will not be
exactly `-segment_time` long. Add `-force_key_frames` on a re-encode pass first
if exact lengths matter.

## Stream selection

Without `-map`, ffmpeg picks *one* stream per type — the "best" video and the
"best" audio — and discards everything else. A film with a commentary track or a
second language loses it silently.

```bash
-map 0                                   # everything, including data/attachments
-map 0:v? -map 0:a? -map 0:s?            # all video, audio, subtitles; ? = tolerate absence
-map 0:v:0 -map 0:a:1                    # first video, second audio
-map 0:m:language:eng                    # streams tagged English
```

`-ignore_unknown` stops unknown stream types (common in MKV) from aborting the
mux. `-dn` drops data streams, which some MP4s carry and some muxers reject.

## Timestamp and sync problems

- **`-avoid_negative_ts make_zero`** — after a copy cut, the first frames can
  carry negative timestamps, which MP4 cannot represent. Symptom: audio starts
  slightly early or the first second is silent.
- **`-fflags +genpts`** — rebuilds missing presentation timestamps in streams
  that never had them (captures, some TS files).
- **Progressive drift** rather than a fixed offset usually means variable frame
  rate meeting a constant-frame-rate assumption. `-vsync cfr -r 30` normalises
  it; VFR phone footage is the usual source.
- **A constant offset** is fixable directly with `-itsoffset`:

  ```bash
  ffmpeg -i in.mp4 -itsoffset 0.3 -i in.mp4 -map 0:v -map 1:a -c copy fixed.mp4
  ```

## Container quirks

- **MP4/MOV**: add `-movflags +faststart` for anything played over a network —
  it moves the index to the front so playback starts before the download
  finishes. Subtitles must be `mov_text`; `-c:s mov_text` converts SRT, and
  anything image-based (PGS, VOBSUB) simply cannot go in.
- **MKV**: accepts nearly everything, the safe choice when carrying odd streams
  through a cut.
- **WebM**: VP8/VP9 + Opus/Vorbis only. Copying H.264 into it fails.
- **TS**: concatenates by simple byte joining, which is why it is a useful
  intermediate for awkward joins.

Changing the extension does not change the codec. Cutting `.mkv` to `.mp4` with
`-c copy` works only if the codecs inside are ones MP4 accepts.

## Frame-exact work

Convert between frames and seconds using the real frame rate:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate \
  -of csv=p=0 in.mp4          # e.g. 30000/1001 = 29.97
```

Frame *n* starts at `n / fps`. For 29.97fps, frame 100 is at 3.337s, not 3.333s —
over a long timeline that error accumulates visibly.

Cut a specific frame count:

```bash
ffmpeg -ss 10 -i in.mp4 -frames:v 150 -c:v libx264 -crf 18 out.mp4
```

Extract one frame as an image:

```bash
ffmpeg -ss 00:01:23.500 -i in.mp4 -frames:v 1 -q:v 2 frame.jpg
```

## Fades at the cut

A hard cut out of the middle of a sentence sounds abrupt. Short fades help:

```bash
# 0.5s fade in at the start, 0.5s fade out ending at 30s
ffmpeg -ss 90 -i in.mp4 -t 30 \
  -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=29.5:d=0.5" \
  -af "afade=t=in:st=0:d=0.5,afade=t=out:st=29.5:d=0.5" \
  -c:v libx264 -crf 18 -c:a aac out.mp4
```

Fade times are relative to the output, not the source. This requires a
re-encode; there is no way to fade under `-c copy`.

## Cutting from a URL

ffmpeg can range-request a remote file, so a short clip from a long video need
not mean downloading all of it:

```bash
ffmpeg -ss 3600 -i "https://example.com/long.mp4" -t 60 -c copy clip.mp4
```

Needs a server that supports range requests and a seekable container — an MP4
with `faststart` works, a live HLS stream does not.

## Hardware acceleration

Only worth it for large re-encodes; quality at a given bitrate is below libx264,
and it is irrelevant to `-c copy` cuts, which never decode.

```bash
-c:v h264_videotoolbox    # macOS
-c:v h264_nvenc           # NVIDIA
-c:v h264_qsv             # Intel Quick Sync
-c:v h264_vaapi           # Linux generic
```

These take `-b:v 8M` rather than `-crf`; check `ffmpeg -encoders` for what is
actually built in.

## Reading the output

```bash
# Duration only
ffprobe -v error -show_entries format=duration -of csv=p=0 out.mp4

# Decode the whole file and report any errors — catches broken joins
ffmpeg -v error -i out.mp4 -f null -

# Real frame count, rather than the container's claim
ffprobe -v error -select_streams v:0 -count_frames \
  -show_entries stream=nb_read_frames -of csv=p=0 out.mp4
```

The decode check is the one that matters after a concat: a file with mismatched
segments has the right duration in its header and still falls apart on playback.
