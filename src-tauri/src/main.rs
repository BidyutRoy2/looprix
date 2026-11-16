#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;
mod security;
mod youtube;

use std::sync::Mutex;

pub struct AppState {
    pub ffmpeg: Mutex<Option<ffmpeg::RunningStream>>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            ffmpeg: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            ffmpeg::start_stream,
            ffmpeg::stop_stream,
            ffmpeg::stream_status,
            security::secure_store,
            security::secure_retrieve,
            security::secure_delete,
            youtube::create_broadcast,
            ffmpeg::check_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
