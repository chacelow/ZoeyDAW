// @vitest-environment jsdom
import { Suspense } from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { useSongExtent } from "./useSongExtent"

afterEach(cleanup)
const never = new Promise<void>(() => {})
function Extent({ through, suspended = false }: { through: number; suspended?: boolean }) {
  const bars = useSongExtent("project", 58, through, 4)
  if (suspended) throw never
  return <output>{bars}</output>
}

it("does not carry the extent of an abandoned render into a committed view", () => {
  const view = render(
    <Suspense fallback={<span>pending</span>}>
      <Extent through={1} />
    </Suspense>
  )
  expect(view.getByRole("status").textContent).toBe("58")
  view.rerender(
    <Suspense fallback={<span>pending</span>}>
      <Extent through={133} suspended />
    </Suspense>
  )
  view.rerender(
    <Suspense fallback={<span>pending</span>}>
      <Extent through={128} />
    </Suspense>
  )
  expect(view.getByRole("status").textContent).toBe("135")
})
