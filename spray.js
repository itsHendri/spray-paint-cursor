(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  var CFG = {
    color:            '#574CFF',
    baseRate:         12,
    maxRate:          40,
    baseRadius:       28,
    dripDelay:        1500,
    maxDrips:         3,
    minDot:           1.2,
    maxDot:           3.2,
    speedSpread:      0.35,
    minAlpha:         0.55,
    maxAlpha:         0.92,
    dripGravity:      0.06,
    dripDrift:        0.015,
    dripFriction:     0.994,
    dripMaxLen:       220,
    dripWidth:        2.8,
    dripAlpha:        0.72,
  };

  // Capture script reference now — document.currentScript is only live
  // during synchronous execution, before any callbacks fire.
  var _scriptEl = document.currentScript;

  // ─── State ─────────────────────────────────────────────────────────────────
  var canvas, ctx;
  var W, H;
  var pressing    = false;
  var mouse       = { x: 0, y: 0 };
  var prevMouse   = { x: 0, y: 0 };
  var speed       = 0;
  var stillTimer  = null;
  var stillSince  = null;
  var dripsThisHold = 0;
  var particles   = [];
  var drips       = [];
  var holdDensity = 0;

  // ─── Setup ─────────────────────────────────────────────────────────────────
  function init() {

    // 1. Neutralise the Framer Embed container chain so it never blocks clicks.
    //    Traverse from the script tag up to (and including) the first
    //    absolute/fixed ancestor — that's the embed frame itself.
    //    Everything above that (Framer's page root, nav, etc.) is untouched.
    var el = _scriptEl ? _scriptEl.parentElement : null;
    while (el && el !== document.body) {
      el.style.pointerEvents = 'none';
      var pos = window.getComputedStyle(el).position;
      if (pos === 'absolute' || pos === 'fixed') break;
      el = el.parentElement;
    }

    // 2. Move body's background colour to <html> so that a canvas sitting at
    //    z-index:-1 (below body) is still visible against the page colour.
    var bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
      document.documentElement.style.backgroundColor = bodyBg;
      document.body.style.backgroundColor = 'transparent';
    }

    // 3. Create canvas truly behind all page content (z-index: -1).
    canvas = document.createElement('canvas');
    canvas.id = 'spray-paint-canvas';
    var s = canvas.style;
    s.position      = 'fixed';
    s.top           = '0';
    s.left          = '0';
    s.width         = '100%';
    s.height        = '100%';
    s.zIndex        = '-1';
    s.pointerEvents = 'none';
    s.display       = 'block';

    document.body.insertBefore(canvas, document.body.firstChild);

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

  function onMove(e) { setPos(e.clientX, e.clientY); }

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
    if (speed > 2 && pressing) {
      holdDensity = 0;
      clearStillTimer();
      scheduleStillCheck();
    }
  }

  // ─── Drip scheduling ───────────────────────────────────────────────────────
  function scheduleStillCheck() {
    clearStillTimer();
    stillSince = Date.now();
    stillTimer = setTimeout(function () {
      if (pressing && dripsThisHold < CFG.maxDrips) spawnDrip();
    }, CFG.dripDelay);
  }

  function clearStillTimer() {
    if (stillTimer !== null) { clearTimeout(stillTimer); stillTimer = null; }
    stillSince = null;
  }

  function spawnDrip() {
    dripsThisHold++;
    drips.push({
      x: mouse.x + (Math.random() - 0.5) * CFG.baseRadius * 0.6,
      y: mouse.y,
      vy: CFG.dripGravity,
      vx: (Math.random() - 0.5) * 0.4,
      len: 0,
      maxLen: CFG.dripMaxLen * (0.5 + Math.random() * 0.5),
      segments: [],
      alive: true,
    });
    if (dripsThisHold < CFG.maxDrips) {
      stillTimer = setTimeout(function () {
        if (pressing && dripsThisHold < CFG.maxDrips) spawnDrip();
      }, CFG.dripDelay * 0.7);
    }
  }

  // ─── Particles ─────────────────────────────────────────────────────────────
  function emitParticles() {
    if (!pressing) return;
    holdDensity = speed < 2
      ? Math.min(1, holdDensity + 0.018)
      : Math.max(0, holdDensity - 0.04);
    var count  = Math.round(CFG.baseRate + holdDensity * (CFG.maxRate - CFG.baseRate));
    var radius = CFG.baseRadius + speed * CFG.speedSpread;
    for (var i = 0; i < count; i++) {
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

  // ─── Drip physics ──────────────────────────────────────────────────────────
  function updateDrips() {
    for (var i = drips.length - 1; i >= 0; i--) {
      var d = drips[i];
      if (!d.alive) { drips.splice(i, 1); continue; }
      d.segments.push({ x: d.x, y: d.y });
      d.vx += (Math.random() - 0.5) * CFG.dripDrift;
      d.vx *= CFG.dripFriction;
      d.vy += CFG.dripGravity * 0.05;
      d.vy *= CFG.dripFriction;
      d.x  += d.vx;
      d.y  += d.vy;
      d.len++;
      if (d.len >= d.maxLen || d.y > H + 20) d.alive = false;
    }
  }

  // ─── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(p.a);
      ctx.fill();
    }
    particles = [];

    for (var j = 0; j < drips.length; j++) {
      var d = drips[j];
      if (d.segments.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(d.segments[0].x, d.segments[0].y);
      for (var k = 1; k < d.segments.length; k++)
        ctx.lineTo(d.segments[k].x, d.segments[k].y);
      var fa = d.alive ? CFG.dripAlpha : CFG.dripAlpha * (1 - d.len / d.maxLen);
      ctx.strokeStyle = rgba(Math.max(0, fa));
      ctx.lineWidth   = CFG.dripWidth * (0.6 + 0.4 * (1 - d.len / d.maxLen));
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }
  }

  function loop() {
    emitParticles();
    updateDrips();
    draw();
    requestAnimationFrame(loop);
  }

  function rgba(a) {
    return 'rgba(87,76,255,' + a.toFixed(3) + ')';
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
