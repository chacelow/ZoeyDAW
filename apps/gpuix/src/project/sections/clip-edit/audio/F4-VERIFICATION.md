# Audio F4 消费者复测

2026-10-15。唯一共享PeakColumns已切QuadBatch，公开props未改，没有第二条波形路径。正常与完整10000notes/1024steps工程的initial、zoom、scroll、final共8个GPU全图与旧div decoded RGBA全部0diff。初始节点3438→216。metadata实际44100Hz、88200frames、stereo；可见范围/像素数、tempo/meter/session重开均由真实后端与原生像素回归覆盖。

## S1 模块边界

`AudioWaveform.tsx` 只组合工具栏、标尺、主波形与 overview。`useAudioWaveformView.ts` 唯一拥有 view、drag、selection、尺寸与原生 refs，子组件只读取 view 并调用 owner 的事件处理。主入口计算一份 ticks，两个标尺与主波形共享它。`AudioWaveformRulers.tsx` 的 children 插槽保留标尺、Loop、主波形、时间标尺的原生节点顺序。`SourceWaveform.tsx` 与共享 `PeakColumns` 路径不变。

## 分段与测量修正

`verification/audio-profile-preload.ts` 只在内存观察原有renderRootSync、commitRoot、flushPassiveEffects及host prepare/reset，不修改vendor或关闭React instrumentation。`audio-render-cost.tsx` 按原30步wheel协议记录p50/p90，applyBatch与getBounds分别计时。commit包含passive，hostCommit包含applyBatch，嵌套段不能相加。

TestRenderer的surface getBounds会隐式flush；live renderer读取缓存bounds。cached-bounds模式只对固定surface使用初始实测bounds，宽度与位置没有改变。原DEV zoom34.9ms不能全部归于测量，去掉flush后首个冷帧仍可超过16ms。

逐组件观察定位到PeakColumns的DEV logComponentRender：45次共124.97ms，其他组件各不足1ms。React Performance Track经addObjectDiffToProperties/addObjectToProperties遍历Float32Array下标；production没有该代码。SourceWaveform的useMemo依赖源窗口交集、pixels、gain/reverse、reader与真实generation，窗口参数相同不重建，缩放改变可见范围时新数组是必要的。

协调者已明确保持公开props与唯一路径，验收改为production门槛，DEV完整报告并单列原有logging耗时及扣除后稳态p90，首个冷帧另列。没有为了过门槛改写日志、修改typed array或降低数据量。

最新cached-bounds结果：

| 模式 | 冷首帧ms | 稳态原始p50/p90 ms | logging p50/p90 ms | 扣logging后zoom p90 ms | 扣logging后scroll p90 ms |
| --- | --: | --- | --- | --: | --: |
| DEV | 23.956 | 9.473 / 12.131 | 4.802 / 8.083 | 4.879 | 4.839 |
| production | 6.716 | 3.142 / 3.881 | 0 / 0 | 3.157 | 3.881 |

两模式满足仲裁后的16ms门槛。完整每帧和分段p50/p90在 `evidence/f4-audio-phases-{development,production}-cached-bounds.json`，原native-bounds数据也保留。CPU墙钟不等于GPU完成时间。

## 复跑

从apps/gpuix执行：

```sh
bun --preload ./src/app/verification/clip-edit/audio-profile-preload.ts src/app/verification/clip-edit/audio-render-cost.tsx native-bounds
bun --preload ./src/app/verification/clip-edit/audio-profile-preload.ts src/app/verification/clip-edit/audio-render-cost.tsx cached-bounds
NODE_ENV=production bun --preload ./src/app/verification/clip-edit/audio-profile-preload.ts src/app/verification/clip-edit/audio-render-cost.tsx cached-bounds
```

## 真实窗口与播放

自启满量窗口PID10394在授权UTC时段内运行7m27s后已关闭，exit0。AX切换三个编辑器、Audio缩放、Pattern End/Enter成功，renderer268frames/134samples，CPU draw p90=5.454ms。背景截图黑/遮挡，不能称视觉验收通过；BackgroundUnavailable后未重试、未切前台。

Space在真实窗口未验证：后台窗口引擎拒绝，离屏同场景通过，已归协调者收尾桌面验收。离屏normal/dense各两次、450秒长stream及62次Pattern修订后播放均ready/error=null，playing false→true→false。临时prepare/unhealthy诊断没有输出拒绝原因，session.rs已精确还原并不提交日志。证据在f4-playback-diagnostic.json、f4-playback-aged-diagnostic.json与f4-real-window.json。

## 错题与已验证做法

- getBounds隐式flush与DEV Performance Track是两个成本，不能混为一个解释。
- 只从实际每帧logging时间扣除，不从profile采样比例估算。
- 留下冷帧与原始时间，明确仲裁，不假称DEV原始冷帧小于16ms。

## 语义度量

SourceMarker旗标读取arrangementMarkerWidth，保持6的既有尺寸，不再由spacing×3生成。Velocity handle最初误用indicatorRadius×2，实际从4变成13px，已纠正为主干777ec9f新增的midiVelocityHandleWidth=4；indicatorRadius不是力度柄token。Pattern圆角与描边已经分别读取toggleRadius和controlBorderWidth。

真实GPU回归 `midi/VelocityLane.test.tsx` 将实际VelocityLane与4×4 native div旧绘制比较，在中心x20、左右部分裁剪x-1/81和完全离屏x-5/85五种状态全部PNG逐字节相等。将handle改回indicatorRadius×2的13px变异实际失败（Expected true / Received false）；恢复midiVelocityHandleWidth后通过。此回归防止未来借用无关token导致力度柄可见尺寸及裁剪改变。
