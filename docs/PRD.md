# PRD — Noami · Virtual Office (3D Isometric)

> Status: **v0.2 · Fase 1 berjalan** (kode Next.js di `app/`, mode demo) · 15 Nov 2026
> Basis kode: [sarahshafiran/kantor-virtual](https://github.com/sarahshafiran/kantor-virtual) (Next.js 15 · React 19 · Multica API)

---

## 1. Ringkasan kemauan (ditulis ulang)

Kamu ingin membuat **antarmuka "agent worker" untuk workspace multica.ai** dengan mengambil repo `kantor-virtual` sebagai dasar, lalu **mengganti total visualnya**:

- Dari kantor **pixel-art 2D** → menjadi **kantor 3D isometric** yang bisa diputar, di-zoom, dan diklik (mengacu pada ilustrasi "Innovation Hub": lantai berlapis dengan pita kaca, meja-meja, robot, layar besar, tanaman).
- Tema warna **dark midnight steel**: biru-baja gelap, permukaan logam, kaca berpendar, aksen cahaya dingin.
- **Interaktif**, dibangun dengan library 3D (Three.js).
- Tahap pertama **hanya konsep mockup HTML** (satu file, data contoh/dummy) — belum menyentuh repo Next.js atau API Multica.
- Proyek ditaruh di folder **`Noami - Virtual Office`**.

## 2. Latar belakang

`kantor-virtual` adalah "jendela lain" ke Multica: tidak punya database sendiri; semua anggota, agent AI, proyek, issue, runtime dan notifikasi dibaca live dari Multica, dan semua aksi (buat task, approve, balas agent) ditulis balik ke Multica. Halaman yang ada: **Office**, **Task Board**, **Team Members**, **Messages**, **Notifications**, **Task pop-up**, dan chat mengambang **"Ask Mika"**.

Visual saat ini memakai meja pixel (`app/pixel-desk.tsx`, `app/pixel-icon.tsx`, `app/globals.css`). Logika data ada di `lib/` (`office.ts`, `multica.ts`, dst.) — inilah yang **dipertahankan**; yang diganti adalah lapisan tampilan halaman Office.

## 3. Tujuan & non-tujuan

**Tujuan**
1. Pengguna langsung "membaca" kondisi tim dari satu pandangan 3D: siapa bekerja, siapa menunggu review, siapa gagal, laptop/runtime mana yang mati.
2. Semua informasi penting dari halaman Office lama tetap ada (meja tim, ruang per proyek, lounge, *Needs attention*), hanya disajikan secara spasial.
3. Terasa hidup: animasi status, serah-terima (handover) antar agent, layar dinding dengan statistik live.
4. Tetap cepat dan mudah dipakai — 3D adalah peta navigasi, bukan penghalang. Setiap aksi tetap tersedia di panel 2D.

**Non-tujuan (fase mockup)**
- Integrasi API Multica, autentikasi, Telegram, watchdog.
- Halaman Task Board / Team / Messages versi 3D (cukup ditautkan dari navigasi).
- Editor tata letak kantor (drag meja) — dicatat sebagai ide fase lanjut.

## 4. Pengguna

| Persona | Kebutuhan utama |
|---|---|
| **Owner / lead** workspace | Melihat kesehatan tim sekilas, buka/tutup kantor (pause agent), approve hasil kerja. |
| **Anggota tim** | Tahu to-do miliknya, review hasil agent, chat dengan agent/rekan. |
| **AI agent** (subjek visual) | Direpresentasikan sebagai robot di meja; statusnya adalah sumber kebenaran visual. |

## 5. Pemetaan konsep: data Multica → dunia 3D

| Data (`lib/office.ts`) | Representasi 3D |
|---|---|
| `Office` (workspace) | Satu **platform lantai** berlapis (slab baja + pita kaca berpendar), bentuk tidak simetris seperti referensi. |
| `rooms[]` (proyek) | **Zona proyek** dengan lantai bertint, garis tepi bercahaya, nama proyek tercetak di lantai, progres. |
| `Desk` agent | **Meja + monitor + robot**. Monitor & visor robot berwarna sesuai status. |
| `people[]` / anggota | **Team desks**: meja manusia (avatar manusia), kertas di meja = jumlah review + to-do. |
| `idleDesks[]` | **Lounge**: sofa, kopi, tanaman; agent idle/istirahat duduk di sini. |
| `runtimes[]` | **Server room**: rak per runtime, LED hijau-toska = online, merah redup = offline/kuota habis. |
| `attention` | **Layar dinding** besar (statistik live) + panel 2D *Needs attention*. |
| `open` / `switchOpen` | Saklar **Office open/closed**: lampu meredup, robot "pulang", monitor mati. |
| Handover (`app/handover.tsx`) | **Paket cahaya** terbang melengkung dari meja satu ke meja lain + toast. |

### Status meja (`DeskState`)

| State | Warna | Perilaku visual |
|---|---|---|
| `working` | Teal `#3EE6C1` | Monitor menyala & berkedip, robot bergoyang mengetik, cincin lantai berdenyut. |
| `review` | Amber `#F5B84B` | Ikon dokumen mengambang di atas kepala. |
| `failed` | Merah `#FF5D6C` | Berkedip, monitor merah, beacon di atas kepala. |
| `ready` | Biru `#7AA2FF` | Duduk diam, ada antrian task. |
| `break` | Ungu-abu `#A08CFF` | Pindah ke lounge. |
| `off` / `home` / `closed` | Abu baja `#4B5A70` | Kursi kosong, monitor gelap. |

## 6. Kebutuhan fungsional (mockup)

**F1 · Scene 3D isometric**
- Kamera ortografis sudut isometrik; **drag = putar** (dibatasi agar tetap isometrik), **klik kanan/2 jari = geser**, **scroll = zoom**.
- Tombol putar 90° (Q / E), zoom +/−, reset (R), toggle label (L).

**F2 · Interaksi objek**
- Hover robot/manusia/rak/zona → highlight + label nama & status.
- Klik agent → kamera terbang mendekat + **drawer detail**: profil, runtime, task terbuka, run terakhir, tombol *New task* & *Chat*.
- Klik zona proyek → fokus ruang + daftar meja di dalamnya.
- Klik rak server → info runtime (pemilik, provider, online, reset kuota).

**F3 · Panel "Needs attention"** (2D, kanan): grup *Late*, *To-dos for people*, *To review*, *Failed* — klik item → kamera terbang ke agent terkait + buka **Task pop-up**.

**F4 · Task pop-up**: kiri output agent; kanan ringkasan, kartu pertanyaan agent (pilih jawaban), *Approve* / *Request changes*.

**F5 · Shell melayang**: dock navigasi (Office, Task Board, Team, Messages, Notifications + badge), island workspace (switcher + saklar Office open/closed), chip statistik & jam — semuanya panel kaca mengambang di atas scene (lihat §8a).

**F6 · Ask Mika**: tombol mengambang → panel chat dengan agent manajer.

**F7 · Hidup**: simulasi perubahan status tiap beberapa detik + animasi handover, untuk mendemokan nuansa real-time (di produk nyata: refresh 30 detik seperti sekarang).

### 6b. Fitur tambahan (dari referensi kedua, 15 Nov 2026)

Referensi: halaman produk "3D virtual office for AI agents" (kartu fitur + screenshot HQ). Yang diambil adalah **fiturnya**, bukan tampilannya — visual tetap Midnight Steel.

| # | Fitur | Di mockup | Catatan Multica |
|---|---|---|---|
| F8 | **Code Review & PRs** — agent yang sedang review terlihat menampilkan diff di monitornya; task pop-up punya tab *Diff* | ✅ | Diambil dari komentar/lampiran issue berstatus `in_review` |
| F9 | **Standup & Scrum** — tombol *Start standup*: semua agent aktif berjalan ke **meja rapat** dan berkumpul, ringkasan standup muncul di panel | ✅ | Fase 1: memicu Playbook "Daily briefing" ke agent manajer |
| F10 | **Task management** — roster agent di atas scene (chip nama + titik status), klik chip = fokus | ✅ | sudah ada datanya di `Desk` |
| F11 | **Walk around** — drag/scroll/pan + **mode jalan** (WASD menggerakkan kamera) | ✅ | — |
| F12 | **Follow agent** — kunci kamera ke satu agent dan ikuti saat dia berpindah (ke lounge, ke rapat) | ✅ | — |
| F13 | **Chat with agents** — dari drawer atau roster | ✅ | `api/chat` yang sudah ada |
| F14 | **Play music** — pemutar ambient (lo-fi generatif via WebAudio, tanpa file) | ✅ | murni klien |
| F15 | **Edit layout** — mode edit: drag meja/perabot di lantai (snap ke grid) | ✅ dasar | Fase 1: simpan posisi di settings workspace Multica |
| F16 | **Panel HQ** — tab *Attention · Inbox · Playbooks* (template jadwal: Morning briefing, Nightly review digest, Hourly health check, Weekly report) | ✅ | Playbooks = issue terjadwal untuk agent manajer |

### 6c. Penempatan project baru & workspace baru (keputusan 15 Nov 2026)

**New project → ruang di slot lantai**
- Lantai dibagi menjadi **zona tetap** (Team desks, Lounge, Meeting room, Runtimes) dan **slot ruang proyek**. Zona tetap tidak pernah pindah supaya orientasi pengguna terjaga.
- Slot kosong tampil sebagai **garis putus-putus** di lantai. Hanya slot berikutnya yang memunculkan tombol melayang **"＋ New project room"** (kapasitas + level) agar lantai tidak ramai. Slot lain tetap bisa diklik.
- Form *New project*: nama, warna ruang, peran agent (tiap peran = 1 agent baru), runtime, dan **pratinjau penempatan** berupa mini-map lantai yang menyorot slot tujuan.
- **Aturan penempatan**: slot yang diklik pengguna (kalau muat), atau **slot kosong pertama yang muat**. Kapasitas slot = kolom meja × 2 baris (meja 1.75 unit).
- **Lantai penuh → lantai baru ditumpuk ke atas.** Gedung mendapat Level 2 (pita kaca + slab + pagar) yang turun dengan animasi. Elevator kaca memanjang menembus lantai, dan form memberi peringatan *"Level 1 is full → Level 2 will be built"*.
- Animasi pembuatan: lantai ruang mengembang → meja & agent muncul satu per satu → kamera fokus → drawer ruang terbuka.
- **Pemilih lantai** (kiri atas, L1/L2 + jumlah ruang); elevator juga bisa diklik untuk pindah lantai. Saat melihat L1, lantai di atasnya disembunyikan. Saat melihat L2, label orang di L1 disembunyikan.
- Batasan mockup: standup, istirahat ke lounge, dan jalan kaki hanya untuk agent di L1 (lounge & ruang rapat ada di L1). Di produk nyata tiap lantai bisa punya pantry kecil sendiri.
- Fase 1 (Multica): tata letak slot → proyek disimpan di settings workspace (`officeLayout: { projectId: slotId }`), sama seperti posisi hasil *Edit layout*.

**New workspace → gedung baru**
- Satu workspace = satu gedung (data Multica terpisah: anggota, agent, runtime). Switcher di island kiri atas mengganti seluruh scene dengan transisi kamera.
- Fase 2: **campus view**, yaitu zoom out yang menampilkan semua gedung workspace berdampingan dengan indikator working/review/failed.

## 7. Kebutuhan non-fungsional

- **Performa**: ≥ 50 fps di laptop M1 untuk ±30 meja; geometri low-poly, bayangan 1 lampu, bloom ringan.
- **Aksesibilitas**: semua aksi juga bisa lewat panel 2D (bukan hanya klik 3D); kontras teks ≥ 4.5:1; `prefers-reduced-motion` mematikan animasi idle.
- **Responsif**: < 900 px panel attention menjadi laci yang bisa dibuka; scene tetap jalan.
- **Privasi**: tetap seperti repo asal — token Multica hanya di server.

## 8. Arah visual — "Midnight Steel Glass"

### 8a. Prinsip layout (keputusan 15 Nov 2026)

- **Scene 3D = latar utama, full-bleed** (100% layar, di belakang segalanya). Tidak ada sidebar/topbar yang memotong area 3D.
- **Semua UI melayang** di atas scene sebagai panel kaca: tidak menempel ke tepi, ada jarak 16 px, sudut membulat besar, bisa diciutkan.
- Susunan panel melayang:
  | Posisi | Panel |
  |---|---|
  | Kiri-atas | **Island workspace**: logo, switcher workspace, saklar Office open/closed |
  | Atas-tengah | **Roster agent** (chip nama + titik status), klik = fokus, ikon mata = follow |
  | Kanan-atas | **Chip statistik** + jam |
  | Kiri (vertikal, tengah) | **Dock navigasi** ala macOS: Office, Task Board, Team, Messages, Inbox (badge) |
  | Kanan | **Panel HQ** (Attention · Inbox · Playbooks) — bisa diciutkan ke tombol |
  | Bawah-tengah | **Toolbar kamera**: putar, zoom, reset, label, walk, standup, music, edit layout |
  | Kiri-bawah | Legenda status (ringkas) |
  | Kanan-bawah | Tombol **Ask Mika** → popover chat |
  | Popup | Drawer detail agent, Task pop-up (modal), Standup, pemutar musik, toast |
- Saat panel diciutkan, kamera menggeser pusat pandangnya (`setViewOffset`) agar kantor tetap di tengah area yang terlihat.

### 8b. Glassmorphism gaya Apple di atas Midnight Steel

| Properti | Nilai |
|---|---|
| Material panel | `rgba(18, 26, 38, 0.55)` + `backdrop-filter: blur(28px) saturate(180%)` |
| Garis tepi | 1 px `rgba(255,255,255,0.10)` + highlight dalam atas `inset 0 1px 0 rgba(255,255,255,0.08)` |
| Bayangan | `0 20px 60px rgba(0,0,0,0.45)` — panel benar-benar "mengambang" |
| Radius | 22 px panel besar · 14 px kartu · 999 px chip/pil |
| Vibrancy | teks sekunder semi-transparan (`rgba(235,242,250,0.6)`), bukan abu solid |
| Kontrol | segmented control & toggle bergaya iOS; tombol primer bermaterial kaca dengan tint aksen |
| Gerak | spring halus (`cubic-bezier(.2,.8,.2,1)`), panel muncul dengan scale 0.96→1 + fade |
| Fallback | tanpa dukungan `backdrop-filter` → `rgba(14,20,30,0.92)` |

### 8c. Token warna

| Token | Nilai | Pakai |
|---|---|---|
| `--bg` | `#070B12` | latar / langit |
| `--steel-1..4` | `#0F1621` `#182231` `#253246` `#3A4A61` | slab, meja, perabot |
| `--glass` | `#3EE6C1` @ 14–35% | pita kaca bangunan, pagar |
| `--accent` | `#3EE6C1` | garis tepi, fokus, CTA |
| `--text` / `--muted` | `#EEF3F9` / `rgba(235,242,250,.6)` | teks |
| Font | Inter (UI, mendekati SF Pro), JetBrains Mono (angka/label) | |

Karakter: agent = **robot** (kepala kotak membulat + visor berpendar), manusia = figur sederhana berbaju — mudah dibedakan sekilas.

## 9. Rencana teknis

**Fase 0 — Mockup (dokumen ini)**
- `mockup/index.html` tunggal: Three.js r160 (ES module via CDN), `OrbitControls`, `CSS2DRenderer` (label), `EffectComposer + UnrealBloomPass` (pendar), data dummy di dalam file.

**Fase 1 — Integrasi ke repo**
- Tambah dependensi `three` + `@react-three/fiber` + `@react-three/drei` (atau Three murni dalam komponen client).
- Komponen baru `app/office-3d/` (`Scene.tsx`, `Desk3D.tsx`, `Agent3D.tsx`, `Room3D.tsx`, `ServerRack.tsx`) yang menerima prop `Office` dari `lib/office.ts` **tanpa mengubah `lib/`**.
- `office-view.tsx`: ganti grid `.rooms` dengan `<Office3D>`; panel attention, drawer, `TaskPanel`, `ChatPanel` dipakai ulang dan di-restyle ke Midnight Steel di `globals.css`.
- Generator tata letak otomatis: ruang proyek disusun dari jumlah meja (`width(n)` sekarang → grid 3D).
- Toggle "Classic 2D view" sebagai fallback (perangkat lemah / reduced motion).

**Fase 2 — Polishing**
- Karakter pribadi (`public/me/`) → model GLB opsional.
- Editor tata letak, tema terang "Daylight Steel", minimap.

## 9b. Status Fase 1 (15 Nov 2026)

Sudah di `app/` (clone kantor-virtual, branch lokal `feat/office-3d`, belum di-commit):
- Scene 3D React Three Fiber membaca `Office` asli dari `lib/office.ts` (tanpa mengubah logika `lib/office.ts`).
- Mode demo `MULTICA_DEMO=1`: API Multica palsu di memori (`lib/demo-api.ts`); semua route & aksi lama jalan (approve, task baru, chat, buka/tutup kantor, project baru).
- Shell melayang (island + dock) untuk semua halaman; tema Midnight Steel Glass (`app/steel.css`) juga menata ulang Task Board, Team, task pop-up, chat.
- Fitur: roster + follow, HQ (Attention/Inbox/Playbooks → task untuk Mika), drawer agent/ruang/runtime, standup, musik lo-fi, edit layout (meja), slot + lantai bertumpuk + elevator, paket handover, layar dinding & monitor sesuai status.

Ditambahkan 15 Nov 2026 (lanjutan, mode demo):
- Layout disimpan di settings workspace Multica (`settings.noami_layout`: offsets meja/perabot, slot per project, ruang project baru). Anggota tanpa hak owner/admin otomatis jatuh ke penyimpanan browser.
- Project baru langsung dapat ruang dan slotnya **dipin** (tetap di slot itu setelah reload, juga saat task masuk).
- Sofa, meja kopi, bar, dan tanaman bisa digeser di mode Edit; titik duduk sofa ikut pindah.
- `next build` produksi lolos (lint + types); scene siap ±5 detik di build produksi.

Belum:
- Playbooks = task sekali jalan untuk Mika, belum autopilot terjadwal.
- Belum dites dengan akun Multica sungguhan.
- Komponen lama (task pop-up, chat) masih memakai ikon pixel (warnanya sudah ikut tema).
- Meja rapat & rak runtime sengaja tidak bisa digeser (dipakai standup / mewakili runtime).

## 10. Kriteria sukses mockup

- [ ] Scene isometric dark midnight steel tampil, bisa diputar/zoom/geser.
- [ ] Minimal 3 ruang proyek, team desks, lounge, server room, layar dinding.
- [ ] Status agent terbaca dari warna + animasi tanpa membuka panel.
- [ ] Klik agent / item attention → kamera fokus + drawer / task pop-up.
- [ ] Saklar Office open/closed mengubah suasana scene.

## 11. Pertanyaan terbuka

1. Bahasa UI: tetap **Inggris** seperti repo asal, atau **Bahasa Indonesia**? (mockup memakai Inggris)
2. Nama brand di UI: "Noami" saja, atau "Noami · Virtual Office"?
3. Fase 1: pakai **React Three Fiber** (lebih rapi di Next.js) atau Three murni?
4. Apakah ini akan di-fork dari repo Sarah, atau repo baru milikmu?
