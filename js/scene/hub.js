// The neuroscience lab hub: holo-table, benches, equipment, lighting, dust and shafts.
import * as THREE from './three.js';
import * as TX from './textures.js';
import { createHolo } from './holo.js';
import { createDust, createShafts } from './fx.js';
import { mulberry } from './noise.js';

const TABLE_TOP = 0.945;

export function createHub(ctx) {
  const { env, fancy } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02060a);
  scene.fog = new THREE.FogExp2(0x040a10, 0.038);
  scene.environment = env;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  const disposables = [];
  const textures = [];
  const track = (o) => { disposables.push(o); return o; };
  const trackTex = (t) => { textures.push(t); return t; };

  /* ------------------------------ materials ------------------------------ */
  const brushed = trackTex(TX.brushedMetal(512));
  brushed.repeat.set(2, 2);
  const mats = {
    metal: new THREE.MeshStandardMaterial({ color: 0xa3adb6, metalness: 1, roughness: 0.5, roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.35 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x353d45, metalness: 0.9, roughness: 0.48, roughnessMap: brushed }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0f12, metalness: 0, roughness: 0.82 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x0d1115, metalness: 0.1, roughness: 0.38 }),
    top: new THREE.MeshPhysicalMaterial({ color: 0x1b242b, metalness: 0.05, roughness: 0.34 }),
    body: new THREE.MeshStandardMaterial({ color: 0x1f272d, metalness: 0.6, roughness: 0.55, roughnessMap: brushed }),
    ceil: new THREE.MeshStandardMaterial({ color: 0x090d11, roughness: 0.9 }),
    cable: new THREE.MeshPhysicalMaterial({ color: 0x0a0c0f, roughness: 0.45, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(0x335566) }),
    skin: new THREE.MeshStandardMaterial({ color: 0xcfa58f, roughness: 0.6 }),
  };
  fancy(mats.top, { clearcoat: 0.55, clearcoatRoughness: 0.2 });
  fancy(mats.cable, { sheen: 0.8 });

  const floorMaps = TX.floorMaps(512);
  floorMaps.map.repeat.set(8, 7); floorMaps.rough.repeat.set(8, 7);
  trackTex(floorMaps.map); trackTex(floorMaps.rough);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorMaps.map, roughnessMap: floorMaps.rough, roughness: 1, metalness: 0.35, envMapIntensity: 1.4 });
  const wallTex = trackTex(TX.wallPanel(512)); wallTex.repeat.set(7, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallTex, bumpScale: 0.6, roughness: 0.7, metalness: 0.4, envMapIntensity: 0.7 });

  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.03, metalness: 0, ior: 1.5, thickness: 0.02, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false });
  const glassList = [glassMat];

  /* ------------------------------ lit registry ------------------------------ */
  const lits = [];
  const lit = (rank, apply, off = 0.05) => { const e = { rank, apply, cur: -1, off }; lits.push(e); return e; };
  const emissiveMat = (color, max, rank, off = 0.04, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x050709, emissive: new THREE.Color(color), emissiveIntensity: 0, roughness: 0.5, ...extra });
    lit(rank, (v) => { m.emissiveIntensity = v * max; }, off);
    return m;
  };

  /* ------------------------------ room shell ------------------------------ */
  const room = new THREE.Group(); scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -1); floor.receiveShadow = true; room.add(floor); track(floor.geometry);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), wallMat); back.position.set(0, 2, -5.1); back.receiveShadow = true; room.add(back); track(back.geometry);
  const wallSide = new THREE.PlaneGeometry(14, 4); track(wallSide);
  const wl = new THREE.Mesh(wallSide, wallMat); wl.position.set(-7, 2, -1); wl.rotation.y = Math.PI / 2; room.add(wl);
  const wr = new THREE.Mesh(wallSide, wallMat); wr.position.set(7, 2, -1); wr.rotation.y = -Math.PI / 2; room.add(wr);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), mats.ceil); ceil.position.set(0, 4, -1); ceil.rotation.x = Math.PI / 2; room.add(ceil); track(ceil.geometry);

  /* ------------------------------ holo-table ------------------------------ */
  const tableG = new THREE.Group(); scene.add(tableG);
  const prof = [[0, 0], [1.1, 0], [1.12, 0.02], [1.1, 0.05], [0.8, 0.1], [0.5, 0.17], [0.4, 0.3], [0.38, 0.55], [0.42, 0.72], [0.7, 0.8], [1.05, 0.86], [1.16, 0.9], [1.2, 0.94], [1.18, 0.98], [1.12, 0.995], [1.04, 0.985], [1.0, 0.96], [1.0, 0.92], [0, 0.92]].map(([x, y]) => new THREE.Vector2(x, y));
  const tableBody = new THREE.Mesh(track(new THREE.LatheGeometry(prof, 96)), mats.metal);
  tableBody.castShadow = true; tableBody.receiveShadow = true; tableG.add(tableBody);

  const ringMat = emissiveMat(0x4fe3ff, 1.5, 0, 0.35);
  const rimRing = new THREE.Mesh(track(new THREE.TorusGeometry(1.085, 0.011, 8, 160)), ringMat); rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 0.987; tableG.add(rimRing);
  const baseRing = new THREE.Mesh(track(new THREE.TorusGeometry(1.06, 0.01, 8, 160)), ringMat); baseRing.rotation.x = Math.PI / 2; baseRing.position.y = 0.065; tableG.add(baseRing);

  const glass = new THREE.Mesh(track(new THREE.CircleGeometry(1.0, 96)), new THREE.MeshPhysicalMaterial({
    color: 0x0a1a22, roughness: 0.5, metalness: 0, transparent: true, opacity: 0.75, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.9, thickness: 0.05, ior: 1.45 }));
  glass.rotation.x = -Math.PI / 2; glass.position.y = TABLE_TOP; glass.receiveShadow = true; tableG.add(glass);
  glassList.push(glass.material); glass.material.userData.tableGlass = true;

  // hologram scanline disc on the glass
  const discU = { uTime: { value: 0 }, uLevel: { value: 0.5 }, uColor: { value: new THREE.Color(0x4fe3ff) } };
  const disc = new THREE.Mesh(track(new THREE.CircleGeometry(0.985, 96)), new THREE.ShaderMaterial({
    uniforms: discU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uLevel; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float ang = atan(p.y, p.x);
        float ringsA = pow(0.5 + 0.5 * cos(r * 46.0 - uTime * 0.35), 18.0) * 0.55;
        float lines = 0.5 + 0.5 * sin(p.y * 150.0 + uTime * 0.6);
        float grid = max(smoothstep(0.03, 0.0, abs(fract(p.x * 7.0) - 0.5) - 0.47), smoothstep(0.03, 0.0, abs(fract(p.y * 7.0) - 0.5) - 0.47)) * 0.22;
        float sweep = pow(max(0.0, cos(ang - uTime * 0.55)), 14.0) * smoothstep(1.0, 0.1, r);
        float edge = smoothstep(0.94, 1.0, r) * 0.9;
        float core = smoothstep(0.35, 0.0, r) * 0.55;
        float a = (ringsA + grid + lines * 0.06 + sweep * 0.5 + edge + core) * smoothstep(1.0, 0.97, r);
        gl_FragColor = vec4(uColor * (0.9 + sweep), a * uLevel);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = TABLE_TOP + 0.004; disc.renderOrder = 1; tableG.add(disc);
  disc.material.toneMapped = true;

  // volumetric-looking beam
  const beamU = { uTime: { value: 0 }, uLevel: { value: 0.35 }, uColor: { value: new THREE.Color(0x4fe3ff) } };
  const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.72, 0.97, 1.7, 64, 1, true)), new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }',
    fragmentShader: /* glsl */`
      uniform float uTime, uLevel; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float h = vUv.y; float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
        float streak = 0.75 + 0.25 * sin(vUv.x * 60.0 + uTime * 0.3 + h * 3.0);
        float a = (pow(1.0 - h, 1.7) * 0.08 + f * pow(1.0 - h, 2.5) * 0.28) * streak;
        gl_FragColor = vec4(uColor, a * uLevel);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  beam.position.y = TABLE_TOP + 0.85; beam.renderOrder = 1; tableG.add(beam);

  const holo = createHolo({ baseY: TABLE_TOP + 0.02, centerY: 1.74 });
  holo.setClaim('idle');
  scene.add(holo.group);

  const holoLight = new THREE.PointLight(0x4fe3ff, 0, 7, 2); holoLight.position.set(0, 1.5, 0); scene.add(holoLight);

  // pedestal accent: three machined collar rings
  const collarGeo = track(new THREE.TorusGeometry(0.405, 0.022, 12, 64));
  for (const y of [0.34, 0.5]) { const c = new THREE.Mesh(collarGeo, mats.darkMetal); c.rotation.x = Math.PI / 2; c.position.y = y; c.castShadow = true; tableG.add(c); }

  /* ------------------------------ helpers ------------------------------ */
  const rbox = (w, h, d, r, m, seg = 3) => { const g = track(new THREE.RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))); return new THREE.Mesh(g, m); };
  const put = (o, x, y, z, parent) => { o.position.set(x, y, z); (parent || scene).add(o); return o; };

  function bench(w, d, x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const body = rbox(w, 0.84, d, 0.012, mats.body, 2); body.position.y = 0.42; body.castShadow = body.receiveShadow = true; g.add(body);
    const slab = rbox(w + 0.08, 0.06, d + 0.08, 0.02, mats.top, 3); slab.position.y = 0.87; slab.castShadow = slab.receiveShadow = true; g.add(slab);
    // drawer fronts + handles
    const n = Math.max(2, Math.round(w / 1.15));
    const dw = w / n - 0.06;
    for (let i = 0; i < n; i++) {
      const dx = -w / 2 + (i + 0.5) * (w / n);
      const front = rbox(dw, 0.52, 0.02, 0.008, mats.darkMetal, 2); front.position.set(dx, 0.5, d / 2 + 0.005); g.add(front);
      const hd = rbox(dw * 0.4, 0.016, 0.026, 0.006, mats.metal, 2); hd.position.set(dx, 0.69, d / 2 + 0.03); g.add(hd);
    }
    const kick = rbox(w - 0.04, 0.08, d - 0.06, 0.01, mats.rubber, 1); kick.position.y = 0.04; g.add(kick);
    return g;
  }

  function monitor(w, h, uiKind, rank, opts = {}) {
    const g = new THREE.Group();
    const ui = TX.monitorUI(uiKind, { w: 512, h: Math.round(512 * h / w), seed: opts.seed || 1, accent: opts.accent || '#5ee9ff' });
    trackTex(ui.tex);
    const bez = rbox(w + 0.06, h + 0.06, 0.05, 0.018, mats.plastic, 3); bez.castShadow = true; g.add(bez);
    const scr = new THREE.MeshStandardMaterial({ color: 0x020507, emissive: 0xffffff, emissiveMap: ui.tex, emissiveIntensity: 0, roughness: 0.25, metalness: 0 });
    lit(rank, (v) => { scr.emissiveIntensity = v * 1.35; }, 0.06);
    const s = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), scr); s.position.z = 0.0265; g.add(s);
    if (opts.stand !== false) {
      const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.03, opts.neck || 0.16, 14)), mats.darkMetal); neck.position.set(0, -h / 2 - (opts.neck || 0.16) / 2 + 0.01, -0.03); g.add(neck);
      const foot = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.18, 0.02, 40)), mats.darkMetal); foot.position.set(0, -h / 2 - (opts.neck || 0.16) + 0.005, -0.03); foot.castShadow = true; g.add(foot);
    }
    if (ui.animated) animated.push({ ui, every: 0.09, last: 0, rank });
    g.userData.ui = ui;
    return g;
  }
  const animated = [];

  /* ------------------------------ glassware ------------------------------ */
  const beakerOuter = [[0, 0], [0.056, 0], [0.066, 0.004], [0.07, 0.014], [0.07, 0.2], [0.074, 0.212], [0.07, 0.216]].map(([x, y]) => new THREE.Vector2(x, y));
  const beakerInner = [[0.07, 0.216], [0.066, 0.212], [0.066, 0.02], [0.058, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y));
  const beakerGeo = track(new THREE.LatheGeometry([...beakerOuter, ...beakerInner], 40));
  const flaskOuter = [[0, 0], [0.07, 0], [0.085, 0.006], [0.088, 0.018], [0.045, 0.14], [0.026, 0.19], [0.026, 0.24], [0.032, 0.25], [0.027, 0.255]].map(([x, y]) => new THREE.Vector2(x, y));
  const flaskInner = [[0.027, 0.255], [0.022, 0.25], [0.022, 0.19], [0.04, 0.14], [0.08, 0.028], [0.07, 0.014], [0, 0.014]].map(([x, y]) => new THREE.Vector2(x, y));
  const flaskGeo = track(new THREE.LatheGeometry([...flaskOuter, ...flaskInner], 40));
  const liqB = track(new THREE.LatheGeometry([[0, 0.012], [0.062, 0.012], [0.065, 0.1], [0.0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 32));
  const liqF = track(new THREE.LatheGeometry([[0, 0.016], [0.076, 0.016], [0.062, 0.06], [0.0, 0.06]].map(([x, y]) => new THREE.Vector2(x, y)), 32));
  function liquidMat(color, rank) {
    const m = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.1, transparent: true, opacity: 0.82, clearcoat: 1 });
    lit(rank, (v) => { m.emissiveIntensity = v * 0.55; }, 0.03);
    return m;
  }
  function beaker(x, y, z, color, rank, kind = 'beaker', parent) {
    const g = new THREE.Group();
    const isB = kind === 'beaker';
    const gl = new THREE.Mesh(isB ? beakerGeo : flaskGeo, glassMat); gl.renderOrder = 3; g.add(gl);
    const lq = new THREE.Mesh(isB ? liqB : liqF, liquidMat(color, rank)); g.add(lq);
    g.position.set(x, y, z); (parent || scene).add(g);
    return g;
  }

  /* ------------------------------ back bench + equipment ------------------------------ */
  const B0 = bench(10.4, 0.9, 0, -4.35, 0);
  const TOP = 0.9;
  const mA = monitor(1.1, 0.68, 'bars', 1, { seed: 3 }); put(mA, -2.7, TOP + 0.42, -4.4, scene); mA.rotation.y = 0.12;
  const mB = monitor(1.0, 0.62, 'dots', 0, { seed: 5, accent: '#ffb26b' }); put(mB, -1.3, TOP + 0.4, -4.45); mB.rotation.y = 0.05;
  const mC = monitor(1.3, 0.78, 'matrix', 2, { seed: 7 }); put(mC, 2.0, TOP + 0.46, -4.45); mC.rotation.y = -0.1;
  const mD = monitor(0.8, 0.5, 'rank', 1, { seed: 9, accent: '#9dffcf' }); put(mD, 3.35, TOP + 0.36, -4.4); mD.rotation.y = -0.18;

  // wall display
  const wallUI = TX.monitorUI('brain', { w: 640, h: 300, seed: 11 }); trackTex(wallUI.tex);
  const wallScr = new THREE.MeshStandardMaterial({ color: 0x020507, emissive: 0xffffff, emissiveMap: wallUI.tex, emissiveIntensity: 0, roughness: 0.3 });
  lit(2, (v) => { wallScr.emissiveIntensity = v * 1.25; }, 0.05);
  const wallDisp = new THREE.Mesh(track(new THREE.PlaneGeometry(3.4, 1.6)), wallScr); put(wallDisp, 0.4, 2.55, -5.05);
  const wallFrame = rbox(3.5, 1.7, 0.06, 0.03, mats.plastic, 2); put(wallFrame, 0.4, 2.55, -5.08);

  // oscilloscope
  const scope = new THREE.Group(); put(scope, 0.55, TOP, -4.3);
  const scBody = rbox(0.78, 0.42, 0.5, 0.03, mats.darkMetal, 3); scBody.position.y = 0.21; scBody.castShadow = true; scope.add(scBody);
  const scFace = rbox(0.74, 0.38, 0.02, 0.012, mats.plastic, 2); scFace.position.set(0, 0.21, 0.255); scope.add(scFace);
  const scr = TX.scopeScreen(); trackTex(scr.tex);
  const scrMat = new THREE.MeshStandardMaterial({ color: 0x010603, emissive: 0xffffff, emissiveMap: scr.tex, emissiveIntensity: 0, roughness: 0.3 });
  lit(0, (v) => { scrMat.emissiveIntensity = v * 1.4; }, 0.1);
  const scS = new THREE.Mesh(track(new THREE.PlaneGeometry(0.4, 0.27)), scrMat); scS.position.set(-0.11, 0.235, 0.267); scope.add(scS);
  const knobGeo = track(new THREE.CylinderGeometry(0.026, 0.03, 0.03, 24)); knobGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 6; i++) { const k = new THREE.Mesh(knobGeo, mats.metal); k.position.set(0.255, 0.33 - Math.floor(i / 2) * 0.08, 0.275); k.position.x += (i % 2) * 0.07; scope.add(k); }
  const ledMat = emissiveMat(0x59ff9a, 4, 0, 0.3);
  const led = new THREE.Mesh(track(new THREE.SphereGeometry(0.008, 10, 8)), ledMat); led.position.set(0.3, 0.1, 0.268); scope.add(led);
  scope.rotation.y = -0.08;
  animated.push({ ui: { redraw: scr.redraw }, every: 0.09, last: 0, rank: 0 });

  // beaker rack with beakers + flasks (left back)
  const rack = rbox(1.0, 0.03, 0.24, 0.01, mats.darkMetal, 2); put(rack, -4.1, TOP + 0.015, -4.3);
  beaker(-4.45, TOP + 0.03, -4.3, 0x34f0ff, 1); beaker(-4.18, TOP + 0.03, -4.3, 0xffb057, 1, 'flask'); beaker(-3.9, TOP + 0.03, -4.3, 0x7bff9a, 2); beaker(-3.65, TOP + 0.03, -4.3, 0xff6fa9, 3, 'flask');
  // desk lamp
  const lamp = new THREE.Group(); put(lamp, 4.4, TOP, -4.3);
  const lampBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 32)), mats.darkMetal); lampBase.position.y = 0.015; lamp.add(lampBase);
  const arm = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0.02, 0.35, 0), new THREE.Vector3(-0.15, 0.6, 0.05), new THREE.Vector3(-0.3, 0.55, 0.15)]), 24, 0.012, 8)), mats.metal); lamp.add(arm);
  const shade = new THREE.Mesh(track(new THREE.ConeGeometry(0.1, 0.14, 28, 1, true)), mats.darkMetal); shade.material.side; shade.position.set(-0.3, 0.52, 0.15); shade.rotation.x = Math.PI * 0.12; lamp.add(shade);
  const bulbMat = emissiveMat(0xffd7a0, 5, 1, 0.25);
  const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.03, 14, 10)), bulbMat); bulb.position.set(-0.3, 0.5, 0.15); lamp.add(bulb);

  // server rack (right back corner) with instanced LEDs
  const racks = new THREE.Group(); put(racks, 5.8, 0, -4.4);
  const rackBody = rbox(0.95, 2.1, 0.8, 0.02, mats.body, 2); rackBody.position.y = 1.05; rackBody.castShadow = true; racks.add(rackBody);
  const rackFaceTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#10161b'; g.fillRect(0, 0, 256, 512); for (let i = 0; i < 11; i++) { g.fillStyle = '#1a232a'; g.fillRect(10, 12 + i * 45, 236, 38); g.fillStyle = '#05080a'; for (let k = 0; k < 14; k++) g.fillRect(20 + k * 6, 20 + i * 45, 3, 22); g.fillStyle = '#2b3944'; g.fillRect(190, 20 + i * 45, 46, 6); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })(); trackTex(rackFaceTex);
  const rackFace = new THREE.Mesh(track(new THREE.PlaneGeometry(0.88, 1.98)), new THREE.MeshStandardMaterial({ map: rackFaceTex, roughness: 0.5, metalness: 0.5 })); rackFace.position.set(0, 1.05, 0.402); racks.add(rackFace);
  rackFace.rotation.y = 0; racks.rotation.y = -0.25;
  const LED_N = 66;
  const ledGeo = track(new THREE.BoxGeometry(0.014, 0.014, 0.01));
  const ledIM = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), LED_N);
  ledIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LED_N * 3), 3);
  const ledRnd = mulberry(5), ledData = [];
  const dm = new THREE.Object3D();
  for (let i = 0; i < LED_N; i++) {
    const row = i % 11, k = Math.floor(i / 11);
    dm.position.set(-0.32 + k * 0.045 + (k > 3 ? 0.35 : 0), 1.98 - row * 0.16 - 0.1 + 0.055, 0.408); dm.updateMatrix(); ledIM.setMatrixAt(i, dm.matrix);
    const col = [new THREE.Color(0x4dff9a), new THREE.Color(0x4fe3ff), new THREE.Color(0xffb057)][Math.floor(ledRnd() * 3)];
    ledData.push({ col, ph: ledRnd() * 6.28, sp: 0.4 + ledRnd() * 0.8, th: ledRnd() });
  }
  racks.add(ledIM);
  const ledState = { level: 0 };
  lit(2, (v) => { ledState.level = v; }, 0.0);

  /* ------------------------------ side benches ------------------------------ */
  const BL = bench(5.6, 0.85, -5.3, -1.0, Math.PI / 2);
  const BR = bench(5.6, 0.85, 5.3, -1.0, -Math.PI / 2);
  // left: animated trace monitor facing room, ruler drop, flasks
  const mT = monitor(1.0, 0.62, 'trace', 1, { seed: 13, accent: '#7bff9a' }); put(mT, -5.3, TOP + 0.4, -2.3); mT.rotation.y = Math.PI / 2 + 0.25;
  const rulerMat = new THREE.MeshStandardMaterial({ map: trackTex(TX.rulerTex()), roughness: 0.55 });
  const ruler = new THREE.Mesh(track(new THREE.BoxGeometry(0.035, 0.34, 0.006)), rulerMat); put(ruler, -5.25, TOP + 0.4, 0.2); ruler.rotation.y = Math.PI / 2 - 0.3;
  const stand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 10)), mats.metal); put(stand, -5.4, TOP + 0.31, 0.12);
  const standBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.11, 0.02, 28)), mats.darkMetal); put(standBase, -5.4, TOP + 0.01, 0.12);
  beaker(-5.2, TOP + 0.03, -0.55, 0x34f0ff, 1, 'beaker'); beaker(-5.45, TOP + 0.03, -0.75, 0xffb057, 2, 'flask'); beaker(-5.1, TOP + 0.03, -0.95, 0x9d7bff, 2, 'beaker');
  // petri dish stack
  const petri = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 32)), glassMat); for (let i = 0; i < 3; i++) { const p = petri.clone(); put(p, -5.35, TOP + 0.005 + i * 0.011, 0.9); p.renderOrder = 3; }

  // right: reaction pad, headphones, brain monitor
  const mR = monitor(1.05, 0.65, 'brain', 2, { seed: 17 }); put(mR, 5.35, TOP + 0.4, -1.7); mR.rotation.y = -Math.PI / 2 - 0.2;
  const padBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.17, 0.19, 0.04, 48)), mats.darkMetal); put(padBase, 5.0, TOP + 0.02, 0.3); padBase.castShadow = true;
  const padMat = emissiveMat(0x4fe3ff, 2.6, 0, 0.35, { roughness: 0.2 });
  const padCap = new THREE.Mesh(track(new THREE.SphereGeometry(0.125, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.2)), padMat); padCap.position.set(5.0, TOP + 0.04, 0.3); padCap.scale.y = 0.55; scene.add(padCap);
  // headphones on a stand
  const hp = new THREE.Group(); put(hp, 5.3, TOP, 1.2);
  const hpStandBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.11, 0.02, 28)), mats.darkMetal); hpStandBase.position.y = 0.01; hp.add(hpStandBase);
  const hpPost = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 10)), mats.metal); hpPost.position.y = 0.15; hp.add(hpPost);
  const band = new THREE.Mesh(track(new THREE.TorusGeometry(0.1, 0.012, 10, 40, Math.PI)), mats.darkMetal); band.position.y = 0.3; hp.add(band);
  for (const s of [-1, 1]) { const cup = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 28)), mats.rubber); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.1, 0.3, 0); hp.add(cup); }
  hp.rotation.y = -1.4;
  beaker(5.1, TOP + 0.03, -0.8, 0x7bff9a, 1); beaker(5.35, TOP + 0.03, -0.55, 0xff6fa9, 3, 'flask');

  /* ------------------------------ cables ------------------------------ */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cablePaths = [
    [V(-2.7, TOP + 0.1, -4.5), V(-2.6, TOP + 0.02, -4.7), V(-2.2, TOP - 0.2, -4.8), V(-1.6, 0.35, -4.9), V(-1.0, 0.04, -4.7), V(0.4, 0.03, -4.5)],
    [V(-1.3, TOP + 0.1, -4.5), V(-1.2, TOP, -4.75), V(-0.6, 0.5, -4.85), V(0.2, 0.05, -4.6), V(1.6, 0.03, -4.2)],
    [V(2.0, TOP + 0.1, -4.5), V(2.1, TOP, -4.8), V(2.8, 0.4, -4.9), V(3.8, 0.03, -4.7), V(5.4, 0.03, -4.2)],
    [V(0.6, TOP + 0.15, -4.4), V(0.9, TOP, -4.75), V(1.4, 0.45, -4.85), V(2.4, 0.03, -4.55), V(5.3, 0.03, -3.9)],
    [V(5.35, TOP + 0.1, -1.7), V(5.75, TOP, -1.9), V(6.1, 0.4, -2.2), V(6.1, 0.03, -3.4), V(5.8, 0.03, -4.2)],
    [V(-5.3, TOP + 0.1, -2.3), V(-5.75, TOP, -2.6), V(-6.2, 0.4, -3.0), V(-5.8, 0.03, -4.0), V(-4.5, 0.03, -4.5)],
  ];
  const cableGeos = [];
  cablePaths.forEach((pts, i) => {
    const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    for (let k = 0; k < 3; k++) {
      const off = new THREE.Vector3((k - 1) * 0.022, (k % 2) * 0.012, (k - 1) * 0.018);
      const cc = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(off)), false, 'catmullrom', 0.5);
      cableGeos.push(new THREE.TubeGeometry(cc, 56, 0.014 + (k === 1 ? 0.004 : 0), 8, false));
    }
  });
  const cablesMesh = new THREE.Mesh(track(THREE.mergeGeometries(cableGeos)), mats.cable); cableGeos.forEach((g) => g.dispose()); scene.add(cablesMesh);
  cablesMesh.receiveShadow = true;

  /* ------------------------------ strips, rank-3 panels, rank ring ------------------------------ */
  const stripMat = emissiveMat(0xb8e6ff, 3.2, 2, 0.05);
  const stripGeo = track(new THREE.BoxGeometry(2.4, 0.03, 0.12));
  for (const [x, z] of [[-3.2, -3.4], [3.2, -3.4], [0, -4.6], [-3.2, 0.3], [3.2, 0.3]]) { put(new THREE.Mesh(stripGeo, stripMat), x, 3.96, z); }
  const underMat = emissiveMat(0x4fe3ff, 2.4, 1, 0.05);
  const underGeo = track(new THREE.BoxGeometry(9.8, 0.012, 0.02)); put(new THREE.Mesh(underGeo, underMat), 0, 0.045, -3.88);
  put(new THREE.Mesh(track(new THREE.BoxGeometry(0.02, 0.012, 5.4)), underMat), -4.86, 0.045, -1.0);
  put(new THREE.Mesh(track(new THREE.BoxGeometry(0.02, 0.012, 5.4)), underMat), 4.86, 0.045, -1.0);

  const panels = new THREE.Group(); scene.add(panels);
  const panelDefs = [['bars', -0.9, '#5ee9ff'], ['dots', 0, '#ffb26b'], ['brain', 0.9, '#9dffcf']];
  const panelMats = [];
  panelDefs.forEach(([kind, ang, acc], i) => {
    const ui = TX.monitorUI(kind, { w: 512, h: 320, seed: 30 + i, accent: acc }); trackTex(ui.tex);
    const m = new THREE.MeshBasicMaterial({ map: ui.tex, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    panelMats.push(m);
    const p = new THREE.Mesh(track(new THREE.PlaneGeometry(1.15, 0.72)), m);
    const R = 2.9, a = Math.PI + ang * 0.7; // behind the table, arc facing the camera
    p.position.set(Math.sin(ang * 0.9) * R, 1.85 + (i === 1 ? 0.25 : 0), -Math.cos(ang * 0.9) * R * 0.78 - 0.4);
    p.lookAt(0, 1.7, 3); p.userData.y0 = p.position.y; p.userData.ph = i * 1.9;
    panels.add(p);
  });
  const rankRingU = { uLevel: { value: 0 }, uTime: discU.uTime };
  const rankRing = new THREE.Mesh(track(new THREE.RingGeometry(1.6, 1.64, 128)), new THREE.MeshBasicMaterial({ color: 0x4fe3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  rankRing.rotation.x = -Math.PI / 2; rankRing.position.y = 0.012; scene.add(rankRing);
  const rankRing2 = rankRing.clone(); rankRing2.geometry = track(new THREE.RingGeometry(1.8, 1.83, 128)); rankRing2.material = rankRing.material.clone(); scene.add(rankRing2);

  /* ------------------------------ lights ------------------------------ */
  const key = new THREE.SpotLight(0xfff0dc, 150, 16, 0.5, 0.85, 2); key.position.set(1.4, 3.8, 2.9); key.target.position.set(0, 0.9, 0); scene.add(key, key.target);
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4; key.shadow.camera.near = 1; key.shadow.camera.far = 12;
  const rim = new THREE.SpotLight(0x6fb8ff, 190, 14, 0.7, 0.9, 2); rim.position.set(-1.8, 3.4, -3.4); rim.target.position.set(0, 1.0, 0); scene.add(rim, rim.target);
  const warm = new THREE.PointLight(0xff9a54, 18, 9, 2); warm.position.set(-4.0, 1.9, -3.2); scene.add(warm);
  const cool = new THREE.PointLight(0x4fb4ff, 12, 9, 2); cool.position.set(4.3, 1.8, -2.0); scene.add(cool);
  const bounce = new THREE.HemisphereLight(0x3c5870, 0x0a0c0e, 0.55); scene.add(bounce);

  /* ------------------------------ fx ------------------------------ */
  const glowTex = trackTex(TX.glowSprite(128));
  const dust = createDust(260, { x: 12, y: 3.2, z: 9 }, glowTex); scene.add(dust.points);
  const shafts = createShafts(glowTex, 4); scene.add(shafts.group);

  /* ------------------------------ shadows flags ------------------------------ */
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && m.isShaderMaterial) { o.castShadow = false; o.receiveShadow = false; }
  });
  [mA, mB, mC, mD, mT, mR, scope, racks].forEach((g) => g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }));

  /* ------------------------------ state ------------------------------ */
  let rank = 0;
  let tint = 0; // 0..1 celebration swell
  const base = { key: key.intensity, rim: rim.intensity, holo: 0 };
  const cc = new THREE.Color();

  function setRank(r) { rank = Math.max(0, Math.min(3, r | 0)); }

  function setQuality(q) {
    const hi = q === 'high', shadows = q !== 'low';
    glassList.forEach((m) => {
      if (m.userData.tableGlass) { m.transmission = hi ? 0.55 : 0; m.transparent = true; m.opacity = hi ? 0.9 : 0.75; }
      else { m.transmission = hi ? 1 : 0; m.opacity = hi ? 1 : 0.22; m.depthWrite = !hi ? false : true; m.transparent = !hi; }
      m.needsUpdate = true;
    });
    key.castShadow = shadows;
    key.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    shafts.group.children.forEach((c, i) => { c.visible = q === 'low' ? i < 2 : true; });
    dust.points.visible = true;
    dust.geo.setDrawRange(0, q === 'low' ? 70 : q === 'mid' ? 150 : 260);
    scene.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true; });
    // only the heavy structural meshes cast shadows
    scene.traverse((o) => { if (o.isMesh && o.castShadow && o.material.isShaderMaterial) o.castShadow = false; });
  }

  const _cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  function cameraGoal(mode, t, still, k) {
    const drift = still ? 0 : 1;
    if (mode === 'planning') {
      _cam.pos.set(Math.sin(t * 0.11) * 0.18 * drift, 2.1 + Math.sin(t * 0.09) * 0.06 * drift, 4.7 * k);
      _cam.look.set(0, 1.45, 0);
    } else if (mode === 'results') {
      const a = (still ? 0.2 : t * 0.1) + 0.2;
      _cam.pos.set(Math.sin(a) * 5.4 * k, 2.3, Math.cos(a) * 5.4 * k);
      _cam.look.set(0, 1.3, 0);
    } else { // hub
      _cam.pos.set(Math.sin(t * 0.07) * 0.5 * drift, 2.25 + Math.sin(t * 0.09) * 0.1 * drift, 5.6 * k + Math.sin(t * 0.05) * 0.3 * drift);
      _cam.look.set(Math.sin(t * 0.06) * 0.2 * drift, 1.3, -0.6);
    }
    return _cam;
  }

  let frameN = 0;
  function update(t, dt, s) {
    frameN++;
    // lit equipment fade
    for (const e of lits) {
      const goal = rank >= e.rank ? 1 : e.off;
      if (e.cur < 0) e.cur = goal; else e.cur += (goal - e.cur) * (1 - Math.exp(-dt * 2.2));
      if (Math.abs(e.cur - goal) < 0.002) e.cur = goal;
      e.apply(e.cur);
    }
    const planning = s.mode === 'planning';
    holo.update(s.still ? 0 : t, dt, true);
    const holoLvl = 0.35 + rank * 0.12 + (planning ? 0.25 : 0);
    discU.uTime.value = s.still ? 0 : t;
    discU.uLevel.value = 0.4 + 0.08 * rank + tint * 0.2;
    beamU.uTime.value = s.still ? 0 : t;
    beamU.uLevel.value += ((planning ? 1.0 : 0.5) + tint * 0.25 - beamU.uLevel.value) * (1 - Math.exp(-dt * 3));
    holoLight.intensity = (planning ? 4 : 2) * (0.6 + 0.4 * (rank / 3 + 0.4)) + tint * 5;
    // key/rim swell during celebrate
    key.intensity = base.key * (1 + tint * 0.28);
    rim.intensity = base.rim * (1 + tint * 0.45);
    dust.mat.uniforms.uTime.value = s.still ? 0 : t;
    dust.mat.uniforms.uMotion.value = s.still ? 0 : 1;
    shafts.update(s.still ? 0 : t, s.still ? 0 : 1);
    // rank 3 panels + floor rings
    const p3 = rank >= 3 ? 0.9 : 0;
    panelMats.forEach((m, i) => { m.opacity += (p3 - m.opacity) * (1 - Math.exp(-dt * 2)); });
    panels.children.forEach((p) => { p.position.y = p.userData.y0 + (s.still ? 0 : Math.sin(t * 0.5 + p.userData.ph) * 0.04); });
    panels.visible = panelMats[0].opacity > 0.01;
    const rr = rank >= 3 ? 0.55 : rank >= 2 ? 0.25 : 0;
    rankRing.material.opacity += (rr - rankRing.material.opacity) * (1 - Math.exp(-dt * 2));
    rankRing2.material.opacity += ((rank >= 3 ? 0.35 : 0) - rankRing2.material.opacity) * (1 - Math.exp(-dt * 2));
    // animated canvases (throttled)
    if (!s.still) {
      for (const a of animated) {
        if (rank < a.rank) continue;
        if (t - a.last > a.every) { a.last = t; a.ui.redraw && a.ui.redraw(t); }
      }
    }
    // LEDs
    if (frameN % 4 === 0 || s.force) {
      const lvl = ledState.level;
      for (let i = 0; i < LED_N; i++) {
        const d = ledData[i];
        const w = 0.55 + 0.45 * Math.sin(s.still ? d.ph : t * d.sp + d.ph);
        const on = d.th < 0.72 ? 1 : (w > 0.5 ? 1 : 0.15);
        cc.copy(d.col).multiplyScalar((0.06 + lvl * (0.5 + 0.5 * w)) * (on * 0.9 + 0.1) * 1.3);
        ledIM.setColorAt(i, cc);
      }
      ledIM.instanceColor.needsUpdate = true;
    }
  }

  function setTint(v) { tint = v; }
  function resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }

  function dispose() {
    holo.dispose(); dust.mat.dispose(); dust.geo.dispose(); shafts.dispose();
    disposables.forEach((d) => d.dispose && d.dispose());
    textures.forEach((t) => t.dispose());
    scene.traverse((o) => { if (o.isMesh && o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
    Object.values(mats).forEach((m) => m.dispose());
  }

  return { scene, camera, update, setRank, setQuality, setClaim: (id) => holo.setClaim(id), cameraGoal, setTint, resize, dispose, key, rim, get rank() { return rank; } };
}
