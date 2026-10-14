import { clipboardReadText, clipboardWriteText } from "@zoeydaw/native"

export interface NativeClipboard {
  readText(): string | null
  writeText(text: string): void
}

const systemClipboard: NativeClipboard = {
  readText: clipboardReadText,
  writeText: clipboardWriteText,
}

export function createNativeClipboard(
  implementation: NativeClipboard = systemClipboard
): NativeClipboard {
  return implementation
}
