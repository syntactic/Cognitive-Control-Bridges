// canonical_paradigms.js — Five canonical single-canvas cognitive-control paradigms
//
// Built to validate the individual paradigms (with proper counterbalancing) before
// trusting the novel task-switching<->PRP bridge.
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
// Response-key scheme — disjoint response sets whenever a paradigm has TWO
// tasks; shared keys for Stroop, which has one:
//   - PRP (#1) and switching (#2, #3): DISJOINT keys (mov = A/D left hand,
//     or = J/L right hand). Two tasks => two response sets. For PRP this is also
//     what lets the response extractor separate T1 and T2 in the keypress stream.
//   - Stroop (#4, #5): IDENTICAL A/D mapping for BOTH dimensions (one hand). The
//     Stroop effect is large because both pathways converge on a SHARED response
//     set; mapping the distractor onto keys the participant never presses removes
//     the response-level conflict the paradigm exists to measure.
//
// Cost of the switching change, recorded deliberately: with task-tied disjoint
// keys a task switch is ALWAYS also an effector switch, so key-level response
// repetition can no longer be counterbalanced against task transition — the
// measured switch cost is a task-switch-plus-effector-switch cost and cannot be
// decomposed. Abstract (leftward/rightward) response repetition still can be,
// and that is what `response_transition` in sweetpea/designs.py is derived
// from. This conflicts with the counterbalancing rationale in Sebastian's
// 2026-06-08 email; the policy here follows his 2026-07-31 l.49 instruction and
// the conflict is unresolved.
//
// The interim trial sequences come from the existing generator (engine.js). Final
// counterbalancing — especially response_transition — is deferred to SweetPea; a CSV
// loader will later replace generateSequenceVectors without touching these configs.

// ============================================================
// Tunable constants (placeholders confirmed with Tim)
// ============================================================

// Coherence values (0-1). Higher = easier. Placeholders — tune with advisor.
const CP_EASY = 0.8;
const CP_HARD = 0.3;
const CP_DISTRACTOR = 0.5;               // bivalent distractor strength (Stroop/switching)
const CP_STROOP_LEVELS = {               // crossed-coherence Stroop levels
    low: 0.25, mid: 0.45, high: 0.70,
};

// PRP SOA levels (ms). 3-4 short SOAs; tunable.
const CP_PRP_SOA_LEVELS = [100, 300, 600];

const CP_SWITCH_RATE = 50;

// Participant-counterbalanced choices:
const CP_EASY_TASK = 'mov';    // asymmetric switching: which task is the EASY one
const CP_TARGET_TASK = 'mov';  // Stroop: which dimension is the TARGET (other = distractor)

// Key maps (block-config level; config files load before session_helpers.js).
// Identical mapping: both dimensions answered with the SAME two keys (left hand
// A/D). Stroop only — see the response-key note at the top of this file.
const CP_IDENTICAL_KEY_MAPS = {
    mov: { 180: 'a', 0: 'd' },
    or:  { 180: 'a', 0: 'd' },
};
// Disjoint mapping for the two-task paradigms (PRP, switching):
// mov = left hand A/D, or = right hand J/L.
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

    // Response regime. All three are set explicitly:
    // none of them implies another, and engine.js defaults earlyResolve to false.
    //
    // earlyResolve: the trial ends on the response instead of running the full
    //   2500 ms. Without it a test trial costs ~3 s while a training trial ends on
    //   the response, i.e. the response regime would change exactly at the
    //   training -> test boundary. For a dual-task trial SE resolves only once
    //   BOTH go signals have settled (src/trial.js resolveEarly), so PRP still
    //   collects both responses.
    // acceptFirstResponse: the first press IS the response. Required alongside
    //   earlyResolve — SE's src/trial.js:248 is
    //   `earlyResolve && (isCorrect || acceptFirstResponse)`, so earlyResolve on
    //   its own resolves early only on a CORRECT press and quietly invites
    //   corrections, which score as 'corrected' with the second press's RT.
    // feedback: OFF in test blocks so that no exogenous event on trial n
    //   lands inside trial n+1's response-selection window. Training turns it back
    //   on (training_stages.js), where shaping needs it.
    earlyResolve: true,
    acceptFirstResponse: true,
    feedback: false,
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
    // Two tasks => separate response sets (Sebastian, 07-31 l.49). See the
    // response-key note at the top of this file for the cost this accepts.
    rso: 'disjoint',
    keyMaps: CP_DISJOINT_KEY_MAPS,
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
    rso: 'disjoint',
    keyMaps: CP_DISJOINT_KEY_MAPS,
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
        // Training stages are generated live (their content is a shaping schedule,
        // not a counterbalanced design) and have no CSV. Pointing them at
        // cpSequencePath() would make preloadSequences fetch sequences/train_S2_...csv
        // and abort the session on a 404.
        if (blockDef.phase === 'training') return blockDef;
        const blockId = blockDef.blockConfig.blockId;
        const override = CP_CSV_COHERENCE_OVERRIDES[blockId];
        const blockConfig = {
            ...blockDef.blockConfig,
            sequenceSource: cpSequencePath(blockId, condition, participant),
            ...(override ? { coherence: override } : {}),
        };
        // PRP task order and the Stroop target task are condition-assigned
        // (A = mov, B = or), so their instructions must match the condition's CSV.
        //
        // A blockDef with NO instructions keeps none: the second half of a split
        // test block is preceded by the break screen, not by its own instruction
        // screen, and overriding null here would put a full instruction screen
        // immediately after the break.
        const condTask = condition === 'B' ? 'or' : 'mov';
        const instructions = !blockDef.instructions
            ? blockDef.instructions
            : blockId === 'cp_prp'
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
// KEEP THIS SHORT. showInstructions dismisses on ANY keydown after 200 ms, so a
// participant who presses Space or PageDown to read a screen taller than the
// 600 px canvas starts the block instead. The overflow CSS on
// .instructions-overlay is a safety net, not a reading affordance — intercepting
// the scroll keys is not an option either, because every screen ends with "press
// any key" and that has to stay true. This screen was 819 px before it was
// trimmed; measure with `node analysis/measure_instructions.js` after any edit.
const CP_PRP_INSTRUCTIONS = (t1Task) => {
    const movFirst = t1Task === 'mov';
    const movItem = 'MOVEMENT — which way are the fish SWIMMING?\n'
        + '   Left hand: A = left, D = right.';
    const orItem = 'ORIENTATION — which way are the fish FACING?\n'
        + '   Right hand: J = left, L = right.';
    // Which dimension is static at trial onset depends on which task is T1.
    const stimulusStory = movFirst
        ? 'The fish swim first, then turn to face left or right.'
        : 'The fish face left or right first, then start to swim.';
    return 'Two tasks on every trial, always in this order:\n\n'
        + `1) ${movFirst ? movItem : orItem}\n\n`
        + `2) ${movFirst ? orItem : movItem}\n\n`
        + stimulusStory + '\n'
        + 'The gap between the two varies, and can be very short.\n\n'
        + 'Answer them in that order, even if you work out\n'
        + 'the second one early. Be fast but accurate.\n\n'
        + 'Press any key to begin.';
};

// Each task has its OWN keys and its own hand (07-31 l.49), so the mapping is
// stated per task rather than once for both.
// NOTE ON THE CUE. SE draws the cue as a COLORED border: src/game.js `draw()`
// picks movCueColor ('#fb0', orange) for a cueMov and orCueColor ('#0af', blue)
// for a cueOr. The dashes-vs-dots distinction in `_drawBorder` separates cue1
// from cue2 (i.e. the first from the second task of a dual-task trial), NOT
// movement from orientation. This block previously told participants
// "Dotted = MOVEMENT, Dashed = ORIENTATION", which is wrong on both counts.
const CP_TASKSWITCH_INSTRUCTIONS =
    'ONE task per trial. It may switch from trial to trial.\n\n'
    + 'The border color tells you which task:\n\n'
    + '  ORANGE = MOVEMENT (which way are the fish SWIMMING?)\n'
    + '     Left hand: A = left, D = right.\n'
    + '  BLUE = ORIENTATION (which way are they FACING?)\n'
    + '     Right hand: J = left, L = right.\n\n'
    + 'Ignore the other dimension.\n\n'
    + 'Press any key to begin.';

// NOTE: cp_taskswitch_asym deliberately gets NO extra copy. Its screen used to
// append "(Note: one task is systematically harder than the other.)", which was
// removed 2026-08-11 (Tim). Telling participants that one task is harder is a
// demand characteristic aimed squarely at the dependent variable: the paradigm
// exists to measure an ASYMMETRIC switch cost, and a participant told to expect
// asymmetry can produce it by strategy (extra caution on the "hard" task) rather
// than by the coherence manipulation. The asymmetry has to come from the stimulus,
// not from the instructions. The two switching paradigms therefore share the same
// screen verbatim, which is also what makes them comparable.

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
//
// EVERY test block is split into TWO blockDefs sharing one blockConfig. Two
// reasons, and the first is a bug fix:
//
//  1. The break summary is shown by runSession only BETWEEN blocks, and it
//     skips the break after a `phase: 'training'` block. A one-block test session
//     therefore showed NO summary at all — neither standalone (single block) nor
//     appended to a training session (last block, no next block). That summary is
//     the whole justification for `feedback: false` in CP_DEFAULTS, so with one
//     block the participant got neither trial feedback nor a block summary: no
//     speed-accuracy signal anywhere in the session.
//  2. The session design calls for breaks after ~100 trials, over 2-3 test
//     blocks. 96-144 unbroken trials failed that outright.
//
// SPLIT SIZES ARE NOT FREE. These blocks are `sequenceType: 'Factorial'`, and
// generateFactorialSequence fills any shortfall below a whole number of
// repetitions with RANDOMLY SAMPLED cells (engine.js ~line 163) — so a sub-block
// whose length is not a multiple of the crossing size silently unbalances the
// design, exactly the way the factorial-ITI test bug did. Verified empirically
// (200 replications per paradigm, observed cell counts, plus a negative control
// at a deliberately bad length):
//
//     paradigm             crossing                                cells  half
//     cp_prp               soa(3) x congruency(2)                    6     60
//     cp_taskswitch        transition(2) x congruency(2) x level(2)  8     64
//     cp_taskswitch_asym   transition(2) x congruency(2)             4     64
//     cp_stroop            congruency(2)                             2     48
//     cp_stroop_crossed    congruency(2) x target(3) x distractor(3) 18     72
//
// Every half is a whole multiple of its crossing. IF YOU CHANGE A TRIAL COUNT,
// recheck it against this table — the totals are unchanged from the pre-split
// values precisely so that this stays true.
//
// `sequenceSlice` covers the CSV path: cpApplySweetPea derives the CSV path from
// blockId, and both halves share a blockId, so without it both would load the
// whole file and replay the same rows. preloadSequences enforces this — see
// assertSequenceSourcesAreDistinct.
//
// Only the FIRST half carries instructions. The second is preceded by the break
// screen, which already says what it needs to; a second instruction screen there
// would just be one more thing to dismiss.

const CP_PRP_SESSION = [
    // Default instructions assume condition A (movement first). The no-param
    // path (no ?participant=) is demo-only — cpApplySweetPea never runs, so the
    // JS-generator fallback's trial sequence does not necessarily match these
    // instructions. With ?participant=&condition=, cpApplySweetPea overrides
    // them per condition.
    { blockConfig: cpPRP, numTrials: 60, instructions: CP_PRP_INSTRUCTIONS('mov'),
      sequenceSlice: { index: 0, of: 2 } },
    { blockConfig: cpPRP, numTrials: 60, instructions: null,
      sequenceSlice: { index: 1, of: 2 } },
];

const CP_TASKSWITCH_SESSION = [
    { blockConfig: cpTaskSwitch, numTrials: 64, instructions: CP_TASKSWITCH_INSTRUCTIONS,
      sequenceSlice: { index: 0, of: 2 } },
    { blockConfig: cpTaskSwitch, numTrials: 64, instructions: null,
      sequenceSlice: { index: 1, of: 2 } },
];

const CP_TASKSWITCH_ASYM_SESSION = [
    // Same screen as cp_taskswitch, verbatim — see the note by
    // CP_TASKSWITCH_INSTRUCTIONS on why the "one task is harder" line was dropped.
    { blockConfig: cpTaskSwitchAsym, numTrials: 64,
      instructions: CP_TASKSWITCH_INSTRUCTIONS,
      sequenceSlice: { index: 0, of: 2 } },
    { blockConfig: cpTaskSwitchAsym, numTrials: 64, instructions: null,
      sequenceSlice: { index: 1, of: 2 } },
];

const CP_STROOP_SESSION = [
    { blockConfig: cpStroop, numTrials: 48, instructions: CP_STROOP_INSTRUCTIONS(CP_TARGET_TASK),
      sequenceSlice: { index: 0, of: 2 } },
    { blockConfig: cpStroop, numTrials: 48, instructions: null,
      sequenceSlice: { index: 1, of: 2 } },
];

const CP_STROOP_CROSSED_SESSION = [
    { blockConfig: cpStroopCrossed, numTrials: 72,
      instructions: CP_STROOP_INSTRUCTIONS(CP_TARGET_TASK),
      sequenceSlice: { index: 0, of: 2 } },
    { blockConfig: cpStroopCrossed, numTrials: 72, instructions: null,
      sequenceSlice: { index: 1, of: 2 } },
];

// ============================================================
// Training / shaping sessions
// ============================================================
// Each paradigm gets ONE participant-facing session: the shared shaping sequence
// S1-S6 (buildSharedTrainingStages), then its own S8 (buildParadigmFinalStage),
// then its existing test block(s). There is no S7 — the comprehension check was
// removed from the design 2026-08-10 and nothing replaces it, so the instruction
// screens below are the only thing between a click-through participant and the
// test blocks.
//
// The shaping sequence has to be "exactly the same across all the paradigms",
// read here as identical STRUCTURE, with the key maps and coherence levels
// following each paradigm's own test block. That is why every spec below is
// built from this file's own constants and nothing is hardcoded in
// training_stages.js.

// ------------------------------------------------------------
// Instruction copy
// ------------------------------------------------------------
// Sebastian's standard: "you would like your grandmother to be able to do the
// task" (07-31 l.59). Every screen says what is on the screen, what the
// participant has to decide, and which keys — and from S4 on, what the border
// means. The copy is GENERATED from the spec's key maps rather than written out
// literally, because the maps differ by paradigm (disjoint task-tied
// keys for switching/PRP, one shared A/D map for Stroop) and two copies of the
// same sentence would drift apart.

// 0 = rightward, 180 = leftward, 90 = up, 270 = down (canvas Y-axis inverted).
const CP_DIRECTION_WORDS = { 0: 'right', 90: 'up', 180: 'left', 270: 'down' };
// Reading order for a key line: left/right first, since every canonical paradigm
// currently uses the horizontal pair.
const CP_DIRECTION_ORDER = [180, 0, 90, 270];

const CP_LEFT_HAND_LETTERS = 'qwertasdfgzxcvb';
const CP_RIGHT_HAND_LETTERS = 'yuiophjklnm';

/** "A = left, D = right" for one direction->key map. */
function cpKeyPhrase(keyMap) {
    return CP_DIRECTION_ORDER
        .filter(dir => keyMap[dir] !== undefined)
        .map(dir => `${String(keyMap[dir]).toUpperCase()} = ${CP_DIRECTION_WORDS[dir]}`)
        .join(', ');
}

/**
 * 'left' | 'right' | null — which hand a key map is answered with, inferred from
 * the keys themselves rather than declared, so the copy cannot claim "right hand"
 * for a map someone later changes to A/D.
 */
function cpHandFor(keyMap) {
    const keys = Object.values(keyMap).map(k => String(k).toLowerCase());
    if (keys.length === 0) return null;
    if (keys.every(k => CP_LEFT_HAND_LETTERS.includes(k))) return 'left';
    if (keys.every(k => CP_RIGHT_HAND_LETTERS.includes(k))) return 'right';
    return null;
}

/** True when both tasks are answered on the same key set (Stroop). */
function cpKeysAreShared(keyMaps) {
    const movKeys = Object.values(keyMaps.mov);
    const orKeys = Object.values(keyMaps.or);
    return movKeys.some(k => orKeys.includes(k));
}

/** "Left hand:  A = left, D = right" (or just the keys when there is one hand). */
function cpKeyLine(keyMap, shared) {
    const hand = shared ? null : cpHandFor(keyMap);
    const prefix = hand ? `${hand === 'left' ? 'Left' : 'Right'} hand:  ` : 'Keys:  ';
    return prefix + cpKeyPhrase(keyMap) + '.';
}

// The cue is a COLORED border (src/game.js: movCueColor '#fb0' orange,
// orCueColor '#0af' blue). Dashes vs dots separate the FIRST from the SECOND
// task of a dual-task trial, not movement from orientation — see the note above
// CP_TASKSWITCH_INSTRUCTIONS.
const CP_BORDER_LEGEND =
    '  ORANGE border  ->  answer the SWIMMING question.\n'
    + '  BLUE border    ->  answer the FACING question.';

/**
 * The seven instruction screens for one paradigm's training + test session.
 *
 * @param {{mov: object, or: object}} keyMaps - the paradigm's own key maps
 * @param {object} finalStage - { kind, t1Task?, task? }, matching the S8 spec
 * @returns {{S1..S6: string, S8: string, test: string}} plain text, '\n'
 *   separated, the convention showInstructions() renders.
 */
function cpTrainingInstructions(keyMaps, finalStage) {
    const shared = cpKeysAreShared(keyMaps);
    const movLine = cpKeyLine(keyMaps.mov, shared);
    const orLine = cpKeyLine(keyMaps.or, shared);
    const bothLines = `  Swimming:  ${cpKeyPhrase(keyMaps.mov)}.\n`
        + `  Facing:    ${cpKeyPhrase(keyMaps.or)}.`;
    // The single most confusable thing about the key policy, said out loud at
    // the moment the second map is introduced (S3).
    const secondMapNote = shared
        ? 'These are the SAME two keys you have just been using. That is on\n'
          + 'purpose: both questions are answered with the same fingers.'
        : 'These are DIFFERENT keys from the swimming task, and you answer\n'
          + 'them with your other hand. Each question has its own two keys and\n'
          + 'they never swap.';

    // The border is NOT new at S4, and telling the participant it is makes the
    // first thing they are taught about it false. SE schedules cue1 with go1 from
    // trial onset on every stage, and game.js paints it at full opacity whenever
    // its go signal is running, so an orange (S1/S2) or blue (S3) border has been
    // on screen for three stages by the time S4 starts. What actually changes at
    // S4 is that the border becomes (a) INFORMATIVE — two tasks are now mixed, so
    // the color has something to disambiguate — and (b) PREDICTIVE, because
    // cueCsi 200 puts it ahead of the stimulus where S1-S3 ran at csi 0. S1-S3
    // therefore name the border and tell the participant to ignore it, and S4
    // introduces its MEANING rather than its existence.
    const S1 =
        'STEP 1 of 7 — learning the keys.\n\n'
        + 'A group of fish will appear and swim together, either to the LEFT\n'
        + 'or to the RIGHT.\n\n'
        + 'Your job: say which way they are SWIMMING.\n\n'
        + `  ${movLine}\n\n`
        + 'There is a colored border around the edge of the screen. It does\n'
        + 'not mean anything yet — ignore it for now.\n\n'
        + 'The fish are very easy to see here, and there is NO time limit.\n'
        + 'This step is only about learning which key is which.\n\n'
        + '8 practice trials. Press any key to begin.';

    const S2 =
        'STEP 2 of 7 — the swimming task, up to speed.\n\n'
        + 'Same question as before: which way are the fish SWIMMING?\n\n'
        + `  ${movLine}\n\n`
        + 'Two things change:\n'
        + '  - Answer as FAST as you can while still getting it right.\n'
        + '  - The fish start out very easy to read and gradually get harder.\n\n'
        + 'The border is still just a border. Keep ignoring it.\n\n'
        + 'This step continues until you are answering reliably, then moves on\n'
        + 'by itself. Press any key to begin.';

    const S3 =
        'STEP 3 of 7 — a second question: which way are the fish FACING?\n\n'
        + 'This time the fish do not swim at all. They stay in place, FACING\n'
        + 'either left or right.\n\n'
        + `  ${orLine}\n\n`
        + secondMapNote + '\n\n'
        + 'The border is a different color this time. Still ignore it — it\n'
        + 'becomes useful in the next step.\n\n'
        + 'Again: as fast as you can while staying accurate. Press any key to begin.';

    const S4 =
        'STEP 4 of 7 — the border now tells you what to do.\n\n'
        + 'From now on the two questions are mixed: each trial asks about\n'
        + 'SWIMMING or about FACING, and it can change trial to trial.\n\n'
        + 'That border you have been ignoring is what tells you which. It\n'
        + 'is new in two ways:\n\n'
        + '  - Its color says which question this trial is asking.\n'
        + '  - It appears just BEFORE the fish, so you can get ready.\n\n'
        + CP_BORDER_LEGEND + '\n\n'
        + bothLines + '\n\n'
        + 'Press any key to begin.';

    const S5 =
        'STEP 5 of 7 — the fish now do both things at once.\n\n'
        + 'From here on the fish are BOTH swimming AND facing on every trial.\n'
        + 'Only one of those is your job, and the border still tells you which:\n\n'
        + CP_BORDER_LEGEND + '\n\n'
        + 'In this step the two always agree — fish swimming left are also\n'
        + 'facing left — so you cannot go wrong by looking at the wrong one.\n'
        + 'It is practice at answering the question you were actually asked.\n\n'
        + 'Press any key to begin.';

    const S6 =
        'STEP 6 of 7 — now the two can disagree.\n\n'
        + 'Same as the last step, except the fish may now be swimming one way\n'
        + 'while FACING the other way.\n\n'
        + 'Answer ONLY the question the border asked for, and ignore the other\n'
        + 'one, even when they point in opposite directions.\n\n'
        + CP_BORDER_LEGEND + '\n\n'
        + bothLines + '\n\n'
        + 'Some fish are harder to read than others. That is normal.\n\n'
        + 'Press any key to begin.';

    return { S1, S2, S3, S4, S5, S6, S8: cpFinalStageInstructions(keyMaps, finalStage) };
}

/**
 * S8's screen. The three S8 shapes need genuinely different
 * copy: 'switching' is a dress rehearsal of the mixed block, 'prp' introduces
 * two answers on one trial for the first time, and 'rehearsal' narrows back down
 * to a single task after S4-S6 taught both.
 */
function cpFinalStageInstructions(keyMaps, finalStage) {
    const shared = cpKeysAreShared(keyMaps);
    const bothLines = `  Swimming:  ${cpKeyPhrase(keyMaps.mov)}.\n`
        + `  Facing:    ${cpKeyPhrase(keyMaps.or)}.`;

    if (finalStage.kind === 'switching') {
        return 'STEP 7 of 7 — a full practice run.\n\n'
            + 'This is exactly the task you are about to do for real: one\n'
            + 'question per trial, switching between swimming and facing, with\n'
            + 'the border telling you which.\n\n'
            + CP_BORDER_LEGEND + '\n\n'
            + bothLines + '\n\n'
            + 'Fast and accurate. Press any key to begin.';
    }

    if (finalStage.kind === 'rehearsal') {
        const target = finalStage.task === 'or' ? 'or' : 'mov';
        const targetName = target === 'mov' ? 'SWIMMING' : 'FACING';
        const otherName = target === 'mov' ? 'facing' : 'swimming';
        const targetLine = cpKeyLine(keyMaps[target], shared);
        return 'STEP 7 of 7 — a short warm-up at the real settings.\n\n'
            + `From now on there is only ONE question: which way are the fish\n`
            + `${targetName}?\n\n`
            + `  ${targetLine}\n\n`
            + `The fish will still be ${otherName} left or right as well, and\n`
            + `that will often disagree with your answer. Ignore it completely —\n`
            + `you will never be asked about it again.\n\n`
            + 'Press any key to begin.';
    }

    if (finalStage.kind === 'prp') {
        const movFirst = finalStage.t1Task !== 'or';
        const firstName = movFirst ? 'SWIMMING' : 'FACING';
        const secondName = movFirst ? 'FACING' : 'SWIMMING';
        const firstLine = cpKeyLine(keyMaps[movFirst ? 'mov' : 'or'], shared);
        const secondLine = cpKeyLine(keyMaps[movFirst ? 'or' : 'mov'], shared);
        return 'STEP 7 of 7 — TWO answers on every trial.\n\n'
            + 'Every trial now asks BOTH questions, one shortly after the\n'
            + 'other, and you give two answers.\n\n'
            + `1) ${firstName} comes FIRST.   ${firstLine}\n`
            + `2) ${secondName} comes SECOND.   ${secondLine}\n\n`
            + 'That order never changes — answer them in that order even if\n'
            + 'you work the second one out early.\n\n'
            + 'Two borders appear, one per question, in the usual colors. The\n'
            + 'gap between the two starts long and gets shorter as you practice.\n\n'
            + 'Press any key to begin.';
    }

    throw new Error(`cpFinalStageInstructions: unknown S8 kind '${finalStage.kind}'`);
}

/** Prefix that turns a test block's own instructions into "practice is over". */
// Lines kept under ~58 characters so neither wraps at .instructions-content's
// max-width: 80% — this prefix is on all five test screens, so one wrapped line
// here costs every one of them a line (analysis/measure_instructions.js).
const CP_TEST_BLOCK_PREAMBLE =
    'Practice is over — the real task starts now.\n'
    + 'You will no longer be told whether each answer was right.\n\n'
    + '- - -\n\n';

// ------------------------------------------------------------
// Per-paradigm training specs
// ------------------------------------------------------------
//
// JUDGMENT CALL, flagged rather than promoted to a decision: `rampTarget` below
// is the EASIEST coherence level that task carries in the test block, not the
// hardest. The design only says S2-S4 ramp "down ... to the test levels", which
// is ambiguous once a task has two of them. The easiest level is the safer
// bottom because an S2/S3 cap failure is the pre-registered EXCLUSION rule: that
// criterion has to mean "has not learned the mapping", not "finds 0.3 coherence
// hard". Full-range exposure is S6's job, and S6 gets each test block's
// coherence table verbatim below.
//
// Training also puts bivalent stimuli in front of all five paradigms, including
// cp_prp, whose test block is univalent — so its S5/S6 use CP_DISTRACTOR. Like
// the shared CSI, that is a cost of keeping training "identical across all the
// paradigms".

/** Assemble one paradigm's full session: S1-S6, then S8, then its test blocks. */
function cpBuildTrainingSession(spec) {
    const finalStage = spec.finalStage;
    const instructions = cpTrainingInstructions(spec.keyMaps, finalStage);
    const shared = buildSharedTrainingStages({
        keyMaps: spec.keyMaps,
        rso: spec.rso,
        testCoherenceTarget: spec.rampTarget,
        testCoherenceDistractor: spec.trainingDistractor,
        ...(spec.testCoherence ? { testCoherence: spec.testCoherence } : {}),
        ...(spec.levelFactors ? { levelFactors: spec.levelFactors } : {}),
        blockIdPrefix: spec.blockIdPrefix,
        instructions,
    });
    const s8 = buildParadigmFinalStage({
        ...finalStage,
        keyMaps: spec.keyMaps,
        rso: spec.rso,
        blockIdPrefix: spec.blockIdPrefix,
        instructions: instructions.S8,
    });
    const testBlocks = spec.testSession.map((blockDef, i) => (i === 0
        ? { ...blockDef, instructions: CP_TEST_BLOCK_PREAMBLE + blockDef.instructions }
        : blockDef));
    return [...shared, s8, ...testBlocks];
}

const CP_PRP_TRAINING_SESSION = cpBuildTrainingSession({
    blockIdPrefix: 'prp_train',
    keyMaps: CP_DISJOINT_KEY_MAPS,
    rso: 'disjoint',
    rampTarget: { mov: CP_EASY, or: CP_EASY },
    // Bivalent stimuli in training even though cp_prp's test block is univalent
    // (its `coherence.distractor` is 0). Deliberately NOT passing
    // testCoherence, which would make S5/S6 univalent and skip bivalence
    // entirely.
    trainingDistractor: CP_DISTRACTOR,
    testSession: CP_PRP_SESSION,
    finalStage: {
        kind: 'prp',
        csi: cpPRP.csi,                  // 0 — S8 matches the test block exactly
        coherence: cpPRP.coherence,
        // cpPRP.task1 is condition A's first task; cpApplySweetPea swaps it (and
        // the copy) for condition B.
        t1Task: cpPRP.task1,
        // PLACEHOLDER: CP_PRP_SOA_LEVELS is Tim's stand-in
        // until Sebastian hears back from Ahmed (07-31 l.61). Passed in rather
        // than read inside the builder so the placeholder has exactly one home.
        soaLevels: CP_PRP_SOA_LEVELS,
    },
});

const CP_TASKSWITCH_TRAINING_SESSION = cpBuildTrainingSession({
    blockIdPrefix: 'ts_train',
    keyMaps: CP_DISJOINT_KEY_MAPS,
    rso: 'disjoint',
    // Each task carries both levels here, so the ramp bottoms at the easy one —
    // see the JUDGMENT CALL note above.
    rampTarget: { mov: CP_EASY, or: CP_EASY },
    trainingDistractor: CP_DISTRACTOR,
    testCoherence: cpTaskSwitch.coherence,
    levelFactors: cpTaskSwitch.levelFactors,
    testSession: CP_TASKSWITCH_SESSION,
    finalStage: {
        kind: 'switching',
        csi: cpTaskSwitch.csi,
        coherence: cpTaskSwitch.coherence,
        levelFactors: cpTaskSwitch.levelFactors,
        switchRate: cpTaskSwitch.switchRate,
    },
});

const CP_TASKSWITCH_ASYM_TRAINING_SESSION = cpBuildTrainingSession({
    blockIdPrefix: 'tsa_train',
    keyMaps: CP_DISJOINT_KEY_MAPS,
    rso: 'disjoint',
    // One fixed level per task here, so there is no choice to make: the ramp
    // bottoms at each task's own test coherence, hard task included.
    rampTarget: {
        mov: cpTaskSwitchAsym.coherence.target.mov,
        or: cpTaskSwitchAsym.coherence.target.or,
    },
    trainingDistractor: CP_DISTRACTOR,
    testCoherence: cpTaskSwitchAsym.coherence,
    testSession: CP_TASKSWITCH_ASYM_SESSION,
    finalStage: {
        kind: 'switching',
        csi: cpTaskSwitchAsym.csi,
        coherence: cpTaskSwitchAsym.coherence,
        switchRate: cpTaskSwitchAsym.switchRate,
    },
});

const CP_STROOP_TRAINING_SESSION = cpBuildTrainingSession({
    blockIdPrefix: 'stroop_train',
    keyMaps: CP_IDENTICAL_KEY_MAPS,
    rso: 'identical',
    // The non-target dimension is never a target in the Stroop test block, so
    // S3's ramp bottoms at the strength it actually appears with — CP_DISTRACTOR.
    // S3 is required even for Stroop, because a distractor with no trained
    // response pathway produces no response-level conflict.
    rampTarget: {
        mov: CP_TARGET_TASK === 'mov' ? CP_EASY : CP_DISTRACTOR,
        or: CP_TARGET_TASK === 'or' ? CP_EASY : CP_DISTRACTOR,
    },
    trainingDistractor: CP_DISTRACTOR,
    testCoherence: cpStroop.coherence,
    testSession: CP_STROOP_SESSION,
    finalStage: {
        kind: 'rehearsal',
        csi: cpStroop.csi,
        coherence: cpStroop.coherence,
        task: CP_TARGET_TASK,
        // PLACEHOLDER: the rehearsal runs PARADIGM_FINAL_STAGE_DEFAULTS'
        // rehearsalTrials (16 trials, no new content). Whether 16 is the right
        // length is still an open parameter question, so no numTrials override
        // is invented here.
    },
});

const CP_STROOP_CROSSED_TRAINING_SESSION = cpBuildTrainingSession({
    blockIdPrefix: 'stroopx_train',
    keyMaps: CP_IDENTICAL_KEY_MAPS,
    rso: 'identical',
    // Easiest of the three crossed levels, per the JUDGMENT CALL note above.
    rampTarget: { mov: CP_STROOP_LEVELS.high, or: CP_STROOP_LEVELS.high },
    // S5 needs ONE distractor strength; the middle level is the least
    // committal choice, and S6 then spans all three via levelFactors.
    trainingDistractor: CP_STROOP_LEVELS.mid,
    testCoherence: cpStroopCrossed.coherence,
    levelFactors: cpStroopCrossed.levelFactors,
    testSession: CP_STROOP_CROSSED_SESSION,
    finalStage: {
        kind: 'rehearsal',
        csi: cpStroopCrossed.csi,
        coherence: cpStroopCrossed.coherence,
        levelFactors: cpStroopCrossed.levelFactors,
        task: CP_TARGET_TASK,
        // PLACEHOLDER: same 16-trial default as cp_stroop above.
    },
});
