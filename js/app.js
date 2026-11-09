// Reflex Lab app shell: screens, settings, XP/badges, storage. Measurement lives in trial-engine.js.
import {
  APP_VERSION, CLAIMS, CONTROL_OPTIONS, CUSTOM_MANIPULATIONS, SENTENCE_STARTERS, TRIAL_OPTIONS, DEFAULT_TRIALS, DV,
  customClaim, getClaim, condOf,
} from './claims.js';
import { createEngine, createAudio, buildPlan, makeRunId, randomCountStart, plausibleCount } from './trial-engine.js';
import { summarise, analysedTrials, classCounts, technicalWarning, quantile, median, mean, minMax } from './stats.js';
import { toTSV, toCSV, classLine, CLASS_COLUMNS } from './records.js';
import { dotPlot, orderPlot, esc } from './charts.js';

const $ = (s, r = document) => r.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
const root = document.documentElement;
const ui = $('#ui');

// ------------------------------------------------------------------ storage (always try/catch)
const store = {
  get(k, def) {
    try {
      const v = localStorage.getItem('reflexlab.' + k);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(k, v) { try { localStorage.setItem('reflexlab.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  clearAll() {
    try { Object.keys(localStorage).filter((k) => k.startsWith('reflexlab.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
  },
};

const S = {
  settings: { still: false, large: false, twoD: false, quality: 'auto', input: 'pointer', mode: 'investigation', ...store.get('settings', {}) },
  teacher: { trials: DEFAULT_TRIALS, audio: false, custom: false, still: false, ...store.get('teacher', {}) },
  profile: { xp: 0, badges: [], pairExported: false, arcadePB: null, ...store.get('profile', {}) },
  runs: store.get('runs', []),
  scene: null,
  want: ['hub', {}],
  planning: null,
  engine: null,
  audio: createAudio(),
  headphonesOK: false,
  current: null, // run being viewed
};
const saveSettings = () => store.set('settings', S.settings);
const saveProfile = () => store.set('profile', S.profile);
const saveRuns = () => store.set('runs', S.runs.slice(-60));
if (!TRIAL_OPTIONS.includes(S.teacher.trials)) S.teacher.trials = DEFAULT_TRIALS;

const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const stillOn = () => !!(S.settings.still || S.teacher.still || reducedMotion());

// ------------------------------------------------------------------ ranks / badges
const RANKS = [
  { name: 'Intern', xp: 0 },
  { name: 'Lab Tech', xp: 60 },
  { name: 'Researcher', xp: 150 },
  { name: 'Principal Investigator', xp: 300 },
];
const rankOf = (xp) => RANKS.reduce((r, x, i) => (xp >= x.xp ? i : r), 0);
const BADGES = [
  { id: 'clean', name: 'Clean Record', how: 'Every attempt logged, no interruption, every slot filled.' },
  { id: 'fair', name: 'Fair Tester', how: 'Two controlled variables and the fair-test questions answered.' },
  { id: 'sceptic', name: 'Sceptic', how: 'Your data were not consistent with a claim. Great science!' },
  { id: 'replicator', name: 'Replicator', how: 'Ran the same investigation a second time.' },
  { id: 'pair', name: 'Pair Scientist', how: 'Exported your class summary line for the class paired-difference.' },
  { id: 'full', name: 'Full Lab', how: 'Completed all 6 claims.' },
];

// ------------------------------------------------------------------ scene wrapper
function sceneMode(mode, extra = {}) {
  S.want = [mode, extra];
  try { if (S.scene) S.scene.setMode(mode, extra); } catch (e) { console.warn('scene.setMode failed', e); }
}
async function loadScene() {
  const canvas = $('#scene');
  const opts = { quality: S.settings.quality === 'auto' ? 'mid' : S.settings.quality, still: stillOn(), reducedMotion: reducedMotion() };
  if (!S.settings.twoD) {
    try {
      const m = await import('./scene/index.js');
      const create = m.default || m.createScene;
      const sc = await create(canvas, opts);
      if (!sc) throw new Error('createScene returned nothing');
      return sc;
    } catch (e) {
      console.info('3D layer unavailable, using 2D mode:', e && e.message);
    }
  }
  const m = await import('./scene/stub.js');
  return m.default(canvas, opts);
}
async function bootScene() {
  S.scene = await loadScene();
  root.classList.toggle('twod', !!S.scene.isStub);
  try { S.scene.on('contextlost', () => { toast('3D view stopped, switching to 2D mode.'); S.settings.twoD = true; saveSettings(); applyTwoD(); }); } catch (e) { /* ignore */ }
  try {
    S.scene.setRank(rankOf(S.profile.xp));
    S.scene.setStill(stillOn());
    S.scene.setMode(S.want[0], S.want[1]);
  } catch (e) { console.warn(e); }
  if (!S.scene.isStub) chooseQuality();
}
async function chooseQuality() {
  if (S.settings.quality !== 'auto') { try { S.scene.setQuality(S.settings.quality); } catch (e) { /* ignore */ } return; }
  await wait(1500); // warm-up
  if (S.want[0] === 'frozen') return;
  let last = performance.now();
  const dts = [];
  for (let i = 0; i < 50; i++) { const t = await new Promise((r) => requestAnimationFrame(r)); dts.push(t - last); last = t; }
  const avg = dts.slice(5).reduce((s, x) => s + x, 0) / (dts.length - 5);
  const q = avg > 26 ? 'low' : avg > 18.5 ? 'mid' : 'high';
  try { S.scene.setQuality(q); } catch (e) { /* ignore */ }
  S.settings.qualityChosen = q;
}
async function applyTwoD() {
  try { S.scene && S.scene.dispose(); } catch (e) { /* ignore */ }
  S.scene = null;
  await bootScene();
}

// ------------------------------------------------------------------ small helpers
function say(msg) { $('#live').textContent = ''; setTimeout(() => ($('#live').textContent = msg), 30); }
let toastTimer = 0;
function toast(msg, ms = 4200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
  say(msg);
}
function show(html, { focus = true } = {}) {
  S.screen = 'other';
  ui.classList.remove('running');
  ui.innerHTML = html;
  window.scrollTo(0, 0);
  if (focus) { const h = $('h1', ui); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  updateChip();
}
function updateChip() {
  const r = rankOf(S.profile.xp);
  $('#rankChip').textContent = RANKS[r].name + ' · ' + S.profile.xp + ' XP';
}
function applySettings() {
  root.classList.toggle('large', !!S.settings.large);
  root.classList.toggle('still', stillOn());
  try { S.scene && S.scene.setStill(stillOn()); } catch (e) { /* ignore */ }
}
function dialog(html, onClose) {
  const d = document.createElement('dialog');
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => { d.remove(); if (onClose) onClose(); });
  d.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) d.close(); });
  d.showModal();
  return d;
}
async function copyText(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied ' + what + '. Paste it into your sheet.');
  } catch (e) {
    const d = dialog(`<h2>Copy ${esc(what)}</h2><p>Select all and copy:</p><textarea readonly style="min-height:160px">${esc(text)}</textarea><p><button class="btn" data-close>Close</button></p>`);
    const ta = $('textarea', d);
    ta.focus(); ta.select();
  }
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fmt = (x) => (x == null || !Number.isFinite(x) ? '–' : String(Math.round(x)));
const allClaims = () => CLAIMS;

// ------------------------------------------------------------------ hub
function renderHub() {
  sceneMode('hub');
  const xp = S.profile.xp;
  const r = rankOf(xp);
  const next = RANKS[r + 1];
  const pct = next ? Math.round(((xp - RANKS[r].xp) / (next.xp - RANKS[r].xp)) * 100) : 100;
  const done = new Set(S.runs.filter((x) => x.awarded).map((x) => x.claimId));
  const arcade = S.settings.mode === 'arcade';
  const cards = allClaims().map((c) => {
    const locked = c.audio && !S.teacher.audio;
    return `<button type="button" class="claimCard" data-act="plan" data-id="${c.id}" ${locked ? 'disabled aria-disabled="true"' : ''}>
      ${done.has(c.id) ? '<span class="done">Done</span>' : ''}
      <h3>${esc(c.title)}</h3><p class="muted small">${esc(c.blurb)}</p>
      ${c.order ? '<span class="tag">before / after study</span> ' : ''}${locked ? '<span class="tag">teacher: audio off</span>' : ''}</button>`;
  }).join('') + (S.teacher.custom ? `<button type="button" class="claimCard" data-act="plan" data-id="custom"><h3>Design your own</h3><p class="muted small">Pick an approved change and state your controls.</p><span class="tag">teacher enabled</span></button>` : '');
  show(`
  <h1>Reflex Lab</h1>
  <p class="muted" style="max-width:62ch">Test claims about <strong>your own</strong> reaction time. Plan a fair test, collect every trial, then decide what the evidence says. Speed is not smartness.</p>
  <div class="panel">
    <fieldset style="margin:0;border:0;padding:0"><legend class="sr">Mode</legend>
      <div class="row">
        <label><input type="radio" name="mode" value="investigation" ${arcade ? '' : 'checked'}> <strong>Investigation</strong> (default): earn XP for good science</label>
        <label><input type="radio" name="mode" value="arcade" ${arcade ? 'checked' : ''}> <strong>Arcade warm-up</strong>: personal best only</label>
      </div>
    </fieldset>
  </div>
  ${arcade ? `<div class="panel"><h2>Arcade warm-up</h2><p>Five quick taps. You only compete with your own best. There are no rankings and no XP. Speed does not equal smartness.</p>
    <p class="muted">Personal best: <strong>${S.profile.arcadePB == null ? 'none yet' : Math.round(S.profile.arcadePB) + ' ms'}</strong></p>
    <button class="btn warm" data-act="arcade">Start warm-up</button></div>` : `
  <h2>Pick a claim to test</h2>
  <div class="grid g3" style="margin-bottom:16px">${cards}</div>`}
  <div class="grid g2">
    <div class="panel"><h3>Lab rank: ${esc(RANKS[r].name)}</h3>
      <div class="bar" role="img" aria-label="${pct} percent to next rank"><i style="width:${pct}%"></i></div>
      <p class="small muted" style="margin-top:8px">${xp} XP${next ? ' · ' + (next.xp - xp) + ' XP to ' + esc(next.name) : ' · top rank'}. XP rewards complete records, fair tests, predictions, justification, replication and honest reporting.</p></div>
    <div class="panel"><h3>Badges</h3><div class="badges">${BADGES.map((b) => `<span class="badge ${S.profile.badges.includes(b.id) ? 'on' : 'off'}" title="${esc(b.how)}">${esc(b.name)}</span>`).join('')}</div></div>
  </div>`);
  S.screen = 'hub';
}

// ------------------------------------------------------------------ planning gate
function startPlanning(id) {
  const base = id === 'custom' ? null : getClaim(id);
  const prev = S.planning && S.planning.id === id ? S.planning : null;
  S.planning = {
    id, claim: base, controls: prev ? prev.controls : [], own: prev ? prev.own : '', prediction: prev ? prev.prediction : null,
    manip: prev ? prev.manip : CUSTOM_MANIPULATIONS[0].id, customText: prev ? prev.customText : '', customFaster: prev ? prev.customFaster : null,
  };
  renderPlanning();
}
function planClaim() {
  const p = S.planning;
  return p.claim || customClaim(p.manip, p.customText.trim(), p.customFaster || 'A');
}
function renderPlanning() {
  sceneMode('planning', { claim: S.planning.id });
  const p = S.planning;
  const c = planClaim();
  const custom = !p.claim;
  show(`
  <h1>Plan your test</h1>
  <form id="plan" class="panel" autocomplete="off" novalidate>
    ${custom ? `<div class="field"><label for="ctext"><span>Your claim (one sentence)</span></label><input id="ctext" type="text" maxlength="140" value="${esc(p.customText)}" placeholder="e.g. People react faster when they stand up.">
      <label for="cmanip" style="margin-top:8px"><span>What will you change? (approved changes only)</span></label>
      <select id="cmanip">${CUSTOM_MANIPULATIONS.map((m) => `<option value="${m.id}" ${m.id === p.manip ? 'selected' : ''}>${esc(m.iv)}</option>`).join('')}</select>
      <fieldset style="margin-top:10px"><legend>My claim says...</legend>
        ${['A', 'B', 'none'].map((k) => `<label><input type="radio" name="cfaster" value="${k}" ${p.customFaster === k ? 'checked' : ''}> ${k === 'none' ? 'There is no difference' : esc(condOf(c, k).label) + ' is faster'}</label>`).join('')}</fieldset></div>`
      : `<h2>${esc(c.claimText)}</h2>`}
    ${c.note ? `<p class="stmt pred small">${esc(c.note)}</p>` : ''}
    <div class="grid g2" style="margin-bottom:12px">
      <div><h3>Variables</h3>
        <p class="small"><strong>Independent (what you change):</strong> ${esc(c.iv)}</p>
        <p class="small"><strong>Dependent (what you measure):</strong> ${esc(DV)}</p></div>
      <div><h3>Conditions</h3>
        <p class="small"><strong>A: ${esc(c.a.label)}.</strong> ${esc(c.a.how)}</p>
        <p class="small"><strong>B: ${esc(c.b.label)}.</strong> ${esc(c.b.how)}</p></div>
    </div>
    <fieldset id="ctrls"><legend>Controlled variables: keep these the same (pick at least two)</legend>
      ${CONTROL_OPTIONS.filter((o) => o.id !== 'volume' || c.audio).map((o) => `<label><input type="checkbox" name="ctrl" value="${o.id}" ${p.controls.includes(o.id) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
      <label for="own"><span class="small muted">Or add your own controlled variable</span></label>
      <input id="own" type="text" maxlength="80" value="${esc(p.own)}"></fieldset>
    <fieldset id="preds"><legend>My prediction (this is not marked)</legend>
      ${['A', 'B', 'none'].map((k) => `<label><input type="radio" name="pred" value="${k}" ${p.prediction === k ? 'checked' : ''}> ${k === 'none' ? 'No difference' : esc(condOf(c, k).short) + ' will be faster'}</label>`).join('')}</fieldset>
    <fieldset><legend>How will you respond?</legend>
      <label><input type="radio" name="inp" value="pointer" ${S.settings.input === 'pointer' ? 'checked' : ''}> Tap or click anywhere on the cue screen</label>
      <label><input type="radio" name="inp" value="key" ${S.settings.input === 'key' ? 'checked' : ''}> Press the Space bar</label>
      <p class="small muted">Use the same way of responding for the whole run.</p></fieldset>
    ${c.audio ? `<fieldset><legend>Headphones check</legend><p class="small">Put headphones on and set a comfortable volume, then press the button. You should hear one short beep.</p>
      <button type="button" class="btn ghost" data-act="hpcheck">Play test beep</button> <span id="hpmsg" class="small" role="status">${S.headphonesOK ? 'Check passed.' : ''}</span></fieldset>` : ''}
    <p id="gatemsg" class="small muted" role="status"></p>
    <div class="row"><button type="button" class="btn warm" id="startBtn" data-act="start" disabled>Start the test</button>
      <button type="button" class="btn ghost" data-act="hub">Back</button></div>
  </form>`);
  updateGate();
}
function gateMissing() {
  const p = S.planning;
  const c = planClaim();
  const miss = [];
  if (!p.claim) {
    if (p.customText.trim().length < 8) miss.push('write your claim');
    if (!p.customFaster) miss.push('say what your claim predicts');
  }
  const n = p.controls.length + (p.own.trim().length > 2 ? 1 : 0);
  if (n < 2) miss.push('choose two controlled variables');
  if (!p.prediction) miss.push('make a prediction');
  if (c.audio && !S.headphonesOK) miss.push('pass the headphones check');
  return miss;
}
function updateGate() {
  const btn = $('#startBtn');
  if (!btn) return;
  const m = gateMissing();
  btn.disabled = m.length > 0;
  $('#gatemsg').textContent = m.length ? 'Still to do: ' + m.join(', ') + '.' : 'Ready. Your warm-up trials come first.';
}
function readPlanning(e) {
  const t = e.target;
  const p = S.planning;
  if (!p || !t.closest('#plan')) return;
  if (t.name === 'ctrl') p.controls = [...document.querySelectorAll('input[name=ctrl]:checked')].map((x) => x.value);
  else if (t.id === 'own') p.own = t.value;
  else if (t.name === 'pred') p.prediction = t.value;
  else if (t.name === 'inp') { S.settings.input = t.value; saveSettings(); }
  else if (t.id === 'ctext') p.customText = t.value;
  else if (t.id === 'cmanip') { p.manip = t.value; renderPlanning(); return; }
  else if (t.name === 'cfaster') p.customFaster = t.value;
  updateGate();
}

// ------------------------------------------------------------------ running a test
function getEngine() {
  if (!S.engine) S.engine = createEngine({ cue: $('#cue'), audio: S.audio });
  return S.engine;
}
async function settleFrozen() {
  sceneMode('frozen');
  await raf(); await raf(); await wait(150);
}
function blockIntro(block, idx, total, claim) {
  return new Promise((resolve) => {
    sceneMode('planning', { claim: claim.id });
    const c = condOf(claim, block.cond);
    block.note = '';
    if (c.count) { block.countStart = randomCountStart(); block.note = 'count back from ' + block.countStart; }
    const title = block.phase === 'warmup' ? 'Warm-up' : block.phase === 'practice' ? 'Practice: 30 trials' : 'Block ' + block.id;
    show(`
    <h1>${esc(title)}</h1>
    <div class="panel">
      <p class="muted small">Step ${idx + 1} of ${total}${block.record ? ' · recorded' : ' · not recorded'}</p>
      <h2>Condition ${block.cond}: ${esc(c.label)}</h2>
      <p>${esc(c.how)}</p>
      ${c.count ? `<p class="stmt pred"><strong>Start counting from ${block.countStart}</strong>, silently, backwards by 3 (${block.countStart}, ${block.countStart - 3}, ${block.countStart - 6}...). Keep going the whole block. After the block you will type the number you reached.</p>` : ''}
      ${c.gonogo ? `<p class="stmt pred">Tap <strong>only</strong> for the filled star (★). Do not tap for squares, diamonds or triangles.</p>` : ''}
      ${block.phase === 'warmup' ? '<p>These first trials are for getting used to the screen. They are not part of your results.</p>' : ''}
      ${block.phase === 'practice' ? '<p>Keep tapping on GO. These are not recorded: they are your practice.</p>' : ''}
      <p class="small muted">The 3D lab pauses while you are timed so both conditions get the same screen.${S.settings.input === 'key' ? ' Press Space to respond.' : ' Tap or click the screen to respond.'} Press Esc to stop.</p>
      <div class="row"><button class="btn warm" id="goBtn">Start ${block.phase === 'warmup' ? 'warm-up' : 'block'}</button><button class="btn ghost" id="stopBtn">Stop run</button></div>
    </div>`);
    $('#goBtn').focus();
    $('#goBtn').onclick = async () => {
      try { if (claim.audio) await S.audio.prepare(); } catch (e) { /* handled by trial */ }
      await settleFrozen();
      resolve(true);
    };
    $('#stopBtn').onclick = () => resolve(false);
  });
}
function countPrompt(block) {
  return new Promise((resolve) => {
    sceneMode('planning');
    show(`<h1>Counting check</h1><div class="panel"><p>What number did you reach when the block ended? (You started at <strong>${block.countStart}</strong>.) A rough answer is fine.</p>
      <div class="field"><label for="cnt"><span>Number reached</span></label><input id="cnt" inputmode="numeric" type="text" maxlength="5"></div>
      <button class="btn" id="cntOK">Continue</button></div>`);
    $('#cnt').focus();
    const done = () => resolve(String($('#cnt').value).trim());
    $('#cntOK').onclick = done;
    $('#cnt').onkeydown = (e) => { if (e.key === 'Enter') done(); };
  });
}

async function startRun() {
  const p = S.planning;
  const claim = planClaim();
  const n = S.teacher.trials;
  const plan = buildPlan(claim, n);
  const runId = makeRunId();
  const countChecks = [];
  const engine = getEngine();
  const total = plan.length;
  let aborted = false;
  const hooks = {
    beforeBlock: (b) => blockIntro(b, plan.indexOf(b), total, claim),
    afterBlock: async (b) => {
      if (b.record && condOf(claim, b.cond).count) {
        const ans = await countPrompt(b);
        countChecks.push({ block: b.id, start: b.countStart, answer: ans, plausible: plausibleCount(b.countStart, ans) });
      }
    },
    onExit: () => { if (confirm('Stop this run? Your attempts so far stay in your records, but there will be no result.')) { aborted = true; engine.abort(); } },
  };
  const res = await engine.runPlan({ plan, claim, runId, hooks, input: S.settings.input, renderer: S.scene && !S.scene.isStub ? 'webgl' : '2d' });
  $('#cue').hidden = true;
  const base = {
    runId, claimId: claim.id, claimTitle: claim.title, claim: claim.custom ? claim : undefined, startedAt: new Date().toISOString(), n,
    prediction: p.prediction, controls: [...p.controls, ...(p.own.trim() ? [p.own.trim()] : [])], input: S.settings.input,
    attempts: res.attempts, hidden: res.hidden, countChecks, awarded: false, justification: '', fairAnswers: {}, honest: false, xpGained: 0,
  };
  if (res.error === 'audio') {
    S.runs.push({ ...base, aborted: true }); saveRuns();
    sceneMode('planning');
    show(`<h1>Audio timing not available</h1><div class="panel"><p>This device cannot give a trustworthy sound timestamp (its output clock was not valid), so the sound test was blocked rather than guess.</p><p>Try another browser or device, or choose a different claim.</p><button class="btn" data-act="hub">Back to the lab</button></div>`);
    return;
  }
  if (res.aborted || aborted) {
    S.runs.push({ ...base, aborted: true }); saveRuns();
    sceneMode('hub'); toast('Run stopped. Attempts so far were saved to your records.');
    renderHub();
    return;
  }
  const an = analysedTrials(res.attempts);
  const p95A = quantile(res.diag.A, 0.95);
  const p95B = quantile(res.diag.B, 0.95);
  const tech = technicalWarning({ p95A, p95B, hidden: res.hidden });
  const summary = summarise({ a: an.a, b: an.b, claimFaster: claim.faster, prediction: p.prediction, technical: tech });
  summary.p95A = p95A; summary.p95B = p95B;
  const run = { ...base, summary, complete: an.a.length === n && an.b.length === n };
  S.runs.push(run);
  saveRuns();
  S.current = run;
  renderResults(run);
}

async function startArcade() {
  const claim = { id: 'arcade', a: { label: 'Quick test', stim: 'visual' }, b: { label: '', stim: 'visual' }, design: 'x' };
  const plan = [
    { id: 'W', cond: 'A', phase: 'warmup', record: false, slots: [1, 2].map((slot) => ({ slot, kind: 'go' })) },
    { id: 'Q', cond: 'A', phase: 'recorded', record: true, slots: [1, 2, 3, 4, 5].map((slot) => ({ slot, kind: 'go' })) },
  ];
  const engine = getEngine();
  let stopped = false;
  const res = await engine.runPlan({
    plan, claim, runId: 'arcade', input: S.settings.input, renderer: '2d',
    hooks: {
      beforeBlock: async (b) => { if (b.id === 'W') { sceneMode('planning'); show(`<h1>Arcade warm-up</h1><div class="panel"><p>2 practice taps, then 5 timed. ${S.settings.input === 'key' ? 'Press Space' : 'Tap'} when the screen says GO.</p><div class="row"><button class="btn warm" id="goBtn">Start</button><button class="btn ghost" id="stopBtn">Back</button></div></div>`); const ok = await new Promise((r) => { $('#goBtn').onclick = () => r(true); $('#stopBtn').onclick = () => r(false); }); if (ok) await settleFrozen(); return ok; } return true; },
      onExit: () => { if (confirm('Stop the warm-up?')) { stopped = true; engine.abort(); } },
    },
  });
  $('#cue').hidden = true;
  if (res.aborted || stopped) return renderHub();
  const good = res.attempts.filter((t) => t.block === 'Q' && (t.class === 'ok' || t.class === 'slow')).map((t) => t.rt_ms);
  const best = good.length ? Math.min(...good) : null;
  const newPB = best != null && (S.profile.arcadePB == null || best < S.profile.arcadePB);
  if (newPB) { S.profile.arcadePB = best; saveProfile(); }
  sceneMode('results');
  show(`<h1>Warm-up done</h1><div class="panel"><p>Median: <strong>${fmt(median(good))} ms</strong> · Best tap: <strong>${fmt(best)} ms</strong></p>
    <p>Personal best: <strong>${fmt(S.profile.arcadePB)} ms</strong> ${newPB ? '(new!)' : ''}</p>
    <p class="muted small">Browser-estimated times. Speed does not equal smartness. These taps are not added to your science records.</p>
    <div class="row"><button class="btn warm" data-act="arcade">Go again</button><button class="btn ghost" data-act="hub">Back to the lab</button></div></div>`);
}

// ------------------------------------------------------------------ results
function explain(s, claim) {
  if (s.label === 'warning') return s.warningText;
  const ps = s.pairScore == null ? null : Math.round(s.pairScore);
  const slower = s.diff > 0 ? 'slower' : 'faster';
  const base = `Median ${esc(claim.a.short)}: ${fmt(s.medianA)} ms · median ${esc(claim.b.short)}: ${fmt(s.medianB)} ms (B ${slower} by ${fmt(Math.abs(s.diff))} ms). Pair score: B was slower in ${ps}% of all A-B pairs.`;
  if (s.label === 'clear') return base + ' Both the typical difference and the pairs point the same way.';
  if (s.label === 'none') return base + ' The medians are close and the pairs are split about evenly.';
  return base + (s.nA < 6 || s.nB < 6 ? ' You need at least 6 usable trials in each condition.' : ' The evidence sits between "clear" and "no difference". More trials or a replication would help.');
}
function summaryTable(run) {
  const claim = run.claim || getClaim(run.claimId);
  const s = run.summary;
  const cc = classCounts(run.attempts);
  const an = analysedTrials(run.attempts);
  const rng = (arr) => { const m = minMax(arr); return m ? Math.round(m[0]) + '–' + Math.round(m[1]) : '–'; };
  const extra = (k) => {
    const o = cc[k];
    const bits = [];
    if (o.falseStart) bits.push(o.falseStart + ' false start');
    if (o.fast) bits.push(o.fast + ' under 100 ms');
    if (o.miss) bits.push(o.miss + ' ' + (condOf(claim, k).gonogo ? 'missed star' : 'missed'));
    if (o.slow) bits.push(o.slow + ' slow (kept)');
    if (o.commission || o.correctWithhold) bits.push(`${o.commission || 0} tap${o.commission === 1 ? '' : 's'} on no-go, ${o.correctWithhold || 0} held back`);
    if (o.interrupted) bits.push(o.interrupted + ' interrupted');
    return bits.join('; ') || '–';
  };
  return `<div class="tblwrap"><table><caption class="sr">Summary of your analysed trials</caption><thead><tr><th>Condition</th><th>n</th><th>Median</th><th>Mean</th><th>Range</th><th>Other attempts logged</th></tr></thead><tbody>
    <tr><td>A: ${esc(claim.a.label)}</td><td>${s.nA}</td><td><strong>${fmt(s.medianA)}</strong></td><td>${fmt(s.meanA)}</td><td>${rng(an.a)}</td><td>${esc(extra('A'))}</td></tr>
    <tr><td>B: ${esc(claim.b.label)}</td><td>${s.nB}</td><td><strong>${fmt(s.medianB)}</strong></td><td>${fmt(s.meanB)}</td><td>${rng(an.b)}</td><td>${esc(extra('B'))}</td></tr>
    <tr><td colspan="2"><strong>B minus A</strong></td><td><strong>${s.diff == null ? '–' : (s.diff > 0 ? '+' : '') + Math.round(s.diff)}</strong></td><td colspan="3">Pair score ${s.pairScore == null ? '–' : Math.round(s.pairScore) + '%'} (share of A-B pairs where B was slower)</td></tr>
  </tbody></table></div>`;
}
function chartsHTML(run) {
  const claim = run.claim || getClaim(run.claimId);
  const an = analysedTrials(run.attempts);
  const s = run.summary;
  return {
    dot: dotPlot({ a: an.a, b: an.b, medianA: s.medianA, medianB: s.medianB, labelA: 'A ' + claim.a.short, labelB: 'B ' + claim.b.short }),
    order: orderPlot({ seq: an.seq, labelA: 'A ' + claim.a.short, labelB: 'B ' + claim.b.short }),
  };
}
function renderResults(run) {
  S.current = run;
  sceneMode('results');
  const claim = run.claim || getClaim(run.claimId);
  const s = run.summary;
  const ch = chartsHTML(run);
  const predLabel = { A: claim.a.short + ' faster', B: claim.b.short + ' faster', none: 'no difference' }[run.prediction] || 'none';
  const scene3d = S.scene && !S.scene.isStub;
  const checks = (run.countChecks || []).filter((c) => !c.plausible);
  show(`
  <h1>Your results</h1>
  <p class="muted">${esc(claim.claimText)} · You predicted: ${esc(predLabel)}</p>
  <div class="ev ${s.label}" role="group" aria-label="Evidence label"><h2>${esc(s.text)}</h2><p style="margin:.3em 0 0">${s.label === 'warning' ? esc(s.warningText) + '</p><ul class="small">' + s.technicalReasons.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul><p class="small" style="margin:0">Numbers shown below are still your real data. Run it again if you can.' : explain(s, claim)}</p></div>
  <div class="panel">
    <div class="stmt"><strong>Claim:</strong> ${esc(s.claimText)}</div>
    <div class="stmt pred"><strong>Prediction:</strong> ${esc(s.predictionText)}</div>
    <p class="small muted">The claim and your prediction are judged separately. A wrong prediction is still good science. ${claim.note ? esc(claim.note) : ''}</p>
    ${checks.length ? `<p class="small">Counting check: ${checks.map((c) => 'block ' + esc(c.block) + ' answer "' + esc(c.answer) + '" looks unusual').join('; ')}. Noted, not removed.</p>` : ''}
  </div>
  <div class="plots"><div class="panel"><h3>Every trial, by condition</h3>${ch.dot}</div><div class="panel"><h3>Trials in the order you did them</h3>${ch.order}</div></div>
  <div class="panel"><h3>Summary</h3>${summaryTable(run)}
    <details><summary>All attempts (${run.attempts.length}) including re-runs and warm-up</summary><div class="tblwrap"><table><thead><tr><th>Block</th><th>Slot</th><th>Try</th><th>Class</th><th>ms</th></tr></thead><tbody>
    ${run.attempts.map((t) => `<tr><td>${esc(t.block)}${esc(t.condition)}</td><td>${t.slot}</td><td>${t.attemptNo}</td><td>${esc(t.class)}</td><td>${esc(t.rt_ms)}</td></tr>`).join('')}</tbody></table></div></details>
    <p class="small muted">Times are browser-estimated and include the screen, your device and your hand. They are not nerve speed. Speed does not equal smartness.</p></div>
  ${run.awarded ? awardedPanel(run) : justificationPanel(run, claim)}
  <div class="row" style="margin:12px 0 24px">
    ${scene3d ? '<button class="btn ghost" data-act="replay">Watch the neural replay (optional)</button>' : ''}
    <button class="btn" data-act="again">Run it again (replication)</button>
    <button class="btn ghost" data-act="records">Records and export</button>
    <button class="btn ghost" data-act="print">Print results card</button>
    <button class="btn ghost" data-act="hub">Back to the lab</button>
  </div>`);
}
function justificationPanel(run, claim) {
  return `<form class="panel" id="just" novalidate><h3>Justify your conclusion</h3>
    <p class="small">Write one or two sentences about what the evidence shows. Your badge and XP are awarded after this.</p>
    <fieldset><legend>Was it a fair test?</legend>
      ${claim.fair.map((q, i) => `<div class="field"><label for="fq${i}"><span class="small">${esc(q)}</span></label><select id="fq${i}" data-fq="${i}"><option value="">Choose...</option><option>Yes</option><option>No</option><option>Not sure</option></select></div>`).join('')}</fieldset>
    <label for="jtext"><span><strong>My justification</strong></span></label>
    <div class="starters" role="group" aria-label="Sentence starters">${SENTENCE_STARTERS.map((t, i) => `<button type="button" data-act="starter" data-i="${i}">${esc(t.trim())}...</button>`).join('')}</div>
    <textarea id="jtext" maxlength="600" aria-describedby="jhint"></textarea><p id="jhint" class="small muted">At least 5 words.</p>
    <label><input type="checkbox" id="honest"> I kept every trial, including the odd ones, and reported them honestly.</label>
    <button type="button" class="btn warm" id="jsubmit" data-act="submitjust" disabled>Submit and collect XP</button></form>`;
}
function awardedPanel(run) {
  return `<div class="panel"><h3>Your justification</h3><p>${esc(run.justification)}</p><p class="small muted">+${run.xpGained} XP earned on this run.</p></div>`;
}
function updateJust() {
  const btn = $('#jsubmit');
  if (!btn) return;
  const words = $('#jtext').value.trim().split(/\s+/).filter(Boolean).length;
  const fq = [...document.querySelectorAll('[data-fq]')].every((s) => s.value);
  btn.disabled = !(words >= 5 && fq);
}
function submitJust() {
  const run = S.current;
  if (!run || run.awarded) return;
  const claim = run.claim || getClaim(run.claimId);
  run.justification = $('#jtext').value.trim();
  run.honest = $('#honest').checked;
  claim.fair.forEach((_, i) => (run.fairAnswers[i] = $('#fq' + i).value));
  const xp = [];
  const add = (n, why) => xp.push([n, why]);
  if (run.prediction) add(10, 'prediction made');
  const ctl = run.controls.length >= 2;
  add(ctl ? 10 : 0, 'fair-test plan');
  add(10, 'fair-test questions answered');
  if (run.complete && !run.hidden && !run.attempts.some((t) => t.class === 'interrupted')) add(20, 'complete record');
  add(20, 'justification written');
  const prior = S.runs.some((r) => r !== run && r.awarded && r.claimId === run.claimId);
  if (prior) add(15, 'replication');
  if (run.honest) add(10, 'honest reporting');
  const newBadges = [];
  const give = (id, ok) => { if (ok && !S.profile.badges.includes(id)) newBadges.push(id); };
  give('clean', run.complete && !run.hidden && !run.attempts.some((t) => t.class === 'interrupted'));
  give('fair', ctl && Object.values(run.fairAnswers).every(Boolean));
  give('sceptic', run.summary.claim === 'notConsistent');
  give('replicator', prior);
  run.awarded = true;
  const awardedClaims = new Set(S.runs.filter((r) => r.awarded).map((r) => r.claimId));
  give('full', CLAIMS.every((c) => awardedClaims.has(c.id)));
  newBadges.forEach(() => add(10, 'new badge'));
  const gained = xp.reduce((s, x) => s + x[0], 0);
  const before = rankOf(S.profile.xp);
  run.xpGained = gained;
  S.profile.xp += gained;
  S.profile.badges.push(...newBadges);
  const after = rankOf(S.profile.xp);
  saveProfile(); saveRuns();
  const names = newBadges.map((id) => BADGES.find((b) => b.id === id).name);
  toast(`+${gained} XP` + (names.length ? ' · Badge: ' + names.join(', ') : '') + (after > before ? ' · Rank up: ' + RANKS[after].name + '!' : '') + (newBadges.includes('sceptic') ? ' Questioning a claim is great science.' : ''), 7000);
  if (after > before) { try { S.scene.setRank(after); S.scene.celebrate('rank'); } catch (e) { /* ignore */ } }
  else if (names.length) { try { S.scene.celebrate('badge'); } catch (e) { /* ignore */ } }
  renderResults(run);
}

async function playReplay() {
  const run = S.current;
  const claim = run.claim || getClaim(run.claimId);
  const bar = $('#replayBar');
  let compare = false;
  const draw = () => {
    bar.hidden = false;
    bar.innerHTML = `<p class="small" style="margin:0 0 8px">Simplified illustration: not a measurement of your nerves. A reflex uses a shorter path through the spinal cord.</p>
      <div class="row"><label><input type="checkbox" id="cmpReflex" ${compare ? 'checked' : ''}> Compare with a reflex arc</label><button class="btn sm" id="skipReplay">Skip</button></div>`;
    $('#cmpReflex').onchange = (e) => { compare = e.target.checked; start(); };
    $('#skipReplay').onclick = end;
  };
  let token = 0;
  const end = () => { token++; bar.hidden = true; ui.style.visibility = ''; sceneMode('results'); };
  const start = async () => {
    const my = ++token;
    ui.style.visibility = 'hidden';
    sceneMode('replay');
    draw();
    try { await S.scene.playReplay({ stim: claim.b.stim === 'audio' ? 'audio' : 'visual', compareReflex: compare }); } catch (e) { /* ignore */ }
    if (my === token) end();
  };
  start();
}

// ------------------------------------------------------------------ records / export
function allAttempts() { return S.runs.flatMap((r) => r.attempts || []); }
function renderRecords() {
  sceneMode('results');
  const runs = S.runs.filter((r) => r.summary).slice().reverse();
  show(`<h1>Records</h1>
  <div class="panel"><p>Every attempt is kept, including false starts and re-runs. <strong>${allAttempts().length}</strong> attempts across <strong>${S.runs.length}</strong> runs saved on this device.</p>
    <div class="row"><button class="btn" data-act="copyall">Copy all attempts (TSV)</button><button class="btn ghost" data-act="csvall">Download CSV</button>
    <button class="btn ghost" data-act="classall">Copy class summary lines</button></div></div>
  <div class="panel"><h3>Runs</h3>${runs.length ? runs.map((r) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--edge)"><div style="flex:1;min-width:200px"><strong>${esc(r.claimTitle)}</strong><br><span class="small muted">${new Date(r.startedAt).toLocaleString()} · ${esc(r.summary.text)} · ${r.awarded ? 'justified' : 'not yet justified'}</span></div>
    <button class="btn sm ghost" data-act="viewrun" data-id="${r.runId}">View</button><button class="btn sm" data-act="classrun" data-id="${r.runId}">Copy class line</button></div>`).join('') : '<p class="muted">No finished runs yet.</p>'}
    <p class="small muted">The class line is one row: your median A, median B and paired difference (B minus A). Paste it into the class sheet for the paired-difference activity.</p></div>
  <div class="panel"><h3>This device</h3><p class="small">On a shared Chromebook, clear your data when you finish.</p>
    <div class="row"><button class="btn ghost" data-act="print">Print latest results card</button><button class="btn danger" data-act="reset">Reset device</button><button class="btn ghost" data-act="hub">Back to the lab</button></div></div>`);
}
function markPair() {
  if (!S.profile.badges.includes('pair')) {
    S.profile.badges.push('pair'); S.profile.xp += 10; saveProfile(); updateChip();
    try { S.scene.celebrate('badge'); } catch (e) { /* ignore */ }
    toast('Badge: Pair Scientist! +10 XP');
  }
}
function printCard(run) {
  if (!run || !run.summary) { toast('Finish a run first to print a results card.'); return; }
  const claim = run.claim || getClaim(run.claimId);
  const ch = chartsHTML(run);
  $('#printcard').innerHTML = `<h1>Reflex Lab results card</h1><p>Name: ______________________ &nbsp; Class: __________ &nbsp; ${new Date(run.startedAt).toLocaleDateString()}</p>
    <p><strong>Claim:</strong> ${esc(claim.claimText)}</p><h2>Evidence: ${esc(run.summary.text)}</h2>
    <p>${esc(run.summary.claimText)} ${esc(run.summary.predictionText)}</p>${run.summary.label === 'warning' ? '<p><strong>' + esc(run.summary.warningText) + '</strong></p>' : ''}
    ${summaryTable(run)}${ch.dot}${ch.order}<p><strong>My justification:</strong></p><div class="box">${esc(run.justification)}</div>
    <p style="font-size:9pt">Browser-estimated reaction times. Run ${esc(run.runId)} · v${APP_VERSION}. Speed does not equal smartness.</p>`;
  window.print();
}

// ------------------------------------------------------------------ dialogs
function settingsDialog() {
  const d = dialog(`<h2>Settings</h2>
    <label><input type="checkbox" id="sStill" ${S.settings.still ? 'checked' : ''}> Still mode (no camera drift, pulsing or moving shapes; replay off)</label>
    <label><input type="checkbox" id="sLarge" ${S.settings.large ? 'checked' : ''}> Large text</label>
    <label><input type="checkbox" id="s2d" ${S.settings.twoD ? 'checked' : ''}> 2D only (turn the 3D lab off)</label>
    <div class="field"><label for="sQ"><span>3D quality</span></label><select id="sQ">${['auto', 'low', 'mid', 'high'].map((q) => `<option ${S.settings.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
    ${S.teacher.still ? '<p class="small muted">Your teacher has turned still mode on.</p>' : ''}
    <p><button class="btn" data-close>Done</button></p>`);
  d.addEventListener('change', () => {
    const wasTwoD = S.settings.twoD;
    S.settings.still = $('#sStill', d).checked; S.settings.large = $('#sLarge', d).checked; S.settings.twoD = $('#s2d', d).checked; S.settings.quality = $('#sQ', d).value;
    saveSettings(); applySettings();
    if (S.settings.twoD !== wasTwoD) applyTwoD();
    else if (S.scene && S.settings.quality !== 'auto') { try { S.scene.setQuality(S.settings.quality); } catch (e) { /* ignore */ } }
  });
}
function teacherDialog() {
  const d = dialog(`<h2>Teacher setup</h2><p class="small muted">Saved on this device only.</p>
    <div class="field"><label for="tN"><span>Recorded trials per condition</span></label><select id="tN">${TRIAL_OPTIONS.map((n) => `<option ${S.teacher.trials === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <label><input type="checkbox" id="tA" ${S.teacher.audio ? 'checked' : ''}> Audio allowed (sound claim; headphones needed)</label>
    <label><input type="checkbox" id="tC" ${S.teacher.custom ? 'checked' : ''}> Custom claims allowed</label>
    <label><input type="checkbox" id="tS" ${S.teacher.still ? 'checked' : ''}> Still mode for everyone</label>
    <p><button class="btn" data-close>Save</button></p>`, () => { if (S.screen === 'hub') renderHub(); });
  d.addEventListener('change', () => {
    S.teacher = { trials: Number($('#tN', d).value), audio: $('#tA', d).checked, custom: $('#tC', d).checked, still: $('#tS', d).checked };
    store.set('teacher', S.teacher); applySettings();
  });
}
function helpDialog() {
  dialog(`<h2>How is reaction time measured?</h2>
    <p>Reflex Lab reports a <strong>browser-estimated reaction time</strong>: the gap between the cue being drawn on your screen and your tap or key press being received by the browser. It includes your screen, your device and your hand, so it is not nerve speed and it is not exact.</p>
    <p>During timing the 3D lab is paused so both conditions use the same screen. A <em>technical warning</em> appears if the screen updated at different speeds or the page was hidden.</p>
    <p>Trials under 100 ms are treated as guesses, and false starts and misses are re-run (up to 3 times). Every attempt is kept in your records. The evidence label uses medians and pairs, so one odd trial cannot decide the result.</p>
    <p><button class="btn" data-close>Close</button></p>`);
}

// ------------------------------------------------------------------ wiring
const ACTS = {
  hub: () => renderHub(),
  plan: (b) => startPlanning(b.dataset.id),
  start: () => { if (!gateMissing().length) startRun(); },
  arcade: () => startArcade(),
  again: () => startPlanning(S.current.claimId === 'custom' ? 'custom' : S.current.claimId),
  records: () => renderRecords(),
  print: () => printCard(S.current || [...S.runs].reverse().find((r) => r.summary)),
  replay: () => playReplay(),
  submitjust: () => submitJust(),
  starter: (b) => { const t = $('#jtext'); t.value = (t.value ? t.value.trimEnd() + ' ' : '') + SENTENCE_STARTERS[Number(b.dataset.i)]; t.focus(); updateJust(); },
  hpcheck: async () => {
    $('#hpmsg').textContent = 'Playing...';
    try { S.headphonesOK = S.audio.supported() && (await S.audio.check()); } catch (e) { S.headphonesOK = false; }
    $('#hpmsg').textContent = S.headphonesOK ? 'Check passed.' : 'Sound timing is not available on this device, so the sound test is blocked.';
    updateGate();
  },
  copyall: () => copyText(toTSV(allAttempts()), 'all attempts'),
  csvall: () => download('reflex-lab-attempts.csv', toCSV(allAttempts()), 'text/csv'),
  classall: () => { const rows = S.runs.filter((r) => r.summary); copyText(CLASS_COLUMNS.join('\t') + '\n' + rows.map((r) => classLine(r)).join(''), 'class summary lines'); markPair(); },
  classrun: (b) => { const r = S.runs.find((x) => x.runId === b.dataset.id); if (r) { copyText(classLine(r), 'your class summary line'); markPair(); } },
  viewrun: (b) => { const r = S.runs.find((x) => x.runId === b.dataset.id); if (r) renderResults(r); },
  reset: () => { if (confirm('Reset this device? This deletes all saved runs, XP and badges here.')) { store.clearAll(); location.reload(); } },
};
ui.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && ACTS[b.dataset.act] && !b.disabled) ACTS[b.dataset.act](b); });
ui.addEventListener('input', (e) => { readPlanning(e); if (e.target.id === 'jtext') updateJust(); });
ui.addEventListener('change', (e) => {
  if (e.target.name === 'mode') { S.settings.mode = e.target.value; saveSettings(); renderHub(); return; }
  readPlanning(e); if (e.target.matches && e.target.matches('[data-fq]')) updateJust(); });

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-top]');
  if (!t) return;
  ({ records: renderRecords, settings: settingsDialog, help: helpDialog })[t.dataset.top]();
});
$('#logo').addEventListener('click', () => { if (!$('#cue').hidden) return; renderHub(); });
let lp = 0;
const lpStart = () => { lp = setTimeout(teacherDialog, 800); };
const lpEnd = () => clearTimeout(lp);
['pointerdown'].forEach((ev) => $('#logo').addEventListener(ev, lpStart));
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('#logo').addEventListener(ev, lpEnd));

// ------------------------------------------------------------------ boot
applySettings();
S.screen = 'hub';
renderHub();
if (new URLSearchParams(location.search).get('teacher') === '1') teacherDialog();
bootScene().catch((e) => console.warn('scene boot failed', e));
