import os
from PIL import Image

d_icon = Image.open('/tmp/dikly-icon.png').convert('RGBA')
print(f'Icon loaded: {d_icon.size}')

# Brand dark navy — matches the app's status bar / splash background
# (capacitor.config.json SplashScreen.backgroundColor, build-android.yml's
# splash.xml patch). Used as the adaptive-icon background so the icon reads
# as an intentional dark mark instead of a white square behind it.
BRAND_BG = (8, 15, 32)  # #080F20

# Android's adaptive-icon system masks a 108dp x 108dp canvas per-launcher
# (circle, squircle, rounded square, teardrop...) and only guarantees the
# inner ~66dp diameter stays unclipped. Content sized straight to the full
# canvas gets cropped unpredictably depending on the launcher's mask shape.
# 0.62 leaves a hair more margin than the 0.66 minimum so nothing touches
# the clip edge on any launcher.
SAFE_ZONE_FRACTION = 0.62

_content_bbox = d_icon.getbbox()
_icon_cropped = d_icon.crop(_content_bbox)


def _safe_zone_layer(canvas_size, bg=None):
    """Icon content centered and scaled to fit Android's adaptive-icon
    safe zone, on a transparent (or solid-color) square canvas."""
    layer = Image.new('RGBA', (canvas_size, canvas_size), bg or (0, 0, 0, 0))
    max_content = int(canvas_size * SAFE_ZONE_FRACTION)
    cw, ch = _icon_cropped.size
    scale = max_content / max(cw, ch)
    resized = _icon_cropped.resize((max(1, round(cw * scale)), max(1, round(ch * scale))), Image.LANCZOS)
    rw, rh = resized.size
    pos = ((canvas_size - rw) // 2, (canvas_size - rh) // 2)
    layer.paste(resized, pos, resized)
    return layer


def make_legacy_icon(target_size):
    """Pre-API-26 fallback: brand-navy square with the safe-zone-padded
    mark on top (no OS masking happens on these devices, so we bake in
    a background ourselves instead of leaving a transparent/white one)."""
    bg = Image.new('RGBA', (target_size, target_size), (*BRAND_BG, 255))
    fg = _safe_zone_layer(target_size)
    bg.paste(fg, (0, 0), fg)
    return bg.convert('RGB')


# mipmap density -> adaptive-icon canvas px (108dp scaled per bucket) and
# legacy launcher icon px (standard Android table)
DENSITIES = {
    'mipmap-mdpi':    {'adaptive': 108, 'legacy': 48},
    'mipmap-hdpi':    {'adaptive': 162, 'legacy': 72},
    'mipmap-xhdpi':   {'adaptive': 216, 'legacy': 96},
    'mipmap-xxhdpi':  {'adaptive': 324, 'legacy': 144},
    'mipmap-xxxhdpi': {'adaptive': 432, 'legacy': 192},
}

for folder, sizes in DENSITIES.items():
    out = f'android/app/src/main/res/{folder}'
    os.makedirs(out, exist_ok=True)

    # Adaptive-icon foreground layer (transparent, safe-zone padded).
    # `npx cap add android` already wrote mipmap-anydpi-v26/ic_launcher.xml
    # referencing @mipmap/ic_launcher_foreground + @color/ic_launcher_background
    # — we only need to supply correctly-sized/padded content for both.
    fg = _safe_zone_layer(sizes['adaptive'])
    fg.save(f'{out}/ic_launcher_foreground.png')

    # Legacy fallback (pre-Android-8 launchers, effectively unused in 2026
    # but kept correct rather than left white).
    legacy = make_legacy_icon(sizes['legacy'])
    legacy.save(f'{out}/ic_launcher.png')
    legacy.save(f'{out}/ic_launcher_round.png')

    print(f'  {folder}: adaptive {sizes["adaptive"]}px, legacy {sizes["legacy"]}px')

# Adaptive-icon background color — overrides Capacitor's default #FFFFFF.
os.makedirs('android/app/src/main/res/values', exist_ok=True)
with open('android/app/src/main/res/values/ic_launcher_background.xml', 'w') as f:
    f.write(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'    <color name="ic_launcher_background">#{BRAND_BG[0]:02X}{BRAND_BG[1]:02X}{BRAND_BG[2]:02X}</color>\n'
        '</resources>\n'
    )
print('ic_launcher_background color set to brand navy')

# Android 12+ splash icon: same safe-zone composition, transparent bg, so
# the system's SplashScreen circle-mask animation doesn't clip the mark.
os.makedirs('android/app/src/main/res/drawable', exist_ok=True)
splash_icon = _safe_zone_layer(288)
splash_icon.save('android/app/src/main/res/drawable/ic_splash.png')
print('ic_splash.png written (288px, safe-zone padded, for Android 12+ splash)')

# The splash *background* (a plain navy layer-list with this icon centered
# on top, for both pre-Android-12 and 12+) is written by the "Patch Android
# splash screen" step in build-android.yml, which runs after this script —
# it references this ic_splash.png directly, no separate raster splash
# image needed.
