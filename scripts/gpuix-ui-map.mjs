import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { gitExecutable } from "./gpuix-main/paths.mjs"

const root = path.resolve(import.meta.dirname, "..")
const src = path.join(root, "apps/gpuix/src")
const output = path.join(root, "docs/architecture/gpuix-ui-map.md")

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : files(full)
    return /\.tsx?$/u.test(entry.name) ? [full] : []
  })
}

const isTestCode = file => /\.test\.|test-helper|\/testing\//u.test(file)
const isHarness = file =>
  /(^|\/)(demo|verification)\//u.test(file) || /(^|\/)demo\.tsx$/u.test(file)
const staged = process.argv.includes("--stage") && !process.argv.includes("--check")
const sourcePaths = (
  staged
    ? execFileSync(gitExecutable(), ["ls-files", "-z", "--cached", "--", "apps/gpuix/src"], {
        cwd: root,
        encoding: "utf8",
      })
        .split("\0")
        .filter(Boolean)
    : files(src).map(file => path.relative(root, file).split(path.sep).join("/"))
).filter(file => /\.tsx?$/u.test(file) && !isTestCode(file))
const indexedSources = new Map()
if (staged) {
  const batch = execFileSync(gitExecutable(), ["cat-file", "--batch", "-z"], {
    cwd: root,
    input: sourcePaths.map(file => `:${file}\0`).join(""),
    maxBuffer: 64 * 1024 * 1024,
  })
  let offset = 0
  for (const file of sourcePaths) {
    const end = batch.indexOf(10, offset)
    const header = batch
      .subarray(offset, end)
      .toString("utf8")
      .match(/^[a-f\d]+ blob (\d+)$/u)
    if (!header) throw new Error(`Cannot read staged source: ${file}`)
    const size = Number(header[1])
    indexedSources.set(file, batch.subarray(end + 1, end + 1 + size).toString("utf8"))
    offset = end + size + 2
  }
}
const readSource = file =>
  staged ? indexedSources.get(file) : readFileSync(path.join(root, file), "utf8")
const sources = sourcePaths
  .map(file => ({
    file: path.relative(src, path.join(root, file)).split(path.sep).join("/"),
    text: readSource(file),
  }))
  .sort((a, b) => a.file.localeCompare(b.file))

const entries = sources
  .filter(
    ({ text }) =>
      /from "@gpuix\/react"/u.test(text) && /render\(\s*</u.test(text) && /title:/u.test(text)
  )
  .map(({ file, text }) => ({
    file,
    env: [...new Set([...text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/gu)].map(m => m[1]))]
      .filter(name => name !== "GPUIX_BACKGROUND")
      .sort((a, b) => a.localeCompare(b)),
    background: /LAUNCH_FOCUS|GPUIX_BACKGROUND/u.test(text),
  }))

const routeText = readSource("apps/gpuix/src/app/router/route.ts")
const routes = [...new Set([...routeText.matchAll(/kind: "([a-z-]+)"/gu)].map(m => m[1]))]

function area(file) {
  const parts = file.split("/")
  if (parts[0] === "project" && parts[1] === "sections")
    return parts.slice(0, parts[2] === "arrangement" ? 4 : 3).join("/")
  return parts.slice(0, 2).join("/")
}

const testIds = new Map()
for (const { file, text } of sources.filter(({ file }) => !isHarness(file))) {
  for (const match of text.matchAll(
    /testId=(?:"([^"]+)"|\{`([^`$]*)\$\{(?:[^?}]+\?\s*"([^"]+)"\s*:\s*"([^"]+)"\}([^`$]*)\$\{)?)/gu
  )) {
    const prefix = match[1] ?? match[2]
    const ids = match[3]
      ? [`${prefix}${match[3]}${match[5]}…`, `${prefix}${match[4]}${match[5]}…`]
      : prefix
        ? [match[1] ?? `${prefix}…`]
        : []
    if (ids.length === 0) continue
    const key = area(file)
    if (!testIds.has(key)) testIds.set(key, new Set())
    for (const id of ids) testIds.get(key).add(id)
  }
}
const testIdCount = [...testIds.values()].reduce((count, set) => count + set.size, 0)

const content = [
  "# gpuix UI 地图",
  "",
  "由 `node scripts/gpuix-ui-map.mjs` 从 `apps/gpuix/src` 生成，不要手改；`--check` 在地图过期时失败（`pnpm verify:gpuix` 会运行它）。用途：自动化与验收时查入口、环境开关和稳定 `testId`。",
  "",
  "## 路由",
  "",
  ...routes.map(kind => `- \`${kind}\``),
  "",
  "主应用入口用 `ZOEYDAW_ROUTE`（例如 `/project/<id>`）指定初始路由。",
  "",
  "## 窗口入口",
  "",
  "在 `apps/gpuix` 下运行 `bun --hot <入口>`。「后台启动」为「是」的入口支持 `GPUIX_BACKGROUND=1`（不抢焦点，见 `docs/agents/setup.md`）。",
  "",
  "| 入口 | 后台启动 | 环境开关 |",
  "| --- | --- | --- |",
  ...entries.map(
    entry =>
      `| \`src/${entry.file}\` | ${entry.background ? "是" : "否"} | ${entry.env.map(name => `\`${name}\``).join("、") || "—"} |`
  ),
  "",
  "## 稳定 testId（按所属区域）",
  "",
  "以 `…` 结尾的是模板 id，后半段在运行时拼接（通常是实体 id 或序号）。demo 与 verification 夹具的 id 不列入。",
  "",
  ...[...testIds.keys()]
    .sort((a, b) => a.localeCompare(b))
    .flatMap(key => [
      `### \`${key}\``,
      "",
      [...testIds.get(key)]
        .sort((a, b) => a.localeCompare(b))
        .map(id => `\`${id}\``)
        .join("、"),
      "",
    ]),
  "## 已知限制",
  "",
  "- 后台窗口截图可能全黑；AX 输入可能报 `BackgroundUnavailable`。遇到时把对应项标为未验证，不切前台。真实桌面验收另行串行进行。",
  "- held pressed 无法在真实窗口中保持 mouseDown 截图，由原生状态测试覆盖。",
  "",
].join("\n")

if (process.argv.includes("--check")) {
  let current = ""
  try {
    current = readFileSync(output, "utf8")
  } catch {}
  if (current !== content) {
    process.stderr.write(
      "docs/architecture/gpuix-ui-map.md is stale; run node scripts/gpuix-ui-map.mjs\n"
    )
    process.exit(1)
  }
  process.stdout.write(
    `ui map current: ${entries.length} entries, ${routes.length} routes, ${testIdCount} testIds\n`
  )
} else {
  if (staged) {
    const file = path.relative(root, output).split(path.sep).join("/")
    let workingMap
    let indexedMap
    try {
      workingMap = readFileSync(output, "utf8")
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    const indexed = execFileSync(gitExecutable(), ["ls-files", "--", file], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    if (indexed.trim())
      indexedMap = execFileSync(gitExecutable(), ["show", `:${file}`], {
        cwd: root,
        encoding: "utf8",
      })
    const hash = execFileSync(gitExecutable(), ["hash-object", "-w", "--stdin"], {
      cwd: root,
      input: content,
      encoding: "utf8",
    }).trim()
    execFileSync(
      gitExecutable(),
      ["update-index", "--add", "--cacheinfo", `100644,${hash},${file}`],
      { cwd: root }
    )
    if (workingMap === indexedMap) writeFileSync(output, content)
  } else {
    writeFileSync(output, content)
  }
  process.stdout.write(
    `wrote ${path.relative(root, output).split(path.sep).join("/")}: ${entries.length} entries, ${testIdCount} testIds\n`
  )
}
