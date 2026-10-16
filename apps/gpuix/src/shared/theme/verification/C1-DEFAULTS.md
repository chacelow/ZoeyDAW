# C1 默认值逐字段核对

原始参照：`a4a9d11c927e71ea69ab8299d89d29fe996ba03b`。旧设计对象、度量 JSON 和预设从 Git 原文件加载，新增来源按原消费者表达式求值。此表验证默认值忠实迁移，不替代实际消费者回归。

复跑：`bun apps/gpuix/src/shared/theme/verification/defaults-audit/index.ts a4a9d11c927e71ea69ab8299d89d29fe996ba03b apps/gpuix/src/shared/theme/verification/C1-DEFAULTS.md`。

| 字段 | 原表达式 | 原值 | 新默认值 | 一致 |
| --- | --- | --- | --- | --- |
| `design.colorRecipes.contentPaperTint` | `shared/theme/content-color.ts CLIP_PAPER_TINT = 32` | 32 | 32 | 一致 |
| `design.colorRecipes.editorShell` | `shared/theme/colors.ts colorMix(base.muted, 30, base.background)` | 30 | 30 | 一致 |
| `design.colorRecipes.canvasScrollbar` | `shared/theme/colors.ts colorMix(base.foreground, 10, 'transparent')` | 10 | 10 | 一致 |
| `design.colorRecipes.canvasScrollbarHover` | `shared/theme/colors.ts colorMix(base.foreground, 18, 'transparent')` | 18 | 18 | 一致 |
| `design.colorRecipes.canvasScrollbarActive` | `shared/theme/colors.ts colorMix(base.foreground, 26, 'transparent')` | 26 | 26 | 一致 |
| `design.colorRecipes.scrollbarTrack` | `shared/theme/colors.ts colorMix(base.foreground, 4, base.background)` | 4 | 4 | 一致 |
| `design.colorRecipes.arrangementSurfaceSelected` | `shared/theme/colors.ts colorMix(base.card, 78, base.foreground)` | 78 | 78 | 一致 |
| `design.colorRecipes.arrangementSurface` | `shared/theme/colors.ts colorMix(base.card, 86, base.foreground)` | 86 | 86 | 一致 |
| `design.colorRecipes.arrangementSurfaceAlt` | `shared/theme/colors.ts colorMix(base.card, 84, base.foreground)` | 84 | 84 | 一致 |
| `design.colorRecipes.arrangementFadeMask` | `shared/theme/colors.ts colorMix(arrangementClipInk, 50, 'transparent')` | 50 | 50 | 一致 |
| `design.colorRecipes.destructive.active.light` | `ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 20 : 10, 'transparent')` | 10 | 10 | 一致 |
| `design.colorRecipes.destructive.active.dark` | `ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 20 : 10, 'transparent')` | 20 | 20 | 一致 |
| `design.colorRecipes.destructive.highlight.light` | `ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 30 : 20, 'transparent')` | 20 | 20 | 一致 |
| `design.colorRecipes.destructive.highlight.dark` | `ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 30 : 20, 'transparent')` | 30 | 30 | 一致 |
| `design.colorRecipes.destructive.focusBorder` | `ui/controls/Button/index.tsx colorMix(destructive, 40, 'transparent')` | 40 | 40 | 一致 |
| `design.colorRecipes.destructive.focusOutline.light` | `ui/controls/Button/index.tsx outlineColor: colorMix(destructive, appearance === 'dark' ? 40 : 20, 'transparent')` | 20 | 20 | 一致 |
| `design.colorRecipes.destructive.focusOutline.dark` | `ui/controls/Button/index.tsx outlineColor: colorMix(destructive, appearance === 'dark' ? 40 : 20, 'transparent')` | 40 | 40 | 一致 |
| `design.colorRecipes.listRowHover` | `ui/controls/ListRow/index.tsx colorMix(theme.colors.muted, 90, theme.colors.foreground)` | 90 | 90 | 一致 |
| `design.colorRecipes.dialogBackdrop` | `app/dialog/ModalDialog.tsx colorMix(theme.colors.foreground, 10, 'transparent')` | 10 | 10 | 一致 |
| `design.colorRecipes.editor.overviewViewport` | `project/sections/clip-edit/audio/AudioWaveformOverview.tsx colorMix(primary, 12, 'transparent')` | 12 | 12 | 一致 |
| `design.colorRecipes.editor.audioLoop` | `project/sections/clip-edit/audio/AudioWaveformRulers.tsx colorMix(primary, 45, 'transparent')` | 45 | 45 | 一致 |
| `design.colorRecipes.editor.markerHover` | `project/sections/clip-edit/audio/SourceMarker.tsx colorMix(primary, 30, 'transparent')` | 30 | 30 | 一致 |
| `design.colorRecipes.editor.marquee` | `project/sections/clip-edit/midi/NoteGrid.tsx colorMix(primary, 20, 'transparent')` | 20 | 20 | 一致 |
| `design.colorRecipes.editor.pianoIvoryDark` | `project/sections/clip-edit/midi/PianoKeys.tsx colorMix(foreground, 75, background)` | 75 | 75 | 一致 |
| `design.colorRecipes.editor.pianoEbony` | `project/sections/clip-edit/midi/PianoKeys.tsx dark ? colorMix(background, 80, foreground) : colorMix(foreground, 80, background)` | 80 | 80 | 一致 |
| `design.colorRecipes.editor.velocityNoteBorder` | `project/sections/clip-edit/midi/note-paint.ts colorMix(color, 60, colors.background)` | 60 | 60 | 一致 |
| `design.colorRecipes.editor.velocitySelected.base` | `project/sections/clip-edit/midi/note-paint.ts 55 + (note.velocity / 127) * 45` | 55 | 55 | 一致 |
| `design.colorRecipes.editor.velocitySelected.range` | `project/sections/clip-edit/midi/note-paint.ts 55 + (note.velocity / 127) * 45` | 45 | 45 | 一致 |
| `design.colorRecipes.editor.velocityUnselected.base` | `project/sections/clip-edit/midi/note-paint.ts 35 + (note.velocity / 127) * 65` | 35 | 35 | 一致 |
| `design.colorRecipes.editor.velocityUnselected.range` | `project/sections/clip-edit/midi/note-paint.ts 35 + (note.velocity / 127) * 65` | 65 | 65 | 一致 |
| `design.colorRecipes.aliases.arrangementLine.light` | `shared/theme/colors.ts lightDark(base.border, base.muted) light` | "border" | "border" | 一致 |
| `design.colorRecipes.aliases.arrangementLine.dark` | `shared/theme/colors.ts lightDark(base.border, base.muted) dark` | "muted" | "muted" | 一致 |
| `design.colorRecipes.aliases.arrangementAutomation` | `shared/theme/colors.ts arrangementAutomation: base.destructive` | "destructive" | "destructive" | 一致 |
| `design.colorRecipes.aliases.arrangementVolume` | `shared/theme/colors.ts arrangementVolume: base.chart2` | "chart2" | "chart2" | 一致 |
| `design.colorRecipes.aliases.arrangementMeterGood` | `shared/theme/colors.ts arrangementMeterGood: base.chart2` | "chart2" | "chart2" | 一致 |
| `design.colorRecipes.aliases.arrangementMeterWarn.light` | `shared/theme/colors.ts lightDark(base.chart4, base.chart3) light` | "chart4" | "chart4" | 一致 |
| `design.colorRecipes.aliases.arrangementMeterWarn.dark` | `shared/theme/colors.ts lightDark(base.chart4, base.chart3) dark` | "chart3" | "chart3" | 一致 |
| `design.colorRecipes.aliases.arrangementMeterDanger` | `shared/theme/colors.ts arrangementMeterDanger: base.destructive` | "destructive" | "destructive" | 一致 |
| `design.colorRecipes.aliases.arrangementMeterPeak` | `shared/theme/colors.ts arrangementMeterPeak: base.mutedForeground` | "mutedForeground" | "mutedForeground" | 一致 |
| `design.colorRecipes.aliases.arrangementClipInk.light` | `shared/theme/colors.ts lightDark(base.foreground, base.card) light` | "foreground" | "foreground" | 一致 |
| `design.colorRecipes.aliases.arrangementClipInk.dark` | `shared/theme/colors.ts lightDark(base.foreground, base.card) dark` | "card" | "card" | 一致 |
| `design.typography.numberFontFamily` | `原 design.typography.numberFontFamily` | "Menlo" | "Menlo" | 一致 |
| `design.typography.weights.medium` | `app/home/HomePage.tsx fontWeight: 500` | 500 | 500 | 一致 |
| `design.typography.weights.semibold` | `ui/controls/Card/index.tsx fontWeight: 600` | 600 | 600 | 一致 |
| `design.shape.controlRadius` | `原 design.shape.controlRadius` | 3 | 3 | 一致 |
| `design.shape.controlBorderWidth` | `原 design.shape.controlBorderWidth` | 1 | 1 | 一致 |
| `design.shape.toggleRadius` | `原 design.shape.toggleRadius` | 2 | 2 | 一致 |
| `design.shape.listRowRadius` | `原 design.shape.listRowRadius` | 0 | 0 | 一致 |
| `design.shape.cardBorderWidth` | `原 design.shape.cardBorderWidth` | 1 | 1 | 一致 |
| `design.shape.panelRadius` | `原 design.shape.panelRadius` | 7 | 7 | 一致 |
| `design.shape.separatorWidth` | `ui/controls/Separator/index.tsx width: 1` | 1 | 1 | 一致 |
| `design.shape.panelBorderWidth` | `原 design.shape.panelBorderWidth` | 2 | 2 | 一致 |
| `design.shape.focusRingWidth` | `原 design.shape.focusRingWidth` | 1 | 1 | 一致 |
| `design.shape.indicatorStrokeWidth` | `原 design.shape.indicatorStrokeWidth` | 1 | 1 | 一致 |
| `design.shape.indicatorRadius` | `原 design.shape.indicatorRadius` | 6.5 | 6.5 | 一致 |
| `design.input.paddingInline` | `原 design.input.paddingInline` | 6 | 6 | 一致 |
| `design.cards.default.radius` | `原 design.cards.default.radius` | 8 | 8 | 一致 |
| `design.cards.default.inset` | `原 design.cards.default.inset` | 16 | 16 | 一致 |
| `design.cards.default.gap` | `原 design.cards.default.gap` | 16 | 16 | 一致 |
| `design.cards.default.headerGap` | `原 design.cards.default.headerGap` | 2 | 2 | 一致 |
| `design.cards.default.contentGap` | `原 design.cards.default.contentGap` | 0 | 0 | 一致 |
| `design.cards.default.insetOwner` | `原 design.cards.default.insetOwner` | "parts" | "parts" | 一致 |
| `design.cards.default.hover` | `原 design.cards.default.hover` | "none" | "none" | 一致 |
| `design.cards.sm.radius` | `原 design.cards.sm.radius` | 6 | 6 | 一致 |
| `design.cards.sm.inset` | `原 design.cards.sm.inset` | 12 | 12 | 一致 |
| `design.cards.sm.gap` | `原 design.cards.sm.gap` | 12 | 12 | 一致 |
| `design.cards.sm.headerGap` | `原 design.cards.sm.headerGap` | 2 | 2 | 一致 |
| `design.cards.sm.contentGap` | `原 design.cards.sm.contentGap` | 0 | 0 | 一致 |
| `design.cards.sm.insetOwner` | `原 design.cards.sm.insetOwner` | "parts" | "parts" | 一致 |
| `design.cards.sm.hover` | `原 design.cards.sm.hover` | "none" | "none" | 一致 |
| `design.cards.controls.radius` | `原 design.cards.controls.radius` | 1 | 1 | 一致 |
| `design.cards.controls.inset` | `原 design.cards.controls.inset` | 4 | 4 | 一致 |
| `design.cards.controls.gap` | `原 design.cards.controls.gap` | 4 | 4 | 一致 |
| `design.cards.controls.headerGap` | `原 design.cards.controls.headerGap` | 2 | 2 | 一致 |
| `design.cards.controls.contentGap` | `原 design.cards.controls.contentGap` | 4 | 4 | 一致 |
| `design.cards.controls.insetOwner` | `原 design.cards.controls.insetOwner` | "parts" | "parts" | 一致 |
| `design.cards.controls.hover` | `原 design.cards.controls.hover` | "none" | "none" | 一致 |
| `design.cards.project.radius` | `原 design.cards.project.radius` | 6 | 6 | 一致 |
| `design.cards.project.inset` | `原 design.cards.project.inset` | 12 | 12 | 一致 |
| `design.cards.project.gap` | `原 design.cards.project.gap` | 4 | 4 | 一致 |
| `design.cards.project.headerGap` | `原 design.cards.project.headerGap` | 2 | 2 | 一致 |
| `design.cards.project.contentGap` | `原 design.cards.project.contentGap` | 4 | 4 | 一致 |
| `design.cards.project.insetOwner` | `原 design.cards.project.insetOwner` | "shell" | "shell" | 一致 |
| `design.cards.project.hover` | `原 design.cards.project.hover` | "accent" | "accent" | 一致 |
| `design.spacing.rootInset` | `原 design.spacing.rootInset` | 7 | 7 | 一致 |
| `design.spacing.cardGroupGap` | `原 design.spacing.cardGroupGap` | 7 | 7 | 一致 |
| `design.spacing.stackGap` | `原 design.spacing.stackGap` | 4 | 4 | 一致 |
| `design.spacing.joinedGroupGap` | `原 design.spacing.joinedGroupGap` | 0 | 0 | 一致 |
| `design.spacing.toolbarGap.default` | `原 design.spacing.toolbarGap.default` | 2 | 2 | 一致 |
| `design.spacing.toolbarGap.transport` | `原 design.spacing.toolbarGap.transport` | 3 | 3 | 一致 |
| `design.menu.radius` | `原 design.menu.radius` | 4 | 4 | 一致 |
| `design.menu.borderWidth` | `原 design.menu.borderWidth` | 1 | 1 | 一致 |
| `design.menu.inset` | `原 design.menu.inset` | 4 | 4 | 一致 |
| `design.menu.labelInset` | `原 design.menu.labelInset` | 6 | 6 | 一致 |
| `design.menu.maxWidth` | `ui/controls/DropdownButton/index.tsx maxWidth: 320` | 320 | 320 | 一致 |
| `design.menu.maxHeight` | `ui/controls/DropdownButton/index.tsx maxHeight: 300` | 300 | 300 | 一致 |
| `design.menu.width` | `ui/controls/Menu/content.tsx theme.control['--spacing-control-track'] * 10` | 130 | 130 | 一致 |
| `design.menu.dropdownSeparatorInset` | `ui/controls/DropdownButton/index.tsx marginTop/marginBottom: 3` | 3 | 3 | 一致 |
| `design.menu.contextSeparatorInset` | `ui/controls/Menu/index.tsx marginTop/marginBottom: 4` | 4 | 4 | 一致 |
| `design.popover.radius` | `原 design.popover.radius` | 4 | 4 | 一致 |
| `design.popover.borderWidth` | `原 design.popover.borderWidth` | 1 | 1 | 一致 |
| `design.popover.inset` | `原 design.popover.inset` | 8 | 8 | 一致 |
| `design.popover.gap` | `原 design.popover.gap` | 6 | 6 | 一致 |
| `design.popover.headerGap` | `原 design.popover.headerGap` | 4 | 4 | 一致 |
| `design.popover.width` | `ui/controls/Popover/index.tsx theme.control['--spacing-control-track'] * 12` | 156 | 156 | 一致 |
| `design.settings.shellWidth` | `ui/controls/SettingsShell/index.tsx width: 720` | 720 | 720 | 一致 |
| `design.settings.shellHeight` | `ui/controls/SettingsShell/index.tsx height: 520` | 520 | 520 | 一致 |
| `design.settings.navigationWidth` | `ui/controls/SettingsShell/index.tsx navigationWidth = 168` | 168 | 168 | 一致 |
| `design.settings.presetGrid.columnWidth` | `app/settings/ThemePresetGrid.tsx theme.project.identityWidth * 2` | 200 | 200 | 一致 |
| `design.settings.presetGrid.swatchHeight` | `app/settings/ThemePresetGrid.tsx theme.control['--spacing-control-track'] * 2` | 26 | 26 | 一致 |
| `design.settings.presetGrid.scrollHeight` | `app/settings/ThemePresetGrid.tsx theme.project.defaultTrackHeight * 4` | 280 | 280 | 一致 |
| `design.settings.paddingInline` | `原 design.settings.paddingInline` | 8 | 8 | 一致 |
| `design.settings.itemGap` | `原 design.settings.itemGap` | 6 | 6 | 一致 |
| `design.settings.headerGap` | `原 design.settings.headerGap` | 8 | 8 | 一致 |
| `design.settings.headerInset` | `原 design.settings.headerInset` | 12 | 12 | 一致 |
| `design.settings.headerTextGap` | `原 design.settings.headerTextGap` | 4 | 4 | 一致 |
| `design.settings.navigationGap` | `原 design.settings.navigationGap` | 2 | 2 | 一致 |
| `design.settings.navigationInset` | `原 design.settings.navigationInset` | 8 | 8 | 一致 |
| `design.settings.contentInset` | `原 design.settings.contentInset` | 16 | 16 | 一致 |
| `design.tabs.width` | `ui/controls/MotionTabs/index.tsx tabWidth = 120` | 120 | 120 | 一致 |
| `design.tabs.itemGap` | `原 design.tabs.itemGap` | 4 | 4 | 一致 |
| `design.tabs.contentGap` | `原 design.tabs.contentGap` | 8 | 8 | 一致 |
| `design.tabs.footerRadius` | `project/sections/footer/index.tsx borderRadius: 0` | 0 | 0 | 一致 |
| `design.tabs.footerJoinedGroupGap` | `project/sections/footer/index.tsx gap: 0` | 0 | 0 | 一致 |
| `design.overlay.sideOffset` | `ui/controls/Popover/index.tsx sideOffset = 4` | 4 | 4 | 一致 |
| `design.overlay.collisionPadding` | `ui/controls/Popover/index.tsx collisionPadding = 8` | 8 | 8 | 一致 |
| `design.dragPreview.maxWidth` | `ui/controls/DragPreviewArea/index.tsx maxWidth: 320` | 320 | 320 | 一致 |
| `design.dragPreview.gap` | `ui/controls/DragPreviewArea/index.tsx gap: 8` | 8 | 8 | 一致 |
| `design.dragPreview.opacity` | `ui/controls/DragPreviewArea/index.tsx opacity: 0.85` | 0.85 | 0.85 | 一致 |
| `design.dragPreview.pointerOffset.x` | `ui/controls/DragPreviewArea/index.tsx offset={{ x: 12, y: 12 }}.x` | 12 | 12 | 一致 |
| `design.dragPreview.pointerOffset.y` | `ui/controls/DragPreviewArea/index.tsx offset={{ x: 12, y: 12 }}.y` | 12 | 12 | 一致 |
| `design.toast.edgeInset` | `ui/controls/Toaster/index.tsx top/bottom/left/right: gap * 3` | 12 | 12 | 一致 |
| `design.toast.stackGap` | `ui/controls/Toaster/index.tsx gap: gap * 2` | 8 | 8 | 一致 |
| `design.toast.inset` | `ui/controls/Toaster/index.tsx padding: gap * 3` | 12 | 12 | 一致 |
| `design.toast.radius` | `ui/controls/Toaster/index.tsx borderRadius: gap * 2` | 8 | 8 | 一致 |
| `design.toast.width` | `ui/controls/Toaster/index.tsx width: theme.project.controlsWidth` | 304 | 304 | 一致 |
| `design.empty.gap` | `ui/controls/Empty/index.tsx gap * 4` | 16 | 16 | 一致 |
| `design.empty.inset` | `ui/controls/Empty/index.tsx gap * 6` | 24 | 24 | 一致 |
| `design.empty.radius` | `ui/controls/Empty/index.tsx gap * 3` | 12 | 12 | 一致 |
| `design.empty.contentGap` | `ui/controls/Empty/index.tsx theme.control['--spacing-control-track-gap'] * 2` | 8 | 8 | 一致 |
| `design.empty.headerMaxWidth` | `ui/controls/Empty/index.tsx theme.project.controlsWidth` | 304 | 304 | 一致 |
| `design.loading.gap` | `ui/controls/Loading/index.tsx gap * 3` | 12 | 12 | 一致 |
| `design.loading.brandWidth` | `ui/controls/Loading/index.tsx theme.control['--spacing-control-icon'] * 6` | 60 | 60 | 一致 |
| `design.loading.brandHeight` | `ui/controls/Loading/index.tsx theme.control['--spacing-control-track'] * 3` | 39 | 39 | 一致 |
| `design.loading.progressWidth` | `ui/controls/Loading/index.tsx theme.project.controlsWidth` | 304 | 304 | 一致 |
| `design.states.disabledOpacity` | `ui/controls/chrome.ts opacity: 0.5` | 0.5 | 0.5 | 一致 |
| `design.states.dragSourceOpacity` | `ui/controls/DragPreviewArea/index.tsx dragging opacity: 0.4` | 0.4 | 0.4 | 一致 |
| `design.states.deviceDragSourceOpacity` | `project/sections/footer/EffectChain/DeviceCard/index.tsx dragging ? 0.5 : 1` | 0.5 | 0.5 | 一致 |
| `design.feedback.maxWidth` | `ui/controls/LoadErrorScreen/index.tsx maxWidth: theme.project.controlsWidth` | 304 | 304 | 一致 |
| `design.feedback.gap` | `ui/controls/LoadErrorScreen/index.tsx gap: gap * 3` | 12 | 12 | 一致 |
| `design.feedback.inset` | `ui/controls/LoadErrorScreen/index.tsx padding: gap * 6` | 24 | 24 | 一致 |
| `design.feedback.actionGap` | `ui/controls/LoadErrorScreen/index.tsx gap: gap * 2` | 8 | 8 | 一致 |
| `design.dialog.confirmationWidth` | `app/window/UnsavedCloseDialog.tsx width: theme.project.controlsWidth` | 304 | 304 | 一致 |
| `design.editor.dividerStrokeWidth` | `project/sections/clip-edit/audio/AudioWaveformRulers.tsx borderBottomWidth: 1` | 1 | 1 | 一致 |
| `design.editor.loopStrokeWidth` | `project/sections/clip-edit/midi/MidiRuler.tsx borderWidth: 1` | 1 | 1 | 一致 |
| `design.editor.selectionStrokeWidth` | `project/sections/clip-edit/audio/AudioWaveformOverview.tsx borderWidth: 1` | 1 | 1 | 一致 |
| `design.editor.gridMinorStrokeWidth` | `project/sections/arrangement/core/rulers/grid-quads.ts minor width: 1` | 1 | 1 | 一致 |
| `design.editor.fadeStrokeWidth` | `project/sections/arrangement/lane/ClipFades/index.tsx strokeWidth: 1` | 1 | 1 | 一致 |
| `design.editor.playheadLineWidth` | `project/sections/arrangement/timeline/minimap/Playhead.tsx width: 1` | 1 | 1 | 一致 |
| `design.editor.insertionLineWidth` | `project/sections/arrangement/lane/LaneOverlay/index.tsx width: 1` | 1 | 1 | 一致 |
| `design.editor.selectionLineWidth` | `project/sections/arrangement/lane/LaneOverlay/index.tsx width: 1` | 1 | 1 | 一致 |
| `design.editor.markerLineWidth` | `project/sections/clip-edit/audio/SourceMarker.tsx width: 1` | 1 | 1 | 一致 |
| `design.editor.loopLineWidth` | `project/sections/clip-edit/midi/MidiRuler.tsx width: 1` | 1 | 1 | 一致 |
| `design.editor.velocityLineWidth` | `project/sections/clip-edit/midi/VelocityLane.tsx width: 1` | 1 | 1 | 一致 |
| `design.editor.waveformAxisOpacity` | `project/sections/clip-edit/audio/AudioWaveformLayer.tsx opacity: 0.4` | 0.4 | 0.4 | 一致 |
| `design.editor.clipGhostOpacity` | `project/sections/arrangement/lane/ClipCard.tsx card.ghost ? 0.5 : 1` | 0.5 | 0.5 | 一致 |
| `design.editor.rangeOpacity` | `project/sections/arrangement/lane/LaneRow/Contents.tsx opacity: 0.5` | 0.5 | 0.5 | 一致 |
| `design.editor.groupClipPreviewOpacity` | `project/sections/arrangement/lane/LaneRow/Contents.tsx opacity: 0.85` | 0.85 | 0.85 | 一致 |
| `design.editor.drawPreviewOpacity` | `project/sections/arrangement/lane/LaneRow/Contents.tsx opacity: 0.2` | 0.2 | 0.2 | 一致 |
| `design.editor.clipLoopShadeOpacity` | `project/sections/arrangement/lane/ClipContents.tsx opacity: 0.1` | 0.1 | 0.1 | 一致 |
| `design.editor.midiLoopOpacity` | `project/sections/clip-edit/midi/MidiRuler.tsx opacity: 0.35` | 0.35 | 0.35 | 一致 |
| `design.editor.clipBodySelectedOpacity` | `project/sections/arrangement/lane/ClipContents.tsx card.selected ? 0.9 : automationMode ? 0.25 : 0.55` | 0.9 | 0.9 | 一致 |
| `design.editor.clipBodyAutomationOpacity` | `project/sections/arrangement/lane/ClipContents.tsx automationMode ? 0.25 : 0.55` | 0.25 | 0.25 | 一致 |
| `design.editor.clipBodyOpacity` | `project/sections/arrangement/lane/ClipContents.tsx card.selected ? 0.9 : automationMode ? 0.25 : 0.55` | 0.55 | 0.55 | 一致 |
| `design.editor.clipGridHoveredOpacity` | `project/sections/arrangement/lane/ClipContents.tsx card.hovered ? 0.3 : 0.4` | 0.3 | 0.3 | 一致 |
| `design.editor.clipGridOpacity` | `project/sections/arrangement/lane/ClipContents.tsx card.hovered ? 0.3 : 0.4` | 0.4 | 0.4 | 一致 |
| `design.editor.clipAutomationPreviewOpacity` | `project/sections/arrangement/lane/ClipContents.tsx automationMode ? 0.4 : 1` | 0.4 | 0.4 | 一致 |
| `design.editor.inlineRadius` | `project/sections/arrangement/lane/interactions/automation/ValueEditor/index.tsx borderRadius: 0` | 0 | 0 | 一致 |
| `design.editor.noteInset` | `project/sections/clip-edit/midi/note-paint.ts note top + 1 / bottom - 1` | 1 | 1 | 一致 |
| `design.editor.meter.channelGap` | `project/sections/arrangement/tracks/meter/TrackMeter.tsx Math.floor((width - 1) / 2); channelWidth + 1` | 1 | 1 | 一致 |
| `design.editor.meter.peakWidth` | `project/sections/arrangement/tracks/meter/TrackMeter.tsx peak style height: 1` | 1 | 1 | 一致 |
| `design.editor.meter.zeroWidth` | `project/sections/arrangement/tracks/meter/TrackMeter.tsx zero style height: 1` | 1 | 1 | 一致 |
| `design.editor.meter.warningStop` | `project/sections/arrangement/tracks/meter/TrackMeter.tsx position: 0.3` | 0.3 | 0.3 | 一致 |
| `design.dragPad.fillOpacity` | `ui/controls/DragPad/DragPadNumber.tsx opacity: 0.3` | 0.3 | 0.3 | 一致 |
| `design.dragPad.centerMarker.inset` | `ui/controls/DragPad/DragPadNumber.tsx top/bottom: 2` | 2 | 2 | 一致 |
| `design.dragPad.centerMarker.width` | `ui/controls/DragPad/DragPadNumber.tsx center style width: 1` | 1 | 1 | 一致 |
| `design.dragPad.caretWidth` | `ui/controls/DragPad/DragPadNumber.tsx edit-indicator style width: 1` | 1 | 1 | 一致 |
| `design.progress.indeterminateOpacity` | `ui/controls/Progress/index.tsx determinate ? 1 : 0.5` | 0.5 | 0.5 | 一致 |
| `design.progress.widthFraction` | `ui/controls/Progress/index.tsx indeterminate width '30%' normalized as 30 / 100` | 0.3 | 0.3 | 一致 |
| `design.motion.tabs.duration` | `ui/controls/MotionTabs/index.tsx transition duration: 0.16` | 0.16 | 0.16 | 一致 |
| `design.motion.tabs.easing` | `ui/controls/MotionTabs/index.tsx transition ease: 'easeOut'` | "easeOut" | "easeOut" | 一致 |
| `design.cursors.default` | `ui/controls/Menu/index.tsx unavailable ? 'default' : 'pointer'` | "default" | "default" | 一致 |
| `design.cursors.action` | `ui/controls/chrome.ts cursor: 'pointer'` | "pointer" | "pointer" | 一致 |
| `design.cursors.disabled` | `ui/controls/chrome.ts cursor: 'not-allowed'` | "not-allowed" | "not-allowed" | 一致 |
| `design.cursors.text` | `ui/controls/DragPad/DragPadNumber.tsx cursor: 'text'` | "text" | "text" | 一致 |
| `design.cursors.grab` | `ui/controls/DragPreviewArea/index.tsx idle cursor: 'grab'` | "grab" | "grab" | 一致 |
| `design.cursors.grabbing` | `ui/controls/DragPreviewArea/index.tsx dragging cursor: 'grabbing'` | "grabbing" | "grabbing" | 一致 |
| `design.cursors.verticalResize` | `project/sections/arrangement/tracks/TrackResizeOverlay/index.tsx cursor: 'ns-resize'` | "ns-resize" | "ns-resize" | 一致 |
| `design.cursors.horizontalResize` | `project/sections/clip-edit/audio/SourceMarker.tsx cursor: 'ew-resize'` | "ew-resize" | "ew-resize" | 一致 |
| `design.cursors.columnResize` | `ui/panels/Separator/index.tsx vertical ? 'col-resize' : 'row-resize'` | "col-resize" | "col-resize" | 一致 |
| `design.cursors.rowResize` | `ui/panels/Separator/index.tsx cursor: 'row-resize'` | "row-resize" | "row-resize" | 一致 |
| `design.cursors.automationDraw` | `project/sections/arrangement/lane/interactions/automation/gestures.ts cursor: 'crosshair'` | "crosshair" | "crosshair" | 一致 |
| `design.cursors.fadeCurve` | `project/sections/arrangement/lane/interactions/clip/fade.ts handle === 'curve' ? 'move' : 'ew-resize'` | "move" | "move" | 一致 |
| `design.icon.strokeWidth` | `ui/controls/Icon/index.tsx strokeWidth = 2` | 2 | 2 | 一致 |
| `layout.project.panels.browserDefaultSize` | `app/project/layout-constraints.ts PROJECT_LAYOUT.browserDefaultSize = '25%'` | "25%" | "25%" | 一致 |
| `layout.project.panels.browserMaxSize` | `app/project/layout-constraints.ts PROJECT_LAYOUT.browserMaxSize = '50%'` | "50%" | "50%" | 一致 |
| `layout.project.panels.arrangementMinWidth` | `app/project/layout-constraints.ts PROJECT_LAYOUT.arrangementMinWidth = '30%'` | "30%" | "30%" | 一致 |
| `layout.project.panels.clipDefaultSize` | `app/project/layout-constraints.ts PROJECT_LAYOUT.clipDefaultSize = '40%'` | "40%" | "40%" | 一致 |
| `layout.project.panels.clipMinSize` | `app/project/layout-constraints.ts PROJECT_LAYOUT.clipMinSize = '20%'` | "20%" | "20%" | 一致 |
| `layout.project.panels.clipMaxSize` | `app/project/layout-constraints.ts PROJECT_LAYOUT.clipMaxSize = '70%'` | "70%" | "70%" | 一致 |
| `layout.home.maxWidth` | `app/home/HomePage.tsx theme.project.controlsWidth * 3` | 912 | 912 | 一致 |
| `layout.home.recentCardWidth` | `app/home/HomePage.tsx theme.project.controlsWidth` | 304 | 304 | 一致 |
| `layout.gallery.cardWidth` | `gallery/GalleryCard.tsx theme.project.controlsWidth` | 304 | 304 | 一致 |
| `layout.gallery.settingsPreviewWidth` | `gallery/states.tsx theme.project.controlsWidth * 2` | 608 | 608 | 一致 |
| `layout.track.controlHeight` | `project/layout/track.ts CONTROL_METRICS.default['--spacing-control-track']` | 13 | 13 | 一致 |
| `layout.track.spacing` | `project/layout/track.ts CONTROL_METRICS.default['--spacing-control-track-gap']` | 4 | 4 | 一致 |
| `layout.track.border` | `project/layout/track.ts PROJECT_METRICS.trackBorder` | 2 | 2 | 一致 |
| `layout.track.titleHeight` | `project/layout/track.ts COLLAPSED_TRACK_HEIGHT - PROJECT_METRICS.trackBorder` | 21 | 21 | 一致 |
| `layout.track.collapsedHeight` | `project/layout/track.ts TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing * 2 + PROJECT_METRICS.trackBorder` | 23 | 23 | 一致 |
| `layout.track.defaultHeight` | `project/layout/track.ts PROJECT_METRICS.defaultTrackHeight` | 70 | 70 | 一致 |
| `layout.track.maxHeight` | `project/layout/track.ts DEFAULT_TRACK_HEIGHT * 4` | 280 | 280 | 一致 |
| `layout.track.resizeStep` | `project/layout/track.ts TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing` | 17 | 17 | 一致 |
| `layout.track.revealThreshold` | `project/layout/track.ts TRACK_RESIZE_STEP / 2` | 8.5 | 8.5 | 一致 |
| `layout.track.controlsWidth` | `shared/theme/metrics/control-metrics.json project.controlsWidth` | 304 | 304 | 一致 |
| `layout.arrangement.markerRulerHeight` | `project/sections/arrangement/core/layout.ts MARKER_RULER_HEIGHT = 17` | 17 | 17 | 一致 |
| `layout.arrangement.loopRulerHeight` | `project/sections/arrangement/core/layout.ts LOOP_RULER_HEIGHT = 17` | 17 | 17 | 一致 |
| `layout.arrangement.timeRulerHeight` | `project/sections/arrangement/core/layout.ts TIME_RULER_HEIGHT = 18` | 18 | 18 | 一致 |
| `layout.arrangement.barRulerHeight` | `project/sections/arrangement/core/layout.ts MARKER_RULER_HEIGHT + LOOP_RULER_HEIGHT` | 34 | 34 | 一致 |
| `layout.arrangement.minimapClipInset` | `project/sections/arrangement/timeline/minimap/Overview.tsx rowHeight - 1` | 1 | 1 | 一致 |
| `layout.arrangement.automationPointRadius` | `project/sections/arrangement/core/automation/geometry.ts AUTOMATION_POINT_RADIUS = 4` | 4 | 4 | 一致 |
| `layout.arrangement.rulerLabelSpacing.subdivision` | `project/sections/arrangement/core/rulers/grid-lines.ts RULER_LABEL_SPACING.subdivision = 38` | 38 | 38 | 一致 |
| `layout.arrangement.rulerLabelSpacing.beat` | `project/sections/arrangement/core/rulers/grid-lines.ts RULER_LABEL_SPACING.beat = 56` | 56 | 56 | 一致 |
| `layout.arrangement.rulerLabelSpacing.bar` | `project/sections/arrangement/core/rulers/grid-lines.ts RULER_LABEL_SPACING.bar = 56` | 56 | 56 | 一致 |
| `layout.arrangement.gridMinSubdivisionWidth` | `project/sections/arrangement/core/rulers/grid-lines.ts cellPx >= 2` | 2 | 2 | 一致 |
| `layout.arrangement.clip.minWidth` | `project/sections/arrangement/core/clip-geometry.ts Math.max(2, Math.round(rect.width))` | 2 | 2 | 一致 |
| `layout.arrangement.clip.minHeight` | `project/sections/arrangement/core/clip-geometry.ts Math.max(4, Math.round(rect.height - 2))` | 4 | 4 | 一致 |
| `layout.arrangement.clip.verticalInset` | `project/sections/arrangement/core/clip-geometry.ts Math.round(rect.top + 1)` | 1 | 1 | 一致 |
| `layout.arrangement.clip.bodyThresholdInset` | `project/sections/arrangement/core/clip-geometry.ts height <= TRACK_TITLE_HEIGHT + 4` | 4 | 4 | 一致 |
| `layout.arrangement.clip.fadeHandleMargin` | `project/sections/arrangement/core/clip-geometry.ts Math.min(3, geometry.width / 2)` | 3 | 3 | 一致 |
| `layout.arrangement.clip.nameEditorLeftInset` | `project/sections/arrangement/lane/interactions/clip/NameEditor/index.tsx Math.round(rect.left) + 1` | 1 | 1 | 一致 |
| `layout.arrangement.clip.nameEditorRightInset` | `project/sections/arrangement/lane/interactions/clip/NameEditor/index.tsx rect.left + rect.width - left - 2` | 2 | 2 | 一致 |
| `layout.arrangement.hit.clipResizeEdge` | `project/sections/arrangement/core/clip-geometry.ts RESIZE_EDGE_PX = 6` | 6 | 6 | 一致 |
| `layout.arrangement.hit.clipFadeHandle` | `project/sections/arrangement/core/clip-geometry.ts FADE_HANDLE_PX = 7` | 7 | 7 | 一致 |
| `layout.arrangement.hit.automationPointX` | `project/sections/arrangement/core/automation/hit.ts Math.abs(pointer.x - automationX(...)) <= 6` | 6 | 6 | 一致 |
| `layout.arrangement.hit.automationPointY` | `project/sections/arrangement/core/automation/hit.ts Math.abs(pointer.y - automationY(...)) <= 7` | 7 | 7 | 一致 |
| `layout.arrangement.hit.automationSegmentMax` | `project/sections/arrangement/core/automation/hit.ts Math.min(14, row.valueHeight / 8)` | 14 | 14 | 一致 |
| `layout.arrangement.hit.automationSegmentHeightFraction` | `project/sections/arrangement/core/automation/hit.ts row.valueHeight / 8` | 0.125 | 0.125 | 一致 |
| `layout.arrangement.hit.automationNear` | `project/sections/arrangement/core/automation/hit.ts distance > 4; onLine: distance <= 4` | 4 | 4 | 一致 |
| `layout.arrangement.hit.rulerMarker` | `project/sections/arrangement/core/rulers/geometry.ts let distance = 9` | 9 | 9 | 一致 |
| `layout.arrangement.hit.rulerLoopEdge` | `project/sections/arrangement/core/rulers/geometry.ts Math.abs(x - edge) <= 5` | 5 | 5 | 一致 |
| `control.--spacing-control-track` | `原 control.--spacing-control-track` | 13 | 13 | 一致 |
| `control.--spacing-control-track-gap` | `原 control.--spacing-control-track-gap` | 4 | 4 | 一致 |
| `control.--spacing-control-track-pad` | `原 control.--spacing-control-track-pad` | 1.5 | 1.5 | 一致 |
| `control.--spacing-control-gap` | `原 control.--spacing-control-gap` | 2 | 2 | 一致 |
| `control.--spacing-control-icon-slot` | `原 control.--spacing-control-icon-slot` | 10 | 10 | 一致 |
| `control.--spacing-control-icon` | `原 control.--spacing-control-icon` | 10 | 10 | 一致 |
| `control.--text-control-track` | `原 control.--text-control-track` | 9 | 9 | 一致 |
| `transportControl.--spacing-control-track` | `原 transportControl.--spacing-control-track` | 20 | 20 | 一致 |
| `transportControl.--spacing-control-track-gap` | `原 transportControl.--spacing-control-track-gap` | 4 | 4 | 一致 |
| `transportControl.--spacing-control-track-pad` | `原 transportControl.--spacing-control-track-pad` | 2 | 2 | 一致 |
| `transportControl.--spacing-control-gap` | `原 transportControl.--spacing-control-gap` | 3 | 3 | 一致 |
| `transportControl.--spacing-control-icon-slot` | `原 transportControl.--spacing-control-icon-slot` | 14 | 14 | 一致 |
| `transportControl.--spacing-control-icon` | `原 transportControl.--spacing-control-icon` | 14 | 14 | 一致 |
| `transportControl.--text-control-track` | `原 transportControl.--text-control-track` | 12 | 12 | 一致 |
| `project.panelGap` | `原 project.panelGap` | 7 | 7 | 一致 |
| `project.panelBorder` | `原 project.panelBorder` | 2 | 2 | 一致 |
| `project.groupRailWidth` | `原 project.groupRailWidth` | 7 | 7 | 一致 |
| `project.identityWidth` | `原 project.identityWidth` | 100 | 100 | 一致 |
| `project.routingWidth` | `原 project.routingWidth` | 74 | 74 | 一致 |
| `project.transportColumnGap` | `原 project.transportColumnGap` | 12 | 12 | 一致 |
| `project.transportCenterMargin` | `原 project.transportCenterMargin` | 6 | 6 | 一致 |
| `project.defaultTrackHeight` | `原 project.defaultTrackHeight` | 70 | 70 | 一致 |
| `project.maxTrackHeight` | `project/layout/track.ts 4 * DEFAULT_TRACK_HEIGHT` | 280 | 280 | 一致 |
| `project.gridMajorOpacity` | `clip-edit/midi/note-paint.ts level === 2 ? 0.45` | 0.45 | 0.45 | 一致 |
| `project.gridMinorOpacity` | `clip-edit/midi/note-paint.ts minor 0.55` | 0.55 | 0.55 | 一致 |
| `project.deviceResponseStrokeWidth` | `footer/EffectChain/DeviceDisplay/index.tsx strokeWidth: 2` | 2 | 2 | 一致 |
| `project.footerDeviceHeight` | `原 project.footerDeviceHeight` | 184 | 184 | 一致 |
| `project.deviceCardWidth` | `原 project.deviceCardWidth` | 256 | 256 | 一致 |
| `project.browserNavigationWidth` | `原 project.browserNavigationWidth` | 90 | 90 | 一致 |
| `project.browserResultsWidth` | `原 project.browserResultsWidth` | 140 | 140 | 一致 |
| `project.trackBorder` | `原 project.trackBorder` | 2 | 2 | 一致 |
| `project.minimapMinHeight` | `原 project.minimapMinHeight` | 32 | 32 | 一致 |
| `project.minimapMaxHeight` | `原 project.minimapMaxHeight` | 90 | 90 | 一致 |
| `project.timelineMinHeight` | `原 project.timelineMinHeight` | 160 | 160 | 一致 |
| `project.timelineAutoScrollEdge` | `原 project.timelineAutoScrollEdge` | 42 | 42 | 一致 |
| `project.arrangementMarkerWidth` | `原 project.arrangementMarkerWidth` | 6 | 6 | 一致 |
| `project.arrangementMarkerHeight` | `原 project.arrangementMarkerHeight` | 4 | 4 | 一致 |
| `project.arrangementMarkerInset` | `原 project.arrangementMarkerInset` | 2 | 2 | 一致 |
| `project.arrangementMarkerLabelInset` | `原 project.arrangementMarkerLabelInset` | 7 | 7 | 一致 |
| `project.arrangementMarkerEditorMinWidth` | `原 project.arrangementMarkerEditorMinWidth` | 60.48 | 60.48 | 一致 |
| `project.arrangementGridMajorLineWidth` | `原 project.arrangementGridMajorLineWidth` | 1 | 1 | 一致 |
| `project.arrangementPreviewNoteHeight` | `原 project.arrangementPreviewNoteHeight` | 3 | 3 | 一致 |
| `project.arrangementPreviewNoteInset` | `原 project.arrangementPreviewNoteInset` | 4 | 4 | 一致 |
| `project.arrangementPreviewNoteTopInset` | `原 project.arrangementPreviewNoteTopInset` | 1 | 1 | 一致 |
| `project.arrangementPreviewStepGap` | `原 project.arrangementPreviewStepGap` | 1 | 1 | 一致 |
| `project.arrangementWaveformInset` | `原 project.arrangementWaveformInset` | 1 | 1 | 一致 |
| `project.arrangementLoopTickHeight` | `原 project.arrangementLoopTickHeight` | 5 | 5 | 一致 |
| `project.arrangementLoopTickMinSpacing` | `原 project.arrangementLoopTickMinSpacing` | 2 | 2 | 一致 |
| `project.arrangementLoopTickEdgeInset` | `原 project.arrangementLoopTickEdgeInset` | 1 | 1 | 一致 |
| `project.arrangementClipLabelInset` | `原 project.arrangementClipLabelInset` | 4 | 4 | 一致 |
| `project.arrangementClipLabelClipInset` | `原 project.arrangementClipLabelClipInset` | 2 | 2 | 一致 |
| `project.arrangementInsertionTriangleWidth` | `原 project.arrangementInsertionTriangleWidth` | 8 | 8 | 一致 |
| `project.arrangementInsertionTriangleHeight` | `原 project.arrangementInsertionTriangleHeight` | 6 | 6 | 一致 |
| `project.arrangementInsertionTriangleTopOffset` | `原 project.arrangementInsertionTriangleTopOffset` | 7 | 7 | 一致 |
| `project.arrangementGroupPreviewInset` | `原 project.arrangementGroupPreviewInset` | 3 | 3 | 一致 |
| `project.arrangementGroupPreviewBandMinHeight` | `原 project.arrangementGroupPreviewBandMinHeight` | 0.5 | 0.5 | 一致 |
| `project.arrangementGroupPreviewBandMaxHeight` | `原 project.arrangementGroupPreviewBandMaxHeight` | 2 | 2 | 一致 |
| `project.arrangementGroupPreviewBandGap` | `原 project.arrangementGroupPreviewBandGap` | 1 | 1 | 一致 |
| `project.arrangementFadeHandleSize` | `原 project.arrangementFadeHandleSize` | 5 | 5 | 一致 |
| `project.titlebarHeight` | `原 project.titlebarHeight` | 28 | 28 | 一致 |
| `project.trafficLightMargin` | `原 project.trafficLightMargin` | 8 | 8 | 一致 |
| `project.trafficLightInset` | `原 project.trafficLightInset` | 68 | 68 | 一致 |
| `project.midiKeyWidth` | `原 project.midiKeyWidth` | 54 | 54 | 一致 |
| `project.midiRulerHeight` | `原 project.midiRulerHeight` | 34 | 34 | 一致 |
| `project.midiVelocityHeight` | `原 project.midiVelocityHeight` | 40 | 40 | 一致 |
| `project.midiVelocityHandleWidth` | `原 project.midiVelocityHandleWidth` | 4 | 4 | 一致 |
| `project.midiRowMaxHeight` | `原 project.midiRowMaxHeight` | 18 | 18 | 一致 |
| `project.midiRowMinHeight` | `原 project.midiRowMinHeight` | 6 | 6 | 一致 |
| `project.audioRulerHeight` | `原 project.audioRulerHeight` | 39 | 39 | 一致 |
| `project.trafficLightFrameHeight` | `原 project.trafficLightFrameHeight` | 14 | 14 | 一致 |
| `project.statusHeight` | `原 project.statusHeight` | 22.68 | 22.68 | 一致 |
| `project.dropdownMinWidth` | `原 project.dropdownMinWidth` | 100.8 | 100.8 | 一致 |
| `presets.default.light.success` | `原 palette.chart2` | "oklch(60% 0.118 184.704deg)" | "oklch(60% 0.118 184.704deg)" | 一致 |
| `presets.default.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.default.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.default.dark.success` | `原 palette.chart2` | "oklch(69.6% 0.17 162.48deg)" | "oklch(69.6% 0.17 162.48deg)" | 一致 |
| `presets.default.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.default.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.modern-minimal.light.success` | `原 palette.chart2` | "#2563eb" | "#2563eb" | 一致 |
| `presets.modern-minimal.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.modern-minimal.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.modern-minimal.dark.success` | `原 palette.chart2` | "#3b82f6" | "#3b82f6" | 一致 |
| `presets.modern-minimal.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.modern-minimal.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.violet-bloom.light.success` | `原 palette.chart2` | "#7033ff" | "#7033ff" | 一致 |
| `presets.violet-bloom.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.violet-bloom.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.violet-bloom.dark.success` | `原 palette.chart2` | "#8c5cff" | "#8c5cff" | 一致 |
| `presets.violet-bloom.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.violet-bloom.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.t3-chat.light.success` | `原 palette.chart2` | "#6c12b9" | "#6c12b9" | 一致 |
| `presets.t3-chat.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.t3-chat.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.t3-chat.dark.success` | `原 palette.chart2` | "#934dcb" | "#934dcb" | 一致 |
| `presets.t3-chat.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.t3-chat.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.twitter.light.success` | `原 palette.chart2` | "#00b87a" | "#00b87a" | 一致 |
| `presets.twitter.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.twitter.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.twitter.dark.success` | `原 palette.chart2` | "#00b87a" | "#00b87a" | 一致 |
| `presets.twitter.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.twitter.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.mocha-mousse.light.success` | `原 palette.chart2` | "#8A655A" | "#8A655A" | 一致 |
| `presets.mocha-mousse.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.mocha-mousse.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.mocha-mousse.dark.success` | `原 palette.chart2` | "#BAAB92" | "#BAAB92" | 一致 |
| `presets.mocha-mousse.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.mocha-mousse.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.bubblegum.light.success` | `原 palette.chart2` | "#84d2e2" | "#84d2e2" | 一致 |
| `presets.bubblegum.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.bubblegum.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.bubblegum.dark.success` | `原 palette.chart2` | "#e4a2b1" | "#e4a2b1" | 一致 |
| `presets.bubblegum.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.bubblegum.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.amethyst-haze.light.success` | `原 palette.chart2` | "#e6a5b8" | "#e6a5b8" | 一致 |
| `presets.amethyst-haze.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.amethyst-haze.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.amethyst-haze.dark.success` | `原 palette.chart2` | "#f2b8c6" | "#f2b8c6" | 一致 |
| `presets.amethyst-haze.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.amethyst-haze.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.notebook.light.success` | `原 palette.chart2` | "#555555" | "#555555" | 一致 |
| `presets.notebook.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.notebook.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.notebook.dark.success` | `原 palette.chart2` | "#d0d0d0" | "#d0d0d0" | 一致 |
| `presets.notebook.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.notebook.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.doom-64.light.success` | `原 palette.chart2` | "#556b2f" | "#556b2f" | 一致 |
| `presets.doom-64.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.doom-64.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.doom-64.dark.success` | `原 palette.chart2` | "#689f38" | "#689f38" | 一致 |
| `presets.doom-64.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.doom-64.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.catppuccin.light.success` | `原 palette.chart2` | "#04a5e5" | "#04a5e5" | 一致 |
| `presets.catppuccin.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.catppuccin.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.catppuccin.dark.success` | `原 palette.chart2` | "#89dceb" | "#89dceb" | 一致 |
| `presets.catppuccin.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.catppuccin.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.graphite.light.success` | `原 palette.chart2` | "#476666" | "#476666" | 一致 |
| `presets.graphite.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.graphite.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.graphite.dark.success` | `原 palette.chart2` | "#7e9ca0" | "#7e9ca0" | 一致 |
| `presets.graphite.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.graphite.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.perpetuity.light.success` | `原 palette.chart2` | "#1e9ea6" | "#1e9ea6" | 一致 |
| `presets.perpetuity.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.perpetuity.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.perpetuity.dark.success` | `原 palette.chart2` | "#36a5a5" | "#36a5a5" | 一致 |
| `presets.perpetuity.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.perpetuity.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.kodama-grove.light.success` | `原 palette.chart2` | "#8a9f7b" | "#8a9f7b" | 一致 |
| `presets.kodama-grove.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.kodama-grove.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.kodama-grove.dark.success` | `原 palette.chart2` | "#9db18c" | "#9db18c" | 一致 |
| `presets.kodama-grove.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.kodama-grove.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.cosmic-night.light.success` | `原 palette.chart2` | "#9e8cfc" | "#9e8cfc" | 一致 |
| `presets.cosmic-night.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.cosmic-night.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.cosmic-night.dark.success` | `原 palette.chart2` | "#7986cb" | "#7986cb" | 一致 |
| `presets.cosmic-night.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.cosmic-night.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.tangerine.light.success` | `原 palette.chart2` | "#eea591" | "#eea591" | 一致 |
| `presets.tangerine.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.tangerine.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.tangerine.dark.success` | `原 palette.chart2` | "#e6a08f" | "#e6a08f" | 一致 |
| `presets.tangerine.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.tangerine.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.quantum-rose.light.success` | `原 palette.chart2` | "#c44b97" | "#c44b97" | 一致 |
| `presets.quantum-rose.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.quantum-rose.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.quantum-rose.dark.success` | `原 palette.chart2` | "#c359e3" | "#c359e3" | 一致 |
| `presets.quantum-rose.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.quantum-rose.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.nature.light.success` | `原 palette.chart2` | "#388e3c" | "#388e3c" | 一致 |
| `presets.nature.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.nature.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.nature.dark.success` | `原 palette.chart2` | "#66bb6a" | "#66bb6a" | 一致 |
| `presets.nature.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.nature.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.bold-tech.light.success` | `原 palette.chart2` | "#7c3aed" | "#7c3aed" | 一致 |
| `presets.bold-tech.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.bold-tech.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.bold-tech.dark.success` | `原 palette.chart2` | "#8b5cf6" | "#8b5cf6" | 一致 |
| `presets.bold-tech.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.bold-tech.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.elegant-luxury.light.success` | `原 palette.chart2` | "#9b2c2c" | "#9b2c2c" | 一致 |
| `presets.elegant-luxury.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.elegant-luxury.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.elegant-luxury.dark.success` | `原 palette.chart2` | "#ef4444" | "#ef4444" | 一致 |
| `presets.elegant-luxury.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.elegant-luxury.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.amber-minimal.light.success` | `原 palette.chart2` | "#d97706" | "#d97706" | 一致 |
| `presets.amber-minimal.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.amber-minimal.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.amber-minimal.dark.success` | `原 palette.chart2` | "#d97706" | "#d97706" | 一致 |
| `presets.amber-minimal.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.amber-minimal.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.supabase.light.success` | `原 palette.chart2` | "#3b82f6" | "#3b82f6" | 一致 |
| `presets.supabase.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.supabase.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.supabase.dark.success` | `原 palette.chart2` | "#60a5fa" | "#60a5fa" | 一致 |
| `presets.supabase.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.supabase.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.neo-brutalism.light.success` | `原 palette.chart2` | "#ffff00" | "#ffff00" | 一致 |
| `presets.neo-brutalism.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.neo-brutalism.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.neo-brutalism.dark.success` | `原 palette.chart2` | "#ffff33" | "#ffff33" | 一致 |
| `presets.neo-brutalism.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.neo-brutalism.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.solar-dusk.light.success` | `原 palette.chart2` | "#78716C" | "#78716C" | 一致 |
| `presets.solar-dusk.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.solar-dusk.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.solar-dusk.dark.success` | `原 palette.chart2` | "#0EA5E9" | "#0EA5E9" | 一致 |
| `presets.solar-dusk.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.solar-dusk.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.claymorphism.light.success` | `原 palette.chart2` | "#4f46e5" | "#4f46e5" | 一致 |
| `presets.claymorphism.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.claymorphism.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.claymorphism.dark.success` | `原 palette.chart2` | "#6366f1" | "#6366f1" | 一致 |
| `presets.claymorphism.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.claymorphism.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.cyberpunk.light.success` | `原 palette.chart2` | "#9000ff" | "#9000ff" | 一致 |
| `presets.cyberpunk.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.cyberpunk.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.cyberpunk.dark.success` | `原 palette.chart2` | "#9000ff" | "#9000ff" | 一致 |
| `presets.cyberpunk.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.cyberpunk.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.pastel-dreams.light.success` | `原 palette.chart2` | "#8b5cf6" | "#8b5cf6" | 一致 |
| `presets.pastel-dreams.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.pastel-dreams.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.pastel-dreams.dark.success` | `原 palette.chart2` | "#a78bfa" | "#a78bfa" | 一致 |
| `presets.pastel-dreams.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.pastel-dreams.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.clean-slate.light.success` | `原 palette.chart2` | "#4f46e5" | "#4f46e5" | 一致 |
| `presets.clean-slate.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.clean-slate.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.clean-slate.dark.success` | `原 palette.chart2` | "#6366f1" | "#6366f1" | 一致 |
| `presets.clean-slate.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.clean-slate.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.caffeine.light.success` | `原 palette.chart2` | "#ffdfb5" | "#ffdfb5" | 一致 |
| `presets.caffeine.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.caffeine.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.caffeine.dark.success` | `原 palette.chart2` | "#393028" | "#393028" | 一致 |
| `presets.caffeine.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.caffeine.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.ocean-breeze.light.success` | `原 palette.chart2` | "#10b981" | "#10b981" | 一致 |
| `presets.ocean-breeze.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.ocean-breeze.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.ocean-breeze.dark.success` | `原 palette.chart2` | "#2dd4bf" | "#2dd4bf" | 一致 |
| `presets.ocean-breeze.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.ocean-breeze.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.retro-arcade.light.success` | `原 palette.chart2` | "#2aa198" | "#2aa198" | 一致 |
| `presets.retro-arcade.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.retro-arcade.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.retro-arcade.dark.success` | `原 palette.chart2` | "#2aa198" | "#2aa198" | 一致 |
| `presets.retro-arcade.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.retro-arcade.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.midnight-bloom.light.success` | `原 palette.chart2` | "#8e44ad" | "#8e44ad" | 一致 |
| `presets.midnight-bloom.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.midnight-bloom.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.midnight-bloom.dark.success` | `原 palette.chart2` | "#8e44ad" | "#8e44ad" | 一致 |
| `presets.midnight-bloom.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.midnight-bloom.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.candyland.light.success` | `原 palette.chart2` | "#87ceeb" | "#87ceeb" | 一致 |
| `presets.candyland.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.candyland.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.candyland.dark.success` | `原 palette.chart2` | "#33cc33" | "#33cc33" | 一致 |
| `presets.candyland.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.candyland.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.northern-lights.light.success` | `原 palette.chart2` | "#6495ed" | "#6495ed" | 一致 |
| `presets.northern-lights.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.northern-lights.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.northern-lights.dark.success` | `原 palette.chart2` | "#4682b4" | "#4682b4" | 一致 |
| `presets.northern-lights.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.northern-lights.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.vintage-paper.light.success` | `原 palette.chart2` | "#8d6e4c" | "#8d6e4c" | 一致 |
| `presets.vintage-paper.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.vintage-paper.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.vintage-paper.dark.success` | `原 palette.chart2` | "#b3906f" | "#b3906f" | 一致 |
| `presets.vintage-paper.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.vintage-paper.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.sunset-horizon.light.success` | `原 palette.chart2` | "#feb47b" | "#feb47b" | 一致 |
| `presets.sunset-horizon.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.sunset-horizon.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.sunset-horizon.dark.success` | `原 palette.chart2` | "#feb47b" | "#feb47b" | 一致 |
| `presets.sunset-horizon.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.sunset-horizon.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.starry-night.light.success` | `原 palette.chart2` | "#f7c873" | "#f7c873" | 一致 |
| `presets.starry-night.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.starry-night.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.starry-night.dark.success` | `原 palette.chart2` | "#ffe066" | "#ffe066" | 一致 |
| `presets.starry-night.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.starry-night.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.claude.light.success` | `原 palette.chart2` | "#9c87f5" | "#9c87f5" | 一致 |
| `presets.claude.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.claude.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.claude.dark.success` | `原 palette.chart2` | "#9c87f5" | "#9c87f5" | 一致 |
| `presets.claude.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.claude.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.vercel.light.success` | `原 palette.chart2` | "oklch(0.55 0.22 264.53)" | "oklch(0.55 0.22 264.53)" | 一致 |
| `presets.vercel.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.vercel.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.vercel.dark.success` | `原 palette.chart2` | "oklch(0.58 0.21 260.84)" | "oklch(0.58 0.21 260.84)" | 一致 |
| `presets.vercel.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.vercel.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.darkmatter.light.success` | `原 palette.chart2` | "#e78a53" | "#e78a53" | 一致 |
| `presets.darkmatter.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.darkmatter.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.darkmatter.dark.success` | `原 palette.chart2` | "#e78a53" | "#e78a53" | 一致 |
| `presets.darkmatter.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.darkmatter.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.mono.light.success` | `原 palette.chart2` | "#737373" | "#737373" | 一致 |
| `presets.mono.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.mono.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.mono.dark.success` | `原 palette.chart2` | "#737373" | "#737373" | 一致 |
| `presets.mono.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.mono.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.soft-pop.light.success` | `原 palette.chart2` | "#14b8a6" | "#14b8a6" | 一致 |
| `presets.soft-pop.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.soft-pop.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.soft-pop.dark.success` | `原 palette.chart2` | "#2dd4bf" | "#2dd4bf" | 一致 |
| `presets.soft-pop.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.soft-pop.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.sage-garden.light.success` | `原 palette.chart2` | "#a0aa88" | "#a0aa88" | 一致 |
| `presets.sage-garden.light.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.sage-garden.light.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |
| `presets.sage-garden.dark.success` | `原 palette.chart2` | "#a0aa88" | "#a0aa88" | 一致 |
| `presets.sage-garden.dark.arrangementClipSelected` | `原 derive.arrangementClipSelected` | "oklch(87% 0.05 220deg)" | "oklch(87% 0.05 220deg)" | 一致 |
| `presets.sage-garden.dark.arrangementClipPaper` | `原 derive.arrangementClipPaper` | "oklch(97% 0.005 90deg)" | "oklch(97% 0.005 90deg)" | 一致 |

580 个叶子，0 个差异。
