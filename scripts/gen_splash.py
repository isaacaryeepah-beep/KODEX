"""
DIKLY Splash Screen Generator
Uses the branded splash reference image (src/public/splash-screen.png),
resizes/crops it to fill the target canvas, and saves Android drawables.
"""
import os
from PIL import Image


def cover_crop(src, target_w, target_h):
    """Scale-to-fill then center-crop, matching CSS background-size:cover."""
    src_w, src_h = src.size
    scale = max(target_w / src_w, target_h / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    resized = src.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top  = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def generate(output_path, w, h, src_path='src/public/splash-screen.png'):
    src = Image.open(src_path).convert('RGB')
    out = cover_crop(src, w, h)
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    out.save(output_path, 'PNG', optimize=True)
    print(f'Saved: {output_path}  ({w}×{h})')


if __name__ == '__main__':
    generate('android/app/src/main/res/drawable/splash.png',      1080, 1920)
    generate('android/app/src/main/res/drawable-land/splash.png', 1920, 1080)
    print('Done.')
