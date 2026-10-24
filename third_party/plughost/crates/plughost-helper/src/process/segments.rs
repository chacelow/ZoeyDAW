use plughost_core::{
    BlockContext, Event, InputError, MAX_AUDIO_CHANNELS, MAX_BLOCK_EVENTS, ParameterChange, Sample,
};

pub(super) struct SegmentScratch {
    events: Vec<Event>,
    changes: Vec<ParameterChange>,
    produced: Vec<Event>,
    advanced: bool,
}

impl SegmentScratch {
    pub fn new() -> Self {
        Self {
            events: Vec::with_capacity(MAX_BLOCK_EVENTS),
            changes: Vec::with_capacity(MAX_BLOCK_EVENTS),
            produced: Vec::with_capacity(MAX_BLOCK_EVENTS),
            advanced: false,
        }
    }

    pub fn advanced(&self) -> bool {
        self.advanced
    }

    pub fn process<S: Sample>(
        &mut self,
        context: &BlockContext,
        inputs: &[&[S]],
        outputs: &mut [&mut [S]],
        changes: &[ParameterChange],
        events: &mut [Event],
        produced: &mut Vec<Event>,
        mut call: impl FnMut(
            &BlockContext,
            &[&[S]],
            &mut [&mut [S]],
            &[ParameterChange],
            &[Event],
            &mut Vec<Event>,
        ) -> Result<(), plughost_formats::Error>,
    ) -> Result<(), plughost_formats::Error> {
        self.advanced = false;
        if context.transport_changes[0].is_none() {
            return call(context, inputs, outputs, changes, events, produced);
        }
        if inputs.len() > MAX_AUDIO_CHANNELS || outputs.len() > MAX_AUDIO_CHANNELS {
            return Err(plughost_formats::Error::Input(InputError::AudioBuffers));
        }
        produced.clear();
        let mut start = 0;
        let mut transport = context.transport;
        let mut event_start = 0;
        for boundary in context
            .transport_changes
            .iter()
            .copied()
            .flatten()
            .map(Some)
            .chain(std::iter::once(None))
        {
            let end = boundary.map_or(context.frames, |change| change.offset);
            let mut segment = BlockContext::new(end - start);
            segment.transport = transport;
            self.events.clear();
            self.changes.clear();
            let event_end =
                event_start + events[event_start..].partition_point(|event| event.offset < end);
            for event in &mut events[event_start..event_end] {
                let mut owned = std::mem::replace(event, Event::midi(0, [0x80, 0, 0]));
                owned.offset -= start;
                self.events.push(owned);
            }
            self.changes.extend(
                changes
                    .iter()
                    .filter(|event| (start..end).contains(&event.offset))
                    .map(|event| ParameterChange {
                        offset: event.offset - start,
                        ..*event
                    }),
            );
            let mut input_views: [&[S]; MAX_AUDIO_CHANNELS] = [&[]; MAX_AUDIO_CHANNELS];
            for (view, channel) in input_views.iter_mut().zip(inputs) {
                *view = &channel[start..end];
            }
            let output_channels = outputs.len();
            let mut output_views: [&mut [S]; MAX_AUDIO_CHANNELS] =
                std::array::from_fn(|_| &mut [][..]);
            for (view, channel) in output_views.iter_mut().zip(outputs.iter_mut()) {
                *view = &mut channel[start..end];
            }
            let result = call(
                &segment,
                &input_views[..inputs.len()],
                &mut output_views[..output_channels],
                &self.changes,
                &self.events,
                &mut self.produced,
            );
            for (destination, mut event) in events[event_start..event_end]
                .iter_mut()
                .zip(self.events.drain(..))
            {
                event.offset += start;
                *destination = event;
            }
            event_start = event_end;
            result?;
            self.advanced = true;
            if self.produced.len() > MAX_BLOCK_EVENTS - produced.len() {
                return Err(plughost_formats::Error::Input(InputError::EventCapacity));
            }
            produced.extend(self.produced.drain(..).map(|mut event| {
                event.offset += start;
                event
            }));
            if let Some(boundary) = boundary {
                start = boundary.offset;
                transport = boundary.transport;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use plughost_core::{BlockTransportChange, Transport};

    #[test]
    fn boundary_events_and_audio_keep_quantum_coordinates() {
        let mut scratch = SegmentScratch::new();
        let mut context = BlockContext::new(8).with_transport(Transport::new(100, true));
        context.transport_changes[0] = Some(BlockTransportChange {
            offset: 3,
            transport: Some(Transport::new(-7, true)),
        });
        let input = [1.0_f32, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let mut output = [0.0; 8];
        let mut events = [Event::note_on(2, 0, 60, 100), Event::note_off(3, 0, 60, 0)];
        let changes = [ParameterChange {
            id: 0,
            offset: 3,
            value: 0.25,
        }];
        let mut produced = Vec::with_capacity(MAX_BLOCK_EVENTS);
        let mut observed = Vec::new();
        scratch
            .process(
                &context,
                &[&input],
                &mut [&mut output],
                &changes,
                &mut events,
                &mut produced,
                |block, inputs, outputs, changes, events, result| {
                    observed.push((
                        block.frames,
                        block.transport.unwrap().sample_position,
                        changes.iter().map(|point| point.offset).collect::<Vec<_>>(),
                        events.iter().map(|event| event.offset).collect::<Vec<_>>(),
                    ));
                    outputs[0].copy_from_slice(inputs[0]);
                    result.clear();
                    result.extend_from_slice(events);
                    Ok(())
                },
            )
            .unwrap();
        assert_eq!(output, input);
        assert_eq!(produced, events);
        assert_eq!(
            observed,
            [(3, 100, vec![], vec![2]), (5, -7, vec![0], vec![0])]
        );
    }

    #[test]
    fn failed_segment_restores_sysex_storage_and_absolute_offsets() {
        let mut scratch = SegmentScratch::new();
        let mut context = BlockContext::new(8);
        context.transport_changes[0] = Some(BlockTransportChange {
            offset: 3,
            transport: None,
        });
        let mut events = [Event::sysex(3, vec![0xf0, 1, 2, 0xf7])];
        let original = match &events[0].data {
            plughost_core::EventData::SysEx(bytes) => bytes.as_ptr(),
            _ => unreachable!(),
        };
        let mut output = [0.0_f32; 8];
        let mut produced = Vec::with_capacity(MAX_BLOCK_EVENTS);
        let result = scratch.process(
            &context,
            &[&[0.0; 8]],
            &mut [&mut output],
            &[],
            &mut events,
            &mut produced,
            |_, _, _, _, events, _| {
                if let Some(event) = events.first() {
                    assert_eq!(event.offset, 0);
                    match &event.data {
                        plughost_core::EventData::SysEx(bytes) => {
                            assert_eq!(bytes.as_ptr(), original)
                        }
                        _ => unreachable!(),
                    }
                    return Err(plughost_formats::Error::Input(InputError::Events));
                }
                Ok(())
            },
        );
        assert!(result.is_err());
        assert!(scratch.advanced());
        assert_eq!(events[0].offset, 3);
        match &events[0].data {
            plughost_core::EventData::SysEx(bytes) => {
                assert_eq!(bytes.as_ptr(), original);
                assert_eq!(bytes, &[0xf0, 1, 2, 0xf7]);
            }
            _ => unreachable!(),
        }
    }
}
