import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const PLATFORMS = {
  "darwin-arm64": {
    id: "macos-arm64",
    bindingSuffix: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    targetTriple: "aarch64-apple-darwin",
    executableSuffix: "",
    formats: ["app", "dmg"],
  },
  "win32-x64": {
    id: "windows-x64",
    bindingSuffix: "win32-x64-msvc",
    bunTarget: "bun-windows-x64",
    targetTriple: "x86_64-pc-windows-msvc",
    executableSuffix: ".exe",
    formats: ["nsis"],
  },
}

export function releasePlatform() {
  const host = `${process.platform}-${process.arch}`
  if (!Object.hasOwn(PLATFORMS, host)) throw new Error(`Unsupported release host: ${host}`)
  return PLATFORMS[host]
}

export function releaseMetadata(version) {
  if (
    typeof version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)
  ) {
    throw new Error("Expected a release version such as 0.0.0 or 0.1.0-beta.1")
  }
  const app = JSON.parse(readFileSync(path.join(repository, "apps/gpuix/package.json"), "utf8"))
  const product = JSON.parse(readFileSync(path.join(repository, "package.json"), "utf8"))
  if (version !== app.version || version !== product.version || product.name !== "zoeydaw") {
    throw new Error(
      `Version/product mismatch: requested=${version}, app=${app.version}, root=${product.name}@${product.version}`
    )
  }
  return { version, productName: product.name }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2]
  if (!tag?.startsWith("v")) throw new Error("Expected a v-prefixed release tag")
  console.log(releaseMetadata(tag.slice(1)).version)
}
