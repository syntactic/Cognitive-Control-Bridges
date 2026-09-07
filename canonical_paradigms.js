// canonical_paradigms.js — Five single-canvas cognitive-control paradigms, each
// validated in isolation (with proper counterbalancing) before evaluating the
// task-switching <-> PRP bridge.
//
//   1. PRP / dual-task                 — cp_prp
//   2. Task switching (basic)          — cp_taskswitch
//   3. Task switching (asymmetric)     — cp_taskswitch_asym
//   4. Stroop (basic)                  — cp_stroop
//   5. Stroop (crossed target x dist)  — cp_stroop_crossed
//
// All single-canvas. Coherence is an explicit factor (no QUEST). Congruent/
// incongruent throughout.
//
// Response keys: one disjoint, task-tied layout across all five paradigms
// (movement = A/D left hand, orientation = J/L right hand). PRP and switching need
// disjoint keys so the extractor can separate T1/T2 in the keypress stream.
// Stroop also uses disjoint keys to unify layout and training across paradigms.
// Accepted cost: the distractor now lands on keys never pressed, so Stroop reduces
// to dimensional interference (weaker, possibly absent for birds — neither dimension
// is over-learned the way word-reading is).
// CP_IDENTICAL_KEY_MAPS below documents the prior shared-response design.
//
// Task-tied disjoint keys make every task switch an effector switch, so key-level
// response repetition cannot be counterbalanced independently against task transition;
// abstract left/right repetition is balanced instead (response_transition in sweetpea/designs.py).
//
// Trial sequences are loaded from counterbalanced SweetPea CSVs, falling back to
// engine.js interim sequence generation.

// ============================================================
// Tunable constants
// ============================================================

// Coherence values (0-1). Higher = easier.
const CP_EASY = 0.8;
const CP_HARD = 0.3;
const CP_DISTRACTOR = 0.5; // bivalent distractor strength (Stroop/switching)
const CP_STROOP_LEVELS = {
    // crossed-coherence Stroop levels
    low: 0.25,
    mid: 0.45,
    high: 0.7,
};

// PRP SOA levels (ms). 3-4 short SOAs; tunable.
const CP_PRP_SOA_LEVELS = [100, 300, 600];

const CP_SWITCH_RATE = 50;

// Participant-counterbalanced choices:
const CP_EASY_TASK = 'mov'; // asymmetric switching: which task is the easy one
const CP_TARGET_TASK = 'mov'; // Stroop: which dimension is the target (other = distractor)

// Key maps (block-config level; config files load before session_helpers.js).
// Identical mapping: both dimensions answered with the same two keys (left hand
// A/D). Superseded — no paradigm uses it now (Stroop moved to CP_DISJOINT_KEY_MAPS
// like the rest). Kept only as documentation of the prior shared-response Stroop
// design; see the response-key note at the top of this file.
const CP_IDENTICAL_KEY_MAPS = {
    mov: { 180: 'a', 0: 'd' },
    or: { 180: 'a', 0: 'd' },
};
// Disjoint mapping for the two-task paradigms (PRP, switching):
// mov = left hand A/D, or = right hand J/L.
const CP_DISJOINT_KEY_MAPS = {
    mov: { 180: 'a', 0: 'd' },
    or: { 180: 'j', 0: 'l' },
};

// Direction vocabulary for generated key lines. Declared here, not in the
// instructions section, because cpKeyPhrase reads them and CP_STROOP_INSTRUCTIONS
// calls it while CP_STROOP_SESSION is built below — at load time, before a later
// `const` would have initialised.
// 0 = rightward, 180 = leftward, 90 = up, 270 = down (canvas Y-axis inverted).
const CP_DIRECTION_WORDS = { 0: 'right', 90: 'up', 180: 'left', 270: 'down' };
// Reading order for a key line: left/right first, since every canonical paradigm
// currently uses the horizontal pair.
const CP_DIRECTION_ORDER = [180, 0, 90, 270];

// Home-row letter sets used by cpHandFor to infer which hand a key map is on.
// Declared here rather than beside cpHandFor for the same load-order reason as
// CP_DIRECTION_WORDS above: CP_STROOP_INSTRUCTIONS reaches cpHandFor at load time.
const CP_LEFT_HAND_LETTERS = 'qwertasdfgzxcvb';
const CP_RIGHT_HAND_LETTERS = 'yuiophjklnm';

// ============================================================
// Shared defaults
// ============================================================

const CP_DEFAULTS = {
    csi: 200, // ms cue-stimulus interval
    stimulusDuration: 2000, // ms
    responseWindow: 2000, // ms
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    congruency: { conditions: ['congruent', 'incongruent'], proportions: [0.5, 0.5] },

    // Response regime, all three set explicitly (none implies another, and
    // engine.js defaults earlyResolve to false):
    //   earlyResolve — end the trial on the response rather than run the full
    //     2000 ms, so the regime doesn't change at the training->test boundary. On
    //     a dual-task trial SE resolves only once both go signals settle
    //     (src/trial.js resolveEarly), so PRP still collects both responses.
    //   acceptFirstResponse — the first press is the response. Required alongside
    //     earlyResolve: SE gates on `earlyResolve && (isCorrect ||
    //     acceptFirstResponse)`, so earlyResolve alone resolves only on a correct
    //     press and quietly invites corrections scored 'corrected' with the second
    //     press's RT.
    //   feedback — off in test blocks so no right/wrong event on trial n lands in
    //     trial n+1's response-selection window. Training turns it back on, where
    //     shaping needs it.
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
    t2Rule: 'switch', // T2 is always the other task
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
    // Two tasks => disjoint response sets (left hand mov, right hand or).
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
            or: { easy: CP_EASY, hard: CP_HARD },
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
            or: CP_EASY_TASK === 'or' ? CP_EASY : CP_HARD,
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
    keyMaps: CP_DISJOINT_KEY_MAPS,
    sequenceType: 'Factorial',
    switchRate: 0, // pure single task
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
    keyMaps: CP_DISJOINT_KEY_MAPS,
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
// SweetPea CSV wiring (condition + drawn sequence ids -> sequenceSource)
// ============================================================
// Default is the interim JS generator above. A real participant arrives at
// ?paradigm=<id>&condition=A|B (one Prolific URL per cell); index.html draws
// five sequence ids from that cell's pool and calls cpApplySweetPea() to give
// each test block its own pre-generated CSV. Generator stays the fallback for
// demos and other paradigms.
//
// Pool, not per-participant files: every CSV in sequences/ is one complete,
// independently balanced block, so any five make a balanced session with no
// central assignment table. Cost of no table: the draw exists nowhere else —
// `sequenceId` is written into every output row, and losing that column loses
// the record of what a participant saw, for good.
//
// Between-subjects assignment (easy task in asym switching; target dimension
// in Stroop/PRP) is baked into the CSV per-trial, but cpApplySweetPea() still
// has to pick matching instruction text from `condition` for cp_prp,
// cp_stroop, cp_stroop_crossed (A = mov, B = or). Only the asymmetric
// switcher's coherence config needs swapping for CSV mode: its CSV emits an
// already-resolved target_coh_level, so it needs a level-keyed table instead
// of the per-task one.

const CP_CSV_COHERENCE_OVERRIDES = {
    cp_taskswitch_asym: {
        target: { easy: CP_EASY, hard: CP_HARD },
        distractor: CP_DISTRACTOR,
    },
};

// How many sequence ids exist per paradigm per condition, i.e. the highest NNN in
// sequences/. MUST match what sweetpea/generate.py --pool actually produced: the
// draw picks ids in [1, CP_SEQUENCE_POOL_SIZE] and a drawn id with no file 404s
// and aborts the session. test_training.js asserts every file in that range
// exists, so raising this without generating the CSVs fails the tests rather than
// a participant.
const CP_SEQUENCE_POOL_SIZE = 50;

// Test blocks per session. Not hardcoded anywhere else — the sequence draw counts
// the session's own test blocks — so changing the sessions below is enough. Five
// gives four inter-block breaks (Sebastian's "breaks every ~100 trials") and
// 5 x 96 = 480 test trials; see EXPERIMENT_OVERVIEW.md §1 for the trial-count
// sign-off.
const CP_TEST_BLOCKS_PER_SESSION = 5;

/**
 * Path to one pool block. `sequenceId` is 1-based and zero-padded to three
 * digits, matching sweetpea/generate.py's `sequence_filename`.
 */
function cpSequencePath(paradigm, condition, sequenceId, scheme) {
    if (!Number.isInteger(sequenceId) || sequenceId < 1) {
        throw new Error(`cpSequencePath: sequenceId must be a positive integer, got ${sequenceId}`);
    }
    const nnn = String(sequenceId).padStart(3, '0');
    // Read the directory from the scheme descriptor's sequenceDir field so
    // nothing branches on the scheme NAME — that was the one existing violation
    // of the codebase's stated invariant. Default to the disjoint dir when no
    // scheme is provided.
    const dir = (scheme && scheme.sequenceDir) || 'sequences';
    return `${dir}/${paradigm}_${condition}_s${nnn}.csv`;
}

/**
 * Return a copy of a canonical session array with each TEST block pointed at its
 * own pool CSV, in the order the ids were drawn. Pure; does not mutate the input
 * configs.
 *
 * @param {Array} sessionArray - e.g. CP_TASKSWITCH_SESSION (or a training session)
 * @param {string} condition - 'A' or 'B'
 * @param {number[]} sequenceIds - drawn ids, one per test block, already distinct
 */
function cpApplySweetPea(sessionArray, condition, sequenceIds, scheme) {
    if (!Array.isArray(sequenceIds)) {
        throw new Error('cpApplySweetPea: sequenceIds must be an array of drawn sequence ids');
    }
    const testBlockCount = sessionArray.filter((b) => b.phase !== 'training').length;
    if (sequenceIds.length !== testBlockCount) {
        throw new Error(
            `cpApplySweetPea: got ${sequenceIds.length} sequence ids for ${testBlockCount} ` +
                'test blocks. Every test block needs its own pool CSV; a mismatch would ' +
                "leave a block on the JS generator or replay another block's trials.",
        );
    }
    if (new Set(sequenceIds).size !== sequenceIds.length) {
        throw new Error(
            `cpApplySweetPea: drawn sequence ids are not distinct (${sequenceIds.join(', ')}). ` +
                'Running one pool block twice doubles every cell of its design for that participant.',
        );
    }
    // If the session includes training stages, rebuild them for this condition so
    // that condition-dependent content (S8 t1Task, Stroop rehearsal task, ramp targets)
    // matches the assigned between-subjects condition.
    let baseSession = sessionArray;
    const trainingStage = sessionArray.find((b) => b.phase === 'training');
    if (trainingStage && condition) {
        const prefix = trainingStage.blockConfig && trainingStage.blockConfig.blockId;
        let paradigm = null;
        if (prefix && prefix.startsWith('prp_train')) paradigm = 'cp_prp';
        else if (prefix && prefix.startsWith('tsa_train')) paradigm = 'cp_taskswitch_asym';
        else if (prefix && prefix.startsWith('ts_train')) paradigm = 'cp_taskswitch';
        else if (prefix && prefix.startsWith('stroopx_train')) paradigm = 'cp_stroop_crossed';
        else if (prefix && prefix.startsWith('stroop_train')) paradigm = 'cp_stroop';
        if (paradigm) {
            const rebuiltTraining = cpTrainingSessionFor(paradigm, condition, scheme);
            const rebuiltTrainingStages = rebuiltTraining.filter((b) => b.phase === 'training');
            const testBlocksOnly = sessionArray.filter((b) => b.phase !== 'training');
            baseSession = [...rebuiltTrainingStages, ...testBlocksOnly];
        }
    }
    let testBlockIndex = 0;
    return baseSession.map((blockDef) => {
        // Training stages are generated live and have no CSV.
        if (blockDef.phase === 'training') return blockDef;
        const blockId = blockDef.blockConfig.blockId;
        const override = CP_CSV_COHERENCE_OVERRIDES[blockId];
        const sequenceId = sequenceIds[testBlockIndex++];
        const blockConfig = {
            ...blockDef.blockConfig,
            sequenceSource: cpSequencePath(blockId, condition, sequenceId, scheme),
            // Recorded on every row of this block. With no assignment table this
            // is the only surviving record of the draw.
            sequenceId,
            ...(override ? { coherence: override } : {}),
        };
        // PRP task order and the Stroop target task are condition-assigned
        // (A = mov, B = or), so their instructions must match the condition's CSV.
        //
        // A blockDef with NO instructions keeps none: only the first test block
        // carries a screen, and blocks 2..5 are preceded by the break screen
        // instead. Overriding null here would put a full instruction screen
        // immediately after every break.
        const condTask = condition === 'B' ? 'or' : 'mov';
        const km = scheme ? scheme.keyMaps : undefined; // undefined => generator default (disjoint)
        const swapped =
            blockId === 'cp_prp'
                ? CP_PRP_INSTRUCTIONS(condTask, km, scheme)
                : blockId === 'cp_stroop' || blockId === 'cp_stroop_crossed'
                  ? CP_STROOP_INSTRUCTIONS(condTask, km)
                  : null;
        // In a training session the first test block's copy is the preamble plus
        // the block's own screen. Swapping the screen for the condition's version
        // used to drop the preamble with it, so a participant on the CSV path was
        // never told that practice was over or that feedback had stopped.
        const keepsPreamble =
            typeof blockDef.instructions === 'string' &&
            blockDef.instructions.startsWith(CP_TEST_BLOCK_PREAMBLE);
        const instructions =
            !blockDef.instructions || !swapped
                ? blockDef.instructions
                : keepsPreamble
                  ? CP_TEST_BLOCK_PREAMBLE + swapped
                  : swapped;
        return { ...blockDef, blockConfig, instructions };
    });
}

// ============================================================
// Instructions
// ============================================================

// Instruction vocabulary derived from a scheme descriptor. The key lines already
// adapt on their own (cpKeyLine reads CP_DIRECTION_WORDS, which knows 90->up,
// 270->down); this helper covers the remaining hard-coded prose — the two
// direction words a task's stimulus can take, and whether the cue carries a side.
//
// CP_SCHEMES-free on purpose: the load-time CP_*_SESSION builds call the
// instruction generators before session_helpers.js defines CP_SCHEMES, so a
// missing scheme resolves to the disjoint defaults inline (left/right, hue) rather
// than by looking the descriptor up.
function cpSchemeVocab(scheme) {
    const levelToDeg = (scheme && scheme.geometry && scheme.geometry.levelToDeg) || {
        left: 180,
        right: 0,
    };
    const cueMode = (scheme && scheme.cueMode) || 'hue';
    const words = CP_DIRECTION_ORDER.filter((d) => Object.values(levelToDeg).includes(d)).map(
        (d) => CP_DIRECTION_WORDS[d],
    ); // ['left','right'] | ['up','down']
    return {
        dirA: words[0],
        dirB: words[1],
        eitherOr: `${words[0]} or ${words[1]}`,
        positional: cueMode === 'hue+position',
    };
}

// Paint a task word in its own cue color so the copy visually reinforces the
// task->color mapping (orange = flying/movement, blue = facing/orientation). The
// hex is read from DEMO_CUE_COLORS — the same values SE paints the border with —
// so the words can never drift from the cues. instructionHtml() renders the copy
// without escaping HTML, so the span reaches the screen; the height audit renders
// it the same way, and the word stays a plain substring for tests that scan copy.
function cpColorTask(word, task) {
    return `<span style="color:${DEMO_CUE_COLORS[task]}">${word}</span>`;
}

// The cue is a colored border (src/game.js: movCueColor '#fb0' orange, orCueColor
// '#0af' blue). Dashes vs dots separate the first from the second task of a
// dual-task trial, not movement from orientation — see the note above
// CP_TASKSWITCH_INSTRUCTIONS.
//
// Disjoint: color alone carries the task, each answered with a fixed hand, so the
// two-line color legend is the whole rule.
//
// Fourcue: the cue is a 2x2 (cueMode 'hue+position'). Color is the question, side
// is the hand, and they're independent — orange or blue can appear on either side.
// So the legend teaches the two rules separately; it must not tie a color to a
// side (the pre-2x2 version did, inferring the side from the task's key hand,
// which only holds while hand is task-tied).
function cpBorderLegend(keyMaps, scheme) {
    if (!cpSchemeVocab(scheme).positional) {
        return (
            `  ORANGE border  ->  answer the ${cpColorTask('FLYING', 'mov')} question.\n` +
            `  BLUE border    ->  answer the ${cpColorTask('FACING', 'or')} question.`
        );
    }
    return (
        `  COLOR is the QUESTION:  ORANGE = ${cpColorTask('FLYING', 'mov')},  BLUE = ${cpColorTask('FACING', 'or')}.\n` +
        '  SIDE is the HAND:\n' +
        cpFourcueHandLines(keyMaps)
    );
}

/** The two hand rules for the fourcue positional cue, as two lines. The left- and
 *  right-hand key maps are found from the keys themselves (whichever map sits on
 *  which hand), so hand is never assumed to follow task. */
function cpFourcueHandLines(keyMaps) {
    const leftMap = cpHandFor(keyMaps.mov) === 'left' ? keyMaps.mov : keyMaps.or;
    const rightMap = cpHandFor(keyMaps.mov) === 'right' ? keyMaps.mov : keyMaps.or;
    return (
        `    LEFT border  -> left hand:  ${cpKeyPhrase(leftMap)}.\n` +
        `    RIGHT border -> right hand: ${cpKeyPhrase(rightMap)}.`
    );
}

// PRP task order is fixed per session and assigned between subjects by the
// `condition` URL param (A = movement first, B = orientation first), so the
// instructions are a function of the T1 task — same pattern as
// CP_STROOP_INSTRUCTIONS below. Key maps are task-tied and never swap:
// mov = left hand A/D, or = right hand J/L, in either order.
// Keep this short. showInstructions dismisses on any keydown after 200 ms, so a
// participant who presses Space or PageDown to scroll a screen taller than the
// 600 px canvas starts the block instead. The overflow CSS on
// .instructions-overlay is a safety net, not a reading affordance, and we can't
// intercept the scroll keys since every screen ends with "press any key". Measure
// with `node analysis/measure_instructions.js` after any edit.
const CP_PRP_INSTRUCTIONS = (t1Task, keyMaps = CP_DISJOINT_KEY_MAPS, scheme) => {
    const movFirst = t1Task === 'mov';
    const vocab = cpSchemeVocab(scheme);
    const movItem =
        `MOVEMENT — which way are the birds ${cpColorTask('FLYING', 'mov')}?\n` +
        `   ${cpHandLabel(keyMaps.mov)}${cpKeyPhrase(keyMaps.mov)}.`;
    const orItem =
        `ORIENTATION — which way are the birds ${cpColorTask('FACING', 'or')}?\n` +
        `   ${cpHandLabel(keyMaps.or)}${cpKeyPhrase(keyMaps.or)}.`;
    // Which dimension is static at trial onset depends on which task is T1.
    const stimulusStory = movFirst
        ? `The birds fly first, then turn to face ${vocab.eitherOr}.`
        : `The birds face ${vocab.eitherOr} first, then start to fly.`;
    // No blank lines inside the numbered list — that vertical space went to the
    // cartoon (cpTestDemo). The numbering separates the two items well enough, and
    // this is the tallest screen in the session, with no slack to spare.
    return (
        'Two tasks on every trial, always in this order:\n' +
        `1) ${movFirst ? movItem : orItem}\n` +
        `2) ${movFirst ? orItem : movItem}\n\n` +
        INSTRUCTION_DEMO_ANCHOR +
        '\n\n' +
        stimulusStory +
        '\n' +
        'The gap between the two varies, and can be very short.\n' +
        'Answer them in that order, even if you work out\n' +
        'the second one early. Be fast but accurate.\n\n' +
        'Press any key to begin.'
    );
};

// Each task has its own keys and its own hand, so the mapping is stated per task.
// On the cue: SE draws it as a colored border — movCueColor ('#fb0', orange) for
// a cueMov, orCueColor ('#0af', blue) for a cueOr (src/game.js `draw()`). The
// dashes-vs-dots distinction in `_drawBorder` separates cue1 from cue2 (first vs
// second task of a dual-task trial), not movement from orientation. So the copy
// keys the task off color, never off line style.
const cpTaskSwitchInstructions = (keyMaps = CP_DISJOINT_KEY_MAPS, scheme) => {
    // Fourcue: color is the question and side is the hand, independently. The
    // border legend teaches both rules; the key lines are hand-based (per side),
    // not task-based, since either task can appear on either hand.
    if (cpSchemeVocab(scheme).positional) {
        return (
            'ONE task per trial. It may switch from trial to trial.\n' +
            'The border tells you TWO things — its COLOR and its SIDE:\n\n' +
            cpBorderLegend(keyMaps, scheme) +
            '\n\n' +
            INSTRUCTION_DEMO_ANCHOR +
            '\n\n' +
            'So the color says WHICH question, and the side says WHICH hand.\n' +
            'Answer that question with that hand; ignore the other dimension.\n\n' +
            'Press any key to begin.'
        );
    }
    return (
        'ONE task per trial. It may switch from trial to trial.\n\n' +
        'The border color tells you which task:\n\n' +
        `  ORANGE = MOVEMENT (which way are the birds ${cpColorTask('FLYING', 'mov')}?)\n` +
        `     ${cpHandLabel(keyMaps.mov)}${cpKeyPhrase(keyMaps.mov)}.\n` +
        `  BLUE = ORIENTATION (which way are they ${cpColorTask('FACING', 'or')}?)\n` +
        `     ${cpHandLabel(keyMaps.or)}${cpKeyPhrase(keyMaps.or)}.\n\n` +
        INSTRUCTION_DEMO_ANCHOR +
        '\n\n' +
        'Ignore the other dimension.\n\n' +
        'Press any key to begin.'
    );
};

// cp_taskswitch_asym gets no extra copy on purpose. Telling participants one task
// is harder is a demand characteristic aimed straight at the dependent variable:
// this paradigm measures an asymmetric switch cost, and a participant who expects
// asymmetry can produce it by strategy (extra caution on the "hard" task) instead
// of via the coherence manipulation. The asymmetry must come from the stimulus,
// so both switching paradigms share this screen verbatim — which also makes them
// comparable.

// The wording says FLYING and FACING, matching the training screens (and the
// other test screens). Don't switch to MOVEMENT/ORIENTATION here: at the moment
// feedback stops, "ignore the movement" reads as an instruction to DO the
// movement task. The key line is derived from the key map rather than written
// out, so it can't drift from the block; the target task's own keys are shown
// (mov = A/D left hand, or = J/L right hand), and `false` = disjoint response set
// makes cpKeyLine print the hand.
const CP_STROOP_INSTRUCTIONS = (task, keyMaps = CP_DISJOINT_KEY_MAPS) => {
    const target = task === 'mov' ? 'FLYING' : 'FACING';
    const other = task === 'mov' ? 'FACING' : 'FLYING';
    return (
        `Interference block: the ${cpColorTask(target, task)} question only.\n\n` +
        `Respond to which way the birds are ${target}; ignore which way\n` +
        `they are ${other}.\n` +
        `  ${cpKeyLine(keyMaps[task], cpKeysAreShared(keyMaps))}\n\n` +
        INSTRUCTION_DEMO_ANCHOR +
        '\n\n' +
        'Press any key to begin.'
    );
};

// ============================================================
// Session definitions
// ============================================================
// Trial counts are full-length; Abridged mode (index.html) runs ~1/10 for fast testing.
//
// Every test session is CP_TEST_BLOCKS_PER_SESSION (5) blockDefs sharing one
// blockConfig, each drawing its own pool CSV. Five rather than one because: the
// break summary (runSession) only shows between blocks, so a single-block session
// showed no speed-accuracy signal at all under `feedback: false`; breaks should
// land every ~100 trials, and five ~96-trial blocks give four at that spacing;
// and one block = one pool CSV, so the block boundary is the sequence boundary
// with nothing to slice.
//
// Block sizes are not free. These are `sequenceType: 'Factorial'`, and
// generateFactorialSequence fills any shortfall below a whole crossing with
// randomly sampled cells (engine.js ~line 163), so a length that isn't a multiple
// of the crossing size silently unbalances the design:
//
//     paradigm             crossing                                cells  block
//     cp_prp               soa(3) x congruency(2)                    6      96
//     cp_taskswitch        transition(2) x congruency(2) x level(2)  8      96
//     cp_taskswitch_asym   transition(2) x congruency(2)             4      96
//     cp_stroop            congruency(2)                             2      96
//     cp_stroop_crossed    congruency(2) x target(3) x distractor(3) 18     108
//
// (JS-generator crossings; SweetPea's are finer — 12/16/8/4/36,
// designs.CROSSING_SIZE, which also crosses target_dir — and these sizes are whole
// multiples of those too.) Changing a trial count means rechecking both tables and
// updating sweetpea/generate.py's DEFAULT_TRIALS; on the participant path the CSV
// row count wins and `numTrials` is ignored.
//
// Only the first block carries instructions; blocks 2-5 get the break screen.

/**
 * The test screen's cartoon — the same builder the paradigm's S8 uses, because a
 * test block is that paradigm's shape (cp_prp's test trials are S8's PRP trials
 * minus the descending SOA schedule, and likewise for switching/Stroop). Reusing
 * cpFinalStageDemo keeps the two from drifting.
 *
 * Where training's cartoon teaches, the test cartoon re-states wordlessly the
 * thing the copy is longest about — which border means which question, and which
 * finger answers it — right as trial-by-trial feedback is withdrawn
 * (`feedback: false`). It's also what let the copy below be trimmed.
 */
function cpTestDemo(keyMaps, finalStage, scheme) {
    return { ...cpFinalStageDemo(keyMaps, finalStage, scheme), ...cpCueMeta(keyMaps, scheme) };
}

/**
 * Five blockDefs on one blockConfig: the first with a screen, the rest without.
 * The cartoon rides with the screen, so blocks 2-5 (preceded by the break screen)
 * carry neither.
 */
function cpTestBlocks(blockConfig, numTrials, instructions, demo = null) {
    return Array.from({ length: CP_TEST_BLOCKS_PER_SESSION }, (_, i) => ({
        blockConfig,
        numTrials,
        instructions: i === 0 ? instructions : null,
        demo: i === 0 ? demo : null,
    }));
}

// Default instructions assume condition A (movement first). The no-param path is
// demo-only: cpApplySweetPea never runs, so the JS-generator fallback's sequence
// may not match these instructions. With ?paradigm=&condition=, cpApplySweetPea
// overrides them per condition.
// The cartoon each test screen carries. Declared beside the sessions, not inline,
// so the load-time statics and cpTestSessionFor (which rebuilds these per
// condition and scheme) provably ask for the same shape per paradigm.
const CP_TEST_FINAL_STAGE = {
    cp_prp: (task) => ({ kind: 'prp', t1Task: task }),
    cp_taskswitch: () => ({ kind: 'switching' }),
    cp_taskswitch_asym: () => ({ kind: 'switching' }),
    cp_stroop: (task) => ({ kind: 'stroop', task }),
    cp_stroop_crossed: (task) => ({ kind: 'stroop', task }),
};

const CP_PRP_SESSION = cpTestBlocks(
    cpPRP,
    96,
    CP_PRP_INSTRUCTIONS('mov'),
    cpTestDemo(CP_DISJOINT_KEY_MAPS, CP_TEST_FINAL_STAGE.cp_prp('mov')),
);

const CP_TASKSWITCH_SESSION = cpTestBlocks(
    cpTaskSwitch,
    96,
    cpTaskSwitchInstructions(),
    cpTestDemo(CP_DISJOINT_KEY_MAPS, CP_TEST_FINAL_STAGE.cp_taskswitch()),
);

// Same screen as cp_taskswitch, verbatim — see the note by
// CP_TASKSWITCH_INSTRUCTIONS on why the "one task is harder" line was dropped.
const CP_TASKSWITCH_ASYM_SESSION = cpTestBlocks(
    cpTaskSwitchAsym,
    96,
    cpTaskSwitchInstructions(),
    cpTestDemo(CP_DISJOINT_KEY_MAPS, CP_TEST_FINAL_STAGE.cp_taskswitch_asym()),
);

const CP_STROOP_SESSION = cpTestBlocks(
    cpStroop,
    96,
    CP_STROOP_INSTRUCTIONS(CP_TARGET_TASK),
    cpTestDemo(CP_DISJOINT_KEY_MAPS, CP_TEST_FINAL_STAGE.cp_stroop(CP_TARGET_TASK)),
);

// 108, not 96: the crossed design's 36-cell crossing does not divide 96.
const CP_STROOP_CROSSED_SESSION = cpTestBlocks(
    cpStroopCrossed,
    108,
    CP_STROOP_INSTRUCTIONS(CP_TARGET_TASK),
    cpTestDemo(CP_DISJOINT_KEY_MAPS, CP_TEST_FINAL_STAGE.cp_stroop_crossed(CP_TARGET_TASK)),
);

// ============================================================
// Training / shaping sessions
// ============================================================
// Each paradigm gets one participant-facing session: shared shaping S2-S6
// (buildSharedTrainingStages), a shared PRP stage S7, its own S8
// (buildParadigmFinalStage), then its test block(s) — 8 training steps total.
// "The same across paradigms" means identical structure, with key maps and
// coherence following each paradigm's own test block. Every spec below is built
// from this file's constants; nothing is hardcoded in training_stages.js.

// ------------------------------------------------------------
// Instruction copy
// ------------------------------------------------------------
// The standard is "your grandmother should be able to do the task": every screen
// says what's on screen, what to decide, which keys, and (from S4 on) what the
// border means. Copy is generated from the spec's key maps rather than written
// out, since maps differ by paradigm and two hand-written copies would drift.

// CP_DIRECTION_WORDS / CP_DIRECTION_ORDER and CP_LEFT_HAND_LETTERS /
// CP_RIGHT_HAND_LETTERS moved up to the constants block: cpKeyPhrase and cpHandFor
// read them and CP_STROOP_INSTRUCTIONS reaches both at load time. Function
// declarations hoist but the `const`s they close over don't, so declaring these
// here threw "Cannot access '...' before initialization".

/** "A = left, D = right" for one direction->key map. */
function cpKeyPhrase(keyMap) {
    return CP_DIRECTION_ORDER.filter((dir) => keyMap[dir] !== undefined)
        .map((dir) => `${String(keyMap[dir]).toUpperCase()} = ${CP_DIRECTION_WORDS[dir]}`)
        .join(', ');
}

/**
 * 'left' | 'right' | null — which hand a key map is answered with, inferred from
 * the keys themselves rather than declared, so the copy cannot claim "right hand"
 * for a map someone later changes to A/D.
 */
function cpHandFor(keyMap) {
    const keys = Object.values(keyMap).map((k) => String(k).toLowerCase());
    if (keys.length === 0) return null;
    if (keys.every((k) => CP_LEFT_HAND_LETTERS.includes(k))) return 'left';
    if (keys.every((k) => CP_RIGHT_HAND_LETTERS.includes(k))) return 'right';
    return null;
}

/** True when both tasks are answered on the same key set (Stroop). */
function cpKeysAreShared(keyMaps) {
    const movKeys = Object.values(keyMaps.mov);
    const orKeys = Object.values(keyMaps.or);
    return movKeys.some((k) => orKeys.includes(k));
}

/** "Left hand:  A = left, D = right" (or just the keys when there is one hand). */
function cpKeyLine(keyMap, shared) {
    const hand = shared ? null : cpHandFor(keyMap);
    const prefix = hand ? `${hand === 'left' ? 'Left' : 'Right'} hand:  ` : 'Keys:  ';
    return prefix + cpKeyPhrase(keyMap) + '.';
}

/** Compact key label ("Left hand: " — ONE space after the colon) used by the
 *  PRP / task-switch TEST screens, whose lines were authored tighter than
 *  cpKeyLine's two-space training-screen form. Hand inferred from the keys. */
function cpHandLabel(keyMap) {
    const hand = cpHandFor(keyMap);
    return hand === 'left' ? 'Left hand: ' : hand === 'right' ? 'Right hand: ' : 'Keys: ';
}

// CP_BORDER_LEGEND became cpBorderLegend(keyMaps, scheme) up by the Instructions
// header, so it can add the hand's side under the fourcue scheme's positional cue.

/**
 * The seven instruction screens for one paradigm's training + test session.
 *
 * @param {{mov: object, or: object}} keyMaps - the paradigm's own key maps
 * @param {object} finalStage - { kind, t1Task?, task? }, matching the S8 spec
 * @param {object} [scheme] - response-set scheme descriptor; drives axis words
 *   (left/right vs up/down) and the cue legend. Absent => disjoint defaults.
 * @returns {{S2..S6: string, S8: string, test: string}} plain text, '\n'
 *   separated, the convention showInstructions() renders.
 */
function cpTrainingInstructions(keyMaps, finalStage, scheme) {
    const shared = cpKeysAreShared(keyMaps);
    const vocab = cpSchemeVocab(scheme);
    const legend = cpBorderLegend(keyMaps, scheme);
    const movLine = cpKeyLine(keyMaps.mov, shared);
    const orLine = cpKeyLine(keyMaps.or, shared);
    // Under fourcue the hand isn't tied to the task (it follows the border side),
    // so a per-task "Flying: <keys>" line would be wrong. The border legend already
    // gives the keys per hand, so this collapses to a one-line reminder.
    const bothLines = vocab.positional
        ? '  (Up-key = up, down-key = down, on the hand the border points to.)'
        : `  ${cpColorTask('Flying', 'mov')}:  ${cpKeyPhrase(keyMaps.mov)}.\n` +
          `  ${cpColorTask('Facing', 'or')}:    ${cpKeyPhrase(keyMaps.or)}.`;
    // The single most confusable thing about the key policy, said out loud at
    // the moment the second map is introduced (S3).
    const secondMapNote = shared
        ? 'These are the SAME two keys you have just been using. That is on\n' +
          'purpose: both questions are answered with the same fingers.'
        : 'These are DIFFERENT keys from the flying task, and you answer\n' +
          'them with your other hand. Each question has its own two keys and\n' +
          'they never swap.';

    // Cues are suppressed in S2/S3 (single-task pathway) and S3a/S3b (Stroop), so
    // no border shows during early training. The colored border is introduced at
    // S3c/S3d, on one already-known task with no switching, so reading the border
    // is learned on its own; S4 then adds switching. (Split 2026-09-10: S4 used to
    // introduce the border AND switching AND, under fourcue, side->hand at once.)
    //
    // Copy is kept tight because every screen also carries an animated cartoon
    // (~148 px of a 598 px budget): anything the cartoon shows was cut, anything it
    // can't was kept. Re-run `node analysis/measure_instructions.js` after any edit.
    const S2 =
        `STEP 1 of 10 — the ${cpColorTask('flying', 'mov')} task.\n\n` +
        'Your job: say which way the group of birds is FLYING.\n\n' +
        `  ${movLine}\n\n` +
        'Answer as FAST as you can while still getting it right. The birds\n' +
        'start out very easy to read and gradually get harder.\n\n' +
        'This step continues until you are answering reliably, then moves on\n' +
        'by itself. Press any key to begin.';

    const S3 =
        `STEP 2 of 10 — a second question: which way are the birds ${cpColorTask('FACING', 'or')}?\n\n` +
        'This time the birds do not fly at all. They stay in place, FACING\n' +
        `either ${vocab.eitherOr}.\n\n` +
        `  ${orLine}\n\n` +
        secondMapNote +
        '\n\n' +
        'Again: as fast as you can while staying accurate. Press any key to begin.';

    // S3a/S3b: the Stroop stages. Conflict is introduced here for the first time,
    // in the simplest setting — one sustained task with a distractor that can
    // disagree. The cartoon shows the conflict, so the copy just names the rule.
    const S3a =
        `STEP 3 of 10 — the ${cpColorTask('flying', 'mov')} task, now with a distraction.\n\n` +
        'Still just ONE question: which way are the birds FLYING?\n\n' +
        `  ${movLine}\n\n` +
        `The birds now ALSO face ${vocab.eitherOr}, which can point the OTHER\n` +
        'way from how they fly. Ignore which way they face — answer the\n' +
        'FLYING question only, even when the two disagree.\n\n' +
        'Press any key to begin.';

    const S3b =
        `STEP 4 of 10 — the ${cpColorTask('facing', 'or')} task, now with a distraction.\n\n` +
        'Now just the FACING question: which way are the birds FACING?\n\n' +
        `  ${orLine}\n\n` +
        'The birds are also FLYING, which can disagree with the way they\n' +
        'face. Ignore the flying — answer the FACING question only.\n\n' +
        'Press any key to begin.';

    // S3c/S3d: the informative border, shown for the first time on a task the
    // participant already knows, with no switching. Under fourcue this is also
    // where the border's SIDE starts telling you which hand to answer with, so the
    // side->hand rule is learned before the question can change (S4). The middle of
    // the screen branches by scheme: fourcue teaches side->hand with the per-hand
    // key lines; disjoint just notes the border's color names the task.
    const S3cBody = vocab.positional
        ? 'A colored border now appears just BEFORE the birds. This is still\n' +
          'the flying question, but the border can be on the LEFT or the\n' +
          'RIGHT, and its SIDE tells you which hand to answer with:\n\n' +
          cpFourcueHandLines(keyMaps) +
          '\n\n' +
          'The question does not change this step; only the hand does.'
        : 'A colored border now appears just BEFORE the birds, so you can get\n' +
          'ready. This is still the flying question, and the border is ORANGE\n' +
          'to match it. Answer exactly as before.\n\n' +
          `  ${movLine}`;
    const S3c =
        `STEP 5 of 10 — the same ${cpColorTask('flying', 'mov')} task, now with a border.\n\n` +
        S3cBody +
        '\n\n' +
        'Press any key to begin.';

    const S3dBody = vocab.positional
        ? 'Same idea for the facing question: the border can be on the LEFT\n' +
          'or the RIGHT, and its SIDE tells you which hand to answer with:\n\n' +
          cpFourcueHandLines(keyMaps) +
          '\n\n' +
          'Again the question does not change; only the hand does.'
        : 'The border works the same way here. It is BLUE to match the\n' +
          'facing question, and still appears just before the birds. Answer\n' +
          'exactly as before.\n\n' +
          `  ${orLine}`;
    const S3d =
        `STEP 6 of 10 — the same ${cpColorTask('facing', 'or')} task, now with a border.\n\n` +
        S3dBody +
        '\n\n' +
        'Press any key to begin.';

    // S4: switching is the new skill. The border is no longer new (it debuted at
    // S3c/S3d); what changes here is that the question can switch from trial to
    // trial. The legend is repeated as a quick reminder, not as a first teaching.
    const S4 =
        'STEP 7 of 10 — now the question can switch.\n\n' +
        'You know the border now. From here the two questions are mixed: the\n' +
        'border can ask for a different question on the next trial, so check\n' +
        'it every time before you answer.\n\n' +
        legend +
        '\n\n' +
        bothLines +
        '\n\n' +
        'Press any key to begin.';

    // S6: bivalence + conflict, now while switching. Conflict isn't new (S3a/S3b),
    // so this screen frames the combination, not a first encounter with conflict.
    const S6 =
        'STEP 8 of 10 — both at once, while the border switches.\n\n' +
        'This combines the two things you just practiced: the birds are BOTH\n' +
        'flying AND facing (and may disagree, as in the distraction rounds),\n' +
        'while the border keeps switching which question to answer.\n\n' +
        'Answer ONLY the question the border asks for, and ignore the other,\n' +
        'even when they point in opposite directions.\n\n' +
        bothLines +
        '\n\n' +
        'Press any key to begin.';

    // S7: the shared PRP stage — two answers per trial, in a fixed order. Always
    // movement-first (the stage is identical for everyone), so the copy names the
    // order outright, unlike the paradigm-agnostic S8.
    const S7 =
        'STEP 9 of 10 — TWO answers on every trial.\n\n' +
        'Every trial now asks BOTH questions, one shortly after the other,\n' +
        'and you give two answers, in this order:\n\n' +
        `  1) ${cpColorTask('FLYING', 'mov')} first.   ${cpKeyPhrase(keyMaps.mov)}.\n` +
        `  2) ${cpColorTask('FACING', 'or')} second.    ${cpKeyPhrase(keyMaps.or)}.\n\n` +
        'Answer in that order, even if you work the second one out early.\n' +
        'The gap between the two starts long and gets shorter as you go.\n\n' +
        'Press any key to begin.';

    return {
        S2,
        S3,
        S3a,
        S3b,
        S3c,
        S3d,
        S4,
        S6,
        S7,
        S8: cpFinalStageInstructions(keyMaps, finalStage, scheme),
    };
}

/**
 * The animated cartoon that accompanies each training screen, keyed by stage —
 * same contract and the same reason as cpTrainingInstructions: the depiction
 * depends on the paradigm's key maps and on which task S8 drills, neither of
 * which training_stages.js knows. Rendered by createInstructionDemo
 * (instruction_demo.js); the spec itself is plain data and touches no DOM, so it
 * is safe to build at load time and to assert on in tests.
 *
 * DELIBERATE SIMPLIFICATIONS, all of them departures from the real display:
 *  - 8 birds, not the 150 the block draws (`Game.oobCount`), in a 150 px box.
 *  - NO border on S2/S3, even though those blocks really do paint one (SE
 *    schedules cue1 with go1 from trial onset, so an orange/blue border is on
 *    screen from stage 1). Their copy says a border exists and to ignore it; the
 *    cartoon shows only what the participant must attend to. The border appears
 *    in the cartoon exactly when it starts to MEAN something, at S4.
 *  - Coherence is not depicted faithfully — only S2 is shown degraded, because
 *    its copy is the one that promises the birds get harder.
 * The cartoon is a diagram of the decision, not a preview of the stimulus.
 *
 * @param {{mov: object, or: object}} keyMaps - the paradigm's own key maps
 * @param {object} finalStage - { kind, t1Task?, task? }, matching the S8 spec
 * @returns {{S2..S6: object, S8: object}} demo specs
 */
/**
 * Cue rendering metadata, spread onto every demo spec so the cartoon draws the
 * same cue the real trial does: a full hue border under disjoint, and a
 * half-border localized to the cued hand under the fourcue positional cue.
 *
 * cueSides is the TASK-TIED default (mov's hand, or's hand) — used by the PRP
 * cartoon, whose two cues are task-tied; the single-cue fourcue stages set a
 * per-segment `side` instead, so the same task's border can appear on either
 * hand (the 2x2). Shared by the training cartoons (cpTrainingDemos) and the
 * test-block ones (cpTestDemo), which must depict the identical cue.
 */
function cpCueMeta(keyMaps, scheme) {
    return {
        cueMode: (scheme && scheme.cueMode) || 'hue',
        cueSides: { mov: cpHandFor(keyMaps.mov), or: cpHandFor(keyMaps.or) },
        // The task word printed under each keycap cluster. instruction_demo reads
        // it off the spec, so the vocabulary is declared once, here, and stays in
        // step with the flying/facing copy.
        taskWords: { mov: 'flying', or: 'facing' },
    };
}

/** The two direction angles a key map covers, in reading order: [180,0] (disjoint
 *  horizontal) or [90,270] (fourcue vertical). */
function cpDirsOf(keyMap) {
    return CP_DIRECTION_ORDER.filter((d) => d in keyMap);
}

function cpTrainingDemos(keyMaps, finalStage, scheme) {
    // Angles come from the key maps, not literals, so a vertical-geometry scheme
    // (fourcue: mov {90:'w',270:'s'}, or {90:'i',270:'k'}) draws up/down instead of
    // left/right with no second code path. The keycap graphic is chosen from the
    // key character, so demoKeycap() throws for a key with no pixel art rather than
    // showing the wrong finger. cpDirsOf gives the two directions in reading order;
    // movA/orA is the first, movB/orB the second.
    const [movA, movB] = cpDirsOf(keyMaps.mov);
    const [orA, orB] = cpDirsOf(keyMaps.or);

    const positional = cpSchemeVocab(scheme).positional;
    const withCue = (demo) => ({ ...demo, ...cpCueMeta(keyMaps, scheme) });

    // Under fourcue the response hand follows the border side, not the task, so a
    // segment can put either task on either hand. `keyFor(hand, dir)` picks the
    // keycap for that hand+direction from whichever key map sits on that hand.
    const leftMap = cpHandFor(keyMaps.mov) === 'left' ? keyMaps.mov : keyMaps.or;
    const rightMap = cpHandFor(keyMaps.mov) === 'right' ? keyMaps.mov : keyMaps.or;
    const keyFor = (hand, dir) => (hand === 'left' ? leftMap : rightMap)[dir];

    // S4-S6 fourcue variants: four segments each, cycling all four cues
    // (orange-left, blue-right, orange-right, blue-left) with the matching
    // depressed keycap (W/S left, I/K right). `movA`/`orA` = up (90), `movB`/`orB`
    // = down (270) under the vertical geometry.
    const s4Fourcue = [
        {
            movement: movA,
            orientation: null,
            border: 'mov',
            side: 'left',
            key: keyFor('left', movA),
            keyTask: 'mov',
        },
        {
            movement: null,
            orientation: orB,
            border: 'or',
            side: 'right',
            key: keyFor('right', orB),
            keyTask: 'or',
        },
        {
            movement: movB,
            orientation: null,
            border: 'mov',
            side: 'right',
            key: keyFor('right', movB),
            keyTask: 'mov',
        },
        {
            movement: null,
            orientation: orA,
            border: 'or',
            side: 'left',
            key: keyFor('left', orA),
            keyTask: 'or',
        },
    ];
    // S6 incongruent: movement and facing disagree; the depressed key follows the
    // cued task, so the same stimulus yields a different answer on each border.
    const s6Fourcue = [
        {
            movement: movA,
            orientation: orB,
            border: 'mov',
            side: 'left',
            key: keyFor('left', movA),
            keyTask: 'mov',
        },
        {
            movement: movA,
            orientation: orB,
            border: 'or',
            side: 'right',
            key: keyFor('right', orB),
            keyTask: 'or',
        },
        {
            movement: movB,
            orientation: orA,
            border: 'mov',
            side: 'right',
            key: keyFor('right', movB),
            keyTask: 'mov',
        },
        {
            movement: movB,
            orientation: orA,
            border: 'or',
            side: 'left',
            key: keyFor('left', orA),
            keyTask: 'or',
        },
    ];

    // S2: fly one way, then the other. `orientation: null` is what makes SE's
    // forward-facing sprite the one drawn, i.e. birds that fly without facing.
    const flyBoth = [
        { movement: movA, orientation: null, border: null, key: keyMaps.mov[movA], keyTask: 'mov' },
        { movement: movB, orientation: null, border: null, key: keyMaps.mov[movB], keyTask: 'mov' },
    ];

    // S3: stationary, facing. `movement: null` is the stimulus its copy promises
    // ("the birds do not fly at all").
    const faceBoth = [
        { movement: null, orientation: orA, border: null, key: keyMaps.or[orA], keyTask: 'or' },
        { movement: null, orientation: orB, border: null, key: keyMaps.or[orB], keyTask: 'or' },
    ];

    // S3a/S3b: Stroop — a conflicting BIVALENT stimulus, single task. NO border
    // (like S2/S3): the border is not yet meaningful, and the lesson here is the
    // conflict, not the cue. The birds fly one way while facing the OTHER, and the
    // depressed key is the answer to the ONE task this stage trains.
    const stroopMov = [
        { movement: movA, orientation: orB, border: null, key: keyMaps.mov[movA], keyTask: 'mov' },
        { movement: movB, orientation: orA, border: null, key: keyMaps.mov[movB], keyTask: 'mov' },
    ];
    const stroopOr = [
        { movement: movA, orientation: orB, border: null, key: keyMaps.or[orB], keyTask: 'or' },
        { movement: movB, orientation: orA, border: null, key: keyMaps.or[orA], keyTask: 'or' },
    ];

    // S3c/S3d: one already-known task, now with the cue SHOWN — the split-out
    // gentle debut of the informative border, before switching (S4) is added.
    // Disjoint shows the task's own colour on its task-tied hand across both
    // directions. Fourcue shows the SAME task's border on alternating SIDES, so
    // what the cartoon teaches is side->hand; the depressed keycap follows the
    // side, matching the s4Fourcue convention (keyTask names the question, not the
    // physical cluster the key sits in).
    const handMov = positional
        ? [
              {
                  movement: movA,
                  orientation: null,
                  border: 'mov',
                  side: 'left',
                  key: keyFor('left', movA),
                  keyTask: 'mov',
              },
              {
                  movement: movB,
                  orientation: null,
                  border: 'mov',
                  side: 'right',
                  key: keyFor('right', movB),
                  keyTask: 'mov',
              },
          ]
        : [
              {
                  movement: movA,
                  orientation: null,
                  border: 'mov',
                  key: keyMaps.mov[movA],
                  keyTask: 'mov',
              },
              {
                  movement: movB,
                  orientation: null,
                  border: 'mov',
                  key: keyMaps.mov[movB],
                  keyTask: 'mov',
              },
          ];
    const handOr = positional
        ? [
              {
                  movement: null,
                  orientation: orA,
                  border: 'or',
                  side: 'left',
                  key: keyFor('left', orA),
                  keyTask: 'or',
              },
              {
                  movement: null,
                  orientation: orB,
                  border: 'or',
                  side: 'right',
                  key: keyFor('right', orB),
                  keyTask: 'or',
              },
          ]
        : [
              {
                  movement: null,
                  orientation: orA,
                  border: 'or',
                  key: keyMaps.or[orA],
                  keyTask: 'or',
              },
              {
                  movement: null,
                  orientation: orB,
                  border: 'or',
                  key: keyMaps.or[orB],
                  keyTask: 'or',
              },
          ];

    return {
        // S2 is the first cartoon (S1 was dropped). The only stage whose cartoon is
        // degraded, matching the one line of copy that promises it. 0.75 of 8 birds
        // leaves two moving at random — visible as noise without making the cartoon
        // unreadable at 150 px.
        S2: withCue({ segments: flyBoth, coherence: 0.75 }),
        S3: withCue({ segments: faceBoth }),
        S3a: withCue({ segments: stroopMov }),
        S3b: withCue({ segments: stroopOr }),
        // S3c/S3d: the border shown on a fixed, known task. Disjoint = one colour on
        // its task-tied hand; fourcue = same task, border on both sides.
        S3c: withCue({ segments: handMov }),
        S3d: withCue({ segments: handOr }),
        // S4: univalent still, but now cued and mixed. Disjoint shows one segment
        // per task (colour + task-tied hand change together); fourcue shows all
        // four colour x side cues.
        S4: withCue({
            segments: positional
                ? s4Fourcue
                : [
                      {
                          movement: movA,
                          orientation: null,
                          border: 'mov',
                          key: keyMaps.mov[movA],
                          keyTask: 'mov',
                      },
                      {
                          movement: null,
                          orientation: orB,
                          border: 'or',
                          key: keyMaps.or[orB],
                          keyTask: 'or',
                      },
                  ],
        }),
        // S6: bivalent, incongruent — changing only the border (and, under fourcue,
        // its side) flips the correct key.
        S6: withCue({
            segments: positional
                ? s6Fourcue
                : [
                      {
                          movement: movA,
                          orientation: orB,
                          border: 'mov',
                          key: keyMaps.mov[movA],
                          keyTask: 'mov',
                      },
                      {
                          movement: movA,
                          orientation: orB,
                          border: 'or',
                          key: keyMaps.or[orB],
                          keyTask: 'or',
                      },
                  ],
        }),
        // S7: the shared PRP cartoon — always movement-first, regardless of the host
        // paradigm, matching the fixed-order S7 copy and stage.
        S7: withCue(cpFinalStageDemo(keyMaps, { kind: 'prp', t1Task: 'mov' }, scheme)),
        S8: withCue(cpFinalStageDemo(keyMaps, finalStage, scheme)),
    };
}

/** S8's cartoon. Three shapes, matching cpFinalStageInstructions'. */
function cpFinalStageDemo(keyMaps, finalStage, scheme) {
    // Same angle-from-keys convention as cpTrainingDemos, so disjoint is
    // unchanged and fourcue draws vertically.
    const [movA, movB] = cpDirsOf(keyMaps.mov);
    const [orA, orB] = cpDirsOf(keyMaps.or);
    const positional = cpSchemeVocab(scheme).positional;
    const leftMap = cpHandFor(keyMaps.mov) === 'left' ? keyMaps.mov : keyMaps.or;
    const rightMap = cpHandFor(keyMaps.mov) === 'right' ? keyMaps.mov : keyMaps.or;
    const keyFor = (hand, dir) => (hand === 'left' ? leftMap : rightMap)[dir];

    if (finalStage.kind === 'switching') {
        // A repeat then a switch — the manipulation the test block measures, and
        // the one thing S6's cartoon doesn't show. Under fourcue the hand also
        // varies with the border side, so the switch is shown as a task-and-hand
        // change (all four cues appear across the loop).
        if (positional) {
            return {
                segments: [
                    {
                        movement: movA,
                        orientation: orB,
                        border: 'mov',
                        side: 'left',
                        key: keyFor('left', movA),
                        keyTask: 'mov',
                    },
                    {
                        movement: movB,
                        orientation: orA,
                        border: 'mov',
                        side: 'right',
                        key: keyFor('right', movB),
                        keyTask: 'mov',
                    },
                    {
                        movement: movB,
                        orientation: orA,
                        border: 'or',
                        side: 'left',
                        key: keyFor('left', orA),
                        keyTask: 'or',
                    },
                    {
                        movement: movA,
                        orientation: orB,
                        border: 'or',
                        side: 'right',
                        key: keyFor('right', orB),
                        keyTask: 'or',
                    },
                ],
            };
        }
        return {
            segments: [
                {
                    movement: movA,
                    orientation: orB,
                    border: 'mov',
                    key: keyMaps.mov[movA],
                    keyTask: 'mov',
                },
                {
                    movement: movB,
                    orientation: orA,
                    border: 'mov',
                    key: keyMaps.mov[movB],
                    keyTask: 'mov',
                },
                {
                    movement: movB,
                    orientation: orA,
                    border: 'or',
                    key: keyMaps.or[orA],
                    keyTask: 'or',
                },
            ],
        };
    }

    if (finalStage.kind === 'stroop') {
        // One task for the rest of the session. Both segments conflict, since
        // that's what the Stroop test block is made of. Under fourcue the color is
        // fixed (the target task) but the hand still varies with the side, so the
        // cartoon shows the one task on both hands.
        const task = finalStage.task === 'or' ? 'or' : 'mov';
        const keys = keyMaps[task];
        const [dA, dB] = cpDirsOf(keys);
        if (positional) {
            // Conflicting stimulus (target dir vs the other direction) on each
            // hand; the depressed key answers the target task on that hand's keys.
            const conflict = (targetDir, hand) => ({
                movement: task === 'mov' ? targetDir : targetDir === dA ? dB : dA,
                orientation: task === 'or' ? targetDir : targetDir === dA ? dB : dA,
                border: task,
                side: hand,
                key: keyFor(hand, targetDir),
                keyTask: task,
            });
            return { segments: [conflict(dA, 'left'), conflict(dB, 'right')] };
        }
        return {
            segments: [
                { movement: dA, orientation: dB, border: task, key: keys[dA], keyTask: task },
                { movement: dB, orientation: dA, border: task, key: keys[dB], keyTask: task },
            ],
        };
    }

    if (finalStage.kind === 'prp') {
        // The only cartoon with a `then`: the second stimulus arrives while the
        // first is still on screen, gets its own nested border, and is answered
        // with the other hand. Two segments, a long SOA then a short one — the
        // descending schedule the stage actually runs (soaSchedule in
        // buildParadigmFinalStage), and the thing its copy promises.
        const movFirst = finalStage.t1Task !== 'or';
        const seg = (at) =>
            movFirst
                ? {
                      movement: movA,
                      orientation: null,
                      border: 'mov',
                      key: keyMaps.mov[movA],
                      keyTask: 'mov',
                      then: {
                          at,
                          orientation: orB,
                          border: ['mov', 'or'],
                          key: keyMaps.or[orB],
                          keyTask: 'or',
                      },
                      duration: at + 2100,
                  }
                : {
                      movement: null,
                      orientation: orA,
                      border: 'or',
                      key: keyMaps.or[orA],
                      keyTask: 'or',
                      then: {
                          at,
                          movement: movB,
                          border: ['or', 'mov'],
                          key: keyMaps.mov[movB],
                          keyTask: 'mov',
                      },
                      duration: at + 2100,
                  };
        return { segments: [seg(1000), seg(400)] };
    }

    throw new Error(`cpFinalStageDemo: unknown S8 kind '${finalStage.kind}'`);
}

/**
 * S8's screen. The three S8 shapes need genuinely different
 * copy: 'switching' is a dress rehearsal of the mixed block, 'prp' introduces
 * two answers on one trial for the first time, and 'stroop' narrows back down
 * to a single task after S4-S6 taught both.
 */
function cpFinalStageInstructions(keyMaps, finalStage, scheme) {
    // Paradigm-agnostic by design. S8 keeps its per-paradigm trial structure and
    // cartoon, but the instruction text is identical across every paradigm and
    // condition. The wording — not the trials — is what installs a task strategy,
    // so letting it vary would confound the paradigms. Nothing here reads
    // finalStage.kind or the condition: `finalStage` is accepted only to keep the
    // call signature stable, and the only thing that varies is cpBorderLegend,
    // which depends on the scheme, not the paradigm. Anything genuinely
    // paradigm-specific (one answer vs two, response order, "ignore the
    // distractor") was learned in S2-S6 and is shown again in this stage's cartoon.
    void finalStage;
    return (
        'STEP 10 of 10 — putting it all together.\n\n' +
        'Now you put everything together. You may meet some of the situations\n' +
        'you trained on, and some you have not — but the rule never changes:\n\n' +
        cpBorderLegend(keyMaps, scheme) +
        '\n\n' +
        'Whenever a border appears, answer the question it asks for, as fast\n' +
        'as you can.\n\n' +
        'Press any key to begin.'
    );
}

/** Prefix that turns a test block's own instructions into "practice is over". */
// Keep lines under ~58 chars so none wrap at .instructions-content's
// max-width: 80% — this shows on all five test screens, so one wrapped line here
// costs every screen a line (analysis/measure_instructions.js).
const CP_TEST_BLOCK_PREAMBLE =
    'Practice is over — the real task starts now.\n' +
    'You will no longer be told whether each answer was right.\n\n';

// ------------------------------------------------------------
// Per-paradigm training specs
// ------------------------------------------------------------
//
// Judgment call, flagged rather than settled: `rampTarget` below is the easiest
// coherence level the task carries in the test block, not the hardest. The design
// only says S2-S4 ramp "down to test levels", which is ambiguous once a task has
// two. Easiest is the safer floor: an S2/S3 cap failure is the pre-registered
// exclusion rule and must mean "hasn't learned the mapping", not "finds 0.3
// coherence hard". Full-range exposure is S6's job (it gets each test block's
// coherence table verbatim).
//
// Training also runs bivalent stimuli for all five paradigms, including
// cp_prp whose test block is univalent — so its S5/S6 use CP_DISTRACTOR. A
// cost, like the shared CSI, of keeping training identical across paradigms.

// Stamps the active response-set scheme onto a blockConfig so every
// downstream consumer (engine.js geometry.levelToDeg, buildSEConfig keyMaps,
// session.js cueMode, the fork's keyResolution routing) reads it off the
// config instead of branching on scheme. Returns the config unchanged with
// no scheme — the disjoint default the load-time statics build under, so an
// un-stamped config still behaves like Phase 1. Shallow clone so the shared
// load-time config objects are never mutated.
function cpStampScheme(blockConfig, scheme) {
    if (!scheme) return blockConfig;
    return {
        ...blockConfig,
        keyMaps: scheme.keyMaps,
        geometry: scheme.geometry,
        cueMode: scheme.cueMode,
        keyResolution: scheme.keyResolution,
        // Fourcue single-task blocks vary the response hand trial-to-trial. This
        // drives the JS-fallback / live-training hand vector (engine.js) and the
        // per-trial key/cue routing (session.js). Test blocks that load a CSV read
        // the hand column directly, so the flag is harmless there; the early
        // single-task training stages (S2-S3) clear it — see cpBuildTrainingSession.
        // Dual-task PRP is task-tied and never varies hand.
        varyHand: scheme.cueMode === 'hue+position' && blockConfig.paradigm !== 'dual-task',
    };
}

/**
 * Build one paradigm's five test blocks for a condition and scheme. Mirrors the
 * static CP_*_SESSION load-time builds, but with the blockConfig scheme-stamped
 * and the first block's instruction copy and cartoon generated from the scheme's
 * key maps. Absent `scheme` => disjoint (the generators' default), so this
 * reproduces the static sessions exactly.
 */
function cpTestSessionFor(paradigm, condition = 'A', scheme) {
    const condTask = condition === 'B' ? 'or' : 'mov';
    const km = scheme ? scheme.keyMaps : undefined; // undefined => generator default (disjoint)
    const stamp = (bc) => cpStampScheme(bc, scheme);
    // The cartoon's angles and keycaps come from the key maps, so it must be built
    // from the same `km` as the copy — a demo left on the disjoint default under
    // fourcue would show horizontal birds and the wrong fingers.
    const demoKeyMaps = km || CP_DISJOINT_KEY_MAPS;
    const demo = (finalStage) => cpTestDemo(demoKeyMaps, finalStage, scheme);
    switch (paradigm) {
        case 'cp_prp':
            return cpTestBlocks(
                stamp(cpPRP),
                96,
                CP_PRP_INSTRUCTIONS(condTask, km, scheme),
                demo(CP_TEST_FINAL_STAGE.cp_prp(condTask)),
            );
        case 'cp_taskswitch':
            return cpTestBlocks(
                stamp(cpTaskSwitch),
                96,
                cpTaskSwitchInstructions(km, scheme),
                demo(CP_TEST_FINAL_STAGE.cp_taskswitch()),
            );
        case 'cp_taskswitch_asym':
            return cpTestBlocks(
                stamp(cpTaskSwitchAsym),
                96,
                cpTaskSwitchInstructions(km, scheme),
                demo(CP_TEST_FINAL_STAGE.cp_taskswitch_asym()),
            );
        case 'cp_stroop':
            return cpTestBlocks(
                stamp(cpStroop),
                96,
                CP_STROOP_INSTRUCTIONS(condTask, km),
                demo(CP_TEST_FINAL_STAGE.cp_stroop(condTask)),
            );
        case 'cp_stroop_crossed':
            return cpTestBlocks(
                stamp(cpStroopCrossed),
                108,
                CP_STROOP_INSTRUCTIONS(condTask, km),
                demo(CP_TEST_FINAL_STAGE.cp_stroop_crossed(condTask)),
            );
        default:
            throw new Error(`cpTestSessionFor: unknown paradigm '${paradigm}'`);
    }
}

/** Assemble one paradigm's full session: S2-S6, then S8, then its test blocks. */
function cpBuildTrainingSession(spec) {
    const finalStage = spec.finalStage;
    const scheme = spec.scheme;
    const instructions = cpTrainingInstructions(spec.keyMaps, finalStage, scheme);
    // Built from the same two inputs as the copy, so a condition that swaps S8's
    // task swaps the cartoon with the sentence describing it — they cannot drift.
    // The demo angles/keys come from spec.keyMaps, so a vertical scheme draws
    // vertically without any scheme branch in the demo builder.
    const demos = cpTrainingDemos(spec.keyMaps, finalStage, scheme);
    const shared = buildSharedTrainingStages({
        keyMaps: spec.keyMaps,
        rso: spec.rso,
        testCoherenceTarget: spec.rampTarget,
        testCoherenceDistractor: spec.trainingDistractor,
        ...(spec.testCoherence ? { testCoherence: spec.testCoherence } : {}),
        ...(spec.levelFactors ? { levelFactors: spec.levelFactors } : {}),
        blockIdPrefix: spec.blockIdPrefix,
        instructions,
        demos,
    });
    const s8 = buildParadigmFinalStage({
        ...finalStage,
        keyMaps: spec.keyMaps,
        rso: spec.rso,
        blockIdPrefix: spec.blockIdPrefix,
        instructions: instructions.S8,
        demo: demos.S8,
    });
    // S7 — the shared PRP (dual-task) stage every paradigm runs, so dual-tasking
    // is trained for all participants, not just PRP ones. Built via the same
    // kind:'prp' builder as PRP's own S8, but with the canonical PRP parameters
    // (cpPRP coherence/CSI, CP_PRP_SOA_LEVELS) and a fixed movement-first order —
    // identical for everyone. buildParadigmFinalStage always tags its output S8, so
    // re-tag it as S7.
    //
    // rso is forced to 'disjoint' rather than inherited from spec.rso. Every
    // paradigm's key map is already disjoint (mov = A/D left, or = J/L right), so a
    // two-handed PRP works for all. Stroop's spec.rso is the label 'identical' (a
    // leftover from its shared-response origin, inert for single-task extraction);
    // passing it here would tell the extractor to attribute the two PRP responses
    // by order while the runtime routes them by hand — the extractor/runtime
    // mismatch the T9 note warns about. 'disjoint' gives every paradigm a proper
    // two-handed PRP with hand-based attribution.
    const prpShared = buildParadigmFinalStage({
        kind: 'prp',
        keyMaps: spec.keyMaps,
        rso: 'disjoint',
        csi: cpPRP.csi,
        coherence: cpPRP.coherence,
        t1Task: 'mov',
        soaLevels: CP_PRP_SOA_LEVELS,
        blockIdPrefix: spec.blockIdPrefix,
        instructions: instructions.S7,
        demo: demos.S7,
    });
    const s7 = {
        ...prpShared,
        stage: 'S7',
        blockConfig: { ...prpShared.blockConfig, blockId: `${spec.blockIdPrefix}_S7` },
    };
    // The training stages carry spec.keyMaps already; stamp the rest of the scheme
    // (geometry/cueMode/keyResolution) onto them. The test blocks were already
    // stamped by cpTestSessionFor.
    // S2/S3 (pathways) and S3a/S3b (Stroop) teach one task at a time on its
    // default (task-tied) hand, with the cue suppressed, so hand doesn't vary there
    // even under fourcue. The 2x2 (color x side) is introduced at S3c/S3d, the
    // first stages with the cue shown — under fourcue their border appears on the
    // sampled side, which is what teaches side->hand. Every later single-task stage
    // (S3c/S3d, S4-S6, S8 switching/rehearsal) varies hand like the test blocks;
    // PRP's S8 never does. So the early set is exactly the four cue-suppressed
    // stages, and S3c/S3d are deliberately NOT in it.
    const EARLY_SINGLE_HAND_STAGES = new Set(['S2', 'S3', 'S3a', 'S3b']);
    const stampStage = (blockDef) => {
        const stamped = cpStampScheme(blockDef.blockConfig, scheme);
        if (EARLY_SINGLE_HAND_STAGES.has(blockDef.stage) && stamped.varyHand) {
            return { ...blockDef, blockConfig: { ...stamped, varyHand: false } };
        }
        return { ...blockDef, blockConfig: stamped };
    };
    const testBlocks = spec.testSession.map((blockDef, i) =>
        i === 0
            ? { ...blockDef, instructions: CP_TEST_BLOCK_PREAMBLE + blockDef.instructions }
            : blockDef,
    );
    return [...shared.map(stampStage), stampStage(s7), stampStage(s8), ...testBlocks];
}

function cpBuildPrpTrainingSession(condition = 'A', scheme) {
    const t1Task = condition === 'B' ? 'or' : 'mov';
    return cpBuildTrainingSession({
        blockIdPrefix: 'prp_train',
        keyMaps: scheme ? scheme.keyMaps : CP_DISJOINT_KEY_MAPS,
        rso: 'disjoint',
        scheme,
        rampTarget: { mov: CP_EASY, or: CP_EASY },
        // Bivalent stimuli in training even though cp_prp's test block is univalent
        // (its `coherence.distractor` is 0). testCoherence is not passed on purpose
        // — it would make S6 univalent and skip bivalence entirely.
        trainingDistractor: CP_DISTRACTOR,
        testSession: cpTestSessionFor('cp_prp', condition, scheme),
        finalStage: {
            kind: 'prp',
            csi: cpPRP.csi, // 0 — S8 matches the test block exactly
            coherence: cpPRP.coherence,
            t1Task,
            // SOA levels passed explicitly so the configuration source remains centralized.
            soaLevels: CP_PRP_SOA_LEVELS,
        },
    });
}

function cpBuildTaskSwitchTrainingSession(condition = 'A', scheme) {
    return cpBuildTrainingSession({
        blockIdPrefix: 'ts_train',
        keyMaps: scheme ? scheme.keyMaps : CP_DISJOINT_KEY_MAPS,
        rso: 'disjoint',
        scheme,
        // Each task carries both levels here, so the ramp bottoms at the easy one
        // (see the judgment-call note above).
        rampTarget: { mov: CP_EASY, or: CP_EASY },
        trainingDistractor: CP_DISTRACTOR,
        testCoherence: cpTaskSwitch.coherence,
        levelFactors: cpTaskSwitch.levelFactors,
        testSession: cpTestSessionFor('cp_taskswitch', condition, scheme),
        finalStage: {
            kind: 'switching',
            csi: cpTaskSwitch.csi,
            coherence: cpTaskSwitch.coherence,
            levelFactors: cpTaskSwitch.levelFactors,
            switchRate: cpTaskSwitch.switchRate,
        },
    });
}

function cpBuildTaskSwitchAsymTrainingSession(condition = 'A', scheme) {
    const easyTask = condition === 'B' ? 'or' : 'mov';
    const targetCoherence = {
        mov: easyTask === 'mov' ? CP_EASY : CP_HARD,
        or: easyTask === 'or' ? CP_EASY : CP_HARD,
    };
    const coherence =
        condition === 'A'
            ? cpTaskSwitchAsym.coherence
            : {
                  target: targetCoherence,
                  distractor: CP_DISTRACTOR,
              };
    return cpBuildTrainingSession({
        blockIdPrefix: 'tsa_train',
        keyMaps: scheme ? scheme.keyMaps : CP_DISJOINT_KEY_MAPS,
        rso: 'disjoint',
        scheme,
        rampTarget: targetCoherence,
        trainingDistractor: CP_DISTRACTOR,
        testCoherence: coherence,
        testSession: cpTestSessionFor('cp_taskswitch_asym', condition, scheme),
        finalStage: {
            kind: 'switching',
            csi: cpTaskSwitchAsym.csi,
            coherence,
            switchRate: cpTaskSwitchAsym.switchRate,
        },
    });
}

function cpBuildStroopTrainingSession(condition = 'A', scheme) {
    const targetTask = condition === 'B' ? 'or' : 'mov';
    return cpBuildTrainingSession({
        blockIdPrefix: 'stroop_train',
        keyMaps: scheme ? scheme.keyMaps : CP_DISJOINT_KEY_MAPS,
        rso: 'identical',
        scheme,
        // The non-target dimension is never a target in the Stroop test block, so
        // S3's ramp bottoms at the strength it actually appears with — CP_DISTRACTOR.
        // S3 is required even for Stroop, because a distractor with no trained
        // response pathway produces no response-level conflict.
        rampTarget: {
            mov: targetTask === 'mov' ? CP_EASY : CP_DISTRACTOR,
            or: targetTask === 'or' ? CP_EASY : CP_DISTRACTOR,
        },
        trainingDistractor: CP_DISTRACTOR,
        testCoherence: cpStroop.coherence,
        testSession: cpTestSessionFor('cp_stroop', condition, scheme),
        finalStage: {
            kind: 'stroop',
            csi: cpStroop.csi,
            coherence: cpStroop.coherence,
            task: targetTask,
            // The rehearsal runs PARADIGM_FINAL_STAGE_DEFAULTS' stroopTrials (16,
            // no new content). 16 is a placeholder length, so no numTrials override
            // is invented here.
        },
    });
}

function cpBuildStroopCrossedTrainingSession(condition = 'A', scheme) {
    const targetTask = condition === 'B' ? 'or' : 'mov';
    return cpBuildTrainingSession({
        blockIdPrefix: 'stroopx_train',
        keyMaps: scheme ? scheme.keyMaps : CP_DISJOINT_KEY_MAPS,
        rso: 'identical',
        scheme,
        // Easiest of the three crossed levels (see the judgment-call note above).
        rampTarget: { mov: CP_STROOP_LEVELS.high, or: CP_STROOP_LEVELS.high },
        // The bivalent stages need one distractor strength; the middle level is the
        // least committal choice, and S6 then spans all three via levelFactors.
        trainingDistractor: CP_STROOP_LEVELS.mid,
        testCoherence: cpStroopCrossed.coherence,
        levelFactors: cpStroopCrossed.levelFactors,
        testSession: cpTestSessionFor('cp_stroop_crossed', condition, scheme),
        finalStage: {
            kind: 'stroop',
            csi: cpStroopCrossed.csi,
            coherence: cpStroopCrossed.coherence,
            levelFactors: cpStroopCrossed.levelFactors,
            task: targetTask,
            // Same placeholder 16-trial default as cp_stroop above.
        },
    });
}

function cpTrainingSessionFor(paradigm, condition = 'A', scheme) {
    switch (paradigm) {
        case 'cp_prp':
            return cpBuildPrpTrainingSession(condition, scheme);
        case 'cp_taskswitch':
            return cpBuildTaskSwitchTrainingSession(condition, scheme);
        case 'cp_taskswitch_asym':
            return cpBuildTaskSwitchAsymTrainingSession(condition, scheme);
        case 'cp_stroop':
            return cpBuildStroopTrainingSession(condition, scheme);
        case 'cp_stroop_crossed':
            return cpBuildStroopCrossedTrainingSession(condition, scheme);
        default:
            throw new Error(`cpTrainingSessionFor: unknown paradigm '${paradigm}'`);
    }
}

const CP_PRP_TRAINING_SESSION = cpBuildPrpTrainingSession('A');
const CP_TASKSWITCH_TRAINING_SESSION = cpBuildTaskSwitchTrainingSession('A');
const CP_TASKSWITCH_ASYM_TRAINING_SESSION = cpBuildTaskSwitchAsymTrainingSession('A');
const CP_STROOP_TRAINING_SESSION = cpBuildStroopTrainingSession('A');
const CP_STROOP_CROSSED_TRAINING_SESSION = cpBuildStroopCrossedTrainingSession('A');
