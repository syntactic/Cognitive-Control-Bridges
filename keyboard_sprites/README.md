# Keyboard Sprites & Keycaps

Generates pixel-art keyboard graphics for instruction screens and demo animations.

## Keycap Layouts

1. **Disjoint Scheme (Horizontal Keys):**
   - Left Hand (`wasd`): `A` (left), `D` (right)
   - Right Hand (`ijkl`): `J` (left), `L` (right)
2. **Four-Cue Scheme (Vertical Keys):**
   - Left Hand (`wasd`): `W` (up), `S` (down)
   - Right Hand (`ijkl`): `I` (up), `K` (down)

Unused keycaps in the cluster are drawn blank to preserve the physical keyboard layout without distracting text.

## Usage

Generate the 12 instruction keycap frames into `frames_wasd/` and `frames_ijkl/`:
```bash
python keyboard_sprites/generate_keyboards.py --scheme-frames --out-dir .
```

Generate standalone sprite sheets and animations:
```bash
python keyboard_sprites/generate_keyboards.py --layout both --out-dir keyboard_sprites/
```

## Palettes
- `retro_slate` (default)
- `classic_beige`
- `monochrome`
