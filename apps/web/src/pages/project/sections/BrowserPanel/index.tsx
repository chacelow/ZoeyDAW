import { useEffect, useRef } from "react"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileAudio,
  FileMusic,
  FileSliders,
  Folder,
  KeyboardMusic,
  ListFilter,
  Music2,
  Piano,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  DragPreviewArea,
  Input,
  Separator,
  cn,
  rowInteractiveClasses,
  useInfoBinding,
} from "@zoeymind/ui"
import { useBrowser } from "./useBrowser"
import { BrowserNavigation } from "./BrowserNavigation"
import type { LucideIcon } from "lucide-react"
import type { KeyboardEvent, ReactNode } from "react"
import type { BrowserKind } from "./browserData"

const KIND_ICONS: Record<BrowserKind, LucideIcon> = {
  device: Piano,
  preset: FileSliders,
  sample: FileAudio,
  midi: KeyboardMusic,
  clip: FileMusic,
  groove: Music2,
  tuning: SlidersHorizontal,
  template: Folder,
}
const CONTENT_KINDS: (BrowserKind | "all")[] = [
  "all",
  "device",
  "preset",
  "sample",
  "midi",
  "clip",
  "groove",
  "tuning",
  "template",
]

export interface BrowserPanelProps {
  readonly renderBody: (slots: { navigation: ReactNode; results: ReactNode }) => ReactNode
}

export function BrowserPanel({ renderBody }: BrowserPanelProps) {
  const { t } = useTranslation()
  const browser = useBrowser()
  const treeReference = useRef<HTMLDivElement>(null)
  const searchReference = useRef<HTMLInputElement>(null)
  const resourceInfo = useInfoBinding({ type: "resources" })
  const searchInfo = useInfoBinding({ type: "search" })
  const filterInfo = useInfoBinding({ type: "filters" })
  const selectedId = browser.selected?.entry.id

  useEffect(() => {
    if (selectedId && treeReference.current?.contains(document.activeElement)) {
      document.getElementById(`browser-entry-${selectedId}`)?.scrollIntoView({ block: "nearest" })
    }
  }, [selectedId])

  useEffect(() => {
    function focusSearch(event: globalThis.KeyboardEvent) {
      if (
        event.defaultPrevented ||
        document.activeElement?.closest("[role='dialog']") ||
        !searchReference.current?.closest("section")?.getBoundingClientRect().width
      ) {
        return
      }
      if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f")) {
        return
      }

      event.preventDefault()
      searchReference.current?.focus()
      searchReference.current?.select()
    }
    window.addEventListener("keydown", focusSearch)
    return () => window.removeEventListener("keydown", focusSearch)
  }, [])

  function handleTreeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = browser.rows.findIndex(row => row.entry.id === selectedId)
    const row = browser.rows[index]
    let nextIndex = index
    switch (event.key) {
      case "ArrowDown": {
        nextIndex = Math.min(index + 1, browser.rows.length - 1)
        break
      }
      case "ArrowUp": {
        nextIndex = Math.max(index - 1, 0)
        break
      }
      case "Home": {
        nextIndex = 0
        break
      }
      case "End": {
        nextIndex = browser.rows.length - 1
        break
      }
      case "ArrowRight": {
        if (row?.expandable && !row.expanded) {
          browser.toggleExpanded(row.entry.id)
        } else if (row?.expanded) {
          nextIndex = index + 1
        }
        break
      }
      case "ArrowLeft": {
        if (row?.expanded) {
          browser.toggleExpanded(row.entry.id)
        } else if (row?.parentId) {
          browser.setSelectedId(row.parentId)
        }
        break
      }
      case "Enter": {
        if (row?.expandable) {
          browser.toggleExpanded(row.entry.id)
        }
        break
      }
      default: {
        return
      }
    }
    event.preventDefault()
    event.stopPropagation()
    if (nextIndex !== index) {
      const next = browser.rows[nextIndex]
      if (next) {
        browser.setSelectedId(next.entry.id)
      }
    }
  }

  return (
    <section
      aria-label={t("project.sidebarTitle")}
      className="flex h-full min-w-0 flex-col text-xs"
    >
      <div className="flex shrink-0 items-center gap-1 p-2">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!browser.canGoBack}
          aria-label={t("project.browser.back")}
          title={t("project.browser.back")}
          onClick={() => browser.travel("back")}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!browser.canGoForward}
          aria-label={t("project.browser.forward")}
          title={t("project.browser.forward")}
          onClick={() => browser.travel("forward")}
        >
          <ChevronRight className="size-5" />
        </Button>
        <div className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <Input
            ref={searchReference}
            value={browser.query}
            onChange={event => browser.setQuery(event.target.value)}
            aria-label={t("project.browser.search")}
            placeholder={t("project.browser.searchPlaceholder")}
            className="h-9 rounded-sm pr-8 pl-8 text-xs md:text-xs"
            {...searchInfo}
            onKeyDown={event => {
              if (event.key !== "Escape") {
                return
              }

              browser.setQuery("")
              treeReference.current?.focus()
            }}
          />
          {browser.query ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              aria-label={t("project.browser.clearSearch")}
              onClick={() => {
                browser.setQuery("")
                searchReference.current?.focus()
              }}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={browser.filtersVisible}
          aria-label={t("project.browser.toggleFilters")}
          title={t("project.browser.toggleFilters")}
          className={cn(browser.filtersVisible && "bg-muted")}
          onClick={() => browser.setFiltersVisible(!browser.filtersVisible)}
        >
          <ListFilter className="size-5" />
        </Button>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-1">
        {renderBody({
          navigation: <BrowserNavigation source={browser.source} onNavigate={browser.navigate} />,
          results: (
            <div className="flex h-full min-w-0 flex-col">
              {browser.filtersVisible ? (
                <div className="shrink-0 p-3">
                  <div className="text-muted-foreground mb-1.5 flex items-center gap-1 text-[10px]">
                    <ChevronDown className="size-3" />
                    {t("project.browser.content")}
                  </div>
                  <div
                    className="flex flex-wrap gap-1"
                    role="group"
                    aria-label={t("project.browser.content")}
                    {...filterInfo}
                  >
                    {CONTENT_KINDS.map(kind => (
                      <button
                        key={kind}
                        type="button"
                        aria-pressed={browser.kind === kind}
                        className={cn(
                          "inline-flex h-5 shrink-0 items-center justify-center rounded-full border px-2 text-[10px] font-medium whitespace-nowrap transition-colors",
                          browser.kind === kind
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground bg-transparent"
                        )}
                        onClick={() => browser.setKind(kind)}
                      >
                        {t(`project.browser.kinds.${kind}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {browser.filtersVisible ? <Separator /> : null}
              <Button
                variant="ghost"
                size="sm"
                className="w-full shrink-0 justify-between rounded-none px-3 text-xs font-normal"
                aria-label={t("project.browser.sort")}
                onClick={() => browser.setDescending(!browser.descending)}
              >
                <span>{t("project.browser.name")}</span>
                {browser.descending ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
              </Button>
              <Separator />
              <DragPreviewArea
                ref={treeReference}
                disabledDropLabel={t("project.browser.dropDisabled")}
                renderPreview={source => {
                  const row = browser.rows.find(
                    row => `browser-entry-${row.entry.id}` === source.id
                  )
                  if (!row) {
                    return null
                  }
                  const Icon = KIND_ICONS[row.entry.kind]
                  return (
                    <>
                      <Icon className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{row.entry.name}</span>
                    </>
                  )
                }}
                role="tree"
                tabIndex={0}
                aria-label={t("project.browser.results")}
                aria-activedescendant={selectedId ? `browser-entry-${selectedId}` : undefined}
                onKeyDown={handleTreeKeyDown}
                {...resourceInfo}
                className="focus-visible:ring-ring min-h-0 flex-1 overflow-y-auto p-1 outline-none focus-visible:ring-1 focus-visible:ring-inset"
              >
                {browser.rows.map(row => {
                  const { entry } = row
                  const Icon = KIND_ICONS[entry.kind]
                  return (
                    <div
                      key={entry.id}
                      id={`browser-entry-${entry.id}`}
                      data-drag-source
                      role="treeitem"
                      tabIndex={-1}
                      aria-label={entry.name}
                      aria-selected={selectedId === entry.id}
                      aria-level={row.depth + 1}
                      aria-expanded={row.expandable ? row.expanded : undefined}
                      className={rowInteractiveClasses(
                        { active: selectedId === entry.id },
                        "group/browser-row justify-start gap-1 rounded-sm text-left font-normal"
                      )}
                      style={{ paddingLeft: `calc(var(--spacing) * ${row.depth * 6 + 1})` }}
                      onKeyDown={event => {
                        if (event.key !== "Enter" || event.target !== event.currentTarget) {
                          return
                        }
                        event.preventDefault()
                        event.stopPropagation()
                        browser.setSelectedId(entry.id)
                        if (row.expandable) browser.toggleExpanded(entry.id)
                        treeReference.current?.focus({ preventScroll: true })
                      }}
                      onClick={event => {
                        browser.setSelectedId(entry.id)
                        if (
                          row.expandable &&
                          event.target instanceof Element &&
                          event.target.closest("[data-browser-disclosure]")
                        ) {
                          browser.toggleExpanded(entry.id)
                        }
                        treeReference.current?.focus({ preventScroll: true })
                      }}
                      onDoubleClick={() => {
                        if (row.expandable) {
                          browser.toggleExpanded(entry.id)
                        }
                      }}
                    >
                      <span
                        data-browser-disclosure
                        className="flex size-5 shrink-0 items-center justify-center"
                      >
                        {row.expandable ? (
                          row.expanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )
                        ) : null}
                      </span>
                      <Icon className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        tabIndex={-1}
                        aria-label={t(
                          browser.favorites.has(entry.id)
                            ? "project.browser.removeFavorite"
                            : "project.browser.addFavorite",
                          { name: entry.name }
                        )}
                        title={t(
                          browser.favorites.has(entry.id)
                            ? "project.browser.removeFavorite"
                            : "project.browser.addFavorite",
                          { name: entry.name }
                        )}
                        aria-pressed={browser.favorites.has(entry.id)}
                        className={cn(
                          "shrink-0 opacity-0 group-focus-within/browser-row:opacity-100 group-hover/browser-row:opacity-100",
                          (browser.favorites.has(entry.id) || selectedId === entry.id) &&
                            "opacity-100"
                        )}
                        onDoubleClick={event => event.stopPropagation()}
                        onClick={event => {
                          event.stopPropagation()
                          browser.toggleFavorite(entry.id)
                          treeReference.current?.focus({ preventScroll: true })
                        }}
                      >
                        <Star
                          className={cn(
                            "size-4",
                            browser.favorites.has(entry.id) && "fill-current"
                          )}
                        />
                      </Button>
                    </div>
                  )
                })}
                {browser.rows.length === 0 && (
                  <div className="text-muted-foreground flex flex-col items-center gap-3 px-3 py-10 text-center">
                    <Search className="size-7" />
                    <p>{t("project.browser.empty")}</p>
                    <p className="text-xs">{t("project.browser.emptyHint")}</p>
                    {browser.query || browser.kind !== "all" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          browser.setQuery("")
                          browser.setKind("all")
                        }}
                      >
                        {t("project.browser.resetFilters")}
                      </Button>
                    ) : null}
                  </div>
                )}
              </DragPreviewArea>
            </div>
          ),
        })}
      </div>
    </section>
  )
}
