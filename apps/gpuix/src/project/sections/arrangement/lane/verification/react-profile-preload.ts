import path from "node:path"

process.env.LANE_REACT_PROFILE = "1"

const probes = [
  {
    file: "LaneRow/index.tsx",
    imports: 'import { recordRowRender } from "../verification/profile-counters"\n',
    from: "  const { renderer } = useGpuix()",
    to: "  recordRowRender(row.track.id)\n  const { renderer } = useGpuix()",
  },
  {
    file: "ClipCard.tsx",
    imports: 'import { recordClipRender } from "./verification/profile-counters"\n',
    from: "  const theme = useTheme()",
    to: "  recordClipRender(track.id, card.clip.id)\n  const theme = useTheme()",
  },
  {
    file: "WaveformPreview.tsx",
    imports: 'import { profilePeakRead } from "./verification/profile-counters"\n',
    from: "? readPeaks(sourceId, startBar, endBar, pixels, contentOffsetBars)",
    to: "? profilePeakRead(id, readPeaks, sourceId, startBar, endBar, pixels, contentOffsetBars)",
  },
]

Bun.plugin({
  name: "lane-render-profile",
  setup(build) {
    for (const probe of probes) {
      const target = path.resolve(import.meta.dir, "..", probe.file)
      const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
      build.onLoad({ filter }, async args => {
        const source = await Bun.file(args.path).text()
        const first = source.indexOf(probe.from)
        if (first === -1 || source.indexOf(probe.from, first + probe.from.length) >= 0)
          throw new Error(`Render profile target drift: ${probe.file}`)
        return {
          contents: probe.imports + source.replace(probe.from, () => probe.to),
          loader: "tsx",
        }
      })
    }
  },
})
