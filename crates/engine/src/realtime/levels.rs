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
    let length = frame_bytes(header.slot_count as usize, header.source_count as usize)?;
    if !valid_header(&header) || bytes.len() != length {
        return None;
    }
    let mut records = Vec::with_capacity(header.slot_count as usize);
    let mut slots = HashSet::with_capacity(header.slot_count as usize);
    let mut offset = HEADER_BYTES;
    for _ in 0..header.slot_count {
        let record = WireRecord::read(&bytes[offset..])?;
        if !slots.insert(record.slot_id) || !valid_record(&record) {
            return None;
        }
        records.push(record);
        offset += RECORD_BYTES;
    }
    let mut sources = Vec::with_capacity(header.source_count as usize);
    for _ in 0..header.source_count {
        let source = WireSource::read(&bytes[offset..])?;
        if !valid_source(&source) {
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

fn frame_bytes(records: usize, sources: usize) -> Option<usize> {
    HEADER_BYTES
        .checked_add(RECORD_BYTES.checked_mul(records)?)?
        .checked_add(SOURCE_BYTES.checked_mul(sources)?)
}
fn valid_header(header: &WireHeader) -> bool {
    let flags = HEADER_FLAGS_PLAYING
        | HEADER_FLAGS_RECORDING
        | HEADER_FLAGS_SUBSCRIPTION_CHANGED
        | HEADER_FLAGS_REVISIONS_UNAVAILABLE;
    header.magic == MAGIC as u32
        && header.version == VERSION as u16
        && header.header_bytes == HEADER_BYTES as u16
        && header.frame_type == FRAME_TYPES_LEVELS as u32
        && header.flags & !(flags as u32) == 0
        && header.sample_rate.is_finite()
        && header.sample_rate > 0.0
        && header.timeline_beat.is_finite()
        && header.tempo_bpm.is_finite()
        && (20.0..=999.0).contains(&header.tempo_bpm)
}
fn valid_record(record: &WireRecord) -> bool {
    let rms = RECORD_FLAGS_RMS_INITIALIZING | RECORD_FLAGS_RMS_STALE;
    let flags = RECORD_FLAGS_VALID
        | RECORD_FLAGS_STALE
        | RECORD_FLAGS_CLIPPED
        | RECORD_FLAGS_UNAVAILABLE
        | rms;
    record.flags & !(flags as u32) == 0
        && [record.peak, record.rms, record.hold, record.session_peak]
            .iter()
            .all(|value| value.is_finite() && *value >= 0.0)
        && (record.flags & rms as u32 == 0 || record.rms == 0.0)
}
fn valid_source(source: &WireSource) -> bool {
    let flags = SOURCE_FLAGS_VALID | SOURCE_FLAGS_STALE | SOURCE_FLAGS_UNAVAILABLE;
    source.flags & !(flags as u32) == 0
        && source.reserved == 0
        && source.source_frame.is_finite()
        && source.source_rate.is_finite()
        && source.source_rate > 0.0
}

pub fn encode_levels(
    mut header: WireHeader,
    records: &[WireRecord],
    sources: &[WireSource],
) -> Option<Vec<u8>> {
    header.slot_count = u32::try_from(records.len()).ok()?;
    header.source_count = u32::try_from(sources.len()).ok()?;
    if !valid_header(&header) {
        return None;
    }
    let mut slots = HashSet::with_capacity(records.len());
    if records
        .iter()
        .any(|record| !valid_record(record) || !slots.insert(record.slot_id))
        || sources.iter().any(|source| !valid_source(source))
    {
        return None;
    }
    let mut bytes = vec![0; frame_bytes(records.len(), sources.len())?];
    header.write(&mut bytes)?;
    let mut offset = HEADER_BYTES;
    for record in records {
        record.write(&mut bytes[offset..])?;
        offset += RECORD_BYTES;
    }
    for source in sources {
        source.write(&mut bytes[offset..])?;
        offset += SOURCE_BYTES;
    }
    Some(bytes)
}
