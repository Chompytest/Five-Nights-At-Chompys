// ============================================================================
// world.js — the house: floorplan, furniture, lighting, den interactables,
// dust, ambient FX. Furniture goes through the ASSETS registry: real .glb
// files replace the procedural silhouettes automatically when present.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS } from './config.js';
import { loadTexture, PROC_TEXTURES, rand, clamp, lerp } from './util.js';

export const CEIL_H = 2.6;
const WALL_T = 0.14;

// ---------------------------------------------------------------------------
// Rooms + character anchor points (where a character stands when "in" a room)
// ---------------------------------------------------------------------------
export const ROOMS = {
  garage:   { anchor: new THREE.Vector3(-3.0, 0, 4.6),  cam: 'garage',   label: 'GARAGE' },
  kitchen:  { anchor: new THREE.Vector3(-7.3, 0, 4.7),  cam: 'kitchen',  label: 'KITCHEN' },
  living:   { anchor: new THREE.Vector3(-7.0, 0, 0.4),  cam: 'living',   label: 'LIVING ROOM' },
  hallway:  { anchor: new THREE.Vector3(-4.0, 0, 0.0),  cam: 'hallway',  label: 'HALLWAY' },
  doorstep: { anchor: new THREE.Vector3(-2.85, 0, 0.0), cam: 'hallway',  label: 'HALLWAY' },
  byFar:    { anchor: new THREE.Vector3(6.2, 0, 1.2),   cam: 'backyard', label: 'BACKYARD' },
  byNear:   { anchor: new THREE.Vector3(3.9, 0, 0.6),   cam: 'backyard', label: 'BACKYARD' },
  window:   { anchor: new THREE.Vector3(2.62, 0.42, 0.05), cam: null,    label: 'WINDOW' },
  den:      { anchor: new THREE.Vector3(-1.42, 0.16, -1.38), cam: null,  label: 'DEN' },
};

export const CAM_DEFS = [
  { id: 'living',   label: 'CAM 1 — LIVING ROOM', pos: [-8.9, 2.35, -2.5], look: [-6.5, 0.8, 0.6], fov: 62 },
  { id: 'kitchen',  label: 'CAM 2 — KITCHEN',     pos: [-8.9, 2.35, 6.1],  look: [-6.8, 0.7, 4.2], fov: 62 },
  { id: 'hallway',  label: 'CAM 3 — HALLWAY',     pos: [-4.95, 2.3, 0.68], look: [-2.55, 1.0, -0.1], fov: 58 },
  { id: 'garage',   label: 'CAM 4 — GARAGE',      pos: [-4.95, 2.5, 6.1],  look: [-2.7, 0.7, 4.3], fov: 68 },
  { id: 'backyard', label: 'CAM 5 — DOORBELL',    pos: [2.42, 1.62, 2.25], look: [5.6, 0.5, 0.2],  fov: 74, ir: true },
];

export function buildWorld(scene) {
  const T = {};
  for (const [key, url] of Object.entries(ASSETS.textures)) T[key] = loadTexture(key, url);

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: T.wall, roughness: 0.95 }),
    floorWood: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.8 }),
    carpet: new THREE.MeshStandardMaterial({ map: T.carpet, roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ map: T.ceiling, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.85 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x7d838c, roughness: 0.4, metalness: 0.7 }),
    curtain: new THREE.MeshStandardMaterial({ map: T.curtain, roughness: 1, side: THREE.DoubleSide }),
  };

  const W = {
    scene, mats: M, interactables: [], flickerLights: [],
    door: null, doorLEDs: null, curtain: null, curtainLEDs: null,
    deskTablet: null, dust: null, moon: null, denLamp: null, hallBulb: null,
    lightning: { t: rand(20, 45), active: 0 },
  };

  const root = new THREE.Group(); scene.add(root); W.root = root;

  // ---------- helpers ----------
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); root.add(m); return m;
  };
  // wall segment along x or z
  function wall(x1, z1, x2, z2, h = CEIL_H, mat = M.wall, y0 = 0) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, WALL_T), mat);
    m.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    root.add(m); return m;
  }
  function floorRect(x1, z1, x2, z2, mat, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1), 0.08, Math.abs(z2 - z1)), mat);
    m.position.set((x1 + x2) / 2, y - 0.04, (z1 + z2) / 2);
    m.receiveShadow = true; root.add(m); return m;
  }
  function ceilRect(x1, z1, x2, z2, h = CEIL_H) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1), 0.06, Math.abs(z2 - z1)), M.ceiling);
    m.position.set((x1 + x2) / 2, h + 0.03, (z1 + z2) / 2);
    root.add(m); return m;
  }

  // ---------- floors ----------
  floorRect(-2.2, -2.4, 2.2, 2.4, M.carpet);          // den
  floorRect(-5.2, -0.8, -2.2, 0.8, M.floorWood);      // hallway
  floorRect(-9.2, -2.8, -5.2, 2.8, M.floorWood);      // living
  floorRect(-9.2, 2.8, -5.2, 6.4, M.floorWood);       // kitchen
  floorRect(-5.2, 2.8, -0.8, 6.4, M.concrete);        // garage
  floorRect(2.2, -4.5, 9.5, 4.5, M.grass, -0.02);     // backyard
  // ceilings
  ceilRect(-2.2, -2.4, 2.2, 2.4); ceilRect(-5.2, -0.8, -2.2, 0.8);
  ceilRect(-9.2, -2.8, -5.2, 2.8); ceilRect(-9.2, 2.8, -5.2, 6.4);
  ceilRect(-5.2, 2.8, -0.8, 6.4, 2.8);

  // ---------- den walls ----------
  wall(-2.2, -2.4, 2.2, -2.4);                        // front (desk wall)
  wall(-2.2, 2.4, 2.2, 2.4);                          // back
  wall(-2.2, -2.4, -2.2, -0.45);                      // left, front of door
  wall(-2.2, 0.45, -2.2, 2.4);                        // left, back of door
  wall(-2.2, -0.45, -2.2, 0.45, 0.55, M.wall, 2.05);  // door lintel
  // right wall w/ window hole (window z -0.7..0.7, y 0.9..2.1)
  wall(2.2, -2.4, 2.2, -0.7); wall(2.2, 0.7, 2.2, 2.4);
  wall(2.2, -0.7, 2.2, 0.7, 0.9, M.wall, 0);          // under window
  wall(2.2, -0.7, 2.2, 0.7, CEIL_H - 2.1, M.wall, 2.1); // over window

  // ---------- hallway walls ----------
  wall(-5.2, -0.8, -2.2, -0.8);
  wall(-5.2, 0.8, -2.2, 0.8);

  // ---------- living room ----------
  wall(-9.2, -2.8, -5.2, -2.8);                       // south
  wall(-5.2, -2.8, -5.2, -0.8);                       // east, south of hall opening
  wall(-5.2, 0.8, -5.2, 2.8);                         // east, north of hall opening
  // west wall w/ window (z -1.6..-0.2, y 0.9..2.1)
  wall(-9.2, -2.8, -9.2, -1.6); wall(-9.2, -0.2, -9.2, 2.8);
  wall(-9.2, -1.6, -9.2, -0.2, 0.9, M.wall, 0);
  wall(-9.2, -1.6, -9.2, -0.2, CEIL_H - 2.1, M.wall, 2.1);
  // north wall with kitchen opening x -8.2..-6.8
  wall(-9.2, 2.8, -8.2, 2.8); wall(-6.8, 2.8, -5.2, 2.8);

  // ---------- kitchen ----------
  wall(-9.2, 2.8, -9.2, 6.4);                         // west
  wall(-9.2, 6.4, -5.2, 6.4);                         // north
  // east wall with garage opening z 3.6..4.8
  wall(-5.2, 2.8, -5.2, 3.6); wall(-5.2, 4.8, -5.2, 6.4);

  // ---------- garage ----------
  wall(-5.2, 6.4, -0.8, 6.4, 2.8);
  wall(-0.8, 2.8, -0.8, 6.4, 2.8);
  wall(-0.8, 2.8, -2.2, 2.8, 2.8); // garage south wall east of den... den back wall handles rest
  wall(-5.2, 2.8, -2.2, 2.8, 2.8); // garage south wall (hall/den north side)

  // ---------- backyard ----------
  // house exterior east face (den right wall is it); fence
  for (let z = -4.5; z <= 4.5; z += 0.34) {
    const p = box(0.06, 1.5, 0.28, M.wood, 9.3, 0.75, z); p.rotation.x = rand(-0.02, 0.02);
  }
  for (let x = 2.6; x <= 9.2; x += 0.34) {
    box(0.28, 1.5, 0.06, M.wood, x, 0.75, -4.55);
    box(0.28, 1.5, 0.06, M.wood, x, 0.75, 4.55);
  }
  // bushes
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.4, 0.75), 7, 6),
      new THREE.MeshStandardMaterial({ color: 0x101c10, roughness: 1 }));
    b.position.set(rand(3, 9), 0.35, rand(-4, 4));
    b.scale.y = 0.75; root.add(b);
  }
  place('swingset', 6.3, 0, -1.05, Math.PI * 0.14, buildSwingset);

  // moon disc
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }));
  moonDisc.position.set(26, 14, -9); moonDisc.lookAt(0, 1, 0); root.add(moonDisc);

  // ==========================================================================
  // FURNITURE — via ASSETS registry with procedural fallbacks
  // ==========================================================================
  function place(key, x, y, z, ry, builder) {
    const def = ASSETS.models[key];
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = ry || 0;
    const fb = builder(M);
    g.add(fb); root.add(g);
    tryLoadGLB(def, g, fb, key);
    return g;
  }

  // ---- den ----
  const desk = place('desk', 0, 0, -1.72, 0, buildDesk);
  place('lamp', -0.62, 0.79, -1.86, 0.3, buildDeskLamp);
  const tabletProp = buildTabletProp(M);
  tabletProp.position.set(0.28, 0.815, -1.62); tabletProp.rotation.set(-0.18, -0.12, 0);
  root.add(tabletProp);
  tabletProp.traverse(o => { o.userData.action = 'tablet'; });
  W.interactables.push(tabletProp); W.deskTablet = tabletProp;
  const tabPad = buildHitPad(0.52, 0.30, 0.44, 'tablet');
  tabPad.position.set(0.28, 0.87, -1.62);
  root.add(tabPad); W.interactables.push(tabPad);

  place('tv', -1.55, 0, -1.95, 0.7, buildTV);
  const armchair = place('armchair', -1.42, 0, -1.30, 0.9, buildArmchair);
  place('couch', 0.75, 0, 2.05, Math.PI, buildCouch);
  place('shelf', 1.85, 0, -2.3, 0, buildShelf);
  // rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 18),
    new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-0.2, 0.012, 0.2); rug.receiveShadow = true; root.add(rug);
  // photos
  [[-1.2, 1.6, -2.32, 0, 0], [0.6, 1.7, 2.32, Math.PI, 1], [-2.13, 1.5, 1.5, Math.PI / 2, 2]].forEach(([x, y, z, ry, i]) => {
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42),
      new THREE.MeshStandardMaterial({ map: PROC_TEXTURES.photo(i), roughness: 0.7 }));
    ph.position.set(x, y, z); ph.rotation.y = ry; ph.rotation.z = rand(-0.04, 0.04); root.add(ph);
  });

  // ---- den DOOR (left wall, hinged, swings into hallway) ----
  const doorG = new THREE.Group();
  doorG.position.set(-2.2, 0, -0.45); // hinge
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.05, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x54402c, roughness: 0.8 }));
  doorPanel.position.set(0, 1.025, 0.45); doorG.add(doorPanel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.metal);
  knob.position.set(0.06, 1.0, 0.78); doorG.add(knob);
  doorG.rotation.y = 1.45; // open = swung into hallway
  root.add(doorG);
  W.door = { group: doorG, openRot: 1.45, closedRot: 0, t: 0 };

  // door control panel (den side)
  const doorPanelCtl = buildControlPanel(M, 0x77ff9a);
  doorPanelCtl.position.set(-2.145, 1.18, -0.72); doorPanelCtl.rotation.y = Math.PI / 2;
  root.add(doorPanelCtl);
  doorPanelCtl.traverse(o => { o.userData.action = 'door'; });
  W.interactables.push(doorPanelCtl);
  const doorPad = buildHitPad(0.06, 0.62, 0.52, 'door');
  doorPad.position.set(-2.10, 1.18, -0.72);
  root.add(doorPad); W.interactables.push(doorPad);
  W.doorLEDs = doorPanelCtl.userData.leds;

  // ---- den WINDOW (right wall) + blinds + curtain ----
  // window frame: four border bars (NOT a solid box) around the opening
  const frameBar = (w, h, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, w), M.wood);
    b.position.set(2.2, y, z); b.castShadow = true; root.add(b); return b;
  };
  frameBar(1.56, 0.07, 2.135, 0);     // top
  frameBar(1.56, 0.09, 0.865, 0);     // sill
  frameBar(0.08, 1.34, 1.5, -0.72);   // left jamb
  frameBar(0.08, 1.34, 1.5, 0.72);    // right jamb
  frameBar(0.05, 1.2, 1.5, 0);        // center mullion
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.16),
    new THREE.MeshStandardMaterial({ color: 0x9db8d8, transparent: true, opacity: 0.10, roughness: 0.15 }));
  glass.position.set(2.185, 1.5, 0); glass.rotation.y = -Math.PI / 2; root.add(glass);
  // blind slats (cast the moon stripes)
  for (let i = 0; i < 5; i++) { // half-raised blinds — top third of the window
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6 }));
    slat.position.set(2.12, 2.06 - i * 0.075, 0);
    slat.rotation.z = 1.15; slat.castShadow = true; root.add(slat);
  }
  // curtain: slides along z to cover window
  const curt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.5, 12, 1), M.curtain);
  curt.rotation.y = -Math.PI / 2;
  // wave the cloth
  const cpos = curt.geometry.attributes.position;
  for (let i = 0; i < cpos.count; i++) cpos.setZ(i, Math.sin(cpos.getX(i) * 6) * 0.04);
  curt.geometry.computeVertexNormals();
  curt.position.set(2.09, 1.52, 1.65); // parked past the window edge
  root.add(curt);
  W.curtain = { mesh: curt, openZ: 1.65, closedZ: 0, t: 0 };

  const curtCtl = buildControlPanel(M, 0xffb066);
  curtCtl.position.set(2.145, 1.18, 0.95); curtCtl.rotation.y = -Math.PI / 2;
  root.add(curtCtl);
  curtCtl.traverse(o => { o.userData.action = 'curtain'; });
  W.interactables.push(curtCtl);
  const curtPad = buildHitPad(0.06, 0.62, 0.52, 'curtain');
  curtPad.position.set(2.10, 1.18, 0.95);
  root.add(curtPad); W.interactables.push(curtPad);
  W.curtainLEDs = curtCtl.userData.leds;

  // ---- hallway ----
  place('table', -3.6, 0, 0.62, 0, (m) => buildConsole(m));
  [[-3.0, 1.55, 0.74, Math.PI, 0], [-4.4, 1.5, 0.74, Math.PI, 1]].forEach(([x, y, z, ry, i]) => {
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.38),
      new THREE.MeshStandardMaterial({ map: PROC_TEXTURES.photo(i + 3), roughness: 0.7 }));
    ph.position.set(x, y, z); ph.rotation.y = ry; root.add(ph);
  });

  // ---- living room ----
  place('couch', -7.0, 0, -1.9, 0, buildCouch);
  place('tv', -7.2, 0, 2.35, Math.PI, buildTV);
  place('table', -7.0, 0, -0.5, 0, buildCoffeeTable);
  place('armchair', -5.9, 0, -1.6, -0.7, buildArmchair);
  // streetlight stripe pool (fake blinds shadow, seen via cam)
  const stripes = makeStripePool();
  stripes.position.set(-8.2, 0.02, -0.9); root.add(stripes);
  W.stripes = stripes;

  // ---- kitchen ----
  place('counter', -8.85, 0, 4.6, Math.PI / 2, (m) => buildCounter(m, 3.2));
  place('counter', -7.4, 0, 6.05, Math.PI, (m) => buildCounter(m, 2.6));
  place('fridge', -5.75, 0, 5.9, -Math.PI * 0.75, buildFridge);
  place('table', -7.2, 0, 3.9, 0.2, buildKitchenTable);
  place('chair', -6.7, 0, 3.5, 2.6, buildChair);
  place('chair', -7.8, 0, 4.3, -0.5, buildChair);
  const micro = place('microwave', -8.75, 0.97, 3.6, Math.PI / 2, buildMicrowave);
  W.microClock = micro;

  // ---- garage ----
  place('car', -2.9, 0, 4.7, Math.PI * 0.52, buildCar);
  place('shelf', -1.0, 0, 5.9, -Math.PI / 2, buildGarageShelf);
  place('shelf', -4.4, 0, 6.2, Math.PI, buildGarageShelf);

  // ==========================================================================
  // LIGHTING — pools of light in blackness
  // ==========================================================================
  scene.fog = new THREE.FogExp2(0x01030a, 0.055);
  scene.background = new THREE.Color(0x01030a);
  scene.add(new THREE.AmbientLight(0x25304a, 0.5));

  // cold moon through the den window + over the yard (the one shadow-caster)
  const moon = new THREE.DirectionalLight(0x8fb0ff, 1.0);
  moon.position.set(18, 6, -3); moon.target.position.set(0.6, 0.7, 0.2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { near: 2, far: 40, left: -9, right: 9, top: 9, bottom: -9 });
  moon.shadow.bias = -0.002;
  scene.add(moon, moon.target);
  W.moon = moon;

  // warm practical: desk lamp
  const denLamp = new THREE.PointLight(0xffb37a, 14, 7.5, 2);
  denLamp.position.set(-0.62, 1.32, -1.82); scene.add(denLamp);
  W.denLamp = denLamp; W.flickerLights.push({ light: denLamp, base: 14, amp: 0.9, speed: 13 });

  // hallway bulb — sickly warm, occasionally browns out
  const hallBulb = new THREE.PointLight(0xffd9a0, 5.5, 7, 2);
  hallBulb.position.set(-3.7, 2.35, 0); scene.add(hallBulb);
  W.hallBulb = hallBulb; W.flickerLights.push({ light: hallBulb, base: 5.5, amp: 1.4, speed: 7, brownout: true });

  // kitchen microwave-clock green spill
  const kg = new THREE.PointLight(0x59ff85, 3.2, 4.5, 2);
  kg.position.set(-8.55, 1.25, 3.6); scene.add(kg);
  W.houseLights = [kg];

  // living-room streetlight spill (cold)
  const lg = new THREE.PointLight(0xbfd6ff, 5, 8, 2);
  lg.position.set(-8.3, 1.9, -0.9); scene.add(lg);
  W.flickerLights.push({ light: lg, base: 5, amp: 0.35, speed: 3 });

  // garage — thin blue leak
  const gg = new THREE.PointLight(0x8fa5cc, 5.5, 8, 2);
  gg.position.set(-2.9, 2.5, 4.6); scene.add(gg);
  W.houseLights.push(gg, lg);

  // cool spill just outside the den window — lights whatever stands at the glass
  const winSpill = new THREE.PointLight(0xa9c0e8, 4.5, 4.0, 2);
  winSpill.position.set(2.34, 1.85, 0.35); scene.add(winSpill);

  // yard fill so silhouettes read on doorbell cam
  const yg = new THREE.PointLight(0x91a8d8, 11, 14, 2);
  yg.position.set(3.3, 2.4, 0.4); scene.add(yg);
  W.houseLights.push(yg, winSpill);

  // ==========================================================================
  // DUST MOTES in the den lamp pool + window shaft
  // ==========================================================================
  W.dust = makeDust();
  scene.add(W.dust.points);

  return W;

  // ---------- local prop builders (fallback silhouettes; intentionally chunky)
  function makeStripePool() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(190,214,255,0.55)'; x.fillRect(0, i * 18, 128, 8); }
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = 0.5;
    return m;
  }

  function makeDust() {
    const N = 130;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rand(-2, 2.1); pos[i * 3 + 1] = rand(0.3, 2.4); pos[i * 3 + 2] = rand(-2.2, 2.2);
      seed[i] = Math.random() * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcdd8ff, size: 0.012, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    return { points, pos, seed, N, geo };
  }
}

// ---------------------------------------------------------------------------
// GLB loader with fallback swap. Changing only ASSETS.models[key].url is
// enough: file loads → placeholder is removed; file missing → console warning.
// ---------------------------------------------------------------------------
const gltfLoader = new GLTFLoader();
export function tryLoadGLB(def, parentGroup, fallbackObj, key, onLoaded) {
  if (!def || !def.url) return;
  gltfLoader.load(def.url, (gltf) => {
    const model = gltf.scene;
    // auto-scale to def.height and ground at y=0
    const bbox = new THREE.Box3().setFromObject(model);
    const size = bbox.getSize(new THREE.Vector3());
    const s = (def.height || 1) / Math.max(size.y, 0.001);
    model.scale.setScalar(s);
    const bbox2 = new THREE.Box3().setFromObject(model);
    model.position.y -= bbox2.min.y;
    const cx = (bbox2.min.x + bbox2.max.x) / 2, cz = (bbox2.min.z + bbox2.max.z) / 2;
    model.position.x -= cx; model.position.z -= cz;
    if (def.yaw) model.rotation.y = def.yaw;
    model.traverse(o => { if (o.userData) o.userData.action = fallbackObj?.userData?.action; });
    if (fallbackObj) parentGroup.remove(fallbackObj);
    parentGroup.add(model);
    let mixer = null;
    if (gltf.animations && gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(gltf.animations[0]).play();
    }
    console.info(`[ASSETS] loaded ${key} from ${def.url}`);
    if (onLoaded) onLoaded(model, mixer);
  }, undefined, () => {
    console.warn(`[ASSETS] model "${key}" not found at ${def.url} — using procedural fallback.`);
  });
}

// ---------------------------------------------------------------------------
// furniture fallback builders (module scope so characters.js can't collide)
// ---------------------------------------------------------------------------
function buildDesk(M) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.72), M.wood);
  top.position.y = 0.76; g.add(top);
  [[-0.78, -0.3], [0.78, -0.3], [-0.78, 0.3], [0.78, 0.3]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.76, 0.06), M.wood);
    leg.position.set(x, 0.38, z); g.add(leg);
  });
  // clutter: papers + mug
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xb9b4a4, roughness: 1 }));
  paper.rotation.x = -Math.PI / 2; paper.rotation.z = 0.4; paper.position.set(-0.25, 0.79, 0.1); g.add(paper);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 10),
    new THREE.MeshStandardMaterial({ color: 0x7a3d3d, roughness: 0.6 }));
  mug.position.set(0.62, 0.83, 0.05); g.add(mug);
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function buildDeskLamp(M) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 12), M.metal); base.position.y = 0.015; g.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 8), M.metal); stem.position.y = 0.23; g.add(stem);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2b5c46, roughness: 0.5, side: THREE.DoubleSide, emissive: 0xffb37a, emissiveIntensity: 0.45 }));
  shade.position.y = 0.5; g.add(shade);
  return g;
}
function buildTabletProp(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.022, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.35 }));
  g.add(body);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x060a08, roughness: 0.2, emissive: 0x1a3928, emissiveIntensity: 0.5 }));
  scr.rotation.x = -Math.PI / 2; scr.position.y = 0.013; g.add(scr);
  // small pulsing LED so it reads as interactive
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x66ff99 }));
  led.position.set(0.19, 0.014, 0.12); g.add(led);
  g.userData.led = led;
  return g;
}
// An invisible, oversized tap target. Phones need a much bigger hit area than
// the prop itself — colorWrite:false renders nothing but still raycasts.
function buildHitPad(w, h, d, action) {
  const pad = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
  pad.renderOrder = -1;
  pad.userData.action = action;
  pad.userData.padFor = action;   // lets main.js switch a pad off when it would misfire
  return pad;
}

function buildControlPanel(M, ledColor) {
  const g = new THREE.Group();
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.4 });
  // wall plate built as a FRAME around an opening, so the lever has somewhere
  // to swing into instead of clipping through a solid box
  const bar = (w, h, x, y) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.022), plateMat);
    b.position.set(x, y, 0); g.add(b); return b;
  };
  bar(0.16, 0.090, 0, 0.075);      // above the opening (carries the lamps)
  bar(0.16, 0.025, 0, -0.1075);    // below
  bar(0.042, 0.125, -0.059, -0.032); // left
  bar(0.042, 0.125, 0.059, -0.032);  // right
  // dark cavity behind the opening
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.125, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 1 }));
  cavity.position.set(0, -0.032, -0.030); g.add(cavity);
  [[0, 0.1], [0, -0.1]].forEach(([x, y]) => {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 8), M.metal);
    screw.rotation.x = Math.PI / 2; screw.position.set(x, y, 0.013); g.add(screw);
  });
  // THE TOGGLE: a lever on a pivot at the middle of the opening. Sticks out
  // and up when released; flips down into the cavity when the device is on.
  const pivot = new THREE.Group();
  pivot.position.set(0, -0.032, 0.012);
  g.add(pivot);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.055, 0.022),
    new THREE.MeshStandardMaterial({
      color: 0xd0d4da, roughness: 0.32, metalness: 0.15,
      emissive: ledColor, emissiveIntensity: 0.10,
    }));
  lever.position.set(0, 0.022, 0.005); pivot.add(lever);
  pivot.rotation.x = 0.45;                      // released
  // status lamps on the plate above the switch
  const ledOn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.012), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  ledOn.position.set(-0.03, 0.08, 0.017); g.add(ledOn);
  const ledOff = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.012), new THREE.MeshBasicMaterial({ color: 0x39ff6a }));
  ledOff.position.set(0.035, 0.08, 0.017); g.add(ledOff);
  g.userData.leds = { on: ledOn, off: ledOff, btn: lever, lever: pivot };
  return g;
}
function buildCouch(M) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.85), M.fabric); seat.position.y = 0.21; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.22), M.fabric); back.position.set(0, 0.62, -0.32); g.add(back);
  [[-0.88], [0.88]].forEach(([x]) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.85), M.fabric);
    arm.position.set(x, 0.55, 0); g.add(arm);
  });
  for (let i = 0; i < 3; i++) {
    const cush = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x424b58, roughness: 1 }));
    cush.position.set(-0.6 + i * 0.6, 0.49, 0.04); cush.rotation.y = rand(-0.03, 0.03); g.add(cush);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function buildArmchair(M) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), M.fabric); seat.position.y = 0.2; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.2), M.fabric); back.position.set(0, 0.62, -0.3); g.add(back);
  [[-0.36], [0.36]].forEach(([x]) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.8), M.fabric);
    arm.position.set(x, 0.52, 0); g.add(arm);
  });
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function buildTV(M) {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.4), M.wood); stand.position.y = 0.2; g.add(stand);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.6, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.15, metalness: 0.3 }));
  screen.position.y = 0.75; g.add(screen);
  return g;
}
function buildShelf(M) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.28), M.wood); frame.position.y = 0.9; g.add(frame);
  for (let s = 0; s < 4; s++) {
    for (let b = 0; b < 6; b++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.05, rand(0.14, 0.22), 0.16),
        new THREE.MeshStandardMaterial({ color: [0x5a3c3c, 0x3c4a5a, 0x4a5a3c, 0x54503a][b % 4], roughness: 0.9 }));
      book.position.set(-0.26 + b * 0.095, 0.32 + s * 0.42 + 0.09, 0.08); g.add(book);
    }
  }
  return g;
}
function buildConsole(M) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.3), M.wood); top.position.y = 0.8; g.add(top);
  [[-0.4], [0.4]].forEach(([x]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.26), M.wood); leg.position.set(x, 0.4, 0); g.add(leg);
  });
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.4 }));
  vase.position.set(0.2, 0.92, 0); g.add(vase);
  return g;
}
function buildCoffeeTable(M) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.55), M.wood); top.position.y = 0.42; g.add(top);
  [[-0.44, -0.22], [0.44, -0.22], [-0.44, 0.22], [0.44, 0.22]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), M.wood); leg.position.set(x, 0.21, z); g.add(leg);
  });
  return g;
}
function buildCounter(M, len = 2.4) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x39404d, roughness: 0.85 }));
  base.position.y = 0.45; g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.05, 0.68),
    new THREE.MeshStandardMaterial({ color: 0x8b8f99, roughness: 0.35 }));
  top.position.y = 0.925; g.add(top);
  return g;
}
function buildFridge(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.85, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.35, metalness: 0.4 }));
  body.position.y = 0.925; g.add(body);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.04), M.metal);
  handle.position.set(0.33, 1.2, 0.37); g.add(handle);
  return g;
}
function buildKitchenTable(M) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), M.wood); top.position.y = 0.74; g.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.74, 10), M.wood); leg.position.y = 0.37; g.add(leg);
  return g;
}
function buildChair(M) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), M.wood); seat.position.y = 0.45; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.05), M.wood); back.position.set(0, 0.7, -0.18); g.add(back);
  [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), M.wood); leg.position.set(x, 0.22, z); g.add(leg);
  });
  return g;
}
function buildMicrowave(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.4 }));
  body.position.y = 0.15; g.add(body);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08),
    new THREE.MeshBasicMaterial({ map: PROC_TEXTURES.microwaveClock('3:07') }));
  clock.position.set(0.08, 0.18, 0.181); g.add(clock);
  g.userData.clockMesh = clock;
  return g;
}
function buildCar(M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.5, 4.0),
    new THREE.MeshStandardMaterial({ color: 0x32404e, roughness: 0.35, metalness: 0.5 }));
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.2, metalness: 0.4 }));
  cabin.position.set(0, 1.0, -0.3); g.add(cabin);
  [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 }));
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.33, z); g.add(wheel);
  });
  return g;
}
function buildGarageShelf(M) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x4b4f57, roughness: 0.6, metalness: 0.5 }));
  frame.position.y = 0.9; g.add(frame);
  for (let i = 0; i < 6; i++) {
    const bx = new THREE.Mesh(new THREE.BoxGeometry(rand(0.2, 0.4), rand(0.15, 0.3), 0.3),
      new THREE.MeshStandardMaterial({ color: [0x6a5c40, 0x4e5a44, 0x5a4444][i % 3], roughness: 1 }));
    bx.position.set(rand(-0.5, 0.5), 0.4 + (i % 3) * 0.55, 0.25); g.add(bx);
  }
  return g;
}
function buildSwingset(M) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x555c66, roughness: 0.5, metalness: 0.6 });
  [[-1, 0], [1, 0]].forEach(([x]) => {
    const legA = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), mat);
    legA.position.set(x, 1.05, -0.4); legA.rotation.x = 0.32; g.add(legA);
    const legB = legA.clone(); legB.position.z = 0.4; legB.rotation.x = -0.32; g.add(legB);
  });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), mat);
  bar.rotation.z = Math.PI / 2; bar.position.y = 2.05; g.add(bar);
  [-0.45, 0.45].forEach((x, i) => {
    const rope1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.5, 6), mat);
    rope1.position.set(x - 0.14, 1.3, 0); g.add(rope1);
    const rope2 = rope1.clone(); rope2.position.x = x + 0.14; g.add(rope2);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 }));
    seat.position.set(x, 0.55, 0); seat.rotation.y = i ? 0.06 : -0.04; g.add(seat);
    if (i === 0) g.userData.swingSeat = seat; // one swing sways in the wind
  });
  return g;
}

// ---------------------------------------------------------------------------
// per-frame world update (door/curtain animation, flicker, dust, lightning)
// ---------------------------------------------------------------------------
const _v = new THREE.Vector3();
export function updateWorld(W, S, dt, t, audio) {
  // door swing
  const d = W.door;
  const dTarget = S.doorClosed ? d.closedRot : d.openRot;
  d.group.rotation.y += (dTarget - d.group.rotation.y) * Math.min(1, dt * 7);
  // curtain slide
  const c = W.curtain;
  const cTarget = S.curtainClosed ? c.closedZ : c.openZ;
  c.mesh.position.z += (cTarget - c.mesh.position.z) * Math.min(1, dt * 5);
  // control panel LEDs
  if (W.doorLEDs) { W.doorLEDs.on.visible = S.doorClosed && !S.blackout; W.doorLEDs.off.visible = !S.doorClosed && !S.blackout; }
  if (W.curtainLEDs) { W.curtainLEDs.on.visible = S.curtainClosed && !S.blackout; W.curtainLEDs.off.visible = !S.curtainClosed && !S.blackout; }
  // toggle levers: snap down when engaged, spring back up when released
  const flip = (ctl, engaged) => {
    if (!ctl || !ctl.lever) return;
    const target = engaged ? -0.45 : 0.45;
    const r = ctl.lever.rotation;
    r.x += (target - r.x) * Math.min(1, dt * 22);
    if (Math.abs(target - r.x) < 0.004) r.x = target;
  };
  flip(W.doorLEDs, S.doorClosed);
  flip(W.curtainLEDs, S.curtainClosed);
  // tablet LED pulse
  const led = W.deskTablet?.userData?.led;
  if (led) { led.visible = !S.blackout; led.material.color.setHSL(0.38, 1, 0.4 + Math.sin(t * 4) * 0.25); }

  // light flicker + blackout
  const power = !S.blackout;
  for (const f of W.flickerLights) {
    if (!power) { f.light.intensity = 0; continue; }
    let v = f.base * (1 + (Math.sin(t * f.speed) + Math.sin(t * f.speed * 2.7 + 1.3)) * 0.5 * (f.amp / f.base));
    if (f.brownout) {
      const ph = Math.sin(t * 0.31) + Math.sin(t * 0.117 + 2);
      if (ph > 1.55) v *= 0.12; // occasional deep brownout
    }
    f.light.intensity = Math.max(0, v);
  }
  for (const hl of (W.houseLights || [])) hl.intensity = power ? (hl.userData.base ?? (hl.userData.base = hl.intensity)) : 0;
  if (W.stripes) W.stripes.visible = power;
  if (!power) {
    W.moon.intensity = 0.85; // the moon never goes out
  } else {
    // lightning: rare flash through the windows
    const L = W.lightning;
    L.t -= dt;
    if (L.t <= 0) { L.active = 0.5 + Math.random() * 0.4; L.t = rand(35, 85); if (audio) audio.creak(null); }
    if (L.active > 0) {
      L.active -= dt;
      const k = Math.max(0, Math.sin(L.active * 24)) * (L.active * 2);
      W.moon.intensity = 1.0 + k * 5;
    } else W.moon.intensity = 1.0;
  }

  // dust drift
  const D = W.dust;
  for (let i = 0; i < D.N; i++) {
    const s = D.seed[i];
    D.pos[i * 3] += Math.sin(t * 0.22 + s) * 0.00035;
    D.pos[i * 3 + 1] += -0.00022 - Math.sin(t * 0.13 + s * 2) * 0.00012;
    D.pos[i * 3 + 2] += Math.cos(t * 0.19 + s) * 0.0003;
    if (D.pos[i * 3 + 1] < 0.15) D.pos[i * 3 + 1] = 2.4;
  }
  D.geo.attributes.position.needsUpdate = true;
  D.points.visible = power;
}
