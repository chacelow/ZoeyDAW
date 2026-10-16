import type { Expectation } from "./types"

export const COLOR_EXPECTATIONS: Readonly<Record<string, Expectation>> = {
  "trackCreationColors.audio": {
    expression: "project/model/reducers.ts non-group color: 'oklch(0.65 0.18 230)'",
    value: "oklch(0.65 0.18 230)",
  },
  "trackCreationColors.midi": {
    expression: "project/model/reducers.ts non-group color: 'oklch(0.65 0.18 230)'",
    value: "oklch(0.65 0.18 230)",
  },
  "trackCreationColors.group": {
    expression: "project/model/reducers.ts group color: 'oklch(0.65 0.17 265)'",
    value: "oklch(0.65 0.17 265)",
  },
  "trackCreationColors.return": {
    expression: "project/model/reducers.ts non-group color: 'oklch(0.65 0.18 230)'",
    value: "oklch(0.65 0.18 230)",
  },
  "trackCreationColors.main": {
    expression: "project/stores/slices/document.ts Main color: 'var(--chart-3)'",
    value: "var(--chart-3)",
  },
  "colorRecipes.contentPaperTint": {
    expression: "shared/theme/content-color.ts CLIP_PAPER_TINT = 32",
    value: 32,
  },
  "colorRecipes.editorShell": {
    expression: "shared/theme/colors.ts colorMix(base.muted, 30, base.background)",
    value: 30,
  },
  "colorRecipes.canvasScrollbar": {
    expression: "shared/theme/colors.ts colorMix(base.foreground, 10, 'transparent')",
    value: 10,
  },
  "colorRecipes.canvasScrollbarHover": {
    expression: "shared/theme/colors.ts colorMix(base.foreground, 18, 'transparent')",
    value: 18,
  },
  "colorRecipes.canvasScrollbarActive": {
    expression: "shared/theme/colors.ts colorMix(base.foreground, 26, 'transparent')",
    value: 26,
  },
  "colorRecipes.scrollbarTrack": {
    expression: "shared/theme/colors.ts colorMix(base.foreground, 4, base.background)",
    value: 4,
  },
  "colorRecipes.arrangementSurfaceSelected": {
    expression: "shared/theme/colors.ts colorMix(base.card, 78, base.foreground)",
    value: 78,
  },
  "colorRecipes.arrangementSurface": {
    expression: "shared/theme/colors.ts colorMix(base.card, 86, base.foreground)",
    value: 86,
  },
  "colorRecipes.arrangementSurfaceAlt": {
    expression: "shared/theme/colors.ts colorMix(base.card, 84, base.foreground)",
    value: 84,
  },
  "colorRecipes.arrangementFadeMask": {
    expression: "shared/theme/colors.ts colorMix(arrangementClipInk, 50, 'transparent')",
    value: 50,
  },
  "colorRecipes.destructive.active.light": {
    expression:
      "ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 20 : 10, 'transparent')",
    value: 10,
  },
  "colorRecipes.destructive.active.dark": {
    expression:
      "ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 20 : 10, 'transparent')",
    value: 20,
  },
  "colorRecipes.destructive.highlight.light": {
    expression:
      "ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 30 : 20, 'transparent')",
    value: 20,
  },
  "colorRecipes.destructive.highlight.dark": {
    expression:
      "ui/controls/Button/index.tsx colorMix(destructive, appearance === 'dark' ? 30 : 20, 'transparent')",
    value: 30,
  },
  "colorRecipes.destructive.focusBorder": {
    expression: "ui/controls/Button/index.tsx colorMix(destructive, 40, 'transparent')",
    value: 40,
  },
  "colorRecipes.destructive.focusOutline.light": {
    expression:
      "ui/controls/Button/index.tsx outlineColor: colorMix(destructive, appearance === 'dark' ? 40 : 20, 'transparent')",
    value: 20,
  },
  "colorRecipes.destructive.focusOutline.dark": {
    expression:
      "ui/controls/Button/index.tsx outlineColor: colorMix(destructive, appearance === 'dark' ? 40 : 20, 'transparent')",
    value: 40,
  },
  "colorRecipes.listRowHover": {
    expression:
      "ui/controls/ListRow/index.tsx colorMix(theme.colors.muted, 90, theme.colors.foreground)",
    value: 90,
  },
  "colorRecipes.dialogBackdrop": {
    expression: "app/dialog/ModalDialog.tsx colorMix(theme.colors.foreground, 10, 'transparent')",
    value: 10,
  },
  "colorRecipes.editor.overviewViewport": {
    expression:
      "project/sections/clip-edit/audio/AudioWaveformOverview.tsx colorMix(primary, 12, 'transparent')",
    value: 12,
  },
  "colorRecipes.editor.audioLoop": {
    expression:
      "project/sections/clip-edit/audio/AudioWaveformRulers.tsx colorMix(primary, 45, 'transparent')",
    value: 45,
  },
  "colorRecipes.editor.markerHover": {
    expression:
      "project/sections/clip-edit/audio/SourceMarker.tsx colorMix(primary, 30, 'transparent')",
    value: 30,
  },
  "colorRecipes.editor.marquee": {
    expression: "project/sections/clip-edit/midi/NoteGrid.tsx colorMix(primary, 20, 'transparent')",
    value: 20,
  },
  "colorRecipes.editor.pianoIvoryDark": {
    expression:
      "project/sections/clip-edit/midi/PianoKeys.tsx colorMix(foreground, 75, background)",
    value: 75,
  },
  "colorRecipes.editor.pianoEbony": {
    expression:
      "project/sections/clip-edit/midi/PianoKeys.tsx dark ? colorMix(background, 80, foreground) : colorMix(foreground, 80, background)",
    value: 80,
  },
  "colorRecipes.editor.velocityNoteBorder": {
    expression:
      "project/sections/clip-edit/midi/note-paint.ts colorMix(color, 60, colors.background)",
    value: 60,
  },
  "colorRecipes.editor.velocitySelected.base": {
    expression: "project/sections/clip-edit/midi/note-paint.ts 55 + (note.velocity / 127) * 45",
    value: 55,
  },
  "colorRecipes.editor.velocitySelected.range": {
    expression: "project/sections/clip-edit/midi/note-paint.ts 55 + (note.velocity / 127) * 45",
    value: 45,
  },
  "colorRecipes.editor.velocityUnselected.base": {
    expression: "project/sections/clip-edit/midi/note-paint.ts 35 + (note.velocity / 127) * 65",
    value: 35,
  },
  "colorRecipes.editor.velocityUnselected.range": {
    expression: "project/sections/clip-edit/midi/note-paint.ts 35 + (note.velocity / 127) * 65",
    value: 65,
  },
  "colorRecipes.aliases.arrangementLine.light": {
    expression: "shared/theme/colors.ts lightDark(base.border, base.muted) light",
    value: "border",
  },
  "colorRecipes.aliases.arrangementLine.dark": {
    expression: "shared/theme/colors.ts lightDark(base.border, base.muted) dark",
    value: "muted",
  },
  "colorRecipes.aliases.arrangementAutomation": {
    expression: "shared/theme/colors.ts arrangementAutomation: base.destructive",
    value: "destructive",
  },
  "colorRecipes.aliases.arrangementVolume": {
    expression: "shared/theme/colors.ts arrangementVolume: base.chart2",
    value: "chart2",
  },
  "colorRecipes.aliases.arrangementMeterGood": {
    expression: "shared/theme/colors.ts arrangementMeterGood: base.chart2",
    value: "chart2",
  },
  "colorRecipes.aliases.arrangementMeterWarn.light": {
    expression: "shared/theme/colors.ts lightDark(base.chart4, base.chart3) light",
    value: "chart4",
  },
  "colorRecipes.aliases.arrangementMeterWarn.dark": {
    expression: "shared/theme/colors.ts lightDark(base.chart4, base.chart3) dark",
    value: "chart3",
  },
  "colorRecipes.aliases.arrangementMeterDanger": {
    expression: "shared/theme/colors.ts arrangementMeterDanger: base.destructive",
    value: "destructive",
  },
  "colorRecipes.aliases.arrangementMeterPeak": {
    expression: "shared/theme/colors.ts arrangementMeterPeak: base.mutedForeground",
    value: "mutedForeground",
  },
  "colorRecipes.aliases.arrangementClipInk.light": {
    expression: "shared/theme/colors.ts lightDark(base.foreground, base.card) light",
    value: "foreground",
  },
  "colorRecipes.aliases.arrangementClipInk.dark": {
    expression: "shared/theme/colors.ts lightDark(base.foreground, base.card) dark",
    value: "card",
  },
}
