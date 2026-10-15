# B2-clip-editors 派发补充(2026-10-15)

## 接口(已定,不要改)

Footer(切片 b2-footer-browser-transport,尚未合入主干)通过 `renderClipEditor(slot: ClipEditorSlot) => ReactNode` 挂载你。`ClipEditorSlot = { clip: Clip; track: Track; close: () => void }`(见 `gpuix-b2-footer-browser-transport` 分支 `apps/gpuix/src/project/sections/footer/index.tsx:11-15`,只读参考,不要 import 那个分支)。你的公共导出:`apps/gpuix/src/project/sections/clip-edit/index.ts` 导出 `ClipEditor(props: ClipEditorSlot & { labels: ClipEditorLabels; readPeaks: PeakReader })`,内部按 `clip.kind` 只选一个编辑器(audio → AudioEditor,midi → 钢琴卷帘,pattern → PatternEditor)。`ClipEditorSlot` 类型在你这边按同样结构定义一次并导出,footer 合入时由协调者把两边统一到一个定义。 `readPeaks` 用 `@/project/model/backend` 的 `PeakReader`,组合根传 adapters 的 `readProjectPeaks`;demo 里先 `startProjectRuntime` 取得 lease 再传。

## 复用(必查)

- 模型:`project/model/{midi-notes,midi-editing,audio-editor,pattern-window}` 已迁入,直接用,不复制。
- `apps/gpuix/src/features/{clip-render,waveform-automation,track-mixer}` 是迁移期过渡目录:能复用的组件搬进 `clip-edit` 并删掉 features 里对应文件(先 grep 确认无其它调用方;有调用方先 ask)。
- 数值控件、DragPad、Input、Menu 用 `ui/controls`;布局度量走 `theme`;颜色用共享 Arrangement 角色与 `shared/theme/content-color`。
- 原生能力只经 `platform/*` 端口(lint 强制);动画用 `useAnimationFrame`;光标锁由 `ControlEnvironmentProvider` 注入(demo 用 `@/platform/cursor` 的 `nativeCursorLock`)。
- 几何测量一律 `renderer.getElementBounds` 或 `onLayout`;`readOuterBounds` 将被删除,不要用(scan HARD)。

## 已知共享阻塞(保留失败回归,不在本切片绕过)

A3b 第二增量将修:MenuTrigger 的 Space/Enter 冒泡、嵌套交互后代右键、DragPad 滚轮滚动祖先、NumericPad 实际内宽 fill/中线。涉及这些的行为写成失败回归并在报告列出,合入后转绿。

## 桌面

需要真实窗口输入时用 `orca orchestration ask` 申请,等协调者 reply 给起止时间;只操作自己命名 service 的窗口,不碰 Live,到点停止并回报『桌面释放』。
