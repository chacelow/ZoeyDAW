use super::TauriMainThread;
use crate::plugin_catalog::PluginCatalogState;
use serde::Deserialize;
use serde_json::Value;
use std::{collections::HashMap, path::PathBuf, sync::{Arc, Mutex}};
use tauri::{AppHandle, Manager};
use zoeydaw_engine::PlaybackService;
use zoeydaw_plugin_abi::{PreparedFormat, PreparedPlugin};
use zoeydaw_plugin_host::{device_session::{DeviceControl, PreparedDevice}, state_store::{PluginStateRef, PluginStateStore}};

type Key = (String, String, String);
struct ActiveDevice {
    control: DeviceControl,
    parameters: HashMap<u64, u32>,
}
#[derive(Default)]
struct Registry {
    controls: HashMap<Key, ActiveDevice>,
    owners: HashMap<String, String>,
    closed: std::collections::HashSet<String>,
}
#[derive(Clone, Default)]
pub struct PluginDevices(Arc<Mutex<Registry>>);

#[derive(Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
struct Plan {
    device_ids: Vec<String>,
    sample_rate: Option<f64>,
    quantum: Option<u32>,
}

impl PluginDevices {
    pub(crate) fn control(&self, window: &str, session: &str, device: &str) -> Result<DeviceControl,String> {
        let registry=self.0.lock().map_err(|_|"Plugin device owner unavailable")?;
        let mut matches=registry.controls.iter().filter(|((lease,owner,id),_)| {
            owner==session && id==device && registry.owners.get(lease).is_some_and(|value|value==window)
        });
        let control=matches.next().ok_or("Plugin device is not ready")?.1.control.clone();
        if matches.next().is_some() { return Err("Ambiguous plugin device owner".into()); }
        Ok(control)
    }
    pub fn close_lease(&self, lease: &str) {
        if let Ok(mut registry)=self.0.lock() {
            registry.closed.insert(lease.to_owned());
            registry.controls.retain(|(owner,_,_),_|owner!=lease);
            registry.owners.remove(lease);
        }
    }
    pub fn close_window(&self, window: &str) -> Vec<String> {
        let Ok(mut registry)=self.0.lock() else { return Vec::new() };
        let leases: Vec<_>=registry.owners.iter().filter(|(_,owner)|owner.as_str()==window).map(|(lease,_)|lease.clone()).collect();
        for lease in &leases {
            registry.closed.insert(lease.clone());registry.owners.remove(lease);
            registry.controls.retain(|(owner,_,_),_|owner!=lease);
        }
        leases
    }
    fn claim(&self, window: &str, lease: &str) -> Result<(),String> {
        let mut registry=self.0.lock().map_err(|_|"Plugin device owner unavailable")?;
        if registry.closed.contains(lease) { return Err("Plugin device lease closed".into()); }
        if let Some(owner)=registry.owners.get(lease) {
            if owner!=window { return Err("Plugin device window owner mismatch".into()); }
        } else { registry.owners.insert(lease.to_owned(),window.to_owned()); }
        Ok(())
    }
    pub async fn apply(&self, app: AppHandle, window: String, service: PlaybackService, catalog: PluginCatalogState,
        request: Value, lease: String, stop_token: u64) -> Result<Value,String> {
        self.claim(&window,&lease)?;
        let session=request.get("sessionId").and_then(Value::as_str).ok_or("Invalid plugin session")?.to_owned();
        let plan: Plan=serde_json::from_value(service.plugin_prepare_plan(&TauriMainThread(&app),request.clone(),lease.clone()).await?)
            .map_err(|error|error.to_string())?;
        if plan.device_ids.len()>256 { return Err("Plugin preparation capacity exceeded".into()); }
        let mut prepared=Vec::new();
        let mut controls=Vec::new();
        if !plan.device_ids.is_empty() {
            let rate=plan.sample_rate.ok_or("Missing plugin sample rate")?;
            let quantum=plan.quantum.ok_or("Missing plugin quantum")?;
            let app_worker=app.clone();let request_worker=request.clone();
            let devices=self.clone();let worker_window=window.clone();let worker_lease=lease.clone();
            let result=tauri::async_runtime::spawn_blocking(move || -> Result<_,String> {
                let mut result=Vec::new();
                for id in plan.device_ids {
                    devices.claim(&worker_window,&worker_lease)?;
                    let authored=find_device(&request_worker,&id)?;
                    let plugin=authored.get("plugin").ok_or("Missing plugin identity")?;
                    let catalog_id=plugin.get("catalogId").and_then(Value::as_str).ok_or("Missing catalog identity")?;
                    let selection=catalog.select(&app_worker,catalog_id)?;
                    let identity=selection.identity();
                    let actual_format=serde_json::to_value(identity.format).map_err(|error|error.to_string())?;
                    let expected_format=match plugin.get("format").and_then(Value::as_str) {
                        Some("clap")=>"Clap",Some("vst3")=>"Vst3",Some("audioUnit")=>"AudioUnit",_=>return Err("Invalid plugin format".into()),
                    };
                    if actual_format.as_str()!=Some(expected_format) || plugin.get("classId").and_then(Value::as_str)!=Some(identity.class_id.as_str()) {
                        return Err("Authorized plugin identity differs from project".into());
                    }
                    let state=match authored.get("stateRef") {
                        Some(Value::Null)=>None,
                        Some(value)=> {
                            let reference: PluginStateRef=serde_json::from_value(value.clone()).map_err(|error|error.to_string())?;
                            let path=PathBuf::from(&reference.path);
                            if !path.is_absolute() { return Err("Plugin state must have a resolved absolute path".into()); }
                            let parent=path.parent().ok_or("Missing plugin state directory")?;
                            if !parent.is_dir() { return Err("Plugin state directory is unavailable".into()); }
                            let store=PluginStateStore::new(parent.to_owned())?;
                            let basename=path.file_name().and_then(|value|value.to_str()).ok_or("Invalid plugin state filename")?;
                            Some(store.load(&PluginStateRef{sha256:reference.sha256,path:basename.into()},identity.format,&identity.class_id)?)
                        }
                        None=>return Err("Missing plugin state reference".into()),
                    };
                    let device=PreparedDevice::prepare(selection,rate,quantum,state)?;
                    devices.claim(&worker_window,&worker_lease)?;
                    result.push((id,device));
                }
                Ok(result)
            }).await.map_err(|error|error.to_string())??;
            for (id,device) in result {
                let format=PreparedFormat{sample_rate:device.sample_rate,quantum:device.quantum,input_channels:device.input_channels,
                    output_channels:device.output_channels,latency_frames:device.latency_frames};
                let parameters=device.parameters.iter().filter(|info|info.flags.automatable && !info.flags.read_only).map(|info|(info.id,info.step_count)).collect();
                controls.push((id.clone(),ActiveDevice { control:device.control,parameters }));
                prepared.push(PreparedPlugin{device_id:id,format,processor:device.audio.into_pending()});
            }
        }
        self.claim(&window,&lease)?;
        {
            let registry=self.0.lock().map_err(|_|"Plugin device owner unavailable")?;
            for track in request.pointer("/state/project/tracks").and_then(Value::as_array).into_iter().flatten() {
                for device in track.get("devices").and_then(Value::as_array).into_iter().flatten() {
                    if device.get("kind").and_then(Value::as_str)!=Some("external") { continue; }
                    let id=device.get("id").and_then(Value::as_str).ok_or("Missing device ID")?;
                    let active=controls.iter().find(|(candidate,_)|candidate==id).map(|(_,active)|active)
                        .or_else(||registry.controls.get(&(lease.clone(),session.clone(),id.to_owned())))
                        .ok_or("External device is not prepared")?;
                    for parameter in device.get("parameters").and_then(Value::as_array).ok_or("Missing parameters")? {
                        let parameter_id=parameter.get("id").and_then(Value::as_str).ok_or("Invalid parameter ID")?.parse::<u64>().map_err(|error|error.to_string())?;
                        let steps=active.parameters.get(&parameter_id).ok_or("Unknown, read-only or non-automatable plugin parameter")?;
                        let value=parameter.get("normalized").and_then(Value::as_f64).ok_or("Invalid parameter value")?;
                        if *steps>0 && (value*f64::from(*steps)-(value*f64::from(*steps)).round()).abs()>1e-7 {
                            return Err("Plugin discrete parameter is between steps".into());
                        }
                    }
                }
            }
        }
        let result=service.apply_prepared(&TauriMainThread(&app),request.clone(),lease.clone(),stop_token,prepared).await?;
        if result.get("kind").and_then(Value::as_str)==Some("accepted") {
            let mut registry=self.0.lock().map_err(|_|"Plugin device owner unavailable")?;
            if registry.closed.contains(&lease) { return Err("Plugin device lease closed".into()); }
            registry.controls.retain(|(owner,existing_session,id),_|owner!=&lease || (existing_session==&session && find_device(&request,id).is_ok()));
            for (id,control) in controls { registry.controls.insert((lease.clone(),session.clone(),id),control); }
        }
        Ok(result)
    }
}

fn find_device<'a>(request: &'a Value, id: &str) -> Result<&'a Value,String> {
    request.pointer("/state/project/tracks").and_then(Value::as_array).into_iter().flatten()
        .flat_map(|track|track.get("devices").and_then(Value::as_array).into_iter().flatten())
        .find(|device|device.get("id").and_then(Value::as_str)==Some(id) && device.get("kind").and_then(Value::as_str)==Some("external"))
        .ok_or_else(||"External device disappeared from request".into())
}

pub fn release_window(app: AppHandle, leases: Vec<String>) {
    tauri::async_runtime::spawn(async move {
        let service=app.state::<PlaybackService>();
        for lease in leases { let _=service.release(&TauriMainThread(&app),lease).await; }
    });
}
