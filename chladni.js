/* Chladni Plate Studio — particle sand settling on simulated vibrating plate.
 *
 * Chladni patterns: nodes of a vibrating plate collect sand. We model the
 * plate displacement as a superposition of two eigenmodes and let thousands
 * of particles random-walk; they settle where |displacement| ≈ 0.
 *
 * Square plate: f(x,y) = mix * cos(m π x) cos(n π y) + (1-mix) * cos(n π x) cos(m π y)
 * Circular plate (Bessel modes, approximated): J_m(k r) * cos/sin(m θ) blend.
 */

(() => {
  const canvas = document.getElementById('plate');
  const ctx = canvas.getContext('2d');
  const SIZE = canvas.width;

  const ui = {
    m: document.getElementById('m'), n: document.getElementById('n'),
    mix: document.getElementById('mix'), grains: document.getElementById('grains'),
    shape: document.getElementById('shape'),
    mVal: document.getElementById('mVal'), nVal: document.getElementById('nVal'),
    mixVal: document.getElementById('mixVal'), grainVal: document.getElementById('grainVal'),
    modeGrid: document.getElementById('modeGrid'),
    presets: document.getElementById('presets'),
    shake: document.getElementById('shake'),
    exportBtn: document.getElementById('export'),
    toneToggle: document.getElementById('toneToggle'),
    fps: document.getElementById('fpsLabel'),
  };

  let grains = [];
  let modeName = null; // when a named mode button is active it overrides m/n
  let audioCtx = null, oscillator = null, gainNode = null;

  // ---------- plate displacement field ----------

  function besselJ(order, x) {
    // Series approximation of J_order(x) — fine for |x| < ~20.
    let sum = 0, term = 1;
    for (let k = 0; k < 30; k++) {
      if (k > 0) term *= -(x * x / 4) / (k * (k + order));
      sum += term;
      if (Math.abs(term) < 1e-14) break;
    }
    // sum = Σ (-1)^k / (k! (k+order)!) ; multiply by (x/2)^(2k+order) base
    let scale = 1;
    const xh = x / 2;
    for (let i = 1; i <= order; i++) scale *= xh / i;
    return scale * sum;
  }

  // k-th zero of J_order(x), found by bisection using the series above.
  // Zeros interleave: first zero of J_order lies between the first two of J_0-ish;
  // safe bounds: order + 0.5π(k-0.25) ... order + 0.5π(k+1.25) roughly — we use a
  // generous scan from (order + k - 0.5)*2.2 to (order + k + 1)*2.6.
  function jZero(order, k) {
    let lo = Math.max(order + 0.8, (k - 1) * 3.5 + order + 0.8), hi = lo + 2.0;
    // widen until a sign change brackets exactly one zero
    while (besselJ(order, lo) * besselJ(order, hi) > 0) {
      lo = hi; hi += 2.0;
      if (hi > 40 + order) return lo; // fallback (shouldn't happen for k<=10)
    }
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (besselJ(order, lo) * besselJ(order, mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  function plateField(nx, ny, m, n, mix, shape) {
    if (shape === 'square') {
      const a = Math.cos(m * Math.PI * nx) * Math.cos(n * Math.PI * ny);
      const b = Math.cos(n * Math.PI * nx) * Math.cos(m * Math.PI * ny);
      return mix * a + (1 - mix) * b;
    }
    // circular: r,θ in [0,1],[0,2π)
    const cx = nx - 0.5, cy = ny - 0.5;
    const r = Math.hypot(cx, cy) * 2;           // 0..1 at rim (square canvas → clamp)
    const th = Math.atan2(cy, cx);
    if (r > 1) return 1;                         // outside plate: high, sand pushed out
    const kr = jZero(m, n);
    const radial = besselJ(m, kr * r);
    const angA = Math.cos(m * th), angB = Math.sin(m * th);
    const a = radial * angA;
    const b = radial * angB;
    return mix * a + (1 - mix) * b;
  }

  // ---------- particles ----------

  function scatter() {
    const count = +ui.grains.value;
    grains = new Array(count);
    for (let i = 0; i < count; i++) {
      grains[i] = {
        x: Math.random() * SIZE,
        y: Math.random() * SIZE,
        vx: 0, vy: 0,
      };
    }
  }

  function step(dt) {
    const m = +ui.m.value, n = +ui.n.value, mix = +ui.mix.value;
    const shape = ui.shape.value;
    const stepPx = 3.2;
    const jitter = 1.6;

    for (const p of grains) {
      // sample field at particle position and a short probe ahead (gradient descent on |f|)
      const nx = p.x / SIZE, ny = p.y / SIZE;
      const f0 = plateField(nx, ny, m, n, mix, shape);
      const e = 1.5 / SIZE;
      const fx = (plateField(nx + e, ny, m, n, mix, shape) - plateField(nx - e, ny, m, n, mix, shape)) / (2 * e);
      const fy = (plateField(nx, ny + e, m, n, mix, shape) - plateField(nx, ny - e, m, n, mix, shape)) / (2 * e);
      // push downhill on |f| — toward nodes
      const mag = Math.hypot(fx, fy) || 1e-9;
      const sign = f0 >= 0 ? 1 : -1;
      p.vx = (-sign * fx / mag) * stepPx + (Math.random() - 0.5) * jitter;
      p.vy = (-sign * fy / mag) * stepPx + (Math.random() - 0.5) * jitter;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = 0; else if (p.x > SIZE) p.x = SIZE;
      if (p.y < 0) p.y = 0; else if (p.y > SIZE) p.y = SIZE;
    }
  }

  function draw() {
    ctx.fillStyle = '#14141a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const shape = ui.shape.value;

    // draw plate outline
    ctx.save();
    ctx.strokeStyle = '#34343f';
    ctx.lineWidth = 2;
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
      // clip grains to circle
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
    }

    ctx.fillStyle = '#f0a83c';
    for (const p of grains) ctx.fillRect(p.x, p.y, 1.4, 1.4);
    ctx.restore();
  }

  let running = true;
  function loop() {
    if (running) {
      step(1);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---------- named mode presets (classic Chladni numbers) ----------

  const MODES = [
    { label: 'A1', m: 1, n: 2 }, { label: 'A2', m: 2, n: 3 },
    { label: 'A3', m: 3, n: 4 }, { label: 'B1', m: 1, n: 4 },
    { label: 'B2', m: 2, n: 5 }, { label: 'B3', m: 3, n: 6 },
    { label: 'C1', m: 2, n: 2 }, { label: 'C2', m: 3, n: 3 },
    { label: 'C3', m: 4, n: 4 }, { label: 'D1', m: 1, n: 6 },
    { label: 'D2', m: 3, n: 8 }, { label: 'D3', m: 5, n: 7 },
  ];

  function buildModeGrid() {
    ui.modeGrid.innerHTML = '';
    MODES.forEach((md) => {
      const b = document.createElement('button');
      b.className = 'mode-btn';
      b.textContent = md.label;
      b.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        ui.m.value = md.m; ui.n.value = md.n;
        ui.mix.value = 0.5;
        syncLabels();
        updateTone();
      });
      ui.modeGrid.appendChild(b);
    });
  }

  const PRESETS = [
    { name: 'Classic square 2,3', m: 2, n: 3, mix: 0.5, shape: 'square' },
    { name: 'Fine lace 5,7', m: 5, n: 7, mix: 0.5, shape: 'square' },
    { name: 'Asymmetric 1,4', m: 1, n: 4, mix: 0.25, shape: 'square' },
    { name: 'Circular rose 3', m: 3, n: 0, mix: 0.5, shape: 'circle' },
    { name: 'Circular ring 5', m: 5, n: 0, mix: 0.7, shape: 'circle' },
  ];

  function buildPresets() {
    ui.presets.innerHTML = '';
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.addEventListener('click', () => {
        ui.m.value = p.m; ui.n.value = p.n; ui.mix.value = p.mix; ui.shape.value = p.shape;
        document.querySelectorAll('.mode-btn').forEach((x) => x.classList.remove('active'));
        syncLabels();
        updateTone();
      });
      ui.presets.appendChild(b);
    });
  }

  function syncLabels() {
    ui.mVal.textContent = ui.m.value;
    ui.nVal.textContent = ui.n.value;
    ui.mixVal.textContent = (+ui.mix.value).toFixed(2);
    ui.grainVal.textContent = ui.grains.value;
  }

  // ---------- audio ----------

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.04;
      gainNode.connect(audioCtx.destination);
    }
  }

  function updateTone() {
    if (!oscillator) return;
    const m = +ui.m.value, n = +ui.n.value;
    const base = 110 * Math.pow(2, ((m * 2 + n) % 24) / 12);
    oscillator.frequency.setTargetAtTime(base, audioCtx.currentTime, 0.05);
  }

  ui.toneToggle.addEventListener('click', () => {
    ensureAudio();
    if (!oscillator) {
      oscillator = audioCtx.createOscillator();
      oscillator.type = 'sine';
      updateTone();
      oscillator.connect(gainNode);
      oscillator.start();
      ui.toneToggle.textContent = 'Stop tone';
    } else {
      oscillator.stop();
      oscillator = null;
      ui.toneToggle.textContent = 'Play tone';
    }
  });

  // ---------- interactions ----------

  ['m', 'n', 'mix', 'grains'].forEach((k) =>
    ui[k].addEventListener('input', () => { syncLabels(); if (k !== 'grains') { updateTone(); } })
  );
  ui.grains.addEventListener('change', scatter);
  ui.shape.addEventListener('change', () => { scatter(); updateTone(); });
  ui.shake.addEventListener('click', scatter);
  ui.exportBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'chladni-pattern.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; sweep(e); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) sweep(e); });
  window.addEventListener('pointerup', () => { dragging = false; });

  function sweep(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    ui.mix.value = Math.max(0, Math.min(1, px)).toFixed(2);
    syncLabels();
    document.querySelectorAll('.mode-btn').forEach((x) => x.classList.remove('active'));
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); scatter(); }
  });

  // ---------- boot ----------

  buildModeGrid();
  buildPresets();
  syncLabels();
  scatter();
  loop();
})();
