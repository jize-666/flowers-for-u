# Blender: source yang dapat diedit

## Status file

Paket ini menyertakan GLB asli yang dihasilkan oleh `tools/build_assets.py`.
Model tidak diambil dari marketplace. Generator memakai geometri prosedural,
vertex colors, node per bagian, dan morph target kelopak.

Blender tidak tersedia pada lingkungan pembuatan paket. Karena itu tidak ada
klaim bahwa script Blender sudah dijalankan atau file `.blend` sudah ada.
`create_scene.py` dan `export_flower.py` disediakan untuk workflow lokal.

## Membuat tiga file native Blender

Dari folder utama project, dengan Blender 4.5 atau lebih baru:

```bash
blender --background --python blender/create_scene.py
```

Atau gunakan path lengkap Blender. Script mengimpor masing-masing GLB, menambah
kamera dan lighting untuk preview, lalu menyimpan:

```text
blender/generated/hero-flower.blend
blender/generated/flower.blend
blender/generated/tulip.blend
```

Script tidak merender PNG secara otomatis. Untuk render dari Blender, buka
file hasilnya dan gunakan Render Image. Preview camera/lights bukan aset web.

## Struktur yang harus dipertahankan

Root node bernama `Flower` memiliki custom properties:

| Properti | Arti |
| --- | --- |
| `height` | Tinggi ke pusat kepala dalam ruang aset Y-up glTF |
| `assetVersion` | Versi kontrak; saat ini 1 |

Setiap mesh mempunyai custom properties:

| Properti | Arti |
| --- | --- |
| `part` | 0 batang, 1 daun, 2 kelopak, 3 pusat bunga / pollen |
| `pivot` | Array tiga angka, pivot pertumbuhan dalam ruang lokal mesh GLB |
| `emission` | Intensitas glow bagian tersebut |

Kelopak memiliki basis terbuka dan shape key/morph target pertama bernama
`Closed`. Runtime menginterpolasi dari Closed ke basis, bukan memutar seluruh
bunga sebagai objek kaku. Batang dan daun mempunyai fase pertumbuhan berbeda.

Model Y-up glTF dikonversi oleh importer Blender ke koordinat Blender. Jangan
menukar angka custom property pivot secara manual hanya karena orientasi
viewport Blender Z-up. Ikuti round-trip import/export bawaan dan pertahankan
origin/transforms ketika melakukan revisi ringan.

## Revisi aman untuk dimulai

Buka salah satu file `.blend`. Ubah siluet mesh, bentuk kelopak pada Basis dan
Closed, atau warna vertex. Pertahankan jumlah/urutan vertex yang sesuai antara
basis dan shape keys. Simpan .blend, lalu jalankan:

```bash
blender blender/generated/hero-flower.blend --background --python blender/export_flower.py
```

Script menyeleksi root Flower dan keturunannya, menonaktifkan bobot shape keys
saat ekspor basis terbuka, mengaktifkan extras/morph/normals, dan menulis GLB
ke `static/models/`. Kamera dan lampu preview tidak diekspor.

Untuk filename `flower.blend` dan `tulip.blend`, gunakan perintah serupa dengan
nama file tersebut. Buat backup GLB sebelum menimpa.

## Batas material

Web renderer membuat material MeshStandardMaterial sendiri supaya dapat
memasukkan growth, bending, hover, dan glow dalam satu shader. Material node
Blender atau texture baru tidak otomatis diterapkan pada web.

Warna berasal dari atribut warna vertex (`COLOR_0` setelah export), dikalikan
tint setiap bunga di `config.js`. Untuk membuat perubahan warna terlihat,
pertahankan/ekspor active vertex-color attribute. Atur roughness dan metalness
web di `flowers.js`.

Jangan menggunakan Draco, Meshopt, KTX2, armature/skin, atau extension baru tanpa
menambahkan dukungan loader dan runtime. Paket ini menggunakan GLB tak
terkompresi, triangle meshes dengan satu material/primitive per node bagian, vertex colors,
dan satu morph target per kelopak. Memecah satu bagian menjadi beberapa material
dapat mengubah penempatan extras pada GLTFLoader dan membutuhkan adaptasi runtime.

Jika mengganti topology/hierarki secara besar, kontrak metadata harus dihitung
ulang. Menambahkan GLB sembarang tanpa metadata tidak akan memberikan growth
bertahap yang benar dan sengaja ditolak oleh validator runtime.

## Regenerasi dari source prosedural

```bash
python tools/build_assets.py
```

Ini tidak memerlukan Blender atau library Python tambahan. Fungsi `flower()`,
`petal()`, `leaf()`, dan `stem()` adalah tempat mengubah jumlah kelopak, proporsi,
warna dasar, dan kerapatan mesh. Perintah ini MENIMPA tiga GLB dengan hasil
prosedural; simpan revisi Blender terpisah sebelum menjalankannya.

Untuk memperbarui artwork mode ringan dan hotspot setelah revisi posisi/model:

```bash
python -m pip install numpy Pillow vtk
python tools/render_previews.py
```

Node.js juga dibutuhkan tool preview untuk membaca `config.js`. Tool ini
mendukung buffer GLB biasa, transform node, dan index integer umum, tetapi bukan
validator glTF lengkap; hindari sparse accessors/kompresi. Render fallback tidak
memakai Three.js, sehingga pencahayaan tidak identik dengan web.

## Verifikasi setelah ekspor

Buka website dengan `?debug=1`; pastikan tidak ada label Lightweight dan console
tidak melaporkan metadata hilang. Cek semua kualitas dan ketiga bunga trigger,
terutama saat angin bergerak. Uji kembali growth, bloom, picking, dan zoom.

Pemeriksaan `tests/test_assets.py` ditujukan untuk format pasti aset generator
bawaan. Beberapa ekspor Blender yang sah memakai accessor berbeda dan perlu
penyesuaian tes. Browser GLTFLoader mendukung format lebih luas; tes browser
3D aktual tetap diperlukan setelah melakukan round-trip.
