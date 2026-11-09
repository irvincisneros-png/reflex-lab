// Neural replay scene: translucent sculpted brain, eye/ear, spinal cord, arm nerve, hand.
// Everything here is a simplified illustration with fixed, illustrative timing (not a measurement).
import * as THREE from './three.js';
import * as TX from './textures.js';
import { buildHand } from './hand.js';
import { createDust } from './fx.js';
import { noise3, fbm3, mulberry } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const inOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const seg = (t, a, b) => clamp01((t - a) / (b - a));

// Illustrative timeline (seconds)
const TL = {
  stim: 0.25, ray: [0.3, 0.7],
  s1: [0.7, 1.6], d1: [1.6, 2.0],
  s2: [2.0, 2.9], d2: [2.9, 3.25],
  s3: [3.25, 4.15], s4: [4.15, 4.95], tap: [4.95, 5.55],
  end: 6.3,
  // reflex-compare extension
  r0: 5.75, r1: [5.75, 6.4], r2: [6.4, 6.7], r3: [6.7, 7.35], rtw: [7.35, 7.9], endR: 8.7,
};

export function createReplay(ctx) {
  const { env, fancy, quality } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050b);
  scene.fog = new THREE.FogExp2(0x03060e, 0.035);
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  camera.layers.enable(1);
  const disposables = [], textures = [];
  const track = (o) => { disposables.push(o); return o; };
  const glowTex = TX.glowSprite(128); textures.push(glowTex);

  /* ---------------------------- brain ---------------------------- */
  const detail = quality() === 'high' ? 34 : quality() === 'mid' ? 26 : 16;
  const normalTex = TX.brainNormal(quality() === 'low' ? 256 : 512); textures.push(normalTex);
  const albedoTex = TX.brainAlbedo(quality() === 'low' ? 256 : 512); textures.push(albedoTex);
  normalTex.repeat.set(5, 3); albedoTex.repeat.set(5, 3);

  const brainU = {
    uPulse: { value: V(0, 0, 0) }, uPulseR: { value: 0.3 }, uPulseI: { value: 0 }, uPulseCol: { value: new THREE.Color(0x4fe3ff) },
    uReg: { value: [new THREE.Vector4(0, 0, 0, 0.5), new THREE.Vector4(0, 0, 0, 0.5)] }, uRegI: { value: [0, 0] },
    uRim: { value: 0.55 }, uRimCol: { value: new THREE.Color(0x7fd8ff) },
  };
  const brainMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: albedoTex, vertexColors: true, normalMap: normalTex, normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.46, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.32, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff9db0),
    transparent: true, opacity: 0.84, envMapIntensity: 1.1, side: THREE.FrontSide,
  });
  fancy(brainMat, { clearcoat: 0.6, sheen: 1 });
  brainMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, brainU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; uniform vec3 uPulse; uniform float uPulseR; uniform float uPulseI; uniform vec3 uPulseCol;
        uniform vec4 uReg[2]; uniform float uRegI[2]; uniform float uRim; uniform vec3 uRimCol;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float gl = uPulseI * smoothstep(uPulseR, 0.0, distance(vObj, uPulse));
          gl += uRegI[0] * smoothstep(uReg[0].w, 0.0, distance(vObj, uReg[0].xyz));
          gl += uRegI[1] * smoothstep(uReg[1].w, 0.0, distance(vObj, uReg[1].xyz));
          float fr = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
          totalEmissiveRadiance += uPulseCol * gl * 1.35 + uRimCol * fr * uRim;
        }`);
  };
  brainMat.customProgramCacheKey = () => 'brainmat-v1';

  function hemisphere(sign) {
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = THREE.mergeVertices(g, 1e-4);
    const p = g.attributes.position, n = p.count;
    const col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i).normalize();
      uv[i * 2] = Math.atan2(v.z, v.y) / (Math.PI * 2) + 0.5; uv[i * 2 + 1] = Math.acos(THREE.MathUtils.clamp(v.x, -1, 1)) / Math.PI;
      // base ellipsoid (right hemisphere when sign=+1)
      const bx = 0.62 * v.x, by = 0.78 * v.y * (v.y < 0 ? 0.74 : 1), bz = 1.12 * v.z;
      // temporal lobe bulge (lower side, mid-length)
      const temporal = Math.exp(-(Math.pow((v.z - 0.1) * 2.2, 2) + Math.pow((v.y + 0.35) * 2.8, 2))) * Math.max(0, v.x) * 0.18;
      w.set(sign * 0.64 + sign * (bx + temporal), by, bz);
      // folds: warped coarse ridges + fine wrinkles, sulci are narrow & deep
      const px = w.x * 3.4, py = w.y * 3.4, pz = w.z * 3.4;
      const wx = noise3(px * 0.6 + 3.1, py * 0.6, pz * 0.6) * 0.5, wy = noise3(px * 0.6, py * 0.6 + 7.3, pz * 0.6) * 0.5, wz = noise3(px * 0.6, py * 0.6, pz * 0.6 + 1.9) * 0.5;
      const f1 = Math.abs(noise3(px + wx, py + wy, pz + wz));
      const f2 = Math.abs(noise3(px * 2.3 + 11 + wy, py * 2.3 + wz, pz * 2.3 + wx));
      const h1 = 1 - Math.exp(-f1 * 7.5), h2 = 1 - Math.exp(-f2 * 6.5);
      const disp = (h1 - 1) * 0.062 + (h2 - 1) * 0.026;
      const dir = new THREE.Vector3(v.x * 0.62 * sign * 0.8, v.y, v.z).normalize();
      w.addScaledVector(dir, disp);
      // medial flat face with longitudinal fissure
      const mx = sign * w.x;
      if (mx < 0.045) w.x = sign * (0.045 + Math.max(0, (0.045 - mx)) * 0.0);
      p.setXYZ(i, w.x, w.y, w.z);
      const ao = 0.58 + 0.42 * (0.7 * h1 + 0.3 * h2);
      col[i * 3] = ao; col[i * 3 + 1] = ao * 0.97; col[i * 3 + 2] = ao * 0.98;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    g = g.toNonIndexed();
    // fix the uv wrap seam per triangle
    const uvA = g.attributes.uv;
    for (let i = 0; i < uvA.count; i += 3) {
      const a = uvA.getX(i), b = uvA.getX(i + 1), c = uvA.getX(i + 2);
      if (Math.max(a, b, c) - Math.min(a, b, c) > 0.5) {
        if (a < 0.5) uvA.setX(i, a + 1); if (b < 0.5) uvA.setX(i + 1, b + 1); if (c < 0.5) uvA.setX(i + 2, c + 1);
      }
    }
    g.computeBoundingSphere();
    return g;
  }
  const brain = new THREE.Group(); scene.add(brain);
  [1, -1].forEach((s) => { const m = new THREE.Mesh(track(hemisphere(s)), brainMat); m.renderOrder = 1; brain.add(m); });

  // cerebellum (horizontal folds) + brainstem
  const cbGeo = track(new THREE.IcosahedronGeometry(1, Math.round(detail * 0.6)));
  { const p = cbGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const f = Math.sin(v.y * 34 + noise3(v.x * 3, v.y * 2, v.z * 3) * 3.0) * 0.5 + 0.5;
      const r = 1 - 0.07 * f;
      p.setXYZ(i, v.x * 0.55 * r, v.y * 0.3 * r, v.z * 0.36 * r);
    } cbGeo.computeVertexNormals(); }
  const cbMat = new THREE.MeshPhysicalMaterial({ color: 0xc58b97, roughness: 0.55, clearcoat: 0.4, sheen: 0.8, sheenColor: new THREE.Color(0xff9db0), transparent: true, opacity: 0.88 });
  fancy(cbMat, { clearcoat: 0.4, sheen: 0.8 });
  const cb = new THREE.Mesh(cbGeo, cbMat); cb.position.set(0, -0.5, -0.82); cb.renderOrder = 1; brain.add(cb);
  const stemMat = new THREE.MeshPhysicalMaterial({ color: 0xd9aeb2, roughness: 0.5, clearcoat: 0.4, transparent: true, opacity: 0.9 });
  const stem = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.1, 0.55, 8, 20)), stemMat); stem.position.set(0, -0.58, -0.22); stem.rotation.x = -0.28; stem.renderOrder = 1; brain.add(stem);
  // corpus-callosum-ish glassy core
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x5ee9ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreM = new THREE.Mesh(track(new THREE.SphereGeometry(0.35, 20, 14)), coreMat); coreM.scale.set(0.8, 0.6, 1.5); coreM.position.set(0, 0.05, -0.1); coreM.layers.set(1); brain.add(coreM);

  /* ---------------------------- nerve helper ---------------------------- */
  const tubeFrag = /* glsl */`
    uniform vec3 uCol; uniform float uProg; uniform float uLen; uniform float uRev; uniform float uLevel; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      float u = mix(vUv.x, 1.0 - vUv.x, uRev);
      float lit = step(u, uProg);
      float head = exp(-pow((u - uProg) * uLen * 2.2, 2.0)) * step(0.001, uProg);
      float trail = lit * (0.42 + 0.58 * smoothstep(uProg - 0.45, uProg, u));
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.2);
      float a = (0.10 * uLevel + trail * 0.75 + head * 1.0) * (0.55 + 0.45 * f);
      gl_FragColor = vec4(uCol * (0.8 + head * 1.8), clamp(a, 0.0, 1.0));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const tubeVert = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }';
  const nerveSolid = new THREE.MeshPhysicalMaterial({ color: 0xf1e6c9, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.5, sheenColor: new THREE.Color(0xfff2d0) });
  fancy(nerveSolid, { clearcoat: 0.8, sheen: 0.5 });
  const glowMats = [];
  function nerve(points, { r = 0.016, glowR = 0.03, col = 0x4fe3ff, solid = true, group = scene, rev = 0 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const len = curve.getLength();
    const segs = Math.max(40, Math.round(len * 40));
    let s = null;
    if (solid) { s = new THREE.Mesh(track(new THREE.TubeGeometry(curve, segs, r, 10, false)), nerveSolid); s.renderOrder = 2; group.add(s); }
    const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(col) }, uProg: { value: 0 }, uLen: { value: len }, uRev: { value: rev }, uLevel: { value: 1 } }, vertexShader: tubeVert, fragmentShader: tubeFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    glowMats.push(mat);
    const gGeo = track(new THREE.TubeGeometry(curve, segs, glowR, 10, false));
    const g = new THREE.Mesh(gGeo, mat); g.renderOrder = 6; g.layers.set(1); group.add(g);
    return { curve, len, solid: s, glow: g, mat, geo: gGeo };
  }

  /* ---------------------------- anatomy paths ---------------------------- */
  const EYE = V(0.38, -0.12, 1.52);
  const EAR = V(1.62, -0.1, 0.15);
  const M1 = V(0.56, 0.72, 0.28);
  const V1 = V(0.0, 0.02, -1.06);
  const A1 = V(0.96, -0.14, 0.15);
  const HANDP = V(3.0, -2.62, 0.55);

  const N = {};
  N.optic = nerve([V(0.34, -0.14, 1.34), V(0.26, -0.26, 0.98), V(0.04, -0.3, 0.5), V(0.0, -0.18, -0.15), V(0.0, -0.04, -0.7), V(0, 0.02, -1.0)], { col: 0x4fe3ff });
  N.vis2m = nerve([V(0, 0.02, -1.0), V(0.2, 0.3, -0.72), V(0.42, 0.56, -0.25), V(0.56, 0.72, 0.28)], { col: 0x4fe3ff, solid: false });
  N.audio = nerve([V(1.5, -0.1, 0.15), V(1.25, -0.2, 0.14), V(1.02, -0.17, 0.15), V(0.96, -0.14, 0.15)], { col: 0xffc474 });
  N.aud2m = nerve([V(0.96, -0.14, 0.15), V(0.9, 0.2, 0.24), V(0.74, 0.5, 0.28), V(0.56, 0.72, 0.28)], { col: 0xffc474, solid: false });
  N.descend = nerve([V(0.56, 0.72, 0.28), V(0.42, 0.34, 0.16), V(0.2, -0.05, 0.0), V(0.03, -0.4, -0.2), V(0, -0.8, -0.34), V(0, -1.3, -0.41), V(0.02, -1.5, -0.43)], { col: 0x7fffd0, r: 0.02, glowR: 0.034 });
  N.arm = nerve([V(0.02, -1.5, -0.43), V(0.35, -1.62, -0.38), V(1.0, -1.9, -0.22), V(1.8, -2.25, 0.08), V(2.5, -2.5, 0.38), V(3.0, -2.6, 0.55), V(3.5, -2.62, 0.55)], { col: 0xff8fb3, r: 0.014, glowR: 0.028 });
  // reflex arc: same arm geometry reversed (sensory in), a short cord loop, then the arm out again
  const reflexInMat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(0xffb04a) }, uProg: { value: 0 }, uLen: { value: N.arm.len }, uRev: { value: 1 }, uLevel: { value: 0 } }, vertexShader: tubeVert, fragmentShader: tubeFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const reflexOutMat = reflexInMat.clone(); reflexOutMat.uniforms = { uCol: { value: new THREE.Color(0xffb04a) }, uProg: { value: 0 }, uLen: { value: N.arm.len }, uRev: { value: 0 }, uLevel: { value: 0 } };
  const rIn = new THREE.Mesh(N.arm.geo, reflexInMat); rIn.scale.setScalar(1.12); rIn.renderOrder = 7; rIn.layers.set(1); rIn.visible = false;
  const rOut = new THREE.Mesh(N.arm.geo, reflexOutMat); rOut.scale.setScalar(1.12); rOut.renderOrder = 7; rOut.layers.set(1); rOut.visible = false;
  // scale about origin would shift tube; instead use a thicker dedicated geometry
  scene.add(rIn, rOut);
  rIn.scale.setScalar(1); rOut.scale.setScalar(1);
  const cordLoop = nerve([V(0.02, -1.5, -0.43), V(-0.1, -1.56, -0.36), V(-0.14, -1.66, -0.44), V(0.0, -1.7, -0.45), V(0.04, -1.6, -0.44)], { col: 0xffb04a, solid: false, r: 0.012, glowR: 0.03 });
  cordLoop.glow.visible = false;
  const interNode = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb04a, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  interNode.scale.setScalar(0.34); interNode.position.set(-0.1, -1.6, -0.4); interNode.layers.set(1); interNode.renderOrder = 8; scene.add(interNode);

  /* ---------------------------- spinal cord + vertebrae ---------------------------- */
  const cordCurve = new THREE.CatmullRomCurve3([V(0, -0.25, -0.18), V(0, -0.7, -0.33), V(0, -1.3, -0.41), V(0.02, -2.0, -0.47), V(0.05, -2.8, -0.43), V(0.08, -3.45, -0.36)]);
  const cordMat = new THREE.MeshPhysicalMaterial({ color: 0xf3e8c8, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15, sheen: 0.6, sheenColor: new THREE.Color(0xfff0c8), transparent: true, opacity: 0.96 });
  fancy(cordMat, { clearcoat: 0.9, sheen: 0.6 });
  const cord = new THREE.Mesh(track(new THREE.TubeGeometry(cordCurve, 90, 0.065, 16, false)), cordMat); cord.renderOrder = 2; scene.add(cord);
  const NV = 13;
  const vGeo = track(new THREE.TorusGeometry(0.15, 0.04, 10, 22)); vGeo.rotateX(Math.PI / 2);
  const boneMat = new THREE.MeshPhysicalMaterial({ color: 0xe7dcc2, roughness: 0.5, clearcoat: 0.3, transparent: true, opacity: 0.55, depthWrite: false });
  const vert = new THREE.InstancedMesh(vGeo, boneMat, NV); vert.renderOrder = 3;
  const dGeo = track(new THREE.CylinderGeometry(0.1, 0.11, 0.07, 22)); const disc = new THREE.InstancedMesh(dGeo, boneMat, NV); disc.renderOrder = 3;
  { const o = new THREE.Object3D(), up = V(0, 1, 0);
    for (let i = 0; i < NV; i++) {
      const u = 0.12 + (i / (NV - 1)) * 0.86, pt = cordCurve.getPointAt(u), tg = cordCurve.getTangentAt(u);
      o.position.copy(pt); o.quaternion.setFromUnitVectors(up, tg); o.scale.setScalar(0.92 - i * 0.012); o.updateMatrix(); vert.setMatrixAt(i, o.matrix);
      o.position.copy(pt).add(V(0, 0, 0.19).applyQuaternion(new THREE.Quaternion())); o.updateMatrix(); disc.setMatrixAt(i, o.matrix);
    } }
  scene.add(vert, disc);

  /* ---------------------------- eye ---------------------------- */
  const eye = new THREE.Group(); eye.position.copy(EYE);
  const sclera = new THREE.Mesh(track(new THREE.SphereGeometry(0.17, 40, 28)), new THREE.MeshPhysicalMaterial({ color: 0xf6efe9, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4 }));
  eye.add(sclera);
  const irisTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 8, 128, 128, 126); gr.addColorStop(0, '#0a1a2a'); gr.addColorStop(0.28, '#2f8bb8'); gr.addColorStop(0.7, '#1d5f8a'); gr.addColorStop(0.92, '#102a40'); gr.addColorStop(1, '#0a1620');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 127, 0, 7); g.fill();
    const rnd = mulberry(4); g.lineWidth = 1.2;
    for (let i = 0; i < 160; i++) { const a = rnd() * 6.283, r0 = 22 + rnd() * 14, r1 = 80 + rnd() * 44; g.strokeStyle = `rgba(${150 + rnd() * 90 | 0},${200 + rnd() * 50 | 0},255,${0.08 + rnd() * 0.25})`; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(); textures.push(irisTex);
  const iris = new THREE.Mesh(track(new THREE.CircleGeometry(0.082, 40)), new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.35, clearcoat: 1 })); iris.position.z = 0.1655; eye.add(iris);
  const pupil = new THREE.Mesh(track(new THREE.CircleGeometry(0.034, 28)), new THREE.MeshBasicMaterial({ color: 0x000000 })); pupil.position.z = 0.1665; eye.add(pupil);
  const cornea = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 32, 20, 0, Math.PI * 2, 0, 0.95)), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.18, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, depthWrite: false })); cornea.rotation.x = Math.PI / 2; cornea.position.z = 0.09; eye.add(cornea);
  scene.add(eye);

  /* ---------------------------- stimulus: screen (visual) ---------------------------- */
  const PANEL = V(1.95, -0.05, 2.45);
  const stimVisual = new THREE.Group(); stimVisual.position.copy(PANEL); scene.add(stimVisual);
  const mkFace = (go) => { const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d');
    g.fillStyle = go ? '#d9ffe9' : '#10202c'; g.fillRect(0, 0, 256, 192);
    g.lineWidth = 8; g.strokeStyle = go ? '#d9ffe9' : '#5a7a8a';
    g.beginPath(); g.arc(128, 96, 52, 0, 7); if (go) { g.fillStyle = '#1a8f5a'; g.fill(); } else g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const faceWait = mkFace(false), faceGo = mkFace(true); textures.push(faceWait, faceGo);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceWait, toneMapped: false, side: THREE.DoubleSide });
  const frame = new THREE.Mesh(track(new THREE.RoundedBoxGeometry(0.62, 0.46, 0.04, 3, 0.015)), new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.4, metalness: 0.4 })); stimVisual.add(frame);
  const face = new THREE.Mesh(track(new THREE.PlaneGeometry(0.56, 0.4)), faceMat); face.position.z = 0.022; stimVisual.add(face);
  const face2 = face.clone(); face2.position.z = -0.022; face2.rotation.y = Math.PI; stimVisual.add(face2); face2.material = faceMat;
  stimVisual.lookAt(EYE.clone().multiplyScalar(1)); stimVisual.rotateY(Math.PI);
  const rayMat = new THREE.MeshBasicMaterial({ color: 0xdfffee, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ray = new THREE.Mesh(track(new THREE.CylinderGeometry(0.01, 0.026, 1, 12, 1, true)), rayMat); ray.layers.set(1); ray.visible = false; scene.add(ray);
  const rayDir = EYE.clone().sub(PANEL), rayLen = rayDir.length();
  ray.quaternion.setFromUnitVectors(V(0, 1, 0), rayDir.clone().normalize());
  // gaze the eye toward the panel
  eye.lookAt(PANEL);

  /* ---------------------------- stimulus: speaker + ear (audio) ---------------------------- */
  const SPK = V(3.3, -0.1, 0.9);
  const spk = new THREE.Group(); spk.position.copy(SPK); scene.add(spk);
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.45, metalness: 0.3 });
  const cab = new THREE.Mesh(track(new THREE.RoundedBoxGeometry(0.34, 0.52, 0.3, 3, 0.03)), cabMat); spk.add(cab);
  const cone = new THREE.Mesh(track(new THREE.LatheGeometry([[0, -0.02], [0.05, 0], [0.12, 0.05], [0.13, 0.065]].map(([x, y]) => new THREE.Vector2(x, y)), 28)), new THREE.MeshStandardMaterial({ color: 0x2a323a, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }));
  cone.rotation.z = Math.PI / 2; cone.rotation.x = 0; cone.position.set(-0.17, 0.06, 0); spk.add(cone);
  const cone2 = cone.clone(); cone2.scale.setScalar(0.5); cone2.position.set(-0.17, -0.15, 0); spk.add(cone2);
  const waveMats = [], waves = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const r = new THREE.Mesh(track(new THREE.RingGeometry(0.97, 1, 64, 1, Math.PI - 0.85, 1.7)), m); r.position.copy(SPK).add(V(-0.2, 0.05, 0)); r.layers.set(1); r.visible = false; scene.add(r); waves.push(r); waveMats.push(m);
  }
  // ear: extruded auricle with inner folds
  const ear = new THREE.Group(); ear.position.copy(EAR); scene.add(ear);
  { const outline = new THREE.CatmullRomCurve3([[0.0, 0.2], [0.09, 0.19], [0.15, 0.1], [0.16, -0.02], [0.13, -0.12], [0.07, -0.19], [0.02, -0.21], [-0.03, -0.17], [-0.05, -0.06], [-0.07, 0.06], [-0.05, 0.16]].map(([x, y]) => V(x, y, 0)), true);
    const shape = new THREE.Shape(outline.getPoints(40).map((p) => new THREE.Vector2(p.x, p.y)));
    const earMat = new THREE.MeshPhysicalMaterial({ color: 0xd8a590, roughness: 0.5, sheen: 0.8, sheenColor: new THREE.Color(0xffb8a0), clearcoat: 0.15 });
    const body = new THREE.Mesh(track(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelSegments: 5, curveSegments: 1 })), earMat);
    ear.add(body);
    const rim = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.0, 0.18, 0.04), V(0.1, 0.16, 0.05), V(0.14, 0.05, 0.05), V(0.12, -0.1, 0.05), V(0.05, -0.17, 0.05)]), 40, 0.014, 10)), earMat); ear.add(rim);
    const conchaM = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 20, 14)), new THREE.MeshStandardMaterial({ color: 0x6b3b36, roughness: 0.8 })); conchaM.scale.set(1, 1.25, 0.5); conchaM.position.set(0.03, 0.0, 0.035); ear.add(conchaM);
    ear.rotation.y = Math.PI / 2 + 0.2; ear.scale.setScalar(1.15); }

  /* ---------------------------- hand + button ---------------------------- */
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xd9a98f, roughness: 0.52, sheen: 0.7, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffb8a0), clearcoat: 0.1 });
  fancy(skin, { sheen: 0.7, clearcoat: 0.1 });
  const nailMat = new THREE.MeshPhysicalMaterial({ color: 0xe9c1b4, roughness: 0.25, clearcoat: 1 });
  const hand = buildHand(skin, { nails: true, nailMaterial: nailMat });
  const handRoot = new THREE.Group(); handRoot.add(hand.root);
  hand.root.scale.setScalar(0.9);
  handRoot.position.copy(HANDP);
  handRoot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -1), V(1, 0, 0), V(0, -1, 0)));
  scene.add(handRoot);
  hand.setAll(0.0);
  // forearm (translucent tissue around the nerve)
  const armTissue = new THREE.MeshPhysicalMaterial({ color: 0xe3b09a, roughness: 0.45, transparent: true, opacity: 0.2, depthWrite: false, clearcoat: 0.4, sheen: 0.6, sheenColor: new THREE.Color(0xffb8a0), side: THREE.DoubleSide });
  const armCurve = new THREE.CatmullRomCurve3([V(1.15, -1.94, -0.2), V(1.9, -2.3, 0.1), V(2.55, -2.52, 0.38), V(3.05, -2.62, 0.55)]);
  const armGeo = track(new THREE.TubeGeometry(armCurve, 40, 0.2, 24, false));
  { const p = armGeo.attributes.position; // taper from elbow end (thick) to wrist (thin)
    const c = armGeo.parameters.path; const pt = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const u = Math.floor(i / 25) / 40; // ring index along path (radial segs + 1 = 25)
      const pos = c.getPointAt(Math.min(1, u)); pt.fromBufferAttribute(p, i).sub(pos);
      const k = THREE.MathUtils.lerp(1.15, 0.78, u) * (1 + 0.25 * Math.sin(Math.min(1, u * 1.4) * Math.PI) * (1 - u));
      pt.multiplyScalar(k).add(pos); p.setXYZ(i, pt.x, pt.y, pt.z);
    } armGeo.computeVertexNormals(); }
  const arm = new THREE.Mesh(armGeo, armTissue); arm.renderOrder = 4; scene.add(arm);
  // muscle glow in palm + tap button
  const muscle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6f8f, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  muscle.scale.setScalar(0.75); muscle.position.copy(HANDP).add(V(0.5, 0.05, 0.05)); muscle.layers.set(1); muscle.renderOrder = 8; scene.add(muscle);
  const BTN = V(4.12, -2.94, 0.3);
  const btnBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 40)), new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.4, metalness: 0.7 })); btnBase.position.copy(BTN).add(V(0, -0.03, 0)); scene.add(btnBase);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0x0a2c34, emissive: new THREE.Color(0x4fe3ff), emissiveIntensity: 0.15, roughness: 0.2 });
  const btn = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2.3)), btnMat); btn.scale.y = 0.5; btn.position.copy(BTN).add(V(0, 0.03, 0)); scene.add(btn);
  // floor-less ground sheen: a faint disc under the arm for grounding
  const ground = new THREE.Mesh(track(new THREE.CircleGeometry(7, 64)), new THREE.MeshBasicMaterial({ color: 0x0b1a26, transparent: true, opacity: 0.0 })); ground.visible = false; scene.add(ground);

  /* ---------------------------- pulse head + lights + particles ---------------------------- */
  const headSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ff4ff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  headSprite.scale.setScalar(0.55); headSprite.layers.set(1); headSprite.renderOrder = 9; scene.add(headSprite);
  const headLight = new THREE.PointLight(0x7fe7ff, 0, 3.2, 2); scene.add(headLight);
  const dust = createDust(quality() === 'low' ? 80 : 200, { x: 9, y: 7, z: 7 }, glowTex);
  dust.points.position.set(1.4, -1.3, 0.2); dust.points.layers.set(1); scene.add(dust.points);
  dust.mat.uniforms.uColor.value.set(0x7fb9ff);

  /* ---------------------------- lights ---------------------------- */
  scene.add(new THREE.HemisphereLight(0x405a78, 0x0a0a12, 0.5));
  const key = new THREE.DirectionalLight(0xfff0e0, 2.1); key.position.set(-3, 5, 6); scene.add(key);
  const back = new THREE.DirectionalLight(0x5fa8ff, 2.6); back.position.set(3, 3, -6); scene.add(back);
  const fill = new THREE.PointLight(0xff9a70, 14, 12, 2); fill.position.set(4, -1, 4); scene.add(fill);

  /* ---------------------------- labels ---------------------------- */
  const labels = [];
  function label(text, pos, off, key, tint) {
    const s = TX.makeLabel(text, { size: 48, border: tint || 'rgba(120,230,255,0.6)' });
    s.layers.set(1); s.position.copy(pos).add(off); s.material.opacity = 0; s.userData.key = key; s.userData.aspect = s.userData.aspect;
    scene.add(s); labels.push(s); return s;
  }
  const L = {
    eye: label('Eye', EYE, V(0.55, 0.3, 0.3), 'sense'),
    ear: label('Ear', EAR, V(0.2, 0.55, 0.25), 'sense', 'rgba(255,200,120,0.7)'),
    v1: label('Visual cortex', V(0, 0.05, -1.1), V(0.9, 0.45, -0.2), 'v1'),
    a1: label('Auditory cortex', A1, V(0.8, 0.5, 0.2), 'v1', 'rgba(255,200,120,0.7)'),
    m1: label('Motor cortex', M1, V(0.9, 0.55, 0.3), 'm1', 'rgba(126,255,208,0.7)'),
    cord: label('Spinal cord', V(0, -1.9, -0.45), V(-1.15, 0.0, 0.2), 'cord', 'rgba(126,255,208,0.7)'),
    hand: label('Hand muscle', HANDP, V(0.9, 0.75, 0.2), 'hand', 'rgba(255,143,179,0.8)'),
    stimV: label('Light cue', PANEL, V(0.4, 0.5, 0.1), 'stim'),
    stimA: label('Sound cue', SPK, V(0.2, 0.6, 0.1), 'stim', 'rgba(255,200,120,0.7)'),
    reflex: label('Reflex: spinal cord only', V(1.3, -1.9, 0), V(0.0, 0.8, 0.5), 'reflex', 'rgba(255,176,74,0.9)'),
    brainReflex: label('The brain is skipped', V(0.0, 0.5, 0), V(0.9, 0.8, 0.0), 'reflex', 'rgba(255,176,74,0.9)'),
  };
  const nearCam = new THREE.Group(); camera.add(nearCam); scene.add(camera);
  const disclaimer = TX.makeLabel('Simplified illustration', { size: 44, bg: 'rgba(5,10,16,0.7)', border: 'rgba(255,255,255,0.25)', color: '#f1f6fa', weight: 700 });
  disclaimer.layers.set(1); disclaimer.material.depthTest = false; nearCam.add(disclaimer);
  const reflexNote = TX.makeLabel('A reflex uses a shorter path', { size: 42, bg: 'rgba(40,24,6,0.75)', border: 'rgba(255,176,74,0.8)', color: '#ffe4bd', weight: 700 });
  reflexNote.layers.set(1); reflexNote.material.depthTest = false; reflexNote.material.opacity = 0; nearCam.add(reflexNote);

  /* ---------------------------- camera control ---------------------------- */
  let aspect = 1, kPort = 1, vfov = 38;
  function resize(a) {
    aspect = a;
    const need = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(40) / 2) / a); // keep 40deg horizontal when portrait
    vfov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(need), 38, 62);
    camera.fov = vfov; camera.aspect = a; camera.updateProjectionMatrix();
  }
  function fit(W, H, margin = 1.12) {
    const tv = Math.tan(THREE.MathUtils.degToRad(vfov) / 2);
    return Math.max(H / 2 / tv, W / 2 / (tv * aspect)) * margin;
  }
  const camPos = V(0, 0, 10), camLook = V(0, 0, 0), goalPos = V(), goalLook = V(), pulsePos = V(), tmp = V();
  const wideLook = V(1.55, -1.05, 0.5), wideDir = V(0.18, 0.1, 1).normalize();
  const closeDirs = {
    sense: V(0.55, 0.25, 1).normalize(), brain: V(0.7, 0.28, 0.9).normalize(), cord: V(0.55, 0.12, 1).normalize(), arm: V(0.3, 0.4, 1).normalize(),
  };

  /* ---------------------------- state machine ---------------------------- */
  let playing = false, rt = 0, opts = { stim: 'visual', compareReflex: false }, doneCb = null, endT = TL.end;
  const stages = () => {
    const sens = opts.stim === 'audio' ? N.audio : N.optic, assoc = opts.stim === 'audio' ? N.aud2m : N.vis2m;
    return [
      { n: sens, t: TL.s1, brain: true }, { n: assoc, t: TL.s2, brain: true }, { n: N.descend, t: TL.s3, brain: true }, { n: N.arm, t: TL.s4, brain: false },
    ];
  };
  const sensCortex = () => (opts.stim === 'audio' ? A1 : V1);

  function configure(o) {
    opts = { stim: o && o.stim === 'audio' ? 'audio' : 'visual', compareReflex: !!(o && o.compareReflex) };
    const aud = opts.stim === 'audio';
    eye.visible = !aud; stimVisual.visible = !aud; ray.visible = false;
    ear.visible = aud; spk.visible = aud; waves.forEach((w) => { w.visible = false; });
    N.optic.solid.visible = !aud; N.optic.glow.visible = !aud; N.vis2m.glow.visible = !aud;
    N.audio.solid.visible = aud; N.audio.glow.visible = aud; N.aud2m.glow.visible = aud;
    L.eye.visible = !aud; L.v1.visible = !aud; L.stimV.visible = !aud; L.ear.visible = aud; L.a1.visible = aud; L.stimA.visible = aud;
    L.v1.position.copy(V1).add(V(0.9, 0.45, -0.2)); L.a1.position.copy(A1).add(V(0.8, 0.5, 0.2));
    L.reflex.visible = L.brainReflex.visible = opts.compareReflex;
    endT = opts.compareReflex ? TL.endR : TL.end;
  }

  function resetVisuals() {
    glowMats.forEach((m) => { m.uniforms.uProg.value = 0; });
    reflexInMat.uniforms.uProg.value = 0; reflexOutMat.uniforms.uProg.value = 0; reflexInMat.uniforms.uLevel.value = 0; reflexOutMat.uniforms.uLevel.value = 0;
    rIn.visible = rOut.visible = false; cordLoop.glow.visible = false;
    brainU.uPulseI.value = 0; brainU.uRegI.value[0] = brainU.uRegI.value[1] = 0;
    faceMat.map = faceWait; hand.setAll(0); headSprite.material.opacity = 0; headLight.intensity = 0; muscle.material.opacity = 0; interNode.material.opacity = 0;
    btnMat.emissiveIntensity = 0.15; labels.forEach((l) => { l.material.opacity = 0; });
    reflexNote.material.opacity = 0;
  }

  function play(o, done) {
    configure(o); resetVisuals();
    rt = 0; playing = true; doneCb = done; stimVisual.scale.setScalar(1); spk.scale.setScalar(1);
    // start camera on the wide establishing shot
    const d = fit(5.8, 5.6); camPos.copy(wideLook).addScaledVector(wideDir, d * 1.12); camLook.copy(wideLook);
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  function finish(kind) {
    if (!playing) return;
    playing = false; const cb = doneCb; doneCb = null;
    cb && cb(kind);
  }
  function skip() { finish('skipped'); }

  const colV = new THREE.Color(0x4fe3ff), colA = new THREE.Color(0xffc474), colM = new THREE.Color(0x7fffd0), colH = new THREE.Color(0xff8fb3), colR = new THREE.Color(0xffb04a);
  let lastFocus = 8;

  function setLabel(l, on, base = 0.95, lowTo = 0.5) {
    const g = l.userData; g.target = on; g.base = base; g.low = lowTo;
  }

  function update(dt) {
    dust.mat.uniforms.uTime.value += dt;
    if (!playing) return;
    rt += dt;
    const t = rt;
    const audio = opts.stim === 'audio';
    const S = stages();
    const stageCols = [audio ? colA : colV, audio ? colA : colV, colM, colH];

    /* stimulus */
    { const sh = Math.max(0.001, 1 - smooth(seg(t, 1.7, 2.4))); stimVisual.scale.setScalar(sh); spk.scale.setScalar(sh); }
    if (!audio) {
      faceMat.map = t > TL.stim ? faceGo : faceWait;
      const rp = seg(t, TL.ray[0], TL.ray[1]);
      ray.visible = rp > 0 && t < TL.s1[0] + 0.5;
      ray.scale.set(1, rayLen * rp, 1);
      ray.position.copy(PANEL).addScaledVector(rayDir, 0.5 * rp);
      rayMat.opacity = 0.55 * (1 - seg(t, TL.s1[0], TL.s1[0] + 0.5));
      setLabel(L.stimV, t > TL.stim && t < 2.2);
    } else {
      waves.forEach((w, i) => {
        const p = ((t - TL.stim - i * 0.11) / 0.62);
        const on = p > 0 && p < 1 && t < TL.s1[0] + 0.3;
        w.visible = on;
        if (on) { w.scale.setScalar(0.1 + p * 1.75); waveMats[i].opacity = Math.sin(Math.PI * p) * 0.75; }
      });
      setLabel(L.stimA, t > TL.stim && t < 2.2);
    }

    /* pulse position + stage progress */
    let head = null, headCol = audio ? colA : colV, inBrain = false, stageKey = 'wide';
    S.forEach((s, i) => {
      const p = inOut(seg(t, s.t[0], s.t[1]));
      s.n.mat.uniforms.uProg.value = p;
      s.n.mat.uniforms.uCol.value.copy(stageCols[i]);
      if (t >= s.t[0] && t <= s.t[1] + 0.02) {
        head = s.n.curve.getPointAt(Math.min(1, p)); headCol = stageCols[i]; inBrain = s.brain; stageKey = ['sense', 'brain', 'cord', 'arm'][i];
      }
    });
    // dwell phases
    if (!head) {
      if (t >= TL.s1[1] && t < TL.s2[0]) { head = sensCortex(); stageKey = 'brain'; inBrain = true; headCol = stageCols[0]; }
      else if (t >= TL.s2[1] && t < TL.s3[0]) { head = M1; stageKey = 'brain'; inBrain = true; headCol = colM; }
      else if (t >= TL.s4[1] && t < TL.tap[1] + 0.05) { head = N.arm.curve.getPointAt(1); stageKey = 'arm'; headCol = colH; }
    }
    if (head) pulsePos.copy(head);

    /* brain glow uniforms */
    const sc = sensCortex();
    brainU.uReg.value[0].set(sc.x, sc.y, sc.z, 0.5); brainU.uReg.value[1].set(M1.x, M1.y, M1.z, 0.5);
    brainU.uRegI.value[0] = smooth(seg(t, TL.s1[1] - 0.15, TL.s1[1] + 0.2)) * (1 - 0.7 * smooth(seg(t, TL.s2[1], TL.s3[1])));
    brainU.uRegI.value[1] = smooth(seg(t, TL.s2[1] - 0.15, TL.s2[1] + 0.2)) * (1 - 0.7 * smooth(seg(t, TL.s3[1], TL.s4[1])));
    brainU.uPulseI.value = head && inBrain ? 0.9 : 0;
    brainU.uPulse.value.copy(pulsePos); brainU.uPulseCol.value.copy(headCol);
    brainU.uReg.value[0].w = 0.5; brainU.uReg.value[1].w = 0.5;

    /* head sprite + light */
    const show = head && t < TL.tap[1];
    headSprite.position.copy(pulsePos); headLight.position.copy(pulsePos);
    headSprite.material.color.copy(headCol); headLight.color.copy(headCol);
    const hs = 0.45 + 0.1 * Math.sin(t * 5);
    headSprite.scale.setScalar(hs * (stageKey === 'arm' ? 0.8 : 1));
    const hv = show ? 1 : 0;
    headSprite.material.opacity += (hv * 0.95 - headSprite.material.opacity) * (1 - Math.exp(-dt * 14));
    headLight.intensity += (hv * 5 - headLight.intensity) * (1 - Math.exp(-dt * 10));
    // light-ray / sound cue also carries a small head before the nerve starts
    if (!head && t >= TL.ray[0] && t < TL.s1[0]) {
      const p = inOut(seg(t, TL.ray[0], TL.ray[1]));
      const from = audio ? SPK : PANEL, to = audio ? EAR : EYE;
      pulsePos.copy(from).lerp(to, p); headSprite.position.copy(pulsePos); headLight.position.copy(pulsePos);
      headSprite.material.opacity = 0.8; headSprite.material.color.set(audio ? 0xffd08a : 0xdfffee);
    }

    /* eye / ear sensory labels */
    setLabel(audio ? L.ear : L.eye, t > TL.s1[0] - 0.1);
    setLabel(audio ? L.a1 : L.v1, t > TL.s1[1] - 0.15);
    setLabel(L.m1, t > TL.s2[1] - 0.15);
    setLabel(L.cord, t > TL.s3[1] - 0.45);
    setLabel(L.hand, t > TL.s4[1] - 0.1);

    /* tap: finger presses the button, muscle glows */
    const tapP = seg(t, TL.tap[0], TL.tap[0] + 0.22), release = seg(t, TL.tap[0] + 0.3, TL.tap[1]);
    const press = smooth(tapP) * (1 - smooth(release));
    hand.setCurl(3, press * 0.5); hand.setCurl(2, press * 0.08);
    muscle.material.opacity = 0.9 * smooth(seg(t, TL.s4[1] - 0.15, TL.s4[1] + 0.15)) * (1 - 0.6 * smooth(seg(t, TL.tap[1], TL.tap[1] + 0.6)));
    btnMat.emissiveIntensity = 0.15 + 2.2 * smooth(seg(t, TL.tap[0] + 0.12, TL.tap[0] + 0.3)) * (1 - 0.35 * smooth(release));
    btn.position.y = BTN.y + 0.03 - 0.025 * press;

    /* reflex comparison (amber) */
    let reflexHead = null;
    if (opts.compareReflex) {
      const rin = seg(t, TL.r1[0], TL.r1[1]), rout = seg(t, TL.r3[0], TL.r3[1]);
      const show1 = t >= TL.r1[0], show3 = t >= TL.r3[0];
      rIn.visible = show1; rOut.visible = show3; cordLoop.glow.visible = t >= TL.r2[0];
      reflexInMat.uniforms.uProg.value = inOut(rin); reflexInMat.uniforms.uLevel.value = 0.6;
      reflexOutMat.uniforms.uProg.value = inOut(rout); reflexOutMat.uniforms.uLevel.value = 0.6;
      cordLoop.mat.uniforms.uProg.value = smooth(seg(t, TL.r2[0], TL.r2[1])); cordLoop.mat.uniforms.uCol.value.copy(colR);
      if (t >= TL.r1[0] && t < TL.r1[1]) reflexHead = N.arm.curve.getPointAt(1 - inOut(rin));
      else if (t >= TL.r2[0] && t < TL.r2[1]) reflexHead = cordLoop.curve.getPointAt(smooth(seg(t, TL.r2[0], TL.r2[1])));
      else if (t >= TL.r3[0] && t < TL.r3[1] + 0.02) reflexHead = N.arm.curve.getPointAt(inOut(rout));
      interNode.material.opacity = 0.9 * smooth(seg(t, TL.r2[0] - 0.1, TL.r2[0] + 0.1)) * (1 - smooth(seg(t, TL.r3[1], TL.r3[1] + 0.6)));
      // main pulse fades while the reflex plays
      if (reflexHead) { pulsePos.copy(reflexHead); headSprite.position.copy(reflexHead); headLight.position.copy(reflexHead); headSprite.material.color.copy(colR); headLight.color.copy(colR); headSprite.material.opacity = 0.95; headLight.intensity = 4; headSprite.scale.setScalar(0.4); }
      else if (t > TL.tap[1] + 0.05) { headSprite.material.opacity = 0; headLight.intensity = 0; }
      const tw = smooth(seg(t, TL.rtw[0], TL.rtw[0] + 0.15)) * (1 - smooth(seg(t, TL.rtw[0] + 0.15, TL.rtw[1])));
      hand.setCurl(0, tw * 0.4); hand.setCurl(1, tw * 0.4); hand.setCurl(2, tw * 0.45); hand.setCurl(3, Math.max(press * 0.5, tw * 0.45));
      muscle.material.opacity = Math.max(muscle.material.opacity, 0.85 * tw);
      muscle.material.color.set(tw > 0.02 ? 0xffa04a : 0xff6f8f);
      setLabel(L.reflex, t > TL.r1[0]); setLabel(L.brainReflex, t > TL.r2[0], 0.95, 0.7);
      reflexNote.material.opacity += ((t > TL.r1[0] ? 1 : 0) - reflexNote.material.opacity) * (1 - Math.exp(-dt * 5));
    }

    /* camera */
    const useReflexCam = opts.compareReflex && t >= TL.r0 - 0.2;
    let key2 = stageKey;
    if (t < TL.ray[0] + 0.1 || (t > TL.tap[1] + 0.2 && !useReflexCam)) key2 = 'wide';
    if (opts.compareReflex && t > TL.rtw[1] + 0.25) key2 = 'wide';
    if (useReflexCam && key2 !== 'wide') key2 = 'reflex';
    if (t < TL.s1[0] && t >= TL.ray[0] + 0.1) key2 = 'stimcam';
    const wideDist = fit(5.8, 5.6) * 1.12;
    switch (key2) {
      case 'wide': {
        const slow = t < 1 ? t * 0.1 : 0;
        goalLook.copy(wideLook); goalPos.copy(wideLook).addScaledVector(wideDir, wideDist * (1.0 - slow * 0.4));
        break;
      }
      case 'stimcam': { // pulling toward the sensory organ
        const tgt = audio ? EAR : EYE;
        goalLook.copy(tgt).lerp(pulsePos, 0.4);
        goalPos.copy(goalLook).addScaledVector(closeDirs.sense, fit(4.2, 3.6));
        break;
      }
      case 'sense': goalLook.copy(pulsePos).lerp(audio ? EAR : EYE, 0.25); goalPos.copy(goalLook).addScaledVector(closeDirs.sense, fit(4.2, 3.6)); break;
      case 'brain': goalLook.copy(pulsePos).lerp(brainCenter, 0.45); goalPos.copy(goalLook).addScaledVector(closeDirs.brain, fit(4.0, 3.4)); break;
      case 'cord': goalLook.copy(pulsePos); goalPos.copy(goalLook).addScaledVector(closeDirs.cord, fit(4.4, 3.6)); break;
      case 'arm': goalLook.copy(pulsePos).lerp(HANDP, 0.35); goalPos.copy(goalLook).addScaledVector(closeDirs.arm, fit(4.8, 3.6)); break;
      case 'reflex': {
        tmp.set(1.6, -1.95, 0.1); goalLook.copy(tmp); goalPos.copy(goalLook).addScaledVector(closeDirs.arm, fit(4.9, 3.6));
        break;
      }
      default: goalLook.copy(wideLook); goalPos.copy(wideLook).addScaledVector(wideDir, wideDist);
    }
    const k = 1 - Math.exp(-dt * (key2 === 'wide' ? 1.6 : 2.6));
    camPos.lerp(goalPos, k); camLook.lerp(goalLook, k);
    // gentle handheld-free parallax drift
    camera.position.copy(camPos).add(tmp.set(Math.sin(t * 0.4) * 0.05, Math.cos(t * 0.33) * 0.03, 0));
    camera.lookAt(camLook);
    lastFocus = camera.position.distanceTo(head || camLook) ;

    /* labels: fade and billboard scale */
    const dist = camera.position.distanceTo(camLook);
    labels.forEach((l) => {
      const g = l.userData;
      const goal = g.target ? (g.fade ? g.low : g.base) : 0;
      l.material.opacity += (goal - l.material.opacity) * (1 - Math.exp(-dt * 6));
      const h = 0.034 * dist * (aspect < 1 ? 1.0 : 0.85);
      const w = Math.min(h * g.aspect, 2.5 * dist * 0.35 * Math.min(1, aspect * 1.2));
      l.scale.set(w, w / g.aspect, 1);
      l.visible = l.material.opacity > 0.01 && (g.key !== 'stim' ? true : true);
    });
    // per-label dimming once the story moves on
    L.eye.userData.fade = L.ear.userData.fade = t > TL.s2[0];
    L.v1.userData.fade = L.a1.userData.fade = t > TL.s3[0];
    L.m1.userData.fade = t > TL.s4[0]; L.cord.userData.fade = t > TL.tap[0];
    L.stimV.userData.fade = L.stimA.userData.fade = true;
    L.hand.userData.fade = opts.compareReflex && t > TL.r1[0];

    // fixed caption in the lower part of the view
    const dd = 2.2, viewH = 2 * Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * dd, viewW = viewH * aspect;
    const capW = Math.min(viewW * 0.62, viewH * 0.55 * disclaimer.userData.aspect * 0.5 * 2);
    disclaimer.scale.set(capW, capW / disclaimer.userData.aspect, 1);
    disclaimer.position.set(0, -viewH * 0.5 + capW / disclaimer.userData.aspect * 0.9, -dd);
    const rnW = Math.min(viewW * 0.86, capW * 1.5);
    reflexNote.scale.set(rnW, rnW / reflexNote.userData.aspect, 1);
    reflexNote.position.set(0, disclaimer.position.y + capW / disclaimer.userData.aspect * 1.25 + rnW / reflexNote.userData.aspect * 0.4, -dd);

    if (t >= endT) finish('done');
  }
  const brainCenter = V(0.3, 0.1, -0.2);

  function dispose() {
    disposables.forEach((d) => d.dispose && d.dispose());
    textures.forEach((t) => t.dispose());
    dust.mat.dispose(); dust.geo.dispose();
    scene.traverse((o) => {
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); }); }
    });
    glowMats.forEach((m) => m.dispose()); reflexInMat.dispose(); reflexOutMat.dispose();
  }

  resize(1.5);
  return { scene, camera, play, skip, update, resize, dispose, get active() { return playing; }, get focus() { return lastFocus; }, get endT() { return endT; }, get duration() { return endT; }, setSeek(t) { rt = t; } };
}
