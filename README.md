# Spray Paint Cursor

An interactive spray-paint canvas effect for any web page. Hold and drag to spray, release to stop. Paint persists on the page and layers with CSS multiply blending.

---

## Features

- **Dense spray** — fine particle mist with a solid centre, matching real aerosol paint
- **Alternating colours** — each new click toggles between `#383BFE` (blue) and `#EF2006` (red)
- **CSS multiply blend** — paint layers darken each other and interact with page content beneath
- **Gravity drips** — paint drips appear after holding still; tapered line with a round bead tip, varying lengths
- **ASMR aerosol sound** — soft bandpass-filtered white noise plays while pressing, fades in/out smoothly
- **Touch support** — works on mouse and touch (mobile/tablet)
- **Zero dependencies** — vanilla JS, no libraries or build step required

---

## Quick Start

### Plain HTML

Add the script anywhere in your page — just before `</body>` is fine:

```html
<script src="spray.min.js"></script>
```

Or inline it directly:

```html
<script>
  /* paste contents of spray.min.js here */
</script>
```

That's it. The effect attaches itself to the page automatically.

### Framer

1. Add an **Embed** component anywhere on the canvas (size doesn't matter — `1×1 px` works)
2. Switch it to **HTML** mode
3. Paste the contents of `spray.min.js` wrapped in a `<script>` tag
4. Publish

### Webflow

Paste the `<script>` block into **Page Settings → Custom Code → Before `</body>` tag**.

### Other platforms

Any platform that lets you inject a `<script>` tag into the page HTML will work — Squarespace code injection, Wix HTML embed, WordPress custom HTML block, Next.js `<Script>`, etc.

---

## How It Works

The script injects a full-viewport `<canvas>` fixed above page content (`z-index: 1`, `pointer-events: none`, `mix-blend-mode: multiply`). It listens for global mouse/touch events and draws spray particles and drip physics directly onto the canvas each animation frame.

The canvas is **persistent** — paint accumulates across strokes. Page refresh resets it.

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

Colours alternate on each new press and are defined as `[R, G, B]` arrays:

```js
var COLORS = [
  [56,  59,  254],  // #383BFE — blue
  [239, 32,  6  ],  // #EF2006 — red
];
```

Add more entries to cycle through more than two colours. Change values to any `[R, G, B]` to customise.

### Sound

The aerosol hiss uses the Web Audio API. It requires a user interaction to unlock the audio context (browser autoplay policy) — the first click does this automatically. Sound is silently skipped if the browser blocks it.

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
| `spray.min.js` | Minified build — use this in production |

To rebuild `spray.min.js` after editing `spray.js` (requires Node.js):

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
- Canvas 2D context
- Web Audio API *(optional — effect works without sound if unavailable)*
- CSS `mix-blend-mode: multiply`
- `requestAnimationFrame`
- Capture-phase event listeners

---

## Q&A

**The sound doesn't play.**
Browsers require a user gesture before allowing audio. The script handles this automatically — the first click unlocks the audio context. If sound still doesn't play, the browser may have autoplay fully blocked (common in some private/incognito modes). The visual effect continues to work regardless.

**Clicks and links stop working after adding the script.**
The canvas sits above page content but has `pointer-events: none`, so all interactions should pass straight through. If something breaks, check whether another element (e.g. a Framer overlay or a modal) is intercepting clicks — the script doesn't affect those.

**The paint covers my navigation or header.**
Your nav's `z-index` may be lower than `1`. Set it to `2` or higher and it will sit above the canvas.

**The background colour looks wrong or the page turns white.**
The script moves the `body` background colour to `<html>` so it shows through the multiply-blended canvas. If your background is set via a CSS class on `body` (rather than inline style), this transfer won't pick it up — manually set `html { background: <your-colour>; }` in your stylesheet.

**Multiply blend makes the colours look dark or muddy.**
Multiply blending works best on light backgrounds — on white it's invisible, on light grey it gives vivid paint. On dark backgrounds, open `spray.js` and change `s.mixBlendMode = 'multiply'` to `'screen'` or `'normal'` for a different result.

**How do I disable the sound?**
In `spray.js`, remove the `startSound()` call from `onDown` / `onTouchStart` and the `stopSound()` call from `onUp` / `onTouchEnd`. Rebuild `spray.min.js`.

**How do I clear the canvas?**
Page refresh resets all paint. There's no built-in clear button — add one by calling `ctx.clearRect(0, 0, canvas.width, canvas.height)` on whatever trigger you like (e.g. a double-click, a keyboard shortcut, or a button).

**The effect doesn't show in the Framer canvas editor.**
Framer's editor sandboxes embed components. The effect will work correctly on the published site — test there.
