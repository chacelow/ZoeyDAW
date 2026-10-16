/* eslint-disable no-await-in-loop -- Bounded observations of the independent native UI thread. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sleep, spawn } from "bun"

const [directory, driverArgument, mutation] = process.argv.slice(2)
if (
  process.platform !== "win32" ||
  !directory ||
  !driverArgument ||
  (mutation !== undefined && mutation !== "--duplicate-action")
)
  throw new Error(
    "Usage: bun windows-caption.mjs <evidence-directory> <compiled-driver> [--duplicate-action]"
  )
const output = path.resolve(directory)
const driver = path.resolve(driverArgument)
const app = path.resolve(import.meta.dirname, "../../../..")
mkdirSync(output, { recursive: true })
const snapshotFile = path.join(output, "live-main.json")
rmSync(snapshotFile, { force: true })
const env = {
  ...process.env,
  GPUIX_BACKGROUND: "1",
  NODE_ENV: "production",
  T2_MUTATE_WINDOWS_CALLBACK: mutation === "--duplicate-action" ? "1" : "0",
}
delete env.GPUI_DISABLE_DIRECT_COMPOSITION
const transcript = { logs: "" }
const main = spawn(
  [
    process.execPath,
    "--hot",
    "--preload",
    path.join(import.meta.dirname, "windows-caption-preload.ts"),
    path.join(app, "src/main.tsx"),
    output,
  ],
  { cwd: app, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" }
)
async function collect(stream) {
  const decoder = new TextDecoder()
  for await (const chunk of stream) transcript.logs += decoder.decode(chunk, { stream: true })
  transcript.logs += decoder.decode()
}
const captures = [collect(main.stdout), collect(main.stderr)]
async function until(description, ready) {
  const deadline = performance.now() + 20_000
  while (!(await ready())) {
    if (main.exitCode !== null) throw new Error(`Main exited: ${main.exitCode}\n${transcript.logs}`)
    assert.ok(performance.now() < deadline, `Timed out: ${description}\n${transcript.logs}`)
    await sleep(20)
  }
}
async function snapshot(command = "snapshot") {
  const previous = transcript.logs.split("T2_SNAPSHOT_READY").length
  main.stdin.write(`${command}\n`)
  main.stdin.flush()
  await until(
    "completed live renderer snapshot",
    () => transcript.logs.split("T2_SNAPSHOT_READY").length > previous
  )
  return JSON.parse(readFileSync(snapshotFile, "utf8"))
}
function find(node, testId) {
  if (node.testId === testId) return node
  for (const child of node.children ?? []) {
    const match = find(child, testId)
    if (match) return match
  }
  return null
}
function bounds(tree, testId) {
  const node = find(tree, testId)
  assert.ok(node?.bounds, `${testId} has no real painted bounds`)
  assert.ok(node.bounds.width > 0 && node.bounds.height > 0)
  return node.bounds
}
function drive(pid, action, point) {
  return JSON.parse(
    execFileSync(driver, [String(pid), action, ...(point ? point.map(String) : [])], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    })
  )
}
let evidence
try {
  await until("main mount", () => transcript.logs.includes("mount complete"))
  let before
  await until("painted titlebar", async () => {
    before = await snapshot()
    return !!find(JSON.parse(before.tree), "titlebar-settings")?.bounds
  })
  const tree = JSON.parse(before.tree)
  const titlebar = bounds(tree, "titlebar")
  const title = bounds(tree, "titlebar-title")
  const settings = bounds(tree, "titlebar-settings")
  const initial = drive(before.pid, "query")
  const scale = initial.dpi / 96
  const points = {
    blank: [titlebar.x + titlebar.width / 4, titlebar.y + titlebar.height / 2],
    title: [title.x + title.width / 2, title.y + title.height / 2],
    settings: [settings.x + settings.width / 2, settings.y + settings.height / 2],
    leftBorder: [
      (initial.bounds.left - initial.clientOrigin.x) / (2 * scale),
      titlebar.y + titlebar.height * 3,
    ],
  }
  const hits = Object.fromEntries(
    Object.entries(points).map(([name, point]) => [name, drive(before.pid, "hit", point)])
  )
  evidence = {
    platform: "win32",
    duplicateActionMutation: mutation === "--duplicate-action",
    before,
    points,
    hits,
  }
  writeFileSync(path.join(output, "native-caption.json"), JSON.stringify(evidence, null, 2))
  assert.equal(hits.blank.hitTest, 2, "Blank titlebar must be HTCAPTION")
  assert.equal(hits.title.hitTest, 2, "Centered title must be HTCAPTION")
  assert.equal(hits.settings.hitTest, 1, "Settings must be HTCLIENT")
  assert.equal(hits.leftBorder.hitTest, 10, "Resize edge must remain HTLEFT")
  assert.equal(initial.isZoomed, false)
  const armed = await snapshot("arm")
  await until("native observer painted", async () => {
    const painted = await snapshot()
    return painted.stats.frames > armed.stats.frames
  })
  const completed = transcript.logs.split("T2_NATIVE_EVENT_COMPLETED").length
  const maximize = drive(before.pid, "double", points.blank)
  await until(
    "first native double-click processed by JS",
    () => transcript.logs.split("T2_NATIVE_EVENT_COMPLETED").length >= completed + 2
  )
  const afterMaximize = await snapshot()
  const actualMaximize = drive(before.pid, "query")
  evidence = { ...evidence, initial, maximize, actualMaximize, after: afterMaximize }
  writeFileSync(path.join(output, "native-caption.json"), JSON.stringify(evidence, null, 2))
  assert.deepEqual(afterMaximize.nativeClickCounts, [1, 2])
  assert.equal(afterMaximize.systemActions, 0, "The JS system-action API must not also run")
  assert.equal(
    actualMaximize.isZoomed,
    true,
    "One processed double-click must maximize exactly once"
  )
  const restore = drive(before.pid, "double", points.blank)
  await until(
    "second native double-click processed by JS",
    () => transcript.logs.split("T2_NATIVE_EVENT_COMPLETED").length >= completed + 4
  )
  const after = await snapshot()
  const actualRestore = drive(before.pid, "query")
  assert.deepEqual(after.nativeClickCounts, [1, 2, 1, 2])
  assert.equal(after.systemActions, 0, "The JS system-action API must not also run")
  assert.equal(
    actualRestore.isZoomed,
    false,
    "Second processed double-click must restore exactly once"
  )
  assert.equal(after.directCompositionDisabled, false)
  evidence = { ...evidence, restore, actualRestore, after }
  writeFileSync(path.join(output, "native-caption.json"), JSON.stringify(evidence, null, 2))
  console.log(
    "T2_CAPTION_PROBE_COMPLETE: HTCAPTION/HTCAPTION/HTCLIENT/HTLEFT; false -> true -> false; JS actions=0"
  )
} finally {
  main.kill()
  await main.exited
  await Promise.all(captures)
  writeFileSync(path.join(output, "live-main.log"), transcript.logs)
}
