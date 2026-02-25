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
// All blocks use identical response set overlap (keys: a = left, d = right).
// Stimuli are univalent throughout (no congruency manipulation).

const HIRSCH_DEFAULTS = {
    csi: 200,                // ms, cue-stimulus interval
    stimulusDuration: 300,   // ms
    responseWindow: 2500,    // ms, go signal duration
    rso: 'identical',
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

// --- PRP block ---
// T1/T2 assignment switches trial-to-trial (switchRate=50).
// SOA sampled from extended range for parametric bridge.

const hirschPRP = {
    ...HIRSCH_DEFAULTS,
    blockId: 'hirsch_prp',
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

// --- Session definition ---
// Order: pure blocks → mixed → PRP (standard in the literature)

const HIRSCH_SESSION = [
    {
        blockConfig: hirschPureMov,
        numTrials: 40,
        instructions: 'Pure block: MOVEMENT task only.\n\nPress A for leftward motion, D for rightward motion.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschPureOr,
        numTrials: 40,
        instructions: 'Pure block: ORIENTATION task only.\n\nPress A for leftward tilt, D for rightward tilt.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschMixed,
        numTrials: 80,
        instructions: 'Mixed block: The task switches randomly between trials.\n\nThe border style tells you which task to do:\n  Dotted = MOVEMENT\n  Dashed = ORIENTATION\n\nPress A for left, D for right.\n\nPress any key to begin.',
    },
    {
        blockConfig: hirschPRP,
        numTrials: 120,
        instructions: 'Dual-task (PRP) block: Two tasks per trial.\n\nRespond to the FIRST task, then the SECOND task.\nBoth use the same keys: A = left, D = right.\n\nThe delay between tasks will vary.\n\nPress any key to begin.',
    },
];
