import { describe, test } from "bun:test"
import { verificationAudioCapability } from "./audio-capability"

export const testWithAudioOutput = test.skipIf(verificationAudioCapability.kind === "unavailable")
export const describeWithAudioOutput = describe.skipIf(
  verificationAudioCapability.kind === "unavailable"
)
