#!/usr/bin/env python3
"""
generate_sprites.py

Generates pixel-art bird sprite sheets for the experiment:
- bird_oriented.png (72x72 px): Top-down bird (4 frames x 4 rows: 2 styles x [right, left]).
- bird_neutral.png (64x32 px): Head-on bird (4 frames x 2 rows: 2 styles).
- preview.png: Orientation check (right, up, down, neutral).
"""

import os
from PIL import Image

# Color palettes (Style 1: Deep red, Style 2: Coral red)
PALETTE_STYLE1 = {
    '.': (0, 0, 0, 0),        # Transparent
    'b': (110, 8, 35, 255),    # Outline / shadow
    'B': (225, 25, 45, 255),   # Body
    'H': (255, 95, 110, 255),  # Wing highlight
    'W': (255, 255, 255, 255), # Eye white / wingtip
    'K': (15, 5, 10, 255),     # Eye pupil
    'O': (255, 140, 0, 255),   # Beak base
    'Y': (255, 220, 0, 255),   # Beak tip
}

PALETTE_STYLE2 = {
    '.': (0, 0, 0, 0),
    'b': (145, 20, 60, 255),
    'B': (255, 65, 100, 255),
    'H': (255, 160, 185, 255),
    'W': (255, 255, 255, 255),
    'K': (15, 5, 10, 255),
    'O': (255, 150, 0, 255),
    'Y': (255, 225, 50, 255),
}

# Top-down bird half-frames (rows 0..8, 18 px wide).
# Rows 9..17 are vertically mirrored across y=8.5.
TOPDOWN_HALVES = {
    0: [  # Frame 0: Level glide
        "..................",
        "........bWWb......",
        ".......bHHHHb.....",
        "......bHHHHHHb....",
        ".....bBBHHHHHHb...",
        "....bBBBBHHHHb....",
        "....bBBBBBBHHb.OY.",
        ".bb.bBBBBBBbWWbOYY",
        "bbbbBBBBBBBWKKOOYY",
    ],
    1: [  # Frame 1: Upstroke
        "..................",
        "..........bWWb....",
        ".........bHHHHb...",
        "........bHHHHHHb..",
        ".......bBBHHHHHb..",
        "......bBBBBHHHHb..",
        ".....bBBBBBBHHb.OY",
        ".bb.bBBBBBBbWWbOYY",
        "bbbbBBBBBBBWKKOOYY",
    ],
    2: [  # Frame 2: Downstroke
        "..................",
        "..................",
        ".....bWWb.........",
        "....bHHHHb........",
        "...bBBHHHHb.......",
        "...bBBBHHHHb......",
        "...bBBBBBBHHb..OY.",
        ".bb.bBBBBBBbWWbOYY",
        "bbbbBBBBBBBWKKOOYY",
    ],
    3: [  # Frame 3: Spread recovery
        "..................",
        ".......bWWb.......",
        "......bHHHHb......",
        ".....bHHHHHHb.....",
        "....bBBHHHHHHb....",
        "...bBBBBHHHHb.....",
        "...bBBBBBBHHb..OY.",
        ".bb.bBBBBBBbWWbOYY",
        "bbbbBBBBBBBWKKOOYY",
    ],
}

# Head-on neutral bird left half (cols 0..7, 16 rows).
# Cols 8..15 are horizontally mirrored across x=7.5.
NEUTRAL_HALVES = {
    0: [  # Frame 0: Level
        "........",
        "........",
        "......bW",
        ".....bBB",
        "....bWKW",
        ".bW.bBBB",
        "bHHHbBBO",
        "bHHHHbOY",
        ".bHHbbBB",
        "..b..bHH",
        ".......b",
        "........",
        "........",
        "........",
        "........",
        "........",
    ],
    1: [  # Frame 1: Wings raised
        "........",
        ".bWWb...",
        "bHHHHb..",
        ".bHHHb.b",
        "..bH.bBB",
        "....bWKW",
        "....bbBO",
        ".....bOY",
        ".....bBB",
        "......bH",
        ".......b",
        "........",
        "........",
        "........",
        "........",
        "........",
    ],
    2: [  # Frame 2: Flap peak
        ".bWWb...",
        "bHHHHb..",
        ".bHHHHb.",
        "..bHHb.b",
        "...b.bBB",
        "....bWKW",
        "....bbBO",
        ".....bOY",
        ".....bBB",
        "......bH",
        ".......b",
        "........",
        "........",
        "........",
        "........",
        "........",
    ],
    3: [  # Frame 3: Downstroke
        "........",
        "........",
        "......bW",
        ".....bBB",
        "....bWKW",
        "....bbBO",
        ".bW..bOY",
        "bHHH.bBB",
        ".bHHHHbB",
        "..bHHHHb",
        "...bWWb.",
        "......bH",
        ".......b",
        "........",
        "........",
        "........",
    ],
}


def make_topdown_frame(half):
    full = list(half)
    for r in reversed(half):
        full.append(r)
    return full


def make_neutral_frame(half):
    return [r + r[::-1] for r in half]


def render_ascii_to_image(lines, palette):
    h = len(lines)
    w = len(lines[0])
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            ch = lines[y][x]
            px[x, y] = palette.get(ch, (0, 0, 0, 0))
    return img


def build_oriented_sheet():
    sheet = Image.new('RGBA', (72, 72), (0, 0, 0, 0))
    palettes = [PALETTE_STYLE1, PALETTE_STYLE2]

    for s_idx, pal in enumerate(palettes):
        row_right = s_idx * 2
        row_left = s_idx * 2 + 1
        for frame in range(4):
            fr = render_ascii_to_image(make_topdown_frame(TOPDOWN_HALVES[frame]), pal)
            sheet.paste(fr, (frame * 18, row_right * 18))
            fl = fr.transpose(Image.FLIP_LEFT_RIGHT)
            sheet.paste(fl, (frame * 18, row_left * 18))

    return sheet


def build_neutral_sheet():
    sheet = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    palettes = [PALETTE_STYLE1, PALETTE_STYLE2]

    for s_idx, pal in enumerate(palettes):
        for frame in range(4):
            fn = render_ascii_to_image(make_neutral_frame(NEUTRAL_HALVES[frame]), pal)
            sheet.paste(fn, (frame * 16, s_idx * 16))

    return sheet


def build_preview(output_dir):
    f0 = render_ascii_to_image(make_topdown_frame(TOPDOWN_HALVES[0]), PALETTE_STYLE1)
    f0_up = f0.transpose(Image.ROTATE_90)
    f0_down = f0.transpose(Image.ROTATE_270)
    n0 = render_ascii_to_image(make_neutral_frame(NEUTRAL_HALVES[0]), PALETTE_STYLE1)

    preview = Image.new('RGBA', (4 * 32, 40), (10, 15, 25, 255))
    for i, s in enumerate([f0, f0_up, f0_down, n0]):
        cx = i * 32 + (32 - s.width) // 2
        cy = (40 - s.height) // 2
        preview.paste(s, (cx, cy), s)
    preview.save(os.path.join(output_dir, 'preview.png'))


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out_dir, exist_ok=True)

    oriented_sheet = build_oriented_sheet()
    neutral_sheet = build_neutral_sheet()

    oriented_path = os.path.join(out_dir, 'bird_oriented.png')
    neutral_path = os.path.join(out_dir, 'bird_neutral.png')

    oriented_sheet.save(oriented_path)
    neutral_sheet.save(neutral_path)

    build_preview(out_dir)

    print(f"Generated {oriented_path} ({oriented_sheet.size})")
    print(f"Generated {neutral_path} ({neutral_sheet.size})")
    print(f"Generated {os.path.join(out_dir, 'preview.png')}")


if __name__ == '__main__':
    main()
