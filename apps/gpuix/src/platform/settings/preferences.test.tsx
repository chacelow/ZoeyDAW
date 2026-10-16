import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import {
  configurePreferences,
  createPreferenceOwner,
  getPreference,
  setPreference,
  usePreference,
} from "./index"

test("usePreference observes the persisted owner and unsubscribes on unmount", () => {
  const configDir = mkdtempSync(path.join(tmpdir(), "zoeydaw-preference-hook-"))
  const owner = createPreferenceOwner({ configDir })
  owner.setPreference("historyCapacity", 83)
  const release = configurePreferences(owner)
  const root = createTestRoot({ width: 320, height: 160 })
  const rendered: number[] = []
  let unmounted = false
  function Capacity() {
    const capacity = usePreference("historyCapacity")
    rendered.push(capacity)
    return <div>{capacity}</div>
  }
  try {
    root.render(<Capacity />)
    root.renderer.flush()
    expect(root.renderer.getAllText()).toContain("83")
    flushSync(() => setPreference("historyCapacity", 137))
    root.renderer.flush()
    expect(getPreference("historyCapacity")).toBe(137)
    expect(root.renderer.getAllText()).toContain("137")
    expect(createPreferenceOwner({ configDir }).getPreference("historyCapacity")).toBe(137)
    root.unmount()
    unmounted = true
    const count = rendered.length
    setPreference("historyCapacity", 138)
    expect(rendered.length).toBe(count)
  } finally {
    if (!unmounted) root.unmount()
    release()
    rmSync(configDir, { recursive: true, force: true })
  }
})
