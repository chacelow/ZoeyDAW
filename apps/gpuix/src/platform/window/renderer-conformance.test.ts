import { expect, test } from "bun:test"
import type { NativeRenderer } from "@gpuix/native/host"
import type { WindowRenderer } from "./index"

type Assert<T extends true> = T
type _RendererSatisfiesPort = Assert<NativeRenderer extends WindowRenderer ? true : false>

test("WindowRenderer 端口与 @gpuix/native 的 NativeRenderer 结构兼容(由 tsc 在编译期保证)", () => {
  const witness: _RendererSatisfiesPort = true
  expect(witness).toBe(true)
})
