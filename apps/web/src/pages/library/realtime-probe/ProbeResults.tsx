import { useTranslation } from "@zoeymind/i18n"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@zoeymind/ui"
import type { ProbeRunReport } from "./model"

export function ProbeResults({ report }: { readonly report: ProbeRunReport | null }) {
  const { t } = useTranslation()
  const number = (value: number | null) => (value === null ? "—" : value.toFixed(2))
  return (
    <>
      {report?.cases.length ? (
        <Table className="min-w-[1700px] text-xs" data-probe-results>
          <TableHeader>
            <TableRow>
              <TableHead>{t("realtimeProbe.case")}</TableHead>
              <TableHead>{t("realtimeProbe.status")}</TableHead>
              <TableHead>
                {t("realtimeProbe.received")} / {t("realtimeProbe.painted")}
              </TableHead>
              <TableHead>{t("realtimeProbe.age")}</TableHead>
              <TableHead>{t("realtimeProbe.uncertainty")}</TableHead>
              <TableHead>{t("realtimeProbe.throughput")}</TableHead>
              <TableHead>{t("realtimeProbe.raf")}</TableHead>
              <TableHead>{t("realtimeProbe.pullRtt")}</TableHead>
              <TableHead>{t("realtimeProbe.maxFlight")}</TableHead>
              <TableHead>{t("realtimeProbe.dropped")}</TableHead>
              <TableHead>{t("realtimeProbe.sequenceGaps")}</TableHead>
              <TableHead>{t("realtimeProbe.recovery")}</TableHead>
              <TableHead>{t("realtimeProbe.blockActual")}</TableHead>
              <TableHead>{t("realtimeProbe.native")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.cases.map(result => (
              <TableRow key={result.caseKey} data-probe-result={result.caseKey}>
                <TableCell>{result.caseKey}</TableCell>
                <TableCell>{t(`realtimeProbe.${result.status}`)}</TableCell>
                <TableCell>
                  {result.counters.receivedFrames} / {result.counters.paintedFrames}
                </TableCell>
                <TableCell>
                  {number(result.ageUpperMs.p50)} / {number(result.ageUpperMs.p95)} /{" "}
                  {number(result.ageUpperMs.p99)}
                </TableCell>
                <TableCell>{number(result.clock?.uncertaintyMs ?? null)}</TableCell>
                <TableCell>
                  {number(
                    result.throughputBytesPerSecond === null
                      ? null
                      : result.throughputBytesPerSecond / 1024
                  )}
                </TableCell>
                <TableCell>
                  {number(result.observedRafHz)} / {number(result.rafIntervalMs.p95)}
                </TableCell>
                <TableCell>{number(result.pullRoundTripMs.p95)}</TableCell>
                <TableCell>{result.counters.maxPullInFlight}</TableCell>
                <TableCell>
                  {result.counters.overwrittenFrames} / {result.counters.oldFrames} /{" "}
                  {result.counters.invalidFrames}
                </TableCell>
                <TableCell>{result.counters.sequenceGaps}</TableCell>
                <TableCell>
                  {result.counters.recoveryGaps} / {result.counters.stalledPulls}
                </TableCell>
                <TableCell>{number(result.intentionalBlockMs)}</TableCell>
                <TableCell>
                  {result.nativeClose.kind === "closed"
                    ? `${result.nativeClose.counters.published} / ${result.nativeClose.counters.sent} / ${result.nativeClose.counters.retainedBytes}`
                    : t(`realtimeProbe.${result.nativeClose.kind}`)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">{t("realtimeProbe.noResults")}</p>
      )}
      {report?.cases.map(result =>
        result.error || result.nativeClose.kind === "error" ? (
          <p key={result.caseKey} className="text-destructive text-sm break-words" role="alert">
            {result.caseKey}:{" "}
            {result.error ?? (result.nativeClose.kind === "error" ? result.nativeClose.error : "")}
          </p>
        ) : null
      )}
      <div className="text-muted-foreground space-y-1 text-xs">
        <p>{t("realtimeProbe.restart")}</p>
        <p>{t("realtimeProbe.observed")}</p>
        <p>
          {t("realtimeProbe.platformNote")}: {t("realtimeProbe.notVerified")}
        </p>
        <p>{t("realtimeProbe.measurementNote")}</p>
        <p>{t("realtimeProbe.rawLimit")}</p>
      </div>
    </>
  )
}
