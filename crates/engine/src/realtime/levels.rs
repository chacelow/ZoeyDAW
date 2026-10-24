use super::protocol_generated::*;
use std::collections::HashSet;

#[derive(Debug, PartialEq)]
pub struct LevelsFrame {
    pub header: WireHeader,
    pub records: Vec<WireRecord>,
    pub sources: Vec<WireSource>,
}

pub fn decode_levels(bytes: &[u8]) -> Option<LevelsFrame> {
    let header = WireHeader::read(bytes)?;
    let header_mask =
        HEADER_FLAGS_PLAYING | HEADER_FLAGS_RECORDING | HEADER_FLAGS_SUBSCRIPTION_CHANGED;
    let rms_mask = RECORD_FLAGS_RMS_INITIALIZING | RECORD_FLAGS_RMS_STALE;
    let record_mask = RECORD_FLAGS_VALID
        | RECORD_FLAGS_STALE
        | RECORD_FLAGS_CLIPPED
        | RECORD_FLAGS_UNAVAILABLE
        | rms_mask;
    let source_mask = SOURCE_FLAGS_VALID | SOURCE_FLAGS_STALE | SOURCE_FLAGS_UNAVAILABLE;
    let length = HEADER_BYTES
        .checked_add(RECORD_BYTES.checked_mul(header.slot_count as usize)?)?
        .checked_add(SOURCE_BYTES.checked_mul(header.source_count as usize)?)?;
    if header.magic != MAGIC as u32
        || header.version != VERSION as u16
        || header.header_bytes != HEADER_BYTES as u16
        || header.frame_type != FRAME_TYPES_LEVELS as u32
        || header.flags & !(header_mask as u32) != 0
        || !header.sample_rate.is_finite()
        || header.sample_rate <= 0.0
        || !header.timeline_beat.is_finite()
        || !header.tempo_bpm.is_finite()
        || !(20.0..=999.0).contains(&header.tempo_bpm)
        || bytes.len() != length
    {
        return None;
    }
    let mut records = Vec::with_capacity(header.slot_count as usize);
    let mut slots = HashSet::with_capacity(header.slot_count as usize);
    let mut offset = HEADER_BYTES;
    for _ in 0..header.slot_count {
        let record = WireRecord::read(&bytes[offset..])?;
        if !slots.insert(record.slot_id)
            || record.flags & !(record_mask as u32) != 0
            || [record.peak, record.rms, record.hold, record.session_peak]
                .iter()
                .any(|value| !value.is_finite() || *value < 0.0)
            || (record.flags & rms_mask as u32 != 0 && record.rms != 0.0)
        {
            return None;
        }
        records.push(record);
        offset += RECORD_BYTES;
    }
    let mut sources = Vec::with_capacity(header.source_count as usize);
    for _ in 0..header.source_count {
        let source = WireSource::read(&bytes[offset..])?;
        if source.flags & !(source_mask as u32) != 0
            || source.reserved != 0
            || !source.source_frame.is_finite()
            || !source.source_rate.is_finite()
            || source.source_rate <= 0.0
        {
            return None;
        }
        sources.push(source);
        offset += SOURCE_BYTES;
    }
    Some(LevelsFrame {
        header,
        records,
        sources,
    })
}
