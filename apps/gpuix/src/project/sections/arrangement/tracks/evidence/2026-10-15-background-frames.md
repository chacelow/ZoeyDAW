# 已有后台帧记录

结论：已有记录能证明 accepted telemetry 继续、部分区间 renderer 仅随手动操作增加，不能把根因判为失活或遮挡。没有采集原生 key/main、occlusion 或 frame callback 计数。窗口截图清晰不代表窗口在桌面上未被遮挡。

时间为原始截图文件 mtime 的 UTC，精度1秒，不是 callback 的墙钟时间。frames/samples 来自截图前后按下已有 Frame stats 按钮的原生读数。最后一行来自独立的前台窗口检查。

| 时间点 UTC | 窗口 key/main 状态 | 是否被遮挡 | renderer frames / samples | frame callback 计数 | 是否在播放 |
| --- | --- | --- | --- | --- | --- |
| 02:34:25，后台黑图 | 未采样 | 未采样 | 截图前10/10，后11/11 | 未记录，不能由frames推断 | accepted telemetry前后均true |
| 02:35:02，bringToCurrentSpace后仍黑 | 未采样 | 未采样；移到当前Space不等于可见 | 前12/12，后13/13 | 未记录 | 前后均true |
| 02:37:40，G1 drag读回 | 未采样；拖动曾用takeover | 未采样 | 前25/25，后54/54 | 未记录 | 前后均false |
| 02:38:11，真实电平清晰图 | 未采样 | 未采样；只有窗口级截图 | 前62/62，后180/180 | 未记录 | 前后均true |
| 02:39:08，修改真实Clip gain后的旧画面 | 未采样 | 未采样 | 前832/832，后833/833 | 未记录 | 前后均true |
| 02:39:45，电平画面仍旧 | 未采样 | 未采样 | 前834/834，后835/835 | 未记录 | 前后均true |
| 02:41:31.816，前台窗口检查 | 原生key/main未采样；OS前台窗口不是tracks | 未采样 | 未同期采样；上次835/835 | 未记录 | 未同期采样；上次true |

02:39:08前后 telemetry sequence 为9538→9680，02:39:45为10529→10678。真实音频clock与levels继续更新，但两个截图区间之间renderer只增加少量帧；accepted telemetry的某轨道L已为+2.0308dB，UI Audio仍是旧L−22.0dB。此次没有记录轨道ID到名称映射，因此不把该原始ID额外映射为Audio。

“失活但可见”和“被遮挡”两种情况都未建立独立样本。前台恢复与帧恢复相关只是一项观察，不是根因结论。后续需在同一时间基准下采集原生window/app状态、occlusion、frame callback计数和renderer统计，再由协调者决定原生切片。

原始数据：`2026-10-15-g1-slot-events.json`、`2026-10-15-g1-slot-service.txt`，对应`g1-slot-playing`、`g1-slot-background-black`、`g1-slot-overload-stale`的PNG与AX。G1恢复锚点与读回均为(1418,353)，发生在tool恢复用户原指针之前。停后peak视觉未完成。
