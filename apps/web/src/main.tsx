import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { configureLogger } from "@zoeymind/logger"
import { createTauriLogSink } from "@/shared/native"
import { initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import App from "./App"

// 前端 log -> Rust file target 桥。只在 Tauri 环境生效。
configureLogger({ sinks: [createTauriLogSink()] })

initI18n(appLocales)

const root = document.querySelector("#root")
if (!root) {
  throw new Error("Missing application root #root")
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
