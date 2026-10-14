/**
 * App locales — DAW prototype 阶段只有共享词条。
 */

import sharedZh from "./shared.zh-CN"
import sharedEn from "./shared.en-US"
import arrangementZh from "./arrangement.zh-CN"
import arrangementEn from "./arrangement.en-US"
import detailZh from "./detail.zh-CN"
import detailEn from "./detail.en-US"
import detailMidiZh from "./detail-midi.zh-CN"
import detailMidiEn from "./detail-midi.en-US"
import detailAudioZh from "./detail-audio.zh-CN"
import detailAudioEn from "./detail-audio.en-US"
import detailDevicesZh from "./detail-devices.zh-CN"
import detailDevicesEn from "./detail-devices.en-US"
import type { AppLocaleResources } from "@zoeymind/i18n"

export const appLocales: AppLocaleResources = {
  "zh-CN": {
    ...sharedZh,
    arrangement: arrangementZh,
    detail: detailZh,
    detailMidi: detailMidiZh,
    detailAudio: detailAudioZh,
    detailDevices: detailDevicesZh,
  },
  "en-US": {
    ...sharedEn,
    arrangement: arrangementEn,
    detail: detailEn,
    detailMidi: detailMidiEn,
    detailAudio: detailAudioEn,
    detailDevices: detailDevicesEn,
  },
}
