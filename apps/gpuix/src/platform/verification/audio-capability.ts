export type VerificationAudioCapability =
  | { readonly kind: "available"; readonly device: string }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "unprobed" }

export function readVerificationAudioCapability(
  environment: NodeJS.ProcessEnv
): VerificationAudioCapability {
  const simulated = environment.ZOEYDAW_VERIFY_NO_AUDIO
  if (simulated !== undefined && simulated !== "1") {
    throw new TypeError("ZOEYDAW_VERIFY_NO_AUDIO only accepts 1 to simulate unavailable audio")
  }
  if (simulated === "1")
    return {
      kind: "unavailable",
      reason: "Audio output is explicitly disabled for verification by ZOEYDAW_VERIFY_NO_AUDIO=1",
    }
  const encoded = environment.ZOEYDAW_VERIFY_AUDIO_CAPABILITY
  if (encoded === undefined) return { kind: "unprobed" }
  const value: unknown = JSON.parse(encoded)
  if (value && typeof value === "object" && "kind" in value) {
    if (
      value.kind === "available" &&
      "device" in value &&
      typeof value.device === "string" &&
      value.device.length > 0
    )
      return { kind: "available", device: value.device }
    if (
      value.kind === "unavailable" &&
      "reason" in value &&
      typeof value.reason === "string" &&
      value.reason.length > 0
    )
      return { kind: "unavailable", reason: value.reason }
  }
  throw new TypeError(
    "Invalid ZOEYDAW_VERIFY_AUDIO_CAPABILITY: an observed device or an explicit unavailable reason is required"
  )
}

export const verificationAudioCapability = readVerificationAudioCapability(process.env)
if (verificationAudioCapability.kind === "unavailable") {
  console.warn(
    `[unverified] Real-audio integration requires a default output device: ${verificationAudioCapability.reason}`
  )
}
