// Starts a ZoeyDAW window for scripts/perf/vs-live/run.py and prints its pid and the screen
// coordinates of the Browser|Arrangement divider and the arrangement body, then keeps it open
// until stdin closes. Pass --production to run with NODE_ENV=production.
/* eslint-disable no-await-in-loop -- waits for the first painted frame */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { launch } from "../../../vendor/gpuix/packages/native/js/automation/client.ts"

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
interface TreeNode {
  testId?: string
  bounds?: Bounds
  children?: TreeNode[]
}

const root = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const production = process.argv.includes("--production")
const app = await launch({
  command: "bun",
  args: ["src/main.tsx"],
  cwd: path.join(root, "apps/gpuix"),
  env: production ? { NODE_ENV: "production" } : {},
})
const find = (node: TreeNode | null | undefined, id: string): Bounds | undefined => {
  if (!node) return undefined
  if (node.testId === id && node.bounds) return node.bounds
  for (const child of node.children ?? []) {
    const hit = find(child, id)
    if (hit) return hit
  }
  return undefined
}
let divider: Bounds | undefined
let body: Bounds | undefined
for (let i = 0; i < 100 && !(divider && body); i++) {
  await Bun.sleep(200)
  const { tree } = await app.call("getTree", {})
  divider = find(tree as TreeNode, "project-workspace-border-divider-left")
  body = find(tree as TreeNode, "timeline-viewport")
}
// The automation child is `bun src/main.tsx`; report the process that owns the window.
const ps = Bun.spawnSync([
  "powershell",
  "-NoProfile",
  "-Command",
  "Get-CimInstance Win32_Process -Filter \"Name='bun.exe'\" | Where-Object { $_.CommandLine -like '*src/main.tsx*' -and $_.CommandLine -notlike '*--hot*' } | Sort-Object CreationDate -Descending | Select-Object -First 1 -ExpandProperty ProcessId",
])
const pid = Number(ps.stdout.toString().trim())
// run.py resets before a scenario and reads after it: GET /reset, GET /stats.
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === "/reset") return Response.json(await app.call("resetFrameStats", {}))
    if (pathname === "/stats") return Response.json(await app.call("getFrameStats", {}))
    return new Response("not found", { status: 404 })
  },
})
console.log(JSON.stringify({ pid, divider, body, statsPort: server.port }))
process.stdin.resume()
process.stdin.on("end", async () => {
  await app.close()
  process.exit(0)
})
