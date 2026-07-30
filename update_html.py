import os
import re

dir_path = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital"

# Regex for tailwind config block
tw_regex = re.compile(r'<script id="tailwind-config">.*?</script>', re.DOTALL)

for file in os.listdir(dir_path):
    if file.endswith(".html"):
        path = os.path.join(dir_path, file)
        with open(path, "r") as f:
            content = f.read()
        
        # We extract the tailwind config if we haven't
        match = tw_regex.search(content)
        if match and not os.path.exists(os.path.join(dir_path, "js", "tailwind-config.js")):
            tw_content = match.group(0).replace('<script id="tailwind-config">', '').replace('</script>', '').strip()
            with open(os.path.join(dir_path, "js", "tailwind-config.js"), "w") as f:
                f.write(tw_content)
        
        # Replace block with link
        content = tw_regex.sub('<script src="js/tailwind-config.js"></script>', content)
        
        with open(path, "w") as f:
            f.write(content)

print("Done updating HTML files.")
