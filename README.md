# Chladni Plate Studio

Simulate the classic **Chladni plate** experiment: sand scattered on a vibrating
plate migrates to the nodal lines (the points that don't move), forming intricate
symmetric patterns. This studio models thousands of sand grains as particles that
random-walk downhill on the plate's displacement field, so real-looking patterns
emerge live.

## Concept

- **Square plate** mode uses the eigenfunction blend
  `mix·cos(mπx)cos(nπy) + (1−mix)·cos(nπx)cos(mπy)`.
- **Circular plate** mode approximates Bessel-function eigenmodes `J_m(k·r)·cos/sin(mθ)`
  using a series approximation for `J_m`.
- Particles estimate the local gradient of `|displacement|` and step toward zeros,
  with thermal jitter — the same physics intuition as real cymatics.
- Web Audio plays a tone whose pitch maps to the current mode, for the full
  "frequency drives the pattern" feel.

## Run

Open `index.html` in a browser (double-click, or `python3 -m http.server` in this
folder and visit http://localhost:8000). No build step, no dependencies, no network.

## Controls

- **Vibration mode buttons** (A1–D3): jump to classic mode pairs.
- **m / n / mix sliders**: tune the eigenmode composition live.
- **Plate shape**: square ↔ circular (Bessel) modes.
- **Grain count / Shake**: rescatter the sand (spacebar also shakes).
- **Drag on the canvas**: sweep the mix parameter to morph patterns.
- **Export PNG**: save the current plate as an image.
- **Play tone**: hear the (pitch-mapped) mode via Web Audio.

Everything is client-side vanilla JS — a single canvas, one file of logic.
