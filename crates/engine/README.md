# Engine routing

## Solo Return

Soloing a Return keeps the upstream audio routes required to feed it, including group routing and pre/post-fader sends. Only the selected Return's output route reaches Main; unrelated dry outputs and other Returns are suppressed. Mute and Mixer faders still apply. Multiple soloed Returns are audible together. When normal Audio/Group Solo and Return Solo are both active, normal Solo still limits the source tracks feeding the Return, but Return Solo takes precedence over their dry outputs. Without Return Solo, normal Solo retains its existing dry-output and Send behavior.

A Clip's gain is ordinary dB gain. Mixer volume and Send controls reserve their minimum endpoint (`-60 dB`, displayed as `−∞`) for exact silence.

## Local audio source paths

Plain local paths remain unchanged. `file:` URIs are parsed by the workspace's existing `url` 2.5.8 dependency and converted using `Url::to_file_path`: Windows drive URIs (`file:///C:/Audio/clip.wav`), UNC authorities (`file://server/share/clip.wav`), localhost and percent-escaped Unicode paths use the target OS's native path rules. Non-file remote URLs are rejected. Malformed/truncated percent escapes remain errors; Unix file URIs with non-UTF-8 decoded paths remain rejected as before.

Scoped regressions: `cargo test --locked -p zoeydaw-engine path_tests`. On Windows this includes the `C:/` regression and UNC/escaped-path checks; macOS retains its Unix path assertions. To prove the tests detect raw URL-path conversion, set an absolute private `CARGO_TARGET_DIR`, then run `node crates/native/verification/mutations.mjs W1-file-uri`. This is a proposal until executed; Windows runtime and audio-device behavior require Windows validation.
