use std::{
    fs, io,
    path::{Path, PathBuf},
};

use napi_derive::napi;

use crate::atomic_file::write_atomically;

const EXTENSION: &str = "zdaw";
const BACKUP_DIR: &str = "Backup";

#[napi(object)]
pub struct ProjectBackup {
    pub stamp: String,
    pub limit: u32,
}

fn reason(error: impl ToString) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

fn backups(dir: &Path, prefix: &str) -> io::Result<Vec<PathBuf>> {
    let suffix = format!(".{EXTENSION}");
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with(prefix) && name.ends_with(&suffix))
        })
        .collect();
    paths.sort();
    Ok(paths)
}

fn back_up(target: &Path, backup: &ProjectBackup) -> io::Result<()> {
    if backup.limit == 0 || !target.is_file() {
        return Ok(());
    }
    let invalid = || io::Error::new(io::ErrorKind::InvalidInput, "project file has no name");
    let dir = target.parent().ok_or_else(invalid)?.join(BACKUP_DIR);
    let name = target
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(invalid)?;
    fs::create_dir_all(&dir)?;
    fs::copy(
        target,
        dir.join(format!("{name} [{}].{EXTENSION}", backup.stamp)),
    )?;
    let existing = backups(&dir, &format!("{name} ["))?;
    let excess = existing.len().saturating_sub(backup.limit as usize);
    for path in existing.into_iter().take(excess) {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[napi]
pub fn project_file_path(directory: String, name: String) -> napi::Result<String> {
    let invalid = name.is_empty()
        || name.trim() != name
        || name.ends_with('.')
        || name.chars().any(|c| {
            c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        });
    if invalid {
        return Err(reason("project name is not a valid file name"));
    }
    Ok(Path::new(&directory)
        .join(format!("{name} Project"))
        .join(format!("{name}.{EXTENSION}"))
        .to_string_lossy()
        .into_owned())
}

#[napi]
pub fn project_file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[napi]
pub fn read_project_file(path: String) -> napi::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(json) => Ok(Some(json)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(reason(error)),
    }
}

#[napi]
pub fn write_project_file(
    path: String,
    json: String,
    backup: Option<ProjectBackup>,
) -> napi::Result<()> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(reason)?;
    let target = Path::new(&path);
    if target.extension().and_then(|value| value.to_str()) != Some(EXTENSION) {
        return Err(reason("project files must use the .zdaw extension"));
    }
    if let Some(backup) = backup {
        back_up(target, &backup).map_err(reason)?;
    }
    write_atomically(target, json.as_bytes()).map_err(reason)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_into_the_project_folder_and_rotates_backups() {
        let root =
            std::env::temp_dir().join(format!("zoeydaw-project-file-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let directory = root.to_string_lossy().into_owned();
        let folder = root.join("Song Project");
        let path = project_file_path(directory.clone(), "Song".into()).unwrap();
        assert_eq!(Path::new(&path), folder.join("Song.zdaw"));
        for name in ["", " Song", "a/b", "a:b", "end."] {
            assert!(project_file_path(directory.clone(), name.into()).is_err());
        }
        let backup = |stamp: u32| {
            Some(ProjectBackup {
                stamp: stamp.to_string(),
                limit: 2,
            })
        };
        write_project_file(path.clone(), "{\"v\":0}".into(), backup(0)).unwrap();
        assert!(!folder.join(BACKUP_DIR).exists());
        for stamp in 1..=3 {
            write_project_file(path.clone(), format!("{{\"v\":{stamp}}}"), backup(stamp)).unwrap();
        }
        let names: Vec<String> = backups(&folder.join(BACKUP_DIR), "Song [")
            .unwrap()
            .iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["Song [2].zdaw", "Song [3].zdaw"]);
        assert_eq!(
            fs::read_to_string(folder.join(BACKUP_DIR).join("Song [3].zdaw")).unwrap(),
            "{\"v\":2}"
        );
        assert!(write_project_file(path.clone(), "not json".into(), None).is_err());
        assert!(write_project_file(
            folder.join("Song.json").to_string_lossy().into_owned(),
            "{}".into(),
            None
        )
        .is_err());
        assert_eq!(
            read_project_file(path).unwrap().as_deref(),
            Some("{\"v\":3}")
        );
        fs::remove_dir_all(&root).unwrap();
    }
}
