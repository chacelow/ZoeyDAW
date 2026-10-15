import path from "node:path"

interface MutationCase {
  file: string
  testFile: string
  testName: string
  from: string
  to: string
}

export const mutationCases: Record<string, MutationCase> = {
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
