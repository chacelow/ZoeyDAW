//! JSON port matching `apps/gpuix/src/project/model/backend.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "u64", into = "u64")]
pub struct ProtocolVersion;

impl TryFrom<u64> for ProtocolVersion {
    type Error = &'static str;

    fn try_from(value: u64) -> Result<Self, Self::Error> {
        if value == 1 {
            Ok(Self)
        } else {
            Err("protocolVersion must be 1")
        }
    }
}

impl From<ProtocolVersion> for u64 {
    fn from(_: ProtocolVersion) -> Self {
        1
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationPoint {
    pub id: String,
    pub bar: f64,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curve: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AutomationParameter {
    Volume,
    Pan,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationLane {
    pub id: String,
    pub parameter: AutomationParameter,
    pub points: Vec<AutomationPoint>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiNote {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub pitch: f64,
    pub start_beat: f64,
    pub length_beats: f64,
    pub velocity: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendClipBase {
    pub id: String,
    pub start_bar: f64,
    pub length_bars: f64,
    pub source_offset_bars: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendAudioClip {
    pub id: String,
    pub start_bar: f64,
    pub length_bars: f64,
    pub source_offset_bars: f64,
    pub source_id: Option<String>,
    pub gain_db: f64,
    pub fade_in_bars: f64,
    pub fade_out_bars: f64,
    pub fade_in_offset_bars: f64,
    pub fade_out_offset_bars: f64,
    pub fade_in_curve: f64,
    pub fade_out_curve: f64,
    pub fade_in_curve_position: f64,
    pub fade_out_curve_position: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendMidiClip {
    pub id: String,
    pub start_bar: f64,
    pub length_bars: f64,
    pub source_offset_bars: f64,
    pub notes: Vec<MidiNote>,
    pub loop_bars: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendPatternClip {
    pub id: String,
    pub start_bar: f64,
    pub length_bars: f64,
    pub source_offset_bars: f64,
    pub steps: Vec<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum BackendClip {
    Audio(BackendAudioClip),
    Midi(BackendMidiClip),
    Pattern(BackendPatternClip),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendSource {
    pub id: String,
    pub uri: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Audio,
    Midi,
    Group,
    Return,
    Main,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Monitor {
    In,
    Auto,
    Off,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendTrack {
    pub id: String,
    pub kind: TrackKind,
    pub output: String,
    pub input: String,
    pub input_channel: Option<String>,
    pub output_channel: Option<String>,
    pub monitor: Monitor,
    pub volume_db: f64,
    pub pan: f64,
    pub mute: bool,
    pub solo: bool,
    pub armed: bool,
    pub sends: BTreeMap<String, f64>,
    pub return_post: bool,
    pub cue_output: Option<String>,
    pub cue_volume_db: f64,
    pub clips: Vec<BackendClip>,
    pub automation: Vec<AutomationLane>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendLoopRegion {
    pub enabled: bool,
    pub start_bar: f64,
    pub end_bar: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendProject {
    pub bpm: f64,
    pub numerator: u64,
    pub denominator: u64,
    #[serde(rename = "loop")]
    pub loop_region: BackendLoopRegion,
    pub sources: Vec<BackendSource>,
    pub tracks: Vec<BackendTrack>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendControl {
    pub playing: bool,
    pub recording: bool,
    pub seek_bar: f64,
    pub seek_generation: u64,
    pub held_notes: Vec<u8>,
    pub midi_velocity: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendState {
    pub project: BackendProject,
    pub control: BackendControl,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackendStage {
    Open,
    Commit,
    Preview,
    Cancel,
    Transport,
    Recover,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendRequest {
    pub protocol_version: ProtocolVersion,
    pub session_id: String,
    pub sequence: u64,
    pub base_revision: u64,
    pub revision: u64,
    pub stage: BackendStage,
    pub edit_id: Option<String>,
    pub state: BackendState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackendFailureCode {
    Rejected,
    Connection,
    Protocol,
    Disposed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum BackendResult {
    Accepted {
        session_id: String,
        sequence: u64,
        revision: u64,
    },
    Rejected {
        session_id: String,
        sequence: u64,
        code: BackendFailureCode,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum BackendClock {
    Musical {
        bar: f64,
        bars_per_second: f64,
    },
    Sample {
        bar: f64,
        bars_per_second: f64,
        frame: u64,
        sample_rate: u32,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendTelemetry {
    pub session_id: String,
    pub sequence: u64,
    pub applied_sequence: u64,
    pub clock: BackendClock,
    pub playing: bool,
    pub recording: bool,
    pub levels: BTreeMap<String, [f64; 2]>,
    pub output_latency_frames: Option<u64>,
}

/// Mirrors the mock backend, not a second document editor. `open` is accepted
/// only once with sequence/base/target revision zero. Later requests require
/// the same session, a strictly increasing (not necessarily contiguous)
/// sequence and the current base revision. Rejections change nothing.
///
/// Every stage replaces the entire effective state. In particular, `cancel`
/// restores the committed project supplied by the caller; it does not roll
/// back control or retain an internal document snapshot. Only open/commit/
/// recover assign the target revision, without enforcing a +1 increment.
/// Disposal is terminal, including for subsequent open requests.
#[derive(Debug, Default)]
pub struct SessionFence {
    session_id: Option<String>,
    last_sequence: Option<u64>,
    accepted_revision: u64,
    state: Option<BackendState>,
    disposed: bool,
}

impl SessionFence {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
    pub fn last_sequence(&self) -> Option<u64> {
        self.last_sequence
    }
    pub fn accepted_revision(&self) -> u64 {
        self.accepted_revision
    }
    pub fn state(&self) -> Option<&BackendState> {
        self.state.as_ref()
    }

    pub fn dispose(&mut self) {
        self.disposed = true;
        self.state = None;
    }

    pub fn validate(&self, request: &BackendRequest) -> Result<(), BackendFailureCode> {
        let failure = if self.disposed {
            Some(BackendFailureCode::Disposed)
        } else if request.stage == BackendStage::Open {
            (self.state.is_some()
                || request.sequence != 0
                || request.revision != 0
                || request.base_revision != 0)
                .then_some(BackendFailureCode::Protocol)
        } else {
            (self.state.is_none()
                || self.session_id() != Some(request.session_id.as_str())
                || self
                    .last_sequence
                    .is_some_and(|last| request.sequence <= last)
                || request.base_revision != self.accepted_revision
                || self.state.as_ref().is_some_and(|state| {
                    request.state.control.seek_generation < state.control.seek_generation
                }))
                .then_some(BackendFailureCode::Protocol)
        };
        failure.map_or(Ok(()), Err)
    }

    pub fn apply(&mut self, request: &BackendRequest) -> BackendResult {
        if let Err(code) = self.validate(request) {
            return BackendResult::Rejected {
                session_id: request.session_id.clone(),
                sequence: request.sequence,
                code,
            };
        }
        if request.stage == BackendStage::Open {
            self.session_id = Some(request.session_id.clone());
        }
        self.last_sequence = Some(request.sequence);
        self.state = Some(request.state.clone());
        if matches!(
            request.stage,
            BackendStage::Open | BackendStage::Commit | BackendStage::Recover
        ) {
            self.accepted_revision = request.revision;
        }
        BackendResult::Accepted {
            session_id: request.session_id.clone(),
            sequence: request.sequence,
            revision: self.accepted_revision,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn fixture() -> Value {
        serde_json::from_str(
            r#"{
            "protocolVersion": 1, "sessionId": "project-1", "sequence": 0,
            "baseRevision": 0, "revision": 0, "stage": "open", "editId": null,
            "state": {
                "project": {
                    "bpm": 120.0, "numerator": 4, "denominator": 4,
                    "loop": {"enabled": true, "startBar": 1.0, "endBar": 5.0},
                    "sources": [{"id": "source", "uri": "file:///kick.wav"}],
                    "tracks": [{
                        "id": "audio-1", "kind": "audio", "output": "main", "input": "none",
                        "inputChannel": null, "outputChannel": null, "monitor": "auto",
                        "volumeDb": -6.0, "pan": 0.0, "mute": false, "solo": false,
                        "armed": false, "sends": {"return-a": -12.0}, "returnPost": true,
                        "cueOutput": null, "cueVolumeDb": 0.0,
                        "clips": [{
                            "id": "kick", "kind": "audio", "startBar": 1.0, "lengthBars": 4.0,
                            "sourceOffsetBars": 0.0, "sourceId": null, "gainDb": 0.0,
                            "fadeInBars": 0.1, "fadeOutBars": 0.2,
                            "fadeInOffsetBars": 0.0, "fadeOutOffsetBars": 0.0,
                            "fadeInCurve": 0.0, "fadeOutCurve": 0.0,
                            "fadeInCurvePosition": 0.5, "fadeOutCurvePosition": 0.5
                        }],
                        "automation": [{"id": "a1", "parameter": "volume", "points": [
                            {"id": "p1", "bar": 1.0, "value": 0.5},
                            {"id": "p2", "bar": 2.0, "value": 0.8, "curve": -0.3}
                        ]}]
                    }, {
                        "id": "midi-1", "kind": "midi", "output": "main", "input": "none",
                        "inputChannel": null, "outputChannel": null, "monitor": "in",
                        "volumeDb": 0.0, "pan": 0.0, "mute": false, "solo": false,
                        "armed": true, "sends": {}, "returnPost": false,
                        "cueOutput": "phones", "cueVolumeDb": -3.0,
                        "clips": [{"id": "notes", "kind": "midi", "startBar": 1.0,
                            "lengthBars": 2.0, "sourceOffsetBars": 0.0, "loopBars": 2.0,
                            "notes": [{"pitch": 60.0, "startBeat": 0.0, "lengthBeats": 1.0,
                                "velocity": 0.8}, {"id": "n2", "pitch": 64.0,
                                "startBeat": 1.0, "lengthBeats": 1.0, "velocity": 0.6}]}],
                        "automation": []
                    }]
                },
                "control": {"playing": true, "recording": false, "seekBar": 1.0,
                    "seekGeneration": 0, "heldNotes": [60, 64], "midiVelocity": 0.8}
            }
        }"#,
        )
        .unwrap()
    }

    fn request() -> BackendRequest {
        serde_json::from_value(fixture()).unwrap()
    }
    fn accepted(result: BackendResult, revision: u64) {
        assert!(
            matches!(result, BackendResult::Accepted { revision: actual, .. } if actual == revision)
        );
    }
    fn rejected(result: BackendResult, expected: BackendFailureCode) {
        assert!(matches!(result, BackendResult::Rejected { code, .. } if code == expected));
    }

    #[test]
    fn realistic_request_json_round_trip() {
        let original = fixture();
        let decoded: BackendRequest = serde_json::from_value(original.clone()).unwrap();
        assert_eq!(serde_json::to_value(&decoded).unwrap(), original);
        assert_eq!(
            serde_json::from_str::<BackendRequest>(&serde_json::to_string(&decoded).unwrap())
                .unwrap(),
            decoded
        );
    }

    #[test]
    fn protocol_version_must_be_literal_one() {
        for invalid in [json!(2), json!(0), json!("1"), json!(1.5), Value::Null] {
            let mut value = fixture();
            value["protocolVersion"] = invalid;
            assert!(serde_json::from_value::<BackendRequest>(value).is_err());
        }
    }

    #[test]
    fn clock_results_and_pattern_have_ts_tags_and_names() {
        let clock = BackendClock::Sample {
            bar: 2.0,
            bars_per_second: 0.5,
            frame: 96000,
            sample_rate: 48000,
        };
        assert_eq!(
            serde_json::to_value(&clock).unwrap(),
            json!({"kind":"sample", "bar":2.0,
            "barsPerSecond":0.5, "frame":96000, "sampleRate":48000})
        );
        let result = BackendResult::Accepted {
            session_id: "s".into(),
            sequence: 1,
            revision: 2,
        };
        assert_eq!(
            serde_json::to_value(result).unwrap(),
            json!({"kind":"accepted", "sessionId":"s", "sequence":1, "revision":2})
        );
        let clip: BackendClip = serde_json::from_value(json!({"kind":"pattern", "id":"p",
            "startBar":1.0, "lengthBars":1.0, "sourceOffsetBars":0.0, "steps":[true,false]}))
        .unwrap();
        assert!(matches!(clip, BackendClip::Pattern(_)));
    }

    #[test]
    fn fence_requires_open_and_rejects_invalid_open_without_mutation() {
        let mut fence = SessionFence::new();
        let mut req = request();
        req.stage = BackendStage::Transport;
        rejected(fence.apply(&req), BackendFailureCode::Protocol);
        req.stage = BackendStage::Open;
        for field in 0..3 {
            let mut invalid = req.clone();
            match field {
                0 => invalid.sequence = 1,
                1 => invalid.base_revision = 1,
                _ => invalid.revision = 1,
            }
            rejected(fence.apply(&invalid), BackendFailureCode::Protocol);
            assert_eq!(fence.state(), None);
        }
        accepted(fence.apply(&req), 0);
        req.session_id = "replacement".into();
        rejected(fence.apply(&req), BackendFailureCode::Protocol);
        assert_eq!(fence.session_id(), Some("project-1"));
    }

    #[test]
    fn fence_sequence_session_revision_and_disposal() {
        let mut fence = SessionFence::new();
        let mut req = request();
        accepted(fence.apply(&req), 0);
        req.stage = BackendStage::Commit;
        req.sequence = 1;
        req.revision = 1;
        accepted(fence.apply(&req), 1);
        let previous = fence.state().cloned();
        rejected(fence.apply(&req), BackendFailureCode::Protocol);
        req.sequence = 0;
        rejected(fence.apply(&req), BackendFailureCode::Protocol);
        req.sequence = 2;
        req.base_revision = 1;
        req.session_id = "wrong".into();
        rejected(fence.apply(&req), BackendFailureCode::Protocol);
        req.session_id = "project-1".into();
        req.base_revision = 0;
        rejected(fence.apply(&req), BackendFailureCode::Protocol);
        assert_eq!(fence.state(), previous.as_ref());
        assert_eq!(fence.last_sequence(), Some(1));
        req.sequence = 5;
        req.base_revision = 1;
        req.revision = 9;
        req.stage = BackendStage::Recover;
        accepted(fence.apply(&req), 9);
        assert_eq!(fence.accepted_revision(), 9);
        fence.dispose();
        rejected(fence.apply(&req), BackendFailureCode::Disposed);
        req = request();
        rejected(fence.apply(&req), BackendFailureCode::Disposed);
        fence.dispose();
        assert!(fence.state().is_none());
    }

    #[test]
    fn preview_cancel_applies_supplied_committed_state_and_preserves_revision() {
        let mut fence = SessionFence::new();
        let mut req = request();
        let committed = req.state.clone();
        accepted(fence.apply(&req), 0);
        req.stage = BackendStage::Preview;
        req.sequence = 1;
        req.revision = 20;
        req.state.project.bpm = 150.0;
        accepted(fence.apply(&req), 0);
        assert_eq!(fence.state().unwrap().project.bpm, 150.0);
        req.stage = BackendStage::Cancel;
        req.sequence = 2;
        req.state = committed.clone();
        accepted(fence.apply(&req), 0);
        assert_eq!(fence.state(), Some(&committed));
        req.stage = BackendStage::Commit;
        req.sequence = 3;
        req.revision = 1;
        req.state.project.bpm = 140.0;
        accepted(fence.apply(&req), 1);
        req.stage = BackendStage::Transport;
        req.sequence = 4;
        req.base_revision = 1;
        req.state.control.playing = false;
        accepted(fence.apply(&req), 1);
        assert!(!fence.state().unwrap().control.playing);
    }
}
