use super::{
    prepare_reset, preserve_reset_records, HubInputSnapshot, HubSnapshot, HubTransportObservation,
    InstalledGraph, InstalledInput, PendingReset, Shared,
};
use std::{
    sync::{atomic::Ordering, Arc},
    time::Duration,
};

pub(super) fn run(shared: Arc<Shared>) {
    let mut installed: Option<InstalledGraph> = None;
    let mut input: Option<InstalledInput> = None;
    let mut sequence = 0_u64;
    let mut reset_epoch = 0_u32;
    let mut confirmed_reset_epoch = 0_u32;
    loop {
        let mut control = match shared.control.lock() {
            Ok(value) => value,
            Err(_) => return,
        };
        if control.stop {
            return;
        }
        if let Some(change) = control.input_change.take() {
            input = change;
        }
        if control.clear {
            installed = control.pending.take();
            if let Some(graph) = installed.as_mut() {
                graph.confirmed_reset_epoch = confirmed_reset_epoch;
            }
            control.clear = false;
            shared.latest.store(None);
            let identity = installed.as_ref().map(|graph| graph.registry.identity());
            let requests = std::mem::take(&mut control.resets);
            for request in requests {
                if Some(request.identity) == identity {
                    control.resets.push_back(request);
                } else {
                    let _ = request
                        .reply
                        .send(Err("Meter graph changed before reset".into()));
                }
            }
        }
        if installed.is_none() {
            while !control.stop && !control.clear {
                control = match shared.wake.wait(control) {
                    Ok(value) => value,
                    Err(_) => return,
                };
            }
            continue;
        }
        let request = if installed
            .as_ref()
            .is_some_and(|graph| graph.reset.is_none())
        {
            control.resets.pop_front()
        } else {
            None
        };
        drop(control);
        let now = shared.origin.elapsed();
        if let Some(graph) = &mut installed {
            let result = (|| {
                let mut confirmation = None;
                if let Some(request) = request {
                    if !request.reply.is_canceled() {
                        match prepare_reset(
                            &graph.registry,
                            input.as_ref().map(|input| input.registry.as_ref()),
                            &request,
                            reset_epoch,
                        ) {
                            Ok((slots, input_slots, baseline)) => {
                                reset_epoch = baseline.reset_epoch;
                                let applied = (|| {
                                    if !slots.is_empty() {
                                        graph.reader.request_reset(
                                            &slots,
                                            baseline.reset_epoch,
                                            &request.kind,
                                        )?;
                                    }
                                    if !input_slots.is_empty() {
                                        input
                                            .as_mut()
                                            .ok_or("Input device changed before reset")?
                                            .reader
                                            .request_reset(
                                                &input_slots,
                                                baseline.reset_epoch,
                                                &request.kind,
                                            )?;
                                    }
                                    Ok::<(), String>(())
                                })();
                                if let Err(error) = applied {
                                    let _ = request.reply.send(Err(error));
                                } else {
                                    let input_epoch =
                                        input.as_ref().map(|value| value.registry.device_epoch);
                                    graph.reset = Some(PendingReset {
                                        slots,
                                        input_slots,
                                        input_epoch,
                                        baseline,
                                        previous: shared.latest.load_full(),
                                        reply: request.reply,
                                    });
                                }
                            }
                            Err(error) => {
                                let _ = request.reply.send(Err(error));
                            }
                        }
                    }
                }
                if graph.reset.as_ref().is_some_and(|reset| {
                    !reset.input_slots.is_empty()
                        && reset.input_epoch
                            != input.as_ref().map(|value| value.registry.device_epoch)
                }) {
                    if let Some(reset) = graph.reset.take() {
                        let _ = reset
                            .reply
                            .send(Err("Input device changed before reset confirmation".into()));
                    }
                }
                let mut input_applied = graph
                    .reset
                    .as_ref()
                    .is_none_or(|reset| reset.input_slots.is_empty());
                if let Some(input) = input.as_mut() {
                    let publications = input.reader.read()?;
                    for (channel, publication) in input.channels.iter_mut().zip(publications) {
                        if let Some(value) = publication {
                            channel.accept(*value, now);
                        }
                    }
                    if let Some(reset) = graph.reset.as_ref() {
                        input_applied = reset.input_slots.iter().all(|slot| {
                            publications
                                .get(*slot as usize)
                                .and_then(Option::as_ref)
                                .is_some_and(|value| {
                                    value.slot_reset_epoch >= reset.baseline.reset_epoch
                                })
                        });
                    }
                }
                let publications = graph.reader.read()?;
                for (channel, publication) in graph.channels.iter_mut().zip(publications) {
                    if let Some(value) = publication {
                        channel.accept(*value, now);
                    }
                }
                if let Some(reset) = &graph.reset {
                    let applied = input_applied
                        && reset.slots.iter().all(|slot| {
                            publications
                                .get(*slot as usize)
                                .and_then(Option::as_ref)
                                .is_some_and(|value| {
                                    value.slot_reset_epoch >= reset.baseline.reset_epoch
                                })
                        });
                    if applied {
                        if let Some(reset) = graph.reset.take() {
                            graph.confirmed_reset_epoch = reset.baseline.reset_epoch;
                            let mut baselines = graph.endpoint_resets.as_ref().clone();
                            for affected in &reset.baseline.affected {
                                if let Some(baseline) = baselines
                                    .iter_mut()
                                    .find(|baseline| baseline.endpoint_id == affected.endpoint_id)
                                {
                                    *baseline = affected.clone();
                                }
                            }
                            graph.endpoint_resets = Arc::new(baselines);
                            confirmation = Some(reset);
                        }
                    }
                }
                sequence = sequence
                    .checked_add(1)
                    .ok_or("Meter Hub sequence exhausted")?;
                let produced_monotonic_ns = now
                    .as_nanos()
                    .try_into()
                    .map_err(|_| "Meter clock exhausted")?;
                if let Some(audio) = graph.reader.read_transport()? {
                    graph.transport = Some(HubTransportObservation {
                        audio,
                        received_monotonic_ns: produced_monotonic_ns,
                    });
                }
                let input_snapshot = if let Some(input) = input.as_mut() {
                    Some(Arc::new(HubInputSnapshot {
                        registry: input.registry.clone(),
                        records: {
                            let mut records: Vec<_> = input
                                .channels
                                .iter_mut()
                                .enumerate()
                                .map(|(slot, channel)| channel.snapshot(slot as u32, now, true))
                                .collect();
                            if let Some(reset) = graph.reset.as_ref() {
                                preserve_reset_records(
                                    &mut records,
                                    &reset.input_slots,
                                    reset
                                        .previous
                                        .as_ref()
                                        .and_then(|snapshot| snapshot.input.as_ref())
                                        .map(|input| input.records.as_slice()),
                                );
                            }
                            records
                        },
                    }))
                } else {
                    None
                };
                let mut records: Vec<_> = graph
                    .channels
                    .iter_mut()
                    .enumerate()
                    .map(|(slot, channel)| channel.snapshot(slot as u32, now, true))
                    .collect();
                if let Some(reset) = graph.reset.as_ref() {
                    preserve_reset_records(
                        &mut records,
                        &reset.slots,
                        reset
                            .previous
                            .as_ref()
                            .map(|snapshot| snapshot.records.as_slice()),
                    );
                }
                graph.confirmed_reset_epoch = records
                    .iter()
                    .chain(input_snapshot.iter().flat_map(|input| input.records.iter()))
                    .map(|record| record.slot_reset_epoch)
                    .fold(graph.confirmed_reset_epoch, u32::max);
                Ok::<_, String>((
                    Arc::new(HubSnapshot {
                        sequence,
                        produced_monotonic_ns,
                        registry: graph.registry.clone(),
                        records,
                        reset_epoch: graph.confirmed_reset_epoch,
                        endpoint_resets: graph.endpoint_resets.clone(),
                        transport: graph.transport,
                        input: input_snapshot,
                    }),
                    confirmation,
                ))
            })();
            match result {
                Ok((snapshot, confirmation)) => {
                    // Serialize publication with clear/install so an old graph cannot reappear afterward.
                    let control = match shared.control.lock() {
                        Ok(value) => value,
                        Err(_) => return,
                    };
                    if !control.clear && !control.stop {
                        confirmed_reset_epoch = snapshot.reset_epoch;
                        if control.input_change.is_none() {
                            shared.latest.store(Some(snapshot));
                            shared.snapshot_ready.notify_all();
                            if let Some(reset) = confirmation {
                                let _ = reset.reply.send(Ok(reset.baseline));
                            }
                        } else if let Some(reset) = confirmation {
                            graph.reset = Some(reset);
                        }
                    }
                }
                Err(error) => {
                    let mut control = match shared.control.lock() {
                        Ok(value) => value,
                        Err(_) => return,
                    };
                    if !control.clear {
                        control.identity = None;
                        if let Ok(mut last) = shared.error.lock() {
                            *last = Some(error);
                        }
                        shared.latest.store(None);
                        shared.snapshot_ready.notify_all();
                    }
                    installed = None;
                }
            }
        }
        let interval = if shared.visible.load(Ordering::Acquire) {
            Duration::from_nanos(1_000_000_000 / 120)
        } else {
            Duration::from_millis(50)
        };
        let control = match shared.control.lock() {
            Ok(value) => value,
            Err(_) => return,
        };
        if control.stop {
            return;
        }
        if control.clear {
            continue;
        }
        if shared.wake.wait_timeout(control, interval).is_err() {
            return;
        }
    }
}
