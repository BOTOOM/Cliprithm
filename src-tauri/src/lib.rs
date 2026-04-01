mod commands;

use commands::ffmpeg;
use commands::library;
use commands::media_server;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_projects_table",
            sql: "CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                thumbnail_path TEXT,
                duration REAL DEFAULT 0,
                width INTEGER DEFAULT 0,
                height INTEGER DEFAULT 0,
                fps REAL DEFAULT 0,
                codec TEXT DEFAULT '',
                file_size INTEGER DEFAULT 0,
                processed_path TEXT,
                status TEXT DEFAULT 'imported',
                noise_threshold REAL DEFAULT -30,
                min_duration REAL DEFAULT 0.5,
                mode TEXT DEFAULT 'cut',
                silence_segments TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_app_settings_table",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_project_editing_state_columns",
            sql: "ALTER TABLE projects ADD COLUMN clip_segments TEXT DEFAULT '[]';
                  ALTER TABLE projects ADD COLUMN current_view TEXT DEFAULT 'import';
                  ALTER TABLE projects ADD COLUMN preview_mode TEXT DEFAULT 'source';
                  ALTER TABLE projects ADD COLUMN detection_result_json TEXT DEFAULT NULL;
                  ALTER TABLE projects ADD COLUMN detection_settings_json TEXT DEFAULT NULL;
                  ALTER TABLE projects ADD COLUMN video_metadata_json TEXT DEFAULT NULL;",
            kind: MigrationKind::Up,
        },
    ];

    // Start the local HTTP media server for video streaming
    let media_port = media_server::start();

    tauri::Builder::default()
        .manage(media_server::MediaServerPort(media_port))
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: Some("silencut".into()) }),
                    Target::new(TargetKind::Webview),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:silencut.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            ffmpeg::check_ffmpeg,
            ffmpeg::get_video_metadata,
            ffmpeg::detect_silence,
            ffmpeg::cut_silence,
            ffmpeg::export_video,
            ffmpeg::generate_sequence_preview,
            library::generate_thumbnail,
            library::generate_preview_proxy,
            media_server::get_media_server_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
