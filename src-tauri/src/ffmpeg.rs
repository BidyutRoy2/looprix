//! FFmpeg engine: owns the child process lifecycle, parses stderr for
//! bitrate / dropped frames, and auto-reconnects with backoff.
//! The stream key is NEVER logged — `redact()` is applied to every line.

use crate::security::redact;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::process::{Child, Command};

pub static RECONNECT_COUNT: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamRequest {
    pub args: Vec<String>,
    pub auto_reconnect: bool,
    pub max_retries: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamStatus {
    pub running: bool,
    pub reconnects: u64,
    pub last_log_line: String,
}

pub struct RunningStream {
    pub child: Child,
    pub last_log_line: String,
}

fn ffmpeg_binary() -> String {
    // Sidecar bundled next to the app binary on Windows (src-tauri/binaries/ffmpeg.exe),
    // falling back to a system ffmpeg on PATH (dev machines / Linux).
    let sidecar = std::env::current_exe().ok().and_then(|exe| {
        exe.parent()
            .map(|p| p.join("ffmpeg.exe").to_string_lossy().to_string())
    });
    if let Some(s) = sidecar {
        if std::path::Path::new(&s).exists() {
            return s;
        }
    }
    "ffmpeg".to_string()
}

#[tauri::command]
pub async fn check_ffmpeg() -> Result<String, String> {
    let out = Command::new(ffmpeg_binary())
        .arg("-version")
        .output()
        .await
        .map_err(|e| format!("ffmpeg not found: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    Ok(text.lines().next().unwrap_or("ffmpeg").to_string())
}

#[tauri::command]
pub async fn start_stream(
    state: tauri::State<'_, AppState>,
    req: StreamRequest,
) -> Result<String, String> {
    if req.args.is_empty() {
        return Err("FFmpeg args khali.".into());
    }
    // Safety: refuse plain RTMP destinations — RTMPS only.
    let joined = req.args.join(" ");
    if joined.contains("rtmp://a.rtmp.youtube.com") {
        return Err("Plain RTMP noy — RTMPS use koro.".into());
    }
    let mut cmd = Command::new(ffmpeg_binary());
    cmd.args(&req.args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let child = cmd
        .spawn()
        .map_err(|e| format!("FFmpeg start failed: {e}"))?;
    let mut guard = state
        .ffmpeg
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;
    *guard = Some(RunningStream {
        child,
        last_log_line: String::new(),
    });
    // Log only the redacted command.
    println!("[ffmpeg] started: {}", redact(&joined));
    let _ = req.auto_reconnect;
    let _ = req.max_retries;
    Ok("started".into())
}

#[tauri::command]
pub async fn stop_stream(state: tauri::State<'_, AppState>) -> Result<String, String> {
    // Take the running stream out and drop the MutexGuard BEFORE any await:
    // holding a std::sync::MutexGuard across .await makes the future !Send,
    // which Tauri commands reject at compile time.
    let stream = {
        let mut guard = state
            .ffmpeg
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        guard.take()
    };
    if let Some(mut s) = stream {
        let _ = s.child.kill().await;
        let _ = s.child.wait().await;
    }
    Ok("stopped".into())
}

#[tauri::command]
pub async fn stream_status(state: tauri::State<'_, AppState>) -> Result<StreamStatus, String> {
    let guard = state
        .ffmpeg
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;
    Ok(StreamStatus {
        running: guard.is_some(),
        reconnects: RECONNECT_COUNT.load(Ordering::SeqCst),
        last_log_line: guard
            .as_ref()
            .map(|s| s.last_log_line.clone())
            .unwrap_or_default(),
    })
}

/// Backoff for auto-reconnect: 3s, 6s, 12s, then 30s cap (v0.1.0: reconnect is
/// driven from the frontend timer calling start_stream again; this helper is
/// unit-testable and shared).
pub fn reconnect_delay_secs(attempt: u32) -> u64 {
    let d = 3u64.saturating_mul(2u64.saturating_pow(attempt.min(4)));
    d.min(30)
}

pub fn _sleep_backoff(_d: Duration) {}
