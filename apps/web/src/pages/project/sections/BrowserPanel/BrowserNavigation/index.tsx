import {
  AudioLines,
  Drum,
  FileAudio,
  FileMusic,
  FileSliders,
  Folder,
  FolderOpen,
  Gauge,
  FolderPlus,
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
import {
  Button,
  Separator,
  cn,
  rowInteractiveClasses,
  useInfoBinding,
  CONTROL_METRICS,
} from "@zoeymind/ui"
import type { LucideIcon } from "lucide-react"
import type { BrowserSource } from "../browserData"
import type { BrowserRoot } from "@/shared/native/browser"
import { browserLibrary } from "@/pages/project/adapters/browser"

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
  readonly source: string
  readonly onNavigate: (source: BrowserSource | `root:${string}`) => void
  readonly roots: readonly BrowserRoot[]
  readonly busy: boolean
}

export function BrowserNavigation({ source, onNavigate, roots, busy }: BrowserNavigationProps) {
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
        if (buttons[nextIndex]?.dataset.browserAddFolder !== "true") buttons[nextIndex]?.click()
      }}
    >
      {SOURCE_GROUPS.map((group, index) => (
        <div key={group.id}>
          {index > 0 && <Separator className="my-1" />}
          <div className="text-muted-foreground flex items-center gap-1 overflow-hidden px-1 py-1 text-xs">
            <span className="w-3 shrink-0" aria-hidden />
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
                "min-h-0 justify-start gap-1 overflow-hidden rounded-none px-1 py-0 text-left font-normal"
              )}
              style={{ height: CONTROL_METRICS.transport["--spacing-control-track"] }}
              onClick={() => onNavigate(id)}
            >
              <Icon
                className={cn(
                  "size-3 shrink-0",
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
      {roots.map(root => (
        <Button
          key={root.id}
          variant="ghost"
          size="sm"
          aria-current={source === `root:${root.id}` ? "page" : undefined}
          title={root.path}
          className={rowInteractiveClasses(
            { active: source === `root:${root.id}` },
            "min-h-0 justify-start gap-1 overflow-hidden rounded-none px-1 py-0 text-left font-normal"
          )}
          style={{ height: CONTROL_METRICS.transport["--spacing-control-track"] }}
          onClick={() => onNavigate(`root:${root.id}`)}
        >
          <Folder className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{root.name}</span>
          {root.status !== "ready" ? (
            <span className="text-muted-foreground text-[10px]">
              {t(`browser.status.${root.status}`)}
            </span>
          ) : null}
        </Button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        data-browser-add-folder="true"
        aria-label={t("browser.addFolder")}
        className={rowInteractiveClasses(
          {},
          "min-h-0 justify-start gap-1 rounded-none px-1 py-0 text-left font-normal"
        )}
        style={{ height: CONTROL_METRICS.transport["--spacing-control-track"] }}
        onClick={() => void browserLibrary.addFolder()}
      >
        <FolderPlus className="size-3 shrink-0" />
        <span className="truncate">{t("browser.addFolder")}</span>
      </Button>
    </nav>
  )
}
