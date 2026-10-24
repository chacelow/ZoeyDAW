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

type DeviceOperation = "refreshing" | "applying" | "panel"

export function useAudioDeviceSettings() {
  const { t } = useTranslation()
  const status = useSyncExternalStore(subscribeNativeAudioStatus, readNativeAudioStatus)
  const [operation, setOperation] = useState<DeviceOperation | "idle">("idle")
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<AudioDeviceConfiguration | null>(null)
  const [preview, setPreview] = useState<CapabilityPreview>({ kind: "idle" })
  const [capabilityRevision, setCapabilityRevision] = useState(0)
  const generation = useRef({ value: 0 })
  const capabilityGeneration = useRef({ value: 0 })
  const available = nativeAudio.available()
  const device = status.device
  const busy = operation !== "idle"
  const host = draft?.host
  const inputDeviceId = draft?.inputDeviceId ?? null
  const outputDeviceId = draft?.outputDeviceId ?? null

  const runDeviceOperation = useCallback(
    async (
      operation: DeviceOperation,
      request: () => Promise<AudioDeviceSnapshot>,
      accept: (next: AudioDeviceSnapshot) => void
    ) => {
      const token = ++generation.current.value
      setOperation(operation)
      setError(null)
      try {
        const next = await request()
        if (token !== generation.current.value) return
        publishNativeAudioStatus({ device: next, error: next.error })
        accept(next)
      } catch (error) {
        if (token === generation.current.value) setError(audioErrorMessage(error))
      } finally {
        if (token === generation.current.value) setOperation("idle")
      }
    },
    []
  )

  const refresh = useCallback(
    () =>
      runDeviceOperation(
        "refreshing",
        () => nativeAudio.devices(),
        next => {
          setDraft(previous => previous ?? initialDraft(next))
          setCapabilityRevision(value => value + 1)
        }
      ),
    [runDeviceOperation]
  )

  useEffect(() => {
    const lifecycle = generation.current
    const capabilities = capabilityGeneration.current
    if (available) void refresh()
    return () => {
      ++lifecycle.value
      ++capabilities.value
    }
  }, [available, refresh])

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

  function changeDevices(next: AudioDeviceConfiguration) {
    ++capabilityGeneration.current.value
    setError(null)
    setPreview({ kind: "loading" })
    setDraft(next)
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
    preview.kind === "ready" && draft && sameDevices(preview.value, draft) ? preview.value : null
  const choices = deviceChoices(device, draft)
  const canApply = !busy && canApplyDraft(draft, capabilities, choices)

  async function apply() {
    if (!draft || !canApply) return
    const request = draft
    return runDeviceOperation(
      "applying",
      () => nativeAudio.configureDevice(request),
      next => {
        if (next.state === "ready" && next.configuration) {
          setDraft(next.configuration)
          setPreview({ kind: "ready", value: next.capabilities })
        } else setError(next.error ?? t("audioSettings.notApplied"))
      }
    )
  }

  const configurationChanged =
    draft && JSON.stringify(draft) !== JSON.stringify(device?.configuration)
  const message =
    error ?? (preview.kind === "error" ? preview.message : null) ?? device?.error ?? status.error

  return {
    available,
    device,
    issues: status.issues,
    busy,
    operation,
    draft,
    setDraft,
    preview,
    capabilities,
    choices,
    canApply,
    configurationChanged,
    message,
    refresh,
    changeDevices,
    openControlPanel,
    apply,
  }
}
