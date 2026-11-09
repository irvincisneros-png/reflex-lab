// Records export for Reflex Lab: TSV / CSV / class summary line. Pure, no DOM.

export const COLUMNS = [
  'runId', 'claim', 'condition', 'block', 'slot', 'attemptNo', 'class', 'rt_ms',
  'inputType', 'stimType', 'rafP95', 'hidden', 'appVersion', 'renderer',
];

export const CLASS_COLUMNS = [
  'runId', 'claim', 'n_A', 'n_B', 'median_A_ms', 'median_B_ms', 'paired_diff_B_minus_A_ms', 'pair_score_pct', 'evidence', 'claim_statement', 'prediction_statement',
];

/** CSV-escape a cell. Quotes if needed, and defuses spreadsheet formulas in text cells. */
export function csvEscape(v) {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(v) : String(v);
  if (typeof v === 'string' && /^[=+@\t\r]/.test(s)) s = "'" + s;
  else if (typeof v === 'string' && /^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** TSV cell: tabs and line breaks become spaces so rows survive pasting. */
export function tsvCell(v) {
  if (v == null) return '';
  let s = String(v).replace(/[\t\r\n]+/g, ' ');
  if (typeof v === 'string' && /^[=+@]/.test(s)) s = "'" + s;
  return s;
}

export function toCSV(attempts, cols = COLUMNS) {
  const rows = [cols.join(',')];
  for (const t of attempts || []) rows.push(cols.map((c) => csvEscape(t[c])).join(','));
  return rows.join('\r\n') + '\r\n';
}

export function toTSV(attempts, cols = COLUMNS) {
  const rows = [cols.join('\t')];
  for (const t of attempts || []) rows.push(cols.map((c) => tsvCell(t[c])).join('\t'));
  return rows.join('\n') + '\n';
}

const r1 = (x) => (typeof x === 'number' && Number.isFinite(x) ? String(Math.round(x * 10) / 10) : '');

/** One-row class summary line for pooling: medians and the paired difference (B minus A). */
export function classLineCells(run) {
  const s = run.summary || {};
  return [
    run.runId, run.claimId, s.nA, s.nB, r1(s.medianA), r1(s.medianB), r1(s.diff), r1(s.pairScore),
    s.text || '', s.claimText || '', s.predictionText || '',
  ];
}

export function classLine(run, { header = false } = {}) {
  const out = [];
  if (header) out.push(CLASS_COLUMNS.join('\t'));
  out.push(classLineCells(run).map(tsvCell).join('\t'));
  return out.join('\n') + '\n';
}
