use super::{
    channel::{ChannelPublication, EpochPublication},
    rms::EnergyEpoch,
};
use crate::PlaybackService;
use std::{
    ffi::{c_char, c_void, CString},
    ptr::NonNull,
    sync::atomic::Ordering,
};

mod sources;
mod transport;
pub use transport::{NativeStoppedTransport, NativeTransportObservation};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MeterGraphIdentity {
    pub device_epoch: u32,
    pub generation: u32,
    pub registry_revision: u32,
}
#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum NativeMeterGraph {
    Unprepared {
        #[serde(rename = "ownerEpoch")]
        owner_epoch: super::metadata_generated::JsonU64,
    },
    Prepared {
        #[serde(rename = "sampleRate")]
        sample_rate: super::metadata_generated::PositiveF64,
    },
}
impl NativeMeterGraph {
    pub fn sample_rate(self) -> Option<super::metadata_generated::PositiveF64> {
        match self {
            Self::Prepared { sample_rate } => Some(sample_rate),
            Self::Unprepared { .. } => None,
        }
    }
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeMeterRegistry {
    pub session_id: String,
    pub device_epoch: u32,
    pub generation: u32,
    pub registry_revision: u32,
    pub graph: NativeMeterGraph,
    pub entries: Vec<super::metadata_generated::MeterRegistryEntry>,
    pub sources: Vec<super::metadata_generated::SourceRegistryEntry>,
    pub input: Option<NativeInputRegistry>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeInputRegistry {
    pub device_epoch: u32,
    pub sample_rate: super::metadata_generated::PositiveF64,
    pub entries: Vec<super::metadata_generated::MeterRegistryEntry>,
}

impl NativeInputRegistry {
    pub(crate) fn validate(&self) -> Result<(), String> {
        let mut endpoints = std::collections::HashSet::new();
        if self.device_epoch == 0
            || self.entries.iter().enumerate().any(|(slot, entry)| {
                entry.slot_id as usize != slot
                    || entry.channel_count != 1
                    || entry.channel_index != 0
                    || entry.kind != super::metadata_generated::MeterEndpointKind::Input
                    || !endpoints.insert(&entry.endpoint_id)
            })
        {
            return Err("Invalid native input meter registry".into());
        }
        Ok(())
    }
}

impl NativeMeterRegistry {
    pub fn identity(&self) -> MeterGraphIdentity {
        MeterGraphIdentity {
            device_epoch: self.device_epoch,
            generation: self.generation,
            registry_revision: self.registry_revision,
        }
    }
    pub(crate) fn validate(&self, expected_session: &str) -> Result<(), String> {
        if matches!(self.graph, NativeMeterGraph::Unprepared { owner_epoch } if owner_epoch.0 == 0)
            || (self.graph.sample_rate().is_none() && !self.entries.is_empty())
            || self.generation == 0
            || self.registry_revision == 0
        {
            return Err("Invalid native meter graph state".into());
        }
        if self.session_id != expected_session {
            return Err("Native meter registry session changed".into());
        }
        if let Some(input) = self.input.as_ref() {
            input.validate()?;
        }
        self.validate_sources()?;
        let mut endpoints = std::collections::HashMap::new();
        for (slot, entry) in self.entries.iter().enumerate() {
            if entry.slot_id as usize != slot
                || entry.channel_count == 0
                || entry.channel_index >= entry.channel_count
            {
                return Err("Invalid native meter slot layout".into());
            }
            let group = endpoints.entry(&entry.endpoint_id).or_insert_with(|| {
                (
                    &entry.owner_id,
                    &entry.kind,
                    entry.channel_count,
                    std::collections::HashSet::new(),
                )
            });
            if group.0 != &entry.owner_id
                || group.1 != &entry.kind
                || group.2 != entry.channel_count
                || !group.3.insert(entry.channel_index)
            {
                return Err("Inconsistent native meter endpoint".into());
            }
        }
        if endpoints
            .values()
            .any(|(_, _, count, channels)| channels.len() != *count as usize)
        {
            return Err("Incomplete native meter channel layout".into());
        }
        Ok(())
    }
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct NativeEpoch {
    id: u64,
    start_sample: u64,
    end_sample: u64,
    frames: u64,
    clip_count: u64,
    sum_squares: f64,
    peak: f32,
    display_peak: f32,
    hold_reset_epoch: u32,
    valid: u32,
}
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct NativePublication {
    completed: NativeEpoch,
    current: NativeEpoch,
    session_peak: f32,
    completed_valid: u32,
    clip_count: u64,
    slot_reset_epoch: u32,
    hold_reset_epoch: u32,
    available: u32,
    reserved: u32,
}

extern "C" {
    fn zp_meter_acquire(
        session: *mut c_void,
        lease: *const c_char,
        owner: *const c_char,
        device_epoch: u32,
        generation: u32,
        registry: u32,
    ) -> *mut c_void;
    fn zp_input_meter_acquire(
        session: *mut c_void,
        lease: *const c_char,
        owner: *const c_char,
        device_epoch: u32,
    ) -> *mut c_void;
    fn zp_idle_meter_acquire(
        session: *mut c_void,
        lease: *const c_char,
        owner: *const c_char,
        owner_epoch: u64,
    ) -> *mut c_void;
    fn zp_meter_read(
        handle: *mut c_void,
        slots: *const u32,
        count: u32,
        output: *mut NativePublication,
        capacity: u32,
    ) -> u32;
    fn zp_meter_release(handle: *mut c_void);
    fn zp_meter_reset(
        handle: *mut c_void,
        slots: *const u32,
        count: u32,
        epoch: u32,
        kind: u32,
    ) -> u32;
}

fn epoch(value: NativeEpoch) -> EpochPublication {
    EpochPublication {
        energy: EnergyEpoch {
            id: value.id,
            start_sample: value.start_sample,
            end_sample: value.end_sample,
            frames: value.frames,
            sum_squares: value.sum_squares,
        },
        display_peak: value.display_peak,
        hold_reset_epoch: value.hold_reset_epoch,
        valid: value.valid != 0,
    }
}

/// Owned by the non-audio Hub. A mutable borrow serializes every read.
/// Shared source playheads are written by the graph; this reader retains no Edit or Plugin.
pub struct NativeMeterReader {
    handle: NonNull<c_void>,
    identity: MeterGraphIdentity,
    slots: Vec<u32>,
    native: Vec<NativePublication>,
    values: Vec<Option<ChannelPublication>>,
    source_records: Vec<super::protocol_generated::WireSource>,
}
// The C++ handle owns its bank references; all mutable reads require &mut self.
// Destruction releases no Edit/Plugin and must remain outside the audio callback.
unsafe impl Send for NativeMeterReader {}
impl Drop for NativeMeterReader {
    fn drop(&mut self) {
        unsafe { zp_meter_release(self.handle.as_ptr()) };
    }
}
impl NativeMeterReader {
    pub fn identity(&self) -> MeterGraphIdentity {
        self.identity
    }
    pub fn slots(&self) -> &[u32] {
        &self.slots
    }
    pub fn read(&mut self) -> Result<&[Option<ChannelPublication>], String> {
        let count = self.slots.len() as u32;
        let received = unsafe {
            zp_meter_read(
                self.handle.as_ptr(),
                self.slots.as_ptr(),
                count,
                self.native.as_mut_ptr(),
                count,
            )
        };
        if received != count {
            return Err("Native meter read rejected its slots or concurrent access".into());
        }
        for (target, source) in self.values.iter_mut().zip(&self.native) {
            *target = (source.current.id != 0).then(|| ChannelPublication {
                completed: (source.completed_valid != 0).then(|| epoch(source.completed)),
                current: epoch(source.current),
                session_peak: source.session_peak,
                clip_count: source.clip_count,
                slot_reset_epoch: source.slot_reset_epoch,
                hold_reset_epoch: source.hold_reset_epoch,
                available: source.available != 0,
            });
        }
        Ok(&self.values)
    }
    pub fn request_reset(
        &mut self,
        slots: &[u32],
        epoch: u32,
        kind: &super::metadata_generated::MeterResetKind,
    ) -> Result<(), String> {
        let count = u32::try_from(slots.len()).map_err(|_| "Meter reset slot capacity exceeded")?;
        let kind = match kind {
            super::metadata_generated::MeterResetKind::Hold => 1,
            super::metadata_generated::MeterResetKind::Clip => 2,
            super::metadata_generated::MeterResetKind::All => 3,
        };
        if unsafe { zp_meter_reset(self.handle.as_ptr(), slots.as_ptr(), count, epoch, kind) } != 1
        {
            return Err("Native meter reset rejected its slots or epoch".into());
        }
        Ok(())
    }
}
impl PlaybackService {
    pub(crate) fn acquire_input_reader_on_main(
        &self,
        lease_id: &str,
        session_id: &str,
        registry: &NativeInputRegistry,
    ) -> Result<NativeMeterReader, String> {
        self.check_plugin_owner(lease_id, session_id)?;
        let lease = CString::new(lease_id).map_err(|error| error.to_string())?;
        let session = CString::new(session_id).map_err(|error| error.to_string())?;
        let owner = self.owner.handle.load(Ordering::Acquire) as *mut c_void;
        if owner.is_null() {
            return Err("Input meter requires an open native project".into());
        }
        let handle = NonNull::new(unsafe {
            zp_input_meter_acquire(
                owner,
                lease.as_ptr(),
                session.as_ptr(),
                registry.device_epoch,
            )
        })
        .ok_or("Input meter changed or already has a Hub reader")?;
        let slots = registry
            .entries
            .iter()
            .map(|entry| entry.slot_id)
            .collect::<Vec<_>>();
        Ok(NativeMeterReader {
            handle,
            identity: MeterGraphIdentity {
                device_epoch: registry.device_epoch,
                generation: 0,
                registry_revision: registry.device_epoch,
            },
            native: vec![NativePublication::default(); slots.len()],
            values: vec![None; slots.len()],
            slots,
            source_records: Vec::new(),
        })
    }
    pub(crate) fn acquire_meter_reader_on_main(
        &self,
        lease_id: &str,
        session_id: &str,
        registry: &NativeMeterRegistry,
    ) -> Result<NativeMeterReader, String> {
        let identity = registry.identity();
        let slots: Vec<_> = registry.entries.iter().map(|entry| entry.slot_id).collect();
        if slots.len() > u32::MAX as usize {
            return Err("Meter slot capacity exceeded".into());
        }
        self.check_plugin_owner(lease_id, session_id)?;
        let lease = CString::new(lease_id).map_err(|error| error.to_string())?;
        let session = CString::new(session_id).map_err(|error| error.to_string())?;
        let native = vec![NativePublication::default(); slots.len()];
        let values = vec![None; slots.len()];
        let owner = self.owner.handle.load(Ordering::Acquire) as *mut c_void;
        if owner.is_null() {
            return Err("Meter reader requires an open native project".into());
        }
        let handle = unsafe {
            match registry.graph {
                NativeMeterGraph::Prepared { .. } => zp_meter_acquire(
                    owner,
                    lease.as_ptr(),
                    session.as_ptr(),
                    identity.device_epoch,
                    identity.generation,
                    identity.registry_revision,
                ),
                NativeMeterGraph::Unprepared { owner_epoch } => {
                    zp_idle_meter_acquire(owner, lease.as_ptr(), session.as_ptr(), owner_epoch.0)
                }
            }
        };
        let handle =
            NonNull::new(handle).ok_or("Meter graph changed or already has a Hub reader")?;
        Ok(NativeMeterReader {
            handle,
            identity,
            slots,
            native,
            values,
            source_records: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_publication_layout_matches_c_abi() {
        assert_eq!(std::mem::size_of::<NativeEpoch>(), 64);
        assert_eq!(std::mem::size_of::<NativeTransportObservation>(), 120);
        assert_eq!(std::mem::size_of::<NativeStoppedTransport>(), 40);
        assert_eq!(std::mem::align_of::<NativeStoppedTransport>(), 8);
        assert_eq!(std::mem::size_of::<NativePublication>(), 160);
        assert_eq!(std::mem::align_of::<NativePublication>(), 8);
        let publication = NativePublication {
            current: NativeEpoch {
                id: 3,
                start_sample: 256,
                end_sample: 512,
                frames: 256,
                sum_squares: 16.0,
                display_peak: 0.25,
                valid: 1,
                ..NativeEpoch::default()
            },
            available: 1,
            ..NativePublication::default()
        };
        let decoded = epoch(publication.current);
        assert_eq!(decoded.energy.frames, 256);
        assert_eq!(decoded.energy.sum_squares, 16.0);
        assert_eq!(decoded.display_peak, 0.25);
        assert!(decoded.valid);
    }
}
