import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton } from "@zoeymind/ui"
import { Plus } from "lucide-react"
import { useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { createDevice, DEVICE_KINDS } from "@zoeydaw/project-core/devices"
import type { Device, DeviceKind } from "@zoeydaw/project-core/devices"
import type { Track } from "@zoeydaw/project-core/types"
import type { DragEvent, KeyboardEvent } from "react"
import { DeviceCard } from "./DeviceCard"
import { editDevices, reorderDevice } from "./edit-devices"
import { PluginInsert } from "./PluginInsert"

interface ReorderRequest {
  id: string
  beforeId: string | null
}
const EMPTY_DEVICES: readonly Device[] = []

function TrackDeviceChain({ track }: { readonly track: Track }) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const drag = useRef<string | null>(null)
  const devices = track.devices ?? EMPTY_DEVICES
  const reorder = useProjectEditGesture(({ id, beforeId }: ReorderRequest) => {
    editDevices(track.id, current => {
      if (id === beforeId) return current
      const remaining = current.filter(device => device.id !== id)
      const destination =
        beforeId === null ? remaining.length : remaining.findIndex(device => device.id === beforeId)
      if (destination < 0) return current
      return reorderDevice(current, id, destination)
    })
  })
  useEffect(() => {
    const cancel = () => {
      if (drag.current === null) return
      drag.current = null
      setDraggingId(null)
      setDropTarget(null)
      reorder.onGestureCancel()
    }
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || drag.current === null) return
      event.preventDefault()
      cancel()
    }
    window.addEventListener("blur", cancel)
    window.addEventListener("keydown", keydown)
    return () => {
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", keydown)
      cancel()
    }
  }, [reorder])
  useEffect(() => {
    if (drag.current === null || devices.some(device => device.id === drag.current)) return
    drag.current = null
    setDraggingId(null)
    setDropTarget(null)
    reorder.onGestureCancel()
  }, [devices, reorder])

  const updateDevice = (id: string, update: (device: Device) => Device) => {
    editDevices(track.id, current =>
      current.map(device => (device.id === id ? update(device) : device))
    )
  }
  const removeDevice = (id: string) => {
    editDevices(track.id, current => current.filter(device => device.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  const moveDevice = (id: string, direction: -1 | 1) => {
    editDevices(track.id, current =>
      reorderDevice(current, id, current.findIndex(device => device.id === id) + direction)
    )
  }
  const finishDrop = (event: DragEvent<HTMLElement>, beforeId: string | null) => {
    const id = drag.current
    if (id === null) return
    event.preventDefault()
    event.stopPropagation()
    reorder.onChange({ id, beforeId })
    drag.current = null
    setDraggingId(null)
    setDropTarget(null)
    reorder.onGestureEnd()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, device: Device, index: number) => {
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
    )
      return
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault()
      event.stopPropagation()
      moveDevice(device.id, event.key === "ArrowLeft" ? -1 : 1)
      return
    }
    if (!(event.target instanceof Element) || !event.target.closest("[data-device-select]")) return
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      event.stopPropagation()
      removeDevice(device.id)
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      event.stopPropagation()
      const sibling =
        event.currentTarget.parentElement?.children[index + (event.key === "ArrowLeft" ? -1 : 1)]
      if (sibling instanceof HTMLElement)
        sibling.querySelector<HTMLElement>("[data-device-select]")?.focus()
    } else if (event.key === "Enter") {
      event.preventDefault()
      updateDevice(device.id, current => ({ ...current, collapsed: !current.collapsed }))
    }
  }
  const addDevice = (kind: DeviceKind) => {
    const device = createDevice(kind)
    editDevices(track.id, current => [...current, device])
    setSelectedId(device.id)
  }
  return (
    <section
      className="gap-control-gap p-control-gap flex h-full min-h-0 min-w-0 flex-col text-xs"
      aria-label={t("detailDevices.trackDevices", { track: track.name })}
    >
      <header className="gap-control-gap flex shrink-0 items-center">
        <span className="text-muted-foreground min-w-0 truncate">{track.name}</span>
        <span className="text-muted-foreground shrink-0" aria-hidden="true">
          ›
        </span>
        <span className="shrink-0" title={t("detailDevices.prototypeHelp")}>
          {t("detailDevices.title")}
        </span>
        <span className="min-w-0 flex-1" />
        <PluginInsert trackId={track.id} />
        <DropdownButton<DeviceKind | "add">
          value="add"
          onChange={kind => {
            if (kind !== "add") addDevice(kind)
          }}
          renderValue={() => t("detailDevices.add")}
          label={t("detailDevices.add")}
          icon={<Plus />}
          size="compact"
          side="top"
          align="end"
          matchTriggerWidth={false}
          mappable={false}
          items={DEVICE_KINDS.map(kind => ({ id: kind, label: t(`detailDevices.kinds.${kind}`) }))}
        />
      </header>
      <div
        className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
        onDragOver={event => {
          if (drag.current === null) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "move"
          setDropTarget(null)
        }}
        onDrop={event => finishDrop(event, null)}
      >
        {devices.length === 0 ? (
          <div className="border-border text-muted-foreground gap-control-gap p-control-pad-x flex min-h-0 min-w-full flex-1 flex-col items-center justify-center rounded-sm border border-dashed text-center">
            <span>
              {t(track.kind === "midi" ? "detailDevices.emptyMidi" : "detailDevices.emptyAudio")}
            </span>
            <span className="text-[10px]">{t("detailDevices.emptyHelp")}</span>
          </div>
        ) : (
          <ol
            className="gap-control-gap m-0 flex h-full min-w-full list-none p-0"
            aria-label={t("detailDevices.chain")}
          >
            {devices.map((device, index) => (
              <DeviceCard
                key={device.id}
                trackId={track.id}
                device={device}
                selected={selectedId === device.id}
                first={index === 0}
                last={index === devices.length - 1}
                dragging={draggingId === device.id}
                dropTarget={draggingId !== null && dropTarget === device.id}
                onSelect={() => setSelectedId(device.id)}
                onToggle={() =>
                  updateDevice(device.id, current => ({ ...current, enabled: !current.enabled }))
                }
                onFold={() =>
                  updateDevice(device.id, current => ({
                    ...current,
                    collapsed: !current.collapsed,
                  }))
                }
                onDelete={() => removeDevice(device.id)}
                onMove={direction => moveDevice(device.id, direction)}
                onKeyDown={event => handleKeyDown(event, device, index)}
                onDragStart={event => {
                  reorder.onGestureStart()
                  drag.current = device.id
                  setDraggingId(device.id)
                  setSelectedId(device.id)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("application/x-zoeydaw-device", device.id)
                }}
                onDragOver={event => {
                  if (drag.current === null) return
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = "move"
                  setDropTarget(device.id)
                }}
                onDrop={event => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  if (event.clientX < rect.left + rect.width / 2) finishDrop(event, device.id)
                  else {
                    const current =
                      useProjectState.getState().document.tracks.find(item => item.id === track.id)
                        ?.devices ?? []
                    const position = current.findIndex(item => item.id === device.id)
                    finishDrop(event, current[position + 1]?.id ?? null)
                  }
                }}
                onDragEnd={() => {
                  if (drag.current === null) return
                  drag.current = null
                  setDraggingId(null)
                  setDropTarget(null)
                  reorder.onGestureCancel()
                }}
              />
            ))}
            <li
              aria-hidden="true"
              className={`min-w-16 flex-1 border-l-2 ${draggingId !== null && dropTarget === null ? "border-primary" : "border-transparent"}`}
            />
          </ol>
        )}
      </div>
      <span id={`device-help-${track.id}`} className="sr-only">
        {t("detailDevices.keyboardHelp")}
      </span>
      <footer className="text-muted-foreground gap-control-pad-x flex shrink-0 text-[10px]">
        <span title={t("detailDevices.prototypeHelp")}>{t("detailDevices.prototype")}</span>
        {draggingId !== null && <span role="status">{t("detailDevices.reorderHint")}</span>}
      </footer>
    </section>
  )
}

export function EffectChain({ track }: { readonly track: Track | null }) {
  const { t } = useTranslation()
  const current = useProjectState(state =>
    state.document.tracks.find(item => item.id === track?.id)
  )
  if (!current)
    return (
      <div
        className="text-muted-foreground p-control-pad-x flex h-full items-center justify-center text-xs"
        role="status"
      >
        {t("detailDevices.noTrack")}
      </div>
    )
  return <TrackDeviceChain key={current.id} track={current} />
}
