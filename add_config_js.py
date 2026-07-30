import os
import re

dir_path = "/Users/rezakurnianda/.gemini/antigravity/scratch/sistem-presensi-digital"

# Add script tag before </body>
script_tag = '<script src="js/config.js"></script>\n'

for filename in os.listdir(dir_path):
    if filename.endswith(".html"):
        filepath = os.path.join(dir_path, filename)
        with open(filepath, "r") as f:
            content = f.read()
        
        # Check if config.js is already imported
        if 'src="js/config.js"' not in content:
            new_content = re.sub(
                r'(</body>)', 
                script_tag + r'\1', 
                content, 
                flags=re.IGNORECASE
            )
            if new_content != content:
                with open(filepath, "w") as f:
                    f.write(new_content)
                print(f"Added config.js to {filename}")
