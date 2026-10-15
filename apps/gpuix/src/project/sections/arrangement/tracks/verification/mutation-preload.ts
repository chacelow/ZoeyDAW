import path from "node:path"

const cases: Record<string, { file: string; replacements: [string, string][] }> = {
  "context-mousedown": {
    file: "src/ui/controls/Menu/trigger.tsx",
    replacements: [
      [
        "      onMouseDown?.(event)",
        "      onMouseDown?.(event)\n      if (menu.contextMenu && event.button === 2) { menu.setPointer({ x: event.x ?? 0, y: event.y ?? 0 }); menu.setOpen(true) }",
      ],
      ["    onContextMenu: unavailable", "    onContextMenu: true"],
    ],
  },
  "stop-freezes-peak": {
    file: "src/project/sections/arrangement/tracks/meter/telemetry.tsx",
    replacements: [
      ["driver.advance(timestampMs), active)", "driver.advance(timestampMs), active && playing)"],
    ],
  },
  "resume-stale": {
    file: "src/project/sections/arrangement/tracks/meter/telemetry.tsx",
    replacements: [["      driver.advance(timestampMs)", "      void timestampMs"]],
  },
}
const id = process.env.TRACKS_MUTATION
if (id) {
  const selected = cases[id]
  if (!selected) throw new Error(`Unknown tracks mutation: ${id}`)
  const target = path.resolve(import.meta.dir, "../../../../../..", selected.file)
  const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  Bun.plugin({
    name: "tracks-mutation",
    setup(build) {
      build.onLoad({ filter }, async args => {
        let contents = await Bun.file(args.path).text()
        for (const [from, to] of selected.replacements) {
          const first = contents.indexOf(from)
          if (first === -1 || contents.indexOf(from, first + from.length) >= 0)
            throw new Error(`Mutation target drift: ${id}`)
          contents = contents.replace(from, () => to)
        }
        process.stderr.write(`[tracks-mutation] applied ${id}\n`)
        return { contents, loader: "tsx" }
      })
    },
  })
}
