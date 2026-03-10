// hirsch.js — Session configuration for the Hirsch et al. (2018) replication demo
//
// Three block types:
//   1. Pure block: single-task, no switching (baseline for mixing cost)
//   2. Mixed task-switching block: ~50% switch rate, univalent stimuli
//   3. PRP block: dual-task with varied SOA, T1-T2 switching
//
// Extension beyond Hirsch: SOA sampled from [50, 100, 200, 400, 600, 1000]
// instead of just {100, 600}.
//
// Movement task: a = left, d = right.
// Orientation task: j = left, l = right.
// Disjoint response sets eliminate response-reversal ambiguity in PRP data.
// Stimuli are univalent throughout (no congruency manipulation).

const HIRSCH_DEFAULTS = {
    csi: 200,                // ms, cue-stimulus interval
    stimulusDuration: 2500,  // ms, matches responseWindow so stimuli stay visible until response
    responseWindow: 2500,    // ms, go signal duration
    rso: 'disjoint',
    coherence: {
        ch1_task: 0.8,
        ch1_distractor: 0,   // univalent: distractor pathway silenced
        ch2_task: 0.6,
        ch2_distractor: 0,
    },
    congruency: {
        conditions: ['univalent'],
        proportions: [1.0],
    },
};

const HIRSCH_DUAL_DEFAULTS = {
    ...HIRSCH_DEFAULTS,
	paradigm: 'dual-canvas',
	iti: { type: 'fixed', value: 1000 },
	soa: { type: 'choice', value: 600, params: [100, 600] },
	rso: 'disjoint'
};

const HIRSCH_ALTERNATING_DEFAULTS = {
    ...HIRSCH_DEFAULTS,
    paradigm: 'alternating',
    earlyResolve: true,
    iti : { type: 'choice', params: [100, 600], value: 600 },
    coherence: {
	ch1_task: 0.8,
	ch1_distractor: 0,
	ch2_task: 0,
	ch2_distractor: 0
    }
};

// --- Pure blocks (one per task) ---

const hirschPureMov = {
    ...HIRSCH_DEFAULTS,
    blockId: 'hirsch_pure_mov',
    blockType: 'pure',
    paradigm: 'single-task',
    task1: 'mov',
    task2: null,
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov',
    coherence: {
        ch1_task: 0.8,
        ch1_distractor: 0,
        ch2_task: 0,
        ch2_distractor: 0,
    },
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    soa: { type: 'fixed', value: 0, params: [] },
};

const hirschPureOr = {
    ...hirschPureMov,
    blockId: 'hirsch_pure_or',
    task1: 'or',
    startTask: 'or',
};

// --- Mixed task-switching block ---

const hirschMixed = {
    ...HIRSCH_DEFAULTS,
    blockId: 'hirsch_mixed',
    blockType: 'mixed',
    paradigm: 'single-task',
    task1: 'mov',
    task2: null,
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,         // random coin flip
    coherence: {
        ch1_task: 0.8,
        ch1_distractor: 0,
        ch2_task: 0,
        ch2_distractor: 0,
    },
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    soa: { type: 'fixed', value: 0, params: [] },
};

// --- Single-canvas PRP block (generic demo, not a faithful Hirsch replication) ---
// Cross-type only (T1 and T2 always different tasks), overlaid on one canvas.
// SOA sampled from extended range for parametric bridge exploration.

const singleCanvasPRP = {
    ...HIRSCH_DEFAULTS,
    blockId: 'single_canvas_prp',
    blockType: 'prp',
    paradigm: 'dual-task',
    task1: 'mov',            // starting T1 (overridden per-trial by sequence)
    task2: 'or',
    sequenceType: 'Random',
    switchRate: 50,           // T1-T2 switching within PRP block
    startTask: null,
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    soa: { type: 'choice', value: 100, params: [50, 100, 200, 400, 600, 1000] },
};

const hirschDualCanvasPRPPureMov = {
    ...HIRSCH_DUAL_DEFAULTS,
    blockId: 'hirsch_dual_canvas_pure_mov',
    blockType: 'prp-baseline',
    paradigm: 'prp-baseline',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov',
    earlyResolve: true
}

const hirschDualCanvasPRPPureOr = {
    ...HIRSCH_DUAL_DEFAULTS,
    blockId: 'hirsch_dual_canvas_pure_or',
    blockType: 'prp-baseline',
    paradigm: 'prp-baseline',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'or',
    earlyResolve: true
}

const hirschDualCanvasPRP = {
    ...HIRSCH_DUAL_DEFAULTS,
    blockId: 'hirsch_dual_canvas',
    blockType: 'prp',
    t2Rule: 'independent',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null
};

const hirschDualCanvasSame = {
    ...HIRSCH_DUAL_DEFAULTS,
    blockId: 'hirsch_dual_canvas_same',
    blockType: 'prp',
    t2Rule: 'same',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null
};

const hirschAlternatingMixed = {
    ...HIRSCH_ALTERNATING_DEFAULTS,
    blockId : 'hirsch_alternating_mixed',
    blockType: 'mixed',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null
};

const hirschAlternatingPureMov = {
    ...HIRSCH_ALTERNATING_DEFAULTS,
    blockId : 'hirsch_alternating_pure_mov',
    blockType: 'pure',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov'
};

const hirschAlternatingPureOr = {
    ...HIRSCH_ALTERNATING_DEFAULTS,
    blockId : 'hirsch_alternating_pure_or',
    blockType: 'pure',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'or'
};

// --- Session definition ---
// Order: pure blocks → mixed → PRP (standard in the literature)

const HIRSCH_SESSION = [
    {
        blockConfig: hirschPureMov,
        numTrials: 40,
        instructions: 'Pure block: MOVEMENT task only.\n\nLeft hand: A = leftward, D = rightward.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschPureOr,
        numTrials: 40,
        instructions: 'Pure block: ORIENTATION task only.\n\nRight hand: J = leftward, L = rightward.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschMixed,
        numTrials: 80,
        instructions: 'Mixed block: The task switches randomly between trials.\n\nThe border style tells you which task to do:\n  Dotted = MOVEMENT (left hand: A/D)\n  Dashed = ORIENTATION (right hand: J/L)\n\nPress any key to begin.',
    },
    {
        blockConfig: singleCanvasPRP,
        numTrials: 120,
        instructions: 'Dual-task (PRP) block: Two tasks per trial.\n\nRespond to the FIRST task, then the SECOND task.\nMOVEMENT (left hand): A = left, D = right.\nORIENTATION (right hand): J = left, L = right.\n\nThe delay between tasks will vary.\n\nPress any key to begin.',
    },
];

const HIRSCH_TASK_SWITCHING_SESSION = [
    {
	blockConfig: hirschAlternatingPureMov,
	numTrials: 40,
	instructions: 'Pure block of only movement tasks, two canvases.\n\n'
	    + 'Press any key to begin.'
    },
    {
	blockConfig: hirschAlternatingPureOr,
	numTrials: 40,
	instructions: 'Pure block of only orientation tasks, two canvases.\n\n'
	    + 'Press any key to begin.'
    },
    {
	blockConfig: hirschAlternatingMixed,
	numTrials: 120,
	instructions: 'Mixed task switching block: Two canvases, one task each.\n\n'
	    + 'The tasks might be different types (movement vs orientation) or they might be the same.\n\n'
	    + 'Press any key to begin.',
    },
    {
	blockConfig: hirschAlternatingPureMov,
	numTrials: 40,
	instructions: 'Pure block of only movement tasks, two canvases.\n\n'
	    + 'Press any key to begin.'
    },
    {
	blockConfig: hirschAlternatingPureOr,
	numTrials: 40,
	instructions: 'Pure block of only orientation tasks, two canvases.\n\n'
	    + 'Press any key to begin.'
    }
];


const HIRSCH_DUAL_CANVAS_SESSION = [
    {
        blockConfig: hirschDualCanvasPRPPureMov,
        numTrials: 40,
        instructions: 'Pure block: MOVEMENT task only on right side.\n\nRight hand: J = left, L = right.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschDualCanvasPRPPureOr,
        numTrials: 40,
        instructions: 'Pure block: ORIENTATION task only on right side.\n\nRight hand: J = left, L = right.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschDualCanvasPRP,
        numTrials: 120,
        instructions: 'Dual-task (PRP) block: Two canvases, one task each.\n\n'
            + 'Respond to the LEFT canvas first (A/D), then the RIGHT canvas (J/L).\n'
            + 'The tasks might be different types (movement vs orientation) or they might be the same.\n\n'
            + 'Press any key to begin.',
    },
];

const HIRSCH_DUAL_CANVAS_SAME_SESSION = [
    {
        blockConfig: hirschPureMov,
        numTrials: 40,
        instructions: 'Pure block: MOVEMENT task only.\n\nLeft hand: A = left, D = right.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschPureOr,
        numTrials: 40,
        instructions: 'Pure block: ORIENTATION task only.\n\nRight hand: J = left, L = right.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschDualCanvasSame,
        numTrials: 120,
        instructions: 'Dual-task (PRP) block: Two canvases, SAME task type.\n\n'
            + 'Respond to the LEFT canvas first (A/D), then the RIGHT canvas (J/L).\n'
            + 'Both canvases will show the same task type on each trial.\n\n'
            + 'Press any key to begin.',
    },
];

const HIRSCH_FAITHFUL_SESSION = [
    // --- Part 1: Task Switching ---
    // Pure blocks, practice movement block, pure movement baseline, practice orientation block, pure orientation baseline
    { blockConfig: hirschAlternatingPureMov, numTrials: 6,
	instructions: 'Practice pure block: MOVEMENT only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschAlternatingPureMov, numTrials: 41,
	instructions: 'Pure block: MOVEMENT only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschAlternatingPureOr, numTrials: 6,
	instructions: 'Practice pure block: ORIENTATION only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschAlternatingPureOr, numTrials: 41,
	instructions: 'Pure block: ORIENTATION only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    // Experimental blocks (4 blocks of 81 trials each in Hirsch)
    { blockConfig: hirschAlternatingMixed, numTrials: 12,
	instructions: 'Practice mixed block: Respond with the matching hand.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschAlternatingMixed, numTrials: 81,
      instructions: 'Mixed block 1 of 4:\n\nRespond with the matching hand.\nA/D for left, J/L for right.\n\nPress any key.' },
    { blockConfig: hirschAlternatingMixed, numTrials: 81, instructions: 'Mixed block 2 of 4.\n\nPress any key.' },
    { blockConfig: hirschAlternatingMixed, numTrials: 81, instructions: 'Mixed block 3 of 4.\n\nPress any key.' },
    { blockConfig: hirschAlternatingMixed, numTrials: 81, instructions: 'Mixed block 4 of 4.\n\nPress any key.' },
    // Post-experimental pure blocks
    { blockConfig: hirschAlternatingPureMov, numTrials: 41, instructions: 'Pure block: MOVEMENT only.\n\nPress any key.' },
    { blockConfig: hirschAlternatingPureOr, numTrials: 41, instructions: 'Pure block: ORIENTATION only.\n\nPress any key.' },

    // --- Part 2: Dual-Task PRP ---
    // Pure baseline blocks
    { blockConfig: hirschDualCanvasPRPPureMov, numTrials: 6,
	instructions: 'Practice PRP pure block: MOVEMENT only.\nRight hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRPPureMov, numTrials: 41,
      instructions: 'PRP pure block: MOVEMENT only.\nRight hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRPPureOr, numTrials: 6,
	instructions: 'Practice PRP pure block: ORIENTATION only.\nRight hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRPPureOr, numTrials: 41,
      instructions: 'PRP pure block: ORIENTATION only.\nRight hand: J/L.\n\nPress any key.' },
    // Experimental PRP blocks (4 blocks of 81 trials)
    { blockConfig: hirschDualCanvasPRP, numTrials: 12,
      instructions: 'Practice PRP block: Respond LEFT first (A/D), then RIGHT (J/L).\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRP, numTrials: 81,
      instructions: 'PRP block 1 of 4: Respond LEFT first (A/D), then RIGHT (J/L).\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRP, numTrials: 81, instructions: 'PRP block 2 of 4.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRP, numTrials: 81, instructions: 'PRP block 3 of 4.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRP, numTrials: 81, instructions: 'PRP block 4 of 4.\n\nPress any key.' },
    // Post-experimental pure blocks
    { blockConfig: hirschDualCanvasPRPPureMov, numTrials: 41,
      instructions: 'PRP pure block: MOVEMENT only.\nRight hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRPPureOr, numTrials: 41,
      instructions: 'PRP pure block: ORIENTATION only.\nRight hand: J/L.\n\nPress any key.' },
];
