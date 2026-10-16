declare module "@/project/defaults/preferences.json" {
  import type { Preferences } from "@zoeydaw/native"

  // Rust validates the data; napi generates its only TypeScript shape.
  const defaults: Preferences
  export default defaults
}
