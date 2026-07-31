import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

desktop_html = read_file('dashboard.html')
mobile_html = read_file('/Users/rezakurnianda/Downloads/stitch_sistem_presensi_digital_terpadu/dashboard_mobile_version/code.html')

# Extract mobile body
mobile_body_match = re.search(r'<body[^>]*>(.*?)</body>', mobile_html, re.DOTALL)
mobile_body = mobile_body_match.group(1)

# Extract desktop body
desktop_body_match = re.search(r'<body[^>]*>(.*?)</body>', desktop_html, re.DOTALL)
desktop_body_inner = desktop_body_match.group(1)

# In mobile body, we need to add IDs to the stat cards so we can update them dynamically.
# Mobile "Hadir" stat
mobile_body = mobile_body.replace('<p class="font-display-md text-display-md text-primary">1,248</p>', '<p id="stat-hadir-mobile" class="font-display-md text-display-md text-primary">0</p>')
# Mobile "Sakit" stat
mobile_body = mobile_body.replace('<p class="font-display-md text-display-md text-on-surface">12</p>', '<p id="stat-sakit-mobile" class="font-display-md text-display-md text-on-surface">0</p>')
# Mobile "Izin" stat
mobile_body = mobile_body.replace('<p class="font-display-md text-display-md text-on-surface">24</p>', '<p id="stat-izin-mobile" class="font-display-md text-display-md text-on-surface">0</p>')
# Mobile "Alpa" stat
mobile_body = mobile_body.replace('<p class="font-display-md text-display-md text-error">8</p>', '<p id="stat-alfa-mobile" class="font-display-md text-display-md text-error">0</p>')

# In desktop body, we need to rename IDs
desktop_body_inner = desktop_body_inner.replace('id="stat-hadir"', 'id="stat-hadir-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="stat-sakit"', 'id="stat-sakit-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="stat-izin"', 'id="stat-izin-desktop"')
desktop_body_inner = desktop_body_inner.replace('id="stat-alfa"', 'id="stat-alfa-desktop"')

# Now we need to update the JS in the desktop body
# original JS:
js_orig = """
            const statHadir = document.getElementById('stat-hadir');
            if (statHadir) statHadir.innerText = hadir;
            const statSakit = document.getElementById('stat-sakit');
            if (statSakit) statSakit.innerText = sakit;
            const statIzin = document.getElementById('stat-izin');
            if (statIzin) statIzin.innerText = izin;
            const statAlfa = document.getElementById('stat-alfa');
            if (statAlfa) statAlfa.innerText = alfa;
"""

js_new = """
            ['desktop', 'mobile'].forEach(view => {
                const elHadir = document.getElementById(`stat-hadir-${view}`);
                if(elHadir) elHadir.innerText = hadir;
                const elSakit = document.getElementById(`stat-sakit-${view}`);
                if(elSakit) elSakit.innerText = sakit;
                const elIzin = document.getElementById(`stat-izin-${view}`);
                if(elIzin) elIzin.innerText = izin;
                const elAlfa = document.getElementById(`stat-alfa-${view}`);
                if(elAlfa) elAlfa.innerText = alfa;
            });
"""

# Try to replace JS - we need to be careful with exact string matching
# We can use regex to replace the JS block
desktop_body_inner = re.sub(r'const statHadir = document\.getElementById\(\'stat-hadir\'\);.*?if \(statAlfa\) statAlfa\.innerText = alfa;', js_new, desktop_body_inner, flags=re.DOTALL)

# Also extract the <script> tags from desktop_body_inner and separate them from DOM
scripts_match = re.search(r'(<script src="js/config.js"></script>.*?)</script>\s*$', desktop_body_inner, re.DOTALL)
scripts = scripts_match.group(1) + "</script>" if scripts_match else ""

# Remove scripts from desktop_body_inner
if scripts_match:
    desktop_body_inner = desktop_body_inner.replace(scripts_match.group(0), "")

# Wrap mobile in block md:hidden
mobile_wrapper = f"""
    <!-- MOBILE VIEW -->
    <div class="block md:hidden w-full pb-24">
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

# Put combined content back into the full HTML
new_html = desktop_html.replace(desktop_body_match.group(1), combined_content)

# Add mobile styles to head
mobile_styles = """
    <style>
        .bento-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
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

# And replace quick actions links
new_html = new_html.replace('Input Absen\n            </button>', 'Input Absen\n            </button>').replace(
    '<button class="flex items-center justify-center gap-3 bg-primary text-white',
    '<button onclick="window.location.href=\'input-absensi.html\'" class="flex items-center justify-center gap-3 bg-primary text-white'
)
new_html = new_html.replace(
    '<button class="flex items-center justify-center gap-3 border-2 border-primary',
    '<button onclick="window.location.href=\'laporan.html\'" class="flex items-center justify-center gap-3 border-2 border-primary'
)

write_file('dashboard.html', new_html)
print("dashboard.html merged successfully.")
