import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, tsvCell, toCSV, toTSV, classLine, COLUMNS } from '../js/records.js';

const att = [
  { runId: 'abc', claim: 'hand', condition: 'A', block: 'A1', slot: 1, attemptNo: 1, class: 'ok', rt_ms: 251.2, inputType: 'pointer', stimType: 'visual', rafP95: 17.1, hidden: 0, appVersion: '2.0.0', renderer: 'webgl' },
  { runId: 'abc', claim: 'hand', condition: 'B', block: 'B1', slot: 1, attemptNo: 1, class: 'falseStart', rt_ms: '', inputType: 'pointer', stimType: 'visual', rafP95: '', hidden: 0, appVersion: '2.0.0', renderer: 'a, "b"' },
];

test('csvEscape quotes commas, quotes and newlines', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(12.5), '12.5');
});

test('csvEscape defuses spreadsheet formulas but keeps negative numbers', () => {
  assert.equal(csvEscape('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvEscape('@cmd'), "'@cmd");
  assert.equal(csvEscape('-5'), '-5');
  assert.equal(csvEscape('-evil'), "'-evil");
});

test('toCSV has header and one row per attempt, escaped', () => {
  const lines = toCSV(att).trim().split('\r\n');
  assert.equal(lines[0], COLUMNS.join(','));
  assert.equal(lines.length, 3);
  assert.ok(lines[2].endsWith('"a, ""b"""'));
});

test('toTSV flattens tabs and newlines', () => {
  assert.equal(tsvCell('a\tb\nc'), 'a b c');
  const rows = toTSV(att).trim().split('\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].split('\t').length, COLUMNS.length);
});

test('classLine: medians and paired difference in one row', () => {
  const run = { runId: 'abc', claimId: 'hand', summary: { nA: 10, nB: 10, medianA: 250, medianB: 270.04, diff: 20.04, pairScore: 80, text: 'Clear difference', claimText: 'c', predictionText: 'p' } };
  const row = classLine(run).trim().split('\t');
  assert.equal(row[4], '250');
  assert.equal(row[5], '270');
  assert.equal(row[6], '20');
  assert.equal(classLine(run, { header: true }).trim().split('\n').length, 2);
});
