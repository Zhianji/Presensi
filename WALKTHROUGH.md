# Walkthrough & Panduan Penggunaan: Sistem Presensi Digital

Seluruh proses migrasi, upgrade backend, pembuatan halaman baru, dan integrasi Frontend ↔ Backend telah **selesai 100%**!

---

## 🚀 Ringkasan Perubahan & Fitur Terbaru

### 1. Upgrade Backend (`Code.gs`)
- **Fix CRUD & Schema Alignment**:
  - `createSiswa`, `updateSiswa`, `deleteSiswa`, `importSiswaBulk` telah disesuaikan dengan skema 7 kolom (`id`, `nis`, `nama`, `kelas`, `wali_murid`, `status_aktif`, `email`).
  - `doPost` telah diperbaiki agar melempar objek `session` dan parameter secara presisi ke fungsi backend.
  - Penambahan audit trail otomatis via `logAction` setiap ada penambahan, pengubahan, atau penghapusan siswa/pengguna/pengaturan.

### 2. Konfigurasi Frontend Shared (`js/config.js`)
- **Multi-Role Page Protection (`guardPage`)**:
  - Mencegah akses tanpa token/sesi yang sah.
  - Mendukung pengecekan hak akses multi-peran (`admin`, `guru`, `kepsek`, `siswa`).
- **Google Identity Services (GIS) & Mock Login**:
  - Menyediakan fungsi `initGoogleSignIn` untuk menginisialisasi tombol resmi Google Sign-In.
  - Tetap menyediakan fungsi fallback `mockGoogleLogin` (simulasi popup email) jika Client ID OAuth belum dipasang.
- **Auto Navigation & User Profile**:
  - Otomatis menandai menu aktif pada sidebar di seluruh halaman.
  - Menampilkan nama dan role user di top bar header.
  - Toast feedback visual saat simpan/edit data.

### 3. Integrasi Halaman Web Frontend (`*.html`)
- **Login (`index.html`)**: Otomatis mengecek sesi aktif dan mengarahkan siswa ke `absen-siswa.html` atau admin/guru/kepsek ke `dashboard.html`.
- **Dashboard (`dashboard.html`)**: Dilindungi dengan `guardPage(['admin', 'guru', 'kepsek'])`. Menampilkan statistik harian (Hadir, Sakit, Izin, Alpa) dan tabel data presensi terbaru secara real-time.
- **Input Absensi (`input-absensi.html`)**: Filter berdasarkan Kelas, Mapel (TIK/KKA), dan Tanggal. Dilengkapi fitur "Tandai Semua Hadir" dan tombol simpan batch ke backend Apps Script via `getStatusHarian` & `setAbsensiStatus`.
- **Master Data Siswa (`master-data.html`)**: Manajemen siswa lengkap dengan pencarian interaktif, filter kelas/status, modal **Tambah Siswa**, **Edit Siswa**, **Hapus Siswa**, **Import CSV Bulk**, tombol **Export CSV** data terdaftar, serta opsi **Download Template CSV**.
- **Laporan & Rekap (`laporan.html`)**: Rekapitulasi kehadiran bulanan (`getRekapBulanan`), visualisasi diagram persentase kehadiran, filter bulan/tahun/kelas, fitur **Cetak/PDF**, dan **Export CSV/Excel**.
- **Portal Siswa (`absen-siswa.html`)**: Khusus peran `siswa` untuk check-in presensi TIK/KKA hari ini dan melihat riwayat presensi personal.
- **Kelola Admin (`kelola-admin.html`)**: Khusus `admin` & `kepsek` untuk mengelola akun pengelola (`createGuru`, `updateGuru`, `deleteGuru`).
- **Pengaturan (`pengaturan.html`)**: Mengatur tahun ajaran aktif, semester, dan batas waktu input absensi (`getPengaturan`, `savePengaturan`).
- **Log Aktivitas (`log-aktivitas.html`)**: Menampilkan riwayat aksi pengguna terintegrasi dari `LogAktivitas`.
- **Notifikasi (`notifikasi.html`)**: Pusat pemberitahuan sistem terintegrasi.

---

## 📋 Cara Menggunakan / Menjalankan Aplikasi

1. **Deploy Backend di Google Apps Script**:
   - Salin seluruh isi file [`Code.gs`](file:///Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/Code.gs) ke editor Google Apps Script di Google Sheet Anda.
   - Jalankan fungsi `setupSheets()` sekali saja dari editor Apps Script untuk menyiapkan sheet `Pengguna`, `Siswa`, `Absensi`, `Sessions`, `Pengaturan`, dan `LogAktivitas`.
   - Deploy sebagai **Web App** (`Execute as: Me`, `Who has access: Anyone`).
   - Salin URL Web App yang dihasilkan ke variabel `APPS_SCRIPT_URL` di [`js/config.js`](file:///Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/js/config.js).

2. **Login Simulasi (Mock Login)**:
   - Buka `index.html` di browser.
   - Klik tombol **"Masuk dengan Google"**.
   - Ketikkan email pengelola (misal: `admin@sekolah.edu`) atau email siswa yang ada di sheet.
   - Sistem akan langsung mengarahkan Anda ke portal yang sesuai!

---

## 📄 Ringkasan File Project

```
sistem-presensi-digital/
├── index.html           # Login page
├── dashboard.html       # Overview dashboard (Admin/Guru/Kepsek)
├── input-absensi.html   # Input presensi kelas (Guru/Admin)
├── master-data.html     # Master data siswa & CRUD (Admin/Guru/Kepsek)
├── laporan.html         # Rekapitulasi & Export (Admin/Guru/Kepsek)
├── absen-siswa.html     # Portal Presensi Siswa
├── kelola-admin.html    # Manajemen Akun Pengelola (Admin/Kepsek)
├── pengaturan.html      # Pengaturan Sistem (Admin/Kepsek)
├── log-aktivitas.html   # Audit Log Aktivitas (Admin/Kepsek)
├── notifikasi.html      # Pusat Notifikasi
├── Code.gs              # Google Apps Script Backend API
├── TASK.md              # Progress tracker checklist
├── WALKTHROUGH.md         # Walkthrough & documentation
└── js/
    ├── config.js        # API endpoints, Auth, & UI Helpers
    └── tailwind-config.js # Tailwind CSS theme design system
```
