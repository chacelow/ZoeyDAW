# H2:主题配色预设(44 个)迁移到 gpuix 主题系统

## 背景

web 设置里的主题有两层:模式(明/暗/系统)与配色预设(44 个,`packages/ui/src/theme/theme-presets.ts` 3646 行,`apply-theme.ts` 173 行把预设 token 写到 CSS 变量,culori 转色)。gpuix 的 `apps/gpuix/src/shared/theme/colors.ts` 只有一套 light/dark,`derive()` 从 base 色派生 Arrangement 等角色;没有预设。app-shell 第一阶段的设置对话框已把预设网格列为未实现,等你。

## 拥有路径

`apps/gpuix/src/shared/theme/**`(预设数据、派生、Provider 的预设状态)、`apps/gpuix/src/platform/settings/**` 中 `themePreset` 的读写(端口已有字段)。设置对话框里的预设网格 UI 由 app-shell 负责:你导出数据与 Provider API,不写对话框。`packages/ui`(web 用)只读,不删。

## 交付

- 预设数据:从 `theme-presets.ts` 迁入,只保留 gpuix 消费的 token(与 `ThemeColors` 字段一一对应);每个预设分 light/dark。用脚本转换并提交脚本,不手抄 44 份;转换时颜色保持 oklch 或转成 gpuix 接受的格式,不丢精度。
- 派生:`derive(base, scheme)` 对任意预设产出完整 `DerivedThemeColors`(含 Arrangement 角色、content-color 依赖的 chart1-5)。不另造第二套派生。
- Provider:`ThemeProvider` 增加受控 `preset`(与 app-shell 正在加的受控 `appearance` 并列;开工前 merge 主干,若 appearance 还未合入,先 ask 协调者排序,避免同一文件冲突)。切换预设与模式不重挂载子树。
- 持久化:`themePreset` 走 `platform/settings`;未知或已删除的预设 id 回退 Default 并在下一次写入时清理。
- 字段对照表写进 `shared/theme` README:web CSS 变量 → `ThemeColors` 字段,以及 gpuix 不消费、被丢弃的 token 清单。

## 验收

- 性质测试:44 个预设 × 2 个 scheme 都派生出完整、合法的颜色(无 undefined、无 NaN、解析得了);Arrangement 角色的明暗关系保持(例如 `arrangementSurfaceAlt` 与 `arrangementSurface` 的亮度顺序和 Default 预设一致,不一致的列出并给出依据)。变异:漏掉一个字段或把 light/dark 交换,应该失败。
- 行为测试:受控 preset 切换后,同一个子组件读到新颜色,且没有重挂载(组件内 state 保留)。
- 真实窗口:画廊或 demo 里切换 3 个代表性预设 × 明暗,截图并放大核对对比度与层级;桌面时段先 ask。
- 按 `common.md` 自审,`merge_ready`。
