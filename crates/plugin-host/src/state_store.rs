use plughost::{PluginFormat, PluginState};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_FILE_BYTES: u64 = (128 << 20) + (1 << 20);
const MAGIC: &[u8] = b"ZDPS\x01";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginStateRef {
    pub sha256: String,
    pub path: String,
}

#[derive(Deserialize)]
struct BorrowedState<'a> {
    format: PluginFormat,
    class_id: &'a str,
    name: &'a str,
    vendor: &'a str,
    version: &'a str,
    component: &'a [u8],
    controller: &'a [u8],
}

pub struct PluginStateStore {
    root: PathBuf,
}

impl PluginStateStore {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root).map_err(|error| error.to_string())?;
        if fs::symlink_metadata(&root)
            .map_err(|error| error.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("Plugin state directory cannot be a symlink".into());
        }
        Ok(Self {
            root: root.canonicalize().map_err(|error| error.to_string())?,
        })
    }

    pub fn save(&self, state: &PluginState) -> Result<PluginStateRef, String> {
        state.validate().map_err(|error| error.to_string())?;
        if [&state.class_id, &state.name, &state.vendor, &state.version]
            .iter()
            .any(|text| text.len() > 65536)
        {
            return Err("Plugin state identity exceeds capacity".into());
        }
        let bytes = postcard::to_stdvec(state).map_err(|error| error.to_string())?;
        if bytes.len() as u64 + MAGIC.len() as u64 > MAX_FILE_BYTES {
            return Err("Plugin state exceeds storage capacity".into());
        }
        let sha256 = format!(
            "{:x}",
            Sha256::new()
                .chain_update(MAGIC)
                .chain_update(&bytes)
                .finalize()
        );
        let reference = PluginStateRef {
            path: format!("{sha256}.zdps"),
            sha256,
        };
        let destination = self.path(&reference)?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(&self.root).map_err(|error| error.to_string())?;
        temporary
            .write_all(MAGIC)
            .map_err(|error| error.to_string())?;
        temporary
            .write_all(&bytes)
            .map_err(|error| error.to_string())?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|error| error.to_string())?;
        match temporary.persist_noclobber(&destination) {
            Ok(_) => {}
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                let existing = self.load(&reference, state.format, &state.class_id)?;
                if existing != *state {
                    return Err("Plugin state content conflicts with its identity".into());
                }
            }
            Err(error) => return Err(error.error.to_string()),
        }
        self.sync_directory()?;
        Ok(reference)
    }

    pub fn load(
        &self,
        reference: &PluginStateRef,
        format: PluginFormat,
        class_id: &str,
    ) -> Result<PluginState, String> {
        let path = self.path(reference)?;
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_FILE_BYTES
        {
            return Err("Plugin state is not a bounded regular file".into());
        }
        let file = File::open(&path).map_err(|error| error.to_string())?;
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        file.take(MAX_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        if bytes.len() as u64 > MAX_FILE_BYTES
            || format!("{:x}", Sha256::digest(&bytes)) != reference.sha256
        {
            return Err("Plugin state fingerprint mismatch".into());
        }
        let payload = bytes
            .strip_prefix(MAGIC)
            .ok_or("Unsupported plugin state format")?;
        let (state, remaining): (BorrowedState<'_>, _) =
            postcard::take_from_bytes(payload).map_err(|error| error.to_string())?;
        if !remaining.is_empty()
            || [state.class_id, state.name, state.vendor, state.version]
                .iter()
                .any(|text| text.len() > 65536)
            || state.component.len().saturating_add(state.controller.len())
                > plughost::MAX_STATE_BYTES
        {
            return Err("Invalid or oversized plugin state payload".into());
        }
        if state.format != format || state.class_id != class_id {
            return Err("Plugin state belongs to another class".into());
        }
        Ok(PluginState {
            format: state.format,
            class_id: state.class_id.to_owned(),
            name: state.name.to_owned(),
            vendor: state.vendor.to_owned(),
            version: state.version.to_owned(),
            component: state.component.to_vec(),
            controller: state.controller.to_vec(),
        })
    }

    fn path(&self, reference: &PluginStateRef) -> Result<PathBuf, String> {
        if reference.sha256.len() != 64
            || !reference
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            || reference.path != format!("{}.zdps", reference.sha256)
        {
            return Err("Invalid plugin state reference".into());
        }
        Ok(self.root.join(&reference.path))
    }

    fn sync_directory(&self) -> Result<(), String> {
        #[cfg(unix)]
        File::open(&self.root)
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PluginState {
        PluginState {
            format: PluginFormat::Clap,
            class_id: "fixture".into(),
            name: "Fixture".into(),
            vendor: String::new(),
            version: "1".into(),
            component: vec![1, 2, 3],
            controller: vec![4, 5],
        }
    }
    #[test]
    fn state_roundtrip_is_idempotent_and_rejects_wrong_class_and_corruption() {
        let directory = tempfile::tempdir().unwrap();
        let store = PluginStateStore::new(directory.path().to_owned()).unwrap();
        let state = fixture();
        let reference = store.save(&state).unwrap();
        assert_eq!(store.save(&state).unwrap(), reference);
        assert_eq!(
            store
                .load(&reference, state.format, &state.class_id)
                .unwrap(),
            state
        );
        assert!(store.load(&reference, state.format, "other").is_err());
        fs::write(store.root.join(&reference.path), b"corrupt").unwrap();
        assert!(
            store
                .load(&reference, state.format, &state.class_id)
                .is_err()
        );
        assert!(store.save(&state).is_err());
        assert_eq!(
            fs::read(store.root.join(&reference.path)).unwrap(),
            b"corrupt"
        );
    }
    #[test]
    fn reference_cannot_escape_store_or_follow_symlink() {
        let directory = tempfile::tempdir().unwrap();
        let store = PluginStateStore::new(directory.path().join("states")).unwrap();
        let state = fixture();
        let reference = store.save(&state).unwrap();
        let mut traversal = reference.clone();
        traversal.path = "../outside".into();
        assert!(
            store
                .load(&traversal, state.format, &state.class_id)
                .is_err()
        );
        #[cfg(unix)]
        {
            let path = store.root.join(&reference.path);
            let outside = directory.path().join("outside");
            fs::rename(&path, &outside).unwrap();
            std::os::unix::fs::symlink(outside, &path).unwrap();
            assert!(
                store
                    .load(&reference, state.format, &state.class_id)
                    .is_err()
            );
        }
    }

    #[test]
    fn concurrent_saves_publish_one_complete_content_identity() {
        let directory = tempfile::tempdir().unwrap();
        let store = PluginStateStore::new(directory.path().to_owned()).unwrap();
        let state = fixture();
        let barrier = std::sync::Barrier::new(2);
        let references = std::thread::scope(|scope| {
            let first = scope.spawn(|| {
                barrier.wait();
                store.save(&state).unwrap()
            });
            barrier.wait();
            let second = store.save(&state).unwrap();
            (first.join().unwrap(), second)
        });
        assert_eq!(references.0, references.1);
        assert_eq!(
            store
                .load(&references.0, state.format, &state.class_id)
                .unwrap(),
            state
        );
        let files: Vec<_> = fs::read_dir(directory.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(files, [std::ffi::OsString::from(&references.0.path)]);
    }

    #[test]
    fn valid_digest_does_not_admit_malformed_or_oversized_payloads() {
        let directory = tempfile::tempdir().unwrap();
        let store = PluginStateStore::new(directory.path().to_owned()).unwrap();
        let state = fixture();
        let payload = postcard::to_stdvec(&state).unwrap();
        let mut trailing = payload.clone();
        trailing.push(0);
        let mut oversized = fixture();
        oversized.name = "x".repeat(65537);
        for payload in [
            trailing,
            payload[..payload.len() - 1].to_vec(),
            postcard::to_stdvec(&oversized).unwrap(),
        ] {
            let bytes = [MAGIC, payload.as_slice()].concat();
            let sha256 = format!("{:x}", Sha256::digest(&bytes));
            let reference = PluginStateRef {
                path: format!("{sha256}.zdps"),
                sha256,
            };
            fs::write(store.root.join(&reference.path), &bytes).unwrap();
            assert!(
                store
                    .load(&reference, state.format, &state.class_id)
                    .is_err()
            );
            assert_eq!(fs::read(store.root.join(&reference.path)).unwrap(), bytes);
        }
    }
}
