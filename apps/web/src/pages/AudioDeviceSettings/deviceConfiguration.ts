import type {
  AudioDeviceCapabilities,
  AudioDeviceCapabilitiesRequest,
  AudioDeviceConfiguration,
  AudioDeviceSnapshot,
} from "@/shared/native/audio"

export function sameDevices(
  left: AudioDeviceCapabilitiesRequest,
  right: AudioDeviceCapabilitiesRequest
) {
  return (
    left.host === right.host &&
    left.inputDeviceId === right.inputDeviceId &&
    left.outputDeviceId === right.outputDeviceId
  )
}

function defaultChannels(count: number) {
  return { mono: count === 1 ? [0] : [], stereo: count >= 2 ? [0] : [] }
}

export function initialDraft(device: AudioDeviceSnapshot): AudioDeviceConfiguration {
  if (device.configuration) return device.configuration
  const capabilities = device.capabilities
  const host = capabilities.host || device.host || device.hosts[0]?.id || ""
  const output =
    device.outputDevices.find(
      item => item.host === host && item.id === capabilities.outputDeviceId
    ) ?? device.outputDevices.find(item => item.host === host && item.outputChannels > 0)
  const channels = defaultChannels(output?.outputChannels ?? 0)
  return {
    host,
    inputDeviceId: null,
    outputDeviceId: output?.id ?? null,
    sampleRate: capabilities.defaultSampleRate,
    bufferFrames: capabilities.defaultBufferFrames,
    inputMono: [],
    inputStereo: [],
    outputMono: channels.mono,
    outputStereo: channels.stereo,
  }
}

function supportedValue(current: number, values: number[], preferred: number) {
  return values.includes(current)
    ? current
    : values.includes(preferred)
      ? preferred
      : (values[0] ?? 0)
}

export function fitCapabilities(
  draft: AudioDeviceConfiguration,
  capabilities: AudioDeviceCapabilities
): AudioDeviceConfiguration {
  return {
    ...draft,
    sampleRate: supportedValue(
      draft.sampleRate,
      capabilities.sampleRates,
      capabilities.defaultSampleRate
    ),
    bufferFrames: supportedValue(
      draft.bufferFrames,
      capabilities.bufferSizes,
      capabilities.defaultBufferFrames
    ),
    inputMono: draft.inputMono.filter(channel => channel < capabilities.inputChannelNames.length),
    inputStereo: draft.inputStereo.filter(
      channel => channel + 1 < capabilities.inputChannelNames.length
    ),
    outputMono: draft.outputMono.filter(
      channel => channel < capabilities.outputChannelNames.length
    ),
    outputStereo: draft.outputStereo.filter(
      channel => channel + 1 < capabilities.outputChannelNames.length
    ),
  }
}

export interface DeviceChoices {
  hosts: AudioDeviceSnapshot["hosts"]
  inputs: AudioDeviceSnapshot["inputDevices"]
  outputs: AudioDeviceSnapshot["outputDevices"]
  separateInputOutput: boolean
}

export function deviceChoices(
  device: AudioDeviceSnapshot | null,
  draft: AudioDeviceConfiguration | null
): DeviceChoices {
  const hosts = device?.hosts ?? []
  const host = draft?.host
  const separateInputOutput = hosts.find(item => item.id === host)?.separateInputOutput ?? false
  const outputs =
    device?.outputDevices.filter(item => item.host === host && item.outputChannels > 0) ?? []
  const inputs =
    device?.inputDevices.filter(
      item =>
        item.host === host &&
        item.inputChannels > 0 &&
        (separateInputOutput || item.id === draft?.outputDeviceId)
    ) ?? []
  return { hosts, inputs, outputs, separateInputOutput }
}

function validChannels(mono: number[], stereo: number[], count: number) {
  return (
    mono.every(channel => Number.isInteger(channel) && channel >= 0 && channel < count) &&
    stereo.every(
      channel =>
        Number.isInteger(channel) && channel >= 0 && channel % 2 === 0 && channel + 1 < count
    )
  )
}

export function canApplyDraft(
  draft: AudioDeviceConfiguration | null,
  capabilities: AudioDeviceCapabilities | null,
  choices: DeviceChoices
) {
  if (!draft || !capabilities || !draft.outputDeviceId) return false
  return (
    choices.outputs.some(item => item.id === draft.outputDeviceId) &&
    (draft.inputDeviceId === null ||
      choices.inputs.some(item => item.id === draft.inputDeviceId)) &&
    capabilities.sampleRates.includes(draft.sampleRate) &&
    capabilities.bufferSizes.includes(draft.bufferFrames) &&
    validChannels(draft.inputMono, draft.inputStereo, capabilities.inputChannelNames.length) &&
    validChannels(draft.outputMono, draft.outputStereo, capabilities.outputChannelNames.length) &&
    draft.outputMono.length + draft.outputStereo.length > 0
  )
}

export function selectHost(
  draft: AudioDeviceConfiguration,
  host: string,
  device: AudioDeviceSnapshot | null
): AudioDeviceConfiguration {
  const output = device?.outputDevices.find(item => item.host === host && item.outputChannels > 0)
  const channels = defaultChannels(output?.outputChannels ?? 0)
  return {
    ...draft,
    host,
    inputDeviceId: null,
    outputDeviceId: output?.id ?? null,
    inputMono: [],
    inputStereo: [],
    outputMono: channels.mono,
    outputStereo: channels.stereo,
  }
}

export function selectInput(
  draft: AudioDeviceConfiguration,
  inputDeviceId: string,
  choices: DeviceChoices
): AudioDeviceConfiguration {
  const channels = defaultChannels(
    choices.inputs.find(item => item.id === inputDeviceId)?.inputChannels ?? 0
  )
  return {
    ...draft,
    inputDeviceId: inputDeviceId || null,
    inputMono: channels.mono,
    inputStereo: channels.stereo,
  }
}

export function selectOutput(
  draft: AudioDeviceConfiguration,
  outputDeviceId: string,
  device: AudioDeviceSnapshot | null,
  choices: DeviceChoices
): AudioDeviceConfiguration {
  const channels = defaultChannels(
    choices.outputs.find(item => item.id === outputDeviceId)?.outputChannels ?? 0
  )
  const linkedInput =
    !choices.separateInputOutput && draft.inputDeviceId !== null
      ? device?.inputDevices.find(item => item.id === outputDeviceId && item.inputChannels > 0)
      : null
  const input = defaultChannels(linkedInput?.inputChannels ?? 0)
  return {
    ...draft,
    outputDeviceId,
    outputMono: channels.mono,
    outputStereo: channels.stereo,
    ...(!choices.separateInputOutput
      ? {
          inputDeviceId: linkedInput?.id ?? null,
          inputMono: input.mono,
          inputStereo: input.stereo,
        }
      : {}),
  }
}
