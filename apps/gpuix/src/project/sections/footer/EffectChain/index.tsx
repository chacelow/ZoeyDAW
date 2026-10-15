import { useCallback, useEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ScrollArea,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useProjectEditGesture } from "@/project/adapters"
import { createDevice, DEVICE_KINDS } from "@/project/model/devices"
import type { Device, DeviceKind } from "@/project/model/devices"
import type { Track } from "@/project/model/types"
import type { EventPayload, Props, PublicInstance } from "@gpuix/react"
import type { FooterLabels } from "../labels"
import { DeviceCard } from "./DeviceCard"
import { editDevices, reorderDevice } from "./edit-devices"

const EMPTY_DEVICES: readonly Device[] = []

export interface EffectChainProps {
  readonly track: Track | null
  readonly labels: FooterLabels
  readonly subscribeWindowActive: (listener: (active: boolean) => void) => () => void
}

function TrackDeviceChain({
  track,
  labels,
  subscribeWindowActive,
}: EffectChainProps & { readonly track: Track }) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; beforeId: string | null } | null>(null)
  const nodes = useRef(new Map<string, PublicInstance>())
  const handles = useRef(new Map<string, PublicInstance>())
  const drag = useRef<{ id: string; x: number; moved: boolean; beforeId: string | null } | null>(
    null
  )
  const devices = track.devices ?? EMPTY_DEVICES
  const reorder = useProjectEditGesture(
    ({ id, beforeId }: { id: string; beforeId: string | null }) => {
      editDevices(track.id, current => {
        if (id === beforeId) return current
        const remaining = current.filter(device => device.id !== id)
        const destination =
          beforeId === null
            ? remaining.length
            : remaining.findIndex(device => device.id === beforeId)
        return destination < 0 ? current : reorderDevice(current, id, destination)
      })
    }
  )
  const cancel = useCallback(() => {
    drag.current = null
    setPreview(null)
  }, [])
  useEffect(
    () =>
      subscribeWindowActive(active => {
        if (!active) cancel()
      }),
    [subscribeWindowActive, cancel]
  )
  useEffect(() => cancel, [cancel])
  useEffect(() => {
    if (drag.current && !devices.some(device => device.id === drag.current?.id)) cancel()
  }, [devices, cancel])
  function update(id: string, change: (device: Device) => Device) {
    editDevices(track.id, current =>
      current.map(device => (device.id === id ? change(device) : device))
    )
  }
  function remove(id: string) {
    editDevices(track.id, current => current.filter(device => device.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  function move(id: string, direction: -1 | 1) {
    editDevices(track.id, current =>
      reorderDevice(current, id, current.findIndex(device => device.id === id) + direction)
    )
  }
  function updateDrag(event: EventPayload) {
    const active = drag.current
    if (!active || event.x === undefined) return
    if (
      Math.abs(event.x - active.x) < theme.control["--spacing-control-track-gap"] &&
      !active.moved
    )
      return
    active.moved = true
    active.beforeId = null
    for (const device of devices) {
      if (device.id === active.id) continue
      const node = nodes.current.get(device.id)
      const bounds = node ? renderer?.getElementBounds?.(node.id) : null
      if (bounds && event.x < bounds.x + bounds.width / 2) {
        active.beforeId = device.id
        break
      }
    }
    setPreview({ id: active.id, beforeId: active.beforeId })
  }
  function finish(event: EventPayload) {
    updateDrag(event)
    const active = drag.current
    cancel()
    if (active?.moved) {
      reorder.onGestureStart()
      reorder.onChange({ id: active.id, beforeId: active.beforeId })
      reorder.onGestureEnd()
    }
  }
  function keyboard(
    event: Parameters<NonNullable<Props["onKeyDown"]>>[0],
    device: Device,
    index: number
  ) {
    if (event.key === "escape") {
      cancel()
      return
    }
    if ((event.key === "left" || event.key === "right") && event.modifiers?.alt) {
      event.preventDefault()
      event.stopPropagation()
      move(device.id, event.key === "left" ? -1 : 1)
    } else if (event.key === "delete" || event.key === "backspace") {
      event.preventDefault()
      event.stopPropagation()
      remove(device.id)
    } else if (event.key === "left" || event.key === "right") {
      event.preventDefault()
      event.stopPropagation()
      const sibling = devices[index + (event.key === "left" ? -1 : 1)]
      const handle = sibling ? handles.current.get(sibling.id) : null
      if (handle) renderer?.focusElement?.(handle.id)
    } else if (event.key === "enter")
      update(device.id, current => ({ ...current, collapsed: !current.collapsed }))
  }
  function add(kind: DeviceKind) {
    const device = createDevice(kind)
    editDevices(track.id, current => [...current, device])
    setSelectedId(device.id)
  }
  const gap = theme.control["--spacing-control-gap"]
  return (
    <div
      role="region"
      aria-label={`${track.name} ${labels.title}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        gap,
        padding: gap,
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "row", alignItems: "center", gap, flexShrink: 0 }}
      >
        <text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.control["--text-control-track"],
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >{`${track.name} › ${labels.title}`}</text>
        <div style={{ flexGrow: 1 }} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={labels.add}
              testId="device-add"
              icon={<Icon name="Plus" color={theme.colors.foreground} />}
            >
              {labels.add}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" aria-label={labels.add}>
            {DEVICE_KINDS.map(kind => (
              <DropdownMenuItem key={kind} testId={`device-add-${kind}`} onSelect={() => add(kind)}>
                {labels.kindNames[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ScrollArea orientation="horizontal" fill style={{ flexGrow: 1, height: 0 }}>
        {devices.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <text
              style={{ color: theme.colors.mutedForeground }}
            >{`${track.kind === "midi" ? labels.emptyMidi : labels.emptyAudio} ${labels.emptyHelp}`}</text>
          </div>
        ) : (
          <div
            role="list"
            aria-label={labels.chain}
            style={{ display: "flex", flexDirection: "row", gap, height: "100%", minWidth: "100%" }}
          >
            {devices.map((device, index) => (
              <DeviceCard
                key={device.id}
                device={device}
                trackId={track.id}
                labels={labels}
                selected={selectedId === device.id}
                first={index === 0}
                last={index === devices.length - 1}
                dragging={preview?.id === device.id}
                dropTarget={preview?.beforeId === device.id}
                register={node => {
                  if (node) nodes.current.set(device.id, node)
                  else nodes.current.delete(device.id)
                }}
                registerHandle={node => {
                  if (node) handles.current.set(device.id, node)
                  else handles.current.delete(device.id)
                }}
                onSelect={() => setSelectedId(device.id)}
                onToggle={() =>
                  update(device.id, current => ({ ...current, enabled: !current.enabled }))
                }
                onFold={() =>
                  update(device.id, current => ({ ...current, collapsed: !current.collapsed }))
                }
                onDelete={() => remove(device.id)}
                onMove={direction => move(device.id, direction)}
                handleProps={{
                  onFocus: () => setSelectedId(device.id),
                  onMouseDown: event => {
                    if (event.button !== undefined && event.button !== 0) return
                    setSelectedId(device.id)
                    drag.current = { id: device.id, x: event.x ?? 0, moved: false, beforeId: null }
                  },
                  onMouseMove: updateDrag,
                  onMouseUp: finish,
                  onBlur: cancel,
                  onKeyDown: event => keyboard(event, device, index),
                }}
              />
            ))}
            {preview && preview.beforeId === null ? (
              <div aria-hidden="true" style={{ width: 1, backgroundColor: theme.colors.primary }} />
            ) : null}
          </div>
        )}
      </ScrollArea>
      <text
        style={{
          color: theme.colors.mutedForeground,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        {preview ? `${labels.prototypeHelp} · ${labels.reorderHint}` : labels.prototypeHelp}
      </text>
    </div>
  )
}

export function EffectChain(props: EffectChainProps) {
  const theme = useTheme()
  if (!props.track)
    return (
      <div
        style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <text style={{ color: theme.colors.mutedForeground }}>{props.labels.noTrack}</text>
      </div>
    )
  return <TrackDeviceChain key={props.track.id} {...props} track={props.track} />
}
