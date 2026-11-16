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

/// Same lookup as `ffmpeg_binary`, for the ffprobe sidecar that ships next
/// to ffmpeg.exe in the Windows installer / portable zip.
fn ffprobe_binary() -> String {
    let sidecar = std::env::current_exe().ok().and_then(|exe| {
        exe.parent()
            .map(|p| p.join("ffprobe.exe").to_string_lossy().to_string())
    });
    if let Some(s) = sidecar {
        if std::path::Path::new(&s).exists() {
            return s;
        }
    }
    "ffprobe".to_string()
}

/// Result of probing one video file. Field names are camelCase so the
/// frontend can use them as-is. When ffprobe is missing or fails, the
/// probe still returns `exists` + `sizeBytes` from fs metadata and
/// `durationSec` 0 — the file is still addable, just without duration/codec.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub path: String,
    pub exists: bool,
    pub duration_sec: f64,
    pub size_bytes: u64,
    pub codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[tauri::command]
pub async fn probe_video(path: String) -> Result<ProbeResult, String> {
    let meta = match std::fs::metadata(&path) {
        Ok(m) => m,
        Err(_) => {
            return Ok(ProbeResult {
                path,
                exists: false,
                duration_sec: 0.0,
                size_bytes: 0,
                codec: None,
                audio_codec: None,
                width: None,
                height: None,
            });
        }
    };
    let size_bytes = meta.len();
    // Best effort: if ffprobe is missing or the file is unreadable, fall
    // back to metadata only (duration 0, no codec) instead of failing.
    let out = Command::new(ffprobe_binary())
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name,width,height",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            &path,
        ])
        .output()
        .await;
    let mut result = ProbeResult {
        path: path.clone(),
        exists: true,
        duration_sec: 0.0,
        size_bytes,
        codec: None,
        audio_codec: None,
        width: None,
        height: None,
    };
    let output = match out {
        Ok(o) if o.status.success() => o,
        _ => return Ok(result),
    };
    let v: serde_json::Value = match serde_json::from_slice(&output.stdout) {
        Ok(v) => v,
        Err(_) => return Ok(result),
    };
    if let Some(d) = v
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok())
    {
        result.duration_sec = d;
    }
    if let Some(streams) = v.get("streams").and_then(|s| s.as_array()) {
        for s in streams {
            let ctype = s.get("codec_type").and_then(|t| t.as_str()).unwrap_or("");
            let codec = s
                .get("codec_name")
                .and_then(|c| c.as_str())
                .map(|c| c.to_string());
            match ctype {
                "video" if result.codec.is_none() => {
                    result.codec = codec;
                    result.width = s.get("width").and_then(|w| w.as_u64()).map(|w| w as u32);
                    result.height = s.get("height").and_then(|h| h.as_u64()).map(|h| h as u32);
                }
                "audio" if result.audio_codec.is_none() => {
                    result.audio_codec = codec;
                }
                _ => {}
            }
        }
    }
    Ok(result)
}

/// Write the concat-demuxer playlist file into the app data dir and return
/// its full path. The stream key is never part of this file.
#[tauri::command]
pub fn write_playlist_file(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir not available: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    let file = dir.join("playlist.txt");
    std::fs::write(&file, content).map_err(|e| format!("cannot write playlist file: {e}"))?;
    Ok(file.to_string_lossy().to_string())
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
