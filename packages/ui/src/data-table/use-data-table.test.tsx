// @vitest-environment jsdom
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useDataTable } from "./use-data-table"

type Row = { name: string; status: string }
const columns: ColumnDef<Row>[] = [
  { id: "name", accessorKey: "name", enableColumnFilter: true },
  { id: "status", accessorKey: "status", enableColumnFilter: true },
]
const data: Row[] = []
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function FilterTable({
  pageKey = "page",
  onCalculate,
}: {
  pageKey?: string
  onCalculate: (previous: ColumnFiltersState) => void
}) {
  const { table } = useDataTable({
    columns,
    data,
    pageCount: 5,
    debounceMs: 300,
    queryKeys: { page: pageKey },
  })
  return (
    <>
      <button
        type="button"
        onClick={() => {
          for (const id of ["name", "status"]) {
            table.setColumnFilters(previous => {
              onCalculate(previous)
              return previous.filter(filter => filter.id !== id)
            })
          }
        }}
      >
        Clear both
      </button>
      <output>{JSON.stringify(table.getState().columnFilters)}</output>
    </>
  )
}

function clearBoth() {
  const button = host.querySelector("button")
  if (!button) {
    throw new Error("Expected a filter control")
  }
  act(() => button.click())
}

it("calculates batched filter updates once each under StrictMode and debounces the final query", async () => {
  const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>()
  const onCalculate = vi.fn<(previous: ColumnFiltersState) => void>()
  act(() =>
    root.render(
      <StrictMode>
        <NuqsTestingAdapter searchParams="?page=3&name=old&status=open" onUrlUpdate={onUrlUpdate}>
          <FilterTable onCalculate={onCalculate} />
        </NuqsTestingAdapter>
      </StrictMode>
    )
  )

  clearBoth()
  expect(onCalculate).toHaveBeenCalledTimes(2)
  expect(onCalculate.mock.calls[1]?.[0].map(filter => filter.id)).toEqual(["status"])
  expect(host.querySelector("output")?.textContent).toBe("[]")
  await act(async () => vi.advanceTimersByTimeAsync(299))
  expect(onUrlUpdate).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(2))

  expect(onUrlUpdate).toHaveBeenCalledOnce()
  const update = onUrlUpdate.mock.calls[0]?.[0]
  expect(update?.searchParams.get("page")).toBe("1")
  expect(update?.searchParams.has("name")).toBe(false)
  expect(update?.searchParams.has("status")).toBe(false)
})

it("uses the latest query props when a pending filter debounce commits", async () => {
  const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>()
  const onCalculate = vi.fn<(previous: ColumnFiltersState) => void>()
  const renderTable = (pageKey: string) => (
    <NuqsTestingAdapter
      searchParams="?page=3&offset=4&name=old&status=open"
      onUrlUpdate={onUrlUpdate}
    >
      <FilterTable pageKey={pageKey} onCalculate={onCalculate} />
    </NuqsTestingAdapter>
  )
  act(() => root.render(renderTable("page")))
  clearBoth()
  await act(async () => vi.advanceTimersByTimeAsync(150))
  act(() => root.render(renderTable("offset")))
  await act(async () => vi.advanceTimersByTimeAsync(151))

  expect(onUrlUpdate).toHaveBeenCalledOnce()
  const update = onUrlUpdate.mock.calls[0]?.[0]
  expect(update?.searchParams.get("page")).toBe("3")
  expect(update?.searchParams.get("offset")).toBe("1")
  expect(update?.searchParams.has("name")).toBe(false)
  expect(update?.searchParams.has("status")).toBe(false)
})

it("cancels a pending filter query write when its table unmounts", async () => {
  const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>()
  act(() =>
    root.render(
      <NuqsTestingAdapter searchParams="?name=old&status=open" onUrlUpdate={onUrlUpdate}>
        <FilterTable onCalculate={() => {}} />
      </NuqsTestingAdapter>
    )
  )
  clearBoth()
  act(() => root.render(null))
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(onUrlUpdate).not.toHaveBeenCalled()
})
