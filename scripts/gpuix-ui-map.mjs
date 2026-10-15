// Generates docs/architecture/gpuix-ui-map.md from apps/gpuix/src so the map cannot drift from code.
// Usage: node scripts/gpuix-ui-map.mjs          (rewrite the map)
//        node scripts/gpuix-ui-map.mjs --check  (exit 1 when the committed map is stale)
//        node scripts/gpuix-ui-map.mjs --stage  (rewrite and git add; run by lint-staged on gpuix source)
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

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
// Demo and verification harnesses are not product surfaces; their testIds stay out of the map.
const isHarness = file =>
  /(^|\/)(demo|verification)\//u.test(file) || /(^|\/)demo\.tsx$/u.test(file)
const sources = files(src)
  .filter(file => !isTestCode(file))
  .map(file => ({ file: path.relative(src, file), text: readFileSync(file, "utf8") }))
  .sort((a, b) => a.file.localeCompare(b.file))

// A window entry calls gpuix render(<element>, { title, ... }) with a title option.
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

const routeText = readFileSync(path.join(src, "app/router/route.ts"), "utf8")
const routes = [...new Set([...routeText.matchAll(/kind: "([a-z-]+)"/gu)].map(m => m[1]))]

function area(file) {
  const parts = file.split("/")
  if (parts[0] === "project" && parts[1] === "sections")
    return parts.slice(0, parts[2] === "arrangement" ? 4 : 3).join("/")
  return parts.slice(0, 2).join("/")
}

// Static testIds grouped by owning area; template ids keep their literal prefix and mark the dynamic tail.
const testIds = new Map()
for (const { file, text } of sources.filter(({ file }) => !isHarness(file))) {
  for (const match of text.matchAll(/testId=(?:"([^"]+)"|\{`([^`$]*)\$\{)/gu)) {
    const prefix = match[1] ?? match[2]
    if (!prefix) continue
    const id = match[1] ?? `${prefix}…`
    const key = area(file)
    if (!testIds.has(key)) testIds.set(key, new Set())
    testIds.get(key).add(id)
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
  writeFileSync(output, content)
  // --stage (pre-commit via lint-staged): fold the regenerated map into the commit being made,
  // so a testId change can never land with a stale map.
  if (process.argv.includes("--stage"))
    execFileSync("/usr/bin/git", ["add", path.relative(root, output)], { cwd: root })
  process.stdout.write(
    `wrote ${path.relative(root, output)}: ${entries.length} entries, ${testIdCount} testIds\n`
  )
}
