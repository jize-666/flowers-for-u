# Mulai di sini - Flowers For You v1.1

Ekstrak seluruh ZIP. Buka folder `FlowersForYou`, bukan satu file HTML saja.

## Windows

Jalankan `start-windows.bat`, tunggu setup, lalu buka `http://127.0.0.1:5000`.
Python 3.10+ harus sudah terpasang. Instalasi pertama membutuhkan internet.
Script memasang Flask bila belum ada dan menyiapkan Three.js/GSAP lokal.
Jangan menutup terminal selama memakai website.

## macOS / Linux

Dari folder project: `sh start-macos-linux.sh`.

## Revisi

Pesan, judul, bunga rahasia, timing, angin: `static/js/config.js`.
Tampilan dan kertas: `static/css/style.css`.
Model: `static/models/*.glb`, bisa diimpor langsung ke Blender.
Generator file `.blend`: `blender/create_scene.py`.
Panduan lengkap: `README.md` dan `docs/REVISION_GUIDE.md`.

## Yang perlu diketahui

GLB, tekstur, audio dan source aplikasi sudah disertakan. Library runtime
Three.js/GSAP diunduh oleh setup atau dimuat dari CDN; ZIP awal belum sepenuhnya
offline. File `.blend` dihasilkan di PC memakai skrip Blender, bukan dibundel.

Saat library 3D/WebGL tidak tersedia, label **Lightweight view** berarti taman
memakai gambar diam. Surat masih bisa dibuka; ini bukan mode 3D.

Jalur Three.js/GSAP dan ekspor Blender belum teruji langsung di lingkungan
pembuatan. Tes kode, aset dan UI surat mode ringan sudah dijalankan. Lihat
`docs/QA.md` untuk hasil aktual, bukan klaim bahwa seluruh fitur telah diuji.
