use std::path::PathBuf;

use zoeydaw_browser::{BrowserCatalog, BrowserError, BrowserRoots, BrowserTreePage, CatalogResult};

async fn blocking<T: Send + 'static>(
  action: impl FnOnce() -> CatalogResult<T> + Send + 'static,
) -> CatalogResult<T> {
  tauri::async_runtime::spawn_blocking(action).await
    .map_err(|error| BrowserError::new("internal", error.to_string(), None))?
}

#[tauri::command]
pub async fn browser_roots(state: tauri::State<'_, BrowserCatalog>) -> CatalogResult<BrowserRoots> {
  let catalog = state.inner().clone();
  blocking(move || catalog.roots()).await
}

#[tauri::command]
pub async fn browser_add_root(
  state: tauri::State<'_, BrowserCatalog>,
  path: String,
  operation_id: String,
) -> CatalogResult<BrowserRoots> {
  let catalog = state.inner().clone();
  blocking(move || catalog.add_root(PathBuf::from(path), operation_id)).await
}

#[tauri::command]
pub async fn browser_refresh_root(
  state: tauri::State<'_, BrowserCatalog>,
  root_id: String,
  operation_id: String,
) -> CatalogResult<BrowserRoots> {
  let catalog = state.inner().clone();
  blocking(move || catalog.refresh_root(&root_id, operation_id)).await
}

#[tauri::command]
pub async fn browser_cancel_scan(
  state: tauri::State<'_, BrowserCatalog>,
  operation_id: String,
) -> CatalogResult<()> {
  let catalog = state.inner().clone();
  blocking(move || catalog.cancel_scan(&operation_id)).await
}

#[tauri::command]
pub async fn browser_remove_root(
  state: tauri::State<'_, BrowserCatalog>,
  root_id: String,
) -> CatalogResult<BrowserRoots> {
  let catalog = state.inner().clone();
  blocking(move || catalog.remove_root(&root_id)).await
}

#[tauri::command]
pub async fn browser_tree(
  state: tauri::State<'_, BrowserCatalog>,
  root_id: Option<String>,
  query: String,
  expanded: Vec<String>,
  offset: usize,
  limit: Option<usize>,
  request_id: String,
) -> CatalogResult<BrowserTreePage> {
  let catalog = state.inner().clone();
  blocking(move || catalog.tree(root_id.as_deref(), &query, &expanded, offset, limit, request_id)).await
}
