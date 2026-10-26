use std::{fs, io, path::{Path, PathBuf}, sync::{Mutex, MutexGuard}};

use serde_json::json;
use sha2::{Digest, Sha256};

use super::*;

static TEST_DISK: Mutex<()> = Mutex::new(());

struct Sandbox {
  root: PathBuf,
  _guard: MutexGuard<'static, ()>,
}

impl Sandbox {
  fn new() -> Self {
    let guard = match TEST_DISK.lock() {
      Ok(guard) => guard,
      Err(poisoned) => poisoned.into_inner(),
    };
    let root = std::env::temp_dir().join(format!("zoeydaw-project-test-{}", Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    Self { root: fs::canonicalize(root).unwrap(), _guard: guard }
  }

  fn directory(&self, name: &str) -> PathBuf {
    let directory = self.root.join(name);
    fs::create_dir(&directory).unwrap();
    directory
  }
}

impl Drop for Sandbox {
  fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); }
}

fn wav(seed: i16) -> Vec<u8> {
  let frames = 32_u32;
  let data_bytes = frames * 2 * 2;
  let mut bytes = Vec::new();
  bytes.extend_from_slice(b"RIFF");
  bytes.extend_from_slice(&(36 + data_bytes).to_le_bytes());
  bytes.extend_from_slice(b"WAVEfmt ");
  bytes.extend_from_slice(&16_u32.to_le_bytes());
  bytes.extend_from_slice(&1_u16.to_le_bytes());
  bytes.extend_from_slice(&2_u16.to_le_bytes());
  bytes.extend_from_slice(&48_000_u32.to_le_bytes());
  bytes.extend_from_slice(&192_000_u32.to_le_bytes());
  bytes.extend_from_slice(&4_u16.to_le_bytes());
  bytes.extend_from_slice(&16_u16.to_le_bytes());
  bytes.extend_from_slice(b"data");
  bytes.extend_from_slice(&data_bytes.to_le_bytes());
  for frame in 0..frames {
    bytes.extend_from_slice(&(seed + frame as i16).to_le_bytes());
    bytes.extend_from_slice(&(seed - frame as i16).to_le_bytes());
  }
  bytes
}

fn audio(directory: &Path, seed: i16) -> (PathBuf, MediaRecord) {
  let path = directory.join("voice.wav");
  fs::write(&path, wav(seed)).unwrap();
  let record = media::inspect::<NeverCancelled>(&path, None).unwrap();
  (path, record)
}

fn manifest(commit: &str, records: &[MediaRecord]) -> Value {
  json!({
    "format": "zoeydaw-project", "version": 1, "projectId": "project-identity", "commitId": commit,
    "project": {
      "version": 3,
      "document": { "media": records, "tracks": [], "opaqueNativeMustNotEdit": [1, 2, 3] },
      "workspace": { "zoom": 7 },
    },
  })
}

fn save(path: &Path, value: Value, collect: bool, expected: Option<&str>) -> StorageResult<SaveProjectReceipt> {
  let operation = SaveOperation::begin(Uuid::new_v4().to_string())?;
  operation.save(path, value, collect, expected)
}

fn open(path: &Path) -> StorageResult<OpenProjectReceipt> {
  open_project(path)
}

fn stored_records(value: &Value) -> Vec<MediaRecord> { parse_manifest(value).unwrap() }

fn managed_path(root: &Path, record: &MediaRecord) -> PathBuf {
  let MediaLocation::Project { path } = &record.location else { panic!("expected managed media") };
  root.join(path)
}

#[test]
fn empty_project_roundtrip_without_starting_the_app() {
  let sandbox = Sandbox::new();
  let path = sandbox.root.join("empty.zdaw");
  let value = manifest("first", &[]);
  let saved = save(&path, value.clone(), false, None).unwrap();
  assert_eq!(saved.durability, Durability::Synced);
  assert_eq!(saved.manifest, value);
  assert_eq!(saved.path, path_string(&path).unwrap());
  assert_eq!(read_manifest(&path).unwrap(), value);
  let reopened = open(&path).unwrap();
  assert!(reopened.issues.is_empty());
  assert_eq!(reopened.manifest, value);
  assert!(!sandbox.root.join("media").exists());
}

#[test]
fn inspect_uses_complete_sha_and_actual_audio_dimensions() {
  let sandbox = Sandbox::new();
  let (path, record) = audio(&sandbox.root, 17);
  assert_eq!(record.sample_rate, 48_000);
  assert_eq!(record.frames, 32);
  assert_eq!(record.channels, 2);
  assert_eq!(record.byte_length, wav(17).len() as u64);
  assert_eq!(record.sha256, format!("{:x}", Sha256::digest(wav(17))));
  assert_eq!(record.location, MediaLocation::External { path: path_string(&path).unwrap() });
  assert!(Uuid::parse_str(&record.id).is_ok());
  let no_extension = sandbox.root.join("audio-with-no-extension");
  fs::write(&no_extension, wav(18)).unwrap();
  assert!(media::inspect::<NeverCancelled>(&no_extension, None).is_ok());
  let invalid = sandbox.root.join("not-audio.wav");
  fs::write(&invalid, b"not a waveform").unwrap();
  assert_eq!(media::inspect::<NeverCancelled>(&invalid, None).unwrap_err().code, "unsupported-media");
}

#[test]
fn collect_same_named_sources_keeps_both_originals_and_distinct_managed_files() {
  let sandbox = Sandbox::new();
  let first_dir = sandbox.directory("one");
  let second_dir = sandbox.directory("two");
  let project_dir = sandbox.directory("song");
  let (first_path, first) = audio(&first_dir, 1);
  let (second_path, second) = audio(&second_dir, 2);
  let path = project_dir.join("project.zdaw");
  let saved = save(&path, manifest("first", &[first.clone(), second.clone()]), true, None).unwrap();
  let records = stored_records(&saved.manifest);
  let first_managed = managed_path(&project_dir, &records[0]);
  let second_managed = managed_path(&project_dir, &records[1]);
  assert_ne!(first_managed, second_managed);
  assert_eq!(fs::read(first_managed).unwrap(), wav(1));
  assert_eq!(fs::read(second_managed).unwrap(), wav(2));
  assert_eq!(fs::read(first_path).unwrap(), wav(1));
  assert_eq!(fs::read(second_path).unwrap(), wav(2));
  assert_eq!(records[0].id, first.id);
  assert_eq!(records[1].id, second.id);
  assert!(open(&path).unwrap().issues.is_empty());
}

#[test]
fn collect_open_ordinary_save_then_move_project_remains_portable() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("originals");
  let project_dir = sandbox.directory("song");
  let (_, source) = audio(&source_dir, 6);
  let path = project_dir.join("project.zdaw");
  let initial = save(&path, manifest("collected", &[source]), true, None).unwrap();
  let initial_records = stored_records(&initial.manifest);
  let opened = open(&path).unwrap();
  assert!(matches!(&stored_records(&opened.manifest)[0].location, MediaLocation::External { .. }));
  let mut edited = opened.manifest;
  edited["commitId"] = json!("ordinary");
  edited["project"]["workspace"]["zoom"] = json!(99);
  let saved = save(&path, edited, false, Some("collected")).unwrap();
  assert_eq!(stored_records(&saved.manifest)[0].location, initial_records[0].location);
  assert_eq!(fs::read_dir(project_dir.join("media")).unwrap().count(), 1);
  let moved = sandbox.root.join("moved-song");
  fs::rename(&project_dir, &moved).unwrap();
  fs::remove_dir_all(&source_dir).unwrap();
  let reopened = open(&moved.join("project.zdaw")).unwrap();
  assert!(reopened.issues.is_empty());
  assert_eq!(reopened.manifest["project"]["workspace"]["zoom"], 99);
  let MediaLocation::External { path } = &stored_records(&reopened.manifest)[0].location else { panic!("expected resolved path") };
  assert!(Path::new(path).starts_with(&moved));
}

#[test]
fn ordinary_save_preserves_external_and_open_distinguishes_changed_missing_unreadable() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("source");
  let project_dir = sandbox.directory("song");
  let (source_path, source) = audio(&source_dir, 11);
  let path = project_dir.join("project.zdaw");
  let saved = save(&path, manifest("one", &[source.clone()]), false, None).unwrap();
  assert_eq!(stored_records(&saved.manifest)[0].location, source.location);
  assert!(!project_dir.join("media").exists());
  fs::write(&source_path, wav(12)).unwrap();
  assert_eq!(open(&path).unwrap().issues[0].kind, MediaIssueKind::Changed);
  fs::remove_file(&source_path).unwrap();
  let missing = open(&path).unwrap();
  assert_eq!(missing.issues[0].kind, MediaIssueKind::Missing);
  assert_eq!(missing.issues[0].source_id, source.id);
  fs::create_dir(&source_path).unwrap();
  assert_eq!(open(&path).unwrap().issues[0].kind, MediaIssueKind::Unreadable);
}

#[test]
fn relink_requires_full_content_identity_and_preserves_source_id() {
  let sandbox = Sandbox::new();
  let old_dir = sandbox.directory("old");
  let candidate_dir = sandbox.directory("candidate");
  let (old, source) = audio(&old_dir, 44);
  fs::remove_file(old).unwrap();
  let candidate = candidate_dir.join("renamed.wav");
  fs::write(&candidate, wav(44)).unwrap();
  let relinked = relink_media(source.clone(), &candidate).unwrap();
  assert_eq!(relinked.id, source.id);
  assert_eq!(relinked.name, source.name);
  assert_eq!(relinked.sha256, source.sha256);
  assert_eq!(relinked.location, MediaLocation::External { path: path_string(&candidate).unwrap() });
  fs::write(&candidate, wav(45)).unwrap();
  assert_eq!(relink_media(source, &candidate).unwrap_err().code, "media-changed");
}

#[test]
fn failed_collection_and_cancellation_preserve_old_manifest_and_foreign_temps() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("source");
  let project_dir = sandbox.directory("song");
  let (source_path, source) = audio(&source_dir, 33);
  let path = project_dir.join("project.zdaw");
  save(&path, manifest("old", &[]), false, None).unwrap();
  let old_bytes = fs::read(&path).unwrap();
  let foreign = project_dir.join(".zdaw-other-owner.tmp");
  fs::write(&foreign, b"another operation").unwrap();
  fs::write(&source_path, wav(34)).unwrap();
  assert_eq!(save(&path, manifest("changed", &[source.clone()]), true, Some("old")).unwrap_err().code, "media-changed");
  assert_eq!(fs::read(&path).unwrap(), old_bytes);
  assert_eq!(fs::read_dir(project_dir.join("media")).unwrap().count(), 0);
  fs::write(&source_path, wav(33)).unwrap();
  let id = Uuid::new_v4().to_string();
  let operation = SaveOperation::begin(id.clone()).unwrap();
  let result = transaction::save_with_sync(
    &path, manifest("cancelled", &[source]), true, Some("old"), &operation,
    |directory| {
      if directory == project_dir { cancel_project_operation(&id).unwrap(); }
      Ok(())
    },
  );
  assert_eq!(result.unwrap_err().code, "cancelled");
  assert_eq!(fs::read(&path).unwrap(), old_bytes);
  assert_eq!(fs::read_dir(project_dir.join("media")).unwrap().count(), 0);
  assert_eq!(fs::read(foreign).unwrap(), b"another operation");
}

#[test]
fn cancellation_before_io_creates_no_manifest() {
  let sandbox = Sandbox::new();
  let path = sandbox.root.join("cancelled.zdaw");
  let id = Uuid::new_v4().to_string();
  let operation = SaveOperation::begin(id.clone()).unwrap();
  cancel_project_operation(&id).unwrap();
  assert_eq!(operation.save(&path, manifest("one", &[]), false, None).unwrap_err().code, "cancelled");
  assert!(!path.exists());
  assert_eq!(fs::read_dir(&sandbox.root).unwrap().count(), 0);
}

#[test]
fn cancellation_after_publication_returns_success_not_cancelled() {
  let sandbox = Sandbox::new();
  let path = sandbox.root.join("published.zdaw");
  let id = Uuid::new_v4().to_string();
  let operation = SaveOperation::begin(id.clone()).unwrap();
  let saved = transaction::save_with_sync(&path, manifest("one", &[]), false, None, &operation, |_| {
    if path.exists() { cancel_project_operation(&id).unwrap(); }
    Ok(())
  }).unwrap();
  assert_eq!(saved.manifest["commitId"], "one");
  assert_eq!(read_manifest(&path).unwrap()["commitId"], "one");
}

#[test]
fn postpublication_sync_failure_returns_published_receipt_and_keeps_collected_media() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("source");
  let project_dir = sandbox.directory("song");
  let (_, source) = audio(&source_dir, 8);
  let path = project_dir.join("project.zdaw");
  let operation = SaveOperation::begin(Uuid::new_v4().to_string()).unwrap();
  let saved = transaction::save_with_sync(&path, manifest("published", &[source]), true, None, &operation, |_| {
    if path.exists() { Err(io::Error::new(io::ErrorKind::Other, "injected directory sync failure")) } else { Ok(()) }
  }).unwrap();
  assert_eq!(saved.durability, Durability::PublishedSyncUncertain);
  assert!(managed_path(&project_dir, &stored_records(&saved.manifest)[0]).exists());
  assert!(open(&path).unwrap().issues.is_empty());
}

#[test]
fn save_rejects_unknown_stale_and_reused_commit_tokens_without_overwriting() {
  let sandbox = Sandbox::new();
  let path = sandbox.root.join("project.zdaw");
  fs::write(&path, b"unknown user file").unwrap();
  assert_eq!(save(&path, manifest("one", &[]), false, None).unwrap_err().code, "conflict");
  assert_eq!(fs::read(&path).unwrap(), b"unknown user file");
  fs::remove_file(&path).unwrap();
  assert_eq!(save(&path, manifest("one", &[]), false, Some("absent")).unwrap_err().code, "conflict");
  save(&path, manifest("one", &[]), false, None).unwrap();
  assert_eq!(save(&path, manifest("two", &[]), false, Some("stale")).unwrap_err().code, "conflict");
  assert_eq!(save(&path, manifest("one", &[]), false, Some("one")).unwrap_err().code, "conflict");
  save(&path, manifest("two", &[]), false, Some("one")).unwrap();
  assert_eq!(read_manifest(&path).unwrap()["commitId"], "two");
}

#[test]
fn unsafe_managed_paths_and_fixtures_fail_before_creating_files() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("source");
  let project_dir = sandbox.directory("song");
  let (_, source) = audio(&source_dir, 3);
  let path = project_dir.join("project.zdaw");
  for invalid in ["media/../outside.wav", "/outside.wav", "media/not-a-uuid.wav", "media/00000000-0000-0000-0000-000000000000.wav/../x.wav", "media\\00000000-0000-0000-0000-000000000000.wav"] {
    let mut record = source.clone();
    record.location = MediaLocation::Project { path: invalid.into() };
    assert_eq!(save(&path, manifest("bad", &[record]), true, None).unwrap_err().code, "invalid-path");
  }
  let mut fixture = source.clone();
  fixture.location = MediaLocation::Fixture { uri: "mock://voice".into() };
  assert_eq!(save(&path, manifest("bad", &[fixture]), true, None).unwrap_err().code, "fixture-media");
  assert_eq!(save(&path, manifest("bad", &[source.clone(), source]), true, None).unwrap_err().code, "invalid-manifest");
  assert_eq!(fs::read_dir(&project_dir).unwrap().count(), 0);
}

#[cfg(unix)]
#[test]
fn managed_directory_and_file_symlink_escape_is_rejected_on_open_and_save() {
  use std::os::unix::fs::symlink;
  let sandbox = Sandbox::new();
  let outside = sandbox.directory("outside");
  let project_dir = sandbox.directory("song");
  let (external, mut source) = audio(&outside, 5);
  let name = format!("{}.wav", Uuid::new_v4());
  fs::copy(&external, outside.join(&name)).unwrap();
  source.location = MediaLocation::Project { path: format!("media/{name}") };
  let path = project_dir.join("project.zdaw");
  let value = manifest("one", &[source.clone()]);
  fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
  symlink(&outside, project_dir.join("media")).unwrap();
  assert_eq!(open(&path).unwrap_err().code, "invalid-path");
  assert_eq!(save(&path, manifest("two", &[source.clone()]), false, Some("one")).unwrap_err().code, "invalid-path");
  fs::remove_file(project_dir.join("media")).unwrap();
  fs::create_dir(project_dir.join("media")).unwrap();
  symlink(&external, project_dir.join("media").join(&name)).unwrap();
  assert_eq!(open(&path).unwrap_err().code, "invalid-path");
  source.location = MediaLocation::External { path: path_string(&project_dir.join("media").join(name)).unwrap() };
  assert_eq!(save(&path, manifest("two", &[source]), false, Some("one")).unwrap_err().code, "invalid-path");
}

#[test]
fn malformed_manifests_and_busy_transactions_leave_existing_files_untouched() {
  let sandbox = Sandbox::new();
  let path = sandbox.root.join("broken.zdaw");
  fs::write(&path, b"{broken").unwrap();
  assert_eq!(open(&path).unwrap_err().code, "invalid-manifest");
  fs::write(&path, b"{\"format\":\"zoeydaw-project\",\"version\":999}").unwrap();
  assert_eq!(open(&path).unwrap_err().code, "invalid-manifest");
  let target = sandbox.root.join("new.zdaw");
  let guard = transaction_guard().expect("test must acquire the file transaction lock");
  assert_eq!(save(&target, manifest("one", &[]), false, None).unwrap_err().code, "busy");
  assert!(!target.exists());
  drop(guard);
  let operation_id = Uuid::new_v4().to_string();
  let operation = SaveOperation::begin(operation_id.clone()).unwrap();
  assert_eq!(SaveOperation::begin(operation_id).err().unwrap().code, "busy");
  drop(operation);
}

#[test]
fn native_boundary_rejects_wrong_project_version_and_dangling_audio_references() {
  let sandbox = Sandbox::new();
  let path = sandbox.root.join("invalid.zdaw");
  let mut wrong_version = manifest("wrong", &[]);
  wrong_version["project"]["version"] = json!(2);
  assert_eq!(save(&path, wrong_version, false, None).unwrap_err().code, "invalid-manifest");
  for clips in [json!([{"kind":"audio","sourceId":"absent"}]), json!([{"kind":"audio"}]), json!([{"kind":"unknown"}])] {
    let mut value = manifest("dangling", &[]);
    value["project"]["document"]["tracks"] = json!([{"clips":clips}]);
    assert_eq!(save(&path, value.clone(), false, None).unwrap_err().code, "invalid-manifest");
    fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(open(&path).unwrap_err().code, "invalid-manifest");
    fs::remove_file(&path).unwrap();
  }
  let mut silent = manifest("silent", &[]);
  silent["project"]["document"]["tracks"] = json!([{"clips":[{"kind":"audio","sourceId":null}]}]);
  save(&path, silent, false, None).unwrap();
  assert!(open(&path).unwrap().issues.is_empty());
}

#[test]
fn uppercase_sha_is_normalized_once_and_resolves_existing_audio() {
  let sandbox = Sandbox::new();
  let (_, mut source) = audio(&sandbox.root, 22);
  source.sha256.make_ascii_uppercase();
  let path = sandbox.root.join("project.zdaw");
  let mut value = manifest("one", &[source.clone()]);
  value["project"]["document"]["tracks"] = json!([{"clips":[{"kind":"audio","sourceId":source.id}]}]);
  let saved = save(&path, value, false, None).unwrap();
  assert_eq!(stored_records(&saved.manifest)[0].sha256, source.sha256.to_ascii_lowercase());
  assert!(open(&path).unwrap().issues.is_empty());
  let MediaLocation::External { path } = &source.location else { panic!("expected external source") };
  assert!(relink_media(source.clone(), Path::new(path)).is_ok());
}

#[test]
fn missing_managed_audio_opens_offline_and_collect_does_not_replace_manifest() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("source");
  let project_dir = sandbox.directory("song");
  let (_, source) = audio(&source_dir, 13);
  let path = project_dir.join("project.zdaw");
  let saved = save(&path, manifest("one", &[source]), true, None).unwrap();
  fs::remove_file(managed_path(&project_dir, &stored_records(&saved.manifest)[0])).unwrap();
  let opened = open(&path).unwrap();
  assert_eq!(opened.issues[0].kind, MediaIssueKind::Missing);
  let bytes = fs::read(&path).unwrap();
  let mut value = opened.manifest;
  value["commitId"] = json!("two");
  assert_eq!(save(&path, value, true, Some("one")).unwrap_err().code, "not-found");
  assert_eq!(fs::read(&path).unwrap(), bytes);
}

#[test]
fn aiff_probe_and_collection_use_detected_format_not_filename_extension() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("source");
  let project_dir = sandbox.directory("song");
  let mut aiff = Vec::new();
  aiff.extend_from_slice(b"FORM");
  aiff.extend_from_slice(&(46_u32 + 128).to_be_bytes());
  aiff.extend_from_slice(b"AIFFCOMM");
  aiff.extend_from_slice(&18_u32.to_be_bytes());
  aiff.extend_from_slice(&2_u16.to_be_bytes());
  aiff.extend_from_slice(&32_u32.to_be_bytes());
  aiff.extend_from_slice(&16_u16.to_be_bytes());
  aiff.extend_from_slice(&[0x40, 0x0e, 0xbb, 0x80, 0, 0, 0, 0, 0, 0]);
  aiff.extend_from_slice(b"SSND");
  aiff.extend_from_slice(&136_u32.to_be_bytes());
  aiff.extend_from_slice(&[0; 8]);
  aiff.extend_from_slice(&[0; 128]);
  let source_path = source_dir.join("misleading.wav");
  fs::write(&source_path, aiff.clone()).unwrap();
  let source = media::inspect::<NeverCancelled>(&source_path, None).unwrap();
  assert_eq!((source.sample_rate, source.frames, source.channels), (48_000, 32, 2));
  let path = project_dir.join("project.zdaw");
  let saved = save(&path, manifest("one", &[source]), true, None).unwrap();
  let managed = managed_path(&project_dir, &stored_records(&saved.manifest)[0]);
  assert_eq!(managed.extension().unwrap(), "aiff");
  assert_eq!(fs::read(managed).unwrap(), aiff);
  assert!(open(&path).unwrap().issues.is_empty());
}

#[test]
fn truncated_or_empty_wav_payloads_cannot_be_imported_relinked_or_collected() {
  let sandbox = Sandbox::new();
  let source_dir = sandbox.directory("source");
  let project_dir = sandbox.directory("song");
  let path = project_dir.join("project.zdaw");
  save(&path, manifest("old", &[]), false, None).unwrap();
  let original = fs::read(&path).unwrap();
  let valid = wav(16);
  let mut exaggerated = valid[..60].to_vec();
  exaggerated[4..8].copy_from_slice(&(36_u32 + 384_000 * 4).to_le_bytes());
  exaggerated[40..44].copy_from_slice(&(384_000_u32 * 4).to_le_bytes());
  let mut empty = valid[..44].to_vec();
  empty[4..8].copy_from_slice(&36_u32.to_le_bytes());
  empty[40..44].copy_from_slice(&0_u32.to_le_bytes());
  for (index, bytes) in [valid[..60].to_vec(), exaggerated, valid[..44].to_vec(), empty, valid[..valid.len() - 1].to_vec()].into_iter().enumerate() {
    let source_path = source_dir.join(format!("truncated-{index}.wav"));
    fs::write(&source_path, &bytes).unwrap();
    assert_eq!(media::inspect::<NeverCancelled>(&source_path, None).unwrap_err().code, "unsupported-media");
    let forged = MediaRecord {
      id: Uuid::new_v4().to_string(), name: format!("truncated-{index}.wav"),
      sha256: format!("{:x}", Sha256::digest(&bytes)), byte_length: bytes.len() as u64,
      sample_rate: 48_000, frames: 384_000, channels: 2,
      location: MediaLocation::External { path: path_string(&source_path).unwrap() },
    };
    assert_eq!(relink_media(forged.clone(), &source_path).unwrap_err().code, "unsupported-media");
    assert_eq!(save(&path, manifest("bad", &[forged]), true, Some("old")).unwrap_err().code, "unsupported-media");
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(fs::read_dir(project_dir.join("media")).unwrap().count(), 0);
  }
}

fn plugin_manifest(commit: &str, source: &Path, bytes: &[u8]) -> Value {
  let mut value = manifest(commit, &[]);
  value["project"]["version"] = json!(4);
  value["project"]["document"]["tracks"] = json!([{
    "id": "track", "clips": [], "devices": [{
      "id": "external", "kind": "external",
      "stateRef": { "sha256": format!("{:x}", Sha256::digest(bytes)), "path": source }
    }]
  }]);
  value
}

#[test]
fn normal_save_collects_plugin_state_and_save_as_remains_portable() {
  let sandbox = Sandbox::new();
  let source = sandbox.root.join("cached.zdps");
  let bytes = b"ZDPS\x01opaque-state";
  fs::write(&source, bytes).unwrap();
  let first = sandbox.directory("first").join("song.zdaw");
  let saved = save(&first, plugin_manifest("one", &source, bytes), false, None).unwrap();
  let pointer = "/project/document/tracks/0/devices/0/stateRef/path";
  let relative = saved.manifest.pointer(pointer).unwrap().as_str().unwrap();
  assert_eq!(relative, format!("plugin-state/{:x}.zdps", Sha256::digest(bytes)));
  assert_eq!(fs::read(first.parent().unwrap().join(relative)).unwrap(), bytes);
  fs::remove_file(&source).unwrap();
  let mut reopened = open(&first).unwrap().manifest;
  assert!(Path::new(reopened.pointer(pointer).unwrap().as_str().unwrap()).is_absolute());
  reopened["commitId"] = json!("two");
  let second = sandbox.directory("second").join("song.zdaw");
  save(&second, reopened, false, None).unwrap();
  fs::remove_dir_all(first.parent().unwrap()).unwrap();
  let reopened = open(&second).unwrap();
  assert_eq!(fs::read(reopened.manifest.pointer(pointer).unwrap().as_str().unwrap()).unwrap(), bytes);
}

#[test]
fn corrupt_plugin_state_does_not_publish_or_leave_partial_file() {
  let sandbox = Sandbox::new();
  let source = sandbox.root.join("cached.zdps");
  fs::write(&source, b"changed").unwrap();
  let destination = sandbox.directory("project");
  let path = destination.join("song.zdaw");
  save(&path, manifest("original", &[]), false, None).unwrap();
  let original = fs::read(&path).unwrap();
  let error = save(&path, plugin_manifest("next", &source, b"expected"), false, Some("original")).unwrap_err();
  assert_eq!(error.code, "plugin-state-changed");
  assert_eq!(fs::read(&path).unwrap(), original);
  assert_eq!(fs::read_dir(destination.join("plugin-state")).unwrap().count(), 0);
}

#[test]
fn plugin_state_paths_reject_traversal_and_corrupt_managed_content() {
  let sandbox = Sandbox::new();
  let source = sandbox.root.join("cached.zdps");
  fs::write(&source, b"state").unwrap();
  let path = sandbox.directory("project").join("song.zdaw");
  let mut value = plugin_manifest("one", &source, b"state");
  let pointer = "/project/document/tracks/0/devices/0/stateRef/path";
  *value.pointer_mut(pointer).unwrap() = json!("../cached.zdps");
  assert_eq!(save(&path, value, false, None).unwrap_err().code, "invalid-plugin-state");
  let receipt = save(&path, plugin_manifest("one", &source, b"state"), false, None).unwrap();
  let managed = path.parent().unwrap().join(receipt.manifest.pointer(pointer).unwrap().as_str().unwrap());
  fs::write(&managed, b"corrupt").unwrap();
  assert_eq!(open(&path).unwrap_err().code, "plugin-state-changed");
  assert_eq!(fs::read(managed).unwrap(), b"corrupt");
}

#[test]
fn plugin_state_publication_failure_removes_only_new_files() {
  let sandbox = Sandbox::new();
  let source = sandbox.root.join("cached.zdps");
  fs::write(&source, b"existing").unwrap();
  let directory = sandbox.directory("project");
  let path = directory.join("song.zdaw");
  let receipt = save(&path, plugin_manifest("old", &source, b"existing"), false, None).unwrap();
  let old_manifest = fs::read(&path).unwrap();
  let old_state = directory.join(receipt.manifest.pointer("/project/document/tracks/0/devices/0/stateRef/path").unwrap().as_str().unwrap());
  fs::write(&source, b"new-state").unwrap();
  for cancel_before_publish in [false, true] {
    let id = Uuid::new_v4().to_string();
    let operation = SaveOperation::begin(id.clone()).unwrap();
    let error = transaction::save_with_sync(
      &path, plugin_manifest("next", &source, b"new-state"), false, Some("old"), &operation,
      |synced| {
        if synced == directory.join("plugin-state") {
          if cancel_before_publish { cancel_project_operation(&id).unwrap(); }
          else { return Err(io::Error::new(io::ErrorKind::Other, "injected state sync failure")); }
        }
        Ok(())
      },
    ).unwrap_err();
    assert_eq!(error.code, if cancel_before_publish { "cancelled" } else { "io" });
    assert_eq!(fs::read(&path).unwrap(), old_manifest);
    assert_eq!(fs::read(&old_state).unwrap(), b"existing");
    assert_eq!(fs::read_dir(directory.join("plugin-state")).unwrap().count(), 1);
    assert_eq!(fs::read(&source).unwrap(), b"new-state");
  }
}

#[test]
fn plugin_state_survives_postpublication_sync_failure() {
  let sandbox = Sandbox::new();
  let source = sandbox.root.join("cached.zdps");
  fs::write(&source, b"state").unwrap();
  let path = sandbox.directory("project").join("song.zdaw");
  let operation = SaveOperation::begin(Uuid::new_v4().to_string()).unwrap();
  let receipt = transaction::save_with_sync(
    &path, plugin_manifest("published", &source, b"state"), false, None, &operation,
    |_| if path.exists() { Err(io::Error::new(io::ErrorKind::Other, "injected postpublication sync failure")) } else { Ok(()) },
  ).unwrap();
  assert_eq!(receipt.durability, Durability::PublishedSyncUncertain);
  fs::remove_file(source).unwrap();
  let reopened = open(&path).unwrap();
  assert_eq!(reopened.manifest["commitId"], "published");
  let state_path = reopened.manifest.pointer("/project/document/tracks/0/devices/0/stateRef/path").unwrap().as_str().unwrap();
  assert_eq!(fs::read(state_path).unwrap(), b"state");
}

#[test]
fn plugin_state_collection_rejects_nonregular_and_oversized_sources() {
  let sandbox = Sandbox::new();
  let path = sandbox.directory("project").join("song.zdaw");
  let nonregular = sandbox.directory("not-a-state");
  let large = sandbox.root.join("large.zdps");
  fs::File::create(&large).unwrap().set_len((129 << 20) + 1).unwrap();
  for source in [&nonregular, &large] {
    let error = save(&path, plugin_manifest("one", source, b"expected"), false, None).unwrap_err();
    assert_eq!(error.code, "invalid-plugin-state");
    assert!(!path.exists());
    assert_eq!(fs::read_dir(path.parent().unwrap().join("plugin-state")).unwrap().count(), 0);
  }
}
