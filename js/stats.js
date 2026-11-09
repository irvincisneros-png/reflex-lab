// Pure statistics for Reflex Lab (spec v2). No DOM, no storage.
// Evidence labels use MEDIANS and a "pair score", not means (one slow trial can't flip the result).

export const MIN_N = 6;
export const MIN_DIFF_MS = 20;
export const CLEAR_HI = 75; // pair score >= this => B slower in most pairs
export const CLEAR_LO = 25;
export const NONE_LO = 40;
export const NONE_HI = 60;
export const WARN_P95_MS = 4;
export const WARN_TEXT = 'Technical warning: results may reflect the device, not you.';
export const ANALYSED = ['ok', 'slow'];

const nums = (arr) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'number' && Number.isFinite(x)) : []);

export function mean(arr) {
  const v = nums(arr);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function median(arr) {
  const v = nums(arr).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Nearest-rank quantile, q in [0,1]. */
export function quantile(arr, q) {
  const v = nums(arr).sort((x, y) => x - y);
  if (!v.length) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1));
  return v[idx];
}

export function minMax(arr) {
  const v = nums(arr);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
}

/** % of all (A,B) pairs in which B was slower (ties count half). null if either side is empty. */
export function pairScore(a, b) {
  const A = nums(a);
  const B = nums(b);
  if (!A.length || !B.length) return null;
  let s = 0;
  for (const x of A) for (const y of B) s += y > x ? 1 : y === x ? 0.5 : 0;
  return (100 * s) / (A.length * B.length);
}

/**
 * Technical warning: condition p95 rAF delta differs by more than 4 ms, or page was hidden.
 * Returns { warn, reasons[] }.
 */
export function technicalWarning({ p95A = null, p95B = null, hidden = false } = {}) {
  const reasons = [];
  if (hidden) reasons.push('The page was hidden or you switched tabs during the run.');
  if (typeof p95A === 'number' && typeof p95B === 'number' && Math.abs(p95A - p95B) > WARN_P95_MS) {
    reasons.push('The screen updated at different speeds in the two conditions (frame times differed by more than ' + WARN_P95_MS + ' ms).');
  }
  return { warn: reasons.length > 0, reasons };
}

export const EVIDENCE = {
  clear: 'Clear difference',
  unclear: 'Unclear',
  none: 'No clear difference',
  warning: 'Technical warning',
};

/**
 * Evidence label from two arrays of analysed reaction times.
 * label: 'clear' | 'unclear' | 'none' | 'warning'. A warning overrides the others
 * (the label the data would have had is kept in `underlying`).
 */
export function evidenceLabel(a, b, { warn = false } = {}) {
  const A = nums(a);
  const B = nums(b);
  const medianA = median(A);
  const medianB = median(B);
  const meanA = mean(A);
  const meanB = mean(B);
  const ps = pairScore(A, B);
  const diff = medianA == null || medianB == null ? null : medianB - medianA; // B minus A
  let underlying = 'unclear';
  let reason = '';
  if (A.length < MIN_N || B.length < MIN_N) {
    reason = 'Fewer than ' + MIN_N + ' usable trials in a condition.';
  } else {
    const bigEnough = Math.abs(diff) >= MIN_DIFF_MS;
    const lopsided = ps >= CLEAR_HI || ps <= CLEAR_LO;
    const agree = (ps >= CLEAR_HI && diff > 0) || (ps <= CLEAR_LO && diff < 0);
    if (bigEnough && lopsided && agree) {
      underlying = 'clear';
    } else if (ps >= NONE_LO && ps <= NONE_HI && Math.abs(diff) < MIN_DIFF_MS) {
      underlying = 'none';
    } else {
      reason = 'The evidence sits between the "clear" and "no difference" rules.';
    }
  }
  const label = warn ? 'warning' : underlying;
  const faster = underlying === 'clear' ? (ps > 50 ? 'A' : 'B') : null;
  return {
    label,
    underlying,
    text: EVIDENCE[label],
    reason,
    nA: A.length,
    nB: B.length,
    medianA,
    medianB,
    meanA,
    meanB,
    diff,
    pairScore: ps,
    faster,
  };
}

/** Claim and prediction are reported separately. */
export function claimVerdict(ev, claimFaster) {
  const u = ev.label === 'warning' ? 'unclear' : ev.label;
  if (u === 'clear') return claimFaster === 'none' ? 'notConsistent' : ev.faster === claimFaster ? 'consistent' : 'notConsistent';
  if (u === 'none') return claimFaster === 'none' ? 'consistent' : 'notConsistent';
  return 'inconclusive';
}

export function predictionVerdict(ev, prediction) {
  if (prediction !== 'A' && prediction !== 'B' && prediction !== 'none') return 'noPrediction';
  if (ev.label === 'warning' || ev.label === 'unclear') return 'inconclusive';
  if (ev.label === 'none') return prediction === 'none' ? 'matched' : 'notMatched';
  return prediction === ev.faster ? 'matched' : 'notMatched';
}

export const CLAIM_TEXT = {
  consistent: 'Your observations are consistent with the claim.',
  notConsistent: 'Your observations are not consistent with the claim.',
  inconclusive: 'Your observations are inconclusive about the claim.',
};
export const PREDICTION_TEXT = {
  matched: 'Your prediction matched what you observed.',
  notMatched: 'Your prediction did not match what you observed.',
  inconclusive: 'Your prediction could not be checked because the evidence was inconclusive.',
  noPrediction: 'No prediction was recorded.',
};

/**
 * One call for the results screen.
 * input: { a, b, claimFaster, prediction, technical: {warn, reasons} }
 */
export function summarise({ a, b, claimFaster = 'A', prediction = null, technical = { warn: false, reasons: [] } } = {}) {
  const ev = evidenceLabel(a, b, { warn: !!technical.warn });
  const claim = claimVerdict(ev, claimFaster);
  const pred = predictionVerdict(ev, prediction);
  return {
    ...ev,
    technicalReasons: technical.reasons || [],
    claim,
    claimText: CLAIM_TEXT[claim],
    prediction: pred,
    predictionText: PREDICTION_TEXT[pred],
    warningText: ev.label === 'warning' ? WARN_TEXT : '',
  };
}

/**
 * Extract the analysed trials from an attempt log: ok/slow attempts of recorded blocks (not warm-up/practice).
 * Returns { a: [ms], b: [ms], seq: [{cond, rt, n}] } in chronological order.
 */
export function analysedTrials(attempts) {
  const a = [];
  const b = [];
  const seq = [];
  for (const t of attempts || []) {
    if (!ANALYSED.includes(t.class)) continue;
    if (t.block === 'W' || t.block === 'P') continue;
    const rt = Number(t.rt_ms);
    if (!Number.isFinite(rt)) continue;
    if (t.condition === 'A') a.push(rt);
    else if (t.condition === 'B') b.push(rt);
    else continue;
    seq.push({ cond: t.condition, rt, n: seq.length + 1 });
  }
  return { a, b, seq };
}

/** Counts of each attempt class per condition (recorded blocks only). */
export function classCounts(attempts) {
  const out = { A: {}, B: {} };
  for (const t of attempts || []) {
    if (t.block === 'W' || t.block === 'P') continue;
    const o = out[t.condition];
    if (o) o[t.class] = (o[t.class] || 0) + 1;
  }
  return out;
}
