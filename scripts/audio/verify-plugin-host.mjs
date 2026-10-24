import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const mac = process.platform === "darwin" && process.arch === "arm64"
const windows = process.platform === "win32" && process.arch === "x64"
if (!mac && !windows)
  throw new Error("Plugin verification requires Apple Silicon macOS or Windows x64")
const nativeBuild = process.argv[2]
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`)
}
run(process.execPath, [path.join(root, "scripts/audio/build-plugin-helper.mjs")])
const target = path.join(root, "target/plugin-fixtures")
run("cargo", [
  "build",
  "--release",
  "--locked",
  "--manifest-path",
  "third_party/plughost/Cargo.toml",
  "--target-dir",
  target,
  "-p",
  "plughost-test-delay",
  "-p",
  "plughost-test-routing",
  "-p",
  "plughost-test-synth",
])
const temporary = mkdtempSync(path.join(os.tmpdir(), "zoeydaw-plugin-verification-"))
try {
  const plugins = path.join(temporary, "plugins")
  mkdirSync(plugins)
  for (const [kind, variant] of [
    ["delay", "delay"],
    ["routing", "routing"],
    ["synth", "synth"],
    ["delay", "crash-in-process"],
    ["delay", "hang-in-process"],
    ["delay", "stall-in-process"],
  ]) {
    const name = `plughost-test-${variant}`
    for (const format of ["clap", "vst3"]) {
      const bundle = path.join(plugins, `${name}.${format}`)
      const source = path.join(
        target,
        "release",
        mac ? `libplughost_test_${kind}.dylib` : `plughost_test_${kind}.dll`
      )
      if (windows && format === "clap") {
        copyFileSync(source, bundle)
      } else {
        const binaryDirectory = path.join(bundle, "Contents", mac ? "MacOS" : "x86_64-win")
        mkdirSync(binaryDirectory, { recursive: true })
        copyFileSync(source, path.join(binaryDirectory, mac ? name : `${name}.vst3`))
        if (mac) {
          writeFileSync(
            path.join(bundle, "Contents/Info.plist"),
            `<?xml version="1.0"?><plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>${name}</string>
<key>CFBundleIdentifier</key><string>com.zoeydaw.fixture.${variant}.${format}</string>
<key>CFBundlePackageType</key><string>BNDL</string>
</dict></plist>`
          )
          run("codesign", ["--force", "--sign", "-", bundle])
        }
      }
    }
  }
  const helper = path.join(
    root,
    "src-tauri/plugin-helper",
    mac
      ? "ZoeydawPluginHelper.app/Contents/MacOS/zoeydaw-plugin-helper"
      : "zoeydaw-plugin-helper.exe"
  )
  run("cargo", [
    "run",
    "--release",
    "--locked",
    "-p",
    "zoeydaw-plugin-host",
    "--example",
    "catalog_smoke",
    "--",
    helper,
    plugins,
    path.join(temporary, "catalog.json"),
  ])
  run("cargo", [
    "run",
    "--release",
    "--locked",
    "-p",
    "zoeydaw-plugin-host",
    "--example",
    "transport_smoke",
    "--",
    helper,
    plugins,
  ])
  run("cargo", [
    "run",
    "--release",
    "--locked",
    "-p",
    "zoeydaw-plugin-host",
    "--example",
    "isolation_smoke",
    "--",
    helper,
    plugins,
  ])
  run("cargo", [
    "run",
    "--release",
    "--locked",
    "-p",
    "zoeydaw-plugin-host",
    "--example",
    "realtime_recovery_smoke",
    "--",
    helper,
    plugins,
  ])
  if (nativeBuild) {
    run("cargo", ["run", "--locked", "-p", "zoeydaw-engine", "--example", "plugin_admission_smoke"])
    const build = path.resolve(nativeBuild)
    run("cmake", [
      "-S",
      "crates/engine/native",
      "-B",
      build,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DZOEYDAW_PLAYBACK_SMOKE=ON",
    ])
    run("cmake", [
      "--build",
      build,
      "--config",
      "Release",
      "--target",
      "zoeydaw_isolated_plugin_probe",
      "--parallel",
      "6",
    ])
    const library = path.join(
      build,
      mac ? "libzoeydaw_isolated_plugin_probe.dylib" : "Release/zoeydaw_isolated_plugin_probe.dll"
    )
    run("cargo", [
      "run",
      "--release",
      "--locked",
      "-p",
      "zoeydaw-plugin-host",
      "--example",
      "native_graph_smoke",
      "--",
      helper,
      plugins,
      library,
    ])
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
