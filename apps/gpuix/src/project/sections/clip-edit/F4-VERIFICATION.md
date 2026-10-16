# Clip editors F4 消费者复核

2026-10-15。MIDI原生描边、像素与离屏性能已通过本轮复测。Pattern命中修复、lane音频消费者复测和真实组合窗口验收仍未完成，不发送worker_done。

## 代码与数据链路

正确性单元为 `c66abb5`，协调者已合入主干 `5444e5d`。本分支通过 `f209d4a` 同步F4c `66f9ce9`，通过 `b6cd3cc` 同步主干正确性复核。共享十一补丁解析通过。只重建本worktree自有native，不重建共享vendor。

`ClipEditorSlot` 只传 `clipId`、`trackId`、`close`。Footer消费唯一导出类型，编辑器从adapter读取工程。MIDI大对象和typed array不进入React props。`selection`在同一owner原子保存 `{indices,current}`，组内点击与Shift增减不重排成员，Cmd+A保留current，gridcell、slider及力度数值使用同一锚点。

MIDI body是唯一wheel owner。NoteGrid根焦点保留0，符合 `gpuix-ui-standards.md:74` 的二维直接编辑面规则。力度只有一个Tab入口，Left/Right导航，Up/Down保持组力度与Undo语义，Space冒到窗口。

无文字音符每note一条原生bordered quad记录，使用每batch `strokeWidth` 与 `strokeColor`。五片fill描边模拟已删除，没有TS舍入或scale读取。相同fill与stroke合为同一material，重叠层保持源绘制顺序。有文字音符保留原生文字盒的边框、裁切与绘制层级。

`verification/consumer-probe.tsx` 使用真实ClipEditor、project runtime和同一session的 `readProjectPeaks`。临时WAV由Rust解码，实际metadata为44100Hz、88200frames、2channels。16384px查询返回65536个有限f32；offset=0.25与1.25哈希相同，负偏移也实际查询。没有UI合成峰值，不把MIDI或Pattern元数据称为已接通合成器。

正常工程13notes、16steps；满量工程10000notes、1024steps。数据没有减量。demo与probe共用 `demo/project.ts`。生成PNG留在ignored evidence，不stage图片。

## 真实MIDI性能

以下是同一完整工程、1100×420编辑器和共享原生renderer的实际消费者数据。计时为CPU墙钟，不是GPU完成时间。scroll与zoom使用一次native wheel dispatch加一次flush；redraw为额外单次flush；编辑包含native input的preflush。

| 模式与消费者         | 初始节点 | scroll p90 ms | zoom p90 ms | redraw p90 ms | 编辑 p90 ms |
| -------------------- | -------: | ------------: | ----------: | ------------: | ----------: |
| DEV旧div             |    40291 |       917.960 |    1113.414 |       372.593 |    1457.163 |
| DEV原生stroke        |      342 |        12.495 |      12.993 |         4.420 |      35.840 |
| production旧div      |    40291 |       642.541 |     655.903 |       334.632 |    1085.865 |
| production原生stroke |      342 |        11.155 |      12.689 |         4.055 |      35.322 |

新路径两模式都满足scroll、zoom、redraw p90小于16ms和编辑p90小于50ms。旧消费者有双wheel handler，新消费者只消费一次；表比较各自实际交互语义，不将差异解释为单独更换绘制API的倍数收益。

旧源码由reference preload从 `556d829` 读取，未改产品文件。原A阶段保留全部可见语义节点，只批量纯绘制，仍约20307节点，不是最终方案。原始结果和最终摘要分别在 `f4-reference-final*-dense`、`f4-native-stroke*-dense` 与 `evidence/f4-native-stroke-summary.json`。

## 同域像素

旧双handler的一次wheel会改变两级viewport。新路径用 `CLIP_EDIT_REPLAY_DOUBLE_WHEEL=1` 显式重放两次输入，只用于达到相同实际viewport，不用于默认性能门槛。

正常与满量各比较initial、zoom后step0、scroll后step2及final，共8图，decoded RGBA全部0diff。满量初始RGBA SHA-256为 `b66cd2eedc943d933224a8c9131fab74d0e96897dfb59244be1913e52162e93e`。原2118边缘像素差异消失。完整结果在 `f4-native-stroke-summary.json`，不是PNG数量验收。

默认scale的像素结果来自消费者实际GPU PNG。F4c共享owner另覆盖1、1.25、1.5、2倍scene geometry、alpha与paint顺序，见 `scripts/gpuix-main/quad-batch/BORDERED-REPORT.md`；没有把非默认scale的scene oracle说成截图结果。

## 复跑入口

从 `apps/gpuix` 执行：

```sh
bun src/app/verification/clip-edit/consumer-probe.tsx current dense midi
NODE_ENV=production bun src/app/verification/clip-edit/consumer-probe.tsx current-production dense midi
CLIP_EDIT_REFERENCE=556d829 bun --preload ./src/app/verification/clip-edit/reference-preload.ts src/app/verification/clip-edit/consumer-probe.tsx reference dense midi
CLIP_EDIT_REPLAY_DOUBLE_WHEEL=1 bun src/app/verification/clip-edit/consumer-probe.tsx replay dense midi
```

`reference-preload.ts` 校验历史对象式入口，只在验证运行中装配旧API，产品没有旧props shim或双API。不同像素检查复用 `scripts/gpuix-main/quad-batch/compare-pixels.py`。

## 当前门禁

| 检查 | 实跑结果 |
| --- | --- |
| 十一补丁 `check.mjs --resolution` | 通过 |
| 自有 `pnpm native:build` | 通过，Rust编译3.83s |
| apps/gpuix `tsc --noEmit` | 原生stroke切换后通过 |
| clip-edit、Footer、shared/quads、真实backend | stroke切换后104pass、0fail、85272assertions、21files |
| 完整原30项及新增8项mutation | baseline0fail，38项KILLED，源恢复校验通过 |
| 新增stroke metadata遗漏mutation | KILLED，实际native div像素回归失败；恢复后回归通过 |
| 正常及满量同域8张GPU PNG | 8组decoded0diff |
| `c66abb5`提交hook | Ultracite通过，无no-verify，无图片或profile入stage |
| `c66abb5`确定性扫描 | 0HARD、2WARN，仅demo与probe的1100×420测量窗口尺寸，非产品布局常量 |

完整应用套件、最终Pattern与Audio复测、真实组合窗口仍待本dispatch后续完成。只读独立审查不能替代这些运行结果。

## 自审结果

| 发现 | 分类与处置 | 证据 |
| --- | --- | --- |
| Spec P2组内点击未更新current | 必修，已关闭；原子成员与current，不重排剪贴板顺序 | 新三回归先3fail后邻近32pass，group hit与Cmd+A变异KILLED |
| Standards P2列表roving与piano roll编辑冲突 | 仲裁，已关闭；f9d4816明确二维编辑面根0 | UI规范:74，Standards复核关闭 |
| Standards P3纯投影依赖React文件 | 必修，已关闭；纯类型及转换移到paint-layers.ts | 无React/SDK依赖，复核关闭 |
| 五片描边2118像素差异 | 仲裁后修复；F4c单条bordered record替代模拟 | 实际消费者8组0diff，默认性能通过 |

审查lane是现有 `pstack-reviewer`，job为 `ClipStandards`、`ClipSpec`。具体model未由工具暴露，不声称已证明。协调者在合入前另作固定模型复核。两轴只读，原findings均关闭，未运行检查或改源码。

## Pattern与Audio仍需完成

完整1024steps的strip实测x4、宽1092、高34，首步宽2，末步x4096，超过1100px视口。真实点击step1中心改变store step4，step2改变8、step3改变12。证据在 `evidence/f4-pattern-hit-dense/result.json` 的bounds与requested/changed索引，backend ready、pending0。协调者已批准本owner用同一纯几何、最小操作宽度、共享横向滚动与可见裁剪修复，独立提交。

Audio等待lane唯一PeakColumns实现合入。此前profile主要是数千native波形节点及mutation。Pattern profile主要是native click、flush与TestRenderer同步getBounds；这些driver额外flush不能冒充live renderer成本。

## 错题

- 双wheel owner让一次native输入执行两次缩放和重绘。只换绘制方式不会修输入重复。
- 两个同时存活的TestRoot像素对照未捕获负变异。顺序捕获与独立oracle后，丢注册和不上传新几何都失败，原空转结果未算验收。
- 分别snap五片fill不等于div的原生border，不能恢复TS的1x补偿。
- 组成员不能决定current。组内点击必须原子更新current，不能靠重排成员修复。
- 本地config落后共享vendor也会触发patch门禁。同步实际主干后再归因。

## 已验证做法

- ID入口与只读快照函数移除React DEV的大对象遍历，不关闭instrumentation。
- 单一selection owner覆盖Tab、Left/Right、Up/Down、AX值、指针同步与Undo。
- 同一完整工程保留旧、新数据和同域像素，分别报告CPU计时与GPU PNG。
- 所有headless root在finally卸载。没有自启桌面窗口，没有停止用户服务。
