import {
  AudioLines,
  Drum,
  FileAudio,
  FileMusic,
  FileSliders,
  Folder,
  FolderOpen,
  Gauge,
  KeyboardMusic,
  Library,
  Music2,
  Package,
  Piano,
  Plug,
  SlidersHorizontal,
  Square,
  Star,
  Waves,
} from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, Separator, cn, rowInteractiveClasses, useInfoBinding } from "@zoeymind/ui"
import type { LucideIcon } from "lucide-react"
import type { BrowserSource } from "../browserData"

const SOURCE_GROUPS: { id: string; sources: { id: BrowserSource; icon: LucideIcon }[] }[] = [
  {
    id: "collections",
    sources: [
      { id: "favorites", icon: Star },
      { id: "purple", icon: Square },
    ],
  },
  {
    id: "library",
    sources: [
      { id: "all", icon: Library },
      { id: "sounds", icon: AudioLines },
      { id: "drums", icon: Drum },
      { id: "instruments", icon: Piano },
      { id: "audioEffects", icon: SlidersHorizontal },
      { id: "midiEffects", icon: KeyboardMusic },
      { id: "modulators", icon: Waves },
      { id: "max", icon: Gauge },
      { id: "plugins", icon: Plug },
      { id: "clips", icon: FileMusic },
      { id: "samples", icon: FileAudio },
      { id: "grooves", icon: Music2 },
      { id: "tunings", icon: SlidersHorizontal },
      { id: "templates", icon: FileSliders },
    ],
  },
  {
    id: "places",
    sources: [
      { id: "packs", icon: Package },
      { id: "userLibrary", icon: Folder },
      { id: "currentProject", icon: FolderOpen },
    ],
  },
]

export interface BrowserNavigationProps {
  readonly source: BrowserSource
  readonly onNavigate: (source: BrowserSource) => void
}

export function BrowserNavigation({ source, onNavigate }: BrowserNavigationProps) {
  const { t } = useTranslation()
  const infoHandlers = useInfoBinding({ type: "categories" })
  return (
    <nav
      aria-label={t("project.browser.navigation")}
      className="text-foreground h-full w-full overflow-x-hidden overflow-y-auto p-1"
      {...infoHandlers}
      onKeyDown={event => {
        if (
          !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
          !(event.target instanceof HTMLElement)
        ) {
          return
        }
        const { target } = event
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")]
        const index = buttons.findIndex(button => button === target.closest("button"))
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : Math.max(
                  0,
                  Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))
                )
        event.preventDefault()
        event.stopPropagation()
        buttons[nextIndex]?.focus()
        buttons[nextIndex]?.click()
      }}
    >
      {SOURCE_GROUPS.map((group, index) => (
        <div key={group.id}>
          {index > 0 && <Separator className="my-2" />}
          <div className="text-muted-foreground flex min-h-7 items-center gap-2 overflow-hidden px-3 pt-3 pb-1 text-xs">
            <span className="w-5 shrink-0" aria-hidden />
            <span className="min-w-0 overflow-hidden whitespace-nowrap">
              {t(`project.browser.groups.${group.id}`)}
            </span>
          </div>
          {group.sources.map(({ id, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              aria-label={t(`project.browser.sources.${id}`)}
              title={t(`project.browser.sources.${id}`)}
              aria-current={source === id ? "page" : undefined}
              className={rowInteractiveClasses(
                { active: source === id },
                "justify-start gap-2 overflow-hidden rounded-sm text-left font-normal"
              )}
              onClick={() => onNavigate(id)}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  id === "favorites" && "fill-chart-5 text-chart-5",
                  id === "purple" && "fill-chart-4 text-chart-4"
                )}
              />
              <span className="min-w-0 flex-1 overflow-hidden text-left whitespace-nowrap">
                {t(`project.browser.sources.${id}`)}
              </span>
            </Button>
          ))}
        </div>
      ))}
    </nav>
  )
}
