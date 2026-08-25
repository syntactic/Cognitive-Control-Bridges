# Bird Sprite Sheets

Sprite sheets for the psychophysics experiments supporting horizontal and vertical stimulus motion/orientation.

## Files

- `bird_oriented.png` — Top-down oriented bird (4 columns × 4 rows, 72×72 px, 18×18 px cells).
- `bird_neutral.png` — Head-on neutral bird (4 columns × 2 rows, 64×32 px, 16×16 px cells).
- `generate_sprites.py` — Python script to generate all sheets and preview.
- `preview.png` — Visual preview (facing right, up, down, neutral).

## Specifications

| Sheet | File | Dimensions | Cell Size | Columns | Rows | Styles |
|---|---|---|---|---|---|---|
| **Oriented** | `bird_oriented.png` | 72 × 72 px | 18 × 18 px | 4 | 4 | 2 |
| **Neutral** | `bird_neutral.png` | 64 × 32 px | 16 × 16 px | 4 | 2 | 2 |

### `session.js` / `superExperiment` Configuration:

```javascript
spriteConfig = {
    img: imgOriented,             // bird_oriented.png
    imgDist: imgNeutral,          // bird_neutral.png
    imgFramesX: 4,                // 4 flap animation frames
    imgFramesY: 2,                // 2 styles (4 total rows)
    imgDistFramesX: 4,            // 4 flap animation frames
    imgDistFramesY: 2,            // 2 styles (2 total rows)
    objName: 'oriented bird',
    distName: 'neutral bird',
    allName: 'bird'
};
```

## Row Layout

### `bird_oriented.png`
- **Row 0**: Style 1 — Facing **Right**
- **Row 1**: Style 1 — Facing **Left**
- **Row 2**: Style 2 — Facing **Right**
- **Row 3**: Style 2 — Facing **Left**

### `bird_neutral.png`
- **Row 0**: Style 1 — Head-on view
- **Row 1**: Style 2 — Head-on view

## Usage

Regenerate sprite sheets and preview:
```bash
python bird_sprites/generate_sprites.py
```
