// Small deterministic noise toolkit (3D Perlin for geometry, periodic value noise for tileable textures).
const P = new Uint8Array(512);
(function () {
  let s = 1337;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad(h, x, y, z) {
  h &= 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
export function noise3(x, y, z) {
  let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u), lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u), lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v),
    w);
}
export function fbm3(x, y, z, oct = 4, lac = 2, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
// ridged: 0..1, sharp creases (gyri/sulci)
export function ridged3(x, y, z, oct = 3) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(noise3(x * f, y * f, z * f)); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
  return s / n;
}
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const mod = (v, p) => ((v % p) + p) % p;
export function pnoise2(x, y, px, py = px, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = hash2(mod(x0, px), mod(y0, py), seed), b = hash2(mod(x0 + 1, px), mod(y0, py), seed);
  const c = hash2(mod(x0, px), mod(y0 + 1, py), seed), d = hash2(mod(x0 + 1, px), mod(y0 + 1, py), seed);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
// Tileable fBm over a unit square: u,v in [0,1)
export function pfbm2(u, v, px, py = px, oct = 4, seed = 0) {
  let s = 0, a = 0.5, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * pnoise2(u * px * f, v * py * f, px * f, py * f, seed + i * 7); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
