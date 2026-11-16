"use client";
// The 3D isometric office. Reads a Plan (layout.ts) built from the live Office data; every click goes back
// to the 2D UI through callbacks, so all actions still go through the existing Multica API routes.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  FLOOR, LY, levelY, MEET_CENTER, ELEVATOR, CORRIDOR_Z, STATE_COLOR, STATE_LABEL, isGone, slotCap, FURNITURE,
  type Plan, type Seat, type Zone, type Slot, type V2, type VisualState,
} from "./plan";
import { M, RB, BOX, CYL, PLANE, glow, deskParts, plantParts, inset, rounded, slabGeo, outlinePts, mullionGeo, canvasTex, floorTextTex, memo } from "./geo";
import { officeStore, useOffice } from "./store";
import { chars, staticAnchors, labelEls } from "./anchors";

export type RuntimeView = { id: string; name: string; owner: string | null; online: boolean; quotaOut: boolean };
export type SceneProps = {
  plan: Plan; runtimes: RuntimeView[]; counts: { working: number; review: number; failed: number };
  officeOpen: boolean;
  offsets: Record<string, V2>; onOffsets: (o: Record<string, V2>, done: boolean) => void;
  onSeat: (s: Seat) => void; onZone: (z: Zone) => void; onRuntime: (id: string) => void; onSlot: (s: Slot) => void;
  onHover: (h: { title: string; sub: string; x: number; y: number } | null) => void;
  onHoverSeat: (key: string | null) => void;
};

const UP = new THREE.Vector3(0, 1, 0);
const R = 1.4;
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ======================= building ======================= */
function Line({ points, color, k = 1.4, opacity = 1 }: { points: THREE.Vector3[]; color: string; k?: number; opacity?: number }) {
  const obj = useMemo(() => new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), transparent: opacity < 1, opacity, toneMapped: false })), [points, color, k, opacity]);
  return <primitive object={obj} />;
}
function Segments({ geo, opacity = 0.35 }: { geo: THREE.BufferGeometry; opacity?: number }) {
  const obj = useMemo(() => new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#3ee6c1", transparent: true, opacity })), [geo, opacity]);
  return <primitive object={obj} />;
}

function Level({ n }: { n: number }) {
  const g = useMemo(() => {
    const y = levelY(n), inA = inset(FLOOR, 0.4);
    const top = slabGeo(FLOOR, R, y - 0.5, y);
    const rail = slabGeo(inset(FLOOR, 0.12), R, y, y + 0.95, inset(FLOOR, 0.2));
    const railTop = outlinePts(rounded(new THREE.Shape(), inset(FLOOR, 0.16), R), y + 0.95);
    const out: { band?: THREE.BufferGeometry; mull?: THREE.BufferGeometry; mid?: THREE.BufferGeometry; band2?: THREE.BufferGeometry; mull2?: THREE.BufferGeometry; base?: THREE.BufferGeometry; baseShape?: THREE.Shape } = {};
    if (n === 1) {
      out.band = slabGeo(inA, R, -2.3, -0.5).geo; out.mull = mullionGeo(inA, -2.3, -0.5);
      out.mid = slabGeo(FLOOR, R, -2.85, -2.3).geo;
      out.band2 = slabGeo(inA, R, -4.6, -2.85).geo; out.mull2 = mullionGeo(inA, -4.6, -2.85);
      const b = slabGeo(FLOOR, R, -5.15, -4.6); out.base = b.geo; out.baseShape = b.shape;
    } else {
      out.band = slabGeo(inA, R, levelY(n - 1) + 1, y - 0.5).geo; out.mull = mullionGeo(inA, levelY(n - 1) + 1, y - 0.5);
    }
    return { y, top, rail, railTop, edge: outlinePts(top.shape, y + 0.012), under: outlinePts(top.shape, y - 0.5), ...out };
  }, [n]);
  return (
    <group>
      <mesh geometry={g.top.geo} material={[M.floor, M.slabSide]} receiveShadow castShadow={n > 1} />
      <Line points={g.edge} color="#3ee6c1" k={1.4} opacity={0.9} />
      <Line points={g.under} color="#3ee6c1" k={1} opacity={0.5} />
      <mesh geometry={g.rail.geo} material={M.rail} />
      <Line points={g.railTop} color="#9ff5e0" k={1.3} opacity={0.75} />
      {g.band && <mesh geometry={g.band} material={M.glassBand} />}
      {g.mull && <Segments geo={g.mull} />}
      {g.mid && <mesh geometry={g.mid} material={[M.slabSide2, M.slabSide]} receiveShadow />}
      {g.band2 && <mesh geometry={g.band2} material={M.glassBand} />}
      {g.mull2 && <Segments geo={g.mull2} />}
      {g.base && <mesh geometry={g.base} material={M.slabSide2} />}
      {g.baseShape && <Line points={outlinePts(g.baseShape, -5.16)} color="#3ee6c1" k={0.9} opacity={0.4} />}
    </group>
  );
}

function Ground() {
  return (
    <group position={[0, -5.4, 0]}>
      <gridHelper args={[220, 110, "#16202e", "#0e1520"]} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial opacity={0.35} /></mesh>
    </group>
  );
}

/* ======================= zones ======================= */
function ZonePlate({ z, onZone, onHover }: { z: Zone; onZone: SceneProps["onZone"]; onHover: SceneProps["onHover"] }) {
  const w = z.x1 - z.x0, d = z.z1 - z.z0, fw = Math.min(w * 0.8, 6.4);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color(z.tint).lerp(new THREE.Color("#152031"), 0.86), roughness: 0.5, metalness: 0.4 }), [z.tint]);
  const border = useMemo(() => outlinePts(rounded(new THREE.Shape(), [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0.25), 0.06), [w, d]);
  const grow = useRef<THREE.Group>(null);
  const born = useRef(performance.now());
  useFrame(() => { // new rooms grow out of the floor
    if (!grow.current) return; const k = Math.min(1, (performance.now() - born.current) / 650);
    const e = k >= 1 ? 1 : Math.max(0.01, 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2));
    grow.current.scale.set(e, 1, e);
  });
  return (
    <group ref={grow} position={[(z.x0 + z.x1) / 2, levelY(z.level), (z.z0 + z.z1) / 2]}>
      <mesh geometry={RB(w, 0.05, d, 0.25, 3)} material={mat} position-y={0.025} receiveShadow
        onClick={e => { e.stopPropagation(); onZone(z); }}
        onPointerOver={e => { e.stopPropagation(); onHover({ title: z.name, sub: z.progress ?? (z.kind === "srv" ? "AI engines (runtimes)" : z.kind === "meet" ? "Standups happen here" : ""), x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
        onPointerOut={() => onHover(null)} />
      <Line points={border} color={z.tint} k={1.2} opacity={0.55} />
      <mesh geometry={PLANE(fw, fw / 8)} rotation-x={-Math.PI / 2} position={[-w / 2 + fw / 2 + 0.3, 0.06, d / 2 - 0.42]}>
        <meshBasicMaterial map={floorTextTex(z.name)} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

function GhostSlot({ s, show, onSlot }: { s: Slot; show: boolean; onSlot: SceneProps["onSlot"] }) {
  const w = s.x1 - s.x0, d = s.z1 - s.z0;
  useEffect(() => { staticAnchors.set(`slot:${s.id}`, new THREE.Vector3((s.x0 + s.x1) / 2, levelY(s.level) + 0.4, (s.z0 + s.z1) / 2)); return () => { staticAnchors.delete(`slot:${s.id}`); }; }, [s]);
  const line = useMemo(() => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([x, z]) => new THREE.Vector3(x, 0.07, z))),
      new THREE.LineDashedMaterial({ color: new THREE.Color("#3ee6c1").multiplyScalar(1.5), dashSize: 0.4, gapSize: 0.28, toneMapped: false }));
    l.computeLineDistances(); return l;
  }, [w, d]);
  if (!show) return null;
  return (
    <group position={[(s.x0 + s.x1) / 2, levelY(s.level), (s.z0 + s.z1) / 2]}>
      <mesh geometry={RB(w, 0.03, d, 0.25, 3)} position-y={0.02} onClick={e => { e.stopPropagation(); onSlot(s); }}>
        <meshBasicMaterial color="#3ee6c1" transparent opacity={0.05} depthWrite={false} />
      </mesh>
      <primitive object={line} />
    </group>
  );
}

/* ======================= desks & people ======================= */
type ScreenFn = (t: number) => void;
const screens = new Set<ScreenFn>();

function drawMonitor(g: CanvasRenderingContext2D, st: VisualState, human: boolean, t: number, phase: number) {
  const W = 160, H = 96; g.clearRect(0, 0, W, H);
  if (isGone(st)) { g.fillStyle = "#05080d"; g.fillRect(0, 0, W, H); return; }
  if (human) {
    g.fillStyle = "#0f1a2a"; g.fillRect(0, 0, W, H); g.fillStyle = "#1f3048"; g.fillRect(0, 0, W, 14);
    for (let i = 0; i < 5; i++) { g.fillStyle = i === 0 ? "#3ee6c1" : "#2c4060"; g.fillRect(8, 22 + i * 14, 8, 8); g.fillStyle = "#3c5476"; g.fillRect(22, 24 + i * 14, 60 + ((i * 37) % 60), 4); }
    return;
  }
  g.fillStyle = ({ working: "#06231f", review: "#241a07", failed: "#2a0a0f", ready: "#0b1530", break: "#140f2a" } as Record<string, string>)[st] ?? "#05080d"; g.fillRect(0, 0, W, H);
  if (st === "working") {
    const off = Math.floor(t * 6 + phase * 10);
    for (let i = 0; i < 9; i++) { const k = (off + i) % 17; g.fillStyle = ["#3ee6c1", "#7aa2ff", "#5c6f8c", "#c4b5ff"][k % 4]; g.fillRect(8 + (k % 4) * 8, 6 + i * 10, 20 + ((k * 53) % 90), 4); }
  } else if (st === "review") { // a diff on screen
    g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, 0, W, 12); g.fillStyle = "#f5b84b"; g.fillRect(6, 4, 40, 4);
    for (let i = 0; i < 8; i++) { const a = [1, 1, 0, 2, 2, 1, 0, 2][i];
      g.fillStyle = a === 1 ? "rgba(62,230,193,.22)" : a === 2 ? "rgba(255,93,108,.22)" : "transparent"; g.fillRect(0, 16 + i * 10, W, 9);
      g.fillStyle = a === 1 ? "#7cf3d9" : a === 2 ? "#ff8d98" : "#5c6f8c"; g.fillRect(6, 19 + i * 10, 4, 3); g.fillRect(16, 19 + i * 10, 30 + ((i * 41) % 90), 3); }
  } else if (st === "failed") {
    g.fillStyle = Math.floor(t * 2.5) % 2 ? "#ff5d6c" : "#7a1d28"; g.font = "bold 22px monospace"; g.fillText("ERROR", 36, 50);
  } else if (st === "ready") {
    g.fillStyle = "#7aa2ff"; g.font = "12px monospace"; g.fillText("> ready", 10, 22); if (Math.floor(t * 2) % 2) g.fillRect(10, 30, 7, 11);
  } else if (st === "break") {
    g.fillStyle = "#a08cff"; g.globalAlpha = 0.6; g.beginPath(); g.arc(80 + Math.sin(t) * 30, 48 + Math.cos(t * 1.3) * 16, 10, 0, 7); g.fill(); g.globalAlpha = 1;
  }
}

function DeskModel({ seat, edit, onSeat, offsets, setDrag }: {
  seat: Seat; edit: boolean; onSeat: SceneProps["onSeat"]; offsets: SceneProps["offsets"];
  setDrag: (d: DragState) => void;
}) {
  const parts = deskParts();
  const scr = useMemo(() => canvasTex(160, 96), []);
  const phase = useMemo(() => Math.random() * 10, []);
  useEffect(() => {
    const human = seat.kind === "human";
    const f: ScreenFn = t => { drawMonitor(scr.g, seat.state, human, t, phase); scr.t.needsUpdate = true; };
    f(0); screens.add(f); return () => { screens.delete(f); };
  }, [scr, seat.state, seat.kind, phase]);
  useEffect(() => () => scr.t.dispose(), [scr]);
  const papers = Math.min(seat.papers, 6);
  return (
    <group position={[seat.x, levelY(seat.level), seat.z]} rotation-y={seat.rot}
      onClick={e => { e.stopPropagation(); if (!edit) onSeat(seat); }}
      onPointerDown={e => { if (!edit || e.button !== 0) return; e.stopPropagation(); setDrag({ key: seat.key, o0: offsets[seat.key] ?? [0, 0], grab: [e.point.x, e.point.z], y: levelY(seat.level) }); }}>
      {parts.map(([geo, mat], i) => <mesh key={i} geometry={geo} material={mat} castShadow receiveShadow />)}
      <mesh geometry={PLANE(0.9, 0.52)} position={[0, 1.15, -0.212]}><meshBasicMaterial map={scr.t} toneMapped={false} /></mesh>
      {Array.from({ length: papers }, (_, k) => <mesh key={k} geometry={BOX(0.26, 0.012, 0.34)} material={M.white} position={[-0.48, 0.79 + k * 0.018, 0.1 + (k % 2) * 0.02]} rotation-y={(k % 3 - 1) * 0.12} />)}
      {edit && <mesh geometry={BOX(1.7, 0.02, 1.9)} position={[0, 0.02, 0.3]}><meshBasicMaterial color="#3ee6c1" transparent opacity={0.12} depthWrite={false} /></mesh>}
    </group>
  );
}

type Station = { x: number; z: number; rot: number; mode: "seat" | "sofa" | "stand"; y: number };

function Character({ seat, station, color, speaking, onSeat, onHoverSeat }: {
  seat: Seat; station: Station; color: string; speaking: boolean; onSeat: SceneProps["onSeat"]; onHoverSeat: SceneProps["onHoverSeat"];
}) {
  const bot = seat.kind === "agent";
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null), armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null), gem = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null);
  const mats = useMemo(() => ({ visor: glow(color, 2.4), gem: glow(color, 2.6), ring: glow(color, 1.6, { transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }) }), [color]);
  const torso = useMemo(() => bot ? M.bot : new THREE.MeshStandardMaterial({ color: ["#3ee6c1", "#c4b5ff", "#f8c977", "#ff9aa3", "#7aa2ff"][seat.name.length % 5], metalness: 0.05, roughness: 0.75 }), [bot, seat.name]);
  const phase = useMemo(() => Math.random() * 10, []);
  const path = useRef<THREE.Vector3[]>([]);
  const mode = useRef<Station["mode"] | "walk">(station.mode);

  // Walk to a new station along the corridor (only on Level 1; upper floors just teleport).
  useEffect(() => {
    const r = root.current; if (!r) return;
    const y = levelY(seat.level);
    const to = new THREE.Vector3(station.x, y + station.y, station.z);
    if (r.position.lengthSq() === 0 || seat.level > 1 || reduced()) { r.position.copy(to); r.rotation.y = station.rot; mode.current = station.mode; path.current = []; return; }
    if (r.position.distanceTo(to) < 0.05) return;
    const back = new THREE.Vector3(0, 0, -0.7).applyAxisAngle(UP, r.rotation.y).add(r.position).setY(0);
    path.current = [back, new THREE.Vector3(back.x, 0, CORRIDOR_Z), new THREE.Vector3(to.x, 0, CORRIDOR_Z), to.clone()];
    mode.current = "walk"; r.position.y = 0;
  }, [station.x, station.z, station.rot, station.mode, station.y, seat.level]);
  useEffect(() => { const r = root.current; if (r) chars.set(seat.key, r); return () => { chars.delete(seat.key); }; }, [seat.key]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const r = root.current; if (!r || !body.current) return;
    const dt = Math.min(dtRaw, 0.1), t = performance.now() / 1000;
    if (mode.current === "walk" && path.current.length) {
      tmp.copy(path.current[0]).sub(r.position); tmp.y = 0; const d = tmp.length();
      if (d < 0.06) { path.current.shift(); if (!path.current.length) { mode.current = station.mode; r.rotation.y = station.rot; r.position.y = levelY(seat.level) + station.y; } }
      else { tmp.normalize(); r.position.addScaledVector(tmp, Math.min(d, dt * 2.6)); let dr = Math.atan2(tmp.x, tmp.z) - r.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); r.rotation.y += dr * Math.min(1, dt * 12); }
    }
    const m = mode.current, sit = m === "seat" || m === "sofa", walking = m === "walk";
    const sw = walking ? Math.sin(t * 10 + phase) * 0.6 : 0;
    legL.current!.rotation.x = sit ? -Math.PI / 2 : sw; legR.current!.rotation.x = sit ? -Math.PI / 2 : -sw;
    body.current.position.y = walking ? Math.abs(Math.sin(t * 10 + phase)) * 0.04 : 0;
    const typing = m === "seat" && (seat.state === "working" || seat.state === "here");
    const k = seat.kind === "human" ? 6 : 18;
    armL.current!.rotation.x = typing ? -1.15 + Math.sin(t * k + phase) * 0.08 : walking ? -sw * 0.8 : speaking ? -0.6 + Math.sin(t * 4) * 0.4 : 0;
    armR.current!.rotation.x = typing ? -1.15 + Math.sin(t * k + phase + 1.6) * 0.08 : walking ? sw * 0.8 : 0;
    head.current!.rotation.y = m === "sofa" ? Math.sin(t * 0.5 + phase) * 0.35 : seat.state === "ready" ? Math.sin(t * 0.8 + phase) * 0.25 : 0;
    head.current!.rotation.x = seat.state === "failed" && m === "seat" ? 0.25 : 0;
    if (gem.current) { gem.current.position.y = 1.85 + Math.sin(t * 2.4 + phase) * 0.07 + (speaking ? 0.15 : 0); gem.current.rotation.y = t * 1.6;
      gem.current.scale.setScalar((seat.state === "review" ? 1.25 : 1) * (seat.state === "failed" && Math.sin(t * 8) < 0 ? 0.25 : 1)); }
    if (ring.current) { mats.ring.opacity = seat.state === "working" ? 0.5 + Math.sin(t * 3 + phase) * 0.25 : seat.state === "failed" ? (Math.sin(t * 8) > 0 ? 0.8 : 0.2) : 0.45; }
  });

  return (
    <group ref={root} onClick={e => { e.stopPropagation(); onSeat(seat); }}
      onPointerOver={e => { e.stopPropagation(); onHoverSeat(seat.key); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHoverSeat(null); document.body.style.cursor = ""; }}>
      <group ref={body}>
        <Limb refObj={legL} x={-0.11} y={0.46} w={0.15} h={0.44} d={0.17} mat={bot ? M.botDark : M.pants} />
        <Limb refObj={legR} x={0.11} y={0.46} w={0.15} h={0.44} d={0.17} mat={bot ? M.botDark : M.pants} />
        <mesh geometry={RB(0.5, 0.52, 0.32, 0.1, 3)} material={torso} position-y={0.74} castShadow />
        <Limb refObj={armL} x={-0.31} y={0.96} w={0.11} h={0.4} d={0.12} mat={bot ? M.botDark : torso} />
        <Limb refObj={armR} x={0.31} y={0.96} w={0.11} h={0.4} d={0.12} mat={bot ? M.botDark : torso} />
        <group ref={head} position-y={1.24}>
          {bot ? (<>
            <mesh geometry={RB(0.46, 0.38, 0.4, 0.1, 3)} material={M.bot} castShadow />
            <mesh geometry={RB(0.38, 0.11, 0.03, 0.02)} material={mats.visor} position={[0, 0.02, 0.2]} />
            <mesh geometry={CYL(0.012, 0.012, 0.16, 6)} material={M.botDark} position-y={0.27} />
            <mesh geometry={memo("sph.035", () => new THREE.SphereGeometry(0.035, 10, 8))} material={mats.visor} position-y={0.36} />
          </>) : (<>
            <mesh geometry={memo("sph.2", () => new THREE.SphereGeometry(0.2, 18, 14))} material={M.skin} castShadow />
            <mesh geometry={memo("hair", () => new THREE.SphereGeometry(0.212, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55))} material={M.hair} position={[0, 0.02, -0.01]} rotation-x={-0.25} />
          </>)}
        </group>
        {bot && <mesh geometry={PLANE(0.16, 0.06)} material={mats.visor} position={[0, 0.8, 0.161]} />}
      </group>
      {bot && <mesh ref={ring} geometry={memo("ring", () => new THREE.RingGeometry(0.44, 0.52, 40))} material={mats.ring} rotation-x={-Math.PI / 2} position-y={0.07} />}
      {bot && <mesh ref={gem} geometry={memo("octa", () => new THREE.OctahedronGeometry(0.11, 0))} material={mats.gem} position-y={1.85} />}
    </group>
  );
}
function Limb({ refObj, x, y, w, h, d, mat }: { refObj: React.RefObject<THREE.Group | null>; x: number; y: number; w: number; h: number; d: number; mat: THREE.Material }) {
  return <group ref={refObj} position={[x, y, 0]}><mesh geometry={RB(w, h, d, 0.04)} material={mat} position-y={-h / 2} /></group>;
}

/* ======================= furniture (Level 1) ======================= */
function Plant({ x, z, s = 1, y = 0 }: { x: number; z: number; s?: number; y?: number }) {
  return <group position={[x, y, z]}>{plantParts(s).map(([g, m], i) => <mesh key={i} geometry={g} material={m} castShadow receiveShadow />)}</group>;
}
function Sofa({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh geometry={RB(2.8, 0.36, 0.9, 0.06)} material={M.sofa} position-y={0.22} castShadow receiveShadow />
      {[-0.9, 0, 0.9].map(sx => <mesh key={sx} geometry={RB(0.86, 0.14, 0.7, 0.06)} material={M.cushion} position={[sx, 0.46, 0.06]} />)}
      <mesh geometry={RB(2.8, 0.62, 0.24, 0.08)} material={M.sofa} position={[0, 0.66, -0.36]} castShadow />
      <mesh geometry={RB(0.2, 0.5, 0.9, 0.06)} material={M.sofa} position={[-1.45, 0.42, 0]} />
      <mesh geometry={RB(0.2, 0.5, 0.9, 0.06)} material={M.sofa} position={[1.45, 0.42, 0]} />
    </group>
  );
}
type DragState = { key: string; o0: V2; grab: V2; y: number } | null;
/** Something you can drag around in Edit mode (desks use the same offsets map). */
function Movable({ id, x, z, offsets, edit, setDrag, foot = [1.2, 1.2], children }: {
  id: string; x: number; z: number; offsets: Record<string, V2>; edit: boolean; setDrag: (d: DragState) => void; foot?: V2; children: React.ReactNode;
}) {
  const o = offsets[id] ?? [0, 0];
  return (
    <group position={[x + o[0], 0, z + o[1]]}
      onPointerDown={e => { if (!edit || e.button !== 0) return; e.stopPropagation(); setDrag({ key: id, o0: o, grab: [e.point.x, e.point.z], y: 0 }); }}
      onPointerOver={e => { if (edit) { e.stopPropagation(); document.body.style.cursor = "grab"; } }}
      onPointerOut={() => { if (edit) document.body.style.cursor = ""; }}>
      {children}
      {edit && <mesh geometry={BOX(foot[0], 0.02, foot[1])} position-y={0.03}><meshBasicMaterial color="#3ee6c1" transparent opacity={0.14} depthWrite={false} /></mesh>}
    </group>
  );
}
function FurniturePiece({ kind, rot = 0, s = 1 }: { kind: string; rot?: number; s?: number }) {
  if (kind === "sofa") return <group rotation-y={rot}><Sofa x={0} z={0} rot={0} /></group>;
  if (kind === "plant") return <Plant x={0} z={0} s={s} />;
  if (kind === "coffee") return (<group>
    <mesh geometry={CYL(0.75, 0.75, 0.07, 24)} material={M.deskTop} position-y={0.42} castShadow />
    <mesh geometry={CYL(0.06, 0.1, 0.4, 10)} material={M.dark} position-y={0.2} /></group>);
  return (<group>
    <mesh geometry={RB(2.4, 0.95, 0.7, 0.06)} material={M.desk} position-y={0.475} castShadow />
    <mesh geometry={RB(0.45, 0.55, 0.4, 0.05)} material={M.dark} position={[-0.6, 1.27, -0.05]} />
    <mesh geometry={PLANE(0.18, 0.06)} material={memo("g:bar", () => glow("#3ee6c1", 2))} position={[-0.6, 1.4, 0.151]} /></group>);
}
const footOf = (kind: string, rot = 0): V2 => kind === "sofa" ? (Math.abs(Math.sin(rot)) > 0.5 ? [1.2, 3.1] : [3.1, 1.2]) : kind === "bar" ? [2.6, 0.9] : kind === "coffee" ? [1.7, 1.7] : [0.9, 0.9];

function MeetingRoom({ lines }: { lines: string[] | null }) {
  const scr = useMemo(() => canvasTex(512, 256), []);
  useEffect(() => {
    const { g, c, t } = scr; g.fillStyle = "#08121b"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = lines ? "#3ee6c1" : "rgba(235,242,250,.35)"; g.font = "700 34px Inter, sans-serif"; g.fillText(lines ? "STANDUP · LIVE" : "Meeting room", 24, 52);
    g.font = "500 18px monospace"; g.fillStyle = "rgba(235,242,250,.65)";
    (lines?.slice(-6) ?? ["Start a standup from the toolbar"]).forEach((s, i) => g.fillText(s.slice(0, 46), 24, 96 + i * 28)); t.needsUpdate = true;
  }, [lines, scr]);
  const [cx, cz] = MEET_CENTER;
  return (
    <group>
      <group position={[cx, 0, cz]}>
        <mesh geometry={CYL(1.25, 1.25, 0.08, 6)} material={M.deskTop} position-y={0.75} castShadow />
        <mesh geometry={CYL(0.18, 0.3, 0.72, 10)} material={M.dark} position-y={0.36} />
        <mesh geometry={CYL(0.5, 0.5, 0.01, 6)} position-y={0.8}><meshBasicMaterial color={new THREE.Color("#3ee6c1").multiplyScalar(1.4)} toneMapped={false} transparent opacity={lines ? 0.85 : 0.35} /></mesh>
        {Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; return (
          <group key={i} position={[Math.sin(a) * 1.75, 0, Math.cos(a) * 1.75]} rotation-y={a + Math.PI}>
            <mesh geometry={RB(0.5, 0.07, 0.46, 0.03)} material={M.chair} position-y={0.46} /><mesh geometry={RB(0.5, 0.5, 0.06, 0.03)} material={M.chair} position={[0, 0.74, 0.24]} />
          </group>); })}
      </group>
      <group position={[cx, 0, -0.15]}>
        <mesh geometry={RB(3.6, 2, 0.08, 0.04)} material={M.dark} position-y={1.75} />
        <mesh geometry={PLANE(3.4, 1.8)} position={[0, 1.75, 0.045]}><meshBasicMaterial map={scr.t} toneMapped={false} /></mesh>
        <mesh geometry={BOX(0.06, 0.75, 0.06)} material={M.dark} position={[-1.2, 0.38, 0]} /><mesh geometry={BOX(0.06, 0.75, 0.06)} material={M.dark} position={[1.2, 0.38, 0]} />
      </group>
    </group>
  );
}

function WallScreen({ counts, online, total }: { counts: SceneProps["counts"]; online: number; total: number }) {
  const scr = useMemo(() => { const s = canvasTex(1400, 420); s.t.wrapS = THREE.RepeatWrapping; s.t.repeat.x = -1; s.t.offset.x = 1; return s; }, []);
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now(); if (now - last.current < 600) return; last.current = now; const t = now / 1000;
    const { g, c } = scr; const W = c.width, H = c.height;
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, "#08151b"); grd.addColorStop(1, "#050a10"); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = "#3ee6c1"; g.font = "700 64px Inter, sans-serif"; g.fillText("NOAMI HQ", 60, 110);
    g.fillStyle = "rgba(235,242,250,.55)"; g.font = "500 24px monospace"; ["Ideas", "People", "Agents", "Impact"].forEach((s, i) => g.fillText(s, 64, 160 + i * 34));
    const box = (x: number, label: string, val: string, col: string) => { g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(x, 60, 190, 130); g.fillStyle = col; g.fillRect(x, 60, 4, 130);
      g.fillStyle = "rgba(235,242,250,.6)"; g.font = "500 20px monospace"; g.fillText(label, x + 20, 95); g.fillStyle = "#eef3f9"; g.font = "700 64px Inter, sans-serif"; g.fillText(val, x + 20, 170); };
    box(420, "WORKING", String(counts.working), "#3ee6c1"); box(630, "REVIEW", String(counts.review), "#f5b84b"); box(840, "FAILED", String(counts.failed), "#ff5d6c"); box(1050, "ONLINE", `${online}/${total}`, "#7aa2ff");
    g.strokeStyle = "#3ee6c1"; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i <= 60; i++) { const x = 420 + i * 13.5, y = 330 + Math.sin(i * 0.35 + t * 0.8) * 26 + Math.sin(i * 0.9 + t * 1.7) * 10; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
    scr.t.needsUpdate = true;
  });
  const Rr = 9, L = 0.86;
  return (
    <group position={[0.6, 2.15, -10.45 + Rr]}>
      <mesh geometry={CYL(Rr, Rr, 2.9, 48, true, Math.PI - L / 2, L)}><meshBasicMaterial map={scr.t} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={CYL(Rr + 0.08, Rr + 0.08, 3.1, 48, true, Math.PI - L / 2 - 0.01, L + 0.02)} material={memo("wallback", () => new THREE.MeshStandardMaterial({ color: "#0b1018", side: THREE.DoubleSide }))} />
    </group>
  );
}

const LED_MAT = memo("led", () => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
function Rack({ rt, i, onRuntime, onHover }: { rt: RuntimeView; i: number; onRuntime: SceneProps["onRuntime"]; onHover: SceneProps["onHover"] }) {
  const bays = useRef<THREE.InstancedMesh>(null), leds = useRef<THREE.InstancedMesh>(null);
  const on = useRef<boolean[]>(Array(36).fill(true));
  useEffect(() => {
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    for (let r = 0; r < 9; r++) {
      bays.current!.setMatrixAt(r, mx.makeTranslation(0, 0.35 + r * 0.21, 0.451));
      for (let k = 0; k < 4; k++) { const n = r * 4 + k; leds.current!.setMatrixAt(n, mx.makeTranslation(0.25 + k * 0.09, 0.35 + r * 0.21, 0.462));
        leds.current!.setColorAt(n, col.set(rt.online ? (rt.quotaOut && k === 0 ? "#f5b84b" : "#3ee6c1") : "#ff5d6c").multiplyScalar(rt.online ? 2.2 : 0.8)); }
    }
    bays.current!.instanceMatrix.needsUpdate = true; leds.current!.instanceMatrix.needsUpdate = true; if (leds.current!.instanceColor) leds.current!.instanceColor.needsUpdate = true;
  }, [rt.online, rt.quotaOut]);
  const last = useRef(0); const m = useMemo(() => new THREE.Matrix4(), []), p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const now = performance.now(); if (!rt.online || now - last.current < 350 || reduced()) return; last.current = now;
    const L = leds.current!; for (let n = 0; n < 36; n++) if (Math.random() < 0.08) { on.current[n] = !on.current[n]; L.getMatrixAt(n, m); p.setFromMatrixPosition(m); L.setMatrixAt(n, m.makeScale(on.current[n] ? 1 : 0, on.current[n] ? 1 : 0, 1).setPosition(p)); }
    L.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[-1.6 + i * 1.75, 0, 7.4]} onClick={e => { e.stopPropagation(); onRuntime(rt.id); }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = "pointer"; onHover({ title: rt.owner ? `${rt.name} · ${rt.owner}` : rt.name, sub: rt.online ? (rt.quotaOut ? "Online · AI quota used up" : "Online") : "Laptop off", x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
      onPointerOut={() => { document.body.style.cursor = ""; onHover(null); }}>
      <mesh geometry={RB(1.1, 2.3, 0.9, 0.05)} material={M.dark} position-y={1.15} castShadow />
      <mesh geometry={RB(1.12, 0.06, 0.92, 0.02)} material={M.slabSide} position-y={2.31} />
      <instancedMesh ref={bays} args={[BOX(0.9, 0.18, 0.02), M.botDark, 9]} />
      <instancedMesh ref={leds} args={[PLANE(0.05, 0.04), LED_MAT, 36]} />
      <mesh geometry={PLANE(0.04, 1.9)} position={[-0.45, 1.2, 0.462]}><meshBasicMaterial color={new THREE.Color(rt.online ? "#3ee6c1" : "#ff5d6c").multiplyScalar(rt.online ? 2 : 0.6)} toneMapped={false} /></mesh>
    </group>
  );
}

function Elevator({ levels, onClick }: { levels: number; onClick: () => void }) {
  const cab = useRef<THREE.Mesh>(null);
  const h = levels > 1 ? levelY(levels) + 1.2 : 2.6;
  const lines = useMemo(() => { const v: number[] = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; v.push(Math.sin(a) * 0.72, 0, Math.cos(a) * 0.72, Math.sin(a) * 0.72, 1, Math.cos(a) * 0.72); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); return g; }, []);
  const ringMat = useMemo(() => glow("#3ee6c1", 1.8, { side: THREE.DoubleSide }), []);
  useFrame(() => { if (cab.current) cab.current.position.y = 0.1 + (Math.sin(performance.now() / 1000 * 0.7) * 0.5 + 0.5) * (h - 0.4); });
  return (
    <group position={[ELEVATOR[0], 0, ELEVATOR[1]]} onClick={e => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
      <group scale-y={h}>
        <mesh geometry={CYL(0.72, 0.72, 1, 28, true)} material={M.rail} position-y={0.5} />
        <Segments geo={lines} opacity={0.45} />
      </group>
      <mesh geometry={memo("torus", () => new THREE.TorusGeometry(0.74, 0.03, 8, 40))} material={ringMat} rotation-x={Math.PI / 2} position-y={0.08} />
      <mesh geometry={memo("torus", () => new THREE.TorusGeometry(0.74, 0.03, 8, 40))} material={ringMat} rotation-x={Math.PI / 2} position-y={h} />
      <mesh ref={cab} geometry={CYL(0.62, 0.62, 0.06, 28)}><meshBasicMaterial color={new THREE.Color("#3ee6c1").multiplyScalar(1.3)} toneMapped={false} transparent opacity={0.75} /></mesh>
    </group>
  );
}

/* ======================= handovers ======================= */
function Packets() {
  const [items, setItems] = useState<{ id: number; curve: THREE.QuadraticBezierCurve3; t0: number }[]>([]);
  useEffect(() => officeStore.onHandover(h => {
    const a = chars.get(h.from), b = chars.get(h.to); if (!a || !b || reduced()) return;
    const s = a.position.clone().setY(a.position.y + 1.4), e = b.position.clone().setY(b.position.y + 1.4);
    const mid = s.clone().lerp(e, 0.5); mid.y += 3 + s.distanceTo(e) * 0.15;
    setItems(cur => [...cur, { id: h.id, curve: new THREE.QuadraticBezierCurve3(s, mid, e), t0: performance.now() }]);
  }), []);
  return <>{items.map(it => <Packet key={it.id} {...it} done={() => setItems(c => c.filter(x => x.id !== it.id))} />)}</>;
}
function Packet({ curve, t0, done }: { curve: THREE.QuadraticBezierCurve3; t0: number; done: () => void }) {
  const m = useRef<THREE.Mesh>(null);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.025, 6), [curve]);
  const tubeMat = useMemo(() => glow("#3ee6c1", 1.6, { transparent: true, opacity: 0 }), []);
  useEffect(() => () => { tube.dispose(); tubeMat.dispose(); }, [tube, tubeMat]);
  useFrame(() => {
    const k = (performance.now() - t0) / 1700; if (k >= 1) { done(); return; }
    m.current!.position.copy(curve.getPoint(k)); m.current!.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.6); tubeMat.opacity = Math.sin(k * Math.PI) * 0.55;
  });
  return <><mesh ref={m} geometry={memo("pkt", () => new THREE.IcosahedronGeometry(0.16, 1))} material={memo("g:pkt", () => glow("#3ee6c1", 3))} /><mesh geometry={tube} material={tubeMat} /></>;
}

/* ======================= camera rig ======================= */
const CAM_OFF = new THREE.Vector3(34, 32, 34);
const HOME = new THREE.Vector3(-0.5, -1.8, 0.5);

function Rig() {
  const { camera, size, gl } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const level = useOffice(s => s.level), follow = useOffice(s => s.follow), panel = useOffice(s => s.panelOpen), edit = useOffice(s => s.edit);
  const tween = useRef<((now: number) => boolean) | null>(null);
  const keys = useRef(new Set<string>());
  const fit = () => Math.max(14, Math.min(size.height / 26, (size.width - (panel && size.width > 900 ? 392 : 0) - 90) / 40));

  // keep the office centred in the area the floating HQ panel leaves free
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    const shift = panel && size.width > 900 ? 188 : 0;
    cam.setViewOffset(size.width, size.height, shift, 0, size.width, size.height); cam.updateProjectionMatrix();
  }, [panel, size, camera]);
  useEffect(() => { const cam = camera as THREE.OrthographicCamera; cam.zoom = fit(); cam.updateProjectionMatrix(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const flyTo = (target: THREE.Vector3, zoom: number, dur = 900) => {
    const c = controls.current; if (!c) return;
    const cam = camera as THREE.OrthographicCamera; const t0 = performance.now(), fT = c.target.clone(), fZ = cam.zoom, off = cam.position.clone().sub(fT);
    tween.current = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      c.target.lerpVectors(fT, target, e); cam.position.copy(c.target).add(off); cam.zoom = fZ + (zoom - fZ) * e; cam.updateProjectionMatrix(); return k < 1; };
  };
  useEffect(() => officeStore.onCam(cmd => {
    const c = controls.current; if (!c) return; const cam = camera as THREE.OrthographicCamera;
    if (cmd.type === "focus") flyTo(new THREE.Vector3(cmd.x, cmd.y, cmd.z), cmd.zoom ?? fit() * 2.1);
    else if (cmd.type === "zoom") { cam.zoom = THREE.MathUtils.clamp(cam.zoom * cmd.factor, fit() * 0.55, fit() * 4); cam.updateProjectionMatrix(); }
    else if (cmd.type === "reset") { officeStore.set({ follow: null }); const t = HOME.clone(); t.y += levelY(officeStore.get().level);
      const t0 = performance.now(), fT = c.target.clone(), fP = cam.position.clone(), fZ = cam.zoom, z1 = fit();
      tween.current = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); c.target.lerpVectors(fT, t, e); cam.position.lerpVectors(fP, t.clone().add(CAM_OFF), e); cam.zoom = fZ + (z1 - fZ) * e; cam.updateProjectionMatrix(); return k < 1; }; }
    else if (cmd.type === "rotate") { const t0 = performance.now(), off0 = cam.position.clone().sub(c.target), ang = cmd.dir * Math.PI / 2;
      tween.current = now => { const k = Math.min(1, (now - t0) / 650), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; cam.position.copy(c.target).add(off0.clone().applyAxisAngle(UP, ang * e)); return k < 1; }; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [camera, size, panel]);
  // moving between floors raises/lowers the camera target
  const prevLevel = useRef(level);
  useEffect(() => {
    if (prevLevel.current === level) return; prevLevel.current = level;
    const c = controls.current; if (!c) return; const t = c.target.clone(); t.y = HOME.y + levelY(level); flyTo(t, (camera as THREE.OrthographicCamera).zoom, 750);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable]")) return;
      const k = e.key.toLowerCase(); keys.current.add(k);
      if (k === "q") officeStore.cam({ type: "rotate", dir: -1 }); if (k === "e") officeStore.cam({ type: "rotate", dir: 1 });
      if (k === "r") officeStore.cam({ type: "reset" }); if (k === "l") officeStore.set(s => ({ labels: !s.labels }));
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    addEventListener("keydown", down); addEventListener("keyup", up); return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); };
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const lastShadow = useRef(0);
  useFrame((_, dtRaw) => {
    const c = controls.current; if (!c) return; const dt = Math.min(dtRaw, 0.05), now = performance.now(), cam = camera as THREE.OrthographicCamera;
    if (tween.current && !tween.current(now)) tween.current = null;
    const K = keys.current;
    if (K.size) {
      const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize(); const r = new THREE.Vector3().crossVectors(f, UP);
      const mv = new THREE.Vector3(); if (K.has("w") || K.has("arrowup")) mv.add(f); if (K.has("s") || K.has("arrowdown")) mv.sub(f); if (K.has("d") || K.has("arrowright")) mv.add(r); if (K.has("a") || K.has("arrowleft")) mv.sub(r);
      if (mv.lengthSq()) { mv.normalize().multiplyScalar(dt * 9 * (30 / cam.zoom)); c.target.add(mv); cam.position.add(mv); if (officeStore.get().follow) officeStore.set({ follow: null }); }
    }
    if (follow) { const o = chars.get(follow); if (o) { const off = cam.position.clone().sub(c.target); tmp.copy(o.position); tmp.y += 0.9; c.target.lerp(tmp, 0.08); cam.position.copy(c.target).add(off); } }
    c.update();
    if (now - lastShadow.current > 66) { gl.shadowMap.needsUpdate = true; lastShadow.current = now; }
  });
  useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }, [gl]);
  return (
    <>
      <OrthographicCamera makeDefault position={HOME.clone().add(CAM_OFF).toArray()} near={-200} far={400} zoom={30} />
      <OrbitControls ref={controls} makeDefault target={HOME.toArray()} enableDamping dampingFactor={0.08} minPolarAngle={0.55} maxPolarAngle={1.12}
        screenSpacePanning={false} mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        minZoom={8} maxZoom={200} />
    </>
  );
}

/* ======================= scene ======================= */
function World(p: SceneProps) {
  const { plan } = p;
  const level = useOffice(s => s.level), edit = useOffice(s => s.edit);
  const standup = useOffice(s => s.standup);
  const [drag, setDrag] = useState<DragState>(null);
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;
  const { camera, gl } = useThree();
  // Dragging in Edit mode: follow the pointer on the floor plane until it is released (window listeners, so a
  // quick drag still lands even before React re-renders).
  const offsetsRef = useRef(p.offsets); offsetsRef.current = p.offsets;
  useEffect(() => {
    if (!drag) return;
    if (controls) controls.enabled = false;
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(UP, -drag.y), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
    let last = offsetsRef.current;
    const at = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, hit);
    };
    const move = (e: PointerEvent) => { if (!at(e)) return;
      const dx = Math.round((hit.x - drag.grab[0]) * 4) / 4, dz = Math.round((hit.z - drag.grab[1]) * 4) / 4;
      last = { ...offsetsRef.current, [drag.key]: [drag.o0[0] + dx, drag.o0[1] + dz] }; p.onOffsets(last, false); };
    const up = (e: PointerEvent) => { move(e); p.onOffsets(last, true); setDrag(null); };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true });
    return () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); if (controls) controls.enabled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  // where each character should be: desk chair, lounge sofa (on a break) or the standup circle
  const participants = useMemo(() => plan.seats.filter(s => s.kind === "agent" && s.primary && s.level === 1 && !isGone(s.state)), [plan.seats]);
  const stations = useMemo(() => {
    const out = new Map<string, Station>(); let sofa = 0;
    for (const s of plan.seats) {
      const chair = new THREE.Vector3(0, 0, 0.66).applyAxisAngle(UP, s.rot);
      let st: Station = { x: s.x + chair.x, z: s.z + chair.z, rot: s.rot + Math.PI, mode: "seat", y: 0 };
      const idx = standup ? participants.indexOf(s) : -1;
      if (idx >= 0) { const a = (idx / participants.length) * Math.PI * 2; st = { x: MEET_CENTER[0] + Math.sin(a) * 2.35, z: MEET_CENTER[1] + Math.cos(a) * 2.35, rot: a + Math.PI, mode: "stand", y: 0 }; }
      else if (s.state === "break" && s.level === 1 && s.primary && sofa < plan.sofaSpots.length) { const sp = plan.sofaSpots[sofa++]; st = { x: sp.x, z: sp.z, rot: sp.rot, mode: "sofa", y: 0.04 }; }
      out.set(s.key, st);
    }
    return out;
  }, [plan.seats, plan.sofaSpots, standup, participants]);
  const speaker = standup && standup.speaker >= 0 ? participants[standup.speaker]?.key : null;
  const online = p.runtimes.filter(r => r.online).length;

  return (
    <>
      <hemisphereLight args={["#8fb1dc", "#0a0f18", p.officeOpen ? 0.85 : 0.3]} />
      <directionalLight position={[14, 26, 10]} intensity={p.officeOpen ? 1.7 : 0.55} color="#e3ecff" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24} shadow-camera-near={1} shadow-camera-far={80} />
      <directionalLight position={[-20, 8, -14]} intensity={0.35} color="#3ee6c1" />
      <Ground />
      {Array.from({ length: plan.levels }, (_, i) => i + 1).map(n => (
        <group key={n} visible={n <= level}>
          <Level n={n} />
          {plan.zones.filter(z => z.level === n).map(z => <ZonePlate key={z.id} z={z} onZone={p.onZone} onHover={p.onHover} />)}
          {plan.freeSlots.filter(s => s.level === n).map(s => <GhostSlot key={s.id} s={s} show={n === level && !edit} onSlot={p.onSlot} />)}
          {n > 1 && <mesh geometry={PLANE(4, 0.5)} rotation-x={-Math.PI / 2} position={[ELEVATOR[0], levelY(n) + 0.06, ELEVATOR[1] - 2.2]}><meshBasicMaterial map={floorTextTex(`Level ${n}`)} transparent depthWrite={false} /></mesh>}
          {n > 1 && ([[-15, -5.6, 1], [13.4, -10.6, 1.1], [13, 4.2, 1], [-15, 10.2, 1.15]] as [number, number, number][]).map(([x, z, s], i) => <Plant key={i} x={x} z={z} s={s} y={levelY(n)} />)}
        </group>
      ))}
      <mesh geometry={RB(6.4, 0.02, 3.2, 0.3)} material={M.rug} position={[-11.2, 0.065, 8.6]} />
      {FURNITURE.map(f => (
        <Movable key={f.id} id={f.id} x={f.x} z={f.z} offsets={p.offsets} edit={edit && level === 1} setDrag={setDrag} foot={footOf(f.kind, f.rot)}>
          <FurniturePiece kind={f.kind} rot={f.rot} s={f.s} />
        </Movable>
      ))}
      <MeetingRoom lines={standup ? standup.lines : null} />
      <WallScreen counts={p.counts} online={online} total={p.runtimes.length} />
      {p.runtimes.slice(0, 4).map((rt, i) => <Rack key={rt.id} rt={rt} i={i} onRuntime={p.onRuntime} onHover={p.onHover} />)}
      <mesh geometry={BOX(8.2, 1.6, 0.04)} material={M.rail} position={[1, 0.8, 5.75]} />
      <Elevator levels={plan.levels} onClick={() => plan.levels > 1 && officeStore.set(s => ({ level: s.level >= plan.levels ? 1 : s.level + 1 }))} />

      {plan.seats.map(s => (
        <group key={s.key} visible={s.level <= level}>
          <DeskModel seat={s} edit={edit} onSeat={p.onSeat} offsets={p.offsets} setDrag={setDrag} />
          {s.primary && !isGone(s.state) && s.level <= level && (
            <Character seat={s} station={stations.get(s.key)!} color={STATE_COLOR[s.state]} speaking={speaker === s.key}
              onSeat={p.onSeat} onHoverSeat={p.onHoverSeat} />
          )}
        </group>
      ))}
      <Packets />
      <ScreenTicker />
      <LabelProjector />
      {edit && <gridHelper args={[40, 80, "#3ee6c1", "#1e3a44"]} position-y={levelY(level) + 0.07} />}
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={p.officeOpen ? 0.8 : 0.5} luminanceThreshold={0.82} luminanceSmoothing={0.12} resolutionScale={0.5} />
      </EffectComposer>
    </>
  );
}
/** Moves the DOM name tags / floor buttons onto their 3D anchors every frame. */
function LabelProjector() {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => { if (process.env.NODE_ENV !== "production") (window as unknown as { __noamiCam: THREE.Camera }).__noamiCam = camera; }, [camera]);
  useFrame(() => {
    for (const [key, el] of labelEls) {
      const o = chars.get(key); const a = staticAnchors.get(key);
      if (o) { v.copy(o.position); v.y += 2.15; } else if (a) v.copy(a); else { el.style.visibility = "hidden"; continue; }
      v.project(camera);
      if (v.z > 1) { el.style.visibility = "hidden"; continue; }
      el.style.visibility = "visible";
      el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2) * size.width}px,${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}
function ScreenTicker() {
  const last = useRef(0);
  useFrame(() => { const now = performance.now(); if (now - last.current < 350) return; last.current = now; const t = now / 1000; screens.forEach(f => f(t)); });
  return null;
}

export default function OfficeScene(p: SceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => p.onHover(null)}
      onCreated={({ gl, scene }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; scene.background = new THREE.Color("#070b12"); scene.fog = new THREE.Fog("#070b12", 70, 150); }}>
      <Rig />
      <World {...p} />
    </Canvas>
  );
}

export { LY };
