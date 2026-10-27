import { useEffect, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, rowInteractiveClasses } from "@zoeymind/ui"
import { nativePlugins } from "@/shared/native/plugins"
import { BROWSER_PLUGIN_MIME, browserPluginDrag } from "@/pages/project/adapters/browser"
import {
  insertBrowserPlugin,
  insertPluginNewTrack,
  useProjectState,
} from "@/pages/project/adapters"
import type { PluginCatalogEntry } from "@/shared/native/plugins"

export function BrowserPlugins({
  scope,
  query,
  refresh = 0,
}: {
  readonly scope: string
  readonly query: string
  readonly refresh?: number
}) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<PluginCatalogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (nativePlugins.available()) {
      void nativePlugins
        .entries()
        .then(value => {
          if (live) {
            setEntries(value)
            setError(null)
          }
        })
        .catch(reason => {
          if (live) setError(String(reason))
        })
    }
    return () => {
      live = false
      browserPluginDrag.clear()
    }
  }, [refresh])
  const needle = query.toLocaleLowerCase().trim()
  const visible = entries.filter(
    entry =>
      (scope === "plugins" ||
        (scope === "instruments"
          ? entry.plugin.kind === "Instrument"
          : entry.plugin.kind === "Effect")) &&
      `${entry.plugin.name} ${entry.plugin.vendor}`.toLocaleLowerCase().includes(needle)
  )
  const handleDoubleClick = (entry: PluginCatalogEntry) => {
    const state = useProjectState.getState()
    const selectedTrackId =
      state.session.selectedTrackIds[state.session.selectedTrackIds.length - 1]
    const selectedTrack = state.document.tracks.find(t => t.id === selectedTrackId)
    if (entry.plugin.kind === "Instrument") {
      if (selectedTrack && selectedTrack.kind === "midi") {
        void insertBrowserPlugin(selectedTrack.id, entry)
      } else {
        void insertPluginNewTrack(entry)
      }
    } else if (selectedTrack) {
      void insertBrowserPlugin(selectedTrack.id, entry)
    } else {
      void insertPluginNewTrack(entry)
    }
  }
  return (
    <div
      role="list"
      aria-label={t("project.browser.sources.plugins")}
      className="min-h-0 flex-1 overflow-auto"
    >
      {error && (
        <p role="alert" className="text-destructive px-1">
          {error}
        </p>
      )}
      {!error && visible.length === 0 && (
        <p className="text-muted-foreground px-1">
          {t(entries.length ? "detailDevices.noMatchingPlugins" : "detailDevices.scanPlugins")}
        </p>
      )}
      {visible.map(entry => (
        <Button
          key={entry.catalogId}
          variant="ghost"
          size="sm"
          draggable
          className={rowInteractiveClasses(
            {},
            "w-full justify-start rounded-none text-left font-normal"
          )}
          onDragStart={event => {
            event.dataTransfer.effectAllowed = "copy"
            event.dataTransfer.setData(BROWSER_PLUGIN_MIME, browserPluginDrag.start(entry))
            event.dataTransfer.setData("text/plain", entry.plugin.name)
          }}
          onDragEnd={() => browserPluginDrag.clear()}
          onDoubleClick={() => handleDoubleClick(entry)}
        >
          {entry.plugin.name}
        </Button>
      ))}
    </div>
  )
}
