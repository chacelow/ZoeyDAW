use std::path::Path;

use zoeydaw_project::atomic_file::write_atomically;

#[tauri::command]
pub async fn write_file_atomically(request: tauri::ipc::Request<'_>) -> Result<(), String> {
  // Tauri 2 raw body: JS 侧走 `invoke("write_file_atomically", bytes, { headers: { path } })`
  // 直传 ArrayBuffer, 避免 Vec<u8> 走 JSON 序列化 (几 MB bundle 用 JSON 会阻塞主线程).
  let path_encoded = request
    .headers()
    .get("path")
    .and_then(|value| value.to_str().ok())
    .ok_or_else(|| "missing `path` header".to_string())?
    .to_string();
  let path = urlencoding::decode(&path_encoded)
    .map_err(|error| format!("invalid path header: {error}"))?
    .into_owned();
  let bytes = match request.body() {
    tauri::ipc::InvokeBody::Raw(raw) => raw.clone(),
    _ => return Err("expected raw body".into()),
  };
  tauri::async_runtime::spawn_blocking(move || write_atomically(Path::new(&path), &bytes))
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}
