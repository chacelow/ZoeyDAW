# gpuix UI 地图

由 `node scripts/gpuix-ui-map.mjs` 从 `apps/gpuix/src` 生成，不要手改；`--check` 在地图过期时失败（`pnpm verify:gpuix` 会运行它）。用途：自动化与验收时查入口、环境开关和稳定 `testId`。

## 路由

- `home`
- `project`
- `not-found`

主应用入口用 `ZOEYDAW_ROUTE`（例如 `/project/<id>`）指定初始路由。

## 窗口入口

在 `apps/gpuix` 下运行 `bun --hot <入口>`。「后台启动」为「是」的入口支持 `GPUIX_BACKGROUND=1`（不抢焦点，见 `docs/agents/setup.md`）。

| 入口 | 后台启动 | 环境开关 |
| --- | --- | --- |
| `src/app/verification/design-surfaces.tsx` | 是 | `T1_APPEARANCE`、`T1_SURFACE` |
| `src/gallery/controls.tsx` | 是 | `GALLERY_APPEARANCE`、`GALLERY_LOCALE` |
| `src/main.tsx` | 是 | `NODE_ENV`、`ZOEYDAW_ROUTE` |
| `src/project/sections/arrangement/lane/demo/index.tsx` | 是 | `LANE_LOCALE`、`LANE_STRESS`、`LANE_THEME` |
| `src/project/sections/arrangement/tracks/demo.tsx` | 是 | `TRACK_LANGUAGE`、`TRACK_THEME` |
| `src/project/sections/clip-edit/demo/index.tsx` | 是 | `CLIP_EDIT_LOCALE`、`CLIP_EDIT_STRESS`、`CLIP_EDIT_THEME` |
| `src/project/sections/footer/demo.tsx` | 是 | `B2_APPEARANCE`、`B2_BPM`、`B2_LANGUAGE`、`B2_RECORDING` |
| `src/shared/theme/demo.tsx` | 是 | — |
| `src/ui/panels/gallery.tsx` | 是 | — |

## 稳定 testId（按所属区域）

以 `…` 结尾的是模板 id，后半段在运行时拼接（通常是实体 id 或序号）。demo 与 verification 夹具的 id 不列入。

### `app/AppShell.tsx`

`app-frame`

### `app/home`

`home-create`、`home-open`、`home-page`、`recent-…`

### `app/project`

`arrangement-panel`、`browser-divider`、`browser-panel`、`clip-panel`、`project-layout`、`project-main`、`project-workspace`、`workspace-panel`

### `app/router`

`not-found-page`、`route-error`

### `app/settings`

`language-…`、`settings-dialog`、`theme-mode-…`、`theme-preset-…`、`theme-preset-scroll`

### `app/shell`

`titlebar`、`titlebar-settings`

### `app/window`

`unsaved-cancel`、`unsaved-close`、`unsaved-discard`、`unsaved-save`

### `gallery/GalleryDemo.tsx`

`gallery-design-…`、`gallery-design-toolbar`、`gallery-toggle-appearance`、`gallery-toggle-locale`

### `gallery/GalleryExamples.tsx`

`gallery-…`、`gallery-drag-preview`、`gallery-list-row-…`、`gallery-project-card`、`gallery-project-section`、`gallery-scroll`

### `gallery/GalleryMenus.tsx`

`gallery-context-row`、`gallery-dropdown`、`gallery-menu`、`gallery-popover`、`gallery-popup`、`gallery-popup-number`

### `gallery/states.tsx`

`gallery-bar`、`gallery-bipolar`、`gallery-body-scroll`、`gallery-button`、`gallery-default-toolbar`、`gallery-feedback-card`、`gallery-forms-card`、`gallery-icon`、`gallery-icon-free`、`gallery-input`、`gallery-input-shell`、`gallery-list-card`、`gallery-menu-card`、`gallery-number`、`gallery-numeric-card`、`gallery-pan`、`gallery-panel-card`、`gallery-root`、`gallery-transport-icon`、`gallery-transport-number`、`gallery-transport-toolbar`

### `project/sections/arrangement/lane`

`automation-…`、`automation-point-…`、`automation-value-editor`、`clip-alignment`、`clip-name-editor`、`fade-…`、`fade-mask-…`、`group-clip-…`、`insertion-point`、`lane-row-…`、`lane-row-content-…`、`transport-playhead`、`waveform-…`

### `project/sections/arrangement/timeline`

`arrangement-timeline`、`marker-name-editor`、`minimap-clip-…`、`minimap-frame`、`minimap-marker-…`、`minimap-playhead`、`minimap-track-…`、`ruler-loop`、`ruler-marker-…`、`ruler-position-…`、`timeline-grid`、`timeline-grid-choice`、`timeline-horizontal-scroll`、`timeline-layout`、`timeline-minimap`、`timeline-rulers`、`timeline-save`、`timeline-time-ruler`、`timeline-toolbar`、`timeline-viewport`

### `project/sections/arrangement/tracks`

`track-actions-…`、`track-arm-…`、`track-arm-space-…`、`track-automation-…`、`track-color-…`、`track-cue-output-…`、`track-cue-volume-…`、`track-delete-…`、`track-drop-target-…`、`track-enabled-…`、`track-fold-…`、`track-group-frame-…`、`track-identity-…`、`track-input-…`、`track-input-channel-…`、`track-label-…`、`track-lane-…`、`track-menu-…`、`track-meter-…`、`track-meter-floor-…`、`track-meter-peak-…`、`track-meter-zero-…`、`track-mixer-…`、`track-monitor-…`、`track-name-…`、`track-output-…`、`track-output-channel-…`、`track-pan-…`、`track-pinned-viewport`、`track-position-…`、`track-post-…`、`track-rail-…`、`track-rails-…`、`track-rename-…`、`track-resize-…`、`track-routing-…`、`track-row-…`、`track-rows`、`track-scrollable-viewport`、`track-send-…`、`track-sends-…`、`track-solo-…`、`track-title-…`、`track-volume-…`

### `project/sections/browser`

`browser-entry-…`、`browser-favorite-…`、`browser-navigation-divider`、`browser-navigation-panel`、`browser-panel`、`browser-reset-filters`、`browser-results`、`browser-results-panel`、`browser-search`、`browser-source-…`、`browser-split`

### `project/sections/clip-edit`

`audio-…`、`audio-editor`、`audio-loop`、`audio-loop-range`、`audio-marker-…`、`audio-overview`、`audio-overview-frame`、`audio-parameters`、`audio-peaks`、`audio-reverse`、`audio-selection`、`audio-surface`、`audio-warp`、`audio-warp-mode`、`audio-waveform`、`clip-editor`、`clip-name`、`midi-body`、`midi-editor`、`midi-grid`、`midi-key-…`、`midi-keys`、`midi-loop-bars`、`midi-marquee`、`midi-note-…`、`midi-note-row-…`、`midi-ruler`、`midi-toolbar`、`midi-velocity`、`midi-velocity-…`、`midi-velocity-value`、`pattern-editor`、`pattern-horizontal-scroll`、`pattern-step-…`、`pattern-steps`

### `project/sections/footer`

`device-…`、`device-add`、`device-add-…`、`device-handle-…`、`footer-content`、`footer-divider`

### `project/sections/status`

`status-clip`、`status-devices`、`status-info`、`status-toggle-footer`

### `project/sections/transport`

`transport-bar-length`、`transport-bpm`、`transport-center`、`transport-engine`、`transport-left`、`transport-play`、`transport-record`、`transport-right`、`transport-scale-mode`、`transport-scroll`、`transport-stop`

### `ui/controls`

`drag-preview`、`drag-source-…`、`motion-tab-…`、`motion-tabs-indicator`、`settings-nav-…`

### `ui/panels`

`arrangement-panel`、`arrangement-shell`、`browser-columns`、`browser-divider`、`browser-panel`、`browser-shell`、`clip-divider`、`clip-panel`、`device-divider`、`device-panel`、`fixed-results`、`main-group`、`main-panel`、`navigation-panel`、`results-panel`、`top-group`

## 已知限制

- 后台窗口截图可能全黑；AX 输入可能报 `BackgroundUnavailable`。遇到时把对应项标为未验证，不切前台。真实桌面验收另行串行进行。
- held pressed 无法在真实窗口中保持 mouseDown 截图，由原生状态测试覆盖。
