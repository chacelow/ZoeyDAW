use std::collections::BTreeMap;

use crate::protocol::{BackendProject, TrackKind};

pub(super) struct ReturnSolo {
    pub feeds: Vec<bool>,
    pub outputs: Vec<bool>,
}

impl ReturnSolo {
    pub fn compile(project: &BackendProject, indices: &BTreeMap<&str, usize>) -> Option<Self> {
        let selected: Vec<_> = project
            .tracks
            .iter()
            .map(|track| track.kind == TrackKind::Return && track.solo)
            .collect();
        if !selected.iter().any(|selected| *selected) {
            return None;
        }
        let mut feeds = selected.clone();
        let mut outputs = selected;
        // The original graph is validated separately; a bounded fixed point also
        // handles arbitrary track order without following a possible routing cycle.
        for _ in 0..project.tracks.len() {
            let mut changed = false;
            for (index, track) in project.tracks.iter().enumerate() {
                let output = indices.get(track.output.as_str()).copied();
                let feeds_selected = output.is_some_and(|target| feeds[target])
                    || track.sends.keys().any(|id| {
                        indices
                            .get(id.as_str())
                            .is_some_and(|target| feeds[*target])
                    });
                if feeds_selected && !feeds[index] {
                    feeds[index] = true;
                    changed = true;
                }
                if outputs[index] {
                    if let Some(target) = output {
                        if !outputs[target] {
                            outputs[target] = true;
                            changed = true;
                        }
                    }
                }
            }
            if !changed {
                break;
            }
        }
        Some(Self { feeds, outputs })
    }
}
