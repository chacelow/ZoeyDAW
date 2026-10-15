import { writeFileSync } from "node:fs"
import path from "node:path"

process.env.LANE_REACT_PROFILE = "1"

const measureLogPath = process.env.LANE_MEASURE_LOG
if (measureLogPath) {
  const measurements = new Map<
    string,
    { calls: number; ms: number; maxMs: number; properties: number }
  >()
  const measure = performance.measure.bind(performance)
  performance.measure = (...args: Parameters<typeof performance.measure>) => {
    const before = performance.now()
    try {
      return measure(...args)
    } finally {
      const elapsed = performance.now() - before
      let properties = 0
      const options: unknown = args[1]
      if (options && typeof options === "object" && "detail" in options) {
        const detail = options.detail
        if (detail && typeof detail === "object" && "devtools" in detail) {
          const devtools = detail.devtools
          if (
            devtools &&
            typeof devtools === "object" &&
            "properties" in devtools &&
            Array.isArray(devtools.properties)
          )
            properties = devtools.properties.length
        }
      }
      const entry = measurements.get(args[0]) ?? { calls: 0, ms: 0, maxMs: 0, properties: 0 }
      entry.calls++
      entry.ms += elapsed
      entry.maxMs = Math.max(entry.maxMs, elapsed)
      entry.properties += properties
      measurements.set(args[0], entry)
    }
  }
  process.once("exit", () =>
    writeFileSync(measureLogPath, `${JSON.stringify(Object.fromEntries(measurements), null, 2)}\n`)
  )
}

const probes = [
  {
    file: "LaneRow/index.tsx",
    imports: 'import { recordRowRender } from "../verification/profile-counters"\n',
    replacements: [
      [
        "  const { renderer } = useGpuix()",
        "  recordRowRender(row.track.id)\n  const { renderer } = useGpuix()",
      ],
    ],
  },
  {
    file: "ClipCard.tsx",
    imports:
      'import { useLayoutEffect } from "react"\nimport { recordClipRender, recordClipInputs, recordClipMount, recordClipUnmount } from "./verification/profile-counters"\n',
    replacements: [
      [
        "  const theme = useTheme()",
        "  recordClipRender(card.clip.id)\n  recordClipInputs(card.clip.id, { card, content: card.content, clip: card.clip, geometry: card.geometry, grid: card.grid, fadeGeometry: card.fadeGeometry, left: card.geometry.left, top: card.geometry.top, width: card.geometry.width, height: card.geometry.height, selected: card.selected, hovered: card.hovered, ghost: card.ghost, trackColor, viewportWidth, numerator, automationMode, readPeaks, onActivate })\n  useLayoutEffect(() => { recordClipMount(card.clip.id); return () => recordClipUnmount(card.clip.id) }, [])\n  const theme = useTheme()",
      ],
    ],
  },
  {
    file: "ClipContents.tsx",
    imports: 'import { recordClipContentRender } from "./verification/profile-counters"\n',
    replacements: [
      [
        "  const theme = useTheme()",
        "  recordClipContentRender(card.clip.id)\n  const theme = useTheme()",
      ],
    ],
  },
  {
    file: "WaveformPreview.tsx",
    imports: 'import { profilePeakRead } from "./verification/profile-counters"\n',
    replacements: [
      [
        "? readPeaks(sourceId, startBar, endBar, pixels, contentOffsetBars)",
        "? profilePeakRead(id, readPeaks, sourceId, startBar, endBar, pixels, contentOffsetBars)",
      ],
    ],
  },
  {
    file: "LaneRow/Contents.tsx",
    imports: 'import { measureProjection } from "../verification/frame-phases"\n',
    replacements: [
      [
        "const { lines: grid, regions } = projectGrid(scene)",
        "const { lines: grid, regions } = measureProjection(() => projectGrid(scene))",
      ],
      [
        "const cards = projectCards(scene, localRow, automationMode)",
        "const cards = measureProjection(() => projectCards(scene, localRow, automationMode))",
      ],
    ],
  },
]

Bun.plugin({
  name: "lane-render-profile",
  setup(build) {
    for (const probe of probes) {
      const target = path.resolve(import.meta.dir, "..", probe.file)
      const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
      build.onLoad({ filter }, async args => {
        let contents = await Bun.file(args.path).text()
        for (const replacement of probe.replacements) {
          const [from, to] = replacement
          if (from === undefined || to === undefined)
            throw new Error("Invalid profiling replacement")
          const first = contents.indexOf(from)
          if (first === -1 || contents.indexOf(from, first + from.length) >= 0)
            throw new Error(`Render profile target drift: ${probe.file}`)
          contents = contents.replace(from, () => to)
        }
        return { contents: probe.imports + contents, loader: "tsx" }
      })
    }
  },
})
