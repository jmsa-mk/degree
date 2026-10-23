# DegreeBee Focus

## 1. Cara menjalankan aplikasi

### Persiapan

- Gunakan Windows 64-bit dan install XAMPP di `C:\xampp`.
- Simpan folder project beserta file backend di komputer yang menjalankan aplikasi.
- Nyalakan **Apache** dan **MySQL** melalui XAMPP Control Panel.
- Untuk menjalankan dari source atau compile EXE, install Node.js versi 22.12 atau lebih baru beserta npm.

### Import database

1. Buka `http://localhost/phpmyadmin`.
2. Pilih tab **Import** dan unggah [`server/schema.sql`](server/schema.sql).
3. Klik **Go / Import**. File ini membuat database **`degree`**, seluruh tabel, dan paket **Rp50.000 per bulan**.

Schema tidak menyertakan akun pengguna, password database, atau akun admin. Import ulang mempertahankan data dan harga paket yang sudah tersimpan. Untuk database versi lama yang masih memakai harga sebelumnya, gunakan perintah pembaruan harga pada langkah berikut.

### Setup pertama kali melalui CMD

Buka **Command Prompt (CMD)**, lalu jalankan:

```cmd
cd /d "D:\Coding\Venture Creation\Prototype"
C:\xampp\php\php.exe server\setup-local.php
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-xampp.ps1
```

Sesuaikan lokasi folder pada perintah `cd` jika project disimpan di tempat lain. Setup membuat koneksi database privat dan konfigurasi Apache. Setelah selesai, **Stop lalu Start Apache sekali** melalui XAMPP.

Jika memakai database lama, perbarui harga paket sekali:

```cmd
C:\xampp\php\php.exe server\update-monthly-price.php
```

Koneksi database disimpan di `server/config.local.php` dan tidak masuk Git. Setup default menggunakan akun MySQL `root` tanpa password sesuai instalasi XAMPP lokal. Jika root memiliki password, isi variabel `DEGREEBEE_DB_ADMIN_PASSWORD` pada terminal sebelum menjalankan script PHP.

### Compile EXE dari source

Dari folder project yang sama, jalankan:

```cmd
npm ci
npm run dist
```

Hasil compile versi saat ini:

```text
release\DegreeBee-Focus-2.3.1-x64.exe
```

Koneksi internet diperlukan saat mengunduh dependensi dan model pada build pertama. `npm run dist` membangun aplikasi serta mengemas EXE. Node.js tidak diperlukan untuk membuka EXE yang sudah dibuat.

Untuk menjalankan source selama pengembangan:

```cmd
npm start
```

### Penggunaan sehari-hari

1. Nyalakan **Apache** dan **MySQL** di XAMPP.
2. Tutup DegreeBee versi lama jika masih terbuka.
3. Klik dua kali EXE di folder `release`, atau jalankan dari folder project:

```cmd
Start-DegreeBee.cmd
```

4. Buat akun atau login. Untuk mencoba AI, pilih **Get monthly access → Confirm demo payment**.
5. Buka **Monitoring**, isi nama sesi, lalu pilih **Start focus**.

Tidak perlu menjalankan `backend.ps1` atau `start-backend.ps1`. Pada komputer ini setup sudah selesai. Jangan pindahkan folder project setelah konfigurasi Apache dibuat. Jika pindah folder, jalankan ulang `setup-xampp.ps1` dari lokasi baru lalu restart Apache.

Setiap laptop yang memakai XAMPP lokal mempunyai database sendiri. Berbagi akun dan leaderboard lintas laptop memerlukan backend bersama dan perubahan alamat layanan pada build aplikasi.

## 2. Credential admin

| Keterangan | Nilai |
| --- | --- |
| Email admin lokal | `admin@gmail.com` |
| Password awal | Lihat [`server/admin-access.local.txt`](server/admin-access.local.txt) pada komputer yang membuat akun admin |
| Menu admin | **Help & support → Support inbox** |

Untuk melihat credential lokal melalui CMD:

```cmd
type server\admin-access.local.txt
```

File password bersifat privat dan diabaikan Git. File tersebut tidak tersedia setelah clone repository di komputer baru. Setelah login pertama, ubah password melalui **Account → Change password**.

Untuk instalasi baru, buat akun admin sekali setelah setup database:

```cmd
C:\xampp\php\php.exe server\support-admin.php create admin@gmail.com
```

Perintah ini membuat password acak dan menyimpannya di `server/admin-access.local.txt`. Jika akun sudah terdaftar, gunakan password akun tersebut lalu berikan hak support:

```cmd
C:\xampp\php\php.exe server\support-admin.php grant admin@gmail.com
```

Hak admin customer service tidak otomatis mengaktifkan langganan AI.

## 3. Penjelasan produk

DegreeBee Focus adalah aplikasi desktop yang membantu pelajar menjaga kebiasaan belajar saat memakai Word, PDF, browser, atau aplikasi lain. Kamera memeriksa keberadaan wajah, kondisi mata, dan arah kepala. Perubahan yang terdeteksi dapat memunculkan pengingat desktop beserta bunyi.

Fitur utamanya mencakup mini mode dengan preview kamera, kalibrasi, pilihan pemeriksaan, pause/resume, laporan sesi dengan ekspor PDF dan gambar, XP, streak, badge, leaderboard opsional, serta customer service melalui tiket dan balasan admin. Pemrosesan kamera berjalan lokal dan tidak mengunggah foto atau video. Pengamatan kamera tidak membuktikan konsentrasi mental.

Harga paket adalah **Rp50.000 per bulan**. Pembayaran pada prototype masih berupa **QR demo**, tanpa transaksi nyata atau perpanjangan otomatis.
