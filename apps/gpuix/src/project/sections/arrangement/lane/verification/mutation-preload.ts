import path from "node:path"

interface MutationCase {
  file: string
  testFile: string
  testName: string
  replacements: [string, string][]
}

export const mutationCases: Record<string, MutationCase> = {
  "epoch-clip-transients": {
    file: "interactions/controller.ts",
    testFile: "interactions/controller.test.tsx",
    testName: "clears stale move ink after hydrate without editing the replacement project",
    replacements: [
      ["    context.scene.setClipDrag(null)\n    context.scene.setClipResize(null)\n", ""],
    ],
  },
  "invalid-release": {
    file: "interactions/clip/move.ts",
    testFile: "interactions/controller.test.tsx",
    testName: "rejects an invalid release after a valid cross-track preview (copy=%s)",
    replacements: [
      ["cancelled || !valid || plan === null", "cancelled || plan === null"],
      ["cancelled || !valid || !plan", "cancelled || !plan"],
    ],
  },
  "global-content-position": {
    file: "clip-card-projection.ts",
    testFile: "LaneRow/LaneRow.test.tsx",
    testName: "moves a fully visible Clip without reuploading or remounting its unchanged content",
    replacements: [
      ["viewportWidth: visibleWidth", "viewportWidth: scene.viewport.width"],
      ["left: geometry.left - visibleLeft", "left: geometry.left"],
      ["x: line.x - visibleLeft", "x: line.x"],
    ],
  },
  "local-content-identity": {
    file: "clip-card-projection.ts",
    testFile: "LaneRow/LaneRow.test.tsx",
    testName: "moves a fully visible Clip without reuploading or remounting its unchanged content",
    replacements: [["oldContent.clip === rect.clip", "false && oldContent.clip === rect.clip"]],
  },
  "probe-channel-offset": {
    file: "../../../../shared/waveform/PeakColumns.tsx",
    testFile: "native-waveform.test.tsx",
    testName: "native probe fixture retains stereo envelopes and lane clip ink in dark",
    replacements: [
      [
        "const channel = Math.floor(index / pixels)",
        "const channel = channels - 1 - Math.floor(index / pixels)",
      ],
    ],
  },
  "probe-waveform-ink": {
    file: "ClipContents.tsx",
    testFile: "native-waveform.test.tsx",
    testName: "native probe fixture retains stereo envelopes and lane clip ink in dark",
    replacements: [["color={ink}", "color={color}"]],
  },
  "source-waveform-pixels": {
    file: "../../../../shared/waveform/PeakColumns.tsx",
    testFile: "../../clip-edit/audio/SourceWaveform-runtime.test.tsx",
    testName: "stable peak reader follows native session opening, tempo, meter, and reopening",
    replacements: [
      [
        "Math.min(1, peaks[index * 2] ?? 0)",
        "(pixel === 16 ? 0 : Math.min(1, peaks[index * 2] ?? 0))",
      ],
      [
        "Math.min(1, peaks[index * 2 + 1] ?? 0)",
        "(pixel === 16 ? 0 : Math.min(1, peaks[index * 2 + 1] ?? 0))",
      ],
    ],
  },
  "grid-phase": {
    file: "clip-card-projection.ts",
    testFile: "render-projection.test.ts",
    testName:
      "keeps Clip-local grids phase-aligned across fractional viewports and vertical-only motion",
    replacements: [["geometry.left - 1", "geometry.left"]],
  },
  "grid-bounds": {
    file: "clip-card-projection.ts",
    testFile: "render-projection.test.ts",
    testName:
      "keeps Clip-local grids phase-aligned across fractional viewports and vertical-only motion",
    replacements: [["geometry.left - 1", "0"]],
  },
  "offscreen-mount": {
    file: "render-projection.ts",
    testFile: "render-projection.test.ts",
    testName: "culls every non-intersecting row and clip through randomized viewport transforms",
    replacements: [
      [
        "if (rect.left + rect.width <= 0 || rect.left >= width) continue",
        "if (false && (rect.left + rect.width <= 0 || rect.left >= width)) continue",
      ],
      [
        "if (geometry.left + geometry.width <= 0 || geometry.left >= width) continue",
        "if (false && (geometry.left + geometry.width <= 0 || geometry.left >= width)) continue",
      ],
    ],
  },
  "midi-source-phase": {
    file: "render-projection.ts",
    testFile: "render-projection.test.ts",
    testName: "retains MIDI source phase after trimming and across equivalent loop windows",
    replacements: [
      ["const sourceStart = (clip.sourceOffsetBars ?? 0) * numerator", "const sourceStart = 0"],
    ],
  },
  "stereo-packing": {
    file: "../../../../shared/waveform/PeakColumns.tsx",
    testFile: "WaveformPreview.test.tsx",
    testName: "preserves channel-major stereo envelopes without interleaving their pixels",
    replacements: [
      ["const pixel = index % pixels", "const pixel = Math.floor(index / channels)"],
      ["const channel = Math.floor(index / pixels)", "const channel = index % channels"],
    ],
  },
  "collapsed-mask": {
    file: "ClipFades/index.tsx",
    testFile: "interactions/controller.test.tsx",
    testName: "moves the fade mask between title and body across collapse transitions",
    replacements: [
      [
        "const top = geometry.bodyHeight ? geometry.bodyTop : geometry.top",
        "const top = geometry.bodyTop",
      ],
    ],
  },
  "card-identity": {
    file: "clip-card-projection.ts",
    testFile: "LaneRow/LaneRow.test.tsx",
    testName: "scrolls an already-visible unchanged Clip without rerendering its content",
    replacements: [["return previous.card", "return { ...previous.card }"]],
  },
  "context-target": {
    file: "ContextMenu/index.tsx",
    testFile: "interactions/controller.test.tsx",
    testName: "applies the native right click menu to its Clip rather than the previous selection",
    replacements: [
      [
        "onContextMenu={event => setTarget(resolveTarget(event))}",
        "onMouseDown={event => { if (event.button === 2 || event.isRightClick || event.modifiers?.ctrl) setTarget(resolveTarget(event)) }}",
      ],
    ],
  },
  "resume-position": {
    file: "LaneOverlay/index.tsx",
    testFile: "LaneRow/LaneRow.test.tsx",
    testName:
      "presents the latest playhead on resume and releases frame leases when stopped or unmounted",
    replacements: [
      [
        "  useResumeFrame(() => {\n    flushSync(() => setPosition(transportBar()))\n  }, scene.playback.playing)\n",
        "",
      ],
    ],
  },
  "resume-flush": {
    file: "LaneOverlay/index.tsx",
    testFile: "LaneRow/LaneRow.test.tsx",
    testName:
      "presents the latest playhead on resume and releases frame leases when stopped or unmounted",
    replacements: [["flushSync(() => setPosition(transportBar()))", "setPosition(transportBar())"]],
  },
  "resume-active": {
    file: "LaneOverlay/index.tsx",
    testFile: "LaneRow/LaneRow.test.tsx",
    testName:
      "presents the latest playhead on resume and releases frame leases when stopped or unmounted",
    replacements: [
      [
        "  useResumeFrame(() => {\n    flushSync(() => setPosition(transportBar()))\n  }, scene.playback.playing)",
        "  useResumeFrame(() => {\n    flushSync(() => setPosition(transportBar()))\n  }, true)",
      ],
    ],
  },
}

const id = process.env.LANE_MUTATION
if (id) {
  const selected = mutationCases[id]
  if (!selected) throw new Error(`Unknown lane mutation: ${id}`)
  const target = path.resolve(import.meta.dir, "..", selected.file)
  const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  Bun.plugin({
    name: "lane-mutation",
    setup(build) {
      build.onLoad({ filter }, async args => {
        let contents = await Bun.file(args.path).text()
        for (const [from, to] of selected.replacements) {
          const first = contents.indexOf(from)
          if (first === -1 || contents.indexOf(from, first + from.length) >= 0)
            throw new Error(`Mutation target drift: ${id}`)
          contents = contents.replace(from, () => to)
        }
        process.stderr.write(`[lane-mutation] applied ${id}\n`)
        return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" }
      })
    },
  })
}
