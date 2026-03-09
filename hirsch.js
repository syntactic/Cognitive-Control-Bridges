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


const HIRSCH_DUAL_CANVAS_SESSION = [
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
