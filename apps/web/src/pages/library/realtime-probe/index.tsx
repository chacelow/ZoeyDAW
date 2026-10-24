import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { isTauri } from "@tauri-apps/api/core"
import { MAX_RAW_SAMPLES, buildCases, errorMessage } from "./model"
import type { ProbeMode, ProbeProgress, ProbeRunReport, ProbeScenario } from "./model"
import { runProbeCase } from "./runner"
import { ProbeParameters } from "./ProbeParameters"
import { ProbeResults } from "./ProbeResults"

export function RealtimeProbePage() {
  const { t } = useTranslation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const active = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const [mode, setMode] = useState<ProbeMode | "all">("all")
  const [bytes, setBytes] = useState<number | "all">("all")
  const [scenario, setScenario] = useState<ProbeScenario | "all">("all")
  const [duration, setDuration] = useState("4")
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProbeProgress | null>(null)
  const [report, setReport] = useState<ProbeRunReport | null>(null)
  const [issue, setIssue] = useState<string | null>(null)
  const nativeAvailable = import.meta.env.DEV && isTauri()
  const number = (value: number | null) => (value === null ? "—" : value.toFixed(2))

  useEffect(() => {
    mounted.current = true
    const urls = downloads.current
    return () => {
      mounted.current = false
      active.current?.abort()
      active.current = null
      for (const [url, timer] of urls) {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      urls.clear()
    }
  }, [])

  async function run() {
    if (active.current || !canvas.current || !nativeAvailable) return
    const durationSeconds = Number(duration)
    if (!Number.isInteger(durationSeconds) || durationSeconds < 4 || durationSeconds > 20) {
      setIssue(t("realtimeProbe.durationInvalid"))
      return
    }
    const controller = new AbortController()
    active.current = controller
    setRunning(true)
    setProgress(null)
    setIssue(null)
    let currentReport: ProbeRunReport = {
      schemaVersion: 1,
      scope: "synthetic IPC payload; not audio latency or production meter performance",
      createdAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        nativeWindow: isTauri(),
        visibility: document.visibilityState,
        devicePixelRatio: window.devicePixelRatio,
      },
      limits: {
        durationSeconds,
        nativeFramesPerCase: 1200,
        rawSamplesPerSeries: MAX_RAW_SAMPLES,
        consumerRateCapHz: 60,
      },
      verification: {
        dualWindow: "NOT VERIFIED",
        webView2: "NOT VERIFIED",
        webKitGtk: "NOT VERIFIED",
        display120Hz: "NOT VERIFIED",
        displayRefreshNote: "rAF cadence is observed, not a physical display refresh measurement",
        nativeAllocationsAndCopies: "NOT INSTRUMENTED",
        webArrayBufferCopies: "no explicit payload copies; IPC internal copies not instrumented",
        clockNote:
          "min-RTT midpoint mapping; upper age includes RTT/2, not an independent clock calibration",
        paintNote: "Canvas draw + one-pixel readback; compositor presentation not measured",
      },
      cases: [],
    }
    setReport(currentReport)
    const surface = canvas.current
    try {
      const cases = buildCases({ mode, bytes, scenario, durationSeconds })
      for (const config of cases) {
        if (controller.signal.aborted) break
        setProgress(null)
        // eslint-disable-next-line no-await-in-loop -- Cases must not overlap native publishers or measurement workloads.
        const result = await runProbeCase({
          config,
          canvas: surface,
          signal: controller.signal,
          onProgress: next => {
            if (mounted.current && active.current === controller) setProgress(next)
          },
        })
        currentReport = { ...currentReport, cases: [...currentReport.cases, result] }
        if (mounted.current && active.current === controller) setReport(currentReport)
        if (result.nativeClose.kind === "pending") {
          if (mounted.current) setIssue(t("realtimeProbe.cleanupPending"))
          break
        }
        if (result.status !== "completed" || result.nativeClose.kind !== "closed") break
      }
    } catch (error) {
      if (mounted.current && active.current === controller) setIssue(errorMessage(error))
    } finally {
      if (active.current === controller) {
        active.current = null
        if (mounted.current) {
          setRunning(false)
          setProgress(null)
        }
      }
    }
  }

  function download() {
    if (!report || running) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `zoeydaw-transport-probe-${report.createdAt.replaceAll(":", "-")}.json`
    document.body.append(link)
    link.click()
    link.remove()
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      downloads.current.delete(url)
    }, 1000)
    downloads.current.set(url, timer)
  }

  return (
    <main className="bg-background text-foreground h-full overflow-auto p-4" data-realtime-probe>
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header>
          <h1 className="text-xl font-semibold">{t("realtimeProbe.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("realtimeProbe.scope")}</p>
        </header>
        {!nativeAvailable && <p role="alert">{t("realtimeProbe.nativeRequired")}</p>}
        <ProbeParameters
          mode={mode}
          setMode={setMode}
          bytes={bytes}
          setBytes={setBytes}
          scenario={scenario}
          setScenario={setScenario}
          duration={duration}
          setDuration={setDuration}
          running={running}
        />
        <p className="text-muted-foreground text-xs">{t("realtimeProbe.payloadNote")}</p>
        <p className="text-muted-foreground text-xs">{t("realtimeProbe.blockingWarning")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={running || !nativeAvailable}
            onClick={() => {
              void run()
            }}
          >
            {t("realtimeProbe.run")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!running}
            onClick={() => active.current?.abort()}
          >
            {t("realtimeProbe.cancel")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={running || !report?.cases.length}
            onClick={download}
          >
            {t("realtimeProbe.download")}
          </Button>
          <output className="text-muted-foreground text-xs" aria-live="polite">
            {running
              ? progress
                ? `${progress.caseKey} · ${t(`realtimeProbe.${progress.state}`)} · ${t("realtimeProbe.elapsed")} ${number(progress.elapsedMs / 1000)}s · ${t("realtimeProbe.received")} ${progress.received} · ${t("realtimeProbe.painted")} ${progress.painted}`
                : t("realtimeProbe.preparing")
              : report
                ? t("realtimeProbe.finished")
                : ""}
          </output>
        </div>
        {issue && (
          <p className="text-destructive text-sm" role="alert">
            {issue}
          </p>
        )}
        <canvas
          ref={canvas}
          className="text-primary bg-muted/30 h-16 w-full"
          aria-label={t("realtimeProbe.canvas")}
        />
        <p className="text-muted-foreground text-xs">{t("realtimeProbe.paintNote")}</p>
        <ProbeResults report={report} />
      </div>
    </main>
  )
}
