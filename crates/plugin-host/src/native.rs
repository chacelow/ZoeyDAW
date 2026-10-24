use crate::quantum::{MidiMessage, QuantumAudio, QuantumError};
use plughost::{
    AutomationEvent, BarPosition, Event, ParameterChange, RealtimeOutput, TimeSignature, Transport,
};
use std::{ffi::c_void, marker::PhantomData};
use zoeydaw_plugin_abi::{NativeBlock, NativeMidi, OwnedNativeProcessor};


#[repr(C)]
pub struct NativeCallback<'a> {
    pub context: *mut c_void,
    pub process: unsafe extern "C" fn(*mut c_void, *mut NativeBlock) -> i32,
    borrowed: PhantomData<&'a mut NativeProcessor>,
}


pub struct NativeProcessor {
    audio: QuantumAudio,
    midi: Vec<MidiMessage>,
    automation: Vec<AutomationEvent>,
    produced: Vec<Event>,
}

impl NativeProcessor {
    pub fn new(audio: QuantumAudio) -> Self {
        Self {
            audio,
            midi: Vec::with_capacity(4096),
            automation: Vec::with_capacity(4096),
            produced: Vec::with_capacity(8192),
        }
    }

    pub fn callback(&mut self) -> NativeCallback<'_> {
        NativeCallback {
            context: (self as *mut Self).cast(),
            process,
            borrowed: PhantomData,
        }
    }

    /// Transfers the processor to a native control-thread owner.
    ///
    /// # Safety
    /// The receiver must serialize processing and release exactly once, off the audio thread,
    /// after all graph references have retired. The descriptor must never be copied or reused.
    pub unsafe fn into_owned(self) -> OwnedNativeProcessor {
        OwnedNativeProcessor {
            context: Box::into_raw(Box::new(self)).cast(),
            process,
            release: release_processor,
        }
    }

    unsafe fn process(&mut self, block: &mut NativeBlock) -> i32 {
        block.produced_count = 0;
        let frames = block.frames as usize;
        let input_count = block.input_channels as usize;
        let output_count = block.output_channels as usize;
        if frames == 0
            || frames > 4096
            || input_count > 64
            || output_count == 0
            || output_count > 64
            || (input_count > 0 && block.inputs.is_null())
            || block.outputs.is_null()
        {
            return -1;
        }
        if block.midi_count > 4096
            || block.automation_count > 4096 - block.midi_count
            || block.produced_capacity < 8192
            || block.produced.is_null()
            || (block.midi_count > 0 && block.midi.is_null())
            || (block.automation_count > 0 && block.automation.is_null())
        {
            return -2;
        }
        let mut inputs: [&[f32]; 64] = [&[]; 64];
        let mut outputs: [&mut [f32]; 64] = std::array::from_fn(|_| &mut [][..]);
        for (index, view) in inputs[..input_count].iter_mut().enumerate() {
            let pointer = unsafe { *block.inputs.add(index) };
            if pointer.is_null() {
                return -1;
            }
            // SAFETY: caller owns a readable, disjoint channel of frames samples for this call.
            *view = unsafe { std::slice::from_raw_parts(pointer, frames) };
        }
        for (index, view) in outputs[..output_count].iter_mut().enumerate() {
            let pointer = unsafe { *block.outputs.add(index) };
            if pointer.is_null() {
                return -1;
            }
            // SAFETY: caller grants exclusive access to each output channel; no channels alias.
            *view = unsafe { std::slice::from_raw_parts_mut(pointer, frames) };
        }
        let transport = if block.transport.is_null() {
            None
        } else {
            let value = unsafe { *block.transport };
            if value.flags & !63 != 0 {
                return -4;
            }
            let mut transport = Transport::new(value.sample_position, value.flags & 1 != 0);
            transport.beat_position = (value.flags & 2 != 0).then_some(value.beat_position);
            transport.tempo = (value.flags & 4 != 0).then_some(value.tempo);
            transport.bar_position = (value.flags & 8 != 0).then_some(BarPosition {
                start: value.bar_start,
                number: value.bar_number,
            });
            transport.time_signature = (value.flags & 16 != 0).then_some(TimeSignature {
                numerator: value.numerator,
                denominator: value.denominator,
            });
            transport.loop_region = (value.flags & 32 != 0).then_some(plughost::LoopRegion {
                start: value.loop_start,
                end: value.loop_end,
                sample_start: value.loop_sample_start,
                sample_end: value.loop_sample_end,
            });
            Some(transport)
        };
        self.midi.clear();
        self.automation.clear();
        self.produced.clear();
        for index in 0..block.midi_count as usize {
            let event = unsafe { *block.midi.add(index) };
            if event.reserved != 0 {
                return -3;
            }
            self.midi.push(MidiMessage {
                offset: event.offset as usize,
                port: event.port as usize,
                bytes: event.bytes,
            });
        }
        for index in 0..block.automation_count as usize {
            let event = unsafe { *block.automation.add(index) };
            self.automation.push(AutomationEvent {
                slot: event.slot as usize,
                change: ParameterChange {
                    id: event.parameter,
                    offset: event.offset as usize,
                    value: event.value,
                },
            });
        }
        let result = self.audio.process(
            &inputs[..input_count],
            &mut outputs[..output_count],
            frames,
            &self.midi,
            &self.automation,
            &mut self.produced,
            transport,
        );
        let status = match result {
            Ok(None) => 0,
            Ok(Some(RealtimeOutput::Processed)) => 1,
            Ok(Some(_)) => 2,
            Err(QuantumError::Format) => return -1,
            Err(QuantumError::EventCapacity) => return -2,
            Err(QuantumError::EventOffset) => return -3,
            Err(QuantumError::Transport) => return -4,
            Err(QuantumError::Processing(_)) => return -5,
        };
        if self.produced.iter().any(|event| {
            event.data.to_midi().is_none()
                || event.port > u32::MAX as usize
                || event.offset >= frames
        }) {
            return -6;
        }
        for (index, event) in self.produced.iter().enumerate() {
            let Some(bytes) = event.data.to_midi() else {
                return -6;
            };
            unsafe {
                block.produced.add(index).write(NativeMidi {
                    offset: event.offset as u32,
                    port: event.port as u32,
                    bytes,
                    reserved: 0,
                })
            };
        }
        block.produced_count = self.produced.len() as u32;
        status
    }
}

// SAFETY: the host serializes calls and retains the processor and disjoint block buffers.
unsafe extern "C" fn process(context: *mut c_void, block: *mut NativeBlock) -> i32 {
    if context.is_null() || block.is_null() {
        return -1;
    }
    unsafe { (&mut *context.cast::<NativeProcessor>()).process(&mut *block) }
}

// SAFETY: consumes exactly the allocation transferred by NativeProcessor::into_owned.
unsafe extern "C" fn release_processor(context: *mut c_void) {
    unsafe { drop(Box::from_raw(context.cast::<NativeProcessor>())) };
}
