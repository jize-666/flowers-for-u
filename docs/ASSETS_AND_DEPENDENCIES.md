# Asal aset dan dependensi

## Aset kreatif yang disertakan

Semua model bunga, tekstur kertas, grain, ikon SVG, serta ambience sintetis
32 detik dibuat khusus untuk paket ini. Tidak ada model marketplace, cuplikan
musik pihak ketiga, atau rekaman suara yang digunakan. Video referensi pengguna
tidak dimasukkan ke dalam ZIP.

- `hero-flower.glb`: cosmos stylized, 16 kelopak, morph Closed.
- `flower.glb`: daisy stylized, 11 kelopak, morph Closed.
- `tulip.glb`: tulip stylized, 6 kelopak, morph Closed.
- `paper.webp`, `grain.png`: tekstur prosedural.
- `garden-desktop.webp`, `garden-mobile.webp`: render VTK dari model di atas;
  hanya dipakai sebagai fallback, bukan pengganti model pada mode utama.
- `night-garden.mp3`, `night-garden.ogg`: dua encoding ambience yang sama.
- `sprite.svg`, `favicon.svg`: ikon geometris original.

Tidak ada file font yang dibundel. CSS menggunakan Georgia/Times dan system
sans-serif yang tersedia pada perangkat pengguna. Hasil tipografi dapat sedikit
berbeda antar sistem operasi.

`asset-manifest.json` mencatat ukuran dan SHA-256 aset. Checksum membuktikan
konsistensi paket, bukan audit keamanan atau jaminan eksklusivitas hak cipta.

## Runtime pihak ketiga

| Dependensi | Versi yang dikunci | Penyediaan |
| --- | --- | --- |
| Flask | 3.1.3 | `requirements.txt`; dipasang menggunakan pip |
| Three.js | 0.180.0 | CDN atau installer vendor lokal |
| GSAP | 3.13.0 | CDN atau installer vendor lokal |

File library Three.js/GSAP tidak tersedia di ZIP awal karena jaringan lingkungan
build dibatasi. `tools/vendor_dependencies.py` mengambil distribusi resmi npm
dan mempertahankan license files yang ada di paket.

Lisensi source project ini tidak menggantikan lisensi dependensi. Periksa file
lisensi paket dan ketentuan resmi sebelum redistribusi library. Installer tidak
mengunduh font, menjalankan lifecycle script npm, atau memodifikasi library.

## Alat pengembangan opsional

Blender untuk native editing, Node.js untuk tes JS dan tool preview, Playwright
untuk tes browser, numpy/Pillow/VTK untuk regenerasi fallback, dan ffmpeg untuk
regenerasi audio. Semua itu tidak perlu dipasang untuk hanya memakai aset jadi
pada aplikasi Flask. Blender adalah aplikasi editor, bukan library browser.

## Rujukan teknis resmi

- Flask installation: https://flask.palletsprojects.com/en/stable/installation/
- Flask development server: https://flask.palletsprojects.com/en/stable/server/
- Flask release/package: https://pypi.org/project/Flask/
- Three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
- Three.js WebGLRenderer: https://threejs.org/docs/pages/WebGLRenderer.html
- Three.js post-processing: https://threejs.org/manual/en/post-processing.html
- GSAP timeline: https://gsap.com/docs/v3/GSAP/Timeline/
- Blender glTF: https://docs.blender.org/manual/en/4.5/addons/import_export/scene_gltf2.html

URL di atas adalah referensi API/workflow. Sebagian dokumentasi mengikuti versi
terkini; jangan mengganti versi dependency tanpa pengujian ulang.
