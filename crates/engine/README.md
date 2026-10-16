# Engine routing

## Solo Return

Soloing a Return keeps the upstream audio routes required to feed it, including group routing and pre/post-fader sends. Only the selected Return's output route reaches Main; unrelated dry outputs and other Returns are suppressed. Mute and Mixer faders still apply. Multiple soloed Returns are audible together. When normal Audio/Group Solo and Return Solo are both active, normal Solo still limits the source tracks feeding the Return, but Return Solo takes precedence over their dry outputs. Without Return Solo, normal Solo retains its existing dry-output and Send behavior.

A Clip's gain is ordinary dB gain. Mixer volume and Send controls reserve their minimum endpoint (`-60 dB`, displayed as `−∞`) for exact silence.
