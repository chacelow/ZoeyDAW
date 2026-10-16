import { colorMix } from "@/shared/theme/color-mix"
import { getThemePreset } from "@/shared/theme/presets"
import { verifyConfigurationMutations } from "./configuration-mutation-runner.mjs"

const panels = {
  browserDefaultSize: "25%",
  browserMaxSize: "50%",
  arrangementMinWidth: "30%",
  clipDefaultSize: "40%",
  clipMinSize: "20%",
  clipMaxSize: "70%",
}
const preset = "app/settings/ThemePresetGrid.tsx"
const grid = "preset grid sources independently control"
verifyConfigurationMutations({
  testFiles: ["src/app/configuration.test.tsx", "src/app/non-track-layout.test.tsx"],
  cases: [
    ...Object.entries(panels).map(([field, original]) => ({
      name: `project panel ${field} bypasses layout source`,
      file: "app/project/ProjectLayout.tsx",
      from: `panels.${field}`,
      to: JSON.stringify(original),
      pattern: `project panel layout source controls native ${field}`,
    })),
    {
      name: "home width borrows track geometry",
      file: "app/home/HomePage.tsx",
      from: "theme.layout.home.maxWidth",
      to: "912",
      pattern: "home layout width responds at runtime",
    },
    {
      name: "preset column width borrows track geometry",
      file: preset,
      from: "theme.design.settings.presetGrid.columnWidth",
      to: "200",
      pattern: grid,
    },
    {
      name: "preset swatch height borrows control track",
      file: preset,
      from: "theme.design.settings.presetGrid.swatchHeight",
      to: "26",
      pattern: grid,
    },
    {
      name: "preset scroll height borrows track geometry",
      file: preset,
      from: "theme.design.settings.presetGrid.scrollHeight",
      to: "280",
      pattern: grid,
    },
    {
      name: "selected preset ignores typography weight",
      file: preset,
      from: "theme.design.typography.weights.medium",
      to: "500",
      pattern: "selected preset typography weight changes native text paint",
    },
    {
      name: "dialog backdrop freezes original color recipe",
      file: "app/dialog/ModalDialog.tsx",
      from: "theme.colors.dialogBackdrop",
      to: JSON.stringify(
        colorMix(getThemePreset("default").colors.dark.foreground, 10, "transparent")
      ),
      pattern: "dialog backdrop recipe updates native dim",
    },
    {
      name: "feedback width borrows track controls",
      file: "ui/controls/LoadErrorScreen/index.tsx",
      from: "theme.design.feedback.maxWidth",
      to: "304",
      pattern: "feedback maxWidth constrains native error description",
    },
    {
      name: "confirmation width borrows track controls",
      file: "app/window/UnsavedCloseDialog.tsx",
      from: "theme.design.dialog.confirmationWidth",
      to: "304",
      pattern: "confirmation width changes native content",
    },
    {
      name: "recent project card width borrows track controls",
      file: "app/home/HomePage.tsx",
      from: "theme.layout.home.recentCardWidth",
      to: "304",
      pattern: "recent project card width follows home layout",
    },
    ...["gallery/GalleryCard.tsx", "gallery/GalleryExamples.tsx"].map(file => ({
      name: `${file} bypasses Gallery card width source`,
      file,
      from: "theme.layout.gallery.cardWidth",
      to: "304",
      pattern: "Gallery card source keeps control and project examples",
    })),
    {
      name: "Gallery settings preview borrows track controls",
      file: "gallery/states.tsx",
      from: "theme.layout.gallery.settingsPreviewWidth",
      to: "608",
      pattern: "Gallery settings preview width follows its own layout",
    },
    ...[
      ["gap", "12"],
      ["inset", "24"],
      ["actionGap", "8"],
    ].map(([field, literal]) => ({
      name: `feedback ${field} bypasses its source`,
      file: "ui/controls/LoadErrorScreen/index.tsx",
      from: `theme.design.feedback.${field}`,
      to: literal,
      pattern: `feedback ${field} changes native error layout`,
    })),
  ],
})
