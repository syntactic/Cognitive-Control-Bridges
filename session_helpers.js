// session_helpers.js — Pure helper functions for session.js
// No DOM access, no SE package calls. Loaded before session.js.

// ============================================================
// Key mapping constants
// ============================================================

// How long (ms) the SE library keeps a trial alive after an earlyResolve response
// — enough for the feedback flash. Passed into every SE config so the library and
// session.js's ITI bookkeeping stay in sync: the runner subtracts this to recover
// the moment the participant actually responded.
const RESOLVE_DELAY = 150;

// Horizontal 2-direction presets (parallel / spatially-compatible S-R)
const LEFT_HAND_KEYS = { 180: 'a', 0: 'd' };
const RIGHT_HAND_KEYS = { 180: 'j', 0: 'l' };
const DUMMY_KEYS = { 180: '!', 0: '!' };

// Orthogonal 2-direction presets: vertical stimulus directions (90=up, 270=down)
// on the horizontal a/d, j/l keys, removing any spatial stimulus-response
// correspondence. Contrast NATURAL_WASD below, the parallel vertical mapping.
const LEFT_HAND_KEYS_ORTHOGONAL = { 90: 'a', 270: 'd' };
const RIGHT_HAND_KEYS_ORTHOGONAL = { 90: 'j', 270: 'l' };

// Vertical presets for the four-cue scheme: up/down on the physically-vertical
// W/S (left) and I/K (right) keys — a parallel vertical mapping, unlike the
// *_ORTHOGONAL presets. A task's direction pool derived from these keys is
// [90, 270], which makes the fourcue stimulus vertical with no separate geometry
// flag in the generator.
const LEFT_HAND_KEYS_VERTICAL = { 90: 'w', 270: 's' };
const RIGHT_HAND_KEYS_VERTICAL = { 90: 'i', 270: 'k' };

/**
 * Selects the left/right hand key-map presets for a given stimulus-response mapping.
 * @param {string} mapping - 'orthogonal' (vertical stimuli, horizontal keys) or
 *   anything else (default 'parallel': horizontal stimuli, horizontal keys).
 */
function handKeysForMapping(mapping) {
    return mapping === 'orthogonal'
        ? { left: LEFT_HAND_KEYS_ORTHOGONAL, right: RIGHT_HAND_KEYS_ORTHOGONAL }
        : { left: LEFT_HAND_KEYS, right: RIGHT_HAND_KEYS };
}

// Full 4-direction presets (spatially intuitive)
const NATURAL_WASD = { 0: 'd', 90: 'w', 180: 'a', 270: 's' };
const NATURAL_IJKL = { 0: 'l', 90: 'i', 180: 'j', 270: 'k' };

// Reversed 4-direction preset (spatially counterintuitive)
const UNNATURAL_WASD = { 0: 'a', 90: 's', 180: 'd', 270: 'w' };

// ============================================================
// Response-set schemes (Phase 2)
// ============================================================
// Single source of truth for what differs between the response-set schemes.
// cpApplyScheme (canonical_paradigms.js) stamps these fields onto every
// blockConfig at session build time; nothing else branches on the scheme name. A
// third scheme is a new entry here, not new `if`s.
//
// Self-contained: loaded standalone by test_session.js/test_quest.js, so it may
// reference only constants defined above (the hand-key presets), never
// canonical_paradigms.js. The disjoint keyMaps below duplicate
// CP_DISJOINT_KEY_MAPS — that file's copy is the load-time default baked into
// configs, this one is what cpApplyScheme stamps at runtime.
//
// Fields:
//   geometry.levelToDeg — maps SweetPea's abstract target_dir levels
//       ('left'/'right') to SE angles. Horizontal for disjoint, vertical for
//       fourcue — the one explicit geometry seam; the rest falls out of `keyMaps`
//       via assignDirections.
//   keyMaps — { mov, or } direction->key maps; consumed directly by buildSEConfig.
//   keyResolution — 'dimension-tied' (a key stays with its dimension) vs
//       'cue-driven' (key comes from the cued hand, so a single-cue trial's two
//       dimensions can resolve onto one hand — the substrate for a response-level
//       Stroop effect). These coincide under task-tied PRP and differ only on
//       single-cue bivalent trials. Drives training/model, not the runtime
//       go-signal (always the target's hand).
//   cueMode — 'hue' (border colored by task) vs 'hue+position' (also localized to
//       the cued hand's half; read by the SE fork).
const CP_SCHEMES = {
    disjoint: {
        name: 'disjoint',
        geometry: { axis: 'horizontal', levelToDeg: { left: 180, right: 0 } },
        keyMaps: { mov: { ...LEFT_HAND_KEYS }, or: { ...RIGHT_HAND_KEYS } },
        keyResolution: 'dimension-tied',
        cueMode: 'hue',
        cueBorderStyle: 'solid',
        sequenceDir: 'sequences',
    },
    fourcue: {
        name: 'fourcue',
        geometry: { axis: 'vertical', levelToDeg: { left: 90, right: 270 } },
        keyMaps: { mov: { ...LEFT_HAND_KEYS_VERTICAL }, or: { ...RIGHT_HAND_KEYS_VERTICAL } },
        keyResolution: 'cue-driven',
        cueMode: 'hue+position',
        cueBorderStyle: 'solid',
        sequenceDir: 'sequences_fourcue',
    },
    fourcue_cse: {
        name: 'fourcue_cse',
        geometry: { axis: 'vertical', levelToDeg: { left: 90, right: 270 } },
        keyMaps: { mov: { ...LEFT_HAND_KEYS_VERTICAL }, or: { ...RIGHT_HAND_KEYS_VERTICAL } },
        keyResolution: 'cue-driven',
        cueMode: 'hue+position',
        cueBorderStyle: 'solid',
        sequenceDir: 'sequences_fourcue_cse',
    },
};

/** Resolve a scheme name to its descriptor, defaulting to disjoint (Phase 1). */
function cpResolveScheme(name) {
    return CP_SCHEMES[name] || CP_SCHEMES.disjoint;
}

// ============================================================
// SE config builders
// ============================================================

// Which physical hand a key map sits on, inferred from the key letters (left vs
// right home-block). Used to tell the fork which half of the canvas a task's
// positional cue goes on under the fourcue scheme. Mirrors cpHandFor in
// canonical_paradigms.js; kept here too because session_helpers.js is loaded
// standalone by the tests and must not depend on that file.
const SE_LEFT_HAND_LETTERS = 'qwertasdfgzxcvb';
const SE_RIGHT_HAND_LETTERS = 'yuiophjklnm';
function seHandSideOf(keyMap) {
    const keys = Object.values(keyMap || {}).map((k) => String(k).toLowerCase());
    if (keys.length === 0) return null;
    if (keys.every((k) => SE_LEFT_HAND_LETTERS.includes(k))) return 'left';
    if (keys.every((k) => SE_RIGHT_HAND_LETTERS.includes(k))) return 'right';
    return null;
}

/**
 * SE config for single-canvas key mappings.
 *
 * When keyMaps is provided (from blockConfig), it takes precedence over rso.
 * Otherwise falls back to preset mappings based on rso.
 *
 * `size` no longer determines the on-screen canvas size. SE computes that from
 * the viewport (min(vw, vh) * size), which overflows the fixed 600 px
 * #canvas-container on any reasonably large window; index.html pins the
 * single-canvas element to the container with `width/height: 100% !important`.
 * The value is kept only so SE's own default (0.75) is not the one in play.
 *
 * @param {string} rso - 'disjoint' or 'identical'
 * @param {boolean} earlyResolve
 * @param {{ mov: object, or: object }} [keyMaps] - explicit key maps from block config
 * @param {string} [cueMode] - 'hue' (default) or 'hue+position'. Passed straight
 *   into the SE config; the fork's game.js reads it to localize the border to the
 *   cued hand's half. `movCueSide`/`orCueSide` (inferred from the key hands) tell
 *   it which half.
 * @param {string} [cueBorderStyle] - 'solid' or 'segmented'.
 */
function buildSEConfig(
    rso,
    earlyResolve,
    feedback,
    acceptFirstResponse,
    keyMaps,
    cueMode,
    cueBorderStyle,
) {
    if (keyMaps) {
        return {
            movementKeyMap: { ...keyMaps.mov },
            orientationKeyMap: { ...keyMaps.or },
            size: 0.75,
            resolveDelay: RESOLVE_DELAY,
            acceptFirstResponse,
            feedback,
            earlyResolve,
            cueMode: cueMode || 'hue',
            cueBorderStyle: cueBorderStyle || 'solid',
            movCueSide: seHandSideOf(keyMaps.mov),
            orCueSide: seHandSideOf(keyMaps.or),
        };
    }
    if (rso === 'disjoint') {
        return {
            movementKeyMap: { ...LEFT_HAND_KEYS },
            orientationKeyMap: { ...RIGHT_HAND_KEYS },
            size: 0.75,
            resolveDelay: RESOLVE_DELAY,
            acceptFirstResponse,
            feedback,
            earlyResolve,
            cueBorderStyle: cueBorderStyle || 'segmented',
        };
    }
    // identical RSO (default, Hirsch)
    return {
        movementKeyMap: { ...LEFT_HAND_KEYS },
        orientationKeyMap: { ...LEFT_HAND_KEYS },
        size: 0.75,
        resolveDelay: RESOLVE_DELAY,
        acceptFirstResponse,
        feedback,
        earlyResolve,
        cueBorderStyle: cueBorderStyle || 'segmented',
    };
}

/**
 * True when a block's per-trial hand (meta.hand) should drive key/cue-side
 * routing: fourcue cueMode, and single-canvas (not dual-canvas/alternating/
 * prp-baseline/dual-task, all of which are task- or side-tied instead).
 */
function isFourcueSingleTaskBlock(blockConfig, canvasType) {
    return (
        blockConfig.cueMode === 'hue+position' &&
        canvasType !== 'dual-canvas' &&
        canvasType !== 'alternating' &&
        canvasType !== 'prp-baseline' &&
        blockConfig.paradigm !== 'dual-task'
    );
}

/**
 * Per-trial key maps for a SINGLE-TASK fourcue trial.
 *
 * The fourcue scheme decouples hand from task: the cued task is answered with the
 * cued HAND (border side), which varies trial-to-trial. Given the trial's task and
 * hand, the CUED task takes the cued hand's vertical keys and the OTHER task takes
 * the other hand's — so buildSEConfig's `seHandSideOf` places the cue on the right
 * half (movCueSide/orCueSide fall out of the keys), and a wrong-HAND press still
 * lands in a real key map and is scored as an error rather than being dropped.
 * Only the cued task's go signal fires, so the other map is never a correct answer.
 *
 * @param {'mov'|'or'} task - the cued (target) task
 * @param {'left'|'right'} hand - the cued response hand
 * @returns {{ mov: object, or: object }} key maps to hand to buildSEConfig
 */
function fourcueSingleTaskKeyMaps(task, hand) {
    const cued = hand === 'right' ? RIGHT_HAND_KEYS_VERTICAL : LEFT_HAND_KEYS_VERTICAL;
    const other = hand === 'right' ? LEFT_HAND_KEYS_VERTICAL : RIGHT_HAND_KEYS_VERTICAL;
    return task === 'mov'
        ? { mov: { ...cued }, or: { ...other } }
        : { mov: { ...other }, or: { ...cued } };
}

/**
 * One canvas's SE config: the active task gets `keys`, the other gets DUMMY_KEYS.
 * Shared shape behind buildDualCanvasSEConfigs and buildAlternatingSEConfig.
 *
 * @param {string} task - 'mov' or 'or' — which pathway is active on this canvas
 * @param {object} keys - key map for the active task (not yet spread)
 * @param {{earlyResolve: boolean, feedback: boolean, acceptFirstResponse: boolean, size: number}} opts
 */
function makeCanvasSEConfig(task, keys, { earlyResolve, feedback, acceptFirstResponse, size }) {
    const config = {
        size,
        acceptFirstResponse,
        feedback,
        earlyResolve,
        resolveDelay: RESOLVE_DELAY,
    };
    if (task === 'mov') {
        config.movementKeyMap = { ...keys };
        config.orientationKeyMap = { ...DUMMY_KEYS };
    } else {
        config.orientationKeyMap = { ...keys };
        config.movementKeyMap = { ...DUMMY_KEYS };
    }
    return config;
}

/**
 * Build SE configs for simultaneous dual-canvas display.
 * Left canvas uses left-hand keys, right canvas uses right-hand keys.
 * The inactive pathway on each canvas gets dummy (unmatchable) keys.
 *
 * @param {string} leftTask - 'mov' or 'or'
 * @param {string} rightTask - 'mov' or 'or'
 * @param {boolean} earlyResolve - whether the trial resolves on response
 * @param {number} size - canvas size (fraction of viewport)
 */
function buildDualCanvasSEConfigs(
    leftTask,
    rightTask,
    earlyResolve,
    feedback,
    acceptFirstResponse,
    size,
    mapping,
) {
    const { left: leftKeys, right: rightKeys } = handKeysForMapping(mapping);
    const opts = { earlyResolve, feedback, acceptFirstResponse, size };
    return {
        leftConfig: makeCanvasSEConfig(leftTask, leftKeys, opts),
        rightConfig: makeCanvasSEConfig(rightTask, rightKeys, opts),
    };
}

/**
 * Build SE config for a single canvas in a sided (alternating/baseline) display.
 * Maps the active task to the correct hand based on side.
 *
 * @param {string} task - 'mov' or 'or'
 * @param {string} side - 'left' or 'right'
 * @param {boolean} earlyResolve - whether the trial resolves on response
 * @param {number} size - canvas size (fraction of viewport)
 */
function buildAlternatingSEConfig(
    task,
    side,
    earlyResolve,
    feedback,
    acceptFirstResponse,
    size,
    mapping,
) {
    const handKeys = handKeysForMapping(mapping);
    const sideKeys = side === 'left' ? handKeys.left : handKeys.right;
    return makeCanvasSEConfig(task, sideKeys, {
        earlyResolve,
        feedback,
        acceptFirstResponse,
        size,
    });
}

// ============================================================
// Key-task mapping
// ============================================================

/**
 * Build lookup sets mapping keys to task number (1 or 2) for disjoint RSO.
 * Returns null for identical RSO (falls back to temporal ordering).
 */
function buildKeyTaskMap(seConfig, trial) {
    const movKeys = Object.values(seConfig.movementKeyMap || {});
    const orKeys = Object.values(seConfig.orientationKeyMap || {});
    const isDisjoint =
        movKeys.length > 0 && orKeys.length > 0 && !movKeys.some((k) => orKeys.includes(k));
    if (!isDisjoint) return null;
    const task1 = trial.meta.t1_task;
    const task1Keys = task1 === 'mov' ? movKeys : orKeys;
    const task2Keys = task1 === 'mov' ? orKeys : movKeys;
    return { task1Keys, task2Keys };
}

/**
 * Look at a finished single-task trial and name the mapping error it shows, so a training
 * hint can respond to it. Returns:
 *   'wrong-set'  - the first press used the other hand's keys.
 *   'reversal'   - the right hand, but the opposite direction to the target, on a trial
 *                  where that press can't be the distractor (univalent or congruent).
 *   'distractor' - the right hand, but the direction the distractor points, on an
 *                  incongruent trial: the participant answered the wrong feature.
 *   null         - correct, unreadable, or not a case a hint should touch.
 *
 * Reads the first press after stimulus onset (training resolves on the first press, so that
 * press is the response). Only fires on disjoint key maps, where hand and direction are
 * separable. 'reversal' and 'distractor' are complementary and mutually exclusive per trial:
 * an opposite press is read as a flipped mapping only when it can't be the distractor, and as
 * distractor-tracking only when it matches the distractor's direction on an incongruent trial.
 */
function classifyMappingError(trialData, seConfig) {
    const task = trialData.t1_task;
    if (task !== 'mov' && task !== 'or') return null;
    if (trialData.paradigm === 'dual-task') return null;

    const movMap = seConfig.movementKeyMap || {};
    const orMap = seConfig.orientationKeyMap || {};
    const movKeys = Object.values(movMap);
    const orKeys = Object.values(orMap);
    const disjoint = movKeys.length && orKeys.length && !movKeys.some((k) => orKeys.includes(k));
    if (!disjoint) return null;

    const correctMap = task === 'mov' ? movMap : orMap;
    const correctKeys = Object.values(correctMap);
    const otherKeys = task === 'mov' ? orKeys : movKeys;
    const targetKey = correctMap[trialData.t1_target_dir];

    let presses;
    try {
        presses = JSON.parse(trialData.rawKeyPresses || '[]');
    } catch {
        return null;
    }
    const onset = trialData.t1_stim_onset ?? 0;
    const first = presses.find((kp) => kp.time >= onset);
    if (!first) return null;

    if (otherKeys.includes(first.key)) return 'wrong-set';

    if (correctKeys.includes(first.key) && first.key !== targetKey) {
        const distractor = trialData.t1_distractor_dir;
        // Univalent or congruent: an opposite press can only be a flipped mapping.
        if (distractor == null || distractor === trialData.t1_target_dir) return 'reversal';
        // Incongruent: the press is the key the distractor's direction maps to in the cued
        // task's own map, so the participant tracked the wrong feature rather than the keys.
        if (first.key === correctMap[distractor]) return 'distractor';
    }
    return null;
}

// ============================================================
// Response extraction
// ============================================================

/**
 * Extract RT and accuracy from a single keypress stream. Shared core used by all
 * the response extractors. Walks presses in order:
 *   - before stimulus onset → counted as anticipations and skipped
 *   - first correct press → record RT, classify 'correct' or 'corrected'
 *   - incorrect presses before a correct one → tracked as errors
 *   - no correct press → 'error' (if any presses) or 'miss' (if none)
 *
 * Skipping anticipations matters under acceptFirstResponse, which otherwise takes
 * the first keypress whenever it arrived: on a dual-canvas trial the T2 canvas is
 * blank for one SOA, so a twitch in that window was being recorded as the T2
 * response with a negative rt, discarding the real response.
 *
 * @param {Array} keyPresses - array of { key, time, isCorrect }
 * @param {number} stimulusOnset - imperative stimulus onset, in the same
 *   canvas-local ms as kp.time; the RT zero point. Not the go-signal onset: since
 *   the CSI fix, go opens with the cue, csi ms before the stimulus.
 * @returns {{ rt, rt_raw, accuracy, consumedCount, anticipations }}
 *   consumedCount: presses processed up to and including the first correct one;
 *   the identical-RSO path uses it to split the stream for T2.
 */
function extractSingleStreamResponse(keyPresses, stimulusOnset, acceptFirstResponse) {
    let rt_raw = null;
    let accuracy = 'miss';
    let hadError = false;
    let consumedCount = 0;
    let anticipations = 0;

    for (let i = 0; i < keyPresses.length; i++) {
        const kp = keyPresses[i];
        consumedCount = i + 1;
        if (kp.time < stimulusOnset) {
            anticipations++;
            continue;
        }
        if (kp.isCorrect) {
            rt_raw = kp.time;
            accuracy = hadError ? 'corrected' : 'correct';
            break;
        } else {
            hadError = true;
            accuracy = 'error';
            if (acceptFirstResponse) {
                rt_raw = kp.time;
                break;
            }
        }
    }

    const rt = rt_raw !== null ? rt_raw - stimulusOnset : null;
    return { rt, rt_raw, accuracy, consumedCount, anticipations };
}

/**
 * Extract RT and accuracy from SE data (single-canvas, single- or dual-task).
 *
 * SE keypress entries have: { eventType, key, time, isCorrect }
 *   - time: ms relative to block (i.e., trial) onset
 *   - isCorrect: true if key matched the active go signal
 *   - No field distinguishes go1 vs go2.
 *
 * For disjoint RSO: we identify which task a keypress belongs to by
 * checking which key set it falls in. This correctly handles response
 * reversals (T2 answered before T1).
 *
 * For identical RSO: falls back to temporal ordering (1st correct → T1,
 * 2nd correct → T2). This is inherently ambiguous for response reversals.
 *
 * Since sleep(iti) happens before block(), block-internal timestamps
 * start at 0 (after ITI). No ITI subtraction needed.
 */
function extractResponse(data, trial, seConfig) {
    const keyPresses = data.keyPresses || [];
    const isDualTask = trial.meta.paradigm === 'dual-task';
    const keyMap = isDualTask ? buildKeyTaskMap(seConfig, trial) : null;

    let t1Result, t2Result;

    const t1Onset = trial.meta.t1_stim_onset;
    const t2Onset = trial.meta.t2_stim_onset;

    if (keyMap) {
        // Disjoint RSO: split keypresses by key set, extract independently
        const t1Presses = keyPresses.filter((kp) => keyMap.task1Keys.includes(kp.key));
        const t2Presses = keyPresses.filter((kp) => keyMap.task2Keys.includes(kp.key));
        t1Result = extractSingleStreamResponse(t1Presses, t1Onset, seConfig.acceptFirstResponse);
        t2Result = extractSingleStreamResponse(t2Presses, t2Onset, seConfig.acceptFirstResponse);
    } else {
        // Identical RSO or single-task: temporal ordering
        t1Result = extractSingleStreamResponse(keyPresses, t1Onset, seConfig.acceptFirstResponse);
        if (isDualTask) {
            const remaining = keyPresses.slice(t1Result.consumedCount);
            t2Result = extractSingleStreamResponse(
                remaining,
                t2Onset,
                seConfig.acceptFirstResponse,
            );
        }
    }

    return {
        rt1_raw: t1Result.rt_raw,
        rt1: t1Result.rt,
        accuracy1: t1Result.accuracy,
        anticipations1: t1Result.anticipations,
        rt2_raw: isDualTask ? (t2Result.rt_raw ?? null) : null,
        rt2: isDualTask ? (t2Result.rt ?? null) : null,
        accuracy2: isDualTask ? (t2Result.accuracy ?? 'miss') : null,
        anticipations2: isDualTask ? (t2Result.anticipations ?? 0) : null,
        responseOrder:
            isDualTask && t1Result.rt_raw !== null && t2Result.rt_raw !== null
                ? t1Result.rt_raw <= t2Result.rt_raw
                    ? 'T1-first'
                    : 'T2-first'
                : null,
        rawKeyPresses: JSON.stringify(keyPresses),
    };
}

/**
 * Single-stream paradigms (alternating task switching, PRP baseline). Only one
 * task is on screen, but which ROLE it plays differs: alternating shows T1,
 * while the baseline's T1 is the asterisk and the responded-to task is T2.
 * runBaselinePRPTrial remaps the slots afterwards; here we just need whichever
 * onset is non-null.
 */
function extractAlternatingResponse(data, trial, seConfig) {
    const onset = trial.meta.t1_stim_onset ?? trial.meta.t2_stim_onset;
    const result = extractSingleStreamResponse(
        data.keyPresses,
        onset,
        seConfig.acceptFirstResponse,
    );
    return {
        rt1: result.rt,
        rt1_raw: result.rt_raw,
        accuracy1: result.accuracy,
        anticipations1: result.anticipations,
        rt2: null,
        rt2_raw: null,
        accuracy2: null,
        anticipations2: null,
        rawKeyPresses: JSON.stringify(data.keyPresses),
    };
}

function extractDualCanvasResponse(t1Data, t2Data, t1StimOnset, t2StimOnset, t1Config, t2Config) {
    const t1Result = extractSingleStreamResponse(
        t1Data.keyPresses,
        t1StimOnset,
        t1Config.acceptFirstResponse,
    );
    const t2Result = extractSingleStreamResponse(
        t2Data.keyPresses,
        t2StimOnset,
        t2Config.acceptFirstResponse,
    );

    let responseOrder = null;
    if (t1Result.rt_raw !== null && t2Result.rt_raw !== null) {
        responseOrder = t2Result.rt_raw - t1Result.rt_raw > 0 ? 'T1-first' : 'T2-first';
    }

    return {
        rt1: t1Result.rt,
        rt1_raw: t1Result.rt_raw,
        accuracy1: t1Result.accuracy,
        rt2: t2Result.rt,
        rt2_raw: t2Result.rt_raw,
        accuracy2: t2Result.accuracy,
        anticipations1: t1Result.anticipations,
        anticipations2: t2Result.anticipations,
        responseOrder,
        rawKeyPresses: JSON.stringify({ t1: t1Data.keyPresses, t2: t2Data.keyPresses }),
    };
}

/**
 * Read back the coherence actually written into a trial's SE params (post
 * Quest/ramp override) for CSV logging. Single-canvas T2 lives on channel 2
 * (_2 suffix); dual-canvas T2 is its own canvas's channel 1 (_1 suffix).
 * Keys are omitted (not set to undefined) when the task is absent, matching
 * how single-task/prp-baseline trials leave task_2 null.
 */
function deriveTargetCoherenceFields(task_1, task_2, t1Params, t2Params, canvasType) {
    const fields = {};
    if (task_1) {
        fields.t1_target_coherence = t1Params['coh_' + task_1 + '_1'];
    }
    if (task_2) {
        const t2Suffix = canvasType === 'dual-canvas' ? '_1' : '_2';
        fields.t2_target_coherence = t2Params['coh_' + task_2 + t2Suffix];
    }
    return fields;
}

// ============================================================
// Sequence-pool draw
// ============================================================
// A participant's five test blocks are drawn from a shared pool of
// independently balanced single-block CSVs (sequences/<paradigm>_<condition>_s<NNN>.csv).
// There is no assignment table: every pool block is balanced on its own, so any
// five of them make a balanced session and nothing needs to be counted centrally.
// Paradigm and condition DO need balancing, and Prolific TaskFlow does that by
// routing participants across one URL per cell.
//
// The draw is SEEDED on the participant identifier rather than left to
// Math.random(). The reason is reload: an unseeded draw gives a participant
// different blocks if they refresh, so a partially-saved session and its retry
// could overlap or duplicate blocks. Seeded, the same identifier always yields
// the same five in the same order.

/** FNV-1a, 32-bit. Any small string hash would do; this one is short and stable. */
function hashSeed(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < String(str).length; i++) {
        h ^= String(str).charCodeAt(i);
        // 32-bit FNV prime multiply, kept in range with Math.imul.
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** mulberry32 — a 32-bit PRNG, ~10 lines, uniform enough to shuffle 50 items. */
function makeSeededRng(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Draw `count` distinct sequence IDs from a pool of `poolSize`, sampled deterministically
 * without replacement and shuffled using `seedKey`.
 *
 * @param {string} seedKey - Stable participant seed, e.g. `${pid}|${paradigm}|${condition}`
 * @param {number} poolSize - Total available sequences in the pool (1-indexed)
 * @param {number} count - Number of unique sequences to draw
 * @returns {number[]} Array of distinct sequence IDs in random order
 */
function drawSequenceIds(seedKey, poolSize, count) {
    if (!Number.isInteger(poolSize) || poolSize < 1) {
        throw new Error(`drawSequenceIds: poolSize must be a positive integer, got ${poolSize}`);
    }
    if (!Number.isInteger(count) || count < 1) {
        throw new Error(`drawSequenceIds: count must be a positive integer, got ${count}`);
    }
    if (count > poolSize) {
        throw new Error(
            `drawSequenceIds: cannot draw ${count} distinct sequences from a pool of ` +
                `${poolSize}. Generate a larger pool (sweetpea/generate.py --pool N) and ` +
                'raise CP_SEQUENCE_POOL_SIZE to match.',
        );
    }
    if (seedKey === undefined || seedKey === null || String(seedKey) === '') {
        throw new Error(
            'drawSequenceIds: seedKey is required — an unseeded draw is not reproducible across a reload',
        );
    }
    const rng = makeSeededRng(hashSeed(seedKey));
    const ids = Array.from({ length: poolSize }, (_, i) => i + 1);
    for (let i = 0; i < count; i++) {
        const j = i + Math.floor(rng() * (poolSize - i));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, count);
}

function argMax(arr) {
    let currMax = Number.NEGATIVE_INFINITY;
    let maxIndex = 0;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] >= currMax) {
            currMax = arr[i];
            maxIndex = i;
        }
    }
    return maxIndex;
}

function createQuest(priorMean, priorSD) {
    const numValues = 100;
    const logMin = Math.log10(0.01);
    const step = Math.abs(logMin / numValues);
    const intensityAxis = createAxis();
    const logMean = Math.log10(priorMean);
    const logUpper = Math.log10(priorMean + priorSD);
    const logLower = Math.log10(priorMean - priorSD);
    const logSD = (logUpper - logLower) / 2;

    const gamma = 0.5;
    const delta = 0.02;
    const beta = 3.5;
    const epsilon = 0.03315;
    let qArray = computePrior(intensityAxis, logMean, logSD);
    const originalPrior = [...qArray];

    function createAxis() {
        const axis = new Array(numValues).fill(0);
        for (let i = 0; i < axis.length; i++) {
            axis[i] = logMin + i * step;
        }
        return axis;
    }

    function computePrior(intensityAxis, priorMean, priorSD) {
        let logPrior = new Array(intensityAxis.length).fill(0);
        // Drops the log(priorSD) and 0.5*log(2*pi) normalizing terms — constant
        // across the loop, so they don't affect argMax.
        for (let i = 0; i < intensityAxis.length; i++) {
            logPrior[i] = -0.5 * ((intensityAxis[i] - priorMean) / priorSD) ** 2;
        }
        return logPrior;
    }

    function psi(x) {
        return gamma + (1 - gamma - delta) * (1 - Math.exp(-(10 ** (beta * (x + epsilon)))));
    }

    // s/f: log-likelihood of a correct/incorrect response, indexed by distance
    // (in axis steps) between tested and hypothesis intensity. Padded to 201
    // entries (±100 steps) so `update` can slide-and-index without bounds checks
    // per hypothesis.
    const rulebooks = compute_s_and_f();

    function compute_s_and_f() {
        const padding = numValues;
        const size = 2 * padding + 1;
        const s = new Array(size).fill(0);
        const f = new Array(size).fill(0);
        for (let i = 0; i < size; i++) {
            const distance_x = (i - padding) * step;
            const p = psi(distance_x);
            s[i] = Math.log(p);
            f[i] = Math.log(1 - p);
        }
        return { s, f };
    }

    function getNextIntensity() {
        return 10 ** intensityAxis[argMax(qArray)];
    }

    function update(testedCoherence, wasCorrect) {
        const logIntensity = Math.log10(testedCoherence);
        const testedIndex = Math.round((logIntensity - logMin) / step);
        const arrayToUse = wasCorrect ? rulebooks.s : rulebooks.f;
        for (let i = 0; i < qArray.length; i++) {
            // (testedIndex - i) is the hypothesis's distance from what was
            // tested; + numValues re-centers it into the padded rulebook.
            const shiftIndex = testedIndex - i + numValues;
            // Guards a testedCoherence far outside the expected min/max.
            if (shiftIndex >= 0 && shiftIndex < arrayToUse.length) {
                qArray[i] += arrayToUse[shiftIndex];
            }
        }
    }

    function getFinalEstimate() {
        const likelihoodOnly = qArray.map((val, i) => val - originalPrior[i]);
        return 10 ** intensityAxis[argMax(likelihoodOnly)];
    }

    return {
        getNextIntensity,
        update,
        getFinalEstimate,
    };
}

// Hard cap on trials per training stage. Good participants pass the criterion
// early, so the cap mostly bounds strugglers and keeps worst-case training in
// budget. Windows run 16..36 (21 overlapping windows); advancement_rates.js
// computes the exact chance-passing floors.
const TRAINING_CAP = 36;

/**
 * Summarize the rolling advancement window over everything run so far.
 *
 * Single source of truth for both the stop-early predicate and the per-stage log
 * fields (`criterion_met`, `final_window_accuracy`) — same threshold, same slice,
 * so they can't drift apart.
 *
 * @param {boolean[]} correctnessHistory - one entry per trial run in this stage
 *   so far, in order; true = counted as correct for advancement
 * @param {number} windowSize - rolling window size (default: 16)
 * @param {number} threshold - correct responses needed in the window (default:
 *   14). A stage may override it (the two-response PRP stage uses 12), but the
 *   default must never be lowered: at 10/16 a pure guesser clears the criterion
 *   most of the time across the cap, voiding the exclusion rule for the
 *   single-task stages. See analysis/advancement_rates.js for the exact rates.
 * @returns {{ windowLength: number, numCorrect: number, windowSize: number,
 *             threshold: number, accuracy: number|null, criterionMet: boolean }}
 *   accuracy is the mean over the last min(windowSize, history length) trials,
 *   or null when no trial has run yet. windowSize/threshold are echoed back so a
 *   stage summary can record which criterion it was scored against.
 */
function summarizeAdvancementWindow(correctnessHistory, windowSize = 16, threshold = 14) {
    const window = correctnessHistory.slice(-windowSize);
    const numCorrect = window.filter(Boolean).length;
    return {
        windowLength: window.length,
        numCorrect,
        windowSize,
        threshold,
        accuracy: window.length > 0 ? numCorrect / window.length : null,
        // A partial window (fewer than windowSize trials) can't meet the criterion.
        criterionMet: window.length >= windowSize && numCorrect >= threshold,
    };
}

/**
 * True if the participant meets the rolling-window advancement criterion (14/16
 * correct) given everything run so far. False until a full window exists.
 *
 * @param {boolean[]} correctnessHistory - one entry per trial run in this stage
 *   so far, in order; true = counted as correct for advancement
 * @param {number} windowSize - rolling window size (default: 16)
 * @param {number} threshold - correct responses needed in the window (default: 14)
 * @returns {boolean}
 */
function meetsAdvancementCriterion(correctnessHistory, windowSize = 16, threshold = 14) {
    return summarizeAdvancementWindow(correctnessHistory, windowSize, threshold).criterionMet;
}

/**
 * Whether a trial counts as "correct" for training-stage advancement (feeds
 * meetsAdvancementCriterion's correctnessHistory). 'correct' and 'corrected' both
 * count; 'error'/'miss' don't. A two-response trial counts only if both are correct.
 *
 * @param {object} trialData - merged trial result, as pushed to allTrialData
 *   (has accuracy1 always; accuracy2 only for two-response stages, else null)
 * @returns {boolean}
 */
function isTrialCorrectForAdvancement(trialData) {
    let correct = true;
    if (trialData.accuracy1 != null) {
        correct = correct && trialData.accuracy1.startsWith('correct');
    }
    if (trialData.accuracy2 != null) {
        correct = correct && trialData.accuracy2.startsWith('correct');
    }
    return Boolean(correct);
}

// Default length of the S2-S4 coherence ramp, in trials. Set to windowSize - 1 =
// 15 so the ramp bottoms out on the 16th trial, i.e. exactly when the earliest
// 14/16 window (trials 0..15) closes. If the ramp were still declining inside a
// window the criterion evaluates, "14/16 correct" would partly reflect
// easier-than-test trials — so every window the criterion sees is at real test
// difficulty, keeping "met criterion" meaning "has the mapping".
const TRAINING_RAMP_LENGTH = 15;

/**
 * Reject blockConfig flag combinations that produce silently wrong data. Called
 * by runBlock before any trial is generated. Both bad configs run to completion
 * and export a full CSV, so the failure only surfaces as an uninterpretable
 * effect during analysis — hence throwing rather than warning.
 *
 * @param {object} blockConfig
 * @throws {Error} on earlyResolve-without-acceptFirstResponse, or a coherence
 *   ramp on a dual-task block
 */
function assertValidBlockConfig(blockConfig) {
    const id = blockConfig.blockId || '(unnamed block)';

    // SE's src/trial.js gates early resolution on
    //   earlyResolve && (isCorrect || acceptFirstResponse)
    // so earlyResolve alone resolves early only on a correct press: a wrong press
    // leaves the trial running, the participant corrects it, and
    // extractSingleStreamResponse scores it 'corrected' with the second press's RT.
    // That's the most correction-friendly regime, not a neutral one, and
    // isTrialCorrectForAdvancement counts 'corrected' as correct — so a training
    // criterion becomes satisfiable by pressing both keys.
    if (blockConfig.earlyResolve && !blockConfig.acceptFirstResponse) {
        throw new Error(
            `blockConfig '${id}': earlyResolve is true but acceptFirstResponse is false. ` +
                'That combination resolves the trial early only on a CORRECT press, so an ' +
                "error is comfortably corrected and scored 'corrected' with the second " +
                "press's RT. earlyResolve does NOT imply acceptFirstResponse: set " +
                'acceptFirstResponse: true (first press is the response) or ' +
                'earlyResolve: false.',
        );
    }

    // runBlock's ramp writes coh_<task_1>_1
    // only, so on a dual-task block T2's channel is never ramped: the ramp becomes
    // a T1-difficulty manipulation crossed with SOA — the exact confound PRP
    // exists to measure. Ramping both channels would fix the asymmetry but still
    // rehearses something the test block never shows.
    if (blockConfig.coherenceRamp && blockConfig.paradigm === 'dual-task') {
        throw new Error(
            `blockConfig '${id}': coherenceRamp is not allowed on a 'dual-task' block. ` +
                "The ramp writes T1's channel only (coh_<task>_1), so T2 would run at test " +
                'coherence throughout — a silent T1-difficulty manipulation crossed with SOA, ' +
                'which is the exact confound a PRP block exists to measure.',
        );
    }
}

/**
 * Resolve the bottom of a coherence ramp for one trial's task.
 *
 * Exists to make the second silent failure loud: `ramp.to` may be a per-task
 * table ({ mov, or }), and a paradigm whose `t1_task` is null (the prp-baseline
 * shape) resolves that table to `undefined`. rampedCoherence would then return
 * NaN for every mid-ramp trial and runBlock would write a `coh_null_1` key that
 * SE ignores — a stage that silently never ramps at all.
 *
 * @param {{ from: number, to: number|object, rampLength?: number }} ramp
 * @param {string|null} task - the trial's T1 task ('mov' | 'or')
 * @returns {number} the finite coherence the ramp descends to
 * @throws {Error} when the ramp target does not resolve to a finite number
 */
function resolveRampTarget(ramp, task, blockId) {
    const to = typeof ramp.to === 'number' ? ramp.to : ramp.to != null ? ramp.to[task] : undefined;
    if (!Number.isFinite(to)) {
        throw new Error(
            `blockConfig '${blockId || '(unnamed block)'}': coherenceRamp.to did not resolve ` +
                `to a finite number for task '${task}' (got ${JSON.stringify(to)}). ` +
                'A per-task ramp table needs an entry for every task the stage can present, ' +
                'and a stage whose t1_task is null cannot carry a per-task ramp at all.',
        );
    }
    if (!Number.isFinite(ramp.from)) {
        throw new Error(
            `blockConfig '${blockId || '(unnamed block)'}': coherenceRamp.from must be a ` +
                `finite number (got ${JSON.stringify(ramp.from)}).`,
        );
    }
    return to;
}

/**
 * Linear coherence ramp for a training stage: start at
 * ceiling coherence so the participant can see what the task is, and descend to
 * the real test-level coherence before the advancement criterion can fire.
 *
 * Paradigm-agnostic by design — numbers in, number out. The `to` value (CP_EASY,
 * CP_HARD, a Stroop level, ...) is supplied by whatever builds the stage config.
 *
 * @param {number} trialIndex - 0-based index of the trial within the stage
 * @param {number} fromCoherence - coherence at trialIndex 0 (typically 1.0)
 * @param {number} toCoherence - coherence at trialIndex rampLength - 1, and for
 *   every trial after that
 * @param {number} rampLength - number of trials the descent spans
 * @returns {number}
 */
function rampedCoherence(
    trialIndex,
    fromCoherence,
    toCoherence,
    rampLength = TRAINING_RAMP_LENGTH,
) {
    if (rampLength <= 1) return toCoherence;
    if (trialIndex <= 0) return fromCoherence;
    if (trialIndex >= rampLength - 1) return toCoherence;
    const progress = trialIndex / (rampLength - 1);
    return fromCoherence + (toCoherence - fromCoherence) * progress;
}

/**
 * Accuracy and mean RT over a set of trial rows — the between-blocks compromise
 * that replaces trial-level feedback.
 *
 * `feedback: false` in the test blocks removes the participant's only
 * speed-accuracy signal, on purpose: a right/wrong event on trial n would land
 * inside trial n+1's response-selection window, and post-error effects are a
 * research question we don't want baked into the data. A summary shown strictly
 * between blocks restores that calibration at zero trial-level cost — which is why
 * the caller in session.js must never move it next to a trial.
 *
 * Counts responses, not trials, so a two-response PRP block reports the same
 * quantity a single-task block does (a joint "both correct" rate would read as
 * mysteriously low to someone doing fine on each task). Mean RT is over correct
 * responses only, as everywhere else.
 *
 * @param {object[]} rows - trial rows as pushed to allTrialData
 * @returns {{numResponses, numCorrect, accuracy, meanRt}|null} null when the
 *   rows contain no scored response at all (nothing honest to report)
 */
function summarizeBlockPerformance(rows) {
    let numResponses = 0;
    let numCorrect = 0;
    let rtSum = 0;
    let rtCount = 0;
    for (const row of rows) {
        for (const [accuracy, rt] of [
            [row.accuracy1, row.rt1],
            [row.accuracy2, row.rt2],
        ]) {
            if (accuracy == null) continue;
            numResponses++;
            if (!accuracy.startsWith('correct')) continue;
            numCorrect++;
            if (typeof rt === 'number' && Number.isFinite(rt)) {
                rtSum += rt;
                rtCount++;
            }
        }
    }
    if (numResponses === 0) return null;
    return {
        numResponses,
        numCorrect,
        accuracy: numCorrect / numResponses,
        meanRt: rtCount > 0 ? rtSum / rtCount : null,
    };
}

/**
 * One participant-facing line for the break screen, or null when there's nothing
 * to report. Purely factual and worded identically every time: phrasing that
 * varied with performance would be an evaluative signal, which is exactly what
 * this summary is meant to avoid.
 */
function formatBreakSummary(summary) {
    if (!summary) return null;
    const accuracy = `${Math.round(summary.accuracy * 100)}% correct`;
    const rt =
        summary.meanRt !== null ? `, average ${Math.round(summary.meanRt)} ms per answer` : '';
    return `Since the last break: ${accuracy}${rt}.`;
}

// ---- Capped, mash-proof inter-block break --------------------------------
//
// Breaks stay participant-paced but capped at one minute (so an idle break can't
// stretch the session and mislead Prolific about time worked). At the cap the
// break auto-advances; the DOM side owns that timer.
//
// The anti-mash rule lives here as a pure state machine so it's testable without
// a DOM: only one key advances (unlike showInstructions' any-key path), a first
// press arms a confirmation and a second press confirms. Auto-repeat (a held key)
// is ignored, and the confirm is refused until confirmMinMs after arming, so a
// single bounced or double-fired keydown can't arm and confirm in one press.
const BREAK_CAP_MS = 60000; // hard ceiling on one break
const BREAK_ADVANCE_KEY = 'Enter'; // the one advancing key; matches KeyboardEvent.key
const BREAK_CONFIRM_MIN_MS = 250; // confirm ignored until this long after arming

/**
 * Pure controller for a capped break's deliberate early-advance.
 *
 * @param {{advanceKey?: string, confirmMinMs?: number}} [opts]
 * @returns {{ armed: boolean, press: function, reset: function }}
 *   press(key, now, repeat) -> 'ignored' | 'armed' | 'advance'
 *     'ignored' — wrong key, an auto-repeat, or a confirm too soon after arming
 *     'armed'   — first deliberate press; the screen should ask for confirmation
 *     'advance' — confirmed; the break should end early
 */
function createBreakController(opts = {}) {
    const advanceKey = opts.advanceKey ?? BREAK_ADVANCE_KEY;
    const confirmMinMs = opts.confirmMinMs ?? BREAK_CONFIRM_MIN_MS;
    let armedAt = null;
    return {
        get armed() {
            return armedAt !== null;
        },
        press(key, now, repeat = false) {
            if (repeat) return 'ignored';
            if (key !== advanceKey) return 'ignored';
            if (armedAt === null) {
                armedAt = now;
                return 'armed';
            }
            if (now - armedAt < confirmMinMs) return 'ignored'; // debounce a double-fire
            return 'advance';
        },
        reset() {
            armedAt = null;
        },
    };
}

// Length, in trials, of PRP's S8 descending-SOA introduction. Set to the
// criterion window size (16) — unlike TRAINING_RAMP_LENGTH's windowSize - 1, and
// for the opposite reason. The coherence ramp must finish before the first
// criterion window closes; the SOA schedule must fit entirely inside it, so a
// participant can't meet criterion having practiced only the long, easy SOAs and
// then hit the short ones for the first time in the test block.
const TRAINING_SOA_SCHEDULE_LENGTH = 16;

/**
 * SOA for one trial of PRP's paradigm-specific training stage (S8).
 *
 * A coherence ramp is forbidden here (a T1-only ramp crosses T1 difficulty with
 * SOA — the confound PRP measures), so S8 shapes response order instead. It opens
 * at the longest SOA, where "T1 then T2" is self-evident (T1 finishes before T2
 * appears), and descends to the shortest, where the responses overlap. After the
 * schedule it falls back to the block's mixed SOA sequence, matching the test
 * block's random order.
 *
 * Pure and paradigm-agnostic: takes the SOA levels rather than reading the
 * CP_PRP_SOA_LEVELS placeholder.
 *
 * @param {number} trialIndex - 0-based index of the trial within the stage
 * @param {number[]} soaLevels - the stage's SOA levels, in any order
 * @param {number} [scheduleLength] - trials the descent spans
 * @returns {number|null} the scheduled SOA, or null once the schedule is over
 *   (meaning: keep whatever SOA the sequence generator chose for this trial)
 */
function scheduledSoa(trialIndex, soaLevels, scheduleLength = TRAINING_SOA_SCHEDULE_LENGTH) {
    if (!Array.isArray(soaLevels) || soaLevels.length === 0) {
        throw new Error('scheduledSoa: soaLevels must be a non-empty array');
    }
    if (!(scheduleLength >= 1)) {
        throw new Error(`scheduledSoa: scheduleLength must be >= 1 (got ${scheduleLength})`);
    }
    // Copy before sorting — the caller's level array (a paradigm constant) must
    // not be reordered underneath it.
    const descending = [...soaLevels].sort((a, b) => b - a);
    if (trialIndex >= scheduleLength) return null;
    if (trialIndex <= 0) return descending[0];
    // Equal-as-possible runs per level; any remainder lands on the earlier
    // (longer, easier) levels, which is the safe direction to err in.
    const levelIndex = Math.min(
        descending.length - 1,
        Math.floor((trialIndex * descending.length) / scheduleLength),
    );
    return descending[levelIndex];
}
