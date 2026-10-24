use std::{
  fs::{self, File, Metadata},
  io::{self, Read, Seek, SeekFrom, Write},
  path::{Component, Path},
};

use sha2::{Digest, Sha256};
use symphonia::core::{
  codecs::CodecParameters,
  formats::{probe::Hint, TrackType},
  io::{MediaSource, MediaSourceStream},
};
use uuid::Uuid;

use crate::{Cancellation, MediaError, MediaLocation, MediaRecord, MediaResult};

const BUFFER_BYTES: usize = 64 * 1024;


fn check_cancel<C: Cancellation>(cancel: Option<&C>) -> MediaResult<()> {
  if cancel.is_some_and(Cancellation::is_cancelled) {
    return Err(MediaError::new("cancelled", "Project file operation was cancelled before publication", None));
  }
  Ok(())
}

fn open_regular(path: &Path) -> MediaResult<(File, Metadata)> {
  if !fs::metadata(path).map_err(|error| MediaError::io(error, path))?.is_file() {
    return Err(MediaError::new("invalid-media", "Audio source is not a regular file", Some(path)));
  }
  let file = File::open(path).map_err(|error| MediaError::io(error, path))?;
  let metadata = file.metadata().map_err(|error| MediaError::io(error, path))?;
  if !metadata.is_file() {
    return Err(MediaError::new("invalid-media", "Audio source is not a regular file", Some(path)));
  }
  Ok((file, metadata))
}

fn same_version(before: &Metadata, after: &Metadata) -> bool {
  #[cfg(unix)]
  {
    use std::os::unix::fs::MetadataExt;
    if before.dev() != after.dev() || before.ino() != after.ino()
      || before.ctime() != after.ctime() || before.ctime_nsec() != after.ctime_nsec()
    {
      return false;
    }
  }
  before.len() == after.len() && before.modified().ok() == after.modified().ok()
}

fn ensure_unchanged(file: &File, before: &Metadata, path: &Path) -> MediaResult<()> {
  let after = file.metadata().map_err(|error| MediaError::io(error, path))?;
  let current = fs::metadata(path).map_err(|error| MediaError::io(error, path))?;
  if !same_version(before, &after) || !same_version(before, &current) {
    return Err(MediaError::new("media-changed", "Audio source changed while it was being read", Some(path)));
  }
  Ok(())
}

fn stream_bytes<C: Cancellation>(
  source: &mut File,
  mut destination: Option<&mut File>,
  path: &Path,
  cancel: Option<&C>,
) -> MediaResult<(String, u64)> {
  let mut hash = Sha256::new();
  let mut length = 0_u64;
  let mut buffer = [0_u8; BUFFER_BYTES];
  loop {
    check_cancel(cancel)?;
    let count = match source.read(&mut buffer) {
      Ok(count) => count,
      Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
      Err(error) => return Err(MediaError::io(error, path)),
    };
    if count == 0 {
      break;
    }
    hash.update(&buffer[..count]);
    if let Some(destination) = destination.as_deref_mut() {
      destination.write_all(&buffer[..count]).map_err(|error| MediaError::io(error, path))?;
    }
    length = length.checked_add(count as u64).ok_or_else(|| MediaError::new("invalid-media", "Audio file is too large", Some(path)))?;
  }
  check_cancel(cancel)?;
  Ok((format!("{:x}", hash.finalize()), length))
}

pub fn fingerprint<C: Cancellation>(path: &Path, cancel: Option<&C>) -> MediaResult<(String, u64)> {
  let (mut file, metadata) = open_regular(path)?;
  let result = stream_bytes(&mut file, None, path, cancel)?;
  ensure_unchanged(&file, &metadata, path)?;
  Ok(result)
}

struct ProbeSource<C: Cancellation> {
  file: File,
  cancel: Option<C>,
}

impl<C: Cancellation> Read for ProbeSource<C> {
  fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
    if self.cancel.as_ref().is_some_and(Cancellation::is_cancelled) {
      return Err(io::Error::new(io::ErrorKind::Other, "Project save cancelled"));
    }
    self.file.read(buffer)
  }
}

impl<C: Cancellation> Seek for ProbeSource<C> {
  fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
    self.file.seek(position)
  }
}

impl<C: Cancellation> MediaSource for ProbeSource<C> {
  fn is_seekable(&self) -> bool { true }
  fn byte_len(&self) -> Option<u64> { self.file.metadata().ok().map(|metadata| metadata.len()) }
}

struct AudioDimensions {
  extension: &'static str,
  sample_rate: u32,
  frames: u64,
  channels: u32,
}

fn probe_audio<C: Cancellation>(file: &File, path: &Path, cancel: Option<&C>) -> MediaResult<AudioDimensions> {
  check_cancel(cancel)?;
  let unsupported = |message: String| MediaError::new("unsupported-media", message, Some(path));
  let source = ProbeSource {
    file: file.try_clone().map_err(|error| MediaError::io(error, path))?,
    cancel: cancel.cloned(),
  };
  let stream = MediaSourceStream::new(Box::new(source), Default::default());
  let mut hint = Hint::new();
  if let Some(extension) = path.extension().and_then(|extension| extension.to_str()) {
    hint.with_extension(extension);
  }
  let result = symphonia::default::get_probe().probe(&hint, stream, Default::default(), Default::default());
  check_cancel(cancel)?;
  let mut reader = result.map_err(|error| unsupported(error.to_string()))?;
  let extension = match reader.format_info().short_name {
    "wave" => "wav",
    "aiff" => "aiff",
    "flac" => "flac",
    "mp3" => "mp3",
    _ => return Err(unsupported("Only WAV, AIFF, FLAC, and MP3 audio are supported".into())),
  };
  let track = reader.default_track(TrackType::Audio).ok_or_else(|| unsupported("No audio track found".into()))?;
  let track_id = track.id;
  let declared_frames = track.num_frames;
  let params = match &track.codec_params {
    Some(CodecParameters::Audio(params)) => params.clone(),
    _ => return Err(unsupported("Audio codec parameters are missing".into())),
  };
  let mut decoder = symphonia::default::get_codecs().make_audio_decoder(&params, &Default::default())
    .map_err(|error| unsupported(error.to_string()))?;
  let mut sample_rate = params.sample_rate.unwrap_or(0);
  let mut channels = params.channels.as_ref().map_or(0, |channels| channels.count() as u32);
  let mut frames = 0_u64;
  loop {
    check_cancel(cancel)?;
    let result = reader.next_packet();
    check_cancel(cancel)?;
    let Some(packet) = result.map_err(|error| unsupported(error.to_string()))? else { break };
    if packet.track_id != track_id { continue; }
    let result = decoder.decode(&packet);
    check_cancel(cancel)?;
    let decoded = result.map_err(|error| unsupported(error.to_string()))?;
    if sample_rate != 0 && sample_rate != decoded.spec().rate()
      || channels != 0 && channels != decoded.spec().channels().count() as u32
    {
      return Err(unsupported("Audio dimensions change within the source".into()));
    }
    sample_rate = decoded.spec().rate();
    channels = decoded.spec().channels().count() as u32;
    frames = frames.checked_add(decoded.frames() as u64).ok_or_else(|| unsupported("Audio frame count overflow".into()))?;
  }
  if sample_rate == 0 || channels == 0 || frames == 0 {
    return Err(unsupported("Audio has no decodable sample frames or is missing audio dimensions".into()));
  }
  // MP3 totals may be bitrate estimates; PCM containers and FLAC declare exact frame counts.
  if extension != "mp3" && declared_frames.is_some_and(|declared| declared > 0 && declared != frames) {
    return Err(unsupported("Decoded audio frame count does not match the container; the source may be truncated".into()));
  }
  Ok(AudioDimensions { extension, sample_rate, frames, channels })
}

pub fn inspect<C: Cancellation>(path: &Path, cancel: Option<&C>) -> MediaResult<MediaRecord> {
  absolute_path(path)?;
  let canonical = fs::canonicalize(path).map_err(|error| MediaError::io(error, path))?;
  let (mut file, before) = open_regular(&canonical)?;
  let (sha256, byte_length) = stream_bytes(&mut file, None, &canonical, cancel)?;
  file.seek(SeekFrom::Start(0)).map_err(|error| MediaError::io(error, &canonical))?;
  let dimensions = probe_audio(&file, &canonical, cancel)?;
  ensure_unchanged(&file, &before, &canonical)?;
  let name = path.file_name().and_then(|name| name.to_str()).ok_or_else(|| MediaError::new("invalid-path", "Audio filename is not valid UTF-8", Some(path)))?;
  Ok(MediaRecord {
    id: Uuid::new_v4().to_string(),
    name: name.into(),
    sha256,
    byte_length,
    sample_rate: dimensions.sample_rate,
    frames: dimensions.frames,
    channels: dimensions.channels,
    location: MediaLocation::External { path: path_string(&canonical)? },
  })
}

pub struct PreparedSource {
  file: File,
  before: Metadata,
  extension: &'static str,
}

impl PreparedSource {
  pub fn open<C: Cancellation>(path: &Path, record: &MediaRecord, cancel: &C) -> MediaResult<Self> {
    check_cancel(Some(cancel))?;
    let (mut file, before) = open_regular(path)?;
    if before.len() != record.byte_length {
      return Err(MediaError::new("media-changed", "Audio source size no longer matches the imported source", Some(path)));
    }
    let dimensions = probe_audio(&file, path, Some(cancel))?;
    if dimensions.sample_rate != record.sample_rate || dimensions.frames != record.frames || dimensions.channels != record.channels {
      return Err(MediaError::new("media-changed", "Audio source dimensions no longer match the imported source", Some(path)));
    }
    file.seek(SeekFrom::Start(0)).map_err(|error| MediaError::io(error, path))?;
    Ok(Self { file, before, extension: dimensions.extension })
  }

  pub fn extension(&self) -> &'static str { self.extension }

  pub fn verify_to<C: Cancellation>(mut self, destination: Option<&mut File>, path: &Path, record: &MediaRecord, cancel: &C) -> MediaResult<()> {
    let (sha256, length) = stream_bytes(&mut self.file, destination, path, Some(cancel))?;
    ensure_unchanged(&self.file, &self.before, path)?;
    if sha256 != record.sha256 || length != record.byte_length {
      return Err(MediaError::new("media-changed", "Audio source no longer matches its complete SHA-256 fingerprint and size", Some(path)));
    }
    Ok(())
  }
}

fn absolute_path(path: &Path) -> MediaResult<()> {
  if !path.is_absolute()
    || path.to_str().is_some_and(|value| value.as_bytes().contains(&0))
    || path.components().any(|part| matches!(part, Component::ParentDir))
  {
    return Err(MediaError::new("invalid-path", "Expected an absolute path without parent traversal or NUL bytes", Some(path)));
  }
  Ok(())
}

fn path_string(path: &Path) -> MediaResult<String> {
  path.to_str().map(str::to_owned).ok_or_else(|| {
    MediaError::new("invalid-path", "Path is not valid UTF-8", Some(path))
  })
}
