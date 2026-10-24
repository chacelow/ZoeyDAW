// @vitest-environment jsdom
import { act, memo, Suspense, useLayoutEffect, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  Gantt,
  useGanttSelector,
  useGanttSettings,
  useGanttState,
  type GanttInstance,
  type UseGanttStateOptions,
} from "./gantt"
import type { GanttEvent } from "./gantt-types"

const roots: Array<{ root: Root; container: HTMLDivElement }> = []

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
})

afterEach(() => {
  for (const { root, container } of roots.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  vi.unstubAllGlobals()
})

function mount(children: ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ root, container })
  act(() => root.render(children))
  return {
    container,
    render(next: ReactNode) {
      act(() => root.render(next))
    },
  }
}

function StateOwner({
  options,
  capture,
  blocked,
  children,
}: {
  options: UseGanttStateOptions
  capture: (calendar: GanttInstance) => void
  blocked?: Promise<void>
  children?: ReactNode
}) {
  const calendar = useGanttState(options)
  useLayoutEffect(() => {
    capture(calendar)
  }, [calendar, capture])
  if (blocked) throw blocked
  return <Gantt calendar={calendar}>{children}</Gantt>
}

const initialDate = new Date("2026-10-24T12:00:00Z")
const firstEvent: GanttEvent = {
  id: "first",
  title: "First",
  start: initialDate,
  end: new Date("2026-10-24T13:00:00Z"),
}
const secondEvent: GanttEvent = { ...firstEvent, id: "second", title: "Second" }

it("does not publish options or reset range growth from an abandoned render", () => {
  const captured: GanttInstance[] = []
  const capture = (calendar: GanttInstance) => {
    captured.push(calendar)
  }
  const oldCallback = vi.fn()
  const nextCallback = vi.fn()
  const original: UseGanttStateOptions = {
    date: initialDate,
    events: [firstEvent],
    timeZone: "UTC",
    onDateChange: oldCallback,
  }
  const view = mount(
    <Suspense fallback={<span>Waiting</span>}>
      <StateOwner options={original} capture={capture} />
    </Suspense>
  )
  const calendar = captured[0]
  act(() => {
    calendar.internals.extendRange("before")
  })
  const committed = calendar.getState()
  const blocked = new Promise<void>(() => {})
  view.render(
    <Suspense fallback={<span>Waiting</span>}>
      <StateOwner
        options={{
          ...original,
          date: new Date("2026-11-01T12:00:00Z"),
          events: [secondEvent],
          onDateChange: nextCallback,
        }}
        capture={capture}
        blocked={blocked}
      />
    </Suspense>
  )
  expect(calendar.getState()).toBe(committed)
  const destination = new Date("2026-10-25T12:00:00Z")
  act(() => calendar.api.goTo(destination))
  expect(oldCallback).toHaveBeenCalledWith(destination)
  expect(nextCallback).not.toHaveBeenCalled()
})

it("publishes controlled options to mounted subscribers after commit", () => {
  function CurrentDate() {
    const date = useGanttSelector(state => state.date.toISOString())
    return <output>{date}</output>
  }
  const capture = vi.fn()
  const child = <CurrentDate />
  const view = mount(
    <StateOwner options={{ date: initialDate, timeZone: "UTC" }} capture={capture}>
      {child}
    </StateOwner>
  )
  const date = new Date("2026-11-01T12:00:00Z")
  view.render(
    <StateOwner options={{ date, timeZone: "UTC" }} capture={capture}>
      {child}
    </StateOwner>
  )
  expect(view.container.querySelector("output")?.textContent).toBe(date.toISOString())
  expect(capture).toHaveBeenCalledTimes(1)
})

it("keeps mounted handlers current without rerendering for callback identity changes", () => {
  const renders = vi.fn()
  const CreateButton = memo(function CreateButton() {
    const settings = useGanttSettings()
    renders()
    return (
      <button
        disabled={!settings.onCreateTask}
        onClick={() => settings.onCreateTask?.({ parentId: null, index: 0 })}
      >
        Create
      </button>
    )
  })
  const oldCallback = vi.fn()
  const nextCallback = vi.fn()
  const capture = vi.fn()
  const child = <CreateButton />
  const view = mount(
    <StateOwner options={{ onCreateTask: oldCallback }} capture={capture}>
      {child}
    </StateOwner>
  )
  const initialRenders = renders.mock.calls.length
  view.render(
    <StateOwner options={{ onCreateTask: nextCallback }} capture={capture}>
      {child}
    </StateOwner>
  )
  const button = view.container.querySelector("button")
  if (!button) throw new Error("Missing create button")
  act(() => button.click())
  expect(oldCallback).not.toHaveBeenCalled()
  expect(nextCallback).toHaveBeenCalledWith({ parentId: null, index: 0 })
  expect(renders).toHaveBeenCalledTimes(initialRenders)
  view.render(
    <StateOwner options={{}} capture={capture}>
      {child}
    </StateOwner>
  )
  expect(view.container.querySelector("button")).toBe(button)
  expect(button.disabled).toBe(true)
})

it("uses the current selector closure and preserves equal committed selections", () => {
  const selections: Array<{ title: string }> = []
  function EventTitle({ index }: { index: number }) {
    const selected = useGanttSelector(state => ({ title: state.events[index]?.title ?? "" }), {
      isEqual: (a, b) => a.title === b.title,
    })
    useLayoutEffect(() => {
      selections.push(selected)
    }, [selected])
    return <output>{selected.title}</output>
  }
  const events = [firstEvent, secondEvent]
  const capture = vi.fn()
  const view = mount(
    <StateOwner options={{ events }} capture={capture}>
      <EventTitle index={0} />
    </StateOwner>
  )
  const first = selections[0]
  view.render(
    <StateOwner options={{ events: [...events] }} capture={capture}>
      <EventTitle index={0} />
    </StateOwner>
  )
  expect(selections).toEqual([first])
  view.render(
    <StateOwner options={{ events }} capture={capture}>
      <EventTitle index={1} />
    </StateOwner>
  )
  expect(view.container.querySelector("output")?.textContent).toBe("Second")
})
