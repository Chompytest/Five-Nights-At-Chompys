// ============================================================================
// characters.js — the four killers. Each is a Group whose contents are either
// a procedural placeholder (distinct silhouette + glowing eyes so they read
// in darkness and on grainy feeds) or your real .glb, swapped automatically
// via the ASSETS registry. Positioning/AI never touches the mesh internals,
// so swapping models changes nothing about behavior.
// ============================================================================
import * as THREE from 'three';
import { ASSETS } from './config.js';
import { PROC_TEXTURES, rand } from './util.js';
import { ROOMS, tryLoadGLB } from './world.js';

const eyeMat = (color) => new THREE.MeshBasicMaterial({ color });

function addEyes(g, color, x, y, z, r = 0.05, gap = 0.16) {
  const l = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), eyeMat(color));
  l.position.set(x - gap / 2, y, z);
  const rr = l.clone(); rr.position.x = x + gap / 2;
  g.add(l, rr);
  return [l, rr];
}

// ---------------------------------------------------------------------------
// fallback builders — keyed by ASSETS.models[key].fallback
// ---------------------------------------------------------------------------
function buildChompy() { // 'blob' — bulky, wide, huge mouth
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x2c4a28, roughness: 0.9 });
  const belly = new THREE.MeshStandardMaterial({ color: 0x50663a, roughness: 0.95 });
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 12), skin);
  lower.scale.set(1, 0.85, 0.9); lower.position.y = 0.5; g.add(lower);
  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), belly);
  mid.scale.set(1, 0.9, 0.85); mid.position.y = 1.05; g.add(mid);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), skin);
  head.position.y = 1.62; g.add(head);
  // gaping jaw
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin);
  jaw.position.set(0, 1.5, 0.1); jaw.rotation.x = 0.75; g.add(jaw);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x0d0304 }));
  mouth.scale.set(1, 0.55, 0.8); mouth.position.set(0, 1.52, 0.16); g.add(mouth);
  for (let i = 0; i < 7; i++) { // teeth, upper row
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.09, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.4 }));
    const a = -0.65 + i * 0.22;
    tooth.position.set(Math.sin(a) * 0.25, 1.62, 0.12 + Math.cos(a) * 0.22);
    tooth.rotation.x = Math.PI; g.add(tooth);
  }
  addEyes(g, 0xffa245, 0, 1.78, 0.28, 0.05, 0.2);
  [[-0.5], [0.5]].forEach(([x]) => { // stubby arms
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8), skin);
    arm.position.set(x, 1.0, 0); arm.rotation.z = x > 0 ? -0.5 : 0.5; g.add(arm);
  });
  // husk collar
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x687a3a, roughness: 1 }));
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.34, 1.32, Math.sin(a) * 0.3);
    leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    g.add(leaf);
  }
  return g;
}

function buildCob(tint = 0xd8c24a, hollow = false) { // 'cylinder' — tall, thin corn husk
  const g = new THREE.Group();
  const kern = new THREE.MeshStandardMaterial({ map: PROC_TEXTURES.kernels(tint), roughness: 0.75 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.25, 6, 12), kern);
  body.position.y = 1.1; g.add(body);
  const green = new THREE.MeshStandardMaterial({ color: hollow ? 0x6a6242 : 0x4a6a30, roughness: 1 });
  for (let i = 0; i < 5; i++) { // husk leaves peeling from the base
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 5), green);
    const a = (i / 5) * Math.PI * 2 + 0.4;
    leaf.position.set(Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22);
    leaf.rotation.set(Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75);
    if (hollow && i === 2) leaf.visible = false; // golden is damaged
    g.add(leaf);
  }
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), green);
  tuft.position.y = 2.0; tuft.rotation.z = 0.25; g.add(tuft);
  // face — big hollow eyes + crooked grin
  const eyeHole = new THREE.MeshBasicMaterial({ color: 0x050505 });
  [[-0.11], [0.11]].forEach(([x]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeHole);
    e.position.set(x, 1.62, 0.21); e.scale.z = 0.4; g.add(e);
  });
  if (!hollow) addEyes(g, 0xfff2b0, 0, 1.62, 0.25, 0.018, 0.22);
  const grin = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 12, Math.PI * 0.9), eyeHole);
  grin.position.set(0, 1.44, 0.24); grin.rotation.set(0.2, 0, Math.PI * 1.06); g.add(grin);
  return g;
}

function buildBoo() { // 'sphere' — small pale thing from the yard
  const g = new THREE.Group();
  const pale = new THREE.MeshStandardMaterial({
    color: 0xe8e4da, roughness: 0.55, emissive: 0x9a948a, emissiveIntensity: 0.3,
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), pale);
  head.position.y = 1.08; head.scale.y = 1.1; g.add(head);
  // long hair cap
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 1 }));
  hair.position.y = 1.12; hair.rotation.x = -0.35; g.add(hair);
  const strands = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 1, side: THREE.DoubleSide }));
  strands.position.set(0, 0.85, -0.1); strands.rotation.x = 3.05; g.add(strands);
  // gown
  const gown = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 10, 1),
    new THREE.MeshStandardMaterial({ color: 0xd6d0c2, roughness: 0.9 }));
  gown.position.y = 0.48; g.add(gown);
  // hollow eyes, no glow — she reads by her paleness
  const eyeHole = new THREE.MeshBasicMaterial({ color: 0x030303 });
  [[-0.085], [0.085]].forEach(([x]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeHole);
    e.position.set(x, 1.12, 0.19); e.scale.z = 0.35; g.add(e);
  });
  [[-0.2], [0.2]].forEach(([x]) => {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), pale);
    hand.position.set(x, 0.62, 0.14); g.add(hand);
  });
  g.userData.float = true; // bobs when idle
  return g;
}

function buildGoldenCob() {
  const g = buildCob(0xc9a53a, true);
  g.traverse(o => {
    if (o.material && o.material.color && o.material.emissive !== undefined) {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0x2a2008);
      o.material.emissiveIntensity = 0.5;
    }
  });
  // seated, slumped
  g.scale.setScalar(0.78);
  g.rotation.x = 0.42;
  g.userData.slumped = true;
  return g;
}

const FALLBACK_BUILDERS = {
  chompy: buildChompy,
  cob: () => buildCob(0xd8c24a, false),
  boo: buildBoo,
  goldenCob: buildGoldenCob,
};

// ---------------------------------------------------------------------------
// character manager
// ---------------------------------------------------------------------------
export function buildCharacters(scene) {
  const chars = {};
  for (const key of ['chompy', 'cob', 'boo', 'goldenCob']) {
    const def = ASSETS.models[key];
    const group = new THREE.Group();
    const fb = FALLBACK_BUILDERS[key]();
    group.add(fb);
    group.visible = false;
    scene.add(group);
    const ch = { key, group, mixer: null, room: null, idleSeed: Math.random() * 10, baseRotX: fb.rotation.x || 0 };
    tryLoadGLB(def, group, fb, key, (model, mixer) => { ch.mixer = mixer; });
    chars[key] = ch;
  }
  return chars;
}

const _tmp = new THREE.Vector3();
export function placeInRoom(ch, roomKey, faceTowards) {
  ch.room = roomKey;
  if (!roomKey) { ch.group.visible = false; return; }
  const room = ROOMS[roomKey];
  ch.group.position.copy(room.anchor);
  // small pose jitter so feeds never show the exact same frame twice
  ch.group.position.x += rand(-0.25, 0.25);
  ch.group.position.z += rand(-0.25, 0.25);
  if (faceTowards) {
    _tmp.copy(faceTowards); _tmp.y = ch.group.position.y;
    ch.group.lookAt(_tmp);
    ch.group.rotation.y += rand(-0.35, 0.35);
  } else {
    ch.group.rotation.y = rand(0, Math.PI * 2);
  }
  ch.group.visible = true;
}

export function hideChar(ch) { ch.room = null; ch.group.visible = false; }

// idle motion: breathing sway; Boo floats
export function updateCharacters(chars, dt, t) {
  for (const key of Object.keys(chars)) {
    const ch = chars[key];
    if (!ch.group.visible) continue;
    if (ch.mixer) ch.mixer.update(dt);
    const s = ch.idleSeed;
    const inner = ch.group.children[0];
    if (!inner) continue;
    inner.rotation.z = Math.sin(t * 0.9 + s) * 0.018;
    if (inner.userData?.float) inner.position.y = 0.06 + Math.sin(t * 1.7 + s) * 0.05;
    else if (!inner.userData?.slumped) inner.position.y = Math.abs(Math.sin(t * 1.1 + s)) * 0.012;
  }
}

// ---------------------------------------------------------------------------
// jumpscare: fling the killer into the player's face
// ---------------------------------------------------------------------------
export function startJumpscare(ch, camera) {
  const cam = camera;
  const dir = cam.getWorldDirection(new THREE.Vector3());
  const start = cam.position.clone().add(dir.clone().multiplyScalar(2.6));
  start.y = 0;
  const end = cam.position.clone().add(dir.clone().multiplyScalar(0.55));
  end.y = Math.max(0, cam.position.y - 1.15);
  ch.group.visible = true;
  ch.group.position.copy(start);
  ch.group.lookAt(cam.position.x, 0, cam.position.z);
  return { ch, start, end, t: 0, dur: 0.42, cam };
}

export function updateJumpscare(js, dt) {
  js.t += dt;
  const k = Math.min(1, js.t / js.dur);
  const e = k * k * (3 - 2 * k);
  js.ch.group.position.lerpVectors(js.start, js.end, e);
  const shake = k * 0.09;
  js.ch.group.rotation.z = Math.sin(js.t * 70) * shake;
  js.ch.group.rotation.y += Math.sin(js.t * 55) * shake * 0.4;
  return k >= 1;
}
