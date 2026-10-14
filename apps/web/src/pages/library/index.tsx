/**
 * ComponentLibraryPage — `/library` 路由。
 *
 * 一处集中展示本仓所有统一的 DAW 交互组件；审完才在业务代码里推广使用。 分组：DragPad* / DropdownButton / @zoeymind/ui Button 变体。 数值、按钮和开关共用 UI 包的控件尺寸 token。
 */
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  Separator,
  DragPadBar,
  DragPadBipolar,
  DragPadNumber,
  DragPadToggle,
  DropdownButton,
  PopupButton,
  rowInteractiveClasses,
} from "@zoeymind/ui"
import { ControlEnvironmentBridge } from "@/components/SharedControlBridge"
import {
  ControlInteractionsProvider,
  useControlInteractions,
} from "@/shared/control-interactions/index"
import { ControlSizingDemo } from "./ControlSizingDemo"

export function ComponentLibraryPage() {
  return (
    <ControlInteractionsProvider>
      <ControlEnvironmentBridge>
        <LibraryContent />
      </ControlEnvironmentBridge>
    </ControlInteractionsProvider>
  )
}

function LibraryContent() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [bpm, setBpm] = useState(140)
  const [position, setPosition] = useState(1)
  const [volume, setVolume] = useState(0.75)
  const [send, setSend] = useState(0.3)
  const [pan, setPan] = useState(0)
  const [gain, setGain] = useState(0)
  const [link, setLink] = useState(false)
  const [mute, setMute] = useState(false)
  const [solo, setSolo] = useState(true)
  const [scale, setScale] = useState<"C" | "D" | "E" | "F" | "G" | "A" | "B">("C")
  const [key, setKey] = useState<"major" | "minor" | "dorian">("major")

  return (
    <div className="bg-background text-foreground flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="control-icon"
          onClick={() => navigate("/")}
          aria-label={t("common.back")}
        >
          <ChevronLeft />
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-lg font-semibold">{t("library.title", "组件库")}</h1>
          <p className="text-muted-foreground text-xs">
            {t(
              "library.description",
              "DAW 通用交互组件：数值拖动、键盘输入、下拉与开关。控件共用 UI 包的尺寸和颜色 token。"
            )}
          </p>
        </div>
        <MappingModeToggle />
      </header>

      <Section title="DragPadNumber" description="按住上下拖，Shift 精细；用于 BPM / 位置 / 拍号。">
        <DragPadNumber
          value={bpm}
          onChange={setBpm}
          min={20}
          max={999}
          step={0.01}
          label="BPM"
          format={v => v.toFixed(2)}
          defaultValue={120}
          sensitivity={0.0015}
        />
        <DragPadNumber
          value={position}
          onChange={setPosition}
          min={1}
          max={9999}
          step={1}
          label="位置"
          defaultValue={1}
          format={v => `${Math.max(1, Math.round(v))}.1.1`}
        />
        <ValueEcho
          pairs={[
            ["BPM", bpm.toFixed(2)],
            ["位置", `${Math.round(position)}.1.1`],
          ]}
        />
      </Section>

      <Section title="DragPadBar" description="0 → max 单向填充；用于音量 / Send / Dry/Wet / CPU。">
        <DragPadBar
          value={volume}
          onChange={setVolume}
          min={0}
          max={1}
          step={0.001}
          label="音量"
          defaultValue={0.75}
          format={v => `${Math.round(v * 100)}`}
        />
        <DragPadBar
          value={send}
          onChange={setSend}
          min={0}
          max={1}
          step={0.001}
          label="Send A"
          color="var(--chart-2)"
          defaultValue={0}
          format={v => `${Math.round(v * 100)}`}
        />
        <ValueEcho
          pairs={[
            ["音量", `${Math.round(volume * 100)}`],
            ["Send", `${Math.round(send * 100)}`],
          ]}
        />
      </Section>

      <Section
        title="DragPadBipolar"
        description="中心 0，左右正负；用于 Pan / EQ Gain / 调性偏移。"
      >
        <DragPadBipolar
          value={pan}
          onChange={setPan}
          min={-1}
          max={1}
          step={0.01}
          label="Pan"
          defaultValue={0}
          format={v =>
            v === 0 ? "C" : v > 0 ? `R${Math.round(v * 50)}` : `L${Math.round(-v * 50)}`
          }
        />
        <DragPadBipolar
          value={gain}
          onChange={setGain}
          min={-12}
          max={12}
          step={0.1}
          label="Gain"
          color="var(--chart-1)"
          defaultValue={0}
          format={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}`}
        />
        <ValueEcho
          pairs={[
            ["Pan", pan.toFixed(2)],
            ["Gain", `${gain.toFixed(1)} dB`],
          ]}
        />
      </Section>

      <Section
        title="尺寸稳定性"
        description="小数按 step 格式化；改变数值和切换 ON/OFF 时，尺寸由范围样本决定。"
      >
        <ControlSizingDemo />
      </Section>

      <Section title="DragPadToggle" description="点击翻转；active 底色切 --primary。">
        <DragPadToggle
          value={link}
          onChange={setLink}
          label="Link"
          labelOn="LINK"
          labelOff="LINK"
        />
        <DragPadToggle
          value={mute}
          onChange={setMute}
          label="Mute"
          labelOn="M"
          labelOff="M"
          color="var(--destructive)"
        />
        <DragPadToggle
          value={solo}
          onChange={setSolo}
          label="Solo"
          labelOn="S"
          labelOff="S"
          color="var(--chart-4)"
        />
        <ValueEcho
          pairs={[
            ["Link", String(link)],
            ["Mute", String(mute)],
            ["Solo", String(solo)],
          ]}
        />
      </Section>

      <Section
        title="DropdownButton"
        description="点击展开菜单；同尺寸同风格。用于音阶 / 调式 / 预设切换。"
      >
        <DropdownButton
          value={scale}
          onChange={setScale}
          label="音阶"
          description="工程的根音"
          items={["C", "D", "E", "F", "G", "A", "B"].map(id => ({
            id: id as typeof scale,
            label: id,
          }))}
        />
        <DropdownButton
          value={key}
          onChange={setKey}
          label="调式"
          description="工程使用的音阶类型"
          items={[
            { id: "major", label: "Major" },
            { id: "minor", label: "Minor" },
            { id: "dorian", label: "Dorian" },
          ]}
        />
        <ValueEcho
          pairs={[
            ["音阶", scale],
            ["调式", key],
          ]}
        />
      </Section>

      <Section
        title="DropdownButton · heading / separator / shortcut / 长文本换行"
        description="分组菜单（heading + separator），右侧 shortcut 展示，长文本自动换行不被挤。"
      >
        <DropdownButton<"major" | "minor" | "dorian">
          value={key}
          onChange={setKey}
          label="分组菜单示例"
          description="点开看效果：两组 + separator + shortcut + 长说明换行"
          matchTriggerWidth={false}
          items={[
            { type: "heading", id: "h-common", label: "COMMON" },
            { id: "major", label: "Major", shortcut: "M" },
            { id: "minor", label: "Minor", shortcut: "N" },
            { type: "separator", id: "sep-1" },
            { type: "heading", id: "h-exotic", label: "EXOTIC" },
            {
              id: "dorian",
              label: "Dorian — 带升六度的小调色彩（用于复古摇滚 / jazz 转场）",
              shortcut: "⌘D",
            },
          ]}
        />
      </Section>

      <Section
        title="Button（@zoeymind/ui）"
        description="size='control' 和 'control-icon' 共用 DragPad 的尺寸 token。"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" size="control">
            Default
          </Button>
          <Button variant="outline" size="control">
            Outline
          </Button>
          <Button variant="ghost" size="control">
            Ghost
          </Button>
          <Button variant="secondary" size="control">
            Secondary
          </Button>
          <Button variant="destructive" size="control">
            Destructive
          </Button>
          <Button variant="link" size="control">
            Link
          </Button>
        </div>
      </Section>

      <Section
        title="Mapping / Arm 模式"
        description="点下面的 Mapping 按钮或页首开关 → 所有 mappable 的组件（上面所有 DragPad / DropdownButton）会脉冲高亮，示意可以绑 automation / MIDI。按一下 BPM 看效果。"
      >
        <QuickMappingToggle />
        <span className="text-muted-foreground text-[11px]">
          mapping 开启时 → 看 BPM / Pan / Volume / Scale 都在 pulse
        </span>
      </Section>

      <Section
        title="控件信息 · 警告 push"
        description="画廊拥有独立的控件信息与警告：hover 控件查看信息；没有 hover 时显示最新警告，不影响工程底部状态栏。"
      >
        <WarningDemo />
      </Section>

      <Section
        title="List 行（后续 Browser / 下拉菜单复用）"
        description={t("project.browser.listStyle")}
      >
        <ListDemo />
      </Section>

      <Section
        title="双击 reset"
        description="任何 DragPad 传 `defaultValue` 后，双击按钮立刻恢复默认（不进拖动）。试试：双击 BPM / Pan / Volume。"
      >
        <DragPadNumber
          value={bpm}
          onChange={setBpm}
          min={20}
          max={999}
          step={0.01}
          defaultValue={120}
          label="BPM"
          format={v => v.toFixed(2)}
          sensitivity={0.0015}
        />
        <DragPadBipolar
          value={pan}
          onChange={setPan}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          label="Pan"
          format={v =>
            v === 0 ? "C" : v > 0 ? `R${Math.round(v * 50)}` : `L${Math.round(-v * 50)}`
          }
        />
        <DragPadBar
          value={volume}
          onChange={setVolume}
          min={0}
          max={1}
          step={0.001}
          defaultValue={0.75}
          label="Vol"
          format={v => `${Math.round(v * 100)}`}
        />
      </Section>

      <Section
        title="DropdownButton 对齐变体"
        description="align / side / sideOffset / matchTriggerWidth 控制 popup 定位，不被按钮宽度拉。"
      >
        <DropdownButton
          value={scale}
          onChange={setScale}
          label="从右对齐"
          align="end"
          matchTriggerWidth={false}
          items={["C", "D", "E", "F", "G", "A", "B"].map(id => ({
            id: id as typeof scale,
            label: id,
          }))}
        />
        <DropdownButton
          value={key}
          onChange={setKey}
          label="从上方弹"
          side="top"
          matchTriggerWidth={false}
          items={[
            { id: "major", label: "Major" },
            { id: "minor", label: "Minor" },
            { id: "dorian", label: "Dorian" },
          ]}
        />
        <DropdownButton
          value={scale}
          onChange={setScale}
          label="右侧弹"
          side="right"
          sideOffset={8}
          matchTriggerWidth={false}
          items={["C", "D", "E", "F", "G", "A", "B"].map(id => ({
            id: id as typeof scale,
            label: id,
          }))}
        />
      </Section>

      <Section
        title="PopupButton（装任意内容的浮窗）"
        description="区别于 DropdownButton 的菜单项列表：PopupButton 可以装任何 UI，关闭由内容/用户控制。常见：mini knob 组、键盘图、色板。"
      >
        <PopupButton
          label="Pan + Gain 浮窗"
          description="在一个浮窗里同时调 Pan 和 Gain"
          trigger="调音台"
          align="start"
          side="bottom"
          contentClassName="w-56 p-3"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Pan</span>
              <DragPadBipolar
                value={pan}
                onChange={setPan}
                min={-1}
                max={1}
                step={0.01}
                defaultValue={0}
                label="Pan"
                format={v =>
                  v === 0 ? "C" : v > 0 ? `R${Math.round(v * 50)}` : `L${Math.round(-v * 50)}`
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Gain</span>
              <DragPadBipolar
                value={gain}
                onChange={setGain}
                min={-12}
                max={12}
                step={0.1}
                defaultValue={0}
                label="Gain"
                color="var(--chart-1)"
                format={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}`}
              />
            </div>
          </div>
        </PopupButton>
      </Section>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description?: string
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </div>
      <Separator />
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}

function ValueEcho({ pairs }: { readonly pairs: [string, string][] }) {
  return (
    <div className="text-muted-foreground ml-auto flex items-center gap-3 text-[11px] tabular-nums">
      {pairs.map(([k, v]) => (
        <span key={k}>
          {k}: <span className="text-foreground">{v}</span>
        </span>
      ))}
    </div>
  )
}

function MappingModeToggle() {
  const active = useControlInteractions(state => state.mappingActive)
  const toggle = useControlInteractions(state => state.toggleMapping)
  return (
    <DragPadToggle
      value={active}
      onChange={toggle}
      label="Mapping"
      labelOn="Mapping ON"
      labelOff="Mapping OFF"
      mappable={false}
      className="ml-auto"
      size="compact"
    />
  )
}

function QuickMappingToggle() {
  const active = useControlInteractions(state => state.mappingActive)
  const toggle = useControlInteractions(state => state.toggleMapping)
  return (
    <DragPadToggle
      value={active}
      onChange={toggle}
      label="Mapping 示例"
      labelOn="退出 Mapping"
      labelOff="进入 Mapping"
      mappable={false}
    />
  )
}

function WarningDemo() {
  const info = useControlInteractions(state => state.info)
  const warnings = useControlInteractions(state => state.warnings)
  const pushWarning = useControlInteractions(state => state.pushWarning)
  const dismissWarning = useControlInteractions(state => state.dismissWarning)
  const clearWarnings = useControlInteractions(state => state.clearWarnings)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="control"
        variant="secondary"
        onClick={() =>
          pushWarning({ id: "no-audio", message: "未检测到音频输出设备", severity: "warning" })
        }
      >
        push warning
      </Button>
      <Button
        size="control"
        variant="secondary"
        onClick={() =>
          pushWarning({
            id: "sample-missing",
            message: "采样文件缺失：kick-909.wav",
            severity: "error",
          })
        }
      >
        push error
      </Button>
      <Button
        size="control"
        variant="secondary"
        onClick={() => pushWarning({ id: "autosave", message: "已自动保存草稿", severity: "info" })}
      >
        push info
      </Button>
      <Button size="control" variant="secondary" onClick={clearWarnings}>
        clear all
      </Button>
      <span className="text-muted-foreground text-[11px]">
        {info ? `控件信息：${info}` : `最新警告：${warnings.at(-1)?.message ?? "无"}`}；现有{" "}
        {warnings.length} 条。
      </span>
      {warnings.map(w => (
        <button
          key={w.id}
          type="button"
          onClick={() => dismissWarning(w.id)}
          className="bg-muted text-muted-foreground hover:bg-accent h-7 shrink-0 rounded-sm px-2 text-[11px]"
        >
          × {w.id}
        </button>
      ))}
    </div>
  )
}

function ListDemo() {
  const items = [
    { id: "kick", label: "Kick 909.wav" },
    { id: "snare", label: "Snare Rimshot.wav" },
    { id: "hat", label: "Hat Closed.wav" },
    { id: "clap", label: "Clap Analog.wav" },
  ]
  const [selected, setSelected] = useState("snare")
  return (
    <div className="bg-muted flex min-w-[260px] flex-col gap-0.5 rounded-sm p-1">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => setSelected(item.id)}
          className={rowInteractiveClasses({ active: selected === item.id })}
        >
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
