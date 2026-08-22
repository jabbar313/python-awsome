---
name: video-cut
description: Cut, trim, split, and join video or audio files with ffmpeg — pulling a clip out between two timestamps, deleting a section from the middle, chopping one long recording into parts or fixed-length chunks, stitching clips back together, and locating cut points automatically from silence, scene changes, or black frames. Use this skill whenever the user wants to trim, clip, chop, shorten, snip, top-and-tail, excerpt, or split a video, extract a highlight, cut out ads or dead air or a flubbed take, chunk a long recording so it fits an upload limit, or concatenate takes into one file — and also whenever ffmpeg seeking comes up at all (-ss, -t, -to, keyframe-accurate cutting, concat demuxer, "why is my cut in the wrong place", "why did the audio drift"). Trigger it even when the user never says "ffmpeg" and even when they describe the task purely in terms of the content ("cut the first two minutes of dead air off this webinar recording").
---

# Cutting video with ffmpeg

Cutting looks like a one-liner and usually isn't. The two failures that actually
bite are cuts landing seconds away from where the user asked, and outputs that
quietly lose an audio track or stop playing halfway through. The bundled scripts
exist because those failures come from ffmpeg defaults, not from typos.

## Before anything else

Check ffmpeg exists — `ffmpeg -version`. If it is missing, say so and give the
install line for their platform (`brew install ffmpeg`, `apt install ffmpeg`,
`winget install ffmpeg`) rather than attempting workarounds; nothing here works
without it.

Then **probe the file before proposing a plan.** Duration, codecs, and how many
audio tracks there are all change the answer, and it costs one command:

```bash
python3 scripts/vcut.py probe input.mp4
```

## The thing that surprises people: keyframes

Video frames mostly store *differences* from earlier frames. Only keyframes
stand alone, typically every 2–10 seconds. So a cut that copies the streams
untouched can only begin on a keyframe — ask ffmpeg for 00:07 and it silently
gives you 00:05.

That leaves a genuine tradeoff, and it is worth naming for the user rather than
picking silently when the stakes are high:

| Mode | Speed | Accuracy | Quality |
|---|---|---|---|
| `copy` | seconds, any file length | snaps back to the previous keyframe | untouched, bit-for-bit |
| `precise` | roughly real-time (re-encodes) | exact to the frame | one generation of loss |

`vcut.py` defaults to `--mode auto`: it looks up the nearest keyframe and copies
when the requested start already lands on one, re-encoding only when copying
would move the cut. That is almost always the right call — but if the user says
"this is a 4-hour master, speed matters more than a second or two", pass
`--mode copy`, and if they say "cut exactly on the word", pass `--mode precise`.

## Doing the cut

All commands take timestamps as `90`, `90.5`, `1:30`, or `00:01:30.250`.

```bash
# Keep one span (--end or --duration, not both)
python3 scripts/vcut.py trim input.mp4 clip.mp4 --start 1:30 --end 2:45

# Delete a span and stitch the remainder back together
python3 scripts/vcut.py remove input.mp4 out.mp4 --start 4:10 --end 5:02

# Split one file into several
python3 scripts/vcut.py split input.mp4 --at 1:30,4:10      # at chosen points
python3 scripts/vcut.py split input.mp4 --every 10:00       # fixed-length chunks
python3 scripts/vcut.py split input.mp4 --parts 3           # equal parts

# Join clips, in the order given
python3 scripts/vcut.py join out.mp4 a.mp4 b.mp4 c.mp4
```

Useful flags: `--mode`, `--force` to overwrite, `--outdir` for `split`, and
`--map '0:v:0,0:a:1'` to pick specific streams. By default every video, audio,
and subtitle stream is carried across, because dropping the director's-commentary
track or the second language is the kind of loss nobody notices until much later.

`join` checks whether the inputs actually match before copying. Clips from
different sources — a phone recording next to a screen capture — get normalised
and re-encoded instead, since the fast path would produce a file that plays the
first clip and then falls apart.

## When the user does not know the timestamps

Often they describe the cut by content: "cut the dead air", "split it at the
scene changes", "the ad breaks are the black bits". Find the points first, then
cut:

```bash
python3 scripts/detect.py silence input.mp4 --noise -30dB --min-duration 0.5
python3 scripts/detect.py scenes input.mp4 --threshold 0.3
python3 scripts/detect.py black  input.mp4
```

Each prints JSON. `silence` and `black` also return a `keep` list — the spans
*between* what was detected — which maps directly onto `trim` or `remove` calls.
Silence detection pads by 0.15s each side by default so cuts do not clip the
first syllable back.

Thresholds are guesses about the recording, not universal constants. `-30dB`
suits a normal room; a noisy field recording may need `-20dB`, a treated studio
`-40dB`. If the first pass returns nothing or returns hundreds of spans, that is
the signal to adjust and re-run, not to report failure.

## Finish by checking the result

A cut that writes a file is not a cut that worked. `vcut.py` reports the output
duration after every operation — compare it against what was asked for. If a
5-minute request produced 30 seconds, something went wrong and the user needs to
hear it before they build on the file.

Never write over the input. `vcut.py` refuses to overwrite without `--force`;
keep it that way, since the source is often the only copy the user has.

## Details worth reading when something is off

`references/ffmpeg-cookbook.md` covers the raw ffmpeg commands behind these
scripts and the failure modes that come up in practice: `-ss` placement and why
`-to` is treacherous, GOP-boundary smart cutting, audio drift and negative
timestamps, per-container quirks, frame-exact and fade-in/out cuts, hardware
acceleration, and cutting straight from a URL without downloading first. Read it
when a cut misbehaves in a way the scripts do not explain, or when the request
needs an ffmpeg command the scripts do not cover.
