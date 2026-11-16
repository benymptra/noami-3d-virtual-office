import { NextResponse } from "next/server";
import { saveNoamiLayout, type NoamiLayout } from "@/lib/multica";

export const dynamic = "force-dynamic";

const num = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 60;

/** Save part of the 3D office layout (desk/furniture offsets, room slots, rooms of new projects). */
export async function POST(req: Request) {
  const b = (await req.json()) as { ws?: string } & NoamiLayout;
  const patch: NoamiLayout = {};
  if (b.offsets) patch.offsets = Object.fromEntries(Object.entries(b.offsets).filter(([k, v]) => k.length < 120 && Array.isArray(v) && num(v[0]) && num(v[1])).slice(0, 400));
  if (b.rooms) patch.rooms = Object.fromEntries(Object.entries(b.rooms).filter(([k, v]) => k.length < 80 && typeof v === "string" && /^\d[A-H]$/.test(v)).slice(0, 200));
  if (b.reserved) patch.reserved = b.reserved.filter(r => r && typeof r.id === "string" && typeof r.name === "string").slice(0, 50).map(r => ({ id: r.id, name: r.name.slice(0, 80) }));
  try {
    const layout = await saveNoamiLayout(b.ws ?? null, patch);
    return NextResponse.json({ layout });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    // Only workspace owners/admins may change workspace settings.
    return NextResponse.json({ error: msg, forbidden: /\b40[13]\b/.test(msg) }, { status: /\b40[13]\b/.test(msg) ? 403 : 500 });
  }
}
