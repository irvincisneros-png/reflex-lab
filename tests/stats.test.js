import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median, mean, quantile, pairScore, evidenceLabel, summarise, technicalWarning, analysedTrials, claimVerdict, predictionVerdict,
} from '../js/stats.js';

const A6 = [240, 245, 250, 255, 260, 250];

test('median, mean, quantile basics', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 0.95), 19);
});

test('pair score: share of pairs where B was slower, ties count half', () => {
  assert.equal(pairScore([1, 2], [3, 4]), 100);
  assert.equal(pairScore([3, 4], [1, 2]), 0);
  assert.equal(pairScore([1, 2], [1, 2]), 50);
  assert.equal(pairScore([], [1]), null);
});

test('clear difference: B clearly slower', () => {
  const B = A6.map((x) => x + 60);
  const e = evidenceLabel(A6, B);
  assert.equal(e.label, 'clear');
  assert.equal(e.faster, 'A');
  assert.equal(e.pairScore, 100);
  assert.equal(e.diff, 60);
});

test('clear difference: B clearly faster', () => {
  const B = A6.map((x) => x - 40);
  const e = evidenceLabel(A6, B);
  assert.equal(e.label, 'clear');
  assert.equal(e.faster, 'B');
});

test('outlier case is NOT clear (n=5, one huge value)', () => {
  const A = [240, 245, 250, 255, 260];
  const B = [240, 245, 250, 255, 1010];
  assert.notEqual(evidenceLabel(A, B).label, 'clear');
});

test('outlier with n>=6 is NOT clear: the mean moves, the median does not', () => {
  const A = [240, 245, 250, 250, 255, 260];
  const B = [240, 245, 250, 250, 255, 1010];
  const e = evidenceLabel(A, B);
  assert.notEqual(e.label, 'clear');
  assert.equal(e.diff, 0);
  assert.ok(e.meanB - e.meanA > 100);
  assert.equal(e.label, 'none');
});

test('large median shift without lopsided pairs is not clear', () => {
  // medians differ by 25 but distributions overlap heavily
  const A = [200, 210, 220, 230, 300, 310];
  const B = [150, 160, 255, 265, 275, 285];
  const e = evidenceLabel(A, B);
  assert.notEqual(e.label, 'clear');
});

test('no clear difference: pair score 40-60 and |diff| < 20', () => {
  const B = [242, 244, 251, 254, 262, 249];
  const e = evidenceLabel(A6, B);
  assert.equal(e.label, 'none');
});

test('unclear: in-between', () => {
  const B = A6.map((x) => x + 12);
  const e = evidenceLabel(A6, B);
  assert.equal(e.label, 'unclear');
  assert.ok(e.reason.length > 0);
});

test('n < 6 is never clear or none', () => {
  const A = [240, 245, 250, 255, 260];
  const B = [340, 345, 350, 355, 360];
  assert.equal(evidenceLabel(A, B).label, 'unclear');
  assert.equal(evidenceLabel([], []).label, 'unclear');
});

test('technical warning overrides everything', () => {
  const B = A6.map((x) => x + 60);
  const e = evidenceLabel(A6, B, { warn: true });
  assert.equal(e.label, 'warning');
  assert.equal(e.underlying, 'clear');
  const s = summarise({ a: A6, b: B, claimFaster: 'A', prediction: 'A', technical: { warn: true, reasons: ['x'] } });
  assert.equal(s.label, 'warning');
  assert.match(s.warningText, /device, not you/);
  assert.equal(s.claim, 'inconclusive');
  assert.equal(s.prediction, 'inconclusive');
});

test('technicalWarning: p95 gap > 4 ms or hidden', () => {
  assert.equal(technicalWarning({ p95A: 17, p95B: 20 }).warn, false);
  assert.equal(technicalWarning({ p95A: 17, p95B: 21.5 }).warn, true);
  assert.equal(technicalWarning({ p95A: 17, p95B: 17, hidden: true }).warn, true);
  assert.equal(technicalWarning({}).warn, false);
});

test('claim and prediction are reported separately', () => {
  const B = A6.map((x) => x + 60); // A faster, clear
  // claim says A faster, student predicted B faster
  const s = summarise({ a: A6, b: B, claimFaster: 'A', prediction: 'B' });
  assert.equal(s.claim, 'consistent');
  assert.equal(s.prediction, 'notMatched');
  assert.match(s.claimText, /consistent with the claim/);
  assert.match(s.predictionText, /did not match/);
  // claim says B faster (e.g. sound), data say A faster, student predicted A
  const t = summarise({ a: A6, b: B, claimFaster: 'B', prediction: 'A' });
  assert.equal(t.claim, 'notConsistent');
  assert.equal(t.prediction, 'matched');
});

test('prediction of no difference matches a "none" result; claim of a difference does not', () => {
  const B = [242, 244, 251, 254, 262, 249];
  const s = summarise({ a: A6, b: B, claimFaster: 'A', prediction: 'none' });
  assert.equal(s.claim, 'notConsistent');
  assert.equal(s.prediction, 'matched');
});

test('inconclusive and missing prediction', () => {
  const B = A6.map((x) => x + 12);
  const s = summarise({ a: A6, b: B, claimFaster: 'A', prediction: 'A' });
  assert.equal(s.claim, 'inconclusive');
  assert.equal(s.prediction, 'inconclusive');
  assert.equal(predictionVerdict(evidenceLabel(A6, B), null), 'noPrediction');
  assert.equal(claimVerdict(evidenceLabel(A6, B), 'A'), 'inconclusive');
});

test('analysedTrials keeps ok/slow of recorded blocks only', () => {
  const att = [
    { condition: 'A', block: 'W', class: 'ok', rt_ms: 300 },
    { condition: 'A', block: 'A1', class: 'falseStart', rt_ms: '' },
    { condition: 'A', block: 'A1', class: 'ok', rt_ms: 250 },
    { condition: 'B', block: 'B1', class: 'slow', rt_ms: 1700 },
    { condition: 'B', block: 'B1', class: 'fast', rt_ms: 80 },
    { condition: 'B', block: 'P', class: 'ok', rt_ms: 260 },
    { condition: 'B', block: 'B1', class: 'commission', rt_ms: 400 },
  ];
  const r = analysedTrials(att);
  assert.deepEqual(r.a, [250]);
  assert.deepEqual(r.b, [1700]);
  assert.equal(r.seq.length, 2);
});
