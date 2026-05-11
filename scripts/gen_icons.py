import os, shutil
from PIL import Image

d_icon = Image.open('/tmp/dikly-icon.png').convert('RGBA')
print(f'Icon loaded: {d_icon.size}')

def make_icon(target_size):
    bg = Image.new('RGB', (target_size, target_size), (255, 255, 255))
    d = d_icon.resize((target_size, target_size), Image.LANCZOS)
    bg.paste(d, (0, 0), d.split()[3])
    return bg

for f in [
    'android/app/src/main/res/drawable/ic_launcher_foreground.xml',
    'android/app/src/main/res/drawable/ic_launcher_background.xml',
    'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml',
    'android/app/src/main/res/drawable-v24/ic_launcher_background.xml',
]:
    if os.path.exists(f):
        os.remove(f)

if os.path.exists('android/app/src/main/res/mipmap-anydpi-v26'):
    shutil.rmtree('android/app/src/main/res/mipmap-anydpi-v26')
    print('Removed adaptive icon folder')

for folder, size in [('mipmap-mdpi',48),('mipmap-hdpi',72),('mipmap-xhdpi',96),('mipmap-xxhdpi',144),('mipmap-xxxhdpi',192)]:
    out = f'android/app/src/main/res/{folder}'
    os.makedirs(out, exist_ok=True)
    ico = make_icon(size)
    ico.save(f'{out}/ic_launcher.png')
    ico.save(f'{out}/ic_launcher_round.png')
    print(f'  {folder}: {size}px')

splash_size = 1920
splash = Image.new('RGB', (splash_size, splash_size), (79, 70, 229))
icon_size = int(splash_size * 0.35)
icon = d_icon.resize((icon_size, icon_size), Image.LANCZOS)
offset = (splash_size - icon_size) // 2
splash.paste(icon, (offset, offset), icon.split()[3])
os.makedirs('android/app/src/main/res/drawable', exist_ok=True)
splash.save('android/app/src/main/res/drawable/splash.png')
print('Splash screen saved!')
