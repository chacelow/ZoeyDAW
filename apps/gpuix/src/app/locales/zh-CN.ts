import { creationNamesByLocale } from "./creation-names"

export default {
  creationNames: creationNamesByLocale["zh-CN"],
  snapshotErrors: {
    read: "无法读取快照存储。",
    invalid: "本地快照无效或不受支持，当前工程已保留。",
    write: "无法保存本地快照，请检查存储是否可用。",
    missing: "此工程尚无本地快照。",
  },
  panel: {
    footer: "底部面板",
    browser: "浏览器",
    arrangement: "编排",
    activeDescription: "活动面板",
    toggleFixed: "切换{{panel}}",
  },
  control: { on: "开启", off: "关闭" },
  track: { monitorModes: { off: "关闭", auto: "自动", in: "输入" } },
  app: {
    name: "zoeydaw",
    tagline: "Web UI DAW",
  },
  common: {
    loading: "加载中…",
    back: "返回",
    cancel: "取消",
    retry: "重试",
    loadFailed: "加载失败",
  },
  home: {
    title: "项目",
    emptyTitle: "暂无项目",
    emptyHint: "点击“新建项目”开始一个 DAW 工程。",
    createAction: "新建项目",
    openAction: "打开",
    recent: "最近打开",
  },
  project: {
    resizeBrowser: "调整 Browser 宽度",
    resizeClipEdit: "调整 Clip 编辑区高度",
    untitled: "未命名项目",
  },
  about: {
    github: "GitHub",
    prototype: "prototype 骨架",
    sourceHint: "音频核心、CLAP + VST3 host、Browser、.als 导入等按界面需求迭代。",
  },
  settings: {
    title: "设置",
    close: "关闭设置",
    navigation: "设置分类",
    languageDescription: "选择应用界面使用的语言。",
    sections: {
      appearance: "外观",
      language: "语言",
      logs: "日志",
      about: "关于",
    },
    themePreset: "主题预设",
    themeMode: "主题",
    systemUnavailable: "跟随系统需要原生外观能力,暂不可用。",
    themeNotPersisted: "主题设置未能保存,重启后恢复默认。",
    logsPlaceholder: "日志级别和目录控制将在接入 Rust 日志 command 时填入；原有命令仍在。",
  },
  routeError: {
    title: "页面遇到问题",
    description: "zoeydaw 无法继续显示当前页面。你可以重试，或返回首页继续工作。",
    retry: "重新加载",
    home: "返回首页",
    details: "错误详情",
  },
  notFound: {
    title: "404",
  },
  windowClose: {
    title: "当前工程有未保存的修改",
    description: "离开工程前，请选择保存、不保存或取消。",
    save: "保存",
    discard: "不保存",
    saveFailed: "保存失败，当前工程仍保持打开。",
    closeFailed: "窗口关闭失败，请重试关闭。",
  },
  notifications: {
    title: "通知",
    dismiss: "关闭通知",
    loading: "加载中",
  },
  titlebar: {
    settings: "设置",
  },
}
