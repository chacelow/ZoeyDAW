// Routing check: an agent reads AGENTS.md first, then the AGENTS.md of the directory it edits.
// Every document an agent must know about has to be linked from one of those entry files,
// otherwise nothing tells the agent it exists. Run: node scripts/check-doc-routes.mjs
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const entries = [
  "AGENTS.md",
  "apps/gpuix/AGENTS.md",
  "apps/gpuix/src/ui/AGENTS.md",
  "apps/gpuix/src/project/sections/AGENTS.md",
]
const linked = new Set()
for (const entry of entries) {
  const text = readFileSync(entry, "utf8")
  for (const m of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^https?:/.test(m[1])) continue
    linked.add(path.normalize(path.join(path.dirname(entry), m[1])))
  }
  // Plain-text paths in backticks also count (READMEs are referenced that way).
  for (const m of text.matchAll(/`((?:src|docs|apps|crates)\/[^`\s]+\.md)`/g)) {
    linked.add(path.normalize(path.join(entry === "AGENTS.md" ? "." : path.dirname(entry), m[1])))
  }
}
const required = [
  "docs/architecture/gpuix.md",
  "docs/architecture/gpuix-ui-standards.md",
  "docs/architecture/gpuix-arrangement-composition.md",
  "docs/research/gpuix-main-build.md",
  "docs/research/engine-playback-graph.md",
  "apps/gpuix/src/project/stores/README.md",
  "apps/gpuix/src/project/adapters/README.md",
  "apps/gpuix/src/project/sections/arrangement/core/README.md",
  "apps/gpuix/src/ui/panels/README.md",
]
const missing = required.filter(f => !linked.has(f))
const absent = required.filter(f => !existsSync(f))
if (missing.length || absent.length) {
  if (missing.length) {
    console.error(
      `Not linked from an entry file (${entries.join(", ")}):\n${missing.map(m => `  ${m}`).join("\n")}`
    )
  }
  if (absent.length) {
    console.error(`Required docs do not exist:\n${absent.map(f => `  ${f}`).join("\n")}`)
  }
  process.exit(1)
}
console.log(`ok: ${required.length} required docs are linked from entry files`)
