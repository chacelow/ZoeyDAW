import { useTranslation } from "@zoeymind/i18n"
import { Button, DropdownButton } from "@zoeymind/ui"
import type { DropdownButtonItem } from "@zoeymind/ui"
import { projectActions, useProjectState, usePluginParameters } from "@/pages/project/adapters"
import { deviceParameterKeys } from "@zoeydaw/project-core/devices"
import {
  automationTargetKey,
  sameAutomationTarget,
  selectedAutomationTarget,
} from "@zoeydaw/project-core/automation-target"
import { EXTRA_AUTOMATION_HEIGHT } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { AutomationTarget, Track } from "@zoeydaw/project-core/types"
const EMPTY_TARGETS: readonly AutomationTarget[] = []

function targetFor(track: Track, deviceId: string, parameter: string): AutomationTarget | null {
  if (deviceId === "mixer")
    return parameter === "volume" || parameter === "pan" ? { kind: "mixer", parameter } : null
  const device = deviceId.startsWith("device:")
    ? track.devices?.find(item => item.id === deviceId.slice("device:".length))
    : undefined
  if (!device) return null
  const field = deviceParameterKeys(device).find(key => key === parameter)
  return field ? { kind: "device", deviceId: device.id, parameter: field } : null
}

function TargetSelectors({
  track,
  target,
  onChange,
}: {
  readonly track: Track
  readonly target: AutomationTarget | null
  readonly onChange: (target: AutomationTarget | null) => void
}) {
  const { t } = useTranslation()
  const deviceId =
    target?.kind === "mixer"
      ? "mixer"
      : target?.kind === "device"
        ? `device:${target.deviceId}`
        : "none"
  const device =
    target?.kind === "device" ? track.devices?.find(item => item.id === target.deviceId) : undefined
  const metadata = usePluginParameters(device?.kind === "external" ? device : undefined)
  const parameterItems: DropdownButtonItem<string>[] =
    deviceId === "mixer"
      ? [
          { id: "volume", label: t("arrangement.volume") },
          { id: "pan", label: t("arrangement.pan") },
        ]
      : device
        ? deviceParameterKeys(device).flatMap(key => {
            if (device.kind !== "external")
              return [{ id: key, label: t(`detailDevices.parameters.${key}`) }]
            const parameter = metadata.parameters.find(parameter => parameter.id === key)
            if (parameter?.hidden && target?.parameter !== key) return []
            return [
              {
                id: key,
                label: parameter?.title || key,
                disabled:
                  parameter?.readOnly || (parameter !== undefined && !parameter.automatable),
              },
            ]
          })
        : []
  if (metadata.error)
    parameterItems.push({ type: "heading", id: "metadata-error", label: metadata.error })
  return (
    <div className="flex min-w-0 gap-1" data-automation-target-selectors={track.id}>
      <DropdownButton<string>
        size="compact"
        label={`${t("arrangement.automationDevice")} ${track.name}`}
        value={deviceId}
        onChange={next => {
          if (next === "none") onChange(null)
          else if (next === "mixer") onChange({ kind: "mixer", parameter: "volume" })
          else if (next.startsWith("device:")) {
            const nextId = next.slice("device:".length)
            const nextDevice = track.devices?.find(item => item.id === nextId)
            const parameter = nextDevice && deviceParameterKeys(nextDevice)[0]
            onChange(parameter ? { kind: "device", deviceId: nextId, parameter } : null)
          }
        }}
        items={[
          { id: "none", label: t("arrangement.automationNone") },
          ...(track.kind !== "midi"
            ? [{ id: "mixer", label: t("arrangement.automationMixer") }]
            : []),
          ...(track.devices ?? []).map((item, index) => ({
            id: `device:${item.id}`,
            label: `${item.kind === "external" ? item.plugin.name : t(`detailDevices.kinds.${item.kind}`)} ${index + 1}`,
          })),
        ]}
        className="min-w-0 flex-1"
      />
      <DropdownButton<string>
        size="compact"
        label={`${t("arrangement.automationParameter")} ${track.name}`}
        value={target?.parameter ?? "none"}
        onChange={next => onChange(targetFor(track, deviceId, next))}
        items={parameterItems}
        disabled={parameterItems.length === 0}
        className="min-w-0 flex-1"
      />
    </div>
  )
}

export function AutomationSelector({ track }: { readonly track: Track }) {
  const selected = useProjectState(s => s.session.automationTargets[track.id])
  const target = selectedAutomationTarget(track, selected)
  return (
    <TargetSelectors
      track={track}
      target={target}
      onChange={next => projectActions.setAutomationTarget(track.id, next)}
    />
  )
}

export function AddAutomationLane({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  const selected = useProjectState(s => s.session.automationTargets[track.id])
  const displayed = useProjectState(s => s.workspace.automationLanes[track.id] ?? EMPTY_TARGETS)
  const target = selectedAutomationTarget(track, selected)
  return (
    <Button
      type="button"
      size="control-icon"
      className="shrink-0"
      disabled={
        !target || (target !== null && displayed.some(item => sameAutomationTarget(item, target)))
      }
      aria-label={`${t("arrangement.addAutomationLane")} ${track.name}`}
      onClick={event => {
        event.stopPropagation()
        projectActions.addAutomationLane(track.id)
      }}
    >
      +
    </Button>
  )
}

export function AutomationLaneHeader({
  track,
  target,
  top,
}: {
  readonly track: Track
  readonly target: AutomationTarget
  readonly top: number
}) {
  const { t } = useTranslation()
  return (
    <div
      className="absolute inset-x-0 flex flex-col justify-center gap-1 border-b border-[var(--arrangement-line)] bg-[var(--arrangement-ruler)] px-1"
      style={{ top, height: EXTRA_AUTOMATION_HEIGHT }}
      data-automation-lane={automationTargetKey(target)}
    >
      <TargetSelectors
        track={track}
        target={target}
        onChange={next => projectActions.replaceAutomationLane(track.id, target, next)}
      />
      <button
        type="button"
        className="text-muted-foreground self-end text-xs"
        aria-label={`${t("arrangement.removeAutomationLane")} ${track.name}`}
        onClick={() => projectActions.removeAutomationLane(track.id, target)}
      >
        {t("arrangement.removeAutomationLane")}
      </button>
    </div>
  )
}
