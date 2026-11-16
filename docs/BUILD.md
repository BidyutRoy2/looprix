# Build — Looprix v0.1.0 (Windows)

Target: Windows 10/11 64-bit. The app is built with Tauri v2, so the Windows
installer is produced **on Windows**. This Linux VM can typecheck, test, and
`cargo check` the Rust code, but it cannot produce a signed Windows `.exe`.

## 1b. GitHub Actions build (recommended — no local toolchain needed)

Push a tag and GitHub builds the Windows `.exe` for you:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Workflow `.github/workflows/release.yml` runs on `windows-latest`: Node 20,
Rust stable, downloads Windows FFmpeg from gyan.dev (fails the job if the
download breaks — never ships without ffmpeg), `npm ci` → `npm test` →
`npm run build` → `npm run tauri build`, then packages
`Looprix-Portable-0.1.0.zip` and publishes a GitHub Release with the
NSIS `.exe`, the `.msi`, and the portable zip. A manual run
(Actions → Release (Windows) → Run workflow) builds the same artifacts
without creating a Release.

## 1. Prerequisites (Windows, local build only)

- Rust — install from https://rustup.rs (stable, MSVC toolchain). Restart PowerShell after install.
- Node.js 20+ — https://nodejs.org (LTS). `node --version` should be 20+.
- WebView2 — preinstalled on Windows 10/11. If missing, install it from Microsoft.
- Visual Studio Build Tools (C++ workload) — needed by the Rust MSVC toolchain.
- FFmpeg for Windows — download the `ffmpeg.exe` release build and copy it to
  `src-tauri/binaries/ffmpeg.exe` before building, OR rely on a system ffmpeg
  on PATH. The bundled sidecar is preferred so the app works offline.

## 2. Build

```powershell
git clone https://github.com/BidyutRoy2/looprix.git
cd looprix
.\scripts\build-windows.ps1
```

The script runs: `npm install` → `npm test` → `npm run build` → `cargo check`
→ `npm run tauri build`.

Output:

```
src-tauri\target\release\bundle\nsis\Looprix_0.1.0_x64-setup.exe
src-tauri\target\release\bundle\msi\Looprix_0.1.0_x64_en-US.msi
```

## 3. Dev run (Windows)

```powershell
npm install
npm run tauri dev
```

## 4. Linux (dev / CI only)

```bash
npm install
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Note: `npm run tauri build` on Linux needs GTK/WebKit system libraries and
produces a Linux bundle, not the Windows installer. Do not ship that as the
Windows release.

## 5. Release checklist (owner)

- [ ] Description + topics + social preview on the GitHub repo
- [ ] Tag `v0.1.0`, create a GitHub Release, attach the `.exe` + this zip
- [ ] Test the installer on a clean Windows 10/11 machine with a private/unlisted stream first
