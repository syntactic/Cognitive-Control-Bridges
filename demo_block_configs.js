// demo_block_configs.js — Generic demo configurations for the bridge experiment library
//
// These configs showcase the SE library's capabilities without being tied to any
// specific paper replication. They use single-canvas presentation for simplicity.
//
// Movement task: A = left, D = right.
// Orientation task: J = left, L = right.
// Disjoint response sets eliminate response-reversal ambiguity in PRP data.
// Stimuli are univalent throughout (no congruency manipulation).

const DEMO_DEFAULTS = {
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

// --- Pure blocks (one per task) ---

const demoPureMov = {
    ...DEMO_DEFAULTS,
    blockId: 'demo_pure_mov',
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

const demoPureOr = {
    ...demoPureMov,
    blockId: 'demo_pure_or',
    task1: 'or',
    startTask: 'or',
};

// --- Mixed task-switching block ---

const demoMixed = {
    ...DEMO_DEFAULTS,
    blockId: 'demo_mixed',
    blockType: 'mixed',
    paradigm: 'single-task',
    task1: 'mov',
    task2: null,
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
    coherence: {
        ch1_task: 0.8,
        ch1_distractor: 0,
        ch2_task: 0,
        ch2_distractor: 0,
    },
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    soa: { type: 'fixed', value: 0, params: [] },
};

// --- Single-canvas PRP block ---
// Cross-type only (T1 and T2 always different tasks), overlaid on one canvas.
// SOA sampled from extended range for parametric bridge exploration.

const demoPRP = {
    ...DEMO_DEFAULTS,
    blockId: 'demo_prp',
    blockType: 'prp',
    paradigm: 'dual-task',
    task1: 'mov',
    task2: 'or',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    soa: { type: 'choice', value: 100, params: [50, 100, 200, 400, 600, 1000] },
};

// --- Dual-canvas same-task PRP block ---
// Both canvases always show the same task type on each trial.

const demoDualCanvasSame = {
    ...DEMO_DEFAULTS,
    paradigm: 'dual-canvas',
    iti: { type: 'fixed', value: 1000 },
    soa: { type: 'choice', value: 600, params: [100, 600] },
    rso: 'disjoint',
    blockId: 'demo_dual_canvas_same',
    blockType: 'prp',
    t2Rule: 'same',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
};

// --- Session definitions ---

const DEMO_SESSION = [
    {
        blockConfig: demoPureMov,
        numTrials: 40,
        instructions: 'Pure block: MOVEMENT task only.\n\nLeft hand: A = leftward, D = rightward.\n\nPress any key to begin.',
    },
    {
        blockConfig: demoPureOr,
        numTrials: 40,
        instructions: 'Pure block: ORIENTATION task only.\n\nRight hand: J = leftward, L = rightward.\n\nPress any key to begin.',
    },
    {
        blockConfig: demoMixed,
        numTrials: 80,
        instructions: 'Mixed block: The task switches randomly between trials.\n\nThe border style tells you which task to do:\n  Dotted = MOVEMENT (left hand: A/D)\n  Dashed = ORIENTATION (right hand: J/L)\n\nPress any key to begin.',
    },
    {
        blockConfig: demoPRP,
        numTrials: 120,
        instructions: 'Dual-task (PRP) block: Two tasks per trial.\n\nRespond to the FIRST task, then the SECOND task.\nMOVEMENT (left hand): A = left, D = right.\nORIENTATION (right hand): J = left, L = right.\n\nThe delay between tasks will vary.\n\nPress any key to begin.',
    },
];

const DEMO_DUAL_CANVAS_SAME_SESSION = [
    {
        blockConfig: demoDualCanvasSame,
        numTrials: 120,
        instructions: 'Dual-task (PRP) block: Two canvases, SAME task type.\n\n'
            + 'Respond to the LEFT canvas first (A/D), then the RIGHT canvas (J/L).\n'
            + 'Both canvases will show the same task type on each trial.\n\n'
            + 'Press any key to begin.',
    },
];
