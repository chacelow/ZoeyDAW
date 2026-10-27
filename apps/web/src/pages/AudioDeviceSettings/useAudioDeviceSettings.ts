import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import {
  audioErrorMessage,
  nativeAudio,
  publishNativeAudioStatus,
  readNativeAudioStatus,
  subscribeNativeAudioStatus,
  type AudioDeviceCapabilities,
  type AudioDeviceConfiguration,
  type AudioDeviceSnapshot,
} from "@/shared/native/audio"
import {
  canApplyDraft,
  deviceChoices,
  fitCapabilities,
  initialDraft,
  sameDevices,
} from "./deviceConfiguration"

type CapabilityPreview =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; value: AudioDeviceCapabilities }
  | { kind: "error"; message: string }

type DeviceOperation = "applying" | "panel"

const discovery: { pending: Promise<AudioDeviceSnapshot> | null } = { pending: null }
function discoverDevices() {
  if (!discovery.pending) {
    const pending = nativeAudio.devices()
    discovery.pending = pending
    void pending
      .finally(() => {
        if (discovery.pending === pending) discovery.pending = null
      })
      .catch(() => {})
  }
  return discovery.pending
}

const operationQueue = { pending: Promise.resolve() }

export function useAudioDeviceSettings() {
  const { t } = useTranslation()
  const status = useSyncExternalStore(subscribeNativeAudioStatus, readNativeAudioStatus)
  const [operation, setOperation] = useState<DeviceOperation | "idle">("idle")
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<AudioDeviceConfiguration | null>(() =>
    status.device ? initialDraft(status.device) : null
  )
  const [preview, setPreview] = useState<CapabilityPreview>({ kind: "idle" })
  const [capabilityRevision, setCapabilityRevision] = useState(0)
  const [editRevision, setEditRevision] = useState(0)
  const lastAttempt = useRef(0)
  const draftRevision = useRef(0)
  const mounted = useRef(true)
  const generation = useRef({ value: 0 })
  const capabilityGeneration = useRef({ value: 0 })
  const available = nativeAudio.available()
  const device = status.device
  const busy = operation !== "idle"
  const host = draft?.host
  const inputDeviceId = draft?.inputDeviceId ?? null
  const outputDeviceId = draft?.outputDeviceId ?? null

  const runDeviceOperation = useCallback(
    (
      operation: DeviceOperation,
      request: () => Promise<AudioDeviceSnapshot>,
      accept: (next: AudioDeviceSnapshot) => void,
      reject?: () => void
    ) => {
      const token = ++generation.current.value
      setOperation(operation)
      setError(null)
      const pending = operationQueue.pending.then(async () => {
        if (token !== generation.current.value) return
        try {
          const next = await request()
          if (token !== generation.current.value) return
          publishNativeAudioStatus({ device: next, error: next.error })
          accept(next)
        } catch (error) {
          if (token === generation.current.value) {
            setError(audioErrorMessage(error))
            reject?.()
          }
        } finally {
          if (token === generation.current.value) setOperation("idle")
        }
      })
      operationQueue.pending = pending
      return pending
    },
    []
  )

  const discover = useCallback(async () => {
    const operationToken = generation.current.value
    const edit = draftRevision.current
    const previousDevice = readNativeAudioStatus().device
    try {
      const next = await discoverDevices()
      if (!mounted.current) return
      const currentDevice = readNativeAudioStatus().device
      const inventory = {
        devices: next.devices,
        hosts: next.hosts,
        inputDevices: next.inputDevices,
        outputDevices: next.outputDevices,
      }
      const current = operationToken === generation.current.value && edit === draftRevision.current
      const updated =
        current && currentDevice === previousDevice
          ? next
          : currentDevice
            ? { ...currentDevice, ...inventory }
            : next
      publishNativeAudioStatus({ device: updated, error: updated.error })
      setDraft(previous => previous ?? initialDraft(updated))
      if (current) {
        setCapabilityRevision(value => value + 1)
        setError(null)
      }
    } catch (error) {
      if (
        mounted.current &&
        operationToken === generation.current.value &&
        edit === draftRevision.current
      )
        setError(audioErrorMessage(error))
    }
  }, [])

  useEffect(() => {
    const lifecycle = generation.current
    const capabilities = capabilityGeneration.current
    mounted.current = true
    if (available) void discover()
    return () => {
      mounted.current = false
      ++lifecycle.value
      ++capabilities.value
    }
  }, [available, discover])

  useEffect(() => {
    if (!available || !host) return
    const lifecycle = capabilityGeneration.current
    const token = ++lifecycle.value
    const request = { host, inputDeviceId, outputDeviceId }
    setPreview({ kind: "loading" })
    void nativeAudio
      .deviceCapabilities(request)
      .then(capabilities => {
        if (token !== lifecycle.value) return
        if (!sameDevices(capabilities, request))
          throw new Error(t("audioSettings.capabilityMismatch"))
        setPreview({ kind: "ready", value: capabilities })
        setDraft(previous =>
          previous && sameDevices(previous, request)
            ? fitCapabilities(previous, capabilities)
            : previous
        )
      })
      .catch(error => {
        if (token === lifecycle.value)
          setPreview({ kind: "error", message: audioErrorMessage(error) })
      })
    return () => {
      ++lifecycle.value
    }
  }, [available, host, inputDeviceId, outputDeviceId, capabilityRevision, t])

  function changeConfiguration(next: AudioDeviceConfiguration) {
    if (draft && !sameDevices(draft, next)) {
      ++capabilityGeneration.current.value
      setPreview({ kind: "loading" })
    }
    ++draftRevision.current
    setError(null)
    setDraft(next)
    setEditRevision(value => value + 1)
  }

  async function openControlPanel() {
    if (!device?.capabilities.controlPanel || device.state !== "ready") return
    return runDeviceOperation(
      "panel",
      () => nativeAudio.openDeviceControlPanel(),
      () => setCapabilityRevision(value => value + 1)
    )
  }

  const capabilities =
    preview.kind === "ready" && draft && sameDevices(preview.value, draft)
      ? preview.value
      : device && draft && sameDevices(device.capabilities, draft)
        ? device.capabilities
        : null
  const choices = deviceChoices(device, draft)
  const valid = canApplyDraft(draft, capabilities, choices)
  const configurationChanged =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(device?.configuration)

  useEffect(() => {
    if (
      !available ||
      !draft ||
      !valid ||
      !configurationChanged ||
      operation !== "idle" ||
      editRevision === 0 ||
      lastAttempt.current === editRevision
    )
      return
    lastAttempt.current = editRevision
    const request = draft
    void runDeviceOperation(
      "applying",
      () => nativeAudio.configureDevice(request),
      next => {
        if (next.state === "ready" && next.configuration) {
          setDraft(next.configuration)
          setPreview({ kind: "ready", value: next.capabilities })
        } else {
          setDraft(initialDraft(next))
          setError(next.error ?? t("audioSettings.notApplied"))
        }
      },
      () => setDraft(device ? initialDraft(device) : null)
    )
  }, [
    available,
    draft,
    valid,
    configurationChanged,
    operation,
    editRevision,
    runDeviceOperation,
    t,
    device,
  ])

  const message =
    error ?? (preview.kind === "error" ? preview.message : null) ?? device?.error ?? status.error

  return {
    available,
    device,
    issues: status.issues,
    busy,
    operation,
    draft,
    changeConfiguration,
    preview,
    capabilities,
    choices,
    configurationChanged,
    message,
    discover,
    openControlPanel,
  }
}
