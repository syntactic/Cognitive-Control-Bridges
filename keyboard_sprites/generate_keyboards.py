#!/usr/bin/env python3
"""
generate_keyboards.py

Generates pixel-art keyboard graphics for instruction demos and stimuli:
- WASD key cluster (left hand: A/D or W/S)
- IJKL key cluster (right hand: J/L or I/K)

Outputs individual keycap frames (--scheme-frames), sprite sheets, and animated GIFs/WebPs.
"""

import argparse
import os
from PIL import Image, ImageDraw

# 7x8 bitmap glyphs for WASD and IJKL key legends
GLYPHS = {
    'W': [
        "1100011",
        "1100011",
        "1100011",
        "1101011",
        "1101011",
        "1110111",
        "1110111",
        "0100010",
    ],
    'A': [
        "0111110",
        "1100011",
        "1100011",
        "1111111",
        "1111111",
        "1100011",
        "1100011",
        "1100011",
    ],
    'S': [
        "0111110",
        "1100011",
        "1100000",
        "0111110",
        "0000011",
        "0000011",
        "1100011",
        "0111110",
    ],
    'D': [
        "1111100",
        "1100010",
        "1100011",
        "1100011",
        "1100011",
        "1100011",
        "1100010",
        "1111100",
    ],
    'I': [
        "0111110",
        "0001100",
        "0001100",
        "0001100",
        "0001100",
        "0001100",
        "0001100",
        "0111110",
    ],
    'J': [
        "0001110",
        "0000110",
        "0000110",
        "0000110",
        "0000110",
        "1100110",
        "1100110",
        "0111100",
    ],
    'K': [
        "1100011",
        "1100110",
        "1101100",
        "1111000",
        "1111100",
        "1101110",
        "1100111",
        "1100011",
    ],
    'L': [
        "1100000",
        "1100000",
        "1100000",
        "1100000",
        "1100000",
        "1100000",
        "1111111",
        "1111111",
    ],
}

LAYOUTS = {
    "wasd": {
        "name": "WASD",
        "up": 'W',
        "left": 'A',
        "down": 'S',
        "right": 'D',
        "alternate_keys": ('A', 'D'),
    },
    "ijkl": {
        "name": "IJKL",
        "up": 'I',
        "left": 'J',
        "down": 'K',
        "right": 'L',
        "alternate_keys": ('J', 'L'),
    },
}

THEMES = {
    "retro_slate": {
        "name": "Retro Slate",
        "plate": (30, 33, 46, 255),
        "plate_highlight": (56, 62, 84, 255),
        "plate_shadow": (14, 16, 24, 255),
        "socket": (20, 22, 32, 255),
        "key_outline": (26, 28, 40, 255),
        "key_top": (224, 228, 240, 255),
        "key_top_hl": (255, 255, 255, 255),
        "key_top_sh": (175, 180, 200, 255),
        "key_front": (140, 145, 168, 255),
        "key_front_sh": (105, 110, 130, 255),
        "legend": (38, 42, 56, 255),
        "legend_pressed": (18, 20, 32, 255),
        "pressed_top": (160, 166, 188, 255),
        "pressed_top_hl": (190, 196, 218, 255),
        "pressed_top_sh": (125, 130, 152, 255),
        "pressed_front": (105, 110, 130, 255),
        "pressed_front_sh": (80, 85, 105, 255),
        "drop_shadow": (12, 14, 22, 170),
    },
    "classic_beige": {
        "name": "Classic Beige",
        "plate": (72, 68, 60, 255),
        "plate_highlight": (100, 95, 84, 255),
        "plate_shadow": (40, 38, 32, 255),
        "socket": (48, 45, 38, 255),
        "key_outline": (52, 48, 42, 255),
        "key_top": (245, 240, 228, 255),
        "key_top_hl": (255, 255, 250, 255),
        "key_top_sh": (212, 205, 190, 255),
        "key_front": (185, 178, 162, 255),
        "key_front_sh": (150, 144, 130, 255),
        "legend": (60, 54, 46, 255),
        "legend_pressed": (38, 34, 28, 255),
        "pressed_top": (205, 198, 182, 255),
        "pressed_top_hl": (225, 218, 202, 255),
        "pressed_top_sh": (175, 168, 154, 255),
        "pressed_front": (150, 144, 130, 255),
        "pressed_front_sh": (120, 115, 102, 255),
        "drop_shadow": (28, 26, 22, 170),
    },
    "monochrome": {
        "name": "Monochrome Dark",
        "plate": (20, 20, 20, 255),
        "plate_highlight": (45, 45, 45, 255),
        "plate_shadow": (10, 10, 10, 255),
        "socket": (14, 14, 14, 255),
        "key_outline": (16, 16, 16, 255),
        "key_top": (230, 230, 230, 255),
        "key_top_hl": (255, 255, 255, 255),
        "key_top_sh": (180, 180, 180, 255),
        "key_front": (140, 140, 140, 255),
        "key_front_sh": (100, 100, 100, 255),
        "legend": (30, 30, 30, 255),
        "legend_pressed": (10, 10, 10, 255),
        "pressed_top": (160, 160, 160, 255),
        "pressed_top_hl": (190, 190, 190, 255),
        "pressed_top_sh": (120, 120, 120, 255),
        "pressed_front": (100, 100, 100, 255),
        "pressed_front_sh": (70, 70, 70, 255),
        "drop_shadow": (0, 0, 0, 180),
    },
}


def draw_keyboard(
    pressed_key=None,
    layout_name="wasd",
    theme_name="retro_slate",
    with_plate=True,
    press_amount=1.0,
    labeled_keys=None,
):
    """
    Renders a single frame of the 4-key keyboard cluster (132x92 px native).

    labeled_keys: Set/list of keys to label with glyphs. Other keycaps are drawn blank.
    """
    layout_cfg = LAYOUTS.get(layout_name.lower(), LAYOUTS["wasd"])
    pal = THEMES.get(theme_name, THEMES["retro_slate"])

    canvas_w = 132
    canvas_h = 92
    img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    keys = {
        layout_cfg["up"]:    (49, 8),
        layout_cfg["left"]:  (11, 48),
        layout_cfg["down"]:  (49, 48),
        layout_cfg["right"]: (87, 48),
    }

    if pressed_key is None:
        active_keys = set()
    elif isinstance(pressed_key, str):
        active_keys = {pressed_key.upper()}
    else:
        active_keys = {k.upper() for k in pressed_key}

    labeled_set = {k.upper() for k in labeled_keys} if labeled_keys is not None else None

    kw = 34
    top_h = 22
    max_skirt = 8
    max_drop = 6

    # 1. Base Plate
    if with_plate:
        draw.rounded_rectangle([40, 2, 91, 46], radius=4, fill=pal["plate_shadow"])
        draw.rounded_rectangle([3, 41, 128, 88], radius=5, fill=pal["plate_shadow"])

        draw.rounded_rectangle([40, 2, 91, 43], radius=4, fill=pal["plate"])
        draw.rounded_rectangle([3, 41, 128, 85], radius=5, fill=pal["plate"])

        draw.line([(42, 2), (89, 2)], fill=pal["plate_highlight"])
        draw.line([(5, 41), (39, 41)], fill=pal["plate_highlight"])
        draw.line([(92, 41), (126, 41)], fill=pal["plate_highlight"])

        for kx, ky in keys.values():
            draw.rectangle([kx - 2, ky - 2, kx + kw + 1, ky + top_h + max_skirt + 1], fill=pal["socket"])

    # 2. Draw Keys in depth order (Top, Left, Down, Right)
    key_order = [layout_cfg["up"], layout_cfg["left"], layout_cfg["down"], layout_cfg["right"]]
    for key_name in key_order:
        kx, ky = keys[key_name]
        is_p = (key_name in active_keys)

        press_px = int(round(press_amount * max_drop)) if is_p else 0
        cur_y = ky + press_px
        cur_skirt = max_skirt - press_px

        if not with_plate:
            draw.rectangle([kx + 2, ky + top_h + max_skirt, kx + kw - 3, ky + top_h + max_skirt + 3], fill=pal["drop_shadow"])

        c_top = pal["pressed_top"] if is_p else pal["key_top"]
        c_hl = pal["pressed_top_hl"] if is_p else pal["key_top_hl"]
        c_sh = pal["pressed_top_sh"] if is_p else pal["key_top_sh"]
        c_fr = pal["pressed_front"] if is_p else pal["key_front"]
        c_fr_sh = pal["pressed_front_sh"] if is_p else pal["key_front_sh"]
        c_leg = pal["legend_pressed"] if is_p else pal["legend"]
        c_out = pal["key_outline"]

        # Front Skirt
        if cur_skirt > 0:
            fy = cur_y + top_h
            draw.rectangle([kx, fy, kx + kw - 1, fy + cur_skirt - 1], fill=c_fr)
            draw.line([(kx, fy), (kx, fy + cur_skirt - 1)], fill=c_fr_sh)
            draw.line([(kx + 1, fy), (kx + 1, fy + cur_skirt - 1)], fill=c_fr_sh)
            draw.line([(kx + kw - 1, fy), (kx + kw - 1, fy + cur_skirt - 1)], fill=c_fr_sh)
            draw.line([(kx + kw - 2, fy), (kx + kw - 2, fy + cur_skirt - 1)], fill=c_fr_sh)
            draw.line([(kx + 2, fy + cur_skirt - 1), (kx + kw - 3, fy + cur_skirt - 1)], fill=c_out)
            draw.point((kx + 1, fy + cur_skirt - 1), fill=c_fr_sh)
            draw.point((kx + kw - 2, fy + cur_skirt - 1), fill=c_fr_sh)

        # Top Face
        draw.rectangle([kx, cur_y + 2, kx + kw - 1, cur_y + top_h - 3], fill=c_top)
        draw.rectangle([kx + 1, cur_y + 1, kx + kw - 2, cur_y + top_h - 2], fill=c_top)
        draw.rectangle([kx + 2, cur_y, kx + kw - 3, cur_y + top_h - 1], fill=c_top)

        # Highlights
        draw.line([(kx + 2, cur_y), (kx + kw - 3, cur_y)], fill=c_hl)
        draw.line([(kx + 2, cur_y + 1), (kx + kw - 3, cur_y + 1)], fill=c_hl)
        draw.line([(kx, cur_y + 2), (kx, cur_y + top_h - 3)], fill=c_hl)
        draw.line([(kx + 1, cur_y + 2), (kx + 1, cur_y + top_h - 3)], fill=c_hl)

        # Shadows
        draw.line([(kx + kw - 1, cur_y + 2), (kx + kw - 1, cur_y + top_h - 3)], fill=c_sh)
        draw.line([(kx + kw - 2, cur_y + 2), (kx + kw - 2, cur_y + top_h - 3)], fill=c_sh)
        draw.line([(kx + 2, cur_y + top_h - 1), (kx + kw - 3, cur_y + top_h - 1)], fill=c_sh)
        draw.line([(kx + 2, cur_y + top_h - 2), (kx + kw - 3, cur_y + top_h - 2)], fill=c_sh)

        draw.point((kx + 1, cur_y + 1), fill=c_hl)
        draw.point((kx + kw - 2, cur_y + 1), fill=c_sh)
        draw.point((kx + 1, cur_y + top_h - 2), fill=c_hl)
        draw.point((kx + kw - 2, cur_y + top_h - 2), fill=c_sh)

        # Legend Glyph
        glyph = GLYPHS.get(key_name, [])
        if labeled_set is not None and key_name not in labeled_set:
            glyph = []
        if glyph:
            gw, gh = len(glyph[0]), len(glyph)
            gx = kx + (kw - gw) // 2
            gy = cur_y + (top_h - gh) // 2
            for r, row in enumerate(glyph):
                for c, bit in enumerate(row):
                    if bit == '1':
                        draw.point((gx + c, gy + r), fill=c_leg)

    return img


def generate_animation_frames(layout="wasd", theme="retro_slate", with_plate=True, smooth=False):
    """Generates frame sequence alternating between left and right keys."""
    cfg = LAYOUTS.get(layout.lower(), LAYOUTS["wasd"])
    key_left, key_right = cfg["alternate_keys"]

    if not smooth:
        return [
            draw_keyboard(None, layout_name=layout, theme_name=theme, with_plate=with_plate),
            draw_keyboard(key_left, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=1.0),
            draw_keyboard(None, layout_name=layout, theme_name=theme, with_plate=with_plate),
            draw_keyboard(key_right, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=1.0),
        ]
    else:
        return [
            draw_keyboard(None, layout_name=layout, theme_name=theme, with_plate=with_plate),
            draw_keyboard(key_left, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=0.5),
            draw_keyboard(key_left, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=1.0),
            draw_keyboard(key_left, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=0.5),
            draw_keyboard(None, layout_name=layout, theme_name=theme, with_plate=with_plate),
            draw_keyboard(key_right, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=0.5),
            draw_keyboard(key_right, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=1.0),
            draw_keyboard(key_right, layout_name=layout, theme_name=theme, with_plate=with_plate, press_amount=0.5),
        ]


def save_transparent_gif(frames, output_path, duration=250, loop=0):
    """Saves RGBA PIL images as a transparent looping GIF."""
    unique_colors = set()
    w, h = frames[0].size

    for frame in frames:
        rgba = frame.convert("RGBA")
        pix = rgba.load()
        for y in range(h):
            for x in range(w):
                r, g, b, a = pix[x, y]
                if a > 64:
                    unique_colors.add((r, g, b))

    color_list = list(unique_colors)[:255]
    palette = [0, 0, 0]
    for c in color_list:
        palette.extend(c)
    palette += [0] * (768 - len(palette))

    color_to_idx = {c: i + 1 for i, c in enumerate(color_list)}

    gif_frames = []
    for frame in frames:
        rgba = frame.convert("RGBA")
        pix = rgba.load()
        p_frame = Image.new("P", (w, h), 0)
        p_frame.putpalette(palette)
        p_pix = p_frame.load()

        for y in range(h):
            for x in range(w):
                r, g, b, a = pix[x, y]
                if a <= 64:
                    p_pix[x, y] = 0
                else:
                    p_pix[x, y] = color_to_idx.get((r, g, b), 1)

        gif_frames.append(p_frame)

    gif_frames[0].save(
        output_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=duration,
        loop=loop,
        transparency=0,
        disposal=2,
    )


def save_sprite_sheet(frames, output_path):
    """Exports horizontal transparent sprite sheet."""
    fw, fh = frames[0].size
    sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * fw, 0), frame)
    sheet.save(output_path)


def generate_scheme_frames(out_dir=".", scale=2, theme="retro_slate", with_plate=True):
    """
    Generates the 12 keycap frames for instruction demos:
    - disjoint scheme: A/D (wasd), J/L (ijkl)
    - fourcue scheme:  W/S (wasd), I/K (ijkl)

    Outputs to frames_wasd/ and frames_ijkl/.
    """
    specs = [
        # wasd horizontal (disjoint)
        ("wasd", ['A', 'D'], None, "ad.png"),
        ("wasd", ['A', 'D'], 'A',  "ad_A.png"),
        ("wasd", ['A', 'D'], 'D',  "ad_D.png"),
        # wasd vertical (fourcue)
        ("wasd", ['W', 'S'], None, "ws.png"),
        ("wasd", ['W', 'S'], 'W',  "ws_W.png"),
        ("wasd", ['W', 'S'], 'S',  "ws_S.png"),
        # ijkl horizontal (disjoint)
        ("ijkl", ['J', 'L'], None, "jl.png"),
        ("ijkl", ['J', 'L'], 'J',  "jl_J.png"),
        ("ijkl", ['J', 'L'], 'L',  "jl_L.png"),
        # ijkl vertical (fourcue)
        ("ijkl", ['I', 'K'], None, "ik.png"),
        ("ijkl", ['I', 'K'], 'I',  "ik_I.png"),
        ("ijkl", ['I', 'K'], 'K',  "ik_K.png"),
    ]

    dirs = {
        "wasd": os.path.join(out_dir, "frames_wasd"),
        "ijkl": os.path.join(out_dir, "frames_ijkl"),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    written = []
    for layout, printed, pressed, fname in specs:
        base = draw_keyboard(
            pressed_key=pressed,
            layout_name=layout,
            theme_name=theme,
            with_plate=with_plate,
            press_amount=1.0,
            labeled_keys=set(printed),
        )
        scaled = base.resize((base.width * scale, base.height * scale), Image.NEAREST)
        path = os.path.join(dirs[layout], fname)
        scaled.save(path)
        written.append(path)

    print(f"Generated {len(written)} scheme frames in {out_dir}")
    return written


def create_keyboard_animation(layout="wasd", scale=2, theme="retro_slate", with_plate=True, duration=200, smooth=False, out_dir="."):
    """Exports GIF, APNG, WebP, and spritesheet for a layout."""
    os.makedirs(out_dir, exist_ok=True)
    base_frames = generate_animation_frames(layout=layout, theme=theme, with_plate=with_plate, smooth=smooth)
    scaled_frames = [f.resize((f.width * scale, f.height * scale), Image.NEAREST) for f in base_frames]

    gif_path = os.path.join(out_dir, f"{layout}_animation.gif")
    save_transparent_gif(scaled_frames, gif_path, duration=duration, loop=0)

    sheet_path = os.path.join(out_dir, f"{layout}_spritesheet.png")
    save_sprite_sheet(scaled_frames, sheet_path)

    print(f"Generated {layout} animation assets in {out_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate pixel-art keyboard graphics (WASD & IJKL).")
    parser.add_argument("--layout", type=str, default="both", choices=["wasd", "ijkl", "both"])
    parser.add_argument("--scale", type=int, default=2, help="Scale multiplier (default: 2 -> 264x184)")
    parser.add_argument("--theme", type=str, default="retro_slate", choices=list(THEMES.keys()))
    parser.add_argument("--no-plate", action="store_true", help="Omit mounting chassis")
    parser.add_argument("--smooth", action="store_true", help="Generate 8-frame smooth travel cycle")
    parser.add_argument("--duration", type=int, default=200, help="Frame duration in ms")
    parser.add_argument("--out-dir", type=str, default=".", help="Output directory")
    parser.add_argument("--scheme-frames", action="store_true", help="Emit the 12 scheme keycap frames and exit")

    args = parser.parse_args()

    if args.scheme_frames:
        generate_scheme_frames(
            out_dir=args.out_dir,
            scale=args.scale,
            theme=args.theme,
            with_plate=not args.no_plate,
        )
    else:
        layouts = ["wasd", "ijkl"] if args.layout == "both" else [args.layout]
        for lay in layouts:
            create_keyboard_animation(
                layout=lay,
                scale=args.scale,
                theme=args.theme,
                with_plate=not args.no_plate,
                duration=args.duration,
                smooth=args.smooth,
                out_dir=args.out_dir,
            )
