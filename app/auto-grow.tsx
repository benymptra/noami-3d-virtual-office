"use client";
// Text boxes that grow with what you type (up to a limit, then they scroll), like a chat composer.
import { useLayoutEffect, useRef, type RefObject } from "react";

export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxPx = 320) {
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    const want = el.scrollHeight + border;
    el.style.height = `${Math.min(want, maxPx)}px`;
    el.style.overflowY = want > maxPx ? "auto" : "hidden";
  }, [ref, value, maxPx]);
}

/** A textarea that grows with its text. */
export function GrowText({ maxPx, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; maxPx?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(ref, props.value, maxPx);
  return <textarea ref={ref} rows={props.rows ?? 2} {...props} />;
}
