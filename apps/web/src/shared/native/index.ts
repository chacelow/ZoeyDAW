/**
 * shared/native — 桌面端 Tauri 原生封装入口。
 *
 * DAW prototype 阶段只保留“真正通用、未来一定会用”的壳：
 *   - 原子写文件 (工程/录音落盘)
 *   - 日志桥到 Rust 文件 target
 *   - 日志级别/目录运行时配置
 *   - 关闭行为偏好 (ask / tray / quit, localStorage 持久化)
 *   - 外链安全兜底 (anchor hijack → tauri opener)
 *
 * SQLite / 文件会话 / 恢复快照 / AI chat / MCP / 自动更新 UI 等旧 mindmap 侧产物已移除；
 * 自动更新 Rust 插件仍在 (`tauri-plugin-updater`)，但 UI 控制待 DAW 需求再实现。
 */
export * from "./atomic-file"
export * from "./log-config"
export { createTauriLogSink } from "./log-sink"
export * from "./close-behavior"
export * from "./external-links"
