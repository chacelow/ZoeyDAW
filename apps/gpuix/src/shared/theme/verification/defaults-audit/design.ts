import type { BaselineMetrics, Expectation } from "./types"
import { COLOR_EXPECTATIONS } from "./colors"

export function designExpectations(
  metrics: BaselineMetrics
): Readonly<Record<string, Expectation>> {
  const { control, project } = metrics
  return {
    "typography.weights.medium": {
      expression: "app/home/HomePage.tsx fontWeight: 500",
      value: 500,
    },
    "typography.weights.semibold": {
      expression: "ui/controls/Card/index.tsx fontWeight: 600",
      value: 600,
    },
    "shape.separatorWidth": { expression: "ui/controls/Separator/index.tsx width: 1", value: 1 },
    "menu.maxWidth": {
      expression: "ui/controls/DropdownButton/index.tsx maxWidth: 320",
      value: 320,
    },
    "menu.maxHeight": {
      expression: "ui/controls/DropdownButton/index.tsx maxHeight: 300",
      value: 300,
    },
    "menu.width": {
      expression: "ui/controls/Menu/content.tsx theme.control['--spacing-control-track'] * 10",
      value: control.track * 10,
    },
    "menu.dropdownSeparatorInset": {
      expression: "ui/controls/DropdownButton/index.tsx marginTop/marginBottom: 3",
      value: 3,
    },
    "menu.contextSeparatorInset": {
      expression: "ui/controls/Menu/index.tsx marginTop/marginBottom: 4",
      value: 4,
    },
    "popover.width": {
      expression: "ui/controls/Popover/index.tsx theme.control['--spacing-control-track'] * 12",
      value: control.track * 12,
    },
    "settings.shellWidth": {
      expression: "ui/controls/SettingsShell/index.tsx width: 720",
      value: 720,
    },
    "settings.shellHeight": {
      expression: "ui/controls/SettingsShell/index.tsx height: 520",
      value: 520,
    },
    "settings.navigationWidth": {
      expression: "ui/controls/SettingsShell/index.tsx width: 168",
      value: 168,
    },
    "settings.presetGrid.columnWidth": {
      expression: "app/settings/ThemePresetGrid.tsx theme.project.identityWidth * 2",
      value: project.identityWidth * 2,
    },
    "settings.presetGrid.swatchHeight": {
      expression: "app/settings/ThemePresetGrid.tsx theme.control['--spacing-control-track'] * 2",
      value: control.track * 2,
    },
    "settings.presetGrid.scrollHeight": {
      expression: "app/settings/ThemePresetGrid.tsx theme.project.defaultTrackHeight * 4",
      value: project.defaultTrackHeight * 4,
    },
    "tabs.width": { expression: "ui/controls/MotionTabs/index.tsx tabWidth = 120", value: 120 },
    "tabs.footerRadius": {
      expression: "project/sections/footer/index.tsx borderRadius: 0",
      value: 0,
    },
    "tabs.footerJoinedGroupGap": {
      expression: "project/sections/footer/index.tsx gap: 0",
      value: 0,
    },
    "overlay.sideOffset": { expression: "ui/controls/Popover/index.tsx sideOffset = 4", value: 4 },
    "overlay.collisionPadding": {
      expression: "ui/controls/Popover/index.tsx collisionPadding = 8",
      value: 8,
    },
    "dragPreview.maxWidth": {
      expression: "ui/controls/DragPreviewArea/index.tsx maxWidth: 320",
      value: 320,
    },
    "dragPreview.gap": { expression: "ui/controls/DragPreviewArea/index.tsx gap: 8", value: 8 },
    "dragPreview.opacity": {
      expression: "ui/controls/DragPreviewArea/index.tsx opacity: 0.85",
      value: 0.85,
    },
    "dragPreview.pointerOffset.x": {
      expression: "ui/controls/DragPreviewArea/index.tsx offset={{ x: 12, y: 12 }}.x",
      value: 12,
    },
    "dragPreview.pointerOffset.y": {
      expression: "ui/controls/DragPreviewArea/index.tsx offset={{ x: 12, y: 12 }}.y",
      value: 12,
    },
    "empty.gap": { expression: "ui/controls/Empty/index.tsx gap * 4", value: control.trackGap * 4 },
    "empty.inset": {
      expression: "ui/controls/Empty/index.tsx gap * 6",
      value: control.trackGap * 6,
    },
    "empty.radius": {
      expression: "ui/controls/Empty/index.tsx gap * 3",
      value: control.trackGap * 3,
    },
    "empty.contentGap": {
      expression: "ui/controls/Empty/index.tsx theme.control['--spacing-control-track-gap'] * 2",
      value: control.trackGap * 2,
    },
    "empty.headerMaxWidth": {
      expression: "ui/controls/Empty/index.tsx theme.project.controlsWidth",
      value: project.controlsWidth,
    },
    "loading.gap": {
      expression: "ui/controls/Loading/index.tsx gap * 3",
      value: control.trackGap * 3,
    },
    "loading.brandWidth": {
      expression: "ui/controls/Loading/index.tsx theme.control['--spacing-control-icon'] * 6",
      value: control.icon * 6,
    },
    "loading.brandHeight": {
      expression: "ui/controls/Loading/index.tsx theme.control['--spacing-control-track'] * 3",
      value: control.track * 3,
    },
    "loading.progressWidth": {
      expression: "ui/controls/Loading/index.tsx theme.project.controlsWidth",
      value: project.controlsWidth,
    },
    "toast.edgeInset": {
      expression: "ui/controls/Toaster/index.tsx top/bottom/left/right: gap * 3",
      value: control.trackGap * 3,
    },
    "toast.stackGap": {
      expression: "ui/controls/Toaster/index.tsx gap: gap * 2",
      value: control.trackGap * 2,
    },
    "toast.inset": {
      expression: "ui/controls/Toaster/index.tsx padding: gap * 3",
      value: control.trackGap * 3,
    },
    "toast.radius": {
      expression: "ui/controls/Toaster/index.tsx borderRadius: gap * 2",
      value: control.trackGap * 2,
    },
    "toast.width": {
      expression: "ui/controls/Toaster/index.tsx width: theme.project.controlsWidth",
      value: project.controlsWidth,
    },
    "states.disabledOpacity": { expression: "ui/controls/chrome.ts opacity: 0.5", value: 0.5 },
    "states.dragSourceOpacity": {
      expression: "ui/controls/DragPreviewArea/index.tsx dragging opacity: 0.4",
      value: 0.4,
    },
    "states.deviceDragSourceOpacity": {
      expression: "project/sections/footer/EffectChain/DeviceCard/index.tsx dragging ? 0.5 : 1",
      value: 0.5,
    },
    "editor.dividerStrokeWidth": {
      expression: "project/sections/clip-edit/audio/AudioWaveformRulers.tsx borderBottomWidth: 1",
      value: 1,
    },
    "editor.loopStrokeWidth": {
      expression: "project/sections/clip-edit/midi/MidiRuler.tsx borderWidth: 1",
      value: 1,
    },
    "editor.selectionStrokeWidth": {
      expression: "project/sections/clip-edit/audio/AudioWaveformOverview.tsx borderWidth: 1",
      value: 1,
    },
    "editor.gridMinorStrokeWidth": {
      expression: "project/sections/arrangement/core/rulers/grid-quads.ts minor width: 1",
      value: 1,
    },
    "editor.playheadLineWidth": {
      expression: "project/sections/arrangement/timeline/minimap/Playhead.tsx width: 1",
      value: 1,
    },
    "editor.insertionLineWidth": {
      expression: "project/sections/arrangement/lane/LaneOverlay/index.tsx width: 1",
      value: 1,
    },
    "editor.selectionLineWidth": {
      expression: "project/sections/arrangement/lane/LaneOverlay/index.tsx width: 1",
      value: 1,
    },
    "editor.markerLineWidth": {
      expression: "project/sections/clip-edit/audio/SourceMarker.tsx width: 1",
      value: 1,
    },
    "editor.loopLineWidth": {
      expression: "project/sections/clip-edit/midi/MidiRuler.tsx width: 1",
      value: 1,
    },
    "editor.velocityLineWidth": {
      expression: "project/sections/clip-edit/midi/VelocityLane.tsx width: 1",
      value: 1,
    },
    "editor.fadeStrokeWidth": {
      expression: "project/sections/arrangement/lane/ClipFades/index.tsx strokeWidth: 1",
      value: 1,
    },
    "editor.waveformAxisOpacity": {
      expression: "project/sections/clip-edit/audio/AudioWaveformLayer.tsx opacity: 0.4",
      value: 0.4,
    },
    "editor.clipGhostOpacity": {
      expression: "project/sections/arrangement/lane/ClipCard.tsx card.ghost ? 0.5 : 1",
      value: 0.5,
    },
    "editor.rangeOpacity": {
      expression: "project/sections/arrangement/lane/LaneRow/Contents.tsx opacity: 0.5",
      value: 0.5,
    },
    "editor.groupClipPreviewOpacity": {
      expression: "project/sections/arrangement/lane/LaneRow/Contents.tsx opacity: 0.85",
      value: 0.85,
    },
    "editor.drawPreviewOpacity": {
      expression: "project/sections/arrangement/lane/LaneRow/Contents.tsx opacity: 0.2",
      value: 0.2,
    },
    "editor.clipLoopShadeOpacity": {
      expression: "project/sections/arrangement/lane/ClipContents.tsx opacity: 0.1",
      value: 0.1,
    },
    "editor.midiLoopOpacity": {
      expression: "project/sections/clip-edit/midi/MidiRuler.tsx opacity: 0.35",
      value: 0.35,
    },
    "editor.clipBodySelectedOpacity": {
      expression:
        "project/sections/arrangement/lane/ClipContents.tsx card.selected ? 0.9 : automationMode ? 0.25 : 0.55",
      value: 0.9,
    },
    "editor.clipBodyAutomationOpacity": {
      expression: "project/sections/arrangement/lane/ClipContents.tsx automationMode ? 0.25 : 0.55",
      value: 0.25,
    },
    "editor.clipBodyOpacity": {
      expression:
        "project/sections/arrangement/lane/ClipContents.tsx card.selected ? 0.9 : automationMode ? 0.25 : 0.55",
      value: 0.55,
    },
    "editor.clipGridHoveredOpacity": {
      expression: "project/sections/arrangement/lane/ClipContents.tsx card.hovered ? 0.3 : 0.4",
      value: 0.3,
    },
    "editor.clipGridOpacity": {
      expression: "project/sections/arrangement/lane/ClipContents.tsx card.hovered ? 0.3 : 0.4",
      value: 0.4,
    },
    "editor.clipAutomationPreviewOpacity": {
      expression: "project/sections/arrangement/lane/ClipContents.tsx automationMode ? 0.4 : 1",
      value: 0.4,
    },
    "editor.inlineRadius": {
      expression:
        "project/sections/arrangement/lane/interactions/automation/ValueEditor/index.tsx borderRadius: 0",
      value: 0,
    },
    "editor.noteInset": {
      expression: "project/sections/clip-edit/midi/note-paint.ts note top + 1 / bottom - 1",
      value: 1,
    },
    "editor.meter.channelGap": {
      expression:
        "project/sections/arrangement/tracks/meter/TrackMeter.tsx Math.floor((width - 1) / 2); channelWidth + 1",
      value: 1,
    },
    "editor.meter.peakWidth": {
      expression: "project/sections/arrangement/tracks/meter/TrackMeter.tsx peak style height: 1",
      value: 1,
    },
    "editor.meter.zeroWidth": {
      expression: "project/sections/arrangement/tracks/meter/TrackMeter.tsx zero style height: 1",
      value: 1,
    },
    "editor.meter.warningStop": {
      expression: "project/sections/arrangement/tracks/meter/TrackMeter.tsx position: 0.3",
      value: 0.3,
    },
    "dragPad.fillOpacity": {
      expression: "ui/controls/DragPad/DragPadNumber.tsx opacity: 0.3",
      value: 0.3,
    },
    "dragPad.centerMarker.inset": {
      expression: "ui/controls/DragPad/DragPadNumber.tsx top/bottom: 2",
      value: 2,
    },
    "dragPad.centerMarker.width": {
      expression: "ui/controls/DragPad/DragPadNumber.tsx center style width: 1",
      value: 1,
    },
    "dragPad.caretWidth": {
      expression: "ui/controls/DragPad/DragPadNumber.tsx edit-indicator style width: 1",
      value: 1,
    },
    "progress.indeterminateOpacity": {
      expression: "ui/controls/Progress/index.tsx determinate ? 1 : 0.5",
      value: 0.5,
    },
    "progress.widthFraction": {
      expression: "ui/controls/Progress/index.tsx indeterminate width '30%' normalized as 30 / 100",
      value: 0.3,
    },
    "motion.tabs.duration": {
      expression: "ui/controls/MotionTabs/index.tsx transition duration: 0.16",
      value: 0.16,
    },
    "motion.tabs.easing": {
      expression: "ui/controls/MotionTabs/index.tsx transition ease: 'easeOut'",
      value: "easeOut",
    },
    "cursors.default": {
      expression: "ui/controls/Menu/index.tsx unavailable ? 'default' : 'pointer'",
      value: "default",
    },
    "cursors.action": { expression: "ui/controls/chrome.ts cursor: 'pointer'", value: "pointer" },
    "cursors.disabled": {
      expression: "ui/controls/chrome.ts cursor: 'not-allowed'",
      value: "not-allowed",
    },
    "cursors.text": {
      expression: "ui/controls/DragPad/DragPadNumber.tsx cursor: 'text'",
      value: "text",
    },
    "cursors.grab": {
      expression: "ui/controls/DragPreviewArea/index.tsx idle cursor: 'grab'",
      value: "grab",
    },
    "cursors.grabbing": {
      expression: "ui/controls/DragPreviewArea/index.tsx dragging cursor: 'grabbing'",
      value: "grabbing",
    },
    "cursors.verticalResize": {
      expression:
        "project/sections/arrangement/tracks/TrackResizeOverlay/index.tsx cursor: 'ns-resize'",
      value: "ns-resize",
    },
    "cursors.horizontalResize": {
      expression: "project/sections/clip-edit/audio/SourceMarker.tsx cursor: 'ew-resize'",
      value: "ew-resize",
    },
    "cursors.rowResize": {
      expression: "ui/panels/Separator/index.tsx cursor: 'row-resize'",
      value: "row-resize",
    },
    "cursors.columnResize": {
      expression: "ui/panels/Separator/index.tsx vertical ? 'col-resize' : 'row-resize'",
      value: "col-resize",
    },
    "cursors.automationDraw": {
      expression:
        "project/sections/arrangement/lane/interactions/automation/gestures.ts cursor: 'crosshair'",
      value: "crosshair",
    },
    "cursors.fadeCurve": {
      expression:
        "project/sections/arrangement/lane/interactions/clip/fade.ts handle === 'curve' ? 'move' : 'ew-resize'",
      value: "move",
    },
    "icon.strokeWidth": { expression: "ui/controls/Icon/index.tsx strokeWidth = 2", value: 2 },
    "feedback.maxWidth": {
      expression: "ui/controls/LoadErrorScreen/index.tsx maxWidth: theme.project.controlsWidth",
      value: project.controlsWidth,
    },
    "feedback.gap": {
      expression: "ui/controls/LoadErrorScreen/index.tsx gap: gap * 3",
      value: control.trackGap * 3,
    },
    "feedback.inset": {
      expression: "ui/controls/LoadErrorScreen/index.tsx padding: gap * 6",
      value: control.trackGap * 6,
    },
    "feedback.actionGap": {
      expression: "ui/controls/LoadErrorScreen/index.tsx gap: gap * 2",
      value: control.trackGap * 2,
    },
    "dialog.confirmationWidth": {
      expression: "app/window/UnsavedCloseDialog.tsx width: theme.project.controlsWidth",
      value: project.controlsWidth,
    },
    ...COLOR_EXPECTATIONS,
  }
}
