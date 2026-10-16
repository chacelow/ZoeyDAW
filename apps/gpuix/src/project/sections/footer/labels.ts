import type { DeviceKind, DeviceParameter } from "../../model/devices"
import type { DisplayFormats } from "../../model/display-formats"

export interface FooterLabels {
  readonly locale: string
  readonly formats: DisplayFormats
  readonly devicesTab: string
  readonly clipTab: string
  readonly title: string
  readonly add: string
  readonly noTrack: string
  readonly noClip: string
  readonly multipleClips: string
  readonly emptyMidi: string
  readonly emptyAudio: string
  readonly emptyHelp: string
  readonly prototypeHelp: string
  readonly chain: string
  readonly keyboardHelp: string
  readonly reorderHint: string
  readonly select: string
  readonly actions: string
  readonly bypass: string
  readonly enable: string
  readonly fold: string
  readonly expand: string
  readonly moveLeft: string
  readonly moveRight: string
  readonly delete: string
  readonly toggle: string
  readonly kindNames: Readonly<Record<DeviceKind, string>>
  readonly parameterNames: Readonly<Record<DeviceParameter, string>>
}
