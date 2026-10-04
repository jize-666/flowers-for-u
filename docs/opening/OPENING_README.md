# Flowers For You - cinematic opening

Opening terpisah untuk project Flowers For You. Tidak mengganti taman, surat
tersembunyi, config.js, letter.js, index.html taman, atau style.css taman.

## Mulai dari sini

Paket ini berisi **opening saja**, bukan salinan project taman 3D yang lama.
Ada 135 paragraf / 1.053 kata dari sinopsis yang diberikan. Teks Inggris
seluruhnya dipertahankan, termasuk bagian setelah instruksi di tengah pesan.
Instruksi bahasa Indonesia pengguna bukan bagian dari sinopsis.

Jalur utama: GSAP 3.13.0, dengan animasi kata berbasis opacity dan transform.
Jika library tidak tersedia, Web Animations menjalankan fallback berlabel
"Native animation". Tidak ada library GSAP tiruan di paket ini.

**GSAP tidak berhasil diunduh di lingkungan pembuatan.** Jalankan installer
library di Codespaces yang mempunyai internet. Pengujian browser yang telah
dijalankan adalah native fallback; bukan uji GSAP terselubung.

## Preview cepat di Codespaces

Ekstrak paket ke folder terpisah. Dari folder FlowersForYou-Opening:

```bash
python3 tools/install_opening_gsap.py
python3 tools/preview_opening.py --port 5001
```

Buka tab PORTS, port **5001**, lalu Open in Browser. Pemakaian port 5001
memungkinkan server taman lama di port 5000 tetap berjalan. Preview memakai
Python standard library; tidak perlu memasang Flask untuk mencoba opening.
Tautan Enter the garden dalam preview menampilkan placeholder, karena taman
aslimu tidak dibundel. Setelah integrasi, tautan itu membuka taman sebenarnya.

File `Opening-Preview-Offline.html` adalah preview mandiri yang berisi aset,
audio dan source native yang sama. Tidak memuat GSAP atau font daring. Buka
melalui browser yang mendukung JavaScript; preview aplikasi Files tidak selalu
mengeksekusi JavaScript. Preview offline bukan bukti pengujian renderer GSAP.

## Integrasi aman ke project lama

Tidak perlu menghapus project yang sudah kamu revisi. Jangan menyalin
`package.json` paket ini ke project taman secara sembarangan.

Dari dalam folder hasil ekstrak `FlowersForYou-Opening`, jalankan dry run:

```bash
python3 tools/integrate_opening.py --target /workspaces/flowers-for-u
```

Jika target benar, terapkan:

```bash
python3 tools/integrate_opening.py --target /workspaces/flowers-for-u --apply
```

Script hanya menyalin file berawalan opening, module route, dan dua tool aset.
Ia menambahkan registrasi ke app.py dan membuat backup sebelum mengubahnya.
Ia tidak menimpa file pembuka yang berbeda tanpa persetujuan: jika sudah ada
file opening hasil revisi sendiri, update secara manual. Script mendukung satu
assignment Flask(...) langsung maupun di factory function. Struktur lebih rumit
akan dihentikan dan perlu integrasi manual, bukan ditebak.

Setelah itu, dari root repository:

```bash
cd /workspaces/flowers-for-u
python3 tools/install_opening_gsap.py
```

Restart proses Flask di Codespaces agar route baru terbaca. Pada HP, buka
terminal baru dengan ikon +. Gunakan daftar proses untuk mengenali server lama;
jangan menghentikan semua proses Python di workspace. Alternatif paling mudah
untuk mencoba dulu adalah menjalankan `opening_app.py` dari folder paket pada
port lain setelah Flask terpasang.

Hasil route:

- `/` -> redirect ke opening.
- `/opening` atau `/opening/` -> opening lengkap.
- `/?garden=1` -> route taman lamamu, tidak ditimpa.

Opening tidak pernah memanggil surat tersembunyi atau mengubah trigger bunga.
Tidak ada navigasi otomatis ke taman setelah kalimat terakhir: pengunjung
memilih Enter the garden. Link di atas juga membolehkan mereka melewati opening.
Sinopsis tetap utuh di mode film dan Read the full letter.

## Integrasi manual

Salin `templates/opening.html`, file berawalan `opening` di static, folder
`static/vendor/opening-gsap`, dan `opening_routes.py` ke project lama.
Tambahkan ini **setelah objek Flask dibuat, sebelum app.run**:

```python
from opening_routes import install_opening
install_opening(app)
```

Misalnya:

```python
app = Flask(__name__)
from opening_routes import install_opening
install_opening(app)
```

Jika memakai `create_app()`, letakkan dua baris itu di dalam fungsi, setelah
`app = Flask(__name__)`. Pertahankan semua route taman yang sudah ada.

Untuk opening opsional saja tanpa redirect halaman `/`, set sebelum install:

```python
app.config['FLOWERS_OPENING_AT_ROOT'] = False
install_opening(app)
```

Paket mengasumsikan struktur Flask `templates/` dan `static/` standar seperti
project yang dibahas. Custom prefix / reverse proxy perlu penyesuaian URL aset.

## Menjalankan demo Flask terpisah

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-opening.txt
PORT=5001 .venv/bin/python opening_app.py
```

`opening_app.py` merupakan demo baru. Jangan mengganti app.py taman dengan file
ini: route taman pada demo hanyalah placeholder.

## Revisi yang paling sering

| Ingin mengubah | File |
| --- | --- |
| Sinopsis lengkap | `static/js/opening-content.js` -> SYNOPSIS |
| Nama dan awal bab | `static/js/opening-content.js` -> CHAPTERS |
| Durasi, kecepatan reveal, musik, URL taman | `static/js/opening-config.js` |
| Font, warna, ukuran kertas, tata letak | `static/css/opening.css` |
| Struktur surat dan label tombol | `templates/opening.html` |
| Playback, chapter, full letter, transisi ke taman | `static/js/opening.js` |
| Timeline GSAP dan native fallback | `static/js/opening-motion.js` |
| Audio loop, volume, pause/resume | `static/js/opening-audio.js` |
| Membuat ulang tekstur dan musik | `tools/build_opening_assets.py` |

Sinopsis memakai template literal agar mudah diedit dengan paragraf asli.
Jangan menambahkan HTML ke dalamnya; teks ditampilkan dengan textContent.
Jika jumlah paragraf berubah, perbarui indeks awal CHAPTERS dan rentang doa
pada `showCue` di opening.js. File teks statis untuk noscript berada di
`static/text/opening-story.txt`; perbarui juga jika menulis sinopsis baru.
File `docs/synopsis-original.txt` tetap menjadi salinan acuan sinopsis awal.

Tempo awal:

```js
wordsPerMinute: 175,
minimumReadSeconds: 1.55,
entranceSeconds: 0.95,
wordStaggerSeconds: 0.026,
exitSeconds: 0.6,
silenceSeconds: 0.18,
chapterPauseSeconds: 0.5,
finalHoldSeconds: 3.2,
```

Total awal sekitar **10:05 pada 1x**. Pilihan 1.25x sekitar 8:04 dan 1.5x
sekitar 6:43. Speed hanya mengubah timeline teks, bukan pitch musik.
Tidak ada batas maksimum durasi paragraf yang memangkas teks panjang.

## Musik dan font

Musik `opening-warmth.mp3` dan master `opening-warmth.wav` adalah komposisi
sintetis orisinal untuk paket ini: pad hangat dan nada lembut, tanpa vokal,
tanpa sampel lagu komersial. Durasi loop 64 detik. Bukan rekaman piano akustik.
Volume awal Web Audio 30%; mix master RMS sekitar -24 dBFS. Tetap sesuaikan
volume perangkat sebelum mendengarkan dengan headphone.

Musik tidak autoplay saat halaman dimuat. Pengunjung memulai lewat Begin
atau Resume dengan pilihan With soft ambience aktif. Tersedia mute dan volume.
Saat tab ditinggalkan, cerita dan musik berhenti; Play melanjutkan keduanya.

Instrument Serif dan Inter diminta lewat Google Fonts di HTML. Tidak ada file
font dibundel. Bila font tidak tersedia, halaman memakai Georgia dan font UI
sistem. Preview offline memakai fallback tersebut.

Untuk membuat ulang aset: pasang numpy, scipy, Pillow dan ffmpeg, lalu:

```bash
python3 tools/build_opening_assets.py
```

Ini menimpa aset audio/tekstur opening saja. Simpan file revisimu terlebih dahulu.

## Kinerja dan aksesibilitas

Target animasi **60 fps**, bukan jaminan untuk semua GPU/browser. Opening tidak
memuat Three.js/taman bersamaan, hanya maksimum kata pada satu paragraf yang
sedang diputar. Properti animasi utama opacity dan transform. Tidak ada animasi
blur besar, shader, cursor mengetik, atau perhitungan layout tiap kata tiap frame.

Browser dan power saving dapat membatasi frame rate. Tes pada iPhone fisik,
Safari, Firefox dan PC tujuan tetap perlu. Lihat docs/QA.md untuk hasil aktual.
`prefers-reduced-motion` mematikan gerakan naik/kata stagger dan partikel, tetapi
mempertahankan waktu membaca. Full letter menyediakan pembacaan tanpa timer.
Kontrol dapat dipakai dengan keyboard. Space/arrow berlaku saat fokus bukan di
input, select, link atau tombol; tombol tetap bekerja dengan Enter/Space normal.

## Catatan batasan

Opening ini tidak menambahkan login, enkripsi atau akses privat. Siapa pun yang
mempunyai akses URL/source dapat membaca sinopsis. Kalimat tentang "only two"
adalah isi cerita, bukan implementasi keamanan. Tidak menyimpan audio maupun
sinopsis ke layanan lain; localStorage hanya menyimpan indeks paragraf terakhir.
Tidak otomatis melewati cerita karena progress tersimpan: Resume selalu pilihan.

Jangan menganggap penilaian negatif tokoh tentang dirinya sebagai fakta; itu
adalah narasi yang diberikan pengguna dan sengaja dipertahankan tanpa rewrite.

## Pengujian

```bash
node --test tests/opening.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tests/browser_opening.py
```

Browser test memerlukan playwright dan Chromium. Default memeriksa cabang native
in-memory. Untuk memeriksa library nyata di PC, tes `--url` pada route opening:

```bash
python3 tests/browser_opening.py --url http://127.0.0.1:5001/opening --require-gsap
```

Contoh API yang dipakai: https://gsap.com/docs/v3/GSAP/Timeline/
Audio: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
Rendering: https://web.dev/articles/animations-guide
Flask: https://flask.palletsprojects.com/en/stable/blueprints/
