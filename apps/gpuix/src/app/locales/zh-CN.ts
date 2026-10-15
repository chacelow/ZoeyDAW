/**
 * 应用外壳文案。键名沿用 apps/web/src/locales/shared.zh-CN.ts,只保留外壳用到的键;
 * 各 section 的文案由组合根以 labels 注入,不放在这里。
 */
export default {
  app: {
    name: "zoeydaw",
    tagline: "Web UI DAW",
  },
  common: {
    loading: "加载中…",
    back: "返回",
    cancel: "取消",
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
    description: "关闭窗口前，请选择保存、不保存或取消。",
    save: "保存",
    discard: "不保存",
    saveFailed: "保存失败，窗口仍保持打开。",
    pressAgain: "已处理。再按一次关闭即可关闭窗口。",
  },
  titlebar: {
    settings: "设置",
  },
}
