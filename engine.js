// engine.js — Parameter builder and trial sequence generator
// Pure functions only. No DOM access, no SE package calls.

// ============================================================
// Utility
// ============================================================

function switchTask(task) {
    return task === 'mov' ? 'or' : 'mov';
}

/**
 * @param {{ type: string, value: number, params: number[] }} config
 *   type: 'fixed' | 'uniform' | 'choice'
 *   value: used for 'fixed' type, also serves as fallback
 *   params: [min, max] for 'uniform', or [v1, v2, ...] for 'choice'
 * @returns {number} sampled value in ms
 */
function sampleFromDistribution(config) {
    if (config.type === 'fixed') {
        return config.value;
    }
    if (config.type === 'uniform') {
        if (!config.params || config.params.length < 2) {
            console.warn('sampleFromDistribution: uniform requires params [min, max], falling back to value');
            return config.value;
        }
        const min = Math.min(config.params[0], config.params[1]);
        const max = Math.max(config.params[0], config.params[1]);
        return min + Math.random() * (max - min);
    }
    if (config.type === 'choice') {
        if (!config.params || config.params.length === 0) {
            console.warn('sampleFromDistribution: choice requires non-empty params, falling back to value');
            return config.value;
        }
        return config.params[Math.floor(Math.random() * config.params.length)];
    }
    throw new Error(`sampleFromDistribution: unknown type '${config.type}'`);
}

// ============================================================
// Sequence generators
// ============================================================

/**
 * Generates a sequence of task identities across trials.
 *
 * For single-task blocks: every trial gets the same task (switchRate = 0).
 * For mixed/task-switching blocks: task varies according to sequenceType.
 * For PRP blocks with T1-T2 switching: the returned sequence represents
 * which task is T1 on each trial (T2 is the other task).
 *
 * @param {number} numTrials
 * @param {string} sequenceType - 'Random' or 'AABB'
 * @param {number} switchRate - percent (0–100), only used for 'Random'
 * @param {string|null} startTask - 'mov', 'or', or null for random coin flip
 * @returns {string[]} Array of 'mov'/'or' with length numTrials
 */
function generateTaskSequence(numTrials, sequenceType, switchRate, startTask = null) {
    const firstTask = startTask ?? (Math.random() < 0.5 ? 'mov' : 'or');
    const sequence = [firstTask];

    if (sequenceType === 'Random') {
        // Markov chain: on each trial, switch with probability switchRate/100.
        // At switchRate = 50, this is equivalent to independent random assignment
        // (i.e., the Hirsch et al. 2018 design where stimulus category is random).
        for (let i = 1; i < numTrials; i++) {
            const prev = sequence[i - 1];
            sequence.push(Math.random() < (switchRate / 100) ? switchTask(prev) : prev);
        }
    } else if (sequenceType === 'AABB') {
        // Alternating runs of 2: mov, mov, or, or, mov, mov, ...
        for (let i = 1; i < numTrials; i++) {
            // Switch every 2 trials
            if (i % 2 === 0) {
                sequence.push(switchTask(sequence[i - 1]));
            } else {
                sequence.push(sequence[i - 1]);
            }
        }
    } else {
        throw new Error(`Unknown sequenceType: ${sequenceType}`);
    }

    return sequence;
}

function classifyTransitions(taskSequence) {
    return taskSequence.map((task, i) => {
        if (i === 0) return 'First';
        return task === taskSequence[i - 1] ? 'Repeat' : 'Switch';
    });
}

function classifyDualCanvasTransitions(t1TaskSequence, t2TaskSequence) {
    const transitions = [];
    for (let i = 0; i < t1TaskSequence.length; i++) {
        transitions.push(t1TaskSequence[i] === t2TaskSequence[i] ? 'Repeat' : 'Switch');
    }
    return transitions;
}

/**
 * Generates a shuffled sequence of congruency labels with exact proportions.
 *
 * @param {number} numTrials
 * @param {string[]} conditions - e.g., ['congruent', 'incongruent']
 * @param {number[]} proportions - e.g., [0.5, 0.5], must sum to 1
 * @returns {string[]} Shuffled array of congruency labels, length = numTrials
 */
function generateCongruencySequence(numTrials, conditions, proportions) {
    const sequence = [];
    let assigned = 0;

    for (let i = 0; i < conditions.length; i++) {
        const count = (i === conditions.length - 1)
            ? numTrials - assigned
            : Math.round(numTrials * proportions[i]);
        for (let j = 0; j < count; j++) {
            sequence.push(conditions[i]);
        }
        assigned += count;
    }

    // Fisher-Yates shuffle
    for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }

    return sequence;
}

/**
 * Generates a fully crossed, randomly shuffled sequence of experimental factors.
 * Pure utility function — knows nothing about experiment-specific semantics.
 *
 * @param {number} numTrials - Total trials in the block.
 * @param {Object} factors - Dictionary of arrays to cross
 *   (e.g., { transition: ['Repeat', 'Switch'], soa: [100, 600] })
 * @returns {Array<Object>} Array of length numTrials containing crossed factor combinations.
 */
function generateFactorialSequence(numTrials, factors) {
    const keys = Object.keys(factors);

    if (keys.length === 0) {
        return Array.from({ length: numTrials }, () => ({}));
    }

    const cartesianProduct = keys.reduce((acc, key) => {
        const values = factors[key];
        if (acc.length === 0) return values.map(v => ({ [key]: v }));
        return acc.flatMap(obj => values.map(v => ({ ...obj, [key]: v })));
    }, []);

    const pool = [];
    const reps = Math.floor(numTrials / cartesianProduct.length);
    for (let i = 0; i < reps; i++) {
        pool.push(...cartesianProduct.map(c => ({ ...c })));
    }

    const remainder = numTrials - pool.length;
    for (let i = 0; i < remainder; i++) {
        pool.push({ ...cartesianProduct[Math.floor(Math.random() * cartesianProduct.length)] });
    }

    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool;
}

/**
 * Converts a sequence of relational transitions into absolute task identities.
 *
 * @param {string[]} transitionSequence - e.g., ['First', 'Switch', 'Repeat', ...]
 * @param {string} startTask - 'mov' or 'or'
 * @returns {string[]} Task identity per trial
 */
function deriveTasksFromTransitions(transitionSequence, startTask) {
    const taskSequence = [startTask];
    for (let i = 1; i < transitionSequence.length; i++) {
        const prev = taskSequence[i - 1];
        taskSequence.push(transitionSequence[i] === 'Switch' ? switchTask(prev) : prev);
    }
    return taskSequence;
}

/**
 * Phase 1: Sequence generation for all paradigms.
 * Resolves task identities, transitions, timing, and congruency into parallel vectors.
 *
 * Supports two sequence generation modes:
 * - 'Factorial': Fully crossed design with balanced factor cells.
 *   Requires switchRate 0 (pure) or 50 (balanced Switch/Repeat).
 * - Stochastic ('Random', 'AABB'): Existing probabilistic generation.
 *
 * @param {object} blockConfig - Block-level configuration
 * @param {number} numTrials
 * @returns {{ task1: string[], task2: string[], transition: string[],
 *             soa: (number|null)[], iti: number[], congruency: string[] }}
 */
function generateSequenceVectors(blockConfig, numTrials) {
    const sequenceData = { task1: [], task2: [], transition: [], soa: [], iti: [], congruency: [] };

    // Default congruency for paradigms that don't specify it (alternating, prp-baseline)
    const congruencyConfig = blockConfig.congruency || { conditions: ['univalent'], proportions: [1.0] };

    // Resolve effective start task: dual-task paradigms use task1 field,
    // others use startTask (which can be null for random coin flip)
    const isDualTaskParadigm = blockConfig.paradigm === 'dual-task' || blockConfig.paradigm === 'dual-canvas';
    const effectiveStartTask = isDualTaskParadigm
        ? (blockConfig.task1 ?? blockConfig.startTask)
        : blockConfig.startTask;

    if (blockConfig.sequenceType === 'Factorial') {
        if (blockConfig.switchRate !== 50 && blockConfig.switchRate !== 0) {
            throw new Error(
                `Factorial sequence requires switchRate 50 (balanced Switch/Repeat) or 0 (pure). Got: ${blockConfig.switchRate}`
            );
        }

        const factors = {};
        if (blockConfig.switchRate === 50) factors.transition = ['Repeat', 'Switch'];
        if (blockConfig.soa?.type === 'choice') factors.soa = blockConfig.soa.params;
        if (blockConfig.iti?.type === 'choice') factors.iti = blockConfig.iti.params;
        if (congruencyConfig.conditions.length > 1) factors.congruency = congruencyConfig.conditions;

        const crossed = generateFactorialSequence(numTrials, factors);

        sequenceData.transition = crossed.map(c => c.transition || 'Repeat');
        if (sequenceData.transition.length > 0) {
            sequenceData.transition[0] = 'First';
        }

        const initialTask = effectiveStartTask ?? (Math.random() < 0.5 ? 'mov' : 'or');
        sequenceData.task1 = deriveTasksFromTransitions(sequenceData.transition, initialTask);

        sequenceData.soa = crossed.map(c =>
            c.soa !== undefined ? c.soa : (blockConfig.soa ? sampleFromDistribution(blockConfig.soa) : null)
        );
        sequenceData.iti = crossed.map(c =>
            c.iti !== undefined ? c.iti : sampleFromDistribution(blockConfig.iti)
        );
        sequenceData.congruency = crossed.map(c =>
            c.congruency || congruencyConfig.conditions[0] || 'univalent'
        );

    } else {
        // Stochastic generation (Random, AABB)
        sequenceData.task1 = generateTaskSequence(
            numTrials, blockConfig.sequenceType, blockConfig.switchRate, effectiveStartTask
        );
        sequenceData.transition = classifyTransitions(sequenceData.task1);
        sequenceData.soa = Array.from({ length: numTrials }, () =>
            blockConfig.soa ? sampleFromDistribution(blockConfig.soa) : null
        );
        sequenceData.iti = Array.from({ length: numTrials }, () =>
            sampleFromDistribution(blockConfig.iti)
        );
        sequenceData.congruency = generateCongruencySequence(
            numTrials, congruencyConfig.conditions, congruencyConfig.proportions
        );
    }

    // Resolve Task 2 based on paradigm and t2Rule
    // Default: single-canvas PRP always switches T1->T2; dual-canvas defaults to independent
    const effectiveT2Rule = blockConfig.t2Rule
        ?? (blockConfig.paradigm === 'dual-canvas' ? 'independent' : 'switch');

    if (isDualTaskParadigm) {
        if (effectiveT2Rule === 'same') {
            sequenceData.task2 = [...sequenceData.task1];
        } else if (effectiveT2Rule === 'switch') {
            sequenceData.task2 = sequenceData.task1.map(switchTask);
        } else if (effectiveT2Rule === 'independent') {
            // Always Random with switchRate 50 for truly independent T2 sampling
            sequenceData.task2 = generateTaskSequence(numTrials, 'Random', 50, null);
        } else {
            throw new Error(`Unknown t2Rule: '${effectiveT2Rule}'`);
        }
    } else if (blockConfig.paradigm === 'prp-baseline') {
        // Asterisk is T1 (null), actual task moves to T2
        sequenceData.task2 = [...sequenceData.task1];
        sequenceData.task1 = Array(numTrials).fill(null);
    } else {
        // Single-task or alternating: no T2
        sequenceData.task2 = Array(numTrials).fill(null);
    }

    // For dual-canvas, transitions reflect T1-vs-T2 match per trial,
    // not sequential task changes. Note: this overwrites any factorial-crossed
    // transition values when t2Rule is 'independent'.
    if (blockConfig.paradigm === 'dual-canvas') {
        sequenceData.transition = classifyDualCanvasTransitions(
            sequenceData.task1, sequenceData.task2
        );
    }

    return sequenceData;
}

// ============================================================
// Direction assignment
// ============================================================

/**
 * Assigns the four direction values for a trial's spec.dir object.
 *
 * Direction pools are derived from keyMaps when provided, allowing tasks
 * to use different spatial dimensions (e.g., horizontal movement + vertical
 * orientation). Without keyMaps, defaults to horizontal [0, 180] for all tasks.
 *
 * @param {string} task - primary task ('mov' or 'or'), used for single-task routing
 * @param {string} congruency - 'congruent'|'incongruent'|'neutral'|'univalent'
 * @param {string} paradigm - 'single-task' or 'dual-task'
 * @param {string} rso - 'identical' or 'disjoint' (unused, kept for signature compat)
 * @param {{ mov: object, or: object }} [keyMaps] - key maps from block config.
 *   Direction pools are derived from the keys (e.g., {180:'a', 0:'d'} -> [0, 180]).
 * @returns {{ ch1_task: number, ch1_distractor: number, ch2_task: number, ch2_distractor: number }}
 */
function assignDirections(task, congruency, paradigm, rso, keyMaps) {
    const defaultDirs = [0, 180];
    const taskDirPool = keyMaps ? Object.keys(keyMaps[task]).map(Number) : defaultDirs;

    function randomFrom(pool) {
        return pool[Math.floor(Math.random() * pool.length)];
    }

    if (paradigm === 'dual-task') {
        const otherDirPool = keyMaps
            ? Object.keys(keyMaps[switchTask(task)]).map(Number)
            : defaultDirs;
        const ch1Dir = randomFrom(taskDirPool);
        const ch2Dir = randomFrom(otherDirPool);
        return {
            ch1_task: ch1Dir,
            ch1_distractor: 0,  // no within-channel distractors in dual-task
            ch2_task: ch2Dir,
            ch2_distractor: 0,
        };
    }

    // Single-task
    const primaryDir = randomFrom(taskDirPool);
    let distractorDir = 0;

    if (congruency === 'congruent') {
        distractorDir = primaryDir;
    } else if (congruency === 'incongruent') {
        distractorDir = (primaryDir + 180) % 360;
    } else if (congruency === 'neutral') {
        // With keyMaps: distractor from other task's pool (orthogonal by design).
        // Without keyMaps: default to [90, 270] for backward compat.
        const neutralPool = keyMaps
            ? Object.keys(keyMaps[switchTask(task)]).map(Number)
            : [90, 270];
        distractorDir = randomFrom(neutralPool);
    }
    // 'univalent': distractorDir stays 0, coherence silences the pathway

    return {
        ch1_task: primaryDir,
        ch1_distractor: distractorDir,
        ch2_task: 0,
        ch2_distractor: 0,
    };
}

// ============================================================
// SE parameter builders
// ============================================================

function buildCoherenceParams(spec) {
    const coherenceParams = {};
    if (spec.task1 === 'mov') {
        coherenceParams.coh_mov_1 = spec.coherence.ch1_task;
        coherenceParams.coh_or_1 = spec.coherence.ch1_distractor;
    } else if (spec.task1 === 'or') {
        coherenceParams.coh_or_1 = spec.coherence.ch1_task;
        coherenceParams.coh_mov_1 = spec.coherence.ch1_distractor;
    }

    if (spec.task2 !== null) {
        if (spec.task2 === 'mov') {
            coherenceParams.coh_mov_2 = spec.coherence.ch2_task;
            coherenceParams.coh_or_2 = spec.coherence.ch2_distractor;
        } else if (spec.task2 === 'or') {
            coherenceParams.coh_or_2 = spec.coherence.ch2_task;
            coherenceParams.coh_mov_2 = spec.coherence.ch2_distractor;
        }
    } else {
        coherenceParams.coh_mov_2 = 0;
        coherenceParams.coh_or_2 = 0;
    }
    return coherenceParams;
}

function buildDirectionParams(spec) {
    const directionParams = {};
    if (spec.task1 === 'mov') {
        directionParams.dir_mov_1 = spec.dir.ch1_task;
        directionParams.dir_or_1 = spec.dir.ch1_distractor;
    } else if (spec.task1 === 'or') {
        directionParams.dir_or_1 = spec.dir.ch1_task;
        directionParams.dir_mov_1 = spec.dir.ch1_distractor;
    }

    if (spec.task2 !== null) {
        if (spec.task2 === 'mov') {
            directionParams.dir_mov_2 = spec.dir.ch2_task;
            directionParams.dir_or_2 = spec.dir.ch2_distractor;
        } else if (spec.task2 === 'or') {
            directionParams.dir_or_2 = spec.dir.ch2_task;
            directionParams.dir_mov_2 = spec.dir.ch2_distractor;
        }
    } else {
        directionParams.dir_mov_2 = 0;
        directionParams.dir_or_2 = 0;
    }
    return directionParams;
}

function buildTimingParams(spec) {
    const timingParams = {};

    // Channel 1 cue and go signal (absolute timing)
    timingParams.start_1 = 0;
    timingParams.dur_1 = spec.csi + spec.dur_ch1;
    timingParams.start_go_1 = spec.csi;
    timingParams.dur_go_1 = spec.responseWindow;

    // Channel 1 stimulus — both pathways get same timing here.
    // buildTrialParams zeros out pathways with coh=0 after routing,
    // since the SE package renders coh=0 as random noise, not invisible.
    timingParams.start_mov_1 = spec.csi;
    timingParams.dur_mov_1 = spec.dur_ch1;
    timingParams.start_or_1 = spec.csi;
    timingParams.dur_or_1 = spec.dur_ch1;

    if (spec.task2 !== null) {
        // Channel 2 cue and go signal (absolute timing, assuming csi2 = 0)
        timingParams.start_2 = spec.csi + spec.soa;
        timingParams.dur_2 = spec.dur_ch2;
        timingParams.start_go_2 = spec.csi + spec.soa;
        timingParams.dur_go_2 = spec.responseWindow;

        // Channel 2 stimulus — relative offset because of SE chaining
        // absolute ch2 onset = csi + soa
        // ch1 ends at csi + dur_ch1
        // relative offset = (csi + soa) - (csi + dur_ch1) = soa - dur_ch1
        const ch2RelativeOffset = spec.soa - spec.dur_ch1;
        timingParams.start_mov_2 = ch2RelativeOffset;
        timingParams.dur_mov_2 = spec.dur_ch2;
        timingParams.start_or_2 = ch2RelativeOffset;
        timingParams.dur_or_2 = spec.dur_ch2;

    } else {
        // Single-task: channel 2 completely inactive
        timingParams.start_2 = 0;
        timingParams.dur_2 = 0;
        timingParams.start_go_2 = 0;
        timingParams.dur_go_2 = 0;
        timingParams.start_mov_2 = 0;
        timingParams.dur_mov_2 = 0;
        timingParams.start_or_2 = 0;
        timingParams.dur_or_2 = 0;
    }

    return timingParams;
}

/**
 * Assembles a complete SE parameter object from a spec.
 * Returns a flat object ready to pass to block().
 */
function buildTrialParams(spec) {
    const params = {
        task_1: spec.task1,
        task_2: spec.task2,
        ...buildTimingParams(spec),
        ...buildCoherenceParams(spec),
        ...buildDirectionParams(spec),
    };

    // Zero out duration for pathways with coh=0.
    // The SE package renders coh=0 as visible random noise, not invisible.
    // Zeroing duration is the only way to truly silence a pathway.
    if (params.coh_mov_1 === 0) { params.start_mov_1 = 0; params.dur_mov_1 = 0; }
    if (params.coh_or_1 === 0) { params.start_or_1 = 0; params.dur_or_1 = 0; }
    if (params.coh_mov_2 === 0) { params.start_mov_2 = 0; params.dur_mov_2 = 0; }
    if (params.coh_or_2 === 0) { params.start_or_2 = 0; params.dur_or_2 = 0; }

    // Recompute ch2 relative offsets AFTER zeroing.
    //
    // SE chains ch2 stimulus timing off ch1 counterparts:
    //   mov2_absolute = start_mov_2 + mov1.end
    //   or2_absolute  = start_or_2  + or1.end
    //
    // buildTimingParams computed offsets assuming ch1 counterparts have their
    // full duration. But zeroing silenced pathways (coh=0 -> dur=0) changes
    // their end times to 0. We must recompute offsets using the actual
    // post-zeroing ch1 end times so SE places ch2 stimuli correctly.
    //
    // Reference: viewer.js convertAbsoluteToSEParams lines 134-137.
    if (spec.task2 !== null) {
        const mov1End = params.start_mov_1 + params.dur_mov_1;
        const or1End = params.start_or_1 + params.dur_or_1;
        const desiredCh2Start = spec.csi + spec.soa;

        if (params.dur_mov_2 > 0) {
            params.start_mov_2 = desiredCh2Start - mov1End;
        }
        if (params.dur_or_2 > 0) {
            params.start_or_2 = desiredCh2Start - or1End;
        }
    }

    return params;
}

// ============================================================
// Block trial generation
// ============================================================

/**
 * Generates trial objects for single-canvas blocks (single-task and dual-task PRP).
 *
 * @param {object} blockConfig - Block-level configuration
 * @param {number} numTrials - Number of trials in this block
 * @returns {{ seParams: object, meta: object }[]}
 */
function generateBlockTrials(blockConfig, numTrials) {
    const isDualTask = blockConfig.paradigm === 'dual-task';
    const vectors = generateSequenceVectors(blockConfig, numTrials);
    const trials = [];

    for (let i = 0; i < numTrials; i++) {
        const task1 = vectors.task1[i];
        const task2 = vectors.task2[i];
        const congruency = vectors.congruency[i];
        const iti = vectors.iti[i];
        // SOA is only meaningful for dual-task; force null for single-task
        const soa = isDualTask ? vectors.soa[i] : null;

        const dir = assignDirections(
            task1, congruency, blockConfig.paradigm, blockConfig.rso, blockConfig.keyMaps
        );

        // Resolve coherence (task-indexed -> channel-indexed)
        const coh = blockConfig.coherence;
        const resolvedCoherence = coh.mov !== undefined
            ? { ch1_task: coh[task1], ch1_distractor: 0,
                ch2_task: task2 ? coh[task2] : 0, ch2_distractor: 0 }
            : coh;

        const spec = {
            task1: task1,
            task2: task2,
            csi: blockConfig.csi,
            dur_ch1: blockConfig.stimulusDuration,
            dur_ch2: isDualTask ? blockConfig.stimulusDuration : 0,
            soa: soa ?? 0,
            responseWindow: blockConfig.responseWindow,
            coherence: resolvedCoherence,
            dir: dir,
        };

        const seParams = buildTrialParams(spec);

        const meta = {
            trialNumber: i + 1,
            blockId: blockConfig.blockId,
            blockType: blockConfig.blockType,
            paradigm: blockConfig.paradigm,
            t1_task: task1,
            t2_task: task2,
            transitionType: vectors.transition[i],
            iti: iti,
            soa: soa,
            t1_target_dir: dir.ch1_task,
            t1_distractor_dir: congruency === 'univalent' ? null : dir.ch1_distractor,
            t2_target_dir: isDualTask ? dir.ch2_task : null,
            t2_distractor_dir: null,
        };

        trials.push({ seParams, meta });
    }

    return trials;
}

function buildSingleCanvasSpec(task, csi, stimulusDuration, responseWindow,
                               coherence, direction,
                               distractorCoherence, distractorDirection) {
    const spec = {
        task1: task,
        task2: null,
        csi: csi,
        dur_ch1: stimulusDuration,
        dur_ch2: 0,
        soa: 0,
        responseWindow: responseWindow,
        coherence: {ch1_task: coherence, ch1_distractor: distractorCoherence ?? 0, ch2_task: 0, ch2_distractor: 0},
        dir: {ch1_task: direction, ch1_distractor: distractorDirection ?? 0, ch2_task: 0, ch2_distractor: 0}
    };

    return spec;
}


function applySOAOffset(params, offset) {
    const shifted = { ...params };
    if (offset === 0) {
        return shifted;
    }

    if (params.dur_mov_1 > 0) {
        shifted.start_mov_1 += offset;
    }
    if (params.dur_or_1 > 0) {
        shifted.start_or_1 += offset;
    }
    shifted.start_go_1 += offset;
    shifted.dur_1 += offset;

    return shifted;
}


// TODO: Dual-canvas within-canvas congruency support
//
// Currently, dual-canvas trials are always univalent (one task per canvas, no
// distractors). To support within-canvas congruency (e.g., movement task with
// orientation distractor on the same canvas):
//
// 1. Add congruency config to blockConfig (per-canvas or shared):
//    t1Congruency: { conditions: ['congruent','incongruent'], proportions: [0.5,0.5] }
//
// 2. Call generateCongruencySequence for each canvas independently.
//
// 3. Use the congruency label to control t1_distractor_dir / t2_distractor_dir in
//    buildSingleCanvasSpec (similar to how assignDirections handles it for
//    single-canvas trials).
//
// 4. This enables three independent congruency dimensions derivable from the CSV:
//    - Within T1: compare t1_target_dir vs t1_distractor_dir
//    - Within T2: compare t2_target_dir vs t2_distractor_dir
//    - Cross task: compare t1_target_dir vs t2_target_dir
//
// These three dimensions allow a 2x2x2 congruency analysis and three-way
// interactions with SOA — a novel design not possible with single-canvas PRP.
//
// NOTE: Future extension — dual-PRP (two-channel trials on each canvas)
//
// The current dual-canvas design uses one task per canvas (channel 1 only).
// A more extreme design could run a full PRP trial on each canvas
// simultaneously — four tasks total, two per canvas. This would require:
//
// - Per-canvas coherence objects instead of scalar leftCoherence/rightCoherence
// - Per-canvas SOA (left canvas SOA vs right canvas SOA)
// - buildSingleCanvasSpec replaced with full two-channel spec per canvas
// - Four response keys per canvas (currently only two per hand)
//
// This is architecturally possible (each canvas is an independent SE instance)
// but would require a different response mapping scheme since participants
// only have two fingers per hand in the current setup.

/**
 * Generates trial objects for dual-canvas PRP blocks.
 * Each trial has independent left (T1) and right (T2) canvas parameters.
 *
 * @param {object} blockConfig - must include paradigm: 'dual-canvas', rso: 'disjoint'
 * @param {number} numTrials
 * @returns {{ leftSeParams: object, rightSeParams: object, meta: object }[]}
 */
function generateDualCanvasBlockTrials(blockConfig, numTrials) {
    if (blockConfig.rso !== 'disjoint') {
        throw new Error(`Dual Canvas Config requires disjoint RSO, got: ${blockConfig.rso}`);
    }

    const t1Side = blockConfig.t1Side ?? 'left';
    const vectors = generateSequenceVectors(blockConfig, numTrials);
    const trials = [];

    for (let i = 0; i < numTrials; i++) {
        const t1 = vectors.task1[i];
        const t2 = vectors.task2[i];
        const congruency = vectors.congruency[i];

        // Each canvas is a single-task display; use assignDirections per canvas.
        // Note: keyMaps here are block-level, not canvas-aware. Correct for
        // univalent trials but would need per-canvas keyMaps if within-canvas
        // congruency is added later (see TODO above).
        const dir1 = assignDirections(t1, congruency, 'single-task', blockConfig.rso, blockConfig.keyMaps);
        const dir2 = assignDirections(t2, congruency, 'single-task', blockConfig.rso, blockConfig.keyMaps);

        const t1Coh = blockConfig.coherence[t1] ?? blockConfig.coherence.ch1_task;
        const t2Coh = blockConfig.coherence[t2] ?? blockConfig.coherence.ch1_task;
        const distractorCoh = blockConfig.coherence.ch1_distractor ?? 0;

        const t1Spec = buildSingleCanvasSpec(
            t1, blockConfig.csi, blockConfig.stimulusDuration, blockConfig.responseWindow,
            t1Coh, dir1.ch1_task, distractorCoh, dir1.ch1_distractor
        );
        const t2Spec = buildSingleCanvasSpec(
            t2, blockConfig.csi, blockConfig.stimulusDuration, blockConfig.responseWindow,
            t2Coh, dir2.ch1_task, distractorCoh, dir2.ch1_distractor
        );

        const t1Params = buildTrialParams(t1Spec);
        const t2Params = buildTrialParams(t2Spec);
        const shiftedT2Params = applySOAOffset(t2Params, vectors.soa[i]);

        // Route temporal roles (T1/T2) to physical canvases based on t1Side
        const leftSeParams = t1Side === 'left' ? t1Params : shiftedT2Params;
        const rightSeParams = t1Side === 'left' ? shiftedT2Params : t1Params;

        const meta = {
            trialNumber: i + 1,
            blockId: blockConfig.blockId,
            blockType: blockConfig.blockType,
            paradigm: blockConfig.paradigm,
            t1Side: t1Side,
            earlyResolve: blockConfig.earlyResolve ?? false,
            t1_task: t1,
            t2_task: t2,
            transitionType: vectors.transition[i],
            iti: vectors.iti[i],
            soa: vectors.soa[i],
            t1_target_dir: dir1.ch1_task,
            t1_distractor_dir: congruency === 'univalent' ? null : dir1.ch1_distractor,
            t2_target_dir: dir2.ch1_task,
            t2_distractor_dir: congruency === 'univalent' ? null : dir2.ch1_distractor,
        };

        trials.push({ leftSeParams, rightSeParams, meta });
    }

    return trials;
}

/**
 * Generates trials for sided paradigms (alternating task-switching, PRP baseline).
 * Each trial is assigned to a side of a dual-canvas display.
 *
 * For alternating: side alternates left/right across trials.
 * For prp-baseline: side is always 'right' (left shows a placeholder asterisk).
 *
 * SOA is only sampled for prp-baseline (blockConfig.soa must exist).
 *
 * @param {object} blockConfig - must include paradigm ('alternating' or 'prp-baseline')
 * @param {number} numTrials
 * @returns {{ seParams: object, meta: object }[]}
 */
function generateSidedTrials(blockConfig, numTrials) {
    const isBaseline = blockConfig.paradigm === 'prp-baseline';
    const t1Side = blockConfig.t1Side ?? 'left';
    const oppositeSide = t1Side === 'left' ? 'right' : 'left';
    const vectors = generateSequenceVectors(blockConfig, numTrials);
    const trials = [];

    for (let i = 0; i < numTrials; i++) {
        // For alternating: task is in task1, task2 is null
        // For prp-baseline: task1 is null (asterisk), actual task is in task2
        const displayTask = isBaseline ? vectors.task2[i] : vectors.task1[i];
        // SOA only meaningful for prp-baseline; force null for alternating
        const soa = isBaseline ? vectors.soa[i] : null;
        const iti = vectors.iti[i];

        const coherence = blockConfig.coherence[displayTask] ?? blockConfig.coherence.ch1_task;
        const direction = Math.random() < 0.5 ? 0 : 180;
        const spec = buildSingleCanvasSpec(
            displayTask, blockConfig.csi, blockConfig.stimulusDuration,
            blockConfig.responseWindow, coherence, direction
        );
        const canvasTrialParams = buildTrialParams(spec);

        const meta = {
            trialNumber: i + 1,
            // Baseline: task on opposite side of asterisk (asterisk = T1 side)
            // Alternating: starting side = t1Side, then alternates
            side: isBaseline ? oppositeSide : ((i % 2 === 0) ? t1Side : oppositeSide),
            t1Side: t1Side,
            blockId: blockConfig.blockId,
            blockType: blockConfig.blockType,
            paradigm: blockConfig.paradigm,
            earlyResolve: blockConfig.earlyResolve ?? false,
            t1_task: vectors.task1[i],
            t2_task: vectors.task2[i],
            transitionType: vectors.transition[i],
            iti: iti,
            soa: soa,
            t1_target_dir: isBaseline ? null : direction,
            t1_distractor_dir: null,
            t2_target_dir: isBaseline ? direction : null,
            t2_distractor_dir: null,
        };
        trials.push({ seParams: canvasTrialParams, meta });
    }
    return trials;
}
