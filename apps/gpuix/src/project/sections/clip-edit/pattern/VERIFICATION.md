# Pattern viewport 验证

2026-10-15。原1024steps的flex步距与命中均分公式不一致。1092px视口中首步宽2px，末步在x4096；真实点击step1改变step4，900px回归中改变step5。

## 修复

`geometry.ts` 是绘制、命中、可见范围与键盘reveal的唯一几何来源。最小outer宽度读取control-track档13，gap读取control-gap档2，border读取theme.design.shape.controlBorderWidth。形状读取toggleRadius，焦点框读取focusRingWidth。纯函数只接度量参数，没有产品像素字面量。

正常周期仍fit视口。长周期维持可操作宽度，以现有ControlledScrollbar操作唯一offset，屏外step不挂载。源周期与sourceOffset相位保留，负偏移按同一周期回绕。单一编辑根Tab0，step与scrollbar为-1；方向键和Home/End导航，Enter切当前步，Space留给窗口播放。

共享scrollbar曾覆盖已有onMouseUp，父wrapper接不到捕获release。即时焦点回归在修复前得到scrollbar12而非owner10。协调者在6d9d377修正共享转发；Pattern只传onMouseUp=focusOwner，没有wrapper补偿或计时器。

## 实际结果

- 原生点击1、2、3与1023、wheel后点击、共享scrollbar点击均编辑相应store源索引。
- brush中wheel后移动跨越1..12，release产生一条Undo，Escape与失活全部回滚且无历史。
- Pattern与几何回归18pass、0fail、1661assertions。错误均分命中变异5fail，全量屏外挂载变异1fail。
- 真实Rust满量probe保留10000notes、1024steps，decode44100Hz/88200frames/stereo、backend ready/pending0；初始89nodes，首步13×34，末步初始不挂载，End后1023在视口内且实际只改变1023。
- native整页GPU显示13px步骤与共享滚动条，不再是细点。双click端到端CPU p90为37.061ms，额外单flush p90为0.603ms；不是GPU完成时间。

证据为 `evidence/f4-pattern-fixed-dense/result.json`、同目录ignored PNG和原 `f4-pattern-hit-dense/result.json`。窗口中AX另实际到达Step1024/1024与scroll14266，Enter将最后步off改on。背景窗口截图被遮挡，不能替代协调者整页视觉评审。

## 自审

既有pstack-reviewer的Standards轴未发现新增问题。Spec轴提出两个覆盖缺口，已补brush滚动与即时scrollbar焦点断言；后者确实发现共享问题并经仲裁修复。具体model不可观察。审查只读，没有把审查者转述的测试数字当执行结果。

## 错题

- 可压缩flex不等于可操作步骤；独立均分命中会改错工程数据。
- 在step click后才看scrollbar焦点，会被后一个动作遮蔽错误。

## 已验证做法

- 同一矩形函数支持绘制、hit、裁剪与reveal。
- 只复用共享Scrollbar，不维持第二份native滚动offset。
- 实际source索引断言覆盖长周期、相位、Undo与取消，不测源码文本。
