# Architecture

The key idea: **record the screen without the cursor, record mouse and keyboard input
separately on the same clock, then render the cursor, zoom and camera motion afterwards.**
Everything else follows from that.

```
apps/desktop      Electron + React + TypeScript (electron-vite): windows, editor, export
native/capture    .NET 10 helper "zoompane-capture.exe", JSON lines over stdin/stdout
```

## Native capture helper (`native/capture`)

- **Video:** Windows.Graphics.Capture with `IsCursorCaptureEnabled = false` and
  `IsBorderRequired = false`. Frames go to `MediaTranscoder` for hardware H.264 (Media
  Foundation), so no ffmpeg is shipped.
- **Input:** low-level mouse and keyboard hooks plus a ~120 Hz cursor poll (position and shape).
  Standard cursors are stored by name; custom cursors are saved as PNGs with their hotspots.
- **Audio:** WASAPI microphone capture and loopback (system audio) via NAudio, each to its own WAV.
- **Clock:** every stream is stamped with QueryPerformanceCounter, so video, input and audio line up exactly.
- **Commands:** `ping`, `clock`, `listSources`, `listMicrophones`, `start`, `pause`, `resume`,
  `stop`, `setDesktopIconsHidden`, `focusWindow`, `resizeWindow`, `copyFiles`.
  If stdin closes, any recording is stopped cleanly.

## Desktop app (`apps/desktop`)

- `src/main` holds the Electron main process: sidecar client, recorder state machine, windows,
  the `zp-media://` protocol (range requests, allow-listed paths), projects, settings, tray,
  global shortcuts and auto-update.
- `src/preload` exposes a typed `window.zoompane` API (`src/shared/api.ts`).
- `src/renderer/src/engine` holds pure, tested TypeScript:
  - `timeline.ts` maps source time to output time through cuts and speed changes.
  - `cursor.ts` does zero-lag smoothing (forward-backward critically damped springs) with click pinning.
  - `zoom.ts` builds auto-zoom segments from click clusters and simulates the camera spring.
  - `render.ts` is the Canvas2D compositor `drawFrame()`, shared by **preview and export**, so exports match the preview.
- `src/renderer/src/editor` contains the editor UI: player, preview, timeline, inspector, commands.
- `src/renderer/src/export` produces MP4 through mediabunny (WebCodecs H.264 + AAC) and GIF through gifenc. The audio mixer applies cuts, speed (pitch-preserving), volume, music, noise reduction and click sounds.
- `src/renderer/src/captions` runs Whisper (transformers.js) in a worker, entirely on-device.

Motion (cursor, camera, layouts) is simulated once over the whole recording at 240 Hz and
interpolated. Any timestamp renders on its own, which keeps seeking and export deterministic.
Zooms, layouts, masks and captions are stored in **source time**, so editing cuts never shifts them.

## Project folder (`*.zoompane`)

| File | Contents |
|---|---|
| `recording.json` | Source geometry, track files and their start times on the shared clock, pauses |
| `project.json` | Edit state (clips, zooms, layouts, masks, captions, style, audio), versioned |
| `screen.mp4` | Screen video, without the cursor |
| `mic.wav`, `system.wav` | Audio tracks |
| `camera.webm` | Webcam (plus a remuxed `camera.seekable.webm`) |
| `input.jsonl` | Mouse moves, clicks, wheel, keys, cursor shapes, window rectangles |
| `cursors/*.png` | Captured custom cursors |
| `thumbnail.jpg` | Projects list thumbnail |

## Releases

Pushing a tag `v*` runs `.github/workflows/release.yml`. It builds the capture helper and the app,
then publishes `ZoomPane-Setup-<version>.exe`, `ZoomPane-Portable-<version>.exe` and `latest.yml`
to a GitHub Release. Installed copies pick up the update automatically through electron-updater.
