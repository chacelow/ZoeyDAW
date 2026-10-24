use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use zoeydaw_plugin_host::{
    CatalogEntry, PluginCatalog, ScanReport, scan_operation::ScanOperations,
};

#[derive(Clone, Default)]
pub struct PluginCatalogState {
    catalog: Arc<Mutex<Option<PluginCatalog>>>,
    operations: ScanOperations,
}

impl PluginCatalogState {
    pub fn close_window(&self, owner: &str) {
        self.operations.close_owner(owner);
    }
    pub(crate) fn select(&self, app: &AppHandle, id: &str) -> Result<zoeydaw_plugin_host::PluginSelection, String> {
        let mut catalog=self.catalog.lock().map_err(|_| "Plugin catalog unavailable")?;
        if catalog.is_none() {
            let (helper,cache)=paths(app)?;
            *catalog=Some(PluginCatalog::new(helper,cache)?);
        }
        catalog.as_ref().ok_or("Plugin catalog unavailable")?.select(id)
    }
}

fn paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let root = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugin-helper")
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("plugin-helper")
    };
    let helper = root.join(if cfg!(target_os = "macos") {
        "ZoeydawPluginHelper.app/Contents/MacOS/zoeydaw-plugin-helper"
    } else {
        "zoeydaw-plugin-helper.exe"
    });
    let cache = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins/catalog.json");
    Ok((helper, cache))
}

#[tauri::command]
pub async fn plugin_catalog_entries(
    app: AppHandle,
    state: State<'_, PluginCatalogState>,
) -> Result<Vec<CatalogEntry>, String> {
    let state = state.inner().clone();
    let (helper, cache) = paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut catalog = state
            .catalog
            .lock()
            .map_err(|_| "Plugin catalog unavailable")?;
        if catalog.is_none() {
            *catalog = Some(PluginCatalog::new(helper, cache)?);
        }
        Ok(catalog.as_ref().ok_or("Plugin catalog unavailable")?.entries())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub fn plugin_catalog_reserve(
    window: WebviewWindow,
    state: State<'_, PluginCatalogState>,
    operation_id: String,
) -> Result<(), String> {
    state
        .operations
        .reserve(window.label().to_owned(), operation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn plugin_catalog_scan(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, PluginCatalogState>,
    operation_id: String,
    directories: Vec<PathBuf>,
    audio_units: Vec<String>,
) -> Result<ScanReport, String> {
    let lease = state
        .operations
        .begin(window.label().to_owned(), operation_id)?;
    if directories.len() > 64 || audio_units.len() > 4096 {
        return Err("Plugin scan selection exceeds capacity".into());
    }
    let (helper, cache) = paths(&app)?;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let lease = lease;
        let mut catalog = state
            .catalog
            .lock()
            .map_err(|_| "Plugin catalog unavailable")?;
        if catalog.is_none() {
            *catalog = Some(PluginCatalog::new(helper, cache)?);
        }
        catalog.as_mut().ok_or("Plugin catalog unavailable")?.scan(
            &directories,
            &audio_units,
            &lease,
            &|_| {},
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub fn plugin_catalog_cancel(
    window: WebviewWindow,
    state: State<'_, PluginCatalogState>,
    operation_id: String,
) -> Result<(), String> {
    state.operations.cancel(window.label(), &operation_id)
}
