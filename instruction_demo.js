// instruction_demo.js — the animated stimulus cartoon shown on instruction screens.
//
// A *simplified* depiction of the task: 8 fish instead of the real display's 150,
// in a 150 px box instead of the full 600 px canvas, with the cue border drawn
// only on the stages whose copy is actually about the border. It is a diagram,
// not a preview — nobody is meant to read a coherence level off it.
//
// WHY THIS DOES NOT CALL superExperiment.block(). Three blockers, any one fatal:
//   1. `Game.oobCount` is a hardcoded 150 (fork src/game.js:36), not read from
//      config, so SE cannot draw 8 objects without a fork change + bundle rebuild.
//   2. `Timeline`'s constructor attaches a window keydown handler that is removed
//      only when a NON-LOOPING block ends (fork src/trial.js:457-459). A demo under
//      an instruction screen would compete with showInstructions' own "press any
//      key" handler for the same keystroke, and a looping one would leak the
//      handler for the rest of the session.
//   3. `endBlock()` calls `cancelAllAnimationFrames()`, which cancels EVERY rAF id
//      on the page, not just its own (fork block.js:128).
// So this reimplements only what a still-life demo needs from the fork's
// src/oob.js — position, velocity, the elliptical fade/respawn, sprite-frame
// cycling — and uses the SAME sprite sheets the real task uses, so the demo fish
// are literally the participant's fish.
//
// SPRITE SHEET GEOMETRY (from session.js loadSprites + fork src/oob.js):
//   fish_2.png        72x72 -> 4 cols x 4 rows of 18 px;
//                     row = variant*2 + (facing left ? 1 : 0)
//   fish_forward.png  64x32 -> 4 cols x 2 rows of 16 px
// SE draws the FORWARD sprite whenever a trial's orientation pathway never fires
// (Oob.drawNonOrientated), which is exactly the univalent movement stimulus.
// Passing `orientation: null` here reproduces that for free, so S1/S2 show fish
// that swim without also facing anywhere — as their copy promises.

// ---- Layout ---------------------------------------------------------------
// 150 px is "about a quarter of the screen" (of the 600 px canvas) and is the
// largest box that leaves every instruction screen inside its height budget.
// RAISING IT OVERFLOWS SCREENS, which is a correctness bug and not a cosmetic
// one: showInstructions dismisses on ANY keydown, so a screen taller than the
// canvas cannot be scrolled — Space starts the block. Re-run
// `node analysis/measure_instructions.js` after changing this.
const INSTRUCTION_DEMO_PX = 150;
// Backing store, larger than the display box so sprites stay crisp. All geometry
// below is in these units.
const INSTRUCTION_DEMO_BACKING = 320;

const DEMO_FISH_COUNT = 8;
const DEMO_FISH_SIZE = 46;      // backing-store px
const DEMO_SPEED = 55;          // backing-store px per second
const DEMO_FRAME_MS = 150;      // matches FRAME_DURATION in the fork's src/oob.js
const DEMO_SEGMENT_MS = 2400;   // how long one cartoon "trial" runs
const DEMO_KEY_AT_MS = 900;     // when the keycap depresses — a plausible RT
const DEMO_KEY_HOLD_MS = 400;
const DEMO_SOA_MS = 700;        // default gap before a `then` event (PRP)

// The cue colours SE actually paints (fork src/defaultConfig.js movCueColor /
// orCueColor). Duplicated here rather than read from a config this demo never
// builds; keep in sync if the fork's colours change.
const DEMO_CUE_COLORS = { mov: '#fb0', or: '#0af' };

// Pixel-art keycaps. frame_00 is the idle keyboard, frame_01 the LEFT key
// depressed, frame_03 the RIGHT key (frame_02 is byte-identical to frame_00 and
// is deliberately unused — the source was authored as a 4-frame loop). frame_up
// and frame_down are the VERTICAL keys depressed (W/S on wasd, I/K on ijkl),
// generated from the same pixel-art source (Python/KeyboardAnimation/ai.py,
// draw_keyboard('W'/'S'/'I'/'K')) so they match the horizontal frames exactly.
// The disjoint scheme uses only the horizontal (a/d, j/l) frames; the fourcue
// scheme uses only the vertical (w/s, i/k) frames.
const DEMO_KEY_IDLE = {
    wasd: 'frames_wasd/frame_00.png',
    ijkl: 'frames_ijkl/frame_00.png',
};
// Keyed by the literal key character, because that is what a blockConfig's
// keyMaps hold. An unknown key throws rather than silently showing an idle
// keyboard: a demo that depicts the wrong finger is worse than no demo.
const DEMO_KEYCAPS = {
    a: { set: 'wasd', src: 'frames_wasd/frame_01.png' },
    d: { set: 'wasd', src: 'frames_wasd/frame_03.png' },
    w: { set: 'wasd', src: 'frames_wasd/frame_up.png' },
    s: { set: 'wasd', src: 'frames_wasd/frame_down.png' },
    j: { set: 'ijkl', src: 'frames_ijkl/frame_01.png' },
    l: { set: 'ijkl', src: 'frames_ijkl/frame_03.png' },
    i: { set: 'ijkl', src: 'frames_ijkl/frame_up.png' },
    k: { set: 'ijkl', src: 'frames_ijkl/frame_down.png' },
};

function demoKeycap(key) {
    const cap = DEMO_KEYCAPS[String(key).toLowerCase()];
    if (!cap) {
        throw new Error(
            `instruction_demo: no keycap graphic for key '${key}'. The pixel-art ` +
            `sets cover ${Object.keys(DEMO_KEYCAPS).join('/')} only — add frames ` +
            'before pointing a paradigm at a different key map.'
        );
    }
    return cap;
}

/**
 * One fish in the cartoon. Not a subclass of anything: the fork's Oob/OobImg are
 * not exported from its index.js.
 */
class DemoFish {
    constructor(canvas, isSignal) {
        this.canvas = canvas;
        this.isSignal = isSignal;
        this.variant = Math.random() < 0.5 ? 0 : 1;
        this.frame = Math.floor(Math.random() * 4);
        this.frameTime = Math.random() * DEMO_FRAME_MS;
        this.alpha = 1;
        this.mov = null;
        this.or = null;
        this.place(Math.sqrt(Math.random()) * 0.42);
    }

    place(radius) {
        const a = Math.random() * 2 * Math.PI;
        this.x = radius * Math.sin(a) * this.canvas.width + this.canvas.width / 2;
        this.y = radius * Math.cos(a) * this.canvas.height + this.canvas.height / 2;
    }

    /**
     * Apply a segment's stimulus state. A non-signal fish takes a random
     * direction rather than the target one — the same thing SE's coherence does
     * (coherence 0 randomises direction; it does not hide the object).
     * `undefined` leaves a pathway untouched, which is how a `then` event can
     * switch one pathway on without disturbing the other.
     */
    setState(movement, orientation) {
        const jitter = () => Math.random() * 360;
        if (movement !== undefined) {
            this.mov = movement === null ? null : (this.isSignal ? movement : jitter());
        }
        if (orientation !== undefined) {
            this.or = orientation === null ? null : (this.isSignal ? orientation : jitter());
        }
    }

    update(dt) {
        this.frameTime += dt;
        if (this.frameTime > DEMO_FRAME_MS) {
            this.frameTime -= DEMO_FRAME_MS;
            this.frame = (this.frame + 1) % 4;
        }
        // The dt < 64 guard mirrors the fork's Oob.update: a backgrounded tab
        // returns a huge delta that would teleport every fish off screen at once.
        if (this.mov !== null && dt < 64) {
            const rad = this.mov * Math.PI / 180;
            this.x += Math.cos(rad) * DEMO_SPEED * dt / 1000;
            this.y += -Math.sin(rad) * DEMO_SPEED * dt / 1000;
        }
        // Elliptical fade near the aperture edge, respawn past it — the same
        // shape as the fork's handleOutOfBounds, which is what gives the real
        // display its "swarm in a porthole" look.
        const a = this.canvas.width / 2;
        const b = this.canvas.height / 2;
        const dx = this.x - a;
        const dy = this.y - b;
        const d = (dx * dx) / (a * a) + (dy * dy) / (b * b);
        this.alpha = d > 0.7 ? Math.max(0, ((1 - d) / 0.3) ** 2) : 1;
        if (d > 1) this.place(0.42);
    }
}

/**
 * Build a running cartoon.
 *
 * @param {object} spec - see cpTrainingDemos() in canonical_paradigms.js.
 *   {
 *     count?:     how many fish (default 8)
 *     coherence?: 0..1, fraction carrying the signal (default 1)
 *     segments:   [ Segment, ... ] played in order, then looped
 *   }
 *   Segment = {
 *     movement:    0 | 180 | 90 | 270 | null   (null = stationary; 90/270 = up/down,
 *                                     the fourcue vertical geometry)
 *     orientation: 0 | 180 | 90 | 270 | null   (null = forward-facing sprite, i.e.
 *                                     univalent movement — see the geometry note above;
 *                                     90/270 render by rotating the right-facing frame)
 *     border:      'mov' | 'or' | ['mov','or'] | null   (an array nests two cues,
 *                                     as a dual-task trial has both on screen)
 *     key:         'a'|'d'|'w'|'s'|'j'|'l'|'i'|'k' | null   keycap to depress at DEMO_KEY_AT_MS
 *     duration?:   ms (default DEMO_SEGMENT_MS)
 *     then?:       { at?, movement?, orientation?, border?, key? }
 *                  a second event mid-segment. This is how the PRP stage shows a
 *                  second stimulus arriving after an SOA while the first is still
 *                  on screen, answered with the other hand.
 *   }
 * @param {{img: HTMLImageElement, imgDist: HTMLImageElement}|null} sprites -
 *   as loaded by session.js loadSprites(). Null falls back to the abstract
 *   circles/triangles that ?stimulus=abstract runs, so the demo never renders
 *   stimuli the participant is not about to see.
 * @returns {{element: HTMLElement, stop: function}} `stop()` MUST be called when
 *   the screen is dismissed — it cancels the rAF loop and every pending timer.
 */
function createInstructionDemo(spec, sprites) {
    if (!spec || !Array.isArray(spec.segments) || spec.segments.length === 0) {
        throw new Error('createInstructionDemo: spec.segments must be a non-empty array');
    }

    const row = document.createElement('div');
    row.className = 'demo-row';

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = INSTRUCTION_DEMO_BACKING;
    canvas.className = 'demo-canvas';
    const ctx = canvas.getContext('2d');
    row.appendChild(canvas);

    // Work out which keyboard graphics this demo needs, in first-use order. A
    // switching or PRP stage uses both hands; a Stroop stage uses one.
    const keySets = [];
    for (const seg of spec.segments) {
        for (const key of [seg.key, seg.then && seg.then.key]) {
            if (!key) continue;
            const { set } = demoKeycap(key);
            if (!keySets.includes(set)) keySets.push(set);
        }
    }
    const keyImgs = {};
    for (const set of keySets) {
        const img = document.createElement('img');
        img.className = 'demo-key';
        img.alt = '';
        img.src = DEMO_KEY_IDLE[set];
        row.appendChild(img);
        keyImgs[set] = img;
    }

    const count = spec.count || DEMO_FISH_COUNT;
    const coherence = spec.coherence === undefined ? 1 : spec.coherence;
    const signalCount = Math.round(count * coherence);

    let fish = [];
    let border = null;
    // Which side each active cue draws on, under the fourcue positional cue. A
    // segment sets it per-cue: `side` for a single-cue segment (the 2x2 puts the
    // same task's border on either hand), or `cueSides` {mov,or} for a two-cue
    // (PRP) segment. Falls back to spec.cueSides (the task-tied default) so the
    // disjoint/PRP paths are unchanged.
    let activeCueSides = {};
    let raf = null;
    let last = null;
    let stopped = false;
    let segmentIndex = 0;
    const timers = [];

    const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };
    const idleAll = () => {
        for (const set of keySets) keyImgs[set].src = DEMO_KEY_IDLE[set];
    };

    /** Depress a keycap at `at`, release it DEMO_KEY_HOLD_MS later. */
    const flashKey = (key, at) => {
        const { set, src } = demoKeycap(key);
        const img = keyImgs[set];
        timers.push(setTimeout(() => { img.src = src; }, at));
        timers.push(setTimeout(() => { img.src = DEMO_KEY_IDLE[set]; }, at + DEMO_KEY_HOLD_MS));
    };

    // Per-cue sides declared by a segment (or a `then` event): explicit `cueSides`
    // {mov,or}, or `side` paired with a single-cue `border`. Empty when neither is
    // given, so frame() falls back to spec.cueSides.
    function cueSidesOf(entry) {
        if (entry.cueSides) return { ...entry.cueSides };
        if (entry.side && typeof entry.border === 'string') return { [entry.border]: entry.side };
        return {};
    }

    function runSegment() {
        if (stopped) return;
        clearTimers();
        idleAll();

        const seg = spec.segments[segmentIndex % spec.segments.length];
        segmentIndex += 1;

        fish = [];
        for (let i = 0; i < count; i++) {
            const f = new DemoFish(canvas, i < signalCount);
            f.setState(seg.movement, seg.orientation);
            fish.push(f);
        }
        border = seg.border || null;
        activeCueSides = cueSidesOf(seg);

        if (seg.key) flashKey(seg.key, DEMO_KEY_AT_MS);

        if (seg.then) {
            const t = seg.then;
            const at = t.at === undefined ? DEMO_SOA_MS : t.at;
            timers.push(setTimeout(() => {
                if (stopped) return;
                for (const f of fish) f.setState(t.movement, t.orientation);
                if (t.border !== undefined) border = t.border;
                // Merge the `then` event's sides so a PRP second cue lands on its
                // own hand without clearing the first cue's side.
                activeCueSides = { ...activeCueSides, ...cueSidesOf(t) };
                if (t.key) flashKey(t.key, DEMO_KEY_AT_MS);
            }, at));
        }

        timers.push(setTimeout(runSegment, seg.duration || DEMO_SEGMENT_MS));
    }

    function drawFish(f) {
        ctx.globalAlpha = f.alpha;
        const s = DEMO_FISH_SIZE;
        if (!sprites) {
            // Abstract fallback (?stimulus=abstract): a circle when there is no
            // orientation to show, a triangle when there is — matching what SE's
            // Oob draws without an image.
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            if (f.or === null) {
                ctx.arc(f.x, f.y, s / 4, 0, Math.PI * 2);
            } else {
                const rad = f.or * Math.PI / 180;
                const nx = Math.cos(rad);
                const ny = -Math.sin(rad);
                ctx.moveTo(f.x + nx * s / 2, f.y + ny * s / 2);
                ctx.lineTo(f.x - nx * s / 2 - ny * s / 4, f.y - ny * s / 2 + nx * s / 4);
                ctx.lineTo(f.x - nx * s / 2 + ny * s / 4, f.y - ny * s / 2 - nx * s / 4);
            }
            ctx.fill();
        } else if (f.or === null) {
            const t = 16;   // fish_forward.png tile
            ctx.drawImage(sprites.imgDist, f.frame * t, f.variant * t, t, t,
                          f.x - s / 2, f.y - s / 2, s, s);
        } else if (f.or === 90 || f.or === 270) {
            // VERTICAL facing (fourcue). SE's OobImg.drawOrientated has no baked
            // up/down rows; it ROTATES the right-facing frame instead (fork
            // src/oob.js:193-206): up (90) -> -90deg, down (270) -> -270deg. Match
            // that exactly so the cartoon birds face up/down the same way the real
            // stimulus does. Horizontal facing (0/180) keeps its baked-row path
            // below, unchanged, so the disjoint cartoon is untouched.
            const t = 18;
            const rowIdx = f.variant * 2;   // right-facing row, then rotate
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate((-Math.PI * f.or) / 180);
            ctx.drawImage(sprites.img, f.frame * t, rowIdx * t, t, t,
                          -s / 2, -s / 2, s, s);
            ctx.restore();
        } else {
            const t = 18;   // fish_2.png tile
            const facingLeft = f.or > 90 && f.or < 270;
            const rowIdx = f.variant * 2 + (facingLeft ? 1 : 0);
            ctx.drawImage(sprites.img, f.frame * t, rowIdx * t, t, t,
                          f.x - s / 2, f.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
    }

    function frame(ts) {
        if (stopped) return;
        const dt = last === null ? 16 : ts - last;
        last = ts;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const f of fish) { f.update(dt); drawFish(f); }
        if (border) {
            // Proportional to SE's 30 px border on its 600 px canvas. A PRP trial
            // has TWO cues on screen at once (SE distinguishes them by dashes vs
            // dots); the cartoon nests them instead, which reads better at 150 px.
            const lw = Math.round(canvas.width * 0.05);
            const cues = Array.isArray(border) ? border : [border];
            const positional = spec.cueMode === 'hue+position';
            const halfW = canvas.width / 2;
            ctx.lineWidth = lw;
            cues.forEach((cue, i) => {
                const inset = lw / 2 + i * lw;
                ctx.strokeStyle = DEMO_CUE_COLORS[cue];
                const side = positional
                    ? (activeCueSides[cue] ?? (spec.cueSides && spec.cueSides[cue]) ?? null)
                    : null;
                if (side === 'left') {
                    // Open 3-sided bracket on the left: top half, left vertical, bottom half
                    ctx.beginPath();
                    ctx.moveTo(halfW, inset);
                    ctx.lineTo(inset, inset);
                    ctx.lineTo(inset, canvas.height - inset);
                    ctx.lineTo(halfW, canvas.height - inset);
                    ctx.stroke();
                } else if (side === 'right') {
                    // Open 3-sided bracket on the right: top half, right vertical, bottom half
                    ctx.beginPath();
                    ctx.moveTo(halfW, inset);
                    ctx.lineTo(canvas.width - inset, inset);
                    ctx.lineTo(canvas.width - inset, canvas.height - inset);
                    ctx.lineTo(halfW, canvas.height - inset);
                    ctx.stroke();
                } else {
                    ctx.strokeRect(inset, inset,
                                   canvas.width - 2 * inset, canvas.height - 2 * inset);
                }
            });
        }
        raf = requestAnimationFrame(frame);
    }

    runSegment();
    raf = requestAnimationFrame(frame);

    return {
        element: row,
        stop() {
            stopped = true;
            clearTimers();
            if (raf) cancelAnimationFrame(raf);
            raf = null;
        },
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        INSTRUCTION_DEMO_PX, INSTRUCTION_DEMO_BACKING,
        DEMO_KEYCAPS, DEMO_KEY_IDLE, demoKeycap, createInstructionDemo,
    };
}
