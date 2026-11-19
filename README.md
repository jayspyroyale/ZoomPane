<p align="center">
  <img src="apps/desktop/build/icon.png" width="96" alt="ZoomPane logo">
</p>

<h1 align="center">ZoomPane</h1>

<p align="center">
  Free, open-source screen recorder for Windows that turns raw captures into polished videos:<br>
  automatic zoom on clicks, a smooth cursor, beautiful backgrounds and one-click export.
</p>

---

## Install

1. Download **`ZoomPane-Setup-<version>.exe`** from the [latest release](https://github.com/jayspyroyale/ZoomPane/releases/latest).
2. Double-click it. ZoomPane installs for your user account (no admin rights needed) and opens.

That's it. ZoomPane updates itself automatically when a new release is published.

> **Windows SmartScreen** may say it "protected your PC" because the installer is not code-signed.
> Click **More info → Run anyway**. You can check the source and build it yourself (see below).

**Prefer not to install?** Download `ZoomPane-Portable-<version>.exe` and run it from anywhere.
The portable version does not auto-update.

**Requirements:** Windows 11, or Windows 10 version 2004 or later, 64-bit.
On Windows 10, Windows draws a thin yellow border around the captured area while recording; Windows 11 lets ZoomPane hide it.

**Uninstall:** Settings → Apps → Installed apps → ZoomPane → Uninstall. Your recordings in
`Videos\ZoomPane` are kept.

## Features

**Recording**
- Record a display, a single window or a custom area, at 30 or 60 fps.
- Microphone, system audio and webcam, each on its own track.
- Countdown, pause/resume, restart, and global shortcuts (default **Ctrl+Shift+2** to start or stop).
- Hides desktop icons while recording. Lives in the system tray.
- The cursor is recorded as data rather than burned into the video, so it can be restyled afterwards.

**Editing**
- **Automatic zoom** that follows your clicks, plus manual zooms on any area you choose.
- **Smooth cursor**: shaky mouse paths become smooth glides. Change size, hide when idle,
  rotate while moving, remove shakes, add click ripples and click sounds.
- **Backgrounds**: wallpapers, gradients, solid colors or your own image, with padding,
  rounded corners, inset, shadow and blur.
- **Camera layouts**: bubble, fullscreen, split screen or hidden, animated over time.
- Trim, cut, split and change speed. **Speed up typing** in one click.
- Blur masks to hide sensitive information, and highlights to draw attention.
- Show **keyboard shortcuts** on screen (Ctrl + C, …), with per-shortcut hiding.
- **Captions** generated on your PC with Whisper. Your audio is never uploaded. Export as `.srt`.
- Aspect ratios (16:9, 9:16, 1:1, 4:3, 4:5…), crop and motion blur.
- Presets, undo/redo, a command menu (**Ctrl+K**) and a shortcuts sheet (**Ctrl+/**).

**Export**
- MP4 (H.264 + AAC) in 720p, 1080p, 1440p or 4K at 24/30/60 fps, or GIF.
- Copy the exported file straight to the clipboard to paste into Slack, Teams or Discord.
- Copy any frame as an image.

Everything runs locally: no account, no watermark, no telemetry. The only network requests are the update check against GitHub Releases and a one-time download of the speech model when you first generate captions.

## Build from source

You need **Windows 10/11 x64**, [Node.js 22+](https://nodejs.org) and the [.NET 10 SDK](https://dotnet.microsoft.com/download).

```powershell
git clone https://github.com/jayspyroyale/ZoomPane.git
cd ZoomPane
npm install
npm run build:capture   # builds the native capture helper (zoompane-capture.exe)
npm run dev:desktop     # runs the app with hot reload
```

Build the installer and portable exe into `apps/desktop/release/<version>/`:

```powershell
npm run dist -w @zoompane/desktop
```

Run the checks:

```powershell
npm run typecheck
npm test
```

## How it works

ZoomPane records the screen **without** the cursor, logs mouse and keyboard input on the same
clock, and re-renders the cursor, zoom and camera afterwards. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the details.

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
