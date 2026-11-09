// SVG charts for the results view. Returns strings; all inputs are numbers.
const W = 640;
const COL = { A: '#6cc4ff', B: '#ffb454', grid: 'rgba(200,220,255,.18)', text: '#cfe0f5', med: '#ffffff' };

function scaleOf(values, lo = 0.9, hi = 1.05) {
  let mn = Math.min(...values);
  let mx = Math.max(...values);
  if (!isFinite(mn)) { mn = 200; mx = 400; }
  mn = Math.floor((mn * lo) / 50) * 50;
  mx = Math.ceil((mx * hi) / 50) * 50;
  if (mx - mn < 100) mx = mn + 100;
  return [mn, mx];
}
const f = (x) => Math.round(x * 10) / 10;

function mark(cond, x, y, r) {
  const c = COL[cond];
  if (cond === 'A') return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${c}" fill-opacity=".85" stroke="#06101f" stroke-width="1"/>`;
  return `<path d="M${f(x)} ${f(y - r - 1)} L${f(x + r + 1)} ${f(y)} L${f(x)} ${f(y + r + 1)} L${f(x - r - 1)} ${f(y)} Z" fill="${c}" fill-opacity=".9" stroke="#06101f" stroke-width="1"/>`;
}

export function dotPlot({ a, b, medianA, medianB, labelA = 'A', labelB = 'B' }) {
  const all = [...a, ...b];
  const [mn, mx] = scaleOf(all);
  const left = 150, right = W - 20, top = 18, rowH = 84;
  const H = top + rowH * 2 + 44;
  const X = (v) => left + ((v - mn) / (mx - mn)) * (right - left);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="dpT dpD" class="chart"><title id="dpT">Dot plot of every analysed trial</title><desc id="dpD">Each dot is one trial. The white line marks the median of each condition. A circles, B diamonds.</desc>`;
  const step = (mx - mn) > 600 ? 200 : (mx - mn) > 300 ? 100 : 50;
  for (let v = Math.ceil(mn / step) * step; v <= mx; v += step) {
    s += `<line x1="${f(X(v))}" x2="${f(X(v))}" y1="${top}" y2="${top + rowH * 2}" stroke="${COL.grid}"/>`;
    s += `<text x="${f(X(v))}" y="${top + rowH * 2 + 16}" fill="${COL.text}" font-size="12" text-anchor="middle">${v}</text>`;
  }
  s += `<text x="${(left + right) / 2}" y="${H - 6}" fill="${COL.text}" font-size="12" text-anchor="middle">Browser-estimated reaction time (ms)</text>`;
  [['A', a, medianA, labelA], ['B', b, medianB, labelB]].forEach(([k, arr, med, lab], i) => {
    const cy = top + rowH * i + rowH / 2;
    s += `<text x="8" y="${cy + 4}" fill="${COL[k]}" font-size="13" font-weight="700">${esc(lab).slice(0, 22)}</text>`;
    s += `<line x1="${left}" x2="${right}" y1="${cy + 28}" y2="${cy + 28}" stroke="${COL.grid}"/>`;
    // stack dots that land on the same pixel column
    const bins = {};
    [...arr].sort((p, q) => p - q).forEach((v) => {
      const bx = Math.round(X(v) / 11);
      const level = bins[bx] || 0;
      bins[bx] = level + 1;
      s += mark(k, X(v), cy + 18 - level * 12, 5);
    });
    if (med != null) {
      s += `<line x1="${f(X(med))}" x2="${f(X(med))}" y1="${cy - 34}" y2="${cy + 30}" stroke="${COL.med}" stroke-width="2.5" stroke-dasharray="5 3"/>`;
      s += `<text x="${f(X(med))}" y="${cy - 38}" fill="${COL.med}" font-size="11" text-anchor="middle">median ${Math.round(med)}</text>`;
    }
  });
  return s + '</svg>';
}

export function orderPlot({ seq, labelA = 'A', labelB = 'B' }) {
  const [mn, mx] = scaleOf(seq.map((p) => p.rt));
  const left = 52, right = W - 16, top = 14, H = 240, bot = H - 44;
  const n = Math.max(seq.length, 2);
  const X = (i) => left + ((i - 1) / (n - 1)) * (right - left);
  const Y = (v) => bot - ((v - mn) / (mx - mn)) * (bot - top);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="opT opD" class="chart"><title id="opT">Reaction time in the order the trials happened</title><desc id="opD">Shows drifts such as getting tired or warming up. A circles, B diamonds.</desc>`;
  const step = (mx - mn) > 600 ? 200 : (mx - mn) > 300 ? 100 : 50;
  for (let v = Math.ceil(mn / step) * step; v <= mx; v += step) {
    s += `<line x1="${left}" x2="${right}" y1="${f(Y(v))}" y2="${f(Y(v))}" stroke="${COL.grid}"/><text x="${left - 6}" y="${f(Y(v)) + 4}" fill="${COL.text}" font-size="12" text-anchor="end">${v}</text>`;
  }
  s += `<polyline points="${seq.map((p, i) => f(X(i + 1)) + ',' + f(Y(p.rt))).join(' ')}" fill="none" stroke="rgba(200,220,255,.35)" stroke-width="1.5"/>`;
  seq.forEach((p, i) => { s += mark(p.cond, X(i + 1), Y(p.rt), 5); });
  s += `<text x="${(left + right) / 2}" y="${H - 8}" fill="${COL.text}" font-size="12" text-anchor="middle">Trial number (order done)</text>`;
  s += `<g font-size="12" fill="${COL.text}">${mark('A', left + 8, H - 28, 5)}<text x="${left + 20}" y="${H - 24}">${esc(labelA).slice(0, 18)}</text>${mark('B', left + 170, H - 28, 5)}<text x="${left + 182}" y="${H - 24}">${esc(labelB).slice(0, 18)}</text></g>`;
  return s + '</svg>';
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
