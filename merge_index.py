import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

desktop_html = read_file('index.html')
mobile_html = read_file('/Users/rezakurnianda/Downloads/stitch_sistem_presensi_digital_terpadu/login_mobile_version/code.html')

# Extract mobile body content
mobile_body_match = re.search(r'<body[^>]*>(.*?)</body>', mobile_html, re.DOTALL)
if not mobile_body_match:
    print("Could not find mobile body")
    exit(1)
mobile_body = mobile_body_match.group(1)

# Remove the micro-interactions script from mobile as we use the main JS
mobile_body = re.sub(r'<!-- Micro-interactions Script -->.*?<\/script>', '', mobile_body, flags=re.DOTALL)

# Wrap mobile in block md:hidden
mobile_wrapper = f"""
    <!-- MOBILE VIEW -->
    <div class="block md:hidden min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden login-gradient relative">
        {mobile_body}
    </div>
"""

# Extract desktop main/header/footer content (everything before modals)
# In index.html, main is from <main> to </main>
desktop_main_match = re.search(r'<main.*?</main>', desktop_html, re.DOTALL)
desktop_main = desktop_main_match.group(0) if desktop_main_match else ""

# Modify desktop main to hide on mobile
desktop_main = desktop_main.replace('<main class="', '<main class="hidden md:flex ')
if '<main class="' not in desktop_main:
    # it was probably flex-grow flex ... without class="...
    pass # we can assume tailwind is there

# We need to replace the desktop main with the combined mobile + desktop
combined_content = mobile_wrapper + "\n    " + desktop_main

# Replace the original desktop <main> with the combined content
new_html = desktop_html.replace(desktop_main_match.group(0), combined_content)

# Add mobile styles to head
mobile_styles = """
    <style>
        .login-gradient { background: radial-gradient(circle at top right, #cee5ff 0%, #003d9b 100%); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.6s ease-out forwards; }
    </style>
"""
new_html = new_html.replace('</head>', mobile_styles + '</head>')

# Ensure mobile login button triggers openGoogleModal()
new_html = re.sub(r'(<button class="w-full flex items-center justify-center gap-3 bg-surface-container-lowest.*?>)',
                  r'\1 onclick="openGoogleModal()"', new_html)

write_file('index.html', new_html)
print("index.html merged successfully.")
