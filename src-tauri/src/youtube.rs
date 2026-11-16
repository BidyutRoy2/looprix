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
    /// The full stream name (the stream key). In-memory only: the frontend
    /// passes it straight to the FFmpeg engine and never logs or stores it.
    /// `stream_name_redacted` is the only form that may appear in logs.
    pub stream_name: String,
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

/// Paste-code OAuth exchange (no local server). The frontend opens the
/// Google auth URL in the external browser, the user pastes the code back,
/// and this command exchanges it at https://oauth2.googleapis.com/token.
/// Access + refresh tokens are stored ONLY in the OS credential store
/// (never in a file, localStorage or a log) and the code / tokens are never
/// printed. Returns the channel title on a best-effort basis.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthExchanged {
    pub channel_title: Option<String>,
}

#[derive(Deserialize)]
struct TokenResp {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct ChannelsResp {
    items: Option<Vec<ChannelItem>>,
}
#[derive(Deserialize)]
struct ChannelItem {
    snippet: Option<ChannelSnippet>,
}
#[derive(Deserialize)]
struct ChannelSnippet {
    title: Option<String>,
}

#[tauri::command]
pub async fn exchange_oauth_code(
    code: String,
    client_id: String,
    client_secret: String,
) -> Result<OAuthExchanged, String> {
    if code.trim().is_empty() {
        return Err("Google theke pawa code ta khali — age code paste koro.".into());
    }
    if client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Google Client ID / Secret khali — Settings > YouTube API te bosao.".into());
    }
    let client = reqwest::Client::new();
    let token: TokenResp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.trim()),
            ("client_id", client_id.trim()),
            ("client_secret", client_secret.trim()),
            ("redirect_uri", "urn:ietf:wg:oauth:2.0:oob"),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("token exchange failed (network): {e}"))?
        .error_for_status()
        .map_err(|e| {
            "token exchange failed — code ta vul / meyad sesh hote pare, abar Connect kore notun code naw.".to_string()
                + &format!(" ({e})")
        })?
        .json()
        .await
        .map_err(|e| format!("token response parse failed: {e}"))?;

    // Store tokens in the OS credential store only.
    crate::security::store_secret("oauth_access_token", &token.access_token)?;
    if let Some(refresh) = token.refresh_token {
        crate::security::store_secret("oauth_refresh_token", &refresh)?;
    }

    // Best effort: fetch the channel title so the UI can show it.
    let channel_title = client
        .get(format!("{API_BASE}/channels?part=snippet&mine=true"))
        .header("Authorization", format!("Bearer {}", token.access_token))
        .send()
        .await
        .ok()
        .and_then(|r| r.json::<ChannelsResp>().await.ok())
        .and_then(|c| c.items)
        .and_then(|mut items| items.pop())
        .and_then(|i| i.snippet)
        .and_then(|s| s.title);
    println!(
        "[youtube] OAuth connected{}",
        channel_title
            .as_ref()
            .map(|t| format!(" — channel: {t}"))
            .unwrap_or_default()
    );
    Ok(OAuthExchanged { channel_title })
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
        stream_name: stream.cdn.ingestion_info.stream_name.clone(),
        stream_name_redacted: redact_tail(&stream.cdn.ingestion_info.stream_name),
    })
}
