import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const [mode, bindingPath, ack] = process.argv.slice(2)
if (mode !== "listen" || !bindingPath) {
  throw new Error("Usage: node runtime.mjs listen <binding.json> [processed-delivery-id]")
}
const binding = JSON.parse(readFileSync(bindingPath, "utf8").replace(/^\uFEFF/, ""))
if (
  typeof binding.executable !== "string" ||
  !/^run_[a-z0-9_]+$/.test(binding.runId) ||
  !/^term_[a-z0-9-]+$/.test(binding.coordinator) ||
  !Number.isSafeInteger(binding.intervalMs) ||
  binding.intervalMs <= 0
) {
  throw new Error("Binding requires executable, runId, coordinator and a positive intervalMs")
}

const result = spawnSync(
  binding.executable,
  [
    "orchestration",
    "check",
    "--run",
    binding.runId,
    "--terminal",
    binding.coordinator,
    "--wait",
    "--timeout-ms",
    String(binding.intervalMs),
    "--types",
    "worker_done,merge_ready,escalation,question,status",
    ...(ack ? ["--ack", ack] : []),
    "--json",
  ],
  { stdio: "inherit", timeout: binding.intervalMs + 60000 }
)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
