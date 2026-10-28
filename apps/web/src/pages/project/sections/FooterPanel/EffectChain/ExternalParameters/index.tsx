import { useState, useSyncExternalStore } from "react"
import { Button, DragPadBar } from "@zoeymind/ui"
import { ExternalLink, List, SlidersHorizontal, X } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  usePluginEditor,
  useAutomationGesture,
  useProjectFilesState,
  useProjectState,
  usePluginRecoveryPending,
  usePluginParameters,
} from "@/pages/project/adapters"
import type { PluginParameter } from "@/shared/native/plugins"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import { editDevices } from "../edit-devices"
import { ParameterXYPad } from "./ParameterXYPad"
import { readNativePluginFaults, subscribeNativeAudioStatus } from "@/shared/native/audio"
import { PluginFaultFeedback } from "@/pages/project/plugin-recovery"

function ExternalParameterControl({
  trackId,
  device,
  parameter,
  disabled,
}: {
  readonly trackId: string
  readonly device: ExternalDevice
  readonly parameter: PluginParameter
  readonly disabled: boolean
}) {
  const value =
    device.parameters.find(item => item.id === parameter.id)?.normalized ?? parameter.normalized
  const gesture = useAutomationGesture(
    trackId,
    { kind: "device", deviceId: device.id, parameter: parameter.id },
    (normalized: number) => {
      editDevices(trackId, devices =>
        devices.map(current => {
          if (current.id !== device.id || current.kind !== "external") return current
          const existing = current.parameters.find(item => item.id === parameter.id)
          if (existing?.normalized === normalized) return current
          return {
            ...current,
            parameters: existing
              ? current.parameters.map(item =>
                  item.id === parameter.id ? { ...item, normalized } : item
                )
              : [...current.parameters, { id: parameter.id, normalized }],
          }
        })
      )
    },
    value
  )
  return (
    <div className="gap-control-gap flex min-w-0 items-center justify-between">
      <span className="text-muted-foreground min-w-0 truncate" title={parameter.title}>
        {parameter.title}
      </span>
      <DragPadBar
        label={parameter.title}
        size="compact"
        min={0}
        max={1}
        step={parameter.stepCount > 0 ? 1 / parameter.stepCount : 0.001}
        defaultValue={parameter.defaultValue ?? parameter.normalized}
        disabled={disabled || parameter.readOnly || !parameter.automatable}
        format={normalized => `${(normalized * 100).toFixed(1)}%`}
        parse={raw => Number(raw.replace("%", "").trim()) / 100}
        className="shrink-0"
        {...gesture}
      />
    </div>
  )
}

export function ExternalParameters({
  trackId,
  device,
}: {
  readonly trackId: string
  readonly device: ExternalDevice
}) {
  const sessionId = useProjectState(state => state.session.backend.sessionId)
  const phase = useProjectState(state => state.session.backend.phase)
  const fileBusy = useProjectFilesState(state => state.operation.kind !== "idle")
  const recovering = usePluginRecoveryPending(sessionId, device.id)
  const faults = useSyncExternalStore(subscribeNativeAudioStatus, readNativePluginFaults)
  const fault = faults.find(fault => fault.sessionId === sessionId && fault.deviceId === device.id)
  const [showAll, setShowAll] = useState(false)
  const [xId, setXId] = useState<string | null>(null)
  const [yId, setYId] = useState<string | null>(null)
  const { t } = useTranslation()
  const editor = usePluginEditor(trackId, device.id)
  const editing = editor.phase !== "closed"
  const { parameters, error } = usePluginParameters(
    device,
    showAll || editing || device.parameters.length > 0
  )
  const metadata = editor.parameters ?? parameters
  const configured = device.parameters
    .map(value => metadata.find(parameter => parameter.id === value.id))
    .filter((parameter): parameter is PluginParameter => parameter !== undefined)
  const visibleParameters = showAll ? metadata.filter(parameter => !parameter.hidden) : configured
  const updateParameter = (id: string, normalized: number) =>
    editDevices(trackId, devices =>
      devices.map(current => {
        if (current.id !== device.id || current.kind !== "external") return current
        const existing = current.parameters.find(parameter => parameter.id === id)
        return {
          ...current,
          parameters: existing
            ? current.parameters.map(parameter =>
                parameter.id === id ? { ...parameter, normalized } : parameter
              )
            : [...current.parameters, { id, normalized }],
        }
      })
    )
  return (
    <div className="gap-control-gap flex min-h-0 flex-col overflow-y-auto">
      {fault && <PluginFaultFeedback fault={fault} className="shrink-0" />}
      <div className="gap-control-gap flex shrink-0 items-center">
        <Button
          size="control-icon"
          variant="ghost"
          aria-label={t(
            editing ? "detailDevices.closePluginEditor" : "detailDevices.openPluginEditor"
          )}
          title={t(editing ? "detailDevices.closePluginEditor" : "detailDevices.openPluginEditor")}
          disabled={
            fileBusy ||
            recovering ||
            (Boolean(fault) && !editing) ||
            phase !== "ready" ||
            editor.phase === "opening" ||
            editor.phase === "closing"
          }
          onClick={() => void (editing ? editor.close() : editor.open())}
        >
          {editing ? <X aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}
        </Button>
        {editing && (
          <Button
            size="control"
            variant={editor.configuring ? "default" : "outline"}
            aria-pressed={editor.configuring}
            aria-label={t("detailDevices.configureParameters")}
            title={t("detailDevices.configureParameters")}
            onClick={() => editor.setConfigureMode(!editor.configuring)}
          >
            <SlidersHorizontal aria-hidden="true" />
          </Button>
        )}
        <Button
          size="control-icon"
          variant="ghost"
          aria-pressed={showAll}
          aria-label={t(
            showAll ? "detailDevices.hideAllParameters" : "detailDevices.showAllParameters"
          )}
          title={t(showAll ? "detailDevices.hideAllParameters" : "detailDevices.showAllParameters")}
          onClick={() => setShowAll(value => !value)}
        >
          <List aria-hidden="true" />
        </Button>
      </div>
      <ParameterXYPad
        parameters={configured}
        xId={xId}
        yId={yId}
        onAxisChange={(axis, id) => (axis === "x" ? setXId(id) : setYId(id))}
        onValueChange={updateParameter}
        label={t("detailDevices.xyPad")}
        noneLabel={t("detailDevices.noneParameter")}
        xLabel={t("detailDevices.xParameter")}
        yLabel={t("detailDevices.yParameter")}
      />
      {editor.error && (
        <span role="alert" className="text-destructive">
          {editor.error}
        </span>
      )}
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
      {visibleParameters.map(parameter => (
        <ExternalParameterControl
          key={parameter.id}
          trackId={trackId}
          device={device}
          parameter={parameter}
          disabled={editing || recovering}
        />
      ))}
    </div>
  )
}
