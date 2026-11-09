// Sculpted stylised hand: extruded palm, tapered capsule fingers with articulated joints, thumb, wrist.
import * as THREE from './three.js';

const FINGERS = [
  { name: 'pinky',  x: -0.33, y: 0.83, seg: [0.2, 0.15, 0.13],  r: 0.052, rotZ: 0.12 },
  { name: 'ring',   x: -0.115, y: 0.9, seg: [0.27, 0.19, 0.15], r: 0.058, rotZ: 0.04 },
  { name: 'middle', x: 0.1,  y: 0.92, seg: [0.3, 0.21, 0.16],   r: 0.06,  rotZ: -0.02 },
  { name: 'index',  x: 0.31, y: 0.88, seg: [0.26, 0.19, 0.15],  r: 0.058, rotZ: -0.1 },
];

function palmGeometry() {
  const pts = [
    [-0.29, 0.0], [-0.39, 0.22], [-0.44, 0.5], [-0.41, 0.8], [-0.2, 0.9], [0.0, 0.93],
    [0.2, 0.93], [0.4, 0.88], [0.46, 0.62], [0.5, 0.36], [0.4, 0.1], [0.27, 0.0], [0.0, -0.04],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const shape = new THREE.Shape(curve.getPoints(60).map((p) => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 6, curveSegments: 1, steps: 1 });
  g.translate(0, 0, -0.05);
  g.computeVertexNormals();
  return g;
}

export function buildHand(material, { nails = true, nailMaterial = null } = {}) {
  const root = new THREE.Group();
  const geos = [];
  const add = (geo) => { geos.push(geo); return geo; };
  const palm = new THREE.Mesh(add(palmGeometry()), material);
  palm.castShadow = true;
  root.add(palm);

  const wrist = new THREE.Mesh(add(new THREE.CylinderGeometry(0.255, 0.225, 0.8, 28, 1, false)), material);
  wrist.position.y = -0.36; wrist.scale.z = 0.62; wrist.castShadow = true;
  root.add(wrist);

  const joints = [];
  const makeFinger = (x, y, seg, r, rotZ, rotBase = 0) => {
    const f = new THREE.Group();
    f.position.set(x, y, 0); f.rotation.z = rotZ;
    const chain = [];
    let parent = f;
    seg.forEach((len, i) => {
      const jr = r * (1 - i * 0.11);
      const j = new THREE.Group();
      if (i) j.position.y = seg[i - 1];
      parent.add(j);
      const m = new THREE.Mesh(add(new THREE.CapsuleGeometry(jr, len - jr * 0.6, 6, 16)), material);
      m.position.y = len / 2 - jr * 0.15; m.castShadow = true; m.scale.z = 0.92;
      j.add(m);
      if (nails && i === seg.length - 1) {
        const n = new THREE.Mesh(add(new THREE.SphereGeometry(jr * 0.82, 14, 10)), nailMaterial || material);
        n.scale.set(0.9, 0.9, 0.28); n.position.set(0, len - jr * 0.85, -jr * 0.78);
        j.add(n);
      }
      chain.push(j); parent = j;
    });
    root.add(f);
    joints.push(chain);
    return f;
  };
  FINGERS.forEach((d) => makeFinger(d.x, d.y, d.seg, d.r, d.rotZ));
  // Thumb: from the lower right of the palm, angled outward
  const thumb = makeFinger(0.4, 0.2, [0.28, 0.21, 0.17], 0.068, -0.95);
  thumb.rotation.y = -0.35;

  // Pose: 0 = relaxed open, 1 = fully curled. Natural resting curl is applied.
  const rest = [0.1, 0.18, 0.12];
  const maxCurl = [1.25, 1.4, 1.0];
  function setCurl(fingerIdx, amt) {
    const ch = joints[fingerIdx];
    ch.forEach((j, i) => { j.rotation.x = (rest[i] + (maxCurl[i] - rest[i]) * amt) * (fingerIdx === 4 ? 0.7 : 1); });
  }
  for (let i = 0; i < joints.length; i++) setCurl(i, 0);
  return {
    root, joints, setCurl,
    setAll(amt) { for (let i = 0; i < joints.length; i++) setCurl(i, amt); },
    dispose() { geos.forEach((g) => g.dispose()); },
    indexTip: () => joints[3][2],
  };
}
