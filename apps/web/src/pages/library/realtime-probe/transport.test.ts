import { expect, it } from "vitest"
import { parseFrame } from "./transport"

it.each([32, 33, 33792, 32960])(
  "validates a %i-byte raw diagnostic frame without sampling its header as payload",
  bytes => {
    const frame = new ArrayBuffer(bytes)
    const view = new DataView(frame)
    view.setUint32(0, 0x5052445a, true)
    view.setUint32(4, 1, true)
    view.setBigUint64(8, 9007199254740993n, true)
    view.setBigUint64(16, 1000001n, true)
    view.setUint32(24, bytes, true)
    const payload = new Uint8Array(frame)
    for (let index = 32; index < bytes; index++) payload[index] = (index + 1) & 255
    expect(parseFrame(frame, bytes)).toMatchObject({ seq: 9007199254740993n, producedMs: 1.000001 })
    expect(() => parseFrame(frame.slice(0, -1), bytes)).toThrow()
    if (bytes > 32) {
      payload[bytes - 1] ^= 1
      expect(() => parseFrame(frame, bytes)).toThrow("payload mismatch")
    }
  }
)
