# Menjalankan prototipe DegreeBee 2.2.1

Prototipe ini untuk diperlihatkan kepada calon pengguna di komputer pengembangan. XAMPP berjalan di belakang layar; pengguna mengoperasikan EXE berbahasa Inggris. Pembayaran belum diterapkan.

## Membuka aplikasi

1. Nyalakan **Apache** dan **MySQL** di XAMPP.
2. Tutup DegreeBee versi lama.
3. Buka langsung `release\DegreeBee-Focus-2.2.1-x64.exe` dengan klik dua kali. Tidak perlu menjalankan backend.ps1 atau start-backend.ps1.

Jika ingin melalui PowerShell:

```powershell
cd 'D:\Coding\Venture Creation\Prototype'
.\Start-DegreeBee.cmd
```

Di Command Prompt (CMD):

```cmd
cd /d "D:\Coding\Venture Creation\Prototype"
Start-DegreeBee.cmd
```

Peluncur hanya membuka EXE. Layanan akun dijalankan otomatis oleh Apache di `http://127.0.0.1/degreebee`. Konfigurasi pada komputer ini sudah dipasang; jangan pindahkan folder Prototype karena Apache merujuk ke folder tersebut. Login tersimpan dan laporan akun versi sebelumnya tetap memakai lokasi data yang sama.

## Mengaktifkan AI dengan QR demo

1. Login atau buat akun dari **New here? Create an account**.
2. Buka **Monitoring** atau **Account**, lalu klik **Get monthly access**.
3. QR demo dan paket **Rp25.000** ditampilkan. QR ini tidak memiliki tujuan pembayaran dan tidak perlu dipindai.
4. Klik **Confirm demo payment**. Akses AI langsung aktif untuk satu bulan kalender.
5. Buka **Monitoring → Start focus** untuk memulai. Tidak perlu perintah admin atau mengedit database.

Konfirmasi disimpan di degree.db_demo_access dan dicatat sebagai demo_activation di db_subscription_events. Tidak ada uang yang ditagih atau pembayaran sungguhan yang dicatat. Harga diambil dari db_plans. Data langganan berbayar tetap terpisah. Menutup QR atau memilih **Cancel** tidak membuka akses. Konfirmasi berulang tidak memperpanjang akses; setiap akun memperoleh satu bulan demo.

Mode demo dapat dimatikan pengembang lewat server/demo-config.php; akses demo tidak berlaku ketika mode ini mati. Perintah pengelola lama tetap tersedia sebagai opsi pemeliharaan, tetapi tidak diperlukan untuk presentasi.

## Alur demonstrasi produk

1. Pilih **Computer work**, beri nama sesi, lalu **Start focus**. Izinkan kamera dan gunakan **Calibrate** bila perlu.
2. Tunjukkan indikator wajah, mata, dan kepala. Berpindah ke Word/PDF/browser: monitoring tetap berjalan. **Mini mode** menampilkan kamera dan kontrol sesi.
3. Tunjukkan pengingat desktop dan bunyi ketika kondisi tidak fokus bertahan. **Pause** menghentikan kamera dan pengingat saat istirahat; **Resume** memverifikasi ulang akses.
4. **Finish & save** menyimpan sesi. Workspace **Personal** menampilkan XP, level, badge, streak, dan leaderboard opsional. Workspace **Reports** menyediakan **Save PDF** dan **Save progress image**.
5. **Delete session** tersedia selama sesi; aplikasi meminta konfirmasi sebelum menghapus sesi tersebut.

Semua akun uji otomatis memakai alamat unik dan dihapus setelah pengujian. Leaderboard tidak diisi peserta atau skor fiktif.

## Akses dan penyimpanan

Layanan lokal harus berjalan sebelum dan selama monitoring. Akses diperiksa saat mulai/resume dan berkala saat sesi berlangsung. Koneksi gagal, token tidak valid, atau akses kedaluwarsa akan menjeda monitoring; laporan tetap dapat disimpan. Sesi yang dijeda tidak menambah waktu aktif.

Laporan lengkap tetap di perangkat, terpisah per akun. Database menerima tanggal dan ringkasan waktu aktif; judul sesi, skor kamera, foto, dan video tidak dikirim. Laporan lama guest tetap di disk tetapi tidak tersedia sebagai mode guest. Pengguna yang sudah login dapat membuka laporan akunnya walau langganan tidak aktif.

**Change password** mengganti password dan mencabut sesi login sebelumnya. **Delete account** menghapus akun dan data tersinkron; berkas laporan lokal tetap dipertahankan. Pemulihan password melalui email belum tersedia.

Model kamera disertakan dalam EXE, tetapi akses monitoring tetap memerlukan layanan akun. Untuk demonstrasi lokal, gunakan XAMPP ini. Jika nanti ingin berbagi akun lintas komputer, pengelola perlu menempatkan API di server bersama dan mengubah konfigurasi build; tidak ada pengaturan server di UI pengguna. Petunjuk pengembang ada di `server/README.md`.

Pengamatan kamera bukan bukti konsentrasi mental atau pelanggaran ujian. Pengujian otomatis memakai kamera simulasi; pencahayaan, kacamata, bentuk mata, dan bunyi dari speaker perlu dicoba langsung sebelum presentasi.
