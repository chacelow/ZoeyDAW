import { useRef, useState } from "react"
import { render } from "@gpuix/react"
import { nativeCursorLock } from "@/platform/cursor"
import { ThemeProvider, useTheme } from "../shared/theme/ThemeProvider"
import { StateGallery } from "./states"
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  ControlEnvironmentProvider,
  ControlGroup,
  DragPadNumber,
  DragPadBar,
  DragPadBipolar,
  DragPadToggle,
  PanControl,
  DropdownButton,
  PopupButton,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Separator,
  Progress,
  Loading,
  LoadErrorScreen,
  ScrollArea,
  Toaster,
  toast,
  toastLoading,
  Label,
  Input,
  RadioGroup,
  RadioGroupItem,
  ToggleGroup,
  ToggleGroupItem,
  SettingsShell,
  MotionTabs,
  DragPreviewArea,
  IconSlot,
} from "../ui/controls"
import { Icon } from "@/ui/controls/Icon"
import type { PublicInstance } from "@gpuix/react"
import type { ReactNode } from "react"
import type { ControlInfo } from "../ui/controls"

function GalleryCard({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  const theme = useTheme()
  const inset = theme.control["--spacing-control-track-gap"]
  return (
    <Card
      aria-label={title}
      style={{
        width: theme.project.controlsWidth,
        flexShrink: 0,
        paddingTop: inset,
        paddingBottom: inset,
        gap: inset,
        borderRadius: 1,
      }}
    >
      <CardHeader style={{ paddingLeft: inset, paddingRight: inset }}>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent
        style={{
          display: "flex",
          flexDirection: "column",
          gap: inset,
          paddingLeft: inset,
          paddingRight: inset,
        }}
      >
        {children}
      </CardContent>
    </Card>
  )
}

function Gallery() {
  const theme = useTheme()
  const [info, setInfo] = useState<ControlInfo | null>(null)
  const [bpm, setBpm] = useState(120)
  const [level, setLevel] = useState(50)
  const [pan, setPan] = useState(0)
  const [active, setActive] = useState(false)
  const [mode, setMode] = useState("beats")
  const [checked, setChecked] = useState(false)
  const [radio, setRadio] = useState("en")
  const [tools, setTools] = useState<string[]>(["draw"])
  const [input, setInput] = useState("Native input")
  const [status, setStatus] = useState("Ready")
  const [settings, setSettings] = useState(false)
  const [pane, setPane] = useState("general")
  const inputRef = useRef<PublicInstance | null>(null)
  const row = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.control["--spacing-control-gap"],
  }
  const cardRow = { ...row, alignItems: "start", gap: theme.project.panelGap }
  return (
    <ControlEnvironmentProvider value={{ setInfo, cursorLock: nativeCursorLock }}>
      <div
        role="application"
        aria-label="Native controls gallery"
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: theme.colors.background,
          color: theme.colors.foreground,
          padding: theme.project.panelGap,
          gap: theme.control["--spacing-control-track-gap"],
        }}
      >
        <text
          role="heading"
          aria-level={1}
          style={{ fontSize: theme.transportControl["--text-control-track"] }}
        >
          Native controls gallery
        </text>
        <text
          style={{
            fontSize: theme.control["--text-control-track"],
            color: theme.colors.mutedForeground,
          }}
        >
          Compact metrics · shared DragPad sensitivity · native anchored layers · Tab / arrows /
          Enter / Escape
        </text>
        <ScrollArea aria-label="All shared controls" style={{ flexGrow: 1, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: theme.project.panelGap }}>
            <div style={cardRow}>
              <GalleryCard title="Buttons / numeric controls">
                <div style={row}>
                  <Button label="Active button" active={active} onActiveChange={setActive}>
                    Active {active ? "ON" : "OFF"}
                  </Button>
                  <Button highlight={false}>No highlight</Button>
                  <Button
                    label="Play icon"
                    iconOnly
                    icon={
                      <Icon
                        name="Play"
                        size={theme.control["--spacing-control-icon"]}
                        color={theme.colors.foreground}
                      />
                    }
                  />
                  <IconSlot>
                    <Icon
                      name="Play"
                      size={theme.control["--spacing-control-icon"]}
                      color={theme.colors.foreground}
                    />
                  </IconSlot>
                </div>
                <div style={row}>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Delete</Button>
                  <Button variant="link">Link</Button>
                  <Button disabled>Disabled</Button>
                </div>
                <ControlGroup label="Tempo controls" separator="slash">
                  <DragPadNumber
                    testId="gallery-bpm"
                    label="BPM"
                    value={bpm}
                    onChange={setBpm}
                    min={20}
                    max={300}
                    step={1}
                    defaultValue={120}
                    onGestureEnd={() => {
                      const point = nativeCursorLock.capture()
                      setStatus(
                        point
                          ? `cursorPosition (${point.x}, ${point.y})`
                          : "Cursor position unavailable"
                      )
                    }}
                  />
                </ControlGroup>
                <div style={row}>
                  <DragPadBar
                    label="Level"
                    value={level}
                    onChange={setLevel}
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={50}
                  />
                  <DragPadBipolar
                    label="Bipolar"
                    value={pan}
                    onChange={setPan}
                    min={-1}
                    max={1}
                    step={0.01}
                    defaultValue={0}
                  />
                  <PanControl label="Pan" value={pan} onChange={setPan} />
                  <DragPadToggle label="Mute" value={active} onChange={setActive} />
                </div>
                <text style={{ fontSize: theme.control["--text-control-track"] }}>
                  {`BPM ${bpm} · Level ${level} · Pan ${pan.toFixed(2)}`}
                </text>
              </GalleryCard>
              <GalleryCard title="Selectors / menus / popups">
                <div style={row}>
                  <DropdownButton
                    label="Warp mode"
                    value={mode}
                    onChange={setMode}
                    items={[
                      { type: "heading", id: "modes", label: "Warp mode" },
                      { id: "beats", label: "Beats" },
                      { type: "separator", id: "separator" },
                      { id: "tones", label: "Tones\nPreserves pitch" },
                      { id: "disabled", label: "Disabled", disabled: true },
                    ]}
                  />
                  <PopupButton
                    label="Continuous adjustment"
                    trigger="Adjust popup"
                    testId="gallery-popup"
                    contentStyle={{ width: theme.project.controlsWidth }}
                  >
                    <PopoverHeader>
                      <PopoverTitle>Continuous adjustment</PopoverTitle>
                    </PopoverHeader>
                    <DragPadNumber
                      testId="popup-bpm"
                      label="Popup BPM"
                      value={bpm}
                      onChange={setBpm}
                      min={20}
                      max={300}
                      step={1}
                    />
                    <text>Drag or wheel repeatedly; stays open.</text>
                  </PopupButton>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button label="Commands">Commands</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent aria-label="Commands menu">
                      <DropdownMenuItem onSelect={() => setStatus("Duplicate selected")}>
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
                        Follow playback
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onSelect={() => setStatus("Audio selected")}>
                            Audio
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled>MIDI disabled</DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>
                <ContextMenu>
                  <ContextMenuTrigger
                    aria-label="Right click context area"
                    style={{
                      padding: theme.control["--spacing-control-track-gap"],
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      fontSize: theme.control["--text-control-track"],
                    }}
                  >
                    <text>Right-click / Ctrl-click / Shift-F10</text>
                  </ContextMenuTrigger>
                  <ContextMenuContent aria-label="Context actions">
                    <ContextMenuLabel>Context actions</ContextMenuLabel>
                    <ContextMenuItem onSelect={() => setStatus("Rename selected")}>
                      Rename
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuRadioGroup value={radio} onValueChange={setRadio}>
                      <ContextMenuRadioItem value="en">English</ContextMenuRadioItem>
                      <ContextMenuRadioItem value="zh">中文</ContextMenuRadioItem>
                    </ContextMenuRadioGroup>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>More</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuItem onSelect={() => setStatus("More selected")}>
                          Nested command
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  </ContextMenuContent>
                </ContextMenu>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button>Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent side="right" aria-label="Popover example">
                    <PopoverHeader>
                      <PopoverTitle>Native popover</PopoverTitle>
                    </PopoverHeader>
                    <text>{"Line one\nLine two"}</text>
                    <Button onClick={() => setStatus("Inside popover")}>Internal action</Button>
                  </PopoverContent>
                </Popover>
              </GalleryCard>
              <GalleryCard title="Forms / navigation">
                <Label controlRef={inputRef}>Input label</Label>
                <Input
                  ref={inputRef}
                  aria-label="Gallery input"
                  value={input}
                  onChange={event => setInput(event.value ?? "")}
                />
                <RadioGroup
                  aria-label="Language"
                  value={radio}
                  onValueChange={setRadio}
                  orientation="horizontal"
                >
                  <RadioGroupItem value="en">English</RadioGroupItem>
                  <RadioGroupItem value="zh">中文</RadioGroupItem>
                  <RadioGroupItem value="off" disabled>
                    Disabled
                  </RadioGroupItem>
                </RadioGroup>
                <ToggleGroup
                  type="multiple"
                  aria-label="Tools"
                  value={tools}
                  onValueChange={setTools}
                >
                  <ToggleGroupItem value="draw">Draw</ToggleGroupItem>
                  <ToggleGroupItem value="snap">Snap</ToggleGroupItem>
                  <ToggleGroupItem value="off" disabled>
                    Disabled
                  </ToggleGroupItem>
                </ToggleGroup>
                <MotionTabs
                  tabWidth={theme.project.identityWidth}
                  options={[
                    { key: "clips", label: "Clips", content: <text>Clip tab content</text> },
                    { key: "devices", label: "Devices", content: <text>Device tab content</text> },
                  ]}
                />
                <Button onClick={() => setSettings(true)}>Open settings</Button>
              </GalleryCard>
            </div>
            <div style={cardRow}>
              <GalleryCard title="Containers / feedback">
                <CardDescription>Card header, title, description and content.</CardDescription>
                <Separator />
                <Progress aria-label="Level progress" value={level} />
                <Loading
                  message="Loading native resources"
                  style={{
                    position: "relative",
                    height: theme.transportControl["--spacing-control-track"],
                  }}
                />
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No clips selected</EmptyTitle>
                    <EmptyDescription>Select a clip to inspect it.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
                <div style={row}>
                  <Button onClick={() => toast.success("Operation completed")}>
                    Success toast
                  </Button>
                  <Button onClick={() => toastLoading("Loading…", "gallery-job")}>
                    Loading toast
                  </Button>
                  <Button onClick={() => toast.error("Load failed", { id: "gallery-job" })}>
                    Error toast
                  </Button>
                </div>
              </GalleryCard>
              <GalleryCard title="Retry / scroll / drag preview">
                <div style={{ position: "relative", height: theme.project.defaultTrackHeight }}>
                  <LoadErrorScreen
                    title="Example load error"
                    message="The resource cannot be opened."
                    onRetry={() => setStatus("Retry requested")}
                  />
                </div>
                <ScrollArea
                  aria-label="Scrollable sample"
                  style={{ height: theme.control["--spacing-control-track"] * 4 }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: theme.control["--spacing-control-track-gap"],
                    }}
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <text key={index}>{`Scrollable row ${index + 1}`}</text>
                    ))}
                  </div>
                </ScrollArea>
                <DragPreviewArea
                  data="Native sample"
                  disabledDropLabel="Drop unavailable"
                  renderPreview={data => <text>{data}</text>}
                  onDragEnd={(_, result) =>
                    setStatus(result.cancelled ? "Preview cancelled" : "Preview released")
                  }
                >
                  <text>Drag this sample to preview</text>
                </DragPreviewArea>
              </GalleryCard>
              <GalleryCard title="Shared environment / geometry">
                <text style={{ fontSize: theme.control["--text-control-track"] }}>
                  Footer info publishes control kinds only.
                </text>
                <ControlGroup label="Position" separator="dot">
                  <Button>1</Button>
                  <Button>1</Button>
                  <Button>1</Button>
                </ControlGroup>
                <ControlGroup label="Split group" separator="line">
                  <Button>Left</Button>
                  <Button>Right</Button>
                </ControlGroup>
                <Separator
                  orientation="vertical"
                  style={{ height: theme.transportControl["--spacing-control-track"] }}
                />
                <text style={{ fontSize: theme.control["--text-control-track"] }}>
                  All compact controls use the same shared metrics.
                </text>
              </GalleryCard>
            </div>
            <GalleryCard title="Transport controls">
              <ControlGroup
                label="Transport tempo controls"
                style={{ gap: theme.transportControl["--spacing-control-gap"] }}
              >
                <DragPadNumber
                  label="Transport BPM"
                  value={bpm}
                  onChange={setBpm}
                  min={20}
                  max={300}
                  step={1}
                  defaultValue={120}
                  size="transport"
                />
                <Button
                  size="transport"
                  iconOnly
                  label="Transport play"
                  icon={
                    <Icon
                      name="Play"
                      size={theme.transportControl["--spacing-control-icon"]}
                      color={theme.colors.foreground}
                    />
                  }
                />
              </ControlGroup>
            </GalleryCard>
            <SettingsShell
              open={settings}
              onOpenChange={setSettings}
              title="Settings"
              description="Native settings navigation"
              activeId={pane}
              onActiveChange={setPane}
              items={[
                { id: "general", label: "General", content: <text>General settings</text> },
                { id: "audio", label: "Audio", content: <text>Audio settings</text> },
              ]}
              style={{
                width: theme.project.controlsWidth * 2,
                height: theme.project.defaultTrackHeight * 3,
              }}
            />
          </div>
        </ScrollArea>
        <Separator />
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: theme.control["--spacing-control-gap"],
            fontSize: theme.control["--text-control-track"],
          }}
        >
          <text role="status" aria-label="Footer info">{`Info: ${info ?? "none"}`}</text>
          <text role="status" aria-label="Gallery verification">
            {status}
          </text>
        </div>
        <Toaster />
      </div>
    </ControlEnvironmentProvider>
  )
}

render(
  <ThemeProvider defaultAppearance={process.env.GALLERY_APPEARANCE === "light" ? "light" : "dark"}>
    {process.env.GALLERY_VIEW === "states" ? <StateGallery cursorLock={cursorLock} /> : <Gallery />}
  </ThemeProvider>,
  { title: "zoeydaw native controls", width: 1050, height: 780 }
)
