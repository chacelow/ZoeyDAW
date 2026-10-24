use plughost::ScanControl;
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct ScanOperations(Arc<Mutex<Option<ActiveScan>>>);

struct ActiveScan {
    owner: String,
    id: String,
    control: ScanControl,
    running: bool,
    published: bool,
}

pub struct ScanLease {
    operations: ScanOperations,
    pub(crate) control: ScanControl,
}

impl ScanOperations {
    pub fn reserve(&self, owner: String, id: String) -> Result<(), String> {
        if owner.is_empty() || id.is_empty() || id.len() > 128 {
            return Err("Invalid plugin scan identity".into());
        }
        let mut active = self.0.lock().map_err(|_| "Plugin scan state unavailable")?;
        if active.is_some() {
            return Err("A plugin scan is already active".into());
        }
        let control = ScanControl::default();
        *active = Some(ActiveScan {
            owner,
            id,
            control: control.clone(),
            running: false,
            published: false,
        });
        Ok(())
    }

    pub fn begin(&self, owner: String, id: String) -> Result<ScanLease, String> {
        let mut active = self.0.lock().map_err(|_| "Plugin scan state unavailable")?;
        let scan = active.as_mut().ok_or("Plugin scan was not admitted")?;
        if scan.owner != owner || scan.id != id || scan.running {
            return Err("Plugin scan owner mismatch or already running".into());
        }
        scan.running = true;
        Ok(ScanLease {
            operations: self.clone(),
            control: scan.control.clone(),
        })
    }

    pub fn cancel(&self, owner: &str, id: &str) -> Result<(), String> {
        let mut active = self.0.lock().map_err(|_| "Plugin scan state unavailable")?;
        let Some(scan) = active.as_ref() else {
            return Ok(());
        };
        if scan.owner != owner || scan.id != id {
            return Err("Plugin scan owner mismatch".into());
        }
        if scan.published {
            return Err("Plugin scan already completed".into());
        }
        scan.control.cancel();
        if !scan.running {
            *active = None;
        }
        Ok(())
    }

    pub fn close_owner(&self, owner: &str) {
        if let Ok(mut active) = self.0.lock() {
            if let Some(scan) = active
                .as_ref()
                .filter(|scan| scan.owner == owner && !scan.published)
            {
                scan.control.cancel();
                if !scan.running {
                    *active = None;
                }
            }
        }
    }
}

impl ScanLease {
    pub(crate) fn publish(
        &self,
        apply: impl FnOnce() -> Result<(), String>,
    ) -> Result<bool, String> {
        let mut active = self
            .operations
            .0
            .lock()
            .map_err(|_| "Plugin scan state unavailable")?;
        let scan = active
            .as_mut()
            .ok_or("Plugin scan lease is no longer active")?;
        if scan.published {
            return Err("Plugin scan already published".into());
        }
        if scan.control.is_cancelled() {
            return Ok(false);
        }
        apply()?;
        scan.published = true;
        Ok(true)
    }
}

impl Drop for ScanLease {
    fn drop(&mut self) {
        self.control.cancel();
        if let Ok(mut active) = self.operations.0.lock() {
            *active = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_retains_admission_until_worker_releases_lease() {
        let operations = ScanOperations::default();
        operations.reserve("main".into(), "first".into()).unwrap();
        let lease = operations.begin("main".into(), "first".into()).unwrap();
        assert!(operations.cancel("other", "first").is_err());
        assert!(!lease.control.is_cancelled());
        operations.cancel("main", "first").unwrap();
        assert!(lease.control.is_cancelled());
        assert!(operations.begin("main".into(), "second".into()).is_err());
        drop(lease);
        operations.reserve("main".into(), "second".into()).unwrap();
        let next = operations.begin("main".into(), "second".into()).unwrap();
        assert!(operations.cancel("main", "first").is_err());
        operations.close_owner("other");
        assert!(!next.control.is_cancelled());
        operations.close_owner("main");
        assert!(next.control.is_cancelled());
    }

    #[test]
    fn worker_keeps_admission_until_cancellation_cleanup_finishes() {
        let operations = ScanOperations::default();
        operations.reserve("main".into(), "scan".into()).unwrap();
        let lease = operations.begin("main".into(), "scan".into()).unwrap();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (finish_tx, finish_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            ready_tx.send(()).unwrap();
            finish_rx.recv().unwrap();
            assert!(lease.control.is_cancelled());
            drop(lease);
        });
        ready_rx.recv().unwrap();
        operations.cancel("main", "scan").unwrap();
        let blocked = operations.begin("main".into(), "next".into()).is_err();
        finish_tx.send(()).unwrap();
        worker.join().unwrap();
        assert!(blocked);
        operations.reserve("main".into(), "next".into()).unwrap();
        assert!(operations.begin("main".into(), "next".into()).is_ok());
    }

    #[test]
    fn cancellation_before_execution_prevents_late_worker_admission() {
        let operations = ScanOperations::default();
        operations.reserve("main".into(), "first".into()).unwrap();
        operations.cancel("main", "first").unwrap();
        assert!(operations.begin("main".into(), "first".into()).is_err());
        operations.reserve("main".into(), "second".into()).unwrap();
        assert!(operations.begin("main".into(), "first".into()).is_err());
        assert!(operations.cancel("main", "first").is_err());
        operations.close_owner("main");
        assert!(operations.begin("main".into(), "second".into()).is_err());
        operations.reserve("main".into(), "third".into()).unwrap();
    }

    #[test]
    fn cancellation_and_publication_have_one_winner() {
        let operations = ScanOperations::default();
        operations
            .reserve("main".into(), "cancelled".into())
            .unwrap();
        let lease = operations.begin("main".into(), "cancelled".into()).unwrap();
        let mut catalog = vec!["old"];
        operations.cancel("main", "cancelled").unwrap();
        assert!(
            !lease
                .publish(|| {
                    catalog = vec!["new"];
                    Ok(())
                })
                .unwrap()
        );
        assert_eq!(catalog, ["old"]);
        drop(lease);
        operations
            .reserve("main".into(), "published".into())
            .unwrap();
        let lease = operations.begin("main".into(), "published".into()).unwrap();
        assert!(
            lease
                .publish(|| {
                    catalog = vec!["new"];
                    Ok(())
                })
                .unwrap()
        );
        assert!(operations.cancel("main", "published").is_err());
        assert!(
            lease
                .publish(|| {
                    catalog.clear();
                    Ok(())
                })
                .is_err()
        );
        assert_eq!(catalog, ["new"]);
    }

    #[test]
    fn concurrent_cancel_cannot_acknowledge_after_publication() {
        use std::sync::{
            Barrier,
            atomic::{AtomicBool, Ordering},
        };
        let operations = ScanOperations::default();
        operations.reserve("main".into(), "race".into()).unwrap();
        let lease = operations.begin("main".into(), "race".into()).unwrap();
        let barrier = Barrier::new(2);
        let applied = AtomicBool::new(false);
        std::thread::scope(|scope| {
            let publication = scope.spawn(|| {
                barrier.wait();
                lease
                    .publish(|| {
                        applied.store(true, Ordering::Release);
                        Ok(())
                    })
                    .unwrap()
            });
            barrier.wait();
            let cancelled = operations.cancel("main", "race").is_ok();
            let published = publication.join().unwrap();
            assert_ne!(cancelled, published);
            assert_eq!(applied.load(Ordering::Acquire), published);
        });
    }

    #[test]
    fn failed_publication_does_not_complete_admission() {
        let operations = ScanOperations::default();
        operations.reserve("main".into(), "failed".into()).unwrap();
        let lease = operations.begin("main".into(), "failed".into()).unwrap();
        assert_eq!(
            lease.publish(|| Err("disk failure".into())).unwrap_err(),
            "disk failure"
        );
        operations.cancel("main", "failed").unwrap();
        assert!(
            !lease
                .publish(|| panic!("cancelled publication executed"))
                .unwrap()
        );
    }
}
