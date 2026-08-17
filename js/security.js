// ============================================================================
// security.js — the camera tablet. A real second render of the house from
// wall-mounted viewpoints, pushed through a degraded-CCTV shader (static,
// scanlines, desat, tear). The grain is doing double duty: atmosphere, and
// making simple geometry read as "bad security camera" instead of "bad room".
// ============================================================================
import * as THREE from 'three';
import { TUNING } from './config.js';
import { CAM_DEFS } from './world.js';
import { clamp } from './util.js';

const FEED_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FEED_FRAG = /* glsl */`
  uniform sampler2D tFeed; uniform sampler2D tOverlay;
  uniform float uTime; uniform float uStatic; uniform float uIR; uniform float uOn;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    // rolling tear line
    float tear = step(abs(uv.y - fract(uTime * 0.11)), 0.0035);
    uv.x += tear * 0.02 * sin(uTime * 40.0);
    // slight barrel distortion
    vec2 cc = uv - 0.5;
    uv = 0.5 + cc * (1.0 + dot(cc, cc) * 0.12);
    vec3 col = texture2D(tFeed, clamp(uv, 0.0, 1.0)).rgb * 1.6;
    // lift + desaturate + tint
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum), 0.6);
    col = mix(col * vec3(0.82, 1.02, 0.9), vec3(lum) * vec3(0.75, 1.05, 0.8), uIR);
    col = mix(col, pow(col, vec3(0.7)) * 1.6, uIR);    // IR gain + lift
    // scanlines
    col *= 0.82 + 0.18 * sin(uv.y * 620.0);
    // noise
    float n = hash(uv * vec2(640.0, 480.0) + floor(uTime * 24.0));
    col = mix(col, vec3(n), 0.05 + uStatic * 0.9);
    // vignette
    float d = distance(uv, vec2(0.5));
    col *= 1.0 - smoothstep(0.32, 0.78, d) * 0.75;
    // screen off = dead black with faint noise
    col = mix(vec3(n * 0.03), col, uOn);
    // overlay (labels, map, timestamp)
    vec4 ov = texture2D(tOverlay, vUv);
    col = mix(col, ov.rgb, ov.a * uOn);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function buildTablet(camera, scene) {
  const [fw, fh] = TUNING.FEED_RES;
  const rt = new THREE.WebGLRenderTarget(fw, fh);
  const feedCam = new THREE.PerspectiveCamera(60, fw / fh, 0.1, 60);

  // overlay canvas
  const oc = document.createElement('canvas'); oc.width = 512; oc.height = 384;
  const octx = oc.getContext('2d');
  const overlayTex = new THREE.CanvasTexture(oc);

  const screenMat = new THREE.ShaderMaterial({
    vertexShader: FEED_VERT,
    fragmentShader: FEED_FRAG,
    uniforms: {
      tFeed: { value: rt.texture },
      tOverlay: { value: overlayTex },
      uTime: { value: 0 },
      uStatic: { value: 1 },
      uIR: { value: 0 },
      uOn: { value: 1 },
    },
  });

  // ---- held tablet rig (child of the player camera) ----
  const rig = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4 }));
  rig.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), screenMat);
  screen.position.set(0, 0.022, 0.011); rig.add(screen);
  screen.userData.action = 'none';

  // bezel camera buttons
  const btnGeo = new THREE.BoxGeometry(0.072, 0.036, 0.012);
  const buttons = [];
  CAM_DEFS.forEach((def, i) => {
    const bm = new THREE.Mesh(btnGeo, new THREE.MeshStandardMaterial({
      color: 0x272b33, roughness: 0.4, emissive: 0x3d7a55, emissiveIntensity: 0.25,
    }));
    bm.position.set(-0.185 + i * 0.08, -0.145, 0.012);
    bm.userData.action = 'cam:' + def.id;
    rig.add(bm); buttons.push(bm);
    // tiny number label
    const lc = document.createElement('canvas'); lc.width = 32; lc.height = 32;
    const lx = lc.getContext('2d');
    lx.fillStyle = '#9fe8bb'; lx.font = 'bold 22px monospace'; lx.textAlign = 'center'; lx.textBaseline = 'middle';
    lx.fillText(String(i + 1), 16, 18);
    const lt = new THREE.CanvasTexture(lc);
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03),
      new THREE.MeshBasicMaterial({ map: lt, transparent: true }));
    lm.position.set(bm.position.x, bm.position.y, 0.019);
    lm.userData.action = 'cam:' + def.id;
    rig.add(lm);
  });
  // lower-handle strip
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.032, 0.014),
    new THREE.MeshStandardMaterial({ color: 0x3a2a2a, roughness: 0.5, emissive: 0x7a3030, emissiveIntensity: 0.4 }));
  handle.position.set(0.225, -0.145, 0.012);
  handle.userData.action = 'tablet';
  rig.add(handle);

  camera.add(rig);
  const POS_DOWN = new THREE.Vector3(0.06, -0.62, -0.42);
  const POS_UP = new THREE.Vector3(0.0, -0.075, -0.42);
  rig.position.copy(POS_DOWN);
  rig.rotation.x = -0.28;
  rig.scale.setScalar(0.94);
  rig.visible = false;

  const tablet = {
    rt, feedCam, rig, screenMat, overlayTex, octx, oc, buttons,
    camIndex: 2,             // start on hallway cam
    raise01: 0,              // animation progress
    staticAmt: 1,
    overlayTimer: 0,
    frameParity: 0,
    setCam(id) {
      const idx = CAM_DEFS.findIndex(c => c.id === id);
      if (idx >= 0 && idx !== this.camIndex) {
        this.camIndex = idx;
        this.staticAmt = 1;
        this.syncFeedCam();
      }
    },
    syncFeedCam() {
      const def = CAM_DEFS[this.camIndex];
      feedCam.position.set(...def.pos);
      feedCam.lookAt(...def.look);
      feedCam.fov = def.fov; feedCam.updateProjectionMatrix();
      screenMat.uniforms.uIR.value = def.ir ? 1 : 0;
    },
    currentDef() { return CAM_DEFS[this.camIndex]; },
  };
  tablet.syncFeedCam();
  return tablet;
}

// ---------------------------------------------------------------------------
// overlay drawing: label, timestamp, REC, minimap with active room
// ---------------------------------------------------------------------------
const MAP_ROOMS = [ // [x, y, w, h, camId, name]
  [300, 210, 130, 110, null, 'DEN'],
  [210, 235, 90, 60, 'hallway', 'HALL'],
  [80, 190, 130, 130, 'living', 'LIVING'],
  [80, 80, 130, 110, 'kitchen', 'KITCHEN'],
  [210, 80, 130, 110, 'garage', 'GARAGE'],
  [430, 150, 60, 170, 'backyard', 'YARD'],
];

export function drawOverlay(tablet, clockText, powerText, blackout) {
  const x = tablet.octx, W = 512, H = 384;
  x.clearRect(0, 0, W, H);
  const def = tablet.currentDef();
  x.font = 'bold 19px monospace';
  x.fillStyle = 'rgba(190,255,210,0.92)';
  x.fillText(def.label, 16, 30);
  x.font = '15px monospace';
  x.fillText(clockText + '  ' + powerText, 16, H - 16);
  // REC dot
  if (Math.floor(performance.now() / 600) % 2 === 0) {
    x.fillStyle = 'rgba(255,70,70,0.95)';
    x.beginPath(); x.arc(W - 90, 24, 7, 0, 7); x.fill();
  }
  x.fillStyle = 'rgba(190,255,210,0.92)';
  x.fillText('REC', W - 74, 30);
  // minimap — bottom-right, small, translucent
  x.save();
  x.translate(276, 196); x.scale(0.42, 0.42);
  x.globalAlpha = 0.72;
  for (const [rx, ry, rw, rh, camId, name] of MAP_ROOMS) {
    const active = camId === def.id;
    x.fillStyle = active ? 'rgba(120,255,170,0.30)' : 'rgba(20,40,30,0.45)';
    x.strokeStyle = active ? 'rgba(150,255,190,0.9)' : 'rgba(120,190,150,0.5)';
    x.lineWidth = 3;
    x.fillRect(rx, ry, rw, rh); x.strokeRect(rx, ry, rw, rh);
    x.fillStyle = active ? 'rgba(200,255,220,0.95)' : 'rgba(140,200,165,0.6)';
    x.font = 'bold 17px monospace';
    x.fillText(name, rx + 8, ry + 22);
  }
  x.restore();
  if (blackout) {
    x.fillStyle = 'rgba(0,0,0,0.85)'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(120,255,170,0.5)'; x.font = 'bold 26px monospace';
    x.fillText('SIGNAL LOST', 160, 190);
  }
  tablet.overlayTex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// per-frame: raise/lower animation, feed rendering, static decay
// ---------------------------------------------------------------------------
export function updateTablet(tablet, renderer, scene, S, dt, t, clockText, powerText) {
  const target = S.tabletUp ? 1 : 0;
  tablet.raise01 += (target - tablet.raise01) * Math.min(1, dt * 9);
  const k = tablet.raise01;
  tablet.rig.visible = k > 0.02;
  tablet.rig.position.set(
    0.06 * (1 - k),
    -0.62 + (-0.075 - -0.62) * k,
    -0.42
  );
  tablet.rig.rotation.x = -0.28 * (1 - k) - 0.06 * k;

  tablet.screenMat.uniforms.uTime.value = t;
  tablet.screenMat.uniforms.uOn.value = S.blackout ? 0 : 1;
  tablet.staticAmt = Math.max(0, tablet.staticAmt - dt * 3.2);
  tablet.screenMat.uniforms.uStatic.value = tablet.staticAmt + (S.blackout ? 0 : 0.02);

  if (tablet.rig.visible && !S.blackout) {
    tablet.frameParity ^= 1;
    if (tablet.frameParity) { // render feed at half framerate — CCTV feel + perf
      const prevRT = renderer.getRenderTarget();
      renderer.setRenderTarget(tablet.rt);
      renderer.render(scene, tablet.feedCam);
      renderer.setRenderTarget(prevRT);
    }
    tablet.overlayTimer -= dt;
    if (tablet.overlayTimer <= 0) {
      tablet.overlayTimer = 0.25;
      drawOverlay(tablet, clockText, powerText, S.blackout);
    }
  }
}
