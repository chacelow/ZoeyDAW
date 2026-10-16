import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { compileApplication } from "./bundle.mjs"
import { releaseMetadata, repository } from "./metadata.mjs"
import { PRESET_DATA } from "../../apps/gpuix/src/shared/theme/presets.data.ts"

const run = (command, args, cwd = repository) =>
  execFileSync(command, args, { cwd, stdio: "inherit" })
const [version, output = path.join(repository, "dist/release", version ?? "invalid")] =
  process.argv.slice(2)
const { productName } = releaseMetadata(version)
if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("Packaging currently supports macOS arm64 only")
}
const destination = path.resolve(output)
mkdirSync(destination, { recursive: true })
const work = path.join(destination, "build")
mkdirSync(work, { recursive: true })
run("bash", ["scripts/gpuix-main/build.sh"])
run("pnpm", ["native:build"])
await compileApplication({
  entrypoint: path.join(repository, "apps/gpuix/src/main.tsx"),
  outfile: path.join(work, productName),
})
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
      formats: ["app"],
      binaries: [{ path: productName, main: true }],
      binariesDir: work,
      outDir: destination,
      targetTriple: "aarch64-apple-darwin",
      icons: [path.join(work, "zoeydaw.icns")],
      resources: [
        ...["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES"].map(name => ({
          src: path.join(repository, name),
          target: `licenses/${name}`,
        })),
        ...["LICENSE", "THIRD_PARTY_NOTICES.md"].map(name => ({
          src: path.join(repository, ".gpuix-main", name),
          target: `licenses/gpuix/${name}`,
        })),
      ],
      macos: { minimumSystemVersion: "13.0" },
    },
    null,
    2
  )
)
run(process.env.CARGO_PACKAGER_BIN ?? "cargo-packager", ["--release", "--config", config])
const appBundle = path.join(destination, "zoeydaw.app")
// Bun 1.3.14's --compile writes an invalid ad-hoc signature on darwin-arm64 (wrong last-page hash,
// stale bytes past the signature; oven-sh/bun#39837), and the bundle itself is left unsealed.
// Gatekeeper reports a quarantined download with an invalid signature as "damaged". Re-sign the
// whole bundle ad hoc and verify strictly so a broken signature can never reach a release.
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
const files = [diskImages[0], path.basename(archive)]
writeFileSync(
  path.join(destination, "SHA256SUMS-macos-arm64"),
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
