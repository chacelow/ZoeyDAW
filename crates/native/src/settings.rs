use std::{
    fs, io,
    path::{Path, PathBuf},
};

use napi_derive::napi;
use serde::{Deserialize, Serialize};

use crate::atomic_file::write_atomically;

mod preferences;
use preferences::{preferences_defaults, Preferences};

// Platform directory identifier is an on-disk compatibility contract, not a preference.
const APP_DIR: &str = "com.zoeydaw.desktop";
// Schema versions identify persisted formats; unversioned files migrate to version 1 in memory.
const SETTINGS_SCHEMA_VERSION: u32 = 1;

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

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    #[serde(default = "settings_schema_version")]
    pub schema_version: u32,
    #[serde(default = "preferences_defaults")]
    pub preferences: Preferences,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_preset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[napi(ts_type = "`${ThemeMode}`")]
    pub theme_mode: Option<ThemeMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[napi(ts_type = "`${CloseBehavior}`")]
    pub close_behavior: Option<CloseBehavior>,
}

fn settings_schema_version() -> u32 {
    SETTINGS_SCHEMA_VERSION
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            preferences: preferences_defaults(),
            theme_preset: None,
            theme_mode: None,
            language: None,
            close_behavior: None,
        }
    }
}

#[napi(string_enum = "lowercase")]
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[napi(string_enum = "lowercase")]
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    Ask,
    Tray,
    Quit,
}

#[napi]
pub fn settings_defaults() -> Settings {
    Settings::default()
}

fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}

fn parse_settings(bytes: &[u8]) -> io::Result<Settings> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(io::Error::other)?;
    if let Some(version) = value.get("schemaVersion") {
        if version.as_u64() != Some(u64::from(SETTINGS_SCHEMA_VERSION)) {
            return Err(io::Error::other(format!("unsupported settings schemaVersion {version}")));
        }
    }
    let settings: Settings = serde_json::from_value(value).map_err(io::Error::other)?;
    settings.preferences.validate().map_err(io::Error::other)?;
    Ok(settings)
}

pub(crate) fn get_settings(config_dir: &Path) -> io::Result<Settings> {
    match fs::read(settings_path(config_dir)) {
        Ok(bytes) => parse_settings(&bytes),
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
    let directory = Path::new(&config_dir);
    let settings = parse_settings(json.as_bytes())
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    // Refuse to overwrite unreadable or future-version data, even with a valid input.
    get_settings(directory).map_err(|error| napi::Error::from_reason(error.to_string()))?;
    let bytes = serde_json::to_vec(&settings)
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    write_atomically(&settings_path(directory), &bytes)
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

    #[test]
    fn reads_and_migrates_without_creating_or_rewriting_files() {
        let directory = temporary_directory("read-only");
        let missing = directory.join("missing");
        assert_eq!(get_settings(&missing).unwrap(), Settings::default());
        assert!(!missing.exists());
        let original = br#"{ "themePreset":"amber", "themeMode":"dark", "language":"zh-CN", "closeBehavior":"tray" }"#;
        fs::write(settings_path(&directory), original).unwrap();
        let settings = get_settings(&directory).unwrap();
        assert_eq!(settings.schema_version, SETTINGS_SCHEMA_VERSION);
        assert_eq!(settings.preferences, preferences_defaults());
        assert_eq!(settings.theme_preset.as_deref(), Some("amber"));
        assert_eq!(settings.theme_mode, Some(ThemeMode::Dark));
        assert_eq!(settings.language.as_deref(), Some("zh-CN"));
        assert_eq!(settings.close_behavior, Some(CloseBehavior::Tray));
        assert_eq!(fs::read(settings_path(&directory)).unwrap(), original);
        let json = serde_json::to_string(&settings).unwrap();
        settings_set(directory.to_string_lossy().into_owned(), json).unwrap();
        assert_eq!(get_settings(&directory).unwrap(), settings);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_future_versions_before_unknown_fields_and_preserves_original_bytes() {
        let directory = temporary_directory("future");
        let config_dir = directory.to_string_lossy().into_owned();
        let original = br#"{"schemaVersion":2,"newFutureSetting":true}"#;
        fs::write(settings_path(&directory), original).unwrap();
        assert!(settings_get(config_dir.clone())
            .unwrap_err()
            .reason
            .contains("unsupported settings schemaVersion 2"));
        for input in [r#"{}"#, r#"{"schemaVersion":2}"#, r#"{"schemaVersion":0}"#] {
            assert!(settings_set(config_dir.clone(), input.into()).is_err());
            assert_eq!(fs::read(settings_path(&directory)).unwrap(), original);
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn validates_every_preference_group_before_replacing_existing_bytes() {
        let directory = temporary_directory("ranges");
        let config_dir = directory.to_string_lossy().into_owned();
        settings_set(config_dir.clone(), r#"{"language":"en-US"}"#.into()).unwrap();
        let original = fs::read(settings_path(&directory)).unwrap();
        let valid = serde_json::to_value(Settings::default()).unwrap();
        for (pointer, invalid) in [
            ("/preferences/workspace/pxPerBar", serde_json::json!(0)),
            ("/preferences/workspace/fixedGridBars", serde_json::json!(0)),
            ("/preferences/midi/velocity", serde_json::json!(128)),
            ("/preferences/midi/initialPitch", serde_json::json!(128)),
            ("/preferences/midi/keyboardOctave", serde_json::json!(9)),
            ("/preferences/midi/recordedNoteLengthBeats", serde_json::json!(0)),
            ("/preferences/midi/loopStepBars", serde_json::json!(0)),
            ("/preferences/midiViewport/horizontalFactor", serde_json::json!(1)),
            ("/preferences/midiViewport/pitchMin", serde_json::json!(3)),
            ("/preferences/audio/transpose", serde_json::json!(49)),
            ("/preferences/audio/detune", serde_json::json!(-51)),
            ("/preferences/transport/tapSamples", serde_json::json!(1)),
            ("/preferences/transport/tapWindowMs", serde_json::json!(0)),
            ("/preferences/historyCapacity", serde_json::json!(0)),
            ("/preferences/recentProjectCapacity", serde_json::json!(0)),
            ("/preferences/window/width", serde_json::json!(0)),
            ("/preferences/numericInput/dragPixelsPerStep", serde_json::json!(0)),
            ("/preferences/pointer/dragThresholdPixels", serde_json::json!(-1)),
            ("/preferences/notifications/visibleLimit", serde_json::json!(9)),
            ("/preferences/browser/libraryRoots", serde_json::json!([""])),
            ("/preferences/audioDevice/sampleRate", serde_json::json!(1)),
            ("/preferences/audioDevice/blockFrames", serde_json::json!(65_537)),
        ] {
            let mut settings = valid.clone();
            *settings.pointer_mut(pointer).unwrap() = invalid;
            assert!(settings_set(config_dir.clone(), settings.to_string()).is_err(), "{pointer}");
            assert_eq!(fs::read(settings_path(&directory)).unwrap(), original, "{pointer}");
            assert!(parse_settings(settings.to_string().as_bytes()).is_err(), "{pointer}");
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn sparse_arrangement_overrides_round_trip_and_invalid_writes_preserve_bytes() {
        let directory = temporary_directory("arrangement");
        let config_dir = directory.to_string_lossy().into_owned();
        let overrides = serde_json::json!({
            "zoom": {"stepInFactor": 2.0},
            "keyboard": {"velocityStep": 17}
        });
        let mut settings = serde_json::to_value(Settings::default()).unwrap();
        settings["preferences"]["arrangement"] = overrides.clone();
        settings_set(config_dir.clone(), settings.to_string()).unwrap();
        let read: serde_json::Value = serde_json::from_str(&settings_get(config_dir.clone()).unwrap()).unwrap();
        assert_eq!(read["preferences"]["arrangement"], overrides);
        let original = fs::read(settings_path(&directory)).unwrap();
        for invalid in [
            serde_json::json!({"zoom": {"stepInFactor": 1}}),
            serde_json::json!({"follow": {"anchorRatio": 2}}),
            serde_json::json!({"keyboard": {"velocityStep": 1.5}}),
            serde_json::json!({"meter": {"minDb": 0}}),
            serde_json::json!({"zoom": {"unknown": 1}}),
            serde_json::json!({"pointer": {"dragThresholdPixels": 3}}),
        ] {
            settings["preferences"]["arrangement"] = invalid;
            assert!(settings_set(config_dir.clone(), settings.to_string()).is_err());
            assert_eq!(fs::read(settings_path(&directory)).unwrap(), original);
        }
        fs::remove_dir_all(directory).unwrap();
    }
}
