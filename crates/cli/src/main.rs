use serde_json::Value;
use std::{env, fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use zoeydaw_project::{open_project, SaveOperation};

fn value_after<'a>(args: &'a [String], name: &str) -> Result<&'a str, String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].as_str())
        .ok_or_else(|| format!("Missing {name}"))
}

fn project_path(args: &[String]) -> Result<PathBuf, String> {
    Ok(PathBuf::from(value_after(args, "--path")?))
}

fn run_open(args: &[String]) -> Result<(), String> {
    let receipt = open_project(&project_path(args)?).map_err(|error| error.message)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&receipt).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn pointer_parts(path: &str) -> Result<Vec<String>, String> {
    if path.is_empty() {
        return Ok(Vec::new());
    }
    if !path.starts_with('/') {
        return Err("JSON Patch path must be empty or start with /".into());
    }
    path[1..]
        .split('/')
        .map(|part| {
            let mut value = String::new();
            let mut chars = part.chars();
            while let Some(character) = chars.next() {
                if character == '~' {
                    match chars.next() {
                        Some('0') => value.push('~'),
                        Some('1') => value.push('/'),
                        _ => return Err("Invalid JSON Pointer escape".into()),
                    }
                } else {
                    value.push(character);
                }
            }
            Ok(value)
        })
        .collect()
}

fn array_index(segment: &str, length: usize, allow_end: bool) -> Result<usize, String> {
    let index = segment
        .parse::<usize>()
        .map_err(|_| "JSON Patch array index is invalid".to_owned())?;
    if index > length || (!allow_end && index == length) {
        return Err("JSON Patch array index is out of range".into());
    }
    Ok(index)
}

fn patch_value(root: &mut Value, operation: &Value) -> Result<(), String> {
    let object = operation.as_object().ok_or("JSON Patch operation must be an object")?;
    let kind = object
        .get("op")
        .and_then(Value::as_str)
        .ok_or("JSON Patch operation is missing op")?;
    let parts = pointer_parts(
        object
            .get("path")
            .and_then(Value::as_str)
            .ok_or("JSON Patch operation is missing path")?,
    )?;
    if parts.is_empty() {
        match kind {
            "add" | "replace" => *root = object.get("value").cloned().ok_or("JSON Patch operation is missing value")?,
            "remove" => *root = Value::Null,
            _ => return Err("Unsupported JSON Patch operation".into()),
        }
        return Ok(());
    }
    let (parent_parts, leaf) = parts.split_at(parts.len() - 1);
    let mut parent = root;
    for part in parent_parts {
        parent = match parent {
            Value::Object(object) => object.get_mut(part).ok_or("JSON Patch parent does not exist")?,
            Value::Array(items) => {
                let index = array_index(part, items.len(), false)?;
                items.get_mut(index).ok_or("JSON Patch parent does not exist")?
            }
            _ => return Err("JSON Patch parent is not traversable".into()),
        };
    }
    let leaf = &leaf[0];
    match parent {
        Value::Object(object) => match kind {
            "add" | "replace" => {
                object.insert(leaf.clone(), object_value(operation)?);
            }
            "remove" => {
                object.remove(leaf).ok_or("JSON Patch object field does not exist")?;
            }
            _ => return Err("Unsupported JSON Patch operation".into()),
        },
        Value::Array(items) => match kind {
            "add" => {
                if leaf == "-" {
                    items.push(object_value(operation)?);
                } else {
                    let index = array_index(leaf, items.len(), true)?;
                    items.insert(index, object_value(operation)?);
                }
            }
            "replace" => {
                let index = array_index(leaf, items.len(), false)?;
                items[index] = object_value(operation)?;
            }
            "remove" => {
                let index = array_index(leaf, items.len(), false)?;
                items.remove(index);
            }
            _ => return Err("Unsupported JSON Patch operation".into()),
        },
        _ => return Err("JSON Patch parent is not a container".into()),
    }
    Ok(())
}

fn object_value(operation: &Value) -> Result<Value, String> {
    operation
        .get("value")
        .cloned()
        .ok_or("JSON Patch operation is missing value".into())
}

fn run_save(args: &[String]) -> Result<(), String> {
    let path = project_path(args)?;
    let manifest_path = PathBuf::from(value_after(args, "--manifest")?);
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(manifest_path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    let operation_id = value_after(args, "--operation").unwrap_or("cli-save");
    let operation = SaveOperation::begin(operation_id.to_owned()).map_err(|error| error.message)?;
    let receipt = operation
        .save(&path, manifest, false, None)
        .map_err(|error| error.message)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&receipt).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn run_mutate(args: &[String]) -> Result<(), String> {
    let path = project_path(args)?;
    let patch_path = PathBuf::from(value_after(args, "--patch")?);
    let payload: Value = serde_json::from_str(
        &fs::read_to_string(patch_path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    let operations = payload
        .as_array()
        .or_else(|| payload.get("operations").and_then(Value::as_array))
        .ok_or("JSON Patch input must be an array or an object with operations")?;
    let opened = open_project(&path).map_err(|error| error.message)?;
    let expected_commit = opened.manifest.get("commitId").and_then(Value::as_str).map(str::to_owned);
    let mut manifest = opened.manifest;
    for operation in operations {
        patch_value(&mut manifest, operation)?;
    }
    manifest["commitId"] = Value::String(new_commit_id());
    let operation_id = value_after(args, "--operation").unwrap_or("cli-mutate");
    let operation = SaveOperation::begin(operation_id.to_owned()).map_err(|error| error.message)?;
    let receipt = operation
        .save(&path, manifest, false, expected_commit.as_deref())
        .map_err(|error| error.message)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "command": "project mutate",
            "path": path,
            "operationCount": operations.len(),
            "result": receipt
        }))
        .map_err(|error| error.to_string())?
    );
    Ok(())
}

fn new_commit_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    format!("cli-{timestamp}")
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("project") {
        match args.get(1).map(String::as_str) {
            Some("open") => return run_open(&args[2..]),
            Some("save") => return run_save(&args[2..]),
            Some("mutate") => return run_mutate(&args[2..]),
            _ => {}
        }
    }
    zoeydaw_engine::cli::run(args)
}

fn main() {
    if let Err(error) = run() {
        eprintln!("zoeydaw: {error}");
        std::process::exit(1);
    }
}
