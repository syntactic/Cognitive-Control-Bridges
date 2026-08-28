#!/usr/bin/env python3
"""
generate_sprites.py

Generates high-resolution pixel-art bird sprite sheets for the experiment:
- bird_oriented.png (144x144 px): Top-down bird with bilateral eyes (4 frames x 4 rows: 2 styles x [right, left]).
- bird_neutral.png (144x72 px): Head-on bird with forward eyes (4 frames x 2 rows: 2 styles).
- preview.png: Orientation check (right, up, down, neutral).
"""

import os
from PIL import Image

# Color palettes (Style 1: Deep red, Style 2: Coral red)
PALETTE_STYLE1 = {
    '.': (0, 0, 0, 0),          # Transparent
    'b': (90, 8, 30, 255),      # Dark outline / shadow
    'd': (150, 15, 40, 255),    # Dark body shading
    'B': (230, 30, 50, 255),    # Main body red
    'H': (255, 105, 120, 255),  # Wing highlight
    'W': (255, 255, 255, 255),  # Eye white / wingtip
    'K': (15, 5, 10, 255),      # Eye pupil
    'O': (255, 130, 0, 255),    # Beak base
    'Y': (255, 220, 0, 255),    # Beak tip
}

PALETTE_STYLE2 = {
    '.': (0, 0, 0, 0),
    'b': (120, 15, 50, 255),
    'd': (180, 25, 70, 255),
    'B': (255, 70, 105, 255),
    'H': (255, 165, 190, 255),
    'W': (255, 255, 255, 255),
    'K': (15, 5, 10, 255),
    'O': (255, 140, 0, 255),
    'Y': (255, 225, 50, 255),
}

# Top-down bird half-frames (rows 0..17, 36 px wide).
# Rows 18..35 are vertically mirrored across y=17.5.
# Note: Body, head, eyes, and beak (rows 12..17, cols 22..35) are ROCK-SOLID CONSTANT
# across all 4 frames so only the wings articulate during flight.
TOPDOWN_HALVES = {
    0: [  # Frame 0: Level glide (wings fully spread & curved)
        "....................................",
        "....................................",
        ".............bWWb...................",
        "............bHHHHb..................",
        "...........bHHHHHHb.................",
        "..........bHHHHHHHHb................",
        ".........bBBHHHHHHHHb...............",
        "........bBBBBHHHHHHHHb..............",
        ".......bBBBBBBHHHHHHHHb.............",
        "......bBBBBBBBBHHHHHHHHb............",
        "......bBBBBBBBBBHHHHHHHb............",
        ".......bBBBBBBBBBHHHHHb....bWWb.....",
        "........bBBBBBBBBBBHHb....bWKKWb....",
        "........bBBBBBBBBBBBBb...bWKKWb.b...",
        "...bb..bBBBBBBBBBBBBBBb...bWWb..bOY.",
        "..bbbb.bBBBBBBBBBBBBBBBbbBBBBb..bOYY",
        ".bbbbbbdBBBBBBBBBBBBBBBBBBBBBb.bOYYY",
        "bbbbbbdBBBBBBBBBBBBBBBBBBBBBBbbOYYYY",
    ],
    1: [  # Frame 1: Upstroke (wings raised high and swept forward)
        "....................................",
        "................bWWb................",
        "...............bHHHHb...............",
        "..............bHHHHHHb..............",
        ".............bHHHHHHHHb.............",
        "............bBBHHHHHHHHb............",
        "...........bBBBBHHHHHHHHb...........",
        "..........bBBBBBBHHHHHHb............",
        ".........bBBBBBBBBHHHHb.............",
        "........bBBBBBBBBBBHHb..............",
        ".......bBBBBBBBBBBBBb...............",
        "........bBBBBBBBBBBBBb.....bWWb.....",
        ".........bBBBBBBBBBBBb....bWKKWb....",
        "..........bBBBBBBBBBBb...bWKKWb.b...",
        "...bb....bBBBBBBBBBBBBb...bWWb..bOY.",
        "..bbbb..bBBBBBBBBBBBBBbbbBBBBb..bOYY",
        ".bbbbbbdBBBBBBBBBBBBBBBBBBBBBb.bOYYY",
        "bbbbbbdBBBBBBBBBBBBBBBBBBBBBBbbOYYYY",
    ],
    2: [  # Frame 2: Downstroke (power stroke, wings swept down and tucked)
        "....................................",
        "....................................",
        "....................................",
        "....................................",
        "....................................",
        "....................................",
        "....................................",
        ".........bWWb.......................",
        "........bHHHHb......................",
        ".......bBBHHHHb.....................",
        "......bBBBBHHHHb....................",
        ".....bBBBBBBHHHHb..........bWWb.....",
        ".....bBBBBBBBBHHb.........bWKKWb....",
        "......bBBBBBBBBBBb.......bWKKWb.b...",
        "...bb..bBBBBBBBBBBb.......bWWb..bOY.",
        "..bbbb.bBBBBBBBBBBBBBBbbbBBBBb..bOYY",
        ".bbbbbbdBBBBBBBBBBBBBBBBBBBBBb.bOYYY",
        "bbbbbbdBBBBBBBBBBBBBBBBBBBBBBbbOYYYY",
    ],
    3: [  # Frame 3: Spread recovery (wings returning outward)
        "....................................",
        "....................................",
        "....................................",
        "....................................",
        "...........bWWb.....................",
        "..........bHHHHb....................",
        ".........bHHHHHHb...................",
        "........bBBHHHHHHb..................",
        ".......bBBBBHHHHHHb.................",
        "......bBBBBBBHHHHHHb................",
        ".....bBBBBBBBBHHHHb.................",
        ".....bBBBBBBBBBHHb.........bWWb.....",
        "......bBBBBBBBBBBb........bWKKWb....",
        ".......bBBBBBBBBBBb......bWKKWb.b...",
        "...bb...bBBBBBBBBBBb......bWWb..bOY.",
        "..bbbb..bBBBBBBBBBBBBBbbbBBBBb..bOYY",
        ".bbbbbbdBBBBBBBBBBBBBBBBBBBBBb.bOYYY",
        "bbbbbbdBBBBBBBBBBBBBBBBBBBBBBbbOYYYY",
    ],
}

# Head-on neutral bird left half (cols 0..17, 36 rows).
# Cols 18..35 are horizontally mirrored across x=17.5.
NEUTRAL_HALVES = {
    0: [  # Frame 0: Level glide (wings outstretched)
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        ".............bWWb.",
        "............bBBBBb",
        "...........bBBBBBb",
        "..........bWWbBBBb",
        ".........bWKKWbBBb",
        ".........bWKKWbBBb",
        "..........bWWbBBBO",
        "...bWWb...bBBBBBOY",
        "..bHHHHb.bBBBBBOYY",
        ".bHHHHHHbBBBBBBbOY",
        ".bHHHHHHbBBBBBBb..",
        "bBBHHHHHbbBBBBb...",
        "bBBBBHHb.bBBBBb...",
        ".bBBBBb...bBBb....",
        "..bBBb.....bb.....",
        "...bb.............",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
    ],
    1: [  # Frame 1: Wings raised high
        "..................",
        "..................",
        "..................",
        "..................",
        "....bWWb..........",
        "...bHHHHb.........",
        "..bHHHHHHb........",
        "..bHHHHHHb...bWWb.",
        "..bBBHHHHb..bBBBBb",
        "...bBBBBb..bBBBBBb",
        "....bBBb..bWWbBBBb",
        ".....bb..bWKKWbBBb",
        ".........bWKKWbBBb",
        "..........bWWbBBBO",
        "..........bBBBBBOY",
        ".........bBBBBBOYY",
        ".........bBBBBBbOY",
        "..........bBBBBb..",
        "..........bBBBBb..",
        "...........bBBb...",
        "............bb....",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
    ],
    2: [  # Frame 2: Wings at flap peak
        "..................",
        "..................",
        "....bWWb..........",
        "...bHHHHb.........",
        "..bHHHHHHb........",
        ".bHHHHHHHHb..bWWb.",
        ".bBBHHHHHHb.bBBBBb",
        "..bBBBBHHb.bBBBBBb",
        "...bBBBBb.bWWbBBBb",
        "....bBBb.bWKKWbBBb",
        ".....bb..bWKKWbBBb",
        "..........bWWbBBBO",
        "..........bBBBBBOY",
        ".........bBBBBBOYY",
        ".........bBBBBBbOY",
        "..........bBBBBb..",
        "..........bBBBBb..",
        "...........bBBb...",
        "............bb....",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
    ],
    3: [  # Frame 3: Wings downstroke
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        ".............bWWb.",
        "............bBBBBb",
        "...........bBBBBBb",
        "..........bWWbBBBb",
        ".........bWKKWbBBb",
        ".........bWKKWbBBb",
        "..........bWWbBBBO",
        "..........bBBBBBOY",
        "..bWWb...bBBBBBOYY",
        ".bHHHHb..bBBBBBbOY",
        "bHHHHHHb..bBBBBb..",
        "bBBHHHHb..bBBBBb..",
        ".bBBBBb....bBBb...",
        "..bBBb......bb....",
        "...bb.............",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
        "..................",
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
    tile = 36
    sheet = Image.new('RGBA', (tile * 4, tile * 4), (0, 0, 0, 0))
    palettes = [PALETTE_STYLE1, PALETTE_STYLE2]

    for s_idx, pal in enumerate(palettes):
        row_right = s_idx * 2
        row_left = s_idx * 2 + 1
        for frame in range(4):
            fr = render_ascii_to_image(make_topdown_frame(TOPDOWN_HALVES[frame]), pal)
            sheet.paste(fr, (frame * tile, row_right * tile))
            fl = fr.transpose(Image.FLIP_LEFT_RIGHT)
            sheet.paste(fl, (frame * tile, row_left * tile))

    return sheet


def build_neutral_sheet():
    tile = 36
    sheet = Image.new('RGBA', (tile * 4, tile * 2), (0, 0, 0, 0))
    palettes = [PALETTE_STYLE1, PALETTE_STYLE2]

    for s_idx, pal in enumerate(palettes):
        for frame in range(4):
            fn = render_ascii_to_image(make_neutral_frame(NEUTRAL_HALVES[frame]), pal)
            sheet.paste(fn, (frame * tile, s_idx * tile))

    return sheet


def build_preview(output_dir):
    f0 = render_ascii_to_image(make_topdown_frame(TOPDOWN_HALVES[0]), PALETTE_STYLE1)
    f0_up = f0.transpose(Image.ROTATE_90)
    f0_down = f0.transpose(Image.ROTATE_270)
    n0 = render_ascii_to_image(make_neutral_frame(NEUTRAL_HALVES[0]), PALETTE_STYLE1)

    preview = Image.new('RGBA', (4 * 48, 56), (10, 15, 25, 255))
    for i, s in enumerate([f0, f0_up, f0_down, n0]):
        cx = i * 48 + (48 - s.width) // 2
        cy = (56 - s.height) // 2
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
