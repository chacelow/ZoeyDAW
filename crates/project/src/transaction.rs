use std::{
  collections::BTreeMap,
  fs::{self, File, OpenOptions},
  io::{self, Write},
  path::{Path, PathBuf},
  sync::{atomic::{AtomicU8, Ordering}, Arc, Mutex},
};

use serde_json::Value;
use uuid::Uuid;

use super::{
  media::PreparedSource, parse_manifest, path_string, read_manifest, reject_symlink,
  replace_media, resolve_media, transaction_guard, Durability, MediaLocation, ProjectPath,
  SaveProjectReceipt, StorageError, StorageResult,
};

const ACTIVE: u8 = 0;
const CANCELLED: u8 = 1;
const PUBLISHING: u8 = 2;
static OPERATIONS: Mutex<BTreeMap<String, Cancellation>> = Mutex::new(BTreeMap::new());

#[derive(Clone)]
pub(super) struct Cancellation(Arc<AtomicU8>);

impl Cancellation {
  fn new() -> Self { Self(Arc::new(AtomicU8::new(ACTIVE))) }

  pub fn is_cancelled(&self) -> bool { self.0.load(Ordering::Acquire) == CANCELLED }

  pub fn check(&self) -> StorageResult<()> {
    if self.is_cancelled() {
      Err(StorageError::new("cancelled", "Project file operation was cancelled before publication", None))
    } else {
      Ok(())
    }
  }

  fn request(&self) {
    let _ = self.0.compare_exchange(ACTIVE, CANCELLED, Ordering::AcqRel, Ordering::Acquire);
  }

  fn start_publication(&self) -> StorageResult<()> {
    match self.0.compare_exchange(ACTIVE, PUBLISHING, Ordering::AcqRel, Ordering::Acquire) {
      Ok(_) => Ok(()),
      Err(CANCELLED) => self.check(),
      Err(_) => Err(StorageError::new("internal", "Operation attempted to publish twice", None)),
    }
  }
}

impl zoeydaw_media::Cancellation for Cancellation {
  fn is_cancelled(&self) -> bool { self.0.load(Ordering::Acquire) == CANCELLED }
}

pub struct SaveOperation {
  id: String,
  cancellation: Cancellation,
}

impl SaveOperation {
  pub fn begin(id: String) -> StorageResult<Self> {
    if id.is_empty() {
      return Err(StorageError::new("invalid-operation", "Operation ID cannot be empty", None));
    }
    let mut registry = OPERATIONS.lock().map_err(|_| StorageError::new("internal", "Operation registry is poisoned", None))?;
    if registry.contains_key(&id) {
      return Err(StorageError::new("busy", "Operation ID is already active", None));
    }
    let cancellation = Cancellation::new();
    registry.insert(id.clone(), cancellation.clone());
    Ok(Self { id, cancellation })
  }

  pub fn save(
    &self,
    path: &Path,
    manifest: Value,
    collect: bool,
    expected_commit_id: Option<&str>,
  ) -> StorageResult<SaveProjectReceipt> {
    save_with_sync(path, manifest, collect, expected_commit_id, self, sync_directory)
  }
}

impl Drop for SaveOperation {
  fn drop(&mut self) {
    if let Ok(mut registry) = OPERATIONS.lock() {
      if registry.get(&self.id).is_some_and(|current| Arc::ptr_eq(&current.0, &self.cancellation.0)) {
        registry.remove(&self.id);
      }
    }
  }
}

pub fn cancel_project_operation(id: &str) -> StorageResult<()> {
  let registry = OPERATIONS.lock().map_err(|_| StorageError::new("internal", "Operation registry is poisoned", None))?;
  if let Some(operation) = registry.get(id) {
    operation.request();
  }
  Ok(())
}

struct OwnedFile {
  path: PathBuf,
  keep: bool,
}

impl OwnedFile {
  fn create(path: PathBuf) -> StorageResult<(Self, File)> {
    let file = OpenOptions::new().write(true).create_new(true).open(&path)
      .map_err(|error| StorageError::io(error, &path))?;
    Ok((Self { path, keep: false }, file))
  }
}

impl Drop for OwnedFile {
  fn drop(&mut self) {
    if !self.keep {
      let _ = fs::remove_file(&self.path);
    }
  }
}

fn check_conflict(project: &ProjectPath, expected: Option<&str>) -> StorageResult<()> {
  reject_symlink(&project.manifest)?;
  let exists = match fs::symlink_metadata(&project.manifest) {
    Ok(metadata) if metadata.is_file() => true,
    Ok(_) => return Err(StorageError::new("conflict", "Project destination is not a regular file", Some(&project.manifest))),
    Err(error) if error.kind() == io::ErrorKind::NotFound => false,
    Err(error) => return Err(StorageError::io(error, &project.manifest)),
  };
  let conflict = || StorageError::new("conflict", "Project destination no longer matches the expected commit", Some(&project.manifest));
  match (exists, expected) {
    (false, None) => Ok(()),
    (true, Some(expected)) => {
      let current = read_manifest(&project.manifest).map_err(|_| conflict())?;
      parse_manifest(&current).map_err(|_| conflict())?;
      if current.get("commitId").and_then(Value::as_str) == Some(expected) {
        Ok(())
      } else {
        Err(conflict())
      }
    }
    _ => Err(conflict()),
  }
}

fn ensure_media_directory(project: &ProjectPath) -> StorageResult<PathBuf> {
  let directory = project.root.join("media");
  reject_symlink(&directory)?;
  match fs::create_dir(&directory) {
    Ok(()) => {}
    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
    Err(error) => return Err(StorageError::io(error, &directory)),
  }
  reject_symlink(&directory)?;
  if !directory.is_dir() || !fs::canonicalize(&directory).map_err(|error| StorageError::io(error, &directory))?.starts_with(&project.root) {
    return Err(StorageError::new("invalid-path", "Managed media directory is outside the project or is not a directory", Some(&directory)));
  }
  Ok(directory)
}

fn sync_directory(path: &Path) -> io::Result<()> {
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS;
    OpenOptions::new().read(true).custom_flags(FILE_FLAG_BACKUP_SEMANTICS).open(path)?.sync_all()
  }
  #[cfg(not(target_os = "windows"))]
  {
    File::open(path)?.sync_all()
  }
}

#[cfg(target_os = "windows")]
fn publish_manifest(temp: &Path, target: &Path, replace: bool) -> io::Result<()> {
  use std::os::windows::ffi::OsStrExt;
  use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING};
  let source: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
  let destination: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
  let flags = if replace { MOVEFILE_REPLACE_EXISTING } else { 0 };
  if unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), flags) } == 0 {
    Err(io::Error::last_os_error())
  } else {
    Ok(())
  }
}

#[cfg(target_os = "macos")]
fn publish_manifest(temp: &Path, target: &Path, replace: bool) -> io::Result<()> {
  if replace { return fs::rename(temp, target); }
  use std::{ffi::CString, os::{raw::c_char, unix::ffi::OsStrExt}};
  extern "C" {
    fn renamex_np(from: *const c_char, to: *const c_char, flags: u32) -> i32;
  }
  let from = CString::new(temp.as_os_str().as_bytes()).map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
  let to = CString::new(target.as_os_str().as_bytes()).map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
  const RENAME_EXCL: u32 = 0x0000_0004;
  if unsafe { renamex_np(from.as_ptr(), to.as_ptr(), RENAME_EXCL) } == 0 {
    Ok(())
  } else {
    Err(io::Error::last_os_error())
  }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn publish_manifest(temp: &Path, target: &Path, replace: bool) -> io::Result<()> {
  if replace { fs::rename(temp, target) } else { fs::hard_link(temp, target) }
}

fn managed_binding(project: &ProjectPath, location: &MediaLocation) -> StorageResult<Option<String>> {
  let MediaLocation::External { path } = location else { return Ok(None) };
  let Ok(relative) = Path::new(path).strip_prefix(&project.root) else { return Ok(None) };
  let Some(relative) = relative.to_str() else { return Ok(None) };
  #[cfg(target_os = "windows")]
  let relative = relative.replace('\\', "/");
  #[cfg(not(target_os = "windows"))]
  let relative = relative.to_owned();
  if super::validate_managed_name(&relative).is_err() { return Ok(None); }
  project.media_path(&relative)?;
  Ok(Some(relative))
}

fn prepublication_sync(result: io::Result<()>, path: &Path) -> StorageResult<bool> {
  match result {
    Ok(()) => Ok(true),
    #[cfg(target_os = "windows")]
    Err(_) => { let _ = path; Ok(false) }
    #[cfg(not(target_os = "windows"))]
    Err(error) => Err(StorageError::io(error, path)),
  }
}


pub(super) fn save_with_sync(
  path: &Path,
  mut manifest: Value,
  collect: bool,
  expected_commit_id: Option<&str>,
  operation: &SaveOperation,
  mut sync: impl FnMut(&Path) -> io::Result<()>,
) -> StorageResult<SaveProjectReceipt> {
  let _guard = transaction_guard()?;
  let project = ProjectPath::parse(path)?;
  let mut records = parse_manifest(&manifest)?;
  for record in &mut records {
    if let Some(path) = managed_binding(&project, &record.location)? {
      record.location = MediaLocation::Project { path };
    }
  }
  let paths = resolve_media(&project, &records)?;
  check_conflict(&project, expected_commit_id)?;
  if expected_commit_id.is_some() && manifest.get("commitId").and_then(Value::as_str) == expected_commit_id {
    return Err(StorageError::new("conflict", "Each save must publish a new commit ID", Some(&project.manifest)));
  }
  let cancel = &operation.cancellation;
  cancel.check()?;
  let mut collected = Vec::new();
  let mut directories_synced = true;
  if collect && !records.is_empty() {
    let directory = ensure_media_directory(&project)?;
    for (record, source) in records.iter_mut().zip(paths) {
      cancel.check()?;
      let prepared = PreparedSource::open(&source, record, cancel)?;
      if matches!(&record.location, MediaLocation::Project { .. }) {
        prepared.verify_to(None, &source, record, cancel)?;
        continue;
      }
      let relative = format!("media/{}.{}", Uuid::new_v4(), prepared.extension());
      let destination = project.media_path(&relative)?;
      let (owned, mut file) = OwnedFile::create(destination.clone())?;
      prepared.verify_to(Some(&mut file), &source, record, cancel)?;
      file.sync_all().map_err(|error| StorageError::io(error, &destination))?;
      if file.metadata().map_err(|error| StorageError::io(error, &destination))?.len() != record.byte_length {
        return Err(StorageError::new("io", "Collected media length does not match its source", Some(&destination)));
      }
      drop(file);
      collected.push(owned);
      record.location = MediaLocation::Project { path: relative };
    }
    directories_synced &= prepublication_sync(sync(&directory), &directory)?;
  }
  let states = super::plugin_states::references(&project, &manifest)?;
  if !states.is_empty() {
    let directory = super::plugin_states::ensure_directory(&project)?;
    for state in states {
      cancel.check()?;
      let destination = super::plugin_states::managed_path(&project, &state.hash)?;
      match fs::symlink_metadata(&destination) {
        Ok(_) => super::plugin_states::verify(&destination, &state.hash, None, || cancel.check())?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
          let temporary = directory.join(format!(".zdps-{}.tmp", Uuid::new_v4()));
          let (pending, mut file) = OwnedFile::create(temporary)?;
          super::plugin_states::verify(&state.source, &state.hash, Some(&mut file), || cancel.check())?;
          file.sync_all().map_err(|error| StorageError::io(error, &pending.path))?;
          drop(file);
          cancel.check()?;
          match publish_manifest(&pending.path, &destination, false) {
            Ok(()) => collected.push(OwnedFile { path: destination, keep: false }),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
              super::plugin_states::verify(&destination, &state.hash, None, || cancel.check())?;
            }
            Err(error) => return Err(StorageError::io(error, &destination)),
          }
        }
        Err(error) => return Err(StorageError::io(error, &destination)),
      }
      *manifest.pointer_mut(&state.pointer).ok_or_else(|| StorageError::new("invalid-plugin-state", "Plugin state reference disappeared", None))? =
        Value::String(format!("plugin-state/{}.zdps", state.hash));
    }
    directories_synced &= prepublication_sync(sync(&directory), &directory)?;
  }
  replace_media(&mut manifest, &records)?;
  let temporary = project.root.join(format!(".zdaw-{}.tmp", Uuid::new_v4()));
  let (owned_manifest, mut file) = OwnedFile::create(temporary)?;
  serde_json::to_writer(&mut file, &manifest).map_err(|error| StorageError::new("io", error.to_string(), Some(&owned_manifest.path)))?;
  file.write_all(b"\n").map_err(|error| StorageError::io(error, &owned_manifest.path))?;
  file.sync_all().map_err(|error| StorageError::io(error, &owned_manifest.path))?;
  drop(file);
  directories_synced &= prepublication_sync(sync(&project.root), &project.root)?;
  check_conflict(&project, expected_commit_id)?;
  cancel.start_publication()?;
  publish_manifest(&owned_manifest.path, &project.manifest, expected_commit_id.is_some()).map_err(|error| {
    if error.kind() == io::ErrorKind::AlreadyExists {
      StorageError::new("conflict", "Project destination was created by another writer", Some(&project.manifest))
    } else {
      StorageError::io(error, &project.manifest)
    }
  })?;
  for file in &mut collected { file.keep = true; }
  // From publication onward the receipt must describe the committed project, never cancellation.
  let temporary_removed = match fs::remove_file(&owned_manifest.path) {
    Ok(()) => true,
    Err(error) if error.kind() == io::ErrorKind::NotFound => true,
    Err(_) => false,
  };
  let durability = if sync(&project.root).is_ok() && directories_synced && temporary_removed {
    Durability::Synced
  } else {
    Durability::PublishedSyncUncertain
  };
  Ok(SaveProjectReceipt { path: path_string(&project.manifest)?, manifest, durability })
}
