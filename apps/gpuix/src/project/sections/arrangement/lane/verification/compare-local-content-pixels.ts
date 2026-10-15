import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const [before, after] = process.argv.slice(2)
if (!before || !after)
  throw new Error("Usage: compare-local-content-pixels.ts before-directory after-directory")
const previous = readdirSync(before)
  .filter(name => name.endsWith(".png"))
  .sort((a, b) => a.localeCompare(b))
const current = readdirSync(after)
  .filter(name => name.endsWith(".png"))
  .sort((a, b) => a.localeCompare(b))
if (previous.length === 0) throw new Error("Native pixel proof requires captured PNG frames")
if (JSON.stringify(previous) !== JSON.stringify(current))
  throw new Error("Native frame capture sets differ")
const changed = previous.filter(
  name => !readFileSync(path.join(before, name)).equals(readFileSync(path.join(after, name)))
)
process.stdout.write(`${JSON.stringify({ frames: previous.length, changedFrames: changed })}\n`)
if (changed.length > 0) throw new Error("Local clip content changed native pixels")
