import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
if (!process.env.CARGO_TARGET_DIR) throw new Error("CARGO_TARGET_DIR must select a private target")
const env = process.env
const cargo =
  process.env.CARGO ??
  path.join(homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo")
const mutations = [
  {
    name: "RUST-01-ignore-return-solo",
    file: "crates/engine/src/mix/solo.rs",
    from: "if !selected.iter().any(|selected| *selected) {",
    to: "if true {",
    package: "zoeydaw-engine",
    test: "return_solo_keeps_only_selected_wet_route_and_respects_source_solo",
  },
  {
    name: "RUST-02-volume-floor-remains-audible",
    file: "crates/engine/src/mix/mod.rs",
    from: "let volume = mixer_gain(track.volume_db);",
    to: "let volume = db_gain(track.volume_db);",
    package: "zoeydaw-engine",
    test: "mixer_minimum_volume_is_exact_silence_but_clip_gain_is_not",
  },
  {
    name: "RUST-02-send-floor-remains-audible",
    file: "crates/engine/src/mix/mod.rs",
    from: "                    mixer_gain(*db),",
    to: "                    db_gain(*db),",
    package: "zoeydaw-engine",
    test: "send_minimum_restores_the_silent_missing_send",
  },
  {
    name: "RUST-03-delete-active-writer-temporary-file",
    file: "crates/native/src/atomic_file.rs",
    from: "    fs::create_dir_all(parent)?;",
    to: `    fs::create_dir_all(parent)?;
    let current = format!("{}{}-", TEMP_MARKER, std::process::id());
    for entry in fs::read_dir(parent)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.contains(TEMP_MARKER) && !name.contains(&current) && name.ends_with(".tmp") {
            fs::remove_file(entry.path())?;
        }
    }`,
    package: "zoeydaw-native",
    test: "concurrent_process_saves_keep_active_temporary_files",
  },
  {
    name: "RUST-04-disable-one-in-flight-ownership",
    file: "crates/native/src/engine/telemetry.rs",
    from: "compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)",
    to: "compare_exchange(false, false, Ordering::AcqRel, Ordering::Acquire)",
    native: true,
    test: "RUST-04",
  },
  {
    name: "RUST-05-register-cleanup-for-every-session",
    file: "crates/native/src/engine/cleanup.rs",
    from: "if let Some(owner) = owners.get(&key) {",
    to: "if let Some(owner) = owners.get(&usize::MAX) {",
    native: true,
    test: "RUST-05",
  },
]

function run(mutation) {
  if (mutation.native) {
    return spawnSync(
      process.execPath,
      ["crates/native/verification/resources.mjs", `--test-name-pattern=${mutation.test}`],
      {
        cwd: root,
        env,
        encoding: "utf8",
      }
    )
  }
  return spawnSync(cargo, ["test", "-p", mutation.package, mutation.test, "--", "--nocapture"], {
    cwd: root,
    env,
    encoding: "utf8",
  })
}

for (const mutation of mutations) {
  const baseline = run(mutation)
  if (baseline.status !== 0)
    throw new Error(`Baseline failed: ${mutation.name}\n${baseline.stdout}${baseline.stderr}`)
  const path = `${root}${mutation.file}`
  const source = readFileSync(path, "utf8")
  if (source.split(mutation.from).length !== 2)
    throw new Error(`Mutation anchor changed: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      path,
      source.replace(mutation.from, () => mutation.to)
    )
    result = run(mutation)
  } finally {
    writeFileSync(path, source)
  }
  const output = `${result.stdout}${result.stderr}`
  const expectedFailure = mutation.native
    ? `not ok 1 - ${mutation.test}`
    : `${mutation.test} ... FAILED`
  if (
    result.status === 0 ||
    !output.includes(expectedFailure) ||
    output.includes("could not compile")
  ) {
    throw new Error(`Regression did not kill mutation: ${mutation.name}\n${output}`)
  }
  console.log(`${mutation.name}: killed by ${mutation.test}`)
}
