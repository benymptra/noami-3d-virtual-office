// Demo mode: an in-memory stand-in for the Multica API, so the office runs without a Multica login.
// Turn it on with MULTICA_DEMO=1 in .env.local. Only lib/multica.ts calls this (server side).
// Writes (approve, new task, chat, open/close office...) change this memory until the dev server restarts.
import "server-only";

type Json = Record<string, unknown>;
const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.KANTOR_TIMEZONE || "Asia/Jakarta" }).format(d);
};
let seq = 1000;
const nid = (p: string) => `${p}-${(seq++).toString(36)}`;

const WS = { id: "ws-noami", name: "Noami Studio", slug: "noami-studio" };
const ME = { id: "u-beny", name: "Beny" };

function seed() {
  const members = [
    { id: "m-beny", user_id: "u-beny", name: "Beny", email: "owner@noami.test", role: "owner" },
    { id: "m-sarah", user_id: "u-sarah", name: "Sarah", email: "sarah@noami.test", role: "admin" },
    { id: "m-dimas", user_id: "u-dimas", name: "Dimas", email: "dimas@noami.test", role: "member" },
    { id: "m-rani", user_id: "u-rani", name: "Rani", email: "rani@noami.test", role: "member" },
  ];
  const runtimes = [
    { id: "rt-beny", name: "Beny-MacBook", provider: "claude", status: "online", last_seen_at: ago(1), owner_id: "u-beny" },
    { id: "rt-sarah", name: "Sarah-Air", provider: "codex", status: "online", last_seen_at: ago(1), owner_id: "u-sarah" },
    { id: "rt-studio", name: "Studio-Server", provider: "claude", status: "online", last_seen_at: ago(1), owner_id: "u-beny" },
    { id: "rt-dimas", name: "Dimas-PC", provider: "claude", status: "offline", last_seen_at: ago(140), owner_id: "u-dimas" },
    { id: "rt-pixel", name: "Pixel-Box", provider: "codex", status: "online", last_seen_at: ago(2), owner_id: "u-sarah" },
  ];
  const agent = (id: string, name: string, description: string, runtime_id: string, emoji: string, model = "") =>
    ({ id, name, description, avatar_url: `emoji:${emoji}`, runtime_id, status: "idle", model, archived_at: null });
  const agents = [
    agent("a-arka", "Arka", "Frontend engineer. Builds pages and components.", "rt-beny", "🛠️", "sonnet"),
    agent("a-lumi", "Lumi", "Copywriter. Headlines, captions and landing copy.", "rt-beny", "✍️", "sonnet"),
    agent("a-kode", "Kode", "QA engineer. Writes and runs tests.", "rt-sarah", "🧪"),
    agent("a-nara", "Nara", "Social media. Plans and drafts posts.", "rt-studio", "📣", "sonnet"),
    agent("a-vex", "Vex", "Visual designer. Carousels, banners, brand assets.", "rt-sarah", "🎨"),
    agent("a-juno", "Juno", "Data analyst. KPIs and decks.", "rt-dimas", "📊", "opus"),
    agent("a-sora", "Sora", "ETL engineer. Pipelines and reports.", "rt-studio", "🔧", "sonnet"),
    agent("a-rhea", "Rhea", "Researcher. Market and competitor research.", "rt-studio", "🔎", "opus"),
    agent("a-mika", "Mika", "Office manager. Plans work, creates tasks and agents.", "rt-studio", "🦄", "opus"),
    agent("a-pixel", "Pixel", "Illustrator. Spot illustrations and icons.", "rt-pixel", "🖌️"),
  ];
  const projects = [
    { id: "p-web", title: "Website Revamp", icon: "🌐", status: "in_progress", due_date: day(12), issue_count: 12, done_count: 7 },
    { id: "p-cmp", title: "Campaign Q4", icon: "📣", status: "in_progress", due_date: day(20), issue_count: 9, done_count: 4 },
    { id: "p-dat", title: "Data Pipeline", icon: "🗄️", status: "in_progress", due_date: day(30), issue_count: 5, done_count: 3 },
  ];
  let n = 30;
  const issue = (title: string, status: string, project_id: string | null, who: [string, string] | null, due: number | null, extra: Json = {}) => ({
    id: nid("i"), identifier: `NOA-${n++}`, title, status, priority: "medium", due_date: due === null ? null : day(due), start_date: null,
    project_id, assignee_type: who ? who[0] : null, assignee_id: who ? who[1] : null, updated_at: ago(30), last_activity_at: ago(30), created_at: ago(3000),
    metadata: {}, description: `Brief for "${title}".\n\nKeep it on brand: confident, warm, no jargon.`, ...extra,
  });
  const A = (id: string): [string, string] => ["agent", id];
  const H = (uid: string): [string, string] => ["member", uid];
  const issues = [
    issue("Pricing section build", "in_progress", "p-web", A("a-arka"), 1),
    issue("Landing page build", "in_review", "p-web", A("a-arka"), -1),
    issue("Hero copy v2", "in_review", "p-web", A("a-lumi"), -2),
    issue("Regression suite · checkout", "in_progress", "p-web", A("a-kode"), 4),
    issue("Caption ideas for the teaser", "in_progress", "p-cmp", A("a-nara"), 3),
    issue("Instagram carousel ×5", "in_review", "p-cmp", A("a-vex"), 0),
    issue("Q4 KPI deck", "todo", "p-cmp", A("a-juno"), 0),
    issue("Weekly ETL report", "todo", "p-dat", A("a-sora"), 5),
    issue("Backfill October orders", "todo", "p-dat", A("a-sora"), 6),
    issue("Scrape competitor prices", "todo", "p-dat", A("a-rhea"), 0),
    issue("Plan next week's sprint", "todo", null, A("a-mika"), 3),
    issue("Approve brand palette", "todo", "p-cmp", H("u-beny"), 0),
    issue("Upload product photos", "todo", "p-web", H("u-sarah"), 1),
    issue("Spot illustrations for the blog", "backlog", null, A("a-pixel"), null),
  ];
  const byTitle = (t: string) => issues.find(i => i.title === t)!;
  const run = (agent_id: string, t: string, status: string, minAgo: number, error: string | null = null) => ({
    id: nid("r"), agent_id, issue_id: byTitle(t).id, status, error, created_at: ago(minAgo), started_at: ago(minAgo), completed_at: status === "running" ? null : ago(minAgo - 5),
    runtime_id: agents.find(a => a.id === agent_id)!.runtime_id,
  });
  const runs = [
    run("a-arka", "Pricing section build", "running", 6),
    run("a-arka", "Landing page build", "completed", 300),
    run("a-lumi", "Hero copy v2", "completed", 90),
    run("a-kode", "Regression suite · checkout", "running", 3),
    run("a-nara", "Caption ideas for the teaser", "running", 12),
    run("a-vex", "Instagram carousel ×5", "completed", 40),
    run("a-rhea", "Scrape competitor prices", "failed", 25, "Browser timed out while loading competitor-a.test (60s)"),
    run("a-pixel", "Spot illustrations for the blog", "failed", 50, "You've hit your 5-hour limit · resets 4pm (Asia/Jakarta)"),
    run("a-sora", "Weekly ETL report", "completed", 2000),
  ];
  // the last run of the ETL report is old: Sora is "ready", not "finished"
  byTitle("Weekly ETL report").updated_at = ago(10);

  const report = (summary: string[], questions: string[], body: string) =>
    `## Summary\n${summary.map(s => `- ${s}`).join("\n")}\n\n${questions.length ? `## Questions\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` : ""}${body}`;
  const comments: Record<string, Json[]> = {};
  const say = (t: string, author: [string, string], content: string, min: number) =>
    (comments[byTitle(t).id] ??= []).push({ id: nid("c"), author_type: author[0], author_id: author[1], content, type: "comment", parent_id: null, created_at: ago(min), attachments: [] });
  say("Hero copy v2", H("u-beny"), "Please make the hero more confident. Keep it under 60 characters.", 200);
  say("Hero copy v2", A("a-lumi"), report(["Two hero directions ready: **Bold** and **Warm**.", "All headlines are under 60 characters."],
    ["Which tone should the final version use? Options: Bold / Warm / Keep both", "Ship to staging after approval? Options: Yes / Wait for Sarah"],
    "### Bold\n**Build faster. Ship calmer.**\nThe studio that turns ideas into launches.\n\n### Warm\n**Your next launch, without the late nights.**\nA small team with a big crew of AI helpers."), 88);
  say("Landing page build", A("a-arka"), report(["Landing page is built and deployed to the preview.", "Lighthouse: 96 performance, 100 accessibility."], [],
    "```diff\n- return <div className=\"grid\">{plans.map(Card)}</div>\n+ const [yearly, setYearly] = useState(false);\n+ return <section aria-label=\"Pricing\">…</section>\n```"), 290);
  say("Instagram carousel ×5", A("a-vex"), report(["Five carousels ready in the brand palette.", "Each has a cover, 4 content slides and a CTA."],
    ["Use the new palette or the current one? Options: New / Current"], "Files are in the shared drive folder *Campaign Q4 / Carousels*."), 38);

  const inbox = [
    { id: nid("n"), type: "comment", issue_id: byTitle("Hero copy v2").id, title: "Lumi asked you a question", body: "Which tone should the final version use?", read: false, created_at: ago(4) },
    { id: nid("n"), type: "review", issue_id: byTitle("Instagram carousel ×5").id, title: "Vex needs your review", body: "Instagram carousel ×5", read: false, created_at: ago(12) },
    { id: nid("n"), type: "failed", issue_id: byTitle("Scrape competitor prices").id, title: "Rhea failed a run", body: "Browser timed out", read: false, created_at: ago(25) },
    { id: nid("n"), type: "mention", issue_id: byTitle("Approve brand palette").id, title: "Sarah mentioned you", body: "@Beny can you approve the palette today?", read: false, created_at: ago(60) },
    { id: nid("n"), type: "review", issue_id: byTitle("Landing page build").id, title: "Arka finished a task", body: "Landing page build → Needs review", read: true, created_at: ago(120) },
  ];
  return {
    members, runtimes, agents, projects, issues, runs, comments, inbox,
    settings: { kantor: { open: true } } as Json,
    chats: [] as Json[], chatMsgs: {} as Record<string, Json[]>,
    autopilots: [{ id: "ap-1", title: "Hourly health check", status: "active" }],
  };
}

type DB = ReturnType<typeof seed>;
const g = globalThis as unknown as { __noamiDemo?: DB };
const db = () => (g.__noamiDemo ??= seed());

const notFound = (path: string) => { throw new Error(`Demo API: no fake for ${path}`); };

export async function demoCall(method: string, path: string, _ws: string | undefined, body: unknown): Promise<unknown> {
  const d = db();
  const b = (body ?? {}) as Json;
  const url = new URL(path, "http://demo");
  const p = url.pathname;
  const m = (re: RegExp) => p.match(re);
  let r: RegExpMatchArray | null;

  if (method === "GET") {
    if (p === "/api/workspaces") return [WS];
    if (p === "/api/me") return ME;
    if (p === "/api/agents") return d.agents;
    if (p === "/api/projects") return d.projects;
    if (p === "/api/runtimes") return d.runtimes;
    if (p === "/api/autopilots") return d.autopilots;
    if (p === "/api/inbox") return d.inbox;
    if (p === "/api/inbox/unread-count") return { count: d.inbox.filter(i => !i.read).length };
    if (p === "/api/chat/sessions") return d.chats;
    if (p === "/api/issues") return { issues: d.issues, has_more: false };
    if ((r = m(/^\/api\/workspaces\/([^/]+)\/members$/))) return d.members;
    if ((r = m(/^\/api\/workspaces\/([^/]+)\/invitations$/))) return [];
    if ((r = m(/^\/api\/workspaces\/([^/]+)$/))) return { ...WS, settings: d.settings };
    if ((r = m(/^\/api\/agents\/([^/]+)\/tasks$/))) return d.runs.filter(x => x.agent_id === r![1]);
    if ((r = m(/^\/api\/issues\/([^/]+)\/comments$/))) return d.comments[r[1]] ?? [];
    if ((r = m(/^\/api\/issues\/([^/]+)\/attachments$/))) return [];
    if ((r = m(/^\/api\/issues\/([^/]+)\/active-task$/))) return d.runs.filter(x => x.issue_id === r![1] && ["running", "queued"].includes(x.status));
    if ((r = m(/^\/api\/issues\/([^/]+)$/))) return d.issues.find(i => i.id === r![1]) ?? notFound(p);
    if ((r = m(/^\/api\/chat\/sessions\/([^/]+)\/messages$/))) return d.chatMsgs[r[1]] ?? [];
    if ((r = m(/^\/api\/chat\/sessions\/([^/]+)\/pending-task$/))) return {};
    return notFound(p);
  }

  // ---- writes ----
  if (method === "PUT" && (r = m(/^\/api\/issues\/([^/]+)\/metadata\/(.+)$/))) {
    const i = d.issues.find(x => x.id === r![1]); if (i) (i.metadata as Json)[decodeURIComponent(r[2])] = b.value ?? b; return {};
  }
  if (method === "DELETE" && (r = m(/^\/api\/issues\/([^/]+)\/metadata\/(.+)$/))) {
    const i = d.issues.find(x => x.id === r![1]); if (i) delete (i.metadata as Json)[decodeURIComponent(r[2])]; return {};
  }
  if (method === "PUT" && (r = m(/^\/api\/issues\/([^/]+)$/))) {
    const i = d.issues.find(x => x.id === r![1]); if (!i) return notFound(p);
    Object.assign(i, b, { updated_at: now() });
    if (b.status === "done" || b.status === "cancelled") d.runs = d.runs.filter(x => !(x.issue_id === i.id && x.status === "running"));
    if (b.status === "in_progress" && i.assignee_type === "agent") startRun(d, i.assignee_id!, i.id);
    return i;
  }
  if (method === "POST" && p === "/api/issues") {
    const n = d.issues.length + 30;
    const i = { id: nid("i"), identifier: `NOA-${n}`, title: String(b.title ?? "Untitled"), status: String(b.status ?? "todo"), priority: String(b.priority ?? "medium"),
      due_date: (b.due_date as string) ?? null, start_date: null, project_id: (b.project_id as string) ?? null,
      assignee_type: (b.assignee_type as string) ?? null, assignee_id: (b.assignee_id as string) ?? null,
      updated_at: now(), last_activity_at: now(), created_at: now(), metadata: {} as Json, description: (b.description as string) ?? "" };
    d.issues.push(i as (typeof d.issues)[number]);
    if (i.assignee_type === "agent" && i.status !== "backlog") startRun(d, i.assignee_id!, i.id);
    return i;
  }
  if (method === "POST" && (r = m(/^\/api\/issues\/([^/]+)\/comments$/))) {
    const list = (d.comments[r[1]] ??= []);
    list.push({ id: nid("c"), author_type: "member", author_id: ME.id, content: String(b.content ?? ""), type: "comment", parent_id: null, created_at: now(), attachments: [] });
    const i = d.issues.find(x => x.id === r![1]);
    if (i?.assignee_type === "agent" && !["done", "cancelled"].includes(i.status)) {
      i.status = "in_progress"; startRun(d, i.assignee_id!, i.id);
    }
    return list[list.length - 1];
  }
  if (method === "POST" && (r = m(/^\/api\/issues\/([^/]+)\/rerun$/))) {
    const i = d.issues.find(x => x.id === r![1]); if (i?.assignee_id) startRun(d, i.assignee_id, i.id); return {};
  }
  if (method === "POST" && (r = m(/^\/api\/issues\/([^/]+)\/tasks\/([^/]+)\/cancel$/))) {
    const run = d.runs.find(x => x.id === r![2]); if (run) { run.status = "cancelled"; run.completed_at = now(); } return {};
  }
  if (method === "PATCH" && (r = m(/^\/api\/workspaces\/([^/]+)$/))) { Object.assign(d.settings, (b.settings as Json) ?? {}); return { ...WS, settings: d.settings }; }
  if (method === "POST" && p === "/api/projects") {
    const pr = { id: nid("p"), title: String(b.title ?? "New project"), icon: (b.icon as string) ?? null, status: "planned", due_date: (b.due_date as string) ?? null, issue_count: 0, done_count: 0 };
    d.projects.push(pr); return pr;
  }
  if (method === "POST" && p === "/api/agents") {
    const a = { id: nid("a"), name: String(b.name ?? "Agent"), description: String(b.description ?? ""), avatar_url: (b.avatar_url as string) ?? null,
      runtime_id: String(b.runtime_id ?? "rt-studio"), status: "idle", model: "", archived_at: null };
    d.agents.push(a); return a;
  }
  if (method === "PUT" && (r = m(/^\/api\/agents\/([^/]+)$/))) { const a = d.agents.find(x => x.id === r![1]); if (a) Object.assign(a, b); return a ?? {}; }
  if (method === "POST" && p === "/api/workspaces") return { ...WS };
  if (method === "POST" && (r = m(/^\/api\/workspaces\/([^/]+)\/members$/))) return { id: nid("inv"), invitee_email: b.email, role: b.role ?? "member", created_at: now() };
  if (method === "PATCH" && (r = m(/^\/api\/autopilots\/([^/]+)$/))) { const a = d.autopilots.find(x => x.id === r![1]); if (a) a.status = String(b.status); return a ?? {}; }
  if (method === "POST" && p === "/api/inbox/mark-all-read") { d.inbox.forEach(i => (i.read = true)); return {}; }
  if (method === "POST" && (r = m(/^\/api\/inbox\/issues\/([^/]+)\/read$/))) { d.inbox.filter(i => i.issue_id === r![1]).forEach(i => (i.read = true)); return {}; }
  if (method === "POST" && (r = m(/^\/api\/inbox\/([^/]+)\/read$/))) { const i = d.inbox.find(x => x.id === r![1]); if (i) i.read = true; return {}; }
  if (method === "POST" && p === "/api/chat/sessions") {
    const s = { id: nid("s"), agent_id: String(b.agent_id), project_id: (b.project_id as string) ?? null, title: String(b.title ?? "Chat"), status: "active", updated_at: now(), created_at: now(), last_message: null, unread_count: 0 };
    d.chats.unshift(s); return s;
  }
  if (method === "POST" && (r = m(/^\/api\/chat\/sessions\/([^/]+)\/messages$/))) {
    const list = (d.chatMsgs[r[1]] ??= []);
    const text = String(b.content ?? "");
    list.push({ id: nid("cm"), role: "user", content: text, created_at: now(), failure_reason: null });
    const s = d.chats.find(x => x.id === r![1]);
    const agent = d.agents.find(a => a.id === s?.agent_id);
    list.push({ id: nid("cm"), role: "assistant", created_at: now(), failure_reason: null,
      content: agent?.name === "Mika"
        ? `On it. Right now ${d.runs.filter(x => x.status === "running").length} agents are working and ${d.issues.filter(i => i.status === "in_review").length} tasks wait for your review. Want me to turn "${text.slice(0, 60)}" into a task?`
        : `Got it — I'll fold that into my current work and report back in the summary. (demo reply)` });
    if (s) { s.updated_at = now(); s.last_message = { content: text }; }
    return list[list.length - 2];
  }
  if (method === "POST" && (r = m(/^\/api\/chat\/sessions\/([^/]+)\/read$/))) return {};
  return notFound(`${method} ${p}`);
}

function startRun(d: DB, agentId: string, issueId: string) {
  const agent = d.agents.find(a => a.id === agentId); if (!agent) return;
  d.runs = d.runs.filter(x => !(x.agent_id === agentId && x.status === "running"));
  d.runs.push({ id: nid("r"), agent_id: agentId, issue_id: issueId, status: "running", error: null, created_at: now(), started_at: now(), completed_at: null, runtime_id: agent.runtime_id });
}

export const DEMO = process.env.MULTICA_DEMO === "1";
