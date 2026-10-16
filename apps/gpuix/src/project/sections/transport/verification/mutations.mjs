import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const file = "src/project/sections/transport/PerformanceStatus/index.tsx"
const test = "src/project/sections/transport/PerformanceStatus/localization.test.tsx"
const original = readFileSync(file, "utf8")
const from = "labels.enginePhases[phase]"
if (!original.includes(from)) throw new Error("SEC-05 mutation anchor missing")
execFileSync(process.execPath, ["test", test], { stdio: "pipe" })
let killed = false
try {
  writeFileSync(file, original.replace(from, "phase"))
  try {
    execFileSync(process.execPath, ["test", test], { stdio: "pipe" })
  } catch (error) {
    if (!error.stderr?.toString().includes("1 fail")) throw error
    killed = true
    console.log("KILLED SEC-05 restore untranslated backend phase: 1 failing")
  }
} finally {
  writeFileSync(file, original)
}
if (!killed) throw new Error("SEC-05 mutation survived")
