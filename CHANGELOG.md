# Changelog

## [0.1.1] - 2026-11-17

Bug-fix release from the first real Windows run (v0.1.0, user screenshots 2026-11-17).
No new v1.0 features; everything below makes what v0.1.0 promised actually work.

### Fixed
- Real file picker: "+ Add Videos" now opens a real multi-select dialog (mp4 / mkv / mov / webm / avi / m4v) via `@tauri-apps/plugin-dialog` + `tauri-plugin-dialog` + `capabilities/default.json`. The old button only appended a fake "New Video" entry.
- Real video probing: new Rust `probe_video` command (ffprobe sidecar) returns exists / duration / size / codec / audio / resolution for each picked file; title is the real file name. ffprobe missing → falls back to fs metadata (size known, duration 0). Playlist is persisted in localStorage and re-probed on startup; missing files are flagged in Stream Doctor and in the list.
- Removed the hardcoded DEMO_VIDEOS (Mountain Lakes / Forest Rain / Sunset Time-lapse with fake `C:\Videos\` paths). Playlist starts empty with a Romanized Bengali empty-state line.
- GO LIVE actually starts the stream: new Rust `write_playlist_file` writes the concat file to the app data dir; the frontend invokes `start_stream` with the real args and only sets live=true on success (exact error logged on failure). Stop invokes `stop_stream`. While live, `stream_status` is polled every 5s with one auto-reconnect attempt.
- Stream Doctor now checks FFmpeg on startup (new "FFmpeg" row with the version line) and verifies every playlist file exists on disk — a missing file blocks Go Live with the file name in the reason.
- Stream Health is honest now: "Not streaming" with dashes when idle; live shows the target bitrate (labelled as target) + real running state + reconnect count. The hardcoded "Excellent / 6000 kbps / 0 dropped / CPU 18%" and "128 viewers" are gone.
- Schedule is a real form now (weekday dropdown, start/end time, auto-start/auto-stop checkboxes, current playlist + preset), validated by `validateSchedule`, with Delete per row. A due schedule actually starts the stream (same start path as GO LIVE); auto-stop ends it at the end time.
- OAuth is a real paste-code flow: Settings > YouTube API has Client ID / Secret fields (OS credential store only), "Connect with Google" opens the Google auth URL in the external browser, and "Complete sign-in" exchanges the pasted code via the new Rust `exchange_oauth_code` command (tokens stored in the OS credential store only; channel title shown on success). In OAuth mode GO LIVE creates a real broadcast (unlisted) and streams to its ingest. Manual stream-key path untouched and still default.
- Custom presets: Rename (inline) + Delete for custom presets; built-ins untouched.
- Brand + credit (v0.1.1): real Looprix logo (blue-to-violet loop arrow + play triangle, red live dot) — `src/assets/logo.png` in-app, `src-tauri/icons/128x128.png` + `icon.ico` (16/32/48/64/128/256) as the app icons. Sidebar shows the logo next to the Looprix wordmark; the "BR" text circle is gone. About is a polished card with the logo mark. The footer is one single clean line. "Developed by Bidyut Roy — https://github.com/BidyutRoy2" stays in all three places (sidebar, About, footer).

### Added
- ffprobe.exe is bundled next to ffmpeg.exe: the release workflow copies it from the gyan.dev essentials zip into `src-tauri/binaries/` and the portable zip; `tauri.conf.json` resources list it; `scripts/build-windows.ps1` warns if it is missing.

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
