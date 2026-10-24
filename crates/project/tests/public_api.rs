use std::{fs, path::PathBuf, sync::{Mutex, MutexGuard}};

use serde_json::{json, Value};
use uuid::Uuid;
use zoeydaw_media::{inspect, MediaLocation, MediaRecord, NeverCancelled};
use zoeydaw_project::{cancel_project_operation, open_project, relink_media, SaveOperation};

static TEST_DISK: Mutex<()> = Mutex::new(());

struct Sandbox(PathBuf, MutexGuard<'static, ()>);

impl Sandbox {
  fn new() -> Self {
    let guard = TEST_DISK.lock().unwrap_or_else(|error| error.into_inner());
    let root = std::env::temp_dir().join(format!("zoeydaw-project-consumer-{}", Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    Self(fs::canonicalize(root).unwrap(), guard)
  }
}

impl Drop for Sandbox {
  fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
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

fn manifest(commit: &str, records: &[MediaRecord]) -> Value {
  json!({
    "format": "zoeydaw-project", "version": 1, "projectId": "public-consumer", "commitId": commit,
    "project": {
      "version": 3,
      "document": { "media": records, "tracks": [{ "clips": [{ "kind": "audio", "sourceId": records.first().map(|record| &record.id) }] }] },
      "workspace": { "zoom": 7 },
    },
  })
}

fn record(manifest: &Value) -> MediaRecord {
  serde_json::from_value(manifest["project"]["document"]["media"][0].clone()).unwrap()
}

#[test]
fn standalone_consumer_collects_and_reopens_without_the_external_source() {
  let sandbox = Sandbox::new();
  let source_path = sandbox.0.join("voice.wav");
  fs::write(&source_path, wav(17)).unwrap();
  let source = inspect::<NeverCancelled>(&source_path, None).unwrap();
  let project_directory = sandbox.0.join("song");
  fs::create_dir(&project_directory).unwrap();
  let path = project_directory.join("project.zdaw");
  let operation = SaveOperation::begin(Uuid::new_v4().to_string()).unwrap();
  let saved = operation.save(&path, manifest("one", &[source.clone()]), true, None).unwrap();
  let collected = record(&saved.manifest);
  assert_eq!(collected.id, source.id);
  assert_eq!(collected.sha256, source.sha256);
  assert_eq!(collected.byte_length, source.byte_length);
  let MediaLocation::Project { path: relative } = &collected.location else { panic!("expected project media") };
  assert_eq!(fs::read(project_directory.join(relative)).unwrap(), wav(17));

  let opened = open_project(&path).unwrap();
  assert!(opened.issues.is_empty());
  let resolved = record(&opened.manifest);
  assert_eq!(resolved.id, source.id);
  assert_eq!(resolved.sha256, source.sha256);
  assert_eq!(resolved.byte_length, source.byte_length);
  fs::rename(&source_path, sandbox.0.join("moved-external.wav")).unwrap();

  let reopened = open_project(&path).unwrap();
  assert!(reopened.issues.is_empty());
  let resolved = record(&reopened.manifest);
  let MediaLocation::External { path: managed } = &resolved.location else { panic!("expected resolved managed source") };
  let inspected = inspect::<NeverCancelled>(std::path::Path::new(managed), None).unwrap();
  assert_eq!(resolved.id, source.id);
  assert_eq!(inspected.sha256, source.sha256);
  assert_eq!(inspected.byte_length, source.byte_length);
  assert_eq!(relink_media(source.clone(), std::path::Path::new(managed)).unwrap().id, source.id);
}

#[test]
fn cancellation_registered_before_worker_enqueue_prevents_publication() {
  let sandbox = Sandbox::new();
  let path = sandbox.0.join("cancelled.zdaw");
  let operation_id = Uuid::new_v4().to_string();
  let operation = SaveOperation::begin(operation_id.clone()).unwrap();
  cancel_project_operation(&operation_id).unwrap();
  let worker_path = path.clone();
  let error = std::thread::spawn(move || operation.save(&worker_path, manifest("one", &[]), false, None))
    .join().unwrap().unwrap_err();
  assert_eq!(error.code, "cancelled");
  assert!(!path.exists());
  assert_eq!(fs::read_dir(&sandbox.0).unwrap().count(), 0);

  let next = SaveOperation::begin(operation_id.clone()).unwrap();
  next.save(&path, manifest("two", &[]), false, None).unwrap();
  assert_eq!(open_project(&path).unwrap().manifest["commitId"], "two");
}
