import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const project = path.resolve(import.meta.dirname, "../../..")
const root = mkdtempSync(path.join(tmpdir(), "gpuix-header-mutation-"))
const app = path.join(root, "apps/gpuix")
const source = path.join(project, "apps/gpuix/src")
const bun = realpathSync(execFileSync("/usr/bin/which", ["bun"], { encoding: "utf8" }).trim())
try {
  mkdirSync(app, { recursive: true })
  cpSync(source, path.join(app, "src"), {
    recursive: true,
    filter: file => !path.relative(source, file).split(path.sep).includes("evidence"),
  })
  for (const file of ["package.json", "tsconfig.json", "bunfig.toml"])
    copyFileSync(path.join(project, "apps/gpuix", file), path.join(app, file))
  symlinkSync(path.join(project, "apps/gpuix/node_modules"), path.join(app, "node_modules"), "dir")
  const run = () =>
    spawnSync(
      bun,
      [
        "test",
        "src/project/sections/transport/index.test.tsx",
        "--test-name-pattern",
        "first mount Header.*1800",
      ],
      { cwd: app, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
    )
  const baseline = run()
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr)
  const target = path.join(app, "src/project/sections/transport/index.tsx")
  const fixed = readFileSync(target, "utf8")
  const seam = "const [viewportWidth, setViewportWidth] = useState(0)"
  assert.equal(fixed.split(seam).length, 2)
  let mutated = fixed.replace(
    seam,
    () => `${seam}
  const [measurements, setMeasurements] = useState({ left: 0, center: 0, right: 0 })
  const remaining = viewportWidth - measurements.center - theme.project.transportColumnGap * 2
  const half = remaining / 2
  const leftColumn = Math.max(measurements.left, Math.min(half, remaining - measurements.right))
  const rightColumn = Math.max(measurements.right, Math.min(half, remaining - measurements.left))
  const measured = viewportWidth > 0 && measurements.left > 0 && measurements.center > 0 && measurements.right > 0
  function measure(part: keyof typeof measurements, width: number | undefined) {
    if (width !== undefined) setMeasurements(current => current[part] === width ? current : { ...current, [part]: width })
  }`
  )
  const groups = /testId="transport-(left|center|right)"\s+style=\{groupStyle\}/gu
  assert.equal([...mutated.matchAll(groups)].length, 3)
  mutated = mutated.replace(groups, (_match, part) =>
    [
      'testId="transport-',
      part,
      '" style={groupStyle} onLayout={event => measure("',
      part,
      '", event.width)}',
    ].join("")
  )
  const columns = /flexGrow: 1,\s*flexBasis: 0,/gu
  assert.equal([...mutated.matchAll(columns)].length, 2)
  let column = 0
  mutated = mutated.replace(
    columns,
    () =>
      `width: measured ? ${column++ === 0 ? "leftColumn" : "rightColumn"} : undefined, flexGrow: measured ? 0 : 1,`
  )
  mutated = mutated.replace(
    "minWidth: viewportWidth,",
    () =>
      "minWidth: viewportWidth, width: measured ? leftColumn + measurements.center + rightColumn + theme.project.transportColumnGap * 2 : undefined,"
  )
  writeFileSync(target, mutated)
  const result = run()
  assert.equal(
    result.status,
    1,
    `Header feedback mutation survived\n${result.stdout}\n${result.stderr}`
  )
  const output = result.stdout + result.stderr
  assert.match(output, /Expected: <= 0\.5/)
  assert.match(output, /\(fail\) first mount Header Helvetica at 1800/)
  assert.match(output, /\(fail\) first mount Header missing at 1800/)
  console.log("KILLED Header child-measurement feedback cache")
} finally {
  rmSync(root, { recursive: true, force: true })
}
