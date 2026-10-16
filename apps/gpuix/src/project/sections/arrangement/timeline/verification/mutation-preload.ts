import path from "node:path"

interface MutationCase {
  file: string
  testFile: string
  testName: string
  from: string
  to: string
}

export const mutationCases: Record<string, MutationCase> = {
  "clip-editor-save": {
    file: "project/sections/arrangement/timeline/keyboard/controller.ts",
    testFile: "src/project/sections/arrangement/timeline/r2-composition.test.tsx",
    testName: "real ClipEditor",
    from: 'if (modified && !alt && key === "s")',
    to: 'if (target !== "clip-editor" && modified && !alt && key === "s")',
  },
  "editing-surface-tab-owner": {
    file: "project/sections/arrangement/lane/ClipCard.tsx",
    testFile: "src/project/sections/arrangement/timeline/r2-composition.test.tsx",
    testName: "one stable Tab owner",
    from: "      aria-label={clipLabel(clip)}",
    to: "      aria-label={clipLabel(clip)}\n      tabIndex={0}",
  },
  "lane-focus-cancellation": {
    file: "project/sections/arrangement/lane/useLaneSurface.tsx",
    testFile: "src/project/sections/arrangement/timeline/r2-composition.test.tsx",
    testName: "focus leaving the stable editing surface",
    from: "onBlur: () => controller.interrupt(),",
    to: "",
  },
  "range-preview-overwrite": {
    file: "project/sections/arrangement/core/scene.ts",
    testFile: "src/project/sections/arrangement/lane/interactions/controller.test.tsx",
    testName: "keeps a live time-range preview",
    from: "const visible = scene.timeSelectionPreview ?? committedTimeSelection",
    to: "const visible = committedTimeSelection",
  },
  "range-preview-epoch-cleanup": {
    file: "project/sections/arrangement/lane/interactions/controller.ts",
    testFile: "src/project/sections/arrangement/lane/interactions/controller.test.tsx",
    testName: "clears invalidated time-range preview",
    from: "    context.scene.setTimeSelectionPreview(null)\n",
    to: "",
  },
  "collapsed-group-slot": {
    file: "project/sections/arrangement/tracks/Row/index.tsx",
    testFile: "src/project/sections/arrangement/tracks/Row/group-lane.test.tsx",
    testName: "collapsed group retains lane summary",
    from: "{showLane ? lane : null}",
    to: '{showLane && !(track.kind === "group" && track.collapsed) ? lane : null}',
  },
  "collapsed-group-width": {
    file: "project/sections/arrangement/lane/LaneRow/Contents.tsx",
    testFile: "src/project/sections/arrangement/tracks/Row/group-lane.test.tsx",
    testName: "collapsed group retains lane summary",
    from: "Math.min(scene.viewport.width, card.geometry.left + card.geometry.width)",
    to: "Math.min(scene.viewport.width - theme.project.controlsWidth, card.geometry.left + card.geometry.width)",
  },
  "grid-local-origin": {
    file: "project/sections/arrangement/core/rulers/grid-quads.ts",
    testFile: "src/project/sections/arrangement/core/rulers/grid-quads.test.ts",
    testName: "grid quad packing clips",
    from: "output[offset] = line.x - left",
    to: "output[offset] = line.x",
  },
  "edge-pinned-boundary": {
    file: "project/sections/arrangement/core/viewport/edge-scroll.ts",
    testFile: "src/project/sections/arrangement/core/viewport/edge-scroll.test.ts",
    testName: "edge scrolling respects pinned rows",
    from: " || y >= bottom",
    to: "",
  },
  "menu-space": {
    file: "ui/controls/Menu/trigger.tsx",
    testFile: "src/ui/controls/Menu/interaction.test.tsx",
    testName: "trigger Space reaches window after Escape",
    from: 'key === "enter" ||',
    to: 'key === "space" || key === "enter" ||',
  },
  "nested-context": {
    file: "ui/controls/Menu/trigger.tsx",
    testFile: "src/ui/controls/Menu/pointer.test.tsx",
    testName: "nested numeric pad preserves its value",
    from: "onContextMenu: unavailable",
    to: "onContextMenu: true",
  },
  "wheel-isolation": {
    file: "ui/controls/DragPad/DragPadNumber.tsx",
    testFile: "src/ui/controls/DragPad/DragPadNumber.test.tsx",
    testName: "wheel over a pad changes its consumer without scrolling its ancestor",
    from: 'pointerEvents: "auto",',
    to: 'pointerEvents: "none",',
  },
  "numeric-fill": {
    file: "ui/controls/DragPad/DragPadNumber.tsx",
    testFile: "src/ui/controls/DragPad/variants.test.tsx",
    testName: "uses actual",
    from: "normalized * innerWidth",
    to: "normalized * width",
  },
  "numeric-center": {
    file: "ui/controls/DragPad/DragPadNumber.tsx",
    testFile: "src/ui/controls/DragPad/variants.test.tsx",
    testName: "uses actual",
    from: "left: (innerWidth - 1) / 2,",
    to: "left: (width - 1) / 2,",
  },
  "editor-focus": {
    file: "ui/controls/DragPad/DragPadNumber.tsx",
    testFile: "src/ui/controls/DragPad/DragPadNumber.test.tsx",
    testName: "Space stays inside the numeric editor",
    from: "          autoFocus\n",
    to: "",
  },
  "text-focus-lease": {
    file: "ui/controls/DragPad/DragPadNumber.tsx",
    testFile: "src/app/project/composition.test.tsx",
    testName: "DragPad native text focus protects",
    from: 'useTextFocusBinding(pad.mode === "editing")',
    to: "useTextFocusBinding(false)",
  },
  "minimap-pressed": {
    file: "project/sections/arrangement/timeline/minimap/index.tsx",
    testFile: "src/project/sections/arrangement/timeline/minimap/visual-state.test.tsx",
    testName: "overview pressed color",
    from: "? theme.colors.canvasScrollbarActive",
    to: "? theme.colors.canvasScrollbarHover",
  },
  "minimap-epoch-color": {
    file: "project/sections/arrangement/timeline/minimap/index.tsx",
    testFile: "src/project/sections/arrangement/timeline/minimap/visual-state.test.tsx",
    testName: "overview pressed color",
    from: "}, [epoch, gesture])",
    to: "}, [gesture])",
  },
  "minimap-epoch-presentation": {
    file: "project/sections/arrangement/timeline/minimap/index.tsx",
    testFile: "src/project/sections/arrangement/timeline/minimap/visual-state.test.tsx",
    testName: "overview pressed color",
    from: "  useLayoutEffect(() => {\n    gesture.cancel()",
    to: "  useEffect(() => {\n    gesture.cancel()",
  },
  "grid-upload-scroll": {
    file: "project/sections/arrangement/timeline/grid/index.tsx",
    testFile: "src/project/sections/arrangement/timeline/grid/parity.test.tsx",
    testName: "batched grid preserves",
    from: "}, [major, minor, values])",
    to: "}, [])",
  },
  "region-upload-scroll": {
    file: "project/sections/arrangement/timeline/grid/index.tsx",
    testFile: "src/project/sections/arrangement/timeline/grid/parity.test.tsx",
    testName: "batched grid preserves",
    from: "}, [base, alternate, values])",
    to: "}, [])",
  },
}

const id = process.env.TIMELINE_MUTATION
if (id) {
  const selected = mutationCases[id]
  if (!selected) throw new Error(`Unknown timeline mutation: ${id}`)
  const target = path.resolve(import.meta.dir, "../../../../..", selected.file)
  const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  Bun.plugin({
    name: "timeline-capability-mutation",
    setup(build) {
      build.onLoad({ filter }, async args => {
        const source = await Bun.file(args.path).text()
        const first = source.indexOf(selected.from)
        if (first === -1 || source.indexOf(selected.from, first + selected.from.length) >= 0)
          throw new Error(`Mutation target drift: ${id}`)
        process.stderr.write(`[timeline-mutation] applied ${id}\n`)
        return { contents: source.replace(selected.from, () => selected.to), loader: "tsx" }
      })
    },
  })
}
