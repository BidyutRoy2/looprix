# Looprix — Windows build script (run on Windows 10/11, PowerShell)
# Prerequisites: Rust (rustup, MSVC), Node.js 20+, WebView2, VS Build Tools.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path) | Out-Null
Set-Location ..
Write-Host "== Looprix v0.1.1 — Windows build =="
rustc --version; node --version; npm --version
if (-not (Test-Path "src-tauri\binaries\ffmpeg.exe")) {
  Write-Warning "src-tauri\binaries\ffmpeg.exe not found — build will fall back to system ffmpeg on PATH. Copy a Windows ffmpeg.exe there for a self-contained app."
}
if (-not (Test-Path "src-tauri\binaries\ffprobe.exe")) {
  Write-Warning "src-tauri\binaries\ffprobe.exe not found — video probing will fall back to file size only. Copy a Windows ffprobe.exe there for full probing."
}
npm install
npm test
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
npm run tauri build
Write-Host "Done. Installer:"
Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue
Get-ChildItem "src-tauri\target\release\bundle\msi\*.msi" -ErrorAction SilentlyContinue
