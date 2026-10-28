use super::super::TauriMainThread;
use super::{ActiveDevice, Key, PluginDevices};
use crate::plugin_catalog::PluginCatalogState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;
use zoeydaw_engine::PlaybackService;
use zoeydaw_plugin_abi::{PreparedFormat, PreparedPlugin};
use zoeydaw_plugin_host::device_session::PreparedDevice;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum ConfigurationPlan {
    Direct,
    Plugins(PluginConfigurationPlan),
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginConfigurationPlan {
    session_id: String,
    revision: u64,
    sequence: u64,
    previous_configuration: Value,
    device_generation: String,
    observed: bool,
    sample_rate: f64,
    quantum: u32,
    devices: Vec<DevicePlan>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DevicePlan {
    device_id: String,
    catalog_id: String,
    context: String,
    parameters: Vec<Parameter>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Parameter {
    id: String,
    normalized: f64,
}
struct Candidate {
    key: Key,
    instance: u64,
    previous_context: usize,
    active: ActiveDevice,
    prepared: PreparedPlugin,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ObservedConfigurationPlan {
    request: Value,
    plan: ConfigurationPlan,
}

impl PluginDevices {
    pub(crate) async fn reconcile_configuration(
        &self,
        app: AppHandle,
        window: String,
        lease: &str,
        service: PlaybackService,
        catalog: PluginCatalogState,
    ) -> Result<Option<Value>, String> {
        let Ok(_update) = self.1.try_lock() else {
            return Ok(None);
        };
        self.require_owner(&window, lease)?;
        {
            let registry = self.0.lock().map_err(|_| "Plugin device owner unavailable")?;
            if !registry.controls.keys().any(|(owner, _, _)| owner == lease) {
                return Ok(None);
            }
        }
        let observed = service
            .device_recovery_plan(&TauriMainThread(&app), lease.to_owned())
            .await?;
        if observed.is_null() {
            self.0.lock().map_err(|_| "Plugin device owner unavailable")?
                .configuration_failures.remove(lease);
            return Ok(None);
        }
        {
            let registry = self.0.lock().map_err(|_| "Plugin device owner unavailable")?;
            if let Some((previous, message)) = registry.configuration_failures.get(lease) {
                if previous == &observed {
                    return Err(message.clone());
                }
            }
        }
        let request: ObservedConfigurationPlan = serde_json::from_value(observed.clone())
            .map_err(|error| error.to_string())?;
        let ConfigurationPlan::Plugins(plan) = request.plan else {
            return Err("Invalid observed configuration plan".into());
        };
        if !plan.observed {
            return Err("Expected externally changed audio configuration".into());
        }
        let result = self
            .configure_plugins(app, window.clone(), service, catalog, request.request, plan)
            .await;
        self.require_owner(&window, lease)?;
        let mut registry = self.0.lock().map_err(|_| "Plugin device owner unavailable")?;
        match result {
            Ok(device) => {
                registry.configuration_failures.remove(lease);
                Ok(Some(device))
            }
            Err(error) => {
                registry.configuration_failures.insert(lease.to_owned(), (observed, error.clone()));
                Err(error)
            }
        }
    }

    pub async fn configure(
        &self,
        app: AppHandle,
        window: String,
        service: PlaybackService,
        catalog: PluginCatalogState,
        request: Value,
    ) -> Result<Value, String> {
        let _update = self.begin_audio_update().await;
        let plan: ConfigurationPlan = serde_json::from_value(
            service
                .configuration_plan(&TauriMainThread(&app), request.clone())
                .await?,
        )
        .map_err(|error| error.to_string())?;
        let result = match plan {
            ConfigurationPlan::Direct => service.configure_device(&TauriMainThread(&app), request).await,
            ConfigurationPlan::Plugins(plan) => {
                self.configure_plugins(app, window, service, catalog, request, plan).await
            }
        };
        if result.is_ok() {
            self.0.lock().map_err(|_| "Plugin device owner unavailable")?
                .configuration_failures.clear();
        }
        result
    }

    async fn configure_plugins(
        &self,
        app: AppHandle,
        window: String,
        service: PlaybackService,
        catalog: PluginCatalogState,
        request: Value,
        plan: PluginConfigurationPlan,
    ) -> Result<Value, String> {
        if plan.devices.is_empty() || plan.devices.len() > 256 {
            return Err("Invalid plugin configuration capacity".into());
        }
        let mut plan_json = serde_json::to_value(&plan).map_err(|error| error.to_string())?;
        plan_json["kind"] = json!("plugins");
        let session = plan.session_id.clone();
        let devices = self.clone();
        let worker_window = window.clone();
        let worker_app = app.clone();
        let candidates =
            tauri::async_runtime::spawn_blocking(move || -> Result<Vec<Candidate>, String> {
                let mut candidates = Vec::with_capacity(plan.devices.len());
                for row in plan.devices {
                    let context = row
                        .context
                        .parse::<usize>()
                        .map_err(|error| error.to_string())?;
                    let (key, control, state_hash, track_id) = {
                        let registry = devices
                            .0
                            .lock()
                            .map_err(|_| "Plugin device owner unavailable")?;
                        let (key, active) = registry
                            .controls
                            .iter()
                            .find(|((lease, owner, id), active)| {
                                owner == &plan.session_id
                                    && id == &row.device_id
                                    && active.catalog_id == row.catalog_id
                                    && active.control.native_context() == context
                                    && !registry.closed.contains(lease)
                                    && registry.owners.get(lease) == Some(&worker_window)
                            })
                            .ok_or("Plugin configuration owner changed")?;
                        (
                            key.clone(),
                            active.control.clone(),
                            active.state_hash.clone(),
                            active.track_id.clone(),
                        )
                    };
                    let instance = control.instance_id();
                    if control.editor_open()? {
                        return Err(
                            "Close and apply plugin editors before changing audio format".into(),
                        );
                    }
                    let state = control.snapshot()?;
                    let selection = catalog.select(&worker_app, &row.catalog_id)?;
                    let device = PreparedDevice::prepare(
                        selection,
                        plan.sample_rate,
                        plan.quantum,
                        Some(state),
                    )?;
                    for parameter in row.parameters {
                        let id = parameter
                            .id
                            .parse::<u64>()
                            .map_err(|error| error.to_string())?;
                        // Range and hosting flags are the contract; a float32 host never
                        // returns values that land exactly on a 1e-7 step multiple.
                        let _ = device
                            .parameters
                            .iter()
                            .find(|info| {
                                info.id == id && info.flags.automatable && !info.flags.read_only
                            })
                            .ok_or("Plugin parameter schema changed with audio format")?;
                        if !parameter.normalized.is_finite()
                            || !(0.0..=1.0).contains(&parameter.normalized)
                        {
                            return Err("Plugin parameter value changed with audio format".into());
                        }
                        device.control.set_parameter(id, parameter.normalized)?;
                    }
                    let format = PreparedFormat {
                        sample_rate: device.sample_rate,
                        quantum: device.quantum,
                        input_channels: device.input_channels,
                        output_channels: device.output_channels,
                        latency_frames: device.latency_frames,
                    };
                    let parameters = device
                        .parameters
                        .iter()
                        .filter(|info| info.flags.automatable && !info.flags.read_only)
                        .map(|info| (info.id, info.step_count))
                        .collect();
                    let active = ActiveDevice {
                        control: device.control,
                        parameters,
                        catalog_id: row.catalog_id,
                        state_hash,
                        track_id,
                    };
                    candidates.push(Candidate {
                        key,
                        instance,
                        previous_context: context,
                        active,
                        prepared: PreparedPlugin {
                            device_id: row.device_id,
                            format,
                            processor: device.audio.into_pending(),
                        },
                    });
                }
                Ok(candidates)
            })
            .await
            .map_err(|error| error.to_string())??;
        let lease = candidates
            .first()
            .ok_or("Missing prepared configuration")?
            .key
            .0
            .clone();
        self.require_owner(&window, &lease)?;
        {
            let registry = self
                .0
                .lock()
                .map_err(|_| "Plugin device owner unavailable")?;
            for candidate in &candidates {
                let active = registry
                    .controls
                    .get(&candidate.key)
                    .ok_or("Plugin configuration owner changed")?;
                if candidate.key.0 != lease
                    || active.control.native_context() != candidate.previous_context
                    || active.control.instance_id() != candidate.instance
                {
                    return Err("Plugin configuration instance changed".into());
                }
            }
        }
        let mut prepared = Vec::with_capacity(candidates.len());
        let mut controls = Vec::with_capacity(candidates.len());
        for candidate in candidates {
            prepared.push(candidate.prepared);
            controls.push((candidate.key, candidate.active));
        }
        let payload =
            json!({"request":request,"plan":plan_json,"leaseId":lease,"sessionId":session});
        let result = service
            .configure_device_prepared(&TauriMainThread(&app), payload, prepared)
            .await?;
        self.require_owner(&window, &lease)?;
        let mut registry = self
            .0
            .lock()
            .map_err(|_| "Plugin device owner unavailable")?;
        for (key, active) in controls {
            registry.controls.insert(key, active);
        }
        Ok(result)
    }
}
