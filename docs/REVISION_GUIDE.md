# Panduan revisi

Mulai dari `static/js/config.js`. Ubah satu kelompok pengaturan setiap kali,
refresh browser, lalu cek console sebelum melanjutkan. Gunakan hard refresh
setelah mengganti GLB. Simpan salinan project sebelum menjalankan generator aset.

## Judul halaman

Ubah `CONTENT.heading`, `headingAccent`, `eyebrow`, `subtitle`, dan `hint`.
Semua teks itu dipasang oleh `content.js` pada mode 3D maupun mode ringan.

## Pesan dan tampilan surat

Ubah `CONTENT.message`, `letterTitle`, dan `signature`. Nilai ditampilkan melalui
`textContent`, bukan `innerHTML`, sehingga tag HTML akan tampil sebagai teks,
bukan dijalankan. Gunakan backticks dan `\n\n` untuk membuat beberapa paragraf.

Contoh:

```js
message: `I made a little place for you.\n\nYou can always come back here.`,
signature: "With love, your name.",
```

Ukuran kertas dan typeface ada di `.letter-paper`, `.letter-copy`, dan
`.letter-heading h2` di CSS. Layout mempunyai salinan teks tak terlihat agar
ukuran kertas tidak meloncat selama typing. Salinan ini bukan duplikasi untuk
screen reader; pesan lengkap aksesibel disediakan terpisah.

Jangan memanggil `letter.open()` dari intro, timer, atau event loading. Satu-satunya
jalur pembuka normal adalah interaksi bunga terpilih di `interaction.js`.

## Reveal dan kecepatan mengetik

```js
letter: {
  openDuration: 1.15,
  closeDuration: 0.72,
  typingDelay: 0.28,
  characterSeconds: 0.029,
},
```

Nilai durasi memakai detik. `characterSeconds` yang lebih besar membuat typing
lebih pelan. Ada jeda kecil sesudah tanda baca. `Read at once` langsung
menampilkan pesan lengkap. Reduced motion juga langsung menampilkan teks.

`letter.js` memiliki satu pemilik state/timeline. Saat ditutup, typing dan entrance
yang masih berjalan dihentikan agar tidak terjadi animasi ganda. Jangan membuat
timeline tambahan yang menulis properti kertas yang sama di file lain.

## Menentukan bunga rahasia

Pada `FLOWERS`, hanya objek dengan `trigger: true` yang boleh membuka surat:

```js
{
  id: "moonflower",
  model: "cosmos",
  x: 0.10,
  z: 0.12,
  scale: 1.13,
  yaw: -0.06,
  lean: -0.045,
  trigger: true,
  tint: "#fff0f4",
  delay: 0.0,
},
```

`model`: cosmos, daisy, atau tulip. `x` ke kiri/kanan; `z` mengubah kedalaman;
`scale` ukuran; `yaw` dan `lean` dalam radian; `delay` waktu mulai pertumbuhan.
ID harus unik. Bunga dengan trigger: true selalu dipertahankan pada setiap
kualitas, termasuk setelah array diurutkan ulang. Bila jumlah trigger melebihi
budget kualitas, semua trigger tetap terlihat; jangan membuat semuanya interaktif
karena itu bertentangan dengan konsep surat tersembunyi.

Untuk menambah/mengurangi jumlah trigger, perbarui juga tes yang mengunci tiga
ID awal. Mode ringan memakai artwork dan posisi hotspot yang sudah dirender;
setelah memindahkan bunga, jalankan `tools/render_previews.py` agar keduanya
kembali cocok. Perubahan warna/background fallback juga memerlukan render ulang.

## Pertumbuhan dan angin

`CONFIG.growth.duration` mengatur batang. `leafDelay` dan `bloomDelay` menggeser
mulainya daun dan kelopak. Durasi khusus daun/kelopak ada di `FlowerGarden.grow()`.
Setiap bunga mempunyai `delay` sendiri, sehingga tidak mekar serempak.

```js
wind: { strength: 0.045, speed: 0.68, focusMultiplier: 0.22 },
```

Mulai dari amplitudo kecil. Menggandakan `strength` dapat membuat kepala bunga
terlalu jauh bergeser. CPU dan GPU menggunakan formula angin yang sama untuk
menjaga raycast tetap berada di kepala bunga; bila formula shader diubah, ubah
juga `windOffset()` di `utils.js`.

Transform dasar tidak ditimpa hover. Hover memakai uniform intensitas dan tidak
mereset scale tiap bunga ke 1. GSAP mengatur growth/bloom; render loop mengisi
waktu angin. Tidak ada `camera.position.x += mouse.x` yang menumpuk drift.

## Kualitas, kamera, dan pencahayaan

Profil awal:

| Profil | Bunga | Partikel | Rumput | Maks. DPR | Bloom |
| --- | ---: | ---: | ---: | ---: | --- |
| High | 19 | 160 | 100 | 1.75 | Ya |
| Medium | 16 | 95 | 70 | 1.35 | Ya |
| Low / Gentle | 12 | 45 | 40 | 1.0 | Tidak |

Lihat `QUALITY` untuk sumber nilainya. Auto memulai lebih ringan pada pointer
coarse / viewport kecil, lalu dapat turun lagi setelah sampel waktu frame.
Auto tidak mengidentifikasi GPU dan tidak menjamin 60 fps. Manual High/Medium/
Gentle menghentikan keputusan auto sampai Auto dipilih lagi.

`scene.js` mengatur jenis/intensitas lampu, rentang OrbitControls, exposure,
fog, dan post-processing. `CONFIG.camera` mengatur posisi dasar, field of view,
look target, dan parallax. Potret menggunakan FOV lebih lebar. Pertahankan bunga
trigger di dalam viewport pada 16:9, 16:10, dan potret.

Untuk menambah warna kelopak, ubah tint per bunga atau vertex colors pada GLB.
Untuk roughness/metalness material web, ubah `createFlowerMaterial()` dalam
`flowers.js`; mengubah node material Blender saja tidak cukup.

## Audio

`CONFIG.audio.path` menunjuk `night-garden.mp3`; versi OGG juga disertakan.
Ganti file/path dengan audio yang boleh kamu gunakan. `volume` awal 0.13.
Audio tidak otomatis aktif setelah klik bunga; pengguna harus memilih sound.
Fokus surat menurunkan volume hanya ketika audio sudah diaktifkan.

## Jangan mengubah kontrak ini tanpa mengubah runtime

- Root GLB `Flower`, `height`, metadata `part`/`pivot`, dan morph `Closed`.
- Urutan morph target pertama sebagai bentuk tertutup.
- CSS selector `#letter-dialog`, `.letter-paper`, dan ID kontrol yang dipakai JS.
- Library Three.js dan addon dengan versi yang sama.
- State letter serta penanganan cancel/close yang mencegah tween bertumpuk.

GLB pengganti yang gagal validasi akan memicu mode ringan, dengan alasan di
console. Jangan menganggap tampilan fallback membuktikan model baru sudah lolos
renderer 3D.
