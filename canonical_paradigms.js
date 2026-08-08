// canonical_paradigms.js — Five canonical single-canvas cognitive-control paradigms
//
// Built to validate the individual paradigms (with proper counterbalancing) before
// trusting the novel task-switching<->PRP bridge. See PARADIGMS_PLAN.md for the full
// design rationale and the SweetPea factor specs.
//
//   1. PRP / dual-task                 — cp_prp
//   2. Task switching (basic)          — cp_taskswitch
//   3. Task switching (asymmetric)     — cp_taskswitch_asym
//   4. Stroop (basic)                  — cp_stroop
//   5. Stroop (crossed target x dist)  — cp_stroop_crossed
//
// ALL single canvas. Coherence is an explicit experimental factor — NO QUEST here.
// Congruent/incongruent trials throughout.
//
// Response-key scheme (design decision D1, confirmed with Tim):
//   - Switching & Stroop (#2-#5): IDENTICAL A/D mapping for BOTH tasks (one hand).
//     This makes response_transition orthogonal to task_transition so SweetPea can
//     counterbalance them (the fix for the negative-switch-cost confound), and makes
//     the bivalent distractor compete for the same physical keys (true Stroop conflict).
//   - PRP (#1): DISJOINT keys (mov=A/D left hand, or=J/L right hand) so the response
//     extractor can separate T1 and T2 responses in the keypress stream.
//
// The interim trial sequences come from the existing generator (engine.js). Final
// counterbalancing — especially response_transition — is deferred to SweetPea; a CSV
// loader will later replace generateSequenceVectors without touching these configs.

// ============================================================
// Tunable constants (design decisions D2-D5, placeholders confirmed with Tim)
// ============================================================

// Coherence values (0-1). Higher = easier. Placeholders — tune with advisor.
const CP_EASY = 0.8;
const CP_HARD = 0.3;
const CP_DISTRACTOR = 0.5;               // bivalent distractor strength (Stroop/switching)
const CP_STROOP_LEVELS = {               // crossed-coherence Stroop levels
    low: 0.25, mid: 0.45, high: 0.70,
};

// PRP SOA levels (ms) — D3. 3-4 short SOAs; tunable.
const CP_PRP_SOA_LEVELS = [100, 300, 600];

const CP_SWITCH_RATE = 50;

// D5 participant-counterbalanced choices:
const CP_EASY_TASK = 'mov';    // asymmetric switching: which task is the EASY one
const CP_TARGET_TASK = 'mov';  // Stroop: which dimension is the TARGET (other = distractor)

// Key maps (block-config level; config files load before session_helpers.js).
// Identical mapping: both tasks answered with the SAME two keys (left hand A/D).
const CP_IDENTICAL_KEY_MAPS = {
    mov: { 180: 'a', 0: 'd' },
    or:  { 180: 'a', 0: 'd' },
};
// Disjoint mapping for PRP: mov = left hand A/D, or = right hand J/L.
const CP_DISJOINT_KEY_MAPS = {
    mov: { 180: 'a', 0: 'd' },
    or:  { 180: 'j', 0: 'l' },
};

// ============================================================
// Shared defaults
// ============================================================

const CP_DEFAULTS = {
    csi: 200,                 // ms cue-stimulus interval
    stimulusDuration: 2500,   // ms
    responseWindow: 2500,     // ms
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    congruency: { conditions: ['congruent', 'incongruent'], proportions: [0.5, 0.5] },
};

// ============================================================
// 1. PRP / dual-task
// ============================================================
// Two tasks per trial (mov + or) overlapping with an SOA. Disjoint keys so the two
// responses are separable. Cross-task congruency (T1 vs T2 target direction) is a factor.

const cpPRP = {
    ...CP_DEFAULTS,
    blockId: 'cp_prp',
    blockType: 'prp',
    paradigm: 'dual-task',
    csi: 0,
    rso: 'disjoint',
    keyMaps: CP_DISJOINT_KEY_MAPS,
    task1: 'mov',
    t2Rule: 'switch',         // T2 is always the OTHER task (mov->or / or->mov)
    sequenceType: 'Factorial',
    switchRate: 0,
    startTask: null,
    // Fixed, comparable coherence for both tasks (per-task tunable if needed).
    coherence: { target: { mov: CP_EASY, or: CP_EASY }, distractor: 0 },
    soa: { type: 'choice', value: 300, params: CP_PRP_SOA_LEVELS },
};

// ============================================================
// 2. Task switching (basic)
// ============================================================
// One task per trial, switching mov<->or at CP_SWITCH_RATE. Bivalent stimuli
// (relevant dimension + distractor) so congruency is a factor. Target coherence
// easy/hard, counterbalanced across the two tasks (levelFactors + task-then-level table).

const cpTaskSwitch = {
    ...CP_DEFAULTS,
    blockId: 'cp_taskswitch',
    blockType: 'mixed',
    paradigm: 'single-task',
    rso: 'identical',
    keyMaps: CP_IDENTICAL_KEY_MAPS,
    sequenceType: 'Factorial',
    switchRate: CP_SWITCH_RATE,
    startTask: null,
    levelFactors: { target: ['easy', 'hard'] },
    // Task-then-level table: each task appears easy and hard (crossed with task by
    // Factorial's task x targetLevel balancing).
    coherence: {
        target: {
            mov: { easy: CP_EASY, hard: CP_HARD },
            or:  { easy: CP_EASY, hard: CP_HARD },
        },
        distractor: CP_DISTRACTOR,
    },
};

// ============================================================
// 3. Task switching (asymmetric)
// ============================================================
// Same structure as #2 but the two tasks run at systematically different coherences
// (one easy, one hard) => asymmetric switch costs. No target-level factor; coherence
// is a fixed per-task value. CP_EASY_TASK (participant-counterbalanced) picks which.

const cpTaskSwitchAsym = {
    ...CP_DEFAULTS,
    blockId: 'cp_taskswitch_asym',
    blockType: 'mixed',
    paradigm: 'single-task',
    rso: 'identical',
    keyMaps: CP_IDENTICAL_KEY_MAPS,
    sequenceType: 'Factorial',
    switchRate: CP_SWITCH_RATE,
    startTask: null,
    coherence: {
        target: {
            mov: CP_EASY_TASK === 'mov' ? CP_EASY : CP_HARD,
            or:  CP_EASY_TASK === 'or'  ? CP_EASY : CP_HARD,
        },
        distractor: CP_DISTRACTOR,
    },
};

// ============================================================
// 4. Stroop / single-task interference (basic)
// ============================================================
// One task throughout (no switching), bivalent stimulus with distractor from the other
// dimension. Congruent/incongruent as a factor. CP_TARGET_TASK picks the target dim.

const cpStroop = {
    ...CP_DEFAULTS,
    blockId: 'cp_stroop',
    blockType: 'stroop',
    paradigm: 'single-task',
    rso: 'identical',
    keyMaps: CP_IDENTICAL_KEY_MAPS,
    sequenceType: 'Factorial',
    switchRate: 0,            // pure single task
    startTask: CP_TARGET_TASK,
    task1: CP_TARGET_TASK,
    coherence: { target: CP_EASY, distractor: CP_DISTRACTOR },
};

// ============================================================
// 5. Stroop, crossed target x distractor coherence
// ============================================================
// Like #4 but cross target-coherence level x distractor-coherence level (several levels
// of each within the session). CP_TARGET_TASK picks target vs distractor dimension.

const cpStroopCrossed = {
    ...CP_DEFAULTS,
    blockId: 'cp_stroop_crossed',
    blockType: 'stroop',
    paradigm: 'single-task',
    rso: 'identical',
    keyMaps: CP_IDENTICAL_KEY_MAPS,
    sequenceType: 'Factorial',
    switchRate: 0,
    startTask: CP_TARGET_TASK,
    task1: CP_TARGET_TASK,
    levelFactors: {
        target: ['low', 'mid', 'high'],
        distractor: ['low', 'mid', 'high'],
    },
    coherence: {
        target: CP_STROOP_LEVELS,
        distractor: CP_STROOP_LEVELS,
    },
};

// ============================================================
// SweetPea CSV wiring (participant/condition -> sequenceSource)
// ============================================================
// By DEFAULT the canonical sessions use the interim JS generator (above). When
// the page is opened with ?participant=NN&condition=A|B, index.html calls
// cpApplySweetPea() to swap each block onto its pre-generated, counterbalanced
// SweetPea CSV (sequences/<blockId>_<condition>_p<NN>.csv). The generator stays
// the fallback so demos and the other paradigms are untouched.
//
// Between-subjects assignment (which task is easy in asym switching; which
// dimension is the target in Stroop/PRP) is baked into the CSV at the trial
// level, but the client is not fully agnostic: cpApplySweetPea() must pick the
// matching instruction text from `condition` for cp_prp, cp_stroop, and
// cp_stroop_crossed (A = mov, B = or). The only coherence config that must
// change for CSV mode is the asymmetric switcher: its CSV emits an
// already-resolved target_coh_level (easy on the easy task), so we swap its
// per-task table for a level-keyed one.

const CP_CSV_COHERENCE_OVERRIDES = {
    cp_taskswitch_asym: {
        target: { easy: CP_EASY, hard: CP_HARD },
        distractor: CP_DISTRACTOR,
    },
};

function cpSequencePath(blockId, condition, participant) {
    const nn = String(participant).padStart(2, '0');
    return `sequences/${blockId}_${condition}_p${nn}.csv`;
}

/**
 * Return a copy of a canonical session array with each block pointed at its
 * SweetPea CSV. Pure; does not mutate the input configs.
 *
 * @param {Array} sessionArray - e.g. CP_TASKSWITCH_SESSION
 * @param {number|string} participant - participant id (>=1)
 * @param {string} condition - 'A' or 'B'
 */
function cpApplySweetPea(sessionArray, participant, condition) {
    return sessionArray.map(blockDef => {
        const blockId = blockDef.blockConfig.blockId;
        const override = CP_CSV_COHERENCE_OVERRIDES[blockId];
        const blockConfig = {
            ...blockDef.blockConfig,
            sequenceSource: cpSequencePath(blockId, condition, participant),
            ...(override ? { coherence: override } : {}),
        };
        // PRP task order and the Stroop target task are condition-assigned
        // (A = mov, B = or), so their instructions must match the condition's CSV.
        const condTask = condition === 'B' ? 'or' : 'mov';
        const instructions = blockId === 'cp_prp'
            ? CP_PRP_INSTRUCTIONS(condTask)
            : (blockId === 'cp_stroop' || blockId === 'cp_stroop_crossed')
                ? CP_STROOP_INSTRUCTIONS(condTask)
                : blockDef.instructions;
        return { ...blockDef, blockConfig, instructions };
    });
}

// ============================================================
// Instructions
// ============================================================

// PRP task order is fixed per session and assigned between subjects by the
// `condition` URL param (A = movement first, B = orientation first), so the
// instructions are a function of the T1 task — same pattern as
// CP_STROOP_INSTRUCTIONS below. Key maps are task-tied and never swap:
// mov = left hand A/D, or = right hand J/L, in either order.
const CP_PRP_INSTRUCTIONS = (t1Task) => {
    const movFirst = t1Task === 'mov';
    const movItem = 'MOVEMENT - which way are the fish SWIMMING?\n'
        + '   Left hand:  A = left, D = right.';
    const orItem = 'ORIENTATION - which way are the fish FACING?\n'
        + '   Right hand:  J = left, L = right.';
    const stimulusStory = movFirst
        ? 'The fish start out swimming while facing straight toward you. A moment\n'
          + 'later they turn to face left or right. That delay changes from trial to\n'
          + 'trial - sometimes it is very short.'
        : 'The fish start out facing left or right without moving. A moment\n'
          + 'later they begin to swim. That delay changes from trial to\n'
          + 'trial - sometimes it is very short.';
    const firstName = movFirst ? 'MOVEMENT' : 'ORIENTATION';
    const secondName = movFirst ? 'ORIENTATION' : 'MOVEMENT';
    return 'Two tasks on every trial.\n\n'
        + `The ${firstName} task always comes FIRST.\n`
        + `The ${secondName} task always comes SECOND. This never changes.\n\n`
        + `1) ${movFirst ? movItem : orItem}\n\n`
        + `2) ${movFirst ? orItem : movItem}\n\n`
        + stimulusStory + '\n\n'
        + `Answer the ${firstName.toLowerCase()} task first, then the ${secondName.toLowerCase()} task, IN THAT ORDER,\n`
        + 'even if you work out the second one early.\n\n'
        + 'Be as fast as you can while staying accurate.\n\n'
        + 'Press any key to begin.';
};

const CP_TASKSWITCH_INSTRUCTIONS =
    'Task-switching block: ONE task per trial; it may switch between trials.\n\n'
    + 'The border style tells you which task to do:\n'
    + '  Dotted = MOVEMENT.   Dashed = ORIENTATION.\n'
    + 'Both tasks use the SAME keys (left hand): A = left, D = right.\n'
    + 'Ignore the irrelevant dimension.\n\n'
    + 'Press any key to begin.';

const CP_STROOP_INSTRUCTIONS = (task) =>
    `Interference block: ${task === 'mov' ? 'MOVEMENT' : 'ORIENTATION'} task only.\n\n`
    + `Respond to the ${task === 'mov' ? 'dot MOVEMENT' : 'triangle ORIENTATION'}; `
    + `ignore the ${task === 'mov' ? 'triangle orientation' : 'dot movement'}.\n`
    + 'Keys (left hand): A = left, D = right.\n\n'
    + 'Press any key to begin.';

// ============================================================
// Session definitions
// ============================================================
// Trial counts are full-length; Abridged mode (index.html) runs ~1/10 for fast testing.

const CP_PRP_SESSION = [
    // Default instructions assume condition A (movement first). The no-param
    // path (no ?participant=) is demo-only — cpApplySweetPea never runs, so the
    // JS-generator fallback's trial sequence does not necessarily match these
    // instructions. With ?participant=&condition=, cpApplySweetPea overrides
    // them per condition.
    { blockConfig: cpPRP, numTrials: 120, instructions: CP_PRP_INSTRUCTIONS('mov') },
];

const CP_TASKSWITCH_SESSION = [
    { blockConfig: cpTaskSwitch, numTrials: 128, instructions: CP_TASKSWITCH_INSTRUCTIONS },
];

const CP_TASKSWITCH_ASYM_SESSION = [
    { blockConfig: cpTaskSwitchAsym, numTrials: 128,
      instructions: CP_TASKSWITCH_INSTRUCTIONS
          + '\n\n(Note: one task is systematically harder than the other.)' },
];

const CP_STROOP_SESSION = [
    { blockConfig: cpStroop, numTrials: 96, instructions: CP_STROOP_INSTRUCTIONS(CP_TARGET_TASK) },
];

const CP_STROOP_CROSSED_SESSION = [
    { blockConfig: cpStroopCrossed, numTrials: 144, instructions: CP_STROOP_INSTRUCTIONS(CP_TARGET_TASK) },
];
