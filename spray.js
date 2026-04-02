(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  var CFG = {
    baseRate:         75,
    maxRate:          200,
    baseRadius:       36,
    dripDelay:        1500,
    maxDrips:         3,
    minDot:           0.6,
    maxDot:           2.4,
    speedSpread:      0.4,
    minAlpha:         0.55,
    maxAlpha:         0.95,
    dripGravity:      0.14,   // strong enough to pull naturally
    dripDrift:        0.008,  // slight sideways wobble
    dripFriction:     0.980,  // lets it accelerate freely
    dripMaxLen:       260,
    dripHeadWidth:    14,     // thick at the pooling head
    dripTailWidth:    2,      // thins to a fine tail
    dripAlpha:        0.88,
  };

  // Alternating colours: #383BFE (blue) and #EF2006 (red)
  var COLORS   = [[56,59,254], [239,32,6]];
  var colorIdx = -1; // incremented to 0 on first press

  var _scriptEl = document.currentScript;

  // ─── State ─────────────────────────────────────────────────────────────────
  var canvas, ctx;
  var W, H;
  var pressing      = false;
  var mouse         = { x: 0, y: 0 };
  var prevMouse     = { x: 0, y: 0 };
  var speed         = 0;
  var stillTimer    = null;
  var stillSince    = null;
  var dripsThisHold = 0;
  var particles     = [];
  var drips         = [];
  var holdDensity   = 0;

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
      if (noiseSource) return;

      var sr  = audioCtx.sampleRate;
      var buf = audioCtx.createBuffer(1, sr * 2, sr);
      var dat = buf.getChannelData(0);
      for (var i = 0; i < dat.length; i++) dat[i] = Math.random() * 2 - 1;

      noiseSource = audioCtx.createBufferSource();
      noiseSource.buffer = buf;
      noiseSource.loop   = true;

      // Narrow bandpass centred at 2200 Hz — soft, whispery aerosol hiss
      var bp = audioCtx.createBiquadFilter();
      bp.type            = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value         = 1.2;

      // Low-shelf cut: remove bassy rumble below 300 Hz
      var ls = audioCtx.createBiquadFilter();
      ls.type            = 'lowshelf';
      ls.frequency.value = 300;
      ls.gain.value      = -18;

      // Short delay for soft spatial shimmer (ASMR tail)
      var delay    = audioCtx.createDelay(0.1);
      delay.delayTime.value = 0.04;
      var feedback = audioCtx.createGain();
      feedback.gain.value = 0.28;
      delay.connect(feedback);
      feedback.connect(delay);

      noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
      noiseGain.gain.linearRampToValueAtTime(0.07, audioCtx.currentTime + 0.25);

      noiseSource.connect(bp);
      bp.connect(ls);
      ls.connect(noiseGain);
      ls.connect(delay);          // wet path
      delay.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      noiseSource.start();
    } catch (e) { /* audio blocked — silently ignore */ }
  }

  function stopSound() {
    try {
      if (noiseGain && audioCtx) {
        noiseGain.gain.setValueAtTime(noiseGain.gain.value, audioCtx.currentTime);
        noiseGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.20);
      }
      var src = noiseSource;
      noiseSource = null;
      if (src) setTimeout(function () { try { src.stop(); } catch (e) {} }, 250);
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
    s.zIndex        = '1';            // above page content
    s.pointerEvents = 'none';
    s.display       = 'block';
    s.mixBlendMode  = 'multiply';     // CSS multiply blend with page below

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
    holdDensity = 1.0;  // start at full density immediately
    colorIdx = (colorIdx + 1) % COLORS.length;
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
    holdDensity = 1.0;  // start at full density immediately
    colorIdx = (colorIdx + 1) % COLORS.length;
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
      x: mouse.x + (Math.random() - 0.5) * CFG.baseRadius * 0.5,
      y: mouse.y,
      vy: 0,   // starts stationary — gravity builds flow naturally
      vx: 0,
      len: 0,
      maxLen: CFG.dripMaxLen * (0.6 + Math.random() * 0.4),
      segments: [],
      alive: true,
      colorIdx: colorIdx,
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
      var dist  = Math.pow(Math.random(), 0.45) * radius;
      particles.push({
        x: mouse.x + Math.cos(angle) * dist,
        y: mouse.y + Math.sin(angle) * dist,
        r: CFG.minDot + Math.random() * (CFG.maxDot - CFG.minDot),
        a: CFG.minAlpha + Math.random() * (CFG.maxAlpha - CFG.minAlpha),
        c: colorIdx,
      });
    }
  }

  // ─── Drip physics ──────────────────────────────────────────────────────────
  function updateDrips() {
    for (var i = drips.length - 1; i >= 0; i--) {
      var d = drips[i];
      if (!d.alive) { drips.splice(i, 1); continue; }
      d.segments.push({ x: d.x, y: d.y });
      // Gravity accumulates each frame — slow start, natural acceleration
      d.vy  = (d.vy + CFG.dripGravity) * CFG.dripFriction;
      // Slight lateral wobble, dampened
      d.vx  = (d.vx + (Math.random() - 0.5) * CFG.dripDrift) * CFG.dripFriction;
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
      ctx.fillStyle = rgba(p.a, p.c);
      ctx.fill();
    }
    particles = [];

    for (var j = 0; j < drips.length; j++) {
      var d = drips[j];
      var n = d.segments.length;
      if (n < 2) continue;

      // Draw each segment with a width that tapers from head → tail
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      for (var k = 1; k < n; k++) {
        var t = k / n;  // 0 = head (thick), 1 = tail (thin)
        var w = CFG.dripHeadWidth * (1 - t) + CFG.dripTailWidth * t;
        var fa = CFG.dripAlpha * (d.alive ? 1 : (1 - d.len / d.maxLen));
        ctx.beginPath();
        ctx.moveTo(d.segments[k - 1].x, d.segments[k - 1].y);
        ctx.lineTo(d.segments[k].x,     d.segments[k].y);
        ctx.lineWidth   = Math.max(0.5, w);
        ctx.strokeStyle = rgba(Math.max(0, fa), d.colorIdx);
        ctx.stroke();
      }

      // Round bead at the live tip — shrinks as the drip lengthens
      if (d.alive && n > 1) {
        var progress = n / d.maxLen;
        var beadR = CFG.dripHeadWidth * 0.55 * (1 - progress * 0.5);
        ctx.beginPath();
        ctx.arc(d.x, d.y, Math.max(1, beadR), 0, Math.PI * 2);
        ctx.fillStyle = rgba(CFG.dripAlpha, d.colorIdx);
        ctx.fill();
      }
    }
  }

  function loop() {
    emitParticles();
    updateDrips();
    draw();
    requestAnimationFrame(loop);
  }

  function rgba(a, ci) {
    var c = COLORS[ci !== undefined ? ci : colorIdx];
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
