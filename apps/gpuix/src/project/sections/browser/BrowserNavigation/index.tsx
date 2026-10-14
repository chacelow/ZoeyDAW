import { useRef } from "react"
import { useGpuix } from "@gpuix/react"
import { ListRow, ScrollArea, useInfoBinding } from "../../../../ui/controls"
import { useTheme } from "../../../../shared/theme/ThemeProvider"
import type { PublicInstance } from "@gpuix/react"
import type { BrowserSource } from "../catalog"
import type { BrowserLabels } from "../labels"

const SOURCE_GROUPS: readonly {
  id: "collections" | "library" | "places"
  sources: readonly BrowserSource[]
}[] = [
  { id: "collections", sources: ["favorites", "purple"] },
  {
    id: "library",
    sources: [
      "all",
      "sounds",
      "drums",
      "instruments",
      "audioEffects",
      "midiEffects",
      "modulators",
      "max",
      "plugins",
      "clips",
      "samples",
      "grooves",
      "tunings",
      "templates",
    ],
  },
  { id: "places", sources: ["packs", "userLibrary", "currentProject"] },
]
const SOURCES = SOURCE_GROUPS.flatMap(group => group.sources)

export function BrowserNavigation({
  source,
  onNavigate,
  labels,
}: {
  readonly source: BrowserSource
  readonly onNavigate: (source: BrowserSource) => void
  readonly labels: BrowserLabels
}) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const nodes = useRef(new Map<BrowserSource, PublicInstance>())
  const info = useInfoBinding({ type: "categories" })
  return (
    <ScrollArea
      fill
      aria-label={labels.title}
      {...info}
      style={{ padding: theme.control["--spacing-control-track-pad"] }}
    >
      {SOURCE_GROUPS.map(group => (
        <div key={group.id}>
          <text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.control["--text-control-track"],
              marginTop: theme.control["--spacing-control-track-gap"],
            }}
          >
            {labels.groups[group.id]}
          </text>
          {group.sources.map(id => (
            <ListRow
              key={id}
              label={labels.sources[id]}
              testId={`browser-source-${id}`}
              selected={source === id}
              ref={node => {
                if (node) nodes.current.set(id, node)
                else nodes.current.delete(id)
              }}
              onClick={() => onNavigate(id)}
              onKeyDown={event => {
                if (!["up", "down", "home", "end"].includes(event.key ?? "")) return
                const index = SOURCES.indexOf(id)
                const nextIndex =
                  event.key === "home"
                    ? 0
                    : event.key === "end"
                      ? SOURCES.length - 1
                      : Math.max(
                          0,
                          Math.min(SOURCES.length - 1, index + (event.key === "down" ? 1 : -1))
                        )
                const next = SOURCES[nextIndex]
                if (!next) return
                event.preventDefault()
                event.stopPropagation()
                onNavigate(next)
                const node = nodes.current.get(next)
                if (node) {
                  renderer?.focusElement?.(node.id)
                  renderer?.scrollIntoView?.(node.id)
                }
              }}
            />
          ))}
        </div>
      ))}
    </ScrollArea>
  )
}
