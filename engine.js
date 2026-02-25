function buildTrialParams({
    task1, // mov or or
    task2, // mov or or or null
    stimulusDuration, // ms
    csi, // ms
    soa, // ms
    coherence, // { primary: 0.8, distractor: 0.3 }
    responseWindow, // ms, go signal duration after stimulus onset
    dir_1, // required direction
    dir_2, // required for dual-task/PRP
})
{
    if (dir_1 == undefined) throw new Error("buildTrialParams: dir_1 is required")
    params = {
	task_1: task1,
	start_1: 0,
	dur_1: csi + stimulusDuration

    }
    return params;
}

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
	directionParams.dir_mov_1 = spec.dir_ch_1;
	directionParams.dir_or_1 = spec.dir_distractor_1;
    } else if (spec.task1 === 'or') {
	directionParams.dir_or_1 = spec.dir_ch_1;
	directionParams.dir_mov_1 = spec.dir_distractor_1;
    }

    if (spec.task2 !== null) {
	if (spec.task2 === 'mov') {
	    directionParams.dir_mov_2 = spec.dir_ch_2;
	    directionParams.dir_or_2 = spec.dir_distractor_2;
	} else if (spec.task2 === 'or') {
	    directionParams.dir_or_2 = spec.dir_ch_2;
	    directionParams.dir_mov_2 = spec.dir_distractor_2;
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

    // Channel 1 stimulus — both pathways get same timing,
    // coherence determines which is actually active
    timingParams.start_mov_1 = spec.csi;
    timingParams.dur_mov_1 = spec.dur_ch1;
    timingParams.start_or_1 = spec.csi;
    timingParams.dur_or_1 = spec.dur_ch1;

    if (spec.task2 !== null) {
        // Channel 2 cue and go signal (absolute timing, assuming csi2 = 0)
        timingParams.start_2 = spec.csi + spec.soa; // if we want non-zero csi for channel 2 we'd need a spec.csi2 and adjust start_2 and start_go_2
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

function switchTask(task) {
    return task === 'mov' ? 'or' : 'mov';
}

/**
 * Generates a sequence of task identities across trials.
 * 
 * For single-task blocks: every trial gets the same task (switchRate = 0).
 * For mixed/task-switching blocks: task varies according to sequenceType.
 * Not used for PRP blocks (where task1/task2 are fixed per block).
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
            const runPosition = i % 4;
            // Switch at positions 2 and 0 in each 4-trial cycle
            if (runPosition === 2) {
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

/**
 * Generates a shuffled sequence of congruency labels with exact proportions.
 * 
 * @param {number} numTrials
 * @param {string[]} conditions - e.g., ['congruent', 'incongruent']
 * @param {number[]} proportions - e.g., [0.5, 0.5], must sum to 1
 * @returns {string[]} Shuffled array of congruency labels, length = numTrials
 */
function generateCongruencySequence(numTrials, conditions, proportions) {
    // Build array with exact counts per condition
    const sequence = [];
    let assigned = 0;

    for (let i = 0; i < conditions.length; i++) {
        // For the last condition, assign whatever remains to avoid
        // rounding errors leaving us short or over
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

function classifyTransitions(taskSequence) {
    return taskSequence.map((task, i) => {
        if (i === 0) return 'First';
        return task === taskSequence[i - 1] ? 'Repeat' : 'Switch';
    });
}

function switchTask(task) {
    return task === 'mov' ? 'or' : 'mov';
}
