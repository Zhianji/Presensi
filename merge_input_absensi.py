import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

desktop_html = read_file('input-absensi.html')
mobile_html = read_file('/Users/rezakurnianda/Downloads/stitch_sistem_presensi_digital_terpadu/input_absensi_mobile_version/code.html')

# Extract mobile body
mobile_body_match = re.search(r'<body[^>]*>(.*?)</body>', mobile_html, re.DOTALL)
mobile_body = mobile_body_match.group(1)

# Modify mobile HTML: empty the hardcoded #student-list
mobile_body = re.sub(r'(<div class="space-y-3" id="student-list">).*?(<!-- Sticky Bottom Action Bar -->)', r'\1\n</div>\n\2', mobile_body, flags=re.DOTALL)

# Also rename some mobile IDs so they don't conflict with desktop IDs (like select-kelas etc)
# Wait, the mobile version doesn't actually have `id="select-kelas"` inside its filter select boxes, but we should add them, OR we can just rely on the desktop filters since they can act as the main source of truth if we only show them on mobile?
# No, both will be in DOM. So mobile needs `id="select-kelas-mobile"`, etc.
# Wait! In input-absensi.html, the mobile code.html I viewed earlier HAS:
# <select class="w-full bg-surface-container-low border-outline-variant ...>
# It doesn't have IDs. I should add `id="select-kelas-mobile"` etc.
mobile_body = mobile_body.replace('<select class="w-full bg-surface-container-low border-outline-variant', '<select id="select-kelas-mobile" class="w-full bg-surface-container-low border-outline-variant', 1)
mobile_body = mobile_body.replace('<select class="w-full bg-surface-container-low border-outline-variant', '<select id="select-mapel-mobile" class="w-full bg-surface-container-low border-outline-variant', 1)
mobile_body = mobile_body.replace('<input class="w-full bg-surface-container-low border-outline-variant', '<input id="input-tanggal-mobile" class="w-full bg-surface-container-low border-outline-variant', 1)
mobile_body = mobile_body.replace('onclick="markAllPresent()"', 'onclick="markAllPresentMobile()"')

# Extract desktop body
desktop_body_match = re.search(r'<body[^>]*>(.*?)</body>', desktop_html, re.DOTALL)
desktop_body_inner = desktop_body_match.group(1)

# Ensure desktop IDs have -desktop (only for inputs that conflict)
desktop_body_inner = desktop_body_inner.replace('id="select-kelas"', 'id="select-kelas-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="select-mapel"', 'id="select-mapel-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="input-tanggal"', 'id="input-tanggal-desktop"')

# Now we need to modify the JS in desktop_body_inner
# Extract JS block
js_match = re.search(r'(<script src="js/config.js"></script>.*?)</script>\s*$', desktop_body_inner, re.DOTALL)
scripts = js_match.group(1) + "</script>" if js_match else ""

# Remove JS from desktop_body_inner
if js_match:
    desktop_body_inner = desktop_body_inner.replace(js_match.group(0), "")

# Modify the script to sync mobile and desktop inputs, and render both
scripts = scripts.replace("document.getElementById('input-tanggal').value", "document.getElementById('input-tanggal-desktop').value")
scripts = scripts.replace("document.getElementById('input-tanggal-desktop').value = new Date()", """
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('input-tanggal-desktop').value = todayStr;
        const mobileDate = document.getElementById('input-tanggal-mobile');
        if(mobileDate) mobileDate.value = todayStr;
""")

new_loadStatusHarian = """
    async function loadStatusHarian() {
        const kelas = document.getElementById('select-kelas-desktop').value || (document.getElementById('select-kelas-mobile') ? document.getElementById('select-kelas-mobile').value : '');
        const mapel = document.getElementById('select-mapel-desktop').value || (document.getElementById('select-mapel-mobile') ? document.getElementById('select-mapel-mobile').value : '');
        const tanggal = document.getElementById('input-tanggal-desktop').value || (document.getElementById('input-tanggal-mobile') ? document.getElementById('input-tanggal-mobile').value : '');

        const tbody = document.getElementById('input-absensi-tbody');
        const mobileList = document.getElementById('student-list');
        
        if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-6 text-center text-on-surface-variant"><span class="material-symbols-outlined animate-spin text-sm">sync</span> Memuat data siswa...</td></tr>`;
        if(mobileList) mobileList.innerHTML = `<div class="text-center p-4">Memuat data...</div>`;

        try {
            const res = await apiPost('getStatusHarian', { token: getToken(), kelas, mapel, tanggal });
            if (res.ok && res.data) {
                currentSiswaList = res.data;
                renderSiswaTable(res.data);
                const countText = `Menampilkan ${res.data.length} Siswa`;
                const elDesktopText = document.getElementById('total-siswa-text');
                if(elDesktopText) elDesktopText.textContent = countText;
                
                const elInfo = document.getElementById('info-text');
                if(elInfo) elInfo.innerHTML = `Menampilkan data presensi untuk kelas <strong>${kelas || 'Semua Kelas'}</strong> (${mapel}) tanggal <strong>${tanggal}</strong>.`;
            } else {
                if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-6 text-center text-error">Gagal memuat data: ${res.error || 'Terjadi kesalahan'}</td></tr>`;
                if(mobileList) mobileList.innerHTML = `<div class="text-center p-4 text-error">Gagal memuat data</div>`;
            }
        } catch (e) {
            if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-6 text-center text-error">Gagal terhubung ke server</td></tr>`;
            if(mobileList) mobileList.innerHTML = `<div class="text-center p-4 text-error">Gagal terhubung</div>`;
        }
    }
"""

scripts = re.sub(r'async function loadStatusHarian\(\) \{.*?\}\n', new_loadStatusHarian, scripts, flags=re.DOTALL)

new_renderSiswaTable = """
    function renderSiswaTable(data) {
        const tbody = document.getElementById('input-absensi-tbody');
        const mobileList = document.getElementById('student-list');
        
        if (!data || data.length === 0) {
            if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-6 text-center text-on-surface-variant">Tidak ada data siswa ditemukan untuk kelas ini.</td></tr>`;
            if(mobileList) mobileList.innerHTML = `<div class="text-center p-4">Tidak ada data siswa</div>`;
            return;
        }

        let htmlDesktop = '';
        let htmlMobile = '';
        
        data.forEach((s, idx) => {
            const rowNo = String(idx + 1).padStart(2, '0');
            const status = s.status || '';
            const initials = s.nama ? s.nama.substring(0, 2).toUpperCase() : 'NA';

            htmlDesktop += `
                <tr class="hover:bg-surface-container-lowest transition-colors group" data-siswa-id="${s.siswa_id}">
                    <td class="px-6 py-4 font-body-md text-on-surface-variant">${rowNo}</td>
                    <td class="px-6 py-4 font-title-md text-on-surface">
                        <div>${s.nama}</div>
                        <div class="text-xs text-on-surface-variant opacity-70">${s.kelas}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex justify-center items-center gap-4">
                            <label class="flex flex-col items-center gap-1 cursor-pointer">
                                <input type="radio" name="status-${s.siswa_id}" value="Hadir" ${status === 'Hadir' ? 'checked' : ''} class="custom-radio w-5 h-5 text-green-600 border-outline-variant focus:ring-green-500"/>
                                <span class="font-label-sm text-label-sm">Hadir</span>
                            </label>
                            <label class="flex flex-col items-center gap-1 cursor-pointer">
                                <input type="radio" name="status-${s.siswa_id}" value="Sakit" ${status === 'Sakit' ? 'checked' : ''} class="custom-radio w-5 h-5 text-primary border-outline-variant focus:ring-primary"/>
                                <span class="font-label-sm text-label-sm">Sakit</span>
                            </label>
                            <label class="flex flex-col items-center gap-1 cursor-pointer">
                                <input type="radio" name="status-${s.siswa_id}" value="Izin" ${status === 'Izin' ? 'checked' : ''} class="custom-radio w-5 h-5 text-secondary border-outline-variant focus:ring-secondary"/>
                                <span class="font-label-sm text-label-sm">Izin</span>
                            </label>
                            <label class="flex flex-col items-center gap-1 cursor-pointer">
                                <input type="radio" name="status-${s.siswa_id}" value="Alfa" ${status === 'Alfa' ? 'checked' : ''} class="custom-radio w-5 h-5 text-error border-outline-variant focus:ring-error"/>
                                <span class="font-label-sm text-label-sm">Alfa</span>
                            </label>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <input type="text" id="ket-${s.siswa_id}" class="w-full bg-surface-container-low border border-outline-variant rounded px-3 py-1.5 font-body-md text-body-md focus:ring-1 focus:ring-primary outline-none" placeholder="Tambah catatan..." value="${s.keterangan || ''}"/>
                    </td>
                </tr>
            `;
            
            htmlMobile += `
                <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-4 shadow-sm" data-siswa-id="${s.siswa_id}">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-title-md">
                            ${initials}
                        </div>
                        <div>
                            <p class="font-title-md text-title-md text-on-surface">${s.nama}</p>
                            <p class="font-label-md text-label-md text-on-surface-variant">${s.kelas}</p>
                        </div>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex bg-surface-container-low p-1 rounded-lg gap-1 border border-outline-variant w-full justify-between">
                            <input ${status === 'Hadir' ? 'checked' : ''} class="hidden attendance-radio" id="h-${s.siswa_id}" name="status-mob-${s.siswa_id}" value="Hadir" type="radio"/>
                            <label class="w-10 h-10 flex items-center justify-center rounded-md font-bold text-label-md border border-transparent cursor-pointer transition-all hover:bg-surface-variant" for="h-${s.siswa_id}">H</label>
                            <input ${status === 'Sakit' ? 'checked' : ''} class="hidden attendance-radio" id="s-${s.siswa_id}" name="status-mob-${s.siswa_id}" value="Sakit" type="radio"/>
                            <label class="w-10 h-10 flex items-center justify-center rounded-md font-bold text-label-md border border-transparent cursor-pointer transition-all hover:bg-surface-variant" for="s-${s.siswa_id}">S</label>
                            <input ${status === 'Izin' ? 'checked' : ''} class="hidden attendance-radio" id="i-${s.siswa_id}" name="status-mob-${s.siswa_id}" value="Izin" type="radio"/>
                            <label class="w-10 h-10 flex items-center justify-center rounded-md font-bold text-label-md border border-transparent cursor-pointer transition-all hover:bg-surface-variant" for="i-${s.siswa_id}">I</label>
                            <input ${status === 'Alfa' ? 'checked' : ''} class="hidden attendance-radio" id="a-${s.siswa_id}" name="status-mob-${s.siswa_id}" value="Alfa" type="radio"/>
                            <label class="w-10 h-10 flex items-center justify-center rounded-md font-bold text-label-md border border-transparent cursor-pointer transition-all hover:bg-surface-variant" for="a-${s.siswa_id}">A</label>
                        </div>
                    </div>
                </div>
            `;
        });
        if(tbody) tbody.innerHTML = htmlDesktop;
        if(mobileList) mobileList.innerHTML = htmlMobile;
    }
"""

scripts = re.sub(r'function renderSiswaTable\(data\) \{.*?\}\n', new_renderSiswaTable, scripts, flags=re.DOTALL)

# Modify simpanAbsensi to support both DOM structures
new_simpanAbsensi = """
    async function simpanAbsensi() {
        const mapel = document.getElementById('select-mapel-desktop').value || (document.getElementById('select-mapel-mobile') ? document.getElementById('select-mapel-mobile').value : '');
        const tanggal = document.getElementById('input-tanggal-desktop').value || (document.getElementById('input-tanggal-mobile') ? document.getElementById('input-tanggal-mobile').value : '');
        
        let rows = document.querySelectorAll('#input-absensi-tbody tr[data-siswa-id]');
        if(rows.length === 0) {
            rows = document.querySelectorAll('#student-list div[data-siswa-id]');
        }

        if (rows.length === 0) {
            alert('Tidak ada data siswa untuk disimpan.');
            return;
        }

        const btnDesktop = document.getElementById('btn-simpan');
        const btnDesktopFooter = document.getElementById('btn-simpan-footer');
        // Mobile version uses onclick="saveAbsensi()" which we'll map here
        
        try {
            let count = 0;
            for (const row of rows) {
                const siswaId = row.getAttribute('data-siswa-id');
                // check desktop radio
                let checkedRadio = row.querySelector(`input[name="status-${siswaId}"]:checked`);
                // if not found, check mobile radio
                if (!checkedRadio) {
                    checkedRadio = row.querySelector(`input[name="status-mob-${siswaId}"]:checked`);
                }
                
                const ketInput = document.getElementById(`ket-${siswaId}`);

                if (checkedRadio) {
                    const status = checkedRadio.value;
                    const keterangan = ketInput ? ketInput.value : '';
                    await apiPost('setAbsensiStatus', {
                        token: getToken(),
                        siswa_id: siswaId,
                        mapel: mapel,
                        tanggal: tanggal,
                        status: status,
                        keterangan: keterangan
                    });
                    count++;
                }
            }
            alert(`Absensi berhasil disimpan untuk ${count} siswa!`);
            loadStatusHarian();
        } catch (e) {
            alert('Gagal menyimpan absensi: ' + e.message);
        }
    }
    
    function markAllPresentMobile() {
        const hRadios = document.querySelectorAll('#student-list input[value="Hadir"]');
        hRadios.forEach(radio => {
            radio.checked = true;
        });
    }
    
    function saveAbsensi() {
        simpanAbsensi();
    }
"""

scripts = re.sub(r'async function simpanAbsensi\(\) \{.*?\}\n', new_simpanAbsensi, scripts, flags=re.DOTALL)

# Sync select on change
scripts += """
    document.addEventListener('change', function(e) {
        if(e.target.id === 'select-kelas-mobile' || e.target.id === 'select-mapel-mobile' || e.target.id === 'input-tanggal-mobile') {
            loadStatusHarian();
        }
    });
"""

mobile_wrapper = f"""
    <!-- MOBILE VIEW -->
    <div class="block md:hidden w-full pb-24 relative min-h-screen">
        {mobile_body}
    </div>
"""

desktop_wrapper = f"""
    <!-- DESKTOP VIEW -->
    <div class="hidden md:flex w-full">
        {desktop_body_inner}
    </div>
"""

combined_content = mobile_wrapper + "\n" + desktop_wrapper + "\n" + scripts

new_html = desktop_html.replace(desktop_body_match.group(1), combined_content)

# Add CSS rules
mobile_styles = """
    <style>
        .attendance-radio:checked + label {
            background-color: #003d9b;
            color: white;
            border-color: #003d9b;
        }
    </style>
"""
new_html = new_html.replace('</head>', mobile_styles + '</head>')

# Ensure links on mobile bottom nav point to correct HTML files
new_html = new_html.replace(
    '<!-- Beranda - ACTIVE -->\n<div class="flex flex-col',
    '<!-- Beranda - ACTIVE -->\n<div onclick="window.location.href=\'dashboard.html\'" class="flex flex-col'
)
new_html = new_html.replace(
    '<!-- Input Absen -->\n<div class="flex flex-col',
    '<!-- Input Absen -->\n<div onclick="window.location.href=\'input-absensi.html\'" class="flex flex-col'
)
new_html = new_html.replace(
    '<!-- Laporan -->\n<div class="flex flex-col',
    '<!-- Laporan -->\n<div onclick="window.location.href=\'laporan.html\'" class="flex flex-col'
)
new_html = new_html.replace(
    '<!-- Pengaturan -->\n<div class="flex flex-col',
    '<!-- Pengaturan -->\n<div onclick="window.location.href=\'pengaturan.html\'" class="flex flex-col'
)

write_file('input-absensi.html', new_html)
print("input-absensi.html merged successfully.")
