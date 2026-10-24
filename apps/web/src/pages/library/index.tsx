import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, Settings } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { ControlEnvironmentBridge } from "@/components/SharedControlBridge"
import { ControlInteractionsProvider } from "@/shared/control-interactions/index"
import { useSettingsDialog } from "@/shared/app-shared/settings-dialog-store"
import { galleryCatalog, galleryGroups } from "./catalog"
import type { GalleryFamily, GalleryFamilyId } from "./catalog"
import { FamilyDemo } from "./family-demo"
import { MappingModeToggle } from "./interaction-demos"
import { StateCatalog } from "./state-catalog"

import { InteractionProbe } from "./interaction-probe"
export function ComponentLibraryPage() {
  return (
    <ControlInteractionsProvider>
      <ControlEnvironmentBridge>
        <LibraryContent />
      </ControlEnvironmentBridge>
    </ControlInteractionsProvider>
  )
}

function LibraryContent() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [selected, setSelected] = useState<GalleryFamilyId>("buttons")
  const [visited, setVisited] = useState<ReadonlySet<GalleryFamilyId>>(() => new Set(["buttons"]))
  const tabs = useRef(new Map<GalleryFamilyId, HTMLButtonElement>())
  const content = useRef<HTMLDivElement>(null)
  const openSettings = useSettingsDialog(state => state.openSettings)
  function select(id: GalleryFamilyId) {
    setSelected(id)
    setVisited(previous => new Set([...previous, id]))
    content.current?.scrollTo({ top: 0 })
  }
  function navigateTabs(id: GalleryFamilyId, key: string) {
    const index = galleryCatalog.findIndex(family => family.id === id)
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? galleryCatalog.length - 1
          : (index + (key === "ArrowDown" ? 1 : -1) + galleryCatalog.length) % galleryCatalog.length
    const next = galleryCatalog[nextIndex]
    if (!next) return
    select(next.id)
    tabs.current.get(next.id)?.focus()
  }
  return (
    <div className="bg-background text-foreground flex h-full min-h-0 flex-col" data-gallery-root>
      <header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="control-icon"
          onClick={() => navigate("/")}
          aria-label={t("library.actions.back")}
        >
          <ChevronLeft />
        </Button>
        <h1 className="text-sm font-medium">{t("library.title")}</h1>
        <div className="gap-control-gap ml-auto flex shrink-0 items-center">
          <MappingModeToggle />
          <Button
            variant="ghost"
            size="control-icon"
            onClick={() => openSettings()}
            aria-label={t("library.actions.settings")}
          >
            <Settings />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="border-border/60 w-48 shrink-0 overflow-y-auto border-r px-2 py-3 sm:w-56">
          <div role="tablist" aria-orientation="vertical" aria-label={t("library.navigation")}>
            {galleryGroups.map(group => (
              <div
                key={group}
                className="mb-4"
                role="group"
                aria-labelledby={`gallery-group-${group}`}
              >
                <h2
                  id={`gallery-group-${group}`}
                  className="text-muted-foreground px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
                >
                  {t(`library.catalog.groups.${group}`)}
                </h2>
                {galleryCatalog
                  .filter(family => family.group === group)
                  .map(family => (
                    <button
                      key={family.id}
                      type="button"
                      role="tab"
                      id={`gallery-tab-${family.id}`}
                      aria-controls={`gallery-panel-${family.id}`}
                      aria-selected={selected === family.id}
                      tabIndex={selected === family.id ? 0 : -1}
                      ref={element => {
                        if (element) tabs.current.set(family.id, element)
                        else tabs.current.delete(family.id)
                      }}
                      onClick={() => select(family.id)}
                      onKeyDown={event => {
                        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
                        event.preventDefault()
                        navigateTabs(family.id, event.key)
                      }}
                      className={`hover:bg-muted focus-visible:outline-ring w-full rounded-sm px-2 py-1.5 text-left text-xs focus-visible:outline-2 ${selected === family.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                    >
                      {t(`library.catalog.families.${family.id}.title`)}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </aside>
        <main ref={content} className="relative min-w-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
          <div className="relative min-h-full">
            {galleryCatalog.map(family => {
              const active = selected === family.id
              if (!visited.has(family.id) || (family.transient && !active)) return null
              return <FamilyPanel key={family.id} family={family} active={active} />
            })}
          </div>
        </main>
      </div>
    </div>
  )
}

function FamilyPanel({
  family,
  active,
}: {
  readonly family: GalleryFamily
  readonly active: boolean
}) {
  const { t } = useTranslation()
  return (
    <section
      role="tabpanel"
      id={`gallery-panel-${family.id}`}
      aria-labelledby={`gallery-tab-${family.id}`}
      aria-hidden={!active}
      inert={!active}
      tabIndex={active ? 0 : -1}
      data-gallery-family={family.id}
      className="min-w-0 outline-none"
      style={
        active
          ? undefined
          : {
              visibility: "hidden",
              opacity: 0,
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
              overflow: "hidden",
            }
      }
    >
      <h2 className="text-base font-medium">{t(`library.catalog.families.${family.id}.title`)}</h2>
      <div className="mt-3 min-w-0">
        {family.source === "preview" ? (
          <FamilyDemo family={family} />
        ) : (
          <InteractionProbe>
            <FamilyDemo family={family} />
          </InteractionProbe>
        )}
      </div>
      <StateCatalog family={family} />
    </section>
  )
}
