use std::{collections::HashSet, fs::{self, File}, io::{Read, Write}, path::{Path, PathBuf}};
use serde_json::Value;
use sha2::{Digest, Sha256};
use super::{absolute_path, path_string, reject_symlink, ProjectPath, StorageError, StorageResult};

const MAX_BYTES: u64 = (128 << 20) + (1 << 20);

pub(super) struct StateReference {
    pub pointer: String,
    pub hash: String,
    pub source: PathBuf,
}

pub(super) fn references(project: &ProjectPath, manifest: &Value) -> StorageResult<Vec<StateReference>> {
    let mut result = Vec::new();
    let tracks = manifest.pointer("/project/document/tracks").and_then(Value::as_array)
        .ok_or_else(|| StorageError::new("invalid-manifest", "Missing project tracks", None))?;
    for (track_index, track) in tracks.iter().enumerate() {
        let Some(devices) = track.get("devices") else { continue };
        let devices = devices.as_array().ok_or_else(|| StorageError::new("invalid-manifest", "Invalid devices", None))?;
        for (device_index, device) in devices.iter().enumerate() {
            if device.get("kind").and_then(Value::as_str) != Some("external") { continue; }
            let invalid = || StorageError::new("invalid-plugin-state", "Invalid plugin state reference", None);
            let state = device.get("stateRef").ok_or_else(invalid)?;
            if state.is_null() { continue; }
            let object = state.as_object().ok_or_else(invalid)?;
            let hash = object.get("sha256").and_then(Value::as_str).ok_or_else(invalid)?;
            let path = object.get("path").and_then(Value::as_str).ok_or_else(invalid)?;
            if object.len() != 2 || hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) {
                return Err(invalid());
            }
            let source = if Path::new(path).is_absolute() {
                absolute_path(Path::new(path))?;
                PathBuf::from(path)
            } else {
                if path != format!("plugin-state/{hash}.zdps") { return Err(invalid()); }
                managed_path(project, hash)?
            };
            result.push(StateReference { pointer: format!("/project/document/tracks/{track_index}/devices/{device_index}/stateRef/path"), hash: hash.to_owned(), source });
        }
    }
    Ok(result)
}

pub(super) fn managed_path(project: &ProjectPath, hash: &str) -> StorageResult<PathBuf> {
    let directory = project.root.join("plugin-state");
    reject_symlink(&directory)?;
    let path = directory.join(format!("{hash}.zdps"));
    reject_symlink(&path)?;
    Ok(path)
}

pub(super) fn verify(source: &Path, hash: &str, mut destination: Option<&mut File>, mut check: impl FnMut() -> StorageResult<()>) -> StorageResult<()> {
    reject_symlink(source)?;
    let source_metadata = fs::symlink_metadata(source).map_err(|error| StorageError::io(error, source))?;
    if !source_metadata.is_file() || source_metadata.len() > MAX_BYTES {
        return Err(StorageError::new("invalid-plugin-state", "Plugin state is not a bounded regular file", Some(source)));
    }
    let mut input = File::open(source).map_err(|error| StorageError::io(error, source))?;
    let metadata = input.metadata().map_err(|error| StorageError::io(error, source))?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err(StorageError::new("invalid-plugin-state", "Plugin state is not a bounded regular file", Some(source)));
    }
    let mut digest = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 65536];
    loop {
        check()?;
        let count = input.read(&mut buffer).map_err(|error| StorageError::io(error, source))?;
        if count == 0 { break; }
        total += count as u64;
        if total > MAX_BYTES { return Err(StorageError::new("invalid-plugin-state", "Plugin state exceeds capacity", Some(source))); }
        digest.update(&buffer[..count]);
        if let Some(file) = destination.as_mut() {
            file.write_all(&buffer[..count]).map_err(|error| StorageError::io(error, source))?;
        }
    }
    if total != metadata.len() || format!("{:x}", digest.finalize()) != hash {
        return Err(StorageError::new("plugin-state-changed", "Plugin state fingerprint mismatch", Some(source)));
    }
    Ok(())
}

pub(super) fn resolve_open(project: &ProjectPath, manifest: &mut Value) -> StorageResult<()> {
    let mut verified = HashSet::new();
    for reference in references(project, manifest)? {
        if verified.insert((reference.source.clone(), reference.hash.clone())) {
            verify(&reference.source, &reference.hash, None, || Ok(()))?;
        }
        *manifest.pointer_mut(&reference.pointer).ok_or_else(|| StorageError::new("invalid-plugin-state", "Plugin state reference disappeared", None))? = Value::String(path_string(&reference.source)?);
    }
    Ok(())
}

pub(super) fn ensure_directory(project: &ProjectPath) -> StorageResult<PathBuf> {
    let directory = project.root.join("plugin-state");
    reject_symlink(&directory)?;
    fs::create_dir_all(&directory).map_err(|error| StorageError::io(error, &directory))?;
    reject_symlink(&directory)?;
    if !directory.is_dir() { return Err(StorageError::new("invalid-path", "Plugin state directory is not a directory", Some(&directory))); }
    Ok(directory)
}
