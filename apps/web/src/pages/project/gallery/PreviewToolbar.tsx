import { useTranslation } from "@zoeymind/i18n"
import { Badge, Button, DragPadToggle, DropdownButton, Input } from "@zoeymind/ui"
import type { TrackKind } from "@zoeydaw/project-core/types"
import { useControlInteractions } from "@/shared/control-interactions"
import { projectActions, useProjectState } from "../adapters"
import type { PreviewKind } from "./fixtures"
import { PREVIEW_SCENARIOS } from "./scenarios"
import type { PreviewScenario } from "./scenarios"

export function PreviewToolbar({
  kind,
  query,
  onQueryChange,
  scenario,
  onScenarioChange,
  selectedKind,
  timelineOpen,
  onTimelineChange,
  reset,
}: {
  readonly kind: PreviewKind
  readonly query: string
  readonly onQueryChange: (value: string) => void
  readonly scenario: PreviewScenario
  readonly onScenarioChange: (value: PreviewScenario) => void
  readonly selectedKind: TrackKind | undefined
  readonly timelineOpen: boolean
  readonly onTimelineChange: (value: boolean) => void
  readonly reset: () => void
}) {
  const { t } = useTranslation()
  const playing = useProjectState(state => state.session.playing)
  const mappingActive = useControlInteractions(state => state.mappingActive)
  const setMappingActive = useControlInteractions(state => state.setMappingActive)
  const editorFocused =
    kind === "audio" || kind === "piano-roll" || kind === "devices" || kind === "track-editor"
  return (
    <header className="gap-control-gap border-border flex shrink-0 flex-wrap items-center border-b p-2 [--spacing-control-h:var(--spacing-control-compact)] [--text-control:var(--text-control-compact)]">
      <h1 className="text-sm font-medium">{t(`galleryProject.kind.${kind}`)}</h1>
      <Badge
        variant="secondary"
        title={t("galleryProject.isolation")}
        data-gallery-preview-isolation
      >
        {t("galleryProject.localDemo")}
      </Badge>
      <Input
        data-gallery-preview-search
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        placeholder={t("galleryProject.search")}
        aria-label={t("galleryProject.search")}
        className="h-control-compact max-w-52 text-xs"
      />
      {!editorFocused && (
        <DropdownButton
          className="gallery-preview-scenario"
          value={scenario}
          onChange={onScenarioChange}
          label={t("galleryProject.scenario")}
          size="compact"
          items={PREVIEW_SCENARIOS.map(id => ({
            id,
            label: t(`galleryProject.scenarios.${id}`),
            disabled: selectedKind === "main" && (id === "muted" || id === "solo"),
          }))}
        />
      )}
      {editorFocused && (
        <DragPadToggle
          className="gallery-preview-timeline-toggle"
          value={timelineOpen}
          onChange={onTimelineChange}
          label={t("galleryProject.timeline")}
          labelOn={t("galleryProject.timeline")}
          labelOff={t("galleryProject.timeline")}
          mappable={false}
          size="compact"
        />
      )}
      <Button size="control" variant="ghost" onClick={projectActions.togglePlay}>
        {t(playing ? "galleryProject.stop" : "galleryProject.play")}
      </Button>
      <Button size="control" variant="ghost" onClick={projectActions.undo}>
        {t("galleryProject.undo")}
      </Button>
      <Button size="control" variant="ghost" onClick={projectActions.redo}>
        {t("galleryProject.redo")}
      </Button>
      {kind === "automation" && (
        <DragPadToggle
          className="gallery-preview-mapping"
          value={mappingActive}
          onChange={setMappingActive}
          label={t("galleryProject.mapping")}
          labelOn={t("galleryProject.mapping")}
          labelOff={t("galleryProject.mapping")}
          mappable={false}
          size="compact"
        />
      )}
      <Button data-gallery-preview-reset size="control" variant="ghost" onClick={reset}>
        {t("galleryProject.reset")}
      </Button>
    </header>
  )
}
