use std::{
  fs,
  path::{Path, PathBuf},
  sync::{Arc, Barrier},
  thread,
  time::{Duration, Instant},
};

use uuid::Uuid;

use super::{index, BrowserCatalog, BrowserItemKind, BrowserRoot, BrowserRootStatus};

pub(super) struct PublishGate {
  pub reached: Barrier,
  pub release: Barrier,
  pub finished: Barrier,
}

impl PublishGate {
  fn new() -> Arc<Self> {
    Arc::new(Self { reached: Barrier::new(2), release: Barrier::new(2), finished: Barrier::new(2) })
  }
}

struct Disk(PathBuf);

impl Disk {
  fn new() -> Self {
    let path = std::env::temp_dir().join(format!("zoeydaw-browser-test-{}", Uuid::new_v4()));
    fs::create_dir_all(&path).unwrap();
    Self(fs::canonicalize(path).unwrap())
  }

  fn directory(&self, relative: &str) -> PathBuf {
    let path = self.0.join(relative);
    fs::create_dir_all(&path).unwrap();
    path
  }

  fn catalog(&self) -> BrowserCatalog {
    BrowserCatalog::new(self.directory("app-data")).unwrap()
  }
}

impl Drop for Disk {
  fn drop(&mut self) {
    let _ = fs::remove_dir_all(&self.0);
  }
}

fn audio(root: &Path, relative: &str) -> PathBuf {
  let path = root.join(relative);
  fs::create_dir_all(path.parent().unwrap()).unwrap();
  fs::write(&path, b"catalog candidates are decoded only on preview or import").unwrap();
  path
}

fn ready(catalog: &BrowserCatalog, root_id: &str) -> BrowserRoot {
  let deadline = Instant::now() + Duration::from_secs(30);
  loop {
    let root = catalog.roots().unwrap().roots.into_iter().find(|root| root.id == root_id).unwrap();
    if root.status != BrowserRootStatus::Scanning {
      assert_eq!(root.status, BrowserRootStatus::Ready, "{root:?}");
      return root;
    }
    assert!(Instant::now() < deadline, "Catalog scan did not finish: {root:?}");
    thread::sleep(Duration::from_millis(5));
  }
}

fn add(catalog: &BrowserCatalog, path: PathBuf, operation: &str) -> String {
  let roots = catalog.add_root(path.clone(), operation.into()).unwrap();
  let root = roots.roots.into_iter().find(|root| Path::new(&root.path) == path).unwrap();
  ready(catalog, &root.id);
  root.id
}

#[test]
fn disk_index_persists_stable_item_identity_and_supported_candidates() {
  let disk = Disk::new();
  let media = disk.directory("media");
  for file in ["nested/Vocal.WAV", "nested/音声.aif", "pad.AIFF", "bass.flac", "loop.Mp3"] {
    audio(&media, file);
  }
  audio(&media, "ignored.ogg");
  let catalog = disk.catalog();
  let id = add(&catalog, media, "first");
  let expanded = vec![index::item_id(&id, "nested")];
  let before = catalog.tree(Some(&id), "", &expanded, 0, None, "before".into()).unwrap();
  assert_eq!(before.total, 6);
  assert!(before.items.iter().filter(|row| row.item.kind == BrowserItemKind::Audio)
    .all(|row| row.item.byte_length > 0 && row.item.modified_millis > 0));
  assert_eq!(catalog.roots().unwrap().roots[0].scanned_files, 6);
  drop(catalog);
  let restored = disk.catalog();
  let after = restored.tree(Some(&id), "", &expanded, 0, None, "after".into()).unwrap();
  assert_eq!(before.items, after.items);
  restored.refresh_root(&id, "rescan".into()).unwrap();
  ready(&restored, &id);
  assert_eq!(after.items, restored.tree(Some(&id), "", &expanded, 0, None, "rescan".into()).unwrap().items);
}

#[cfg(unix)]
#[test]
fn nested_symlink_cycles_and_external_symlinks_are_not_followed() {
  use std::os::unix::fs::symlink;
  let disk = Disk::new();
  let media = disk.directory("media");
  let outside = disk.directory("outside");
  audio(&media, "nested/deeper/real.WAV");
  let external = audio(&outside, "not-part-of-library.wav");
  symlink(&media, media.join("nested/deeper/cycle")).unwrap();
  symlink(&outside, media.join("external-folder")).unwrap();
  symlink(external, media.join("external-file.wav")).unwrap();
  let catalog = disk.catalog();
  let id = add(&catalog, media, "symlinks");
  let expanded = vec![index::item_id(&id, "nested"), index::item_id(&id, "nested/deeper")];
  let response = catalog.tree(Some(&id), "", &expanded, 0, None, "symlinks".into()).unwrap();
  assert_eq!(response.total, 3);
  assert_eq!(response.items[2].item.relative_path, "nested/deeper/real.WAV");
}

#[test]
fn missing_root_is_offline_until_explicit_refresh() {
  let disk = Disk::new();
  let path = disk.0.join("disconnected");
  let catalog = disk.catalog();
  let response = catalog.add_root(path.clone(), "offline-add".into()).unwrap();
  let root = &response.roots[0];
  assert_eq!(root.status, BrowserRootStatus::Offline);
  assert!(root.operation_id.is_none());
  let id = root.id.clone();
  assert_eq!(catalog.tree(Some(&id), "", &[], 0, None, "offline".into()).unwrap_err().code, "offline");
  let all = catalog.tree(None, "", &[], 0, None, "all".into()).unwrap();
  assert_eq!(all.total, 1);
  assert!(!all.items[0].has_children);
  audio(&path, "connected.wav");
  assert_eq!(catalog.roots().unwrap().roots[0].status, BrowserRootStatus::Offline);
  assert_eq!(catalog.tree(Some(&id), "", &[], 0, None, "still-offline".into()).unwrap_err().code, "offline");
  catalog.refresh_root(&id, "reconnect".into()).unwrap();
  ready(&catalog, &id);
  assert_eq!(catalog.tree(Some(&id), "", &[], 0, None, "connected".into()).unwrap().total, 1);
  fs::rename(&path, disk.0.join("temporarily-away")).unwrap();
  assert_eq!(catalog.roots().unwrap().roots[0].status, BrowserRootStatus::Offline);
  drop(catalog);
  let restored = disk.catalog();
  assert_eq!(restored.roots().unwrap().roots[0].status, BrowserRootStatus::Offline);
  assert_eq!(restored.tree(Some(&id), "", &[], 0, None, "offline-restart".into()).unwrap_err().code, "offline");
}

#[cfg(unix)]
#[test]
fn missing_root_under_symlink_parent_reconnects_without_false_empty_index() {
  use std::os::unix::fs::symlink;
  let disk = Disk::new();
  let actual_parent = disk.directory("actual-parent");
  let alias = disk.0.join("parent-alias");
  symlink(&actual_parent, &alias).unwrap();
  let catalog = disk.catalog();
  let root_path = alias.join("later-library");
  let id = catalog.add_root(root_path, "missing-alias".into()).unwrap().roots[0].id.clone();
  assert_eq!(catalog.roots().unwrap().roots[0].status, BrowserRootStatus::Offline);
  audio(&actual_parent.join("later-library"), "actual.wav");
  catalog.refresh_root(&id, "reconnect-alias".into()).unwrap();
  ready(&catalog, &id);
  let response = catalog.tree(Some(&id), "actual", &[], 0, None, "alias".into()).unwrap();
  assert_eq!(response.total, 1);
  assert_eq!(response.items[0].item.name, "actual.wav");
  drop(catalog);
  assert_eq!(disk.catalog().tree(Some(&id), "actual", &[], 0, None, "alias-restart".into()).unwrap().total, 1);
}

#[test]
fn cancelled_scan_cannot_overwrite_newer_rescan_on_disk_or_in_memory() {
  let disk = Disk::new();
  let media = disk.directory("media");
  audio(&media, "old.wav");
  let catalog = disk.catalog();
  let gate = PublishGate::new();
  catalog.pause_next_publish(Arc::clone(&gate)).unwrap();
  let response = catalog.add_root(media.clone(), "first".into()).unwrap();
  let id = response.roots[0].id.clone();
  gate.reached.wait();
  catalog.cancel_scan("first").unwrap();
  assert_eq!(catalog.roots().unwrap().roots[0].status, BrowserRootStatus::Cancelled);
  audio(&media, "new.wav");
  catalog.refresh_root(&id, "second".into()).unwrap();
  ready(&catalog, &id);
  let before = catalog.tree(Some(&id), "", &[], 0, None, "new".into()).unwrap();
  assert_eq!(before.total, 2);
  gate.release.wait();
  gate.finished.wait();
  let after = catalog.tree(Some(&id), "", &[], 0, None, "after-stale".into()).unwrap();
  assert_eq!(before.items, after.items);
  assert_eq!(before.revision, after.revision);
  catalog.cancel_scan("first").unwrap();
  assert_eq!(catalog.roots().unwrap().roots[0].status, BrowserRootStatus::Ready);
  drop(catalog);
  assert_eq!(disk.catalog().tree(Some(&id), "", &[], 0, None, "restart".into()).unwrap().items, before.items);
}

#[test]
fn refresh_generation_replaces_prior_scan_without_needing_cancel() {
  let disk = Disk::new();
  let media = disk.directory("media");
  let old = audio(&media, "old.wav");
  let catalog = disk.catalog();
  let gate = PublishGate::new();
  catalog.pause_next_publish(Arc::clone(&gate)).unwrap();
  let id = catalog.add_root(media.clone(), "old-generation".into()).unwrap().roots[0].id.clone();
  gate.reached.wait();
  fs::remove_file(old).unwrap();
  audio(&media, "replacement.wav");
  catalog.refresh_root(&id, "new-generation".into()).unwrap();
  ready(&catalog, &id);
  gate.release.wait();
  gate.finished.wait();
  let response = catalog.tree(Some(&id), "", &[], 0, None, "replacement".into()).unwrap();
  assert_eq!(response.total, 1);
  assert_eq!(response.items[0].item.name, "replacement.wav");
}

#[test]
fn removal_only_deletes_reference_and_fences_late_scan_publication() {
  let disk = Disk::new();
  let media = disk.directory("media");
  let original = audio(&media, "nested/keep.wav");
  let bytes = fs::read(&original).unwrap();
  let catalog = disk.catalog();
  let id = add(&catalog, media.clone(), "initial" );
  let gate = PublishGate::new();
  catalog.pause_next_publish(Arc::clone(&gate)).unwrap();
  catalog.refresh_root(&id, "late-scan".into()).unwrap();
  gate.reached.wait();
  assert!(catalog.remove_root(&id).unwrap().roots.is_empty());
  gate.release.wait();
  gate.finished.wait();
  assert_eq!(fs::read(&original).unwrap(), bytes);
  assert!(media.is_dir());
  assert_eq!(catalog.tree(Some(&id), "", &[], 0, None, "removed".into()).unwrap_err().code, "root-not-found");
  assert_eq!(catalog.tree(None, "", &[], 0, None, "all".into()).unwrap().total, 0);
  drop(catalog);
  assert!(disk.catalog().roots().unwrap().roots.is_empty());
  assert_eq!(fs::read(original).unwrap(), bytes);
}

#[test]
fn multiword_search_preserves_roots_and_ancestors_across_virtual_windows() {
  let disk = Disk::new();
  let first = disk.directory("first");
  let second = disk.directory("second");
  for (root, suffix) in [(&first, "A"), (&second, "B")] {
    for number in 0..12 {
      audio(root, &format!("Warm Set/Vocal {number:02} {suffix}.WAV"));
    }
    audio(root, "Cold Set/Vocal excluded.wav");
    audio(root, "Warm Set/Drum excluded.wav");
  }
  let catalog = disk.catalog();
  add(&catalog, first, "first" );
  add(&catalog, second, "second" );
  let all = catalog.tree(None, "VoCaL   wArM", &[], 0, Some(500), "full".into()).unwrap();
  assert_eq!(all.total, 28);
  assert_eq!(all.items.iter().filter(|row| row.item.kind == BrowserItemKind::Audio).count(), 24);
  assert_eq!(all.items[0].depth, 0);
  assert_eq!(all.items[1].item.name, "Warm Set");
  assert_eq!(all.items[1].depth, 1);
  assert_eq!(all.items[2].depth, 2);
  let mut combined = Vec::new();
  for offset in (0..all.total).step_by(5) {
    let page = catalog.tree(None, "warm vocal", &[], offset, Some(5), format!("page-{offset}")).unwrap();
    assert_eq!(page.total, all.total);
    assert_eq!(page.revision, all.revision);
    assert_eq!(page.offset, offset);
    assert_eq!(page.request_id, format!("page-{offset}"));
    let repeated = catalog.tree(None, "warm vocal", &[], offset, Some(5), "repeated".into()).unwrap();
    assert_eq!(page.items, repeated.items);
    combined.extend(page.items);
  }
  assert_eq!(combined, all.items);
  let beyond = catalog.tree(None, "warm vocal", &[], usize::MAX, Some(500), "beyond".into()).unwrap();
  assert_eq!(beyond.total, 28);
  assert_eq!(beyond.offset, usize::MAX);
  assert!(beyond.items.is_empty());
}

#[test]
fn visible_window_defaults_and_caps_response_size() {
  let disk = Disk::new();
  let media = disk.directory("media");
  for number in 0..620 {
    audio(&media, &format!("Vocal {number:04}.wav"));
  }
  let catalog = disk.catalog();
  let id = add(&catalog, media, "page-limits");
  let default = catalog.tree(Some(&id), "", &[], 0, None, "default".into()).unwrap();
  assert_eq!(default.total, 620);
  assert_eq!(default.items.len(), 100);
  let capped = catalog.tree(Some(&id), "", &[], 0, Some(usize::MAX), "cap".into()).unwrap();
  assert_eq!(capped.items.len(), 500);
  let last = catalog.tree(Some(&id), "", &[], 500, Some(500), "last".into()).unwrap();
  assert_eq!(last.items.len(), 120);
  assert_eq!(capped.items.last().unwrap().item.name, "Vocal 0499.wav");
  assert_eq!(last.items.first().unwrap().item.name, "Vocal 0500.wav");
  let empty = catalog.tree(Some(&id), "vocal", &[], 0, Some(0), "zero-limit".into()).unwrap();
  assert_eq!(empty.total, 620);
  assert!(empty.items.is_empty());
}

#[test]
#[ignore = "Creates 100,000 real files; run explicitly with --ignored --nocapture"]
fn tree_100k_disk_catalog_reports_bounded_window_latency() {
  let disk = Disk::new();
  let media = disk.directory("media");
  for group in 0..100 {
    for number in 0..1_000 {
      audio(&media, &format!("Warm {group:03}/Vocal {number:04}.wav"));
    }
  }
  let catalog = disk.catalog();
  let started = Instant::now();
  let id = add(&catalog, media, "100k" );
  let scan_elapsed = started.elapsed();
  let started = Instant::now();
  let first = catalog.tree(Some(&id), "warm vocal", &[], 0, Some(100), "first".into()).unwrap();
  let first_elapsed = started.elapsed();
  let started = Instant::now();
  let last = catalog.tree(Some(&id), "warm vocal", &[], 100_000, Some(100), "last".into()).unwrap();
  let last_elapsed = started.elapsed();
  assert_eq!(first.total, 100_100);
  assert_eq!(last.total, 100_100);
  assert_eq!(first.items.len(), 100);
  assert_eq!(last.items.len(), 100);
  eprintln!("browser 100k real files: scan={scan_elapsed:?}, first-page={first_elapsed:?}, last-page={last_elapsed:?}");
}

#[test]
fn folders_expand_inline_with_empty_directories_and_sliced_descendants() {
  let disk = Disk::new();
  let media = disk.directory("media");
  fs::create_dir_all(media.join("Z folder/Inner/Empty")).unwrap();
  fs::create_dir_all(media.join("A empty")).unwrap();
  audio(&media, "Z folder/Inner/deep.wav");
  audio(&media, "Z folder/child.wav");
  audio(&media, "a-first-audio.wav");
  let catalog = disk.catalog();
  let id = add(&catalog, media, "tree");
  let closed = catalog.tree(Some(&id), "", &[], 0, None, "closed".into()).unwrap();
  assert_eq!(closed.total, 3);
  assert_eq!(closed.items.iter().map(|row| row.item.name.as_str()).collect::<Vec<_>>(),
    ["A empty", "Z folder", "a-first-audio.wav"]);
  assert!(!closed.items[0].has_children);
  assert!(closed.items[1].has_children);
  assert!(!closed.items[2].has_children);
  assert!(closed.items.iter().all(|row| row.depth == 0));
  let folder = closed.items[1].item.id.clone();
  let inner = index::item_id(&id, "Z folder/Inner");
  let expanded = vec![folder.clone(), inner.clone()];
  let open = catalog.tree(Some(&id), "", &expanded, 0, None, "open".into()).unwrap();
  assert_eq!(open.total, 7);
  assert_eq!(open.items.iter().map(|row| (row.item.name.as_str(), row.depth)).collect::<Vec<_>>(),
    [("A empty", 0), ("Z folder", 0), ("Inner", 1), ("Empty", 2), ("deep.wav", 2), ("child.wav", 1), ("a-first-audio.wav", 0)]);
  for offset in 0..open.total {
    let slice = catalog.tree(Some(&id), "", &expanded, offset, Some(1), "slice".into()).unwrap();
    assert_eq!(slice.total, open.total);
    assert_eq!(slice.items, open.items[offset..offset + 1]);
  }
  let hidden_parent = catalog.tree(Some(&id), "", &[inner], 0, None, "hidden".into()).unwrap();
  assert_eq!(hidden_parent.items, closed.items);
  let collapsed_inner = catalog.tree(Some(&id), "", &[folder], 0, None, "collapse-inner".into()).unwrap();
  assert_eq!(collapsed_inner.total, 5);
  let all_closed = catalog.tree(None, "", &[], 0, None, "all-closed".into()).unwrap();
  assert_eq!(all_closed.total, 1);
  assert_eq!(all_closed.items[0].item.id, id);
  let mut all_expanded = expanded.clone();
  all_expanded.push(id.clone());
  let all_open = catalog.tree(None, "", &all_expanded, 0, None, "all-open".into()).unwrap();
  assert_eq!(all_open.total, open.total + 1);
  assert_eq!(all_open.items[1].depth, 1);
  assert_eq!(all_open.items[5].depth, 3);
  drop(catalog);
  let restored = disk.catalog();
  assert_eq!(restored.tree(Some(&id), "", &expanded, 0, None, "restore".into()).unwrap().items, open.items);
  restored.refresh_root(&id, "rescan-tree".into()).unwrap();
  ready(&restored, &id);
  assert_eq!(restored.tree(Some(&id), "", &expanded, 0, None, "rescan".into()).unwrap().items, open.items);
}

#[test]
fn search_reveals_matching_ancestors_but_not_unrelated_siblings() {
  let disk = Disk::new();
  let media = disk.directory("Named library");
  audio(&media, "Samples/Nested/Target.WAV");
  audio(&media, "Samples/Nested/Other.wav");
  fs::create_dir_all(media.join("Samples/Empty Target")).unwrap();
  let catalog = disk.catalog();
  let id = add(&catalog, media, "search-tree");
  let found = catalog.tree(Some(&id), "target", &[], 0, None, "search".into()).unwrap();
  assert_eq!(found.items.iter().map(|row| (row.item.name.as_str(), row.depth)).collect::<Vec<_>>(),
    [("Samples", 0), ("Empty Target", 1), ("Nested", 1), ("Target.WAV", 2)]);
  let no_match = catalog.tree(Some(&id), "absent", &[], 0, None, "absent".into()).unwrap();
  assert_eq!(no_match.total, 0);
  let matching_root = catalog.tree(None, "named library", &[], 0, None, "root-search".into()).unwrap();
  assert_eq!(matching_root.total, 6);
  let clear = catalog.tree(Some(&id), "", &[], 0, None, "clear".into()).unwrap();
  assert_eq!(clear.total, 1);
}

fn downgrade_index_to_audio_only(disk: &Disk) {
  let directory = disk.0.join("app-data/browser-catalog");
  let registry: serde_json::Value = serde_json::from_slice(&fs::read(directory.join("roots.json")).unwrap()).unwrap();
  let path = directory.join(registry["roots"][0]["indexFile"].as_str().unwrap());
  let mut snapshot: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
  snapshot["version"] = serde_json::json!(1);
  let items = snapshot["items"].as_array_mut().unwrap();
  items.retain(|item| item["kind"] == "audio");
  for item in items {
    item.as_object_mut().unwrap().remove("kind");
  }
  fs::write(path, serde_json::to_vec(&snapshot).unwrap()).unwrap();
}

#[test]
fn legacy_audio_only_indexes_rebuild_empty_folders_without_changing_audio_ids() {
  let disk = Disk::new();
  let media = disk.directory("media");
  fs::create_dir_all(media.join("Empty/Nested")).unwrap();
  audio(&media, "song.wav");
  let catalog = disk.catalog();
  let id = add(&catalog, media, "legacy");
  let original = catalog.tree(Some(&id), "song", &[], 0, None, "before".into()).unwrap().items;
  drop(catalog);
  downgrade_index_to_audio_only(&disk);
  let restored = disk.catalog();
  ready(&restored, &id);
  let expanded = vec![index::item_id(&id, "Empty")];
  let rebuilt = restored.tree(Some(&id), "", &expanded, 0, None, "rebuilt".into()).unwrap();
  assert_eq!(rebuilt.total, 3);
  assert_eq!(rebuilt.items[1].item.name, "Nested");
  assert!(!rebuilt.items[1].has_children);
  assert_eq!(rebuilt.items[2], original[0]);
  drop(restored);
  let again = disk.catalog();
  assert_eq!(again.tree(Some(&id), "", &expanded, 0, None, "again".into()).unwrap().items, rebuilt.items);
}

#[test]
fn legacy_offline_indexes_do_not_expose_stale_leaves_and_refresh_rebuilds_folders() {
  let disk = Disk::new();
  let media = disk.directory("media");
  fs::create_dir_all(media.join("Empty")).unwrap();
  audio(&media, "song.wav");
  let catalog = disk.catalog();
  let id = add(&catalog, media.clone(), "legacy-offline");
  drop(catalog);
  downgrade_index_to_audio_only(&disk);
  fs::rename(&media, disk.0.join("away")).unwrap();
  let restored = disk.catalog();
  assert_eq!(restored.roots().unwrap().roots[0].status, BrowserRootStatus::Offline);
  assert_eq!(restored.tree(Some(&id), "", &[], 0, None, "offline".into()).unwrap_err().code, "offline");
  assert_eq!(restored.tree(None, "", &[id.clone()], 0, None, "all-offline".into()).unwrap().total, 1);
  fs::rename(disk.0.join("away"), media).unwrap();
  assert_eq!(restored.tree(Some(&id), "", &[], 0, None, "still-offline".into()).unwrap_err().code, "offline");
  restored.refresh_root(&id, "legacy-reconnect".into()).unwrap();
  ready(&restored, &id);
  assert_eq!(restored.tree(Some(&id), "", &[], 0, None, "reconnected".into()).unwrap().total, 2);
}

#[test]
fn tree_wire_rows_are_flat_and_bounded_at_native_boundary() {
  let disk = Disk::new();
  let media = disk.directory("media");
  fs::create_dir_all(media.join("Empty")).unwrap();
  audio(&media, "song.wav");
  let catalog = disk.catalog();
  let id = add(&catalog, media, "wire");
  let page = catalog.tree(Some(&id), "", &[], 0, Some(1), "wire-request".into()).unwrap();
  let value = serde_json::to_value(page).unwrap();
  assert_eq!(value["requestId"], "wire-request");
  assert_eq!(value["total"], 2);
  assert_eq!(value["offset"], 0);
  let rows = value["items"].as_array().unwrap();
  assert_eq!(rows.len(), 1);
  assert_eq!(rows[0]["rootId"], id);
  assert_eq!(rows[0]["name"], "Empty");
  assert_eq!(rows[0]["kind"], "folder");
  assert_eq!(rows[0]["relativePath"], "Empty");
  assert_eq!(rows[0]["depth"], 0);
  assert_eq!(rows[0]["hasChildren"], false);
  assert_eq!(rows[0]["byteLength"], 0);
  assert!(rows[0].get("modifiedMillis").is_some());
  assert!(rows[0].get("item").is_none());
}
