use std::{
  collections::{HashMap, HashSet},
  fs::{self, File, OpenOptions},
  io::{self, BufReader, BufWriter, Write},
  path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{index::{self, IndexedItem}, BrowserError, BrowserItem, BrowserItemKind, BrowserRoot, CatalogResult};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RootRecord {
  pub root: BrowserRoot,
  pub index_file: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Registry {
  pub version: u32,
  pub revision: u64,
  pub roots: Vec<RootRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskIndex {
  version: u32,
  root_id: String,
  items: Vec<BrowserItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexSnapshot<'a> {
  version: u32,
  root_id: &'a str,
  items: ItemSlice<'a>,
}

struct ItemSlice<'a>(&'a [IndexedItem]);

impl Serialize for ItemSlice<'_> {
  fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
    use serde::ser::SerializeSeq;
    let mut sequence = serializer.serialize_seq(Some(self.0.len()))?;
    for entry in self.0 {
      sequence.serialize_element(&entry.item)?;
    }
    sequence.end()
  }
}

pub(super) struct Storage {
  directory: PathBuf,
}

impl Storage {
  pub fn new(app_data: PathBuf) -> CatalogResult<Self> {
    super::absolute_path(&app_data)?;
    let directory = app_data.join("browser-catalog");
    fs::create_dir_all(&directory).map_err(|error| BrowserError::io(error, &directory))?;
    Ok(Self { directory })
  }

  pub fn load_registry(&self) -> CatalogResult<Registry> {
    let path = self.directory.join("roots.json");
    let file = match File::open(&path) {
      Ok(file) => file,
      Err(error) if error.kind() == io::ErrorKind::NotFound => {
        return Ok(Registry { version: 1, revision: 0, roots: Vec::new() });
      }
      Err(error) => return Err(BrowserError::io(error, &path)),
    };
    let registry: Registry = serde_json::from_reader(BufReader::new(file))
      .map_err(|error| BrowserError::new("invalid-index", error.to_string(), Some(&path)))?;
    if registry.version != 1 {
      return Err(BrowserError::new("invalid-index", "Unsupported browser registry version", Some(&path)));
    }
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    for record in &registry.roots {
      super::absolute_path(Path::new(&record.root.path))?;
      if Uuid::parse_str(&record.root.id).is_err()
        || !ids.insert(&record.root.id)
        || !paths.insert(&record.root.path)
        || record.index_file.as_deref().is_some_and(|name| !index_filename(name))
      {
        return Err(BrowserError::new("invalid-index", "Invalid or duplicate browser root record", Some(&path)));
      }
    }
    Ok(registry)
  }

  pub fn write_registry(&self, registry: &Registry) -> CatalogResult<()> {
    atomic_json(&self.directory.join("roots.json"), registry)
  }

  pub fn load_index(&self, record: &RootRecord) -> CatalogResult<Vec<IndexedItem>> {
    let Some(name) = &record.index_file else { return Ok(Vec::new()); };
    let path = self.directory.join(name);
    let file = File::open(&path).map_err(|error| BrowserError::io(error, &path))?;
    let snapshot: DiskIndex = serde_json::from_reader(BufReader::new(file))
      .map_err(|error| BrowserError::new("invalid-index", error.to_string(), Some(&path)))?;
    if snapshot.root_id != record.root.id {
      return Err(BrowserError::new("invalid-index", "Browser index belongs to a different root", Some(&path)));
    }
    if snapshot.version == 1 {
      return Err(BrowserError::new("reindex-required", "Browser folder index needs rebuilding", Some(&path)));
    }
    if snapshot.version != 2 {
      return Err(BrowserError::new("invalid-index", "Unsupported browser index version", Some(&path)));
    }
    let mut ids = HashSet::with_capacity(snapshot.items.len());
    let paths: HashMap<&str, BrowserItemKind> = snapshot.items.iter()
      .map(|item| (item.relative_path.as_str(), item.kind)).collect();
    for item in &snapshot.items {
      let relative = Path::new(&item.relative_path);
      let valid = item.root_id == record.root.id
        && !relative.as_os_str().is_empty()
        && relative.components().all(|part| matches!(part, Component::Normal(_)))
        && !item.relative_path.as_bytes().contains(&0)
        && Path::new(&record.root.path).join(relative) == Path::new(&item.path)
        && Path::new(&item.path).file_name().and_then(|name| name.to_str()) == Some(item.name.as_str())
        && item.id == index::item_id(&record.root.id, &item.relative_path)
        && relative.parent().filter(|parent| !parent.as_os_str().is_empty()).map_or(true, |parent| {
          parent.to_str().and_then(|parent| paths.get(parent)) == Some(&BrowserItemKind::Folder)
        })
        && ids.insert(item.id.as_str());
      if !valid {
        return Err(BrowserError::new("invalid-index", "Invalid browser index item", Some(&path)));
      }
    }
    drop(ids);
    drop(paths);
    let mut items: Vec<IndexedItem> = snapshot.items.into_iter().map(IndexedItem::new).collect();
    index::sort(&mut items);
    Ok(items)
  }

  pub fn write_index(&self, root_id: &str, items: &[IndexedItem]) -> CatalogResult<String> {
    let name = format!("index-{}.json", Uuid::new_v4());
    atomic_json(&self.directory.join(&name), &IndexSnapshot {
      version: 2,
      root_id,
      items: ItemSlice(items),
    })?;
    Ok(name)
  }

  pub fn remove_index(&self, name: &str) {
    if !index_filename(name) {
      return;
    }
    let path = self.directory.join(name);
    if let Err(error) = fs::remove_file(&path) {
      if error.kind() != io::ErrorKind::NotFound {
        log::warn!("Could not remove browser index {}: {error}", path.display());
      }
    }
  }

  pub fn remove_unreferenced_indexes(&self, registry: &Registry) -> CatalogResult<()> {
    let retained: HashSet<&str> = registry.roots.iter()
      .filter_map(|record| record.index_file.as_deref()).collect();
    for entry in fs::read_dir(&self.directory).map_err(|error| BrowserError::io(error, &self.directory))? {
      let entry = entry.map_err(|error| BrowserError::io(error, &self.directory))?;
      let name = entry.file_name();
      if let Some(name) = name.to_str() {
        if index_filename(name) && !retained.contains(name) {
          self.remove_index(name);
        }
      }
    }
    Ok(())
  }
}

fn index_filename(name: &str) -> bool {
  name.strip_prefix("index-").and_then(|name| name.strip_suffix(".json"))
    .is_some_and(|id| Uuid::parse_str(id).is_ok())
}

struct TemporaryFile(PathBuf);

impl Drop for TemporaryFile {
  fn drop(&mut self) {
    let _ = fs::remove_file(&self.0);
  }
}

fn atomic_json(path: &Path, value: &impl Serialize) -> CatalogResult<()> {
  let parent = path.parent()
    .ok_or_else(|| BrowserError::new("invalid-path", "Browser index has no parent", Some(path)))?;
  let temporary = TemporaryFile(parent.join(format!(".browser-{}.tmp", Uuid::new_v4())));
  let file = OpenOptions::new().write(true).create_new(true).open(&temporary.0)
    .map_err(|error| BrowserError::io(error, &temporary.0))?;
  let mut writer = BufWriter::new(file);
  serde_json::to_writer(&mut writer, value)
    .map_err(|error| BrowserError::new("io", error.to_string(), Some(path)))?;
  writer.flush().map_err(|error| BrowserError::io(error, &temporary.0))?;
  writer.get_ref().sync_all().map_err(|error| BrowserError::io(error, &temporary.0))?;
  drop(writer);
  fs::rename(&temporary.0, path).map_err(|error| BrowserError::io(error, path))?;
  #[cfg(not(target_os = "windows"))]
  if let Err(error) = File::open(parent).and_then(|directory| directory.sync_all()) {
    log::warn!("Browser index was published but directory sync failed {}: {error}", parent.display());
  }
  Ok(())
}
