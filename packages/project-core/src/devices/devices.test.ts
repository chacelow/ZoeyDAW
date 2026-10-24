import { describe, expect, it } from "vitest"
import {
  createDevice,
  DEVICE_KINDS,
  DEVICE_PARAMETERS,
  deviceParameterKeys,
  deviceParameterValue,
  isDevice,
  withDeviceParameter,
} from "./index"
import { isNativeParameterId } from "./external"

describe("track device metadata", () => {
  it("creates valid independent defaults with unique identifiers", () => {
    const devices = DEVICE_KINDS.flatMap(kind => [createDevice(kind), createDevice(kind)])
    expect(devices.every(isDevice)).toBe(true)
    expect(new Set(devices.map(device => device.id)).size).toBe(devices.length)
    for (const device of devices) {
      expect(device.enabled).toBe(true)
      expect(device.collapsed).toBe(false)
      for (const field of deviceParameterKeys(device)) {
        expect(deviceParameterValue(device, field)).toBe(DEVICE_PARAMETERS[field].defaultValue)
      }
    }
  })

  it("rejects unknown kinds, missing fields and unknown settings", () => {
    for (const value of [
      null,
      [],
      {},
      0,
      "utility",
      { ...createDevice("utility"), kind: "instrument" },
      { ...createDevice("delay"), source: "mock://injected.wav" },
      { ...createDevice("reverb"), id: " " },
      { ...createDevice("filter"), enabled: 1 },
      { ...createDevice("utility"), collapsed: undefined },
      { id: "device", enabled: true, collapsed: false, kind: "utility", gainDb: 0, pan: 0 },
    ])
      expect(isDevice(value)).toBe(false)
  })

  it("validates finite inclusive parameter bounds for every kind", () => {
    for (const kind of DEVICE_KINDS) {
      const device = createDevice(kind)
      for (const field of deviceParameterKeys(device)) {
        const { min, max } = DEVICE_PARAMETERS[field]
        expect(isDevice({ ...device, [field]: min })).toBe(true)
        expect(isDevice({ ...device, [field]: max })).toBe(true)
        for (const invalid of [min - 1, max + 1, Number.NaN, Infinity, -Infinity, "0", null]) {
          expect(isDevice({ ...device, [field]: invalid })).toBe(false)
        }
      }
    }
  })

  it("edits only matching parameters while retaining device identity and state", () => {
    const device = { ...createDevice("filter"), enabled: false, collapsed: true }
    const edited = withDeviceParameter(device, "frequency", 2400)
    expect(deviceParameterValue(edited, "frequency")).toBe(2400)
    expect(edited.id).toBe(device.id)
    expect(edited.enabled).toBe(false)
    expect(edited.collapsed).toBe(true)
    expect(withDeviceParameter(device, "gainDb", 3)).toBe(device)
    expect(withDeviceParameter(device, "frequency", Infinity)).toBe(device)
    expect(deviceParameterValue(device, "gainDb")).toBeUndefined()
    expect(deviceParameterValue(device, "frequency")).toBe(1000)
  })

  it("preserves external identity and exact native parameter IDs without a catalog", () => {
    const device = {
      id: "plugin",
      kind: "external",
      enabled: true,
      collapsed: false,
      plugin: {
        catalogId: "a".repeat(64),
        format: "clap",
        classId: "fixture",
        name: "Fixture",
        vendor: "",
        version: "1",
        role: "instrument",
      },
      stateRef: { sha256: "b".repeat(64), path: "plugin-state/state.zdps" },
      parameters: [{ id: "18446744073709551615", normalized: 0.25 }],
    }
    expect(isDevice(device)).toBe(true)
    for (const id of ["0", "9007199254740993", "18446744073709551615"])
      expect(isNativeParameterId(id)).toBe(true)
    for (const id of ["", "01", "-1", "+1", "1.0", "18446744073709551616", 42])
      expect(isNativeParameterId(id)).toBe(false)
    for (const parameters of [
      [{ id: "0", normalized: -0.1 }],
      [{ id: "0", normalized: Number.NaN }],
      [{ id: 42, normalized: 0.25 }],
      [device.parameters[0], device.parameters[0]],
    ])
      expect(isDevice({ ...device, parameters })).toBe(false)
    expect(isDevice({ ...device, stateRef: { ...device.stateRef, path: "bad\0path" } })).toBe(false)
    expect(isDevice({ ...device, plugin: { ...device.plugin, format: "unknown" } })).toBe(false)
    expect(isDevice({ ...device, nativeHandle: 123 })).toBe(false)
  })
})
