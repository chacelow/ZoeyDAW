import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import type { ReactNode } from "react"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "../controls/Button"
import { DropdownButton } from "../controls/DropdownButton"
import { DragPreviewArea } from "../controls/DragPreviewArea"
import { NumericPad } from "../controls/DragPad/DragPadNumber"
import { Empty, EmptyHeader, EmptyTitle } from "../controls/Empty"
import { Icon } from "../controls/Icon"
import { Input } from "../controls/Input"
import { Label } from "../controls/Label"
import { ListRow } from "../controls/ListRow"
import { Loading } from "../controls/Loading"
import { MotionTabs } from "../controls/MotionTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../controls/Menu"
import { Popover, PopoverContent, PopoverTrigger } from "../controls/Popover"
import { Progress } from "../controls/Progress"
import { SettingsNavItem, SettingsShell } from "../controls/SettingsShell"
import { Separator } from "../controls/Separator"
import { RadioGroup, RadioGroupItem } from "../controls/RadioGroup"
import { ToggleGroup, ToggleGroupItem } from "../controls/ToggleGroup"
import { CollapseDivider } from "../panels/CollapseDivider"
import { Group } from "../panels/Group"
import { Panel } from "../panels/Panel"
import { Separator as PanelSeparator } from "../panels/Separator"
import { ControlledScrollbar } from "../controls/ScrollArea/ControlledScrollbar"
import { useState } from "react"
import { PopupButton } from "../controls/PopupButton"
import { ControlGroup } from "../controls/ControlGroup"

const defaults = DEFAULT_DESIGN_TOKENS
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function mount(
  children: ReactNode,
  design: DesignTokens = defaults,
  width = 900,
  height = 700,
  appearance: "dark" | "light" = "dark"
) {
  const root = createTestRoot({ width, height })
  cleanups.push(() => root.unmount())
  root.renderer.clockPause()
  root.render(
    <ThemeProvider design={design} appearance={appearance}>
      {children}
    </ThemeProvider>
  )
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  return root
}

function element(root: TestRoot, id: string) {
  const node = root.renderer.findByTestId(id)
  if (!node) throw new Error(`Missing ${id}`)
  return node
}

function bounds(root: TestRoot, id: string) {
  const result = root.renderer.getElementBounds(element(root, id).id)
  if (!result) throw new Error(`Missing ${id} native bounds`)
  return result
}

function frame(root: TestRoot) {
  const directory = mkdtempSync(path.join(tmpdir(), "gpuix-control-configuration-"))
  try {
    const image = path.join(directory, "frame.png")
    root.renderer.flush()
    root.renderer.captureScreenshot(image)
    return readFileSync(image)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function changedPaint(
  children: ReactNode,
  design: DesignTokens,
  action?: (root: TestRoot) => void
) {
  const original = mount(children)
  action?.(original)
  const before = frame(original)
  const changed = mount(children, design)
  action?.(changed)
  expect(frame(changed).equals(before)).toBe(false)
}

function settings(navigationWidth?: number) {
  return (
    <SettingsShell
      testId="settings"
      open
      onOpenChange={() => {}}
      title="Preferences"
      closeLabel="Close"
      navigationLabel="Categories"
      items={[{ id: "appearance", label: "Appearance" }]}
      activeId="appearance"
      onActiveChange={() => {}}
      navigationWidth={navigationWidth}
    >
      <div testId="pane" style={{ width: "100%", height: 20 }}>
        Settings content
      </div>
    </SettingsShell>
  )
}

for (const [field, value, axis] of [
  ["shellWidth", 603, "width"],
  ["shellHeight", 411, "height"],
] as const) {
  test(`configuration settings.${field} changes native shell geometry`, () => {
    const root = mount(settings(), {
      ...defaults,
      settings: { ...defaults.settings, [field]: value },
    })
    expect(bounds(root, "settings")[axis]).toBe(value)
  })
}

test("configuration settings.navigationWidth changes native pane position and preserves explicit zero", () => {
  const design = { ...defaults, settings: { ...defaults.settings, navigationWidth: 213 } }
  const baseline = mount(settings())
  const before = bounds(baseline, "pane").x
  const root = mount(settings(), design)
  expect(bounds(root, "pane").x - before).toBe(213 - defaults.settings.navigationWidth)
  const zero = mount(settings(0), design)
  expect(bounds(zero, "pane").x).toBeLessThan(before)
})

const empty = (
  <Empty
    testId="empty"
    style={{ width: 400, height: 240, flexGrow: 0, backgroundColor: "#48617a" }}
  >
    <EmptyHeader testId="header" style={{ width: "100%" }}>
      <EmptyTitle>Empty document</EmptyTitle>
      <div
        testId="description"
        style={{ width: "100%", height: 12, flexShrink: 0, backgroundColor: "#b0c0d0" }}
      />
    </EmptyHeader>
    <div testId="empty-action" style={{ width: 40, height: 10, backgroundColor: "#d08060" }} />
  </Empty>
)

for (const [field, value] of [
  ["gap", 31],
  ["inset", 70],
  ["radius", 2],
  ["contentGap", 23],
  ["headerMaxWidth", 170],
] as const) {
  test(`configuration empty.${field} changes native geometry or paint`, () => {
    changedPaint(empty, { ...defaults, empty: { ...defaults.empty, [field]: value } })
  })
}

const brand =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='39'%3E%3Crect width='120' height='39' fill='%2388aacc'/%3E%3C/svg%3E"
const loading = (
  <Loading
    label="Loading document"
    logoSrc={brand}
    logoAlt="Brand"
    progress={42}
    progressValueText="42 units"
  />
)
for (const [field, value] of [
  ["gap", 29],
  ["brandWidth", 110],
  ["brandHeight", 71],
  ["progressWidth", 213],
] as const) {
  test(`configuration loading.${field} changes native geometry or paint`, () => {
    changedPaint(loading, { ...defaults, loading: { ...defaults.loading, [field]: value } })
  })
}

for (const [field, value] of [
  ["widthFraction", 0.72],
  ["indeterminateOpacity", 0.12],
] as const) {
  test(`configuration progress.${field} changes native indeterminate indicator`, () => {
    const children = (
      <div style={{ width: 300 }}>
        <Progress testId="progress" aria-valuetext="Waiting" />
      </div>
    )
    const design = { ...defaults, progress: { ...defaults.progress, [field]: value } }
    if (field === "widthFraction")
      expect(bounds(mount(children, design), "progress-indicator").width).toBeCloseTo(300 * value)
    else changedPaint(children, design)
  })
}

function drag(disabled = false) {
  return (
    <DragPreviewArea
      data="clip"
      disabledDropLabel="Unavailable"
      disabled={disabled}
      renderPreview={() => (
        <div style={{ width: 500, height: 20, flexShrink: 1, backgroundColor: "#557799" }}>
          Preview
        </div>
      )}
    >
      <div style={{ width: 200, height: 40, backgroundColor: "#789abc", pointerEvents: "none" }}>
        Drag clip
      </div>
    </DragPreviewArea>
  )
}
function beginDrag(root: TestRoot) {
  const box = bounds(root, "drag-source-source")
  root.renderer.nativeSimulateMouseDown(box.x + 10, box.y + 10)
  root.renderer.nativeSimulateMouseMove(box.x + 80, box.y + 30, 0)
  expect(root.renderer.findByTestId("drag-preview")).toBeDefined()
}
for (const [field, value] of [
  ["maxWidth", 211],
  ["gap", 27],
  ["opacity", 0.21],
] as const) {
  test(`configuration dragPreview.${field} changes native dragging overlay`, () => {
    changedPaint(
      drag(),
      { ...defaults, dragPreview: { ...defaults.dragPreview, [field]: value } },
      beginDrag
    )
  })
}

for (const axis of ["x", "y"] as const) {
  test(`configuration dragPreview.pointerOffset.${axis} changes native preview placement`, () => {
    const original = mount(drag())
    beginDrag(original)
    const before = bounds(original, "drag-preview")[axis]
    const design = {
      ...defaults,
      dragPreview: {
        ...defaults.dragPreview,
        pointerOffset: { ...defaults.dragPreview.pointerOffset, [axis]: 37 },
      },
    }
    const changed = mount(drag(), design)
    beginDrag(changed)
    expect(bounds(changed, "drag-preview")[axis] - before).toBe(
      37 - defaults.dragPreview.pointerOffset[axis]
    )
  })
}

test("configuration states.dragSourceOpacity changes native active drag source", () => {
  changedPaint(
    drag(),
    { ...defaults, states: { ...defaults.states, dragSourceOpacity: 0.08 } },
    beginDrag
  )
})
test("configuration popover.inset changes native drag preview geometry", () => {
  changedPaint(drag(), { ...defaults, popover: { ...defaults.popover, inset: 23 } }, beginDrag)
})

function pad() {
  return (
    <NumericPad
      label="Pan"
      testId="pad"
      value={0.6}
      min={-1}
      max={1}
      step={0.1}
      onChange={() => {}}
      displayVariant="bipolar"
      style={{ width: 140, height: 28 }}
    />
  )
}
test("configuration dragPad.fillOpacity changes native numeric fill", () => {
  changedPaint(pad(), { ...defaults, dragPad: { ...defaults.dragPad, fillOpacity: 0.88 } })
})
for (const [field, value] of [
  ["inset", 6],
  ["width", 5],
] as const) {
  test(`configuration dragPad.centerMarker.${field} changes native centered geometry`, () => {
    const root = mount(pad(), {
      ...defaults,
      dragPad: {
        ...defaults.dragPad,
        centerMarker: { ...defaults.dragPad.centerMarker, [field]: value },
      },
    })
    const marker = bounds(root, "pad-center")
    const shell = bounds(root, "pad")
    expect(marker.width).toBe(field === "width" ? value : defaults.dragPad.centerMarker.width)
    expect(marker.height).toBe(
      shell.height -
        defaults.shape.controlBorderWidth * 2 -
        (field === "inset" ? value : defaults.dragPad.centerMarker.inset) * 2
    )
    // At 1x, an odd-width marker's center lies on a half pixel; exact integer centering is impossible.
    const distance = Math.abs(marker.x + marker.width / 2 - (shell.x + shell.width / 2))
    expect(distance).toBeLessThanOrEqual(0.5)
  })
}

test("configuration dragPad.caretWidth changes native preedit caret", () => {
  const design = { ...defaults, dragPad: { ...defaults.dragPad, caretWidth: 5 } }
  const root = mount(
    <NumericPad
      label="Value"
      testId="caret-pad"
      hideIcon
      value={40}
      min={0}
      max={100}
      step={1}
      onChange={() => {}}
    />,
    design
  )
  expect(root.renderer.findByTestId("caret-pad-edit-indicator")).toBeUndefined()
  const box = bounds(root, "caret-pad")
  root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
  expect(bounds(root, "caret-pad-edit-indicator").width).toBe(5)
  root.renderer.nativeSimulateKeystrokes(element(root, "caret-pad").id, "escape")
  expect(root.renderer.findByTestId("caret-pad-edit-indicator")).toBeUndefined()
})

const disabledFixtures = [
  [
    "chrome",
    <Button key="chrome" disabled>
      Disabled button
    </Button>,
  ],
  ["input", <Input key="input" disabled value="Disabled input" onChange={() => {}} />],
  [
    "label",
    <Label key="label" disabled>
      Disabled label
    </Label>,
  ],
  ["listRow", <ListRow key="listRow" disabled label="Disabled row" />],
  [
    "tabs",
    <MotionTabs
      key="tabs"
      options={[
        { key: "one", label: "Selected" },
        { key: "two", label: "Disabled", disabled: true },
      ]}
      reducedMotion
    />,
  ],
  [
    "settings",
    <SettingsNavItem
      key="settings"
      item={{ id: "disabled", label: "Disabled category", disabled: true }}
      selected={false}
      onSelect={() => {}}
    />,
  ],
  [
    "radio",
    <RadioGroup key="radio" value="one" onValueChange={() => {}}>
      <RadioGroupItem value="two" disabled>
        Disabled radio
      </RadioGroupItem>
    </RadioGroup>,
  ],
  [
    "toggle",
    <ToggleGroup key="toggle" type="single" value="one" onValueChange={() => {}}>
      <ToggleGroupItem value="two" disabled>
        Disabled toggle
      </ToggleGroupItem>
    </ToggleGroup>,
  ],
  ["drag", drag(true)],
  [
    "scrollbar",
    <ControlledScrollbar
      key="scrollbar"
      aria-label="Scroll resources"
      aria-controls="resources"
      orientation="horizontal"
      value={0}
      viewport={100}
      extent={500}
      length={200}
      onChange={() => {}}
      disabled
    />,
  ],
] satisfies readonly (readonly [string, ReactNode])[]
for (const [name, children] of disabledFixtures) {
  test(`configuration states.disabledOpacity changes native ${name} paint`, () => {
    changedPaint(children, { ...defaults, states: { ...defaults.states, disabledOpacity: 0.11 } })
  })
}

test("configuration icon.strokeWidth changes native Lucide painting and preserves explicit zero", () => {
  const design = { ...defaults, icon: { strokeWidth: 6 } }
  changedPaint(<Icon name="Activity" size={64} />, design)
  const thin = mount(<Icon name="Activity" size={64} strokeWidth={0} />, design)
  const before = frame(thin)
  expect(frame(mount(<Icon name="Activity" size={64} strokeWidth={0} />)).equals(before)).toBe(true)
})

test("configuration typography.weights.semibold changes native heading paint", () => {
  changedPaint(<EmptyTitle>Semibold heading sample</EmptyTitle>, {
    ...defaults,
    typography: {
      ...defaults.typography,
      weights: { ...defaults.typography.weights, semibold: 100 },
    },
  })
})

const menu = (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger testId="trigger">Commands</DropdownMenuTrigger>
    <DropdownMenuContent testId="menu">
      <DropdownMenuItem>First</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Last</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
const dropdown = (
  <DropdownButton
    testId="dropdown"
    label="Options"
    value="one"
    matchTriggerWidth={false}
    onChange={() => {}}
    items={[
      { id: "one", label: "First option" },
      { type: "separator", id: "separator" },
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `item-${index}`,
        label: "A long option that exceeds the narrow configured menu width",
      })),
    ]}
  />
)
function openDropdown(root: TestRoot) {
  root.renderer.nativeSimulateKeystrokes(element(root, "dropdown").id, "enter")
  expect(root.renderer.findByTestId("dropdown-content")).toBeDefined()
}
for (const [field, value] of [
  ["maxWidth", 159],
  ["maxHeight", 91],
  ["dropdownSeparatorInset", 19],
] as const) {
  test(`configuration menu.${field} changes native dropdown geometry`, () => {
    changedPaint(
      dropdown,
      { ...defaults, menu: { ...defaults.menu, [field]: value } },
      openDropdown
    )
  })
}
for (const [field, value] of [
  ["width", 231],
  ["contextSeparatorInset", 17],
] as const) {
  test(`configuration menu.${field} changes native menu geometry`, () => {
    changedPaint(menu, { ...defaults, menu: { ...defaults.menu, [field]: value } })
  })
}

test("configuration shape.separatorWidth changes native separator geometry", () => {
  const root = mount(<Separator testId="separator" />, {
    ...defaults,
    shape: { ...defaults.shape, separatorWidth: 5 },
  })
  expect(bounds(root, "separator").height).toBe(5)
})

function popover(sideOffset?: number, collisionPadding?: number) {
  return (
    <Popover defaultOpen>
      <PopoverTrigger testId="trigger">Open</PopoverTrigger>
      <PopoverContent testId="popover" sideOffset={sideOffset} collisionPadding={collisionPadding}>
        <div style={{ height: 20 }}>Popover content</div>
      </PopoverContent>
    </Popover>
  )
}
test("configuration popover.width changes native popup width", () => {
  expect(
    bounds(
      mount(popover(), { ...defaults, popover: { ...defaults.popover, width: 274 } }),
      "popover"
    ).width
  ).toBe(274)
})
for (const [field, value] of [
  ["sideOffset", 27],
  ["collisionPadding", 41],
] as const) {
  test(`configuration overlay.${field} changes native floating placement`, () => {
    const children =
      field === "collisionPadding" ? <div style={{ paddingLeft: 840 }}>{popover()}</div> : popover()
    changedPaint(children, { ...defaults, overlay: { ...defaults.overlay, [field]: value } })
  })
}

test("configuration overlay explicit zero remains meaningful", () => {
  const root = mount(popover(0, 0), {
    ...defaults,
    overlay: { sideOffset: 30, collisionPadding: 30 },
  })
  const trigger = bounds(root, "trigger")
  expect(bounds(root, "popover").y).toBeCloseTo(trigger.y + trigger.height)
})

for (const [field, value] of [
  ["duration", 1],
  ["easing", "linear"],
] as const) {
  test(`configuration motion.tabs.${field} changes native intermediate paint`, () => {
    const children = (
      <MotionTabs
        options={[
          { key: "one", label: "First" },
          { key: "two", label: "Second" },
        ]}
      />
    )
    const samples: Buffer[] = []
    for (const design of [
      defaults,
      { ...defaults, motion: { tabs: { ...defaults.motion.tabs, [field]: value } } },
    ]) {
      const root = mount(children, design)
      root.renderer.clockFastForward(1000)
      root.renderer.flush()
      root.renderer.nativeSimulateKeystrokes(element(root, "motion-tab-two").id, "enter")
      root.renderer.flush()
      const start = frame(root)
      root.renderer.clockFastForward(70)
      const intermediate = frame(root)
      root.renderer.clockFastForward(1200)
      const settled = frame(root)
      expect(intermediate.equals(start)).toBe(false)
      expect(intermediate.equals(settled)).toBe(false)
      samples.push(intermediate)
    }
    expect(samples[0].equals(samples[1])).toBe(false)
  })
}

test("configuration tabs.width changes native tab geometry", () => {
  const root = mount(
    <MotionTabs
      reducedMotion
      options={[
        { key: "one", label: "First" },
        { key: "two", label: "Second" },
      ]}
    />,
    { ...defaults, tabs: { ...defaults.tabs, width: 173 } }
  )
  const first = bounds(root, "motion-tab-one")
  const second = bounds(root, "motion-tab-two")
  expect(first.width).toBe(173)
  expect(second.x - first.x).toBe(173)
  root.renderer.nativeSimulateKeystrokes(element(root, "motion-tab-two").id, "enter")
  expect(bounds(root, "motion-tabs-indicator").width).toBe(173)
})

for (const appearance of ["dark", "light"] as const) {
  for (const field of ["active", "highlight", "focusBorder", "focusOutline"] as const) {
    test(`configuration colors.destructive${field} changes native ${appearance} state paint`, () => {
      const recipe = defaults.colorRecipes.destructive
      const design = {
        ...defaults,
        colorRecipes: {
          ...defaults.colorRecipes,
          destructive: {
            ...recipe,
            [field]: field === "focusBorder" ? 95 : { ...recipe[field], [appearance]: 95 },
          },
        },
      }
      const children = (
        <Button testId="danger" active variant="destructive">
          Record
        </Button>
      )
      const images: Buffer[] = []
      for (const source of [defaults, design]) {
        const root = mount(children, source, 900, 700, appearance)
        root.renderer.nativeSimulateMouseMove(850, 650)
        if (field === "highlight") {
          const box = bounds(root, "danger")
          root.renderer.nativeSimulateMouseMove(box.x + box.width / 2, box.y + box.height / 2)
        } else if (field === "focusBorder" || field === "focusOutline") {
          root.renderer.simulateKeystrokes("tab")
          expect(root.renderer.getFocusedElementId()).toBe(element(root, "danger").id)
        }
        images.push(frame(root))
      }
      expect(images[0].equals(images[1])).toBe(false)
    })
  }
}

test("configuration colors.listRowHover changes native hovered row paint", () => {
  changedPaint(
    <ListRow testId="row" label="Hover resource" />,
    { ...defaults, colorRecipes: { ...defaults.colorRecipes, listRowHover: 20 } },
    root => {
      const box = bounds(root, "row")
      root.renderer.nativeSimulateMouseMove(box.x + box.width / 2, box.y + box.height / 2)
    }
  )
})

test("configuration cursors grab and grabbing follow native drag state transitions", () => {
  const design = {
    ...defaults,
    cursors: { ...defaults.cursors, grab: "crosshair", grabbing: "move" },
  } satisfies DesignTokens
  const root = mount(drag(), design)
  expect(element(root, "drag-source-source").style.cursor).toBe("crosshair")
  beginDrag(root)
  expect(element(root, "drag-source-source").style.cursor).toBe("move")
  root.renderer.nativeSimulateMouseUp(80, 30)
  expect(root.renderer.findByTestId("drag-preview")).toBeUndefined()
  expect(element(root, "drag-source-source").style.cursor).toBe("crosshair")
})

test("configuration cursors verticalResize and text follow native numeric editing transitions", () => {
  const design = {
    ...defaults,
    cursors: { ...defaults.cursors, verticalResize: "crosshair", text: "move" },
  } satisfies DesignTokens
  const root = mount(pad(), design)
  expect(element(root, "pad").style.cursor).toBe("crosshair")
  root.renderer.nativeSimulateKeystrokes(element(root, "pad").id, "enter")
  expect(element(root, "pad").style.cursor).toBe("move")
  root.renderer.simulateKeystrokes("escape")
  expect(element(root, "pad").style.cursor).toBe("crosshair")
})

test("configuration cursors action and disabled follow runtime availability transition", () => {
  const design = {
    ...defaults,
    cursors: { ...defaults.cursors, action: "crosshair", disabled: "move" },
  } satisfies DesignTokens
  const root = mount(<Button testId="action">Action</Button>, design)
  expect(element(root, "action").style.cursor).toBe("crosshair")
  root.render(
    <ThemeProvider design={design}>
      <Button testId="action" disabled>
        Action
      </Button>
    </ThemeProvider>
  )
  root.renderer.nativeSimulateKeystrokes(element(root, "action").id, "enter")
  expect(element(root, "action").style.cursor).toBe("move")
})

test("configuration cursors default maps unavailable menu item after opening", () => {
  const design = {
    ...defaults,
    cursors: { ...defaults.cursors, default: "crosshair" },
  } satisfies DesignTokens
  const root = mount(
    <DropdownMenu>
      <DropdownMenuTrigger testId="trigger">Commands</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem testId="unavailable" disabled>
          Unavailable
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
    design
  )
  root.renderer.nativeSimulateKeystrokes(element(root, "trigger").id, "enter")
  expect(element(root, "unavailable").style.cursor).toBe("crosshair")
})

test("configuration cursors rowResize survives native collapse state transition", () => {
  const design = {
    ...defaults,
    cursors: { ...defaults.cursors, rowResize: "crosshair" },
  } satisfies DesignTokens
  function Divider() {
    const [expanded, setExpanded] = useState(true)
    return (
      <CollapseDivider
        testId="divider"
        aria-label="Resize"
        formatAccessiblePixels={value => `${value} pixels`}
        expanded={expanded}
        expandedSize={100}
        onExpandedChange={setExpanded}
      />
    )
  }
  const root = mount(<Divider />, design)
  root.renderer.nativeSimulateKeystrokes(element(root, "divider").id, "down")
  expect(element(root, "divider").customProps?.["aria-valuetext"]).toBe("0 pixels")
  expect(element(root, "divider").style.cursor).toBe("crosshair")
})

test("configuration cursors columnResize survives native panel resizing", () => {
  const design = {
    ...defaults,
    cursors: { ...defaults.cursors, columnResize: "crosshair" },
  } satisfies DesignTokens
  const root = mount(
    <Group orientation="horizontal" style={{ width: 600, height: 200 }}>
      <Panel defaultSize="50">
        <div>Left</div>
      </Panel>
      <PanelSeparator testId="splitter" aria-label="Resize columns" />
      <Panel>
        <div testId="right">Right</div>
      </Panel>
    </Group>,
    design
  )
  const before = bounds(root, "right").x
  const box = bounds(root, "splitter")
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x + 30, y, 0)
  root.renderer.nativeSimulateMouseUp(x + 30, y)
  expect(bounds(root, "right").x).toBeGreaterThan(before)
  expect(element(root, "splitter").style.cursor).toBe("crosshair")
})

test("configuration states.disabledOpacity changes native dropdown option paint", () => {
  changedPaint(
    <DropdownButton
      testId="dropdown"
      label="Options"
      value="one"
      onChange={() => {}}
      items={[
        { id: "one", label: "Available" },
        { id: "two", label: "Unavailable", disabled: true },
      ]}
    />,
    { ...defaults, states: { ...defaults.states, disabledOpacity: 0.11 } },
    openDropdown
  )
})

test("configuration shape.separatorWidth changes native joined group geometry", () => {
  const children = (
    <ControlGroup separator="line">
      <div testId="group-first" style={{ width: 20, height: 20 }} />
      <div testId="group-second" style={{ width: 20, height: 20 }} />
    </ControlGroup>
  )
  const root = mount(children, { ...defaults, shape: { ...defaults.shape, separatorWidth: 7 } })
  const first = bounds(root, "group-first")
  expect(bounds(root, "group-second").x - first.x - first.width).toBe(
    7 + defaults.spacing.joinedGroupGap * 2
  )
})

test("configuration overlay.sideOffset changes native menu placement", () => {
  const root = mount(menu, { ...defaults, overlay: { ...defaults.overlay, sideOffset: 29 } })
  const trigger = bounds(root, "trigger")
  expect(bounds(root, "menu").y - trigger.y - trigger.height).toBe(29)
})

test("configuration overlay.sideOffset changes native dropdown placement", () => {
  const root = mount(dropdown, { ...defaults, overlay: { ...defaults.overlay, sideOffset: 29 } })
  openDropdown(root)
  const trigger = bounds(root, "dropdown")
  expect(bounds(root, "dropdown-content").y - trigger.y - trigger.height).toBe(29)
})

test("configuration overlay.sideOffset changes native popup placement", () => {
  const root = mount(
    <PopupButton testId="popup" label="Popup" trigger="Open" open>
      <div>Popup contents</div>
    </PopupButton>,
    { ...defaults, overlay: { ...defaults.overlay, sideOffset: 29 } }
  )
  const trigger = bounds(root, "popup")
  expect(bounds(root, "popup-content").y - trigger.y - trigger.height).toBe(29)
})

test("configuration overlay.collisionPadding changes native menu placement", () => {
  changedPaint(<div style={{ paddingLeft: 840 }}>{menu}</div>, {
    ...defaults,
    overlay: { ...defaults.overlay, collisionPadding: 41 },
  })
})

for (const [name, children, action] of [
  ["menu", menu, undefined],
  [
    "dropdown",
    <DropdownButton
      key="dropdown-separator"
      testId="dropdown"
      label="Options"
      value="one"
      onChange={() => {}}
      items={[
        { id: "one", label: "First option" },
        { type: "separator", id: "separator" },
        { id: "two", label: "Last option" },
      ]}
    />,
    openDropdown,
  ],
] as const) {
  test(`configuration shape.separatorWidth changes native ${name} separator paint`, () => {
    changedPaint(children, { ...defaults, shape: { ...defaults.shape, separatorWidth: 7 } }, action)
  })
}
