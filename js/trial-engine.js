// Trial engine for Reflex Lab (spec v2). Runs blocks, timing, classification and diagnostics.
// Pure helpers (classifyAttempt, buildPlan, audioStimTime, plausibleCount) are import-safe in Node.
// The DOM is touched only through the #cue overlay element passed to createEngine.

import {
  APP_VERSION, FAST_MS, SLOW_MS, MISS_MS, GONOGO_WINDOW_MS, MAX_RERUNS, WARMUP_TRIALS, PRACTICE_TRIALS,
  GO_STAR, NOGO_SHAPES, condOf,
} from './claims.js';
import { quantile } from './stats.js';

export const RERUN_CLASSES = ['falseStart', 'fast', 'miss', 'interrupted'];

/**
 * Pure classification of one attempt.
 * { kind: 'go'|'nogo', early, hidden, rt (ms or null), windowMs }
 */
export function classifyAttempt({ kind = 'go', early = false, hidden = false, rt = null, windowMs = MISS_MS } = {}) {
  if (hidden) return 'interrupted';
  if (early) return 'falseStart';
  const responded = typeof rt === 'number' && Number.isFinite(rt);
  if (kind === 'nogo') return responded ? 'commission' : 'correctWithhold';
  if (!responded || rt > windowMs) return 'miss';
  if (rt < FAST_MS) return 'fast';
  if (rt > SLOW_MS) return 'slow';
  return 'ok';
}

export function shouldRerun(cls, attemptNo, recorded) {
  return recorded && RERUN_CLASSES.includes(cls) && attemptNo <= MAX_RERUNS; // attemptNo 1..3 => up to 3 extra
}

/** Map an AudioContext.getOutputTimestamp() reading to performance.now() time of a scheduled onset. */
export function audioStimTime(ts, scheduled) {
  if (!ts || !(ts.contextTime > 0) || !(ts.performanceTime > 0) || !Number.isFinite(scheduled)) return null;
  const t = ts.performanceTime + 1000 * (scheduled - ts.contextTime);
  return Number.isFinite(t) ? t : null;
}

/** Is a typed counting answer plausible? (start - answer) must be a non-negative multiple of 3. */
export function plausibleCount(start, answer) {
  const n = Number(answer);
  if (!Number.isInteger(n) || !Number.isInteger(start)) return false;
  const d = start - n;
  return d >= 0 && d % 3 === 0 && d <= 3 * 120;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build the run plan. Blocks: { id, cond, phase: 'warmup'|'recorded'|'practice', record, slots: [{slot, kind}] }
 * ABBA: A1 B1 B2 A2 with n/2 trials each. Before/after: A (n), practice (30), B (n).
 */
export function buildPlan(claim, n, rng = Math.random) {
  const plan = [];
  const warm = [];
  for (let i = 1; i <= WARMUP_TRIALS; i++) warm.push({ slot: i, kind: 'go' });
  plan.push({ id: 'W', cond: 'A', phase: 'warmup', record: false, slots: warm });
  const next = { A: 1, B: 1 };
  const mk = (id, cond, size) => {
    const gonogo = !!condOf(claim, cond).gonogo;
    let kinds = Array(size).fill('go');
    if (gonogo) {
      const nogo = Math.round((size * 3) / 7);
      kinds = shuffle(Array(size).fill('go').concat(Array(nogo).fill('nogo')), rng);
      if (kinds[0] === 'nogo') {
        const k = kinds.findIndex((x) => x === 'go');
        [kinds[0], kinds[k]] = [kinds[k], kinds[0]];
      }
    }
    const slots = kinds.map((kind) => ({ slot: next[cond]++, kind }));
    return { id, cond, phase: 'recorded', record: true, slots };
  };
  if (claim.design === 'beforeAfter') {
    plan.push(mk('A1', 'A', n));
    const pr = [];
    for (let i = 1; i <= PRACTICE_TRIALS; i++) pr.push({ slot: i, kind: 'go' });
    plan.push({ id: 'P', cond: 'A', phase: 'practice', record: false, slots: pr });
    plan.push(mk('B1', 'B', n));
  } else {
    const h = n / 2;
    plan.push(mk('A1', 'A', h), mk('B1', 'B', h), mk('B2', 'B', h), mk('A2', 'A', h));
  }
  return plan;
}

export function randomCountStart(rng = Math.random) {
  return 120 + Math.floor(rng() * 80); // 120..199
}

export function makeRunId() {
  const a = new Uint8Array(6);
  (globalThis.crypto || { getRandomValues: (x) => x.forEach((_, i) => (x[i] = Math.floor(Math.random() * 256))) }).getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- audio
export function createAudio() {
  let ctx = null;
  const api = {
    supported: () => typeof globalThis.AudioContext !== 'undefined' || typeof globalThis.webkitAudioContext !== 'undefined',
    async prepare() {
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        ctx = new AC({ latencyHint: 'interactive' });
      }
      if (ctx.state !== 'running') await ctx.resume();
      return ctx;
    },
    /** Schedule a 1 kHz sine beep (5 ms linear attack) 100 ms ahead. Returns the mapped performance time or null. */
    beep() {
      if (!ctx || typeof ctx.getOutputTimestamp !== 'function') return null;
      const when = ctx.currentTime + 0.1;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1000;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.3, when + 0.005);
      g.gain.setValueAtTime(0.3, when + 0.14);
      g.gain.linearRampToValueAtTime(0, when + 0.15);
      osc.connect(g).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.16);
      const t = audioStimTime(ctx.getOutputTimestamp(), when);
      if (t == null) return null;
      const lead = t - performance.now();
      return lead > -20 && lead < 1500 ? t : null; // implausible mapping => treat as invalid
    },
    /** Headphones check: plays a test beep, verifies the output timestamp is usable. */
    async check() {
      await api.prepare();
      await new Promise((r) => setTimeout(r, 150)); // let the output clock start
      const t = api.beep();
      await new Promise((r) => setTimeout(r, 400));
      return t != null;
    },
  };
  return api;
}

// ---------------------------------------------------------------- engine
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createEngine({ cue, audio, rng = Math.random }) {
  const el = {
    shape: cue.querySelector('#cueShape'),
    text: cue.querySelector('#cueText'),
    meta: cue.querySelector('#cueMeta'),
    decoys: cue.querySelector('#decoys'),
    exit: cue.querySelector('#cueExit'),
    resume: cue.querySelector('#cueResume'),
  };
  let inputKind = 'pointer';
  let active = null; // current trial hook {onInput(ts, type)}
  let aborted = false;
  let paused = false;
  let hiddenGap = false;
  const down = new Set();

  function setCue(cls, text = '', glyph = '') {
    cue.className = cls;
    el.text.textContent = text;
    el.shape.textContent = glyph;
  }

  // ---- input
  cue.addEventListener('pointerdown', (e) => {
    down.add('p' + e.pointerId);
    if (!active || inputKind !== 'pointer' || !e.isPrimary) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    active.onInput(e.timeStamp, e.pointerType || 'pointer');
  });
  const up = (e) => down.delete('p' + e.pointerId);
  cue.addEventListener('pointerup', up);
  cue.addEventListener('pointercancel', up);
  document.addEventListener('keydown', (e) => {
    if (cue.hidden) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      el.exit.click();
      return;
    }
    if (e.code !== 'Space') return;
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    if (e.repeat) return;
    down.add('k' + e.code);
    if (!active || inputKind !== 'key') return;
    active.onInput(e.timeStamp, 'key');
  });
  document.addEventListener('keyup', (e) => down.delete('k' + e.code));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenGap = true;
      if (active) active.onHidden();
    }
  });

  async function waitRelease() {
    const t0 = performance.now();
    while (down.size && performance.now() - t0 < 3000) await wait(30);
    down.clear();
  }

  async function waitVisible() {
    while (document.hidden) await wait(100);
  }

  // ---- a single trial
  function runTrial({ stim, kind, glyph, windowMs, label }) {
    return new Promise((resolve) => {
      const foreperiod = 1500 + rng() * 2000;
      let finished = false;
      let stimShown = false;
      let stimT = null;
      let early = false;
      let hiddenIn = false;
      let rt = null;
      let error = null;
      let rafId = 0;
      let winTimer = 0;
      let last = null;
      const deltas = [];
      const isAudio = stim === 'audio';
      const t0 = performance.now();
      setCue(isAudio ? 'wait listen' : 'wait', isAudio ? 'LISTEN…' : 'WAIT…');
      el.meta.textContent = label || '';

      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(rafId);
        clearTimeout(winTimer);
        active = null;
        resolve({ rt, early, hidden: hiddenIn, deltas, stimT, error });
      };
      active = {
        onInput(ts) {
          if (finished) return;
          if (stimT == null || ts < stimT) {
            early = true;
          } else {
            rt = ts - stimT;
          }
          finish();
        },
        onHidden() {
          if (finished) return;
          hiddenIn = true;
          finish();
        },
        cancel: finish,
      };

      const startWindow = (lead) => {
        winTimer = setTimeout(finish, Math.max(0, lead) + windowMs + 20);
      };

      const frame = (now) => {
        if (finished) return;
        if (last != null) deltas.push(now - last);
        last = now;
        if (!stimShown && now - t0 >= foreperiod) {
          stimShown = true;
          if (isAudio) {
            const t = audio ? audio.beep() : null;
            if (t == null) {
              error = 'audio';
              finish();
              return;
            }
            stimT = t;
            startWindow(t - performance.now());
            return; // no further frame diagnostics needed once the beep is scheduled
          }
          // visual: apply the GO class now, record time on the NEXT frame (paint committed)
          setCue('go', kind === 'go' && !glyph ? 'GO!' : '', glyph || '');
          requestAnimationFrame(() => {
            if (finished) return;
            stimT = performance.now();
            startWindow(0);
          });
          return;
        }
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
    });
  }

  async function feedback(cls, rt, recorded) {
    const msg = {
      ok: Math.round(rt) + ' ms',
      slow: Math.round(rt) + ' ms (slow, kept)',
      falseStart: 'Too soon! Wait for the cue.',
      fast: 'Under 100 ms: marked as a guess. Re-run.',
      miss: 'No response in time. Re-run.',
      commission: 'That was a no-go shape. Hold back next time.',
      correctWithhold: 'Correct, you held back.',
      interrupted: 'Paused: the page was hidden.',
    }[cls];
    setCue('fb ' + cls, msg + (recorded ? '' : '  (practice)'));
    await wait(cls === 'correctWithhold' ? 600 : 850);
  }

  async function pausePrompt() {
    paused = true;
    setCue('pause', 'Run paused: the page was hidden, so that attempt was logged as interrupted.');
    el.resume.hidden = false;
    await waitVisible();
    await new Promise((r) => {
      const iv = setInterval(() => aborted && (clearInterval(iv), r()), 200);
      el.resume.onclick = () => (clearInterval(iv), r());
    });
    el.resume.hidden = true;
    paused = false;
    await waitRelease();
  }

  /**
   * Run a complete plan. hooks: { beforeBlock(block) -> Promise<boolean>, afterBlock(block), onProgress(info), renderer }
   * Returns { attempts, diag: {A:[], B:[]}, hidden, aborted, error }.
   */
  async function runPlan({ plan, claim, runId, hooks = {}, input = 'pointer', renderer = '2d' }) {
    inputKind = input;
    aborted = false;
    hiddenGap = false;
    const attempts = [];
    const diag = { A: [], B: [] };
    let anyHidden = false;
    let error = null;
    el.exit.onclick = () => {
      if (hooks.onExit) hooks.onExit();
    };
    outer: for (const block of plan) {
      if (aborted) break;
      cue.hidden = true;
      const go = hooks.beforeBlock ? await hooks.beforeBlock(block) : true;
      if (!go) {
        aborted = true;
        break;
      }
      cue.hidden = false;
      cue.focus({ preventScroll: true });
      el.decoys.hidden = !(condOf(claim, block.cond).decoys);
      const cd = condOf(claim, block.cond);
      el.meta.textContent = '';
      el.exit.hidden = false;
      for (let si = 0; si < block.slots.length; si++) {
        const s = block.slots[si];
        let attemptNo = 0;
        while (true) {
          if (aborted) break outer;
          attemptNo++;
          await waitVisible();
          await waitRelease();
          setCue('fb gap', '');
          await wait(350);
          const kind = s.kind;
          const isGo = kind === 'go';
          const windowMs = cd.gonogo ? GONOGO_WINDOW_MS : MISS_MS;
          const glyph = cd.gonogo ? (isGo ? GO_STAR : NOGO_SHAPES[Math.floor(rng() * NOGO_SHAPES.length)]) : '';
          const label =
            (block.phase === 'warmup' ? 'Warm-up (not recorded)' : block.phase === 'practice' ? 'Practice (not recorded)' : 'Block ' + block.id) +
            (block.note ? ' · ' + block.note : '') + ' · trial ' + (si + 1) + ' of ' + block.slots.length + (attemptNo > 1 ? ' · re-run ' + (attemptNo - 1) : '');
          if (hooks.onProgress) hooks.onProgress({ block, si, attemptNo });
          const stim = cd.stim === 'audio' ? 'audio' : 'visual';
          const res = await runTrial({ stim, kind, glyph, windowMs, label });
          if (aborted) break outer;
          if (res.error) {
            error = res.error;
            aborted = true;
            break outer;
          }
          const cls = classifyAttempt({ kind, early: res.early, hidden: res.hidden, rt: res.rt, windowMs });
          const p95 = res.deltas.length ? quantile(res.deltas, 0.95) : null;
          const hid = res.hidden || hiddenGap;
          hiddenGap = false;
          if (hid) anyHidden = true;
          let inputType = input === 'key' ? 'key' : 'pointer';
          attempts.push({
            runId,
            claim: claim.id,
            condition: block.cond,
            block: block.id === 'P' ? 'P' : block.id,
            slot: s.slot,
            attemptNo,
            class: cls,
            rt_ms: res.rt == null || res.early ? '' : Math.round(res.rt * 10) / 10,
            inputType,
            stimType: stim + (kind === 'nogo' ? '-nogo' : ''),
            rafP95: p95 == null ? '' : Math.round(p95 * 10) / 10,
            hidden: hid ? 1 : 0,
            appVersion: APP_VERSION,
            renderer,
          });
          if (block.record && res.deltas.length) diag[block.cond].push(...res.deltas);
          await feedback(cls, res.rt, block.record || block.phase === 'practice' ? true : false);
          if (cls === 'interrupted') await pausePrompt();
          if (!shouldRerun(cls, attemptNo, block.record)) break;
        }
      }
      cue.hidden = true;
      if (hooks.afterBlock) await hooks.afterBlock(block);
    }
    cue.hidden = true;
    active = null;
    return { attempts, diag, hidden: anyHidden, aborted, error };
  }

  return {
    runPlan,
    abort() {
      aborted = true;
      if (active) active.cancel();
    },
    isAborted: () => aborted,
  };
}
