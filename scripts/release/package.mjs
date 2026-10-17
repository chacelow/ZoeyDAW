import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { compileApplication } from "./bundle.mjs"
import { releaseMetadata, releasePlatform, repository } from "./metadata.mjs"
import { PRESET_DATA } from "../../apps/gpuix/src/shared/theme/presets.data.ts"

const run = (command, args, cwd = repository) =>
  execFileSync(command, args, { cwd, stdio: "inherit" })
const [version, output = path.join(repository, "dist/release", version ?? "invalid")] =
  process.argv.slice(2)
const { productName } = releaseMetadata(version)
const platform = releasePlatform()
const destination = path.resolve(output)
mkdirSync(destination, { recursive: true })
const work = path.join(destination, "build")
mkdirSync(work, { recursive: true })
if (platform.id === "windows-x64") {
  run("node", ["scripts/gpuix-main/build.mjs", "runtime"])
  run("bun", ["run", "build"], path.join(repository, "crates/native"))
} else {
  run("node", ["scripts/gpuix-main/build.mjs", "runtime"])
  run("pnpm", ["native:build"])
}
await compileApplication({
  entrypoint: path.join(repository, "apps/gpuix/src/main.tsx"),
  outfile: path.join(work, `${productName}${platform.executableSuffix}`),
})
if (platform.id === "macos-arm64") {
  const require = createRequire(path.join(repository, "apps/gpuix/package.json"))
  const { formatHex } = await import(require.resolve("culori"))
  const preset = PRESET_DATA.find(value => value.id === "default")
  if (!preset) throw new Error("Default brand palette is missing")
  const icon = path.join(work, "zoeydaw.png")
  run("swift", [
    path.join(repository, "scripts/release/icon.swift"),
    icon,
    formatHex(preset.dark.background),
    formatHex(preset.dark.foreground),
    formatHex(preset.dark.chart2),
  ])
  const iconset = path.join(work, "zoeydaw.iconset")
  mkdirSync(iconset, { recursive: true })
  for (const size of [16, 32, 128, 256, 512]) {
    run("sips", [
      "-z",
      String(size),
      String(size),
      icon,
      "--out",
      path.join(iconset, `icon_${size}x${size}.png`),
    ])
    run("sips", [
      "-z",
      String(size * 2),
      String(size * 2),
      icon,
      "--out",
      path.join(iconset, `icon_${size}x${size}@2x.png`),
    ])
  }
  run("iconutil", ["-c", "icns", iconset, "-o", path.join(work, "zoeydaw.icns")])
}
const config = path.join(work, "packager.json")
writeFileSync(
  config,
  JSON.stringify(
    {
      name: productName,
      productName,
      version,
      identifier: "com.zoeydaw.desktop",
      description: "Native digital audio workstation",
      homepage: "https://github.com/chacelow/ZoeyDAW",
      category: "Music",
      formats: platform.id === "macos-arm64" ? ["app"] : platform.formats,
      binaries: [{ path: productName, main: true }],
      binariesDir: work,
      outDir: destination,
      targetTriple: platform.targetTriple,
      resources: [
        ...["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES"].map(name => ({
          src: path.join(repository, name),
          target: `licenses/${name}`,
        })),
        ...["LICENSE", "THIRD_PARTY_NOTICES.md"].map(name => ({
          src: path.join(repository, "vendor/gpuix", name),
          target: `licenses/gpuix/${name}`,
        })),
      ],
      ...(platform.id === "macos-arm64"
        ? {
            icons: [path.join(work, "zoeydaw.icns")],
            macos: { minimumSystemVersion: "13.0" },
          }
        : {}),
    },
    null,
    2
  )
)
run(process.env.CARGO_PACKAGER_BIN ?? "cargo-packager", ["--release", "--config", config])
let files
if (platform.id === "macos-arm64") {
  const appBundle = path.join(destination, "zoeydaw.app")
  run("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--identifier",
    "com.zoeydaw.desktop",
    appBundle,
  ])
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle])
  const diskImage = path.join(destination, `${productName}_${version}_aarch64.dmg`)
  const staging = path.join(work, "dmg")
  rmSync(staging, { recursive: true, force: true })
  rmSync(diskImage, { force: true })
  mkdirSync(staging, { recursive: true })
  run("ditto", [appBundle, path.join(staging, "zoeydaw.app")])
  run("ln", ["-s", "/Applications", path.join(staging, "Applications")])
  run("hdiutil", [
    "create",
    "-volname",
    productName,
    "-srcfolder",
    staging,
    "-fs",
    "HFS+",
    "-format",
    "UDZO",
    diskImage,
  ])
  const archive = path.join(destination, `zoeydaw-${version}-macos-arm64.app.zip`)
  rmSync(archive, { force: true })
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appBundle, archive])
  const diskImages = readdirSync(destination).filter(name => name.endsWith(".dmg"))
  if (diskImages.length !== 1) throw new Error(`Expected one DMG, found ${diskImages.length}`)
  files = [diskImages[0], path.basename(archive)]
} else {
  const installer = `${productName}_${version}_x64-setup.exe`
  if (!statSync(path.join(destination, installer)).isFile())
    throw new Error("NSIS installer is missing")
  files = [installer]
}
writeFileSync(
  path.join(destination, `SHA256SUMS-${platform.id}`),
  files
    .map(
      name =>
        `${createHash("sha256")
          .update(readFileSync(path.join(destination, name)))
          .digest("hex")}  ${name}\n`
    )
    .join("")
)
console.log(`Packaged ${productName} ${version}: ${destination}`)
