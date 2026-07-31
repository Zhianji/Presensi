import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

desktop_html = read_file('master-data.html')
mobile_html = read_file('/Users/rezakurnianda/Downloads/stitch_sistem_presensi_digital_terpadu/master_data_mobile_version/code.html')

# Extract mobile body
mobile_body_match = re.search(r'<body[^>]*>(.*?)</body>', mobile_html, re.DOTALL)
mobile_body = mobile_body_match.group(1)

# Empty mobile list and add ID
mobile_body = re.sub(r'(<!-- Student List -->\n<div class="px-gutter space-y-3 mt-4")[^>]*>(.*?)(<!-- Stats Summary Sticky Bar -->)', r'\1 id="master-siswa-mobile-list">\n</div>\n\3', mobile_body, flags=re.DOTALL)

# Add ID to search mobile
mobile_body = mobile_body.replace('placeholder="Cari nama atau NISN..." type="text"', 'id="search-siswa-mobile" oninput="syncSearchMobile()" placeholder="Cari nama atau NISN..." type="text"')

# Add class to mobile filter buttons to make them selectable via JS if needed, but since they are hardcoded "Semua Kelas", "Kelas X", etc, I will just let the desktop filter logic handle it and perhaps hide mobile filter buttons if they are too complex to map.
# Or better, we can replace the mobile filter buttons with a native <select> styled nicely so it works just like desktop!
# Let's replace the mobile horizontal scrolling filter buttons with a select dropdown, or just add ID to them so JS can update.
# I'll just change the mobile filter to a native select to match functionality easily.
mobile_filter_html = """
<div class="mt-4 px-1">
    <select id="filter-kelas-mobile" onchange="syncFilterMobile()" class="w-full bg-surface-container-low border-outline-variant rounded-lg px-4 py-3 font-body-md text-body-md focus:ring-primary focus:border-primary">
        <option value="">Semua Kelas</option>
    </select>
</div>
"""
mobile_body = re.sub(r'<div class="flex gap-2 mt-4 overflow-x-auto no-scrollbar pb-2">.*?</div>', mobile_filter_html, mobile_body, flags=re.DOTALL)

# Also wire the FAB for adding new student
mobile_body = mobile_body.replace('<button class="fixed right-6 bottom-36', '<button onclick="openSiswaModal()" class="fixed right-6 bottom-36')

# Extract desktop body
desktop_body_match = re.search(r'<body[^>]*>(.*?)</body>', desktop_html, re.DOTALL)
desktop_body_inner = desktop_body_match.group(1)

# Ensure desktop search has ID search-siswa-desktop
desktop_body_inner = desktop_body_inner.replace('id="search-siswa"', 'id="search-siswa-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="filter-kelas"', 'id="filter-kelas-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="filter-status"', 'id="filter-status-desktop"')

# JS Changes
js_match = re.search(r'(<script src="js/config.js"></script>.*?)</script>\s*$', desktop_body_inner, re.DOTALL)
scripts = js_match.group(1) + "</script>" if js_match else ""

if js_match:
    desktop_body_inner = desktop_body_inner.replace(js_match.group(0), "")

# Update populateKelasFilter
new_populateKelasFilter = """
    function populateKelasFilter(data) {
        const kelasSelectD = document.getElementById('filter-kelas-desktop');
        const kelasSelectM = document.getElementById('filter-kelas-mobile');
        const classes = [...new Set(data.map(s => s.kelas).filter(Boolean))].sort();
        let options = `<option value="">Semua Kelas</option>`;
        classes.forEach(c => {
            options += `<option value="${c}">${c}</option>`;
        });
        if(kelasSelectD) kelasSelectD.innerHTML = options;
        if(kelasSelectM) kelasSelectM.innerHTML = options;
    }
"""
scripts = re.sub(r'function populateKelasFilter\(data\) \{.*?\}\n', new_populateKelasFilter, scripts, flags=re.DOTALL)

# Add sync logic
scripts += """
    function syncSearchMobile() {
        const v = document.getElementById('search-siswa-mobile').value;
        const d = document.getElementById('search-siswa-desktop');
        if(d) d.value = v;
        filterSiswaTable();
    }
    function syncFilterMobile() {
        const v = document.getElementById('filter-kelas-mobile').value;
        const d = document.getElementById('filter-kelas-desktop');
        if(d) d.value = v;
        filterSiswaTable();
    }
"""

# Update filterSiswaTable
scripts = scripts.replace("document.getElementById('search-siswa').value", "document.getElementById('search-siswa-desktop').value")
scripts = scripts.replace("document.getElementById('filter-kelas').value", "document.getElementById('filter-kelas-desktop').value")
scripts = scripts.replace("document.getElementById('filter-status').value", "document.getElementById('filter-status-desktop').value")

# Update renderSiswaTable
new_renderSiswaTable = """
    function renderSiswaTable(data) {
        const tbody = document.getElementById('master-siswa-tbody');
        const mobileList = document.getElementById('master-siswa-mobile-list');
        
        const countText = `Menampilkan ${data.length} dari ${allSiswa.length} Siswa`;
        const c1 = document.getElementById('siswa-count-info');
        if(c1) c1.textContent = countText;
        
        const cbAll = document.getElementById('checkbox-all');
        if(cbAll) cbAll.checked = false;
        if (typeof updateCheckboxState === 'function') updateCheckboxState();

        if (data.length === 0) {
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-on-surface-variant">Tidak ada siswa yang cocok dengan filter.</td></tr>`;
            if(mobileList) mobileList.innerHTML = `<div class="text-center p-4">Tidak ada data siswa</div>`;
            
            // update mobile sticky stats to 0
            updateMobileStats(0, 0, 0);
            return;
        }

        let htmlDesktop = '';
        let htmlMobile = '';
        let aktifCount = 0;
        let nonaktifCount = 0;
        
        data.forEach(s => {
            const initials = s.nama ? s.nama.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase() : 'SI';
            const isAktif = String(s.status_aktif).toLowerCase() === 'aktif';
            if(isAktif) aktifCount++; else nonaktifCount++;
            
            const badgeD = isAktif 
                ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><span class="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>Aktif</span>`
                : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-variant text-on-surface-variant"><span class="w-1.5 h-1.5 rounded-full bg-outline mr-1.5"></span>Nonaktif</span>`;
                
            const badgeM = isAktif
                ? `<span class="px-2 py-1 bg-green-100 text-green-700 rounded-md text-label-sm uppercase tracking-wider">Aktif</span>`
                : `<span class="px-2 py-1 bg-surface-variant text-on-surface-variant rounded-md text-label-sm uppercase tracking-wider">Nonaktif</span>`;
            
            const avatarClassM = isAktif ? "bg-secondary-container text-primary" : "bg-surface-variant text-outline";
            const nameClassM = isAktif ? "text-on-surface" : "text-on-surface opacity-70";
            
            const safeNama = s.nama ? s.nama.replace(/'/g, "\\'") : '';

            htmlDesktop += `
                <tr class="hover:bg-surface-container-high/30 transition-colors">
                    <td class="px-6 py-4 text-center">
                        <input type="checkbox" class="siswa-checkbox w-4 h-4 text-primary bg-background border-outline-variant rounded focus:ring-primary focus:ring-2 cursor-pointer" value="${s.id}" onchange="updateCheckboxState()">
                    </td>
                    <td class="px-6 py-4 font-body-md text-on-surface">${s.nis || '-'}</td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs">${initials}</div>
                            <div>
                                <div class="font-title-md text-on-surface">${s.nama || '-'}</div>
                                <div class="text-xs text-on-surface-variant">${s.email || ''}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 font-body-md text-on-surface">${s.kelas || '-'}</td>
                    <td class="px-6 py-4 font-body-md text-on-surface">${s.wali_murid || '-'}</td>
                    <td class="px-6 py-4">${badgeD}</td>
                    <td class="px-6 py-4">
                        <div class="flex justify-center gap-2">
                            <button onclick="editSiswa('${s.id}')" class="p-2 text-primary hover:bg-primary-container/20 rounded-lg transition-all" title="Edit">
                                <span class="material-symbols-outlined text-xl">edit</span>
                            </button>
                            <button onclick="deleteSiswaConfirm('${s.id}', '${safeNama}')" class="p-2 text-error hover:bg-error-container/20 rounded-lg transition-all" title="Hapus">
                                <span class="material-symbols-outlined text-xl">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            
            htmlMobile += `
                <div class="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant transition-all">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-lg ${avatarClassM} flex items-center justify-center font-bold">
                                ${initials}
                            </div>
                            <div>
                                <p class="font-title-md ${nameClassM}">${s.nama || '-'}</p>
                                <p class="font-label-md text-on-surface-variant">NISN: ${s.nis || '-'} | ${s.kelas || '-'}</p>
                            </div>
                        </div>
                        <div class="flex gap-1">
                            <button onclick="editSiswa('${s.id}')" class="p-2 text-primary hover:bg-primary-container rounded-lg transition-colors">
                                <span class="material-symbols-outlined" data-icon="edit">edit</span>
                            </button>
                            <button onclick="deleteSiswaConfirm('${s.id}', '${safeNama}')" class="p-2 text-error hover:bg-error-container rounded-lg transition-colors">
                                <span class="material-symbols-outlined" data-icon="delete">delete</span>
                            </button>
                        </div>
                    </div>
                    <div class="mt-3 flex items-center justify-between pt-3 border-t border-outline-variant">
                        ${badgeM}
                    </div>
                </div>
            `;
        });
        
        if(tbody) tbody.innerHTML = htmlDesktop;
        if(mobileList) mobileList.innerHTML = htmlMobile;
        
        updateMobileStats(data.length, aktifCount, nonaktifCount);
    }
    
    function updateMobileStats(total, aktif, nonaktif) {
        // Find elements inside sticky bar
        const stickyBar = document.querySelector('.fixed.bottom-16');
        if(stickyBar) {
            const vals = stickyBar.querySelectorAll('.text-title-lg.font-bold');
            if(vals.length >= 3) {
                vals[0].textContent = total;
                vals[1].textContent = aktif;
                vals[2].textContent = nonaktif;
            }
        }
    }
"""

scripts = re.sub(r'function renderSiswaTable\(data\) \{.*?\}\n(?=\s*function openSiswaModal)', new_renderSiswaTable, scripts, flags=re.DOTALL)

mobile_wrapper = f"""
    <!-- MOBILE VIEW -->
    <div class="block md:hidden w-full pb-24 relative min-h-screen">
        {mobile_body}
    </div>
"""

desktop_wrapper = f"""
    <!-- DESKTOP VIEW -->
    <div class="hidden md:flex w-full min-h-screen flex-col">
        {desktop_body_inner}
    </div>
"""

combined_content = mobile_wrapper + "\n" + desktop_wrapper + "\n" + scripts

new_html = desktop_html.replace(desktop_body_match.group(1), combined_content)

# Fix links
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="#">\n<span class="material-symbols-outlined" data-icon="dashboard">',
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="dashboard.html">\n<span class="material-symbols-outlined" data-icon="dashboard">'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="#">\n<span class="material-symbols-outlined" data-icon="how_to_reg">',
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="input-absensi.html">\n<span class="material-symbols-outlined" data-icon="how_to_reg">'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="#">\n<span class="material-symbols-outlined" data-icon="description">',
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="laporan.html">\n<span class="material-symbols-outlined" data-icon="description">'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="#">\n<span class="material-symbols-outlined" data-icon="settings">',
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors" href="pengaturan.html">\n<span class="material-symbols-outlined" data-icon="settings">'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-primary font-bold" href="#">\n<span class="material-symbols-outlined font-bold" data-icon="database"',
    '<a class="flex flex-col items-center gap-1 text-primary font-bold" href="master-data.html">\n<span class="material-symbols-outlined font-bold" data-icon="database"'
)

write_file('master-data.html', new_html)
print("master-data.html merged successfully.")
