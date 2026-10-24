import { describe, expect, it } from "vitest"
import {
  checkCargoBoundaries,
  checkNativeBoundaries,
} from "../../scripts/check-core-boundaries.mjs"

function cargoFixture() {
  const packages = [
    "zoeydaw",
    "zoeydaw-media",
    "zoeydaw-project",
    "zoeydaw-browser",
    "zoeydaw-engine",
    "zoeydaw-plugin-helper",
    "zoeydaw-plugin-host",
    "zoeydaw-plugin-abi",
  ].map(name => ({
    name,
    manifest_path: `/repo/${name}/Cargo.toml`,
    dependencies: [],
  }))
  const dependency = name => ({ name, path: `/repo/${name}` })
  packages[0].dependencies = packages
    .slice(1)
    .filter(pkg => pkg.name !== "zoeydaw-plugin-helper" && pkg.name !== "zoeydaw-plugin-abi")
    .map(pkg => dependency(pkg.name))
  packages[2].dependencies = [dependency("zoeydaw-media")]
  packages[4].dependencies = [dependency("zoeydaw-plugin-abi")]
  packages[6].dependencies = [dependency("zoeydaw-plugin-abi")]
  return { packages }
}

describe("Rust core dependency graph", () => {
  it("allows shell core and plugin host dependencies while keeping the helper isolated", () => {
    expect(checkCargoBoundaries(cargoFixture())).toEqual([])
  })

  it.each([
    "zoeydaw-media",
    "zoeydaw-browser",
    "zoeydaw-engine",
    "zoeydaw-project",
    "zoeydaw-plugin-helper",
    "zoeydaw-plugin-host",
  ])("rejects %s to engine", name => {
    const metadata = cargoFixture()
    metadata.packages
      .find(pkg => pkg.name === name)
      .dependencies.push({ name: "zoeydaw-engine", path: "/repo/zoeydaw-engine" })
    expect(checkCargoBoundaries(metadata)).toContain(
      `${name} cannot depend on local package zoeydaw-engine`
    )
  })

  it.each(["tauri", "tauri-build", "tauri-plugin-fs"])("rejects core dependency on %s", name => {
    const metadata = cargoFixture()
    metadata.packages[1].dependencies.push({ name, kind: "build" })
    expect(checkCargoBoundaries(metadata)).toContain(`zoeydaw-media cannot depend on ${name}`)
  })

  it("rejects unknown local packages and missing core packages", () => {
    const metadata = cargoFixture()
    metadata.packages[1].dependencies.push({ name: "other", path: "/repo/other" })
    metadata.packages.splice(4, 1)
    expect(checkCargoBoundaries(metadata)).toEqual([
      "zoeydaw cannot depend on local package zoeydaw-engine",
      "zoeydaw-media cannot depend on local package other",
      "Missing required workspace package: zoeydaw-engine",
    ])
  })
})

function nativeFixture(file, include) {
  return new Map([
    ["model/playback_model.h", ""],
    ["analysis/analysis.h", ""],
    ["runtime/engine_session.h", ""],
    [file, include],
  ])
}

describe("native include dependency graph", () => {
  it.each([
    ["analysis/waveform.cpp", '#include "playback_model.h"'],
    ["runtime/engine_session.cpp", '#include "../model/playback_model.h"'],
    ["model/playback_model.cpp", '#include "playback_model.h"'],
    [
      "playback_bridge.cpp",
      '#include "analysis/analysis.h"\n#include "runtime/engine_session.h"\n#include "model/playback_model.h"',
    ],
    ["tests/mixer_tests.cpp", '#include "engine_session.h"'],
    [
      "analysis/waveform.cpp",
      '// #include "engine_session.h"\n/* #include "../runtime/engine_session.h" */',
    ],
  ])("allows %s valid includes", (file, source) => {
    expect(checkNativeBoundaries(nativeFixture(file, source))).toEqual([])
  })

  it.each([
    ["analysis/waveform.cpp", "engine_session.h", "runtime/engine_session.h"],
    ["analysis/waveform.cpp", "../runtime/engine_session.h", "runtime/engine_session.h"],
    ["analysis/waveform.cpp", "runtime/engine_session.h", "runtime/engine_session.h"],
    ["runtime/engine_session.cpp", "analysis.h", "analysis/analysis.h"],
    ["model/playback_model.cpp", "analysis.h", "analysis/analysis.h"],
    ["model/playback_model.cpp", "engine_session.h", "runtime/engine_session.h"],
  ])("rejects %s including %s", (file, include, target) => {
    expect(checkNativeBoundaries(nativeFixture(file, `#include "${include}"`))).toEqual([
      `${file} cannot include ${target}`,
    ])
  })
})
