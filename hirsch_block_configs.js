// hirsch_block_configs.js — Hirsch et al. (2018) faithful replication configs
//
// Two parts matching the original paper:
//   Part 1 — Task Switching: Stimuli alternate left/right across trials,
//            RSI (Response-Stimulus Interval) varied {100, 600} ms.
//   Part 2 — Dual-Task PRP: T1 on left, T2 on right, SOA varied {100, 600} ms.
//            T1-T2 task sequence sampled independently.
//
// Pure baselines:
//   Part 1 uses alternating paradigm (same spatial layout, single task).
//   Part 2 uses prp-baseline paradigm (asterisk on left, respond right only).
//
// Movement task: A = left, D = right (left hand).
// Orientation task: J = left, L = right (right hand).

const HIRSCH_DEFAULTS = {
    csi: 0,
    stimulusDuration: 5000,
    responseWindow: 5000,
    rso: 'disjoint',
    earlyResolve: true,
    feedback: false,
    acceptFirstResponse: true,
    coherence: {
        ch1_task: 0.5,
        ch1_distractor: 0,
        ch2_task: 0,
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
    rso: 'disjoint',
};

const HIRSCH_ALTERNATING_DEFAULTS = {
    ...HIRSCH_DEFAULTS,
    paradigm: 'alternating',
    iti: { type: 'choice', params: [100, 600], value: 600 },
    coherence: {
        ch1_task: 0.5,
        ch1_distractor: 0,
        ch2_task: 0,
        ch2_distractor: 0,
    },
};

// =========================================================================
// Part 1: Task Switching — alternating-canvas configs
// =========================================================================

const hirschAlternatingPureMov = {
    ...HIRSCH_ALTERNATING_DEFAULTS,
    blockId: 'hirsch_alternating_pure_mov',
    blockType: 'pure',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov',
};

const hirschAlternatingPureOr = {
    ...HIRSCH_ALTERNATING_DEFAULTS,
    blockId: 'hirsch_alternating_pure_or',
    blockType: 'pure',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'or',
};

const hirschAlternatingMixed = {
    ...HIRSCH_ALTERNATING_DEFAULTS,
    blockId: 'hirsch_alternating_mixed',
    blockType: 'mixed',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
};

// =========================================================================
// Part 2: Dual-Task PRP — dual-canvas configs
// =========================================================================

const hirschDualCanvasPRPPureMov = {
    ...HIRSCH_DUAL_DEFAULTS,
    blockId: 'hirsch_dual_canvas_pure_mov',
    blockType: 'prp-baseline',
    paradigm: 'prp-baseline',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov',
    earlyResolve: true,
};

const hirschDualCanvasPRPPureOr = {
    ...HIRSCH_DUAL_DEFAULTS,
    blockId: 'hirsch_dual_canvas_pure_or',
    blockType: 'prp-baseline',
    paradigm: 'prp-baseline',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'or',
    earlyResolve: true,
};

const hirschDualCanvasPRP = {
    ...HIRSCH_DUAL_DEFAULTS,
    blockId: 'hirsch_dual_canvas',
    blockType: 'prp',
    t2Rule: 'independent',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
};

// =========================================================================
// Full faithful replication session (~60 min, use abridged for demos)
// =========================================================================

const HIRSCH_FAITHFUL_SESSION = [
    // --- Part 1: Task Switching ---
    // Practice + pure baselines
    { blockConfig: hirschAlternatingPureMov, numTrials: 6, isPractice: true,
      instructions: 'Practice pure block: MOVEMENT only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschAlternatingPureMov, numTrials: 41,
      instructions: 'Pure block: MOVEMENT only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschAlternatingPureOr, numTrials: 6, isPractice: true,
      instructions: 'Practice pure block: ORIENTATION only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschAlternatingPureOr, numTrials: 41,
      instructions: 'Pure block: ORIENTATION only.\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
    // Practice + experimental mixed blocks (4 x 81 trials)
    { blockConfig: hirschAlternatingMixed, numTrials: 12, isPractice: true,
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
    // Practice + pure baselines (asterisk on left, respond right only)
    { blockConfig: hirschDualCanvasPRPPureMov, numTrials: 6, isPractice: true,
      instructions: 'Practice PRP pure block: MOVEMENT only.\nRight hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRPPureMov, numTrials: 41,
      instructions: 'PRP pure block: MOVEMENT only.\nRight hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRPPureOr, numTrials: 6, isPractice: true,
      instructions: 'Practice PRP pure block: ORIENTATION only.\nRight hand: J/L.\n\nPress any key.' },
    { blockConfig: hirschDualCanvasPRPPureOr, numTrials: 41,
      instructions: 'PRP pure block: ORIENTATION only.\nRight hand: J/L.\n\nPress any key.' },
    // Practice + experimental PRP blocks (4 x 81 trials)
    { blockConfig: hirschDualCanvasPRP, numTrials: 12, isPractice: true,
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

// =========================================================================
// Sub-sessions for demoing individual Hirsch components
// =========================================================================

// Part 1 only: pure → mixed → pure
const HIRSCH_TASK_SWITCHING_SESSION = [
    { blockConfig: hirschAlternatingPureMov, numTrials: 40,
      instructions: 'Pure block: MOVEMENT only, two canvases.\n\nPress any key to begin.' },
    { blockConfig: hirschAlternatingPureOr, numTrials: 40,
      instructions: 'Pure block: ORIENTATION only, two canvases.\n\nPress any key to begin.' },
    { blockConfig: hirschAlternatingMixed, numTrials: 120,
      instructions: 'Mixed task switching block: Two canvases, one task each.\n\n'
          + 'The tasks might be different types (movement vs orientation) or they might be the same.\n\n'
          + 'Press any key to begin.' },
    { blockConfig: hirschAlternatingPureMov, numTrials: 40,
      instructions: 'Pure block: MOVEMENT only, two canvases.\n\nPress any key to begin.' },
    { blockConfig: hirschAlternatingPureOr, numTrials: 40,
      instructions: 'Pure block: ORIENTATION only, two canvases.\n\nPress any key to begin.' },
];

// Part 2 only: prp-baseline pure → dual-canvas PRP → prp-baseline pure
const HIRSCH_DUAL_CANVAS_SESSION = [
    { blockConfig: hirschDualCanvasPRPPureMov, numTrials: 40,
      instructions: 'Pure block: MOVEMENT only on right side.\n\nRight hand: J = left, L = right.\n\nPress any key to begin.' },
    { blockConfig: hirschDualCanvasPRPPureOr, numTrials: 40,
      instructions: 'Pure block: ORIENTATION only on right side.\n\nRight hand: J = left, L = right.\n\nPress any key to begin.' },
    { blockConfig: hirschDualCanvasPRP, numTrials: 120,
      instructions: 'Dual-task (PRP) block: Two canvases, one task each.\n\n'
          + 'Respond to the LEFT canvas first (A/D), then the RIGHT canvas (J/L).\n'
          + 'The tasks might be different types (movement vs orientation) or they might be the same.\n\n'
          + 'Press any key to begin.' },
];

// Quick single-block tests for individual paradigms
const HIRSCH_ALT_PURE_DEMO = [
    { blockConfig: hirschAlternatingPureMov, numTrials: 20,
      instructions: 'Quick test: Alternating pure block (MOVEMENT only).\nLeft hand: A/D. Right hand: J/L.\n\nPress any key.' },
];

const HIRSCH_ALT_MIXED_DEMO = [
    { blockConfig: hirschAlternatingMixed, numTrials: 40,
      instructions: 'Quick test: Alternating mixed block.\nTasks switch randomly. Respond with the matching hand.\nA/D for left, J/L for right.\n\nPress any key.' },
];

const HIRSCH_PRP_BASELINE_DEMO = [
    { blockConfig: hirschDualCanvasPRPPureMov, numTrials: 20,
      instructions: 'Quick test: PRP baseline (asterisk on left, respond right only).\nRight hand: J/L.\n\nPress any key.' },
];

const HIRSCH_PRP_DEMO = [
    { blockConfig: hirschDualCanvasPRP, numTrials: 40,
      instructions: 'Quick test: Dual-canvas PRP.\nRespond LEFT first (A/D), then RIGHT (J/L).\n\nPress any key.' },
];
