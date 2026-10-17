# StatusStrip

`StatusStrip` 不持有工程状态，也不创建控件环境。组合根注入 `StatusStripLabels`、`ControlInfo`、warnings，以及 Dock 编辑面板的派生 collapsed 状态与整体显隐命令。

控件帮助优先于最新 warning。离开控件后恢复 warning，severity 只影响图标和主题颜色。帮助只说明控件类型，不发布资源名、输入草稿或参数值。

StatusStrip 固定在工作区底部，不参与停靠。Clip Edit / Affect Chain 切换由 Dock 组头部的 Tab 负责；状态栏不再重复拥有 view 状态或切换按钮。图标按钮只控制编辑面板整体显隐，使用共享默认尺寸。
