# Task Checklist: Migrasi Sistem Presensi Digital

## Fase 1: Setup Project & Konsolidasi File
- [x] Buat folder proyek `/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/`
- [x] Buat shared `tailwind-config.js`
- [x] Ekstrak `index.html` (Login)
- [x] Ekstrak `dashboard.html`
- [x] Ekstrak `input-absensi.html`
- [x] Ekstrak `master-data.html`
- [x] Ekstrak `laporan.html`
- [x] Ekstrak `pengaturan.html`
- [x] Copy `config.js` & `Code.gs` dari aplikasi lama

## Fase 2: Upgrade Backend (Apps Script)
- [x] Hapus logika password hash lama di `Code.gs`
- [x] Implementasi fungsi `loginWithGoogle`
- [x] Tambah fungsi untuk Pengaturan (`getPengaturan`, `savePengaturan`)
- [x] Tambah fungsi untuk Log Aktivitas
- [x] Update fungsi CRUD untuk skema kolom baru

## Fase 3: Desain Halaman Tambahan
- [x] Desain `absen-siswa.html` dengan Tailwind (Siswa Check-in)
- [x] Desain `kelola-admin.html` dengan Tailwind
- [x] Desain `notifikasi.html` & `log-aktivitas.html`

## Fase 4: Integrasi Frontend ↔ Backend
- [x] Update `config.js` dengan Google Identity Services setup
- [x] Hubungkan `index.html` dengan login
- [x] Hubungkan `dashboard.html` dengan data backend
- [x] Hubungkan `input-absensi.html` dengan backend
- [x] Hubungkan `master-data.html` dengan backend
- [x] Hubungkan `laporan.html` dengan backend
- [x] Hubungkan halaman tambahan dengan backend

## Fase 5: Verifikasi
- [x] Test flow backend & frontend
- [x] Verifikasi mobile responsif
