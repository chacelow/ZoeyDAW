# 2026-10-16 全仓审查

基线 `gpuix-migration` 6d0acc19。六路只读审查并行，分片报告在本目录。协调者按代码逐条复核了 P0/P1 的引用位置，表中每一项都能在当前源码里找到对应代码。已知的 F7（每次 setQuads 同步整窗重绘）和已声明的产品限制不计入。

## P0：数据丢失

| id | 问题 | 位置 |
| --- | --- | --- |
| UPA-01 | 打开已有工程不读取保存的快照，显示默认工程；之后 Cmd+S 会用默认状态覆盖原快照 | `app/project/ProjectPage.tsx:23-26`、`project/adapters/snapshots.ts:44-50` |
| UPA-02 | Back 回首页后新建/打开其他工程，没有 save/discard/cancel 确认，当前未保存编辑和 undo 历史直接清空 | `app/project/ProjectSections.tsx:58`、`app/home/HomePage.tsx:32-39` |

## P1

| id | 范围 | 问题 |
| --- | --- | --- |
| PC-01 | project | 独立录制已进入 `recordingPending` 后，commit 与 recover 连续被拒绝，录制内容永久丢失 |
| PC-02 | project | 快照边界接受 `startBar` 在 (0,1) 的值；restore 返回成功并替换当前工程，引擎随后拒绝 |
| PC-03 | project | 复制 Group 时原轨道与副本交错排列，分组层级被打散 |
| ARR-01 | arrangement | epoch 改变后 `clipDrag`/`clipResize` 残留，新工程仍显示旧 Clip 并失去选择/hover |
| ARR-02 | arrangement | freehand 自动化只删除与采样点时间完全相等的旧点，区间内旧点保留成尖峰 |
| ARR-03 | arrangement | 拖到禁止位置释放（显示 not-allowed）仍提交上一次有效移动 |
| ARR-04 | arrangement | 焦点在 Clip 编辑区时 Cmd/Ctrl+S 被丢弃，不保存 |
| ARR-05 | arrangement | 同一编辑面有 viewport、行 slot、lane host、每个 Clip 多个 Tab 入口，违反单一 owner |
| ARR-06 | arrangement | lane 手势没有失焦取消，Tab 走后松开仍提交 |
| SEC-01 | sections | 超过 2048 个音符的选区 Cut 后无法 Paste 回来（解析端上限与生成端不一致） |
| SEC-02 | sections | MIDI 选区按下标存储，Undo 恢复前序音符后选区指向另一音符 |
| SEC-03 | sections | 拖动音符时横向滚动，时间差没计入 scrollX，音符脱离指针 |
| SEC-04 | sections | Browser 搜索按 Escape 把焦点放到 tabIndex=-1 的树容器，下一次 Tab 回到窗口开头 |
| UPA-03 | platform | 语言设置读写没有失败边界：settings 文件损坏会阻止启动，写失败产生未处理 rejection |
| UPA-04 | ui | DragPad 没有接窗口失活取消，数值预览与光标锁定不回滚 |
| UPA-05 | ui | Menu 已处理的 Home/Escape/Left 继续冒泡：Home 同时 rewind，Escape 同时关闭 Clip Edit |
| UPA-06 | ui | Footer CollapseDivider 的 Home 同时展开 Footer 并 rewind |
| UPA-07 | ui | DragPad Escape 取消数值拖动后继续冒泡，关闭 Clip Edit |
| UPA-08 | platform | 日志脱敏只作用于 console，native sink 落盘原文 |
| RUST-01 | engine | Return 轨的 Solo 被接受但完全不生效 |
| RUST-02 | engine | 显示为 −∞ 的 -60dB 音量/Send 仍有 0.001 增益，Send 拉到底不静音 |
| RUST-03 | native | 原子写每次清理同目录“其他 PID”的临时文件，会删掉另一个活跃进程正在写的文件，使其 rename 失败 |
| TD-01 | tooling | pre-commit 的 UI 地图读取整个工作树，未暂存改动混入提交，CI `--check` 随后失败 |

## P2

PC-04（原生 backend 构造失败泄漏 session）、ARR-07（minimap 每次播放位置更新重投影全部 Clip）、SEC-05（性能弹层直接显示 backend phase 英文值）、RUST-04（遥测队列满时泄漏 payload）、RUST-05（session dispose 不释放 env cleanup hook）、TD-02…TD-08（renderer 产物身份校验不全、setup 的“不重建”说法与 build.sh 不符、scan 漏 `describe.skip`、DOM lint 漏 `app/**`、UI 地图漏 Clip 选择器、`gpuix.md` 仍要求 waveform 用 div、commit-msg 把 scope 里的单词当类型）。

## 分片报告

- [project-core](project-core.md)
- [arrangement](arrangement.md)
- [sections](sections.md)
- [ui-platform-app](ui-platform-app.md)
- [rust](rust.md)
- [tooling-docs](tooling-docs.md)
