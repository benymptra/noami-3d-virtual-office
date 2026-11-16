// Shared geometry, materials and canvas helpers for the 3D office.
// Identical shapes share one GPU buffer; static desk parts are merged into one mesh per material.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { V2 } from "./plan";

const cache = new Map<string, unknown>();
export function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

export const RB = (w: number, h: number, d: number, r = 0.05, s = 2) =>
  memo(`rb${w},${h},${d},${r},${s}`, () => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
export const BOX = (w: number, h: number, d: number) => memo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const CYL = (a: number, b: number, h: number, s = 12, open = false, t0 = 0, tl = Math.PI * 2) =>
  memo(`cyl${a},${b},${h},${s},${open},${t0},${tl}`, () => new THREE.CylinderGeometry(a, b, h, s, 1, open, t0, tl));
export const PLANE = (w: number, h: number) => memo(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h));

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...o });
export const glow = (c: string, k = 2.2, o: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, ...o });

export const M = memo("materials", () => ({
  slabSide: std("#2a3950", { roughness: 0.4, metalness: 0.6 }), slabSide2: std("#1d2838", { roughness: 0.45, metalness: 0.6 }),
  desk: std("#2c3a50", { roughness: 0.45, metalness: 0.5 }), deskTop: std("#3a4b66", { roughness: 0.35, metalness: 0.45 }),
  dark: std("#0d131c", { roughness: 0.6 }), chair: std("#18212f", { roughness: 0.7 }),
  bot: std("#8697b0", { roughness: 0.3, metalness: 0.75 }), botDark: std("#2b384c", { roughness: 0.4, metalness: 0.6 }),
  skin: std("#e2b995", { metalness: 0, roughness: 0.8 }), hair: std("#1a1410", { metalness: 0, roughness: 0.9 }), pants: std("#1c2433", { metalness: 0.1 }),
  glassBand: new THREE.MeshStandardMaterial({ color: "#2fd6b4", transparent: true, opacity: 0.16, emissive: "#0b5d52", emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  rail: new THREE.MeshStandardMaterial({ color: "#7fe9d3", transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }),
  plant: std("#2a7d68", { metalness: 0, roughness: 0.8, flatShading: true }), plant2: std("#3a9b7f", { metalness: 0, roughness: 0.8, flatShading: true }),
  pot: std("#c8d3e2", { metalness: 0.1, roughness: 0.5 }), sofa: std("#2a3a55", { metalness: 0.05, roughness: 0.85 }), cushion: std("#3b5577", { metalness: 0.05, roughness: 0.9 }),
  rug: std("#121b29", { metalness: 0, roughness: 1 }), white: std("#d9e2ee", { metalness: 0.1, roughness: 0.4 }),
  floor: (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!;
    g.fillStyle = "#152031"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "rgba(140,170,210,.10)"; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.4 });
  })(),
}));

/** Merge [geometry, material, x, y, z] parts into one geometry per material. */
export function mergeParts(parts: [THREE.BufferGeometry, THREE.Material, number, number, number][]) {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [geo, mat, x, y, z] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.translate(x, y, z);
    if (!by.has(mat)) by.set(mat, []);
    by.get(mat)!.push(g);
  }
  return [...by].map(([mat, list]) => { const m = mergeGeometries(list, false)!; list.forEach(g => g.dispose()); return [m, mat] as const; });
}

export const deskParts = () => memo("desk", () => mergeParts([
  [RB(1.5, 0.07, 0.8, 0.03), M.deskTop, 0, 0.74, 0],
  ...([[-0.68, -0.33], [0.68, -0.33], [-0.68, 0.33], [0.68, 0.33]] as V2[]).map(([x, z]) => [BOX(0.05, 0.72, 0.05), M.dark, x, 0.36, z] as [THREE.BufferGeometry, THREE.Material, number, number, number]),
  [BOX(1.36, 0.28, 0.03), M.desk, 0, 0.56, -0.36],
  [CYL(0.03, 0.03, 0.22, 8), M.dark, 0, 0.88, -0.24], [RB(0.3, 0.03, 0.18, 0.01), M.dark, 0, 0.785, -0.24], [RB(0.96, 0.58, 0.05, 0.02), M.dark, 0, 1.15, -0.24],
  [RB(0.5, 0.025, 0.16, 0.01), M.botDark, 0, 0.79, 0.08], [CYL(0.045, 0.04, 0.1, 10), M.white, 0.5, 0.83, 0.1],
  [RB(0.55, 0.08, 0.5, 0.03), M.chair, 0, 0.46, 0.74], [RB(0.55, 0.62, 0.07, 0.03), M.chair, 0, 0.8, 1],
  [CYL(0.03, 0.03, 0.38, 8), M.dark, 0, 0.24, 0.74], [CYL(0.24, 0.24, 0.03, 10), M.dark, 0, 0.04, 0.74],
]));

export const plantParts = (s: number) => memo(`plant${s}`, () => mergeParts([
  [CYL(0.28 * s, 0.22 * s, 0.5 * s, 14), M.pot, 0, 0.25 * s, 0],
  [memo(`ico${0.42 * s}`, () => new THREE.IcosahedronGeometry(0.42 * s, 0)), M.plant, 0, 0.78 * s, 0],
  [memo(`ico${0.3 * s}`, () => new THREE.IcosahedronGeometry(0.3 * s, 0)), M.plant2, 0.18 * s, 1.02 * s, 0.08 * s],
  [memo(`ico${0.26 * s}`, () => new THREE.IcosahedronGeometry(0.26 * s, 0)), M.plant, -0.16 * s, 1.08 * s, -0.1 * s],
]));

// ---- floor outline helpers ----
function area(p: V2[]) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
/** Offset a right-angled polygon inwards by d. */
export function inset(p: V2[], d: number): V2[] {
  const s = area(p) > 0 ? 1 : -1, n = p.length;
  const nrm = (a: V2, b: V2): V2 => { const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez); return s > 0 ? [-ez / L, ex / L] : [ez / L, -ex / L]; };
  return p.map((c, i) => { const n1 = nrm(p[(i - 1 + n) % n], c), n2 = nrm(c, p[(i + 1) % n]); return [c[0] + d * (n1[0] + n2[0]), c[1] + d * (n1[1] + n2[1])] as V2; });
}
export function rounded<T extends THREE.Path>(target: T, pts: V2[], r: number): T {
  const P = pts.map(([x, z]) => new THREE.Vector2(x, -z)), n = P.length;
  for (let i = 0; i < n; i++) {
    const p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const s = p.clone().add(a.clone().sub(p).normalize().multiplyScalar(r)), e = p.clone().add(b.clone().sub(p).normalize().multiplyScalar(r));
    if (i === 0) target.moveTo(s.x, s.y); else target.lineTo(s.x, s.y);
    target.quadraticCurveTo(p.x, p.y, e.x, e.y);
  }
  target.closePath(); return target;
}
/** Extruded slab from y0 to y1 (optionally a ring when hole is given). */
export function slabGeo(pts: V2[], r: number, y0: number, y1: number, hole?: V2[]) {
  const sh = rounded(new THREE.Shape(), pts, r);
  if (hole) sh.holes.push(rounded(new THREE.Path(), hole, r));
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return { geo: g, shape: sh };
}
export function outlinePts(shape: THREE.Shape, y: number) {
  const pts = shape.getPoints(10).map(p => new THREE.Vector3(p.x, y, -p.y)); pts.push(pts[0].clone()); return pts;
}
export function mullionGeo(pts: V2[], y0: number, y1: number, step = 1.3) {
  const v: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]; const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let k = 1; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; v.push(x, y0, z, x, y1, z); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); return g;
}

export function canvasTex(w: number, h: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, g: c.getContext("2d")!, t };
}
export function floorTextTex(text: string) {
  return memo(`ft:${text}`, () => {
    const { g, t } = canvasTex(1024, 128);
    g.font = '600 64px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = "rgba(235,242,250,.24)"; g.textBaseline = "middle";
    g.fillText(text.toUpperCase().split("").join(String.fromCharCode(8202)), 12, 68); t.needsUpdate = true; return t;
  });
}
