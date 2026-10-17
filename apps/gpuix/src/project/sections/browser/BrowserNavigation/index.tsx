import { useRef } from "react"
import { useGpuix } from "@gpuix/react"
import { List, ListRow, ScrollArea, TruncatedText, useInfoBinding } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Icon } from "@/ui/controls/Icon"
import type { IconName } from "@/ui/controls/Icon"
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
const SOURCE_ICONS: Readonly<Record<BrowserSource, IconName>> = {
  favorites: "Star",
  purple: "Square",
  all: "Library",
  sounds: "AudioLines",
  drums: "Drum",
  instruments: "Piano",
  audioEffects: "SlidersHorizontal",
  midiEffects: "KeyboardMusic",
  modulators: "Waves",
  max: "Gauge",
  plugins: "Plug",
  clips: "FileMusic",
  samples: "FileAudio",
  grooves: "Music2",
  tunings: "SlidersHorizontal",
  templates: "FileSliders",
  packs: "Package",
  userLibrary: "Folder",
  currentProject: "FolderOpen",
}

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
      tabIndex={-1}
      {...info}
      style={{ padding: theme.control["--spacing-control-track-pad"] }}
    >
      {SOURCE_GROUPS.map(group => (
        <div key={group.id}>
          <TruncatedText
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.control["--text-control-track"],
              flexGrow: 0,
              marginTop: theme.control["--spacing-control-track-gap"],
            }}
          >
            {labels.groups[group.id]}
          </TruncatedText>
          <List aria-label={labels.groups[group.id]}>
            {group.sources.map(id => (
              <ListRow
                key={id}
                role="option"
                tabIndex={source === id ? 0 : -1}
                label={labels.sources[id]}
                testId={`browser-source-${id}`}
                selected={source === id}
                leading={
                  <Icon
                    name={SOURCE_ICONS[id]}
                    filled={id === "favorites" || id === "purple"}
                    color={
                      id === "favorites"
                        ? theme.colors.chart5
                        : id === "purple"
                          ? theme.colors.chart4
                          : source === id
                            ? theme.colors.primaryForeground
                            : theme.colors.mutedForeground
                    }
                  />
                }
                onFocus={info.onFocus}
                onBlur={info.onBlur}
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
          </List>
        </div>
      ))}
    </ScrollArea>
  )
}
