import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "@zoeymind/i18n"
import { useControlInteractions } from "@/shared/control-interactions"
import {
  configureProjectBackend,
  projectActions,
  startProjectRuntime,
  useProjectState,
} from "../adapters"
import { hydrateState } from "../adapters/context"
import { createMockProjectBackend } from "@zoeydaw/project-runtime/testing"
import { trackHeight } from "../layout/track"
import { visibleTracks } from "@zoeydaw/project-core/types"
import type { Track } from "@zoeydaw/project-core/types"
import { createGallerySeed, parsePreviewKind } from "./fixtures"
import { useGalleryEditorSelection } from "./useGalleryEditorSelection"
import type { GalleryFixtureNames, PreviewKind } from "./fixtures"
import { PreviewToolbar } from "./PreviewToolbar"
import { applyPreviewScenario } from "./scenarios"
import type { PreviewScenario } from "./scenarios"
import { PreviewTrackControls, PreviewClipControls } from "./PreviewSelectionControls"
import { PreviewContent } from "./PreviewContent"
import "../project.css"

function revealTrack(track: Track) {
  const state = useProjectState.getState()
  const ancestors = new Set<string>()
  let parent = state.document.tracks.find(item => item.childTrackIds?.includes(track.id))
  while (parent && !ancestors.has(parent.id)) {
    const parentId = parent.id
    ancestors.add(parentId)
    parent = state.document.tracks.find(item => item.childTrackIds?.includes(parentId))
  }
  const token = projectActions.beginEdit()
  for (const id of ancestors) projectActions.updateTrack(id, { collapsed: false })
  projectActions.endEdit(token)
  projectActions.selectTracks([track.id], "header")
  const current = visibleTracks(useProjectState.getState().document.tracks)
  const index = current.findIndex(item => item.id === track.id)
  projectActions.setViewport({
    scrollY: current
      .slice(0, Math.max(0, index))
      .reduce(
        (height, item) =>
          height + (item.kind === "return" || item.kind === "main" ? 0 : trackHeight(item)),
        0
      ),
  })
}

function PreviewSession({
  kind,
  invalid,
}: {
  readonly kind: PreviewKind
  readonly invalid: boolean
}) {
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    const names: GalleryFixtureNames = {
      project: t("galleryProject.fixtures.project"),
      ensemble: t("galleryProject.fixtures.ensemble"),
      drums: t("galleryProject.fixtures.drums"),
      percussion: t("galleryProject.fixtures.percussion"),
      synths: t("galleryProject.fixtures.synths"),
      lead: t("galleryProject.fixtures.lead"),
      keys: t("galleryProject.fixtures.keys"),
      returnA: t("galleryProject.fixtures.returnA"),
      returnB: t("galleryProject.fixtures.returnB"),
      main: t("galleryProject.fixtures.main"),
      audio: t("galleryProject.fixtures.audio"),
      midi: t("galleryProject.fixtures.midi"),
      pattern: t("galleryProject.fixtures.pattern"),
      intro: t("galleryProject.fixtures.intro"),
      verse: t("galleryProject.fixtures.verse"),
      emptyAudio: t("galleryProject.fixtures.emptyAudio"),
      reverseAudio: t("galleryProject.fixtures.reverseAudio"),
      emptyMidi: t("galleryProject.fixtures.emptyMidi"),
      emptyPattern: t("galleryProject.fixtures.emptyPattern"),
    }
    const unregister = configureProjectBackend(createMockProjectBackend)
    hydrateState(createGallerySeed(kind, names))
    const defaultId =
      kind === "piano-roll" ? "gallery-midi" : kind === "groups" ? "ensemble" : "gallery-audio"
    const track = useProjectState.getState().document.tracks.find(item => item.id === defaultId)
    if (track) {
      revealTrack(track)
      if (kind !== "groups" && kind !== "tracks" && kind !== "devices" && kind !== "automation") {
        projectActions.setEditingClip(track.clips[0]?.id ?? null)
      }
    }
    // This route never registers project storage or a production/native backend.
    const stop = startProjectRuntime()
    const preventSave = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener("keydown", preventSave, { capture: true })
    setReady(true)
    return () => {
      window.removeEventListener("keydown", preventSave, true)
      projectActions.stop()
      projectActions.cancelEdit()
      stop()
      unregister()
    }
  }, [kind, generation, t])
  return ready ? (
    <PreviewSurface
      kind={kind}
      invalid={invalid}
      reset={() => {
        setReady(false)
        setGeneration(value => value + 1)
      }}
    />
  ) : (
    <p role="status">{t("galleryProject.loading")}</p>
  )
}

function PreviewSurface({
  kind,
  invalid,
  reset,
}: {
  readonly kind: PreviewKind
  readonly invalid: boolean
  readonly reset: () => void
}) {
  const { t } = useTranslation()
  const tracks = useProjectState(state => state.document.tracks)
  const selectedIds = useProjectState(state => state.session.selectedTrackIds)
  const editingId = useProjectState(state => state.session.editingClipId)
  const setMappingActive = useControlInteractions(state => state.setMappingActive)
  useEffect(() => () => setMappingActive(false), [setMappingActive])
  const [query, setQuery] = useState("")
  const [scenario, setScenario] = useState<PreviewScenario>("expanded")
  const editorFocused =
    kind === "audio" || kind === "piano-roll" || kind === "devices" || kind === "track-editor"
  const [timelineOpen, setTimelineOpen] = useState(!editorFocused)
  const [editorOpen, setEditorOpen] = useState(
    kind === "audio" || kind === "piano-roll" || kind === "track-editor"
  )
  useGalleryEditorSelection(kind, editorOpen)
  const selected = tracks.find(track => selectedIds.includes(track.id)) ?? tracks[0]
  const clipOwner = tracks.find(track => track.clips.some(clip => clip.id === editingId))
  const clip = editorOpen ? clipOwner?.clips.find(item => item.id === editingId) : undefined
  const search = query.trim().toLocaleLowerCase()
  const matches = tracks.filter(track =>
    `${track.name} ${t(`galleryProject.trackKinds.${track.kind}`)} ${track.clips.map(item => item.label ?? item.kind).join(" ")}`
      .toLocaleLowerCase()
      .includes(search)
  )
  const clipChoices = (selected?.clips ?? []).filter(
    item =>
      !search || `${selected?.name} ${item.label ?? item.kind}`.toLocaleLowerCase().includes(search)
  )
  const chooseTrack = (id: string) => {
    const track = tracks.find(item => item.id === id)
    if (!track) return
    revealTrack(track)
    if (editorOpen) projectActions.setEditingClip(track.clips[0]?.id ?? null)
  }
  const applyScenario = (value: PreviewScenario) => {
    setScenario(value)
    applyPreviewScenario(value, tracks, selected)
  }
  return (
    <main
      data-gallery-project-preview={kind}
      data-preview-isolated="true"
      className="bg-background text-foreground flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <PreviewToolbar
        kind={kind}
        query={query}
        onQueryChange={setQuery}
        scenario={scenario}
        onScenarioChange={applyScenario}
        selectedKind={selected?.kind}
        timelineOpen={timelineOpen}
        onTimelineChange={setTimelineOpen}
        reset={reset}
      />
      {invalid && (
        <p role="alert" className="text-destructive px-2 text-xs">
          {t("galleryProject.invalidKind")}
        </p>
      )}
      <div className="gap-control-gap border-border flex shrink-0 flex-wrap items-center border-b px-2 pb-2">
        {selected && (
          <PreviewTrackControls
            selected={selected}
            matches={matches}
            tracks={tracks}
            chooseTrack={chooseTrack}
            showMixControls={!editorFocused || timelineOpen}
          />
        )}
        {!matches.length && (
          <span role="status" className="text-muted-foreground text-xs">
            {t("galleryProject.noMatches")}
          </span>
        )}
        {kind !== "devices" && (
          <PreviewClipControls
            selected={selected}
            clipChoices={clipChoices}
            clip={clip}
            onOpenEditor={() => setEditorOpen(true)}
          />
        )}
      </div>
      <PreviewContent
        kind={kind}
        timelineOpen={timelineOpen}
        editorOpen={editorOpen}
        selected={selected}
        clip={clip}
      />
    </main>
  )
}

export function GalleryProjectPreview() {
  const { kind: requested } = useParams()
  const kind = parsePreviewKind(requested)
  return <PreviewSession key={kind} kind={kind} invalid={requested !== kind} />
}
