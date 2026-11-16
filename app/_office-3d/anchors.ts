"use client";
// Name tags and floor buttons are plain DOM (one React tree) positioned every frame from 3D anchors.
import type * as THREE from "three";
export const chars = new Map<string, THREE.Object3D>();         // seat key → character root
export const staticAnchors = new Map<string, THREE.Vector3>();   // e.g. "slot:2A" → world position
export const labelEls = new Map<string, HTMLElement>();          // key → DOM element to position
export const regLabel = (key: string) => (el: HTMLElement | null) => { if (el) labelEls.set(key, el); else labelEls.delete(key); };
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __noami: unknown }).__noami = { chars, staticAnchors, labelEls };
