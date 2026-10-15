use std::{
    fs, io,
    path::{Path, PathBuf},
};

use napi_derive::napi;
use serde::{Deserialize, Serialize};

use crate::atomic_file::write_atomically;

const APP_DIR: &str = "com.zoeydaw.desktop";

#[napi(object)]
pub struct UserDirectories {
    pub config_dir: String,
    pub data_dir: String,
    pub log_dir: String,
}

#[napi]
pub fn user_directories() -> napi::Result<UserDirectories> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| napi::Error::from_reason("user config directory unavailable"))?
        .join(APP_DIR);
    let data_dir = dirs::data_dir()
        .ok_or_else(|| napi::Error::from_reason("user data directory unavailable"))?
        .join(APP_DIR);
    #[cfg(target_os = "macos")]
    let log_dir = dirs::home_dir()
        .ok_or_else(|| napi::Error::from_reason("home directory unavailable"))?
        .join("Library/Logs")
        .join(APP_DIR);
    #[cfg(not(target_os = "macos"))]
    let log_dir = data_dir.join("logs");
    Ok(UserDirectories {
        config_dir: config_dir.to_string_lossy().into_owned(),
        data_dir: data_dir.to_string_lossy().into_owned(),
        log_dir: log_dir.to_string_lossy().into_owned(),
    })
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    theme_preset: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    theme_mode: Option<ThemeMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    close_behavior: Option<CloseBehavior>,
}

/// 明暗模式,与配色预设 `themePreset` 相互独立;缺省由 TS 端按 `system` 处理。
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum CloseBehavior {
    Ask,
    Tray,
    Quit,
}

fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}

fn get_settings(config_dir: &Path) -> io::Result<Settings> {
    match fs::read(settings_path(config_dir)) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(error) => Err(error),
    }
}

#[napi]
pub fn settings_get(config_dir: String) -> napi::Result<String> {
    serde_json::to_string(
        &get_settings(Path::new(&config_dir))
            .map_err(|error| napi::Error::from_reason(error.to_string()))?,
    )
    .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn settings_set(config_dir: String, json: String) -> napi::Result<()> {
    let settings: Settings =
        serde_json::from_str(&json).map_err(|error| napi::Error::from_reason(error.to_string()))?;
    let bytes = serde_json::to_vec(&settings)
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    write_atomically(&settings_path(Path::new(&config_dir)), &bytes)
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

fn snapshot_path(data_dir: &Path, key: &str) -> napi::Result<PathBuf> {
    if key.is_empty() {
        return Err(napi::Error::from_reason("snapshot key must not be empty"));
    }
    let encoded: String = url::form_urlencoded::byte_serialize(key.as_bytes()).collect();
    Ok(data_dir.join("snapshots").join(format!("{encoded}.json")))
}

#[napi]
pub fn snapshot_get(data_dir: String, key: String) -> napi::Result<Option<String>> {
    let path = snapshot_path(Path::new(&data_dir), &key)?;
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(napi::Error::from_reason(error.to_string())),
    }
}

#[napi]
pub fn snapshot_set(data_dir: String, key: String, value: String) -> napi::Result<()> {
    let path = snapshot_path(Path::new(&data_dir), &key)?;
    serde_json::from_str::<serde_json::Value>(&value)
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    write_atomically(&path, value.as_bytes())
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_settings_and_isolates_snapshots_in_temporary_directory() {
        let directory =
            std::env::temp_dir().join(format!("zoeydaw-settings-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        assert_eq!(get_settings(&directory).unwrap(), Settings::default());
        settings_set(
            directory.to_string_lossy().into_owned(),
            r#"{"themePreset":"dark","language":"en-US","closeBehavior":"tray"}"#.into(),
        )
        .unwrap();
        assert_eq!(
            get_settings(&directory).unwrap().close_behavior,
            Some(CloseBehavior::Tray)
        );
        snapshot_set(
            directory.to_string_lossy().into_owned(),
            "project_1".into(),
            r#"{"clips":[]} "#.into(),
        )
        .unwrap();
        assert_eq!(
            snapshot_get(directory.to_string_lossy().into_owned(), "project_1".into()).unwrap(),
            Some(r#"{"clips":[]} "#.into())
        );
        snapshot_set(
            directory.to_string_lossy().into_owned(),
            "../escape".into(),
            "{}".into(),
        )
        .unwrap();
        assert_eq!(
            snapshot_get(directory.to_string_lossy().into_owned(), "../escape".into()).unwrap(),
            Some("{}".into())
        );
        assert!(!directory.join("escape.json").exists());
        fs::remove_dir_all(directory).unwrap();
    }

    fn temporary_directory(name: &str) -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("zoeydaw-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn reads_settings_written_before_theme_mode_existed() {
        let directory = temporary_directory("legacy");
        fs::write(
            settings_path(&directory),
            r#"{"themePreset":"amber","language":"zh-CN","closeBehavior":"ask"}"#,
        )
        .unwrap();
        let settings = get_settings(&directory).unwrap();
        assert_eq!(settings.theme_mode, None);
        assert_eq!(settings.theme_preset.as_deref(), Some("amber"));
        assert!(!settings_get(directory.to_string_lossy().into_owned())
            .unwrap()
            .contains("themeMode"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn round_trips_every_theme_mode_independently_of_preset() {
        let directory = temporary_directory("round-trip");
        let config_dir = directory.to_string_lossy().into_owned();
        for (json, mode) in [
            ("light", ThemeMode::Light),
            ("dark", ThemeMode::Dark),
            ("system", ThemeMode::System),
        ] {
            settings_set(
                config_dir.clone(),
                format!(r#"{{"themePreset":"dark","themeMode":"{json}"}}"#),
            )
            .unwrap();
            let settings = get_settings(&directory).unwrap();
            assert_eq!(settings.theme_mode, Some(mode));
            assert_eq!(settings.theme_preset.as_deref(), Some("dark"));
            assert!(settings_get(config_dir.clone())
                .unwrap()
                .contains(&format!(r#""themeMode":"{json}""#)));
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_unknown_theme_mode_on_read_and_write() {
        let directory = temporary_directory("unknown-mode");
        let config_dir = directory.to_string_lossy().into_owned();
        settings_set(config_dir.clone(), r#"{"themeMode":"light"}"#.into()).unwrap();

        let write_error = settings_set(config_dir.clone(), r#"{"themeMode":"sepia"}"#.into())
            .unwrap_err()
            .reason;
        assert!(write_error.contains("sepia"), "{write_error}");
        assert_eq!(
            get_settings(&directory).unwrap().theme_mode,
            Some(ThemeMode::Light)
        );

        fs::write(settings_path(&directory), r#"{"themeMode":"Dark"}"#).unwrap();
        let read_error = settings_get(config_dir).unwrap_err().reason;
        assert!(read_error.contains("Dark"), "{read_error}");
        fs::remove_dir_all(directory).unwrap();
    }
}
