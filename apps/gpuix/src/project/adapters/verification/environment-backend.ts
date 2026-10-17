import { verificationAudioCapability } from "@/platform/verification/audio-capability"
import { createMockProjectBackend } from "../backend/mock"
import { createNativeBackend } from "../backend/native"

export const createVerificationProjectBackend =
  verificationAudioCapability.kind === "unavailable"
    ? createMockProjectBackend
    : createNativeBackend

if (verificationAudioCapability.kind === "unavailable") {
  console.info(
    "[verification] Lifecycle and UI contracts continue with the existing mock project backend; real-audio coverage remains unverified"
  )
}
