import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAttempt, buildPlan, audioStimTime, plausibleCount, shouldRerun } from '../js/trial-engine.js';
import { CLAIMS, getClaim } from '../js/claims.js';

test('classifyAttempt: go trials', () => {
  assert.equal(classifyAttempt({ rt: 250 }), 'ok');
  assert.equal(classifyAttempt({ rt: 100 }), 'ok');
  assert.equal(classifyAttempt({ rt: 99.9 }), 'fast');
  assert.equal(classifyAttempt({ rt: 1500 }), 'ok');
  assert.equal(classifyAttempt({ rt: 1501 }), 'slow');
  assert.equal(classifyAttempt({ rt: null }), 'miss');
  assert.equal(classifyAttempt({ rt: 2600 }), 'miss');
  assert.equal(classifyAttempt({ early: true }), 'falseStart');
  assert.equal(classifyAttempt({ hidden: true, rt: 300 }), 'interrupted');
});

test('classifyAttempt: go/no-go', () => {
  assert.equal(classifyAttempt({ kind: 'nogo', rt: null }), 'correctWithhold');
  assert.equal(classifyAttempt({ kind: 'nogo', rt: 400 }), 'commission');
  assert.equal(classifyAttempt({ kind: 'go', rt: 950, windowMs: 900 }), 'miss');
  assert.equal(classifyAttempt({ kind: 'nogo', early: true }), 'falseStart');
});

test('re-run rules: up to 3 extra, only for falseStart/fast/miss/interrupted in recorded blocks', () => {
  assert.equal(shouldRerun('falseStart', 1, true), true);
  assert.equal(shouldRerun('falseStart', 3, true), true);
  assert.equal(shouldRerun('falseStart', 4, true), false);
  assert.equal(shouldRerun('ok', 1, true), false);
  assert.equal(shouldRerun('slow', 1, true), false);
  assert.equal(shouldRerun('commission', 1, true), false);
  assert.equal(shouldRerun('miss', 1, false), false);
});

test('buildPlan: ABBA with warm-up, counts per condition', () => {
  const plan = buildPlan(getClaim('hand'), 10);
  assert.deepEqual(plan.map((b) => b.id), ['W', 'A1', 'B1', 'B2', 'A2']);
  assert.equal(plan[0].slots.length, 5);
  assert.equal(plan[0].record, false);
  const nA = plan.filter((b) => b.cond === 'A' && b.record).reduce((s, b) => s + b.slots.length, 0);
  const nB = plan.filter((b) => b.cond === 'B' && b.record).reduce((s, b) => s + b.slots.length, 0);
  assert.equal(nA, 10);
  assert.equal(nB, 10);
});

test('buildPlan: go/no-go has about 70% go and the right go count', () => {
  const plan = buildPlan(getClaim('decide'), 10, () => 0.3);
  const b = plan.filter((x) => x.cond === 'B');
  const go = b.reduce((s, x) => s + x.slots.filter((y) => y.kind === 'go').length, 0);
  const nogo = b.reduce((s, x) => s + x.slots.filter((y) => y.kind === 'nogo').length, 0);
  assert.equal(go, 10);
  assert.equal(nogo, 4);
  assert.ok(b.every((x) => x.slots[0].kind === 'go'));
});

test('buildPlan: before/after has 30 unrecorded practice trials', () => {
  const plan = buildPlan(getClaim('practice'), 10);
  assert.deepEqual(plan.map((b) => b.id), ['W', 'A1', 'P', 'B1']);
  assert.equal(plan[2].slots.length, 30);
  assert.equal(plan[2].record, false);
});

test('every claim builds a plan for 6, 10 and 14 trials', () => {
  for (const c of CLAIMS) for (const n of [6, 10, 14]) assert.ok(buildPlan(c, n).length >= 4);
});

test('audioStimTime maps context time to performance time and rejects invalid timestamps', () => {
  assert.equal(audioStimTime({ contextTime: 1, performanceTime: 5000 }, 1.1), 5100);
  assert.equal(audioStimTime({ contextTime: 0, performanceTime: 5000 }, 1.1), null);
  assert.equal(audioStimTime({ contextTime: 1, performanceTime: 0 }, 1.1), null);
  assert.equal(audioStimTime(null, 1), null);
});

test('plausibleCount', () => {
  assert.equal(plausibleCount(150, 120), true);
  assert.equal(plausibleCount(150, 121), false);
  assert.equal(plausibleCount(150, 160), false);
  assert.equal(plausibleCount(150, 'abc'), false);
});
