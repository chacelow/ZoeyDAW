import { expect, test } from "bun:test"
import type { NativeRenderer } from "@gpuix/native/host"
import type { WindowRenderer } from "./index"

// 编译期断言:真实的 gpuix renderer 在结构上满足 platform 声明的 WindowRenderer 端口。
// platform 源码不 import @gpuix/native(分层规则),这个测试文件不受层规则约束,
// 正好在这里守住“端口形状与真实渲染器一致”,上游改动签名时 tsc 会在此处报错。
type Assert<T extends true> = T
type _RendererSatisfiesPort = Assert<NativeRenderer extends WindowRenderer ? true : false>

test("WindowRenderer 端口与 @gpuix/native 的 NativeRenderer 结构兼容(由 tsc 在编译期保证)", () => {
  const witness: _RendererSatisfiesPort = true
  expect(witness).toBe(true)
})
