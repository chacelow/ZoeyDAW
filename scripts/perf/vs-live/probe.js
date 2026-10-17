// Injected into both Ableton Live and ZoeyDAW. Records, on the target's own clock (QPC):
// - every dispatched pointer/wheel/key message (WM_MOUSEMOVE, WM_MOUSE[H]WHEEL, WM_LBUTTON*, WM_KEYDOWN)
// - every IDXGISwapChain Present / Present1 call with its sync interval, flags and dirty area
// rpc.exports.drain() returns everything recorded since the last call.
/* global Process, NativeFunction, Memory, Interceptor, NULL, rpc -- Frida GumJS runtime */
"use strict"

const kernel32 = Process.getModuleByName("kernel32.dll")
const qpc = new NativeFunction(kernel32.getExportByName("QueryPerformanceCounter"), "int", [
  "pointer",
])
const qpfFn = new NativeFunction(kernel32.getExportByName("QueryPerformanceFrequency"), "int", [
  "pointer",
])
const scratch = Memory.alloc(8)
qpfFn(scratch)
const freq = Number(scratch.readU64())
const nowMs = () => {
  qpc(scratch)
  return (Number(scratch.readU64()) * 1000) / freq
}

const inputs = []
const presents = []
const user32 = Process.getModuleByName("user32.dll")

function hookDispatch(name) {
  Interceptor.attach(user32.getExportByName(name), {
    onEnter(args) {
      const message = args[0].add(Process.pointerSize).readU32()
      if (
        message === 0x0200 ||
        message === 0x020a ||
        message === 0x020e ||
        message === 0x0201 ||
        message === 0x0202 ||
        message === 0x0100
      ) {
        inputs.push([nowMs(), message])
      }
    },
  })
}
hookDispatch("DispatchMessageW")

function present(args, kind) {
  const entry = [nowMs(), kind, args[1].toInt32(), args[2].toInt32(), -1]
  if (kind === 1 && !args[3].isNull()) {
    const count = args[3].readU32()
    const rects = args[3].add(8).readPointer()
    let area = 0
    for (let i = 0; i < count && !rects.isNull(); i++) {
      const r = rects.add(i * 16)
      area +=
        Math.max(0, r.add(8).readS32() - r.readS32()) *
        Math.max(0, r.add(12).readS32() - r.add(4).readS32())
    }
    entry[4] = area
  }
  presents.push(entry)
}

// All swap chains from one dxgi.dll share their vtable; a throwaway 8x8 swap chain exposes it.
const d3d11 = Process.getModuleByName("d3d11.dll")
const create = new NativeFunction(d3d11.getExportByName("D3D11CreateDeviceAndSwapChain"), "int", [
  "pointer",
  "int",
  "pointer",
  "uint",
  "pointer",
  "uint",
  "uint",
  "pointer",
  "pointer",
  "pointer",
  "pointer",
  "pointer",
])
const createWindow = new NativeFunction(user32.getExportByName("CreateWindowExW"), "pointer", [
  "uint",
  "pointer",
  "pointer",
  "uint",
  "int",
  "int",
  "int",
  "int",
  "pointer",
  "pointer",
  "pointer",
  "pointer",
])
const destroyWindow = new NativeFunction(user32.getExportByName("DestroyWindow"), "int", [
  "pointer",
])
const hwnd = createWindow(
  0,
  Memory.allocUtf16String("STATIC"),
  NULL,
  0,
  0,
  0,
  8,
  8,
  NULL,
  NULL,
  NULL,
  NULL
)
const desc = Memory.alloc(72)
desc.writeU32(8)
desc.add(4).writeU32(8)
desc.add(16).writeU32(28)
desc.add(28).writeU32(1)
desc.add(36).writeU32(0x20)
desc.add(40).writeU32(1)
desc.add(48).writePointer(hwnd)
desc.add(56).writeU32(1)
const out = [Memory.alloc(8), Memory.alloc(8), Memory.alloc(8)]
let hooked = false
if (create(NULL, 1, NULL, 0, NULL, 0, 7, desc, out[0], out[1], NULL, out[2]) === 0) {
  const swap = out[0].readPointer()
  const vtable = swap.readPointer()
  Interceptor.attach(vtable.add(8 * 8).readPointer(), {
    onEnter(args) {
      present(args, 0)
    },
  })
  Interceptor.attach(vtable.add(22 * 8).readPointer(), {
    onEnter(args) {
      present(args, 1)
    },
  })
  hooked = true
  for (const p of out) {
    const o = p.readPointer()
    new NativeFunction(o.readPointer().add(16).readPointer(), "uint", ["pointer"])(o)
  }
}
destroyWindow(hwnd)

rpc.exports = {
  ready: () => ({ hooked, freq }),
  now: () => nowMs(),
  drain() {
    const result = { inputs: inputs.splice(0), presents: presents.splice(0) }
    return result
  },
}
