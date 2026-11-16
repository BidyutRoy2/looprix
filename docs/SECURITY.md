# Security — Looprix v0.1.1

## Design rules

1. **Local-only.** Video files, playlists, schedules and settings never leave
   the user's PC except for the live video itself, which goes to YouTube over
   encrypted RTMPS. No cloud upload, no telemetry, no tracking, no account.
2. **Secrets are encrypted at rest.** Stream Keys and OAuth tokens are stored
   only in the OS credential store (Windows DPAPI / Credential Manager via the
   Rust `keyring` crate). They are never written to a file, to localStorage,
   or to a log. The frontend keeps a key only in memory for the session.
3. **RTMPS only.** The default ingest URL is `rtmps://a.rtmps.youtube.com/live2`.
   Plain `rtmp://` destinations are refused by both the frontend validator and
   the Rust engine.
4. **Secret redaction.** Every log line passes through `redactSecret()` /
   `redactLogLine()` (TS) and `redact()` (Rust). Only the last 4 characters
   of a key are ever shown (`****abcd`).
5. **No remote code.** FFmpeg is bundled as a sidecar (`src-tauri/binaries/ffmpeg.exe`)
   or taken from PATH. The app never downloads code, DLLs or binaries at runtime.
6. **No admin at runtime.** The app runs as a normal user. It only reads the
   video files the user picks and writes its own settings.
7. **Input validation.** File paths must end in a video extension; stream URLs
   must be YouTube RTMPS; stream keys must be 8+ chars with no spaces;
   preset bitrates are clamped to 1000–50000 kbps; schedule times are HH:MM.
8. **External links open externally.** The developer link
   https://github.com/BidyutRoy2 is opened with the Tauri opener plugin in the
   user's browser, never inside the app webview. Only that URL (and YouTube
   Studio) is allow-listed in `openExternal()`.

## Reporting a vulnerability

Do not open a public issue with a secret or exploit. Email the maintainer via
the GitHub profile https://github.com/BidyutRoy2 with steps to reproduce.
Rotate any exposed stream key in YouTube Studio immediately (Studio → Stream key → Reset).
