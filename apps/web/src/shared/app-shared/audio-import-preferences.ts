export interface AudioImportPreferences {
  autoWarp: boolean
}

export const AUDIO_IMPORT_PREFERENCES_KEY = "audio-import-preferences"
export const DEFAULT_AUDIO_IMPORT_PREFERENCES: Readonly<AudioImportPreferences> = { autoWarp: true }

export function getAudioImportPreferences(): AudioImportPreferences {
  try {
    const raw: unknown = JSON.parse(
      window.localStorage.getItem(AUDIO_IMPORT_PREFERENCES_KEY) ?? "null"
    )
    if (
      typeof raw === "object" &&
      raw !== null &&
      "autoWarp" in raw &&
      typeof raw.autoWarp === "boolean"
    )
      return { autoWarp: raw.autoWarp }
  } catch {
    // Unavailable or invalid storage retains the application default.
  }
  return { ...DEFAULT_AUDIO_IMPORT_PREFERENCES }
}

export function setAudioImportPreferences(preferences: AudioImportPreferences): boolean {
  try {
    window.localStorage.setItem(AUDIO_IMPORT_PREFERENCES_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}
