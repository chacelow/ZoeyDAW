import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const [mode, bindingPath, ack] = process.argv.slice(2)
if (!["listen", "tick"].includes(mode) || !bindingPath || (ack && mode !== "listen")) {
  throw new Error("Usage: node runtime.mjs <listen|tick> <binding.json> [processed-delivery-id]")
}
const binding = JSON.parse(readFileSync(bindingPath, "utf8").replace(/^\uFEFF/, ""))
if (
  typeof binding.executable !== "string" ||
  !/^run_[a-z0-9_]+$/.test(binding.runId) ||
  !/^term_[a-z0-9-]+$/.test(binding.coordinator) ||
  !Number.isSafeInteger(binding.intervalMs) || binding.intervalMs <= 0
) {
  throw new Error("Binding requires executable, runId, coordinator and a positive intervalMs")
}

function command(args, inherit = false) {
  const result = spawnSync(binding.executable, [...args, "--json"], {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    timeout: binding.intervalMs + 60000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`${args.join(" ")} failed (${result.status}): ${result.stderr}\n${result.stdout}`)
  }
  if (inherit) return
  const receipt = JSON.parse(result.stdout)
  if (!receipt.ok) throw new Error(JSON.stringify(receipt.error))
  return receipt.result
}

function tick() {
  const workers = []
  let cursor
  do {
    const page = command([
      "orchestration", "worker-list", "--run", binding.runId,
      ...(cursor ? ["--cursor", cursor] : []),
    ])
    workers.push(...(page.workers ?? []))
    cursor = page.page?.hasMore ? page.page.nextCursor : null
    if (page.page?.hasMore && !cursor) throw new Error("Worker pagination has no nextCursor")
  } while (cursor)
  const rows = workers.map(worker => ({
    dispatch: worker.dispatchId,
    state: worker.dispatchStatus,
    activity: worker.projection?.stage?.activity ?? "unknown",
    liveness: worker.projection?.liveness?.verdict ?? "unverifiable",
    attention: worker.projection?.attention ?? null,
    nextAction: worker.projection?.nextAction ?? null,
  }))
  console.log(JSON.stringify({ at: new Date().toISOString(), runId: binding.runId, workers: rows }))
  // A stale observation never authorizes worker restart or input.
  return command([
    "terminal", "send", "--terminal", binding.coordinator, "--enter", "--text",
    `PC 五分钟巡检 ${binding.runId}。处理监听已交付的消息，先回复 question，处理后才 ack；核对 idle/stale/error，不能把 unverifiable 当死亡，不重复派发。当前派发 ${JSON.stringify(rows)}。继续推进未完成切片，无事可做时启动唯一 listen。`,
  ])
}

if (mode === "listen") {
  command([
    "orchestration", "check", "--run", binding.runId, "--terminal", binding.coordinator,
    "--wait", "--timeout-ms", String(binding.intervalMs),
    "--types", "worker_done,merge_ready,escalation,question,status",
    ...(ack ? ["--ack", ack] : []),
  ], true)
} else {
  console.log(JSON.stringify(tick()))
}
