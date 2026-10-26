pub mod realtime_probe;
pub mod realtime_stream;
pub mod plugin_devices;
pub mod plugin_seed;
pub mod plugin_controls;
pub mod plugin_editor;
use std::{collections::HashMap, path::Path, sync::{Arc, Mutex}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};
use zoeydaw_engine::{MainThreadDispatcher, PlaybackService, WaveformRangeRequest};

type RecordingFileKey = (String, String, String, String);

#[derive(Default)]
pub struct RecordingInspections(Arc<Mutex<HashMap<RecordingFileKey, (String, zoeydaw_media::MediaRecord)>>>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClosedRecordingResults {
    session_id: String,
    recordings: Vec<ClosedRecording>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClosedRecording {
    recording_id: String,
    session_id: String,
    source_bpm: f64,
    files: Vec<ClosedRecordingFile>,
    clips: Vec<RecordingPlacement>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClosedRecordingFile {
    file_id: String,
    path: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecordingPlacement {
    clip_id: String,
    file_id: String,
    track_id: String,
    start_bar: f64,
    duration_bars: f64,
    source_offset_bars: f64,
}

struct TauriMainThread<'a>(&'a AppHandle);

impl MainThreadDispatcher for TauriMainThread<'_> {
    fn dispatch(&self, action: impl FnOnce() + Send + 'static) -> Result<(), String> {
        self.0.run_on_main_thread(action).map_err(|error| error.to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn playback_acquire(service: State<'_, PlaybackService>, lease_id: String, session_id: String) -> Result<(), String> {
    service.acquire(lease_id, session_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_apply(app: AppHandle, window: tauri::WebviewWindow, service: State<'_, PlaybackService>, plugins: State<'_, plugin_devices::PluginDevices>, catalog: State<'_, crate::plugin_catalog::PluginCatalogState>, request: Value, lease_id: String, stop_token: u64) -> Result<Value, String> {
    plugins.apply(app, window.label().to_owned(), service.inner().clone(), catalog.inner().clone(), request, lease_id, stop_token).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_control(app: AppHandle, service: State<'_, PlaybackService>, request: Value, lease_id: String, stop_token: u64) -> Result<Value, String> {
    service.control(&TauriMainThread(&app), request, lease_id, stop_token).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_note(app: AppHandle, service: State<'_, PlaybackService>, request: Value, lease_id: String, stop_token: u64) -> Result<Value, String> {
    service.note(&TauriMainThread(&app), request, lease_id, stop_token).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_all_notes_off(app: AppHandle, service: State<'_, PlaybackService>, lease_id: String, session_id: String, through_sequence: u64) -> Result<(), String> {
    service.all_notes_off(&TauriMainThread(&app), lease_id, session_id, through_sequence).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_telemetry(app: AppHandle, service: State<'_, PlaybackService>, lease_id: String) -> Result<Value, String> {
    service.telemetry(&TauriMainThread(&app), lease_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn recording_results(app: AppHandle, service: State<'_, PlaybackService>, inspections: State<'_, RecordingInspections>, lease_id: String, session_id: String) -> Result<Value, String> {
    let result = service.recording_results(&TauriMainThread(&app), lease_id.clone(), session_id.clone()).await?;
    let closed: ClosedRecordingResults = serde_json::from_value(result).map_err(|error| error.to_string())?;
    if closed.session_id != session_id || closed.recordings.iter().any(|recording| recording.session_id != session_id) {
        return Err("Recording result session does not match its owner".into());
    }
    let cache = inspections.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = cache.lock().map_err(|_| "Recording inspection cache is unavailable".to_owned())?;
        let mut recordings = Vec::with_capacity(closed.recordings.len());
        for recording in closed.recordings {
            let mut sources = Vec::with_capacity(recording.files.len());
            for file in recording.files {
                let key = (lease_id.clone(), session_id.clone(), recording.recording_id.clone(), file.file_id.clone());
                let source = match cache.get(&key) {
                    Some((path, source)) if path == &file.path => source.clone(),
                    Some(_) => return Err("Recording file identity changed before acknowledgement".to_owned()),
                    None => {
                        let mut source = zoeydaw_media::inspect::<zoeydaw_media::NeverCancelled>(Path::new(&file.path), None)
                            .map_err(|error| error.message)?;
                        if source.frames == 0 {
                            return Err("Recorded audio contains no frames".to_owned());
                        }
                        source.id = file.file_id;
                        cache.insert(key, (file.path, source.clone()));
                        source
                    }
                };
                sources.push(source);
            }
            recordings.push(serde_json::json!({
                "recordingId": recording.recording_id,
                "sessionId": recording.session_id,
                "sourceBpm": recording.source_bpm,
                "sources": sources,
                "clips": recording.clips,
            }));
        }
        Ok(serde_json::json!({ "sessionId": session_id, "recordings": recordings }))
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn recording_ack(app: AppHandle, service: State<'_, PlaybackService>, inspections: State<'_, RecordingInspections>, lease_id: String, session_id: String, recording_id: String, accepted_revision: u64) -> Result<(), String> {
    service.recording_ack(&TauriMainThread(&app), lease_id.clone(), session_id.clone(), recording_id.clone(), accepted_revision).await?;
    inspections.0.lock().map_err(|_| "Recording inspection cache is unavailable".to_owned())?
        .retain(|(lease, session, recording, _), _| lease != &lease_id || session != &session_id || recording != &recording_id);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_release(app: AppHandle, service: State<'_, PlaybackService>, plugins: State<'_, plugin_devices::PluginDevices>, inspections: State<'_, RecordingInspections>, lease_id: String) -> Result<(), String> {
    plugins.close_lease(&lease_id);
    service.release(&TauriMainThread(&app), lease_id.clone()).await?;
    inspections.0.lock().map_err(|_| "Recording inspection cache is unavailable".to_owned())?
        .retain(|(lease, _, _, _), _| lease != &lease_id);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_stop(app: AppHandle, service: State<'_, PlaybackService>, lease_id: String, session_id: String, stop_token: u64) -> Result<(), String> {
    service.stop(&TauriMainThread(&app), lease_id, session_id, stop_token).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_audition(app: AppHandle, service: State<'_, PlaybackService>, request: Value) -> Result<Value, String> {
    service.audition(&TauriMainThread(&app), request).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_audition_stop(app: AppHandle, service: State<'_, PlaybackService>, generation: u64) -> Result<(), String> {
    service.audition_stop(&TauriMainThread(&app), generation).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_audition_seek(app: AppHandle, service: State<'_, PlaybackService>, generation: u64, normalized: f64) -> Result<(), String> {
    service.audition_seek(&TauriMainThread(&app), generation, normalized).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn playback_audition_status(app: AppHandle, service: State<'_, PlaybackService>, generation: u64) -> Result<Value, String> {
    service.audition_status(&TauriMainThread(&app), generation).await
}

#[tauri::command]
pub async fn playback_devices(app: AppHandle, service: State<'_, PlaybackService>) -> Result<Value, String> {
    service.devices(&TauriMainThread(&app)).await
}

#[tauri::command]
pub async fn playback_configure_device(app: AppHandle, service: State<'_, PlaybackService>, request: Value) -> Result<Value, String> {
    service.configure_device(&TauriMainThread(&app), request).await
}

#[tauri::command]
pub async fn playback_device_capabilities(app: AppHandle, service: State<'_, PlaybackService>, request: Value) -> Result<Value, String> {
    service.device_capabilities(&TauriMainThread(&app), request).await
}

#[tauri::command]
pub async fn playback_device_control_panel(app: AppHandle, service: State<'_, PlaybackService>) -> Result<Value, String> {
    service.device_control_panel(&TauriMainThread(&app)).await
}

#[tauri::command]
pub async fn playback_audition_reserve(service: State<'_, PlaybackService>) -> Result<u64, String> {
    service.reserve_audition()
}

#[tauri::command]
pub async fn playback_analyze_tempo(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || zoeydaw_engine::analyze_tempo(path))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn playback_waveform(service: State<'_, PlaybackService>, path: String, bins: u32) -> Result<Value, String> {
    let job = service.prepare_waveform(path, bins)?;
    tauri::async_runtime::spawn_blocking(move || job.execute()).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn playback_waveform_range(service: State<'_, PlaybackService>, request: WaveformRangeRequest) -> Result<Value, String> {
    let job = service.prepare_waveform_range(request)?;
    tauri::async_runtime::spawn_blocking(move || job.execute()).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn playback_waveform_range_cancel(service: State<'_, PlaybackService>) -> Result<(), String> {
    service.cancel_waveform_ranges()
}
