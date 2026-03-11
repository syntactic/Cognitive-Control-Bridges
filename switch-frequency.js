// switch-frequency.js — Switch frequency continuum configurations
//
// Varies the switch rate from 0% (pure single-task) to 100% (every trial switches)
// to demonstrate the transition from single-task to task-switching paradigms.
//
// Three designs:
//   1. Univalent — only the relevant stimulus dimension visible per trial.
//                  Measures pure switch costs without congruency confounds.
//   2. Neutral   — both dimensions visible, but orthogonal (movement=left/right,
//                  orientation=up/down). Distractor is visible but never primes
//                  the target response. Measures distractor cost without conflict.
//   3. Bivalent  — both dimensions visible, same axis (both left/right).
//                  Congruent/incongruent manipulation. Enables Gratton analysis.
//
// Key mappings per design:
//   Designs 1 & 3: Movement A/D (left hand), Orientation J/L (right hand)
//   Design 2:      Movement A/D (left hand), Orientation I/K (right hand)

// ============================================================
// Key maps (block-config level, not referencing session_helpers constants
// since config files load before session_helpers.js)
// ============================================================

const SF_HORIZONTAL_KEY_MAPS = {
    mov: { 180: 'a', 0: 'd' },
    or:  { 180: 'j', 0: 'l' },
};

const SF_ORTHOGONAL_KEY_MAPS = {
    mov: { 180: 'a', 0: 'd' },
    or:  { 90: 'i', 270: 'k' },
};

// ============================================================
// Shared defaults
// ============================================================

const SWITCH_FREQ_DEFAULTS = {
    csi: 200,
    stimulusDuration: 2500,
    responseWindow: 2500,
    rso: 'disjoint',
    paradigm: 'single-task',
    sequenceType: 'Random',
    task2: null,
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    soa: { type: 'fixed', value: 0, params: [] },
};

// ============================================================
// Design 1: Univalent (no distractors)
// ============================================================

const UNIVALENT_COHERENCE = {
    ch1_task: 0.8,
    ch1_distractor: 0,
    ch2_task: 0,
    ch2_distractor: 0,
};

const UNIVALENT_CONGRUENCY = {
    conditions: ['univalent'],
    proportions: [1.0],
};

const sfUnivalentPureMov = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_univalent_pure_mov',
    blockType: 'pure',
    switchRate: 0,
    startTask: 'mov',
    task1: 'mov',
    coherence: UNIVALENT_COHERENCE,
    congruency: UNIVALENT_CONGRUENCY,
    keyMaps: SF_HORIZONTAL_KEY_MAPS,
};

const sfUnivalentPureOr = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_univalent_pure_or',
    blockType: 'pure',
    switchRate: 0,
    startTask: 'or',
    task1: 'or',
    coherence: UNIVALENT_COHERENCE,
    congruency: UNIVALENT_CONGRUENCY,
    keyMaps: SF_HORIZONTAL_KEY_MAPS,
};

const sfUnivalentMixed10 = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_univalent_mixed_10',
    blockType: 'mixed',
    switchRate: 10,
    startTask: null,
    task1: 'mov',
    coherence: UNIVALENT_COHERENCE,
    congruency: UNIVALENT_CONGRUENCY,
    keyMaps: SF_HORIZONTAL_KEY_MAPS,
};

const sfUnivalentMixed25 = {
    ...sfUnivalentMixed10,
    blockId: 'sf_univalent_mixed_25',
    switchRate: 25,
};

const sfUnivalentMixed50 = {
    ...sfUnivalentMixed10,
    blockId: 'sf_univalent_mixed_50',
    switchRate: 50,
};

const sfUnivalentMixed75 = {
    ...sfUnivalentMixed10,
    blockId: 'sf_univalent_mixed_75',
    switchRate: 75,
};

const sfUnivalentMixed100 = {
    ...sfUnivalentMixed10,
    blockId: 'sf_univalent_mixed_100',
    switchRate: 100,
};

// ============================================================
// Design 2: Neutral (orthogonal dimensions, no conflict)
// ============================================================

const NEUTRAL_COHERENCE = {
    ch1_task: 0.8,
    ch1_distractor: 0.2,
    ch2_task: 0,
    ch2_distractor: 0,
};

const NEUTRAL_CONGRUENCY = {
    conditions: ['neutral'],
    proportions: [1.0],
};

const sfNeutralPureMov = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_neutral_pure_mov',
    blockType: 'pure',
    switchRate: 0,
    startTask: 'mov',
    task1: 'mov',
    coherence: NEUTRAL_COHERENCE,
    congruency: NEUTRAL_CONGRUENCY,
    keyMaps: SF_ORTHOGONAL_KEY_MAPS,
};

const sfNeutralPureOr = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_neutral_pure_or',
    blockType: 'pure',
    switchRate: 0,
    startTask: 'or',
    task1: 'or',
    coherence: NEUTRAL_COHERENCE,
    congruency: NEUTRAL_CONGRUENCY,
    keyMaps: SF_ORTHOGONAL_KEY_MAPS,
};

const sfNeutralMixed10 = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_neutral_mixed_10',
    blockType: 'mixed',
    switchRate: 10,
    startTask: null,
    task1: 'mov',
    coherence: NEUTRAL_COHERENCE,
    congruency: NEUTRAL_CONGRUENCY,
    keyMaps: SF_ORTHOGONAL_KEY_MAPS,
};

const sfNeutralMixed25 = {
    ...sfNeutralMixed10,
    blockId: 'sf_neutral_mixed_25',
    switchRate: 25,
};

const sfNeutralMixed50 = {
    ...sfNeutralMixed10,
    blockId: 'sf_neutral_mixed_50',
    switchRate: 50,
};

const sfNeutralMixed75 = {
    ...sfNeutralMixed10,
    blockId: 'sf_neutral_mixed_75',
    switchRate: 75,
};

const sfNeutralMixed100 = {
    ...sfNeutralMixed10,
    blockId: 'sf_neutral_mixed_100',
    switchRate: 100,
};

// ============================================================
// Design 3: Bivalent (congruent/incongruent distractors)
// ============================================================

const BIVALENT_COHERENCE = {
    ch1_task: 0.8,
    ch1_distractor: 0.2,
    ch2_task: 0,
    ch2_distractor: 0,
};

const BIVALENT_CONGRUENCY = {
    conditions: ['congruent', 'incongruent'],
    proportions: [0.5, 0.5],
};

const sfBivalentPureMov = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_bivalent_pure_mov',
    blockType: 'pure',
    switchRate: 0,
    startTask: 'mov',
    task1: 'mov',
    coherence: BIVALENT_COHERENCE,
    congruency: BIVALENT_CONGRUENCY,
    keyMaps: SF_HORIZONTAL_KEY_MAPS,
};

const sfBivalentPureOr = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_bivalent_pure_or',
    blockType: 'pure',
    switchRate: 0,
    startTask: 'or',
    task1: 'or',
    coherence: BIVALENT_COHERENCE,
    congruency: BIVALENT_CONGRUENCY,
    keyMaps: SF_HORIZONTAL_KEY_MAPS,
};

const sfBivalentMixed10 = {
    ...SWITCH_FREQ_DEFAULTS,
    blockId: 'sf_bivalent_mixed_10',
    blockType: 'mixed',
    switchRate: 10,
    startTask: null,
    task1: 'mov',
    coherence: BIVALENT_COHERENCE,
    congruency: BIVALENT_CONGRUENCY,
    keyMaps: SF_HORIZONTAL_KEY_MAPS,
};

const sfBivalentMixed25 = {
    ...sfBivalentMixed10,
    blockId: 'sf_bivalent_mixed_25',
    switchRate: 25,
};

const sfBivalentMixed50 = {
    ...sfBivalentMixed10,
    blockId: 'sf_bivalent_mixed_50',
    switchRate: 50,
};

const sfBivalentMixed75 = {
    ...sfBivalentMixed10,
    blockId: 'sf_bivalent_mixed_75',
    switchRate: 75,
};

const sfBivalentMixed100 = {
    ...sfBivalentMixed10,
    blockId: 'sf_bivalent_mixed_100',
    switchRate: 100,
};

// ============================================================
// Instructions
// ============================================================

const SF_UNIVALENT_INSTRUCTIONS = {
    pureMov: 'Pure block: MOVEMENT task only.\n\n'
        + 'Left hand: A = leftward, D = rightward.\n\n'
        + 'Press any key to begin.',
    pureOr: 'Pure block: ORIENTATION task only.\n\n'
        + 'Right hand: J = leftward, L = rightward.\n\n'
        + 'Press any key to begin.',
    mixed: (rate) =>
        `Mixed block: The task switches on ~${rate}% of trials.\n\n`
        + 'The border style tells you which task to do:\n'
        + '  Dotted = MOVEMENT (left hand: A/D)\n'
        + '  Dashed = ORIENTATION (right hand: J/L)\n\n'
        + 'Press any key to begin.',
};

const SF_NEUTRAL_INSTRUCTIONS = {
    pureMov: 'Pure block: MOVEMENT task only.\n\n'
        + 'You will see both moving dots and oriented triangles.\n'
        + 'Ignore the triangles \u2014 respond only to dot movement.\n\n'
        + 'Left hand: A = leftward, D = rightward.\n\n'
        + 'Press any key to begin.',
    pureOr: 'Pure block: ORIENTATION task only.\n\n'
        + 'You will see both moving dots and oriented triangles.\n'
        + 'Ignore the dots \u2014 respond only to triangle orientation.\n\n'
        + 'Right hand: I = upward, K = downward.\n\n'
        + 'Press any key to begin.',
    mixed: (rate) =>
        `Mixed block: The task switches on ~${rate}% of trials.\n\n`
        + 'Both moving dots and oriented triangles are visible.\n'
        + 'The border style tells you which task to do:\n'
        + '  Dotted = MOVEMENT (left hand: A = left, D = right)\n'
        + '  Dashed = ORIENTATION (right hand: I = up, K = down)\n\n'
        + 'Ignore the irrelevant stimulus \u2014 respond only to the cued task.\n\n'
        + 'Press any key to begin.',
};

const SF_BIVALENT_INSTRUCTIONS = {
    pureMov: 'Pure block: MOVEMENT task only.\n\n'
        + 'You will see both moving dots and oriented triangles.\n'
        + 'Ignore the triangles \u2014 respond only to dot movement.\n\n'
        + 'Left hand: A = leftward, D = rightward.\n\n'
        + 'Press any key to begin.',
    pureOr: 'Pure block: ORIENTATION task only.\n\n'
        + 'You will see both moving dots and oriented triangles.\n'
        + 'Ignore the dots \u2014 respond only to triangle orientation.\n\n'
        + 'Right hand: J = leftward, L = rightward.\n\n'
        + 'Press any key to begin.',
    mixed: (rate) =>
        `Mixed block: The task switches on ~${rate}% of trials.\n\n`
        + 'Both moving dots and oriented triangles are visible.\n'
        + 'The border style tells you which task to do:\n'
        + '  Dotted = MOVEMENT (left hand: A/D)\n'
        + '  Dashed = ORIENTATION (right hand: J/L)\n\n'
        + 'Ignore the irrelevant stimulus \u2014 respond only to the cued task.\n\n'
        + 'Press any key to begin.',
};

// ============================================================
// Session definitions
// ============================================================

const SF_UNIVALENT_SESSION = [
    {
        blockConfig: sfUnivalentPureMov,
        numTrials: 40,
        instructions: SF_UNIVALENT_INSTRUCTIONS.pureMov,
    },
    {
        blockConfig: sfUnivalentPureOr,
        numTrials: 40,
        instructions: SF_UNIVALENT_INSTRUCTIONS.pureOr,
    },
    {
        blockConfig: sfUnivalentMixed10,
        numTrials: 80,
        instructions: SF_UNIVALENT_INSTRUCTIONS.mixed(10),
    },
    {
        blockConfig: sfUnivalentMixed25,
        numTrials: 80,
        instructions: SF_UNIVALENT_INSTRUCTIONS.mixed(25),
    },
    {
        blockConfig: sfUnivalentMixed50,
        numTrials: 80,
        instructions: SF_UNIVALENT_INSTRUCTIONS.mixed(50),
    },
    {
        blockConfig: sfUnivalentMixed75,
        numTrials: 80,
        instructions: SF_UNIVALENT_INSTRUCTIONS.mixed(75),
    },
    {
        blockConfig: sfUnivalentMixed100,
        numTrials: 80,
        instructions: SF_UNIVALENT_INSTRUCTIONS.mixed(100),
    },
];

const SF_NEUTRAL_SESSION = [
    {
        blockConfig: sfNeutralPureMov,
        numTrials: 40,
        instructions: SF_NEUTRAL_INSTRUCTIONS.pureMov,
    },
    {
        blockConfig: sfNeutralPureOr,
        numTrials: 40,
        instructions: SF_NEUTRAL_INSTRUCTIONS.pureOr,
    },
    {
        blockConfig: sfNeutralMixed10,
        numTrials: 80,
        instructions: SF_NEUTRAL_INSTRUCTIONS.mixed(10),
    },
    {
        blockConfig: sfNeutralMixed25,
        numTrials: 80,
        instructions: SF_NEUTRAL_INSTRUCTIONS.mixed(25),
    },
    {
        blockConfig: sfNeutralMixed50,
        numTrials: 80,
        instructions: SF_NEUTRAL_INSTRUCTIONS.mixed(50),
    },
    {
        blockConfig: sfNeutralMixed75,
        numTrials: 80,
        instructions: SF_NEUTRAL_INSTRUCTIONS.mixed(75),
    },
    {
        blockConfig: sfNeutralMixed100,
        numTrials: 80,
        instructions: SF_NEUTRAL_INSTRUCTIONS.mixed(100),
    },
];

const SF_BIVALENT_SESSION = [
    {
        blockConfig: sfBivalentPureMov,
        numTrials: 40,
        instructions: SF_BIVALENT_INSTRUCTIONS.pureMov,
    },
    {
        blockConfig: sfBivalentPureOr,
        numTrials: 40,
        instructions: SF_BIVALENT_INSTRUCTIONS.pureOr,
    },
    {
        blockConfig: sfBivalentMixed10,
        numTrials: 80,
        instructions: SF_BIVALENT_INSTRUCTIONS.mixed(10),
    },
    {
        blockConfig: sfBivalentMixed25,
        numTrials: 80,
        instructions: SF_BIVALENT_INSTRUCTIONS.mixed(25),
    },
    {
        blockConfig: sfBivalentMixed50,
        numTrials: 80,
        instructions: SF_BIVALENT_INSTRUCTIONS.mixed(50),
    },
    {
        blockConfig: sfBivalentMixed75,
        numTrials: 80,
        instructions: SF_BIVALENT_INSTRUCTIONS.mixed(75),
    },
    {
        blockConfig: sfBivalentMixed100,
        numTrials: 80,
        instructions: SF_BIVALENT_INSTRUCTIONS.mixed(100),
    },
];
