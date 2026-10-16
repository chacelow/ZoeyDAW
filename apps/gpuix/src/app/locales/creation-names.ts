import type { SupportedLocale } from "@/platform/i18n/core"

export interface CreationNameTemplates {
  project: string
  main: string
  track: Record<"audio" | "midi" | "group" | "return", string>
  copy: string
  marker: string
  clip: Record<"audio" | "midi" | "pattern", string>
}

export const creationNamesByLocale: Record<SupportedLocale, CreationNameTemplates> = {
  "en-US": {
    project: "Untitled project",
    main: "Main",
    track: {
      audio: "{{count}} Audio",
      midi: "{{count}} MIDI",
      group: "{{count}} Group",
      return: "{{count}} Return",
    },
    copy: "{{name}} Copy",
    marker: "Marker",
    clip: { audio: "Audio Clip", midi: "MIDI Clip", pattern: "Pattern" },
  },
  "zh-CN": {
    project: "未命名项目",
    main: "主输出",
    track: {
      audio: "{{count}} 音频",
      midi: "{{count}} MIDI",
      group: "{{count}} 分组",
      return: "{{count}} 返回",
    },
    copy: "{{name}} 副本",
    marker: "标记",
    clip: { audio: "音频片段", midi: "MIDI 片段", pattern: "Pattern" },
  },
}
