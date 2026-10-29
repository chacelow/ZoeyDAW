use crate::{MainThreadDispatcher, PlaybackService};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    fs,
    future::Future,
    sync::{Arc, Mutex},
    task::{Context, Poll, Wake, Waker},
    time::Instant,
};

#[derive(Default)]
struct MainQueue(Mutex<VecDeque<Box<dyn FnOnce() + Send>>>);

impl MainThreadDispatcher for MainQueue {
    fn dispatch(&self, action: impl FnOnce() + Send + 'static) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "zoeydaw CLI main queue poisoned")?
            .push_back(Box::new(action));
        Ok(())
    }
}

impl MainQueue {
    fn run(&self) -> Result<(), String> {
        let action = self
            .0
            .lock()
            .map_err(|_| "zoeydaw CLI main queue poisoned")?
            .pop_front()
            .ok_or("zoeydaw CLI main queue was empty")?;
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

fn elapsed_ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

fn value_after<'a>(args: &'a [String], name: &str) -> Result<&'a str, String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].as_str())
        .ok_or_else(|| format!("Missing {name}"))
}

fn capabilities_request(args: &[String]) -> Result<Value, String> {
    let host = value_after(args, "--host")?.to_owned();
    let output = value_after(args, "--output")?.to_owned();
    let input = args
        .windows(2)
        .find(|pair| pair[0] == "--input")
        .map(|pair| pair[1].clone());
    Ok(json!({
        "host": host,
        "inputDeviceId": input,
        "outputDeviceId": output,
    }))
}

fn devices(service: &PlaybackService, queue: &MainQueue) -> Result<Value, String> {
    drive(service.devices(queue), queue)?
}

fn run_audio(args: &[String]) -> Result<(), String> {
    if args.first().map(String::as_str) == Some("describe") {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "command": "audio describe",
                "commands": ["devices", "capabilities", "configure", "benchmark"],
                "sharedOwner": "PlaybackService",
                "reports": ["device inventory", "capabilities", "configuration readback", "stage timings"]
            }))
            .map_err(|error| error.to_string())?
        );
        return Ok(());
    }
    let action = args.first().map(String::as_str).unwrap_or("benchmark");
    let service = PlaybackService::default();
    let queue = MainQueue::default();
    let started = Instant::now();
    let result = match action {
        "devices" => {
            let request_started = Instant::now();
            let value = devices(&service, &queue)?;
            json!({"command":"audio devices","timingsMs":{"devices":elapsed_ms(request_started),"total":elapsed_ms(started)},"result":value})
        }
        "capabilities" => {
            let request = capabilities_request(&args[1..])?;
            let request_started = Instant::now();
            let value = drive(service.device_capabilities(&queue, request.clone()), &queue)??;
            json!({"command":"audio capabilities","request":request,"timingsMs":{"capabilities":elapsed_ms(request_started),"total":elapsed_ms(started)},"result":value})
        }
        "configure" => {
            let path = value_after(&args[1..], "--config")?;
            let request: Value =
                serde_json::from_str(&fs::read_to_string(path).map_err(|error| error.to_string())?)
                    .map_err(|error| error.to_string())?;
            let configure_started = Instant::now();
            let applied = drive(service.configure_device(&queue, request.clone()), &queue)??;
            let readback_started = Instant::now();
            let readback = devices(&service, &queue)?;
            json!({"command":"audio configure","request":request,"timingsMs":{"configure":elapsed_ms(configure_started),"readback":elapsed_ms(readback_started),"total":elapsed_ms(started)},"result":applied,"readback":readback})
        }
        "benchmark" => {
            let discovery_started = Instant::now();
            let discovered = devices(&service, &queue)?;
            let discovery_ms = elapsed_ms(discovery_started);
            let output = discovered["outputDevices"]
                .as_array()
                .and_then(|items| items.first())
                .ok_or("No output device was enumerated")?;
            let request = json!({
                "host": output["host"],
                "inputDeviceId": null,
                "outputDeviceId": output["id"],
            });
            let capabilities_started = Instant::now();
            let capability_value =
                drive(service.device_capabilities(&queue, request.clone()), &queue)??;
            let capabilities_ms = elapsed_ms(capabilities_started);
            let config = if discovered["configuration"].is_object() {
                discovered["configuration"].clone()
            } else {
                let output_channels = capability_value["outputChannelNames"]
                    .as_array()
                    .map_or(0, Vec::len);
                json!({
                    "host": request["host"],
                    "inputDeviceId": null,
                    "outputDeviceId": request["outputDeviceId"],
                    "sampleRate": capability_value["defaultSampleRate"],
                    "bufferFrames": capability_value["defaultBufferFrames"],
                    "inputMono": [],
                    "inputStereo": [],
                    "outputMono": if output_channels < 2 { json!([0]) } else { json!([]) },
                    "outputStereo": if output_channels >= 2 { json!([0]) } else { json!([]) },
                })
            };
            let configure_started = Instant::now();
            let configured = drive(service.configure_device(&queue, config.clone()), &queue)??;
            let configure_ms = elapsed_ms(configure_started);
            let readback_started = Instant::now();
            let readback = devices(&service, &queue)?;
            let readback_ms = elapsed_ms(readback_started);
            if readback["configuration"] != config {
                return Err(
                    "Audio configuration readback differs from the requested configuration".into(),
                );
            }
            if readback_ms > 250.0 {
                return Err(format!(
                    "Audio device readback exceeded realtime budget: {readback_ms:.3} ms"
                ));
            }
            json!({
                "command":"audio benchmark",
                "request":config,
                "timingsMs":{"devices":discovery_ms,"capabilities":capabilities_ms,"configure":configure_ms,"readback":readback_ms,"total":elapsed_ms(started)},
                "assertions":{"readbackUnder250ms":true},
                "result":configured,
                "readback":readback,
            })
        }
        _ => return Err("Usage: zoeydaw audio [describe|devices|capabilities|configure|benchmark]".into()),
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&result).map_err(|error| error.to_string())?
    );
    Ok(())
}
fn project_request(args: &[String]) -> Result<Value, String> {
    let path = value_after(args, "--request")?;
    serde_json::from_str(&fs::read_to_string(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

fn project_identity(args: &[String], request: Option<&Value>) -> (String, String) {
    let lease = args
        .windows(2)
        .find(|pair| pair[0] == "--lease")
        .map(|pair| pair[1].clone())
        .unwrap_or_else(|| "cli".into());
    let session = args
        .windows(2)
        .find(|pair| pair[0] == "--session")
        .map(|pair| pair[1].clone())
        .or_else(|| {
            request
                .and_then(|value| value["sessionId"].as_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "cli".into());
    (lease, session)
}

fn stop_token(args: &[String]) -> Result<u64, String> {
    args.windows(2)
        .find(|pair| pair[0] == "--stop-token")
        .map(|pair| {
            pair[1]
                .parse()
                .map_err(|error| format!("Invalid --stop-token: {error}"))
        })
        .unwrap_or(Ok(0))
}

fn run_project(args: &[String]) -> Result<(), String> {
    let action = args.first().map(String::as_str).unwrap_or("status");
    if action == "describe" {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "command": "project describe",
                "commands": {
                    "apply": "full protocol v2 document state, including tracks, clips, MIDI, automation, devices, launcher, tempo, media, and external plugins",
                    "control": "transport state, recording, seek, loop generation, and metronome",
                    "note": "one MIDI edge with ACK or rejection",
                    "status": "telemetry and accepted revision",
                    "release": "resource release and lease closure",
                    "mutate": "atomic JSON Patch persistence through project storage; use project apply to validate and adopt realtime state"
                },
                "stages": ["open", "preview", "commit", "cancel", "recover"],
                "sharedOwners": ["PlaybackService", "EngineSession", "project storage"],
                "nativeDiagnostics": ["issues", "queue", "revision", "callback", "meter", "resource release"],
                "notInProtocol": ["rack chains", "browser indexing", "waveform cache", "recording file finalization"]
            }))
            .map_err(|error| error.to_string())?
        );
        return Ok(());
    }
    let request = if matches!(action, "apply" | "control" | "note") {
        Some(project_request(&args[1..])?)
    } else {
        None
    };
    let (lease, session) = project_identity(args, request.as_ref());
    let service = PlaybackService::default();
    let queue = MainQueue::default();
    service.acquire(lease.clone(), session.clone())?;
    let result = (|| {
        let stop = stop_token(args)?;
        let value = match action {
            "apply" => drive(
                service.apply(&queue, request.clone().unwrap(), lease.clone(), stop),
                &queue,
            )??,
            "control" => drive(
                service.control(&queue, request.clone().unwrap(), lease.clone(), stop),
                &queue,
            )??,
            "note" => drive(
                service.note(&queue, request.clone().unwrap(), lease.clone(), stop),
                &queue,
            )??,
            "status" => drive(service.telemetry(&queue, lease.clone()), &queue)??,
            "release" => {
                drive(service.release(&queue, lease.clone()), &queue)??;
                json!({"released":true})
            }
            _ => return Err("Usage: zoeydaw project [describe|apply|control|note|status|release]".into()),
        };
        println!("{}", serde_json::to_string_pretty(&json!({"command":format!("project {action}"),"leaseId":lease,"sessionId":session,"result":value})).map_err(|error| error.to_string())?);
        Ok(())
    })();
    if action != "release" {
        let _ = drive(service.release(&queue, lease), &queue);
    }
    result
}

pub fn run<I>(args: I) -> Result<(), String>
where
    I: IntoIterator<Item = String>,
{
    let args: Vec<String> = args.into_iter().collect();
    match args.first().map(String::as_str) {
        Some("audio") => run_audio(&args[1..]),
        Some("project") => run_project(&args[1..]),
        _ => Err("Usage: zoeydaw [audio|project] ...".into()),
    }
}
