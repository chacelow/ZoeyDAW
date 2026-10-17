import { describe, expect, test } from "bun:test"
import { parseRoute, routePath } from "./route"
import { createRouter } from "./router"
import type { Route } from "./route"

describe("route parsing", () => {
  test("maps web paths onto home, project, and gallery routes", () => {
    expect(parseRoute("/gallery")).toEqual({ kind: "gallery" })
    expect(parseRoute("/gallery/")).toEqual({ kind: "gallery" })
    expect(parseRoute("/")).toEqual({ kind: "home" })
    expect(parseRoute("/project/abc")).toEqual({ kind: "project", projectId: "abc" })
    expect(parseRoute("/project/abc/")).toEqual({ kind: "project", projectId: "abc" })
    expect(parseRoute("/project/")).toEqual({ kind: "not-found", path: "/project/" })
    expect(parseRoute("/project/a/b")).toEqual({ kind: "not-found", path: "/project/a/b" })
    expect(parseRoute("/library")).toEqual({ kind: "not-found", path: "/library" })
  })

  test("project ids round-trip through their path, including reserved characters", () => {
    let seed = 7
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31
    const alphabet = "ab9-_ /?#%日本"
    for (let index = 0; index < 500; index++) {
      const length = 1 + Math.floor(next() * 12)
      const projectId = Array.from(
        { length },
        () => alphabet[Math.floor(next() * alphabet.length)]
      ).join("")
      const route: Route = { kind: "project", projectId }
      expect(parseRoute(routePath(route))).toEqual(route)
    }
  })
})

describe("memory router", () => {
  test("navigate pushes, replace swaps, back pops and stops at the first entry", () => {
    const router = createRouter()
    const seen: string[] = []
    router.subscribe(() => {
      seen.push(routePath(router.getRoute()))
    })
    router.navigate("/project/a")
    router.navigate({ kind: "project", projectId: "b" }, { replace: true })
    router.navigate("/missing")
    expect(router.back()).toBe(true)
    expect(router.getRoute()).toEqual({ kind: "project", projectId: "b" })
    expect(router.back()).toBe(true)
    expect(router.getRoute()).toEqual({ kind: "home" })
    expect(router.back()).toBe(false)
    expect(seen).toEqual(["/project/a", "/project/b", "/missing", "/project/b", "/"])
  })

  test("an unsubscribed listener is no longer notified", () => {
    const router = createRouter("/project/x")
    let calls = 0
    const stop = router.subscribe(() => calls++)
    router.navigate("/")
    stop()
    router.navigate("/project/y")
    expect(calls).toBe(1)
  })
})
