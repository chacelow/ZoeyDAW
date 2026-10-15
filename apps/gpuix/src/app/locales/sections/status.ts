import type { StatusStripLabels } from "@/project/sections/status"

export const englishStatusLabels: StatusStripLabels = {
  toggleFooter: "Toggle footer",
  views: "Detail views",
  clip: "Clip Edit",
  devices: "Affect Chain",
  info: {
    number: { title: "Number", description: "Drag or wheel to adjust; double-click to reset" },
    bar: { title: "Level", description: "Drag or wheel to adjust the value" },
    bipolar: { title: "Bipolar", description: "Adjust around the center" },
    toggle: { title: "Toggle", description: "Change the control state" },
    dropdown: { title: "Dropdown", description: "Choose from the list" },
    popup: { title: "Popup", description: "Adjust controls without closing the popup" },
    button: { title: "Button", description: "Click or press Enter" },
    search: { title: "Search", description: "Filter browser resources" },
    categories: { title: "Categories", description: "Choose the browser source" },
    resources: {
      title: "Resources",
      description: "Demonstration resources; placement is disabled",
    },
    filters: { title: "Filters", description: "Filter resources by kind" },
  },
}
export const chineseStatusLabels: StatusStripLabels = {
  toggleFooter: "切换底部面板",
  views: "细节视图",
  clip: "片段编辑",
  devices: "效果链",
  info: {
    number: { title: "数值", description: "拖动或滚轮调整，双击重置" },
    bar: { title: "电平", description: "拖动或滚轮调整数值" },
    bipolar: { title: "双极数值", description: "围绕中心调整" },
    toggle: { title: "开关", description: "切换控件状态" },
    dropdown: { title: "下拉列表", description: "从列表选择" },
    popup: { title: "弹层", description: "内部调整时保持打开" },
    button: { title: "按钮", description: "点击或按 Enter 激活" },
    search: { title: "搜索", description: "筛选浏览器资源" },
    categories: { title: "分类", description: "选择浏览器来源" },
    resources: { title: "资源", description: "演示资源，不可放置" },
    filters: { title: "筛选", description: "按资源类型筛选" },
  },
}
