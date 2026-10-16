import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { DEFAULT_DESIGN_TOKENS } from "../../design-tokens"
import { DEFAULT_LAYOUT_TOKENS } from "../../layout-tokens"
import { CONTROL_METRICS, PROJECT_METRICS } from "../../metrics/config"
import { THEME_PRESETS } from "../../presets"
import { designExpectations } from "./design"
import { layoutExpectations } from "./layout"
import type { AuditValue, BaselineMetrics, Expectation } from "./types"

const app = path.resolve(import.meta.dir, "../../../../..")
const repo = path.resolve(app, "../..")
const baseline = process.argv[2] ?? "a4a9d11c927e71ea69ab8299d89d29fe996ba03b"
const output = process.argv[3]
const git = Bun.which("git")
if (!git) throw new Error("git is required to load the original source defaults")
const snapshot = mkdtempSync(path.join(tmpdir(), "zoeydaw-c1-default-audit-"))

function at(value: unknown, key: string): unknown {
  for (const part of key.split(".")) {
    if (typeof value !== "object" || value === null || !Object.hasOwn(value, part)) return undefined
    value = Reflect.get(value, part)
  }
  return value
}
function numberAt(value: unknown, key: string): number {
  const result = at(value, key)
  if (typeof result !== "number" || !Number.isFinite(result))
    throw new Error(`Invalid baseline number: ${key}`)
  return result
}
function atom(value: unknown): AuditValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return value
  throw new Error("A default audit leaf must be a scalar")
}
function leaves(value: unknown, prefix = ""): [string, AuditValue][] {
  if (typeof value !== "object" || value === null) return [[prefix, atom(value)]]
  if (Array.isArray(value))
    throw new Error("Default token arrays need an explicit original expression")
  return Object.keys(value).flatMap(key =>
    leaves(Reflect.get(value, key), prefix ? `${prefix}.${key}` : key)
  )
}
function cell(value: unknown): string {
  return JSON.stringify(value).replaceAll("|", "\\|")
}
const rows: string[] = []
const failures: string[] = []
function compare(field: string, expression: string, expected: AuditValue, current: AuditValue) {
  const equal = Object.is(expected, current)
  rows.push(
    `| \`${field}\` | \`${expression.replaceAll("|", "\\|")}\` | ${cell(expected)} | ${cell(current)} | ${equal ? "一致" : "不一致"} |`
  )
  if (!equal) failures.push(`${field}: expected ${cell(expected)}, received ${cell(current)}`)
}
function compareGroup(
  name: string,
  current: unknown,
  previous: unknown,
  expectations: Readonly<Record<string, Expectation>>
) {
  for (const [field, value] of leaves(current)) {
    const original = at(previous, field)
    const expected = expectations[field]
    if (expected) compare(`${name}.${field}`, expected.expression, expected.value, value)
    else if (original !== undefined)
      compare(`${name}.${field}`, `原 ${name}.${field}`, atom(original), value)
    else throw new Error(`Missing original expression for ${name}.${field}`)
  }
}

try {
  const files = [
    "design-tokens.ts",
    "metrics/config.ts",
    "metrics/control-metrics.json",
    "colors.ts",
    "color-mix.ts",
    "presets.data.ts",
  ]
  for (const file of files) {
    const destination = path.join(snapshot, "src/shared/theme", file)
    mkdirSync(path.dirname(destination), { recursive: true })
    const source = execFileSync(git, ["show", `${baseline}:apps/gpuix/src/shared/theme/${file}`], {
      cwd: repo,
      encoding: "utf8",
    })
    // Relocate the original alias inside the snapshot; never resolve old defaults against today's metrics.
    writeFileSync(
      destination,
      source.replaceAll("@/shared/theme/metrics/config", "./metrics/config")
    )
  }
  writeFileSync(path.join(snapshot, "tsconfig.json"), readFileSync(path.join(app, "tsconfig.json")))
  symlinkSync(path.join(app, "node_modules"), path.join(snapshot, "node_modules"), "dir")
  const load = async (file: string): Promise<unknown> =>
    import(pathToFileURL(path.join(snapshot, "src/shared/theme", file)).href)
  const oldDesign = at(await load("design-tokens.ts"), "DEFAULT_DESIGN_TOKENS")
  const oldMetrics: unknown = JSON.parse(
    readFileSync(path.join(snapshot, "src/shared/theme/metrics/control-metrics.json"), "utf8")
  )
  const metrics: BaselineMetrics = {
    control: {
      track: numberAt(oldMetrics, "default.--spacing-control-track"),
      trackGap: numberAt(oldMetrics, "default.--spacing-control-track-gap"),
      gap: numberAt(oldMetrics, "default.--spacing-control-gap"),
      icon: numberAt(oldMetrics, "default.--spacing-control-icon"),
    },
    project: {
      controlsWidth: numberAt(oldMetrics, "project.controlsWidth"),
      identityWidth: numberAt(oldMetrics, "project.identityWidth"),
      defaultTrackHeight: numberAt(oldMetrics, "project.defaultTrackHeight"),
      trackBorder: numberAt(oldMetrics, "project.trackBorder"),
    },
  }
  compareGroup("design", DEFAULT_DESIGN_TOKENS, oldDesign, designExpectations(metrics))
  compareGroup("layout", DEFAULT_LAYOUT_TOKENS, undefined, layoutExpectations(metrics))
  compareGroup("control", CONTROL_METRICS.default, at(oldMetrics, "default"), {})
  compareGroup("transportControl", CONTROL_METRICS.transport, at(oldMetrics, "transport"), {})
  compareGroup("project", PROJECT_METRICS, at(oldMetrics, "project"), {
    maxTrackHeight: {
      expression: "project/layout/track.ts 4 * DEFAULT_TRACK_HEIGHT",
      value: metrics.project.defaultTrackHeight * 4,
    },
    gridMajorOpacity: {
      expression: "clip-edit/midi/note-paint.ts level === 2 ? 0.45",
      value: 0.45,
    },
    gridMinorOpacity: { expression: "clip-edit/midi/note-paint.ts minor 0.55", value: 0.55 },
    deviceResponseStrokeWidth: {
      expression: "footer/EffectChain/DeviceDisplay/index.tsx strokeWidth: 2",
      value: 2,
    },
  })
  const oldPresets = at(await load("presets.data.ts"), "PRESET_DATA")
  const oldDerive = at(await load("colors.ts"), "derive")
  if (!Array.isArray(oldPresets) || typeof oldDerive !== "function")
    throw new Error("Invalid original preset source")
  for (const preset of THEME_PRESETS) {
    const original: unknown = oldPresets.find(
      (candidate: unknown) => at(candidate, "id") === preset.id
    )
    if (!original) throw new Error(`Missing original preset ${preset.id}`)
    for (const scheme of ["light", "dark"] as const) {
      const base = at(original, scheme)
      const derived: unknown = oldDerive(base, scheme)
      compare(
        `presets.${preset.id}.${scheme}.success`,
        "原 palette.chart2",
        atom(at(base, "chart2")),
        preset.baseColors[scheme].success
      )
      for (const key of ["arrangementClipSelected", "arrangementClipPaper"] as const) {
        compare(
          `presets.${preset.id}.${scheme}.${key}`,
          `原 derive.${key}`,
          atom(at(derived, key)),
          preset.baseColors[scheme][key]
        )
      }
    }
  }
  const markdown = `# C1 默认值逐字段核对\n\n原始参照：\`${baseline}\`。旧设计对象、度量 JSON 和预设从 Git 原文件加载，新增来源按原消费者表达式求值。此表验证默认值忠实迁移，不替代实际消费者回归。\n\n复跑：\`bun apps/gpuix/src/shared/theme/verification/defaults-audit/index.ts ${baseline} apps/gpuix/src/shared/theme/verification/C1-DEFAULTS.md\`。\n\n| 字段 | 原表达式 | 原值 | 新默认值 | 一致 |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n${rows.length} 个叶子，${failures.length} 个差异。\n`
  if (output) writeFileSync(path.resolve(repo, output), markdown)
  if (failures.length) throw new Error(failures.join("\n"))
  process.stdout.write(`${rows.length} source default leaves checked: 0 differences\n`)
} finally {
  rmSync(snapshot, { recursive: true, force: true })
}
