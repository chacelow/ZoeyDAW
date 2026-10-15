# StatusStrip

`StatusStrip` 不持有工程状态，也不创建控件环境。组合根注入 `StatusStripLabels`、`ControlInfo`、warnings，以及与 Footer 共用的 view 和 collapsed。

控件帮助优先于最新 warning。离开控件后恢复 warning，severity 只影响图标和主题颜色。帮助只说明控件类型，不发布资源名、输入草稿或参数值。

Clip Edit 与 Affect Chain 反映同一受控标签。面板折叠时两者都不显示激活；点击未激活项切换标签并展开，点击已激活项折叠 Footer。Footer 内部标签仍保持互斥选择。图标折叠按钮使用共享默认尺寸。
