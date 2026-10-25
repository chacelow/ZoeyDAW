use super::metadata_generated::{
    JsonU64, LatchedFault, RealtimeCounters, RealtimeEvent, RealtimeEventContext,
    RealtimeEventPayload,
};
use std::collections::{HashMap, VecDeque};

const RETAINED_EVENTS: usize = 4096;
const BATCH_EVENTS: usize = 64;
const STREAM_CAPACITY: usize = 64;

struct RetainedEvent {
    context: RealtimeEventContext,
    payload: RealtimeEventPayload,
}
struct Cursor {
    acknowledged: u64,
    in_flight: Option<u64>,
}

/// Non-audio owner. A receipt advances only its stream and cannot acknowledge unsent data.
pub struct EventLog {
    next_sequence: u64,
    retained: VecDeque<RetainedEvent>,
    streams: HashMap<u32, Cursor>,
    session: Option<(String, u32)>,
    dropped_events: u64,
}
impl Default for EventLog {
    fn default() -> Self {
        Self {
            next_sequence: 1,
            retained: VecDeque::new(),
            streams: HashMap::new(),
            session: None,
            dropped_events: 0,
        }
    }
}
impl EventLog {
    pub fn open(
        &mut self,
        stream_id: u32,
        session_id: &str,
        session_epoch: u32,
    ) -> Result<(), String> {
        if stream_id == 0 || self.streams.contains_key(&stream_id) {
            return Err("Invalid or duplicate realtime event stream".into());
        }
        if self.streams.len() >= STREAM_CAPACITY {
            return Err("Realtime event stream capacity reached".into());
        }
        let identity = (session_id.to_owned(), session_epoch);
        if session_id.is_empty()
            || self
                .session
                .as_ref()
                .is_some_and(|session| session != &identity)
        {
            return Err("Realtime event stream crossed session identity".into());
        }
        self.session = Some(identity);
        self.streams.insert(
            stream_id,
            Cursor {
                acknowledged: self.next_sequence - 1,
                in_flight: None,
            },
        );
        Ok(())
    }
    pub fn close(&mut self, stream_id: u32) {
        self.streams.remove(&stream_id);
        self.collect();
    }
    pub fn append(
        &mut self,
        mut context: RealtimeEventContext,
        payload: RealtimeEventPayload,
    ) -> Result<u64, String> {
        let identity = (context.session_id.clone(), context.session_epoch);
        if self
            .session
            .as_ref()
            .is_some_and(|session| session != &identity)
        {
            return Err("Event log cannot cross session identity".into());
        }
        self.session = Some(identity);
        let next = self
            .next_sequence
            .checked_add(1)
            .ok_or("Realtime event sequence exhausted")?;
        let sequence = self.next_sequence;
        context.seq = JsonU64(sequence);
        context.stream_id = 0;
        self.retained.push_back(RetainedEvent { context, payload });
        self.next_sequence = next;
        while self.retained.len() > RETAINED_EVENTS {
            self.retained.pop_front();
            self.dropped_events = self.dropped_events.saturating_add(1);
        }
        Ok(sequence)
    }
    pub fn batch(
        &mut self,
        stream_id: u32,
        context: &RealtimeEventContext,
        counters: &RealtimeCounters,
        faults: &[LatchedFault],
    ) -> Result<Vec<RealtimeEvent>, String> {
        let cursor = self
            .streams
            .get_mut(&stream_id)
            .ok_or("Unknown realtime event stream")?;
        if self.session.as_ref().is_some_and(|session| {
            session.0 != context.session_id || session.1 != context.session_epoch
        }) {
            return Err("Realtime event stream crossed session identity".into());
        }
        if cursor.in_flight.is_some() {
            return Ok(Vec::new());
        }
        let mut through = None;
        let mut batch = Vec::new();
        let first = self
            .retained
            .front()
            .map_or(self.next_sequence, |event| event.context.seq.0);
        if cursor.acknowledged < first.saturating_sub(1) {
            let gap_through = first - 1;
            let mut gap_counters = counters.clone();
            gap_counters.dropped_events = JsonU64(
                gap_counters
                    .dropped_events
                    .0
                    .saturating_add(self.dropped_events),
            );
            let mut gap_context = context.clone();
            gap_context.stream_id = stream_id;
            gap_context.seq = JsonU64(gap_through);
            batch.push(envelope(
                gap_context,
                &RealtimeEventPayload::EventGap {
                    from_seq: JsonU64(cursor.acknowledged + 1),
                    to_seq: JsonU64(gap_through),
                    counters: gap_counters,
                    latched_faults: faults.to_vec(),
                },
            )?);
            through = Some(first - 1);
        }
        for event in &self.retained {
            if event.context.seq.0 <= cursor.acknowledged {
                continue;
            }
            if event.context.session_id != context.session_id
                || event.context.session_epoch != context.session_epoch
            {
                return Err("Realtime event stream crossed session identity".into());
            }
            let mut event_context = event.context.clone();
            event_context.stream_id = stream_id;
            batch.push(envelope(event_context, &event.payload)?);
            through = Some(event.context.seq.0);
            if batch.len() == BATCH_EVENTS {
                break;
            }
        }
        cursor.in_flight = through;
        Ok(batch)
    }
    pub fn receipt(&mut self, stream_id: u32, through: u64) -> Result<(), String> {
        let cursor = self
            .streams
            .get_mut(&stream_id)
            .ok_or("Unknown realtime event stream")?;
        if through <= cursor.acknowledged {
            return Ok(());
        }
        if cursor.in_flight != Some(through) {
            return Err("Receipt does not match the sent realtime batch".into());
        }
        cursor.acknowledged = through;
        cursor.in_flight = None;
        self.collect();
        Ok(())
    }
    fn collect(&mut self) {
        let through = self
            .streams
            .values()
            .map(|cursor| cursor.acknowledged)
            .min()
            .unwrap_or(self.next_sequence - 1);
        while self
            .retained
            .front()
            .is_some_and(|event| event.context.seq.0 <= through)
        {
            self.retained.pop_front();
        }
    }
}
fn envelope(
    context: RealtimeEventContext,
    payload: &RealtimeEventPayload,
) -> Result<RealtimeEvent, String> {
    let mut value = serde_json::to_value(context).map_err(|error| error.to_string())?;
    let fields = serde_json::to_value(payload).map_err(|error| error.to_string())?;
    let target = value
        .as_object_mut()
        .ok_or("Invalid realtime event context")?;
    target.extend(
        fields
            .as_object()
            .ok_or("Invalid realtime event payload")?
            .clone(),
    );
    serde_json::from_value(value).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn context() -> RealtimeEventContext {
        RealtimeEventContext {
            session_id: "session".into(),
            session_epoch: 1,
            stream_id: 1,
            device_epoch: 1,
            generation: 2,
            registry_revision: 2,
            seq: JsonU64(0),
        }
    }
    fn counters() -> RealtimeCounters {
        RealtimeCounters {
            xruns: JsonU64(3),
            recording_overruns: JsonU64(0),
            note_overruns: JsonU64(0),
            automation_overruns: JsonU64(0),
            plugin_faults: JsonU64(0),
            dropped_events: JsonU64(1),
        }
    }
    fn append(log: &mut EventLog, count: u64) {
        for _ in 0..count {
            log.append(
                context(),
                RealtimeEventPayload::Xrun {
                    count: JsonU64(3),
                    device_sample: JsonU64(256),
                },
            )
            .unwrap();
        }
    }
    #[test]
    fn receipts_are_per_stream_exact_and_never_acknowledge_unsent_events() {
        let mut log = EventLog::default();
        log.open(1, "session", 1).unwrap();
        log.open(2, "session", 1).unwrap();
        append(&mut log, 70);
        assert_eq!(
            log.batch(1, &context(), &counters(), &[]).unwrap().len(),
            64
        );
        assert!(log
            .batch(1, &context(), &counters(), &[])
            .unwrap()
            .is_empty());
        assert!(log.receipt(1, 65).is_err());
        assert!(log.receipt(2, 64).is_err());
        assert_eq!(
            log.batch(2, &context(), &counters(), &[]).unwrap().len(),
            64
        );
        log.receipt(1, 64).unwrap();
        log.receipt(1, 64).unwrap();
        assert_eq!(log.batch(1, &context(), &counters(), &[]).unwrap().len(), 6);
        assert!(log
            .batch(2, &context(), &counters(), &[])
            .unwrap()
            .is_empty());
        log.receipt(2, 64).unwrap();
        log.close(1);
        assert_eq!(log.batch(2, &context(), &counters(), &[]).unwrap().len(), 6);
    }
    #[test]
    fn overflow_preserves_one_inflight_batch_then_reports_gap_with_latched_state() {
        let mut log = EventLog::default();
        log.open(1, "session", 1).unwrap();
        append(&mut log, 1);
        log.batch(1, &context(), &counters(), &[]).unwrap();
        append(&mut log, 5000);
        assert_eq!(log.retained.len(), RETAINED_EVENTS);
        assert!(log
            .batch(1, &context(), &counters(), &[])
            .unwrap()
            .is_empty());
        log.receipt(1, 1).unwrap();
        let batch = log.batch(1, &context(), &counters(), &[]).unwrap();
        assert_eq!(batch.len(), 64);
        match &batch[0] {
            RealtimeEvent::EventGap {
                from_seq,
                to_seq,
                counters,
                ..
            } => {
                assert_eq!(from_seq.0, 2);
                assert_eq!(to_seq.0, 905);
                assert_eq!(counters.xruns.0, 3);
                assert_eq!(counters.dropped_events.0, 906);
            }
            event => panic!("Expected explicit gap, got {event:?}"),
        }
        log.close(1);
        assert!(log.retained.is_empty());
        assert!(log.receipt(1, 969).is_err());
    }
    #[test]
    fn event_log_refuses_a_foreign_session_before_delivery() {
        let mut log = EventLog::default();
        log.open(1, "session", 1).unwrap();
        append(&mut log, 1);
        let mut foreign = context();
        foreign.session_id = "other".into();
        assert!(log.batch(1, &foreign, &counters(), &[]).is_err());
        assert!(log
            .append(
                foreign,
                RealtimeEventPayload::Xrun {
                    count: JsonU64(1),
                    device_sample: JsonU64(0)
                }
            )
            .is_err());
        assert_eq!(log.batch(1, &context(), &counters(), &[]).unwrap().len(), 1);
        assert!(log.batch(1, &foreign_context(), &counters(), &[]).is_err());
        assert!(log.open(2, "other", 1).is_err());
    }
    fn foreign_context() -> RealtimeEventContext {
        let mut value = context();
        value.session_id = "other".into();
        value
    }
}
