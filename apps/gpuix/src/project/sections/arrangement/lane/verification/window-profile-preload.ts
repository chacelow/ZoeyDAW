import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const raw = process.env.LANE_WINDOW_PROFILE_DEADLINE
const deadline = raw?.endsWith("Z") ? Date.parse(raw) : Number.NaN
if (!Number.isFinite(deadline) || deadline <= Date.now())
  throw new Error("Window profile requires a future absolute UTC deadline before startup")
if (process.env.GPUIX_BACKGROUND !== "1" || process.env.LANE_STRESS !== "1")
  throw new Error("Window profile requires background mode and the complete200x50 workload")
const configuredOutput = process.env.LANE_WINDOW_PROFILE_OUTPUT
if (!configuredOutput) throw new Error("Window profile requires an explicit output file")
const output = path.resolve(configuredOutput)
mkdirSync(path.dirname(output), { recursive: true })
process.env.LANE_WINDOW_PROFILE_OUTPUT = output
writeFileSync(
  output,
  `${JSON.stringify({ event: "lane-window-profile", phase: "preload-ready", output, cwd: process.cwd(), pid: process.pid, deadline: raw, records: [] }, null, 2)}\n`
)
process.stdout.write(`window-profile-output=${output}\n`)

Bun.plugin({
  name: "lane-real-window-profile-entry",
  setup(build) {
    const target = path.resolve(import.meta.dir, "../demo/index.tsx")
    const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
    build.onLoad({ filter }, async args => {
      let contents = await Bun.file(args.path).text()
      const marker = "    return createAnimationFrameSource(renderer)\n  }, [renderer])"
      if (contents.split(marker).length !== 2)
        throw new Error("Window profile entry instrumentation drift")
      contents =
        'import { useWindowProfile } from "../verification/window-profile"\n' +
        contents.replace(marker, () => `${marker}\n  useWindowProfile(renderer, source, runtime)`)
      return { contents, loader: "tsx" }
    })
  },
})
