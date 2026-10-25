use super::{plugin_devices::PluginDevices, TauriMainThread};
use tauri::{AppHandle, State, WebviewWindow};
use zoeydaw_engine::{
    realtime::metadata_generated::{MeterInterest, RealtimeRegistry, RealtimeStreamOpenResult},
    PlaybackService,
};

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_stream_open(
    app: AppHandle,
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    owners: State<'_, PluginDevices>,
    lease_id: String,
    session_id: String,
    events: tauri::ipc::Channel<Vec<zoeydaw_engine::realtime::metadata_generated::RealtimeEvent>>,
) -> Result<RealtimeStreamOpenResult, String> {
    owners.require_owner(window.label(), &lease_id)?;
    service
        .refresh_meter_hub(&TauriMainThread(&app), lease_id.clone(), session_id.clone())
        .await?;
    owners.require_owner(window.label(), &lease_id)?;
    let worker_service = service.inner().clone();
    let worker_window = window.label().to_owned();
    let worker_owners = owners.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        worker_owners.require_owner(&worker_window, &lease_id)?;
        let opened = worker_service.open_meter_stream(&worker_window, &lease_id, &session_id)?;
        if let Err(error) = worker_owners.require_owner(&worker_window, &lease_id) {
            worker_service.close_meter_stream(&worker_window, opened.stream_id)?;
            return Err(error);
        }
        if let Err(error) = worker_service.bind_meter_events(
            &worker_window,
            opened.stream_id,
            std::sync::Arc::new(move |batch| events.send(batch).map_err(|error| error.to_string())),
        ) {
            worker_service.close_meter_stream(&worker_window, opened.stream_id)?;
            return Err(error);
        }
        Ok(opened)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_stream_registry(
    app: AppHandle,
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    stream_id: u32,
) -> Result<Option<RealtimeRegistry>, String> {
    service
        .refresh_meter_stream_registry(&TauriMainThread(&app), window.label(), stream_id)
        .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_clock_probe(
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    stream_id: u32,
) -> Result<Option<zoeydaw_engine::realtime::metadata_generated::ClockProbe>, String> {
    let service = service.inner().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        service.meter_stream_clock_probe(&owner, stream_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub fn playback_meter_interest(
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    interest: MeterInterest,
) -> Result<(), String> {
    service.set_meter_interest(window.label(), interest)
}

#[tauri::command(rename_all = "camelCase")]
pub fn playback_stream_close(
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    stream_id: u32,
) -> Result<(), String> {
    service.close_meter_stream(window.label(), stream_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_meter_snapshot(
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    stream_id: u32,
    after_seq: zoeydaw_engine::realtime::metadata_generated::JsonU64,
) -> Result<tauri::ipc::Response, String> {
    let service = service.inner().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        service
            .meter_stream_snapshot(&owner, stream_id, after_seq.0)
            .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub fn playback_event_receipt(
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    stream_id: u32,
    through_seq: zoeydaw_engine::realtime::metadata_generated::JsonU64,
) -> Result<(), String> {
    service.meter_event_receipt(window.label(), stream_id, through_seq.0)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_meter_reset(
    window: WebviewWindow,
    service: State<'_, PlaybackService>,
    stream_id: u32,
    endpoint_ids: Vec<String>,
    reset: zoeydaw_engine::realtime::metadata_generated::MeterResetKind,
) -> Result<zoeydaw_engine::realtime::metadata_generated::MeterResetBaseline, String> {
    service
        .reset_meter_stream(window.label(), stream_id, endpoint_ids, reset)
        .await
}
