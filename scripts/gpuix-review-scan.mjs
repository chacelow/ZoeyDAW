// Pre-delivery scan for a gpuix slice. Run from the slice worktree root: node scripts/gpuix-review-scan.mjs [baseRef]
// Cheap, deterministic checks that a reviewer would otherwise find by reading the diff. Exit 1 on any hard finding.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const base = process.argv[2] ?? "gpuix-migration"
// Run the repo's own eslint binary by absolute path: no PATH lookup, and the scan lints against the same config the pre-commit hook uses.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const eslintBin = path.join(repoRoot, "node_modules", ".bin", "eslint")
const eslintConfig = path.join(repoRoot, "eslint.config.js")
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26 }).trim()
const changed = run("git", ["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`])
  .split("\n")
  .filter(Boolean)
const source = changed.filter(f => /^apps\/gpuix\/src\/.*\.(ts|tsx)$/.test(f))
const code = source.filter(f => !/\.test\.(ts|tsx)$/.test(f))
const findings = []
const add = (kind, file, detail) => {
  findings.push({ kind, file, detail })
}

const stripComments = text =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")

for (const file of code) {
  const raw = readFileSync(file, "utf8")
  const lines = raw.split("\n")
  const text = stripComments(raw)
  if (lines.length > 600)
    add("file-size", file, `${lines.length} lines (>600): split by responsibility`)
  if (
    !file.endsWith("shared/svg/serialise.ts") &&
    /<(svg|path|circle|rect|polyline|polygon|line|ellipse)[\s>]/i.test(text)
  ) {
    add("hand-written-svg", file, "SVG literal: use <Icon/> (lucide) or d3-shape + serialiseSvg")
  }
  if (/from "(\.\.\/){3,}/.test(text))
    add("deep-relative-import", file, "use the @/ alias (eslint --fix)")
  if (
    /["'`]#[0-9a-fA-F]{3,8}["'`]|["'`](?:rgba?|oklch|hsla?)\(/.test(text) &&
    !/shared\/theme|\/tokens?\./.test(file)
  ) {
    add("color-literal", file, "colour literal: take colours from useTheme()")
  }
  const px = [
    ...text.matchAll(
      /\b(?:gap|padding\w*|margin\w*|width|height|fontSize|borderRadius)\s*:\s*(\d{2,})\b/g
    ),
  ]
  if (px.length)
    add(
      "px-literal",
      file,
      `${px.length} raw pixel value(s) like ${px[0][0]}: use CONTROL_METRICS/PROJECT_METRICS/theme tokens`
    )
  if (/\bas any\b|: any\b|<any>/.test(text)) add("any", file, "avoid any: type the boundary")
  if (
    /\bmock\w*\(|createMock|simulat/i.test(text) &&
    // verification/ entry points drive the real app with nativeSimulate; they are not product code.
    !/backend\/mock|test-setup|fixtures|\/verification\//.test(file)
  ) {
    add(
      "mock-in-product-code",
      file,
      "no mock/simulated data in product code: use the real backend port"
    )
  }
}
for (const file of source) {
  const text = stripComments(readFileSync(file, "utf8"))
  if (
    /\b(it|test)\.skip\(|\b(describe|it|test)\.only\(|(?<![\w$.])x(it|test|describe)\(/.test(text)
  )
    add("skipped-test", file, "skipped/only test: delete or fix")
  if (/expect\([^)]*\)\.toBeTruthy\(\)\s*$/m.test(text) && /\.test\.(ts|tsx)$/.test(file))
    add("weak-assertion", file, "toBeTruthy-only assertion: assert the behaviour")
  // 0.10 compatibility shims double-compensate on the pinned main renderer; only ui/controls may still hold them until A3b deletes them.
  if (!file.includes("/ui/controls/") && /\b(readOuterBounds|useFloatingCenterOffset)\b/.test(text))
    add("legacy-bounds-shim", file, "0.10 bounds shim: use renderer.getElementBounds / onLayout")
}

// Everything eslint already knows (layers, DOM globals, @/ alias, no hand-written SVG, JS timers, appearance override) comes from eslint, not from regexes here.
if (source.length > 0) {
  try {
    execFileSync(
      eslintBin,
      ["--config", eslintConfig, "--no-warn-ignored", "--max-warnings", "0", ...source],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }
    )
  } catch (error) {
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`
      .split("\n")
      .filter(l => /^\s+\d+:\d+\s+(error|warning)/.test(l)).length
    add(
      "eslint",
      "(slice)",
      `${out} eslint problem(s): run node_modules/.bin/eslint --fix apps/gpuix/src, then fix the rest`
    )
  }
}

const tests = changed.filter(f => /\.test\.(ts|tsx)$/.test(f))
if (code.length > 0 && tests.length === 0)
  add("no-tests", "(slice)", "source changed but no test file added or changed")

const order = [
  "eslint",
  "hand-written-svg",
  "mock-in-product-code",
  "deep-relative-import",
  "file-size",
]
findings.sort((a, b) => (order.indexOf(a.kind) + 1 || 99) - (order.indexOf(b.kind) + 1 || 99))
const hard = new Set([
  "hand-written-svg",
  "deep-relative-import",
  "eslint",
  "mock-in-product-code",
  "skipped-test",
  "no-tests",
  "any",
  "legacy-bounds-shim",
])
for (const f of findings)
  console.log(`${hard.has(f.kind) ? "HARD" : "WARN"}  ${f.kind.padEnd(22)} ${f.file}  ${f.detail}`)
const hardCount = findings.filter(f => hard.has(f.kind)).length
console.log(
  `\n${code.length} source files, ${tests.length} test files scanned vs ${base}: ${hardCount} hard, ${findings.length - hardCount} warn`
)
process.exit(hardCount ? 1 : 0)
