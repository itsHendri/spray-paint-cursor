(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  var CFG = {
    color:            '#574CFF',
    // Particles per frame while spraying
    baseRate:         12,
    // Max extra particles when holding still (density buildup)
    maxRate:          40,
    // Radius of the spray cone (px)
    baseRadius:       28,
    // Milliseconds until drips begin forming
    dripDelay:        1500,
    // Max drips per single press-and-hold
    maxDrips:         3,
    // Particle size range (px)
    minDot:           1.2,
    maxDot:           3.2,
    // Speed-sensitive spread multiplier (higher = wider cone when moving fast)
    speedSpread:      0.35,
    // Opacity range for each particle
    minAlpha:         0.55,
    maxAlpha:         0.92,
    // Drip physics
    dripGravity:      0.06,
    dripDrift:        0.015,   // horizontal wobble per frame
    dripFriction:     0.994,
    dripMaxLen:       220,
    dripWidth:        2.8,
    dripAlpha:        0.72,
  };

  // Capture embed container reference immediately (document.currentScript is
  // only live during synchronous script execution, not inside callbacks)
  var _embedEl = document.currentScript && document.currentScript.parentElement;

  // ─── State ─────────────────────────────────────────────────────────────────
  var canvas, ctx;
  var W, H;
  var pressing   = false;
  var mouse      = { x: 0, y: 0 };
  var prevMouse  = { x: 0, y: 0 };
  var speed      = 0;
  var stillTimer = null;       // setTimeout handle for drip trigger
  var stillSince = null;       // timestamp when mouse stopped moving
  var dripsThisHold = 0;
  var particles  = [];         // { x, y, r, a }  — painted dots (static)
  var drips      = [];         // active running drips
  var raf        = null;
  var lastX      = null;
  var lastY      = null;
  var holdDensity = 0;         // 0-1 buildup when holding still

  // ─── Setup canvas ──────────────────────────────────────────────────────────
  function init() {
    // Make the Framer Embed container transparent to pointer events so that
    // Framer links/buttons still receive clicks while our document listeners
    // catch everything for spraying.
    // Collapse and neutralise the embed container so it's invisible and takes no space
    if (_embedEl) {
      _embedEl.style.cssText += ';pointer-events:none!important;width:0!important;height:0!important;overflow:hidden!important;position:absolute!important;';
    }

    canvas = document.createElement('canvas');
    canvas.id = 'spray-paint-canvas';
    var s = canvas.style;
    s.position   = 'fixed';
    s.top        = '0';
    s.left       = '0';
    s.width      = '100%';
    s.height     = '100%';
    s.zIndex     = '0';
    s.pointerEvents = 'none';
    s.display    = 'block';

    // Insert as first child of body
    document.body.insertBefore(canvas, document.body.firstChild);

    // Lift all other body children above the canvas so content stays on top
    var st = document.createElement('style');
    st.textContent = 'body > *:not(#spray-paint-canvas){position:relative;z-index:1;}';
    document.head.appendChild(st);

    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    document.addEventListener('mousedown', onDown,  { capture: true });
    document.addEventListener('mouseup',   onUp,    { capture: true });
    document.addEventListener('mousemove', onMove,  { capture: true });

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchend',   onTouchEnd,   { passive: true, capture: true });
    document.addEventListener('touchmove',  onTouchMove,  { passive: true, capture: true });

    loop();
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  // ─── Input handlers ────────────────────────────────────────────────────────
  function onDown(e) {
    pressing = true;
    dripsThisHold = 0;
    holdDensity = 0;
    setPos(e.clientX, e.clientY);
    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;
    scheduleStillCheck();
  }

  function onUp() {
    pressing = false;
    holdDensity = 0;
    clearStillTimer();
  }

  function onMove(e) {
    setPos(e.clientX, e.clientY);
  }

  function onTouchStart(e) {
    if (!e.touches.length) return;
    pressing = true;
    dripsThisHold = 0;
    holdDensity = 0;
    setPos(e.touches[0].clientX, e.touches[0].clientY);
    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;
    scheduleStillCheck();
  }

  function onTouchEnd() {
    pressing = false;
    holdDensity = 0;
    clearStillTimer();
  }

  function onTouchMove(e) {
    if (!e.touches.length) return;
    setPos(e.touches[0].clientX, e.touches[0].clientY);
  }

  function setPos(x, y) {
    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;
    mouse.x = x;
    mouse.y = y;
    var dx = mouse.x - prevMouse.x;
    var dy = mouse.y - prevMouse.y;
    speed = Math.sqrt(dx * dx + dy * dy);

    // Reset still timer if we've moved meaningfully
    if (speed > 2 && pressing) {
      holdDensity = 0;
      clearStillTimer();
      scheduleStillCheck();
    }
  }

  // ─── Still / drip scheduling ───────────────────────────────────────────────
  function scheduleStillCheck() {
    clearStillTimer();
    stillSince = Date.now();
    stillTimer = setTimeout(function () {
      if (pressing && dripsThisHold < CFG.maxDrips) {
        spawnDrip();
      }
    }, CFG.dripDelay);
  }

  function clearStillTimer() {
    if (stillTimer !== null) {
      clearTimeout(stillTimer);
      stillTimer = null;
    }
    stillSince = null;
  }

  // ─── Spawn a drip ──────────────────────────────────────────────────────────
  function spawnDrip() {
    dripsThisHold++;
    var offsetX = (Math.random() - 0.5) * CFG.baseRadius * 0.6;
    drips.push({
      x:    mouse.x + offsetX,
      y:    mouse.y,
      vy:   CFG.dripGravity,
      vx:   (Math.random() - 0.5) * 0.4,
      len:  0,
      maxLen: CFG.dripMaxLen * (0.5 + Math.random() * 0.5),
      segments: [],        // [{x,y}] path history
      alive: true,
    });

    // Schedule another drip if still holding and quota remains
    if (dripsThisHold < CFG.maxDrips) {
      stillTimer = setTimeout(function () {
        if (pressing && dripsThisHold < CFG.maxDrips) {
          spawnDrip();
        }
      }, CFG.dripDelay * 0.7);
    }
  }

  // ─── Emit spray particles ──────────────────────────────────────────────────
  function emitParticles() {
    if (!pressing) return;

    // Density buildup when slow / still
    if (speed < 2) {
      holdDensity = Math.min(1, holdDensity + 0.018);
    } else {
      holdDensity = Math.max(0, holdDensity - 0.04);
    }

    var count = Math.round(
      CFG.baseRate + holdDensity * (CFG.maxRate - CFG.baseRate)
    );
    var spreadBoost = speed * CFG.speedSpread;
    var radius = CFG.baseRadius + spreadBoost;

    for (var i = 0; i < count; i++) {
      // Gaussian-ish distribution: pick point in disk weighted toward centre
      var angle = Math.random() * Math.PI * 2;
      var dist  = Math.pow(Math.random(), 0.65) * radius;
      particles.push({
        x: mouse.x + Math.cos(angle) * dist,
        y: mouse.y + Math.sin(angle) * dist,
        r: CFG.minDot + Math.random() * (CFG.maxDot - CFG.minDot),
        a: CFG.minAlpha + Math.random() * (CFG.maxAlpha - CFG.minAlpha),
      });
    }
  }

  // ─── Update drips ─────────────────────────────────────────────────────────
  function updateDrips() {
    for (var i = drips.length - 1; i >= 0; i--) {
      var d = drips[i];
      if (!d.alive) { drips.splice(i, 1); continue; }

      d.segments.push({ x: d.x, y: d.y });
      d.vx += (Math.random() - 0.5) * CFG.dripDrift;
      d.vx *= CFG.dripFriction;
      d.vy += CFG.dripGravity * 0.05;   // gentle acceleration
      d.vy *= CFG.dripFriction;
      d.x  += d.vx;
      d.y  += d.vy;
      d.len++;

      if (d.len >= d.maxLen || d.y > H + 20) {
        d.alive = false;
      }
    }
  }

  // ─── Draw everything ───────────────────────────────────────────────────────
  function draw() {
    // Particles are persistent — we draw them incrementally each frame
    // by only drawing the newest batch. The canvas is never cleared.

    // Draw new particles emitted this frame
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(CFG.color, p.a);
      ctx.fill();
    }
    particles = [];   // clear buffer — dots are now painted onto canvas

    // Draw drip paths
    for (var j = 0; j < drips.length; j++) {
      var d = drips[j];
      if (d.segments.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(d.segments[0].x, d.segments[0].y);
      for (var k = 1; k < d.segments.length; k++) {
        ctx.lineTo(d.segments[k].x, d.segments[k].y);
      }
      // Fade out near end
      var fadeAlpha = d.alive
        ? CFG.dripAlpha
        : CFG.dripAlpha * (1 - d.len / d.maxLen);
      ctx.strokeStyle = hexToRgba(CFG.color, Math.max(0, fadeAlpha));
      ctx.lineWidth   = CFG.dripWidth * (0.6 + 0.4 * (1 - d.len / d.maxLen));
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }
  }

  // ─── Main loop ─────────────────────────────────────────────────────────────
  function loop() {
    emitParticles();
    updateDrips();
    draw();
    raf = requestAnimationFrame(loop);
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────
  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
