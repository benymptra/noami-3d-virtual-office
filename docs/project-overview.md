# Noami · Virtual Office: ringkasan proyek

Bacaan pertama untuk session baru. Ditulis 20 Nov 2026; kalau kode berbeda dari catatan ini, kode yang benar.

## Apa ini

UI kantor virtual 3D isometric untuk workspace **Multica** (platform agent AI: agent, task/issue, project, runtime).
Fork dari [kantor-virtual](https://github.com/sarahshafiran/kantor-virtual) milik Sarah: semua logika data Multica-nya
dipertahankan, tampilannya diganti dengan scene 3D (React Three Fiber) bertema **Midnight Steel** plus panel kaca
gaya Apple yang melayang di atas scene.

- Agent = karakter di meja; status (working/review/failed/ready/break/off) terbaca dari warna, cincin, dan monitor.
- Project = ruang di lantai; runtime = rak server; meeting room untuk standup; lounge untuk agent yang istirahat.
- UI berbahasa Inggris; dokumen (PRD, catatan ini) berbahasa Indonesia.

## Lokasi

| Apa | Di mana |
|---|---|
| Folder kerja | `~/Documents/Vibe Code Project/Noami - Virtual Office/` |
| Kode (repo git) | `…/Noami - Virtual Office/app/` |
| PRD asli | `…/Noami - Virtual Office/PRD.md` (salinan di `app/docs/PRD.md`) |
| Mockup Three.js satu file | `…/Noami - Virtual Office/mockup/index.html` (salinan di `app/docs/mockups/`) |
| Capture README | `app/docs/screenshots/*.jpg` |
| GitHub | `origin` = https://github.com/benymptra/noami-3d-virtual-office (branch `main`), `upstream` = repo Sarah |

## Stack

Next.js 15.5 (App Router) · React 19.1 · TypeScript · three 0.186 · @react-three/fiber 9 · drei 10
(OrbitControls, OrthographicCamera; **tidak** memakai `<Html>` drei) · @react-three/postprocessing (Bloom).
Node lewat nvm (`. ~/.nvm/nvm.sh`). Versi paket dipin.

## Menjalankan

```bash
cd ~/"Documents/Vibe Code Project/Noami - Virtual Office/app" && npm run dev
```
Buka http://127.0.0.1:3456. Server sengaja hanya mendengarkan 127.0.0.1 (lihat bagian "Berbagi" di bawah).
Launch config `noami-office` ada di `Vibe Code Project/.claude/launch.json`.

`.env.local` (tidak ikut git) menentukan mode:

| Mode | Isi `.env.local` |
|---|---|
| Demo (data contoh di memori) | `MULTICA_DEMO=1` |
| multica.ai (aktif sekarang) | `MULTICA_API_URL=https://api.multica.ai`, `MULTICA_APP_URL=https://multica.ai`, `MULTICA_TOKEN=…` |
| Server sendiri (playdev) | tiga baris yang sama dengan URL `api.multica.playdev.online` / `multica.playdev.online`; saat ini dijadikan komentar |

Token dibuat di web Multica → Settings → Tokens. Isi token langsung di `.env.local`, jangan ditempel di chat.
Next memuat ulang `.env.local` sendiri saat file berubah.

## Peta kode

| Bagian | File |
|---|---|
| Panggilan API Multica (server-side) | `lib/multica.ts` → `call()`; `noamiLayout()` / `saveNoamiLayout()` |
| API Multica palsu untuk demo | `lib/demo-api.ts` (workspace "Noami Studio", 10 agent, 3 project) |
| Data kantor (agent, status, task) | `lib/office.ts` (logika asli Sarah, sebisa mungkin tidak diubah) |
| Halaman Office | `app/page.tsx` → `app/office-view.tsx` (semua UI melayang) |
| Scene 3D | `app/_office-3d/scene.tsx` |
| Denah: zona, slot project, lantai | `app/_office-3d/plan.ts` |
| Geometri/material bersama (cache) | `app/_office-3d/geo.ts` |
| Store bersama UI ↔ scene | `app/_office-3d/store.ts` (`officeStore`, `useOffice`) |
| Posisi label DOM | `app/_office-3d/anchors.ts` + `LabelProjector` di scene |
| Musik lo-fi (WebAudio) | `app/_office-3d/lofi.ts` |
| Island + dock (semua halaman) | `app/shell.tsx`, ikon di `app/icons.tsx` |
| Tema Midnight Steel Glass | `app/steel.css` (dilapis setelah `globals.css`) |
| Simpan layout | `app/api/layout/route.ts` |
| Halaman lain | `app/papan/` (Task Board), `app/tim/` (Team) |
| Penjaga (lanjutkan task + Telegram) | `lib/watchdog.ts`, `instrumentation*.ts`, `scripts/penjaga.ts`, `.github/workflows/penjaga.yml` |

Folder 3D diberi awalan `_` karena Next menganggap `layout.ts` di folder route sebagai route layout.

## Konsep penting

- **Denah (`plan.ts`)**: L1 punya zona tetap (team desks, lounge, meeting, runtimes) dan slot project `1A–1D`.
  Project mengisi slot pertama yang muat; kalau penuh, lantai baru ditumpuk (`LY = 4.8`, slot `2A–2H` dst.).
  Project baru langsung **dipin** ke slotnya.
- **Layout persisten**: disimpan di settings workspace Multica, kunci `noami_layout`
  `{ offsets, rooms, reserved }`. Anggota yang bukan owner/admin jatuh ke `localStorage` (`noami-layout:<ws>`).
- **Mode Edit**: meja, sofa, meja kopi, bar, dan tanaman bisa digeser (drag lewat listener window + raycast ke plane).
  Meja rapat dan rak runtime sengaja tetap.
- **Label**: tag nama dan ghost button adalah DOM biasa (`.labels3d`) yang diposisikan tiap frame oleh `LabelProjector`.
- **Panel**: modal di-portal ke `.glassui`, karena `backdrop-filter`/`position:fixed` membuat stacking context yang memotong modal.
- **Performa**: geometri di-cache, bagian meja/tanaman digabung, LED/rak memakai instancing, bayangan ~15/detik,
  DPR maks 1.5, bloom setengah resolusi.
- **Fitur**: roster + follow, HQ (Attention/Inbox/Playbooks), drawer agent/ruang/runtime, chat Mika (office manager),
  standup, musik, Walk (WASD), Edit, buka/tutup kantor, paket handover, layar dinding.
- **Kontrol**: drag = putar · klik kanan + drag = geser · scroll = zoom · Q/E putar 90° · R reset · L name tag ·
  WASD jalan · Esc tutup/berhenti follow.

## Aturan kerja

- Jangan commit/push tanpa perintah eksplisit. Push lewat HTTPS dengan kredensial `gh`.
- Jangan `next build` / typegen saat dev server di folder yang sama sedang jalan (merusak `.next`).
  Untuk build atau capture, salin repo ke folder lain (`git archive HEAD | tar -x`) dan symlink `node_modules`.
- Token tidak pernah masuk git atau chat.
- Workflow GitHub "Penjaga kantor" hanya manual (`workflow_dispatch`) karena repo belum punya secret `MULTICA_TOKEN`.

## Deploy

Belum di-deploy. Rencana: Vercel, import repo, env `MULTICA_DEMO=1`, deploy (penjaga otomatis mati di Vercel).
Data demo hidup di memori tiap function, jadi bisa ter-reset antar-request.

## Berbagi dengan rekan

App tidak punya login sendiri; semua request memakai token pemilik server. Membuka ke Wi-Fi (`-H 0.0.0.0`) berarti
siapa pun yang membuka bertindak sebagai pemilik token. Cara yang disarankan: tiap rekan menjalankan app sendiri
dengan token Multica masing-masing di workspace yang sama.

## Belum dikerjakan

- Playbooks masih task sekali jalan untuk Mika, belum autopilot terjadwal.
- Komponen lama (task pop-up, chat) masih memakai ikon pixel.
- Uji menyeluruh fitur 3D dengan akun Multica sungguhan (playdev dan multica.ai sudah bisa memuat data).
- `[penjaga] gagal: TypeError: fetch failed` pernah muncul dengan server playdev; penyebab belum diketahui
  (langkah berikut: log `e.cause` di `instrumentation-node.ts`).
- Deploy Vercel.
