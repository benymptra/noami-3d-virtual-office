"use client";
// Small shared store between the 2D floating UI and the 3D scene (camera commands, view level, modes).
import { useSyncExternalStore } from "react";

export type CamCmd =
  | { type: "rotate"; dir: 1 | -1 }
  | { type: "zoom"; factor: number }
  | { type: "reset" }
  | { type: "focus"; x: number; y: number; z: number; zoom?: number };

export type Handover = { from: string; to: string; id: number };

type State = {
  level: number;          // floor being viewed
  labels: boolean;        // name tags always on
  edit: boolean;          // edit layout mode
  walk: boolean;          // WASD walk mode hint
  follow: string | null;  // seat key being followed
  standup: { startedAt: number; speaker: number; lines: string[] } | null;
  selected: string | null; // seat key highlighted
  panelOpen: boolean;     // HQ panel open: the scene re-centres in the free area
  closedLook: boolean;    // office closed (dim lights)
};

let state: State = { level: 1, labels: true, edit: false, walk: false, follow: null, standup: null, selected: null, panelOpen: true, closedLook: false };
const subs = new Set<() => void>();
const cmdSubs = new Set<(c: CamCmd) => void>();
const handSubs = new Set<(h: Handover) => void>();

export const officeStore = {
  get: () => state,
  set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...p };
    subs.forEach(f => f());
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  cam(c: CamCmd) { cmdSubs.forEach(f => f(c)); },
  onCam(f: (c: CamCmd) => void) { cmdSubs.add(f); return () => { cmdSubs.delete(f); }; },
  handover(from: string, to: string) { const h = { from, to, id: Math.random() }; handSubs.forEach(f => f(h)); },
  onHandover(f: (h: Handover) => void) { handSubs.add(f); return () => { handSubs.delete(f); }; },
};

export function useOffice<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(officeStore.subscribe, () => pick(officeStore.get()), () => pick(state));
}
