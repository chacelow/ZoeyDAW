# CLI and package measurements

Measurement host: Windows x64. Commands ran from the repository root.

## Package sizes

| Artifact | Size | Measurement |
| --- | --: | --- |
| `target/release/zoeydaw.exe` | 40,233,984 bytes, 38.370 MiB | Release Tauri executable |
| `target/release/bundle/msi/zoeydaw_0.0.0_x64_en-US.msi` | 17,963,532 bytes, 17.131 MiB | MSI bundle |
| `target/release/bundle/nsis/zoeydaw_0.0.0_x64-setup.exe` | 13,494,913 bytes, 12.870 MiB | NSIS installer |
| `target/release/zoeydaw-cli.exe` | 16,873,984 bytes, 16.092 MiB | Release CLI executable |
| `apps/web/dist/` | 3,034,461 bytes, 2.894 MiB | Built Web distribution, all files |

The Web distribution is 17.0% of the MSI size and 22.5% of the NSIS installer size. The CLI executable is 42.0% of the Tauri executable size.

## Build timings

| Command | Elapsed time | Result |
| --- | --: | --- |
| `cargo build -p zoeydaw-cli --release --locked` | 11.637 s | Passed |
| `pnpm --filter @zoeydaw/web build` | 14.20 s | Passed |
| `pnpm tauri build` | 213.286 s | Bundles were produced; the command exited nonzero during signing because `TAURI_SIGNING_PRIVATE_KEY` was unavailable |

The Tauri build produced both installer files before the signing error. No signing result is claimed.

## Runtime measurement status

A valid CLI runtime benchmark was not recorded. Starting the Windows CLI binary returned `STATUS_ORDINAL_NOT_FOUND` from the host MSVC runtime loader before application code ran. The failure also affects the packaged native executable path. Build time is not used as a runtime-performance proxy, and no runtime percentage is reported without a valid sample.

The existing native and project checks remain separate evidence. `cargo test -p zoeydaw-project --locked` passed 30 tests. The project-core suite passed 228 tests and its typecheck passed. `pnpm check:boundaries` passed. These prove behavior and dependency contracts, not process startup latency.

To complete runtime percentages, run the same CLI and packaged-app scenarios on a host with a matching MSVC runtime, then record wall time, process startup time, native callback budget, queue depth, PCM or meter latency, and resource release time in this file.
