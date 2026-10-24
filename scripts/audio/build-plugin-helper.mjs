import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const platform = process.platform
if (!(
  (platform === "darwin" && process.arch === "arm64") ||
  (platform === "win32" && process.arch === "x64")
)) {
  throw new Error("Plugin helper supports Apple Silicon macOS and Windows x64 only")
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`)
}
run("cargo", ["build", "--locked", "--release", "-p", "zoeydaw-plugin-helper"])
const resources = path.join(root, "src-tauri/plugin-helper")
mkdirSync(resources, { recursive: true })
if (platform === "win32") {
  copyFileSync(
    path.join(root, "target/release/zoeydaw-plugin-helper.exe"),
    path.join(resources, "zoeydaw-plugin-helper.exe")
  )
} else {
  const app = path.join(resources, "ZoeydawPluginHelper.app")
  const contents = path.join(app, "Contents")
  mkdirSync(path.join(contents, "MacOS"), { recursive: true })
  copyFileSync(
    path.join(root, "target/release/zoeydaw-plugin-helper"),
    path.join(contents, "MacOS/zoeydaw-plugin-helper")
  )
  writeFileSync(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>zoeydaw-plugin-helper</string>
<key>CFBundleIdentifier</key><string>com.zoeydaw.plugin-helper</string>
<key>CFBundleName</key><string>ZoeydawPluginHelper</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`
  )
  run("codesign", [
    "--force",
    "--sign",
    "-",
    "--options",
    "runtime",
    "--entitlements",
    "scripts/audio/plugin-helper.entitlements",
    app,
  ])
  run("codesign", ["--verify", "--strict", app])
}
for (const license of ["LICENSE-MIT", "LICENSE-APACHE"]) {
  copyFileSync(
    path.join(root, "third_party/plughost", license),
    path.join(resources, `plughost-${license}`)
  )
}
console.log(`Plugin helper packaged at ${resources}`)
