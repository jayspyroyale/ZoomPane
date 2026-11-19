# Contributing to ZoomPane

Thanks for helping! Bug reports, feature ideas and pull requests are all welcome.

## Reporting bugs

Open an [issue](https://github.com/jayspyroyale/ZoomPane/issues/new/choose) with:

- your Windows version and ZoomPane version (Settings → About),
- what you did, what you expected and what happened,
- the log file if relevant: `%APPDATA%\ZoomPane\logs\main.log`.

## Development setup

Requirements: Windows 10/11 x64, Node.js 22+, .NET 10 SDK.

```powershell
npm install
npm run build:capture   # native capture helper → apps/desktop/resources/bin
npm run dev:desktop
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Pull requests

- Keep changes focused; one topic per pull request.
- Run `npm run typecheck` and `npm test` before pushing (CI runs both).
- Add or update tests in `apps/desktop/src/renderer/src/engine` when you change engine behavior.
- Match the existing code style; the UI uses Tailwind utility classes and the theme tokens in `styles.css`.

## Releasing (maintainers)

1. Bump `version` in `apps/desktop/package.json`.
2. Commit, then tag and push: `git tag v1.2.3 && git push origin v1.2.3`.
3. The Release workflow builds and publishes the installer. Edit the release notes on GitHub.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
