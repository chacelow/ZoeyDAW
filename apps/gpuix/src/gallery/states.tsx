import { useRef, useState } from "react"
import { useTheme } from "../shared/theme/ThemeProvider"
import {
  Button,
  ControlEnvironmentProvider,
  DragPadNumber,
  DragPadBar,
  DragPadBipolar,
  DragPadToggle,
  PanControl,
  DropdownButton,
  PopupButton,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  ToggleGroup,
  ToggleGroupItem,
  MotionTabs,
} from "../ui/controls"
import type { PublicInstance } from "@gpuix/react"
import type { CursorLockPort } from "../ui/controls"

const glyph =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="currentColor" d="M4 2v12l10-6z"/></svg>'

export function StateGallery({ cursorLock }: { readonly cursorLock: CursorLockPort }) {
  const theme = useTheme()
  const zh = process.env.GALLERY_LOCALE === "zh"
  const disabled = process.env.GALLERY_DISABLED === "1"
  const text = (en: string, cn: string) => (zh ? cn : en)
  const [number, setNumber] = useState(120)
  const [level, setLevel] = useState(50)
  const [pan, setPan] = useState(0)
  const [active, setActive] = useState(false)
  const [input, setInput] = useState(text("Native input", "原生输入"))
  const [mode, setMode] = useState("beats")
  const [radio, setRadio] = useState("a")
  const [tool, setTool] = useState("")
  const [keys, setKeys] = useState("")
  const inputRef = useRef<PublicInstance | null>(null)
  const row = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.control["--spacing-control-gap"],
  }
  const icon = (
    <svg
      aria-hidden="true"
      source={glyph}
      style={{
        width: theme.control["--spacing-control-icon"],
        height: theme.control["--spacing-control-icon"],
      }}
    />
  )
  return (
    <ControlEnvironmentProvider value={{ cursorLock }}>
      <div
        role="application"
        aria-label="Control state specimens"
        onKeyDown={event => setKeys(event.key ?? "")}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "start",
          width: "100%",
          height: "100%",
          padding: theme.project.panelGap,
          gap: theme.control["--spacing-control-track-gap"],
          color: theme.colors.foreground,
          backgroundColor: theme.colors.background,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        <text>
          {text(
            "Real control states · Tab / Enter / Escape",
            "真实控件状态 · Tab / Enter / Escape"
          )}
        </text>
        <div style={row}>
          <Button
            label="State button"
            disabled={disabled}
            active={active}
            onActiveChange={setActive}
          >
            {text("Activate", "激活")}
          </Button>
          <Button label="State icon" disabled={disabled} iconOnly icon={icon} />
          <Button disabled={disabled} variant="outline">
            {text("Outline", "轮廓")}
          </Button>
          <Button disabled={disabled} variant="secondary">
            {text("Secondary", "次要")}
          </Button>
          <Button disabled={disabled} variant="ghost">
            {text("Ghost", "透明")}
          </Button>
          <Button disabled={disabled} variant="destructive">
            {text("Delete", "删除")}
          </Button>
          <Button disabled={disabled} variant="link">
            {text("Link", "链接")}
          </Button>
        </div>
        <div style={row}>
          <DragPadNumber
            label="State number"
            value={number}
            onChange={setNumber}
            min={20}
            max={300}
            step={1}
            defaultValue={120}
            disabled={disabled}
          />
          <DragPadBar
            label="State bar"
            value={level}
            onChange={setLevel}
            min={0}
            max={100}
            step={1}
            defaultValue={50}
            disabled={disabled}
          />
          <DragPadBipolar
            label="State bipolar"
            value={pan}
            onChange={setPan}
            min={-1}
            max={1}
            step={0.01}
            defaultValue={0}
            disabled={disabled}
          />
          <PanControl label="State pan" value={pan} onChange={setPan} disabled={disabled} />
          <DragPadToggle
            label="State toggle"
            value={active}
            onChange={setActive}
            disabled={disabled}
          />
        </div>
        <div style={row}>
          <DropdownButton
            label="State dropdown"
            value={mode}
            onChange={setMode}
            disabled={disabled}
            items={[
              { id: "beats", label: text("Beats", "节拍") },
              { id: "tones", label: text("Tones\nPreserves pitch", "音调\n保留音高") },
              { id: "off", label: text("Disabled", "禁用"), disabled: true },
            ]}
          />
          <PopupButton
            label="State popup"
            trigger={text("Adjust popup", "调整弹层")}
            disabled={disabled}
          >
            <DragPadNumber
              label="State popup number"
              value={number}
              onChange={setNumber}
              min={20}
              max={300}
              step={1}
            />
            <text>{text("Drag and wheel: remains open", "拖动与滚轮：保持打开")}</text>
          </PopupButton>
        </div>
        <div style={row}>
          <Label controlRef={inputRef}>{text("Input label", "输入标签")}</Label>
          <Input
            ref={inputRef}
            aria-label="State input"
            value={input}
            onValueChange={setInput}
            disabled={disabled}
            style={{ width: theme.project.controlsWidth }}
          />
        </div>
        <RadioGroup
          aria-label="State radio group"
          value={radio}
          onValueChange={setRadio}
          disabled={disabled}
          orientation="horizontal"
          style={{ gap: theme.control["--spacing-control-gap"] }}
        >
          <RadioGroupItem value="a">{text("First", "第一")}</RadioGroupItem>
          <RadioGroupItem value="b">{text("Second", "第二")}</RadioGroupItem>
        </RadioGroup>
        <ToggleGroup
          aria-label="State tool group"
          type="single"
          value={tool}
          onValueChange={setTool}
          disabled={disabled}
        >
          <ToggleGroupItem value="draw">{text("Draw", "绘制")}</ToggleGroupItem>
          <ToggleGroupItem value="snap">{text("Snap", "吸附")}</ToggleGroupItem>
        </ToggleGroup>
        <MotionTabs
          tabWidth={theme.project.identityWidth}
          options={[
            {
              key: "clips",
              label: text("Clips", "片段"),
              content: <text>{text("Clip content", "片段内容")}</text>,
            },
            {
              key: "devices",
              label: text("Devices", "装置"),
              content: <text>{text("Device content", "装置内容")}</text>,
            },
          ]}
        />
        <div
          role="group"
          aria-label="State transport region"
          style={{ ...row, gap: theme.transportControl["--spacing-control-gap"] }}
        >
          <DragPadNumber
            label="State transport number"
            value={number}
            onChange={setNumber}
            min={20}
            max={300}
            step={1}
            defaultValue={120}
            disabled={disabled}
            size="transport"
          />
          <Button
            label="State transport icon"
            disabled={disabled}
            iconOnly
            size="transport"
            icon={
              <svg
                aria-hidden="true"
                source={glyph}
                style={{
                  width: theme.transportControl["--spacing-control-icon"],
                  height: theme.transportControl["--spacing-control-icon"],
                }}
              />
            }
          />
        </div>
        <text role="status" aria-label="State keyboard log">
          {keys}
        </text>
      </div>
    </ControlEnvironmentProvider>
  )
}
