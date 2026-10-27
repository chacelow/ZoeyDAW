use super::TauriMainThread;
use super::plugin_devices::PluginDevices;
use crate::plugin_catalog::PluginCatalogState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use zoeydaw_engine::PlaybackService;
use zoeydaw_plugin_host::{device_session::PreparedDevice, state_store::PluginStateStore};

#[tauri::command(rename_all="camelCase")]
pub async fn plugin_device_seed(app: AppHandle, window: WebviewWindow, devices: State<'_,PluginDevices>, catalog: State<'_,PluginCatalogState>, service: State<'_,PlaybackService>, catalog_id: String, session_id: String, device_id: String) -> Result<Value,String> {
    devices.require_seed_owner(window.label(),&session_id,&device_id)?;
    let device=service.devices(&TauriMainThread(&app)).await?;
    let config=device.get("configuration").filter(|value|value.is_object()).ok_or("Select an audio device before inserting a plugin")?;
    let rate=config.get("sampleRate").and_then(Value::as_f64).ok_or("Missing sample rate")?;
    let quantum=config.get("bufferFrames").and_then(Value::as_u64).and_then(|value|u32::try_from(value).ok()).ok_or("Missing buffer size")?;
    let owner=window.label().to_owned();let devices=devices.inner().clone();
    let catalog=catalog.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let selection=catalog.select(&app,&catalog_id)?;
        let device=PreparedDevice::prepare(selection,rate,quantum,None)?;
        let state=device.control.snapshot()?;
        let parameters: Vec<_>=device.control.parameters()?.into_iter()
            .filter(|(info,_)|info.flags.automatable && !info.flags.read_only)
            .map(|(info,value)|json!({"id":info.id.to_string(),"normalized":value})).collect();
        if parameters.len()>4096 { return Err("Plugin parameter capacity exceeded".into()); }
        let directory=app.path().app_data_dir().map_err(|error|error.to_string())?.join("plugins/state");
        let store=PluginStateStore::new(directory)?;
        let reference=store.save(&state)?;
        let path=store.root().join(&reference.path);
        let format=match serde_json::to_value(device.info.format).map_err(|error|error.to_string())?.as_str() {
            Some("Clap")=>"clap",Some("Vst3")=>"vst3",Some("AudioUnit")=>"audioUnit",_=>return Err("Unsupported plugin format".into()),
        };
        let role=match serde_json::to_value(device.info.kind).map_err(|error|error.to_string())?.as_str() {
            Some("Effect")=>"effect",Some("Instrument")=>"instrument",_=>return Err("Unsupported plugin role".into()),
        };
        let seed=json!({"kind":"external","plugin":{"catalogId":catalog_id,"format":format,"classId":device.info.class_id,
            "name":device.info.name,"vendor":device.info.vendor,"version":device.info.version,"role":role},
            "stateRef":{"sha256":reference.sha256,"path":path},"parameters":parameters});
        devices.store_seed(&owner,&session_id,&device_id,catalog_id,reference.sha256,device)?;
        Ok(seed)
    }).await.map_err(|error|error.to_string())?
}

#[tauri::command(rename_all="camelCase")]
pub fn plugin_device_discard_seed(window:WebviewWindow,devices:State<'_,PluginDevices>,session_id:String,device_id:String) {
    devices.discard_seed(window.label(),&session_id,&device_id);
}
