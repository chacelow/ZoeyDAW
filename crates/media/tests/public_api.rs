use std::{
  fs,
  path::{Path, PathBuf},
  sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Arc},
};

use sha2::{Digest, Sha256};
use uuid::Uuid;
use zoeydaw_media::{fingerprint, inspect, Cancellation, MediaLocation, NeverCancelled, PreparedSource};

struct Sandbox(PathBuf);

impl Sandbox {
  fn new() -> Self {
    let root = std::env::temp_dir().join(format!("zoeydaw-media-test-{}", Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    Self(fs::canonicalize(root).unwrap())
  }

  fn audio(&self) -> PathBuf {
    let path = self.0.join("voice.wav");
    fs::write(&path, wav(17)).unwrap();
    path
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

#[derive(Clone)]
struct Token(Arc<AtomicBool>);

impl Cancellation for Token {
  fn is_cancelled(&self) -> bool { self.0.load(Ordering::Acquire) }
}

#[test]
fn inspect_and_fingerprint_share_complete_file_identity() {
  let sandbox = Sandbox::new();
  let path = sandbox.audio();
  let record = inspect::<NeverCancelled>(&path, None).unwrap();
  let expected = (format!("{:x}", Sha256::digest(wav(17))), wav(17).len() as u64);
  assert_eq!(fingerprint::<NeverCancelled>(&path, None).unwrap(), expected);
  assert_eq!((record.sha256.clone(), record.byte_length), expected);
  assert_eq!((record.sample_rate, record.frames, record.channels), (48_000, 32, 2));
  assert_eq!(record.location, MediaLocation::External { path: path.to_str().unwrap().into() });
  assert!(Uuid::parse_str(&record.id).is_ok());

  let prepared = PreparedSource::open(&path, &record, &NeverCancelled).unwrap();
  assert_eq!(prepared.extension(), "wav");
  let copy_path = sandbox.0.join("copy.wav");
  let mut copy = fs::File::create(&copy_path).unwrap();
  prepared.verify_to(Some(&mut copy), &path, &record, &NeverCancelled).unwrap();
  assert_eq!(fs::read(&copy_path).unwrap(), wav(17));
}

#[test]
fn cancellation_keeps_the_original_code_and_message() {
  let sandbox = Sandbox::new();
  let path = sandbox.audio();
  let record = inspect::<NeverCancelled>(&path, None).unwrap();
  let token = Token(Arc::new(AtomicBool::new(false)));
  let prepared = PreparedSource::open(&path, &record, &token).unwrap();
  token.0.store(true, Ordering::Release);

  let errors = [
    inspect(&path, Some(&token)).unwrap_err(),
    fingerprint(&path, Some(&token)).unwrap_err(),
    PreparedSource::open(&path, &record, &token).err().unwrap(),
    prepared.verify_to(None, &path, &record, &token).unwrap_err(),
  ];
  for error in errors {
    assert_eq!(error.code, "cancelled");
    assert_eq!(error.message, "Project file operation was cancelled before publication");
    assert!(error.path.is_none());
  }
}

#[derive(Clone)]
struct CancelAfter(Arc<AtomicUsize>);

impl Cancellation for CancelAfter {
  fn is_cancelled(&self) -> bool { self.0.fetch_add(1, Ordering::AcqRel) >= 2 }
}

#[test]
fn cancellation_during_decoder_reads_is_not_reported_as_unsupported_media() {
  let sandbox = Sandbox::new();
  let path = sandbox.audio();
  let record = inspect::<NeverCancelled>(&path, None).unwrap();
  let token = CancelAfter(Arc::new(AtomicUsize::new(0)));
  let error = PreparedSource::open(&path, &record, &token).err().unwrap();
  assert_eq!(error.code, "cancelled");
}
#[test]
fn truncated_unsupported_missing_and_changed_sources_keep_their_errors() {
  let sandbox = Sandbox::new();
  let path = sandbox.audio();
  let record = inspect::<NeverCancelled>(&path, None).unwrap();
  let prepared = PreparedSource::open(&path, &record, &NeverCancelled).unwrap();
  fs::write(&path, wav(18)).unwrap();
  assert_eq!(prepared.verify_to(None, &path, &record, &NeverCancelled).unwrap_err().code, "media-changed");
  assert_eq!(PreparedSource::open(&path, &record, &NeverCancelled).unwrap().verify_to(None, &path, &record, &NeverCancelled).unwrap_err().code, "media-changed");

  fs::write(&path, &wav(17)[..60]).unwrap();
  assert_eq!(inspect::<NeverCancelled>(&path, None).unwrap_err().code, "unsupported-media");
  fs::write(&path, b"not a waveform").unwrap();
  assert_eq!(inspect::<NeverCancelled>(&path, None).unwrap_err().code, "unsupported-media");
  fs::remove_file(&path).unwrap();
  assert_eq!(inspect::<NeverCancelled>(&path, None).unwrap_err().code, "not-found");
  assert_eq!(fingerprint::<NeverCancelled>(&path, None).unwrap_err().code, "not-found");
  assert_eq!(inspect::<NeverCancelled>(Path::new("relative.wav"), None).unwrap_err().code, "invalid-path");
}
