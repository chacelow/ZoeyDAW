use std::path::Path;

use serde_json::Value;
use zoeydaw_media::{MediaRecord, NeverCancelled};
use zoeydaw_project::{
  OpenProjectReceipt, SaveOperation, SaveProjectReceipt, StorageError, StorageResult,
};

#[tauri::command]
pub async fn inspect_project_media(path: String) -> StorageResult<MediaRecord> {
  tauri::async_runtime::spawn_blocking(move || {
    zoeydaw_media::inspect::<NeverCancelled>(Path::new(&path), None).map_err(StorageError::from)
  }).await.map_err(|error| StorageError::new("internal", error.to_string(), None))?
}

#[tauri::command]
pub async fn open_project_file(path: String) -> StorageResult<OpenProjectReceipt> {
  tauri::async_runtime::spawn_blocking(move || zoeydaw_project::open_project(Path::new(&path)))
    .await.map_err(|error| StorageError::new("internal", error.to_string(), None))?
}

#[tauri::command]
pub async fn save_project_file(
  path: String,
  manifest: Value,
  collect: bool,
  expected_commit_id: Option<String>,
  operation_id: String,
) -> StorageResult<SaveProjectReceipt> {
  let operation = SaveOperation::begin(operation_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    operation.save(Path::new(&path), manifest, collect, expected_commit_id.as_deref())
  }).await.map_err(|error| StorageError::new("internal", error.to_string(), None))?
}

#[tauri::command]
pub fn cancel_project_file(operation_id: String) -> StorageResult<()> {
  zoeydaw_project::cancel_project_operation(&operation_id)
}

#[tauri::command]
pub async fn relink_project_media(source: Value, path: String) -> StorageResult<MediaRecord> {
  tauri::async_runtime::spawn_blocking(move || {
    let original: MediaRecord = serde_json::from_value(source)
      .map_err(|error| StorageError::new("invalid-manifest", error.to_string(), None))?;
    zoeydaw_project::relink_media(original, Path::new(&path))
  }).await.map_err(|error| StorageError::new("internal", error.to_string(), None))?
}
