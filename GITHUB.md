# Upload source DegreeBee ke GitHub

Folder repository: `D:\Coding\Venture Creation\Prototype`.

## File database yang diunggah

Gunakan **`server/schema.sql`**. Satu kali impor melalui **phpMyAdmin → Import → Choose file → Go** membuat database `degree`, seluruh 9 tabel, dan paket bulanan Rp25.000. File ini tidak berisi akun asli, token login, password database, atau laporan pengguna.

Impor ulang mempertahankan data, harga paket yang sudah diubah, dan status langganan yang sudah ada. File ini membuat struktur yang belum ada, bukan memperbaiki struktur tabel lama yang tidak kompatibel. Tidak perlu mengimpor `subscriptions.sql` secara terpisah.

Di komputer baru, struktur database saja belum menyediakan kredensial koneksi aplikasi. Jalankan setup sekali sesuai `server/README.md`; script membuat password database acak di `server/config.local.php`. Setelah setup, penggunaan harian cukup menyalakan Apache + MySQL dan membuka EXE.

## Yang disertakan dan diabaikan

Source aplikasi, script setup/test, `package.json`, `package-lock.json`, aset logo, dokumentasi, schema, dan `server/config.example.php` tetap masuk repository.

`.gitignore` mengecualikan kredensial lokal, `.env`, state login, laporan lokal, dump database, log, hasil pengujian, dependensi, model unduhan, hasil build, EXE, dan folder kerja/output presentasi. Model dan aset hasil build dibuat kembali saat `npm run build`.

## Upload melalui Git

Buat repository kosong di GitHub, lalu jalankan dari folder Prototype:

```powershell
git init
git add .
git status --short
git diff --cached --stat
git commit -m "Initial DegreeBee prototype"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Ganti `USERNAME/REPOSITORY` dengan repository milikmu. Untuk repository yang sudah memiliki Git/remote, gunakan konfigurasi yang ada; tidak perlu mengulang `git init` atau menambah `origin`.

Aturan `.gitignore` berlaku saat memakai Git, bukan saat menyeret seluruh folder ke halaman upload GitHub. Aturan ini juga tidak menghapus file sensitif yang sudah pernah dilacak atau diunggah. Folder Prototype belum memiliki repository Git saat pemeriksaan ini; belum ada commit atau push yang dilakukan.

EXE tidak masuk commit source. Jika nanti ingin membagikan hasil compile, lampirkan EXE secara terpisah melalui GitHub Releases.
