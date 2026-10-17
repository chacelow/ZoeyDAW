import { existsSync } from "node:fs"
import path from "node:path"

const renderer = path.resolve(import.meta.dirname, "../vendor/gpuix")
if (!existsSync(path.join(renderer, ".git")) || !existsSync(path.join(renderer, "zed/.git"))) {
  console.error(
    "gpuix renderer submodules are missing. Run: git submodule update --init --recursive"
  )
  process.exit(1)
}
