//! YouTube Data API v3 — Live Streaming.
//! Flow: liveStreams.insert (rtmp, 1080p) -> liveBroadcasts.insert
//! (enableAutoStart=true, enableAutoStop=false) -> liveBroadcasts.bind.
//! The ingest address + stream key come back in
//! liveStreams.cdn.ingestionInfo and are handed to the FFmpeg engine only
//! in memory — never written to disk or logs in full.
//! Quota: default 10,000 units/day; each insert/transition costs ~50 units.
//! This module only *calls* the API; OAuth tokens are supplied by the caller
//! (stored via secure_store) and sent as a Bearer header.

use serde::{Deserialize, Serialize};

const API_BASE: &str = "https://www.googleapis.com/youtube/v3";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastRequest {
    pub access_token: String,
    pub title: String,
    pub description: String,
    pub privacy: String, // public | unlisted | private
    pub scheduled_start_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BroadcastCreated {
    pub broadcast_id: String,
    pub ingestion_address: String,
    /// Redacted in every log: only the last 4 chars are ever shown.
    pub stream_name_redacted: String,
}

fn redact_tail(s: &str) -> String {
    if s.len() <= 4 {
        "****".to_string()
    } else {
        format!("****{}", &s[s.len() - 4..])
    }
}

#[derive(Deserialize)]
struct LiveStreamResp {
    id: String,
    cdn: Cdn,
}
#[derive(Deserialize)]
struct Cdn {
    #[serde(rename = "ingestionInfo")]
    ingestion_info: IngestionInfo,
}
#[derive(Deserialize)]
struct IngestionInfo {
    #[serde(rename = "ingestionAddress")]
    ingestion_address: String,
    #[serde(rename = "streamName")]
    stream_name: String,
}

#[derive(Deserialize)]
struct BroadcastResp {
    id: String,
}

#[tauri::command]
pub async fn create_broadcast(req: BroadcastRequest) -> Result<BroadcastCreated, String> {
    if req.access_token.trim().is_empty() {
        return Err("OAuth access token khali — age Connect with Google koro.".into());
    }
    if req.title.trim().is_empty() {
        return Err("Title khali.".into());
    }
    let client = reqwest::Client::new();
    let auth = format!("Bearer {}", req.access_token);

    // 1. liveStreams.insert — RTMP ingest, 1080p.
    let stream: LiveStreamResp = client
        .post(format!(
            "{API_BASE}/liveStreams?part=snippet,cdn,contentDetails,status"
        ))
        .header("Authorization", &auth)
        .json(&serde_json::json!({
            "snippet": { "title": format!("{} (auto-managed)", req.title) },
            "cdn": { "ingestionType": "rtmp", "resolution": "1080p", "frameRate": "30fps" }
        }))
        .send()
        .await
        .map_err(|e| format!("liveStreams.insert failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("liveStreams response parse failed: {e}"))?;

    // 2. liveBroadcasts.insert — enableAutoStart=true, enableAutoStop=false.
    let broadcast: BroadcastResp = client
        .post(format!("{API_BASE}/liveBroadcasts?part=snippet,status,contentDetails"))
        .header("Authorization", &auth)
        .json(&serde_json::json!({
            "snippet": {
                "title": req.title,
                "description": req.description,
                "scheduledStartTime": req.scheduled_start_time
            },
            "status": { "privacyStatus": req.privacy },
            "contentDetails": { "enableAutoStart": true, "enableAutoStop": false, "enableDvr": false }
        }))
        .send()
        .await
        .map_err(|e| format!("liveBroadcasts.insert failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("liveBroadcasts response parse failed: {e}"))?;

    // 3. liveBroadcasts.bind
    client
        .post(format!(
            "{API_BASE}/liveBroadcasts/bind?id={}&part=id,contentDetails&streamId={}",
            broadcast.id, stream.id
        ))
        .header("Authorization", &auth)
        .send()
        .await
        .map_err(|e| format!("liveBroadcasts.bind failed: {e}"))?;

    println!(
        "[youtube] broadcast {} bound, ingest {} key {}",
        broadcast.id,
        stream.cdn.ingestion_info.ingestion_address,
        redact_tail(&stream.cdn.ingestion_info.stream_name)
    );
    Ok(BroadcastCreated {
        broadcast_id: broadcast.id,
        ingestion_address: stream.cdn.ingestion_info.ingestion_address,
        stream_name_redacted: redact_tail(&stream.cdn.ingestion_info.stream_name),
    })
}
