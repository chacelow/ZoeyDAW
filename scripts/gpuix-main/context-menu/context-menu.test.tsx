import { afterEach, expect, test } from "bun:test"
import type { EventPayload, Props } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls/Button"
import { DragPadNumber } from "@/ui/controls/DragPad"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
})

function mount(children: Props["children"]) {
  const root = createTestRoot({ width: 640, height: 400 })
  roots.push(root)
  root.render(<ThemeProvider>{children}</ThemeProvider>)
  return root
}

function click(root: TestRoot, id: string, button = 2) {
  const node = root.renderer.findByTestId(id)
  if (!node) throw new Error(`Missing ${id}`)
  const bounds = root.renderer.getElementBounds(node.id)
  if (!bounds) throw new Error(`Unpainted ${id}`)
  root.renderer.nativeSimulateClick(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    button
  )
  return bounds
}

test("a real nested Button retains right-button mouseDown and opens its host context", () => {
  const seen: string[] = []
  let payload: EventPayload | undefined
  const root = mount(
    <div
      style={{ width: 300, height: 160 }}
      onContextMenu={event => {
        seen.push("context")
        payload = event
      }}
    >
      <Button
        testId="child"
        onMouseDown={event => {
          seen.push(`down:${event.button}`)
        }}
      >
        Child action
      </Button>
    </div>
  )
  const box = click(root, "child")
  expect(seen).toEqual(["down:2", "context"])
  expect(payload?.x).toBe(box.x + box.width / 2)
  expect(payload?.y).toBe(box.y + box.height / 2)
  expect(payload?.button).toBe(2)
  expect(payload?.isRightClick).toBe(true)
  expect(payload?.key).toBeUndefined()
  expect(payload?.keystrokeId).toBeUndefined()
})

test("a real nested numeric pad opens its host context without changing its value", () => {
  const opens: string[] = []
  const values: number[] = []
  const root = mount(
    <div
      style={{ width: 300, height: 160 }}
      onContextMenu={() => {
        opens.push("context")
      }}
    >
      <DragPadNumber
        testId="child"
        label="Nested number"
        value={120}
        min={0}
        max={300}
        step={1}
        onChange={value => {
          values.push(value)
        }}
      />
    </div>
  )
  click(root, "child")
  expect(opens).toEqual(["context"])
  expect(values).toEqual([])
})

test("nested context hosts notify only the inner scope on each right press", () => {
  const opens: string[] = []
  const root = mount(
    <div
      style={{ width: 300, height: 160 }}
      onContextMenu={() => {
        opens.push("outer")
      }}
    >
      <div
        testId="inner"
        style={{ width: 120, height: 60 }}
        onContextMenu={() => {
          opens.push("inner")
        }}
      >
        <Button testId="child">Nested</Button>
      </div>
    </div>
  )
  click(root, "child")
  click(root, "child")
  expect(opens).toEqual(["inner", "inner"])
})

test("ordinary primary clicks still activate the child but never its context host", () => {
  const seen: string[] = []
  const root = mount(
    <div
      style={{ width: 300, height: 160 }}
      onContextMenu={() => {
        seen.push("context")
      }}
    >
      <Button
        testId="child"
        onClick={() => {
          seen.push("click")
        }}
      >
        Child action
      </Button>
    </div>
  )
  click(root, "child", 0)
  expect(seen).toEqual(["click"])
  root.renderer.nativeSimulateClick(500, 300, 2)
  expect(seen).toEqual(["click"])
})

test("deferred anchored cover blocks the scope until the covering layer disappears", () => {
  const opens: string[] = []
  function Scene({ cover }: { cover: boolean }) {
    return (
      <div style={{ width: 640, height: 400 }}>
        <div
          testId="scope"
          style={{ width: 300, height: 160 }}
          onContextMenu={() => {
            opens.push("context")
          }}
        >
          <Button testId="child">Covered action</Button>
        </div>
        {cover && (
          <anchored position={{ x: 0, y: 0 }} deferred occlude>
            <div style={{ width: 300, height: 160 }}>Cover</div>
          </anchored>
        )}
      </div>
    )
  }
  const root = mount(<Scene cover />)
  click(root, "scope")
  expect(opens).toEqual([])
  root.render(
    <ThemeProvider>
      <Scene cover={false} />
    </ThemeProvider>
  )
  click(root, "scope")
  expect(opens).toEqual(["context"])
})

test("hidden scopes and removed declarations leave no stale frame targets", () => {
  const opens: string[] = []
  const handler = () => {
    opens.push("context")
  }
  function Scene({ hidden, declared }: { hidden: boolean; declared: boolean }) {
    return (
      <div
        style={{ width: 300, height: 160, visibility: hidden ? "hidden" : "visible" }}
        onContextMenu={declared ? handler : undefined}
      >
        <Button>Action</Button>
      </div>
    )
  }
  const root = mount(<Scene hidden={false} declared />)
  root.renderer.nativeSimulateClick(10, 10, 2)
  root.render(
    <ThemeProvider>
      <Scene hidden declared />
    </ThemeProvider>
  )
  root.renderer.nativeSimulateClick(10, 10, 2)
  root.render(
    <ThemeProvider>
      <Scene hidden={false} declared={false} />
    </ThemeProvider>
  )
  root.renderer.nativeSimulateClick(10, 10, 2)
  expect(opens).toEqual(["context"])
  root.render(
    <ThemeProvider>
      <Scene hidden={false} declared />
    </ThemeProvider>
  )
  root.renderer.nativeSimulateClick(10, 10, 2)
  expect(opens).toEqual(["context", "context"])
})

test("a context scope preserves descendant hover edges and scroll ownership", () => {
  const seen: string[] = []
  const root = mount(
    <div
      style={{ width: 300, height: 160 }}
      onContextMenu={() => {
        seen.push("context")
      }}
    >
      <div
        style={{ width: 100, height: 40, pointerEvents: "auto" }}
        onMouseEnter={() => {
          seen.push("enter")
        }}
        onMouseLeave={() => {
          seen.push("leave")
        }}
        onScroll={event => {
          seen.push(`scroll:${event.deltaY}`)
        }}
      />
    </div>
  )
  root.renderer.nativeSimulateMouseMove(500, 300)
  seen.length = 0
  root.renderer.nativeSimulateMouseMove(10, 10)
  root.renderer.nativeSimulateScrollWheel(10, 10, 0, 16)
  root.renderer.nativeSimulateMouseMove(500, 300)
  expect(seen).toEqual(["enter", "scroll:16", "leave"])
})

test("a descendant context probe cannot replace an ancestor's pointer capture on repaint", () => {
  const seen: string[] = []
  function Scene({ revision }: { revision: number }) {
    return (
      <div
        style={{ width: 300, height: 160 }}
        onMouseDown={() => {
          seen.push("down")
        }}
        onMouseMove={event => {
          seen.push(`move:${event.x}`)
        }}
      >
        <div
          style={{ width: 100, height: 40 }}
          onContextMenu={() => {
            seen.push("context")
          }}
        >
          {revision}
        </div>
      </div>
    )
  }
  const root = mount(<Scene revision={0} />)
  root.renderer.nativeSimulateMouseDown(10, 10)
  root.render(
    <ThemeProvider>
      <Scene revision={1} />
    </ThemeProvider>
  )
  root.renderer.nativeSimulateMouseMove(500, 300, 0)
  root.renderer.nativeSimulateMouseUp(500, 300)
  expect(seen).toEqual(["down", "move:500"])
})
