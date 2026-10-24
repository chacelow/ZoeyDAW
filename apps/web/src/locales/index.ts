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
import libraryZh from "./library.zh-CN"
import libraryEn from "./library.en-US"
import workspaceZh from "./workspace.zh-CN"
import workspaceEn from "./workspace.en-US"
import galleryProjectZh from "./gallery-project.zh-CN"
import galleryProjectEn from "./gallery-project.en-US"
import browserZh from "./browser.zh-CN"
import browserEn from "./browser.en-US"
import audioSettingsZh from "./audio-settings.zh-CN"
import audioSettingsEn from "./audio-settings.en-US"
import realtimeProbeZh from "./realtime-probe.zh-CN"
import realtimeProbeEn from "./realtime-probe.en-US"
import pluginSettingsZh from "./plugin-settings.zh-CN"
import pluginSettingsEn from "./plugin-settings.en-US"
import type { AppLocaleResources } from "@zoeymind/i18n"

export const appLocales: AppLocaleResources = {
  "zh-CN": {
    ...sharedZh,
    arrangement: arrangementZh,
    detail: detailZh,
    detailMidi: detailMidiZh,
    detailAudio: detailAudioZh,
    detailDevices: detailDevicesZh,
    library: libraryZh,
    workspace: workspaceZh,
    galleryProject: galleryProjectZh,
    browser: browserZh,
    audioSettings: audioSettingsZh,
    realtimeProbe: realtimeProbeZh,
    pluginSettings: pluginSettingsZh,
  },
  "en-US": {
    ...sharedEn,
    arrangement: arrangementEn,
    detail: detailEn,
    detailMidi: detailMidiEn,
    detailAudio: detailAudioEn,
    detailDevices: detailDevicesEn,
    library: libraryEn,
    workspace: workspaceEn,
    galleryProject: galleryProjectEn,
    browser: browserEn,
    audioSettings: audioSettingsEn,
    realtimeProbe: realtimeProbeEn,
    pluginSettings: pluginSettingsEn,
  },
}
