import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

desktop_html = read_file('pengaturan.html')
mobile_html = read_file('/Users/rezakurnianda/Downloads/stitch_sistem_presensi_digital_terpadu/pengaturan_mobile_version/code.html')

# Extract mobile body
mobile_body_match = re.search(r'<body[^>]*>(.*?)</body>', mobile_html, re.DOTALL)
mobile_body = mobile_body_match.group(1)

# Modify mobile text to use actual inputs so they can be saved
# 2023/2024 -> select
mobile_select = """
<select id="tahun-ajaran-select-mobile" class="bg-surface-container border border-outline-variant rounded p-1 text-sm outline-none">
    <option value="2023/2024">2023/2024</option>
    <option value="2024/2025">2024/2025</option>
    <option value="2025/2026">2025/2026</option>
    <option value="2026/2027">2026/2027</option>
</select>
"""
mobile_body = mobile_body.replace('<p class="font-body-md text-body-md text-on-surface-variant">2023/2024</p>', mobile_select)

# 07:30 WIB -> input time
mobile_time = '<input id="batas-waktu-mobile" type="time" class="bg-surface-container border border-outline-variant rounded p-1 text-sm outline-none" value="07:30">'
mobile_body = mobile_body.replace('<p class="font-body-md text-body-md text-on-surface-variant">07:30 WIB</p>', mobile_time)

# Extract desktop body
desktop_body_match = re.search(r'<body[^>]*>(.*?)</body>', desktop_html, re.DOTALL)
desktop_body_inner = desktop_body_match.group(1)

# Ensure desktop has specific IDs
desktop_body_inner = desktop_body_inner.replace('id="tahun-ajaran-select"', 'id="tahun-ajaran-select-desktop"')
desktop_body_inner = desktop_body_inner.replace('<input class="flex-1 bg-surface-container', '<input id="batas-waktu-desktop" class="flex-1 bg-surface-container')

# Move the action-footer outside the desktop container so it works for mobile too.
# But action-footer is inside main. I'll just extract action-footer, remove it from desktop, and place it outside.
footer_match = re.search(r'<div id="action-footer".*?</div>\s*</div>', desktop_body_inner, re.DOTALL)
footer_html = ""
if footer_match:
    # Just extract the div, not the closing outer div
    f_match = re.search(r'<div id="action-footer".*?Simpan Perubahan\s*</button>\s*</div>\s*</div>', desktop_body_inner, re.DOTALL)
    if f_match:
        footer_html = f_match.group(0)
        desktop_body_inner = desktop_body_inner.replace(f_match.group(0), "")

# Extract JS and Toast
js_match = re.search(r'(<!-- Success Toast.*?)</script>\s*$', desktop_body_inner, re.DOTALL)
scripts = ""
if js_match:
    scripts = js_match.group(1) + "</script>"
    desktop_body_inner = desktop_body_inner.replace(js_match.group(0), "")

# Update JS to use desktop and mobile IDs
scripts = scripts.replace("const selTahun = document.getElementById('tahun-ajaran-select') || document.querySelector('select');", "const selTahun = document.getElementById('tahun-ajaran-select-desktop') || document.getElementById('tahun-ajaran-select-mobile') || document.querySelector('select');")
scripts = scripts.replace("const inputTime = document.querySelector('input[type=\"time\"]');", "const inputTime = document.getElementById('batas-waktu-desktop') || document.getElementById('batas-waktu-mobile') || document.querySelector('input[type=\"time\"]');")

scripts = scripts.replace("if (selTahun) selTahun.value = res.data.tahun_ajaran;", """
if (res.data.tahun_ajaran) {
    const sD = document.getElementById('tahun-ajaran-select-desktop');
    const sM = document.getElementById('tahun-ajaran-select-mobile');
    if(sD) sD.value = res.data.tahun_ajaran;
    if(sM) sM.value = res.data.tahun_ajaran;
}
""")
scripts = scripts.replace("if (inputTime) inputTime.value = res.data.batas_waktu_input;", """
if (res.data.batas_waktu_input) {
    const tD = document.getElementById('batas-waktu-desktop');
    const tM = document.getElementById('batas-waktu-mobile');
    if(tD) tD.value = res.data.batas_waktu_input;
    if(tM) tM.value = res.data.batas_waktu_input;
}
""")


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

combined_content = mobile_wrapper + "\n" + desktop_wrapper + "\n" + footer_html + "\n" + scripts

new_html = desktop_html.replace(desktop_body_match.group(1), combined_content)

# Fix links
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:bg-surface-container px-4 py-2 transition-all" href="#">\n<span class="material-symbols-outlined">dashboard</span>',
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:bg-surface-container px-4 py-2 transition-all" href="dashboard.html">\n<span class="material-symbols-outlined">dashboard</span>'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:bg-surface-container px-4 py-2 transition-all" href="#">\n<span class="material-symbols-outlined">how_to_reg</span>',
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:bg-surface-container px-4 py-2 transition-all" href="input-absensi.html">\n<span class="material-symbols-outlined">how_to_reg</span>'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:bg-surface-container px-4 py-2 transition-all" href="#">\n<span class="material-symbols-outlined">description</span>',
    '<a class="flex flex-col items-center gap-1 text-on-surface-variant hover:bg-surface-container px-4 py-2 transition-all" href="laporan.html">\n<span class="material-symbols-outlined">description</span>'
)
new_html = new_html.replace(
    '<a class="flex flex-col items-center gap-1 bg-primary-container text-on-primary-container rounded-lg px-4 py-2 border-b-4 border-primary" href="#">\n<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">settings</span>',
    '<a class="flex flex-col items-center gap-1 bg-primary-container text-on-primary-container rounded-lg px-4 py-2 border-b-4 border-primary" href="pengaturan.html">\n<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">settings</span>'
)

# Add CSS for mobile toggle
mobile_styles = """
    <style>
        .toggle-checkbox:checked { right: 0; border-color: #003d9b; }
        .toggle-checkbox:checked + .toggle-label { background-color: #003d9b; }
    </style>
"""
new_html = new_html.replace('</head>', mobile_styles + '</head>')


write_file('pengaturan.html', new_html)
print("pengaturan.html merged successfully.")
