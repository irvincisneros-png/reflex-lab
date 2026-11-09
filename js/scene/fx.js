// Cheap atmospheric FX: GPU-animated dust motes, fake light shafts, celebration burst.
import * as THREE from './three.js';
import { shaftGradient, glowSprite } from './textures.js';
import { mulberry } from './noise.js';

export function createDust(count, bounds, glow) {
  const rnd = mulberry(99);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * bounds.x; pos[i * 3 + 1] = 0.3 + rnd() * bounds.y; pos[i * 3 + 2] = (rnd() - 0.5) * bounds.z - 0.5;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 300 }, uMotion: { value: 1 }, uMap: { value: glow }, uColor: { value: new THREE.Color(0xbfe9ff) } },
    vertexShader: /* glsl */`
      uniform float uTime, uPx, uMotion; attribute vec4 aSeed; varying float vA;
      void main(){
        vec3 p = position + uMotion * 0.4 * vec3(sin(uTime*(0.2+aSeed.x*0.3)+aSeed.y*6.28), 0.6*sin(uTime*(0.15+aSeed.z*0.25)+aSeed.w*6.28), cos(uTime*(0.18+aSeed.x*0.25)+aSeed.z*6.28));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(uPx * (0.012 + aSeed.w * 0.02) / -mv.z, 1.0, 14.0);
        vA = 0.25 + 0.75 * aSeed.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * 0.55; gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, mat, geo };
}

export function createShafts(glowTex, count = 4) {
  const group = new THREE.Group();
  const tex = shaftGradient();
  const mats = [];
  const defs = [
    { from: [-2.4, 3.9, -1.8], to: [-0.6, 0.0, 0.2], w: 1.6, col: 0x9fd8ff, o: 0.085 },
    { from: [2.6, 3.9, -2.2], to: [0.8, 0.0, -0.1], w: 1.4, col: 0xffe2b8, o: 0.07 },
    { from: [0.2, 3.9, -3.6], to: [0.0, 0.0, -0.4], w: 1.9, col: 0x8fe9ff, o: 0.06 },
    { from: [-4.2, 3.9, 0.4], to: [-2.4, 0.0, -1.0], w: 1.1, col: 0xcfe6ff, o: 0.05 },
  ].slice(0, count);
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, -0.5, 0);
  defs.forEach((d, i) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, color: d.col, transparent: true, opacity: d.o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    m.userData.base = d.o; m.userData.ph = i * 1.7;
    mats.push(m);
    const from = new THREE.Vector3(...d.from), to = new THREE.Vector3(...d.to);
    const len = from.distanceTo(to);
    for (let k = 0; k < 2; k++) {
      const p = new THREE.Mesh(geo, m);
      p.position.copy(from);
      p.scale.set(d.w, len, 1);
      p.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
      p.rotateY(k * Math.PI / 2);
      p.renderOrder = 2;
      group.add(p);
    }
  });
  return {
    group, mats,
    update(t, motion) { mats.forEach((m) => { m.opacity = m.userData.base * (0.85 + 0.15 * Math.sin(t * 0.25 * motion + m.userData.ph)); }); },
    dispose() { geo.dispose(); tex.dispose(); mats.forEach((m) => m.dispose()); },
  };
}

/** Soft, slow-fading celebratory particles. Monotone fades only: no strobing. */
export function createBurst(count, glow) {
  const rnd = mulberry(7);
  const vel = new Float32Array(count * 3), seed = new Float32Array(count * 4), pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, up = 0.35 + rnd() * 0.75, sp = 0.5 + rnd() * 1.2;
    vel[i * 3] = Math.cos(a) * sp * 0.7; vel[i * 3 + 1] = up * 1.3; vel[i * 3 + 2] = Math.sin(a) * sp * 0.7;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAge: { value: 99 }, uPx: { value: 300 }, uMap: { value: glow }, uA: { value: new THREE.Color(0xffe3a3) }, uB: { value: new THREE.Color(0x8ff3ff) }, uLife: { value: 2.4 } },
    vertexShader: /* glsl */`
      uniform float uAge, uPx, uLife; attribute vec3 aVel; attribute vec4 aSeed; varying float vA; varying float vMix;
      void main(){
        float a = uAge;
        vec3 p = aVel * (1.0 - exp(-1.5 * a)) / 1.5 + vec3(0.0, -0.18 * a * a, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float k = clamp(1.0 - a / uLife, 0.0, 1.0);
        vA = k * k * smoothstep(0.0, 0.25, a);
        vMix = aSeed.x;
        gl_PointSize = clamp(uPx * (0.02 + aSeed.y * 0.03) / -mv.z, 1.0, 40.0);
        gl_Position = projectionMatrix * mv;
        if (a > uLife) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uA, uB; varying float vA; varying float vMix;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(mix(uA, uB, step(0.55, vMix)) * 1.3, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.visible = false;
  return { points: pts, mat, geo };
}
