use plughost::{PluginFormat, PluginInfo, PluginRef};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub(super) type Entries = BTreeMap<String, (PluginRef, PluginInfo)>;
const MAX_BYTES: u64 = 16 << 20;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CatalogFile {
    version: u32,
    entries: Entries,
}

pub(super) fn identity(reference: &PluginRef) -> Result<String, String> {
    let bytes = serde_json::to_vec(reference).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn validate(entries: &Entries) -> Result<(), String> {
    if entries.len() > 65536 {
        return Err("Authorized plugin catalog exceeds capacity".into());
    }
    for (id, (reference, info)) in entries {
        let valid_bundle = match (&reference.format, &reference.bundle) {
            (PluginFormat::AudioUnit, None) => true,
            (PluginFormat::Clap | PluginFormat::Vst3, Some(path)) => {
                path.is_absolute()
                    && !path
                        .components()
                        .any(|part| matches!(part, std::path::Component::ParentDir))
                    && path.to_str().is_some_and(|text| !text.contains('\0'))
            }
            _ => false,
        };
        if !valid_bundle
            || reference.class_id.is_empty()
            || reference.class_id != info.class_id
            || reference.format != info.format
            || *id != identity(reference)?
        {
            return Err("Invalid authorized plugin catalog identity".into());
        }
    }
    Ok(())
}

pub(super) fn path(cache: &Path) -> PathBuf {
    cache.with_extension("authorized.json")
}

pub(super) fn load(path: &Path) -> Result<Entries, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Entries::new()),
        Err(error) => return Err(error.to_string()),
    };
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err("Authorized plugin catalog is not a bounded regular file".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .map_err(|error| error.to_string())?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Authorized plugin catalog exceeds capacity".into());
    }
    let file: CatalogFile = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    if file.version != 1 {
        return Err("Unsupported authorized plugin catalog version".into());
    }
    validate(&file.entries)?;
    Ok(file.entries)
}

pub(super) fn prepare(path: &Path, entries: &Entries) -> Result<tempfile::NamedTempFile, String> {
    validate(entries)?;
    #[derive(Serialize)]
    struct BorrowedCatalog<'a> {
        version: u32,
        entries: &'a Entries,
    }
    let bytes = serde_json::to_vec(&BorrowedCatalog {
        version: 1,
        entries,
    })
    .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Authorized plugin catalog exceeds capacity".into());
    }
    let directory = path
        .parent()
        .ok_or("Authorized plugin catalog requires a parent directory")?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(directory).map_err(|error| error.to_string())?;
    temporary
        .write_all(&bytes)
        .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    Ok(temporary)
}

pub(super) fn sync_parent(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    File::open(path.parent().ok_or("Missing catalog directory")?)
        .and_then(|file| file.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entries(root: &Path) -> Entries {
        let reference = PluginRef {
            format: PluginFormat::Clap,
            bundle: Some(root.join("fixture.clap")),
            class_id: "fixture".into(),
        };
        let info = PluginInfo::new(
            reference.format,
            "fixture",
            "Fixture",
            plughost::PluginKind::Effect,
        );
        [(identity(&reference).unwrap(), (reference, info))]
            .into_iter()
            .collect()
    }
    #[test]
    fn authorized_selection_survives_restart_without_scanning() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("authorized.json");
        let expected = entries(directory.path());
        prepare(&path, &expected).unwrap().persist(&path).unwrap();
        assert_eq!(load(&path).unwrap(), expected);
        let pending = prepare(&path, &Entries::new()).unwrap();
        drop(pending);
        assert_eq!(load(&path).unwrap(), expected);
    }
    #[test]
    fn catalog_rejects_mismatched_identity_version_and_nonregular_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("authorized.json");
        let mut wrong = entries(directory.path());
        wrong.values_mut().next().unwrap().1.class_id = "other".into();
        assert!(prepare(&path, &wrong).is_err());
        fs::write(
            &path,
            serde_json::to_vec(&CatalogFile {
                version: 2,
                entries: entries(directory.path()),
            })
            .unwrap(),
        )
        .unwrap();
        assert!(load(&path).is_err());
        fs::write(
            &path,
            serde_json::to_vec(&CatalogFile {
                version: 1,
                entries: wrong,
            })
            .unwrap(),
        )
        .unwrap();
        assert!(load(&path).is_err());
        assert!(load(directory.path()).is_err());
    }
}
