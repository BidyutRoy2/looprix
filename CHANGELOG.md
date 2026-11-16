# Changelog

## [0.1.0] - 2026-11-17

- Renamed from LiveStream Studio (working name) to Looprix. No feature changes.
- GitHub Actions release workflow (`.github/workflows/release.yml`): tag `v*` builds the Windows NSIS `.exe`, `.msi` and portable zip on `windows-latest` and publishes a GitHub Release. FFmpeg is downloaded from gyan.dev in the workflow (job fails if the download breaks).
- Added `@tauri-apps/cli` as a devDependency so `npm run tauri build` works on a fresh checkout (it was missing from package.json).

### Added
- Dual connect: Connect YouTube (OAuth 2.0 + YouTube Data API v3) and Manual Stream Key (RTMPS).
- Smart Loop: Repeat One / Repeat All / Shuffle, Gapless Loop, playlist reorder + search.
- Auto-Reconnect with backoff (3s → 6s → 12s → 30s cap).
- Presets: Lofi Radio, Waz, Quran Recitation, Music, Nature, Education, News, Podcast + Quality chips (Data Saver / Standard / Smooth / Auto) + My Custom Presets (create / edit / duplicate / delete / export-import).
- Stream Doctor pre-flight check (Video / Audio / Internet / Stream Key).
- Overlay: LIVE • REPLAY badge + logo watermark, toggleable.
- Schedule: weekly calendar, Add Schedule, Auto Start / Auto Stop.
- Privacy-first: local-only, no telemetry, secrets in OS credential store (DPAPI), RTMPS only.
- Developer credit: Developed by Bidyut Roy — https://github.com/BidyutRoy2 (sidebar footer, Settings > About, README).

### Deferred to v1.0
- Auto bitrate drop, 11h auto restart, Ticker + Countdown, Audio normalize −14 LUFS, Multi-stream.
