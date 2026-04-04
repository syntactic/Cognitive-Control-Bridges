// session_helpers.js — Pure helper functions for session.js
// No DOM access, no SE package calls. Loaded before session.js.

// ============================================================
// Key mapping constants
// ============================================================

// Horizontal 2-direction presets
const LEFT_HAND_KEYS = { 180: 'a', 0: 'd' };
const RIGHT_HAND_KEYS = { 180: 'j', 0: 'l' };
const DUMMY_KEYS = { 180: '!', 0: '!' };

// Full 4-direction presets (spatially intuitive)
const NATURAL_WASD = { 0: 'd', 90: 'w', 180: 'a', 270: 's' };
const NATURAL_IJKL = { 0: 'l', 90: 'i', 180: 'j', 270: 'k' };

// Reversed 4-direction preset (spatially counterintuitive)
const UNNATURAL_WASD = { 0: 'a', 90: 's', 180: 'd', 270: 'w' };

// ============================================================
// SE config builders
// ============================================================

/**
 * SE config for single-canvas key mappings.
 *
 * When keyMaps is provided (from blockConfig), it takes precedence over rso.
 * Otherwise falls back to preset mappings based on rso.
 *
 * @param {string} rso - 'disjoint' or 'identical'
 * @param {boolean} earlyResolve
 * @param {{ mov: object, or: object }} [keyMaps] - explicit key maps from block config
 */
function buildSEConfig(rso, earlyResolve, feedback, acceptFirstResponse, keyMaps) {
    if (keyMaps) {
        return {
            movementKeyMap: { ...keyMaps.mov },
            orientationKeyMap: { ...keyMaps.or },
            size: 0.75,
	    acceptFirstResponse,
	    feedback,
            earlyResolve
        };
    }
    if (rso === 'disjoint') {
        return {
            movementKeyMap: { ...LEFT_HAND_KEYS },
            orientationKeyMap: { ...RIGHT_HAND_KEYS },
            size: 0.75,
	    acceptFirstResponse,
	    feedback,
            earlyResolve
        };
    }
    // identical RSO (default, Hirsch)
    return {
        movementKeyMap: { ...LEFT_HAND_KEYS },
        orientationKeyMap: { ...LEFT_HAND_KEYS },
        size: 0.75,
	acceptFirstResponse,
	feedback,
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
function buildDualCanvasSEConfigs(leftTask, rightTask, earlyResolve, feedback, acceptFirstResponse, size) {
    let leftConfig, rightConfig;
    if (leftTask === 'mov') {
	leftConfig = { movementKeyMap: { ...LEFT_HAND_KEYS }, orientationKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve };
    } else {
	leftConfig = { orientationKeyMap: { ...LEFT_HAND_KEYS }, movementKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve };
    }
    if (rightTask === 'mov') {
	rightConfig = { movementKeyMap: { ...RIGHT_HAND_KEYS }, orientationKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve };
    } else {
	rightConfig = { orientationKeyMap: { ...RIGHT_HAND_KEYS }, movementKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve };
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
function buildAlternatingSEConfig(task, side, earlyResolve, feedback, acceptFirstResponse, size) {
    const horizontalMapping = side === 'left' ? { ...LEFT_HAND_KEYS } : { ...RIGHT_HAND_KEYS };
    if (task === 'mov') {
	return { movementKeyMap: horizontalMapping, orientationKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve };
    }
    return { movementKeyMap: { ...DUMMY_KEYS }, orientationKeyMap: horizontalMapping, size, acceptFirstResponse, feedback, earlyResolve };
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
function extractSingleStreamResponse(keyPresses, goSignalOnset, acceptFirstResponse) {
    let rt_raw = null;
    let accuracy = 'miss';
    let hadError = false;
    let consumedCount = 0;

    for (let i = 0; i < keyPresses.length; i++) {
	const kp = keyPresses[i];
	consumedCount = i + 1;
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
	t1Result = extractSingleStreamResponse(t1Presses, trial.seParams.start_go_1, seConfig.acceptFirstResponse);
	t2Result = extractSingleStreamResponse(t2Presses, trial.seParams.start_go_2, seConfig.acceptFirstResponse);
    } else {
	// Identical RSO or single-task: temporal ordering
	t1Result = extractSingleStreamResponse(keyPresses, trial.seParams.start_go_1, seConfig.acceptFirstResponse);
	if (isDualTask) {
	    const remaining = keyPresses.slice(t1Result.consumedCount);
	    t2Result = extractSingleStreamResponse(remaining, trial.seParams.start_go_2, seConfig.acceptFirstResponse);
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

function extractAlternatingResponse(data, trial, seConfig) {
    const result = extractSingleStreamResponse(data.keyPresses, trial.seParams.start_go_1, seConfig.acceptFirstResponse);
    return {
	rt1: result.rt,
	rt1_raw: result.rt_raw,
	accuracy1: result.accuracy,
	rt2: null, rt2_raw: null, accuracy2: null,
	rawKeyPresses: JSON.stringify(data.keyPresses),
    };
}

function extractDualCanvasResponse(t1Data, t2Data, t1GoOnset, t2GoOnset, t1Config, t2Config) {
    const t1Result = extractSingleStreamResponse(t1Data.keyPresses, t1GoOnset, t1Config.acceptFirstResponse);
    const t2Result = extractSingleStreamResponse(t2Data.keyPresses, t2GoOnset, t2Config.acceptFirstResponse);

    let responseOrder = null;
    if (t1Result.rt_raw !== null && t2Result.rt_raw !== null) {
	responseOrder = (t2Result.rt_raw - t1Result.rt_raw > 0) ? 'T1-first' : 'T2-first';
    }

    return {
	rt1: t1Result.rt, rt1_raw: t1Result.rt_raw, accuracy1: t1Result.accuracy,
	rt2: t2Result.rt, rt2_raw: t2Result.rt_raw, accuracy2: t2Result.accuracy,
	responseOrder,
	rawKeyPresses: JSON.stringify({ t1: t1Data.keyPresses, t2: t2Data.keyPresses }),
    };
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
    return maxIndex
}

function createQuest(priorMean, priorSD) {
    // Private state — just local variables
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
    const originalPrior = [ ...qArray ];

    function createAxis() {
	const axis = new Array(numValues).fill(0);
	for (let i = 0; i < axis.length; i++) {
	    axis[i] = logMin + i * step;
	}
	return axis;
    }

    function computePrior(intensityAxis, priorMean, priorSD) {
	let logPrior = new Array(intensityAxis.length).fill(0);
	// technically, log(priorSD) and 0.5 * log(2*pi) should be subtracted from each term, but since these
	// are invariant across the loop, they don't affect the distribution in a significant way and can be ignored
	for (let i = 0; i < intensityAxis.length; i++) {
	    logPrior[i] = -0.5 * ((intensityAxis[i] - priorMean) / priorSD) ** 2
	}
	return logPrior;
    }

    function psi(x) {
	return gamma + (1 - gamma - delta) * (1 - Math.exp(-(10**(beta * (x + epsilon)))));
    }

    // We calculate this once and store it in the closure!
    const rulebooks = compute_s_and_f();

    function compute_s_and_f() {
	// 1. Create the padded arrays. 
	// If our main axis is 100 units, we need 201 units to safely slide all the way 
	// from one end to the other without going out of bounds.
	const padding = numValues; 
	const size = (2 * padding) + 1; 
	
	const s = new Array(size).fill(0);
	const f = new Array(size).fill(0);
	
	for (let i = 0; i < size; i++) {
	    // 2. What is the physical distance this index represents?
	    // Index 'padding' (100) is the center, so (i - padding) gives us an offset 
	    // ranging from -100 to +100. Multiply by 'step' to get the log-distance!
	    let distance_x = (i - padding) * step;
	    
	    // 3. Get the raw probability from our canonical psychometric function
	    let p = psi(distance_x);
	    
	    // 4. Store the logs!
	    s[i] = Math.log(p);
	    f[i] = Math.log(1 - p);
	}
	
	return { s, f };
    }


    // Placeholder functions to avoid ReferenceErrors in the return object
    function getNextIntensity() {
	return 10**intensityAxis[argMax(qArray)];
    }

    function update(testedCoherence, wasCorrect) {
	// 1. Convert the raw coherence to an internal array index
	const logIntensity = Math.log10(testedCoherence);

	// Calculate how many 'steps' this log value is from our minimum log value
	// Math.round ensures we snap to the nearest valid index in our array
	const testedIndex = Math.round((logIntensity - logMin) / step);

	// 2. Pick the right rulebook (S for correct, F for incorrect)
	const arrayToUse = wasCorrect ? rulebooks.s : rulebooks.f;

	// 3. Slide and add (with the corrected sign!)
	for (let i = 0; i < qArray.length; i++) {
	    // Distance is (Tested - Hypothesis) + Padding
	    let shiftIndex = (testedIndex - i) + numValues;

	    // Ensure we don't accidentally go out of bounds if testedCoherence
	    // was wildly outside our expected min/max range
	    if (shiftIndex >= 0 && shiftIndex < arrayToUse.length) {
		qArray[i] += arrayToUse[shiftIndex];
	    }
	}
    }

    function getFinalEstimate() {
	const likelihoodOnly = qArray.map((val, i) => val - originalPrior[i]);
	return 10**intensityAxis[argMax(likelihoodOnly)];
    }

    // Return an object with methods that close over the state
    return {
	getNextIntensity,
	update,
	getFinalEstimate
    };
}
