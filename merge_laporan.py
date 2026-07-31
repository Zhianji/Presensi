import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

desktop_html = read_file('laporan.html')
mobile_html = read_file('/Users/rezakurnianda/Downloads/stitch_sistem_presensi_digital_terpadu/laporan_mobile_version/code.html')

# Extract mobile body
mobile_body_match = re.search(r'<body[^>]*>(.*?)</body>', mobile_html, re.DOTALL)
mobile_body = mobile_body_match.group(1)

# Modify mobile filter section
mobile_filter_section = """
<!-- Filter Section: Bento Style -->
<section class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
    <div class="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant flex flex-col gap-3">
        <div class="flex items-center gap-2 text-primary">
            <span class="material-symbols-outlined">calendar_today</span>
            <span class="font-title-md text-title-md">Periode</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <select id="filter-bulan-mobile" onchange="syncFilterMobile()" class="bg-surface border-outline-variant rounded-lg p-2 text-label-md font-label-md focus:ring-primary focus:border-primary">
                <option value="1">Januari</option>
                <option value="2">Februari</option>
                <option value="3">Maret</option>
                <option value="4">April</option>
                <option value="5">Mei</option>
                <option value="6">Juni</option>
                <option value="7">Juli</option>
                <option value="8">Agustus</option>
                <option value="9">September</option>
                <option value="10">Oktober</option>
                <option value="11">November</option>
                <option value="12">Desember</option>
            </select>
            <select id="filter-tahun-mobile" onchange="syncFilterMobile()" class="bg-surface border-outline-variant rounded-lg p-2 text-label-md font-label-md focus:ring-primary focus:border-primary">
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
            </select>
        </div>
    </div>
    <div class="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant flex flex-col gap-3">
        <div class="flex items-center gap-2 text-primary">
            <span class="material-symbols-outlined">school</span>
            <span class="font-title-md text-title-md">Filter Kelas</span>
        </div>
        <select id="filter-kelas-mobile" onchange="syncFilterMobile()" class="w-full bg-surface border-outline-variant rounded-lg p-2 text-label-md font-label-md focus:ring-primary focus:border-primary">
            <option value="">Semua Kelas</option>
            <option value="XII IPA 1">XII IPA 1</option>
            <option value="XII IPA 2">XII IPA 2</option>
            <option value="XI IPS 1">XI IPS 1</option>
            <option value="X-1">X-1</option>
        </select>
    </div>
</section>
"""

mobile_body = re.sub(r'<!-- Filter Section: Bento Style -->.*?<!-- Key Metric Card: Large Display -->', mobile_filter_section + '\n<!-- Key Metric Card: Large Display -->', mobile_body, flags=re.DOTALL)

# Empty mobile list and add ID
mobile_body = re.sub(r'(<div class="space-y-3">).*?(<button class="w-full py-3 text-primary)', r'\1\n<div id="laporan-mobile-list" class="space-y-3"></div>\n</div>\n\2', mobile_body, flags=re.DOTALL)

# Add IDs to mobile stats for dynamic updates
mobile_body = mobile_body.replace('<span class="font-display-lg text-display-lg">94.8%</span>', '<span id="avg-persen-mobile" class="font-display-lg text-display-lg">0%</span>')
mobile_body = mobile_body.replace('<p class="font-body-md text-body-md mt-2 opacity-90">Berdasarkan data dari 32 siswa selama bulan Oktober.</p>', '<p id="total-siswa-mobile" class="font-body-md text-body-md mt-2 opacity-90">Berdasarkan data dari 0 siswa.</p>')

# Add onclick to export CSV on mobile
mobile_body = mobile_body.replace('<button class="flex-1 bg-white border-2 border-primary', '<button onclick="exportToCSV()" class="flex-1 bg-white border-2 border-primary')

# Extract desktop body
desktop_body_match = re.search(r'<body[^>]*>(.*?)</body>', desktop_html, re.DOTALL)
desktop_body_inner = desktop_body_match.group(1)

# Ensure desktop filters have ID -desktop
desktop_body_inner = desktop_body_inner.replace('id="filter-bulan"', 'id="filter-bulan-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="filter-tahun"', 'id="filter-tahun-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="filter-kelas"', 'id="filter-kelas-desktop"')

# Ensure desktop stats have ID -desktop
desktop_body_inner = desktop_body_inner.replace('id="avg-persen-text"', 'id="avg-persen-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="total-siswa-stat"', 'id="total-siswa-desktop"')

# Extract and process JS
js_match = re.search(r'(<script src="js/config.js"></script>.*?)</script>\s*$', desktop_body_inner, re.DOTALL)
scripts = js_match.group(1) + "</script>" if js_match else ""
if js_match:
    desktop_body_inner = desktop_body_inner.replace(js_match.group(0), "")

# Fix JS IDs
scripts = scripts.replace("document.getElementById('filter-bulan').value", "document.getElementById('filter-bulan-desktop').value")
scripts = scripts.replace("document.getElementById('filter-tahun').value", "document.getElementById('filter-tahun-desktop').value")
scripts = scripts.replace("document.getElementById('filter-kelas').value", "document.getElementById('filter-kelas-desktop').value")

# Init script needs to set mobile as well
scripts = scripts.replace("document.getElementById('filter-bulan-desktop').value = String(now.getMonth() + 1);", """
    const m = String(now.getMonth() + 1);
    const mDesktop = document.getElementById('filter-bulan-desktop');
    const mMobile = document.getElementById('filter-bulan-mobile');
    if(mDesktop) mDesktop.value = m;
    if(mMobile) mMobile.value = m;
""")
scripts = scripts.replace("document.getElementById('filter-tahun-desktop').value = String(now.getFullYear());", """
    const y = String(now.getFullYear());
    const yDesktop = document.getElementById('filter-tahun-desktop');
    const yMobile = document.getElementById('filter-tahun-mobile');
    if(yDesktop) yDesktop.value = y;
    if(yMobile) yMobile.value = y;
""")

# loadLaporanData
scripts = scripts.replace("document.getElementById('avg-persen-text').textContent = (res.ringkasan.rata_rata || 0) + '%';", """
    const avg = (res.ringkasan.rata_rata || 0) + '%';
    const aDesktop = document.getElementById('avg-persen-desktop');
    const aMobile = document.getElementById('avg-persen-mobile');
    if(aDesktop) aDesktop.textContent = avg;
    if(aMobile) aMobile.textContent = avg;
""")
scripts = scripts.replace("document.getElementById('total-siswa-stat').textContent = res.ringkasan.total_siswa || 0;", """
    const tot = res.ringkasan.total_siswa || 0;
    const tDesktop = document.getElementById('total-siswa-desktop');
    const tMobile = document.getElementById('total-siswa-mobile');
    if(tDesktop) tDesktop.textContent = tot;
    if(tMobile) tMobile.textContent = `Berdasarkan data dari ${tot} siswa.`;
""")

# sync filter
scripts += """
    function syncFilterMobile() {
        const b = document.getElementById('filter-bulan-mobile').value;
        const t = document.getElementById('filter-tahun-mobile').value;
        const k = document.getElementById('filter-kelas-mobile').value;
        
        const bD = document.getElementById('filter-bulan-desktop');
        const tD = document.getElementById('filter-tahun-desktop');
        const kD = document.getElementById('filter-kelas-desktop');
        
        if(bD) bD.value = b;
        if(tD) tD.value = t;
        if(kD) kD.value = k;
        
        loadLaporanData();
    }
"""

# Update renderLaporanTable
new_renderLaporanTable = """
    function renderLaporanTable(data) {
        const tbody = document.getElementById('laporan-tbody');
        const mobileList = document.getElementById('laporan-mobile-list');
        const countInfo = document.getElementById('laporan-count-info');
        
        if(countInfo) countInfo.textContent = `Menampilkan ${data.length} siswa`;

        if (!data || data.length === 0) {
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-on-surface-variant">Tidak ada data rekapitulasi untuk periode ini.</td></tr>`;
            if(mobileList) mobileList.innerHTML = `<div class="text-center p-4">Tidak ada data rekapitulasi</div>`;
            return;
        }

        let htmlDesktop = '';
        let htmlMobile = '';
        
        data.forEach(s => {
            const initials = s.nama ? s.nama.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase() : 'SI';
            
            let totalHadir = 0, totalIzinSakit = 0, totalAlfa = 0;
            if (s.per_mapel) {
                Object.values(s.per_mapel).forEach(m => {
                    totalHadir += m.hadir || 0;
                    totalIzinSakit += (m.izin || 0) + (m.sakit || 0);
                    totalAlfa += m.alfa || 0;
                });
            } else {
                totalHadir = s.total_hadir || 0;
            }

            const persen = s.persen_total || 0;
            let catBadgeD = `<span class="px-3 py-1 bg-green-100 text-green-700 rounded-full font-label-sm text-label-sm">Sangat Baik</span>`;
            let catBadgeM = `<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 rounded">SEMPURNA</span>`;
            
            let nameColorM = "text-on-surface";
            let borderM = "border-outline-variant";
            let valColorM = "text-primary";
            
            if (persen < 75) {
                catBadgeD = `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full font-label-sm text-label-sm">Perhatian</span>`;
                catBadgeM = `<span class="text-[10px] font-bold text-error bg-error-container px-2 rounded uppercase">Peringatan</span>`;
                borderM = "border-error-container";
                valColorM = "text-error";
            } else if (persen < 90) {
                catBadgeD = `<span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full font-label-sm text-label-sm">Cukup</span>`;
                catBadgeM = `<span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 rounded">BAIK</span>`;
            }

            htmlDesktop += `
                <tr class="hover:bg-surface-container transition-colors">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs">${initials}</div>
                            <span class="font-title-md text-on-surface">${s.nama}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 font-body-md text-on-surface-variant">${s.kelas || '-'}</td>
                    <td class="px-6 py-4 text-center font-body-md text-on-surface">${totalHadir}</td>
                    <td class="px-6 py-4 text-center font-body-md text-on-surface">${totalIzinSakit}</td>
                    <td class="px-6 py-4 text-center font-body-md text-on-surface">${totalAlfa}</td>
                    <td class="px-6 py-4 text-right font-title-md text-primary font-bold">${persen}%</td>
                    <td class="px-6 py-4">${catBadgeD}</td>
                </tr>
            `;
            
            htmlMobile += `
                <div class="bg-white border ${borderM} p-4 rounded-xl flex items-center gap-4 shadow-sm">
                    <div class="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold">${initials}</div>
                    <div class="flex-1">
                        <h4 class="font-title-md text-title-md ${nameColorM}">${s.nama || '-'}</h4>
                        <p class="font-label-md text-label-md text-on-surface-variant">${s.kelas || '-'}</p>
                    </div>
                    <div class="text-right">
                        <div class="font-display-md text-display-md ${valColorM}">${persen}%</div>
                        ${catBadgeM}
                    </div>
                </div>
            `;
        });
        
        if(tbody) tbody.innerHTML = htmlDesktop;
        if(mobileList) mobileList.innerHTML = htmlMobile;
    }
"""
scripts = re.sub(r'function renderLaporanTable\(data\) \{.*?\}\n(?=\s*function exportToCSV)', new_renderLaporanTable, scripts, flags=re.DOTALL)

# Add CSV Export fix for mobile filter
scripts = scripts.replace(
    "document.getElementById('filter-bulan').value", 
    "document.getElementById('filter-bulan-desktop').value"
)
scripts = scripts.replace(
    "document.getElementById('filter-tahun').value", 
    "document.getElementById('filter-tahun-desktop').value"
)


mobile_wrapper = f"""
    <!-- MOBILE VIEW -->
    <div class="block md:hidden w-full pb-24 relative min-h-screen">
        {mobile_body}
    </div>
"""

desktop_wrapper = f"""
    <!-- DESKTOP VIEW -->
    <div class="hidden md:flex w-full h-screen">
        {desktop_body_inner}
    </div>
"""

combined_content = mobile_wrapper + "\n" + desktop_wrapper + "\n" + scripts

new_html = desktop_html.replace(desktop_body_match.group(1), combined_content)

# Fix bottom nav links for mobile
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 p-2 text-on-surface-variant" href="#">\n<span class="material-symbols-outlined">dashboard</span>',
    '<a class="flex flex-col items-center gap-1 p-2 text-on-surface-variant" href="dashboard.html">\n<span class="material-symbols-outlined">dashboard</span>'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 p-2 text-on-surface-variant" href="#">\n<span class="material-symbols-outlined">how_to_reg</span>',
    '<a class="flex flex-col items-center gap-1 p-2 text-on-surface-variant" href="input-absensi.html">\n<span class="material-symbols-outlined">how_to_reg</span>'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 p-2 bg-primary-container text-on-primary-container rounded-xl px-4 scale-105 transition-all" href="#">\n<span class="material-symbols-outlined"',
    '<a class="flex flex-col items-center gap-1 p-2 bg-primary-container text-on-primary-container rounded-xl px-4 scale-105 transition-all" href="laporan.html">\n<span class="material-symbols-outlined"'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 p-2 text-on-surface-variant" href="#">\n<span class="material-symbols-outlined">settings</span>',
    '<a class="flex flex-col items-center gap-1 p-2 text-on-surface-variant" href="pengaturan.html">\n<span class="material-symbols-outlined">settings</span>'
)

write_file('laporan.html', new_html)
print("laporan.html merged successfully.")
