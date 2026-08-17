// ============================================================================
// util.js — math helpers + all procedurally generated canvas textures.
// Every texture the game uses can be produced here so the project runs with an
// empty textures/ folder.
// ============================================================================
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const band = (b) => rand(b[0], b[1]);          // draw from [min,max]
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// deterministic-ish value noise for canvas texture generation
function noise2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finishTex(c, repeat = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function grain(ctx, w, h, alpha, tone = 0) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() * 2 - 1) * alpha * 255;
    d[i] = clamp(d[i] + n + tone, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n + tone, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n + tone, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Procedural texture builders, keyed by the ASSETS.textures keys.
// ---------------------------------------------------------------------------
export const PROC_TEXTURES = {
  wall() {
    const [c, x] = makeCanvas(512, 512);
    x.fillStyle = '#5a5f66'; x.fillRect(0, 0, 512, 512);
    // faint vertical drag marks
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(${30 + Math.random() * 40},${32 + Math.random() * 40},${40 + Math.random() * 40},0.05)`;
      const px = Math.random() * 512;
      x.fillRect(px, 0, 1 + Math.random() * 3, 512);
    }
    // baseboard shadow gradient
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    grain(x, 512, 512, 0.035);
    return finishTex(c, [2, 1]);
  },
  floor() { // wood planks
    const [c, x] = makeCanvas(512, 512);
    x.fillStyle = '#4a3826'; x.fillRect(0, 0, 512, 512);
    const plankH = 64;
    for (let row = 0; row < 8; row++) {
      const y = row * plankH;
      const shade = 0.85 + noise2(row, 7) * 0.3;
      x.fillStyle = `rgb(${74 * shade | 0},${56 * shade | 0},${38 * shade | 0})`;
      x.fillRect(0, y, 512, plankH - 2);
      // grain streaks
      for (let s = 0; s < 26; s++) {
        x.strokeStyle = `rgba(20,12,6,${0.05 + Math.random() * 0.1})`;
        x.beginPath();
        const sy = y + Math.random() * plankH;
        x.moveTo(0, sy);
        x.bezierCurveTo(170, sy + rand(-4, 4), 340, sy + rand(-4, 4), 512, sy + rand(-6, 6));
        x.stroke();
      }
      // plank seam offset
      const seam = ((row * 197) % 512);
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(seam, y, 2, plankH - 2);
      x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, y + plankH - 2, 512, 2);
    }
    grain(x, 512, 512, 0.04);
    return finishTex(c, [3, 3]);
  },
  carpet() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#3a3f4a'; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 0.09);
    return finishTex(c, [4, 4]);
  },
  ceiling() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#2e3138'; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 0.05);
    return finishTex(c, [4, 4]);
  },
  curtain() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#5a2f2f'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 8) { // vertical fabric folds
      const sh = 0.75 + Math.sin(i * 0.35) * 0.25;
      x.fillStyle = `rgba(0,0,0,${0.25 * (1 - sh)})`;
      x.fillRect(i, 0, 8, 256);
    }
    grain(x, 256, 256, 0.05);
    return finishTex(c, [2, 1]);
  },
  grass() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#1d2b1a'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = `rgba(${20 + Math.random() * 30},${45 + Math.random() * 40},${20 + Math.random() * 25},0.35)`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 1, 1 + Math.random() * 3);
    }
    return finishTex(c, [6, 6]);
  },
  concrete() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#4c4c50'; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 0.06);
    // oil stain
    const g = x.createRadialGradient(150, 160, 4, 150, 160, 70);
    g.addColorStop(0, 'rgba(10,10,12,0.55)'); g.addColorStop(1, 'rgba(10,10,12,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(150, 160, 70, 46, 0.4, 0, 7); x.fill();
    return finishTex(c, [2, 2]);
  },
  // ---- not in the swap registry, always procedural ----
  kernels(tintHex = 0xd8c24a) { // corn kernel grid for Cob's body
    const [c, x] = makeCanvas(256, 512);
    const t = new THREE.Color(tintHex);
    x.fillStyle = `rgb(${t.r * 140 | 0},${t.g * 120 | 0},${t.b * 60 | 0})`;
    x.fillRect(0, 0, 256, 512);
    for (let ry = 0; ry < 26; ry++) for (let rx = 0; rx < 13; rx++) {
      const px = rx * 20 + (ry % 2 ? 10 : 0), py = ry * 20;
      const sh = 0.72 + noise2(rx, ry) * 0.5;
      x.fillStyle = `rgb(${clamp(t.r * 255 * sh, 0, 255) | 0},${clamp(t.g * 235 * sh, 0, 255) | 0},${clamp(t.b * 130 * sh, 0, 255) | 0})`;
      x.beginPath(); x.ellipse(px + 10, py + 10, 8, 9, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,220,0.18)';
      x.beginPath(); x.ellipse(px + 7, py + 7, 3, 3.5, 0, 0, 7); x.fill();
    }
    grain(x, 256, 512, 0.03);
    return finishTex(c);
  },
  photo(idx = 0) { // creepy framed family photo
    const [c, x] = makeCanvas(128, 160);
    x.fillStyle = '#7d7361'; x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#6a6252'; x.fillRect(10, 10, 108, 140);
    // silhouettes
    const n = 2 + (idx % 3);
    for (let i = 0; i < n; i++) {
      const px = 30 + i * (70 / n), h = 55 + noise2(i, idx) * 30;
      x.fillStyle = '#2a2620';
      x.beginPath(); x.arc(px, 150 - h, 11, 0, 7); x.fill();
      x.fillRect(px - 13, 150 - h + 8, 26, h - 8);
    }
    grain(x, 128, 160, 0.06, -10);
    return finishTex(c);
  },
  microwaveClock(text = '3:07') {
    const [c, x] = makeCanvas(128, 64);
    x.fillStyle = '#050805'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#39ff6a'; x.font = 'bold 38px monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 64, 34);
    const t = finishTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  },
};

// Load a texture from ASSETS.textures with procedural fallback.
export function loadTexture(key, url) {
  const fallback = () => {
    const gen = PROC_TEXTURES[key];
    return gen ? gen() : PROC_TEXTURES.wall();
  };
  const tex = fallback(); // start procedural immediately; swap in file if it loads
  new THREE.TextureLoader().load(
    url,
    (loaded) => {
      loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
      loaded.repeat.copy(tex.repeat);
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 4;
      tex.image = loaded.image;           // hot-swap pixels, keep material refs
      tex.needsUpdate = true;
    },
    undefined,
    () => console.warn(`[ASSETS] texture "${key}" not found at ${url} — using procedural fallback.`)
  );
  return tex;
}
