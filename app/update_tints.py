import re

file_path = "app/src/main/java/com/example/ui/LithiaUI.kt"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

updated_lines = []
for line in lines:
    if "tint =" in line:
        # Check if line has tint = ...
        # Replace the tint assignment with Color.White or Color.White.copy(...)
        if "pulseAlpha" in line:
            new_line = re.sub(r"tint\s*=\s*[^,\n\)]+", "tint = Color.White.copy(alpha = pulseAlpha)", line)
        elif "0.5f" in line or "0.4f" in line or "0.3f" in line or "0.8f" in line:
            # check if alpha is specified
            if "0.8f" in line:
                new_line = re.sub(r"tint\s*=\s*[^,\n\)]+", "tint = Color.White.copy(alpha = 0.8f)", line)
            else:
                new_line = re.sub(r"tint\s*=\s*[^,\n\)]+", "tint = Color.White.copy(alpha = 0.5f)", line)
        else:
            new_line = re.sub(r"tint\s*=\s*[^,\n\)]+", "tint = Color.White", line)
        updated_lines.append(new_line)
    else:
        updated_lines.append(line)

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(updated_lines)

print("Updated tints successfully")
