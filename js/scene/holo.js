// Holographic per-claim models shown above the holo-table in 'planning' mode.
import * as THREE from './three.js';
import { buildHand } from './hand.js';
import { digitSprite, makeLabel } from './textures.js';
import { fbm3, mulberry } from './noise.js';

export const CLAIM_LABELS = {
  hand: 'Dominant vs non-dominant hand',
  sound: 'Light vs sound',
  distract: 'Calm vs distracted',
  multitask: 'Single task vs counting',
  decide: 'Simple vs go / no-go',
  practice: 'Before vs after practice',
  custom: 'Your own test',
};

const VERT = /* glsl */`
varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime; uniform float uAmt; uniform float uBase; uniform float uAlpha; uniform float uSolid;
varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.1);
  float scan = 0.66 + 0.34 * sin((vY - uBase) * 110.0 - uTime * 1.6);
  float sw = smoothstep(0.06, 0.0, abs(fract(uTime * 0.16) * 1.8 + uBase - vY));
  float a = (0.14 + f * 0.8) * scan + sw * 0.45;
  vec3 c = uColor * (0.85 + f * 1.25 + sw * 1.4);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uAlpha * uAmt);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createHolo({ baseY = 1.0, centerY = 1.72, fancyLow }) {
  const shared = { uTime: { value: 0 }, uAmt: { value: 0 }, uBase: { value: baseY } };
  const group = new THREE.Group();
  group.position.y = centerY;
  const models = new Map();
  const mats = [];
  const disposables = [];

  function mat(color = 0x5ee9ff, alpha = 1, solid = 0) {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha }, uSolid: { value: solid } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    mats.push(m);
    return m;
  }
  const mesh = (geo, m) => { disposables.push(geo); return new THREE.Mesh(geo, m); };

  /* ---------- builders ---------- */
  const B = {};

  B.hand = () => {
    const g = new THREE.Group();
    const upd = [];
    [[-0.52, 0x5ee9ff, 1], [0.52, 0xffb26b, 0.75]].forEach(([x, col, a], k) => {
      const m = mat(col, a);
      const h = buildHand(m, { nails: false });
      h.root.scale.set(k ? -0.42 : 0.42, 0.42, 0.42);
      h.root.position.set(x, -0.34, 0);
      h.root.rotation.x = -0.2;
      disposables.push({ dispose: h.dispose });
      g.add(h.root);
      upd.push((t) => {
        for (let i = 0; i < 5; i++) {
          const w = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 0.6 + k * 1.6);
          h.setCurl(i, 0.12 + 0.55 * w * w);
        }
      });
    });
    // tap target between the hands
    const ring = mesh(new THREE.TorusGeometry(0.17, 0.012, 10, 48), mat(0xffffff, 0.9));
    ring.position.set(0, -0.1, 0); g.add(ring);
    const dot = mesh(new THREE.CircleGeometry(0.08, 28), mat(0x9bf6ff, 0.9));
    dot.position.set(0, -0.1, 0); g.add(dot);
    g.userData.update = (t, dt) => { upd.forEach((f) => f(t)); const s = 1 + Math.sin(t * 1.8) * 0.06; dot.scale.setScalar(s); g.rotation.y = Math.sin(t * 0.35) * 0.35; };
    return g;
  };

  B.sound = () => {
    const g = new THREE.Group();
    const m = mat(0x7fe7ff, 1);
    const m2 = mat(0xffd08a, 0.9);
    const ear = new THREE.Group();
    const tube = (pts, r, mm) => {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.5);
      return mesh(new THREE.TubeGeometry(c, 60, r, 10, false), mm);
    };
    ear.add(tube([[-0.12, 0.52, 0], [0.12, 0.56, 0.02], [0.34, 0.42, 0.04], [0.42, 0.16, 0.05], [0.37, -0.12, 0.04], [0.26, -0.33, 0.03], [0.1, -0.43, 0.02], [-0.04, -0.45, 0]], 0.048, m));
    ear.add(tube([[-0.02, 0.32, 0.03], [0.17, 0.35, 0.05], [0.26, 0.14, 0.07], [0.15, -0.02, 0.07], [0.22, -0.2, 0.06], [0.1, -0.31, 0.05]], 0.034, m));
    const lobe = mesh(new THREE.SphereGeometry(0.1, 20, 14), m); lobe.scale.set(0.9, 1.25, 0.6); lobe.position.set(0.02, -0.5, 0.01); ear.add(lobe);
    const concha = mesh(new THREE.SphereGeometry(0.15, 22, 16), m); concha.scale.set(0.95, 1.3, 0.55); concha.position.set(0.04, 0.0, 0.02); ear.add(concha);
    const tragus = mesh(new THREE.SphereGeometry(0.06, 14, 10), m); tragus.position.set(-0.13, -0.02, 0.05); ear.add(tragus);
    ear.position.set(0.28, 0.0, 0); ear.scale.setScalar(1.0);
    g.add(ear);
    // speaker cone + expanding wavefronts
    const prof = [[0.0, 0.0], [0.07, 0.0], [0.1, 0.05], [0.18, 0.2], [0.2, 0.22]].map(([x, y]) => new THREE.Vector2(x, y));
    const cone = mesh(new THREE.LatheGeometry(prof, 24), mat(0xffd08a, 0.85));
    cone.rotation.z = -Math.PI / 2; cone.position.set(-0.9, 0, 0); g.add(cone);
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const mm = mat(0xffd08a, 1);
      const r = mesh(new THREE.RingGeometry(0.97, 1, 64, 1, -0.75, 1.5), mm);
      r.position.set(-0.9, 0, 0); g.add(r); rings.push([r, mm]);
    }
    g.userData.update = (t) => {
      rings.forEach(([r, mm], i) => {
        const p = (t * 0.22 + i / 4) % 1;
        r.scale.setScalar(0.15 + p * 1.0);
        mm.uniforms.uAlpha.value = Math.sin(Math.PI * p) * 0.95;
      });
      g.rotation.y = Math.sin(t * 0.3) * 0.25;
    };
    return g;
  };

  B.distract = () => {
    const g = new THREE.Group();
    const center = new THREE.Group();
    center.add(mesh(new THREE.TorusGeometry(0.2, 0.014, 10, 56), mat(0xffffff, 0.95)));
    center.add(mesh(new THREE.CircleGeometry(0.1, 28), mat(0x9bf6ff, 0.9)));
    g.add(center);
    const geos = [new THREE.SphereGeometry(0.1, 20, 14), new THREE.OctahedronGeometry(0.12), new THREE.IcosahedronGeometry(0.11, 0), new THREE.TetrahedronGeometry(0.13), new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.DodecahedronGeometry(0.11)];
    const cols = [0x9fb4c7, 0x6ea8ff, 0xffa95c, 0xa6b3bf, 0x7cb0ff, 0xffb97c];
    const items = geos.map((geo, i) => {
      const mm = mat(cols[i], 0.7);
      const m = mesh(geo, mm); g.add(m);
      return { m, mm, a: i * 1.047, r: 0.5 + (i % 3) * 0.14, sp: 0.18 + (i % 4) * 0.045, ph: i * 1.3 };
    });
    g.userData.update = (t) => {
      items.forEach((it) => {
        const a = it.a + t * it.sp;
        it.m.position.set(Math.cos(a) * it.r, Math.sin(t * 0.4 + it.ph) * 0.22 + Math.sin(a * 1.0) * 0.12, Math.sin(a) * it.r * 0.6);
        it.m.rotation.x = t * 0.2 + it.ph; it.m.rotation.y = t * 0.15;
        it.mm.uniforms.uAlpha.value = 0.55 + 0.35 * Math.sin(t * 0.55 + it.ph); // opacity-only, >= ~11 s period/2
      });
      g.rotation.y = t * 0.05;
    };
    return g;
  };

  B.multitask = () => {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(0.42, 4);
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = fbm3(v.x * 2.4, v.y * 2.4, v.z * 2.4, 3);
      const side = Math.abs(v.x) < 0.1 ? -0.07 : 0; // central fissure
      const r = 0.42 * (1 + n * 0.16 + side);
      p.setXYZ(i, v.x * r * 0.82, v.y * r * 0.88, v.z * r * 1.12);
    }
    geo.computeVertexNormals();
    g.add(mesh(geo, mat(0x7fe7ff, 0.85)));
    const wf = mesh(geo, mat(0xb8f5ff, 0.22)); wf.material.wireframe = true; wf.scale.setScalar(1.01); g.add(wf);
    const digits = ['137', '134', '131', '128', '125', '122'].map((d, i) => {
      const s = digitSprite(d, i === 0 ? '#ffffff' : '#9ef3ff'); s.scale.multiplyScalar(1.1); s.renderOrder = 5;
      s.material.depthTest = true; s.material.depthWrite = false; s.material.blending = THREE.AdditiveBlending; g.add(s);
      return s;
    });
    g.userData.update = (t) => {
      g.rotation.y = t * 0.12;
      digits.forEach((s, i) => {
        const a = t * 0.35 + i * (Math.PI * 2 / 6);
        s.position.set(Math.cos(a) * 0.75, 0.05 + Math.sin(a * 2 + i) * 0.12, Math.sin(a) * 0.5);
        s.material.opacity = 0.55 + 0.45 * Math.sin(a * 0.5 + 0.8) ** 2;
      });
    };
    return g;
  };

  B.decide = () => {
    const g = new THREE.Group();
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.2 : 0.46;
      star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    const eo = { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3 };
    const starMesh = mesh(new THREE.ExtrudeGeometry(star, eo), mat(0xffd36b, 1));
    starMesh.geometry.translate(0, 0, -0.04); g.add(starMesh);
    const sq = new THREE.Shape(); sq.moveTo(-1, -1); sq.lineTo(1, -1); sq.lineTo(1, 1); sq.lineTo(-1, 1); sq.closePath();
    const di = new THREE.Shape(); di.moveTo(0, 1.25); di.lineTo(1, 0); di.lineTo(0, -1.25); di.lineTo(-1, 0); di.closePath();
    const tr = new THREE.Shape(); tr.moveTo(0, 1.1); tr.lineTo(1.05, -0.8); tr.lineTo(-1.05, -0.8); tr.closePath();
    const others = [sq, di, tr].map((s, i) => {
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 });
      geo.translate(0, 0, -0.17); geo.scale(0.11, 0.11, 0.11);
      const m = mesh(geo, mat(0x7bb7ff, 0.75)); g.add(m); return m;
    });
    g.userData.update = (t) => {
      starMesh.rotation.y = t * 0.5; starMesh.scale.setScalar(1 + Math.sin(t * 1.4) * 0.05);
      others.forEach((m, i) => {
        const a = t * 0.3 + i * 2.094;
        m.position.set(Math.cos(a) * 0.72, Math.sin(a * 1.3) * 0.1 - 0.05, Math.sin(a) * 0.4);
        m.rotation.y = t * 0.4 + i; m.rotation.x = t * 0.2;
      });
    };
    return g;
  };

  B.practice = () => {
    const g = new THREE.Group();
    const bars = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const h = 0.22 + i * 0.1;
      const geo = new THREE.BoxGeometry(0.15, h, 0.15, 1, 1, 1); geo.translate(0, h / 2, 0);
      const m = mesh(geo, mat(i < 2 ? 0xffb26b : i < 4 ? 0x7fe7ff : 0x9dffcf, 0.9));
      m.position.set(-0.58 + i * 0.23, -0.4, 0); g.add(m); bars.push(m);
    }
    const pts = Array.from({ length: n }, (_, i) => new THREE.Vector3(-0.58 + i * 0.23, -0.4 + 0.3 + i * 0.1 + Math.sin(i * 1.7) * 0.03, 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(mesh(new THREE.TubeGeometry(curve, 50, 0.012, 8, false), mat(0xffffff, 0.95)));
    const head = mesh(new THREE.ConeGeometry(0.05, 0.12, 14), mat(0xffffff, 1));
    head.position.copy(pts[n - 1]).add(new THREE.Vector3(0.1, 0.08, 0)); head.rotation.z = -Math.PI / 2.6; g.add(head);
    g.userData.update = (t) => {
      bars.forEach((b, i) => { b.scale.y = 1 + Math.sin(t * 0.9 - i * 0.5) * 0.04; });
      g.rotation.y = Math.sin(t * 0.3) * 0.5;
    };
    return g;
  };

  B.custom = () => {
    const g = new THREE.Group();
    const N = 22, H = 1.0;
    const curveA = [], curveB = [];
    for (let i = 0; i <= N * 3; i++) {
      const u = i / (N * 3), a = u * Math.PI * 4.2, y = (u - 0.5) * H;
      curveA.push(new THREE.Vector3(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3));
      curveB.push(new THREE.Vector3(Math.cos(a + Math.PI) * 0.3, y, Math.sin(a + Math.PI) * 0.3));
    }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curveA), 140, 0.026, 8, false), mat(0x7fe7ff, 1)));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curveB), 140, 0.026, 8, false), mat(0xffb26b, 1)));
    const rg = new THREE.CylinderGeometry(0.01, 0.01, 0.6, 6); rg.rotateZ(Math.PI / 2);
    const rungs = new THREE.InstancedMesh(rg, mat(0xffffff, 0.6), N); disposables.push(rg, rungs);
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N, a = u * Math.PI * 4.2;
      d.position.set(0, (u - 0.5) * H, 0); d.rotation.set(0, -a, 0); d.updateMatrix(); rungs.setMatrixAt(i, d.matrix);
    }
    g.add(rungs);
    g.userData.update = (t) => { g.rotation.y = t * 0.35; };
    return g;
  };

  B.idle = () => {
    const g = new THREE.Group();
    const rings = [0.5, 0.41, 0.32].map((r, i) => {
      const m = mesh(new THREE.TorusGeometry(r, 0.011, 10, 80), mat(i === 1 ? 0xffd08a : 0x7fe7ff, 0.95));
      g.add(m); return m;
    });
    const core = mesh(new THREE.IcosahedronGeometry(0.13, 1), mat(0x9bf6ff, 0.9)); g.add(core);
    const wf = mesh(new THREE.IcosahedronGeometry(0.2, 1), mat(0xb8f5ff, 0.3)); wf.material.wireframe = true; g.add(wf);
    g.userData.update = (t) => {
      rings[0].rotation.set(t * 0.3, t * 0.2, 0); rings[1].rotation.set(t * -0.22, 0.6, t * 0.25); rings[2].rotation.set(1.1, t * 0.35, t * -0.15);
      core.rotation.y = t * 0.5; wf.rotation.set(t * 0.2, t * -0.3, 0);
      core.scale.setScalar(1 + Math.sin(t * 1.2) * 0.06);
    };
    return g;
  };

  /* ---------- manager ---------- */
  const label = new Map();
  let current = null, target = 0, shown = 0;
  let activeId = null;
  const labelAnchor = new THREE.Group(); labelAnchor.position.y = -0.7; group.add(labelAnchor);

  function setClaim(id) {
    if (!B[id]) id = 'custom';
    if (activeId === id) return;
    activeId = id;
    models.forEach((m) => { m.visible = false; });
    let m = models.get(id);
    if (!m) { m = B[id](); m.userData.id = id; models.set(id, m); group.add(m); }
    m.visible = true; current = m;
    label.forEach((l) => { l.visible = false; });
    let l = label.get(id);
    if (!l && CLAIM_LABELS[id]) { l = makeLabel(CLAIM_LABELS[id], { size: 46 }); l.scale.multiplyScalar(1.1); labelAnchor.add(l); label.set(id, l); }
    if (l) l.visible = true;
  }
  function update(t, dt, visible) {
    target = visible ? 1 : 0;
    shown += (target - shown) * (1 - Math.exp(-dt * 3.5));
    if (Math.abs(target - shown) < 0.002) shown = target;
    shared.uAmt.value = shown;
    shared.uTime.value = t;
    group.visible = shown > 0.003;
    if (!group.visible || !current) return;
    current.userData.update && current.userData.update(t, dt);
    const s = 0.9 + 0.1 * shown;
    group.scale.setScalar(s);
    group.position.y = centerY + (1 - shown) * -0.12 + Math.sin(t * 0.8) * 0.02;
    label.forEach((l) => { l.material.opacity = shown; });
  }
  function dispose() {
    disposables.forEach((d) => d.dispose && d.dispose());
    mats.forEach((m) => m.dispose());
    label.forEach((l) => { l.material.map.dispose(); l.material.dispose(); });
  }
  return { group, setClaim, update, dispose, get claim() { return activeId; } };
}
