use std::{
  cmp::Ordering,
  collections::{HashMap, HashSet},
  fs,
  io,
  path::{Path, PathBuf},
  sync::atomic::{AtomicBool, Ordering as AtomicOrdering},
  time::{Instant, UNIX_EPOCH},
};

use sha2::{Digest, Sha256};

use super::{BrowserError, BrowserItem, BrowserItemKind, BrowserTreeRow, CatalogResult};

#[derive(Debug)]
pub(super) struct IndexedItem {
  pub item: BrowserItem,
  search_text: String,
  sort_name: String,
  parent: Option<usize>,
  depth: usize,
  subtree_end: usize,
}

impl IndexedItem {
  pub fn new(item: BrowserItem) -> Self {
    Self {
      search_text: item.relative_path.to_lowercase(),
      sort_name: item.name.to_lowercase(),
      item,
      parent: None,
      depth: 0,
      subtree_end: 0,
    }
  }

  fn compare(&self, other: &Self) -> Ordering {
    let folder = self.item.kind == BrowserItemKind::Folder;
    let other_folder = other.item.kind == BrowserItemKind::Folder;
    other_folder.cmp(&folder)
      .then_with(|| self.sort_name.cmp(&other.sort_name))
      .then_with(|| self.item.path.cmp(&other.item.path))
  }
}

pub(super) fn sort(items: &mut Vec<IndexedItem>) {
  let lookup: HashMap<&str, usize> = items.iter().enumerate()
    .map(|(position, entry)| (entry.item.relative_path.as_str(), position)).collect();
  let mut children = vec![Vec::new(); items.len() + 1];
  for (position, entry) in items.iter().enumerate() {
    let parent = Path::new(&entry.item.relative_path).parent().and_then(Path::to_str)
      .and_then(|path| lookup.get(path)).copied().unwrap_or(items.len());
    children[parent].push(position);
  }
  for siblings in &mut children {
    siblings.sort_unstable_by(|left, right| items[*left].compare(&items[*right]));
  }
  drop(lookup);
  let mut pending: Vec<_> = children[items.len()].iter().rev().map(|position| (*position, None, 0)).collect();
  let mut source: Vec<_> = items.drain(..).map(Some).collect();
  while let Some((position, parent, depth)) = pending.pop() {
    let mut entry = source[position].take().expect("Each indexed path has one parent");
    entry.parent = parent;
    entry.depth = depth;
    let next_parent = Some(items.len());
    pending.extend(children[position].iter().rev().map(|child| (*child, next_parent, depth + 1)));
    items.push(entry);
  }
  let mut open: Vec<usize> = Vec::new();
  for position in 0..items.len() {
    while open.last().is_some_and(|parent| items[*parent].depth >= items[position].depth) {
      items[open.pop().unwrap()].subtree_end = position;
    }
    open.push(position);
  }
  for position in open {
    items[position].subtree_end = items.len();
  }
}

pub(super) fn item_id(root_id: &str, relative_path: &str) -> String {
  let mut digest = Sha256::new();
  digest.update(root_id.as_bytes());
  digest.update([0]);
  digest.update(relative_path.as_bytes());
  format!("browser-item-{:x}", digest.finalize())
}

#[derive(Clone, Copy, Debug, Default)]
pub(super) struct Progress {
  pub scanned: u64,
  pub audio: u64,
}

pub(super) enum ScanOutcome {
  Complete(Vec<IndexedItem>, Progress),
  Cancelled,
  Failed(BrowserError, Progress),
}

fn candidate(path: &Path) -> bool {
  path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| {
    ["wav", "aif", "aiff", "flac", "mp3"].iter()
      .any(|supported| extension.eq_ignore_ascii_case(supported))
  })
}

pub(super) fn scan(
  root_id: &str,
  root: &Path,
  cancelled: &AtomicBool,
  mut publish_progress: impl FnMut(Progress),
) -> ScanOutcome {
  let mut progress = Progress::default();
  let result = scan_tree(root_id, root, cancelled, &mut progress, &mut publish_progress);
  if cancelled.load(AtomicOrdering::Acquire) {
    return ScanOutcome::Cancelled;
  }
  match result {
    Ok(mut items) => {
      sort(&mut items);
      if cancelled.load(AtomicOrdering::Acquire) {
        ScanOutcome::Cancelled
      } else {
        ScanOutcome::Complete(items, progress)
      }
    }
    Err(error) => ScanOutcome::Failed(error, progress),
  }
}

fn scan_tree(
  root_id: &str,
  root: &Path,
  cancelled: &AtomicBool,
  progress: &mut Progress,
  publish_progress: &mut impl FnMut(Progress),
) -> CatalogResult<Vec<IndexedItem>> {
  let canonical_root = fs::canonicalize(root).map_err(|error| BrowserError::io(error, root))?;
  let mut directories = vec![root.to_path_buf()];
  let mut visited = HashSet::new();
  let mut items = Vec::new();
  let mut published_at = Instant::now();
  while let Some(directory) = directories.pop() {
    if cancelled.load(AtomicOrdering::Acquire) {
      return Ok(items);
    }
    let metadata = match fs::symlink_metadata(&directory) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == io::ErrorKind::NotFound && directory != root => continue,
      Err(error) => return Err(BrowserError::io(error, &directory)),
    };
    if metadata.file_type().is_symlink() && directory != root {
      continue;
    }
    let canonical = fs::canonicalize(&directory).map_err(|error| BrowserError::io(error, &directory))?;
    if !canonical.starts_with(&canonical_root) || !visited.insert(canonical) {
      continue;
    }
    let entries = fs::read_dir(&directory).map_err(|error| BrowserError::io(error, &directory))?;
    for entry in entries {
      if cancelled.load(AtomicOrdering::Acquire) {
        return Ok(items);
      }
      let entry = entry.map_err(|error| BrowserError::io(error, &directory))?;
      let path = entry.path();
      let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
        Err(error) => return Err(BrowserError::io(error, &path)),
      };
      let kind = if metadata.is_dir() {
        directories.push(path.clone());
        BrowserItemKind::Folder
      } else if metadata.is_file() {
        progress.scanned += 1;
        if !candidate(&path) {
          continue;
        }
        progress.audio += 1;
        BrowserItemKind::Audio
      } else {
        continue;
      };
      let name = entry.file_name().into_string()
        .map_err(|_| BrowserError::new("invalid-path", "Browser filename is not valid UTF-8", Some(&path)))?;
      let path_string = path.to_str()
        .ok_or_else(|| BrowserError::new("invalid-path", "Browser path is not valid UTF-8", Some(&path)))?;
      let relative = path.strip_prefix(root)
        .map_err(|error| BrowserError::new("invalid-path", error.to_string(), Some(&path)))?;
      let relative_path = relative.to_str()
        .ok_or_else(|| BrowserError::new("invalid-path", "Relative browser path is not valid UTF-8", Some(&path)))?;
      let modified_millis = metadata.modified().map_err(|error| BrowserError::io(error, &path))?
        .duration_since(UNIX_EPOCH).map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0);
      items.push(IndexedItem::new(BrowserItem {
        id: item_id(root_id, relative_path),
        root_id: root_id.into(),
        name,
        path: path_string.into(),
        relative_path: relative_path.into(),
        kind,
        byte_length: if kind == BrowserItemKind::Audio { metadata.len() } else { 0 },
        modified_millis,
      }));
      if progress.scanned % 64 == 0 && published_at.elapsed().as_millis() >= 100 {
        publish_progress(*progress);
        published_at = Instant::now();
      }
    }
  }
  Ok(items)
}

pub(super) struct Window {
  pub total: usize,
  pub items: Vec<BrowserTreeRow>,
  offset: usize,
  limit: usize,
}

impl Window {
  pub fn new(offset: usize, limit: usize) -> Self {
    Self { total: 0, items: Vec::with_capacity(limit), offset, limit }
  }

  pub fn push(&mut self, item: &BrowserItem, depth: usize, has_children: bool) {
    if self.total >= self.offset && self.items.len() < self.limit {
      self.items.push(BrowserTreeRow { item: item.clone(), depth, has_children });
    }
    self.total += 1;
  }
}

pub(super) fn search(index: &[IndexedItem], words: &[String]) -> Vec<bool> {
  let mut retained: Vec<bool> = index.iter()
    .map(|entry| words.iter().all(|word| entry.search_text.contains(word))).collect();
  for position in (0..index.len()).rev() {
    if retained[position] {
      if let Some(parent) = index[position].parent {
        retained[parent] = true;
      }
    }
  }
  retained
}

pub(super) fn tree(
  index: &[IndexedItem], expanded: &HashSet<&str>, retained: Option<&[bool]>, depth: usize, window: &mut Window,
) {
  let mut position = 0;
  while let Some(entry) = index.get(position) {
    if retained.is_some_and(|matches| !matches[position]) {
      position = entry.subtree_end;
      continue;
    }
    let has_children = entry.subtree_end > position + 1;
    window.push(&entry.item, entry.depth + depth, has_children);
    if entry.item.kind == BrowserItemKind::Folder && retained.is_none() && !expanded.contains(entry.item.id.as_str()) {
      position = entry.subtree_end;
    } else {
      position += 1;
    }
  }
}

pub(super) fn offline_error(path: &Path) -> Option<BrowserError> {
  match fs::metadata(path) {
    Ok(metadata) if metadata.is_dir() => None,
    Ok(_) => Some(BrowserError::new("offline", "Browser root is no longer a directory", Some(path))),
    Err(error) => Some(BrowserError::io(error, path)),
  }
}

pub(super) fn root_path(path: PathBuf) -> CatalogResult<PathBuf> {
  super::absolute_path(&path)?;
  match fs::canonicalize(&path) {
    Ok(canonical) => {
      super::absolute_path(&canonical)?;
      if !canonical.is_dir() {
        return Err(BrowserError::new("invalid-path", "Browser root must be a directory", Some(&canonical)));
      }
      Ok(canonical)
    }
    Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(path),
    Err(error) => Err(BrowserError::io(error, &path)),
  }
}
