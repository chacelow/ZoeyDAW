use std::{
  collections::HashSet,
  path::{Path, PathBuf},
  sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, MutexGuard},
  thread,
};

use uuid::Uuid;

use super::{
  index::{self, IndexedItem, Progress, ScanOutcome},
  persistence::{Registry, RootRecord, Storage},
  BrowserError, BrowserItem, BrowserItemKind, BrowserTreePage, BrowserRoot, BrowserRootStatus, BrowserRoots, CatalogResult,
};

struct ScanTicket {
  operation_id: String,
  cancelled: AtomicBool,
}

#[derive(Clone)]
struct RootEntry {
  root: BrowserRoot,
  index_file: Option<String>,
  index: Arc<Vec<IndexedItem>>,
  scan: Option<Arc<ScanTicket>>,
}

#[derive(Clone)]
struct CatalogState {
  revision: u64,
  roots: Vec<RootEntry>,
}

impl CatalogState {
  fn snapshot(&self) -> BrowserRoots {
    BrowserRoots { revision: self.revision, roots: self.roots.iter().map(|entry| entry.root.clone()).collect() }
  }

  fn registry(&self) -> Registry {
    Registry {
      version: 1,
      revision: self.revision,
      roots: self.roots.iter().map(|entry| RootRecord {
        root: entry.root.clone(),
        index_file: entry.index_file.clone(),
      }).collect(),
    }
  }

  fn advance(&mut self) {
    self.revision = self.revision.saturating_add(1);
  }
}

struct Inner {
  storage: Storage,
  state: Mutex<CatalogState>,
  mutation: Mutex<()>,
  #[cfg(test)]
  publish_gate: Mutex<Option<Arc<super::tests::PublishGate>>>,
}

#[derive(Clone)]
pub struct BrowserCatalog {
  inner: Arc<Inner>,
}

impl BrowserCatalog {
  pub fn new(app_data_dir: PathBuf) -> CatalogResult<Self> {
    let storage = Storage::new(app_data_dir)?;
    let registry = storage.load_registry()?;
    let mut state = CatalogState { revision: registry.revision, roots: Vec::with_capacity(registry.roots.len()) };
    let mut changed = false;
    let mut reindex = Vec::new();
    for record in registry.roots {
      let loaded = storage.load_index(&record);
      let mut root = record.root;
      let mut index_file = record.index_file;
      let mut needs_reindex = false;
      let index = match loaded {
        Ok(index) => index,
        Err(error) => {
          needs_reindex = error.code == "reindex-required";
          root.status = if needs_reindex { BrowserRootStatus::Cancelled } else { BrowserRootStatus::Error };
          root.error = Some(error.message);
          if needs_reindex {
            index_file = None;
            root.scanned_files = 0;
            root.audio_files = 0;
          }
          changed = true;
          Vec::new()
        }
      };
      if root.status == BrowserRootStatus::Scanning {
        root.status = BrowserRootStatus::Cancelled;
        root.error = Some("Scan interrupted by application shutdown; refresh to resume".into());
        changed = true;
      }
      if root.operation_id.take().is_some() {
        changed = true;
      }
      if let Some(error) = index::offline_error(Path::new(&root.path)) {
        root.status = unavailable_status(&error);
        root.error = Some(error.message);
        changed = true;
      } else if needs_reindex {
        reindex.push(root.id.clone());
      }
      state.roots.push(RootEntry { root, index_file, index: Arc::new(index), scan: None });
    }
    if changed {
      state.advance();
    }
    storage.write_registry(&state.registry())?;
    storage.remove_unreferenced_indexes(&state.registry())?;
    let catalog = Self { inner: Arc::new(Inner {
      storage,
      state: Mutex::new(state),
      mutation: Mutex::new(()),
      #[cfg(test)]
      publish_gate: Mutex::new(None),
    }) };
    for root_id in reindex {
      catalog.refresh_root(&root_id, format!("folder-index-upgrade-{}", Uuid::new_v4()))?;
    }
    Ok(catalog)
  }

  fn state(&self) -> CatalogResult<MutexGuard<'_, CatalogState>> {
    self.inner.state.lock().map_err(|_| BrowserError::internal())
  }

  fn mutation(&self) -> CatalogResult<MutexGuard<'_, ()>> {
    self.inner.mutation.lock().map_err(|_| BrowserError::internal())
  }

  fn commit(&self, current: &mut CatalogState, next: CatalogState) -> CatalogResult<()> {
    self.inner.storage.write_registry(&next.registry())?;
    *current = next;
    Ok(())
  }

  pub fn roots(&self) -> CatalogResult<BrowserRoots> {
    let _mutation = self.mutation()?;
    let mut state = self.state()?;
    let mut next = state.clone();
    let mut cancelled = Vec::new();
    let mut changed = false;
    for entry in &mut next.roots {
      if let Some(error) = index::offline_error(Path::new(&entry.root.path)) {
        let status = unavailable_status(&error);
        if entry.root.status != status || entry.root.error.as_deref() != Some(error.message.as_str()) {
          entry.root.status = status;
          entry.root.error = Some(error.message);
          entry.root.operation_id = None;
          if let Some(ticket) = entry.scan.take() {
            cancelled.push(ticket);
          }
          changed = true;
        }
      }
    }
    if changed {
      next.advance();
      self.commit(&mut state, next)?;
      for ticket in cancelled {
        ticket.cancelled.store(true, Ordering::Release);
      }
    }
    Ok(state.snapshot())
  }

  pub fn add_root(&self, path: PathBuf, operation_id: String) -> CatalogResult<BrowserRoots> {
    let path = index::root_path(path)?;
    let path_string = path.to_str()
      .ok_or_else(|| BrowserError::new("invalid-path", "Browser root is not valid UTF-8", Some(&path)))?;
    self.start_scan(None, Some(path_string), operation_id)
  }

  pub fn refresh_root(&self, root_id: &str, operation_id: String) -> CatalogResult<BrowserRoots> {
    self.start_scan(Some(root_id), None, operation_id)
  }

  fn start_scan(&self, root_id: Option<&str>, path: Option<&str>, operation_id: String) -> CatalogResult<BrowserRoots> {
    if operation_id.trim().is_empty() {
      return Err(BrowserError::new("invalid-operation", "Scan operationId must not be empty", None));
    }
    let _mutation = self.mutation()?;
    let mut state = self.state()?;
    if state.roots.iter().any(|entry| entry.scan.as_ref().is_some_and(|scan| scan.operation_id == operation_id)) {
      return Err(BrowserError::new("operation-in-use", "Scan operationId is already active", None));
    }
    let mut next = state.clone();
    let position = if let Some(id) = root_id {
      next.roots.iter().position(|entry| entry.root.id == id).ok_or_else(root_not_found)?
    } else if let Some(position) = next.roots.iter().position(|entry| Some(entry.root.path.as_str()) == path) {
      position
    } else {
      let path = path.ok_or_else(|| BrowserError::new("invalid-path", "Browser root path is missing", None))?;
      let name = Path::new(path).file_name().and_then(|value| value.to_str()).unwrap_or(path).to_owned();
      next.roots.push(RootEntry {
        root: BrowserRoot {
          id: Uuid::new_v4().to_string(), name, path: path.into(),
          status: BrowserRootStatus::Scanning, operation_id: None,
          scanned_files: 0, audio_files: 0, error: None,
        },
        index_file: None,
        index: Arc::new(Vec::new()),
        scan: None,
      });
      next.roots.len() - 1
    };
    let entry = &mut next.roots[position];
    let old_ticket = entry.scan.take();
    let ticket = if let Some(error) = index::offline_error(Path::new(&entry.root.path)) {
      entry.root.status = unavailable_status(&error);
      entry.root.error = Some(error.message);
      entry.root.operation_id = None;
      None
    } else {
      entry.root.status = BrowserRootStatus::Scanning;
      entry.root.error = None;
      entry.root.operation_id = Some(operation_id.clone());
      entry.root.scanned_files = 0;
      entry.root.audio_files = 0;
      let ticket = Arc::new(ScanTicket { operation_id, cancelled: AtomicBool::new(false) });
      entry.scan = Some(Arc::clone(&ticket));
      Some(ticket)
    };
    let scan_root = entry.root.clone();
    next.advance();
    self.commit(&mut state, next)?;
    if let Some(old_ticket) = old_ticket {
      old_ticket.cancelled.store(true, Ordering::Release);
    }
    let response = state.snapshot();
    drop(state);
    drop(_mutation);
    if let Some(ticket) = ticket {
      let catalog = self.clone();
      let worker_ticket = Arc::clone(&ticket);
      let worker_root = scan_root.clone();
      if let Err(error) = thread::Builder::new().name("browser-catalog-scan".into()).spawn(move || {
        let outcome = index::scan(&worker_root.id, Path::new(&worker_root.path), &worker_ticket.cancelled, |progress| {
          catalog.progress(&worker_root.id, &worker_ticket, progress);
        });
        #[cfg(test)]
        let gate = catalog.inner.publish_gate.lock().ok().and_then(|mut gate| gate.take());
        #[cfg(test)]
        if let Some(gate) = &gate {
          gate.reached.wait();
          gate.release.wait();
        }
        if let Err(error) = catalog.finish_scan(&worker_root.id, &worker_ticket, outcome) {
          catalog.publish_failure(&worker_root.id, &worker_ticket, error);
        }
        #[cfg(test)]
        if let Some(gate) = gate {
          gate.finished.wait();
        }
      }) {
        let error = BrowserError::new("io", error.to_string(), Some(Path::new(&scan_root.path)));
        self.publish_failure(&scan_root.id, &ticket, error.clone());
        return Err(error);
      }
    }
    Ok(response)
  }

  pub fn cancel_scan(&self, operation_id: &str) -> CatalogResult<()> {
    {
      let state = self.state()?;
      for entry in &state.roots {
        if let Some(ticket) = &entry.scan {
          if ticket.operation_id == operation_id {
            ticket.cancelled.store(true, Ordering::Release);
          }
        }
      }
    }
    let _mutation = self.mutation()?;
    let mut state = self.state()?;
    let mut next = state.clone();
    let mut changed = false;
    for entry in &mut next.roots {
      if entry.scan.as_ref().is_some_and(|ticket| ticket.operation_id == operation_id) {
        entry.scan = None;
        entry.root.operation_id = None;
        entry.root.status = BrowserRootStatus::Cancelled;
        entry.root.error = None;
        changed = true;
      }
    }
    if changed {
      next.advance();
      let persisted = self.inner.storage.write_registry(&next.registry());
      *state = next;
      persisted?;
    }
    Ok(())
  }

  pub fn remove_root(&self, root_id: &str) -> CatalogResult<BrowserRoots> {
    {
      let state = self.state()?;
      let entry = state.roots.iter().find(|entry| entry.root.id == root_id).ok_or_else(root_not_found)?;
      if let Some(ticket) = &entry.scan {
        ticket.cancelled.store(true, Ordering::Release);
      }
    }
    let _mutation = self.mutation()?;
    let mut state = self.state()?;
    let mut next = state.clone();
    let position = next.roots.iter().position(|entry| entry.root.id == root_id).ok_or_else(root_not_found)?;
    let removed = next.roots.remove(position);
    next.advance();
    if let Err(error) = self.commit(&mut state, next) {
      if let Some(entry) = state.roots.iter_mut().find(|entry| entry.root.id == root_id) {
        if entry.scan.as_ref().is_some_and(|ticket| ticket.cancelled.load(Ordering::Acquire)) {
          entry.scan = None;
          entry.root.operation_id = None;
          entry.root.status = BrowserRootStatus::Cancelled;
          entry.root.error = Some(error.message.clone());
          state.advance();
        }
      }
      return Err(error);
    }
    let response = state.snapshot();
    drop(state);
    if let Some(name) = removed.index_file {
      self.inner.storage.remove_index(&name);
    }
    Ok(response)
  }

  pub fn tree(
    &self, root_id: Option<&str>, query: &str, expanded: &[String], offset: usize,
    limit: Option<usize>, request_id: String,
  ) -> CatalogResult<BrowserTreePage> {
    let (revision, mut roots) = {
      let state = self.state()?;
      if let Some(id) = root_id {
        if !state.roots.iter().any(|entry| entry.root.id == id) {
          return Err(root_not_found());
        }
      }
      (state.revision, state.roots.iter()
        .filter(|entry| root_id.map_or(true, |id| entry.root.id == id))
        .map(|entry| (entry.root.clone(), Arc::clone(&entry.index))).collect::<Vec<_>>())
    };
    roots.sort_by_cached_key(|(root, _)| (root.name.to_lowercase(), root.path.clone()));
    let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    let expanded: HashSet<&str> = expanded.iter().map(String::as_str).collect();
    let mut window = index::Window::new(offset, limit.unwrap_or(100).min(500));
    for (root, index) in roots {
      let unavailable = index::offline_error(Path::new(&root.path)).or_else(|| {
        match root.status {
          BrowserRootStatus::Offline => Some(BrowserError::new("offline", root.error.clone().unwrap_or_else(|| "Refresh this root to reconnect".into()), Some(Path::new(&root.path)))),
          BrowserRootStatus::Error => Some(BrowserError::new("scan-error", root.error.clone().unwrap_or_else(|| "Browser root scan failed".into()), Some(Path::new(&root.path)))),
          BrowserRootStatus::Scanning | BrowserRootStatus::Ready | BrowserRootStatus::Cancelled => None,
        }
      });
      if let Some(error) = &unavailable {
        if root_id.is_some() {
          return Err(error.clone());
        }
      }
      let root_matches = root_id.is_none() && !words.is_empty()
        && words.iter().all(|word| root.name.to_lowercase().contains(word));
      let retained = if words.is_empty() || unavailable.is_some() {
        None
      } else if root_matches {
        Some(vec![true; index.len()])
      } else {
        Some(index::search(&index, &words))
      };
      if root_id.is_none() {
        if !words.is_empty() && !root_matches && !retained.as_ref().is_some_and(|matches| matches.iter().any(|matched| *matched)) {
          continue;
        }
        window.push(&BrowserItem {
          id: root.id.clone(), root_id: root.id.clone(), name: root.name, path: root.path,
          relative_path: String::new(), kind: BrowserItemKind::Folder, byte_length: 0, modified_millis: 0,
        }, 0, unavailable.is_none() && !index.is_empty());
        if unavailable.is_some() || (words.is_empty() && !expanded.contains(root.id.as_str())) {
          continue;
        }
      }
      index::tree(&index, &expanded, retained.as_deref(), usize::from(root_id.is_none()), &mut window);
    }
    Ok(BrowserTreePage { request_id, revision, total: window.total, offset, items: window.items })
  }

  fn progress(&self, root_id: &str, ticket: &Arc<ScanTicket>, progress: Progress) {
    let Ok(mut state) = self.state() else { return; };
    if let Some(entry) = state.roots.iter_mut().find(|entry| entry.root.id == root_id && current(entry, ticket)) {
      entry.root.scanned_files = progress.scanned;
      entry.root.audio_files = progress.audio;
      state.advance();
    }
  }

  fn finish_scan(&self, root_id: &str, ticket: &Arc<ScanTicket>, outcome: ScanOutcome) -> CatalogResult<()> {
    if matches!(outcome, ScanOutcome::Cancelled) {
      return Ok(());
    }
    let _mutation = self.mutation()?;
    if !self.state()?.roots.iter().any(|entry| entry.root.id == root_id && current(entry, ticket)) {
      return Ok(());
    }
    let (new_index, failure, progress) = match outcome {
      ScanOutcome::Complete(items, progress) => {
        let file = self.inner.storage.write_index(root_id, &items)?;
        (Some((file, Arc::new(items))), None, progress)
      }
      ScanOutcome::Failed(error, progress) => (None, Some(error), progress),
      ScanOutcome::Cancelled => return Ok(()),
    };
    let mut state = self.state()?;
    let Some(position) = state.roots.iter().position(|entry| entry.root.id == root_id && current(entry, ticket)) else {
      if let Some((file, _)) = new_index {
        self.inner.storage.remove_index(&file);
      }
      return Ok(());
    };
    let mut next = state.clone();
    let entry = &mut next.roots[position];
    let old_file = entry.index_file.clone();
    entry.scan = None;
    entry.root.operation_id = None;
    entry.root.scanned_files = progress.scanned;
    entry.root.audio_files = progress.audio;
    let failure = index::offline_error(Path::new(&entry.root.path)).or(failure);
    if let Some(error) = failure {
      entry.root.status = unavailable_status(&error);
      entry.root.error = Some(error.message);
    } else {
      entry.root.status = BrowserRootStatus::Ready;
      entry.root.error = None;
    }
    if let Some((file, items)) = &new_index {
      entry.index_file = Some(file.clone());
      entry.index = Arc::clone(items);
    }
    next.advance();
    if let Err(error) = self.commit(&mut state, next) {
      if let Some((file, _)) = new_index {
        self.inner.storage.remove_index(&file);
      }
      return Err(error);
    }
    drop(state);
    if new_index.is_some() {
      if let Some(file) = old_file {
        self.inner.storage.remove_index(&file);
      }
    }
    Ok(())
  }

  fn publish_failure(&self, root_id: &str, ticket: &Arc<ScanTicket>, error: BrowserError) {
    log::error!("Browser scan failed: {error}");
    let Ok(_mutation) = self.mutation() else { return; };
    let Ok(mut state) = self.state() else { return; };
    let Some(position) = state.roots.iter().position(|entry| entry.root.id == root_id && current(entry, ticket)) else { return; };
    let mut next = state.clone();
    let entry = &mut next.roots[position];
    entry.scan = None;
    entry.root.operation_id = None;
    entry.root.status = BrowserRootStatus::Error;
    entry.root.error = Some(error.message);
    next.advance();
    if let Err(error) = self.inner.storage.write_registry(&next.registry()) {
      log::error!("Could not persist browser scan failure: {error}");
    }
    *state = next;
  }

  #[cfg(test)]
  pub(super) fn pause_next_publish(&self, gate: Arc<super::tests::PublishGate>) -> CatalogResult<()> {
    *self.inner.publish_gate.lock().map_err(|_| BrowserError::internal())? = Some(gate);
    Ok(())
  }
}

fn current(entry: &RootEntry, ticket: &Arc<ScanTicket>) -> bool {
  !ticket.cancelled.load(Ordering::Acquire)
    && entry.scan.as_ref().is_some_and(|active| Arc::ptr_eq(active, ticket))
}

fn root_not_found() -> BrowserError {
  BrowserError::new("root-not-found", "Browser root reference does not exist", None)
}

fn unavailable_status(error: &BrowserError) -> BrowserRootStatus {
  if error.code == "offline" { BrowserRootStatus::Offline } else { BrowserRootStatus::Error }
}
