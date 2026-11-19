# ZoomPane — build plan

ZoomPane is a Windows screen recorder that turns raw captures into polished videos:
automatic zoom on clicks, a smooth re-rendered cursor, backgrounds, a webcam overlay and
one-click export. It has feature parity with Screen Studio (macOS), adapted to Windows.
All code, UI, copy, cursors and wallpapers are original. No Screen Studio code or assets are used.

## 1. Research summary (source: public screen.studio pages via REA + web)

The key technique is this: **record the screen without the cursor, record mouse and keyboard
data separately, then render the cursor, zoom and camera motion afterwards.** Everything below
follows from that.

| Area | Screen Studio (macOS) | ZoomPane (Windows) |
|---|---|---|
| Sources | Display, window, area | Same, using Windows.Graphics.Capture (cursor and yellow border disabled) |
| Audio | Mic, system audio | Mic + WASAPI loopback, each written to its own track |
| Camera | Overlay, fullscreen, split, hidden; dynamic layouts timeline | Same layouts, with animated transitions between them |
| Recording UX | Countdown, global shortcut, pause/resume, restart, hide desktop icons, hide Dock icon | Countdown, global shortcuts, pause/resume, restart, hide desktop icons, tray-only mode |
| Zoom | Auto (from clicks) or manual; zoom timeline; level; disable/remove | Same; auto zoom follows clicks and the cursor, using precomputed spring motion |
| Cursor | Hide, size, type, always default cursor, hide when idle, loop position, rotate while moving, stop at end, remove shakes, optimise cursor types, smoothing on/off, click effect, click sound | All of these, using original Windows-style vector cursors plus the captured custom cursors |
| Look | Wallpaper / gradient / colour / image background, padding, rounded corners, inset, shadow | Same, with original wallpapers |
| Editor | Trim, cut, speed-up, speed up typing, set volume, masks and highlight, keystroke overlay with timeline, aspect ratio (16:9, 1:1, 9:16, …), crop, presets, command menu, shortcuts list, copy frame as image | Same |
| Captions | Whisper on device | Whisper on device (transformers.js, local, free) |
| Export | MP4 (720p/1080p/4K, up to 60 fps, quality), GIF, copy to clipboard, SRT | Same, encoded with WebCodecs (hardware H.264) |
| Motion blur | Screen + cursor | Temporal supersampling of camera and cursor motion |
| Pricing | $29/mo monthly, $9/mo billed yearly, 40% education discount, all features in every plan | Same structure, through Stripe Checkout and the Customer Portal |
| Trial | None (paid only) | Free to record and edit; exports carry a watermark until activated |

**Out of scope (Mac-only, or would require paid services, per instruction):** iPhone/iPad USB
recording, cloud shareable links and comments, cloud transcription, AI voiceover, Unsplash
backgrounds, transactional email. These are listed in `docs/ROADMAP.md`.

## 2. Architecture

```
ZoomPane/
  apps/desktop      Electron 45 + React 19 + TypeScript + Vite (electron-vite)
  apps/web          Next.js 16 marketing site: pricing, FAQ, Stripe Checkout, webhooks, license API
  packages/license  Shared Ed25519 license-token format (sign on web, verify in desktop)
  native/capture    .NET 10 sidecar "zoompane-capture.exe" (JSON lines over stdio)
```

### Why these choices
- **Native capture in C# (.NET 10).** Windows.Graphics.Capture is the only Windows API that
  captures without the cursor (`IsCursorCaptureEnabled = false`) and without the yellow border
  (`IsBorderRequired = false`), and it captures occluded windows. The C# WinRT projection gives
  direct access with no C++ toolchain. Frames, hooks, cursor shapes and audio share one QPC
  clock, so cursor and audio sync is exact. Hardware H.264 encoding uses Media Foundation
  through `MediaTranscoder`, so ffmpeg is not shipped and there are no GPL licensing issues.
- **Electron for the UI.** It uses the same Chromium everywhere: WebCodecs for hardware
  decode/encode, OffscreenCanvas, and MediaRecorder for the webcam. electron-builder handles
  the NSIS installer, and electron-updater provides free auto-updates from GitHub Releases.
- **One compositor for preview and export.** A pure function
  `renderFrame(ctx, project, tracks, t)` on Canvas2D draws the frame. Preview drives it from a
  `<video>` element; export drives it from decoded `VideoFrame`s (mediabunny), so the exported
  file matches the preview exactly.
- **Deterministic motion.** Cursor smoothing and camera/zoom springs are simulated once over the
  whole recording at 240 Hz, cached and interpolated. Any timestamp can be rendered in isolation,
  which makes seeking and parallel export possible.
- **Annotations in source time.** Zooms, layouts, masks and keystrokes are stored against
  recording time, and cuts and speed changes map source time to output time. Editing cuts never
  shifts other annotations.
- **Stripe as the only backend datastore.** The license key lives in subscription metadata, and
  activation looks it up with Stripe Search. Device IDs are stored in metadata, with a limit of
  3. Tokens are Ed25519-signed, so the app works offline and refreshes every few days. Stripe's
  own receipts and the hosted Customer Portal handle key recovery, so no database or email
  provider is needed.

### Project bundle (`*.zoompane` folder)
`project.json` (edit state, versioned schema) · `recording.json` (metadata, display/window
geometry, QPC↔ms mapping) · `screen.mp4` · `mic.wav` · `system.wav` · `camera.webm` ·
`input.jsonl` (mouse moves, clicks, wheel, keys, cursor-shape ids, window rects) ·
`cursors/*.png` (captured custom cursors with hotspots).

### Sidecar protocol (stdin/stdout JSON lines)
`listSources` · `startRecording{source, audio, outDir}` → `started{qpcStart}` · `pause` ·
`resume` · `stop` → `stopped{files}` · `setDesktopIconsHidden` · `copyFilesToClipboard`.

### Licensing flow
Pricing page → Stripe Checkout (subscription, monthly or yearly, education coupon) → webhook
`checkout.session.completed` creates the key `ZP-XXXX-XXXX-XXXX-XXXX` in subscription metadata and
customer invoice custom fields → the success page shows the key and an **Open ZoomPane** button
(`zoompane://activate?key=…`) → the app calls `/api/license/activate` → it receives a signed
token. If the key is lost, the Stripe Customer Portal login shows invoices that contain the key.

## 3. Build phases (each ends with a verified check)

1. **Spike + repo.** Sidecar records a display to MP4 without the cursor and logs input.
   → verify: a 5-second MP4 plays and `input.jsonl` has moves and clicks.
2. **Desktop shell.** Tray, source picker, area selector, countdown, recording toolbar, global
   shortcuts, webcam and mic capture. → verify: an end-to-end recording creates a project bundle.
3. **Engine.** Timeline mapping, cursor smoothing, auto-zoom generation, camera springs,
   compositor. → verify: vitest unit tests and a rendered frame snapshot.
4. **Editor UI.** Preview, timeline tracks (clips, zoom, layout, mask, keys), inspector panels,
   presets, command menu, undo/redo. → verify: typecheck and a manual run.
5. **Export.** MP4/GIF/clipboard/SRT/frame-as-image, watermark gating. → verify: the exported
   file decodes, and its duration and resolution are correct.
6. **Captions + audio.** Whisper captions, volume, noise reduction. → verify: an SRT is produced
   from sample audio.
7. **Web + Stripe.** Landing, pricing, FAQ, education, checkout, webhook, activation, portal,
   download. → verify: `next build` passes and a webhook unit test works with a Stripe test
   signature.
8. **Ship.** Installer, auto-update config, CI (GitHub Actions: typecheck, test, build), README.
