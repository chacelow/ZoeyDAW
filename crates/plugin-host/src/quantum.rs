use plughost::{
    AutomationEvent, BlockContext, BlockTransportChange, Event, MAX_TRANSPORT_SEGMENTS,
    RealtimeEndpoint, RealtimeOutput, Transport,
};

#[derive(Debug)]
pub enum QuantumError {
    Format,
    EventCapacity,
    EventOffset,
    Transport,
    Processing(plughost::Error),
}

impl std::fmt::Display for QuantumError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Format => formatter.write_str("Plugin block differs from prepared format"),
            Self::EventCapacity => formatter.write_str("Plugin quantum event capacity exceeded"),
            Self::EventOffset => {
                formatter.write_str("Plugin segment events are invalid or unordered")
            }
            Self::Transport => formatter.write_str("Invalid or excessive plugin timeline segments"),
            Self::Processing(error) => write!(formatter, "{error}"),
        }
    }
}

impl std::error::Error for QuantumError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Format | Self::EventCapacity | Self::EventOffset | Self::Transport => None,
            Self::Processing(error) => Some(error),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct MidiMessage {
    pub offset: usize,
    pub port: usize,
    pub bytes: [u8; 3],
}

pub struct QuantumAudio {
    endpoint: RealtimeEndpoint,
    quantum: usize,
    input_channels: usize,
    output_channels: usize,
    input: Vec<Vec<f32>>,
    output: Vec<Vec<f32>>,
    position: usize,
    produced: Vec<Event>,
    produced_position: usize,
    events: Vec<Event>,
    automation: Vec<AutomationEvent>,
    sample_rate: f64,
    context: BlockContext,
    transport_changes: usize,
}

impl QuantumAudio {
    pub fn new(
        endpoint: RealtimeEndpoint,
        quantum: usize,
        input_channels: usize,
        output_channels: usize,
        sample_rate: f64,
    ) -> Result<Self, &'static str> {
        if quantum == 0
            || quantum > 4096
            || input_channels > 64
            || output_channels == 0
            || output_channels > 64
            || !sample_rate.is_finite()
            || !(1.0..=768_000.0).contains(&sample_rate)
        {
            return Err("Invalid plugin quantum or channel count");
        }
        Ok(Self {
            endpoint,
            quantum,
            input_channels,
            output_channels,
            input: vec![vec![0.0; quantum]; input_channels],
            output: vec![vec![0.0; quantum]; output_channels],
            position: 0,
            produced: Vec::with_capacity(4096),
            produced_position: 0,
            events: Vec::with_capacity(4096),
            automation: Vec::with_capacity(4096),
            sample_rate,
            context: BlockContext::new(quantum),
            transport_changes: 0,
        })
    }

    pub fn added_latency(&self) -> usize {
        self.quantum
    }

    pub fn process(
        &mut self,
        input: &[&[f32]],
        output: &mut [&mut [f32]],
        frames: usize,
        midi: &[MidiMessage],
        automation: &[AutomationEvent],
        produced: &mut Vec<Event>,
        transport: Option<Transport>,
    ) -> Result<Option<RealtimeOutput>, QuantumError> {
        if frames > self.quantum
            || input.len() != self.input_channels
            || output.len() != self.output_channels
            || input.iter().any(|channel| channel.len() != frames)
            || output.iter().any(|channel| channel.len() != frames)
        {
            return Err(QuantumError::Format);
        }
        if let Some(transport) = transport {
            transport
                .advanced(frames, self.sample_rate)
                .map_err(|_| QuantumError::Transport)?;
        }
        let previous = if self.position == 0 || self.transport_changes == 0 {
            (0, self.context.transport)
        } else {
            let change = self.context.transport_changes[self.transport_changes - 1]
                .ok_or(QuantumError::Transport)?;
            (change.offset, change.transport)
        };
        let expected = previous
            .1
            .map(|value| value.advanced(self.position - previous.0, self.sample_rate))
            .transpose()
            .map_err(|_| QuantumError::Transport)?;
        let discontinuity = self.position > 0 && expected != transport;
        if frames > 0 && discontinuity && self.transport_changes == MAX_TRANSPORT_SEGMENTS {
            return Err(QuantumError::Transport);
        }
        if midi.iter().any(|event| {
            event.offset >= frames
                || event.bytes[0] < 0x80
                || event.bytes[0] >= 0xf0
                || event.bytes[1] >= 0x80
                || (!matches!(event.bytes[0] & 0xf0, 0xc0 | 0xd0) && event.bytes[2] >= 0x80)
        }) || midi.windows(2).any(|pair| pair[0].offset > pair[1].offset)
            || automation.iter().any(|event| {
                event.change.offset >= frames
                    || !event.change.value.is_finite()
                    || !(0.0..=1.0).contains(&event.change.value)
            })
            || automation
                .windows(2)
                .any(|pair| pair[0].change.offset > pair[1].change.offset)
        {
            return Err(QuantumError::EventOffset);
        }
        let split = frames.min(self.quantum - self.position);
        let first_events = midi.partition_point(|event| event.offset < split);
        let first_automation = automation.partition_point(|event| event.change.offset < split);
        let output_budget =
            self.produced.len() - self.produced_position + if frames > split { 4096 } else { 0 };
        if first_events + first_automation > 4096 - self.events.len() - self.automation.len()
            || midi.len() - first_events + automation.len() - first_automation > 4096
            || produced.capacity() - produced.len() < output_budget
        {
            return Err(QuantumError::EventCapacity);
        }
        let mut result = None;
        let mut offset = 0;
        while offset < frames {
            let count = (self.quantum - self.position).min(frames - offset);
            let segment_transport = transport
                .map(|value| value.advanced(offset, self.sample_rate))
                .transpose()
                .map_err(|_| QuantumError::Transport)?;
            if self.position == 0 {
                self.context = BlockContext::new(self.quantum);
                self.context.transport = segment_transport;
                self.transport_changes = 0;
            } else if discontinuity {
                self.context.transport_changes[self.transport_changes] =
                    Some(BlockTransportChange {
                        offset: self.position,
                        transport: segment_transport,
                    });
                self.transport_changes += 1;
            }
            for event in midi
                .iter()
                .filter(|event| event.offset >= offset && event.offset < offset + count)
            {
                self.events.push(
                    Event::midi(self.position + event.offset - offset, event.bytes)
                        .on_port(event.port),
                );
            }
            for event in automation.iter().filter(|event| {
                event.change.offset >= offset && event.change.offset < offset + count
            }) {
                let mut shifted = *event;
                shifted.change.offset += self.position;
                shifted.change.offset -= offset;
                self.automation.push(shifted);
            }
            while let Some(event) = self.produced.get_mut(self.produced_position) {
                if event.offset >= self.position + count {
                    break;
                }
                let mut event = std::mem::replace(event, Event::midi(0, [0x80, 0, 0]));
                event.offset = offset + event.offset - self.position;
                produced.push(event);
                self.produced_position += 1;
            }
            for (source, destination) in input.iter().zip(&mut self.input) {
                destination[self.position..self.position + count]
                    .copy_from_slice(&source[offset..offset + count]);
            }
            for (source, destination) in self.output.iter().zip(output.iter_mut()) {
                destination[offset..offset + count]
                    .copy_from_slice(&source[self.position..self.position + count]);
            }
            self.position += count;
            offset += count;
            if self.position == self.quantum {
                self.position = 0;
                let mut inputs: [&[f32]; 64] = [&[]; 64];
                for (view, channel) in inputs.iter_mut().zip(&self.input) {
                    *view = channel;
                }
                let mut outputs: [&mut [f32]; 64] = std::array::from_fn(|_| &mut [][..]);
                for (view, channel) in outputs.iter_mut().zip(&mut self.output) {
                    *view = channel;
                }
                let processed = self.endpoint.process_audio_f32(
                    &self.context,
                    &inputs[..self.input_channels],
                    &mut outputs[..self.output_channels],
                    &self.automation,
                    &self.events,
                    &mut self.produced,
                );
                self.produced_position = 0;
                self.events.clear();
                self.automation.clear();
                result = Some(processed.map_err(QuantumError::Processing)?);
            }
        }
        Ok(result)
    }
}
