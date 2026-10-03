# Flowers For You - v1.1

Taman bunga web cinematic, dark elegant, dan desktop-first. Backend Flask,
scene Three.js, timeline GSAP, dan aset GLB yang dapat diedit di Blender.
Mobile tetap memiliki touch interaction dan profil kualitas lebih ringan.

## Mulai cepat

Ekstrak seluruh ZIP, buka folder `FlowersForYou`, kemudian:

**Windows:** jalankan `start-windows.bat`.

**macOS / Linux:** jalankan `sh start-macos-linux.sh` dari terminal.

Buka `http://127.0.0.1:5000`. Jangan membuka template HTML dengan double-click.
Python 3.10+ dibutuhkan. Setup pertama memerlukan internet untuk Flask dan
library browser. Tidak perlu Node.js atau Blender untuk menjalankan aset jadi.

### Windows manual

```powershell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe tools\vendor_dependencies.py
.venv\Scripts\python.exe app.py
```

### macOS / Linux manual

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python tools/vendor_dependencies.py
.venv/bin/python app.py
```

Gunakan `python tools/check_project.py` untuk memeriksa aset dan vendor lokal.

## Status paket dan pengujian

Source aplikasi, tiga GLB, tekstur, audio, alat generator dan skrip Blender
sudah disertakan. Three.js **0.180.0** dan GSAP **3.13.0** adalah versi terkunci,
bukan klaim versi terbaru. Library tersebut disiapkan oleh installer lokal;
bila belum tersedia, bootstrap mencoba CDN. ZIP awal bukan paket sepenuhnya
offline. Tidak ada file font yang dibundel; UI menggunakan font sistem.

**19 unit test JavaScript, 6 pemeriksaan Python dan 9 skenario UI surat mode
ringan lulus.** Dua tes Flask dilewati karena Flask tidak dapat dipasang di
lingkungan ini. Browser menolak akses localhost di lingkungan pembuatan;
renderer Three.js/GSAP penuh belum diuji langsung. Blender juga tidak tersedia,
jadi file native `.blend` belum dihasilkan. Rincian jujur ada di `docs/QA.md`.

Preview di `docs/previews/` adalah screenshot browser mode ringan, bukan hasil
render Three.js. Artwork tamannya berasal dari GLB yang sama, dirender dengan
VTK. Jangan menjadikan preview ini bukti bahwa efek WebGL sudah diuji.

## Pengalaman yang diimplementasikan

Growth batang, daun, kepala dan kelopak secara bertahap; morph Closed menjadi
mekar; sway shader dengan fase individual; scene berlapis dengan lighting,
bloom, fog, pollen, rumput instanced, parallax dan OrbitControls terbatas.

Surat hanya dibuka melalui klik/tap bunga ber-flag `trigger: true` atau kontrol
keyboard yang mewakili bunga itu. Tidak ada pemanggilan otomatis dari intro,
timer atau loading. Klik latar/bunga dekoratif, drag kamera dan pinch bukan
trigger surat. Tiga trigger bawaan: moonflower, ivory, blush.

Kertas ivory masuk dengan fade, translation/depth dan tilt yang halus. Setelah
jeda singkat, pesan Inggris yang disepakati diketik. Tersedia Read at once,
Escape/close, pembatalan timeline yang bertumpuk dan pengembalian fokus.

Audio opsional hanya dimulai dari tombol sound. Replay, pause motion, kontrol
kualitas dan reduced motion disediakan. Pesan tetap utuh di setiap kualitas.
Tidak disertakan DOF optik penuh, shadow map dinamis atau simulasi fisika kelopak.

### Profil awal

| Profil | Bunga | Partikel | Rumput | Maks. DPR | Bloom |
| --- | ---: | ---: | ---: | ---: | --- |
| High | 19 | 160 | 100 | 1.75 | Ya |
| Medium | 16 | 95 | 70 | 1.35 | Ya |
| Gentle | 12 | 45 | 40 | 1.0 | Tidak |

Auto dapat menurunkan profil berdasarkan sampel waktu frame. Nilai tersebut
adalah budget desain, bukan hasil benchmark atau jaminan FPS. Bunga trigger
tetap dipertahankan walaupun kamu mengubah urutan array FLOWERS.

## Bagian yang bisa direvisi

| Keperluan | File |
| --- | --- |
| Pesan, signature, judul, subtitle, hint | `static/js/config.js` -> CONTENT |
| Posisi, warna, ukuran, trigger bunga | `static/js/config.js` -> FLOWERS |
| Angin, durasi, kamera, kualitas | `static/js/config.js` -> CONFIG / QUALITY |
| Layout, warna UI, ukuran kertas | `static/css/style.css` |
| Struktur HTML | `templates/index.html` |
| Reveal kertas, typing, close | `static/js/letter.js` |
| Growth, material dan shader bunga | `static/js/flowers.js` |
| Lighting, kamera, post-processing | `static/js/scene.js` |
| Klik, hover, drag dan keyboard | `static/js/interaction.js` |
| Edit GLB / buat sumber native | `blender/` dan `docs/BLENDER_GUIDE.md` |

Panduan contoh perubahan ada di `docs/REVISION_GUIDE.md`. Pertahankan pesan
pilihanmu di CONTENT.message; tidak perlu mengubah logic efek ketikan.

## Blender dan aset

`static/models/hero-flower.glb`, `flower.glb`, dan `tulip.glb` merupakan model
nyata, total sekitar 1.4 MiB. Kamu dapat mengimpornya langsung ke Blender.

Untuk membuat tiga file native `.blend` dengan kamera/lampu preview:

```bash
blender --background --python blender/create_scene.py
```

Hasilnya ada di `blender/generated/`. Skrip ditulis untuk Blender 4.5+ tetapi
belum dijalankan di lingkungan ini. Setelah mengedit satu file:

```bash
blender blender/generated/hero-flower.blend --background --python blender/export_flower.py
```

Baca `docs/BLENDER_GUIDE.md` sebelum mengubah hierarchy, pivot, vertex colors
atau morph Closed. GLB sembarang tidak otomatis cocok dengan shader growth.
Material final web diatur di JavaScript, bukan hanya material Blender.
Generator `tools/build_assets.py` dapat membuat ulang GLB tanpa Blender, tetapi
akan menimpa file yang telah diedit; buat backup terlebih dahulu.

## Mode ringan dan preview lokal

Bila WebGL/library tidak tersedia, halaman berlabel **Lightweight view** memakai
artwork diam dengan hotspot surat. Tidak ada orbit, growth atau wind 3D pada
mode ini. Animasi surat memakai GSAP bila tersedia, atau animasi browser native.

Untuk memaksa mode ringan, buka `http://127.0.0.1:5000/?fallback=1`.
Untuk preview tanpa Flask: `python tools/preview_server.py --port 8000`, lalu
buka `http://127.0.0.1:8000`. Jalur 3D tetap membutuhkan library lokal atau CDN.
Preview server adalah alat lokal, bukan production server.

## Membuka dari HP pada Wi-Fi yang sama

Windows PowerShell:

```powershell
$env:HOST="0.0.0.0"
.venv\Scripts\python.exe app.py
```

macOS/Linux: `HOST=0.0.0.0 .venv/bin/python app.py`.
Buka `http://IP_LAN_PC:5000` pada HP, bukan localhost HP atau 0.0.0.0.
Gunakan jaringan pribadi yang sama; pengujian HP fisik belum dilakukan.

## Tes dan diagnosis

```bash
node tools/check_js.js
node --test tests/*.test.js
python -m unittest discover -s tests -p "test_*.py" -v
```

Tes browser opsional membutuhkan Playwright dan Chromium:

```bash
python -m pip install playwright
python -m playwright install chromium
python tests/browser_lightweight.py
python tests/browser_http.py
python tests/browser_full.py --url http://127.0.0.1:5000
```

Jalankan Flask terlebih dahulu untuk browser_full.py. Tes penuh menolak mode
ringan; hasil sukses ditulis ke `docs/full-test-results.json`. File hasil penuh
belum ada dalam paket ini. `?debug=1` menyediakan helper baca state/posisi di
`window.__FLOWERS_DEBUG__`, tanpa fungsi membuka surat otomatis.

## Privasi dan deployment

Surat tersembunyi secara visual, bukan dienkripsi. Isi pesan dapat dibaca melalui
source; jangan simpan rahasia sensitif di sana. Audio/gambar/model berasal dari
aset proyek, bukan salinan video referensi. Detail ada di
`docs/ASSETS_AND_DEPENDENCIES.md`.

Project ini belum dideploy ke URL publik. Flask development server dan preview
server ditujukan untuk penggunaan lokal; deployment publik memerlukan HTTPS
dan konfigurasi server produksi tersendiri.
