interface MutationCase {
  file: string
  testFile: string
  testName: string
  replacements: [string, string][]
}

export const mutationCases: Record<string, MutationCase> = {
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
    file: "WaveformPreview.tsx",
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
}

const id = process.env.LANE_MUTATION
if (id) {
  const selected = mutationCases[id]
  if (!selected) throw new Error(`Unknown lane mutation: ${id}`)
  Bun.plugin({
    name: "lane-mutation",
    setup(build) {
      build.onLoad(
        { filter: new RegExp(`/arrangement/lane/${selected.file.replaceAll(".", "\\.")}$`) },
        async args => {
          let contents = await Bun.file(args.path).text()
          for (const [from, to] of selected.replacements) {
            const first = contents.indexOf(from)
            if (first === -1 || contents.indexOf(from, first + from.length) >= 0)
              throw new Error(`Mutation target drift: ${id}`)
            contents = contents.replace(from, () => to)
          }
          process.stderr.write(`[lane-mutation] applied ${id}\n`)
          return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" }
        }
      )
    },
  })
}
