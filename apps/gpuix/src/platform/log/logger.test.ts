import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { createLogger } from "./logger"

beforeEach(() => {
  spyOn(console, "log").mockImplementation(() => {})
  spyOn(console, "warn").mockImplementation(() => {})
  spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  mock.restore()
})
const jsonEntry = (args: unknown[]) => JSON.parse(String(args[0]))

describe("native logger behavior", () => {
  test("silent and minimum-level filtering suppress both console output and sinks", () => {
    const entries: unknown[] = []
    const log = createLogger({
      showLogo: false,
      minLevel: "warn",
      sinks: [
        entry => {
          entries.push(entry)
        },
      ],
    })
    log.debug("debug")
    log.info("info")
    expect(console.log).not.toHaveBeenCalled()
    expect(entries).toEqual([])
    log.warn("warning")
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(entries).toEqual([expect.objectContaining({ level: "warn", args: ["warning"] })])
    log.setConfig({ show: false })
    log.error("hidden")
    expect(console.error).not.toHaveBeenCalled()
    expect(entries).toHaveLength(1)
  })

  test("dynamic configuration changes emitted prefix and minimum level", () => {
    const log = createLogger({ showLogo: false, minLevel: "info", prefix: "BEFORE" })
    log.debug("hidden")
    expect(console.log).not.toHaveBeenCalled()
    log.setConfig({ minLevel: "debug", prefix: "AFTER" })
    log.debug("visible", { value: 42 })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("AFTER"), { value: 42 })
    expect(log.getConfig().prefix).toBe("AFTER")
  })

  test("timestamps are included only when enabled", () => {
    const log = createLogger({ showLogo: false, showTimestamp: false })
    log.info("plain")
    expect(console.log).toHaveBeenLastCalledWith(expect.not.stringMatching(/\d{4}-\d{2}-\d{2}/))
    log.setConfig({ showTimestamp: true })
    log.info("dated")
    expect(console.log).toHaveBeenLastCalledWith(expect.stringMatching(/\d{4}-\d{2}-\d{2}/))
  })

  test("JSON preserves Error message, stack and nested cause", () => {
    const output = spyOn(console, "error").mockImplementation(() => {})
    const log = createLogger({ json: true, showLogo: false })
    log.error("操作失败", new Error("outer", { cause: new Error("inner") }))
    const entry = jsonEntry(output.mock.calls[0])
    expect(entry.msg).toBe("操作失败")
    expect(entry.name).toBe("Error")
    expect(entry.message).toBe("outer")
    expect(entry.stack).toEqual(expect.stringContaining("outer"))
    expect(entry.cause.message).toBe("inner")
  })

  test("JSON preserves Error values inside multiple argument data", () => {
    const output = spyOn(console, "error").mockImplementation(() => {})
    const log = createLogger({ json: true, showLogo: false })
    log.error("multi", new Error("x"), 42)
    const entry = jsonEntry(output.mock.calls[0])
    expect(entry.data[0].message).toBe("x")
    expect(entry.data[1]).toBe(42)
  })

  test("JSON redacts configured keys case-insensitively at nested boundaries", () => {
    const output = spyOn(console, "error").mockImplementation(() => {})
    const log = createLogger({ json: true, showLogo: false, redactKeys: ["password", "token"] })
    log.error("login", { user: "a", Password: "p", nested: { token: "t" } })
    const entry = jsonEntry(output.mock.calls[0])
    expect(entry.user).toBe("a")
    expect(entry.Password).toBe("[REDACTED]")
    expect(entry.nested.token).toBe("[REDACTED]")
  })

  test("JSON includes request context", () => {
    const output = spyOn(console, "error").mockImplementation(() => {})
    const log = createLogger({
      json: true,
      showLogo: false,
      contextProvider: () => ({ requestId: "req-1", userId: "u-9" }),
    })
    log.error("ping")
    expect(jsonEntry(output.mock.calls[0])).toMatchObject({
      requestId: "req-1",
      userId: "u-9",
      msg: "ping",
    })
  })
})
