import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Badge, Breadcrumb, Button, Checkbox, Chip, ControlGroup, DeviceHeader, DragPadBar, DragPadBipolar, DragPadNumber, DropdownButton, Fader, IconSlot, InlineEdit, Input, Kbd, Knob, Label, ListRow, Loading, MotionTabs, PopupButton, RadioGroup, RadioGroupItem, Switch, ToggleGroup, ToggleGroupItem, ToolbarIconButton, TreeRow } from "."
import { Icon } from "./Icon"
import { MenuRowContent, menuRowChrome } from "./Menu/row"

// Start-aligned rows keep their label's leading inset; every glyph is still vertically centred.
const START_ALIGNED: Record<string, true> = { label: true, list: true, inline: true, radio: true, menu: true, tree: true, dropdown: true, device: true, input: true }
const CENTERED = ["button", "button-icon", "icon", "outline-icon", "toolbar", "slot", "check", "mixed", "chip", "chip-close", "number", "bar", "bipolar", "badge", "kbd", "loading", "segment", "motion-tab-a", "popup", "breadcrumb", "group"]

function Matrix() {
  const theme = useTheme()
  const numeric = { label: "Value", min: -100, max: 100, step: 1, value: 20, onChange: () => {} }
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
    <Button testId="button">Button</Button>
    <Button testId="button-icon" icon={<Icon name="Play" />}>Play</Button>
    <Button testId="icon" iconOnly label="Play" icon={<Icon name="Play" />} />
    <Button testId="outline-icon" iconOnly variant="outline" label="Play" icon={<Icon name="Play" />} />
    <ToolbarIconButton testId="toolbar" label="Play" icon={<Icon name="Play" />} />
    <IconSlot testId="slot"><Icon name="Plus" /></IconSlot>
    <Checkbox testId="check" checked onCheckedChange={() => {}} />
    <Checkbox testId="mixed" checked="mixed" onCheckedChange={() => {}} />
    <Chip testId="chip">Chip</Chip>
    <Chip testId="chip-close" remove={{ label: "Remove", onRemove: () => {} }}>Chip</Chip>
    <DragPadNumber {...numeric} testId="number" />
    <DragPadBar {...numeric} testId="bar" />
    <DragPadBipolar {...numeric} testId="bipolar" />
    <Badge testId="badge">12</Badge><Kbd testId="kbd">⌘K</Kbd>
    <Loading testId="loading" inline label="Loading" />
    <ToggleGroup type="single" value="a" onValueChange={() => {}} variant="segmented"><ToggleGroupItem testId="segment" value="a">Auto</ToggleGroupItem></ToggleGroup>
    <MotionTabs options={[{ key: "a", label: "Audio", icon: <Icon name="Music" /> }]} showContent={false} />
    <Label testId="label">Label</Label>
    <ListRow testId="list" label="List row" leading={<Icon name="Music" />} trailing={<Icon name="ChevronRight" />} />
    <InlineEdit testId="inline" value="Name" onCommit={() => {}} />
    <RadioGroup value="a" onValueChange={() => {}}><RadioGroupItem testId="radio" value="a">Radio</RadioGroupItem></RadioGroup>
    <div testId="menu" style={{ ...menuRowChrome(theme), width: 240 }}><MenuRowContent checked shortcut="⌘K">Menu row</MenuRowContent></div>
    <Knob {...numeric} testId="knob" />
    <Switch testId="switch" label="Switch" checked={false} reducedMotion onCheckedChange={() => {}} />
    <Fader {...numeric} testId="fader" min={-60} max={6} value={-8} />
    <DropdownButton testId="dropdown" label="Route" value="a" onChange={() => {}} items={[{ id: "a", label: "Output" }]} />
    <PopupButton testId="popup" label="Popup" trigger="Popup"><text>Content</text></PopupButton>
    <Breadcrumb testId="breadcrumb" label="Path" segments={[{ id: "a", label: "Folder", onSelect: () => {} }, { id: "b", label: "File", onSelect: () => {} }]} />
    <TreeRow testId="tree" label="Folder" expanded onExpandedChange={() => {}} />
    <ControlGroup testId="group" label="Group"><Button>A</Button><Button>B</Button></ControlGroup>
    <DeviceHeader testId="device" title="Device" enabled collapsed={false} onEnabledChange={() => {}} onCollapsedChange={() => {}} labels={{ activator: "Power", collapse: "Collapse" }} />
    <Input testId="input" value="Input" leading={<Icon name="Search" />} trailing={<Icon name="ChevronDown" />} style={{ width: 200 }} />
  </div>
}

test("shared control matrix centres content and preserves documented start-aligned rows", () => {
  const root = createTestRoot({ width: 800, height: 1200 })
  try {
    root.render(<ThemeProvider><Matrix /></ThemeProvider>)
    for (let frame = 0; frame < 5; frame++) { root.renderer.flush(); root.renderer.dispatchNativeEvents() }
    const visibleLeaves = (id: number): number[] => {
      const node = root.renderer.getElement(id)!
      if (node.style.opacity === 0) return []
      if (node.type === "text" || node.type === "svg") return [id]
      return node.children.flatMap(visibleLeaves)
    }
    for (const id of [...CENTERED, ...Object.keys(START_ALIGNED)]) {
      const target = root.renderer.findByTestId(id)!
      const node = id === "chip-close" || id === "input" ? root.renderer.getElement(target.parentId!)! : target
      const box = root.renderer.getElementBounds(node.id)!
      const leaves = visibleLeaves(node.id).map(child => root.renderer.getElementBounds(child)!).filter(bounds => bounds.width > 0 && bounds.height > 0)
      expect(leaves.length, id).toBeGreaterThan(0)
      const left = Math.min(...leaves.map(bounds => bounds.x))
      const right = Math.max(...leaves.map(bounds => bounds.x + bounds.width))
      const top = Math.min(...leaves.map(bounds => bounds.y))
      const bottom = Math.max(...leaves.map(bounds => bounds.y + bounds.height))
      expect(Math.abs((top + bottom) / 2 - box.y - box.height / 2), `${id}: vertical`).toBeLessThanOrEqual(0.5)
      if (!Object.hasOwn(START_ALIGNED, id)) expect(Math.abs((left + right) / 2 - box.x - box.width / 2), `${id}: horizontal`).toBeLessThanOrEqual(0.5)
      else expect(left, `${id}: leading`).toBeGreaterThanOrEqual(box.x)
      for (const leaf of leaves) expect(Math.abs(leaf.y + leaf.height / 2 - box.y - box.height / 2), `${id}: glyph`).toBeLessThanOrEqual(0.5)
    }
    const knob = root.renderer.findByTestId("knob")!
    const knobBox = root.renderer.getElementBounds(knob.id)!
    for (const id of ["knob-label", "knob-value"]) {
      const text = root.renderer.findByTestId(id)!
      const bounds = root.renderer.getElementBounds(text.id)!
      const slot = root.renderer.getElementBounds(text.parentId!)!
      expect(Math.abs(bounds.x + bounds.width / 2 - knobBox.x - knobBox.width / 2), id).toBeLessThanOrEqual(0.5)
      expect(Math.abs(bounds.y + bounds.height / 2 - slot.y - slot.height / 2), id).toBeLessThanOrEqual(0.5)
    }
    const toggle = root.renderer.findByTestId("switch")!
    const toggleBox = root.renderer.getElementBounds(toggle.id)!
    const thumb = root.renderer.getElementBounds(toggle.children[1]!)!
    expect(Math.abs(thumb.y + thumb.height / 2 - toggleBox.y - toggleBox.height / 2), "switch thumb").toBeLessThanOrEqual(0.5)
    for (const parent of root.renderer.findByType("div")) {
      const centered = parent.style.alignItems === "center" && parent.style.justifyContent === "center"
      const faderTick = parent.testId?.startsWith("fader-tick-")
      if (!centered && !faderTick) continue
      const children = parent.children.map(id => root.renderer.getElement(id)!).filter(child => child.style.position !== "absolute" && child.style.opacity !== 0)
      if (children.length === 0) continue
      const box = root.renderer.getElementBounds(parent.id)!
      const bounds = children.map(child => root.renderer.getElementBounds(child.id)!).filter(bound => bound.height > 0)
      if (bounds.length === 0) continue
      const top = Math.min(...bounds.map(bound => bound.y))
      const bottom = Math.max(...bounds.map(bound => bound.y + bound.height))
      expect(Math.abs((top + bottom) / 2 - box.y - box.height / 2), parent.testId ?? `slot ${parent.id}`).toBeLessThanOrEqual(0.5)
      for (const child of bounds) expect(Math.abs(child.y + child.height / 2 - box.y - box.height / 2), parent.testId ?? `slot ${parent.id}`).toBeLessThanOrEqual(0.5)
    }
  } finally { root.unmount() }
})
