// session_helpers.js — Pure helper functions for session.js
// No DOM access, no SE package calls. Loaded before session.js.

// ============================================================
// Key mapping constants
// ============================================================

// How long the SE library keeps a trial alive after an earlyResolve response,
// in ms — enough for the feedback flash to land. Passed into every SE config so
// the library and the ITI bookkeeping in session.js cannot drift apart: the
// runner subtracts this to recover the moment the participant actually responded.
const RESOLVE_DELAY = 150;

// Horizontal 2-direction presets (parallel / spatially-compatible S-R)
const LEFT_HAND_KEYS = { 180: 'a', 0: 'd' };
const RIGHT_HAND_KEYS = { 180: 'j', 0: 'l' };
const DUMMY_KEYS = { 180: '!', 0: '!' };

// Orthogonal 2-direction presets: VERTICAL stimulus directions (90=up, 270=down)
// mapped onto the HORIZONTAL a/d, j/l keys. This deliberately removes any spatial
// correspondence between stimulus and response. Contrast with NATURAL_WASD below,
// which is the parallel (spatially-compatible) vertical mapping (up='w', down='s').
const LEFT_HAND_KEYS_ORTHOGONAL = { 90: 'a', 270: 'd' };
const RIGHT_HAND_KEYS_ORTHOGONAL = { 90: 'j', 270: 'l' };

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
            resolveDelay: RESOLVE_DELAY,
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
            resolveDelay: RESOLVE_DELAY,
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
        resolveDelay: RESOLVE_DELAY,
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
function buildDualCanvasSEConfigs(leftTask, rightTask, earlyResolve, feedback, acceptFirstResponse, size, mapping) {
    const { left: leftKeys, right: rightKeys } = handKeysForMapping(mapping);
    let leftConfig, rightConfig;
    if (leftTask === 'mov') {
	leftConfig = { movementKeyMap: { ...leftKeys }, orientationKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve, resolveDelay: RESOLVE_DELAY };
    } else {
	leftConfig = { orientationKeyMap: { ...leftKeys }, movementKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve, resolveDelay: RESOLVE_DELAY };
    }
    if (rightTask === 'mov') {
	rightConfig = { movementKeyMap: { ...rightKeys }, orientationKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve, resolveDelay: RESOLVE_DELAY };
    } else {
	rightConfig = { orientationKeyMap: { ...rightKeys }, movementKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve, resolveDelay: RESOLVE_DELAY };
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
function buildAlternatingSEConfig(task, side, earlyResolve, feedback, acceptFirstResponse, size, mapping) {
    const handKeys = handKeysForMapping(mapping);
    const sideMapping = side === 'left' ? { ...handKeys.left } : { ...handKeys.right };
    if (task === 'mov') {
	return { movementKeyMap: sideMapping, orientationKeyMap: { ...DUMMY_KEYS }, size, acceptFirstResponse, feedback, earlyResolve, resolveDelay: RESOLVE_DELAY };
    }
    return { movementKeyMap: { ...DUMMY_KEYS }, orientationKeyMap: sideMapping, size, acceptFirstResponse, feedback, earlyResolve, resolveDelay: RESOLVE_DELAY };
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
 *   - Presses landing before the imperative stimulus → counted as anticipations
 *     and skipped (they cannot be a response to a stimulus that is not on screen)
 *   - First correct press → record RT, classify as 'correct' or 'corrected'
 *   - Incorrect presses before a correct → track as errors
 *   - No correct press found → 'error' (if any presses) or 'miss' (if none)
 *
 * Skipping anticipations matters most under acceptFirstResponse, which otherwise
 * takes the very first keypress no matter when it arrived: on a dual-canvas trial
 * the T2 canvas sits blank for one SOA, so a twitch during that window was being
 * recorded as the T2 response with a NEGATIVE rt, and the participant's real
 * response was then thrown away.
 *
 * @param {Array} keyPresses - array of { key, time, isCorrect }
 * @param {number} stimulusOnset - onset of the imperative stimulus, in the same
 *   canvas-local ms as kp.time. This is the RT zero point. It is deliberately NOT
 *   the go-signal onset: since the CSI fix, the go signal opens with the cue,
 *   csi ms before the stimulus.
 * @returns {{ rt, rt_raw, accuracy, consumedCount, anticipations }}
 *   consumedCount: how many keypresses were processed (up to and including the
 *   first correct). Used by the identical-RSO path to split the stream for T2.
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
	const t1Presses = keyPresses.filter(kp => keyMap.task1Keys.includes(kp.key));
	const t2Presses = keyPresses.filter(kp => keyMap.task2Keys.includes(kp.key));
	t1Result = extractSingleStreamResponse(t1Presses, t1Onset, seConfig.acceptFirstResponse);
	t2Result = extractSingleStreamResponse(t2Presses, t2Onset, seConfig.acceptFirstResponse);
    } else {
	// Identical RSO or single-task: temporal ordering
	t1Result = extractSingleStreamResponse(keyPresses, t1Onset, seConfig.acceptFirstResponse);
	if (isDualTask) {
	    const remaining = keyPresses.slice(t1Result.consumedCount);
	    t2Result = extractSingleStreamResponse(remaining, t2Onset, seConfig.acceptFirstResponse);
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
	responseOrder: (isDualTask && t1Result.rt_raw !== null && t2Result.rt_raw !== null)
	    ? (t1Result.rt_raw <= t2Result.rt_raw ? 'T1-first' : 'T2-first')
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
    const result = extractSingleStreamResponse(data.keyPresses, onset, seConfig.acceptFirstResponse);
    return {
	rt1: result.rt,
	rt1_raw: result.rt_raw,
	accuracy1: result.accuracy,
	anticipations1: result.anticipations,
	rt2: null, rt2_raw: null, accuracy2: null, anticipations2: null,
	rawKeyPresses: JSON.stringify(data.keyPresses),
    };
}

function extractDualCanvasResponse(t1Data, t2Data, t1StimOnset, t2StimOnset, t1Config, t2Config) {
    const t1Result = extractSingleStreamResponse(t1Data.keyPresses, t1StimOnset, t1Config.acceptFirstResponse);
    const t2Result = extractSingleStreamResponse(t2Data.keyPresses, t2StimOnset, t2Config.acceptFirstResponse);

    let responseOrder = null;
    if (t1Result.rt_raw !== null && t2Result.rt_raw !== null) {
	responseOrder = (t2Result.rt_raw - t1Result.rt_raw > 0) ? 'T1-first' : 'T2-first';
    }

    return {
	rt1: t1Result.rt, rt1_raw: t1Result.rt_raw, accuracy1: t1Result.accuracy,
	rt2: t2Result.rt, rt2_raw: t2Result.rt_raw, accuracy2: t2Result.accuracy,
	anticipations1: t1Result.anticipations,
	anticipations2: t2Result.anticipations,
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
