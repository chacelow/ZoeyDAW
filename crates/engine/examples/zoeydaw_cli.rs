use serde_json::Value;
use std::{env, fs, path::PathBuf};
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

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("project") {
        match args.get(1).map(String::as_str) {
            Some("open") => return run_open(&args[2..]),
            Some("save") => return run_save(&args[2..]),
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
