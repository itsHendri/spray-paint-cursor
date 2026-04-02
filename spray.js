(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  var CFG = {
    color:            '#574CFF',
    // Denser spray — more particles, finer dots, stronger centre weighting
    baseRate:         30,
    maxRate:          80,
    baseRadius:       36,
    dripDelay:        1500,
    maxDrips:         3,
    minDot:           0.6,
    maxDot:           2.4,
    speedSpread:      0.4,
    minAlpha:         0.55,
    maxAlpha:         0.95,
    // Drip physics
    dripGravity:      0.06,
    dripDrift:        0.015,
    dripFriction:     0.994,
    dripMaxLen:       220,
    dripWidth:        5.5,   // thicker drip line
    dripAlpha:        0.80,
  };

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

  // ─── Audio ─────────────────────────────────────────────────────────────────
  var audioCtx    = null;
  var noiseSource = null;
  var noiseGain   = null;

  function startSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (noiseSource) return; // already playing

      // Two seconds of white noise, looped
      var sr  = audioCtx.sampleRate;
      var buf = audioCtx.createBuffer(1, sr * 2, sr);
      var dat = buf.getChannelData(0);
      for (var i = 0; i < dat.length; i++) dat[i] = Math.random() * 2 - 1;

      noiseSource = audioCtx.createBufferSource();
      noiseSource.buffer = buf;
      noiseSource.loop   = true;

      // Bandpass centred on ~5 kHz — aerosol hiss
      var bp = audioCtx.createBiquadFilter();
      bp.type            = 'bandpass';
      bp.frequency.value = 5000;
      bp.Q.value         = 0.7;

      // Soft high-shelf boost to brighten
      var shelf = audioCtx.createBiquadFilter();
      shelf.type            = 'highshelf';
      shelf.frequency.value = 3000;
      shelf.gain.value      = 6;

      noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
      noiseGain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.06);

      noiseSource.connect(bp);
      bp.connect(shelf);
      shelf.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      noiseSource.start();
    } catch (e) { /* audio blocked — silently ignore */ }
  }

  function stopSound() {
    try {
      if (noiseGain && audioCtx) {
        noiseGain.gain.setValueAtTime(noiseGain.gain.value, audioCtx.currentTime);
        noiseGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.08);
      }
      var src = noiseSource;
      noiseSource = null;
      if (src) setTimeout(function () { try { src.stop(); } catch (e) {} }, 120);
    } catch (e) {}
  }

  // ─── Setup ─────────────────────────────────────────────────────────────────
  function init() {
    var el = _scriptEl ? _scriptEl.parentElement : null;
    while (el && el !== document.body) {
      el.style.pointerEvents = 'none';
      var pos = window.getComputedStyle(el).position;
      if (pos === 'absolute' || pos === 'fixed') break;
      el = el.parentElement;
    }

    var bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
      document.documentElement.style.backgroundColor = bodyBg;
      document.body.style.backgroundColor = 'transparent';
    }

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

    document.addEventListener('mousedown',  onDown,       { capture: true });
    document.addEventListener('mouseup',    onUp,         { capture: true });
    document.addEventListener('mousemove',  onMove,       { capture: true });
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
    startSound();
  }

  function onUp() {
    pressing = false;
    holdDensity = 0;
    clearStillTimer();
    stopSound();
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
    startSound();
  }

  function onTouchEnd() {
    pressing = false;
    holdDensity = 0;
    clearStillTimer();
    stopSound();
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
      // Stronger centre weighting (power 0.45 vs 0.65) → denser core like reference
      var dist  = Math.pow(Math.random(), 0.45) * radius;
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
