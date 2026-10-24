import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton } from "@zoeymind/ui"
import { nativePlugins } from "@/shared/native/plugins"
import type { PluginCatalogEntry } from "@/shared/native/plugins"
import { useProjectState } from "@/pages/project/adapters"
import { editDevices } from "../edit-devices"

export function PluginInsert({ trackId }: { readonly trackId: string }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<PluginCatalogEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    generation.current += 1
    setBusy(false)
    setError(null)
    return () => {
      generation.current += 1
    }
  }, [trackId])
  useEffect(() => {
    let disposed = false
    if (nativePlugins.available())
      void nativePlugins
        .entries()
        .then(value => {
          if (!disposed) setEntries(value)
        })
        .catch(reason => {
          if (!disposed) setError(String(reason))
        })
    return () => {
      disposed = true
    }
  }, [])
  async function insert(id: string) {
    const operation = generation.current
    const sessionId = useProjectState.getState().session.backend.sessionId
    setBusy(true)
    setError(null)
    try {
      const device = await nativePlugins.prepareDevice(id)
      if (generation.current !== operation) return
      const state = useProjectState.getState()
      if (
        state.session.backend.sessionId !== sessionId ||
        !state.document.tracks.some(track => track.id === trackId)
      )
        return
      editDevices(trackId, devices => [...devices, device])
    } catch (reason) {
      if (generation.current === operation) setError(String(reason))
    } finally {
      if (generation.current === operation) setBusy(false)
    }
  }
  if (!nativePlugins.available()) return null
  return (
    <div className="gap-control-gap flex items-center">
      <DropdownButton
        value="add-plugin"
        label={t("detailDevices.addPlugin")}
        renderValue={() => t(busy ? "detailDevices.loadingPlugin" : "detailDevices.addPlugin")}
        disabled={busy || entries.length === 0}
        size="compact"
        side="top"
        align="end"
        matchTriggerWidth={false}
        mappable={false}
        items={entries.map(entry => ({
          id: entry.catalogId,
          label: `${entry.plugin.name}\n${entry.plugin.vendor} · ${entry.plugin.format}`,
        }))}
        onChange={id => {
          void insert(id)
        }}
      />
      {error && (
        <span role="alert" className="text-destructive max-w-64 truncate" title={error}>
          {error}
        </span>
      )}
      {entries.length === 0 && !error && (
        <span className="text-muted-foreground">{t("detailDevices.scanPlugins")}</span>
      )}
    </div>
  )
}
