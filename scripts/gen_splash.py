"""
Generates DIKLY splash screen for Capacitor Android app.
Matches the neon tech design: dark navy gradient, teal diagonal beams,
particle network, QR decoration, sound wave bars, DIKLY logo with glow.
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920  # portrait

def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def draw_gradient(draw, w, h):
    top    = (8, 15, 32)
    mid    = (5, 28, 58)
    bottom = (4, 18, 44)
    for y in range(h):
        t = y / h
        c = lerp_color(top, mid, min(t * 2, 1)) if t < 0.5 else lerp_color(mid, bottom, (t - 0.5) * 2)
        draw.line([(0, y), (w, y)], fill=c)

def draw_beams(img, w, h):
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Left diagonal beam
    beam_pts = [(-w*0.15, 0), (w*0.35, 0), (w*0.05, h), (-w*0.45, h)]
    d.polygon(beam_pts, fill=(0, 210, 180, 28))
    # Bottom-right beam
    beam_pts2 = [(w*0.55, h), (w*1.1, h*0.55), (w*1.1, h*0.75), (w*0.75, h)]
    d.polygon(beam_pts2, fill=(0, 200, 160, 22))
    blurred = overlay.filter(ImageFilter.GaussianBlur(radius=60))
    img.paste(blurred, (0, 0), blurred)

def draw_particles(draw, w, h, seed=42):
    rng = random.Random(seed)
    nodes = [(rng.randint(20, w-20), rng.randint(int(h*0.45), h-80)) for _ in range(22)]
    nodes += [(rng.randint(20, w//3), rng.randint(int(h*0.05), int(h*0.45))) for _ in range(6)]
    # Connection lines
    for i, (x1, y1) in enumerate(nodes):
        for x2, y2 in nodes[i+1:i+3]:
            dist = math.hypot(x2-x1, y2-y1)
            if dist < 260:
                alpha = max(20, int(60 * (1 - dist/260)))
                draw.line([(x1,y1),(x2,y2)], fill=(0, 200, 200, alpha), width=1)
    # Dots
    for (x, y) in nodes:
        r = rng.randint(3, 7)
        bright = rng.random() > 0.75
        col = (255, 255, 255, 220) if bright else (0, 200, 200, 140)
        draw.ellipse([(x-r, y-r), (x+r, y+r)], fill=col)

def draw_qr(draw, x, y, cell=14, alpha=90):
    pattern = [
        [1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
        [1,0,1,1,1,0,1,0,1,0,1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1,0,0,1,1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1,0,1,0,0,0,1,1,1,0,1],
        [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,0,1,1,0,0,1,1,0,1,0,1,1,0,0,1,0],
        [0,1,0,0,1,1,0,0,1,0,1,0,0,1,1,0,1],
        [1,1,1,1,1,1,1,0,0,1,0,0,1,1,1,1,0],
        [0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,1,0],
        [1,1,1,1,1,1,1,0,0,1,1,0,1,0,1,0,1],
        [0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0],
        [1,1,1,1,1,1,1,1,0,1,0,0,1,0,1,0,1],
        [1,0,0,0,0,0,0,0,1,0,1,0,0,1,0,1,0],
        [1,1,1,1,1,1,1,1,0,1,0,1,0,0,1,0,1],
    ]
    for row_i, row in enumerate(pattern):
        for col_i, val in enumerate(row):
            if val:
                rx = x + col_i * cell
                ry = y + row_i * cell
                draw.rectangle([rx, ry, rx+cell-2, ry+cell-2], fill=(100, 200, 200, alpha))

def draw_soundwave(draw, w, h, seed=7):
    rng = random.Random(seed)
    bar_count = 60
    bar_w = 8
    gap = 6
    total = bar_count * (bar_w + gap)
    start_x = (w - total) // 2
    base_y = h - 40
    for i in range(bar_count):
        bh = rng.randint(8, 80)
        x = start_x + i * (bar_w + gap)
        alpha = rng.randint(80, 180)
        draw.rectangle([x, base_y - bh, x + bar_w, base_y], fill=(0, 200, 180, alpha))

def draw_logo_glow(img, cx, cy, text="DiKLY"):
    # Multi-layer glow: draw increasingly smaller, brighter versions
    glow_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)

    # Try to load a bold font, fall back to default
    font_size = 180
    font = None
    for font_path in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
        '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
    ]:
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, font_size)
            break

    if font is None:
        font = ImageFont.load_default()

    bbox = gd.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx, ty = cx - tw // 2, cy - th // 2

    # Outer wide glow (cyan, very transparent)
    for offset in range(18, 0, -3):
        alpha = int(25 + (18 - offset) * 4)
        gd.text((tx, ty), text, font=font, fill=(0, 220, 220, alpha))
        # Shift slightly for spread
        gd.text((tx-offset//2, ty), text, font=font, fill=(0, 220, 220, alpha//2))
        gd.text((tx+offset//2, ty), text, font=font, fill=(0, 220, 220, alpha//2))

    blurred = glow_layer.filter(ImageFilter.GaussianBlur(radius=14))
    img.paste(blurred, (0, 0), blurred)

    # Sharp white-cyan text on top
    final = Image.new('RGBA', img.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(final)
    fd.text((tx, ty), text, font=font, fill=(0, 230, 230, 255))
    img.paste(final, (0, 0), final)

    # Lens flare: small rainbow streak across logo center
    flare = Image.new('RGBA', img.size, (0, 0, 0, 0))
    frd = ImageDraw.Draw(flare)
    colors = [(255,100,100,60),(255,200,100,50),(100,255,100,50),(100,200,255,60),(180,100,255,50)]
    for i, col in enumerate(colors):
        ox = -60 + i * 30
        frd.line([(cx+ox-10, cy-80), (cx+ox+10, cy+80)], fill=col, width=3)
    blurred_flare = flare.filter(ImageFilter.GaussianBlur(radius=4))
    img.paste(blurred_flare, (0, 0), blurred_flare)

    return tw, th, tx, ty, font

def draw_subtitle(draw, cx, y, font_size=36):
    text = "Smart Attendance & Education Management"
    font = None
    for font_path in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    ]:
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, font_size)
            break
    if font is None:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, y), text, font=font, fill=(220, 235, 255, 230))
    # Decorative cyan line under subtitle
    line_y = y + 50
    draw.line([(cx - tw//2, line_y), (cx + tw//2, line_y)], fill=(0, 200, 200, 100), width=1)

def draw_tech_labels(draw, w, h):
    labels = [("01:523", 60, 50), ("IB-23", 70, 100), ("IOT-23", w-130, 60),
              ("1010", w-100, int(h*0.22)), ("100-100", w-140, int(h*0.33)),
              ("10X-33", 40, int(h*0.38)), ("IP-29", w-120, int(h*0.55))]
    font = None
    for font_path in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
    ]:
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, 22)
            break
    if font is None:
        font = ImageFont.load_default()
    for label, lx, ly in labels:
        draw.text((lx, ly), label, font=font, fill=(0, 180, 180, 80))

def generate(output_path, w=1080, h=1920):
    img = Image.new('RGB', (w, h), (8, 15, 32))
    draw_gradient(ImageDraw.Draw(img), w, h)
    draw_beams(img, w, h)

    # Particle layer (RGBA overlay)
    particle_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw_particles(ImageDraw.Draw(particle_layer), w, h)
    img.paste(Image.alpha_composite(img.convert('RGBA'), particle_layer).convert('RGB'), (0, 0))

    # Convert to RGBA for further compositing
    img = img.convert('RGBA')
    draw = ImageDraw.Draw(img)

    # QR decoration top-right
    draw_qr(draw, w - 260, 30, cell=13)

    # Tech labels
    draw_tech_labels(draw, w, h)

    # Logo glow + text (centered vertically around 42% height)
    logo_cy = int(h * 0.42)
    tw, th, tx, ty, logo_font = draw_logo_glow(img, w // 2, logo_cy)

    # Subtitle below logo
    draw2 = ImageDraw.Draw(img)
    draw_subtitle(draw2, w // 2, logo_cy + th // 2 + 60)

    # Sound wave at bottom
    draw_soundwave(draw2, w, h)

    # Save as RGB PNG
    final = img.convert('RGB')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final.save(output_path, 'PNG')
    print(f'Splash saved: {output_path} ({w}x{h})')

if __name__ == '__main__':
    # Portrait for Android phone
    generate('android/app/src/main/res/drawable/splash.png', 1080, 1920)
    # Landscape for tablets
    generate('android/app/src/main/res/drawable-land/splash.png', 1920, 1080)
    print('Done.')
