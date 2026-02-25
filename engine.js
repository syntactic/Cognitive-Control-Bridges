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

// ============================================================
// Direction assignment
// ============================================================

/**
 * Assigns the four direction values for a trial's spec.dir object.
 *
 * For single-task: primary direction is random horizontal [0, 180].
 *   Distractor direction depends on congruency condition.
 * For dual-task: channel 1 and 2 each get independent random directions.
 *   Channel 2 dimension depends on response set overlap.
 *
 * @param {string} task - primary task ('mov' or 'or'), used for single-task routing
 * @param {string} congruency - 'congruent'|'incongruent'|'neutral'|'univalent'
 * @param {string} paradigm - 'single-task' or 'dual-task'
 * @param {string} rso - 'identical' or 'disjoint'
 * @returns {{ ch1_task: number, ch1_distractor: number, ch2_task: number, ch2_distractor: number }}
 */
function assignDirections(task, congruency, paradigm, rso) {
    if (paradigm === 'dual-task') {
        // Channel 1: random horizontal direction
        const ch1Dir = Math.random() < 0.5 ? 0 : 180;
        // Channel 2: always horizontal. Disjointness is handled by
        // separate key maps in session.js, not by direction dimension.
        const ch2Dir = Math.random() < 0.5 ? 0 : 180;
        return {
            ch1_task: ch1Dir,
            ch1_distractor: 0,  // no within-channel distractors in dual-task
            ch2_task: ch2Dir,
            ch2_distractor: 0,
        };
    }

    // Single-task
    const primaryDir = Math.random() < 0.5 ? 0 : 180;
    let distractorDir = 0;

    if (congruency === 'congruent') {
        distractorDir = primaryDir;
    } else if (congruency === 'incongruent') {
        distractorDir = primaryDir === 0 ? 180 : 0;
    } else if (congruency === 'neutral') {
        distractorDir = Math.random() < 0.5 ? 90 : 270;
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
    // full duration. But zeroing silenced pathways (coh=0 → dur=0) changes
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
 * Generates a complete array of trial objects for one experimental block.
 *
 * @param {object} blockConfig - Block-level configuration (see plan for shape)
 * @param {number} numTrials - Number of trials in this block
 * @returns {{ seParams: object, meta: object }[]}
 */
function generateBlockTrials(blockConfig, numTrials) {
    const isDualTask = blockConfig.paradigm === 'dual-task';

    // --- Step 1: Generate task sequence ---
    // For single-task/mixed: sequence determines which task per trial.
    // For PRP with T1-T2 switching: sequence determines which task is T1
    //   (T2 is always the other task).
    // For PRP without switching (switchRate = 0): every trial has same T1/T2.
    let taskSequence;
    if (isDualTask) {
        // PRP: generate a T1 sequence (T2 is derived as the other task)
        taskSequence = generateTaskSequence(
            numTrials,
            blockConfig.sequenceType,
            blockConfig.switchRate,
            blockConfig.task1
        );
    } else {
        // Single-task or mixed task-switching
        taskSequence = generateTaskSequence(
            numTrials,
            blockConfig.sequenceType,
            blockConfig.switchRate,
            blockConfig.startTask
        );
    }

    // --- Step 2: Classify transitions ---
    const transitions = classifyTransitions(taskSequence);

    // --- Step 3: Generate congruency sequence ---
    const congruencySequence = generateCongruencySequence(
        numTrials,
        blockConfig.congruency.conditions,
        blockConfig.congruency.proportions
    );

    // --- Step 4: Assemble trials ---
    const trials = [];

    for (let i = 0; i < numTrials; i++) {
        // Determine task assignment for this trial
        let task1, task2;
        if (isDualTask) {
            task1 = taskSequence[i];
            task2 = switchTask(taskSequence[i]);
        } else {
            task1 = taskSequence[i];
            task2 = null;
        }

        const congruency = congruencySequence[i];
        const previousCongruency = i > 0 ? congruencySequence[i - 1] : null;

        // Sample per-trial timing
        const iti = sampleFromDistribution(blockConfig.iti);
        const soa = isDualTask ? sampleFromDistribution(blockConfig.soa) : null;

        // Assign directions
        const dir = assignDirections(
            task1,
            congruency,
            blockConfig.paradigm,
            blockConfig.rso
        );

        // Build the full spec object
        const spec = {
            task1: task1,
            task2: task2,
            csi: blockConfig.csi,
            dur_ch1: blockConfig.stimulusDuration,
            dur_ch2: isDualTask ? blockConfig.stimulusDuration : 0,
            soa: soa ?? 0,
            responseWindow: blockConfig.responseWindow,
            coherence: blockConfig.coherence,
            dir: dir,
        };

        // Build SE params
        const seParams = buildTrialParams(spec);

        // Build metadata for analysis
        const meta = {
            trialNumber: i + 1,
            blockId: blockConfig.blockId,
            blockType: blockConfig.blockType,
            paradigm: blockConfig.paradigm,
            task: task1,
            task2: task2,
            transitionType: transitions[i],
            congruency: congruency,
            previousCongruency: previousCongruency,
            iti: iti,
            soa: soa,
            primaryDirection: dir.ch1_task,
            distractorDirection: congruency === 'univalent' ? null : dir.ch1_distractor,
            ch2Direction: isDualTask ? dir.ch2_task : null,
        };

        trials.push({ seParams, meta });
    }

    return trials;
}
