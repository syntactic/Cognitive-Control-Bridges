// session_helpers.js — Pure helper functions for session.js
// No DOM access, no SE package calls. Loaded before session.js.

// ============================================================
// Key mapping constants
// ============================================================

const LEFT_HAND_KEYS = { 180: 'a', 0: 'd' };
const RIGHT_HAND_KEYS = { 180: 'j', 0: 'l' };
const DUMMY_KEYS = { 180: '!', 0: '!' };

// ============================================================
// SE config builders
// ============================================================

/**
 * SE config for single-canvas key mappings.
 * For identical RSO: both tasks use a (left) and d (right).
 */
function buildSEConfig(rso, earlyResolve) {
    if (rso === 'disjoint') {
        return {
            movementKeyMap: { ...LEFT_HAND_KEYS },
            orientationKeyMap: { ...RIGHT_HAND_KEYS },
            size: 0.75,
            earlyResolve
        };
    }
    // identical RSO (default, Hirsch)
    return {
        movementKeyMap: { ...LEFT_HAND_KEYS },
        orientationKeyMap: { ...LEFT_HAND_KEYS },
        size: 0.75,
        earlyResolve
    };
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
function buildDualCanvasSEConfigs(leftTask, rightTask, earlyResolve, size) {
    let leftConfig, rightConfig;
    if (leftTask === 'mov') {
	leftConfig = { movementKeyMap: { ...LEFT_HAND_KEYS }, orientationKeyMap: { ...DUMMY_KEYS }, size, earlyResolve };
    } else {
	leftConfig = { orientationKeyMap: { ...LEFT_HAND_KEYS }, movementKeyMap: { ...DUMMY_KEYS }, size, earlyResolve };
    }
    if (rightTask === 'mov') {
	rightConfig = { movementKeyMap: { ...RIGHT_HAND_KEYS }, orientationKeyMap: { ...DUMMY_KEYS }, size, earlyResolve };
    } else {
	rightConfig = { orientationKeyMap: { ...RIGHT_HAND_KEYS }, movementKeyMap: { ...DUMMY_KEYS }, size, earlyResolve };
    }
    return { leftConfig, rightConfig };
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
function buildAlternatingSEConfig(task, side, earlyResolve, size) {
    const horizontalMapping = side === 'left' ? { ...LEFT_HAND_KEYS } : { ...RIGHT_HAND_KEYS };
    if (task === 'mov') {
	return { movementKeyMap: horizontalMapping, orientationKeyMap: { ...DUMMY_KEYS }, size, earlyResolve };
    }
    return { movementKeyMap: { ...DUMMY_KEYS }, orientationKeyMap: horizontalMapping, size, earlyResolve };
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
    const isDisjoint = movKeys.length > 0 && orKeys.length > 0 &&
        !movKeys.some(k => orKeys.includes(k));
    if (!isDisjoint) return null;
    const task1 = trial.meta.t1_task;
    const task1Keys = task1 === 'mov' ? movKeys : orKeys;
    const task2Keys = task1 === 'mov' ? orKeys : movKeys;
    return { task1Keys, task2Keys };
}

// ============================================================
// Response extraction
// ============================================================

/**
 * Extract RT and accuracy from a single keypress stream.
 * This is the shared core logic used by all response extractors.
 *
 * Walks through keypresses in order:
 *   - First correct press → record RT, classify as 'correct' or 'corrected'
 *   - Incorrect presses before a correct → track as errors
 *   - No correct press found → 'error' (if any presses) or 'miss' (if none)
 *
 * @param {Array} keyPresses - array of { key, time, isCorrect }
 * @param {number} goSignalOnset - onset time of the go signal (for RT computation)
 * @returns {{ rt: number|null, rt_raw: number|null, accuracy: string, consumedCount: number }}
 *   consumedCount: how many keypresses were processed (up to and including the
 *   first correct). Used by the identical-RSO path to split the stream for T2.
 */
function extractSingleStreamResponse(keyPresses, goSignalOnset) {
    let rt_raw = null;
    let accuracy = 'miss';
    let hadError = false;
    let consumedCount = keyPresses.length; // default: consumed all

    for (let i = 0; i < keyPresses.length; i++) {
	const kp = keyPresses[i];
	if (kp.isCorrect) {
	    rt_raw = kp.time;
	    accuracy = hadError ? 'corrected' : 'correct';
	    consumedCount = i + 1;
	    break;
	} else {
	    hadError = true;
	    accuracy = 'error';
	}
    }

    const rt = rt_raw !== null ? rt_raw - goSignalOnset : null;
    return { rt, rt_raw, accuracy, consumedCount };
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

    if (keyMap) {
	// Disjoint RSO: split keypresses by key set, extract independently
	const t1Presses = keyPresses.filter(kp => keyMap.task1Keys.includes(kp.key));
	const t2Presses = keyPresses.filter(kp => keyMap.task2Keys.includes(kp.key));
	t1Result = extractSingleStreamResponse(t1Presses, trial.seParams.start_go_1);
	t2Result = extractSingleStreamResponse(t2Presses, trial.seParams.start_go_2);
    } else {
	// Identical RSO or single-task: temporal ordering
	t1Result = extractSingleStreamResponse(keyPresses, trial.seParams.start_go_1);
	if (isDualTask) {
	    const remaining = keyPresses.slice(t1Result.consumedCount);
	    t2Result = extractSingleStreamResponse(remaining, trial.seParams.start_go_2);
	}
    }

    return {
	rt1_raw: t1Result.rt_raw,
	rt1: t1Result.rt,
	accuracy1: t1Result.accuracy,
	rt2_raw: isDualTask ? (t2Result.rt_raw ?? null) : null,
	rt2: isDualTask ? (t2Result.rt ?? null) : null,
	accuracy2: isDualTask ? (t2Result.accuracy ?? 'miss') : null,
	responseOrder: (isDualTask && t1Result.rt_raw !== null && t2Result.rt_raw !== null)
	    ? (t1Result.rt_raw <= t2Result.rt_raw ? 'T1-first' : 'T2-first')
	    : null,
	rawKeyPresses: JSON.stringify(keyPresses),
    };
}

function extractAlternatingResponse(data, trial) {
    const result = extractSingleStreamResponse(data.keyPresses, trial.seParams.start_go_1);
    return {
	rt1: result.rt,
	rt1_raw: result.rt_raw,
	accuracy1: result.accuracy,
	rt2: null, rt2_raw: null, accuracy2: null,
	rawKeyPresses: JSON.stringify(data.keyPresses),
    };
}

function extractDualCanvasResponse(leftData, rightData, trial) {
    const leftResult = extractSingleStreamResponse(leftData.keyPresses, trial.leftSeParams.start_go_1);
    const rightResult = extractSingleStreamResponse(rightData.keyPresses, trial.rightSeParams.start_go_1);

    let responseOrder = null;
    if (leftResult.rt_raw !== null && rightResult.rt_raw !== null) {
	responseOrder = (rightResult.rt_raw - leftResult.rt_raw > 0) ? 'T1-first' : 'T2-first';
    }

    return {
	rt1: leftResult.rt, rt1_raw: leftResult.rt_raw, accuracy1: leftResult.accuracy,
	rt2: rightResult.rt, rt2_raw: rightResult.rt_raw, accuracy2: rightResult.accuracy,
	responseOrder,
	rawKeyPresses: JSON.stringify({ left: leftData.keyPresses, right: rightData.keyPresses }),
    };
}
