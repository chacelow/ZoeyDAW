//! napi owns only handles and marshaling. All device/DSP/state work runs in Rust.
use napi::{
    bindgen_prelude::{Float32Array, Function},
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
    Env, Error, Result, Status,
};
use napi_derive::napi;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        mpsc::{self, Sender},
        Arc, LazyLock, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use zoeydaw_engine::{
    protocol::{BackendFailureCode, BackendRequest},
    session::{rejected, DeviceSession},
};

mod cleanup;
mod telemetry;
#[cfg(feature = "verification")]
mod verification;
type TelemetryCallback = ThreadsafeFunction<String, (), String, Status, false, true, 1>;
#[napi(object)]
pub struct SourceInfo {
    pub sample_rate: u32,
    pub frames: f64,
    pub channels: u32,
}

enum Command {
    Apply(BackendRequest, Sender<String>),
    Subscribe(TelemetryCallback),
    Peaks(
        String,
        u64,
        u64,
        usize,
        Sender<std::result::Result<Vec<f32>, String>>,
    ),
    PeaksAtBars {
        source: String,
        start_bar: f64,
        end_bar: f64,
        pixels: usize,
        content_offset_bars: f64,
        reply: Sender<Vec<f32>>,
    },
    SourceInfo(String, Sender<Option<SourceInfo>>),
    Dispose,
}
struct Handle {
    sender: Sender<Command>,
    thread: JoinHandle<()>,
    cleanup: Arc<cleanup::CleanupOwner>,
}
static HANDLES: LazyLock<Mutex<BTreeMap<u32, Handle>>> = LazyLock::new(Mutex::default);
static NEXT_ID: AtomicU32 = AtomicU32::new(1);
fn handles() -> &'static Mutex<BTreeMap<u32, Handle>> {
    &HANDLES
}
fn error(message: impl Into<String>) -> Error {
    Error::new(Status::GenericFailure, message.into())
}
fn sender(id: u32) -> Result<Sender<Command>> {
    handles()
        .lock()
        .map_err(|_| error("engine handle lock poisoned"))?
        .get(&id)
        .map(|h| h.sender.clone())
        .ok_or_else(|| error("engine session disposed"))
}
fn run(receiver: mpsc::Receiver<Command>) {
    let mut session = DeviceSession::open();
    let mut callback: Option<TelemetryCallback> = None;
    let pending = Arc::new(AtomicBool::new(false));
    let mut deadline = Instant::now();
    loop {
        match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(Command::Apply(request, reply)) => {
                let result = match session.as_mut() {
                    Ok(session) => session.apply(&request),
                    Err(_) => rejected(&request, BackendFailureCode::Rejected),
                };
                if let Ok(json) = serde_json::to_string(&result) {
                    let _ = reply.send(json);
                }
            }
            Ok(Command::Subscribe(next)) => {
                callback = Some(next);
            }
            Ok(Command::Peaks(source, start, end, pixels, reply)) => {
                let result = session
                    .as_ref()
                    .map_err(Clone::clone)
                    .and_then(|session| session.read_peaks(&source, start, end, pixels));
                let _ = reply.send(result);
            }
            Ok(Command::PeaksAtBars {
                source,
                start_bar,
                end_bar,
                pixels,
                content_offset_bars,
                reply,
            }) => {
                let peaks = session.as_ref().map_or_else(
                    |_| Vec::new(),
                    |session| {
                        session.read_peaks_at_bars(
                            &source,
                            start_bar,
                            end_bar,
                            pixels,
                            content_offset_bars,
                        )
                    },
                );
                let _ = reply.send(peaks);
            }
            Ok(Command::SourceInfo(source, reply)) => {
                let info = session
                    .as_ref()
                    .ok()
                    .and_then(|session| session.source_info(&source))
                    .map(|info| SourceInfo {
                        sample_rate: info.sample_rate,
                        frames: info.frames as f64,
                        channels: info.channels,
                    });
                let _ = reply.send(info);
            }
            Ok(Command::Dispose) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if Instant::now() >= deadline {
            deadline = Instant::now() + Duration::from_micros(33333);
            if let (Ok(session), Some(sink)) = (session.as_mut(), callback.as_ref()) {
                if let Some(pending) = telemetry::PendingTelemetry::acquire(&pending) {
                    if let Some(frame) = session.telemetry() {
                        if let Ok(json) = serde_json::to_string(&frame) {
                            let status = sink.call_with_return_value(
                                json,
                                ThreadsafeFunctionCallMode::NonBlocking,
                                move |_, _| {
                                    drop(pending);
                                    Ok(())
                                },
                            );
                            if status != Status::Ok {
                                callback = None;
                            }
                        }
                    }
                }
            }
        }
    }
    drop(callback);
    drop(session);
}

#[napi]
pub fn open_session(env: Env) -> Result<u32> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    if id == 0 {
        return Err(error("engine handle ids exhausted"));
    }
    let cleanup = cleanup::for_env(env)?;
    let mut handles = handles()
        .lock()
        .map_err(|_| error("engine handle lock poisoned"))?;
    let mut active = cleanup
        .active
        .lock()
        .map_err(|_| error("engine cleanup lock poisoned"))?;
    let (sender, receiver) = mpsc::channel();
    let thread = thread::Builder::new()
        .name(format!("zoeydaw-engine-{id}"))
        .spawn(move || run(receiver))
        .map_err(|e| error(e.to_string()))?;
    active.insert(id);
    handles.insert(
        id,
        Handle {
            sender,
            thread,
            cleanup: Arc::clone(&cleanup),
        },
    );
    Ok(id)
}

#[napi]
pub fn apply(session: u32, request_json: String) -> Result<String> {
    let request: BackendRequest =
        serde_json::from_str(&request_json).map_err(|e| error(e.to_string()))?;
    let Ok(sender) = sender(session) else {
        return serde_json::to_string(&rejected(&request, BackendFailureCode::Disposed))
            .map_err(|e| error(e.to_string()));
    };
    let (reply, receiver) = mpsc::channel();
    sender
        .send(Command::Apply(request, reply))
        .map_err(|e| error(e.to_string()))?;
    receiver.recv().map_err(|e| error(e.to_string()))
}

#[napi]
pub fn subscribe_telemetry(session: u32, callback: Function<String, ()>) -> Result<()> {
    let callback = callback
        .build_threadsafe_function::<String>()
        .weak::<true>()
        .max_queue_size::<1>()
        .build()?;
    sender(session)?
        .send(Command::Subscribe(callback))
        .map_err(|e| error(e.to_string()))
}

#[napi]
pub fn dispose(session: u32) -> Result<()> {
    let handle = handles()
        .lock()
        .map_err(|_| error("engine handle lock poisoned"))?
        .remove(&session);
    if let Some(handle) = handle {
        let cleanup = handle
            .cleanup
            .active
            .lock()
            .map(|mut active| active.remove(&session))
            .map_err(|_| error("engine cleanup lock poisoned"));
        let _ = handle.sender.send(Command::Dispose);
        let _ = handle.thread.join();
        cleanup?;
    }
    Ok(())
}

/// Channel-major, then pixel-major [min,max]. Stereo output has pixels*4 f32s.
#[napi]
pub fn read_peaks(
    session: u32,
    source_id: String,
    start_frame: f64,
    end_frame: f64,
    pixels: u32,
) -> Result<Float32Array> {
    if !start_frame.is_finite()
        || !end_frame.is_finite()
        || start_frame < 0.0
        || end_frame <= start_frame
        || start_frame.fract() != 0.0
        || end_frame.fract() != 0.0
        || end_frame > 9007199254740991.0
    {
        return Err(error("invalid peak range"));
    }
    let (reply, receiver) = mpsc::channel();
    sender(session)?
        .send(Command::Peaks(
            source_id,
            start_frame as u64,
            end_frame as u64,
            pixels as usize,
            reply,
        ))
        .map_err(|e| error(e.to_string()))?;
    receiver
        .recv()
        .map_err(|e| error(e.to_string()))?
        .map(Float32Array::new)
        .map_err(error)
}

#[napi]
pub fn source_info(session: u32, source_id: String) -> Result<Option<SourceInfo>> {
    let (reply, receiver) = mpsc::channel();
    sender(session)?
        .send(Command::SourceInfo(source_id, reply))
        .map_err(|e| error(e.to_string()))?;
    receiver.recv().map_err(|e| error(e.to_string()))
}

/// One-based clip-local bars on the applied project tempo, sampled at the
/// decoded source rate. Signed `contentOffsetBars` wraps like clip playback.
/// Same layout as `readPeaks`. Unknown sources and empty or non-finite
/// ranges yield `pixels*4` zeros; `pixels` of 0 or above 16384, or a session
/// whose device failed to open, yield an empty array.
#[napi]
pub fn read_peaks_at_bars(
    session: u32,
    source_id: String,
    start_bar: f64,
    end_bar: f64,
    pixels: u32,
    content_offset_bars: f64,
) -> Result<Float32Array> {
    let (reply, receiver) = mpsc::channel();
    sender(session)?
        .send(Command::PeaksAtBars {
            source: source_id,
            start_bar,
            end_bar,
            pixels: pixels as usize,
            content_offset_bars,
            reply,
        })
        .map_err(|e| error(e.to_string()))?;
    receiver
        .recv()
        .map(Float32Array::new)
        .map_err(|e| error(e.to_string()))
}
