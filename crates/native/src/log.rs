use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use log::{LevelFilter, Log, Metadata, Record};
use napi_derive::napi;
use serde::{Deserialize, Serialize};

use crate::atomic_file::write_atomically;

const CONFIG_FILE_NAME: &str = "log-config.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum PersistedLevel {
    Off,
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl PersistedLevel {
    fn filter(self) -> LevelFilter {
        match self {
            Self::Off => LevelFilter::Off,
            Self::Error => LevelFilter::Error,
            Self::Warn => LevelFilter::Warn,
            Self::Info => LevelFilter::Info,
            Self::Debug => LevelFilter::Debug,
            Self::Trace => LevelFilter::Trace,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogConfig {
    level: PersistedLevel,
    #[serde(default)]
    dir: Option<String>,
}
impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: if cfg!(debug_assertions) {
                PersistedLevel::Debug
            } else {
                PersistedLevel::Info
            },
            dir: None,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogInfo {
    level: PersistedLevel,
    active_dir: String,
    configured_dir: Option<String>,
    default_dir: String,
    size_bytes: u64,
}

fn config_path(config_dir: &Path) -> PathBuf {
    config_dir.join(CONFIG_FILE_NAME)
}
fn load(config_dir: &Path) -> LogConfig {
    fs::read(config_path(config_dir))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}
fn save(config_dir: &Path, config: &LogConfig) -> io::Result<()> {
    write_atomically(
        &config_path(config_dir),
        &serde_json::to_vec_pretty(config).map_err(io::Error::other)?,
    )
}
fn resolved_log_dir(config: &LogConfig, default_dir: &Path) -> PathBuf {
    config
        .dir
        .as_deref()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .map_or_else(|| default_dir.to_owned(), PathBuf::from)
}
fn log_file(name: &str) -> bool {
    name.ends_with(".log") || name.contains(".log.") || name.ends_with(".log.bak")
}
fn compute_log_size(dir: &Path) -> u64 {
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.file_name().to_str().is_some_and(log_file))
        .filter_map(|entry| entry.metadata().ok())
        .map(|meta| meta.len())
        .sum()
}

struct FileLogger {
    file: Mutex<File>,
    active_dir: PathBuf,
}
static LOGGER: OnceLock<FileLogger> = OnceLock::new();

impl Log for FileLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= log::max_level()
    }
    fn log(&self, record: &Record<'_>) {
        if self.enabled(record.metadata()) {
            if let Ok(mut file) = self.file.lock() {
                let _ = writeln!(
                    file,
                    "{} {}: {}",
                    record.level(),
                    record.target(),
                    record.args()
                );
                let _ = file.flush();
            }
        }
    }
    fn flush(&self) {
        if let Ok(mut file) = self.file.lock() {
            let _ = file.flush();
        }
    }
}

#[napi]
pub fn initialize_log(config_dir: String, default_dir: String) -> napi::Result<String> {
    if let Some(logger) = LOGGER.get() {
        return Ok(logger.active_dir.to_string_lossy().into_owned());
    }
    let config = load(Path::new(&config_dir));
    let dir = resolved_log_dir(&config, Path::new(&default_dir));
    fs::create_dir_all(&dir).map_err(|error| napi::Error::from_reason(error.to_string()))?;
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("app.log"))
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    let logger = LOGGER.get_or_init(|| FileLogger {
        file: Mutex::new(file),
        active_dir: dir,
    });
    log::set_logger(logger).map_err(|error| napi::Error::from_reason(error.to_string()))?;
    log::set_max_level(config.level.filter());
    Ok(logger.active_dir.to_string_lossy().into_owned())
}

fn active_dir(config_dir: &Path, default_dir: &Path) -> PathBuf {
    LOGGER.get().map_or_else(
        || resolved_log_dir(&load(config_dir), default_dir),
        |logger| logger.active_dir.clone(),
    )
}

#[napi]
pub fn get_log_config(config_dir: String, default_dir: String) -> napi::Result<String> {
    let config_dir = Path::new(&config_dir);
    let default_dir = Path::new(&default_dir);
    let config = load(config_dir);
    let active = active_dir(config_dir, default_dir);
    let info = LogInfo {
        level: config.level,
        active_dir: active.to_string_lossy().into_owned(),
        configured_dir: config.dir,
        default_dir: default_dir.to_string_lossy().into_owned(),
        size_bytes: compute_log_size(&active),
    };
    serde_json::to_string(&info).map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn set_log_level(config_dir: String, level: String) -> napi::Result<()> {
    let level: PersistedLevel = serde_json::from_str(&format!("\"{level}\""))
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    let path = Path::new(&config_dir);
    let mut config = load(path);
    config.level = level;
    save(path, &config).map_err(|error| napi::Error::from_reason(error.to_string()))?;
    log::set_max_level(level.filter());
    log::info!("log level changed to {level:?}");
    Ok(())
}

#[napi]
pub fn set_log_dir(config_dir: String, dir: String) -> napi::Result<()> {
    let path = Path::new(&config_dir);
    let trimmed = dir.trim();
    let mut config = load(path);
    config.dir = if trimmed.is_empty() {
        None
    } else {
        fs::create_dir_all(trimmed).map_err(|error| napi::Error::from_reason(error.to_string()))?;
        Some(trimmed.to_owned())
    };
    save(path, &config).map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn clear_logs(config_dir: String, default_dir: String) -> napi::Result<u32> {
    let dir = active_dir(Path::new(&config_dir), Path::new(&default_dir));
    let mut live_file = if let Some(logger) = LOGGER.get().filter(|logger| logger.active_dir == dir)
    {
        Some(
            logger
                .file
                .lock()
                .map_err(|error| napi::Error::from_reason(error.to_string()))?,
        )
    } else {
        None
    };
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(napi::Error::from_reason(error.to_string())),
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        if entry.file_name().to_str().is_some_and(log_file) && fs::remove_file(entry.path()).is_ok()
        {
            removed += 1;
        }
    }
    if let Some(file) = live_file.as_mut() {
        **file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("app.log"))
            .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    }
    Ok(removed)
}

#[napi]
pub fn open_log_dir(config_dir: String, default_dir: String) -> napi::Result<()> {
    let dir = active_dir(Path::new(&config_dir), Path::new(&default_dir));
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    let status = command
        .arg(dir)
        .status()
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    if status.success() {
        Ok(())
    } else {
        Err(napi::Error::from_reason(format!(
            "file manager exited with {status}"
        )))
    }
}

#[napi]
pub fn write_log(level: String, message: String) -> napi::Result<()> {
    let level: log::Level = level
        .parse()
        .map_err(|_| napi::Error::from_reason("invalid log level"))?;
    log::log!(level, "{message}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_and_log_file_filter_respect_active_directory() {
        let dir = std::env::temp_dir().join(format!("zoeydaw-log-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let config_dir = dir.join("config");
        let active_dir = dir.join("logs");
        fs::create_dir_all(&active_dir).unwrap();
        save(
            &config_dir,
            &LogConfig {
                level: PersistedLevel::Trace,
                dir: Some(active_dir.to_string_lossy().into_owned()),
            },
        )
        .unwrap();
        assert_eq!(
            resolved_log_dir(&load(&config_dir), &dir.join("default")),
            active_dir
        );
        fs::write(active_dir.join("a.log"), b"abc").unwrap();
        fs::write(active_dir.join("keep.txt"), b"keep").unwrap();
        assert_eq!(compute_log_size(&active_dir), 3);
        assert_eq!(
            clear_logs(
                config_dir.to_string_lossy().into_owned(),
                dir.join("default").to_string_lossy().into_owned()
            )
            .unwrap(),
            1
        );
        assert!(active_dir.join("keep.txt").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
