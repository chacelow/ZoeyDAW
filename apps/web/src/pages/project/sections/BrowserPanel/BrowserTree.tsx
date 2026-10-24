import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight, FileAudio, Folder, FolderOpen, Star } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, CONTROL_METRICS, rowInteractiveClasses } from "@zoeymind/ui"
import {
  browserLibrary,
  browserAudioDrag,
  BROWSER_AUDIO_MIME,
  BROWSER_WINDOW_SIZE,
} from "@/pages/project/adapters/browser"
import type { BrowserLibraryState } from "@/pages/project/adapters/browser"
import type { BrowserTreeRow } from "@/shared/native/browser"
import type { KeyboardEvent } from "react"

const rowHeight = CONTROL_METRICS.transport["--spacing-control-track"]
const overscan = 12
export function BrowserTree({ state }: { readonly state: BrowserLibraryState }) {
  const { t } = useTranslation()
  const viewport = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 400 })
  const pendingIndex = useRef<number | null>(null)
  const selected = state.selection[state.scope]
  useEffect(() => () => browserAudioDrag.clear(), [])
  useEffect(() => {
    const node = viewport.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setView({ top: node.scrollTop, height: node.clientHeight })
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0
    setView(previous => ({ ...previous, top: 0 }))
    pendingIndex.current = null
  }, [state.scope, state.query])
  useEffect(() => {
    const index = pendingIndex.current
    if (index === null || state.queryState !== "ready") return
    const row = state.items[index - state.offset]
    if (!row) return
    pendingIndex.current = null
    browserLibrary.select(row)
  }, [state.items, state.offset, state.queryState])
  useEffect(() => {
    if (state.queryState !== "ready" || state.total === 0) return
    const firstVisible = Math.floor(view.top / rowHeight)
    const lastVisible = Math.min(state.total - 1, Math.ceil((view.top + view.height) / rowHeight))
    if (firstVisible < state.offset || lastVisible >= state.offset + state.items.length) {
      void browserLibrary.loadWindow(Math.max(0, firstVisible - overscan))
    }
  }, [view, state.offset, state.items.length, state.total, state.queryState])
  function moveTo(index: number) {
    const target = Math.max(0, Math.min(state.total - 1, index))
    const row = state.items[target - state.offset]
    if (row) browserLibrary.select(row)
    else {
      pendingIndex.current = target
      void browserLibrary.loadWindow(Math.max(0, target - overscan))
    }
    const node = viewport.current
    if (node) {
      if (target * rowHeight < node.scrollTop) node.scrollTop = target * rowHeight
      else if ((target + 1) * rowHeight > node.scrollTop + node.clientHeight)
        node.scrollTop = (target + 1) * rowHeight - node.clientHeight
    }
  }
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return
    const index = state.items.findIndex(row => row.id === selected?.id)
    const absolute = index === -1 ? 0 : state.offset + index
    switch (event.key) {
      case "ArrowDown":
        moveTo(index === -1 ? 0 : absolute + 1)
        break
      case "ArrowUp":
        moveTo(absolute - 1)
        break
      case "Home":
        moveTo(0)
        break
      case "End":
        moveTo(state.total - 1)
        break
      case "ArrowRight":
        if (selected?.kind === "folder") {
          if (!state.expanded.has(selected.id)) browserLibrary.toggleFolder(selected)
          else moveTo(absolute + 1)
        } else void browserLibrary.playSelected()
        break
      case "ArrowLeft":
        if (selected?.kind === "folder" && state.expanded.has(selected.id))
          browserLibrary.toggleFolder(selected)
        else {
          const parent = state.items
            .slice(0, index)
            .reverse()
            .find(row => row.depth < (selected?.depth ?? 0))
          if (parent) browserLibrary.select(parent)
        }
        break
      case "Enter":
        if (selected?.kind === "folder") browserLibrary.toggleFolder(selected)
        else void browserLibrary.playSelected()
        break
      case "Escape":
        void browserLibrary.stopAudition()
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }
  function activate(row: BrowserTreeRow) {
    browserLibrary.select(row)
    if (row.kind === "folder") browserLibrary.toggleFolder(row)
    viewport.current?.focus({ preventScroll: true })
  }
  const first = Math.max(0, Math.floor(view.top / rowHeight) - overscan)
  const last = Math.ceil((view.top + view.height) / rowHeight) + overscan
  const visible = state.items
    .map((row, index) => ({ row, index: state.offset + index }))
    .filter(item => item.index >= first && item.index <= last)
  return (
    <div
      ref={viewport}
      role="tree"
      tabIndex={0}
      aria-label={t("project.browser.results")}
      aria-busy={state.queryState === "loading"}
      aria-activedescendant={
        visible.some(({ row }) => row.id === selected?.id)
          ? `browser-entry-${selected?.id}`
          : undefined
      }
      className="min-h-0 flex-1 overflow-auto outline-none"
      onKeyDown={handleKey}
      onScroll={event => {
        const node = event.currentTarget
        setView({ top: node.scrollTop, height: node.clientHeight })
        const next = Math.max(0, Math.floor(node.scrollTop / rowHeight) - overscan)
        if (
          next < state.offset ||
          next + Math.ceil(node.clientHeight / rowHeight) + overscan * 2 >
            state.offset + state.items.length
        ) {
          if (state.queryState !== "loading" || Math.abs(next - state.offset) > BROWSER_WINDOW_SIZE)
            void browserLibrary.loadWindow(next)
        }
      }}
    >
      <div style={{ height: state.total * rowHeight, position: "relative" }}>
        {visible.map(({ row, index }) => {
          const open = state.expanded.has(row.id) || (!!state.query && row.kind === "folder")
          const Icon = row.kind === "audio" ? FileAudio : open ? FolderOpen : Folder
          return (
            <div
              key={row.id}
              id={`browser-entry-${row.id}`}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-expanded={row.kind === "folder" ? open : undefined}
              aria-selected={selected?.id === row.id}
              aria-posinset={index + 1}
              aria-setsize={state.total}
              tabIndex={-1}
              title={row.path}
              draggable={row.kind === "audio"}
              onDragStart={event => {
                if (row.kind !== "audio") {
                  event.preventDefault()
                  return
                }
                const audition = state.audition
                const source = browserAudioDrag.start({
                  path: row.path,
                  name: row.name,
                  durationSeconds:
                    audition.kind === "ready" && audition.itemId === row.id
                      ? audition.durationSeconds
                      : null,
                })
                event.dataTransfer.setData(BROWSER_AUDIO_MIME, source.token)
                event.dataTransfer.setData("text/plain", row.name)
                event.dataTransfer.effectAllowed = "copy"
              }}
              onDragEnd={() => browserAudioDrag.clear()}
              onClick={() => activate(row)}
              onDoubleClick={() => {
                if (row.kind === "audio") void browserLibrary.playSelected()
              }}
              onKeyDown={handleKey}
              className={rowInteractiveClasses(
                { active: selected?.id === row.id },
                "absolute left-0 min-h-0 gap-1 rounded-none py-0 pr-1 text-left"
              )}
              style={{
                top: index * rowHeight,
                height: rowHeight,
                paddingLeft: row.depth * rowHeight + 2,
              }}
            >
              <span className="flex size-3 shrink-0 items-center">
                {row.kind === "folder" ? (
                  open ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )
                ) : null}
              </span>
              <Icon className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              {row.kind === "audio" ? (
                <>
                  <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                    {(row.byteLength / 1048576).toFixed(1)} MB
                  </span>
                  <Button
                    size="control-icon"
                    variant="ghost"
                    aria-label={t("browser.favorite")}
                    aria-pressed={state.favorites.has(row.id)}
                    onClick={event => {
                      event.stopPropagation()
                      browserLibrary.toggleFavorite(row)
                    }}
                  >
                    <Star className={state.favorites.has(row.id) ? "fill-current" : undefined} />
                  </Button>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
      {state.total === 0 && state.queryState !== "loading" ? (
        <p className="text-muted-foreground p-2">{t("browser.empty")}</p>
      ) : null}
    </div>
  )
}
