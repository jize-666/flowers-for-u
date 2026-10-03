# QA - Flowers For You v1.1

Tanggal pemeriksaan: 3 Oktober 2026.

## Hasil aktual

| Pemeriksaan | Hasil |
| --- | --- |
| Sintaks 13 modul JavaScript | Lulus |
| Unit test JavaScript | 19 lulus, 0 gagal |
| Python unit test | 6 lulus, 2 dilewati karena Flask belum tersedia |
| Kompilasi sintaks Python (app/tools/Blender) | Lulus; bukan eksekusi Blender |
| UI mode ringan dalam Chromium, tanpa GSAP/WebGL | 9 skenario lulus, 0 page error |
| HTTP Python standard-library preview server | Root, MIME JS dan MIME GLB lulus |
| Browser ke localhost | Diblokir lingkungan: ERR_BLOCKED_BY_ADMINISTRATOR |
| Three.js + GSAP penuh | Belum diuji langsung |
| Blender import/edit/export | Belum diuji langsung; Blender tidak tersedia |
| Laptop GPU nyata, Safari, HP fisik | Belum diuji |

Tes UI menjalankan source fallback/letter yang sebenarnya melalui modul data
in-memory karena navigasi localhost browser dibatasi. Ia menguji animasi native,
bukan mengganti GSAP dengan stub dan mengklaim GSAP telah berjalan. Download
library npm dan instalasi Flask juga tidak berhasil di lingkungan ini.

## Perilaku yang diperiksa di UI ringan

Surat tertutup saat awal dan audio tidak autoplay; klik latar tidak membuka
surat; tiga hotspot bunga membuka surat; teks mulai setelah kertas masuk;
Read at once; Escape dan pemulihan fokus; close saat entrance; keyboard Enter;
viewport touch 390 x 844 tanpa overflow horizontal; reduced motion menampilkan
pesan penuh. Lihat `ui-test-results.json` untuk sembilan hasil yang digabungkan.

Unit test meliputi teks pilihan, grapheme typing, jeda tanda baca, easing/damping,
rumus angin, random deterministik, klik vs drag/long press, drag kembali ke asal,
trigger yang tetap terlihat setelah perubahan urutan, byte fetch/error/timeout.
Validator aset memeriksa header/buffer GLB, indeks, metadata bagian dan morph.
Ini bukan sertifikasi validator glTF menyeluruh atau benchmark GPU.

## Bukti dalam paket

`js-syntax-results.txt`, `js-unit-results.txt`, `python-test-results.txt`,
`browser-lightweight-log.txt`, `ui-test-results.json`, `http-test-results.json`,
`http-server-test.log`, dan `asset-manifest.json`.

Screenshot `previews/desktop-lightweight.png`, `letter-desktop.png`,
`mobile-lightweight.png`, dan `letter-mobile.png` berasal dari mode ringan.
Artwork tamannya dirender dari GLB dengan VTK, bukan screenshot Three.js.
Karena itu lighting/bloom/growth dari renderer 3D tidak terbukti oleh screenshot.

## Jalankan tes penuh di PC

Pasang library lokal dan Flask, jalankan `app.py`, lalu pada terminal kedua:

```bash
python -m pip install playwright
python -m playwright install chromium
python tests/browser_full.py --url http://127.0.0.1:5000
```

Tes penuh menolak fallback. Ia memeriksa intro GSAP selesai, renderer Three.js
aktif, surat/audio tidak otomatis terbuka, raycast tiga bunga, typing, skip dan
close. Hasil sukses ditulis ke `docs/full-test-results.json`; file sukses itu
belum ada dalam ZIP ini. Gunakan `--headed` untuk melihat browser tes.

Untuk tes tanpa renderer: `python tests/browser_lightweight.py`.
Untuk menguji bootstrap/HTTP/fallback: `python tests/browser_http.py`.
Dua yang terakhir bukan pengganti tes renderer penuh.

## Checklist manual sebelum dibagikan

Periksa growth/morph dan angin pada layar PC, hover/klik setiap bunga rahasia,
drag/zoom/pinch tidak membuka surat, close cepat tidak menyisakan timeline,
replay, perubahan kualitas, sound on/off cepat, tab background/foreground,
orientasi HP, reduced motion, dan reload sesudah ekspor Blender.

Surat bukan data terenkripsi; pesan tetap terlihat melalui source. Belum ada
deployment publik. Development server hanya untuk lokal/jaringan tepercaya.

## Troubleshooting

**Lightweight view:** jalankan `python tools/vendor_dependencies.py`, periksa
`python tools/check_project.py`, lalu reload. Periksa console browser bila tetap
ringan. Pastikan WebGL2/hardware acceleration tersedia pada browser tujuan.

**Loading tertahan:** cek file/path GLB dan Network. Model fetch dibatasi 30
detik; error akan ditampilkan sebagai alasan fallback di tooltip notice.

**Revisi GLB tidak tampil:** pertahankan Flower.height, part, pivot, normals,
vertex colors, dan morph Closed. Shader tidak mendukung GLB sembarang.

**Posisi fallback tidak ikut revisi:** jalankan `tools/render_previews.py` untuk
memperbarui artwork dan fallback-positions.json.

**HP tidak terhubung:** gunakan IP LAN PC, host binding 0.0.0.0 dan Wi-Fi yang
sama. Jangan gunakan localhost HP. Tes pada perangkat fisik tetap dibutuhkan.
