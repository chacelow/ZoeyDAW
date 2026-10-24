use std::{
  collections::HashSet,
  fs,
  io,
  path::{Component, Path, PathBuf},
  sync::{Mutex, TryLockError},
};

use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;
use zoeydaw_media::{self as media, MediaError, MediaLocation, MediaRecord, NeverCancelled};

#[path = "transaction.rs"]
mod transaction;
#[path = "plugin_states.rs"]
mod plugin_states;
#[cfg(test)]
#[path = "tests.rs"]
mod tests;

pub use transaction::{cancel_project_operation, SaveOperation};

static FILE_TRANSACTION: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageError {
  pub code: String,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path: Option<String>,
}

impl StorageError {
  pub fn new(code: &str, message: impl Into<String>, path: Option<&Path>) -> Self {
    Self {
      code: code.into(),
      message: message.into(),
      path: path.map(|path| path.to_string_lossy().into_owned()),
    }
  }

  fn io(error: io::Error, path: &Path) -> Self {
    let code = if error.kind() == io::ErrorKind::NotFound { "not-found" } else { "io" };
    Self::new(code, error.to_string(), Some(path))
  }
}

impl From<MediaError> for StorageError {
  fn from(error: MediaError) -> Self {
    Self { code: error.code, message: error.message, path: error.path }
  }
}

pub type StorageResult<T> = Result<T, StorageError>;


#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MediaIssueKind {
  Missing,
  Changed,
  Unreadable,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaIssue {
  pub source_id: String,
  pub kind: MediaIssueKind,
  pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectReceipt {
  pub path: String,
  pub manifest: Value,
  pub issues: Vec<MediaIssue>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub enum Durability {
  #[serde(rename = "synced")]
  Synced,
  #[serde(rename = "published-sync-uncertain")]
  PublishedSyncUncertain,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectReceipt {
  pub path: String,
  pub manifest: Value,
  pub durability: Durability,
}

struct ProjectPath {
  manifest: PathBuf,
  root: PathBuf,
}

fn absolute_path(path: &Path) -> StorageResult<()> {
  if !path.is_absolute()
    || path.to_str().is_some_and(|value| value.as_bytes().contains(&0))
    || path.components().any(|part| matches!(part, Component::ParentDir))
  {
    return Err(StorageError::new("invalid-path", "Expected an absolute path without parent traversal or NUL bytes", Some(path)));
  }
  Ok(())
}

fn path_string(path: &Path) -> StorageResult<String> {
  path.to_str().map(str::to_owned).ok_or_else(|| {
    StorageError::new("invalid-path", "Path is not valid UTF-8", Some(path))
  })
}

impl ProjectPath {
  fn parse(path: &Path) -> StorageResult<Self> {
    absolute_path(path)?;
    if path.extension().and_then(|extension| extension.to_str()) != Some("zdaw") {
      return Err(StorageError::new("invalid-path", "Project manifests must use the .zdaw extension", Some(path)));
    }
    let parent = path.parent().ok_or_else(|| StorageError::new("invalid-path", "Project path has no parent", Some(path)))?;
    let root = fs::canonicalize(parent).map_err(|error| StorageError::io(error, parent))?;
    if !root.is_dir() {
      return Err(StorageError::new("invalid-path", "Project parent is not a directory", Some(parent)));
    }
    let name = path.file_name().ok_or_else(|| StorageError::new("invalid-path", "Project filename is missing", Some(path)))?;
    let manifest = root.join(name);
    reject_symlink(&manifest)?;
    path_string(&manifest)?;
    Ok(Self { manifest, root })
  }

  fn media_path(&self, relative: &str) -> StorageResult<PathBuf> {
    validate_managed_name(relative)?;
    let directory = self.root.join("media");
    let path = self.root.join(relative);
    for candidate in [&directory, &path] {
      reject_symlink(candidate)?;
      match fs::canonicalize(candidate) {
        Ok(canonical) if !canonical.starts_with(&self.root) => {
          return Err(StorageError::new("invalid-path", "Managed media escapes the project directory", Some(candidate)));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(StorageError::io(error, candidate)),
      }
    }
    Ok(path)
  }
}

fn reject_symlink(path: &Path) -> StorageResult<()> {
  match fs::symlink_metadata(path) {
    Ok(metadata) if metadata.file_type().is_symlink() => {
      Err(StorageError::new("invalid-path", "Symbolic links are not allowed for project-owned paths", Some(path)))
    }
    Ok(_) => Ok(()),
    Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
    Err(error) => Err(StorageError::io(error, path)),
  }
}

fn validate_managed_name(relative: &str) -> StorageResult<()> {
  let invalid = || StorageError::new("invalid-path", "Managed media must use media/<lowercase-uuid>.<audio-extension>", Some(Path::new(relative)));
  let name = relative.strip_prefix("media/").ok_or_else(invalid)?;
  let (stem, extension) = name.rsplit_once('.').ok_or_else(invalid)?;
  if !matches!(extension, "wav" | "aiff" | "flac" | "mp3") {
    return Err(invalid());
  }
  let id = Uuid::parse_str(stem).map_err(|_| invalid())?;
  if id.to_string() != stem {
    return Err(invalid());
  }
  Ok(())
}

fn validate_record(record: &MediaRecord) -> StorageResult<()> {
  match &record.location {
    MediaLocation::External { path } => absolute_path(Path::new(path))?,
    MediaLocation::Project { path } => validate_managed_name(path)?,
    MediaLocation::Fixture { .. } => return Err(StorageError::new("fixture-media", "Fixture audio cannot be persisted as a native project", None)),
  }
  if record.id.is_empty() || record.name.is_empty()
    || record.sha256.len() != 64
    || !record.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    || record.sample_rate == 0 || record.channels == 0 || record.byte_length == 0
  {
    return Err(StorageError::new("invalid-manifest", "Invalid media identity, fingerprint, or audio dimensions", None));
  }
  Ok(())
}

fn parse_manifest(manifest: &Value) -> StorageResult<Vec<MediaRecord>> {
  let invalid = || StorageError::new("invalid-manifest", "Invalid zoeydaw project manifest", None);
  if manifest.get("format").and_then(Value::as_str) != Some("zoeydaw-project")
    || manifest.get("version").and_then(Value::as_u64) != Some(1)
    || !matches!(manifest.pointer("/project/version").and_then(Value::as_u64), Some(3 | 4))
    || !["projectId", "commitId"].iter().all(|key| manifest.get(*key).and_then(Value::as_str).is_some_and(|value| !value.is_empty()))
    || !manifest.pointer("/project/workspace").is_some_and(Value::is_object)
  {
    return Err(invalid());
  }
  let values = manifest.pointer("/project/document/media").and_then(Value::as_array).ok_or_else(invalid)?;
  let mut ids = HashSet::with_capacity(values.len());
  let mut records = Vec::with_capacity(values.len());
  for value in values {
    let mut record: MediaRecord = serde_json::from_value(value.clone()).map_err(|error| {
      StorageError::new("invalid-manifest", format!("Invalid media record: {error}"), None)
    })?;
    validate_record(&record)?;
    record.sha256.make_ascii_lowercase();
    if !ids.insert(record.id.clone()) {
      return Err(StorageError::new("invalid-manifest", "Duplicate media source ID", None));
    }
    records.push(record);
  }
  let tracks = manifest.pointer("/project/document/tracks").and_then(Value::as_array).ok_or_else(invalid)?;
  for track in tracks {
    let clips = track.get("clips").and_then(Value::as_array).ok_or_else(invalid)?;
    for clip in clips {
      match clip.get("kind").and_then(Value::as_str) {
        Some("audio") => match clip.get("sourceId") {
          Some(Value::Null) => {},
          Some(Value::String(id)) if ids.contains(id) => {},
          _ => return Err(StorageError::new("invalid-manifest", "Audio clip references an unknown or invalid media source ID", None)),
        },
        Some("midi" | "pattern") => {},
        _ => return Err(invalid()),
      }
    }
  }
  Ok(records)
}

fn replace_media(manifest: &mut Value, records: &[MediaRecord]) -> StorageResult<()> {
  let value = serde_json::to_value(records).map_err(|error| StorageError::new("invalid-manifest", error.to_string(), None))?;
  *manifest.pointer_mut("/project/document/media").ok_or_else(|| StorageError::new("invalid-manifest", "Media registry is missing", None))? = value;
  Ok(())
}

fn resolve_media(project: &ProjectPath, records: &[MediaRecord]) -> StorageResult<Vec<PathBuf>> {
  records.iter().map(|record| match &record.location {
    MediaLocation::External { path } => Ok(PathBuf::from(path)),
    MediaLocation::Project { path } => project.media_path(path),
    MediaLocation::Fixture { .. } => Err(StorageError::new("fixture-media", "Fixture media has no native file", None)),
  }).collect()
}

fn read_manifest(path: &Path) -> StorageResult<Value> {
  if !fs::metadata(path).map_err(|error| StorageError::io(error, path))?.is_file() {
    return Err(StorageError::new("invalid-manifest", "Project manifest is not a regular file", Some(path)));
  }
  let file = fs::File::open(path).map_err(|error| StorageError::io(error, path))?;
  serde_json::from_reader(file).map_err(|error| StorageError::new("invalid-manifest", error.to_string(), Some(path)))
}

fn transaction_guard() -> StorageResult<std::sync::MutexGuard<'static, ()>> {
  FILE_TRANSACTION.try_lock().map_err(|error| match error {
    TryLockError::WouldBlock => StorageError::new("busy", "Another project file operation is in progress", None),
    TryLockError::Poisoned(_) => StorageError::new("internal", "Project file transaction lock is poisoned", None),
  })
}

pub fn open_project(path: &Path) -> StorageResult<OpenProjectReceipt> {
  let _guard = transaction_guard()?;
  let project = ProjectPath::parse(path)?;
  let mut manifest = read_manifest(&project.manifest)?;
  let mut records = parse_manifest(&manifest)?;
  let paths = resolve_media(&project, &records)?;
  let mut issues = Vec::new();
  for (record, path) in records.iter_mut().zip(paths) {
    let kind = match media::fingerprint::<NeverCancelled>(&path, None) {
      Ok((sha256, byte_length)) if sha256 == record.sha256 && byte_length == record.byte_length => None,
      Ok(_) => Some(MediaIssueKind::Changed),
      Err(error) if error.code == "not-found" => Some(MediaIssueKind::Missing),
      Err(error) if error.code == "media-changed" => Some(MediaIssueKind::Changed),
      Err(_) => Some(MediaIssueKind::Unreadable),
    };
    let path = path_string(&path)?;
    if let Some(kind) = kind {
      issues.push(MediaIssue { source_id: record.id.clone(), kind, path: path.clone() });
    }
    record.location = MediaLocation::External { path };
  }
  replace_media(&mut manifest, &records)?;
  plugin_states::resolve_open(&project, &mut manifest)?;
  Ok(OpenProjectReceipt { path: path_string(&project.manifest)?, manifest, issues })
}

pub fn relink_media(mut original: MediaRecord, path: &Path) -> StorageResult<MediaRecord> {
  validate_record(&original)?;
  original.sha256.make_ascii_lowercase();
  let mut inspected = media::inspect::<NeverCancelled>(path, None)?;
  if inspected.sha256 != original.sha256 || inspected.byte_length != original.byte_length {
    return Err(StorageError::new("media-changed", "Relink candidate does not match the complete source fingerprint and size", Some(path)));
  }
  inspected.id = original.id;
  inspected.name = original.name;
  Ok(inspected)
}
