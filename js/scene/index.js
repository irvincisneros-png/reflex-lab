// Reflex Lab 3D layer. Default export createScene(canvas, opts) -> Scene API (see docs/SPEC.md).
// The canvas is a backdrop and a reward only. Measurement lives in semantic HTML.
//
//   import createScene, { benchmark } from './scene/index.js';
//   const scene = createScene(document.getElementById('scene'), { quality: 'mid' });
//
// No importmap is needed: three.js and its addons are vendored in /vendor/three with relative imports.
import * as THREE from './three.js';
import { createHub } from './hub.js';
import { createReplay } from './replay.js';
import { createBurst } from './fx.js';
import { glowSprite } from './textures.js';

const MODES = ['hub', 'planning', 'frozen', 'replay', 'results', 'off'];
const TIERS = ['low', 'mid', 'high'];
const PR_CAP = { low: 1, mid: 1.5, high: 2 };
const PX_CAP = { low: 1.0e6, mid: 2.1e6, high: 4.0e6 }; // total drawing-buffer pixels

export default function createScene(canvas, opts = {}) {
  if (!canvas) throw new Error('createScene: canvas required');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let quality = TIERS.includes(opts.quality) ? opts.quality : 'mid';
  let still = opts.still !== undefined ? !!opts.still : reduced;
  let mode = 'hub';
  let claim = opts.claim || 'hand';
  let disposed = false, lost = false;
  const listeners = new Map();
  const emit = (name, ...a) => { (listeners.get(name) || []).slice().forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false, failIfMajorPerformanceCaveat: !!opts.failIfSlow });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the lab is static; shadows are re-baked on demand
  renderer.info.autoReset = false;
  renderer.setClearColor(0x02060a, 1);

  const gpu = (() => {
    try {
      const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      return { renderer: name, software: /swiftshader|llvmpipe|software|softpipe|basic render/i.test(name), intel: /intel/i.test(name) && !/iris xe|arc/i.test(name) };
    } catch (e) { return { renderer: 'unknown', software: false, intel: false }; }
  })();

  /* ---------- material quality registry (clearcoat/sheen/etc are off on 'low') ---------- */
  const fancyList = [];
  const applyFancy = (e) => { const lo = quality === 'low'; for (const k in e.props) e.mat[k] = lo ? 0 : e.props[k]; e.mat.needsUpdate = true; };
  const fancy = (mat, props) => { const e = { mat, props: { ...props } }; fancyList.push(e); applyFancy(e); };

  /* ---------- environment (PMREM of RoomEnvironment) ---------- */
  let env = null;
  function buildEnv() {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new THREE.RoomEnvironment();
    const rt = pm.fromScene(room, 0.04);
    room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pm.dispose();
    return rt;
  }
  let envRT = buildEnv(); env = envRT.texture;

  const ctx = { renderer, env, fancy, quality: () => quality };
  const hub = createHub(ctx);
  hub.setRank(opts.rank | 0);
  hub.setClaim('idle');
  hub.setQuality(quality);
  let replay = null;
  let replayPending = null;

  /* ---------- celebration FX ---------- */
  const glow = glowSprite(128);
  const burst = createBurst(160, glow);
  burst.points.position.set(0, 1.35, 0);
  hub.scene.add(burst.points);
  const cel = { on: false, t: 0, kind: 'badge', amp: 0 };

  /* ---------- sizing & post ---------- */
  let W = 0, H = 0, PR = 1, aspect = 1, pendingResize = false;
  let composer = null, renderPass, bloom, bokeh, smaa, outputPass;
  let kPort = 1, hubFov = 36;

  function computePR() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let pr = Math.min(dpr, PR_CAP[quality]);
    pr = Math.min(pr, Math.sqrt(PX_CAP[quality] / Math.max(1, W * H)));
    return Math.max(0.5, pr);
  }
  function disposeComposer() {
    if (!composer) return;
    [renderPass, bloom, bokeh, smaa, outputPass].forEach((p) => p && p.dispose && p.dispose());
    composer.dispose && composer.dispose();
    composer = renderPass = bloom = bokeh = smaa = outputPass = null;
  }
  function buildComposer() {
    disposeComposer();
    if (quality === 'low') return;
    composer = new THREE.EffectComposer(renderer);
    composer.setPixelRatio(PR); composer.setSize(W, H);
    renderPass = new THREE.RenderPass(hub.scene, hub.camera);
    composer.addPass(renderPass);
    if (quality === 'high') {
      bokeh = new THREE.BokehPass(hub.scene, hub.camera, { focus: 8, aperture: 0.00018, maxblur: 0.006 });
      bokeh.enabled = false;
      const orig = bokeh.render.bind(bokeh);
      bokeh.render = (...a) => { const cam = bokeh.camera; cam.layers.disable(1); orig(...a); cam.layers.enable(1); }; // glow/sprites are not in the depth pass
      composer.addPass(bokeh);
    }
    const bs = new THREE.Vector2(Math.max(2, Math.round(W * PR * (quality === 'high' ? 1 : 0.5))), Math.max(2, Math.round(H * PR * (quality === 'high' ? 1 : 0.5))));
    bloom = new THREE.UnrealBloomPass(bs, 0.5, 0.6, 0.9);
    composer.addPass(bloom);
    outputPass = new THREE.OutputPass();
    composer.addPass(outputPass);
    if (quality === 'high') { smaa = new THREE.SMAAPass(W * PR, H * PR); composer.addPass(smaa); }
  }
  function applySize() {
    const cw = canvas.clientWidth || canvas.width || 1, ch = canvas.clientHeight || canvas.height || 1;
    W = Math.max(1, Math.floor(cw)); H = Math.max(1, Math.floor(ch));
    aspect = W / H;
    PR = computePR();
    renderer.setPixelRatio(PR);
    renderer.setSize(W, H, false);
    // portrait phones: keep >= ~44deg horizontal field of view, and dolly back if the cap is hit
    const need = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(44) / 2) / aspect);
    hubFov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(need), 36, 58);
    kPort = Math.max(1, Math.tan(need / 2) / Math.tan(THREE.MathUtils.degToRad(hubFov) / 2));
    hub.camera.fov = hubFov; hub.resize(aspect);
    if (replay) replay.resize(aspect);
    buildComposer();
    const px = H * PR;
    hub.scene.traverse((o) => { if (o.isPoints && o.material.uniforms && o.material.uniforms.uPx) o.material.uniforms.uPx.value = px; });
    if (replay) replay.scene.traverse((o) => { if (o.isPoints && o.material.uniforms && o.material.uniforms.uPx) o.material.uniforms.uPx.value = px; });
    pendingResize = false;
  }
  function onResize() {
    if (disposed) return;
    if (mode === 'frozen' || mode === 'off' || lost) { pendingResize = true; return; }
    applySize(); requestFrame(true);
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(onResize); ro.observe(canvas); }
  else window.addEventListener('resize', onResize);
  applySize();
  renderer.shadowMap.needsUpdate = true;

  /* ---------- camera state ---------- */
  const camPos = new THREE.Vector3(0, 2.3, 6), camLook = new THREE.Vector3(0, 1.3, -0.5), tmpL = new THREE.Vector3();
  {
    const g = hub.cameraGoal('hub', 0, true, kPort); camPos.copy(g.pos); camLook.copy(g.look);
    hub.camera.position.copy(camPos); hub.camera.lookAt(camLook);
  }

  /* ---------- loop ---------- */
  let raf = 0, T = 0, last = 0, lastDraw = 0, snapFrames = 0, benchCollector = null;
  const perf = { ms: 16.7, frames: 0 };

  let started = false;
  const running = () => started && !disposed && !lost && !document.hidden && mode !== 'frozen' && mode !== 'off';
  function requestFrame(snap) {
    if (snap) snapFrames = Math.max(snapFrames, 2);
    if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function tick(dt, snap) {
    if (mode === 'replay') {
      if (!replay) return;
      replay.update(dt);
      return;
    }
    const m = mode === 'planning' ? 'planning' : mode === 'results' ? 'results' : 'hub';
    if (!still && !snap) T += dt;
    const g = hub.cameraGoal(m, T, still, kPort);
    const k = snap || still ? 1 : 1 - Math.exp(-dt * 2.0);
    camPos.lerp(g.pos, k); camLook.lerp(g.look, k);
    hub.camera.position.copy(camPos); hub.camera.lookAt(camLook);
    // celebration envelope: smooth bell, no flicker
    let tint = m === 'results' ? 0.12 : 0;
    if (cel.on) {
      cel.t += dt;
      const dur = cel.kind === 'rank' ? 2.6 : 1.8;
      const p = Math.min(1, cel.t / dur);
      tint += cel.amp * Math.pow(Math.sin(Math.PI * p), 2);
      burst.mat.uniforms.uAge.value = cel.t;
      if (cel.t >= (cel.kind === 'rank' ? 3.0 : 2.4)) { cel.on = false; burst.points.visible = false; }
    }
    hub.setTint(tint);
    hub.update(T, dt, { mode: m, still, force: snap });
  }

  function draw() {
    const world = mode === 'replay' && replay ? replay : hub;
    renderer.info.reset();
    if (composer) {
      renderPass.scene = world.scene; renderPass.camera = world.camera;
      const rp = world === replay;
      bloom.strength = (rp ? 0.5 : 0.32) + (cel.on ? 0.22 * Math.pow(Math.sin(Math.PI * Math.min(1, cel.t / 2)), 2) : 0);
      bloom.radius = rp ? 0.7 : 0.6; bloom.threshold = rp ? 0.78 : 0.95;
      if (bokeh) {
        bokeh.enabled = rp && replay.active;
        bokeh.scene = world.scene; bokeh.camera = world.camera;
        if (bokeh.enabled) bokeh.uniforms.focus.value = replay.focus;
      }
      composer.render();
    } else renderer.render(world.scene, world.camera);
    perf.frames++;
  }

  function frame(now) {
    raf = 0;
    if (!running()) return;
    const dtMs = last ? now - last : 16.7;
    last = now;
    const dt = Math.min(0.1, dtMs / 1000);
    if (benchCollector) benchCollector.push(dtMs);
    perf.ms = perf.ms * 0.92 + dtMs * 0.08;
    const oneShot = still && mode !== 'replay' && !cel.on && !benchCollector;
    if (oneShot) {
      tick(1, true);
      draw();
      if (--snapFrames > 0) raf = requestAnimationFrame(frame); // a couple of frames so fades settle, then stop
      else last = 0;
      return;
    }
    // 'low' tier renders at ~30 fps to save battery and heat
    if (quality === 'low' && now - lastDraw < 28 && !benchCollector) { raf = requestAnimationFrame(frame); return; }
    lastDraw = now;
    tick(dt, false);
    draw();
    raf = requestAnimationFrame(frame);
  }

  /* ---------- context loss ---------- */
  const onLost = (e) => { e.preventDefault(); lost = true; stopLoop(); emit('contextlost'); };
  const onRestored = () => {
    lost = false;
    try { envRT.dispose(); envRT = buildEnv(); env = envRT.texture; hub.scene.environment = env; if (replay) replay.scene.environment = env; } catch (e) { /* ignore */ }
    renderer.shadowMap.needsUpdate = true;
    if (pendingResize) applySize();
    emit('contextrestored');
    requestFrame(true);
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  const onVis = () => { if (!document.hidden) requestFrame(true); else stopLoop(); };
  document.addEventListener('visibilitychange', onVis);

  /* ---------- public API ---------- */
  function ensureReplay() {
    if (replay) return replay;
    replay = createReplay(ctx);
    replay.resize(aspect);
    const px = H * PR;
    replay.scene.traverse((o) => { if (o.isPoints && o.material.uniforms && o.material.uniforms.uPx) o.material.uniforms.uPx.value = px; });
    return replay;
  }
  let replayResolve = null;
  function endReplay(kind) { const r = replayResolve; replayResolve = null; r && r(kind); }

  function syncClaim() { hub.setClaim(mode === 'planning' ? claim : 'idle'); }

  function setMode(m, o) {
    if (disposed) return;
    if (o && typeof o.claim === 'string') claim = o.claim;
    if (!MODES.includes(m)) throw new Error('setMode: unknown mode ' + m);
    const prev = mode;
    if (prev === 'replay' && m !== 'replay' && replay && replay.active) { replay.skip(); }
    mode = m;
    canvas.style.visibility = m === 'off' ? 'hidden' : '';
    canvas.dataset.sceneMode = m;
    if (m === 'off') { stopLoop(); return; }
    if (lost) return;
    if (pendingResize) applySize();
    if (m === 'frozen') {
      // exactly one last frame with the current state, then ZERO GPU work until another mode is set
      stopLoop();
      if (prev === 'off') { tick(0.0001, true); }
      draw();
      try { renderer.getContext().finish(); } catch (e) { /* ignore */ }
      return;
    }
    if (m === 'replay') {
      ensureReplay();
      if (!replay.active) { replay.play({ stim: 'visual' }, null); replay.skip(); }
    } else {
      syncClaim();
      if (prev !== m) renderer.shadowMap.needsUpdate = true;
    }
    requestFrame(true);
  }

  function setRank(r) { hub.setRank(r); requestFrame(true); }
  function setQuality(q) {
    if (!TIERS.includes(q) || q === quality) return;
    quality = q;
    renderer.shadowMap.enabled = q !== 'low';
    fancyList.forEach(applyFancy);
    hub.setQuality(q);
    if (replay && !replay.active) { replay.scene.traverse((o) => { if (o.isMesh) o.geometry && 0; }); replay.dispose(); replay = null; if (mode === 'replay') ensureReplay(); }
    renderer.shadowMap.needsUpdate = true;
    if (mode === 'frozen' || mode === 'off') { pendingResize = true; return; }
    applySize(); requestFrame(true);
  }
  function setStill(v) {
    still = !!v;
    if (still && replay && replay.active) { replay.skip(); }
    if (mode === 'frozen' || mode === 'off') return;
    requestFrame(true);
  }
  function setClaim(id) { claim = id; if (mode !== 'frozen' && mode !== 'off') { syncClaim(); requestFrame(true); } else if (mode === 'frozen') { /* take effect after frozen ends */ } }

  function playReplay(o = {}) {
    if (disposed || lost || still || mode === 'frozen' || mode === 'off') {
      // still mode: replay is off. Frozen/off: never render during a timed block.
      return Promise.resolve('skipped');
    }
    if (replayResolve) { if (replay) replay.skip(); }
    return new Promise((resolve) => {
      replayResolve = resolve;
      // build lazily after a frame so the click that asked for it paints first
      requestAnimationFrame(async () => {
        if (disposed || lost) return endReplay('skipped');
        try {
          ensureReplay();
          try { await renderer.compileAsync(replay.scene, replay.camera); } catch (e) { /* ignore */ }
          if (disposed || lost || replayResolve !== resolve) return;
          mode = 'replay'; canvas.style.visibility = ''; canvas.dataset.sceneMode = 'replay';
          replay.play(o, (kind) => endReplay(kind));
          requestFrame(true);
        } catch (e) { console.error(e); endReplay('skipped'); }
      });
    });
  }
  function skipReplay() { if (replay && replay.active) replay.skip(); else endReplay('skipped'); }
  function preloadReplay() {
    return new Promise((res) => {
      const go = async () => { try { if (!disposed && !lost) { ensureReplay(); await renderer.compileAsync(replay.scene, replay.camera); } } catch (e) { console.error(e); } res(); };
      (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(go);
    });
  }

  function celebrate(kind = 'badge') {
    if (disposed || lost || still || !(mode === 'hub' || mode === 'planning' || mode === 'results')) return; // never during timed/frozen work
    cel.on = true; cel.t = 0; cel.kind = kind === 'rank' ? 'rank' : 'badge'; cel.amp = cel.kind === 'rank' ? 0.9 : 0.55;
    burst.geo.setDrawRange(0, cel.kind === 'rank' ? 160 : 90);
    burst.mat.uniforms.uAge.value = 0; burst.mat.uniforms.uLife.value = cel.kind === 'rank' ? 2.8 : 2.2;
    burst.points.visible = true;
    requestFrame(true);
  }

  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
    return () => off(name, fn);
  }
  function off(name, fn) { const a = listeners.get(name); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopLoop(); endReplay('skipped');
    ro ? ro.disconnect() : window.removeEventListener('resize', onResize);
    canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
    document.removeEventListener('visibilitychange', onVis);
    disposeComposer();
    hub.dispose(); burst.mat.dispose(); burst.geo.dispose(); glow.dispose();
    if (replay) replay.dispose();
    envRT.dispose();
    renderer.dispose();
    listeners.clear();
  }

  // frame sampler for benchmark(): resolves with frame intervals (ms) collected while the hub runs
  function _sample(ms) {
    return new Promise((resolve) => {
      benchCollector = [];
      requestFrame(true);
      setTimeout(() => { const a = benchCollector; benchCollector = null; resolve(a); }, ms);
    });
  }

  const api = {
    setMode, setRank, setQuality, setStill, setClaim, playReplay, skipReplay, preloadReplay, celebrate, dispose, on, off,
    getMode: () => mode, getQuality: () => quality, getStill: () => still,
    get gpu() { return gpu; },
    info() {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, quality, mode, fps: Math.round(1000 / perf.ms), pixelRatio: PR, size: [W, H], renderer: gpu.renderer, running: !!raf };
    },
    _sample,
    _renderer: renderer,
  };
  api.on = on;
  if (opts.mode && MODES.includes(opts.mode)) setMode(opts.mode);
  // compile shaders without blocking the main thread, then start the loop
  const go = () => { started = true; if (!disposed && mode !== 'frozen') requestFrame(true); };
  let compiled = false;
  const done = () => { if (!compiled) { compiled = true; go(); } };
  try { renderer.compileAsync(hub.scene, hub.camera).then(done, done); } catch (e) { done(); }
  setTimeout(done, 5000);
  return api;
}

/**
 * Auto-quality: runs the hub at 'mid' for ~1.5 s and returns 'low' | 'mid' | 'high'.
 * Call once at boot (before any timed block), then scene.setQuality(result).
 */
export async function benchmark(scene) {
  const prevMode = scene.getMode(), prevQ = scene.getQuality();
  const gpu = scene.gpu || {};
  if (gpu.software) return 'low';
  const small = Math.min(screen.width, screen.height) < 700 && navigator.maxTouchPoints > 0;
  scene.setQuality('mid');
  if (prevMode === 'frozen' || prevMode === 'off' || prevMode === 'replay') scene.setMode('hub'); else scene.setMode(prevMode === 'planning' ? 'planning' : 'hub');
  let s = [];
  try { s = await scene._sample(1500); } catch (e) { s = []; }
  scene.setQuality(prevQ);
  if (prevMode === 'frozen' || prevMode === 'off') scene.setMode(prevMode);
  const a = s.slice(Math.min(12, Math.floor(s.length / 3))).sort((x, y) => x - y); // drop shader-compile frames
  if (a.length < 8) return 'low';
  const med = a[a.length >> 1], p95 = a[Math.floor(a.length * 0.95)];
  const cores = navigator.hardwareConcurrency || 2;
  if (med > 38 || p95 > 80) return 'low';
  if (med > 24 || cores < 4 || p95 > 45) return 'mid';
  if (gpu.intel || small) return 'mid';
  return med <= 18.5 && p95 < 32 ? 'high' : 'mid';
}
export { createScene };
