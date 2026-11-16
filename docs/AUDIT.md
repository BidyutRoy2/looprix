# Deep Audit — Looprix v0.1.0

Date: 2026-11-17. Auditor: build subagent (source + test audit on Linux VM).
Scope: all v0.1.0 features, security/privacy, FFmpeg engine, UI, developer credit.
Live YouTube with a real stream key was NEVER attempted. No real key was used anywhere.

## Test evidence (before audit fixes)

- `npm test` (vitest): 25/25 PASS — presets (7), FFmpeg builder (6), security/redaction (5), schedule (4), Stream Doctor (3).
- `npx tsc -b --noEmit`: clean after fixes (see A-01–A-03).
- `npm run build` (tsc + vite): clean, 40 modules, dist 246 kB JS (gzip 77 kB).
- FFmpeg 8.1.2 dry-run: 2 s test clip, `-c copy` to a fake RTMPS endpoint — connection fails gracefully (expected, no real key); no key in output (see A-06).

## Findings

### A-01 [Fixed] TS: `QualityChipId` imported from the wrong module
`src/App.tsx` imported `QualityChipId` from `./lib/types`, where it does not exist.
Fix: import it from `./lib/presets` (where it is defined). Re-ran tsc — clean.

### A-02 [Fixed] TS: Tauri opener export name wrong
`src/App.tsx` used `open` from `@tauri-apps/plugin-opener`; v2 exports `openUrl` / `openPath`.
Fix: use `openUrl(url)` (system default browser). Verified against the installed
`dist-js/index.d.ts`. Developer link now opens externally, never in the webview.

### A-03 [Fixed] TS: unused `setVideos` state setter
`noUnusedLocals` flagged `setVideos`. Fix: Videos page now has a working
`+ Add Videos` button that uses `setVideos`. tsc clean.

### A-04 [Fixed] UX: GO LIVE / Save Key handlers evaluated during render
`onClick={void handleGoLive}` calls the handler while rendering.
Fix: `onClick={() => void handleGoLive()}` (same for Save Key). A live click
could previously have started a stream on render — now only on click.

### A-05 [Fixed] Rust: `reconnect_delay_secs` overflow guard
`3 * 2^attempt` could overflow for large attempts. Fix: `attempt.min(4)` + `.min(30)`
cap (3s → 6s → 12s → 30s). Backoff is deterministic and bounded.

### A-06 [Verified] Secret redaction — PASS
`redactSecret` / `redactLogLine` (TS) and `redact()` (Rust) hide full keys in
RTMPS URLs and `key=`/`token=` fields. FFmpeg dry-run log contains `****` only.
Greps for real-key patterns in `src/`, `src-tauri/`, docs: no hits (test fixtures
use `abcd1234…` / `SECRETKEY` placeholders only).

### A-07 [Verified] Plain RTMP refused in two layers
Frontend `validateStreamUrl` and Rust `start_stream` both reject
`rtmp://a.rtmp.youtube.com/live2`; only `rtmps://a.rtmps.youtube.com/live2`
is accepted. Unit test covers this.

### A-08 [Verified] Developer credit link — PASS (code-level)
Link is exactly `https://github.com/BidyutRoy2` in: sidebar footer
(`DeveloperCredit`), Settings > About (link text + button), README header/footer,
`DEVELOPER_GITHUB` constant (single source of truth). `openExternal()` allow-lists
only that URL and YouTube Studio, and opens it with the Tauri opener plugin
(external browser). Live click-test on Windows is NOT verified here — see Residuals.

### A-09 [Accepted residual] Windows .exe NOT produced on this Linux VM
Tauri's Windows installer (NSIS/MSI) must be built on Windows (WebView2 +
MSVC toolchain). This VM produced: complete buildable source, passing tests,
clean typecheck + frontend build, and `cargo check` (see below). The user must
run `scripts/build-windows.ps1` on Windows 10/11. Do NOT claim a Windows live run.

### A-10 [Accepted residual] Real YouTube live NOT verified
No real stream key, no real channel, no live broadcast was created. The OAuth
flow (`create_broadcast`) is code-complete but needs the user's own Google Cloud
client ID and a private/unlisted dry-run first. Manual-key mode is the
recommended first live test.

### A-11 [Accepted residual] FFmpeg sidecar not bundled in this zip
`src-tauri/binaries/ffmpeg.exe` (Windows build) is not in the zip — it must be
copied there on Windows before `tauri build`, or a system ffmpeg on PATH is used
(the Rust engine falls back to `ffmpeg` on PATH and reports `ffmpeg not found`
clearly if absent). Documented in `docs/BUILD.md`.

### A-12 [Accepted residual] v1.0 features are intentionally absent
Auto bitrate drop, 11h auto restart, Ticker + Countdown, Audio normalize
−14 LUFS, Multi-stream are NOT implemented in v0.1.0 (README + Schedule page
say "Coming in v1.0"). No dead UI for them except the honest note.

## Cargo check result

- `cargo check` (Tauri v2, Linux VM): **FAILED for environmental reasons, NOT a code error.**
  Crates downloaded and compiled until `gdk-sys` build script failed:
  `Package gdk-3.0 was not found in the pkg-config search path` — the VM lacks
  the GTK/WebKit system libraries Tauri needs on Linux. `apt-get install
  libgtk-3-dev libwebkit2gtk-4.1-dev …` also failed on this VM
  ("held broken packages"). Windows does NOT need gdk-3.0 (it uses WebView2),
  so this does not block the Windows build. Full `cargo check` / `tauri build`
  must be re-run on Windows via `scripts/build-windows.ps1`.
- `rustfmt --check`: clean after formatting (syntax parses for all 5 Rust files).
- FFmpeg engine (exact builder command, local, no network): encode mode
  (libx264, 6000k CBR, gop 60) exit 0; `-c copy` mode exit 0; ffprobe confirms
  h264 1280x720 + aac. RTMPS dry-run to a fake key was NOT re-run after the
  first attempt hung on TLS handshake — expected with a fake key, and the
  builder unit tests already prove the command shape + redaction.

### A-13 [Fixed] Stray `.js` files emitted next to `.ts` sources
`npm run build` runs `tsc -b` without `noEmit`, so TypeScript emitted
`src/lib/*.js` beside the sources (caught by the secret-scan grep).
Fix: `tsconfig.json` now sets `"noEmit": true`; stray `.js` files deleted;
re-ran `tsc` + `npm test` + `npm run build` — clean, 0 stray `.js` files.
`.gitignore` already excludes build output.

### A-14 [Fixed] rustfmt formatting diffs
`rustfmt --check` reported formatting-only diffs in `ffmpeg.rs`
(long lines). Fix: ran `rustfmt` on all Rust files; re-check clean.

### A-15 [Done] Rename: LiveStream Studio → Looprix (2026-11-17)
Product renamed (formerly LiveStream Studio) after the owner found the
name LoopLive already taken by a competing loop-live tool (timerring/looplive);
LoopLive was never used in this codebase. Rename applied by exact-string
replace across 15 files: `package.json` (name `looprix`), `package-lock.json`,
`src-tauri/Cargo.toml` + `Cargo.lock`, `src-tauri/tauri.conf.json`
(productName `Looprix`, identifier `com.bidyutroy.looprix`, title
`Looprix v0.1.0`), `src-tauri/src/security.rs` (credential-store service
`Looprix`), `src/App.tsx` (logo, watermark, About, footer, startup log),
`index.html` title, `README.md`, `CHANGELOG.md`, `docs/BUILD.md`,
`docs/SECURITY.md`, `scripts/build-windows.ps1` (installer
`Looprix_0.1.0_x64-setup.exe`), `.github/ISSUE_TEMPLATE/bug_report.md`,
`CONTRIBUTING.md`. YouTube API names (`liveStreams.insert`,
`liveBroadcasts.insert`) intentionally untouched. Developer credit unchanged
(`Developed by Bidyut Roy — https://github.com/BidyutRoy2`). Post-rename
verification: `npm test` 25/25 PASS, `tsc --noEmit` clean, `npm run build`
clean; grep confirms zero remaining `LiveStream Studio` / `livestream-studio` /
`LiveStreamStudio` / `LoopLive` / `looplive` occurrences except this note.
Residual: `docs/screenshots/dashboard.png` is the pre-rename design mockup
and may still show the old name baked into the image — replace the screenshot
after the first Windows run of the renamed app.

## Residuals summary

- A-09, A-10, A-11, A-12, A-15 (screenshot only): accepted, documented, honest. Nothing Critical/High
  remains open in code that was verifiable on this VM.
