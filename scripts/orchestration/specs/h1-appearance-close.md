# H1:系统外观、主题模式设置、程序化关闭窗口

## 背景

app-shell 第一阶段需要三项原生能力,当前都没有:

1. 设置对话框的「明 / 暗 / 跟随系统」三态。gpuix 没有读取系统外观的接口,也收不到外观变化通知。
2. Rust `Settings`(`crates/native/src/settings.rs:44-51`,`deny_unknown_fields`)只有 `themePreset/language/closeBehavior`,没有字段保存模式。模式和预设是两个概念:web 把模式交给 next-themes,预设存在 `THEME_PRESET_STORAGE_KEY`。不要把模式塞进 `themePreset`。
3. 未保存关闭拦截:补丁后的 renderer 有 `setWindowShouldClose(cb)`(`scripts/gpuix-main/patches/close-guard.patch`),但没有程序化关闭窗口的 API。用户在「保存/不保存」里做出选择后,现在只能提示「再按一次关闭」。

## 拥有路径

`crates/native/src/**`,不改 `cursor.rs`;G1 正在新增 `window_geometry.rs`,也不改它。还有 `apps/gpuix/src/platform/{settings,window}/**`、`scripts/gpuix-main/patches/`(新补丁)和 `scripts/gpuix-main/config.json`。不动 `ui/**`、`shared/**`、`project/**`、`app/**`。app-shell 正在 `platform/window` 里给 `createWindowCloseGuard` 加 `setWindowShouldClose` 支持:你开工前先 merge 主干;若它还没合入,只新增文件、不改 `close-guard` 相关代码,冲突由协调者排序。

## 交付

1. **Settings.themeMode**:`'light' | 'dark' | 'system'`,可选,缺省按 `'system'` 处理。serde 用 camelCase;旧设置文件(没有该字段)必须能读;未知值返回明确错误,不能静默。`platform/settings` 暴露读写端口,写入走现有的原子写。
2. **系统外观**:优先查 GPUI 是否已有 `window_appearance` / `observe_window_appearance`(gpui_macos 的 `NSAppearance`)。有就走 vendor 补丁,接口仿照 F1 的 `onWindowActiveChange`:renderer 方法 `onWindowAppearanceChange(callback | null)`,首次异步回报当前值,之后回报变化,传 null 释放 observer;用弱的 nonblocking TSFN,不让进程保活。如果 `crates/native` 不改 vendor 就能做到(`NSApp.effectiveAppearance` + KVO 或 `NSDistributedNotificationCenter` 的 `AppleInterfaceThemeChangedNotification`),给两个方案的对比再定。`platform/window` 新增 `subscribeSystemAppearance(listener): unsubscribe`,结构与 `subscribeApplicationActive` 一致:惰性单 observer,第一条原生值只建立基线。
3. **程序化关闭**:renderer 增加 `closeWindow()`。调用时**不**再经过 `setWindowShouldClose` 否决,因为用户已经在对话框里做了选择;它关闭当前窗口,再按现有规则退出应用。`platform/window` 的关闭守卫暴露 `close()`。
4. 新补丁登记进 `config.json`。跑 `bash scripts/gpuix-main/build.sh` 前先 ask:共享 vendor 重建会让其它 worker 的测试暂时混杂,由协调者通知暂停,确认后再跑。

## 先调查,再动手(停点)

读 vendor 与 zed GPUI 源码(只读),查清外观 API、关闭窗口 API 和线程模型。写方案后用 `orca orchestration ask` 汇报:napi 签名、补丁还是 crates/native、风险。等 reply 再实现。

## 验收

- Rust:themeMode 的读写与兼容测试(旧文件、未知值、往返);外观 observer 的注册、基线、变化、注销,覆盖方式参考 F1 的 activation 测试。
- TS:订阅/注销行为测试;关闭守卫在 dirty 时否决,`close()` 不被否决。每项做变异。
- 真实窗口:切换系统外观(只读取,由协调者代为在系统设置中切换,你提出请求即可),观察回调值;关闭流程用你自己的 demo 窗口验证。桌面时段先 ask。
- 文档:`docs/research/gpuix-main-build.md` 补丁清单与验证;`platform` README;LESSONS 视需要。
- 按 `common.md` 自审,`merge_ready`。
