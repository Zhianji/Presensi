import re

dir_path = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital/"

def replace_main(filename, new_main_content, title_text):
    path = dir_path + filename
    with open(path, "r") as f:
        content = f.read()
    
    # Replace title
    content = re.sub(r'<title>.*?</title>', f'<title>{title_text} - Sistem Presensi Edukasi</title>', content)
    
    # Replace main section
    content = re.sub(r'<main.*?</main>', new_main_content, content, flags=re.DOTALL)
    
    # Update active sidebar item (dirty but works)
    content = content.replace('bg-primary-fixed text-on-primary-fixed', 'text-on-surface hover:bg-surface-variant')
    
    with open(path, "w") as f:
        f.write(content)

# Kelola Admin
admin_main = '''<main class="flex-1 ml-0 md:ml-[260px] p-6 lg:p-8 mt-16 md:mt-0 max-w-full overflow-hidden transition-all duration-300">
    <div class="container-max-width mx-auto">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
                <h1 class="font-display-md text-display-md text-on-surface tracking-tight">Kelola Pengguna</h1>
                <p class="font-body-md text-body-md text-on-surface-variant mt-1">Manajemen akun Admin, Guru, dan Kepala Sekolah.</p>
            </div>
            <button class="bg-primary hover:bg-primary-container text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-title-md transition-colors shadow-sm active:scale-95" onclick="alert('Fitur tambah pengguna akan datang!')">
                <span class="material-symbols-outlined text-[20px]">person_add</span> Tambah Pengguna
            </button>
        </div>
        
        <div class="bg-white rounded-xl shadow-sm border border-outline-variant overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-surface-container-low border-b border-outline-variant">
                            <th class="py-3 px-6 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Nama</th>
                            <th class="py-3 px-6 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Email</th>
                            <th class="py-3 px-6 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Role</th>
                            <th class="py-3 px-6 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="pengguna-table" class="divide-y divide-outline-variant">
                        <tr class="hover:bg-surface-container-low/50 transition-colors">
                            <td colspan="4" class="py-6 px-6 text-center text-on-surface-variant text-sm">Data belum dimuat...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</main>'''

replace_main("kelola-admin.html", admin_main, "Kelola Pengguna")

# Log Aktivitas
log_main = '''<main class="flex-1 ml-0 md:ml-[260px] p-6 lg:p-8 mt-16 md:mt-0 max-w-full overflow-hidden transition-all duration-300">
    <div class="container-max-width mx-auto">
        <div class="mb-8">
            <h1 class="font-display-md text-display-md text-on-surface tracking-tight">Log Aktivitas</h1>
            <p class="font-body-md text-body-md text-on-surface-variant mt-1">Riwayat aktivitas sistem dan pengguna.</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-outline-variant p-6">
            <div class="space-y-4" id="log-container">
                <p class="text-on-surface-variant text-sm text-center">Memuat log...</p>
            </div>
        </div>
    </div>
</main>'''
replace_main("log-aktivitas.html", log_main, "Log Aktivitas")

# Notifikasi
notif_main = '''<main class="flex-1 ml-0 md:ml-[260px] p-6 lg:p-8 mt-16 md:mt-0 max-w-full overflow-hidden transition-all duration-300">
    <div class="container-max-width mx-auto">
        <div class="mb-8">
            <h1 class="font-display-md text-display-md text-on-surface tracking-tight">Notifikasi</h1>
            <p class="font-body-md text-body-md text-on-surface-variant mt-1">Pusat pemberitahuan sistem.</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-outline-variant p-10 text-center">
            <span class="material-symbols-outlined text-6xl text-outline-variant mb-4">notifications_off</span>
            <h3 class="font-title-md text-on-surface">Tidak ada notifikasi</h3>
            <p class="text-sm text-on-surface-variant mt-2">Anda telah membaca semua notifikasi.</p>
        </div>
    </div>
</main>'''
replace_main("notifikasi.html", notif_main, "Notifikasi")

print("Templates modified")
