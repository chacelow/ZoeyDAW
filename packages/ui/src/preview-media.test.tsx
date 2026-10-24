// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createRoot } from "react-dom/client"
import { PreviewMedia, type MediaItem } from "./preview-media"

vi.mock("@zoeymind/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const createObjectURL = vi.fn<(file: Blob) => string>()
const revokeObjectURL = vi.fn<(url: string) => void>()
interface MountedView {
  rerender: (children: ReactNode) => void
  unmount: () => void
}

const mountedViews = new Set<MountedView>()

function mount(children: ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const view = {
    rerender(nextChildren: ReactNode) {
      act(() => root.render(nextChildren))
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
      mountedViews.delete(view)
    },
  }
  mountedViews.add(view)
  view.rerender(children)
  return view
}

function imageSource(name: string, scope: ParentNode = document) {
  const image = Array.from(scope.querySelectorAll("img")).find(image => image.alt === name)
  if (!image) throw new Error(`Missing image: ${name}`)
  return image.getAttribute("src")
}

function clickButton(label: string, index = 0) {
  const button = Array.from(document.querySelectorAll("button")).filter(
    button => button.getAttribute("aria-label") === label
  )[index]
  if (!button) throw new Error(`Missing button: ${label}`)
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

function previewSource() {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) throw new Error("Missing preview dialog")
  return imageSource("ui.preview.previewImage", dialog)
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  let nextUrl = 0
  createObjectURL.mockReset().mockImplementation(() => `blob:preview-${++nextUrl}`)
  revokeObjectURL.mockReset()
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    }
  )
})

afterEach(() => {
  for (const view of mountedViews) view.unmount()
  vi.unstubAllGlobals()
})

function image(id = "photo"): MediaItem {
  return { id, name: `${id}.png`, type: "image", file: new File([id], `${id}.png`) }
}

function expectAllOwnedUrlsReleased() {
  const created = createObjectURL.mock.results.map(result => result.value)
  expect(revokeObjectURL.mock.calls.map(([url]) => url).sort((a, b) => a.localeCompare(b))).toEqual(
    created.sort((a, b) => a.localeCompare(b))
  )
}

it("does not create resources during render", () => {
  renderToString(<PreviewMedia items={[image()]} />)
  expect(createObjectURL).not.toHaveBeenCalled()
  expect(revokeObjectURL).not.toHaveBeenCalled()
})

it("balances StrictMode effects without allocating on rerender or preview clicks", () => {
  const item = image()
  const view = mount(
    <StrictMode>
      <PreviewMedia items={[item]} />
    </StrictMode>
  )
  const allocations = createObjectURL.mock.calls.length
  expect(allocations).toBeGreaterThan(0)
  expect(revokeObjectURL).toHaveBeenCalledTimes(allocations - 1)
  const source = imageSource(item.name)

  view.rerender(
    <StrictMode>
      <PreviewMedia items={[{ ...item, name: "renamed.png" }]} />
    </StrictMode>
  )
  clickButton("ui.preview.imagePreview: renamed.png")
  expect(previewSource()).toBe(source)
  expect(createObjectURL).toHaveBeenCalledTimes(allocations)

  view.unmount()
  expectAllOwnedUrlsReleased()
})

it("replaces the selected File source and releases the old URL", () => {
  const item = image()
  const view = mount(<PreviewMedia items={[item]} />)
  const oldSource = imageSource(item.name)
  clickButton(`ui.preview.imagePreview: ${item.name}`)

  const replacement = { ...item, file: new File(["replacement"], "replacement.png") }
  view.rerender(<PreviewMedia items={[replacement]} />)
  const source = imageSource(item.name)
  expect(source).not.toBe(oldSource)
  expect(revokeObjectURL).toHaveBeenCalledWith(oldSource)
  expect(previewSource()).toBe(source)

  view.unmount()
  expectAllOwnedUrlsReleased()
})

it("unmounts a removed item's dialog and preserves remaining item ownership across index changes", () => {
  const first = image("first")
  const second = image("second")
  const onRemove = vi.fn()
  const view = mount(<PreviewMedia items={[first, second]} onRemove={onRemove} />)
  const firstSource = imageSource(first.name)
  const secondSource = imageSource(second.name)
  clickButton("ui.preview.deleteFile")
  expect(onRemove).toHaveBeenCalledWith(0)
  clickButton(`ui.preview.imagePreview: ${first.name}`)

  view.rerender(<PreviewMedia items={[second]} onRemove={onRemove} />)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(revokeObjectURL).toHaveBeenCalledWith(firstSource)
  expect(revokeObjectURL).not.toHaveBeenCalledWith(secondSource)
  expect(imageSource(second.name)).toBe(secondSource)
  expect(createObjectURL).toHaveBeenCalledTimes(2)
  clickButton("ui.preview.deleteFile")
  expect(onRemove).toHaveBeenLastCalledWith(0)

  view.rerender(<PreviewMedia items={[first, second]} onRemove={onRemove} />)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  view.unmount()
  expectAllOwnedUrlsReleased()
})

it("never allocates or revokes caller-owned URLs, including a File-to-URL replacement", () => {
  const item = image()
  const view = mount(<PreviewMedia items={[item]} />)
  const ownedSource = imageSource(item.name)
  clickButton(`ui.preview.imagePreview: ${item.name}`)

  const external = { ...item, url: "https://example.test/photo.png" }
  view.rerender(<PreviewMedia items={[external]} />)
  expect(createObjectURL).toHaveBeenCalledTimes(1)
  expect(revokeObjectURL).toHaveBeenCalledWith(ownedSource)
  expect(previewSource()).toBe(external.url)
  view.unmount()
  expectAllOwnedUrlsReleased()

  const externalView = mount(<PreviewMedia items={[external]} />)
  externalView.unmount()
  expect(createObjectURL).toHaveBeenCalledTimes(1)
  expectAllOwnedUrlsReleased()
})
