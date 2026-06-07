"""
DIKLY Splash Screen Generator
Clean, modern dark design: deep navy background, DIKLY icon + wordmark.
Outputs PNG for Android drawable resources.
"""
import os, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── Palette ───────────────────────────────────────────────────────────────────
BG_TOP    = (5,  12, 31)   # very dark navy
BG_MID    = (8,  18, 46)   # slightly lighter navy
BG_BOT    = (4,  10, 26)   # darkest at bottom
BLUE_LT   = (96, 165, 250) # #60a5fa — icon light blue
BLUE_MID  = (37, 99,  235) # #2563eb — icon mid blue
BLUE_DK   = (30, 64,  175) # #1e40af — icon dark blue
WHITE     = (255, 255, 255)
SUBTITLE  = (148, 163, 184) # slate-400

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def draw_gradient_bg(img, w, h):
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        if t < 0.5:
            c = lerp(BG_TOP, BG_MID, t * 2)
        else:
            c = lerp(BG_MID, BG_BOT, (t - 0.5) * 2)
        draw.line([(0, y), (w, y)], fill=c)


def draw_radial_glow(img, cx, cy, radius=380, color=(37, 99, 235)):
    """Soft radial glow behind the logo."""
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    steps = 18
    for i in range(steps, 0, -1):
        r = int(radius * i / steps)
        alpha = int(55 * (1 - i / steps) ** 1.4)
        bbox = [cx - r, cy - r, cx + r, cy + r]
        draw.ellipse(bbox, fill=(*color, alpha))
    blurred = glow.filter(ImageFilter.GaussianBlur(radius=80))
    img.paste(blurred, (0, 0), blurred)


def draw_dikly_icon(img, cx, cy, size=260):
    """
    Draw the DIKLY 'D' icon:
      - Rounded-D blue gradient fill
      - Two white diagonal bands (chevron stripes)
    """
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw  = ImageDraw.Draw(layer)

    # Scale the SVG viewBox (100x100) to `size`
    s = size / 100

    def sp(x, y):   # scale point
        return (cx - size // 2 + x * s, cy - size // 2 + y * s)

    # ── D shape polygon (from SVG path M14,4 L14,96 L50,96 C97,93 97,7 50,4 Z)
    # Approximate the curve with extra points along right side
    d_pts = []
    d_pts.append(sp(14, 4))
    d_pts.append(sp(14, 96))
    d_pts.append(sp(50, 96))
    # Bezier-ish right side using arc points
    for t in [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0]:
        # cubic approximation: control points from SVG (97,93) and (97,7)
        p0 = (50, 96); p1 = (97, 93); p2 = (97, 7); p3 = (50, 4)
        tt = 1 - t
        x = (tt**3*p0[0] + 3*tt**2*t*p1[0] + 3*tt*t**2*p2[0] + t**3*p3[0])
        y = (tt**3*p0[1] + 3*tt**2*t*p1[1] + 3*tt*t**2*p2[1] + t**3*p3[1])
        d_pts.append(sp(x, y))

    # Gradient fill — build a horizontal gradient layer clipped to D shape
    grad = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd   = ImageDraw.Draw(grad)
    left_x  = cx - size // 2
    right_x = cx + size // 2
    for px in range(left_x, right_x + 1):
        t   = (px - left_x) / max(right_x - left_x, 1)
        if t < 0.45:
            col = lerp(BLUE_LT, BLUE_MID, t / 0.45)
        else:
            col = lerp(BLUE_MID, BLUE_DK, (t - 0.45) / 0.55)
        top_y  = cy - size // 2
        bot_y  = cy + size // 2
        gd.line([(px, top_y), (px, bot_y)], fill=(*col, 255))

    # Create D mask
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon(d_pts, fill=255)

    # Apply gradient through mask
    grad.putalpha(mask)
    img.paste(grad, (0, 0), grad)

    # ── White diagonal stripes (from SVG polygons)
    stripe_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(stripe_layer)

    # Top stripe: points="4,58 63,-2 89,-2 30,58"
    sd.polygon([sp(4,58), sp(63,-2), sp(89,-2), sp(30,58)], fill=(255,255,255,255))
    # Bottom stripe: points="30,102 89,42 63,42 4,102"
    sd.polygon([sp(30,102), sp(89,42), sp(63,42), sp(4,102)], fill=(255,255,255,255))

    # Clip stripes to D shape
    stripe_masked = Image.new('RGBA', img.size, (0, 0, 0, 0))
    stripe_masked.paste(stripe_layer, (0, 0), mask)
    img.paste(stripe_masked, (0, 0), stripe_masked)


def load_font(size, bold=True):
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ]
    if not bold:
        candidates = [c.replace('Bold','Regular').replace('-B.ttf','.ttf') for c in candidates] + candidates
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def centered_text(draw, text, font, cx, y, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text((cx - w // 2, y), text, font=font, fill=fill)


def draw_wordmark_glow(img, text, cx, y, font_size=200):
    """Draw 'DIKLY' with a soft blue glow halo."""
    font = load_font(font_size, bold=True)

    # Glow pass
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    bbox = gd.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    tx = cx - tw // 2
    for alpha in [18, 28, 38, 50, 65, 78]:
        gd.text((tx, y), text, font=font, fill=(*BLUE_MID, alpha))
    blurred = glow.filter(ImageFilter.GaussianBlur(radius=22))
    img.paste(blurred, (0, 0), blurred)

    # Crisp white text
    top = Image.new('RGBA', img.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    td.text((tx, y), text, font=font, fill=(255, 255, 255, 255))
    img.paste(top, (0, 0), top)

    return bbox[3] - bbox[1]   # text height


def draw_thin_rule(draw, cx, y, half_w, color=(37, 99, 235), alpha=100):
    r, g, b = color
    draw.line([(cx - half_w, y), (cx + half_w, y)], fill=(r, g, b, alpha), width=2)


def generate(output_path, w=1080, h=1920):
    img = Image.new('RGBA', (w, h), BG_TOP)
    draw_gradient_bg(img, w, h)

    cx = w // 2
    logo_cy = int(h * 0.38)  # vertical center of icon

    # Radial glow
    draw_radial_glow(img, cx, logo_cy, radius=340, color=BLUE_MID)

    # DIKLY icon
    draw_dikly_icon(img, cx, logo_cy, size=240)

    # Wordmark "DIKLY" — below icon
    icon_bottom = logo_cy + 120 + 36
    txt_h = draw_wordmark_glow(img, 'DIKLY', cx, icon_bottom, font_size=180)

    # Thin rule
    rule_y = icon_bottom + txt_h + 30
    draw = ImageDraw.Draw(img)
    draw_thin_rule(draw, cx, rule_y, half_w=80)

    # Subtitle
    sub_font = load_font(42, bold=False)
    centered_text(draw, 'Smart Attendance & Education', sub_font, cx, rule_y + 22, (*SUBTITLE, 220))

    # Save as RGB PNG
    final = img.convert('RGB')
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    final.save(output_path, 'PNG', optimize=True)
    print(f'Saved: {output_path}  ({w}×{h})')


if __name__ == '__main__':
    generate('android/app/src/main/res/drawable/splash.png',      1080, 1920)
    generate('android/app/src/main/res/drawable-land/splash.png', 1920, 1080)
    print('Done. Run: npx cap sync android')
