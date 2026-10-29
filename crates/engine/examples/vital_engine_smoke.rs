use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    env,
    future::Future,
    path::PathBuf,
    sync::{Arc, Mutex},
    task::{Context, Poll, Wake, Waker},
    thread,
    time::Duration,
};
use zoeydaw_engine::{MainThreadDispatcher, PlaybackService};
use zoeydaw_plugin_abi::{PreparedFormat, PreparedPlugin};
use zoeydaw_plugin_host::{device_session::PreparedDevice, PluginCatalog};

#[derive(Default)]
struct MainQueue(Mutex<VecDeque<Box<dyn FnOnce() + Send>>>);

impl MainThreadDispatcher for MainQueue {
    fn dispatch(&self, action: impl FnOnce() + Send + 'static) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "CLI main queue poisoned")?
            .push_back(Box::new(action));
        Ok(())
    }
}

impl MainQueue {
    fn run(&self) -> Result<(), String> {
        let action = self
            .0
            .lock()
            .map_err(|_| "CLI main queue poisoned")?
            .pop_front()
            .ok_or("CLI main queue was empty")?;
        action();
        Ok(())
    }
}

struct NoopWake;
impl Wake for NoopWake {
    fn wake(self: Arc<Self>) {}
}

fn drive<F: Future>(future: F, queue: &MainQueue) -> Result<F::Output, String> {
    let mut future = Box::pin(future);
    loop {
        match future
            .as_mut()
            .poll(&mut Context::from_waker(&Waker::from(Arc::new(NoopWake))))
        {
            Poll::Ready(value) => return Ok(value),
            Poll::Pending => queue.run()?,
        }
    }
}

fn audio_configuration(service: &PlaybackService, queue: &MainQueue) -> Result<Value, String> {
    let devices = drive(service.devices(queue), queue)??;
    if devices["state"] == "ready" {
        return Ok(devices);
    }
    let output = devices["outputDevices"]
        .as_array()
        .and_then(|items| items.first())
        .ok_or_else(|| format!("No output device was enumerated: {devices}"))?;
    let host = output["host"].as_str().ok_or("Output device has no host")?;
    let output_id = output["id"].as_str().ok_or("Output device has no id")?;
    let caps = drive(
        service.device_capabilities(
            queue,
            json!({"host":host,"inputDeviceId":null,"outputDeviceId":output_id}),
        ),
        queue,
    )??;
    let output_count = caps["outputChannelNames"].as_array().map_or(0, Vec::len);
    if output_count == 0 {
        return Err(format!("Output device has no channels: {caps}"));
    }
    let config = json!({
        "host": caps["host"], "inputDeviceId": null, "outputDeviceId": caps["outputDeviceId"],
        "sampleRate": caps["defaultSampleRate"], "bufferFrames": caps["defaultBufferFrames"],
        "inputMono": [], "inputStereo": [],
        "outputMono": if output_count < 2 { json!([0]) } else { json!([]) },
        "outputStereo": if output_count >= 2 { json!([0]) } else { json!([]) },
    });
    drive(service.configure_device(queue, config), queue)??;
    Ok(drive(service.devices(queue), queue)??)
}

fn document(devices: Value, playing: bool, stage: &str, sequence: u64, revision: u64) -> Value {
    let main = json!({"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]});
    let midi = json!({"id":"vital-track","kind":"midi","output":"main","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"in","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":true,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":devices,"clips":[],"automation":[],"childTrackIds":[]});
    json!({"protocolVersion":2,"sessionId":"vital-cli","sequence":sequence,"baseRevision":revision.saturating_sub(1),"revision":revision,"stage":stage,"editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[main,midi]},"control":{"playing":playing,"recording":false,"seekBar":1,"seekGeneration":0}}})
}

fn run() -> Result<Value, String> {
    let helper = PathBuf::from(
        env::args()
            .nth(1)
            .unwrap_or_else(|| "src-tauri/plugin-helper/zoeydaw-plugin-helper.exe".into()),
    );
    let cache = PathBuf::from(env::args().nth(2).unwrap_or_else(|| {
        "C:/Users/11038/AppData/Roaming/com.zoeydaw.desktop/plugins/catalog.json".into()
    }));
    let catalog = PluginCatalog::new(helper, cache)?;
    let entry = catalog
        .entries()
        .into_iter()
        .find(|entry| entry.plugin.name == "Vital")
        .ok_or("Vital is not present in the authorized catalog")?;
    let service = PlaybackService::default();
    let queue = MainQueue::default();
    let lease = "vital-cli".to_owned();
    let session = "vital-cli".to_owned();
    service.acquire(lease.clone(), session.clone())?;
    let result = (|| {
        let devices = audio_configuration(&service, &queue)?;
        let open = document(json!([]), false, "open", 0, 0);
        drive(service.apply(&queue, open, lease.clone(), 0), &queue)??;
        let rate = devices["sampleRate"]
            .as_f64()
            .filter(|value| *value > 0.0)
            .unwrap_or(48_000.0);
        let quantum = devices["bufferFrames"]
            .as_u64()
            .and_then(|value| u32::try_from(value).ok())
            .filter(|value| *value > 0)
            .unwrap_or(512);
        let graph_quantum = quantum
            .checked_mul(11)
            .and_then(|value| value.checked_add(5))
            .map(|value| value / 10)
            .ok_or("Audio quantum overflow")?;
        let prepared = PreparedDevice::prepare(
            catalog.select(&entry.catalog_id)?,
            rate,
            graph_quantum,
            None,
        )?;
        let control = prepared.control.clone();
        let format = PreparedFormat {
            sample_rate: prepared.sample_rate,
            quantum: prepared.quantum,
            input_channels: prepared.input_channels,
            output_channels: prepared.output_channels,
            latency_frames: prepared.latency_frames,
        };
        let processor = PreparedPlugin {
            device_id: "vital-device".into(),
            format,
            processor: prepared.audio.into_pending(),
        };
        let device = json!({"id":"vital-device","kind":"external","enabled":true,"plugin":{"catalogId":entry.catalog_id,"format":"clap","classId":entry.plugin.class_id,"name":entry.plugin.name,"vendor":entry.plugin.vendor,"version":entry.plugin.version,"role":"instrument"},"stateRef":null,"parameters":[]});
        let accepted = drive(
            service.apply_prepared(
                &queue,
                document(json!([device]), true, "commit", 1, 1),
                lease.clone(),
                0,
                vec![processor],
            ),
            &queue,
        )??;
        let control_ack = drive(service.control(&queue, json!({"protocolVersion":2,"sessionId":session,"sequence":2,"controlGeneration":"1","control":{"playing":true,"recording":false,"seekBar":1,"seekGeneration":0}}), lease.clone(), 0), &queue)??;
        let note_on = json!({"protocolVersion":2,"sessionId":session,"sequence":1,"note":{"trackId":"vital-track","noteId":"vital-cli-note","pitch":60,"velocity":100,"on":true}});
        let ack = drive(service.note(&queue, note_on, lease.clone(), 0), &queue)??;
        thread::sleep(Duration::from_millis(1500));
        let parameter_edit = Value::Null;
        let status = control
            .status()?
            .ok_or("Vital helper returned no realtime status")?;
        let telemetry = drive(service.telemetry(&queue, lease.clone()), &queue)??;
        let diagnostics = drive(service.diagnostics(&queue), &queue)??;
        let meter = drive(
            service.native_meter_snapshot(&queue, lease.clone(), session.clone()),
            &queue,
        )??;
        let note_off = json!({"protocolVersion":2,"sessionId":session,"sequence":2,"note":{"trackId":"vital-track","noteId":"vital-cli-note","pitch":60,"velocity":0,"on":false}});
        let off_ack = drive(service.note(&queue, note_off, lease.clone(), 0), &queue)??;
        let status = json!({"running":status.running,"callbacks":status.callbacks,"processed":status.processed,"missed":status.missed,"failures":status.failures,"late":status.late,"droppedEvents":status.dropped_events,"latency":status.latency});
        Ok(
            json!({"catalogId":entry.catalog_id,"plugin":entry.plugin,"devices":{"state":devices["state"],"host":devices["host"],"sampleRate":devices["sampleRate"],"bufferFrames":devices["bufferFrames"]},"accepted":accepted,"controlAck":control_ack,"parameterEdit":parameter_edit,"noteAck":ack,"noteOffAck":off_ack,"vitalStatus":status,"meterReady":telemetry["meterReady"],"meter":meter,"issues":telemetry["issues"],"diagnostics":{"arrangementBuilds":diagnostics["arrangementBuilds"],"transportStarts":diagnostics["transportStarts"],"nodePlayheadPlaying":diagnostics["nodePlayheadPlaying"],"callbackCount":diagnostics["callbackCount"],"lateCallbackIntervals":diagnostics["lateCallbackIntervals"],"maxCallbackIntervalSeconds":diagnostics["maxCallbackIntervalSeconds"],"engineMeanSeconds":diagnostics["engineMeanSeconds"],"engineMaxSeconds":diagnostics["engineMaxSeconds"],"gateProcessedFrames":diagnostics["gateProcessedFrames"],"capturedFrames":diagnostics["capturedFrames"],"arrangementPlaying":diagnostics["arrangementPlaying"],"pluginProcessing":diagnostics["pluginProcessing"]}}),
        )
    })();
    let _ = drive(service.release(&queue, lease), &queue);
    result
}

fn main() {
    match run() {
        Ok(result) => println!(
            "{}",
            serde_json::to_string_pretty(&result).expect("CLI result serialization")
        ),
        Err(error) => {
            eprintln!("vital_engine_smoke: {error}");
            std::process::exit(1);
        }
    }
}
