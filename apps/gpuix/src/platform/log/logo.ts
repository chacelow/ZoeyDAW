import { applyColor } from "./colors"

export function showLogo(): void {
  const logoText = applyColor(" ZOEY v1.0.0 - Intelligent Mind Mapping", "#FFCC00")
  console.log(logoText)
  const readyText = applyColor("Ready to enhance your thinking! 🚀", "#10b981")
  console.log(readyText)
  console.log("")
}
