/**
 * Persistence + secure-storage abstraction.
 * - Non-secret settings: localStorage (app data dir on the real Tauri build).
 * - Secrets (stream key, OAuth tokens): NEVER in localStorage / files / logs.
 *   On Windows they go to the OS credential store (DPAPI / Windows Credential
 *   Manager) via the Rust `secure_store` / `secure_retrieve` commands, which
 *   use the `keyring` crate. In the browser/dev fallback they live only in
 *   memory for the session.
 */
const memSecrets = new Map<string, string>();

export async function secureStore(key: string, value: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("secure_store", { key, value });
  } catch {
    memSecrets.set(key, value);
  }
}

export async function secureRetrieve(key: string): Promise<string | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const v = await invoke<string | null>("secure_retrieve", { key });
    return v;
  } catch {
    return memSecrets.get(key) ?? null;
  }
}

export async function secureDelete(key: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("secure_delete", { key });
  } catch {
    memSecrets.delete(key);
  }
}

export function loadSettings<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`lss:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveSettings(key: string, value: unknown): void {
  try {
    localStorage.setItem(`lss:${key}`, JSON.stringify(value));
  } catch {
    // storage full / unavailable — settings stay in memory only, never crash
  }
}
