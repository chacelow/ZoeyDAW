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
