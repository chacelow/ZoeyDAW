use super::{plugin_devices::PluginDevices, TauriMainThread};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use zoeydaw_engine::PlaybackService;
use zoeydaw_plugin_host::{device_session::{ParameterEvent, ParameterInfo}, state_store::PluginStateStore};

#[derive(Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct ParameterEdit { id: String, normalized: f64 }

#[derive(Deserialize)]
#[serde(tag="kind", rename_all="camelCase", rename_all_fields="camelCase", deny_unknown_fields)]
pub enum EditorRequest {
    Open { parameters: Vec<ParameterEdit>, catalog_id: String, state_hash: Option<String> },
    Poll { instance: String },
    Commit { instance: String },
    Cancel { instance: String },
    Release { instance: String },
}

pub(super) fn parameter_json(parameters: Vec<(ParameterInfo, f64)>) -> Value {
    Value::Array(parameters.into_iter().map(|(info,value)|json!({
        "id":info.id.to_string(),"title":info.title,"units":info.units,"normalized":value,
        "defaultValue":info.default_value,"stepCount":info.step_count,"readOnly":info.flags.read_only,
        "automatable":info.flags.automatable,"hidden":info.flags.hidden
    })).collect())
}

#[tauri::command(rename_all="camelCase")]
pub async fn plugin_device_editor(app: AppHandle, window: WebviewWindow, devices: State<'_,PluginDevices>,
    service: State<'_,PlaybackService>, session_id: String, device_id: String, request: EditorRequest) -> Result<Value,String> {
    let control = match &request {
        EditorRequest::Open { catalog_id,state_hash,.. } => devices.editor_control(window.label(),&session_id,&device_id,catalog_id,state_hash.as_deref())?,
        _ => devices.control(window.label(),&session_id,&device_id)?,
    };
    let generation = control.instance_id();let instance = generation.to_string();
    match &request {
        EditorRequest::Open { parameters,.. } if parameters.len()<=4096 => {},
        EditorRequest::Open { .. } => return Err("Plugin parameter capacity exceeded".into()),
        EditorRequest::Poll { instance: expected } | EditorRequest::Commit { instance: expected } | EditorRequest::Cancel { instance: expected } | EditorRequest::Release { instance: expected }
            if expected==&instance => {},
        _ => return Err("Stale plugin editor instance".into()),
    }
    let opening = matches!(&request,EditorRequest::Open { .. });
    let ending = matches!(&request,EditorRequest::Commit { .. } | EditorRequest::Cancel { .. });
    if opening {
        service.plugin_editor_authority(&TauriMainThread(&app),session_id.clone(),device_id.clone(),control.native_context(),generation,true).await?;
    }
    let worker = control.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<Value,String> {
        match request {
            EditorRequest::Open { parameters,.. } => {
                let parameters = parameters.into_iter().map(|value|Ok((value.id.parse::<u64>().map_err(|error|error.to_string())?,value.normalized)))
                    .collect::<Result<Vec<_>,String>>()?;
                worker.begin_editor(generation,parameters)?;
                Ok(json!({"kind":"opened","parameters":parameter_json(worker.parameters()?)}))
            }
            EditorRequest::Poll { .. } => {
                let (open,batch) = worker.editor_events(generation)?;
                let resync = batch.resync_required || batch.events.iter().any(|event|!matches!(event,ParameterEvent::Value { .. } | ParameterEvent::BeginEdit { .. } | ParameterEvent::EndEdit { .. } | ParameterEvent::Dirty { .. }));
                let parameters = if resync { parameter_json(worker.parameters()?) } else { Value::Null };
                let events: Vec<_> = batch.events.into_iter().map(|event| match event {
                    ParameterEvent::Value { id,normalized } => json!({"kind":"value","id":id.to_string(),"normalized":normalized}),
                    ParameterEvent::BeginEdit { id } => json!({"kind":"begin","id":id.to_string()}),
                    ParameterEvent::EndEdit { id } => json!({"kind":"end","id":id.to_string()}),
                    ParameterEvent::MetadataChanged => json!({"kind":"metadata"}),
                    ParameterEvent::ValuesChanged => json!({"kind":"values"}),
                    ParameterEvent::Dirty { dirty } => json!({"kind":"dirty","dirty":dirty}),
                    _ => json!({"kind":"metadata"}),
                }).collect();
                Ok(json!({"kind":"events","open":open,"events":events,"parameters":parameters,"resyncRequired":batch.resync_required}))
            }
            EditorRequest::Commit { .. } => {
                let state = worker.end_editor(generation,true)?;
                let directory = app.path().app_data_dir().map_err(|error|error.to_string())?.join("plugins/state");
                let store = PluginStateStore::new(directory)?;
                let reference = store.save(&state)?;
                Ok(json!({"kind":"committed","stateRef":{"sha256":reference.sha256,"path":store.root().join(reference.path)},"parameters":parameter_json(worker.parameters()?)}))
            }
            EditorRequest::Cancel { .. } => {
                worker.end_editor(generation,false)?;
                Ok(json!({"kind":"cancelled"}))
            }
            EditorRequest::Release { .. } => {
                worker.release_editor(generation)?;
                Ok(json!({"kind":"released"}))
            }
        }
    }).await.map_err(|error|error.to_string())?;
    let current = devices.control(window.label(),&session_id,&device_id).is_ok_and(|value|value.instance_id().to_string()==instance);
    if !current || (opening && result.is_err()) {
        let old = control.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || old.end_editor(generation,false)).await;
    }
    if ending || !current || (opening && result.is_err()) {
        let released = service.plugin_editor_authority(&TauriMainThread(window.app_handle()),session_id,device_id,control.native_context(),generation,false).await;
        if current { released?; }
    }
    if !current { return Err("Stale plugin editor instance".into()); }
    let mut value = result?;
    value["instance"] = json!(instance);
    Ok(value)
}
