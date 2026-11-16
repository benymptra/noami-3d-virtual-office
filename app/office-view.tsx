"use client";
// Office page: the 3D isometric office fills the screen; every panel floats above it as glass.
// Data and actions are the same as before (Multica via the API routes); only the presentation changed.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Office, Desk, TaskView, RunView } from "@/lib/office";
import type { NoamiLayout } from "@/lib/multica";
import TaskPanel from "./task-panel";
import type { Building } from "./page";
import OfficeSwitch from "./office-switch";
import FilePicker, { uploadAll } from "./file-picker";
import ChatPanel, { MANAGER, isManager } from "./chat-panel";
import { Emo, PxText } from "./pixel-icon";
import { useHandoverDetector, type Handover } from "./handover";
import NewProject from "./new-project";
import { openChat } from "./messages";
import { Icon } from "./icons";
import { plan as makePlan, STATE_COLOR, STATE_LABEL, isGone, slotCap, levelY, MEET_CENTER, type Seat, type Zone, type Slot, type V2 } from "./_office-3d/plan";
import { officeStore, useOffice } from "./_office-3d/store";
import { lofi } from "./_office-3d/lofi";
import { regLabel } from "./_office-3d/anchors";

const OfficeScene = dynamic(() => import("./_office-3d/scene"), { ssr: false, loading: () => <div className="scene-loading"><span className="spinner" /> Building the office…</div> });

const REFRESH_MS = 30_000;
const OFFSETS_KEY = (ws: string) => `noami-layout:${ws}`;
const AV = ["#7cf3d9", "#a6c0ff", "#c4b5ff", "#f8c977", "#ff9aa3", "#9be7ff", "#b8f28c", "#ffd1a6"];
const avColor = (s: string) => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const PLAYBOOKS = [
  { t: "Daily morning briefing", d: "Every day at 09:00. Priorities, blockers, and what changed overnight." },
  { t: "Nightly review digest", d: "Every night. Review the day's results and flag risky changes." },
  { t: "Hourly health check", d: "Every 60 minutes. Runtime health, failures, anything that needs a person." },
  { t: "Weekly progress report", d: "Mondays at 08:00. Wins, unfinished work and next steps." },
];

function pillOf(t: TaskView) {
  if (t.dueFlag === "late") return <span className="pill2 p-late">LATE</span>;
  if (t.dueFlag === "risk") return <span className="pill2 p-risk">AT RISK</span>;
  if (t.status === "in_review") return <span className="pill2 p-review">REVIEW</span>;
  if (t.status === "in_progress") return <span className="pill2 p-doing">DOING</span>;
  return <span className="pill2 p-ready">{t.statusLabel.toUpperCase()}</span>;
}
function TaskCard({ t, onOpen, who = true }: { t: TaskView; onOpen: () => void; who?: boolean }) {
  return (
    <button className="card" onClick={onOpen}>
      <span className="row"><b><PxText text={t.title} /></b>{pillOf(t)}</span>
      <small>{[who ? t.assignee ?? "Unassigned" : null, t.dueText, t.project].filter(Boolean).join(" · ")}</small>
    </button>
  );
}

function NewTaskForm({ ws, desk, projects, onDone, initialDetail = "" }: { initialDetail?: string; ws: string; desk: Desk; projects: Office["projects"]; onDone: (id: string | null) => void }) {
  const [title, setTitle] = useState(""); const [detail, setDetail] = useState(initialDetail);
  const [due, setDue] = useState(""); const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  async function submit(now: boolean) {
    setBusy(true); setErr(null);
    try {
      const fileIds = files.length ? await uploadAll(files, ws) : [];
      const r = await fetch("/api/task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws, agentId: desk.agentId, title, detail, due, projectId, now, files: fileIds }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      onDone(j.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <form className="card form" onSubmit={e => { e.preventDefault(); submit(true); }}>
      <label htmlFor="nt-title" className="sect">New task for {desk.name}</label>
      <input id="nt-title" className="input" placeholder={detail.trim() ? "Title (optional, taken from the details)" : "e.g. Write 3 caption ideas for the teaser"} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      <textarea className="input" placeholder="Details or instructions (optional)" value={detail} onChange={e => setDetail(e.target.value)}
        onPaste={e => { const p = [...e.clipboardData.files]; if (p.length) { e.preventDefault(); setFiles([...files, ...p]); } }} />
      <FilePicker files={files} onChange={setFiles} />
      <div className="row wrap">
        <label className="mini">Due<input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
        <label className="mini">Project<select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="">No project</option></select></label>
      </div>
      {err && <div className="note bad">{err}</div>}
      <div className="row end">
        <button type="button" className="btn sm" onClick={() => onDone(null)}>Cancel</button>
        <button type="button" className="btn sm" disabled={(!title.trim() && !detail.trim()) || busy} onClick={() => submit(false)}>Save for later</button>
        <button className="btn sm primary" disabled={(!title.trim() && !detail.trim()) || busy}>{busy ? "Saving…" : "Start now"}</button>
      </div>
    </form>
  );
}

type Toast = { id: number; text: string; icon: string };
type Open = { kind: "seat"; key: string } | { kind: "zone"; id: string } | { kind: "runtime"; id: string } | null;

export default function OfficeView({ office, attention, people, seen, meId, layout }: { office: Office; buildings: Building[]; attention: Office["attention"]; people: string[]; seen: Record<string, string>; meId?: string | null; layout: NoamiLayout }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const ws = office.workspaceId;

  // ---------- layout: moved desks/furniture, room slots and rooms of new projects, saved in the workspace ----------
  // (people who may not change workspace settings keep their own arrangement in this browser instead)
  const [offsets, setOffsets] = useState<Record<string, V2>>(layout.offsets ?? {});
  const [reserved, setReserved] = useState<{ id: string; name: string }[]>(layout.reserved ?? []);
  const [pins, setPins] = useState<Record<string, string>>(layout.rooms ?? {});
  useEffect(() => { try { const local = JSON.parse(localStorage.getItem(OFFSETS_KEY(ws)) || "null"); if (local) setOffsets(o => ({ ...o, ...local })); } catch { /* ignore */ } }, [ws]);
  const localOnly = useRef(false);
  const saveLayout = useCallback(async (patch: NoamiLayout) => {
    if (!localOnly.current) {
      try {
        const j = await (await fetch("/api/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws, ...patch }) })).json();
        if (!j.error) { try { localStorage.removeItem(OFFSETS_KEY(ws)); } catch { /* ignore */ } return true; }
        if (j.forbidden) localOnly.current = true; else throw new Error(j.error);
      } catch (e) { toast("Couldn't save the layout: " + (e instanceof Error ? e.message : String(e)), "alert"); return false; }
    }
    if (patch.offsets) { try { localStorage.setItem(OFFSETS_KEY(ws), JSON.stringify(patch.offsets)); } catch { /* ignore */ } }
    toast("Saved in this browser only: just workspace owners and admins can change the shared layout.", "alert");
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);
  const plan = useMemo(() => makePlan(office, seen, offsets, reserved, pins), [office, seen, offsets, reserved, pins]);
  const seatByKey = useMemo(() => new Map(plan.seats.map(s => [s.key, s])), [plan.seats]);
  const primaryOf = useCallback((agentId: string) => plan.seats.find(s => s.agentId === agentId && s.primary), [plan.seats]);
  const agents = useMemo(() => plan.seats.filter(s => s.kind === "agent" && s.primary), [plan.seats]);
  const humans = useMemo(() => plan.seats.filter(s => s.kind === "human"), [plan.seats]);
  const counts = useMemo(() => ({ working: agents.filter(s => s.state === "working").length, review: agents.filter(s => s.state === "review").length, failed: agents.filter(s => s.state === "failed").length }), [agents]);

  // ---------- UI state ----------
  const [open, setOpen] = useState<Open>(null);
  const [openTask, setOpenTaskRaw] = useState<{ id: string; ws: string } | null>(null);
  const setOpenTask = (id: string | null, w: string = ws) => setOpenTaskRaw(id ? { id, ws: w } : null);
  const [adding, setAdding] = useState(false); const [draft, setDraft] = useState("");
  const [chatWith, setChatWith] = useState<Desk | null>(null);
  const [newProject, setNewProject] = useState<{ slot: Slot | null } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hover, setHover] = useState<{ title: string; sub: string; x: number; y: number } | null>(null);
  const [hoverSeat, setHoverSeat] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState<string | null>(null);
  const [hqTab, setHqTab] = useState<"attn" | "inbox" | "play">("attn");
  const [music, setMusic] = useState(false); const [playing, setPlaying] = useState(false); const [chord, setChord] = useState("72 bpm"); const [vol, setVol] = useState(45);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const level = useOffice(s => s.level), labels = useOffice(s => s.labels), edit = useOffice(s => s.edit), walk = useOffice(s => s.walk);
  const follow = useOffice(s => s.follow), standup = useOffice(s => s.standup), panelOpen = useOffice(s => s.panelOpen);
  const toast = useCallback((text: string, icon = "spark") => {
    const id = Math.random(); setToasts(t => [...t.slice(-3), { id, text, icon }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);
  useEffect(() => setSlot(document.getElementById("island-slot")), []);
  useEffect(() => { if (level > plan.levels) officeStore.set({ level: plan.levels }); }, [level, plan.levels]);
  useEffect(() => { const f = () => setNewProject({ slot: null }); addEventListener("kantor:newproject", f); return () => removeEventListener("kantor:newproject", f); }, []);

  // presence heartbeat, auto refresh, Esc
  useEffect(() => {
    const beat = () => { if (document.visibilityState === "visible") fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws }) }).catch(() => {}); };
    beat(); const t = setInterval(beat, 120_000); document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, [ws]);
  useEffect(() => { const t = setInterval(refresh, REFRESH_MS); return () => clearInterval(t); }, [refresh]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== "Escape") return;
      if (openTask) setOpenTask(null); else if (officeStore.get().follow) officeStore.set({ follow: null }); else { setOpen(null); officeStore.set({ selected: null }); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  });

  // handovers: agents send a glowing packet to whoever gets the work next
  const here = (p: string) => !!seen[p] && Date.now() - Date.parse(seen[p]) < 5 * 60000;
  const reviewer = people.find(here) ?? people[0] ?? null;
  const allDesks = useMemo(() => [...office.rooms.flatMap(r => r.desks), ...office.idleDesks], [office]);
  const nameOf = (k: string) => k.startsWith("person:") ? k.slice(7) : allDesks.find(d => d.agentId === k)?.name ?? "Agent";
  const onHandover = useCallback((hs: Handover[]) => {
    for (const h of hs) {
      const from = primaryOf(h.from)?.key, to = h.to.startsWith("person:") ? `team:${h.to.slice(7)}` : primaryOf(h.to)?.key;
      if (from && to) officeStore.handover(from, to);
    }
    toast(hs.map(h => `${h.fromName} sent "${h.title}" to ${h.toName}`).join(" · "), "refresh");
  }, [primaryOf, toast]);
  useHandoverDetector(office, reviewer, nameOf, onHandover);

  async function rerun(f: RunView) {
    setRerunning(f.id);
    try {
      const j = await (await fetch(`/api/task/${f.issueId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws: f.ws, action: "rerun" }) })).json();
      if (j.error) throw new Error(j.error); toast(`${f.agent} is trying again: ${f.issueTitle ?? "task"}`, "refresh"); refresh();
    } catch (e) { toast("Couldn't retry: " + (e instanceof Error ? e.message : String(e)), "alert"); } finally { setRerunning(null); }
  }

  // ---------- selection & camera ----------
  const focusSeat = (s: Seat) => { if (s.level !== officeStore.get().level) officeStore.set({ level: s.level }); officeStore.cam({ type: "focus", x: s.x, y: levelY(s.level) + 0.8, z: s.z }); };
  const openSeat = (s: Seat) => { setOpen({ kind: "seat", key: s.key }); setAdding(false); officeStore.set({ selected: s.key }); focusSeat(s); };
  const openZone = (z: Zone) => { setOpen({ kind: "zone", id: z.id }); officeStore.set({ selected: null }); if (z.level !== level) officeStore.set({ level: z.level });
    officeStore.cam({ type: "focus", x: (z.x0 + z.x1) / 2, y: levelY(z.level) + 0.5, z: (z.z0 + z.z1) / 2, zoom: undefined }); };
  const startFollow = (key: string) => { const s = seatByKey.get(key); if (!s || isGone(s.state)) { toast(`${s?.name ?? "They"} isn't in the office right now`, "alert"); return; } if (s.level !== level) officeStore.set({ level: s.level }); officeStore.set({ follow: key }); };
  const openT = (t: { id: string; ws: string }) => { setOpenTask(t.id, t.ws); const a = allDesks.find(d => d.tasks.some(x => x.id === t.id)); const s = a && primaryOf(a.agentId); if (s) { officeStore.set({ selected: s.key }); focusSeat(s); } };

  // ---------- standup: agents on Level 1 walk to the meeting table and report their status in turn ----------
  const participants = useMemo(() => plan.seats.filter(s => s.kind === "agent" && s.primary && s.level === 1 && !isGone(s.state)), [plan.seats]);
  function startStandup() {
    if (officeStore.get().standup) return;
    if (!office.switchOpen) { toast("Open the office first", "alert"); return; }
    if (!participants.length) { toast("Nobody is in the office for a standup", "alert"); return; }
    setOpen(null); officeStore.set({ level: 1, standup: { startedAt: Date.now(), speaker: -1, lines: [] } });
    officeStore.cam({ type: "focus", x: MEET_CENTER[0], y: 0.6, z: MEET_CENTER[1], zoom: undefined });
  }
  useEffect(() => {
    if (!standup) return;
    const walkTime = 7000, each = 2300;
    const t = setTimeout(() => {
      const next = standup.speaker + 1;
      if (next >= participants.length) { officeStore.set({ standup: null }); toast(`Standup done · ${participants.length} agents reported`, "check"); return; }
      const s = participants[next];
      officeStore.set({ standup: { ...standup, speaker: next, lines: [...standup.lines, `${s.name}: ${s.bubble}`] } });
    }, standup.speaker < 0 ? walkTime : each);
    return () => clearTimeout(t);
  }, [standup, participants, toast]);

  // ---------- music ----------
  useEffect(() => { lofi.onChord(c => setChord(`72 bpm · ${c}`)); return () => lofi.onChord(null); }, []);
  useEffect(() => () => lofi.stop(), []);

  // ---------- derived lists ----------
  const a = attention;
  const total = a.overdue.length + a.human.length + a.review.length + a.failed.length;
  const sel = open?.kind === "seat" ? seatByKey.get(open.key) ?? null : null;
  const selZone = open?.kind === "zone" ? plan.zones.find(z => z.id === open.id) ?? null : null;
  const selRt = open?.kind === "runtime" ? office.runtimes.find(r => r.id === open.id) ?? null : null;
  const mika = allDesks.find(d => isManager(d.name));
  const [inbox, setInbox] = useState<{ id: string; label: string; title: string; when: string; read: boolean; issueId: string | null }[] | null>(null);
  useEffect(() => { if (hqTab !== "inbox") return; fetch(`/api/inbox?ws=${ws}`).then(r => r.json()).then(j => setInbox(j.items ?? [])).catch(() => setInbox([])); }, [hqTab, ws]);
  async function runPlaybook(p: { t: string; d: string }) {
    if (!mika) { toast(`No ${MANAGER} agent in this workspace`, "alert"); return; }
    try {
      const j = await (await fetch("/api/task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws, agentId: mika.agentId, title: p.t, detail: p.d, now: true }) })).json();
      if (j.error) throw new Error(j.error); toast(`Playbook "${p.t}" sent to ${MANAGER}`, "spark"); refresh();
    } catch (e) { toast("Couldn't start the playbook: " + (e instanceof Error ? e.message : String(e)), "alert"); }
  }
  const placement = newProject && (newProject.slot ?? plan.freeSlots[0] ?? null);
  const firstFree = plan.freeSlots.find(x => x.level === level);
  const speakerKey = standup && standup.speaker >= 0 ? participants[standup.speaker]?.key : null;

  // ---------- render ----------
  return (
    <div className={`o3d ${edit ? "editing" : ""}`}>
      <OfficeScene plan={plan} officeOpen={office.switchOpen} counts={counts}
        runtimes={office.runtimes.map(r => ({ id: r.id, name: r.name, owner: r.owner, online: r.online, quotaOut: r.quotaOut }))}
        offsets={offsets} onOffsets={(o, done) => { setOffsets(o); if (done) saveLayout({ offsets: o }); }}
        onSeat={openSeat} onZone={openZone} onRuntime={id => { setOpen({ kind: "runtime", id }); }} onSlot={s => setNewProject({ slot: s })} onHover={setHover} onHoverSeat={setHoverSeat} />
      <div className="vignette" />

      {/* name tags + "new project room" button, positioned on their 3D anchors by the scene */}
      <div className="labels3d">
        {plan.seats.filter(s => s.primary && !isGone(s.state) && s.level === level).map(s => {
          const hot = hoverSeat === s.key || sel?.key === s.key, speaking = speakerKey === s.key;
          if (!labels && !hot && !speaking) return null;
          return (
            <div key={s.key} ref={regLabel(s.key)} className={`tag3d ${hot ? "hot" : ""} ${speaking ? "speak" : ""}`}>
              <i className="dot" style={{ background: STATE_COLOR[s.state] }} /><b>{s.name}</b>{(hot || speaking) && <em>{s.bubble}</em>}
            </div>
          );
        })}
        {firstFree && !edit && (
          <div ref={regLabel(`slot:${firstFree.id}`)}>
            <button className="ghost-btn" onClick={() => setNewProject({ slot: firstFree })}>
              <span><Icon name="plus" size={14} /> New project room</span><small>up to {slotCap(firstFree)} desks · L{firstFree.level}</small>
            </button>
          </div>
        )}
      </div>

      {slot && createPortal(<><span className="isep" /><OfficeSwitch key={ws + String(office.switchOpen)} ws={ws} name={office.workspace} switchOpen={office.switchOpen} laptopOn={office.open} parked={office.parked} onDone={m => { toast(m, "power"); refresh(); }} /></>, slot)}

      {/* roster */}
      <div className="roster glass" role="toolbar" aria-label="Agents and people">
        {[...agents, ...humans].map((s, i, all) => (
          <span key={s.key} className="rwrap">
            <button className={`chip ${sel?.key === s.key ? "sel" : ""}`} onClick={() => openSeat(s)} title={`${s.name} · ${STATE_LABEL[s.state]}`}>
              <span className="av" style={{ background: s.kind === "agent" ? avColor(s.name) : "#cfd8e6" }}>{s.emoji ? <Emo e={s.emoji} /> : s.name[0]}<span className="sd" style={{ background: STATE_COLOR[s.state] }} /></span>
              <span className="nm">{s.name}</span>
              {s.kind === "agent" && <span className="eye" role="button" aria-label={`Follow ${s.name}`} onClick={e => { e.stopPropagation(); startFollow(s.key); }}><Icon name="eye" size={14} /></span>}
            </button>
            {s.kind === "agent" && all[i + 1]?.kind === "human" && <span className="r-sep" />}
          </span>
        ))}
      </div>

      {/* stats */}
      <div className="stats glass">
        <span className="stat"><i className="dot" style={{ background: "var(--s-working)" }} />Working <b>{counts.working}</b></span>
        <span className="stat"><i className="dot" style={{ background: "var(--s-review)" }} />Review <b>{counts.review}</b></span>
        <span className="stat"><i className="dot" style={{ background: "var(--s-failed)" }} />Failed <b>{counts.failed}</b></span>
        <span className="stat" title="AI engines online"><Icon name="server" size={15} /><b>{office.runtimes.filter(r => r.online).length}/{office.runtimes.length}</b></span>
        <span className="clock">{refreshing ? "Refreshing…" : office.updatedAt}</span>
        <button className="icb" onClick={() => officeStore.set(s => ({ panelOpen: !s.panelOpen }))} aria-label="Toggle HQ panel" title="HQ panel"><Icon name="panel" /></button>
      </div>

      {/* levels */}
      <div className="levels glass" aria-label="Floor">
        <span className="lv-h">Floor</span>
        {plan.levels === 1 && <button className="lv ghost" disabled title="Level 2 is built automatically when Level 1 has no free room slot">L2<small>—</small></button>}
        {Array.from({ length: plan.levels }, (_, i) => plan.levels - i).map(l => (
          <button key={l} className={`lv ${l === level ? "on" : ""}`} onClick={() => officeStore.set({ level: l })} title={`Level ${l}`}>
            L{l}<small>{plan.zones.filter(z => z.kind === "project" && z.level === l).length} rm</small>
          </button>
        ))}
      </div>

      {office.alerts.map(x => <div key={x} className="alertbar glass" role="alert"><Icon name="alert" /> {x}</div>)}
      {!office.switchOpen && !follow && <div className="banner glass"><i className="dot" style={{ background: "var(--s-off)" }} />Office closed — agents are paused.{office.parked ? <b> {office.parked} task(s) parked.</b> : null}</div>}
      {follow && <div className="banner glass"><Icon name="eye" size={15} />Following <b>{seatByKey.get(follow)?.name}</b><button className="btn sm" onClick={() => officeStore.set({ follow: null })}>Stop <kbd>Esc</kbd></button></div>}

      {/* HQ panel */}
      <aside className={`hq glass ${panelOpen && !open ? "" : "collapsed"}`} aria-label="Headquarters">
        <div className="hq-head"><div><h3>Headquarters</h3><p>{office.today}</p></div>
          <button className="icb" onClick={() => officeStore.set({ panelOpen: false })} aria-label="Collapse"><Icon name="x" /></button></div>
        <div className="seg">{([["attn", `Attention${total ? ` · ${total}` : ""}`], ["inbox", "Inbox"], ["play", "Playbooks"]] as const).map(([k, l]) =>
          <button key={k} className={hqTab === k ? "on" : ""} onClick={() => setHqTab(k)}>{l}</button>)}</div>
        <div className="hq-body">
          {hqTab === "attn" && (<>
            {total === 0 && <p className="muted pad">All clear. Nothing needs you right now ✨</p>}
            {a.overdue.length > 0 && <div className="grp"><div className="grp-h"><Icon name="clock" size={15} />Late or at risk<span className="n">{a.overdue.length}</span></div>{a.overdue.map(t => <TaskCard key={t.id} t={t} onOpen={() => openT(t)} />)}</div>}
            {a.human.length > 0 && <div className="grp"><div className="grp-h"><Icon name="person" size={15} />To-dos for people<span className="n">{a.human.length}</span></div>{a.human.map(t => <TaskCard key={t.id} t={t} onOpen={() => openT(t)} />)}</div>}
            {a.review.length > 0 && <div className="grp"><div className="grp-h"><Icon name="file" size={15} />To review<span className="n">{a.review.length}</span></div>{a.review.map(t => <TaskCard key={t.id} t={t} onOpen={() => openT(t)} />)}</div>}
            {a.failed.length > 0 && <div className="grp"><div className="grp-h"><Icon name="alert" size={15} />Failed<span className="n">{a.failed.length}</span></div>{a.failed.map(f => (
              <div key={f.id} className="card"><span className="row"><b>{f.issueTitle ?? "Untitled task"}</b><span className="pill2 p-late">FAILED</span></span><small>{f.agent} · {f.error} · {f.when}</small>
                <span className="row start">{f.issueId && <button className="btn sm" disabled={rerunning === f.id} onClick={() => rerun(f)}><Icon name="refresh" size={14} />{rerunning === f.id ? "…" : "Retry"}</button>}
                  {f.issueId && <button className="btn sm" onClick={() => setOpenTask(f.issueId!, f.ws)}>Open</button>}</span></div>))}</div>}
          </>)}
          {hqTab === "inbox" && (<div className="grp">
            {!inbox && <p className="muted pad"><span className="spinner sm" /> Loading…</p>}
            {inbox?.length === 0 && <p className="muted pad">Nothing yet.</p>}
            {inbox?.map(n => <button key={n.id} className={`card ${n.read ? "" : "unread"}`} onClick={() => n.issueId && setOpenTask(n.issueId)}><span className="row"><b>{n.label}</b><small>{n.when}</small></span><small><PxText text={n.title} /></small></button>)}
          </div>)}
          {hqTab === "play" && (<div className="grp"><div className="grp-h"><Icon name="list" size={15} />Templates · run by {MANAGER}</div>
            {PLAYBOOKS.map(p => <div key={p.t} className="card"><b>{p.t}</b><small>{p.d}</small><span className="row start"><button className="btn sm primary" onClick={() => runPlaybook(p)}>Run now</button></span></div>)}
          </div>)}
        </div>
      </aside>

      {/* drawer: seat / zone / runtime */}
      {open && (
        <aside className="drawer3 glass pop" role="dialog" aria-label="Details">
          {sel && (() => {
            const d = sel.desk; const tasks = d ? office.agentsDetail[d.agentId]?.tasks ?? [] : a.human.filter(t => t.assignee === sel.name);
            const runs = d ? office.agentsDetail[d.agentId]?.runs ?? [] : [];
            return (<>
              <div className="d-hero"><span className="big" style={{ background: sel.kind === "agent" ? avColor(sel.name) : "#cfd8e6" }}>{sel.emoji ? <Emo e={sel.emoji} /> : sel.name[0]}</span>
                <div><h3>{sel.name}</h3><p>{d ? d.runtime : "Team member"}</p></div>
                <button className="icb x" onClick={() => { setOpen(null); officeStore.set({ selected: null }); }} aria-label="Close"><Icon name="x" /></button></div>
              <div className="statusline"><i className="dot" style={{ background: STATE_COLOR[sel.state], boxShadow: `0 0 10px ${STATE_COLOR[sel.state]}` }} /><div><b>{STATE_LABEL[sel.state]}</b><small>{sel.bubble}</small></div></div>
              <div className="d-actions">
                {d && <button className="btn sm primary" onClick={() => { setDraft(""); setAdding(true); }}><Icon name="plus" size={14} />New task</button>}
                {d && <button className="btn sm" onClick={() => setChatWith(d)}><Icon name="chat" size={14} />Chat</button>}
                {!d && (() => { const m = office.members.find(x => x.name === sel.name); return m && m.id !== meId ? <button className="btn sm" onClick={() => openChat(m.id)}><Icon name="chat" size={14} />Message</button> : null; })()}
                {d && <button className="btn sm" onClick={() => startFollow(sel.key)}><Icon name="eye" size={14} />Follow</button>}
              </div>
              <div className="d-body">
                {adding && d && <NewTaskForm ws={ws} desk={d} projects={office.projects} initialDetail={draft} onDone={id => { setAdding(false); setDraft(""); refresh(); if (id) setOpenTask(id); }} />}
                {!d && <><div className="sect">To review ({a.review.length})</div>{a.review.map(t => <TaskCard key={t.id} t={t} onOpen={() => setOpenTask(t.id, t.ws)} />)}</>}
                <div className="sect">{d ? "Open tasks" : `To-dos for ${sel.name}`} ({tasks.length})</div>
                {tasks.length ? tasks.map(t => <TaskCard key={t.id} t={t} who={false} onOpen={() => setOpenTask(t.id, t.ws)} />) : <p className="muted pad">Nothing open.</p>}
                {d && <><div className="sect">Recent work</div>{runs.length ? runs.map(r => (
                  <button key={r.id} className="card" onClick={() => r.issueId && setOpenTask(r.issueId, r.ws)}><span className="row"><b>{r.issueTitle ?? "Task"}</b>
                    <span className={`pill2 ${r.status === "failed" ? "p-late" : r.status === "completed" ? "p-done" : "p-doing"}`}>{r.status === "failed" ? "FAILED" : r.status === "completed" ? "DONE" : "RUNNING"}</span></span>
                    <small>{r.when}{r.error ? ` · ${r.error}` : ""}</small></button>)) : <p className="muted pad">Hasn&apos;t worked yet.</p>}</>}
                {d?.description && <details className="about"><summary>About {sel.name}</summary><p className="muted">{d.description}</p></details>}
              </div>
            </>);
          })()}
          {selZone && (<>
            <div className="d-hero"><span className="big" style={{ background: selZone.tint }}><Icon name={selZone.kind === "srv" ? "server" : selZone.kind === "meet" ? "calendar" : "office"} /></span>
              <div><h3>{selZone.name}</h3><p>{selZone.kind === "project" ? `Project room · Level ${selZone.level} · slot ${selZone.slot}` : selZone.kind === "lounge" ? "Agents without a project" : "Shared space"}</p></div>
              <button className="icb x" onClick={() => setOpen(null)} aria-label="Close"><Icon name="x" /></button></div>
            {selZone.progress && <div className="statusline"><Icon name="check" size={16} /><div><b>{selZone.progress}</b></div></div>}
            {selZone.kind === "meet" && <div className="d-actions"><button className="btn sm primary" onClick={startStandup}><Icon name="calendar" size={14} />Start standup</button></div>}
            <div className="d-body">
              {(() => { const list = plan.seats.filter(s => s.zone === selZone.id); return list.length ? <><div className="sect">Desks ({list.length})</div>{list.map(s => (
                <button key={s.key} className="card" onClick={() => openSeat(s)}><span className="row"><span><i className="dot" style={{ background: STATE_COLOR[s.state] }} /> <b>{s.name}</b></span><small>{STATE_LABEL[s.state]}</small></span><small>{s.bubble}</small></button>))}</> : null; })()}
              {selZone.kind === "project" && (() => { const room = office.rooms.find(r => r.id === selZone.id); const ts = room ? room.desks.flatMap(x => x.tasks) : [];
                return ts.length ? <><div className="sect">Tasks</div>{ts.map(t => <TaskCard key={t.id} t={t} onOpen={() => setOpenTask(t.id, t.ws)} />)}</> : <p className="muted pad">No agent tasks in this room yet. Assign a task to an agent in this project and their desk appears here.</p>; })()}
              {selZone.kind === "srv" && office.runtimes.map(r => <button key={r.id} className="card" onClick={() => setOpen({ kind: "runtime", id: r.id })}><span className="row"><b>{r.name}{r.owner ? ` · ${r.owner}` : ""}</b><span className={`pill2 ${r.online ? "p-doing" : "p-late"}`}>{r.online ? "ONLINE" : "OFF"}</span></span><small>{r.quotaOut ? `AI quota used up${r.quotaReset ? ` · resets ${r.quotaReset}` : ""}` : `Last seen ${r.lastSeen}`}</small></button>)}
            </div>
          </>)}
          {selRt && (<>
            <div className="d-hero"><span className="big" style={{ background: selRt.online ? "#3ee6c1" : "#ff5d6c" }}><Icon name="server" /></span>
              <div><h3>{selRt.name}</h3><p>AI engine{selRt.owner ? ` · ${selRt.owner}'s laptop` : ""}</p></div>
              <button className="icb x" onClick={() => setOpen(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="statusline"><i className="dot" style={{ background: selRt.online ? "var(--s-working)" : "var(--s-failed)" }} /><div><b>{selRt.online ? "Online" : "Laptop off"}</b><small>{selRt.quotaOut ? `AI quota used up${selRt.quotaReset ? ` · resets ${selRt.quotaReset}` : ""}` : `Last seen ${selRt.lastSeen}`}</small></div></div>
            <div className="d-body"><p className="muted pad">Agents run on the laptop their engine belongs to. When it is off, their work waits.</p></div>
          </>)}
        </aside>
      )}

      {/* toolbar */}
      <div className="toolbar glass" role="toolbar" aria-label="View">
        <button className="tb" onClick={() => officeStore.cam({ type: "rotate", dir: -1 })} title="Rotate left (Q)"><Icon name="rotL" /></button>
        <button className="tb" onClick={() => officeStore.cam({ type: "rotate", dir: 1 })} title="Rotate right (E)"><Icon name="rotR" /></button>
        <button className="tb" onClick={() => officeStore.cam({ type: "zoom", factor: 1 / 1.25 })} title="Zoom out"><Icon name="minus" /></button>
        <button className="tb" onClick={() => officeStore.cam({ type: "zoom", factor: 1.25 })} title="Zoom in"><Icon name="plus" /></button>
        <button className="tb" onClick={() => officeStore.cam({ type: "reset" })} title="Reset view (R)"><Icon name="target" /></button>
        <button className={`tb ${labels ? "on" : ""}`} onClick={() => officeStore.set(s => ({ labels: !s.labels }))} title="Name tags (L)"><Icon name="tag" /></button>
        <span className="tb-sep" />
        <button className={`tb ${walk ? "on" : ""}`} onClick={() => { officeStore.set(s => ({ walk: !s.walk })); if (!walk) toast("Walk around with W A S D · drag to look around", "move"); }} title="Walk with WASD"><Icon name="move" /><span>Walk</span><kbd>WASD</kbd></button>
        <button className={`tb ${standup ? "on" : ""}`} onClick={startStandup} title="Gather agents for a standup"><Icon name="calendar" /><span>Standup</span></button>
        <button className={`tb ${music || playing ? "on" : ""}`} onClick={() => setMusic(m => !m)} title="Ambient music"><Icon name="music" /><span>Music</span></button>
        <button className={`tb ${edit ? "on" : ""}`} onClick={() => { officeStore.set(s => ({ edit: !s.edit })); toast(edit ? "Layout saved" : "Edit layout: drag desks, sofas, plants and the coffee bar", "pencil"); }} title="Edit layout"><Icon name="pencil" /><span>{edit ? "Done" : "Edit"}</span></button>
      </div>

      {music && (
        <div className="music glass pop">
          <div className="row">
            <button className="btn primary round" onClick={() => { if (lofi.playing) lofi.stop(); else lofi.start(); setPlaying(lofi.playing); }} aria-label={playing ? "Pause" : "Play"}><Icon name={playing ? "pause" : "play"} size={15} /></button>
            <div className="grow"><b>Midnight lo-fi</b><small>{chord}</small></div>
          </div>
          <input type="range" min={0} max={100} value={vol} onChange={e => { setVol(+e.target.value); lofi.volume(+e.target.value / 100); }} aria-label="Volume" />
        </div>
      )}

      {standup && (
        <div className="standup glass pop">
          <h4><Icon name="calendar" size={16} />Daily standup<span className="pill2 p-doing">LIVE</span></h4>
          {standup.speaker < 0 ? <p className="muted">Agents are walking to the meeting room…</p>
            : standup.lines.slice(-5).map(l => { const [n, ...rest] = l.split(": "); return <div key={l} className="su-line"><b>{n}</b><span>{rest.join(": ")}</span></div>; })}
        </div>
      )}

      <div className="legend glass">
        <span className="h">Status</span>
        {(["working", "review", "failed", "ready", "break", "off"] as const).map(s => <span key={s}><i className="dot" style={{ background: STATE_COLOR[s] }} />{STATE_LABEL[s]}</span>)}
      </div>

      {hover && <div className="tip glass" style={{ left: hover.x + 14, top: hover.y + 14 }}><b>{hover.title}</b>{hover.sub && <small>{hover.sub}</small>}</div>}
      <div className="toasts">{toasts.map(t => <div key={t.id} className="toast3 glass pop"><span className="acc"><Icon name={t.icon} size={16} /></span><span>{t.text}</span></div>)}</div>

      {mika && !chatWith && (
        <button className="mikafab3 glass" onClick={() => setChatWith(mika)} aria-label={`Chat with ${MANAGER}, the office manager`}>
          <span className="av">{mika.emoji ? <Emo e={mika.emoji} /> : "✦"}</span><span><b>Ask {MANAGER}</b><small>Office manager</small></span>
        </button>
      )}
      {chatWith && <div className="scrim" onClick={() => setChatWith(null)} />}
      {chatWith && (
        <ChatPanel ws={ws} agent={{ id: chatWith.agentId, name: chatWith.name, emoji: chatWith.emoji, role: chatWith.description }}
          isMika={isManager(chatWith.name)} projectId={null} laptopOn={office.open} onClose={() => setChatWith(null)}
          onMakeTask={(detail, agentId) => { const s = primaryOf(agentId) ?? (chatWith && primaryOf(chatWith.agentId)); setChatWith(null); if (s) { openSeat(s); setDraft(detail); setAdding(true); } }} />
      )}
      {newProject && (
        <NewProject ws={ws}
          placement={placement ? `Its room goes to Level ${placement.level} · slot ${placement.id} (up to ${slotCap(placement)} desks).` : `This floor is full: the room goes to a new Level ${plan.levels + 1}.`}
          people={[...office.members.map(m => ({ kind: "member" as const, id: m.id, name: m.name, emoji: null })), ...[...new Map(allDesks.map(d => [d.agentId, d])).values()].map(d => ({ kind: "agent" as const, id: d.agentId, name: d.name, emoji: d.emoji }))]}
          onDone={(id, title) => { setNewProject(null); if (id) {
            const slotId = placement?.id ?? `${plan.levels + 1}A`, nextRes = [...reserved, { id, name: title ?? "New project" }], nextPins = { ...pins, [id]: slotId };
            setReserved(nextRes); setPins(nextPins); saveLayout({ reserved: nextRes, rooms: nextPins });
            officeStore.set({ level: Number(slotId[0]) }); toast("Project created. Assign a task to an agent in it to fill its room.", "check"); refresh(); } }} />
      )}
      {openTask && <div className="scrim" onClick={() => setOpenTask(null)} />}
      {openTask && <TaskPanel id={openTask.id} ws={openTask.ws} onClose={() => setOpenTask(null)} onChanged={refresh} />}
    </div>
  );
}
