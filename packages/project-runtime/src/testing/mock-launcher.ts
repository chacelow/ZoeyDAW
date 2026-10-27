import type {
  BackendLauncherSnapshot,
  BackendLaunchRequest,
  BackendState,
} from "@zoeydaw/project-core/backend"

export function createMockLauncher() {
  const tracks = new Map<
    string,
    {
      source: "arrangement" | "launcher"
      clipId: string | null
      pending: { clipId: string | null; at: number } | null
    }
  >()
  function read(state: BackendState, sessionId: string, sequence: number): BackendLauncherSnapshot {
    const now = performance.now()
    return {
      sessionId,
      sequence,
      tracks: state.project.tracks
        .filter(track => track.kind === "audio" || track.kind === "midi")
        .map(track => {
          const playback = tracks.get(track.id)
          if (playback?.pending && playback.pending.at <= now) {
            playback.clipId = playback.pending.clipId
            playback.pending = null
          }
          if (!state.control.playing && playback) {
            playback.clipId = null
            playback.pending = null
          }
          return {
            trackId: track.id,
            source: playback?.source ?? "arrangement",
            slots: (track.clipSlots ?? []).map(slot => ({
              sceneId: slot.sceneId,
              clipId: slot.clip.id,
              playing: state.control.playing && playback?.clipId === slot.clip.id,
              queued: !playback?.pending
                ? null
                : playback.pending.clipId === slot.clip.id
                  ? "play"
                  : playback.clipId === slot.clip.id
                    ? "stop"
                    : null,
            })),
          }
        }),
    }
  }
  return {
    read,
    clear: () => tracks.clear(),
    valid(request: BackendLaunchRequest, state: BackendState): boolean {
      const command = request.command
      if (command.kind === "arrangement" || command.kind === "stopAll") return true
      if (command.kind === "scene")
        return state.project.launcher?.scenes.some(scene => scene.id === command.sceneId) ?? false
      const track = state.project.tracks.find(
        track => track.id === command.trackId && (track.kind === "audio" || track.kind === "midi")
      )
      return (
        !!track &&
        (command.kind === "stopTrack" ||
          !!track.clipSlots?.some(slot => slot.sceneId === command.sceneId))
      )
    },
    apply(request: BackendLaunchRequest, state: BackendState, bar: number) {
      const command = request.command
      const fractions = {
        none: 0,
        eightBars: 8,
        fourBars: 4,
        twoBars: 2,
        bar: 1,
        half: 0.5,
        quarter: 0.25,
        eighth: 0.125,
        sixteenth: 0.0625,
      }
      const quantum = request.quantize
        ? fractions[state.project.launcher?.quantization ?? "bar"]
        : 0
      const delta = quantum ? Math.ceil((bar - 1) / quantum) * quantum - (bar - 1) : 0
      const at =
        performance.now() +
        (delta * 240000 * state.project.numerator) / (state.project.bpm * state.project.denominator)
      for (const track of state.project.tracks) {
        if (track.kind !== "audio" && track.kind !== "midi") continue
        if (
          (command.kind === "clip" || command.kind === "stopTrack") &&
          track.id !== command.trackId
        )
          continue
        if (command.kind === "arrangement") {
          tracks.delete(track.id)
          continue
        }
        const clipId =
          command.kind === "clip" || command.kind === "scene"
            ? (track.clipSlots?.find(slot => slot.sceneId === command.sceneId)?.clip.id ?? null)
            : null
        const previous = tracks.get(track.id)
        tracks.set(track.id, {
          source: "launcher",
          clipId: previous?.clipId ?? null,
          pending: { clipId, at },
        })
      }
    },
  }
}
