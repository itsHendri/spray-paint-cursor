# Spray Paint Cursor

An interactive spray-paint canvas effect for Framer sites. Hold and drag to spray, release to stop. Paint persists on the page and layers with CSS multiply blending.

![Spray paint effect with alternating blue and red strokes](https://github.com/itshendri/spray-paint-cursor/raw/main/preview.png)

---

## Features

- **Dense spray** — fine particle mist with a solid centre, matching real aerosol paint
- **Alternating colours** — each new click toggles between `#383BFE` (blue) and `#EF2006` (red)
- **CSS multiply blend** — paint layers darken each other and interact with page content beneath
- **Gravity drips** — paint drips appear after holding still; tapered line with a round bead tip, varying lengths
- **ASMR aerosol sound** — soft bandpass-filtered white noise plays while pressing, fades in/out smoothly
- **Touch support** — works on mobile and tablet

---

## Quick Start (Framer)

1. In Framer, add an **Embed** component anywhere on the page (size doesn't matter — use `1×1 px`)
2. Set it to **HTML** mode
3. Paste the contents of [`spray.min.js`](./spray.min.js) wrapped in a `<script>` tag:

```html
<script>
<!-- paste spray.min.js content here -->
</script>
```

4. Publish — the effect is live.

> **Tip:** The embed element's pointer-events are automatically neutralised by the script, so it won't block clicks on your Framer components.

---

## How It Works

The script injects a full-viewport `<canvas>` fixed behind all page content (`z-index: 1`, `pointer-events: none`, `mix-blend-mode: multiply`). It listens for global mouse/touch events and draws spray particles and drip physics directly onto the canvas each animation frame.

The canvas is **persistent** — paint accumulates across strokes. There is no clear/reset button by design; page refresh resets it.

---

## Configuration

All tuneable values live in the `CFG` object at the top of `spray.js`:

### Spray particles

| Key | Default | Description |
|---|---|---|
| `baseRate` | `75` | Particles emitted per frame while moving |
| `maxRate` | `200` | Particles per frame when holding still (density build-up) |
| `baseRadius` | `36` | Spray radius in px |
| `speedSpread` | `0.4` | How much faster movement widens the spray |
| `minDot` / `maxDot` | `0.6` / `2.4` | Particle dot size range (px) |
| `minAlpha` / `maxAlpha` | `0.55` / `0.95` | Particle opacity range |

### Drips

| Key | Default | Description |
|---|---|---|
| `dripDelay` | `1500` | Milliseconds of holding still before first drip spawns |
| `maxDrips` | `3` | Max simultaneous drips per hold |
| `dripGravity` | `0.14` | Gravity acceleration per frame |
| `dripFriction` | `0.98` | Velocity damping (lower = slower terminal speed) |
| `dripDrift` | `0.008` | Lateral wobble per frame |
| `dripMaxLen` | `75` | Max drip length in frames (25–100% randomised per drip) |
| `dripHeadWidth` | `14` | Line width at the top of the drip (px) |
| `dripTailWidth` | `2` | Line width at the tip of the drip (px) |
| `dripAlpha` | `0.88` | Drip opacity |

### Colours

Colours are defined in the `COLORS` array and alternate on each new press:

```js
var COLORS = [
  [56,  59,  254],  // #383BFE — blue
  [239, 32,  6  ],  // #EF2006 — red
];
```

Change either entry to any `[R, G, B]` value to swap colours.

### Sound

The aerosol hiss uses Web Audio API white noise through a bandpass filter. It requires the first interaction to unlock the audio context (browser autoplay policy). Sound is silently skipped if the browser blocks it.

| Parameter | Value | Effect |
|---|---|---|
| Bandpass frequency | 2200 Hz | Soft whisper tone |
| Q | 1.2 | Narrow, resonant |
| Gain | 0.07 | Quiet — ASMR level |
| Fade in | 250 ms | Smooth press |
| Fade out | 200 ms | Smooth release |

---

## Files

| File | Description |
|---|---|
| `spray.js` | Readable source — edit this |
| `spray.min.js` | Minified build — paste into Framer |

To rebuild the minified file after editing `spray.js`, run:

```bash
node -e "
const fs = require('fs');
let src = fs.readFileSync('spray.js', 'utf8');
let min = src
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\n\s*/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s*([{}();,=+\-*\/<>!&|?:])\s*/g, '\$1')
  .trim();
fs.writeFileSync('spray.min.js', min);
"
```

---

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Uses:
- `canvas` 2D context
- `Web Audio API` (optional — effect works without sound if unavailable)
- `CSS mix-blend-mode: multiply`
- `requestAnimationFrame`
- Capture-phase event listeners
