// Procedural textures (no image assets needed): metals, floor, wall panels, monitor UIs, labels, normal maps.
import * as THREE from './three.js';
import { pfbm2, pnoise2, mulberry } from './noise.js';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SANS = '"Mulish", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Fill a canvas from a per-pixel function returning [r,g,b] 0..255
function paint(size, fn, w = size, h = size) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = fn(x / w, y / h, x, y);
      d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Brushed metal streaks (anisotropic, tileable). Used as roughnessMap and bumpMap. */
export function brushedMetal(size = 512) {
  const c = paint(size, (u, v) => {
    const a = pfbm2(u, v, 3, 220, 3, 3);
    const b = pnoise2(u * 6, v * 700, 6, 700, 9);
    const g = 0.42 + (a - 0.5) * 0.55 + (b - 0.5) * 0.18;
    const k = Math.max(0, Math.min(1, g)) * 255;
    return [k, k, k];
  });
  return tex(c, { srgb: false });
}

/** Floor: colour + roughness (polished dark epoxy tiles with glossy streaks). */
export function floorMaps(size = 512) {
  const seam = 0.0075;
  const col = paint(size, (u, v) => {
    const tx = (u * 2) % 1, ty = (v * 2) % 1;
    const edge = Math.min(tx, 1 - tx, ty, 1 - ty) < seam;
    const n = pfbm2(u, v, 6, 6, 4, 11);
    const base = 16 + n * 16;
    const k = edge ? base * 0.4 : base;
    return [k * 0.9, k * 1.0, k * 1.15];
  });
  const rough = paint(size, (u, v) => {
    const n = pfbm2(u, v, 5, 5, 5, 21);
    const s = pnoise2(u * 3, v * 90, 3, 90, 4);
    const tx = (u * 2) % 1, ty = (v * 2) % 1;
    const edge = Math.min(tx, 1 - tx, ty, 1 - ty) < seam;
    const r = edge ? 0.9 : 0.18 + n * 0.45 + s * 0.12;
    const k = Math.max(0, Math.min(1, r)) * 255;
    return [k, k, k];
  });
  return { map: tex(col), rough: tex(rough, { srgb: false }) };
}

/** Wall panel: seams, screws, vents. Colour + bump (same canvas lumas). */
export function wallPanel(size = 512) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, size);
  grd.addColorStop(0, '#1a2229'); grd.addColorStop(1, '#10161b');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // subtle noise grain
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (pnoise2((i / 4 % size) / 5, Math.floor(i / 4 / size) / 5, size / 5 | 0, size / 5 | 0, 5) - 0.5) * 12;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // panel seams
  g.strokeStyle = '#05080a'; g.lineWidth = 6;
  g.strokeRect(3, 3, size - 6, size - 6);
  g.beginPath(); g.moveTo(size / 2, 0); g.lineTo(size / 2, size); g.stroke();
  g.strokeStyle = 'rgba(120,160,190,0.18)'; g.lineWidth = 2;
  g.strokeRect(9, 9, size - 18, size - 18);
  g.beginPath(); g.moveTo(size / 2 + 4, 0); g.lineTo(size / 2 + 4, size); g.stroke();
  // vents
  g.fillStyle = '#05080b';
  for (let i = 0; i < 9; i++) g.fillRect(size * 0.08, size * 0.64 + i * 14, size * 0.3, 6);
  for (let i = 0; i < 9; i++) g.fillRect(size * 0.58, size * 0.64 + i * 14, size * 0.3, 6);
  // screws
  for (const [x, y] of [[26, 26], [size / 2 - 26, 26], [size / 2 + 26, 26], [size - 26, 26], [26, size - 26], [size - 26, size - 26], [size / 2 - 26, size - 26], [size / 2 + 26, size - 26]]) {
    g.fillStyle = '#2d3a44'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
    g.strokeStyle = '#0a0f12'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 1); g.lineTo(x + 4, y + 1); g.stroke();
  }
  // faint teal marker strip
  g.fillStyle = 'rgba(70,200,210,0.35)'; g.fillRect(size * 0.08, size * 0.35, size * 0.3, 4);
  g.fillStyle = 'rgba(255,170,90,0.28)'; g.fillRect(size * 0.58, size * 0.35, size * 0.12, 4);
  return tex(c);
}

/** Soft radial glow sprite texture */
export function glowSprite(size = 128) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return tex(c, { repeat: false });
}

/** Vertical gradient with soft sides, for fake light shafts */
export function shaftGradient() {
  const w = 64, h = 256;
  const c = paint(0, (u, v) => {
    const side = Math.sin(Math.PI * u);
    const a = Math.pow(side, 1.6) * Math.pow(1 - v, 1.3);
    const k = a * 255;
    return [k, k, k];
  }, w, h);
  const t = tex(c, { srgb: false, repeat: false });
  return t;
}

/** Tileable greyscale height field -> tangent-space normal map (brain wrinkle detail). */
export function brainNormal(size = 512, strength = 3.2) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const w = (pfbm2(u, v, 5, 5, 3, 31) - 0.5) * 0.55;
      const n1 = pfbm2(u + w, v + w * 0.8, 6, 6, 3, 41);
      const ridge = 1 - Math.abs(n1 * 2 - 1); // folds
      const fine = pfbm2(u, v, 28, 28, 2, 51);
      h[y * size + x] = ridge * ridge * 0.8 + fine * 0.18;
    }
  }
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[o + 1] = (dy / l * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false, aniso: 4 });
}

/** Tileable albedo variation for the brain (pinks with faint vessel mottling). */
export function brainAlbedo(size = 512) {
  const c = paint(size, (u, v) => {
    const n = pfbm2(u, v, 4, 4, 4, 61);
    const m = pfbm2(u, v, 9, 9, 3, 71);
    const vessel = Math.pow(1 - Math.abs(pfbm2(u, v, 7, 7, 3, 81) * 2 - 1), 8);
    const r = 205 + n * 30 - vessel * 40, g = 150 + n * 26 + m * 14 - vessel * 80, b = 160 + n * 20 + m * 10 - vessel * 80;
    return [r, g, b];
  });
  return tex(c);
}

/* ---------- text / labels ---------- */
export function makeLabel(text, { size = 56, color = '#e9fbff', bg = 'rgba(6,16,24,0.55)', border = 'rgba(120,230,255,0.55)', pad = 22, font = SANS, weight = 700 } = {}) {
  const c = canvas(8, 8);
  let g = c.getContext('2d');
  g.font = `${weight} ${size}px ${font}`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  const h = size + pad * 1.2;
  c.width = Math.max(8, w); c.height = Math.ceil(h);
  g = c.getContext('2d');
  g.font = `${weight} ${size}px ${font}`;
  g.textBaseline = 'middle';
  const r = c.height / 2;
  if (bg) {
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(2, 2, c.width - 4, c.height - 4, r); g.fill();
    if (border) { g.strokeStyle = border; g.lineWidth = 2; g.stroke(); }
  }
  g.fillStyle = color;
  g.fillText(text, pad, c.height / 2 + 1);
  const t = tex(c, { repeat: false, aniso: 2 });
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.userData.aspect = c.width / c.height;
  s.scale.set(s.userData.aspect * 0.2, 0.2, 1);
  s.renderOrder = 999;
  return s;
}

export function digitSprite(text, color = '#9ef3ff') {
  return makeLabel(text, { size: 64, color, bg: null, border: null, pad: 10, font: MONO });
}

/* ---------- monitor UIs ---------- */
function grid(g, w, h, step, col) {
  g.strokeStyle = col; g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= w; x += step) { g.moveTo(x, 0); g.lineTo(x, h); }
  for (let y = 0; y <= h; y += step) { g.moveTo(0, y); g.lineTo(w, y); }
  g.stroke();
}
function header(g, w, title, accent) {
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, w, 34);
  g.fillStyle = accent; g.fillRect(12, 11, 12, 12);
  g.fillStyle = '#d7f4ff'; g.font = `700 16px ${MONO}`; g.textBaseline = 'middle';
  g.fillText(title, 34, 18);
  g.fillStyle = 'rgba(215,244,255,0.45)'; g.textAlign = 'right';
  g.fillText('REFLEX LAB', w - 12, 18); g.textAlign = 'left';
}

/**
 * Monitor canvas texture. kind: 'bars' | 'dots' | 'brain' | 'trace' | 'matrix' | 'rank'.
 * Returns { tex, redraw(t) } ; redraw only matters for animated kinds.
 */
export function monitorUI(kind, { w = 512, h = 320, accent = '#5ee9ff', seed = 1 } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const rnd = mulberry(seed * 977);
  const t = tex(c, { repeat: false, aniso: 4 });
  t.minFilter = THREE.LinearMipmapLinearFilter;
  const base = () => {
    g.fillStyle = '#04141c'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
    gr.addColorStop(0, 'rgba(40,120,150,0.20)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    grid(g, w, h, 32, 'rgba(94,233,255,0.07)');
  };
  const draw = {
    bars() {
      base(); header(g, w, 'REACTION TIME  ms', accent);
      const n = 12;
      for (let i = 0; i < n; i++) {
        const v = 0.35 + rnd() * 0.5;
        const x = 28 + i * ((w - 56) / n), bw = (w - 56) / n - 8;
        const bh = v * (h - 110);
        const gr = g.createLinearGradient(0, h - 40 - bh, 0, h - 40);
        gr.addColorStop(0, accent); gr.addColorStop(1, 'rgba(94,233,255,0.12)');
        g.fillStyle = gr; g.fillRect(x, h - 40 - bh, bw, bh);
      }
      g.strokeStyle = 'rgba(255,200,120,0.9)'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(20, h * 0.5); g.lineTo(w - 20, h * 0.5); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffd9a1'; g.font = `700 18px ${MONO}`; g.fillText('median 262', w - 150, h * 0.5 - 12);
    },
    dots() {
      base(); header(g, w, 'EVERY TRIAL  A vs B', accent);
      for (const [row, col, off] of [[0.38, '#5ee9ff', 0], [0.7, '#ffb26b', 18]]) {
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(30, h * row + 28); g.lineTo(w - 30, h * row + 28); g.stroke();
        for (let i = 0; i < 14; i++) {
          g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.arc(60 + rnd() * (w - 140) * 0.7 + off * 4, h * row + 28 - rnd() * 22, 7, 0, 7); g.fill();
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = '#d7f4ff'; g.font = `700 18px ${MONO}`; g.fillText('A', 14, h * 0.38 + 6); g.fillText('B', 14, h * 0.7 + 6);
    },
    brain() {
      base(); header(g, w, 'NEURAL MAP', accent);
      for (let i = 0; i < 170; i++) {
        const a = rnd() * 6.283, r = Math.sqrt(rnd());
        const x = w / 2 + Math.cos(a) * r * w * 0.34, y = h / 2 + 14 + Math.sin(a) * r * h * 0.34;
        g.fillStyle = `rgba(94,233,255,${0.25 + rnd() * 0.6})`; g.beginPath(); g.arc(x, y, 1.6 + rnd() * 2.4, 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(94,233,255,0.25)';
      for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(w / 2 + (rnd() - 0.5) * w * 0.6, h / 2 + (rnd() - 0.5) * h * 0.6); g.lineTo(w / 2 + (rnd() - 0.5) * w * 0.6, h / 2 + (rnd() - 0.5) * h * 0.6); g.stroke(); }
    },
    matrix() {
      base(); header(g, w, 'LOG STREAM', accent);
      g.font = `600 14px ${MONO}`;
      for (let r = 0; r < 14; r++) {
        const cls = ['ok', 'ok', 'ok', 'slow', 'ok', 'fast', 'ok'][Math.floor(rnd() * 7)];
        g.fillStyle = cls === 'ok' ? 'rgba(160,240,255,0.8)' : cls === 'slow' ? 'rgba(255,200,120,0.9)' : 'rgba(255,140,150,0.9)';
        g.fillText(`#${String(100 + r * 3).padStart(4, '0')}  A  ${cls.padEnd(5)}  ${Math.round(210 + rnd() * 120)} ms`, 18, 54 + r * 18);
      }
    },
    rank() {
      base(); header(g, w, 'LAB STATUS', accent);
      g.fillStyle = '#d7f4ff'; g.font = `800 34px ${SANS}`; g.fillText('Principal Investigator', 24, 100);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(24, 130, w - 48, 14);
      g.fillStyle = accent; g.fillRect(24, 130, (w - 48) * 0.72, 14);
      g.font = `600 16px ${MONO}`; g.fillStyle = 'rgba(215,244,255,0.7)';
      ['Records complete', 'Fair test planned', 'Replicated', 'Claims explored'].forEach((s, i) => { g.fillText('• ' + s, 24, 180 + i * 26); });
    },
    trace() { base(); header(g, w, 'LIVE SIGNAL', accent); }
  }[kind] || (() => base());
  draw();
  t.needsUpdate = true;
  const out = { tex: t, canvas: c, animated: kind === 'trace' };
  if (kind === 'trace') {
    out.redraw = (time) => {
      draw();
      g.lineWidth = 2.4; g.strokeStyle = accent; g.shadowColor = accent; g.shadowBlur = 8;
      g.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const p = x / w * 6.283 * 3 + time * 2.2;
        const spike = Math.pow(Math.max(0, Math.sin(p * 0.33 + 0.5)), 24) * 70;
        const y = h * 0.58 - Math.sin(p) * 22 - spike - Math.sin(p * 2.7) * 6;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke(); g.shadowBlur = 0;
      t.needsUpdate = true;
    };
  }
  return out;
}

/** Oscilloscope screen: phosphor-green trace with graticule, redraw(t) animates. */
export function scopeScreen() {
  const w = 384, h = 256;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const t = tex(c, { repeat: false, aniso: 4 });
  const redraw = (time) => {
    g.fillStyle = '#021208'; g.fillRect(0, 0, w, h);
    grid(g, w, h, 32, 'rgba(120,255,160,0.16)');
    g.strokeStyle = 'rgba(120,255,160,0.3)'; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.lineWidth = 3; g.strokeStyle = '#8bff9f'; g.shadowColor = '#4dff7a'; g.shadowBlur = 10;
    g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const ph = x / w * 6.283 * 2 - time * 3.0;
      const y = h / 2 - Math.sin(ph) * 46 * (0.7 + 0.3 * Math.sin(time * 0.7)) - Math.sin(ph * 3.1 + time) * 8;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke(); g.shadowBlur = 0;
    t.needsUpdate = true;
  };
  redraw(0);
  return { tex: t, redraw };
}

/** Ruler for the reaction ruler-drop prop (cm marks) */
export function rulerTex() {
  const w = 64, h = 512;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#d9c28a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2b2416'; g.font = `700 11px ${MONO}`;
  for (let i = 0; i <= 30; i++) {
    const y = 8 + i * 16.2;
    g.fillRect(0, y, i % 5 === 0 ? 26 : 14, 1.5);
    if (i % 5 === 0) g.fillText(String(i), 30, y + 4);
  }
  return tex(c, { repeat: false });
}

export function disposeTexture(t) { t && t.dispose && t.dispose(); }
