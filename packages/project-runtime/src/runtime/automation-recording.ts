import {
  automationLaneId,
  automationTargetSource,
  isAutomationTarget,
  sameAutomationTarget,
} from "@zoeydaw/project-core/automation-target"
import {
  automationValueAt,
  normalizedAutomationValue,
} from "@zoeydaw/project-core/automation-curve"
import type {
  AutomationPoint,
  AutomationTarget,
  ProjectEditToken,
} from "@zoeydaw/project-core/types"
import type { BackendTelemetry } from "@zoeydaw/project-core/backend"
import type { createProjectEditing } from "./project-editing"
import type { ProjectRuntimeDependencies } from "./runtime-contracts"

type Mode = "read" | "touch" | "latch"
type Take = {
  token: ProjectEditToken
  trackId: string
  target: AutomationTarget
  original: readonly AutomationPoint[]
  fallback: number
  points: AutomationPoint[]
  lastBar: number
  value: number
}
const EDGE = 0.000002

export function createAutomationRecording({
  store,
  editing,
  ready,
}: {
  store: ProjectRuntimeDependencies["store"]
  editing: ReturnType<typeof createProjectEditing>
  ready: () => boolean
}) {
  let frame: { value: BackendTelemetry; received: number } | null = null
  let take: Take | null = null
  let publishing = false
  const get = () => store.getState()
  function clock(): number | null {
    return ready() &&
      get().session.playing &&
      frame?.value.playing &&
      performance.now() - frame.received <= 250
      ? frame.value.clock.bar
      : null
  }
  function boundary(active: Take, bar: number): AutomationPoint {
    const right = active.original.findIndex(point => point.bar > bar)
    const left = active.original[right - 1]
    const end = active.original[right]
    return {
      id: crypto.randomUUID(),
      bar,
      value: automationValueAt(active.original, bar, active.fallback),
      ...(left && end
        ? { curve: ((left.curve ?? 0) * (end.bar - bar)) / (end.bar - left.bar) }
        : {}),
    }
  }
  function publish(active: Take, restore: boolean) {
    if (!editing.isCurrentEdit(active.token)) {
      take = null
      return
    }
    const state = get()
    const start = active.points[0].bar
    const end = active.lastBar
    const prefix = active.original
      .filter(point => point.bar < start - EDGE * 2)
      .map(point => ({ ...point }))
    const last = prefix.at(-1)
    const next = last && active.original.find(point => point.bar > last.bar)
    if (last && next)
      last.curve = ((last.curve ?? 0) * (start - EDGE - last.bar)) / (next.bar - last.bar)
    const points = [
      ...prefix,
      ...(start > 1 + EDGE ? [boundary(active, start - EDGE)] : []),
      ...active.points.map(point => ({ ...point })),
      ...(restore
        ? [
            boundary(active, end + EDGE),
            ...active.original.filter(point => point.bar > end + EDGE * 2),
          ]
        : []),
    ]
    publishing = true
    try {
      editing.document({
        ...state.document,
        tracks: state.document.tracks.map(track => {
          if (track.id !== active.trackId) return track
          const lane = track.automation.find(item =>
            sameAutomationTarget(item.target, active.target)
          )
          const replacement = {
            id: lane?.id ?? automationLaneId(track.id, active.target),
            target: active.target,
            points,
          }
          return {
            ...track,
            automation: lane
              ? track.automation.map(item => (item === lane ? replacement : item))
              : [...track.automation, replacement],
          }
        }),
      })
    } finally {
      publishing = false
    }
  }
  function finish(cancel = false) {
    const active = take
    take = null
    if (!active || !editing.isCurrentEdit(active.token)) return
    if (cancel) editing.cancelEdit(active.token)
    else {
      publish(active, true)
      editing.endEdit(active.token)
    }
  }
  function sample(bar: number) {
    const active = take
    if (!active) return
    if (!editing.isCurrentEdit(active.token)) {
      take = null
      return
    }
    if (bar < active.lastBar - EDGE) {
      finish()
      return
    }
    if (bar === active.lastBar && active.points.at(-1)?.value === active.value) return
    active.lastBar = bar
    if (active.points.length >= 65532) {
      finish()
      return
    }
    const last = active.points.at(-1)
    if (last && bar - last.bar < EDGE)
      active.points[active.points.length - 1] = { ...last, bar, value: active.value }
    else active.points.push({ id: crypto.randomUUID(), bar, value: active.value })
    publish(active, false)
  }
  return {
    setAutomationRecordMode(mode: Mode) {
      if (!["read", "touch", "latch"].includes(mode)) return
      finish()
      store.setState(state => ({ session: { ...state.session, automationRecordMode: mode } }))
    },
    beginAutomationGesture(
      trackId: string,
      target: AutomationTarget,
      value: number
    ): ProjectEditToken | null {
      finish()
      const state = get(),
        bar = clock(),
        track = state.document.tracks.find(item => item.id === trackId)
      if (
        state.session.automationRecordMode === "read" ||
        bar === null ||
        !track ||
        !isAutomationTarget(target, track) ||
        !Number.isFinite(value)
      )
        return null
      const token = editing.beginEdit("automation-recording")
      const normalized = normalizedAutomationValue(target, value)
      const fallback = normalizedAutomationValue(
        target,
        target.kind === "mixer" && target.parameter === "tempo"
          ? state.document.transport.bpm
          : automationTargetSource(track, target)
      )
      take = {
        token,
        trackId,
        target,
        original:
          track.automation.find(lane => sameAutomationTarget(lane.target, target))?.points ?? [],
        fallback,
        points: [{ id: crypto.randomUUID(), bar, value: normalized }],
        lastBar: bar,
        value: normalized,
      }
      publish(take, false)
      return token
    },
    changeAutomationGesture(token: ProjectEditToken, value: number) {
      if (!take || take.token !== token || !Number.isFinite(value)) return
      const bar = clock()
      if (bar === null) {
        finish()
        return
      }
      take.value = normalizedAutomationValue(take.target, value)
      sample(bar)
    },
    endAutomationGesture(token: ProjectEditToken, cancel = false) {
      if (!take || take.token !== token) return
      if (cancel || get().session.automationRecordMode !== "latch") finish(cancel)
    },
    observeAutomation(value: BackendTelemetry) {
      frame = { value, received: performance.now() }
      if (take && !publishing) {
        if (value.playing) sample(value.clock.bar)
        else finish()
      }
    },
    finishAutomationRecording() {
      finish()
      frame = null
    },
    clearAutomationRecording() {
      take = null
      frame = null
    },
  }
}
