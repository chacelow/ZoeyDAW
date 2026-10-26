use crate::{
    PluginSelection,
    native::NativeProcessor,
    quantum::QuantumAudio,
};
use plughost::{
    Chain, HelperMonitor, Layout, PluginInfo, PluginKind, PluginState, ProcessMode,
    RealtimeConfig, RealtimeStatus, StatePurpose, ParameterEventBatch,
};
use std::{
    ffi::c_void,
    sync::{Arc, atomic::{AtomicU64, AtomicUsize, Ordering}, mpsc::{self, Receiver, SyncSender}},
    thread,
};
use zoeydaw_plugin_abi::{NativeBlock, OwnedNativeProcessor, PendingProcessor};
pub use plughost::{ParameterEvent, ParameterInfo};

type Reply<T> = SyncSender<Result<T, String>>;
static NEXT_INSTANCE: AtomicU64 = AtomicU64::new(1);
enum Command {
    Parameters(Reply<Vec<(ParameterInfo, f64)>>),
    SetParameter(u64, f64, Reply<()>),
    Snapshot(Reply<PluginState>),
    Editor(bool, Reply<()>),
    EditorOpen(Reply<bool>),
    Status(Reply<Option<RealtimeStatus>>),
    BeginEditor(Vec<(u64, f64)>, Reply<()>),
    EndEditor(bool, Reply<PluginState>),
    EditorEvents(Reply<(bool, ParameterEventBatch)>),
}

#[derive(Clone)]
pub struct DeviceControl {
    commands: SyncSender<Command>,
    instance: u64,
    native_context: Arc<AtomicUsize>,
}

pub struct PreparedDevice {
    pub info: PluginInfo,
    pub parameters: Vec<ParameterInfo>,
    pub sample_rate: f64,
    pub quantum: u32,
    pub input_channels: u32,
    pub output_channels: u32,
    pub latency_frames: u32,
    pub control: DeviceControl,
    pub monitor: HelperMonitor,
    pub audio: DeviceAudio,
}

pub struct DeviceAudio {
    processor: NativeProcessor,
    _lifetime: SyncSender<Command>,
    native_context: Arc<AtomicUsize>,
}

impl DeviceAudio {
    pub fn into_pending(self) -> PendingProcessor {
        unsafe { PendingProcessor::new(self.into_owned()) }
    }
    /// # Safety
    /// The receiver releases this descriptor once, off audio threads, after all graph references retire.
    pub unsafe fn into_owned(self) -> OwnedNativeProcessor {
        let native_context = self.native_context.clone();
        let audio = Box::into_raw(Box::new(self));
        native_context.store(audio as usize, Ordering::Release);
        OwnedNativeProcessor { context: Arc::into_raw(native_context).cast_mut().cast(), process, release }
    }
}

// SAFETY: the native owner serializes calls and supplies the NativeBlock buffer contract.
unsafe extern "C" fn process(context: *mut c_void, block: *mut NativeBlock) -> i32 {
    if context.is_null() || block.is_null() {
        return -1;
    }
    let address = unsafe { &*context.cast::<AtomicUsize>() }.load(Ordering::Acquire);
    if address == 0 { return -1; }
    let audio = unsafe { &mut *(address as *mut DeviceAudio) };
    let callback = audio.processor.callback();
    unsafe { (callback.process)(callback.context, block) }
}

// SAFETY: called once by the control-thread owner after processing and graph references retire.
unsafe extern "C" fn release(context: *mut c_void) {
    let context = unsafe { Arc::from_raw(context.cast::<AtomicUsize>()) };
    let address = context.swap(0, Ordering::AcqRel);
    unsafe { drop(Box::from_raw(address as *mut DeviceAudio)) };
}

impl DeviceControl {
    pub fn instance_id(&self) -> u64 { self.instance }
    pub fn native_context(&self) -> usize { Arc::as_ptr(&self.native_context) as usize }
    pub fn begin_editor(&self, parameters: Vec<(u64, f64)>) -> Result<(), String> {
        self.request(|reply| Command::BeginEditor(parameters, reply))
    }
    pub fn end_editor(&self, commit: bool) -> Result<PluginState, String> {
        self.request(|reply| Command::EndEditor(commit, reply))
    }
    pub fn editor_events(&self) -> Result<(bool, ParameterEventBatch), String> {
        self.request(Command::EditorEvents)
    }
    fn request<T>(&self, command: impl FnOnce(Reply<T>) -> Command) -> Result<T, String> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.commands
            .try_send(command(reply))
            .map_err(|error| match error {
                mpsc::TrySendError::Full(_) => "Plugin control queue is full".to_owned(),
                mpsc::TrySendError::Disconnected(_) => "Plugin control worker stopped".to_owned(),
            })?;
        receive
            .recv()
            .map_err(|_| "Plugin control worker stopped".to_owned())?
    }
    pub fn parameters(&self) -> Result<Vec<(ParameterInfo, f64)>, String> {
        self.request(Command::Parameters)
    }
    pub fn set_parameter(&self, id: u64, value: f64) -> Result<(), String> {
        self.request(|reply| Command::SetParameter(id, value, reply))
    }
    pub fn snapshot(&self) -> Result<PluginState, String> {
        self.request(Command::Snapshot)
    }
    pub fn set_editor(&self, open: bool) -> Result<(), String> {
        self.request(|reply| Command::Editor(open, reply))
    }
    pub fn editor_open(&self) -> Result<bool, String> {
        self.request(Command::EditorOpen)
    }
    pub fn status(&self) -> Result<Option<RealtimeStatus>, String> {
        self.request(Command::Status)
    }
}

impl PreparedDevice {
    pub fn prepare(
        selection: PluginSelection,
        sample_rate: f64,
        quantum: u32,
        state: Option<PluginState>,
    ) -> Result<Self, String> {
        if !sample_rate.is_finite()
            || !(8000.0..=768000.0).contains(&sample_rate)
            || !(1..=4096).contains(&quantum)
        {
            return Err("Invalid plugin device format".into());
        }
        let (commands, receive) = mpsc::sync_channel(32);
        let (ready, prepared) = mpsc::sync_channel(1);
        let audio_lifetime = commands.clone();
        thread::Builder::new()
            .name("zoeydaw-plugin-control".into())
            .spawn(move || {
                let result = prepare(selection, sample_rate, quantum, state, audio_lifetime);
                match result {
                    Ok((chain, device)) => {
                        if ready.send(Ok(device)).is_ok() {
                            run(chain, receive);
                        }
                    }
                    Err(error) => {
                        let _ = ready.send(Err(error));
                    }
                }
            })
            .map_err(|error| error.to_string())?;
        let (info, latency_frames, input_channels, monitor, audio, parameters) = prepared
            .recv()
            .map_err(|_| "Plugin preparation worker stopped".to_owned())??;
        Ok(Self {
            info,
            parameters,
            sample_rate,
            quantum,
            input_channels,
            output_channels: 2,
            latency_frames,
            control: DeviceControl { commands, instance: NEXT_INSTANCE.fetch_add(1, Ordering::Relaxed), native_context: audio.native_context.clone() },
            monitor,
            audio,
        })
    }
}

type Preparation = (PluginInfo, u32, u32, HelperMonitor, DeviceAudio, Vec<ParameterInfo>);
fn prepare(
    selection: PluginSelection,
    sample_rate: f64,
    quantum: u32,
    state: Option<PluginState>,
    lifetime: SyncSender<Command>,
) -> Result<(Chain, Preparation), String> {
    let mut chain = selection.spawn()?;
    let info = chain
        .plugins()
        .first()
        .ok_or("Plugin did not load")?
        .clone();
    if chain.plugins().len() != 1 {
        return Err("A device must own exactly one plugin".into());
    }
    let input = match info.kind {
        PluginKind::Effect => Layout::Stereo,
        PluginKind::Instrument => Layout::None,
        _ => return Err("Unsupported plugin role".into()),
    };
    let input_channels = if input == Layout::None { 0 } else { 2 };
    let mut config = chain
        .main_bus_config(sample_rate, quantum as usize, input, &[Layout::Stereo])
        .map_err(|error| error.to_string())?;
    config.mode = ProcessMode::Realtime;
    chain
        .prepare_audio(&config)
        .map_err(|error| error.to_string())?;
    if let Some(state) = state {
        if state.format != info.format || state.class_id != info.class_id {
            return Err("Plugin state belongs to another class".into());
        }
        chain
            .restore_state(0, &state, StatePurpose::Project)
            .map_err(|error| error.to_string())?;
    }
    let parameters = chain.parameters(0).map_err(|error|error.to_string())?.into_iter().map(|(info,_)|info).collect();
    let endpoint = chain
        .realtime_endpoint(&RealtimeConfig::new(quantum as usize))
        .map_err(|error| error.to_string())?;
    let latency = chain
        .start_realtime()
        .map_err(|error| error.to_string())?
        .checked_add(quantum)
        .ok_or("Plugin latency overflow")?;
    let monitor = chain.helper_monitor();
    let processor = NativeProcessor::new(QuantumAudio::new(
        endpoint,
        quantum as usize,
        input_channels,
        2,
        sample_rate,
    )?);
    Ok((
        chain,
        (
            info,
            latency,
            input_channels as u32,
            monitor,
            DeviceAudio {
                processor,
                _lifetime: lifetime,
                native_context: Arc::new(AtomicUsize::new(0)),
            },
            parameters,
        ),
    ))
}

fn run(mut chain: Chain, receive: Receiver<Command>) {
    let mut editor_baseline = None;
    while let Ok(command) = receive.recv() {
        match command {
            Command::BeginEditor(parameters, reply) => {
                let result = (|| {
                    if editor_baseline.is_some() && chain.editor_open(0).map_err(|error|error.to_string())? { return Ok(()); }
                    editor_baseline = None;
                    let metadata = chain.parameters(0).map_err(|error|error.to_string())?;
                    for (id, value) in &parameters {
                        let info = metadata.iter().find(|(info,_)|info.id==*id).map(|(info,_)|info)
                            .ok_or("Unknown plugin parameter")?;
                        if !value.is_finite() || !(0.0..=1.0).contains(value) || info.flags.read_only || !info.flags.automatable
                            || (info.step_count>0 && (value*f64::from(info.step_count)-(value*f64::from(info.step_count)).round()).abs()>1e-7) {
                            return Err("Invalid plugin parameter edit".into());
                        }
                    }
                    for (id,value) in parameters { chain.set_parameter(0,id,value).map_err(|error|error.to_string())?; }
                    let baseline = chain.save_state(0,StatePurpose::Project).map_err(|error|error.to_string())?;
                    chain.take_parameter_events(0).map_err(|error|error.to_string())?;
                    chain.open_editor(0).map_err(|error|error.to_string())?;
                    editor_baseline = Some(baseline);
                    Ok(())
                })();
                let _ = reply.send(result);
            }
            Command::EndEditor(commit, reply) => {
                let result = (|| {
                    let baseline = editor_baseline.as_ref().ok_or("Plugin editor is not owned")?;
                    chain.close_editor(0).map_err(|error|error.to_string())?;
                    let state = if commit {
                        chain.save_state(0,StatePurpose::Project).map_err(|error|error.to_string())?
                    } else {
                        chain.restore_state(0,baseline,StatePurpose::Project).map_err(|error|error.to_string())?;
                        editor_baseline.take().ok_or("Plugin editor is not owned")?
                    };
                    // Retain the checkpoint for rollback if chunk persistence fails.
                    Ok(state)
                })();
                let _ = reply.send(result);
            }
            Command::EditorEvents(reply) => {
                let result = (|| {
                    if editor_baseline.is_none() { return Err("Plugin editor is not owned".into()); }
                    let open = chain.editor_open(0).map_err(|error|error.to_string())?;
                    let events = chain.take_parameter_events(0).map_err(|error|error.to_string())?;
                    Ok((open,events))
                })();
                let _ = reply.send(result);
            }
            Command::Parameters(reply) => {
                let _ = reply.send(chain.parameters(0).map_err(|error| error.to_string()));
            }
            Command::SetParameter(id, value, reply) => {
                let _ = reply.send(
                    chain
                        .set_parameter(0, id, value)
                        .map_err(|error| error.to_string()),
                );
            }
            Command::Snapshot(reply) => {
                let _ = reply.send(
                    chain
                        .save_state(0, StatePurpose::Project)
                        .map_err(|error| error.to_string()),
                );
            }
            Command::Editor(open, reply) => {
                let result = if open {
                    chain.open_editor(0)
                } else {
                    chain.close_editor(0)
                };
                if !open && result.is_ok() { editor_baseline = None; }
                let _ = reply.send(result.map_err(|error| error.to_string()));
            }
            Command::EditorOpen(reply) => {
                let _ = reply.send(chain.editor_open(0).map_err(|error| error.to_string()));
            }
            Command::Status(reply) => {
                let _ = reply.send(Ok(chain.realtime_status()));
            }
        }
    }
}
