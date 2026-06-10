"""Generate electron/icon.ico and copy electron/icon.png from resources/icon.png."""
from PIL import Image
import shutil, os

img = Image.open("resources/icon.png").convert("RGBA")
sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save("electron/icon.ico", format="ICO", sizes=sizes)
shutil.copy("resources/icon.png", "electron/icon.png")
ico_size = os.path.getsize("electron/icon.ico")
print(f"icon.ico written: {ico_size} bytes ({len(sizes)} sizes), icon.png copied")
