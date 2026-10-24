import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@zoeymind/ui"
import {
  nativePlugins,
  type PluginCatalogEntry,
  type PluginScanReport,
} from "@/shared/native/plugins"

type ScanState =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "scanning"; id: string }
  | { kind: "cancelling"; id: string }

export function PluginSettings() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<PluginCatalogEntry[]>([])
  const [issues, setIssues] = useState<PluginScanReport["issues"]>([])
  const [state, setState] = useState<ScanState>({ kind: "idle" })
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const active = useRef<string | null>(null)
  const mounted = useRef(false)
  const revision = useRef(0)
  const available = nativePlugins.available()

  useEffect(() => {
    mounted.current = true
    let disposed = false
    const requestedRevision = revision.current
    if (available) {
      void nativePlugins
        .entries()
        .then(value => {
          if (!disposed && requestedRevision === revision.current) setEntries(value)
        })
        .catch(reason => {
          if (!disposed && requestedRevision === revision.current) setError(String(reason))
        })
    }
    return () => {
      disposed = true
      mounted.current = false
      const id = active.current
      active.current = null
      if (id) void nativePlugins.cancel(id).catch(() => {})
    }
  }, [available])

  async function scanFolder() {
    revision.current += 1
    setError(null)
    setState({ kind: "picking" })
    try {
      const folder = await nativePlugins.pickFolder()
      if (!mounted.current) return
      if (typeof folder !== "string") {
        setState({ kind: "idle" })
        return
      }
      const id = crypto.randomUUID()
      await nativePlugins.reserve(id)
      if (!mounted.current) {
        await nativePlugins.cancel(id)
        return
      }
      active.current = id
      setCancelled(false)
      setState({ kind: "scanning", id })
      const report = await nativePlugins.scan(id, [folder], [])
      if (!mounted.current || active.current !== id) return
      setEntries(report.entries)
      setIssues(report.issues)
      setCancelled(report.cancelled)
    } catch (reason) {
      if (mounted.current) setError(String(reason))
    } finally {
      if (mounted.current) {
        active.current = null
        setState({ kind: "idle" })
      }
    }
  }

  async function cancel() {
    if (state.kind !== "scanning") return
    const id = state.id
    setState({ kind: "cancelling", id })
    try {
      await nativePlugins.cancel(id)
    } catch (reason) {
      if (mounted.current && active.current === id) {
        setError(String(reason))
        setState({ kind: "scanning", id })
      }
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={t("pluginSettings.title")}>
      <p className="text-muted-foreground text-sm">{t("pluginSettings.description")}</p>
      <div className="flex gap-2">
        <Button disabled={!available || state.kind !== "idle"} onClick={() => void scanFolder()}>
          {t("pluginSettings.scanFolder")}
        </Button>
        {(state.kind === "scanning" || state.kind === "cancelling") && (
          <Button
            variant="outline"
            disabled={state.kind === "cancelling"}
            onClick={() => void cancel()}
          >
            {t("common.cancel")}
          </Button>
        )}
      </div>
      {!available && (
        <p className="text-muted-foreground text-sm">{t("pluginSettings.desktopOnly")}</p>
      )}
      {state.kind !== "idle" && (
        <p role="status">
          {t(state.kind === "cancelling" ? "pluginSettings.cancelling" : "pluginSettings.scanning")}
        </p>
      )}
      {cancelled && <p role="status">{t("pluginSettings.cancelled")}</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {issues.map(issue => (
        <p role="alert" className="text-destructive text-sm break-all" key={issue.path}>
          {issue.path}: {issue.reason}
        </p>
      ))}
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("pluginSettings.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("pluginSettings.name")}</TableHead>
              <TableHead>{t("pluginSettings.format")}</TableHead>
              <TableHead>{t("pluginSettings.vendor")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(entry => (
              <TableRow key={entry.catalogId}>
                <TableCell>{entry.plugin.name}</TableCell>
                <TableCell>{entry.plugin.format}</TableCell>
                <TableCell>{entry.plugin.vendor}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
