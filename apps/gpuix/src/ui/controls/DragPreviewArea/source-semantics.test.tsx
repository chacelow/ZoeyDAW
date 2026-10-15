import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DragPreviewArea } from "."

test("native Tab skips excluded drag sources without adding a wrapper focus owner", () => {
  const root = createTestRoot({ width: 500, height: 200 })
  const keys: string[] = []
  try {
    root.render(
      <ThemeProvider>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div testId="before" role="button" tabIndex={0}>
            Before
          </div>
          <DragPreviewArea
            testId="excluded-wrapper"
            role="menuitem"
            tabIndex={-1}
            items={[
              {
                key: "excluded-a",
                label: "Excluded sample A",
                data: "a.wav",
                children: <text>Sample A</text>,
              },
              {
                key: "excluded-b",
                label: "Excluded sample B",
                data: "b.wav",
                children: <text>Sample B</text>,
              },
            ]}
            disabledDropLabel="Unavailable"
            renderPreview={data => <text>{data}</text>}
          />
          <DragPreviewArea
            testId="default-wrapper"
            data="default.wav"
            disabledDropLabel="Unavailable"
            renderPreview={data => <text>{data}</text>}
            onKeyDown={event => {
              keys.push(event.key ?? "")
            }}
          >
            <text>Default sample</text>
          </DragPreviewArea>
          <div testId="after" role="button" tabIndex={0}>
            After
          </div>
        </div>
      </ThemeProvider>
    )
    root.renderer.flush()
    const before = root.renderer.findByTestId("before")!
    const normal = root.renderer.findByTestId("drag-source-source")!
    const after = root.renderer.findByTestId("after")!
    root.renderer.focusElement(before.id)
    root.renderer.simulateKeystrokes("tab")
    expect(root.renderer.getFocusedElementId()).toBe(normal.id)
    root.renderer.simulateKeystrokes("enter")
    expect(keys).toEqual(["enter"])
    root.renderer.simulateKeystrokes("tab")
    expect(root.renderer.getFocusedElementId()).toBe(after.id)
    root.renderer.simulateKeystrokes("shift-tab")
    expect(root.renderer.getFocusedElementId()).toBe(normal.id)
    root.renderer.simulateKeystrokes("shift-tab")
    expect(root.renderer.getFocusedElementId()).toBe(before.id)
    root.renderer.flush()
    const semantics = Object.values(root.renderer.getA11yTree().nodes ?? {}).map(node => node.aria)
    const menuItems = semantics.filter(node => node?.role === "MenuItem")
    expect(menuItems).toHaveLength(2)
    expect(
      menuItems.map(node => node?.label).sort((a, b) => (a ?? "").localeCompare(b ?? ""))
    ).toEqual(["Excluded sample A", "Excluded sample B"])
    expect(semantics.filter(node => node?.role === "Button")).toHaveLength(3)
  } finally {
    root.unmount()
  }
})

test("custom source semantics retain native pointer drag and Escape cancellation", () => {
  const root = createTestRoot({ width: 400, height: 200 })
  const starts: string[] = []
  const ends: { data: string; cancelled: boolean }[] = []
  try {
    root.render(
      <ThemeProvider>
        <DragPreviewArea
          role="menuitem"
          tabIndex={-1}
          items={[
            {
              key: "custom",
              label: "Custom sample",
              data: "kick.wav",
              children: <div style={{ height: 40 }}>Kick</div>,
            },
          ]}
          disabledDropLabel="Unavailable"
          renderPreview={data => <text>{data}</text>}
          onDragStart={data => {
            starts.push(data)
          }}
          onDragEnd={(data, result) => {
            ends.push({ data, ...result })
          }}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
    const source = root.renderer.findByTestId("drag-source-custom")!
    const bounds = root.renderer.getElementBounds(source.id)!
    root.renderer.nativeSimulateMouseDown(bounds.x + 10, bounds.y + 10)
    expect(root.renderer.getFocusedElementId()).toBe(source.id)
    root.renderer.nativeSimulateMouseMove(bounds.x + 30, bounds.y + 15, 0)
    expect(starts).toEqual(["kick.wav"])
    expect(root.renderer.findByTestId("drag-preview")).toBeDefined()
    root.renderer.simulateKeystrokes("escape")
    expect(ends).toEqual([{ data: "kick.wav", cancelled: true }])
    expect(root.renderer.findByTestId("drag-preview")).toBeUndefined()
  } finally {
    root.unmount()
  }
})
