import { useTranslation } from "@zoeymind/i18n"
import { Button, DragPadToggle, DropdownButton, Input } from "@zoeymind/ui"
import type { Track, TrackKind } from "@zoeydaw/project-core/types"
import { projectActions } from "../adapters"

const TRACK_KINDS: readonly TrackKind[] = ["audio", "midi", "group", "return", "main"]
const COLORS = ["amber", "cyan", "green", "rose", "violet"] as const
const COLOR_VALUES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function PreviewTrackControls({
  selected,
  matches,
  tracks,
  chooseTrack,
  showMixControls,
}: {
  readonly selected: Track
  readonly matches: readonly Track[]
  readonly tracks: readonly Track[]
  readonly chooseTrack: (id: string) => void
  readonly showMixControls: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      <DropdownButton<TrackKind>
        className="gallery-preview-track-kind"
        value={selected.kind}
        onChange={value => {
          const track =
            matches.find(item => item.kind === value) ?? tracks.find(item => item.kind === value)
          if (track) chooseTrack(track.id)
        }}
        label={t("galleryProject.track")}
        size="compact"
        items={TRACK_KINDS.map(id => ({ id, label: t(`galleryProject.trackKinds.${id}`) }))}
      />
      <DropdownButton
        className="gallery-preview-track"
        value={selected.id}
        onChange={chooseTrack}
        label={t("galleryProject.selectedTrack")}
        size="compact"
        items={matches.map(track => ({ id: track.id, label: track.name }))}
      />
      <Input
        aria-label={t("galleryProject.trackName")}
        value={selected.name}
        onChange={event => projectActions.updateTrack(selected.id, { name: event.target.value })}
        className="h-control-compact max-w-36 text-xs"
      />
      <DropdownButton
        value={selected.color}
        onChange={color => projectActions.updateTrack(selected.id, { color })}
        label={t("galleryProject.trackColor")}
        size="compact"
        items={COLORS.map((name, index) => ({
          id: COLOR_VALUES[index] ?? "var(--primary)",
          label: t(`galleryProject.colors.${name}`),
        }))}
      />
      {showMixControls && (
        <>
          <DragPadToggle
            value={!!selected.collapsed}
            onChange={collapsed => projectActions.updateTrack(selected.id, { collapsed })}
            label={t("galleryProject.fold")}
            labelOn={t("galleryProject.fold")}
            labelOff={t("galleryProject.expand")}
            size="compact"
          />
          <DragPadToggle
            value={selected.mute}
            onChange={mute => projectActions.updateTrack(selected.id, { mute })}
            disabled={selected.kind === "main"}
            label={t("galleryProject.mute")}
            labelOn={t("galleryProject.mute")}
            labelOff={t("galleryProject.mute")}
            size="compact"
          />
          <DragPadToggle
            value={selected.solo}
            onChange={solo => projectActions.updateTrack(selected.id, { solo })}
            disabled={selected.kind === "main"}
            label={t("galleryProject.solo")}
            labelOn={t("galleryProject.solo")}
            labelOff={t("galleryProject.solo")}
            size="compact"
          />
          <DragPadToggle
            value={selected.armed}
            onChange={armed => projectActions.updateTrack(selected.id, { armed })}
            disabled={selected.kind !== "audio" && selected.kind !== "midi"}
            label={t("galleryProject.arm")}
            labelOn={t("galleryProject.arm")}
            labelOff={t("galleryProject.arm")}
            size="compact"
          />
        </>
      )}
    </>
  )
}

export function PreviewClipControls({
  selected,
  clipChoices,
  clip,
  onOpenEditor,
}: {
  readonly selected: Track | undefined
  readonly clipChoices: readonly Track["clips"][number][]
  readonly clip: Track["clips"][number] | undefined
  readonly onOpenEditor: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {!!clipChoices.length && (
        <DropdownButton
          className="gallery-preview-clip"
          value={clip?.id ?? ""}
          onChange={id => {
            onOpenEditor()
            projectActions.selectClips([id])
            projectActions.setEditingClip(id)
          }}
          label={t("galleryProject.selectedClip")}
          size="compact"
          renderValue={item => item?.label ?? t("galleryProject.chooseClip")}
          items={clipChoices.map(item => ({
            id: item.id,
            label: `${item.label ?? item.kind} · ${t(item.kind === "audio" ? "detail.audioClip" : item.kind === "midi" ? "detail.midiClip" : "detail.patternClip")}`,
          }))}
        />
      )}
      {clip && (
        <DropdownButton
          className="gallery-preview-clip-color"
          value={clip.color ?? "inherit"}
          onChange={value =>
            projectActions.updateClip(clip.id, {
              color: value === "inherit" ? undefined : value,
            })
          }
          label={t("galleryProject.clipColor")}
          size="compact"
          items={[
            { id: "inherit", label: t("galleryProject.inherit") },
            ...COLORS.map((name, index) => ({
              id: COLOR_VALUES[index] ?? "var(--primary)",
              label: t(`galleryProject.colors.${name}`),
            })),
          ]}
        />
      )}
      {!clip && !!selected?.clips.length && (
        <Button
          size="control"
          variant="ghost"
          onClick={() => {
            onOpenEditor()
            projectActions.setEditingClip(selected.clips[0]?.id ?? null)
          }}
        >
          {t("galleryProject.chooseClip")}
        </Button>
      )}
    </>
  )
}
