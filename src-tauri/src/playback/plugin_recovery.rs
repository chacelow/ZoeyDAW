use super::{plugin_devices::PluginDevices,TauriMainThread};
use crate::plugin_catalog::PluginCatalogState;
use serde::{Deserialize,Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle,State,WebviewWindow};
use zoeydaw_engine::{PlaybackService,realtime::{PluginFaultReport,metadata_generated::PluginFaultKind}};
use zoeydaw_plugin_host::{device_session::{DeviceFault,DeviceFaultKind,DeviceHealth},state_store::{PluginStateRef,PluginStateStore}};

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct PluginFaultStatus {
    pub session_id:String,
    pub track_id:String,
    pub device_id:String,
    pub instance_id:String,
    pub helper_process_id:u32,
    #[serde(flatten)]
    pub fault:DeviceFault,
}
impl PluginFaultStatus {
    pub fn report(&self) -> PluginFaultReport {
        PluginFaultReport {
            session_id:self.session_id.clone(),track_id:self.track_id.clone(),device_id:self.device_id.clone(),
            fault_id:format!("{}:{}:{}",self.device_id,self.instance_id,self.fault.code),
            fault:match self.fault.kind {
                DeviceFaultKind::Crash=>PluginFaultKind::Crash,DeviceFaultKind::Hang=>PluginFaultKind::Hang,
                DeviceFaultKind::ResyncRequired=>PluginFaultKind::ResyncRequired,DeviceFaultKind::ProcessingFailed=>PluginFaultKind::ProcessingFailed,
            },code:self.fault.code.clone(),message:self.fault.message.clone(),recoverable:self.fault.recoverable,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Parameter { id:String,normalized:f64 }
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct RecoveryPlan {
    catalog_id:String,
    format:String,
    class_id:String,
    state_ref:Option<PluginStateRef>,
    parameters:Vec<Parameter>,
}

#[tauri::command(rename_all="camelCase")]
pub async fn plugin_device_recover(app:AppHandle,window:WebviewWindow,devices:State<'_,PluginDevices>,
    service:State<'_,PlaybackService>,catalog:State<'_,PluginCatalogState>,session_id:String,device_id:String,instance_id:String) -> Result<Value,String> {
    let control=devices.control(window.label(),&session_id,&device_id)?;
    let expected=instance_id.parse::<u64>().map_err(|_|"Invalid plugin recovery instance")?;
    if expected.to_string()!=instance_id || control.instance_id()!=expected { return Err("Stale plugin recovery instance".into()); }
    let plan:RecoveryPlan=serde_json::from_value(service.plugin_recovery_plan(&TauriMainThread(&app),session_id.clone(),device_id.clone(),control.native_context()).await?)
        .map_err(|error|error.to_string())?;
    devices.editor_control(window.label(),&session_id,&device_id,&plan.catalog_id,plan.state_ref.as_ref().map(|value|value.sha256.as_str()))?;
    let catalog=catalog.inner().clone();let worker=control.clone();let worker_app=app.clone();
    let result=tauri::async_runtime::spawn_blocking(move || -> Result<DeviceHealth,String> {
        let selection=catalog.select(&worker_app,&plan.catalog_id)?;
        let identity=selection.identity();
        let actual=serde_json::to_value(identity.format).map_err(|error|error.to_string())?;
        let expected_format=match plan.format.as_str() { "clap"=>"Clap","vst3"=>"Vst3","audioUnit"=>"AudioUnit",_=>return Err("Invalid plugin recovery format".into()) };
        if actual.as_str()!=Some(expected_format) || identity.class_id!=plan.class_id { return Err("Authorized recovery plugin identity changed".into()); }
        let state=if let Some(reference)=plan.state_ref {
            let path=PathBuf::from(&reference.path);
            if !path.is_absolute() { return Err("Plugin recovery state must have an absolute path".into()); }
            let file=path.file_name().and_then(|value|value.to_str()).ok_or("Invalid state filename")?;
            let parent=path.parent().ok_or("Missing state directory")?;
            if !parent.is_dir() { return Err("Plugin recovery state directory is unavailable".into()); }
            let store=PluginStateStore::new(parent.to_owned())?;
            Some(store.load(&PluginStateRef { sha256:reference.sha256,path:file.into() },identity.format,&identity.class_id)?)
        } else { None };
        let parameters=plan.parameters.into_iter().map(|value|Ok((value.id.parse::<u64>().map_err(|error|error.to_string())?,value.normalized))).collect::<Result<Vec<_>,String>>()?;
        worker.recover(expected,state,parameters)
    }).await.map_err(|error|error.to_string())?;
    let current=devices.control(window.label(),&session_id,&device_id).is_ok_and(|value|match &result {
        Ok(health)=>value.instance_id()==health.instance_id,Err(_)=>value.instance_id()==expected,
    });
    let release=service.plugin_editor_authority(&TauriMainThread(&app),session_id,device_id,control.native_context(),expected,false).await;
    if !current { return Err("Plugin recovery owner changed".into()); }
    release?;
    serde_json::to_value(result?).map_err(|error|error.to_string())
}
