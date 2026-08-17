// ============================================================================
// main.js — renderer, film-grade post pass, first-person seat controls,
// interaction raycasting, the frame loop, and boot.
// ============================================================================
import * as THREE from 'three';
import { TUNING, DEBUG } from './config.js';
import { clamp, lerp, rand } from './util.js';
import { buildWorld, updateWorld, ROOMS } from './world.js';
import { buildCharacters, updateCharacters, startJumpscare, updateJumpscare } from './characters.js';
import { buildTablet, updateTablet } from './security.js';
import { createAI } from './ai.js';
import { createGame } from './game.js';
import { createUI } from './ui.js';
import * as SFX from './audio.js';
import { PROC_TEXTURES } from './util.js';

// ---------------------------------------------------------------------------
// renderer (fail loudly but gracefully if WebGL is unavailable)
// ---------------------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('webglError').style.display = '';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8) * TUNING.INTERNAL_RES);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// scene, camera (the player's head)
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.05, 70);
const SEAT = new THREE.Vector3(0, 1.14, 0.85);
camera.position.copy(SEAT);
scene.add(camera);

const world = buildWorld(scene);
// walls/ceilings occlude the moon so light only enters through the window
world.root.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow || false; } });
world.root.children.forEach((o) => {
  if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') { o.castShadow = true; o.receiveShadow = true; }
});

const chars = buildCharacters(scene);
const tablet = buildTablet(camera, scene);

// ---------------------------------------------------------------------------
// post pass: grain / vignette / chroma / cold lift — the "film grade"
// ---------------------------------------------------------------------------
const rtMain = new THREE.WebGLRenderTarget(
  renderer.domElement.width, renderer.domElement.height);
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: rtMain.texture },
    uTime: { value: 0 },
    uThreat: { value: 0 },
    uFlash: { value: 0 },
    uBlack: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uThreat, uFlash, uBlack;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float d = distance(uv, vec2(0.5));
      // subtle chromatic aberration toward edges
      vec2 off = (uv - 0.5) * d * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // cold lift in the shadows
      col = mix(col, col * vec3(0.90, 0.97, 1.10) + vec3(0.004, 0.006, 0.012), 0.6);
      // film grain
      float g = hash(uv * vec2(1280.0, 720.0) + fract(uTime) * 61.7) * 2.0 - 1.0;
      col += g * (0.014 + uThreat * 0.010);
      // vignette breathes with threat
      float vig = smoothstep(0.30, 0.92, d);
      col *= 1.0 - vig * (0.55 + uThreat * 0.28 + 0.03 * sin(uTime * 2.2));
      // gentle flicker
      col *= 0.985 + 0.015 * hash(vec2(floor(uTime * 24.0), 1.0));
      // gamma (scene pass is linear)
      col = pow(max(col, 0.0), vec3(0.4545));
      // red kill-flash + hard blackout
      col = mix(col, vec3(0.75, 0.02, 0.02), uFlash);
      col = mix(col, vec3(0.0), uBlack);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  depthTest: false, depthWrite: false,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// ---------------------------------------------------------------------------
// game + UI + AI wiring
// ---------------------------------------------------------------------------
const ui = createUI();
const S = createGame(ui);
ui.bind(S);

const hooks = {
  kill: (key) => S.triggerKill(key),
  watchedCamId: () => (S.tabletUp && tablet.raise01 > 0.65 ? tablet.currentDef().id : null),
  lookingAtGolden: () => {
    if (S.tabletUp) return false;
    const toG = _v1.copy(chars.goldenCob.group.position).setY(1.1).sub(camera.position).normalize();
    const fwd = camera.getWorldDirection(_v2);
    return fwd.angleTo(toG) < 0.44;
  },
};
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const ai = createAI(chars, S, hooks);
S.ai = ai;

// ---------------------------------------------------------------------------
// jumpscare presentation
// ---------------------------------------------------------------------------
let jumpscare = null, deathHold = 0;
const scareLight = new THREE.PointLight(0xfff2e0, 0, 3.0, 2);
scareLight.position.set(0, 0.15, -0.25);
camera.add(scareLight);
S.onKill = (key) => {
  SFX.scream();
  scareLight.intensity = 11;
  jumpscare = startJumpscare(chars[key], camera);
  jumpscare.key = key;
  deathHold = 0.55;
  postMat.uniforms.uFlash.value = 0.55;
};

// ---------------------------------------------------------------------------
// input: drag-look + tap-to-interact (mouse and touch through pointer events)
// ---------------------------------------------------------------------------
let yaw = 0, pitch = 0;
let dragging = false, dragMoved = 0, downAt = 0, lastX = 0, lastY = 0, downX = 0, downY = 0;
let touchPointer = false;
const raycaster = new THREE.Raycaster();
const canvas = renderer.domElement;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true; dragMoved = 0; downAt = performance.now();
  touchPointer = (e.pointerType === 'touch' || e.pointerType === 'pen');
  lastX = downX = e.clientX; lastY = downY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (S.state === 'playing' || S.state === 'title') {
    yaw = clamp(yaw + dx * TUNING.LOOK_SENS, -TUNING.YAW_LIMIT, TUNING.YAW_LIMIT);
    pitch = clamp(pitch + dy * TUNING.LOOK_SENS, -TUNING.PITCH_LIMIT, TUNING.PITCH_LIMIT);
  }
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  // a finger smears more than a mouse: touch gets a looser tap window
  const slop = touchPointer ? 26 : 10;
  const window_ms = touchPointer ? 550 : 400;
  const quick = performance.now() - downAt < window_ms;
  if (dragMoved < slop && quick) tapInteract(e.clientX, e.clientY);
});

function tapInteract(cx, cy) {
  if (S.state !== 'playing') return;
  const ndc = new THREE.Vector2(
    (cx / window.innerWidth) * 2 - 1,
    -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // the desk-tablet pad is disabled while the tablet is already raised, so its
  // bigger footprint can't lower the tablet by accident
  const targets = world.interactables.filter(o => !(S.tabletUp && o.userData.padFor === 'tablet'));
  if (tablet.rig.visible) targets.push(tablet.rig);
  const hits = raycaster.intersectObjects(targets, true);
  for (const h of hits) {
    let o = h.object, action = null;
    while (o && !action) { action = o.userData?.action; o = o.parent; }
    if (!action || action === 'none') continue;
    if (action === 'door') return S.toggleDoor();
    if (action === 'curtain') return S.toggleCurtain();
    if (action === 'tablet') return S.toggleTablet();
    if (action.startsWith('cam:')) {
      if (S.tabletUp) { tablet.setCam(action.slice(4)); SFX.camSwitchBlip(); }
      return;
    }
  }
}

// keyboard conveniences (the 3D controls remain the canonical interface)
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  // while HOW TO PLAY is up it swallows the game keys — only H / Esc close it
  if (ui.helpOpen()) {
    if (k === 'h' || k === 'escape') { e.preventDefault(); ui.closeHelp(); }
    return;
  }
  if (S.state !== 'playing') return;
  if (k === 'h') { e.preventDefault(); return ui.openHelp({ label: 'RESUME' }); }
  if (k === ' ' || k === 'tab') { e.preventDefault(); S.toggleTablet(); }
  else if (k === 'd') S.toggleDoor();
  else if (k === 'c') S.toggleCurtain();
  else if (k === 'escape' && S.tabletUp) S.toggleTablet();
  else if (k === 'p') { S.paused = !S.paused; ui.setPaused(S.paused); }
  else if (/^[1-5]$/.test(k) && S.tabletUp) {
    tablet.setCam(['living', 'kitchen', 'hallway', 'garage', 'backyard'][Number(k) - 1]);
    SFX.camSwitchBlip();
  }
});

// pause when the tab goes to the background
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && S.state === 'playing' && !S.paused) {
    S.paused = true; ui.setPaused(true);
  }
});

// ---------------------------------------------------------------------------
// resize
// ---------------------------------------------------------------------------
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  rtMain.setSize(renderer.domElement.width, renderer.domElement.height);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// ambient creaks + microwave clock
// ---------------------------------------------------------------------------
let creakT = rand(20, 45), microT = 0;
function houseAmbience(dt) {
  creakT -= dt;
  if (creakT <= 0) {
    creakT = rand(25, 60);
    SFX.creak({ x: rand(-3, 2), y: 2.5, z: rand(-2, 2) });
  }
  microT -= dt;
  if (microT <= 0 && world.microClock) {
    microT = 5;
    let mesh = null;
    world.microClock.traverse(o => { if (o.userData && o.userData.clockMesh) mesh = o.userData.clockMesh; });
    if (mesh && mesh.material.map && mesh.material.map.image) {
      // redraw the SAME canvas texture — never allocate per tick
      const c = mesh.material.map.image, x = c.getContext('2d');
      const txt = S.state === 'playing' ? S.clockText().replace(' AM', '') : '3:07';
      x.fillStyle = '#050805'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#39ff6a'; x.font = 'bold 38px monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, c.width / 2, c.height / 2 + 2);
      mesh.material.map.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let tAbs = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, clock.getDelta());
  tAbs += dt;

  // ---- logic ----
  S.tick(dt);
  if (!S.paused && (S.state === 'playing' || S.state === 'title' || S.state === 'intro')) {
    houseAmbience(dt);
  }

  // ---- head / camera ----
  if (S.state === 'title') {
    // slow menu drift
    const ty = Math.sin(tAbs * 0.11) * 0.7 - 0.15;
    yaw = lerp(yaw, ty, 0.01);
    pitch = lerp(pitch, Math.sin(tAbs * 0.07) * 0.06, 0.01);
  }
  const threat = S.threatSmooth || 0;
  if (window.__freecam) {
    const f = window.__freecam;
    camera.position.set(f[0], f[1], f[2]);
    camera.lookAt(f[3], f[4], f[5]);
  } else {
  const breathe = Math.sin(tAbs * (1.05 + threat * 1.6)) * (0.006 + threat * 0.004);
  const tremor = threat * threat * 0.0035;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw + Math.sin(tAbs * 0.6) * 0.004 + (Math.random() - 0.5) * tremor;
  camera.rotation.x = pitch + breathe * 0.4 + (Math.random() - 0.5) * tremor;
  camera.rotation.z = (Math.random() - 0.5) * tremor * 0.5;
  // lean toward door or window at the edges of the look range
  let leanX = 0, leanZ = 0;
  if (yaw > TUNING.LEAN_START) { const k = Math.min(1, (yaw - TUNING.LEAN_START) / 0.9); leanX = -k * 0.42; leanZ = -k * 0.30; }
  else if (yaw < -TUNING.LEAN_START) { const k = Math.min(1, (-yaw - TUNING.LEAN_START) / 0.9); leanX = k * 0.45; leanZ = -k * 0.22; }
  camera.position.set(
    SEAT.x + leanX,
    SEAT.y + breathe,
    SEAT.z + leanZ
  );
  }

  // ---- world / characters / tablet ----
  updateWorld(world, S, dt, tAbs, SFX);
  updateCharacters(chars, dt, tAbs);
  updateTablet(tablet, renderer, scene, S, dt, tAbs,
    S.clockText(), 'PWR ' + Math.floor(S.power) + '%');
  SFX.updateListener(camera);
  SFX.tickAudio(dt);

  // ---- jumpscare ----
  if (jumpscare) {
    const done = updateJumpscare(jumpscare, dt);
    postMat.uniforms.uFlash.value = Math.max(0, postMat.uniforms.uFlash.value - dt * 1.4);
    camera.rotation.z += Math.sin(tAbs * 60) * 0.05;
    if (done) {
      deathHold -= dt;
      postMat.uniforms.uBlack.value = clamp(1 - deathHold * 2, 0, 1);
      if (deathHold <= 0) {
        const key = jumpscare.key;
        jumpscare.ch.group.visible = false;
        jumpscare = null;
        scareLight.intensity = 0;
        postMat.uniforms.uBlack.value = 0;
        postMat.uniforms.uFlash.value = 0;
        S.finishDeath(key);
      }
    }
  }

  // ---- blackout look ----
  postMat.uniforms.uThreat.value = threat + (S.blackout ? 0.35 : 0);

  // ---- render ----
  postMat.uniforms.uTime.value = tAbs;
  renderer.setRenderTarget(rtMain);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);

  // ---- HUD (throttled) ----
  hudT -= dt;
  if (hudT <= 0) { hudT = 0.22; ui.updateHUD(); }
}
let hudT = 0;

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
ui.showTitle();
frame();
if (DEBUG) {
  window.FNAC = Object.assign(window.FNAC || {}, {
    tablet, chars, world, scene, camera,
    raiseTablet: () => { S.tabletUp = true; },
    look: (y, p = 0) => { yaw = y; pitch = p; },
    freecam: (...a) => { window.__freecam = a.length ? a : null; },
    cam: (id) => tablet.setCam(id),
    boardTest: () => ui.submitScore('DEBUGGER', 12345),
  });
}
console.info('%cFIVE NIGHTS AT CHOMPY\'S', 'color:#7fff9f;font-size:16px;font-weight:bold');
console.info('[FNAC] booted. Missing model/texture files fall back to procedural placeholders by design.');
