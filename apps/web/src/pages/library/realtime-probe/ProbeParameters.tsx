import { useTranslation } from "@zoeymind/i18n"
import { Input, Label, NativeSelect, NativeSelectOption } from "@zoeymind/ui"
import type { ProbeMode, ProbeScenario } from "./model"

export function ProbeParameters({
  mode,
  setMode,
  bytes,
  setBytes,
  scenario,
  setScenario,
  duration,
  setDuration,
  running,
}: {
  readonly mode: ProbeMode | "all"
  readonly setMode: (value: ProbeMode | "all") => void
  readonly bytes: number | "all"
  readonly setBytes: (value: number | "all") => void
  readonly scenario: ProbeScenario | "all"
  readonly setScenario: (value: ProbeScenario | "all") => void
  readonly duration: string
  readonly setDuration: (value: string) => void
  readonly running: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="realtime-probe-mode">{t("realtimeProbe.mode")}</Label>
        <NativeSelect
          id="realtime-probe-mode"
          value={mode}
          disabled={running}
          onChange={event => {
            const value = event.currentTarget.value
            if (value === "all" || value === "pull" || value === "channel" || value === "credit")
              setMode(value)
          }}
        >
          <NativeSelectOption value="all">{t("realtimeProbe.all")}</NativeSelectOption>
          <NativeSelectOption value="pull">{t("realtimeProbe.pull")}</NativeSelectOption>
          <NativeSelectOption value="channel">{t("realtimeProbe.channel")}</NativeSelectOption>
          <NativeSelectOption value="credit">{t("realtimeProbe.credit")}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="realtime-probe-bytes">{t("realtimeProbe.payload")}</Label>
        <NativeSelect
          id="realtime-probe-bytes"
          value={bytes}
          disabled={running}
          onChange={event => {
            const value = event.currentTarget.value
            if (value === "all") setBytes(value)
            else if (value === "33792" || value === "32960") setBytes(Number(value))
          }}
        >
          <NativeSelectOption value="all">{t("realtimeProbe.all")}</NativeSelectOption>
          <NativeSelectOption value="33792">{t("realtimeProbe.payload33")}</NativeSelectOption>
          <NativeSelectOption value="32960">
            {t("realtimeProbe.payloadRepresentative")}
          </NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="realtime-probe-scenario">{t("realtimeProbe.scenario")}</Label>
        <NativeSelect
          id="realtime-probe-scenario"
          value={scenario}
          disabled={running}
          onChange={event => {
            const value = event.currentTarget.value
            if (value === "all" || value === "idle" || value === "block") setScenario(value)
          }}
        >
          <NativeSelectOption value="all">{t("realtimeProbe.all")}</NativeSelectOption>
          <NativeSelectOption value="idle">{t("realtimeProbe.idle")}</NativeSelectOption>
          <NativeSelectOption value="block">{t("realtimeProbe.block")}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="realtime-probe-duration">{t("realtimeProbe.duration")}</Label>
        <Input
          id="realtime-probe-duration"
          type="number"
          min={4}
          max={20}
          step={1}
          value={duration}
          disabled={running}
          onChange={event => setDuration(event.currentTarget.value)}
        />
      </div>
    </div>
  )
}
