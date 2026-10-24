use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Condvar, LazyLock, Mutex, Weak},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{ipc::{Channel, Response}, State, WebviewWindow};

const HEADER_BYTES: u32 = 32;
const MAX_BYTES: u32 = 262_144;
const MAX_FRAMES: u32 = 1_200;
const MAX_DURATION: Duration = Duration::from_secs(20);
const PERIOD: Duration = Duration::from_nanos(1_000_000_000 / 60);
const MAX_GLOBAL: usize = 4;
const MAX_PER_WINDOW: usize = 2;
const FINISHED_HISTORY: usize = 64;
static CLOCK_ORIGIN: LazyLock<Instant> = LazyLock::new(Instant::now);

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProbeMode {
    Pull,
    Channel,
    Credit,
}

#[derive(Serialize)]
pub struct ProbeOpened {
    id: String,
    bytes: u32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeSummary {
    published: u32,
    sent: u32,
    retained_bytes: u64,
    coalesced: u32,
    dropped: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeClock {
    monotonic_ns: String,
}

#[derive(Default)]
pub struct RealtimeProbeService {
    registry: Arc<Registry>,
}

#[derive(Default)]
struct Registry {
    data: Mutex<RegistryData>,
}

#[derive(Default)]
struct RegistryData {
    active: HashMap<String, Arc<Session>>,
    finished: VecDeque<(String, String, ProbeSummary)>,
}

struct Session {
    owner: String,
    mode: ProbeMode,
    bytes: u32,
    data: Mutex<SessionData>,
    wake: Condvar,
    worker: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Default)]
struct SessionData {
    closed: bool,
    latest: Option<(u64, Arc<Vec<u8>>)>,
    pending: Option<u64>,
    last_sent: u64,
    summary: ProbeSummary,
}

fn require_debug() -> Result<(), String> {
    if cfg!(debug_assertions) {
        Ok(())
    } else {
        Err("realtime-probe-disabled: diagnostic commands require a debug build".into())
    }
}

fn monotonic_ns() -> Result<u64, String> {
    u64::try_from(CLOCK_ORIGIN.elapsed().as_nanos())
        .map_err(|_| "realtime-probe-clock-overflow".into())
}

fn parse_seq(value: &str) -> Result<u64, String> {
    if value.is_empty() || value.len() > 20 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("realtime-probe-invalid-sequence".into());
    }
    value.parse().map_err(|_| "realtime-probe-invalid-sequence".into())
}

fn validate_bytes(bytes: u32) -> Result<(), String> {
    if (HEADER_BYTES..=MAX_BYTES).contains(&bytes) {
        Ok(())
    } else {
        Err(format!("realtime-probe-invalid-bytes: expected {HEADER_BYTES}..={MAX_BYTES}"))
    }
}

fn require_owner(actual: &str, expected: &str) -> Result<(), String> {
    if actual == expected {
        Ok(())
    } else {
        Err("realtime-probe-owner-mismatch".into())
    }
}

fn encode_frame(bytes: u32, seq: u64, produced_ns: u64) -> Vec<u8> {
    let mut frame = vec![0; bytes as usize];
    frame[0..4].copy_from_slice(&0x5052_445au32.to_le_bytes());
    frame[4..8].copy_from_slice(&1u32.to_le_bytes());
    frame[8..16].copy_from_slice(&seq.to_le_bytes());
    frame[16..24].copy_from_slice(&produced_ns.to_le_bytes());
    frame[24..28].copy_from_slice(&bytes.to_le_bytes());
    for (index, byte) in frame.iter_mut().enumerate().skip(HEADER_BYTES as usize) {
        *byte = (index as u64).wrapping_add(seq) as u8;
    }
    frame
}

impl RegistryData {
    fn check_capacity(&self, owner: &str) -> Result<(), String> {
        if self.active.len() >= MAX_GLOBAL {
            return Err("realtime-probe-global-capacity".into());
        }
        if self.active.values().filter(|session| session.owner == owner).count() >= MAX_PER_WINDOW {
            return Err("realtime-probe-window-capacity".into());
        }
        Ok(())
    }

    fn remember(&mut self, id: String, owner: String, summary: ProbeSummary) {
        if self.finished.iter().any(|entry| entry.0 == id) {
            return;
        }
        if self.finished.len() == FINISHED_HISTORY {
            self.finished.pop_front();
        }
        self.finished.push_back((id, owner, summary));
    }
}

impl Session {
    fn new(owner: String, mode: ProbeMode, bytes: u32) -> Self {
        Self {
            owner,
            mode,
            bytes,
            data: Mutex::new(SessionData::default()),
            wake: Condvar::new(),
            worker: Mutex::new(None),
        }
    }

    fn stop(&self) -> ProbeSummary {
        let mut data = self.data.lock().unwrap_or_else(|error| error.into_inner());
        data.closed = true;
        data.latest = None;
        data.pending = None;
        data.summary.retained_bytes = 0;
        self.wake.notify_all();
        data.summary
    }

    fn join(&self) -> Result<(), String> {
        let worker = self.worker.lock().map_err(|_| "realtime-probe-worker-poisoned")?.take();
        if let Some(worker) = worker {
            worker.join().map_err(|_| "realtime-probe-worker-panicked")?;
        }
        Ok(())
    }

    fn pull(&self, after: u64) -> Result<Vec<u8>, String> {
        if self.mode != ProbeMode::Pull {
            return Err("realtime-probe-mode-mismatch: pull requires pull mode".into());
        }
        let mut data = self.data.lock().map_err(|_| "realtime-probe-session-poisoned")?;
        let Some((seq, frame)) = &data.latest else {
            return Ok(Vec::new());
        };
        if *seq <= after {
            return Ok(Vec::new());
        }
        let seq = *seq;
        let bytes = frame.as_ref().clone();
        data.last_sent = seq;
        data.summary.sent += 1;
        Ok(bytes)
    }

    fn receipt(&self, through: u64) -> Result<(), String> {
        if self.mode != ProbeMode::Credit {
            return Err("realtime-probe-mode-mismatch: receipt requires credit mode".into());
        }
        let mut data = self.data.lock().map_err(|_| "realtime-probe-session-poisoned")?;
        if data.closed || data.pending != Some(through) {
            return Err("realtime-probe-invalid-receipt: expected the exact pending sequence".into());
        }
        data.pending = None;
        self.wake.notify_one();
        Ok(())
    }
}

impl SessionData {
    fn retain(&mut self, seq: u64, frame: Vec<u8>) {
        if self.latest.as_ref().is_some_and(|(previous, _)| *previous > self.last_sent) {
            self.summary.coalesced += 1;
        }
        self.summary.retained_bytes = frame.len() as u64;
        self.latest = Some((seq, Arc::new(frame)));
    }

    fn send_credit(&mut self, channel: &Channel<Response>) -> bool {
        if self.pending.is_some() {
            return true;
        }
        let Some((seq, frame)) = &self.latest else {
            return true;
        };
        if *seq <= self.last_sent {
            return true;
        }
        let seq = *seq;
        self.pending = Some(seq);
        if channel.send(Response::new(frame.as_ref().clone())).is_err() {
            self.pending = None;
            self.summary.dropped += 1;
            return false;
        }
        self.last_sent = seq;
        self.summary.sent += 1;
        true
    }
}

impl Registry {
    fn session(&self, owner: &str, id: &str) -> Result<Arc<Session>, String> {
        let data = self.data.lock().map_err(|_| "realtime-probe-registry-poisoned")?;
        let session = data.active.get(id).ok_or("realtime-probe-not-active")?;
        require_owner(owner, &session.owner)?;
        Ok(Arc::clone(session))
    }

    fn retire(&self, id: &str, session: &Session) {
        let summary = session.stop();
        let mut data = self.data.lock().unwrap_or_else(|error| error.into_inner());
        data.active.remove(id);
        data.remember(id.to_owned(), session.owner.clone(), summary);
    }

    fn close(&self, owner: &str, id: &str) -> Result<ProbeSummary, String> {
        let session = {
            let data = self.data.lock().map_err(|_| "realtime-probe-registry-poisoned")?;
            if let Some(session) = data.active.get(id) {
                require_owner(owner, &session.owner)?;
                Arc::clone(session)
            } else if let Some((_, previous_owner, summary)) = data.finished.iter().find(|entry| entry.0 == id) {
                require_owner(owner, previous_owner)?;
                return Ok(*summary);
            } else {
                // Unknown/expired IDs have no resources to release and disclose no other owner's data.
                return Ok(ProbeSummary::default());
            }
        };
        session.stop();
        session.join()?;
        self.retire(id, &session);
        let summary = session.data.lock().map_err(|_| "realtime-probe-session-poisoned")?.summary;
        Ok(summary)
    }
}

impl Drop for Registry {
    fn drop(&mut self) {
        let data = self.data.get_mut().unwrap_or_else(|error| error.into_inner());
        for session in data.active.values() {
            session.stop();
        }
        for session in data.active.values() {
            let _ = session.join();
        }
    }
}

impl RealtimeProbeService {
    pub fn close_window(&self, owner: &str) {
        if !cfg!(debug_assertions) {
            return;
        }
        let sessions = {
            let mut data = self.registry.data.lock().unwrap_or_else(|error| error.into_inner());
            data.finished.retain(|entry| entry.1 != owner);
            data.active.values().filter(|session| session.owner == owner).cloned().collect::<Vec<_>>()
        };
        for session in sessions {
            session.stop();
        }
    }
}

fn publish(registry: Weak<Registry>, id: String, session: Arc<Session>, channel: Option<Channel<Response>>) {
    let started = Instant::now();
    let expires = started + MAX_DURATION;
    let mut next = started;
    loop {
        let mut data = session.data.lock().unwrap_or_else(|error| error.into_inner());
        if data.closed || data.summary.published >= MAX_FRAMES || Instant::now() >= expires {
            break;
        }
        let now = Instant::now();
        if now >= next {
            let Ok(produced_ns) = monotonic_ns() else { break };
            let seq = u64::from(data.summary.published) + 1;
            let frame = encode_frame(session.bytes, seq, produced_ns);
            data.summary.published += 1;
            if session.mode == ProbeMode::Channel {
                let Some(channel) = &channel else { break };
                if channel.send(Response::new(frame)).is_err() {
                    data.summary.dropped += 1;
                    break;
                }
                data.last_sent = seq;
                data.summary.sent += 1;
            } else {
                data.retain(seq, frame);
            }
            // Pace from the actual tick: a late producer never emits a catch-up burst.
            next = Instant::now() + PERIOD;
        }
        if session.mode == ProbeMode::Credit {
            let Some(channel) = &channel else { break };
            if !data.send_credit(channel) {
                break;
            }
        }
        let wait = next.min(expires).saturating_duration_since(Instant::now());
        drop(session.wake.wait_timeout(data, wait).unwrap_or_else(|error| error.into_inner()));
    }
    session.stop();
    drop(channel);
    if let Some(registry) = registry.upgrade() {
        registry.retire(&id, &session);
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn realtime_probe_open(
    window: WebviewWindow,
    service: State<'_, RealtimeProbeService>,
    bytes: u32,
    mode: ProbeMode,
    channel: Channel<Response>,
) -> Result<ProbeOpened, String> {
    require_debug()?;
    validate_bytes(bytes)?;
    monotonic_ns()?;
    let owner = window.label().to_owned();
    let id = uuid::Uuid::new_v4().to_string();
    let session = Arc::new(Session::new(owner.clone(), mode, bytes));
    let mut data = service.registry.data.lock().map_err(|_| "realtime-probe-registry-poisoned")?;
    data.check_capacity(&owner)?;
    data.active.insert(id.clone(), Arc::clone(&session));
    let registry = Arc::downgrade(&service.registry);
    let worker_session = Arc::clone(&session);
    let worker_id = id.clone();
    let channel = if mode == ProbeMode::Pull { None } else { Some(channel) };
    let worker = thread::Builder::new().name("realtime-ipc-probe".into())
        .spawn(move || publish(registry, worker_id, worker_session, channel));
    match worker {
        Ok(worker) => {
            *session.worker.lock().map_err(|_| "realtime-probe-worker-poisoned")? = Some(worker);
            Ok(ProbeOpened { id, bytes })
        }
        Err(error) => {
            data.active.remove(&id);
            Err(format!("realtime-probe-thread-start: {error}"))
        }
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn realtime_probe_pull(
    window: WebviewWindow,
    service: State<'_, RealtimeProbeService>,
    id: String,
    after_seq: String,
) -> Result<Response, String> {
    require_debug()?;
    let after = parse_seq(&after_seq)?;
    let session = service.registry.session(window.label(), &id)?;
    Ok(Response::new(session.pull(after)?))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn realtime_probe_receipt(
    window: WebviewWindow,
    service: State<'_, RealtimeProbeService>,
    id: String,
    through_seq: String,
) -> Result<(), String> {
    require_debug()?;
    let through = parse_seq(&through_seq)?;
    service.registry.session(window.label(), &id)?.receipt(through)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn realtime_probe_close(
    window: WebviewWindow,
    service: State<'_, RealtimeProbeService>,
    id: String,
) -> Result<ProbeSummary, String> {
    require_debug()?;
    let registry = Arc::clone(&service.registry);
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || registry.close(&owner, &id)).await
        .map_err(|error| format!("realtime-probe-close-task: {error}"))?
}

#[tauri::command]
pub fn realtime_probe_clock() -> Result<ProbeClock, String> {
    require_debug()?;
    Ok(ProbeClock { monotonic_ns: monotonic_ns()?.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::ipc::{InvokeResponseBody, IpcResponse};

    #[test]
    fn frame_layout_and_pattern_are_exact() {
        let seq = (1u64 << 53) + 7;
        let frame = encode_frame(33_792, seq, u64::MAX - 9);
        assert_eq!(frame.len(), 33_792);
        assert_eq!(&frame[0..4], &0x5052_445au32.to_le_bytes());
        assert_eq!(&frame[4..8], &1u32.to_le_bytes());
        assert_eq!(&frame[8..16], &seq.to_le_bytes());
        assert_eq!(&frame[16..24], &(u64::MAX - 9).to_le_bytes());
        assert_eq!(&frame[24..28], &33_792u32.to_le_bytes());
        assert_eq!(&frame[28..32], &[0; 4]);
        for index in [32, 33, 16_896, 33_791] {
            assert_eq!(frame[index], (index as u64).wrapping_add(seq) as u8);
        }
        assert!(matches!(Response::new(frame).body().unwrap(), InvokeResponseBody::Raw(_)));
    }

    #[test]
    fn boundary_values_reject_without_truncation() {
        assert!(validate_bytes(31).is_err());
        assert!(validate_bytes(32).is_ok());
        assert!(validate_bytes(MAX_BYTES).is_ok());
        assert!(validate_bytes(MAX_BYTES + 1).is_err());
        assert_eq!(parse_seq("18446744073709551615").unwrap(), u64::MAX);
        for value in ["", "-1", "+1", "1.0", " 1", "18446744073709551616"] {
            assert!(parse_seq(value).is_err());
        }
    }

    #[test]
    fn capacity_and_identity_are_window_scoped() {
        let mut registry = RegistryData::default();
        for (id, owner) in [("a", "one"), ("b", "one")] {
            registry.active.insert(id.into(), Arc::new(Session::new(owner.into(), ProbeMode::Pull, 32)));
        }
        assert!(registry.check_capacity("one").is_err());
        assert!(registry.check_capacity("two").is_ok());
        for id in ["c", "d"] {
            registry.active.insert(id.into(), Arc::new(Session::new("two".into(), ProbeMode::Pull, 32)));
        }
        assert!(registry.check_capacity("three").is_err());
        assert!(require_owner("one", "two").is_err());
        assert!(require_owner("one", "one").is_ok());
    }

    #[test]
    fn close_cannot_mutate_other_owner_and_is_idempotent() {
        let registry = Registry::default();
        let session = Arc::new(Session::new("one".into(), ProbeMode::Pull, 32));
        session.data.lock().unwrap().retain(1, encode_frame(32, 1, 0));
        registry.data.lock().unwrap().active.insert("a".into(), Arc::clone(&session));
        assert!(registry.close("two", "a").is_err());
        assert!(!session.data.lock().unwrap().closed);
        assert!(registry.session("two", "a").is_err());
        let first = registry.close("one", "a").unwrap();
        assert_eq!(first.retained_bytes, 0);
        assert_eq!(registry.close("one", "a").unwrap(), first);
        assert!(registry.close("two", "a").is_err());
        assert!(registry.session("one", "a").is_err());
        assert_eq!(registry.close("one", "absent").unwrap(), ProbeSummary::default());
    }

    #[test]
    fn credit_coalesces_latest_and_requires_exact_receipt() {
        let channel = Channel::<Response>::new(|body| {
            assert!(matches!(body, InvokeResponseBody::Raw(_)));
            Ok(())
        });
        let session = Session::new("one".into(), ProbeMode::Credit, 32);
        {
            let mut data = session.data.lock().unwrap();
            data.retain(1, encode_frame(32, 1, 0));
            assert!(data.send_credit(&channel));
            data.retain(2, encode_frame(32, 2, 0));
            data.retain(3, encode_frame(32, 3, 0));
            assert!(data.send_credit(&channel));
            assert_eq!(data.summary.sent, 1);
            assert_eq!(data.summary.coalesced, 1);
            assert_eq!(data.summary.retained_bytes, 32);
        }
        assert!(session.receipt(3).is_err());
        session.receipt(1).unwrap();
        assert!(session.receipt(1).is_err());
        let mut data = session.data.lock().unwrap();
        assert!(data.send_credit(&channel));
        assert_eq!(data.pending, Some(3));
        assert_eq!(data.summary.sent, 2);
    }

    #[test]
    fn pull_returns_only_new_latest_and_wrong_modes_reject() {
        let session = Session::new("one".into(), ProbeMode::Pull, 32);
        assert!(session.pull(0).unwrap().is_empty());
        session.data.lock().unwrap().retain(3, encode_frame(32, 3, 0));
        assert_eq!(session.pull(2).unwrap().len(), 32);
        assert!(session.pull(3).unwrap().is_empty());
        assert!(session.receipt(3).is_err());
        session.stop();
        assert!(session.pull(0).unwrap().is_empty());
        let channel = Session::new("one".into(), ProbeMode::Channel, 32);
        assert!(channel.pull(0).is_err());
    }

    #[test]
    fn terminal_metadata_is_bounded_and_release_builds_reject() {
        let mut registry = RegistryData::default();
        for id in 0..100 {
            registry.remember(id.to_string(), "one".into(), ProbeSummary::default());
        }
        assert_eq!(registry.finished.len(), FINISHED_HISTORY);
        assert_eq!(require_debug().is_ok(), cfg!(debug_assertions));
    }

    #[test]
    fn publisher_emits_real_frames_and_close_joins_without_new_delivery() {
        let registry = Arc::new(Registry::default());
        let session = Arc::new(Session::new("one".into(), ProbeMode::Channel, 33792));
        registry.data.lock().unwrap().active.insert("worker".into(), Arc::clone(&session));
        let (send, receive) = std::sync::mpsc::channel();
        let channel = Channel::<Response>::new(move |body| {
            if let InvokeResponseBody::Raw(bytes) = body { let _ = send.send(bytes); }
            Ok(())
        });
        let worker_session = Arc::clone(&session);
        let weak = Arc::downgrade(&registry);
        let worker = thread::spawn(move || publish(weak, "worker".into(), worker_session, Some(channel)));
        *session.worker.lock().unwrap() = Some(worker);
        let first = receive.recv_timeout(Duration::from_secs(2)).unwrap();
        let second = receive.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(first.len(), 33792);
        assert_eq!(u64::from_le_bytes(first[8..16].try_into().unwrap()), 1);
        assert_eq!(u64::from_le_bytes(second[8..16].try_into().unwrap()), 2);
        assert!(u64::from_le_bytes(second[16..24].try_into().unwrap()) > u64::from_le_bytes(first[16..24].try_into().unwrap()));
        let summary = registry.close("one", "worker").unwrap();
        assert!(summary.sent >= 2);
        assert_eq!(summary.retained_bytes, 0);
        while receive.try_recv().is_ok() {}
        assert!(matches!(receive.recv_timeout(Duration::from_millis(100)), Err(std::sync::mpsc::RecvTimeoutError::Disconnected)));
    }
}
