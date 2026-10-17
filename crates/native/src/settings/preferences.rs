use std::sync::LazyLock;

use napi_derive::napi;
use serde::{Deserialize, Serialize};

mod arrangement;
use arrangement::ArrangementPreferences;

#[napi(string_enum = "lowercase")]
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceGridMode {
    Adaptive,
    Fixed,
}

#[napi(string_enum = "lowercase")]
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceGridDensity {
    Widest,
    Wide,
    Medium,
    Narrow,
    Narrowest,
}

#[napi(string_enum = "kebab-case")]
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AudioWarpMode {
    Beats,
    Tones,
    Texture,
    #[napi(value = "repitch")]
    #[serde(rename = "repitch")]
    RePitch,
    Complex,
    ComplexPro,
}

#[napi(string_enum = "lowercase")]
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BrowserContentKind {
    All,
    Device,
    Preset,
    Sample,
    Midi,
    Clip,
    Groove,
    Tuning,
    Template,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspacePreferences {
    pub px_per_bar: f64,
    pub snap: bool,
    pub follow: bool,
    pub automation_mode: bool,
    pub draw_mode: bool,
    pub computer_keyboard: bool,
    pub link: bool,
    pub metronome: bool,
    #[napi(ts_type = "`${WorkspaceGridMode}`")]
    pub grid_mode: WorkspaceGridMode,
    #[napi(ts_type = "`${WorkspaceGridDensity}`")]
    pub grid_density: WorkspaceGridDensity,
    pub fixed_grid_bars: f64,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MidiPreferences {
    pub keyboard_octave: i32,
    pub minimum_octave: i32,
    pub maximum_octave: i32,
    pub velocity: u32,
    pub insert_length_beats: f64,
    pub draw_length_beats: f64,
    pub recorded_note_length_beats: f64,
    pub recorded_clip_bars: f64,
    pub note_grid_beats: f64,
    pub quantize_beats: f64,
    pub loop_step_bars: f64,
    pub octave_label_offset: i32,
    pub initial_pitch: u32,
    pub fold: bool,
    pub zoom: f64,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MidiViewportPreferences {
    pub horizontal_min: f64,
    pub horizontal_max: f64,
    pub horizontal_factor: f64,
    pub pitch_min: f64,
    pub pitch_max: f64,
    pub pitch_factor: f64,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioPreferences {
    pub warp: bool,
    #[napi(ts_type = "`${AudioWarpMode}`")]
    pub warp_mode: AudioWarpMode,
    pub transpose: i32,
    pub detune: i32,
    pub reverse: bool,
    #[serde(rename = "loop")]
    #[napi(js_name = "loop")]
    pub looping: bool,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransportPreferences {
    pub stop_repeat_ms: u32,
    pub tap_window_ms: u32,
    pub tap_samples: u32,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowPreferences {
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NumericInputPreferences {
    pub drag_pixels_per_step: f64,
    pub wheel_pixels_per_step: f64,
    pub wheel_line_pixels: f64,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PointerPreferences {
    pub drag_threshold_pixels: f64,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotificationPreferences {
    pub default_duration: u32,
    pub queue_limit: u32,
    pub visible_limit: u32,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserPreferences {
    pub favorites: Vec<String>,
    #[napi(ts_type = "`${BrowserContentKind}`")]
    pub kind: BrowserContentKind,
    pub descending: bool,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioDevicePreferences {
    pub sample_rate: u32,
    pub block_frames: u32,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub workspace: WorkspacePreferences,
    pub midi: MidiPreferences,
    pub midi_viewport: MidiViewportPreferences,
    pub audio: AudioPreferences,
    pub transport: TransportPreferences,
    pub history_capacity: u32,
    pub recent_project_capacity: u32,
    #[serde(default = "default_project_backup_count")]
    pub project_backup_count: u32,
    pub window: WindowPreferences,
    pub numeric_input: NumericInputPreferences,
    pub pointer: PointerPreferences,
    pub notifications: NotificationPreferences,
    pub browser: BrowserPreferences,
    pub audio_device: AudioDevicePreferences,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arrangement: Option<ArrangementPreferences>,
}

fn default_project_backup_count() -> u32 {
    PREFERENCE_DEFAULTS.project_backup_count
}

static PREFERENCE_DEFAULTS: LazyLock<Preferences> = LazyLock::new(|| {
    let preferences: Preferences = serde_json::from_str(include_str!(
        "../../../../apps/gpuix/src/project/defaults/preferences.json"
    ))
    .expect("shared preference defaults must match the Rust schema");
    preferences
        .validate()
        .expect("shared preference defaults must satisfy their ranges");
    preferences
});

#[napi]
pub fn preferences_defaults() -> Preferences {
    PREFERENCE_DEFAULTS.clone()
}

impl Preferences {
    pub(super) fn validate(&self) -> Result<(), String> {
        let positive = [
            ("workspace.pxPerBar", self.workspace.px_per_bar),
            ("workspace.fixedGridBars", self.workspace.fixed_grid_bars),
            ("midi.insertLengthBeats", self.midi.insert_length_beats),
            ("midi.drawLengthBeats", self.midi.draw_length_beats),
            ("midi.recordedNoteLengthBeats", self.midi.recorded_note_length_beats),
            ("midi.recordedClipBars", self.midi.recorded_clip_bars),
            ("midi.noteGridBeats", self.midi.note_grid_beats),
            ("midi.quantizeBeats", self.midi.quantize_beats),
            ("midi.loopStepBars", self.midi.loop_step_bars),
            ("midi.zoom", self.midi.zoom),
            ("midiViewport.horizontalMin", self.midi_viewport.horizontal_min),
            ("midiViewport.horizontalMax", self.midi_viewport.horizontal_max),
            ("midiViewport.pitchMin", self.midi_viewport.pitch_min),
            ("midiViewport.pitchMax", self.midi_viewport.pitch_max),
            ("numericInput.dragPixelsPerStep", self.numeric_input.drag_pixels_per_step),
            ("numericInput.wheelPixelsPerStep", self.numeric_input.wheel_pixels_per_step),
            ("numericInput.wheelLinePixels", self.numeric_input.wheel_line_pixels),
        ];
        for (name, value) in positive {
            if !value.is_finite() || value <= 0.0 {
                return Err(format!("{name} must be finite and positive"));
            }
        }
        for (name, value) in [
            ("midiViewport.horizontalFactor", self.midi_viewport.horizontal_factor),
            ("midiViewport.pitchFactor", self.midi_viewport.pitch_factor),
        ] {
            if !value.is_finite() || value <= 1.0 {
                return Err(format!("{name} must be finite and greater than one"));
            }
        }
        if self.midi_viewport.horizontal_min > self.midi_viewport.horizontal_max
            || self.midi_viewport.pitch_min > self.midi_viewport.pitch_max
        {
            return Err("midiViewport minimum must not exceed maximum".into());
        }
        if !self.pointer.drag_threshold_pixels.is_finite()
            || self.pointer.drag_threshold_pixels < 0.0
        {
            return Err("pointer.dragThresholdPixels must be finite and nonnegative".into());
        }
        if !(0..=10).contains(&self.midi.minimum_octave)
            || !(0..=10).contains(&self.midi.maximum_octave)
            || !(self.midi.minimum_octave..=self.midi.maximum_octave)
                .contains(&self.midi.keyboard_octave)
        {
            return Err("midi octave range must contain keyboardOctave within 0..10".into());
        }
        if !(1..=127).contains(&self.midi.velocity)
            || self.midi.initial_pitch > 127
        {
            return Err("midi velocity must be 1..127 and initialPitch 0..127".into());
        }
        if !(-48..=48).contains(&self.audio.transpose)
            || !(-50..=50).contains(&self.audio.detune)
        {
            return Err("audio transpose must be -48..48 and detune -50..50".into());
        }
        for (name, value) in [
            ("transport.stopRepeatMs", self.transport.stop_repeat_ms),
            ("transport.tapWindowMs", self.transport.tap_window_ms),
            ("historyCapacity", self.history_capacity),
            ("recentProjectCapacity", self.recent_project_capacity),
            ("window.width", self.window.width),
            ("window.height", self.window.height),
            ("notifications.defaultDuration", self.notifications.default_duration),
            ("notifications.queueLimit", self.notifications.queue_limit),
            ("notifications.visibleLimit", self.notifications.visible_limit),
            ("audioDevice.sampleRate", self.audio_device.sample_rate),
            ("audioDevice.blockFrames", self.audio_device.block_frames),
        ] {
            if value == 0 {
                return Err(format!("{name} must be positive"));
            }
        }
        if !(8_000..=384_000).contains(&self.audio_device.sample_rate)
            || self.audio_device.block_frames > 65_536
        {
            return Err("audioDevice sampleRate must be 8000..384000 and blockFrames 1..65536".into());
        }
        if self.transport.tap_samples < 2 {
            return Err("transport.tapSamples must be at least two".into());
        }
        if self.notifications.visible_limit > self.notifications.queue_limit {
            return Err("notifications.visibleLimit must not exceed queueLimit".into());
        }
        if self.browser.favorites.iter().any(String::is_empty) {
            return Err("browser favorite ids must not be empty".into());
        }
        if let Some(arrangement) = &self.arrangement {
            arrangement.validate()?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_domain_boundaries() {
        let mut preferences = preferences_defaults();
        preferences.midi.keyboard_octave = preferences.midi.minimum_octave;
        preferences.midi.initial_pitch = 0;
        preferences.midi.velocity = 1;
        preferences.audio.transpose = -48;
        preferences.audio.detune = 50;
        preferences.pointer.drag_threshold_pixels = 0.0;
        preferences.audio_device.sample_rate = 8_000;
        preferences.audio_device.block_frames = 1;
        assert_eq!(preferences.validate(), Ok(()));
    }

    #[test]
    fn rejects_nonfinite_preference_values() {
        let mut preferences = preferences_defaults();
        preferences.midi.zoom = f64::NAN;
        assert!(preferences.validate().is_err());
        preferences.midi.zoom = f64::INFINITY;
        assert!(preferences.validate().is_err());
    }
}
