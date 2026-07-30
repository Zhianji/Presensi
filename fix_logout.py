import os
import re

dir_path = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital"

# 1. Add handleLogout to config.js if not present
config_path = os.path.join(dir_path, "js", "config.js")
with open(config_path, "r") as f:
    config_code = f.read()

if "function handleLogout()" not in config_code:
    config_code += """

function handleLogout() {
  const token = getToken();
  if (token) {
    apiPost('logout', { token }).catch(() => {});
  }
  clearSession();
  window.location.href = 'index.html';
}
"""
    with open(config_path, "w") as f:
        f.write(config_code)
    print("Added handleLogout to config.js")

# 2. Add onclick="handleLogout()" to all Keluar buttons in HTML files
for filename in os.listdir(dir_path):
    if filename.endswith(".html"):
        filepath = os.path.join(dir_path, filename)
        with open(filepath, "r") as f:
            content = f.read()
        
        # Replace button with Keluar text to include onclick="handleLogout()"
        # Match <button ...> ... Keluar ... </button>
        def replace_button(match):
            btn_tag = match.group(1)
            btn_inner = match.group(2)
            if 'onclick=' not in btn_tag:
                btn_tag = btn_tag.rstrip('>') + ' onclick="handleLogout()">'
            return f"{btn_tag}{btn_inner}</button>"

        new_content = re.sub(
            r'(<button[^>]*>)([\s\S]*?Keluar[\s\S]*?)</button>',
            replace_button,
            content,
            flags=re.IGNORECASE
        )
        
        if new_content != content:
            with open(filepath, "w") as f:
                f.write(new_content)
            print(f"Updated logout button in {filename}")

