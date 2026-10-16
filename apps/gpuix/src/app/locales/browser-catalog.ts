import type { SupportedLocale } from "@/platform/i18n/core"
import type {
  BrowserCategory,
  BrowserEntry,
  BrowserKind,
  BrowserPlace,
} from "@/project/sections/browser/catalog"

type Text = [english: string, chinese: string]
type Preset = [id: string, name: Text, purple?: boolean]
interface Device {
  id: string
  category: BrowserCategory
  name: Text
  tags: string[]
  presets: Preset[]
  purple?: boolean
}

const tags: Record<string, Text> = {
  Synth: ["Synth", "合成器"],
  Analog: ["Analog", "模拟"],
  Mallet: ["Mallet", "槌击"],
  Physical: ["Physical", "物理建模"],
  Keys: ["Keys", "键盘"],
  Utility: ["Utility", "工具"],
  Drums: ["Drums", "鼓"],
  Rack: ["Rack", "机架"],
  Digital: ["Digital", "数字"],
  FM: ["FM", "FM"],
  Sampler: ["Sampler", "采样器"],
  Strings: ["Strings", "弦乐"],
  Filter: ["Filter", "滤波"],
  Dynamics: ["Dynamics", "动态"],
  Delay: ["Delay", "延迟"],
  EQ: ["EQ", "均衡"],
  Ambient: ["Ambient", "氛围"],
  Reverb: ["Reverb", "混响"],
  Drive: ["Drive", "失真"],
  MIDI: ["MIDI", "MIDI"],
  Modulation: ["Modulation", "调制"],
  "Max for Live": ["Max for Live", "Max for Live"],
  "Plug-in": ["Plug-in", "插件"],
  Bass: ["Bass", "贝斯"],
  Kick: ["Kick", "底鼓"],
  Snare: ["Snare", "军鼓"],
  "Hi Hat": ["Hi Hat", "踩镲"],
  Texture: ["Texture", "纹理"],
  Loop: ["Loop", "循环"],
  "One Shot": ["One Shot", "单次采样"],
  Audio: ["Audio", "音频"],
  Swing: ["Swing", "摇摆"],
  "16th": ["16th", "十六分音符"],
  "8th": ["8th", "八分音符"],
  "Equal Temperament": ["Equal Temperament", "平均律"],
  "Just Intonation": ["Just Intonation", "纯律"],
  Arrangement: ["Arrangement", "编排"],
  Electronic: ["Electronic", "电子"],
}

const devices: Device[] = [
  {
    id: "instruments-analog",
    category: "instruments",
    name: ["Analog", "Analog"],
    tags: ["Synth", "Analog"],
    presets: [
      ["instruments-analog-0", ["Warm Pad", "温暖铺底"], true],
      ["instruments-analog-1", ["Deep Bass", "深沉贝斯"]],
      ["instruments-analog-2", ["Soft Keys", "柔和键盘"]],
    ],
  },
  {
    id: "instruments-collision",
    category: "instruments",
    name: ["Collision", "Collision"],
    tags: ["Mallet", "Physical"],
    presets: [
      ["instruments-collision-0", ["Glass Bells", "玻璃铃铛"]],
      ["instruments-collision-1", ["Marimba", "马林巴"]],
    ],
  },
  {
    id: "instruments-drift",
    category: "instruments",
    name: ["Drift", "Drift"],
    tags: ["Synth", "Analog"],
    presets: [
      ["instruments-drift-0", ["Slow Motion", "慢动作"]],
      ["instruments-drift-1", ["Warm Lead", "温暖主音"], true],
    ],
  },
  {
    id: "instruments-electric",
    category: "instruments",
    name: ["Electric", "Electric"],
    tags: ["Keys", "Physical"],
    presets: [
      ["instruments-electric-0", ["Classic EP", "经典电钢琴"]],
      ["instruments-electric-1", ["Mellow Keys", "醇厚键盘"]],
    ],
  },
  {
    id: "instruments-external-instrument",
    category: "instruments",
    name: ["External Instrument", "外部乐器"],
    tags: ["Utility"],
    presets: [],
  },
  {
    id: "instruments-impulse",
    category: "instruments",
    name: ["Impulse", "Impulse"],
    tags: ["Drums"],
    presets: [
      ["instruments-impulse-0", ["Studio Kit", "录音室鼓组"]],
      ["instruments-impulse-1", ["Electronic Kit", "电子鼓组"]],
    ],
  },
  {
    id: "instruments-instrument-rack",
    category: "instruments",
    name: ["Instrument Rack", "乐器机架"],
    tags: ["Rack"],
    presets: [
      ["instruments-instrument-rack-0", ["Layered Keys", "叠层键盘"]],
      ["instruments-instrument-rack-1", ["Ambient Texture", "氛围纹理"]],
    ],
  },
  {
    id: "instruments-meld",
    category: "instruments",
    name: ["Meld", "Meld"],
    tags: ["Synth", "Digital"],
    presets: [
      ["instruments-meld-0", ["Evolving Pad", "演化铺底"]],
      ["instruments-meld-1", ["Metallic Pluck", "金属拨弦"]],
    ],
  },
  {
    id: "instruments-operator",
    category: "instruments",
    name: ["Operator", "Operator"],
    tags: ["Synth", "FM"],
    presets: [
      ["instruments-operator-0", ["FM Bass", "FM 贝斯"]],
      ["instruments-operator-1", ["Crystal Keys", "水晶键盘"]],
    ],
  },
  {
    id: "instruments-sampler",
    category: "instruments",
    name: ["Sampler", "Sampler"],
    tags: ["Sampler"],
    presets: [
      ["instruments-sampler-0", ["Grand Piano", "三角钢琴"]],
      ["instruments-sampler-1", ["Tape Strings", "磁带弦乐"]],
    ],
  },
  {
    id: "instruments-simpler",
    category: "instruments",
    name: ["Simpler", "Simpler"],
    tags: ["Sampler"],
    presets: [
      ["instruments-simpler-0", ["One Shot", "单次采样"]],
      ["instruments-simpler-1", ["Sliced Break", "切片碎拍"]],
    ],
  },
  {
    id: "instruments-tension",
    category: "instruments",
    name: ["Tension", "Tension"],
    tags: ["Strings", "Physical"],
    presets: [
      ["instruments-tension-0", ["Plucked String", "拨弦"]],
      ["instruments-tension-1", ["Bowed Texture", "弓弦纹理"]],
    ],
  },
  {
    id: "instruments-wavetable",
    category: "instruments",
    name: ["Wavetable", "Wavetable"],
    tags: ["Synth", "Digital"],
    purple: true,
    presets: [
      ["instruments-wavetable-0", ["Warm Waves", "温暖波形"], true],
      ["instruments-wavetable-1", ["Moving Pad", "流动铺底"]],
      ["instruments-wavetable-2", ["Sub Bass", "超低音贝斯"]],
    ],
  },
  {
    id: "audioEffects-audio-effect-rack",
    category: "audioEffects",
    name: ["Audio Effect Rack", "音频效果机架"],
    tags: ["Rack"],
    presets: [
      ["audioEffects-audio-effect-rack-0", ["Master Chain", "母带效果链"]],
      ["audioEffects-audio-effect-rack-1", ["Parallel Color", "并行染色"]],
    ],
  },
  {
    id: "audioEffects-auto-filter",
    category: "audioEffects",
    name: ["Auto Filter", "自动滤波器"],
    tags: ["Filter"],
    presets: [
      ["audioEffects-auto-filter-0", ["Low Pass Sweep", "低通扫频"]],
      ["audioEffects-auto-filter-1", ["Envelope Filter", "包络滤波"]],
    ],
  },
  {
    id: "audioEffects-compressor",
    category: "audioEffects",
    name: ["Compressor", "压缩器"],
    tags: ["Dynamics"],
    presets: [
      ["audioEffects-compressor-0", ["Gentle Glue", "柔和粘合"]],
      ["audioEffects-compressor-1", ["Punch", "冲击"]],
    ],
  },
  {
    id: "audioEffects-delay",
    category: "audioEffects",
    name: ["Delay", "延迟"],
    tags: ["Delay"],
    presets: [
      ["audioEffects-delay-0", ["Dotted Echo", "附点回声"]],
      ["audioEffects-delay-1", ["Tape Slap", "磁带短回声"]],
    ],
  },
  {
    id: "audioEffects-eq-eight",
    category: "audioEffects",
    name: ["EQ Eight", "EQ Eight"],
    tags: ["EQ"],
    presets: [
      ["audioEffects-eq-eight-0", ["Low Cut", "低切"]],
      ["audioEffects-eq-eight-1", ["Air", "空气感"]],
    ],
  },
  {
    id: "audioEffects-glue-compressor",
    category: "audioEffects",
    name: ["Glue Compressor", "Glue Compressor"],
    tags: ["Dynamics"],
    presets: [
      ["audioEffects-glue-compressor-0", ["Bus Glue", "总线粘合"]],
      ["audioEffects-glue-compressor-1", ["Soft Clip", "软削波"]],
    ],
  },
  {
    id: "audioEffects-grain-delay",
    category: "audioEffects",
    name: ["Grain Delay", "颗粒延迟"],
    tags: ["Delay", "Ambient"],
    presets: [
      ["audioEffects-grain-delay-0", ["Shimmer", "微光"]],
      ["audioEffects-grain-delay-1", ["Frozen Grain", "冻结颗粒"]],
    ],
  },
  {
    id: "audioEffects-hybrid-reverb",
    category: "audioEffects",
    name: ["Hybrid Reverb", "混合混响"],
    tags: ["Reverb", "Ambient"],
    presets: [
      ["audioEffects-hybrid-reverb-0", ["Small Room", "小房间"]],
      ["audioEffects-hybrid-reverb-1", ["Endless Hall", "无尽大厅"]],
    ],
  },
  {
    id: "audioEffects-limiter",
    category: "audioEffects",
    name: ["Limiter", "限制器"],
    tags: ["Dynamics"],
    presets: [
      ["audioEffects-limiter-0", ["Transparent", "透明"]],
      ["audioEffects-limiter-1", ["Loud", "响亮"]],
    ],
  },
  {
    id: "audioEffects-saturator",
    category: "audioEffects",
    name: ["Saturator", "饱和器"],
    tags: ["Drive"],
    presets: [
      ["audioEffects-saturator-0", ["Warm Tape", "温暖磁带"], true],
      ["audioEffects-saturator-1", ["Soft Drive", "柔和失真"]],
    ],
  },
  {
    id: "audioEffects-utility",
    category: "audioEffects",
    name: ["Utility", "工具"],
    tags: ["Utility"],
    presets: [
      ["audioEffects-utility-0", ["Mono", "单声道"]],
      ["audioEffects-utility-1", ["Wide", "宽广"]],
    ],
  },
  {
    id: "midiEffects-arpeggiator",
    category: "midiEffects",
    name: ["Arpeggiator", "琶音器"],
    tags: ["MIDI"],
    presets: [
      ["midiEffects-arpeggiator-0", ["Up & Down", "上行与下行"]],
      ["midiEffects-arpeggiator-1", ["Random Steps", "随机步进"]],
    ],
  },
  {
    id: "midiEffects-chord",
    category: "midiEffects",
    name: ["Chord", "和弦"],
    tags: ["MIDI"],
    presets: [
      ["midiEffects-chord-0", ["Minor Seventh", "小七和弦"]],
      ["midiEffects-chord-1", ["Fifth", "五度"]],
    ],
  },
  {
    id: "midiEffects-scale",
    category: "midiEffects",
    name: ["Scale", "音阶"],
    tags: ["MIDI"],
    presets: [
      ["midiEffects-scale-0", ["Minor", "小调"]],
      ["midiEffects-scale-1", ["Major", "大调"]],
    ],
  },
  {
    id: "midiEffects-velocity",
    category: "midiEffects",
    name: ["Velocity", "力度"],
    tags: ["MIDI"],
    presets: [
      ["midiEffects-velocity-0", ["Soft Touch", "轻触"]],
      ["midiEffects-velocity-1", ["Accents", "重音"]],
    ],
  },
  {
    id: "modulators-lfo",
    category: "modulators",
    name: ["LFO", "LFO"],
    tags: ["Modulation"],
    presets: [
      ["modulators-lfo-0", ["Slow Sine", "慢速正弦"]],
      ["modulators-lfo-1", ["Random Hold", "随机保持"]],
    ],
  },
  {
    id: "modulators-shaper",
    category: "modulators",
    name: ["Shaper", "Shaper"],
    tags: ["Modulation"],
    presets: [
      ["modulators-shaper-0", ["Ramp", "斜坡"]],
      ["modulators-shaper-1", ["Pulse", "脉冲"]],
    ],
  },
  {
    id: "modulators-envelope-follower",
    category: "modulators",
    name: ["Envelope Follower", "包络跟随器"],
    tags: ["Modulation"],
    presets: [
      ["modulators-envelope-follower-0", ["Smooth", "平滑"]],
      ["modulators-envelope-follower-1", ["Transient", "瞬态"]],
    ],
  },
  {
    id: "max-max-instrument",
    category: "max",
    name: ["Max Instrument", "Max 乐器"],
    tags: ["Max for Live"],
    presets: [
      ["max-max-instrument-0", ["Granular Cloud", "颗粒云"]],
      ["max-max-instrument-1", ["Mono Synth", "单音合成器"]],
    ],
  },
  {
    id: "max-max-audio-effect",
    category: "max",
    name: ["Max Audio Effect", "Max 音频效果"],
    tags: ["Max for Live"],
    presets: [
      ["max-max-audio-effect-0", ["Spectral Freeze", "频谱冻结"]],
      ["max-max-audio-effect-1", ["Resonator", "共鸣器"]],
    ],
  },
  {
    id: "max-max-midi-effect",
    category: "max",
    name: ["Max MIDI Effect", "Max MIDI 效果"],
    tags: ["Max for Live"],
    presets: [
      ["max-max-midi-effect-0", ["Melodic Steps", "旋律步进"]],
      ["max-max-midi-effect-1", ["Note Echo", "音符回声"]],
    ],
  },
  {
    id: "plugins-clap",
    category: "plugins",
    name: ["CLAP", "CLAP"],
    tags: ["Plug-in"],
    presets: [
      ["plugins-clap-0", ["Demo Synth", "演示合成器"]],
      ["plugins-clap-1", ["Demo Reverb", "演示混响"]],
    ],
  },
  {
    id: "plugins-vst3",
    category: "plugins",
    name: ["VST3", "VST3"],
    tags: ["Plug-in"],
    presets: [
      ["plugins-vst3-0", ["Demo Piano", "演示钢琴"]],
      ["plugins-vst3-1", ["Demo Compressor", "演示压缩器"]],
    ],
  },
  {
    id: "drums-drum-rack",
    category: "drums",
    name: ["Drum Rack", "鼓机架"],
    tags: ["Drums", "Rack"],
    presets: [
      ["drums-drum-rack-0", ["808 Core Kit", "808 核心鼓组"]],
      ["drums-drum-rack-1", ["909 Core Kit", "909 核心鼓组"]],
      ["drums-drum-rack-2", ["Acoustic Kit", "原声鼓组"]],
    ],
  },
]

interface Resource {
  id: string
  category: BrowserCategory
  kind: Exclude<BrowserKind, "device">
  name: Text
  tags: string[]
  place: BrowserPlace
  purple: boolean
}

const resources: Resource[] = [
  {
    id: "sounds-Ambient Keys",
    category: "sounds",
    kind: "preset",
    name: ["Ambient Keys", "氛围键盘"],
    tags: ["Keys", "Ambient"],
    place: "userLibrary",
    purple: true,
  },
  {
    id: "sounds-Deep Sub",
    category: "sounds",
    kind: "preset",
    name: ["Deep Sub", "深沉超低音"],
    tags: ["Bass", "Synth"],
    place: "packs",
    purple: false,
  },
  {
    id: "sounds-Warm Strings",
    category: "sounds",
    kind: "preset",
    name: ["Warm Strings", "温暖弦乐"],
    tags: ["Strings", "Ambient"],
    place: "userLibrary",
    purple: true,
  },
  {
    id: "sounds-Plucked Glass",
    category: "sounds",
    kind: "preset",
    name: ["Plucked Glass", "玻璃拨弦"],
    tags: ["Mallet", "Digital"],
    place: "packs",
    purple: false,
  },
  {
    id: "drums-Kick 808.wav",
    category: "drums",
    kind: "sample",
    name: ["Kick 808.wav", "Kick 808.wav"],
    tags: ["Drums", "Kick"],
    place: "packs",
    purple: false,
  },
  {
    id: "drums-Snare Dry.wav",
    category: "drums",
    kind: "sample",
    name: ["Snare Dry.wav", "Snare Dry.wav"],
    tags: ["Drums", "Snare"],
    place: "packs",
    purple: false,
  },
  {
    id: "drums-Hi Hat Closed.wav",
    category: "drums",
    kind: "sample",
    name: ["Hi Hat Closed.wav", "Hi Hat Closed.wav"],
    tags: ["Drums", "Hi Hat"],
    place: "packs",
    purple: false,
  },
  {
    id: "samples-Analog Texture.wav",
    category: "samples",
    kind: "sample",
    name: ["Analog Texture.wav", "Analog Texture.wav"],
    tags: ["Texture", "Ambient"],
    place: "userLibrary",
    purple: true,
  },
  {
    id: "samples-Break 120 BPM.wav",
    category: "samples",
    kind: "sample",
    name: ["Break 120 BPM.wav", "Break 120 BPM.wav"],
    tags: ["Drums", "Loop"],
    place: "packs",
    purple: false,
  },
  {
    id: "samples-Field Recording.wav",
    category: "samples",
    kind: "sample",
    name: ["Field Recording.wav", "Field Recording.wav"],
    tags: ["Texture", "Ambient"],
    place: "currentProject",
    purple: true,
  },
  {
    id: "samples-Piano C3.wav",
    category: "samples",
    kind: "sample",
    name: ["Piano C3.wav", "Piano C3.wav"],
    tags: ["Keys", "One Shot"],
    place: "packs",
    purple: false,
  },
  {
    id: "clips-Ambient Intro",
    category: "clips",
    kind: "clip",
    name: ["Ambient Intro", "氛围前奏"],
    tags: ["Ambient", "Audio"],
    place: "currentProject",
    purple: true,
  },
  {
    id: "clips-Bass Pattern.mid",
    category: "clips",
    kind: "midi",
    name: ["Bass Pattern.mid", "Bass Pattern.mid"],
    tags: ["Bass", "MIDI"],
    place: "currentProject",
    purple: false,
  },
  {
    id: "clips-Chord Progression.mid",
    category: "clips",
    kind: "midi",
    name: ["Chord Progression.mid", "Chord Progression.mid"],
    tags: ["Keys", "MIDI"],
    place: "userLibrary",
    purple: false,
  },
  {
    id: "grooves-Swing 16-55",
    category: "grooves",
    kind: "groove",
    name: ["Swing 16-55", "摇摆 16-55"],
    tags: ["Swing", "16th"],
    place: "packs",
    purple: false,
  },
  {
    id: "grooves-Swing 8-60",
    category: "grooves",
    kind: "groove",
    name: ["Swing 8-60", "摇摆 8-60"],
    tags: ["Swing", "8th"],
    place: "packs",
    purple: false,
  },
  {
    id: "tunings-12-TET",
    category: "tunings",
    kind: "tuning",
    name: ["12-TET", "12-TET"],
    tags: ["Equal Temperament"],
    place: "packs",
    purple: false,
  },
  {
    id: "tunings-Just Intonation",
    category: "tunings",
    kind: "tuning",
    name: ["Just Intonation", "纯律"],
    tags: ["Just Intonation"],
    place: "packs",
    purple: false,
  },
  {
    id: "templates-Empty Arrangement",
    category: "templates",
    kind: "template",
    name: ["Empty Arrangement", "空白编排"],
    tags: ["Arrangement"],
    place: "userLibrary",
    purple: false,
  },
  {
    id: "templates-Electronic Session",
    category: "templates",
    kind: "template",
    name: ["Electronic Session", "电子乐工程"],
    tags: ["Electronic"],
    place: "userLibrary",
    purple: false,
  },
]

function catalog(language: 0 | 1): BrowserEntry[] {
  return [
    ...devices.map((device): BrowserEntry => {
      const localizedTags = device.tags.map(tag => tags[tag][language])
      return {
        id: device.id,
        name: device.name[language],
        category: device.category,
        kind: "device",
        place: "packs",
        tags: localizedTags,
        purple: device.purple ?? false,
        children: device.presets.map(([id, name, purple = false]) => ({
          id,
          name: name[language],
          category: device.category,
          kind: "preset",
          place: "userLibrary",
          tags: localizedTags,
          purple,
        })),
      }
    }),
    ...resources.map((resource): BrowserEntry => ({
      ...resource,
      name: resource.name[language],
      tags: resource.tags.map(tag => tags[tag][language]),
    })),
  ]
}

export const browserCatalogByLocale: Record<SupportedLocale, BrowserEntry[]> = {
  "en-US": catalog(0),
  "zh-CN": catalog(1),
}
