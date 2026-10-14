# Arrangement tracks

## Routing legality

`project/model/track-routing.ts` owns `canRouteTrack(sourceId, destinationId, tracks)` and `routingDestinations(track, tracks)`. Both the routing menu and `adapters/runtime/track-routing.ts` use the same decision. Internal targets must be Group or Main, cannot be the source or its descendant, and cannot close an output cycle. `none` and `external` remain legal terminal destinations. Checking candidates does not alter the document.

2026-10-15 verification:

| Command / scenario | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` in `apps/gpuix` | 0 diagnostics |
| `bun test src/project/model/track-routing.test.ts src/project/model/project.test.ts` | 17 pass, 0 fail, 185917 assertions |
| Authored command smoke with Group and Audio | Audio routes into Group; invalid Group-to-Audio route is rejected; Group candidates contain only Main |
| Fixed-seed random grouping trees | 200 trees, 17 tracks each; candidate membership agrees with command acceptance; input tracks unchanged |
| Mutation: accept a descendant | 1 failing test; restored |
| Mutation: accept an output cycle | 1 failing test; restored |

The routing increment does not connect an engine or create a second project state owner.

## Semantic track colors

`ThemeColors` now exposes `meterGood`, `meterWarn`, `meterDanger`, `meterPeak`, `arrangementFadeMask` and `arrangementLine` for both appearances. Existing palette values are unchanged. The initial semantic values preserve the Web prototype's existing meter and surface colors; they do not claim a measured Live meter-color match.

The four coordinator-provided Live frames at `/tmp/live-meter/` are 1280×525 scaled captures. A 4× crop of `(1070,60,150,220)` shows routing input activity but no illuminated output meter bars; yellow/red, peak strips and output-meter separator widths cannot be sampled reliably from these frames. This limitation was reported to the coordinator rather than substituting the input indicator's green.

`bun test src/shared/theme/track-colors.test.ts`: 2 pass, 0 fail. Both appearances provide non-empty parseable native color literals, distinct green/yellow/red levels, a half-opacity fade mask and a line distinct from the peak marker. Full `pnpm exec tsc --noEmit`: 0 diagnostics.

## Native stereo meters

`meter/TrackMeter.tsx` reads only the injected `TelemetryReader` (`() => BackendTelemetry | null`). Missing tracks and disconnected telemetry remain at the existing B1 display floor. C1's −120 dBFS silence is clamped for display by the shared `meterDb` function; no simulated levels or second transport clock are introduced. Peak state is local, non-serialized and reset on backend session changes. Hold and fall behavior reuse `core/meters/meter-peak.ts`.

`TrackTelemetryProvider` owns one accepted-level subscription for the row surface. `createMeterDecayDriver(FrameSource, now)` lazily shares one frame source across all mounted meters, coalesces repeated telemetry wakes, and stops on silence or last unmount. The currently approved default is a temporary 30fps timer chain; F1's native frame source will replace only that default. Importing the module starts no timer. Zero-dB and stereo cutouts use `theme.colors.card` rather than a contrast outline.

`TrackLabels` is injected, with paired Chinese/English resources in `locales.ts`; no i18n dependency or second language state was added to project components.

### Exercised proof before shared-renderer integration

- `bun test src/project/sections/arrangement/tracks/meter`: 5 pass, 0 fail, 34 assertions.
- Real C1 window: AX playback changed Stopped → Playing; Audio reported L −23.0 / R −27.0 dBFS, Group L −26.0 / R −28.5, Return L −38.0 / R −45.0. A real authored Clip gain change to 24 dB produced Audio L +1.0 / R −1.8 dBFS while Main remained at low output level.
- Evidence: `evidence/2026-10-15-real-meter-playing.ax.txt` and `evidence/2026-10-15-real-meter-overload.ax.txt`.
- The display layout changed during this run; screenshots were black and a display capture reported `InvalidCoordinateFrame`. AX proves the command/telemetry path, not the missing meter pixels. The service was killed after 1m55s; visual meter-state verification remains pending.
