// Turns the Office data (lib/office.ts) into a 3D floor plan.
// Rule: fixed zones (team desks, lounge, meeting room, runtimes) stay on Level 1. Each project room takes
// the first free slot that fits its desks; when no slot fits, a new level is stacked on top.
import type { Office, Desk, DeskState } from "@/lib/office";

export type V2 = [number, number];
export const LY = 4.8; // height of one floor
export const levelY = (l: number) => (l - 1) * LY;

// Floor outline (x, z), shared by every level.
export const FLOOR: V2[] = [[-16, -6.4], [-4, -6.4], [-4, -11.2], [14.2, -11.2], [14.2, 4.8], [6, 4.8], [6, 11], [-16, 11]];

export type Rect = { x0: number; x1: number; z0: number; z1: number };
export type Slot = Rect & { id: string; level: number };

const L1_SLOTS: Slot[] = [
  { id: "1A", level: 1, x0: -3, x1: 4.2, z0: -9.2, z1: -2.2 },
  { id: "1B", level: 1, x0: 6.2, x1: 13.2, z0: -10.2, z1: -3 },
  { id: "1C", level: 1, x0: -3, x1: 4.2, z0: -0.2, z1: 4.2 },
  { id: "1D", level: 1, x0: -15, x1: -6.4, z0: -0.4, z1: 3.3 },
];
const UPPER: Rect[] = [
  { x0: -15, x1: -6.4, z0: -5.8, z1: -1.9 }, { x0: -3, x1: 4.2, z0: -9.8, z1: -2.4 }, { x0: 6.2, x1: 13.4, z0: -10.4, z1: -2.4 },
  { x0: -15, x1: -6.4, z0: -0.6, z1: 4 }, { x0: -3, x1: 4.2, z0: -0.6, z1: 4 }, { x0: 6.4, x1: 13.4, z0: -0.6, z1: 4 },
  { x0: -15, x1: -6.4, z0: 5.2, z1: 10.2 }, { x0: -2.6, x1: 5.2, z0: 5.2, z1: 10.2 },
];
export const slotsFor = (level: number): Slot[] =>
  level === 1 ? L1_SLOTS : UPPER.map((r, i) => ({ ...r, id: `${level}${"ABCDEFGH"[i]}`, level }));

export const DESK_SP = 1.75;
export const slotCap = (s: Rect) => Math.max(1, Math.floor((s.x1 - s.x0 - 1) / DESK_SP)) * ((s.z1 - s.z0) >= 3.2 ? 2 : 1);

export const FIXED = {
  team: { x0: -15, x1: -6, z0: -5.6, z1: -2.1 },
  lounge: { x0: -15, x1: -6, z0: 3.8, z1: 10.2 },
  meet: { x0: 6.6, x1: 13.2, z0: -0.2, z1: 4 },
  srv: { x0: -3, x1: 5.2, z0: 5.6, z1: 10.2 },
};
export const MEET_CENTER: V2 = [(FIXED.meet.x0 + FIXED.meet.x1) / 2, (FIXED.meet.z0 + FIXED.meet.z1) / 2];
export const ELEVATOR: V2 = [-4.7, 7.6];
export const CORRIDOR_Z = -1.25;

// Furniture you can move in Edit mode: [id, x, z, rotation, footprint w, footprint d]
export const SOFA_A: V2 = [-12.6, 7.6], SOFA_B: V2 = [-9.2, 8.6];
export const FURNITURE: { id: string; kind: "sofa" | "coffee" | "bar" | "plant"; x: number; z: number; rot?: number; s?: number }[] = [
  { id: "f:sofaA", kind: "sofa", x: SOFA_A[0], z: SOFA_A[1], rot: 0 },
  { id: "f:sofaB", kind: "sofa", x: SOFA_B[0], z: SOFA_B[1], rot: -Math.PI / 2 },
  { id: "f:coffee", kind: "coffee", x: -11.6, z: 8.9 },
  { id: "f:bar", kind: "bar", x: -7.3, z: 9.4 },
  ...([[-15, 10, 1.2], [-6.5, 4.1, 1], [-15, -2.6, 1], [4.6, -9.4, 1.1], [13, 4.2, 1], [-2.6, 10, 1], [12.8, -10.5, 1.15], [-6.2, -5.6, 0.9]] as [number, number, number][])
    .map(([x, z, s], i) => ({ id: `f:plant${i}`, kind: "plant" as const, x, z, s })),
];

export type VisualState = DeskState | "here" | "away";
export type Seat = {
  key: string; kind: "agent" | "human"; name: string; agentId: string | null; primary: boolean;
  state: VisualState; bubble: string; desk: Desk | null; zone: string; level: number;
  x: number; z: number; rot: number; papers: number; emoji: string | null;
};
export type Zone = Rect & { id: string; name: string; kind: "project" | "team" | "lounge" | "meet" | "srv"; level: number; tint: string; progress: string | null; slot?: string };

export type Plan = { levels: number; zones: Zone[]; seats: Seat[]; freeSlots: Slot[]; sofaSpots: { x: number; z: number; rot: number }[] };

const TINTS = ["#3ee6c1", "#7aa2ff", "#a08cff", "#f5b84b", "#ff8d98", "#6fd3ff"];

/** Desk positions inside a rectangle: two facing rows (the row facing the camera fills first). */
export function pod(r: Rect, n: number) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2 - 0.15;
  const twoRows = (r.z1 - r.z0) >= 3.2;
  const cols = twoRows ? Math.ceil(n / 2) : n;
  return Array.from({ length: n }, (_, i) => {
    const front = !twoRows || i < cols; const col = front ? i : i - cols;
    const x = cx + (col - (cols - 1) / 2) * DESK_SP;
    return front ? { x, z: cz - (twoRows ? 0.45 : 0), rot: Math.PI } : { x, z: cz + 0.45, rot: 0 };
  });
}

export function plan(office: Office, seen: Record<string, string>, offsets: Record<string, V2> = {}, reserved: { id: string; name: string }[] = [], pins: Record<string, string> = {}): Plan {
  const zones: Zone[] = [];
  const seats: Seat[] = [];
  const placed = new Set<string>();
  const used = new Set<string>();
  let levels = 1;
  const off = (key: string, x: number, z: number): [number, number] => { const o = offsets[key]; return o ? [x + o[0], z + o[1]] : [x, z]; };

  const push = (d: Desk, zone: string, level: number, p: { x: number; z: number; rot: number }) => {
    const key = `${zone}:${d.agentId}`;
    const [x, z] = off(key, p.x, p.z);
    seats.push({ key, kind: "agent", name: d.name, agentId: d.agentId, primary: !placed.has(d.agentId), state: d.state, bubble: d.bubble, desk: d,
      zone, level, x, z, rot: p.rot, papers: d.reviewCount + d.lateCount, emoji: d.emoji });
    placed.add(d.agentId);
  };

  // Fixed zones on Level 1
  zones.push({ id: "team", name: "Team desks", kind: "team", level: 1, tint: "#7aa2ff", progress: null, ...FIXED.team });
  zones.push({ id: "lounge", name: "Lounge", kind: "lounge", level: 1, tint: "#a08cff", progress: null, ...FIXED.lounge });
  zones.push({ id: "meet", name: "Meeting room", kind: "meet", level: 1, tint: "#5d7290", progress: null, ...FIXED.meet });
  zones.push({ id: "srv", name: "Runtimes", kind: "srv", level: 1, tint: "#ff5d6c", progress: null, ...FIXED.srv });

  // Project rooms → slots
  // rooms with agents, then projects created from the office that have no agent task yet (still in Multica)
  const known = new Set(office.projects.map(p => p.id));
  const rooms = [...office.rooms, ...reserved.filter(r => known.has(r.id) && !office.rooms.some(x => x.id === r.id))
    .map(r => ({ id: r.id, name: r.name, icon: null, progress: "No agents yet · assign a task", desks: [] as Desk[] }))];
  // a room keeps the slot it was given (saved in the workspace), as long as it still fits
  const pinned = new Map<string, Slot>();
  for (const room of rooms) {
    const id = pins[room.id]; if (!id) continue;
    const lv = Number(id[0]); const s = slotsFor(lv).find(x => x.id === id);
    if (s && !used.has(s.id) && slotCap(s) >= room.desks.length) { pinned.set(room.id, s); used.add(s.id); levels = Math.max(levels, lv); }
  }
  rooms.forEach((room, i) => {
    const n = room.desks.length;
    let slot: Slot | undefined = pinned.get(room.id);
    if (slot) used.delete(slot.id);
    for (let l = 1; l <= levels && !slot; l++) slot = slotsFor(l).find(s => !used.has(s.id) && slotCap(s) >= n);
    while (!slot) { // stack a new level
      levels++;
      const fresh = slotsFor(levels);
      slot = fresh.find(s => slotCap(s) >= n) ?? fresh.reduce((a, b) => (slotCap(b) > slotCap(a) ? b : a));
      if (levels > 6) break;
    }
    if (!slot) return;
    used.add(slot.id);
    zones.push({ id: room.id, name: room.name, kind: "project", level: slot.level, tint: TINTS[i % TINTS.length], progress: room.progress, slot: slot.id,
      x0: slot.x0, x1: slot.x1, z0: slot.z0, z1: slot.z1 });
    pod(slot, n).forEach((p, k) => push(room.desks[k], room.id, slot!.level, p));
  });

  // Lounge desks: agents without a project (front row first, then a row behind)
  office.idleDesks.forEach((d, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    push(d, "lounge", 1, { x: -13.6 + col * DESK_SP, z: 4.9 + row * 0.9, rot: row ? 0 : Math.PI });
  });

  // People at the team desks
  const here = (n: string) => !!seen[n] && Date.now() - Date.parse(seen[n]) < 5 * 60000;
  pod(FIXED.team, office.people.length).forEach((p, i) => {
    const name = office.people[i]; const key = `team:${name}`; const [x, z] = off(key, p.x, p.z);
    const todo = office.attention.human.filter(t => t.assignee === name).length;
    const mins = seen[name] ? Math.round((Date.now() - Date.parse(seen[name])) / 60000) : null;
    seats.push({ key, kind: "human", name, agentId: null, primary: true, state: here(name) ? "here" : "away",
      bubble: here(name) ? "In the office" : mins === null ? "Not in yet" : `Last seen ${mins < 60 ? mins + "m" : Math.round(mins / 60) + "h"} ago`,
      desk: null, zone: "team", level: 1, x, z, rot: p.rot, papers: todo + office.attention.review.length, emoji: null });
  });

  const freeSlots: Slot[] = [];
  for (let l = 1; l <= levels; l++) freeSlots.push(...slotsFor(l).filter(s => !used.has(s.id)));

  const oA = offsets["f:sofaA"] ?? [0, 0], oB = offsets["f:sofaB"] ?? [0, 0];
  const sofaSpots = [
    ...[-0.9, 0, 0.9].map(dx => ({ x: SOFA_A[0] + oA[0] + dx, z: SOFA_A[1] + oA[1] + 0.12, rot: 0 })),
    ...[-0.9, 0, 0.9].map(dz => ({ x: SOFA_B[0] + oB[0] - 0.12, z: SOFA_B[1] + oB[1] + dz, rot: -Math.PI / 2 })),
  ];
  return { levels, zones, seats, freeSlots, sofaSpots };
}

export const STATE_COLOR: Record<VisualState, string> = {
  working: "#3ee6c1", review: "#f5b84b", failed: "#ff5d6c", ready: "#7aa2ff", break: "#a08cff",
  off: "#4b5a70", home: "#4b5a70", closed: "#4b5a70", here: "#3ee6c1", away: "#4b5a70",
};
export const STATE_LABEL: Record<VisualState, string> = {
  working: "Working", review: "Needs review", failed: "Failed", ready: "Ready", break: "On a break",
  off: "Laptop off", home: "Off duty", closed: "Office closed", here: "In the office", away: "Away",
};
export const isGone = (s: VisualState) => s === "off" || s === "home" || s === "closed" || s === "away";
