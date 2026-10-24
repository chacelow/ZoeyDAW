use super::plugin_devices::PluginDevices;
use serde_json::{json, Value};
use tauri::{State, WebviewWindow};

#[tauri::command(rename_all="camelCase")]
pub async fn plugin_device_parameters(window: WebviewWindow, devices: State<'_,PluginDevices>, session_id: String, device_id: String) -> Result<Value,String> {
    let control=devices.control(window.label(),&session_id,&device_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let parameters=control.parameters()?;
        Ok(Value::Array(parameters.into_iter().map(|(info,value)|json!({
            "id":info.id.to_string(),"title":info.title,"units":info.units,"normalized":value,
            "defaultValue":info.default_value,"stepCount":info.step_count,"readOnly":info.flags.read_only,
            "automatable":info.flags.automatable,"hidden":info.flags.hidden
        })).collect()))
    }).await.map_err(|error|error.to_string())?
}
