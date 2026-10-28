import { nativePlugins } from "@/shared/native/plugins"
import type { PluginParameter } from "@/shared/native/plugins"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import type { ProjectEditToken } from "@zoeydaw/project-core/types"
import { useProjectState } from "@/pages/project/stores/useProjectState"
import {
  beginEdit,
  cancelEdit,
  endEdit,
  isCurrentEdit,
  session,
  updateTrack,
  whenProjectBackendIdle,
} from "../context"

type EditorView = {
  phase: "closed" | "opening" | "open" | "closing"
  parameters: PluginParameter[] | null
  error: string | null
  configuring: boolean
}

type EditorCommands = { commit: () => Promise<void>; cancel: () => Promise<void> }
const openEditors = new Map<string, EditorCommands>()
export async function commitPluginEditors(): Promise<void> {
  await Promise.all(Array.from(openEditors.values(), editor => editor.commit()))
}
export async function cancelPluginEditor(deviceId: string): Promise<void> {
  await openEditors.get(deviceId)?.cancel()
}

export function createPluginEditor(trackId: string, deviceId: string, epoch: string) {
  let view: EditorView = { phase: "closed", parameters: null, error: null, configuring: false }
  const listeners = new Set<() => void>()
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> = Promise.resolve()
  let closing: Promise<void> | null = null
  let opening: Promise<void> = Promise.resolve()
  async function commitForSave() {
    await opening
    await finish(true)
    if (view.error) throw new Error(view.error)
  }
  const registration: EditorCommands = {
    commit: commitForSave,
    cancel: async () => {
      await opening
      await finish(false)
    },
  }
  function unregister() {
    if (openEditors.get(deviceId) === registration) openEditors.delete(deviceId)
  }
  let active: {
    sessionId: string
    instance: string
    token: ProjectEditToken
    device: ExternalDevice
  } | null = null
  const device = () => {
    const value = useProjectState
      .getState()
      .document.tracks.find(track => track.id === trackId)
      ?.devices?.find(item => item.id === deviceId)
    return value?.kind === "external" ? value : null
  }
  function publish(next: Partial<EditorView>) {
    view = { ...view, ...next }
    if (!disposed) for (const listener of listeners) listener()
  }
  function current() {
    const value = device()
    return (
      active !== null &&
      isCurrentEdit(active.token) &&
      value?.plugin.catalogId === active.device.plugin.catalogId &&
      value.stateRef?.sha256 === active.device.stateRef?.sha256
    )
  }
  function write(edit: (value: ExternalDevice) => ExternalDevice) {
    if (!current()) return
    const track = useProjectState.getState().document.tracks.find(item => item.id === trackId)
    if (!track) return
    const devices = (track.devices ?? []).map(item =>
      item.id === deviceId && item.kind === "external" ? edit(item) : item
    )
    if (devices.some((item, index) => item !== track.devices?.[index]))
      updateTrack(trackId, { devices })
  }
  function values(parameters: PluginParameter[]) {
    const editable = new Map(
      parameters
        .filter(parameter => parameter.automatable && !parameter.readOnly)
        .map(parameter => [parameter.id, parameter] as const)
    )
    write(value => {
      const next = value.parameters.map(parameter => {
        const metadata = editable.get(parameter.id)
        return metadata ? { ...parameter, normalized: metadata.normalized } : parameter
      })
      return next.every(
        (parameter, index) =>
          parameter.id === value.parameters[index]?.id &&
          parameter.normalized === value.parameters[index]?.normalized
      )
        ? value
        : { ...value, parameters: next }
    })
  }
  function configureParameter(id: string, parameters: PluginParameter[]) {
    if (!view.configuring || !current()) return
    const metadata = parameters.find(parameter => parameter.id === id)
    if (!metadata || !metadata.automatable || metadata.readOnly) return
    write(value =>
      value.parameters.some(parameter => parameter.id === id)
        ? value
        : { ...value, parameters: [...value.parameters, { id, normalized: metadata.normalized }] }
    )
  }
  async function finish(commit: boolean) {
    if (closing) return closing
    if (!active) return
    const owner = active
    clearTimeout(timer)
    publish({ phase: "closing" })
    closing = (async () => {
      let committedParameters: PluginParameter[] | null = null
      await inFlight
      const accept = commit && current()
      try {
        const response = await nativePlugins.editor(owner.sessionId, deviceId, {
          kind: accept ? "commit" : "cancel",
          instance: owner.instance,
        })
        if (
          accept &&
          response.kind === "committed" &&
          response.instance === owner.instance &&
          current()
        ) {
          values(response.parameters)
          write(value =>
            value.stateRef?.sha256 === response.stateRef.sha256
              ? value
              : { ...value, stateRef: response.stateRef }
          )
          endEdit(owner.token)
          committedParameters = response.parameters
          if (response.stateRef.sha256 === owner.device.stateRef?.sha256) {
            try {
              await nativePlugins.editor(owner.sessionId, deviceId, {
                kind: "release",
                instance: owner.instance,
              })
            } catch (error) {
              publish({ error: String(error) })
            }
          }
        } else {
          if (response.kind === "committed")
            await nativePlugins.editor(owner.sessionId, deviceId, {
              kind: "cancel",
              instance: owner.instance,
            })
          cancelEdit(owner.token)
        }
      } catch (error) {
        if (accept) {
          try {
            await nativePlugins.editor(owner.sessionId, deviceId, {
              kind: "cancel",
              instance: owner.instance,
            })
          } catch (cancelError) {
            publish({ error: `${String(error)}; ${String(cancelError)}` })
          }
        }
        cancelEdit(owner.token)
        if (!view.error) publish({ error: String(error) })
      } finally {
        active = null
        closing = null
        unregister()
        publish({ phase: "closed", parameters: committedParameters, configuring: false })
      }
    })()
    return closing
  }
  async function poll() {
    const owner = active
    if (!owner || view.phase !== "open") return
    if (!current()) {
      void finish(false)
      return
    }
    const response = await nativePlugins.editor(owner.sessionId, deviceId, {
      kind: "poll",
      instance: owner.instance,
    })
    if (!current() || response.kind !== "events" || response.instance !== owner.instance) {
      void finish(false)
      return
    }
    let parameters = response.parameters ?? view.parameters ?? []
    for (const event of response.events) {
      if (event.kind === "begin" || event.kind === "value") configureParameter(event.id, parameters)
      if (event.kind === "value" && response.parameters === null)
        parameters = parameters.map(parameter =>
          parameter.id === event.id ? { ...parameter, normalized: event.normalized } : parameter
        )
      if (event.kind === "dirty" && event.dirty) session({ dirty: true })
    }
    publish({ parameters })
    if (response.parameters || response.events.some(event => event.kind === "value"))
      values(parameters)
    if (!response.open) {
      void finish(true)
      return
    }
    if (view.phase === "open" && !disposed) timer = setTimeout(tick, 100)
  }
  function tick() {
    inFlight = poll().catch(error => {
      publish({ error: String(error) })
      void finish(false)
    })
  }
  function setConfigureMode(configuring: boolean) {
    publish({ configuring })
  }
  async function open() {
    if (disposed) return
    publish({ phase: "opening", error: null })
    const preceding = openEditors.get(deviceId)
    openEditors.set(deviceId, registration)
    let token: ProjectEditToken | null = null
    try {
      if (preceding && preceding !== registration) await preceding.commit()
      await whenProjectBackendIdle()
      const value = device()
      const backend = useProjectState.getState().session.backend
      if (
        disposed ||
        !value ||
        backend.phase !== "ready" ||
        useProjectState.getState().session.editEpoch !== epoch
      ) {
        publish({ phase: "closed" })
        return
      }
      token = beginEdit(`plugin-editor-${deviceId}`)
      const response = await nativePlugins.editor(backend.sessionId, deviceId, {
        kind: "open",
        parameters: value.parameters,
        catalogId: value.plugin.catalogId,
        stateHash: value.stateRef?.sha256 ?? null,
      })
      if (response.kind !== "opened") throw new Error("Invalid plugin editor open response")
      active = { sessionId: backend.sessionId, instance: response.instance, token, device: value }
      if (disposed || !current()) {
        await finish(false)
        return
      }
      publish({ phase: "open", parameters: response.parameters })
      tick()
    } catch (error) {
      if (token) cancelEdit(token)
      publish({ phase: "closed", error: String(error) })
    } finally {
      if (!active) unregister()
    }
  }
  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    open: () => {
      if (view.phase !== "closed") return opening
      opening = open()
      return opening
    },
    close: () => finish(true),
    setConfigureMode,
    attach: () => {
      disposed = false
      return () => {
        disposed = true
        clearTimeout(timer)
        void finish(true)
      }
    },
  }
}
