use super::{NativeMeterReader, NativeMeterRegistry};
use crate::realtime::{
    metadata_generated::SourceRegistryEntry,
    protocol_generated::{WireSource, SOURCE_FLAGS_UNAVAILABLE},
};
use std::{
    collections::{HashMap, HashSet},
    ffi::c_void,
};

extern "C" {
    fn zp_meter_read_sources(
        handle: *mut c_void,
        reference_sample: u64,
        device_sample: u64,
        device_rate: f64,
        arrangement_playing: u32,
        output: *mut WireSource,
        capacity: u32,
    ) -> u32;
}

impl NativeMeterRegistry {
    pub(super) fn validate_sources(&self) -> Result<(), String> {
        let mut clips = HashSet::new();
        let mut clip_ids = HashSet::new();
        let mut handles = HashMap::new();
        let mut source_ids = HashMap::new();
        for source in &self.sources {
            if source.clip_handle == 0
                || source.source_handle == 0
                || source.source_generation == 0
                || source.clip_id.is_empty()
                || source.source_id.is_empty()
                || !clips.insert(source.clip_handle)
                || !clip_ids.insert(&source.clip_id)
            {
                return Err("Invalid native source registry identity".into());
            }
            let identity = (
                &source.source_id,
                source.source_generation,
                source.source_rate,
                &source.owner,
            );
            if handles
                .insert(source.source_handle, identity)
                .is_some_and(|prior| prior != identity)
                || source_ids
                    .insert(&source.source_id, source.source_handle)
                    .is_some_and(|prior| prior != source.source_handle)
            {
                return Err("Inconsistent native source registry mapping".into());
            }
        }
        Ok(())
    }
}

fn unavailable(source: &SourceRegistryEntry, sample: u64) -> WireSource {
    WireSource {
        clip_handle: source.clip_handle,
        source_handle: source.source_handle,
        source_frame: 0.0,
        source_rate: source.source_rate.get(),
        observed_device_sample: sample,
        source_generation: source.source_generation,
        flags: SOURCE_FLAGS_UNAVAILABLE as u32,
        position_age_samples: 0,
        reserved: 0,
    }
}

impl NativeMeterReader {
    pub fn read_sources(
        &mut self,
        sources: &[SourceRegistryEntry],
        audio: Option<&super::NativeTransportObservation>,
        rate: f64,
    ) -> Result<Vec<WireSource>, String> {
        let (reference, sample, playing) = audio.map_or((0, 0, 0), |audio| {
            (
                audio.reference_sample,
                audio.device_sample,
                u32::from(audio.playing == 1),
            )
        });
        if sources.is_empty() {
            return Ok(Vec::new());
        }
        let capacity =
            u32::try_from(sources.len()).map_err(|_| "Source snapshot capacity exceeded")?;
        self.source_records
            .resize_with(sources.len(), || unavailable(&sources[0], sample));
        let received = unsafe {
            zp_meter_read_sources(
                self.handle.as_ptr(),
                reference,
                sample,
                rate,
                playing,
                self.source_records.as_mut_ptr(),
                capacity,
            )
        };
        if received == 0 {
            return Ok(sources
                .iter()
                .map(|source| unavailable(source, sample))
                .collect());
        }
        if received != capacity {
            return Err("Native source snapshot has an invalid record count".into());
        }
        sources
            .iter()
            .zip(self.source_records.iter().copied())
            .map(|(mapping, source)| {
                if source.clip_handle != mapping.clip_handle
                    || source.source_handle != mapping.source_handle
                    || source.source_generation != mapping.source_generation
                    || source.source_rate != mapping.source_rate.get()
                {
                    return Ok(unavailable(mapping, sample));
                }
                if !source.source_frame.is_finite()
                    || source.source_frame < 0.0
                    || source.reserved != 0
                    || (mapping.owner
                        == crate::realtime::metadata_generated::SourceOwner::Arrangement
                        && (source.observed_device_sample > sample
                            || (source.flags
                                & crate::realtime::protocol_generated::SOURCE_FLAGS_VALID as u32
                                != 0
                                && (audio.is_none()
                                    || sample - source.observed_device_sample
                                        != u64::from(source.position_age_samples)))))
                {
                    return Err("Invalid native source observation".into());
                }
                Ok(source)
            })
            .collect()
    }
}
