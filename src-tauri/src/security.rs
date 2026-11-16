//! Secure storage: secrets go to the OS credential store (Windows DPAPI /
//! Windows Credential Manager via the `keyring` crate). Nothing secret is
//! ever written to a file, to stdout, or to a log. All log lines must pass
//! through `redact()` first.

use keyring::Entry;

const SERVICE: &str = "Looprix";

/// Redact a stream key / token inside a log line. Mirrors the TS helper.
pub fn redact(line: &str) -> String {
    let mut out = line.to_string();
    // rtmps://host/live2/<key> -> ****
    if let Some(pos) = out.find("/live2/") {
        let after = pos + "/live2/".len();
        let end = out[after..]
            .find(|c: char| c.is_whitespace() || c == '"' || c == '\'')
            .map(|i| after + i)
            .unwrap_or(out.len());
        if end > after {
            out.replace_range(after..end, "****");
        }
    }
    out
}

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("keyring error: {e}"))
}

#[tauri::command]
pub fn secure_store(key: String, value: String) -> Result<(), String> {
    if key.trim().is_empty() || value.trim().is_empty() {
        return Err("key/value must not be empty".into());
    }
    entry(&key)?
        .set_password(&value)
        .map_err(|e| format!("store failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn secure_retrieve(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("retrieve failed: {e}")),
    }
}

#[tauri::command]
pub fn secure_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("delete failed: {e}")),
    }
}
