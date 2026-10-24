mod catalog_store;
pub mod device_session;
pub mod native;
pub mod quantum;
pub mod scan_operation;
pub mod state_store;

use plughost::{
    Chain, HostIdentity, PluginInfo, PluginRef, ScanAction, ScanEvent, ScanOutcome, ScanPolicy,
    Scanner, Timeouts,
};
use serde::Serialize;
use std::{collections::BTreeMap, path::PathBuf, time::Duration};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub catalog_id: String,
    pub plugin: PluginInfo,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanIssue {
    pub path: PathBuf,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub entries: Vec<CatalogEntry>,
    pub issues: Vec<ScanIssue>,
    pub cancelled: bool,
}

pub struct PluginCatalog {
    helper: PathBuf,
    cache: PathBuf,
    host: HostIdentity,
    entries: catalog_store::Entries,
}

pub struct PluginSelection {
    helper: PathBuf,
    host: HostIdentity,
    reference: PluginRef,
}

impl PluginSelection {
    pub fn identity(&self) -> &PluginRef { &self.reference }
    fn spawn(self) -> Result<Chain, String> {
        Chain::spawn(
            &self.helper,
            &[self.reference],
            &self.host,
            Timeouts::default(),
        )
        .map_err(|error| error.to_string())
    }
}

impl PluginCatalog {
    pub fn new(helper: PathBuf, cache: PathBuf) -> Result<Self, String> {
        if !helper.is_file() {
            return Err("Packaged plugin helper is missing".into());
        }
        let entries = catalog_store::load(&catalog_store::path(&cache))?;
        Ok(Self {
            helper,
            cache,
            host: HostIdentity {
                name: "ZoeyDAW".into(),
                vendor: "zoeydaw".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
            entries,
        })
    }

    pub fn scan(
        &mut self,
        directories: &[PathBuf],
        audio_units: &[String],
        lease: &scan_operation::ScanLease,
        events: &(dyn Fn(&ScanEvent) + Sync),
    ) -> Result<ScanReport, String> {
        let control = &lease.control;
        let directories: Vec<_> = directories
            .iter()
            .map(|directory| {
                let path = directory
                    .canonicalize()
                    .map_err(|error| error.to_string())?;
                if !path.is_dir() {
                    return Err("Plugin scan root must be a directory".to_owned());
                }
                Ok(path)
            })
            .collect::<Result<_, String>>()?;
        let discovery = Scanner::new(&self.helper, &self.cache)
            .directories(directories.clone())
            .policy(ScanPolicy::new(ScanAction::Block))
            .discover_controlled(control, events);
        let mut policy = ScanPolicy::new(ScanAction::Block);
        for bundle in &discovery.bundles {
            let path = bundle
                .path
                .canonicalize()
                .map_err(|error| error.to_string())?;
            if directories
                .iter()
                .any(|directory| path.starts_with(directory))
            {
                policy = policy.bundle(bundle.path.clone(), ScanAction::Allow);
            }
        }
        for class_id in audio_units {
            policy = policy.audio_unit(class_id, ScanAction::Allow);
        }
        let catalog = Scanner::new(&self.helper, &self.cache)
            .host(self.host.clone())
            .directories(directories)
            .policy(policy)
            .stall_timeout(Duration::from_secs(30))
            .scan_controlled(control, events)
            .map_err(|error| error.to_string())?;
        let mut entries = BTreeMap::new();
        for (reference, info) in catalog.plugins() {
            let id = catalog_store::identity(&reference)?;
            entries.insert(id, (reference, info.clone()));
        }
        let mut issues: Vec<ScanIssue> = catalog
            .bundles
            .iter()
            .filter_map(|bundle| match &bundle.outcome {
                ScanOutcome::Found(_) => None,
                outcome => Some(ScanIssue {
                    path: bundle.path.clone(),
                    reason: format!("{outcome:?}"),
                }),
            })
            .collect();
        if !matches!(
            catalog.audio_units,
            ScanOutcome::Found(_) | ScanOutcome::Cancelled
        ) {
            issues.push(ScanIssue {
                path: PathBuf::from("AudioUnits"),
                reason: format!("{:?}", catalog.audio_units),
            });
        }
        let path = catalog_store::path(&self.cache);
        let prepared = catalog_store::prepare(&path, &entries)?;
        let cancelled = !lease.publish(|| {
            prepared.persist(&path).map_err(|error| error.to_string())?;
            std::mem::swap(&mut self.entries, &mut entries);
            Ok(())
        })?;
        if !cancelled {
            catalog_store::sync_parent(&path)?;
        }
        Ok(ScanReport {
            entries: self.entries(),
            issues,
            cancelled,
        })
    }

    pub fn entries(&self) -> Vec<CatalogEntry> {
        self.entries
            .iter()
            .map(|(id, (_, plugin))| CatalogEntry {
                catalog_id: id.clone(),
                plugin: plugin.clone(),
            })
            .collect()
    }

    pub fn select(&self, catalog_id: &str) -> Result<PluginSelection, String> {
        let (reference, _) = self
            .entries
            .get(catalog_id)
            .ok_or_else(|| format!("Plugin catalog entry is unavailable: {catalog_id}"))?;
        Ok(PluginSelection {
            helper: self.helper.clone(),
            host: self.host.clone(),
            reference: reference.clone(),
        })
    }

    pub fn spawn_chain(&self, catalog_ids: &[String]) -> Result<Chain, String> {
        let plugins = catalog_ids
            .iter()
            .map(|id| {
                self.entries
                    .get(id)
                    .map(|(reference, _)| reference.clone())
                    .ok_or_else(|| format!("Plugin catalog entry is unavailable: {id}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Chain::spawn(&self.helper, &plugins, &self.host, Timeouts::default())
            .map_err(|error| error.to_string())
    }
}

pub use plughost::{ScanControl as PluginScanControl, ScanEvent as PluginScanEvent};
