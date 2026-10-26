use super::plugin_devices::PluginDevices;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State, WebviewWindow};

#[tauri::command(rename_all="camelCase")]
pub async fn plugin_device_parameters(window: WebviewWindow, devices: State<'_,PluginDevices>, session_id: String, device_id: String) -> Result<Value,String> {
    let control=devices.control(window.label(),&session_id,&device_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let parameters=control.parameters()?;
        Ok(super::plugin_editor::parameter_json(parameters))
    }).await.map_err(|error|error.to_string())?
}

#[tauri::command(rename_all="camelCase")]
pub async fn plugin_device_snapshot(app: AppHandle, window: WebviewWindow, devices: State<'_,PluginDevices>, session_id: String, device_id: String) -> Result<Value,String> {
    let control=devices.control(window.label(),&session_id,&device_id)?;
    let directory=app.path().app_data_dir().map_err(|error|error.to_string())?.join("plugins/state");
    tauri::async_runtime::spawn_blocking(move || {
        let state=control.snapshot()?;
        let store=zoeydaw_plugin_host::state_store::PluginStateStore::new(directory)?;
        let reference=store.save(&state)?;
        Ok(json!({"sha256":reference.sha256,"path":store.root().join(reference.path)}))
    }).await.map_err(|error|error.to_string())?
}
