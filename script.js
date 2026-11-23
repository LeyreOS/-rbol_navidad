// Árbol de Navidad como nube de puntos 3D (canvas 2D + z-buffer, sin librerías).
// Fases: nieve → follaje crece → base plateada → estrella → cinta → regalos → bolas.

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
let W, H, image, pix, zbuf, SCALE = 1;
function resize() { // el canvas ocupa toda la ventana
  W = canvas.width = innerWidth; H = canvas.height = innerHeight;
  image = ctx.createImageData(W, H);
  pix = new Uint32Array(image.data.buffer);
  zbuf = new Float32Array(W * H);
  SCALE = Math.min(W, H) / 700; // el árbol mantiene su tamaño relativo
  initSnow();
}

const GROUND_Y = 0, TREE_H = 3.2, TREE_R = 1.35, BASE_Y = GROUND_Y + 0.25;

// ---------- utilidades ----------
let seed = 7;
function rand() { // mulberry32
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const uni = (a, b) => a + (b - a) * rand();
function gauss() { return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand()); }
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const pop = (x) => { x = clamp(x); const k = 1.70158, c = k + 1; return 1 + c * (x - 1) ** 3 + k * (x - 1) ** 2; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- nube de puntos ----------
const P = { x: [], y: [], z: [], r: [], g: [], b: [], nx: [], ny: [], nz: [],
            t0: [], dur: [], ax: [], ay: [], az: [], mode: [] };

/** mode 0: crece desde el ancla (con rebote) · mode 1: solo aparece */
function add(pts, cols, nrms, t0, dur, anchor, mode = 0) {
  const n = pts.length;
  if (!anchor) {
    anchor = [0, 0, 0];
    for (const p of pts) { anchor[0] += p[0] / n; anchor[1] += p[1] / n; anchor[2] += p[2] / n; }
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i], c = Array.isArray(cols[0]) ? cols[i] : cols, nn = nrms ? nrms[i] : [0, 1, 0];
    P.x.push(p[0]); P.y.push(p[1]); P.z.push(p[2]);
    P.r.push(c[0]); P.g.push(c[1]); P.b.push(c[2]);
    P.nx.push(nn[0]); P.ny.push(nn[1]); P.nz.push(nn[2]);
    P.t0.push(Array.isArray(t0) ? t0[i] : t0);
    P.dur.push(dur);
    P.ax.push(anchor[0]); P.ay.push(anchor[1]); P.az.push(anchor[2]);
    P.mode.push(mode);
  }
}

function sphere(c, r, n) {
  const pts = [], nr = [];
  for (let i = 0; i < n; i++) {
    let v = [gauss(), gauss(), gauss()];
    const l = Math.hypot(...v); v = v.map((a) => a / l);
    nr.push(v); pts.push([c[0] + v[0] * r, c[1] + v[1] * r, c[2] + v[2] * r]);
  }
  return [pts, nr];
}

function boxFaces([sx, sy, sz], step) {
  const faces = [
    [[-sx/2, 0, -sz/2], [sx, 0, 0], [0, sy, 0], [0, 0, -1]],
    [[-sx/2, 0,  sz/2], [sx, 0, 0], [0, sy, 0], [0, 0, 1]],
    [[-sx/2, 0, -sz/2], [0, 0, sz], [0, sy, 0], [-1, 0, 0]],
    [[ sx/2, 0, -sz/2], [0, 0, sz], [0, sy, 0], [1, 0, 0]],
    [[-sx/2, sy, -sz/2], [sx, 0, 0], [0, 0, sz], [0, 1, 0]],
    [[-sx/2, 0, -sz/2], [sx, 0, 0], [0, 0, sz], [0, -1, 0]],
  ];
  const pts = [], nr = [];
  for (const [o, u, v, n] of faces) {
    const nu = Math.max(2, Math.floor(Math.hypot(...u) / step) + 1);
    const nv = Math.max(2, Math.floor(Math.hypot(...v) / step) + 1);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const s = i / (nu - 1), t = j / (nv - 1);
      pts.push([o[0] + s*u[0] + t*v[0], o[1] + s*u[1] + t*v[1], o[2] + s*u[2] + t*v[2]]);
      nr.push(n);
    }
  }
  return [pts, nr];
}

function treeRadius(h) { // cono con escalones de ramas
  const saw = (h * 6) % 1;
  return TREE_R * (1 - h) * (1 + 0.10 * (1 - saw) - 0.05);
}
function surfacePoint(h, ang, inset = 1) {
  const r = treeRadius(h) * inset;
  return [r * Math.cos(ang), BASE_Y + h * TREE_H, r * Math.sin(ang)];
}

// ---------- construcción de la escena ----------
function buildScene() {
  // Follaje
  {
    const pts = [], cols = [], nr = [];
    for (let i = 0; i < 45000; i++) {
      const h = Math.pow(rand(), 0.85), a = rand() * Math.PI * 2;
      const depth = 1 - Math.pow(rand(), 2.2) * 0.55;
      const r = treeRadius(h) * depth * (1 + gauss() * 0.04);
      pts.push([r * Math.cos(a), BASE_Y + h * TREE_H, r * Math.sin(a)]);
      const l = Math.hypot(Math.cos(a), 0.5, Math.sin(a));
      nr.push([Math.cos(a) / l, 0.5 / l, Math.sin(a) / l]);
      const g = uni(0.55, 1);
      cols.push([0.05 + 0.12 * g * rand(), 0.35 + 0.65 * g, 0.06 + 0.15 * g]);
    }
    add(pts, cols, nr, 0.8, 3.8, [0, BASE_Y + TREE_H * 0.45, 0], 0);
  }
  // Base plateada
  {
    const pts = [], cols = [], t0 = [];
    for (let i = 0; i < 16000; i++) {
      const rr = 1.95 * Math.sqrt(rand()), a = rand() * Math.PI * 2;
      const x = rr * Math.cos(a), z = rr * Math.sin(a);
      pts.push([x, GROUND_Y + gauss() * 0.01, z]);
      const v = 0.72 + ((Math.floor(x * 9) + Math.floor(z * 9)) % 2 + 2) % 2 * 0.15 + gauss() * 0.05;
      cols.push([v, v, v + 0.05]);
      t0.push(2.4 + rr / 1.95);
    }
    add(pts, cols, null, t0, 0.5, null, 1);
  }
  // Estrella
  {
    const top = [0, BASE_Y + TREE_H + 0.12, 0], poly = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 0.11 : 0.26;
      poly.push([rad * Math.cos(a), rad * Math.sin(a)]);
    }
    const pts = [], cols = [], nr = [];
    for (let i = 0; i < 2200; i++) {
      const k = Math.floor(rand() * 10), p1 = poly[k], p2 = poly[(k + 1) % 10];
      let u = rand(), w = rand(); if (u + w > 1) { u = 1 - u; w = 1 - w; }
      pts.push([top[0] + p1[0]*u + p2[0]*w, top[1] + p1[1]*u + p2[1]*w, uni(-0.05, 0.05)]);
      const s = uni(0.85, 1.1);
      cols.push([1 * s, 0.78 * s, 0.15 * s]); nr.push([0, 0, 1]);
    }
    add(pts, cols, nr, 5.0, 0.9, top, 0);
  }
  // Cinta roja en espiral (se dibuja de arriba abajo)
  {
    const pts = [], cols = [], t0 = [], K = 4500;
    for (let i = 0; i < K; i++) {
      const s = 0.04 + 0.89 * i / (K - 1);
      const p = surfacePoint(1 - s, 4.2 * 2 * Math.PI * s, 1.04);
      pts.push([p[0] + gauss() * 0.012, p[1] + gauss() * 0.012, p[2] + gauss() * 0.012]);
      const v = uni(0.8, 1.15); cols.push([0.88 * v, 0.1 * v, 0.12 * v]);
      t0.push(6 + s * 3.2);
    }
    add(pts, cols, null, t0, 0.3, null, 1);
  }
  // Regalos [ángulo°, radio, tamaño, color, giro°, retardo]
  const gifts = [
    [25, 1.55, [0.30, 0.28, 0.34], [0.15, 0.30, 0.90], 10, 9.0],
    [-5, 1.50, [0.34, 0.30, 0.34], [0.90, 0.15, 0.12], -8, 9.8],
    [155, 1.38, [0.26, 0.34, 0.26], [0.55, 0.22, 0.75], 20, 10.6],
    [115, 1.44, [0.38, 0.30, 0.34], [0.15, 0.62, 0.25], 5, 11.2],
    [65, 1.15, [0.22, 0.14, 0.22], [0.90, 0.20, 0.15], 30, 12.0],
    [195, 1.20, [0.30, 0.22, 0.30], [0.95, 0.75, 0.20], -25, 12.6],
  ];
  const ribbon = [0.98, 0.9, 0.55];
  for (const [deg, rad, s0, colr, yaw, delay] of gifts) {
    const size = s0.map((v) => v * 1.5);
    let [pts, nr] = boxFaces(size, 0.016);
    const cols = pts.map((p) => {
      const onRib = Math.abs(p[0]) < 0.025 || Math.abs(p[2]) < 0.025, v = uni(0.85, 1.05);
      return onRib ? ribbon : [colr[0] * v, colr[1] * v, colr[2] * v];
    });
    for (const sg of [-1, 1]) { // lazo
      const [q, nn] = sphere([sg * 0.05, size[1] + 0.04, 0], 0.045, 90);
      pts = pts.concat(q); nr = nr.concat(nn); for (let i = 0; i < q.length; i++) cols.push(ribbon);
    }
    const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
    const a = deg * Math.PI / 180, pos = [rad * Math.cos(a), GROUND_Y + 0.01, rad * Math.sin(a)];
    const rot = ([x, y, z]) => [x * cy + z * sy, y, -x * sy + z * cy];
    add(pts.map((p) => { const r = rot(p); return [r[0] + pos[0], r[1] + pos[1], r[2] + pos[2]]; }),
        cols, nr.map(rot), delay, 0.6, pos, 0);
  }
  // Bolas de colores
  const palette = [[0.92, 0.12, 0.12], [0.15, 0.35, 0.95], [1, 0.76, 0.15], [0.95, 0.45, 0.7], [0.9, 0.9, 0.95], [0.95, 0.5, 0.1]];
  const L = [-0.4, 0.8, 0.5];
  for (let i = 0; i < 70; i++) {
    const hh = uni(0.08, 0.88), pos = surfacePoint(hh, uni(0, Math.PI * 2), 1.03);
    const [q, nn] = sphere(pos, uni(0.055, 0.095) * (1.1 - 0.5 * hh), 160);
    const base = pick(palette);
    const cols = nn.map((n) => {
      const l = clamp(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]), s = 0.55 + 0.6 * l, sp = clamp(l - 0.88) * 6;
      return [clamp(base[0] * s + sp), clamp(base[1] * s + sp), clamp(base[2] * s + sp)];
    });
    add(q, cols, nn, 10 + (1 - hh) * 0.6 + rand() * 4, 0.5, pos, 0);
  }
}

// ---------- nieve ----------
// La nieve vive en coordenadas de pantalla (u,v ∈ 0..1) + profundidad, así cubre
// siempre toda la ventana, sea cual sea su tamaño. La profundidad decide si cae
// delante o detrás del árbol.
let snow = [];
function initSnow() {
  const n = Math.round((W * H) / 600);
  snow = [];
  for (let i = 0; i < n; i++) snow.push({ u: rand(), v: rand(), d: uni(3, 14), s: uni(0.03, 0.09), ph: uni(0, 6.28) });
}

// ---------- render ----------
buildScene();
const N = P.x.length;
const F = {}; for (const k in P) F[k] = new Float32Array(P[k]);
const jitter = new Float32Array(N).map(() => uni(0.88, 1.08));
const slow = F.dur.map((d) => (d > 2 ? 1 : 0)); // el follaje crece suave, sin rebote

const CAM_D = 8, CENTRE = [0, 1.7, 0], TILT = (-16 * Math.PI) / 180;
const LIGHT = (() => { const l = [-0.4, 0.7, 0.6], m = Math.hypot(...l); return l.map((v) => v / m); })();

function plot(x, y, z, color, size) {
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
    const idx = yy * W + xx;
    if (z < zbuf[idx]) { zbuf[idx] = z; pix[idx] = color; }
  }
}
const rgba = (r, g, b) => (255 << 24) | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255);

let yawOffset = 0;

function render(t) {
  const FOCAL = 1050 * SCALE, PT = SCALE > 1.5 ? 3 : 2;
  pix.fill(0xff000000); zbuf.fill(Infinity);
  const yaw = 0.35 * t + 0.4 + yawOffset, cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(TILT), sx = Math.sin(TILT);
  // R = Rx(tilt) · Ry(yaw)
  const R = [
    [cy, 0, sy],
    [sx * sy, cx, -sx * cy],
    [-cx * sy, sx, cx * cy],
  ];
  // luz en espacio-objeto para no rotar las normales: n·(Rᵀ·L)
  const Lw = [0, 1, 2].map((j) => R[0][j] * LIGHT[0] + R[1][j] * LIGHT[1] + R[2][j] * LIGHT[2]);

  for (let i = 0; i < N; i++) {
    const k = (t - F.t0[i]) / F.dur[i];
    if (k <= 0) continue;
    let s = F.mode[i] === 0 ? pop(k) : 1;
    if (slow[i]) s = 0.12 + 0.88 * smooth(k);
    const x = F.ax[i] + (F.x[i] - F.ax[i]) * s - CENTRE[0];
    const y = F.ay[i] + (F.y[i] - F.ay[i]) * s - CENTRE[1];
    const z = F.az[i] + (F.z[i] - F.az[i]) * s - CENTRE[2];
    const qx = R[0][0] * x + R[0][1] * y + R[0][2] * z;
    const qy = R[1][0] * x + R[1][1] * y + R[1][2] * z;
    const qz = R[2][0] * x + R[2][1] * y + R[2][2] * z + CAM_D;
    if (qz < 0.5) continue;
    const px = (qx * FOCAL / qz + W / 2) | 0, py = (-qy * FOCAL / qz + H / 2 + 30) | 0;
    const shade = 0.45 + 0.65 * clamp(F.nx[i] * Lw[0] + F.ny[i] * Lw[1] + F.nz[i] * Lw[2]);
    const m = shade * clamp(1.25 - (qz - 6) * 0.12, 0.5, 1.2) * jitter[i] * 255;
    plot(px, py, qz, rgba(F.r[i] * m, F.g[i] * m, F.b[i] * m), PT);
  }
  if (t > 0.2) {
    for (const f of snow) {
      const near = 1 - (f.d - 3) / 11;                       // 0 lejos · 1 cerca
      const x = ((f.u + 0.012 * Math.sin(t * 0.8 + f.ph)) % 1 + 1) % 1 * W;
      const y = (((f.v + f.s * t * (0.6 + near)) % 1) + 1) % 1 * H;
      const b = 0.35 + 0.65 * near;
      plot(x | 0, y | 0, f.d, rgba(200 * b, 210 * b, 225 * b), near > 0.6 ? Math.ceil(PT * 1.5) : PT);
    }
  }
  ctx.putImageData(image, 0, 0);
}

// ---------- bucle e interacción ----------
const fixed = new URLSearchParams(location.search).get("t"); // ?t=16 → fotograma fijo
let start = performance.now();
function loop(now) {
  render(fixed !== null ? parseFloat(fixed) : (now - start) / 1000);
  if (fixed === null) requestAnimationFrame(loop);
}
resize();
addEventListener("resize", resize);
requestAnimationFrame(loop);

const restart = () => { start = performance.now(); yawOffset = 0; };
addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "r") restart(); });
let drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x; if (Math.abs(dx) > 2) drag.moved = true;
  yawOffset += dx * 0.01; drag.x = e.clientX;
});
canvas.addEventListener("pointerup", () => { if (drag && !drag.moved) restart(); drag = null; });
