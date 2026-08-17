/**
 * Tests for the training/shaping infrastructure.
 *
 * Run: node test_training.js
 *
 * Covers:
 *   - rampedCoherence / summarizeAdvancementWindow (pure, session_helpers.js)
 *   - buildSharedTrainingStages (pure, training_stages.js)
 *   - the runBlock/runSession stage-summary plumbing in session.js, driven
 *     through the public runSession API against a stubbed SE package and DOM.
 *
 * All four source files are evaluated in a SINGLE eval on purpose: a direct
 * eval's `const`/`let` bindings are scoped to that eval, so splitting them
 * would hide session_helpers.js's constants (RESOLVE_DELAY, TRAINING_CAP, ...)
 * from session.js. The epilogue re-exports what the tests need.
 */

const fs = require('fs');

// ============================================================
// Test harness
// ============================================================

let passed = 0;
let failed = 0;
let currentSection = '';

function section(name) {
    currentSection = name;
    console.log(`\n--- ${name} ---`);
}

function assert(condition, message) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL [${currentSection}]: ${message}`);
    }
}

function assertThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function assertDoesNotThrow(fn, message) {
    let threw = false;
    let err = null;
    try { fn(); } catch (e) { threw = true; err = e; }
    assert(!threw, `${message}${err ? ` (threw: ${err.message})` : ''}`);
}

/**
 * Async counterpart of assertThrows, for runSession-level guards. `expectedText`
 * is required: a session can fail for many reasons, and a test that only checks
 * "something threw" would pass on the wrong error.
 */
async function assertRejects(promiseFn, expectedText, message) {
    let err = null;
    try { await promiseFn(); } catch (e) { err = e; }
    assert(err !== null && err.message.includes(expectedText),
        `${message}${err ? ` (threw: ${err.message.slice(0, 90)}...)` : ' (did not throw)'}`);
}

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ============================================================
// Stubs: minimal DOM + SE package, installed before session.js runs
// ============================================================

function makeElement() {
    const el = {
        style: { cssText: '' },
        classList: { toggle() {}, add() {}, remove() {} },
        children: [],
        innerHTML: '',
        textContent: '',
        clientWidth: 1000,
        appendChild(child) { el.children.push(child); return child; },
        remove() {},
    };
    return el;
}

global.document = {
    createElement: () => makeElement(),
    getElementById: () => null,
    // showInstructions resolves on the next keydown; fire one immediately so a
    // headless session doesn't block on instruction/break screens.
    addEventListener: (type, handler) => setTimeout(() => handler({}), 0),
    removeEventListener: () => {},
};
global.window = { innerWidth: 1000, innerHeight: 800 };

// Swapped per test. Returns the SE data object for one trial.
let seResponder = () => ({ keyPresses: [] });

global.superExperiment = {
    block: async (seq, regen, config) => seResponder(seq[0], config),
    endBlock: async () => {},
    loadImage: async () => ({}),
};

// A correct / an incorrect single keypress, landing well after stimulus onset.
const RESPOND_CORRECT = () => ({
    keyPresses: [{ eventType: 'keydown', key: 'd', time: 900, isCorrect: true }],
});
const RESPOND_INCORRECT = () => ({
    keyPresses: [{ eventType: 'keydown', key: 'a', time: 900, isCorrect: false }],
});

// ============================================================
// Load sources
// ============================================================

// canonical_paradigms.js sits where index.html puts it — after training_stages.js
// (whose builders it calls at load time) and before session_helpers.js.
const sources = [
    './engine.js', './training_stages.js', './canonical_paradigms.js',
    './session_helpers.js', './session.js',
].map(f => fs.readFileSync(f, 'utf8')).join('\n;\n');

eval(sources + `
;globalThis.__T = {
    Session,
    rampedCoherence,
    summarizeAdvancementWindow,
    meetsAdvancementCriterion,
    buildSharedTrainingStages,
    TRAINING_CAP,
    TRAINING_RAMP_LENGTH,
    TRAINING_SOA_SCHEDULE_LENGTH,
    CP_SESSIONS: {
        cp_prp: CP_PRP_TRAINING_SESSION,
        cp_taskswitch: CP_TASKSWITCH_TRAINING_SESSION,
        cp_taskswitch_asym: CP_TASKSWITCH_ASYM_TRAINING_SESSION,
        cp_stroop: CP_STROOP_TRAINING_SESSION,
        cp_stroop_crossed: CP_STROOP_CROSSED_TRAINING_SESSION,
    },
    CP_TEST_SESSIONS: {
        cp_prp: CP_PRP_SESSION,
        cp_taskswitch: CP_TASKSWITCH_SESSION,
        cp_taskswitch_asym: CP_TASKSWITCH_ASYM_SESSION,
        cp_stroop: CP_STROOP_SESSION,
        cp_stroop_crossed: CP_STROOP_CROSSED_SESSION,
    },
    CP_DISJOINT_KEY_MAPS,
    CP_IDENTICAL_KEY_MAPS,
    CP_PRP_SOA_LEVELS,
    CP_SEQUENCE_POOL_SIZE,
    CP_TEST_BLOCKS_PER_SESSION,
};
`);

// Function declarations inside a sloppy-mode direct eval land in this module's
// scope already, so only the `const` bindings need the bridge — re-declaring the
// functions here would be a duplicate declaration.
const {
    Session, TRAINING_CAP, TRAINING_RAMP_LENGTH, TRAINING_SOA_SCHEDULE_LENGTH,
    CP_SESSIONS, CP_TEST_SESSIONS, CP_DISJOINT_KEY_MAPS, CP_IDENTICAL_KEY_MAPS,
    CP_PRP_SOA_LEVELS, CP_SEQUENCE_POOL_SIZE, CP_TEST_BLOCKS_PER_SESSION,
} = globalThis.__T;

// ============================================================
// rampedCoherence
// ============================================================

section('rampedCoherence — boundaries');

assert(TRAINING_RAMP_LENGTH === 15, 'default ramp length is 15 (windowSize - 1)');
assert(rampedCoherence(0, 1.0, 0.3, 15) === 1.0, 'trial 0 is the ceiling value');
assert(close(rampedCoherence(14, 1.0, 0.3, 15), 0.3), 'trial rampLength-1 is the test level');
assert(close(rampedCoherence(15, 1.0, 0.3, 15), 0.3), 'trial rampLength is clamped to the test level');
assert(close(rampedCoherence(200, 1.0, 0.3, 15), 0.3), 'far past the ramp stays at the test level');
assert(rampedCoherence(-3, 1.0, 0.3, 15) === 1.0, 'negative index clamps to the ceiling');

section('rampedCoherence — shape');

assert(close(rampedCoherence(7, 1.0, 0.3, 15), 0.65), 'midpoint is the linear midpoint');
const descending = Array.from({ length: 15 }, (_, i) => rampedCoherence(i, 1.0, 0.3, 15));
assert(descending.every((v, i) => i === 0 || v <= descending[i - 1]), 'ramp is monotonically non-increasing');
assert(descending.every(v => v >= 0.3 && v <= 1.0), 'ramp stays within [to, from]');

section('rampedCoherence — degenerate ramp lengths');

assert(rampedCoherence(0, 1.0, 0.3, 1) === 0.3, 'rampLength 1 is the test level immediately');
assert(rampedCoherence(0, 1.0, 0.3, 0) === 0.3, 'rampLength 0 is the test level immediately');
assert(rampedCoherence(0, 1.0, 0.3) === 1.0, 'default rampLength is used when omitted');
assert(close(rampedCoherence(14, 1.0, 0.3), 0.3), 'default rampLength bottoms out at trial 14');

section('rampedCoherence — every criterion window is at test level');

// The reason rampLength defaults to windowSize - 1: the earliest rolling window
// the 14/16 criterion evaluates is trials 0..15, and only its LAST entry may be
// at test level for the criterion to be meaningful about test-level difficulty.
const firstWindow = Array.from({ length: 16 }, (_, i) => rampedCoherence(i, 1.0, 0.3, TRAINING_RAMP_LENGTH));
assert(close(firstWindow[15], 0.3), 'trial 15 (last of the first criterion window) is at test level');
assert(firstWindow.slice(TRAINING_RAMP_LENGTH - 1).every(v => close(v, 0.3)),
    'nothing after the ramp bottoms out is above test level');

// ============================================================
// summarizeAdvancementWindow
// ============================================================

section('summarizeAdvancementWindow');

const empty = summarizeAdvancementWindow([]);
assert(empty.accuracy === null, 'empty history has null accuracy');
assert(empty.criterionMet === false, 'empty history does not meet criterion');
assert(empty.trialsUsed === undefined, 'summary does not invent a trialsUsed field');

const partial = summarizeAdvancementWindow([true, true, false, true]);
assert(close(partial.accuracy, 0.75), 'partial window accuracy is over the trials that exist');
assert(partial.windowLength === 4, 'partial window length is the history length');
assert(partial.criterionMet === false, 'a partial window can never meet the criterion');

const perfect16 = Array(16).fill(true);
assert(summarizeAdvancementWindow(perfect16).criterionMet === true, '16/16 meets criterion');
assert(close(summarizeAdvancementWindow(perfect16).accuracy, 1), '16/16 accuracy is 1');

const exactly14 = Array(14).fill(true).concat([false, false]);
assert(summarizeAdvancementWindow(exactly14).criterionMet === true, '14/16 meets criterion');
const only13 = Array(13).fill(true).concat([false, false, false]);
assert(summarizeAdvancementWindow(only13).criterionMet === false, '13/16 does not meet criterion');

// Only the LAST windowSize entries matter.
const staleGood = Array(40).fill(true).concat(Array(16).fill(false));
assert(summarizeAdvancementWindow(staleGood).criterionMet === false,
    'earlier successes outside the window do not count');
assert(close(summarizeAdvancementWindow(staleGood).accuracy, 0),
    'final-window accuracy reflects only the last 16 trials');

assert(meetsAdvancementCriterion(exactly14) === summarizeAdvancementWindow(exactly14).criterionMet,
    'meetsAdvancementCriterion agrees with the summary it delegates to');
assert(meetsAdvancementCriterion(Array(8).fill(true), 8, 7) === true,
    'custom windowSize/threshold still honoured');

// ============================================================
// buildSharedTrainingStages
// ============================================================

section('buildSharedTrainingStages — validation');

const KEY_MAPS = { mov: { 180: 'a', 0: 'd' }, or: { 180: 'j', 0: 'l' } };
const BASE_SPEC = {
    keyMaps: KEY_MAPS,
    rso: 'disjoint',
    testCoherenceTarget: { mov: 0.8, or: 0.3 },
    testCoherenceDistractor: 0.5,
};

assertThrows(() => buildSharedTrainingStages(), 'throws with no spec');
assertThrows(() => buildSharedTrainingStages({ ...BASE_SPEC, keyMaps: { mov: {} } }),
    'throws when a key map is missing');
assertThrows(() => buildSharedTrainingStages({ ...BASE_SPEC, rso: undefined }),
    'throws without rso');
assertThrows(() => buildSharedTrainingStages({ ...BASE_SPEC, testCoherenceTarget: 0.8 }),
    'throws when testCoherenceTarget is not per-task');
assertThrows(() => buildSharedTrainingStages({ ...BASE_SPEC, testCoherenceDistractor: undefined }),
    'throws without a distractor test level');
assertThrows(() => buildSharedTrainingStages({ ...BASE_SPEC, cueCsi: 0 }),
    'throws on a zero cue CSI (S4 needs an advance signal)');

section('buildSharedTrainingStages — structure');

const stages = buildSharedTrainingStages(BASE_SPEC);
const byStage = Object.fromEntries(stages.map(s => [s.stage, s]));

assert(stages.length === 6, 'builds six stages');
assert(stages.map(s => s.stage).join(',') === 'S1,S2,S3,S4,S5,S6', 'stages are S1-S6, in order');
assert(!stages.some(s => s.stage === 'S7'), 'there is no S7 — it was deleted from the design');
assert(stages.every(s => s.phase === 'training'), 'every stage is tagged phase=training');
assert(stages.every(s => s.blockConfig.paradigm === 'single-task'),
    'every shared stage is single-task (one task on screen at a time)');
assert(stages.every(s => s.blockConfig.keyMaps === KEY_MAPS), 'key maps pass through unchanged');
assert(stages.every(s => s.blockConfig.rso === 'disjoint'), 'rso passes through unchanged');
assert(stages.every(s => s.blockConfig.feedback === true), 'feedback is on throughout training');
assert(stages.every(s => s.blockConfig.blockId === `train_${s.stage}`), 'block ids are prefixed stage ids');
assert(new Set(stages.map(s => s.blockConfig.blockId)).size === 6, 'block ids are unique');
assert(stages.every(s => s.instructions === null), 'no instruction copy is invented');

section('buildSharedTrainingStages — S1 (key mapping, no criterion)');

assert(byStage.S1.isTraining === false, 'S1 is not a criterion stage');
assert(byStage.S1.numTrials === 8, 'S1 is a fixed 8-trial block');
assert(byStage.S1.blockConfig.coherenceRamp === undefined, 'S1 has no ramp (it sits at ceiling)');
assert(byStage.S1.blockConfig.coherence.target === 1.0, 'S1 runs at ceiling coherence');
assert(byStage.S1.blockConfig.coherence.distractor === 0, 'S1 is univalent');
assert(byStage.S1.blockConfig.responseWindow >= 10000, 'S1 is effectively unspeeded');
assert(byStage.S1.blockConfig.task1 === 'mov', 'S1 teaches the movement map first');

section('buildSharedTrainingStages — S2/S3 (single pathway, ramped)');

for (const [stage, task, level] of [['S2', 'mov', 0.8], ['S3', 'or', 0.3]]) {
    const s = byStage[stage];
    assert(s.isTraining === true, `${stage} is a criterion stage`);
    assert(s.numTrials === undefined, `${stage} sets no numTrials (runBlock uses TRAINING_CAP)`);
    assert(s.blockConfig.csi === 0, `${stage} runs at CSI 0`);
    assert(s.blockConfig.switchRate === 0, `${stage} is a pure single task`);
    assert(s.blockConfig.task1 === task, `${stage} trains the ${task} task`);
    assert(s.blockConfig.congruency.conditions.join() === 'univalent', `${stage} is univalent`);
    assert(s.blockConfig.coherence.distractor === 0, `${stage} has no distractor`);
    assert(s.blockConfig.coherenceRamp.from === 1.0, `${stage} ramps from ceiling`);
    assert(s.blockConfig.coherenceRamp.to === level, `${stage} ramps to the ${task} test level`);
}

section('buildSharedTrainingStages — S4 (cue introduction)');

assert(byStage.S4.isTraining === true, 'S4 is a criterion stage');
assert(byStage.S4.blockConfig.csi > 0, 'S4 CSI is positive — the cue is an advance signal');
assert(byStage.S4.blockConfig.csi === 200, 'S4 uses the default cue-training CSI');
assert(byStage.S4.blockConfig.switchRate === 50, 'S4 mixes both tasks');
assert(byStage.S4.blockConfig.startTask === null, 'S4 does not fix the starting task');
assert(byStage.S4.blockConfig.congruency.conditions.join() === 'univalent', 'S4 is still univalent');
assert(byStage.S4.blockConfig.coherence.distractor === 0, 'S4 has no distractor');
assert(byStage.S4.blockConfig.coherenceRamp.to.mov === 0.8
    && byStage.S4.blockConfig.coherenceRamp.to.or === 0.3,
    'S4 ramps per-task, since both tasks appear');

section('buildSharedTrainingStages — S5/S6 (bivalence)');

assert(byStage.S5.blockConfig.congruency.conditions.join() === 'congruent',
    'S5 is congruent-only');
assert(byStage.S5.blockConfig.coherence.distractor === 0.5, 'S5 introduces the distractor');
assert(byStage.S5.blockConfig.coherenceRamp === undefined,
    'S5 has no ramp — it is at full test level');
assert(byStage.S6.blockConfig.congruency.conditions.join() === 'congruent,incongruent',
    'S6 adds conflict');
assert(byStage.S6.blockConfig.coherenceRamp === undefined, 'S6 has no ramp');
assert(byStage.S6.blockConfig.levelFactors === undefined,
    'S6 declares no level factors when the spec has none');

section('buildSharedTrainingStages — spec overrides');

const LEVELS = { low: 0.25, mid: 0.45, high: 0.7 };
const stroopish = buildSharedTrainingStages({
    ...BASE_SPEC,
    rso: 'identical',
    keyMaps: { mov: { 180: 'a', 0: 'd' }, or: { 180: 'a', 0: 'd' } },
    testCoherence: { target: LEVELS, distractor: LEVELS },
    levelFactors: { target: ['low', 'mid', 'high'], distractor: ['low', 'mid', 'high'] },
    cueCsi: 350,
    rampLength: 20,
    blockIdPrefix: 'stroop_train',
    instructions: { S1: 'keys go here' },
});
const stroopByStage = Object.fromEntries(stroopish.map(s => [s.stage, s]));

assert(stroopByStage.S6.blockConfig.coherence.target === LEVELS,
    'S6 uses the test block coherence table verbatim');
assert(stroopByStage.S6.blockConfig.levelFactors.target.length === 3,
    'S6 exposes every test coherence level');
assert(stroopByStage.S2.blockConfig.levelFactors === undefined,
    'level factors do not leak into the ramped single-pathway stages');
assert(stroopByStage.S4.blockConfig.csi === 350, 'cueCsi override applies');
assert(stroopByStage.S2.blockConfig.coherenceRamp.rampLength === 20, 'rampLength override applies');
assert(stroopByStage.S1.blockConfig.blockId === 'stroop_train_S1', 'blockIdPrefix override applies');
assert(stroopByStage.S1.instructions === 'keys go here', 'instruction copy passes through');
assert(stroopByStage.S2.instructions === null, 'stages without copy stay null');
assert(stroopish.every(s => s.blockConfig.rso === 'identical'), 'shared-key spec propagates');

section('buildSharedTrainingStages — emitted configs are accepted by engine.js');

// The builder is only useful if generateBlockTrials can consume what it emits.
// Exercised for both response-set organizations (disjoint for switching/PRP,
// shared A/D for Stroop).
for (const [label, built] of [['disjoint', stages], ['identical', stroopish]]) {
    for (const s of built) {
        let trials;
        try {
            trials = generateBlockTrials(s.blockConfig, 12);
        } catch (e) {
            trials = null;
            console.error(`  (${label} ${s.stage} threw: ${e.message})`);
        }
        assert(trials && trials.length === 12, `${label} ${s.stage}: engine generates trials`);
        if (!trials) continue;
        assert(trials.every(t => t.meta.t1_task === 'mov' || t.meta.t1_task === 'or'),
            `${label} ${s.stage}: every trial has a task`);
        assert(trials.every(t => t.meta.t2_task === null),
            `${label} ${s.stage}: single-task stages never emit a T2`);
        assert(trials.every(t => t.meta.t1_stim_onset === s.blockConfig.csi),
            `${label} ${s.stage}: stimulus onset is the stage CSI`);
        const univalent = s.blockConfig.coherence.distractor === 0;
        assert(trials.every(t => (t.meta.t1_distractor_dir === null) === univalent),
            `${label} ${s.stage}: distractor present iff the stage is bivalent`);
    }
}

// ============================================================
// assertValidBlockConfig — the two silent-wrong-data guards
// ============================================================

section('assertValidBlockConfig — earlyResolve without acceptFirstResponse');

assertThrows(
    () => assertValidBlockConfig({ blockId: 'b', earlyResolve: true, acceptFirstResponse: false }),
    'throws on earlyResolve true + acceptFirstResponse false');
assertThrows(
    () => assertValidBlockConfig({ blockId: 'b', earlyResolve: true }),
    'throws when acceptFirstResponse is simply absent');
assertDoesNotThrow(
    () => assertValidBlockConfig({ blockId: 'b', earlyResolve: true, acceptFirstResponse: true }),
    'accepts both flags set (the intended regime)');
assertDoesNotThrow(
    () => assertValidBlockConfig({ blockId: 'b', earlyResolve: false, acceptFirstResponse: false }),
    'accepts a full-duration block with neither flag');
assertDoesNotThrow(
    () => assertValidBlockConfig({ blockId: 'b', acceptFirstResponse: true }),
    'accepts acceptFirstResponse alone (first press scored, trial runs its course)');
assertDoesNotThrow(() => assertValidBlockConfig({ blockId: 'b' }), 'accepts a bare config');

// The message has to point somewhere actionable — this is the only signal a
// future reader gets about WHY the combination is illegal.
let guardMessage = '';
try {
    assertValidBlockConfig({ blockId: 'b', earlyResolve: true });
} catch (e) { guardMessage = e.message; }
assert(guardMessage.includes('acceptFirstResponse'), 'guard names the missing flag');
assert(guardMessage.includes('acceptFirstResponse: true') && guardMessage.includes('earlyResolve: false'),
    'guard names both flags and spells out the two ways to fix the config');

section('assertValidBlockConfig — coherence ramp on a dual-task block');

const RAMP = { from: 1.0, to: 0.3, rampLength: 15 };
assertThrows(
    () => assertValidBlockConfig({ blockId: 'b', paradigm: 'dual-task', coherenceRamp: RAMP }),
    'throws on a ramp attached to a dual-task block');
assertDoesNotThrow(
    () => assertValidBlockConfig({ blockId: 'b', paradigm: 'single-task', coherenceRamp: RAMP }),
    'a ramp on a single-task block is the supported case');
assertDoesNotThrow(
    () => assertValidBlockConfig({ blockId: 'b', paradigm: 'dual-task' }),
    'a dual-task block without a ramp is fine');

// ============================================================
// resolveRampTarget
// ============================================================

section('resolveRampTarget');

assert(resolveRampTarget({ from: 1.0, to: 0.3 }, 'mov', 'b') === 0.3,
    'a scalar ramp target resolves regardless of task');
assert(resolveRampTarget({ from: 1.0, to: { mov: 0.3, or: 0.7 } }, 'or', 'b') === 0.7,
    'a per-task table resolves against the trial\'s task');
assertThrows(
    () => resolveRampTarget({ from: 1.0, to: { mov: 0.3, or: 0.7 } }, null, 'b'),
    'throws when t1_task is null (the prp-baseline shape) instead of writing coh_null_1');
assertThrows(
    () => resolveRampTarget({ from: 1.0, to: { mov: 0.3 } }, 'or', 'b'),
    'throws when the table is missing the trial\'s task');
assertThrows(
    () => resolveRampTarget({ from: 1.0, to: null }, 'mov', 'b'),
    'throws on a null ramp target');
assertThrows(
    () => resolveRampTarget({ from: undefined, to: 0.3 }, 'mov', 'b'),
    'throws on a non-finite ramp origin');

// Regression: rampedCoherence with an undefined target returns NaN, which is
// exactly the silent failure resolveRampTarget exists to convert into an error.
assert(Number.isNaN(rampedCoherence(5, 1.0, undefined, 15)),
    'rampedCoherence really does return NaN mid-ramp for an unresolved target');

// ============================================================
// scheduledSoa — PRP S8's descending response-order schedule
// ============================================================

section('scheduledSoa — boundaries');

const SOAS = [100, 300, 600];

assert(TRAINING_SOA_SCHEDULE_LENGTH === 16,
    'the schedule spans the full criterion window, so every SOA is inside it');
assert(scheduledSoa(0, SOAS, 16) === 600, 'trial 0 opens at the LONGEST SOA');
assert(scheduledSoa(15, SOAS, 16) === 100, 'the last scheduled trial is the shortest SOA');
assert(scheduledSoa(16, SOAS, 16) === null, 'past the schedule it defers to the sampled SOA');
assert(scheduledSoa(100, SOAS, 16) === null, 'far past the schedule it still defers');
assert(scheduledSoa(-1, SOAS, 16) === 600, 'a negative index clamps to the longest SOA');
assert(scheduledSoa(0, SOAS) === 600, 'default scheduleLength is used when omitted');
assert(scheduledSoa(TRAINING_SOA_SCHEDULE_LENGTH, SOAS) === null,
    'default schedule ends after TRAINING_SOA_SCHEDULE_LENGTH trials');

section('scheduledSoa — shape');

const schedule = Array.from({ length: 16 }, (_, i) => scheduledSoa(i, SOAS, 16));
assert(schedule.every((v, i) => i === 0 || v <= schedule[i - 1]),
    'the schedule is monotonically non-increasing');
assert(new Set(schedule).size === 3, 'every SOA level appears within the schedule');
assert(schedule.every(v => SOAS.includes(v)), 'only real SOA levels are scheduled');
// The whole point of scheduleLength === windowSize: a participant cannot meet the
// 14/16 criterion having practiced only the long, easy SOAs.
assert(schedule.slice(0, TRAINING_SOA_SCHEDULE_LENGTH).includes(Math.min(...SOAS)),
    'the shortest SOA falls inside the earliest criterion window');

section('scheduledSoa — level ordering and input hygiene');

const unsorted = [300, 600, 100];
const fromUnsorted = Array.from({ length: 16 }, (_, i) => scheduledSoa(i, unsorted, 16));
assert(fromUnsorted.join() === schedule.join(), 'input order of the levels does not matter');
assert(unsorted.join() === '300,600,100', 'the caller\'s level array is not reordered in place');

const single = Array.from({ length: 4 }, (_, i) => scheduledSoa(i, [250], 4));
assert(single.every(v => v === 250), 'a single-level schedule is constant');

assertThrows(() => scheduledSoa(0, [], 16), 'throws on an empty level list');
assertThrows(() => scheduledSoa(0, null, 16), 'throws when levels are not an array');
assertThrows(() => scheduledSoa(0, SOAS, 0), 'throws on a zero-length schedule');

// More levels than scheduled trials: still descending, still only real levels.
const crowded = Array.from({ length: 2 }, (_, i) => scheduledSoa(i, [100, 300, 600, 900], 2));
assert(crowded[0] === 900 && crowded[1] <= 900, 'a short schedule still opens at the longest SOA');
assert(crowded.every(v => [100, 300, 600, 900].includes(v)), 'no interpolated SOAs are invented');

// ============================================================
// buildParadigmFinalStage (S8)
// ============================================================

section('buildParadigmFinalStage — validation');

const S8_BASE = {
    keyMaps: KEY_MAPS,
    rso: 'disjoint',
    csi: 200,
    coherence: { target: { mov: 0.8, or: 0.3 }, distractor: 0.5 },
};

assertThrows(() => buildParadigmFinalStage(), 'throws with no spec');
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'switching', keyMaps: { mov: {} } }),
    'throws when a key map is missing');
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'switching', rso: undefined }),
    'throws without rso');
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'switching', coherence: undefined }),
    'throws without the test block\'s coherence');
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'switching', csi: undefined }),
    'throws without a test CSI');
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'switching', csi: -1 }),
    'throws on a negative CSI');
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'nonsense' }),
    'throws on an unknown kind');
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'switching' }),
    "kind 'switching' requires a switch rate");
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'rehearsal' }),
    "kind 'rehearsal' requires a target task");
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'rehearsal', task: 'both' }),
    "kind 'rehearsal' rejects a task that is not mov/or");
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'prp', csi: 0, soaLevels: SOAS }),
    "kind 'prp' requires the condition's T1 task");
assertThrows(() => buildParadigmFinalStage({ ...S8_BASE, kind: 'prp', csi: 0, t1Task: 'mov' }),
    "kind 'prp' requires SOA levels (they are not read from a global)");
assertThrows(
    () => buildParadigmFinalStage({
        ...S8_BASE, kind: 'prp', csi: 0, t1Task: 'mov', soaLevels: SOAS,
        coherenceRamp: { from: 1.0, to: 0.3 },
    }),
    "kind 'prp' refuses a coherence ramp");

// 0 is a legitimate CSI and must not be rejected as falsy.
assertDoesNotThrow(
    () => buildParadigmFinalStage({ ...S8_BASE, kind: 'prp', csi: 0, t1Task: 'mov', soaLevels: SOAS }),
    'csi 0 (cp_prp\'s test CSI) is accepted');

section('buildParadigmFinalStage — switching');

const s8Switch = buildParadigmFinalStage({ ...S8_BASE, kind: 'switching', switchRate: 50 });

assert(s8Switch.stage === 'S8', 'tagged as stage S8');
assert(s8Switch.phase === 'training', 'tagged phase=training');
assert(s8Switch.isTraining === true, 'switching S8 is a criterion stage');
assert(s8Switch.numTrials === undefined, 'sets no numTrials (runBlock caps it)');
assert(s8Switch.instructions === null, 'no instruction copy is invented');
assert(s8Switch.blockConfig.blockId === 'train_S8', 'default block id');
assert(s8Switch.blockConfig.paradigm === 'single-task', 'switching S8 is single-task');
assert(s8Switch.blockConfig.switchRate === 50, 'runs at the test switch rate');
assert(s8Switch.blockConfig.startTask === null, 'does not fix the starting task');
assert(s8Switch.blockConfig.csi === 200, 'runs at the TEST csi, not the S4-S6 cue csi');
assert(s8Switch.blockConfig.coherence === S8_BASE.coherence, 'uses the test coherence verbatim');
assert(s8Switch.blockConfig.feedback === true, 'feedback is still on in training');
assert(s8Switch.blockConfig.earlyResolve === true && s8Switch.blockConfig.acceptFirstResponse === true,
    'both response-regime flags are set');
assert(s8Switch.blockConfig.coherenceRamp === undefined, 'S8 never ramps — S2-S4 did that');
assert(s8Switch.blockConfig.soaSchedule === undefined, 'a switching stage has no SOA schedule');

section('buildParadigmFinalStage — rehearsal (Stroop)');

const s8Stroop = buildParadigmFinalStage({
    ...S8_BASE,
    kind: 'rehearsal',
    rso: 'identical',
    task: 'mov',
    levelFactors: { target: ['low', 'mid', 'high'], distractor: ['low', 'mid', 'high'] },
    blockIdPrefix: 'stroop_train',
});

assert(s8Stroop.isTraining === false, 'the Stroop rehearsal carries NO criterion');
assert(s8Stroop.numTrials === 16, 'it is a fixed 16-trial block');
assert(s8Stroop.blockConfig.switchRate === 0, 'no switching in a Stroop rehearsal');
assert(s8Stroop.blockConfig.task1 === 'mov' && s8Stroop.blockConfig.startTask === 'mov',
    'the target dimension is fixed for the whole stage');
assert(s8Stroop.blockConfig.levelFactors.target.length === 3,
    'the test block\'s level factors pass through, so the rehearsal spans them');
assert(s8Stroop.blockConfig.blockId === 'stroop_train_S8', 'blockIdPrefix override applies');
assert(buildParadigmFinalStage({ ...S8_BASE, kind: 'rehearsal', task: 'or', numTrials: 24 })
    .numTrials === 24, 'the rehearsal trial count is overridable');

section('buildParadigmFinalStage — PRP');

const s8Prp = buildParadigmFinalStage({
    ...S8_BASE,
    kind: 'prp',
    csi: 0,
    t1Task: 'or',
    soaLevels: SOAS,
    coherence: { target: { mov: 0.8, or: 0.8 }, distractor: 0 },
});

assert(s8Prp.isTraining === true, 'PRP S8 is a criterion stage');
assert(s8Prp.blockConfig.paradigm === 'dual-task', 'both tasks appear in one trial');
assert(s8Prp.blockConfig.csi === 0, 'runs at cp_prp\'s test CSI of 0');
assert(s8Prp.blockConfig.task1 === 'or', 'T1 is the condition\'s assigned first task');
assert(s8Prp.blockConfig.t2Rule === 'switch', 'T2 is always the other task, as in the test block');
assert(s8Prp.blockConfig.soa.params === SOAS, 'the fallback sampler uses the test SOA levels');
assert(s8Prp.blockConfig.soaSchedule.levels === SOAS, 'the schedule carries the same levels');
assert(s8Prp.blockConfig.soaSchedule.scheduleLength === undefined,
    'schedule length is left to runBlock\'s default unless the spec sets it');
assert(s8Prp.blockConfig.coherenceRamp === undefined, 'PRP S8 carries no coherence ramp');
assertDoesNotThrow(() => assertValidBlockConfig(s8Prp.blockConfig),
    'the emitted PRP config passes the runBlock guards');
assert(buildParadigmFinalStage({
    ...S8_BASE, kind: 'prp', csi: 0, t1Task: 'mov', soaLevels: SOAS, soaScheduleLength: 24,
}).blockConfig.soaSchedule.scheduleLength === 24, 'schedule length is overridable');

section('buildParadigmFinalStage — emitted configs are accepted by engine.js');

for (const [label, stage] of [['switching', s8Switch], ['rehearsal', s8Stroop], ['prp', s8Prp]]) {
    let trials;
    try {
        trials = generateBlockTrials(stage.blockConfig, 12);
    } catch (e) {
        trials = null;
        console.error(`  (S8 ${label} threw: ${e.message})`);
    }
    assert(trials && trials.length === 12, `S8 ${label}: engine generates trials`);
    if (!trials) continue;
    assert(trials.every(t => t.meta.t1_task === 'mov' || t.meta.t1_task === 'or'),
        `S8 ${label}: every trial has a T1 task`);
    const isPrp = label === 'prp';
    assert(trials.every(t => (t.meta.t2_task !== null) === isPrp),
        `S8 ${label}: a T2 exists iff the stage is the dual-task one`);
    if (isPrp) {
        assert(trials.every(t => t.meta.t1_task === 'or' && t.meta.t2_task === 'mov'),
            'S8 prp: task order is fixed for the condition on every trial');
        assert(trials.every(t => SOAS.includes(t.meta.soa)), 'S8 prp: SOAs come from the test levels');
    }
}

// ============================================================
// Session assembly — the five canonical paradigms
// ============================================================

section('canonical sessions — shape');

const CP_EXPECTED = {
    cp_prp: { rso: 'disjoint', keyMaps: CP_DISJOINT_KEY_MAPS, prefix: 'prp_train', s8: 'prp' },
    cp_taskswitch: { rso: 'disjoint', keyMaps: CP_DISJOINT_KEY_MAPS, prefix: 'ts_train', s8: 'switching' },
    cp_taskswitch_asym: { rso: 'disjoint', keyMaps: CP_DISJOINT_KEY_MAPS, prefix: 'tsa_train', s8: 'switching' },
    cp_stroop: { rso: 'identical', keyMaps: CP_IDENTICAL_KEY_MAPS, prefix: 'stroop_train', s8: 'rehearsal' },
    cp_stroop_crossed: { rso: 'identical', keyMaps: CP_IDENTICAL_KEY_MAPS, prefix: 'stroopx_train', s8: 'rehearsal' },
};

for (const [id, expected] of Object.entries(CP_EXPECTED)) {
    const session = CP_SESSIONS[id];
    const testSession = CP_TEST_SESSIONS[id];
    const training = session.slice(0, session.length - testSession.length);
    const testBlocks = session.slice(session.length - testSession.length);

    assert(training.map(b => b.stage).join(',') === 'S1,S2,S3,S4,S5,S6,S8',
        `${id}: training runs S1-S6 then S8`);
    assert(!training.some(b => b.stage === 'S7'), `${id}: there is no S7`);
    assert(training.every(b => b.phase === 'training'), `${id}: every stage is tagged phase=training`);
    assert(training.every(b => b.blockConfig.blockId === `${expected.prefix}_${b.stage}`),
        `${id}: stage block ids carry the paradigm's own prefix`);
    assert(training.every(b => b.blockConfig.rso === expected.rso),
        `${id}: every stage uses the test block's response-set organization`);
    assert(training.every(b => b.blockConfig.keyMaps === expected.keyMaps),
        `${id}: every stage uses the test block's key maps`);
    assert(training.every(b => b.blockConfig.feedback === true),
        `${id}: feedback stays on throughout training`);
    assert(testBlocks.every(b => b.blockConfig.feedback === false),
        `${id}: and off in the test blocks`);

    // Nothing may reach runBlock that its guards would reject, and engine.js has
    // to be able to generate trials from every config in the session.
    for (let i = 0; i < session.length; i++) {
        const blockDef = session[i];
        assertDoesNotThrow(() => assertValidBlockConfig(blockDef.blockConfig),
            `${id}/${blockDef.blockConfig.blockId}: passes the runBlock guards`);
        let trials = null;
        try { trials = generateBlockTrials(blockDef.blockConfig, 20); } catch (e) {
            console.error(`  (${id}/${blockDef.blockConfig.blockId} threw: ${e.message})`);
        }
        assert(trials && trials.length === 20,
            `${id}/${blockDef.blockConfig.blockId}: engine generates trials`);
        // Every screen-bearing block has copy. The exception is a test block
        // after the first: it is preceded by the break screen, and a second full
        // instruction screen right after the break would be noise.
        const isContinuation = i > session.length - testSession.length;
        if (isContinuation) {
            assert(blockDef.instructions == null,
                `${id}/${blockDef.blockConfig.blockId}: test block ${i - (session.length - testSession.length) + 1} shows no screen of its own`);
        } else {
            assert(typeof blockDef.instructions === 'string' && blockDef.instructions.length > 0,
                `${id}/${blockDef.blockConfig.blockId}: has instruction copy`);
        }
    }

    // The test blocks are the existing ones, untouched apart from the preamble.
    assert(testBlocks.length === testSession.length, `${id}: the test session is appended whole`);
    assert(testBlocks.every((b, i) => b.blockConfig === testSession[i].blockConfig),
        `${id}: test blockConfigs are the very same objects, not copies`);
    assert(testBlocks[0].instructions.endsWith(testSession[0].instructions),
        `${id}: the test block keeps its own instructions, with a preamble prepended`);
    assert(testBlocks[0].instructions.includes('Practice is over'),
        `${id}: and the preamble says practice is over`);

    const s8 = training[training.length - 1];
    if (expected.s8 === 'prp') {
        assert(s8.blockConfig.paradigm === 'dual-task', `${id}: S8 is the dual-task stage`);
        assert(s8.advancementThreshold === 12, `${id}: S8 advances at 12/16`);
        assert(s8.blockConfig.soaSchedule.levels === CP_PRP_SOA_LEVELS,
            `${id}: S8 uses the placeholder SOA levels, passed in rather than read`);
        assert(s8.blockConfig.csi === 0, `${id}: S8 runs at the test CSI of 0`);
    } else if (expected.s8 === 'switching') {
        assert(s8.blockConfig.paradigm === 'single-task', `${id}: S8 is single-task`);
        assert(s8.isTraining === true, `${id}: S8 is a criterion stage`);
        assert(s8.blockConfig.switchRate === testSession[0].blockConfig.switchRate,
            `${id}: S8 runs at the test switch rate`);
        assert(s8.advancementThreshold === undefined, `${id}: S8 keeps the shared 14/16 default`);
    } else {
        assert(s8.isTraining === false, `${id}: the Stroop rehearsal carries no criterion`);
        assert(s8.numTrials === 16, `${id}: it is the 16-trial placeholder length`);
        assert(s8.blockConfig.switchRate === 0, `${id}: no switching in a Stroop rehearsal`);
    }
    assert(s8.blockConfig.csi === testSession[0].blockConfig.csi,
        `${id}: S8 matches the test block's CSI exactly`);
}

section('canonical sessions — test blocks are split so a break can happen');

// The bug this pins: with ONE test block, runSession showed no break summary at
// all — it skips the break after a `phase: 'training'` block and after the last
// block, and in [S1..S6, S8, test] the test block is the last one. That summary
// is the whole justification for `feedback: false`, so the participant got no
// speed-accuracy signal anywhere. Two test blocks make the break reachable.
for (const id of Object.keys(CP_EXPECTED)) {
    const testSession = CP_TEST_SESSIONS[id];
    assert(testSession.length >= 2,
        `${id}: the test session has at least two blocks, so a break falls between them`);
    assert(testSession.every(b => b.blockConfig === testSession[0].blockConfig),
        `${id}: the halves share one blockConfig — a split, not two different designs`);

    const session = CP_SESSIONS[id];
    const nonTraining = session.filter(b => b.phase !== 'training');
    assert(nonTraining.length >= 2,
        `${id}: and at least one of them is not the last block of the session`);
}

section('canonical sessions — every block divides the factorial crossing evenly');

// generateFactorialSequence fills any shortfall below a whole number of
// repetitions with RANDOMLY SAMPLED cells, so a sub-block whose length is not a
// multiple of the crossing size silently unbalances the design — the same class
// of bug as the factorial-ITI remainder.
//
// The test is DIVISIBILITY, not observed evenness. Two reasons evenness does not
// work: trial 0's transition is overwritten with 'First', so a transition design
// always has one cell short by one even when the split is perfect; and a bad
// split can still look even (70 trials over 18 cells gives 16 cells of 4 and 2 of
// 3 — a spread of 1, same as the artifact). What actually distinguishes a good
// split is that the generator never reaches its random-remainder branch at all.
//
// The cell count is MEASURED from the generator rather than hardcoded here, so a
// change to engine.js's factor construction (adding the n-1 congruency factor,
// say) makes this fail instead of quietly passing against a stale number.
const PROBE_LEN = 5040;   // divisible by every plausible crossing size

function measureCellCount(blockConfig, keys) {
    const v = generateSequenceVectors(blockConfig, PROBE_LEN);
    const cells = new Set();
    for (let i = 1; i < PROBE_LEN; i++) {   // skip trial 0: transition is 'First'
        cells.add(keys.map(k => (v[k] ? v[k][i] : '-')).join('|'));
    }
    return cells.size;
}

const CP_CROSSINGS = {
    cp_prp: ['soa', 'congruency'],
    cp_taskswitch: ['transition', 'congruency', 'targetLevel'],
    cp_taskswitch_asym: ['transition', 'congruency'],
    cp_stroop: ['congruency'],
    cp_stroop_crossed: ['congruency', 'targetLevel', 'distractorLevel'],
};
// Recorded so a change shows up as a diff, not just as an arithmetic pass.
const CP_EXPECTED_CELLS = {
    cp_prp: 6, cp_taskswitch: 8, cp_taskswitch_asym: 4,
    cp_stroop: 2, cp_stroop_crossed: 18,
};

for (const [id, keys] of Object.entries(CP_CROSSINGS)) {
    const blockDef = CP_TEST_SESSIONS[id][0];
    const n = blockDef.numTrials;
    assert(blockDef.blockConfig.sequenceType === 'Factorial',
        `${id}: still a Factorial design (this check is meaningless otherwise)`);
    const cells = measureCellCount(blockDef.blockConfig, keys);
    assert(cells === CP_EXPECTED_CELLS[id],
        `${id}: crossing is ${CP_EXPECTED_CELLS[id]} cells (measured ${cells})`);
    assert(n % cells === 0,
        `${id}: ${n} trials per block is a whole multiple of the ${cells}-cell crossing ` +
        `(${n % cells} left over would be randomly sampled)`);
    assert(CP_TEST_SESSIONS[id].every(b => b.numTrials === n),
        `${id}: every block is the same length, so every block is balanced`);
}

// Negative control: the divisibility check must be capable of failing.
assert(70 % CP_EXPECTED_CELLS.cp_stroop_crossed !== 0,
    'the check would reject a bad block length (70 is not a multiple of 18)');

section('canonical sessions — five test blocks, one instruction screen');

for (const id of Object.keys(CP_EXPECTED)) {
    const testSession = CP_TEST_SESSIONS[id];
    assert(testSession.length === CP_TEST_BLOCKS_PER_SESSION,
        `${id}: ${CP_TEST_BLOCKS_PER_SESSION} test blocks (found ${testSession.length})`);
    assert(typeof testSession[0].instructions === 'string' && testSession[0].instructions.length > 0,
        `${id}: the first block carries the instruction screen`);
    assert(testSession.slice(1).every(b => b.instructions === null),
        `${id}: blocks 2..${CP_TEST_BLOCKS_PER_SESSION} show no screen — they follow the break screen`);
    assert(testSession.every(b => b.blockConfig === testSession[0].blockConfig),
        `${id}: every block shares one blockConfig — they differ only in their drawn CSV`);
    assert(testSession.every(b => b.sequenceSlice === undefined),
        `${id}: no block claims a slice — one pool CSV is one whole block now`);
}

section('cpApplySweetPea — one drawn pool CSV per test block');

// With no assignment table, the draw exists only in the output CSV, and two
// blocks landing on one file would replay a participant's trials while exporting
// perfectly normal-looking rows.
for (const id of Object.keys(CP_EXPECTED)) {
    for (const condition of ['A', 'B']) {
        const ids = drawSequenceIds(`test-pid|${id}|${condition}`, CP_SEQUENCE_POOL_SIZE,
            CP_TEST_BLOCKS_PER_SESSION);
        const applied = cpApplySweetPea(CP_SESSIONS[id], condition, ids);
        const testBlocks = applied.filter(b => b.phase !== 'training');
        const sources = testBlocks.map(b => b.blockConfig.sequenceSource);
        assert(new Set(sources).size === CP_TEST_BLOCKS_PER_SESSION,
            `${id}/${condition}: resolves to ${CP_TEST_BLOCKS_PER_SESSION} DISTINCT sequence files`);
        assert(sources.every(src => fs.existsSync(src)),
            `${id}/${condition}: every drawn file exists on disk (${sources.filter(s => !fs.existsSync(s)).join(', ') || 'all present'})`);
        assert(sources.every(src => src.includes(`${id}_${condition}_s`)),
            `${id}/${condition}: every file is this paradigm's and this condition's`);
        assert(testBlocks.every((b, i) => b.blockConfig.sequenceId === ids[i]),
            `${id}/${condition}: each block records the sequence id it was given`);
        assert(applied.filter(b => b.phase === 'training')
            .every(b => b.blockConfig.sequenceSource === undefined),
            `${id}/${condition}: training stages keep no sequenceSource — they have no CSV`);
    }
}

// The whole pool must be reachable: the draw picks ids in [1, CP_SEQUENCE_POOL_SIZE]
// and a drawn id with no file 404s and aborts the session mid-participant.
for (const id of Object.keys(CP_EXPECTED)) {
    for (const condition of ['A', 'B']) {
        const missing = [];
        for (let s = 1; s <= CP_SEQUENCE_POOL_SIZE; s++) {
            const path = cpSequencePath(id, condition, s);
            if (!fs.existsSync(path)) missing.push(path);
        }
        assert(missing.length === 0,
            `${id}/${condition}: all ${CP_SEQUENCE_POOL_SIZE} pool files exist ` +
            `(missing ${missing.length}: ${missing.slice(0, 3).join(', ')})`);
    }
}

section('canonical sessions — condition B training content');

// PRP: under condition B, S8 T1 task must be 'or' (facing) and S8 instructions say FACING first.
const prpB = cpBuildPrpTrainingSession('B');
const prpBS8 = prpB.find(b => b.stage === 'S8');
assert(prpBS8.blockConfig.task1 === 'or' || prpBS8.blockConfig.t1Task === 'or',
    'PRP condition B S8: T1 task is orientation');
assert(prpBS8.instructions.includes('FACING comes FIRST'),
    'PRP condition B S8 copy: says FACING comes FIRST');

// Stroop: under condition B, S2 ramps mov to distractor level (0.5), S3 ramps or to easy level (0.8),
// S8 rehearsal task is 'or' (facing) and S8 instructions say FACING.
const stroopB = cpBuildStroopTrainingSession('B');
const stroopBS2 = stroopB.find(b => b.stage === 'S2');
const stroopBS3 = stroopB.find(b => b.stage === 'S3');
const stroopBS8 = stroopB.find(b => b.stage === 'S8');
assert(stroopBS2.blockConfig.coherence.target === 0.5, 'Stroop condition B S2: mov ramps to distractor level (0.5)');
assert(stroopBS3.blockConfig.coherence.target === 0.8, 'Stroop condition B S3: or ramps to target level (0.8)');
assert(stroopBS8.blockConfig.task1 === 'or', 'Stroop condition B S8: rehearsal task is orientation');
assert(stroopBS8.instructions.includes('which way are the fish\nFACING?'), 'Stroop condition B S8 copy: refers to FACING');

// Stroop crossed: under condition B, S8 rehearsal task is 'or' (facing).
const stroopxB = cpBuildStroopCrossedTrainingSession('B');
const stroopxBS8 = stroopxB.find(b => b.stage === 'S8');
assert(stroopxBS8.blockConfig.task1 === 'or', 'Stroop crossed condition B S8: rehearsal task is orientation');
assert(stroopxBS8.instructions.includes('which way are the fish\nFACING?'), 'Stroop crossed condition B S8 copy: refers to FACING');

// Asym task switching: under condition B, or is easy (0.8) and mov is hard (0.3).
const tsaB = cpBuildTaskSwitchAsymTrainingSession('B');
const tsaBS2 = tsaB.find(b => b.stage === 'S2');
const tsaBS3 = tsaB.find(b => b.stage === 'S3');
const tsaBS8 = tsaB.find(b => b.stage === 'S8');
assert(tsaBS2.blockConfig.coherence.target === 0.3, 'Asym switching condition B S2: mov ramps to hard level (0.3)');
assert(tsaBS3.blockConfig.coherence.target === 0.8, 'Asym switching condition B S3: or ramps to easy level (0.8)');
assert(tsaBS8.blockConfig.coherence.target.mov === 0.3 && tsaBS8.blockConfig.coherence.target.or === 0.8,
    'Asym switching condition B S8: coherence has mov hard and or easy');

// cpApplySweetPea: when passed a training session with condition 'B', rebuilds the training stages for condition B.
const appliedPrpB = cpApplySweetPea(CP_SESSIONS.cp_prp, 'B', [1, 2, 3, 4, 5]);
const appliedPrpBS8 = appliedPrpB.find(b => b.stage === 'S8');
assert(appliedPrpBS8.blockConfig.task1 === 'or' || appliedPrpBS8.blockConfig.t1Task === 'or',
    'cpApplySweetPea swaps PRP S8 to condition B');
assert(appliedPrpBS8.instructions.includes('FACING comes FIRST'),
    'cpApplySweetPea swaps PRP S8 copy to condition B');

section('cpApplySweetPea — refusals');

assertThrows(() => cpApplySweetPea(CP_TEST_SESSIONS.cp_stroop, 'A', [1, 2, 3, 4]),
    'fewer ids than test blocks is refused — a block would fall back to the JS generator');
assertThrows(() => cpApplySweetPea(CP_TEST_SESSIONS.cp_stroop, 'A', [1, 2, 3, 4, 5, 6]),
    'more ids than test blocks is refused');
assertThrows(() => cpApplySweetPea(CP_TEST_SESSIONS.cp_stroop, 'A', [1, 2, 3, 4, 4]),
    'a duplicate id is refused — that block would be run twice');
assertThrows(() => cpSequencePath('cp_stroop', 'A', 0), 'sequence ids are 1-based');

section('pool CSVs — one complete, balanced block each');

// Each file must be a whole multiple of the paradigm's crossing, measured from
// generateSequenceVectors rather than hardcoded, so a future crossing change
// (n-1 congruency, say) fails here instead of corrupting a block.
const POOL_ROW_COUNTS = {};
for (const [id, keys] of Object.entries(CP_CROSSINGS)) {
    const cells = measureCellCount(CP_TEST_SESSIONS[id][0].blockConfig, keys);
    const path = cpSequencePath(id, 'A', 1);
    if (!fs.existsSync(path)) {
        assert(false, `${id}: pool file ${path} exists (cannot check its balance without it)`);
        continue;
    }
    const rows = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
    POOL_ROW_COUNTS[id] = rows.length;
    assert(rows.length % cells === 0,
        `${id}: pool CSV has ${rows.length} rows, a whole multiple of the ${cells}-cell crossing`);
    assert(rows.length === CP_TEST_SESSIONS[id][0].numTrials,
        `${id}: the pool CSV's row count (${rows.length}) matches the blockDef's numTrials ` +
        `(${CP_TEST_SESSIONS[id][0].numTrials}) — the CSV wins on the participant path, so a ` +
        'mismatch means the declared session length is fiction');
}

section('pool CSVs — A and B differ only in their labels');

// The pool samples each sequence ONCE and writes it out under both condition
// labels, which is what makes condition and trial sequence exactly orthogonal:
// an A/B difference can never be a sequence difference. If generation ever
// reverts to sampling per condition, this fails.
const CONDITION_LABEL_COLUMNS = new Set(['condition', 'task', 'target_coh_level']);
for (const id of Object.keys(CP_EXPECTED)) {
    if (!fs.existsSync(cpSequencePath(id, 'A', 1)) || !fs.existsSync(cpSequencePath(id, 'B', 1))) {
        // Reported by the pool-completeness check above; don't crash the suite.
        assert(false, `${id}: both condition files of sequence 001 exist`);
        continue;
    }
    const readRows = (condition) => {
        const lines = fs.readFileSync(cpSequencePath(id, condition, 1), 'utf8').trim().split('\n');
        const header = lines[0].split(',');
        return lines.slice(1).map(line => {
            const cells = line.split(',');
            return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
        });
    };
    const a = readRows('A');
    const b = readRows('B');
    assert(a.length === b.length, `${id}: the A and B files are the same length`);
    const differing = new Set();
    for (let i = 0; i < a.length; i++) {
        for (const col of Object.keys(a[i])) {
            if (a[i][col] !== b[i][col]) differing.add(col);
        }
    }
    assert([...differing].every(col => CONDITION_LABEL_COLUMNS.has(col)),
        `${id}: A and B differ only in label columns (differing: ${[...differing].join(', ') || 'none'})`);
    // cp_taskswitch has no between-subjects task assignment, so only the
    // condition column itself may differ there.
    if (id === 'cp_taskswitch') {
        assert(!differing.has('task'),
            'cp_taskswitch: task identity is not condition-assigned, so it must not differ');
    } else {
        assert(differing.has('task') || differing.has('target_coh_level'),
            `${id}: the between-subjects assignment actually differs between A and B`);
    }
}

section('canonical sessions — coherence follows each paradigm');

const stageOf = (id, stage) => CP_SESSIONS[id].find(b => b.stage === stage);

// The ramp bottoms at the EASIEST level the task carries in the test block —
// documented as a judgment call in canonical_paradigms.js, not as a plan decision.
assert(stageOf('cp_taskswitch', 'S2').blockConfig.coherenceRamp.to === 0.8,
    'basic switching ramps S2 to the easy level, not the hard one');
assert(stageOf('cp_stroop_crossed', 'S2').blockConfig.coherenceRamp.to === 0.7,
    'crossed Stroop ramps to the easiest of its three levels');
// Asymmetric switching has exactly one level per task, so there is no choice.
assert(stageOf('cp_taskswitch_asym', 'S2').blockConfig.coherenceRamp.to === 0.8
    && stageOf('cp_taskswitch_asym', 'S3').blockConfig.coherenceRamp.to === 0.3,
    'asymmetric switching ramps each task to its own fixed test coherence');
// S3 is required even for Stroop, at the strength the dimension appears with.
assert(stageOf('cp_stroop', 'S3').blockConfig.coherenceRamp.to === 0.5,
    "Stroop's S3 trains the distractor dimension at its distractor strength");

// S6 sees every test coherence level, so none is novel in the test block.
for (const id of ['cp_taskswitch', 'cp_stroop', 'cp_stroop_crossed', 'cp_taskswitch_asym']) {
    assert(stageOf(id, 'S6').blockConfig.coherence === CP_TEST_SESSIONS[id][0].blockConfig.coherence,
        `${id}: S6 uses the test block's coherence table verbatim`);
}
assert(stageOf('cp_stroop_crossed', 'S6').blockConfig.levelFactors
    === CP_TEST_SESSIONS.cp_stroop_crossed[0].blockConfig.levelFactors,
    'crossed Stroop: S6 spans all nine target x distractor cells');

// Bivalent stimuli in training for all five paradigms, INCLUDING cp_prp,
// whose test block is univalent. S5/S6 must therefore carry a real distractor.
for (const id of Object.keys(CP_EXPECTED)) {
    assert(stageOf(id, 'S5').blockConfig.coherence.distractor > 0,
        `${id}: S5 is bivalent`);
    assert(stageOf(id, 'S2').blockConfig.coherence.distractor === 0,
        `${id}: S2 is univalent — bivalence arrives at S5`);
}
assert(CP_TEST_SESSIONS.cp_prp[0].blockConfig.coherence.distractor === 0,
    "cp_prp's own test block really is univalent, so bivalence is training-only there");

section('canonical sessions — instruction copy is generated from the key maps');

for (const [id, expected] of Object.entries(CP_EXPECTED)) {
    const copy = CP_SESSIONS[id].filter(b => b.phase === 'training').map(b => b.instructions);
    const all = copy.join('\n');
    const disjoint = expected.rso === 'disjoint';

    assert(/A = left/.test(all) && /D = right/.test(all), `${id}: the A/D map is spelled out`);
    assert(/J = left/.test(all) === disjoint,
        `${id}: the second hand's keys appear iff the paradigm uses disjoint keys`);
    assert(/right hand/i.test(all) === disjoint,
        `${id}: a second hand is named iff there is one`);
    // From S4 on the border is the whole mechanism, so every one of those screens
    // has to say what it means.
    for (const stage of ['S4', 'S5', 'S6']) {
        const text = stageOf(id, stage).instructions;
        assert(/ORANGE/.test(text) && /BLUE/.test(text),
            `${id}/${stage}: names both border colors`);
    }
    assert(!/Dotted|Dashed/.test(all),
        `${id}: no copy claims the cue is dotted/dashed — SE colors it, and dash-vs-dot separates cue1 from cue2`);
    assert(copy.every(text => /Press any key to begin/.test(text)),
        `${id}: every screen ends with how to continue`);
    // With S7 gone these screens are the only gate; they must not have grown one.
    assert(!/quiz|question 1|correct answer|type the/i.test(all),
        `${id}: no comprehension gate was smuggled back in`);
}

assert(/SWIMMING comes FIRST/.test(stageOf('cp_prp', 'S8').instructions),
    "cp_prp's S8 copy states the fixed task order for condition A");
assert(/ONE question/.test(stageOf('cp_stroop', 'S8').instructions),
    "Stroop's S8 copy narrows back down to a single task");
assert(/switching between/.test(stageOf('cp_taskswitch', 'S8').instructions),
    "switching's S8 copy describes the mixed block");

section('canonical sessions — the border is introduced honestly (not "new" at S4)');

// SE schedules cue1 with go1 from trial onset on EVERY stage and game.js paints
// it at full opacity while its go signal runs, so a colored border is on screen
// throughout S1-S3. The copy used to tell participants at S4 that "a colored
// border appears" — the first thing they are taught about the border, and false.
// What actually changes at S4 is that it becomes informative (two tasks are now
// mixed) and predictive (cueCsi 200 puts it ahead of the stimulus).
for (const id of Object.keys(CP_EXPECTED)) {
    for (const stage of ['S1', 'S2', 'S3']) {
        const text = stageOf(id, stage).instructions;
        assert(/border/i.test(text),
            `${id}/${stage}: names the border that is already on screen`);
        assert(/ignor/i.test(text),
            `${id}/${stage}: tells the participant to ignore it for now`);
        assert(!/ORANGE|BLUE/.test(text),
            `${id}/${stage}: but does NOT yet give it a meaning — that is S4's job`);
    }
    const s4 = stageOf(id, 'S4').instructions;
    assert(!/border appears|a colored border appears/i.test(s4),
        `${id}/S4: does not claim the border is new — it has been there since S1`);
    assert(/been ignoring/i.test(s4),
        `${id}/S4: refers back to the border the participant already knows`);
    assert(/BEFORE the fish/.test(s4),
        `${id}/S4: states the other real change — the border now precedes the stimulus`);
}

// One vocabulary for one object. S1-S4 said "frame" and S5/S6/S8 + the legend
// said "border" at one point during this edit; for a grandmother-standard screen
// two words for the same thing is a comprehension cost for no gain.
for (const id of Object.keys(CP_EXPECTED)) {
    const all = CP_SESSIONS[id].map(b => b.instructions || '').join('\n');
    assert(!/\bframes?\b/i.test(all), `${id}: the border is called "border" everywhere`);
}

section('canonical sessions — no screen tells the participant what to expect of the DV');

// cp_taskswitch_asym used to append "(Note: one task is systematically harder
// than the other.)". That is a demand characteristic pointed straight at the
// dependent variable: the paradigm measures an ASYMMETRIC switch cost, and a
// participant told to expect asymmetry can manufacture it by strategy rather
// than by the coherence manipulation. The asymmetry must come from the stimulus.
const asymCopy = CP_TEST_SESSIONS.cp_taskswitch_asym[0].instructions;
assert(!/harder|difficult|easier/i.test(asymCopy),
    'cp_taskswitch_asym does not tell the participant one task is harder');
assert(asymCopy === CP_TEST_SESSIONS.cp_taskswitch[0].instructions,
    'and its screen is identical to basic switching, which is what makes them comparable');

// ============================================================
// summarizeBlockPerformance / formatBreakSummary (the between-blocks compromise)
// ============================================================

section('summarizeBlockPerformance');

const perfRow = (a1, rt1, a2 = null, rt2 = null) =>
    ({ accuracy1: a1, rt1, accuracy2: a2, rt2 });

assert(summarizeBlockPerformance([]) === null, 'no rows means nothing to report');
assert(summarizeBlockPerformance([perfRow(null, null)]) === null,
    'rows with no scored response mean nothing to report');

const singlePerf = summarizeBlockPerformance([
    perfRow('correct', 600), perfRow('correct', 800), perfRow('error', 400), perfRow('miss', null),
]);
assert(singlePerf.numResponses === 4, 'every scored response is counted');
assert(singlePerf.numCorrect === 2, 'only correct responses count as correct');
assert(close(singlePerf.accuracy, 0.5), 'accuracy is correct/responses');
assert(close(singlePerf.meanRt, 700), 'mean RT is over CORRECT responses only');

const correctedPerf = summarizeBlockPerformance([perfRow('corrected', 900)]);
assert(correctedPerf.numCorrect === 1, "'corrected' counts as correct, as everywhere else");

// A two-response block reports the same quantity as a single-task one: responses,
// not trials. A joint both-correct rate would read as mysteriously low.
const dualPerf = summarizeBlockPerformance([
    perfRow('correct', 500, 'error', 900), perfRow('correct', 700, 'correct', 1100),
]);
assert(dualPerf.numResponses === 4, 'both responses of a dual-task trial are counted');
assert(close(dualPerf.accuracy, 0.75), 'accuracy is per response, not per trial');
assert(close(dualPerf.meanRt, (500 + 700 + 1100) / 3), 'mean RT spans both response slots');

const noRtPerf = summarizeBlockPerformance([perfRow('correct', null)]);
assert(noRtPerf.meanRt === null, 'a correct response with no RT leaves meanRt null');

section('formatBreakSummary');

assert(formatBreakSummary(null) === null, 'nothing to report produces no line');
const line = formatBreakSummary(singlePerf);
assert(/50% correct/.test(line), 'the line states accuracy as a percentage');
assert(/700 ms/.test(line), 'and the mean RT in ms');
assert(!/well done|good|slow|too many/i.test(line),
    'the wording is identical regardless of performance — a varying phrasing would be an evaluative signal, not calibration');
assert(!/\bms\b/.test(formatBreakSummary(noRtPerf)), 'the RT clause is dropped when there is no RT');

// ============================================================
// runSession plumbing (Task 1 + Task 2 integration)
// ============================================================

const TRAINING_BLOCK_CONFIG = {
    blockId: 'train_S2',
    blockType: 'training',
    paradigm: 'single-task',
    rso: 'identical',
    keyMaps: { mov: { 180: 'a', 0: 'd' }, or: { 180: 'a', 0: 'd' } },
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov',
    task1: 'mov',
    csi: 0,
    stimulusDuration: 2000,
    responseWindow: 2000,
    iti: { type: 'fixed', value: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    coherence: { target: 0.8, distractor: 0 },
    feedback: true,
    earlyResolve: true,
    acceptFirstResponse: true,
};

function trainingBlockDef(stage, overrides = {}) {
    return {
        blockConfig: { ...TRAINING_BLOCK_CONFIG, ...(overrides.blockConfig || {}) },
        isTraining: true,
        phase: 'training',
        stage,
    };
}

const container = makeElement();

// runSession is async, and this file is CommonJS (no top-level await), so the
// integration tests and the summary live inside one async main().
async function main() {

section('runSession — stage that meets criterion stops early');

seResponder = RESPOND_CORRECT;
await Session.runSession([trainingBlockDef('S2')], container, { stimulus: 'abstract' });

let log = Session.getTrainingLog();
let data = Session.getData();
assert(log.length === 1, 'one stage summary logged');
assert(log[0].kind === 'trainingStage', 'summary is tagged as a training stage');
assert(log[0].stageId === 'S2', 'summary carries the stage id');
assert(log[0].blockId === 'train_S2', 'summary carries the block id');
assert(log[0].trialsUsed === 16, 'a perfect run stops at the first full window (16 trials)');
assert(log[0].criterionMet === true, 'criterion reported as met');
assert(close(log[0].finalWindowAccuracy, 1), 'final-window accuracy is 1');
assert(log[0].exclusionCandidate === false, 'meeting criterion is never an exclusion candidate');
assert(data.length === 16, 'only the trials actually run are logged');
assert(data.every(r => r.phase === 'training'), 'every training row is tagged phase=training');
assert(data.every(r => r.stage === 'S2'), 'every training row is tagged with its stage');

section('runSession — stage that never meets criterion runs the full cap');

seResponder = RESPOND_INCORRECT;
await Session.runSession([trainingBlockDef('S2')], container, { stimulus: 'abstract' });

log = Session.getTrainingLog();
assert(log.length === 1, 'training log resets between sessions');
assert(log[0].trialsUsed === TRAINING_CAP, `a failing stage runs the full cap (${TRAINING_CAP})`);
assert(log[0].criterionMet === false, 'criterion reported as not met');
assert(close(log[0].finalWindowAccuracy, 0), 'final-window accuracy is 0');
assert(log[0].exclusionCandidate === true, 'failing the cap on S2 is an exclusion candidate');
assert(Session.getData().length === TRAINING_CAP, 'all capped trials are logged');

section('runSession — only S2/S3 cap failures are exclusion candidates');

seResponder = RESPOND_INCORRECT;
await Session.runSession(
    [trainingBlockDef('S3'), trainingBlockDef('S5')], container, { stimulus: 'abstract' });

log = Session.getTrainingLog();
assert(log.length === 2, 'one summary per training stage, in order');
assert(log[0].stageId === 'S3' && log[1].stageId === 'S5', 'summaries are in session order');
assert(log[0].exclusionCandidate === true, 'S3 cap failure is an exclusion candidate');
assert(log[1].exclusionCandidate === false, 'S5 cap failure is recorded, not excluded');
assert(Session.getData().length === 2 * TRAINING_CAP, 'both stages ran to the cap');

section('runSession — a stage summary is never mistaken for a Quest coherence');

// Regression guard: runSession used to treat ANY defined runBlock return value as
// a Quest result, so a training summary would have been injected as a coherence.
seResponder = RESPOND_CORRECT;
const laterCoherence = { target: 0.8, distractor: 0 };
const laterBlock = {
    blockConfig: { ...TRAINING_BLOCK_CONFIG, blockId: 'test_block', coherence: laterCoherence },
    numTrials: 3,
    useQuest: true,
};
await Session.runSession([trainingBlockDef('S2'), laterBlock], container, { stimulus: 'abstract' });

assert(laterBlock.blockConfig.coherence === laterCoherence,
    'a later useQuest block keeps its own coherence after a training stage');
data = Session.getData();
const testRows = data.filter(r => r.blockId === 'test_block');
assert(testRows.length === 3, 'the following block ran its own numTrials');
assert(testRows.every(r => r.phase === 'test'), 'blocks without a phase default to test');
assert(testRows.every(r => r.stage === null), 'blocks without a stage default to null');
assert(Session.getTrainingLog().length === 1, 'only the training block is logged as a stage');

section('runSession — coherence ramp is applied per trial');

seResponder = RESPOND_CORRECT;
const rampBlock = {
    blockConfig: {
        ...TRAINING_BLOCK_CONFIG,
        blockId: 'ramp_block',
        coherenceRamp: { from: 1.0, to: 0.3, rampLength: 15 },
    },
    numTrials: 20,
};
await Session.runSession([rampBlock], container, { stimulus: 'abstract' });

data = Session.getData();
assert(data.length === 20, 'a non-training ramp block runs its full numTrials');
assert(close(data[0].t1_target_coherence, 1.0), 'trial 1 runs at ceiling coherence');
assert(close(data[7].t1_target_coherence, 0.65), 'trial 8 is halfway down the ramp');
assert(close(data[14].t1_target_coherence, 0.3), 'trial 15 has reached the test level');
assert(close(data[19].t1_target_coherence, 0.3), 'trials past the ramp stay at the test level');

section('runSession — per-task ramp resolves against the trial\'s own task');

seResponder = RESPOND_CORRECT;
const mixedRampBlock = {
    blockConfig: {
        ...TRAINING_BLOCK_CONFIG,
        blockId: 'mixed_ramp_block',
        switchRate: 50,
        startTask: null,
        csi: 200,
        coherenceRamp: { from: 1.0, to: { mov: 0.3, or: 0.7 }, rampLength: 2 },
    },
    numTrials: 12,
};
await Session.runSession([mixedRampBlock], container, { stimulus: 'abstract' });

data = Session.getData();
const settled = data.slice(2); // past the (length-2) ramp
assert(settled.length > 0, 'mixed-task ramp block produced settled trials');
assert(settled.every(r => close(r.t1_target_coherence, r.t1_task === 'mov' ? 0.3 : 0.7)),
    'each trial lands on its own task\'s test level');
assert(new Set(data.map(r => r.t1_task)).size === 2, 'the block really did mix both tasks');

section('runSession — the config guards fire before any trial runs');

seResponder = RESPOND_CORRECT;

// earlyResolve without acceptFirstResponse: runs to completion and exports a
// full CSV if unguarded, so runBlock has to refuse it up front.
await assertRejects(
    () => Session.runSession([{
        blockConfig: { ...TRAINING_BLOCK_CONFIG, blockId: 'bad_regime', acceptFirstResponse: false },
        numTrials: 4,
    }], container, { stimulus: 'abstract' }),
    'acceptFirstResponse',
    'runSession rejects earlyResolve without acceptFirstResponse');
assert(Session.getData().length === 0, 'no trial data is collected from a rejected block');

await assertRejects(
    () => Session.runSession([{
        blockConfig: {
            ...TRAINING_BLOCK_CONFIG,
            blockId: 'bad_ramp',
            paradigm: 'dual-task',
            task1: 'mov',
            t2Rule: 'switch',
            soa: { type: 'choice', value: 100, params: [100, 600] },
            coherenceRamp: { from: 1.0, to: 0.3, rampLength: 15 },
        },
        numTrials: 4,
    }], container, { stimulus: 'abstract' }),
    "coherenceRamp is not allowed on a 'dual-task' block",
    'runSession rejects a coherence ramp on a dual-task block');

// The per-trial guard: a ramp table that cannot be resolved for a task the stage
// actually presents must throw rather than write a NaN coherence.
await assertRejects(
    () => Session.runSession([{
        blockConfig: {
            ...TRAINING_BLOCK_CONFIG,
            blockId: 'unresolvable_ramp',
            switchRate: 50,
            startTask: null,
            csi: 200,
            coherenceRamp: { from: 1.0, to: { mov: 0.3 }, rampLength: 15 }, // no 'or' entry
        },
        numTrials: 30,
    }], container, { stimulus: 'abstract' }),
    'did not resolve',
    'runSession rejects a per-task ramp missing a task the stage presents');

// ============================================================
// PRP-shaped training stage (S8) end to end
// ============================================================

const PRP_S8_SPEC = {
    kind: 'prp',
    keyMaps: KEY_MAPS,          // disjoint: mov = a/d, or = j/l
    rso: 'disjoint',
    csi: 0,
    t1Task: 'mov',
    soaLevels: [100, 300, 600],
    coherence: { target: { mov: 0.8, or: 0.8 }, distractor: 0 },
};

// T1 answered on the mov keys, T2 on the or keys, both well after their onsets
// (the longest SOA is 600, so 1500 is safely after the T2 stimulus).
const PRP_BOTH_CORRECT = () => ({
    keyPresses: [
        { eventType: 'keydown', key: 'd', time: 900, isCorrect: true },
        { eventType: 'keydown', key: 'l', time: 1500, isCorrect: true },
    ],
});
const PRP_T2_WRONG = () => ({
    keyPresses: [
        { eventType: 'keydown', key: 'd', time: 900, isCorrect: true },
        { eventType: 'keydown', key: 'j', time: 1500, isCorrect: false },
    ],
});

section('PRP S8 — advancement requires BOTH responses correct');

seResponder = PRP_BOTH_CORRECT;
await Session.runSession([buildParadigmFinalStage(PRP_S8_SPEC)], container, { stimulus: 'abstract' });

log = Session.getTrainingLog();
data = Session.getData();
assert(log.length === 1 && log[0].stageId === 'S8', 'the PRP S8 stage is logged as a training stage');
assert(log[0].trialsUsed === 16, 'both-correct trials reach criterion at the first full window');
assert(log[0].criterionMet === true, 'criterion met when both responses are correct');
assert(data.every(r => r.accuracy1 === 'correct' && r.accuracy2 === 'correct'),
    'both responses were extracted and scored on every trial');
assert(data.every(r => r.paradigm === 'dual-task'), 'the stage really ran the dual-task paradigm');

seResponder = PRP_T2_WRONG;
await Session.runSession([buildParadigmFinalStage(PRP_S8_SPEC)], container, { stimulus: 'abstract' });

log = Session.getTrainingLog();
data = Session.getData();
assert(data.every(r => r.accuracy1 === 'correct'), 'T1 was correct on every trial');
assert(data.every(r => r.accuracy2 === 'error'), 'T2 was wrong on every trial');
assert(log[0].trialsUsed === TRAINING_CAP,
    'a correct T1 with a wrong T2 never advances — the stage runs the full cap');
assert(log[0].criterionMet === false, 'criterion not met when only one response is correct');
assert(log[0].exclusionCandidate === false, 'S8 cap failure is recorded, not excluded');

section('PRP S8 — both responses survive a wrong press and a reversal');

// The SE runtime was fixed so that, with disjoint key maps, a press consumes only
// its own task's go signal. These drive the keypress streams that fix now makes
// possible through the extractor and the advancement logic, which is where they
// have to land correctly: before the fix the runtime could not produce either
// stream (one press killed both go signals), so nothing downstream was ever
// exercised on them. The routing itself is tested in the fork's test_patches.js.

// Wrong press on T1's key set, then the correct one, then T2 answered normally.
const PRP_T1_CORRECTED = () => ({
    keyPresses: [
        { eventType: 'keydown', key: 'a', time: 700, isCorrect: false },  // T1, wrong
        { eventType: 'keydown', key: 'd', time: 900, isCorrect: true },   // T1, right
        { eventType: 'keydown', key: 'l', time: 1500, isCorrect: true },  // T2
    ],
});
// T2's key pressed FIRST — a genuine response reversal.
const PRP_T2_FIRST = () => ({
    keyPresses: [
        { eventType: 'keydown', key: 'l', time: 900, isCorrect: true },   // T2
        { eventType: 'keydown', key: 'd', time: 1400, isCorrect: true },  // T1
    ],
});

seResponder = PRP_T1_CORRECTED;
await Session.runSession([buildParadigmFinalStage(PRP_S8_SPEC)], container, { stimulus: 'abstract' });

data = Session.getData();
assert(data.every(r => r.accuracy1 === 'error'),
    'the first press in T1\'s key set is T1\'s response, wrong or not (strict scoring)');
assert(data.every(r => r.rt1 !== null && r.rt1 > 0), 'that wrong press still yields an RT');
assert(data.every(r => r.accuracy2 === 'correct'),
    'a wrong press on T1 no longer costs the T2 response');
assert(data.every(r => r.rt2 !== null && r.rt2 > 0), 'and T2 keeps a usable RT');
assert(Session.getTrainingLog()[0].criterionMet === false,
    'a wrong T1 still fails advancement — both responses must be correct');

seResponder = PRP_T2_FIRST;
await Session.runSession([buildParadigmFinalStage(PRP_S8_SPEC)], container, { stimulus: 'abstract' });

data = Session.getData();
log = Session.getTrainingLog();
assert(data.every(r => r.accuracy1 === 'correct' && r.accuracy2 === 'correct'),
    'a reversal records both responses in the right slots, not one in the other\'s');
assert(data.every(r => r.rt1 > r.rt2),
    'T1 responded later than T2 — the reversal is preserved, not normalized away');
assert(data.every(r => r.responseOrder === 'T2-first'), 'and it is labelled as a reversal');
assert(log[0].criterionMet === true && log[0].trialsUsed === 16,
    'a reversal with both responses correct still advances (at the first full window)');

section('PRP S8 — a two-response stage advances at 12/16, not 14/16');

// The PRP S8 builder is the only thing that emits an advancementThreshold.
const prpStage = buildParadigmFinalStage(PRP_S8_SPEC);
assert(prpStage.advancementThreshold === 12, "kind 'prp' asks for the 12/16 threshold");
assert(buildParadigmFinalStage({ ...S8_BASE, kind: 'switching', switchRate: 50 })
    .advancementThreshold === undefined, "kind 'switching' inherits the shared default");
assert(buildParadigmFinalStage({ ...S8_BASE, kind: 'rehearsal', task: 'mov' })
    .advancementThreshold === undefined, "kind 'rehearsal' inherits the shared default");
assert(buildSharedTrainingStages(BASE_SPEC).every(s => s.advancementThreshold === undefined),
    'no shared stage overrides the threshold');

// A responder that is correct on both tasks for the first `n` trials of each
// window of 16 and wrong on T2 afterwards, so the rolling window lands on an
// exact score. Trial index is tracked here because the stub sees one call/trial.
let prpTrialIndex = 0;
const prpScripted = (correctPerWindow) => () => {
    const i = prpTrialIndex++;
    const t2Correct = (i % 16) < correctPerWindow;
    return {
        keyPresses: [
            { eventType: 'keydown', key: 'd', time: 900, isCorrect: true },
            { eventType: 'keydown', key: t2Correct ? 'l' : 'j', time: 1500, isCorrect: t2Correct },
        ],
    };
};

prpTrialIndex = 0;
seResponder = prpScripted(12);   // exactly 12 of every 16 have both responses correct
await Session.runSession([prpStage], container, { stimulus: 'abstract' });
log = Session.getTrainingLog();
assert(log[0].criterionMet === true, '12/16 advances a two-response stage');
assert(log[0].trialsUsed === 16, 'it advances at the first full window');
assert(log[0].advancementThreshold === 12,
    'the summary records the threshold it was actually scored against');
assert(log[0].advancementWindow === 16, 'and the window size');

prpTrialIndex = 0;
seResponder = prpScripted(11);   // one short
await Session.runSession([prpStage], container, { stimulus: 'abstract' });
log = Session.getTrainingLog();
assert(log[0].criterionMet === false, '11/16 does not advance a two-response stage');
assert(log[0].trialsUsed === TRAINING_CAP, 'it runs the full cap instead');

section('single-response stages still require 14/16');

// Same scripted pattern on a one-response stage: 13/16 must NOT advance, 14/16
// must. This is the guarantee the two-tier threshold rests on — if the 12 ever
// leaked into the shared default, a pure guesser would clear a single-response
// window 22.7% of the time.
let singleTrialIndex = 0;
const singleScripted = (correctPerWindow) => () => {
    const i = singleTrialIndex++;
    const isCorrect = (i % 16) < correctPerWindow;
    return { keyPresses: [{ eventType: 'keydown', key: isCorrect ? 'd' : 'a', time: 900, isCorrect }] };
};

singleTrialIndex = 0;
seResponder = singleScripted(13);
await Session.runSession([trainingBlockDef('S2')], container, { stimulus: 'abstract' });
log = Session.getTrainingLog();
assert(log[0].criterionMet === false, '13/16 does not advance a single-response stage');
assert(log[0].trialsUsed === TRAINING_CAP, 'it runs the full cap');
assert(log[0].advancementThreshold === 14, 'and it was scored against the shared 14/16 default');

singleTrialIndex = 0;
seResponder = singleScripted(14);
await Session.runSession([trainingBlockDef('S2')], container, { stimulus: 'abstract' });
log = Session.getTrainingLog();
assert(log[0].criterionMet === true, '14/16 advances a single-response stage');
assert(log[0].trialsUsed === 16, 'at the first full window');

section('the loop\'s stopping decision and the logged criterionMet agree');

// The failure this rules out: runBlock resolving the threshold differently for
// the stop-early predicate and for the summary, so a stage stops while its own
// log says the criterion was never met. Checked at both thresholds by comparing
// trialsUsed (a proxy for "the loop stopped early") against criterionMet.
for (const [label, stage, responder, expectMet] of [
    ['prp 12/16', prpStage, prpScripted(12), true],
    ['prp 11/16', prpStage, prpScripted(11), false],
    ['single 14/16', trainingBlockDef('S2'), singleScripted(14), true],
    ['single 13/16', trainingBlockDef('S2'), singleScripted(13), false],
]) {
    prpTrialIndex = 0;
    singleTrialIndex = 0;
    seResponder = responder;
    await Session.runSession([stage], container, { stimulus: 'abstract' });
    const summary = Session.getTrainingLog()[0];
    const stoppedEarly = summary.trialsUsed < TRAINING_CAP;
    assert(stoppedEarly === summary.criterionMet,
        `${label}: the loop stopped early iff the summary says the criterion was met`);
    assert(summary.criterionMet === expectMet, `${label}: criterion outcome is as designed`);
}

section('PRP S8 — SOA descends from longest to shortest across the schedule');

seResponder = PRP_T2_WRONG; // never advances, so all 48 trials run
await Session.runSession([buildParadigmFinalStage(PRP_S8_SPEC)], container, { stimulus: 'abstract' });

data = Session.getData();
const scheduled = data.slice(0, TRAINING_SOA_SCHEDULE_LENGTH).map(r => r.soa);
assert(scheduled[0] === 600, 'the stage opens at the longest SOA (T1 finishes before T2 appears)');
assert(scheduled[TRAINING_SOA_SCHEDULE_LENGTH - 1] === 100,
    'the schedule ends at the shortest SOA');
assert(scheduled.every((v, i) => i === 0 || v <= scheduled[i - 1]),
    'the scheduled SOAs are monotonically non-increasing');
assert(new Set(scheduled).size === 3, 'all three SOA levels appear inside the criterion window');
assert(data.every(r => [100, 300, 600].includes(r.soa)), 'every trial uses a real SOA level');
assert(data.every(r => r.t2_stim_onset === r.soa),
    'the scheduled SOA reached the SE timing params (csi 0, so t2 onset == soa)');
// Past the schedule the stage falls back to the block's own sampling, which is
// what the test block does — the last thing practiced should match it.
const afterSchedule = data.slice(TRAINING_SOA_SCHEDULE_LENGTH).map(r => r.soa);
assert(afterSchedule.length === TRAINING_CAP - TRAINING_SOA_SCHEDULE_LENGTH,
    'the rest of the cap ran after the schedule');
assert(!afterSchedule.every((v, i) => i === 0 || v <= afterSchedule[i - 1])
    || new Set(afterSchedule).size > 1,
    'post-schedule SOAs are sampled, not pinned to the shortest level');

// ============================================================
// Break summary end to end
// ============================================================

section('runSession — the break summary appears between blocks, never inside one');

// showInstructions builds an overlay and sets its innerHTML; the stubbed
// remove() is a no-op, so a fresh container accumulates every screen shown, in
// order. That is what lets these assertions be about WHERE the summary lands.
const screensOf = (el) => el.children.map(child => child.innerHTML || '');

seResponder = RESPOND_CORRECT;
const twoTestBlocks = [
    { blockConfig: { ...TRAINING_BLOCK_CONFIG, blockId: 'test_a' }, numTrials: 4, instructions: 'A' },
    { blockConfig: { ...TRAINING_BLOCK_CONFIG, blockId: 'test_b' }, numTrials: 4, instructions: 'B' },
];
let screenContainer = makeElement();
await Session.runSession(twoTestBlocks, screenContainer, { stimulus: 'abstract' });

let screens = screensOf(screenContainer);
let breakScreens = screens.filter(text => text.includes('Since the last break'));
assert(breakScreens.length === 1, 'one break summary between two test blocks');
assert(/100% correct/.test(breakScreens[0]), 'it reports the accuracy of the block just finished');
assert(/ms per answer/.test(breakScreens[0]), 'and a mean RT');
assert(screens[screens.length - 1].includes('Session complete'),
    'the last screen is the end-of-session one, not a break');

section('runSession — no break summary between training stages');

// A training stage is followed immediately by the next stage's own instruction
// screen, so the generic block-complete screen would be noise there — whether a
// real break belongs INSIDE training is still open pending the advisor.
seResponder = RESPOND_CORRECT;
screenContainer = makeElement();
await Session.runSession([
    trainingBlockDef('S2'),
    trainingBlockDef('S3'),
    { blockConfig: { ...TRAINING_BLOCK_CONFIG, blockId: 'test_after' }, numTrials: 4, instructions: 'T' },
], screenContainer, { stimulus: 'abstract' });

screens = screensOf(screenContainer);
assert(screens.filter(text => text.includes('Since the last break')).length === 0,
    'no break summary is shown while the session is still in training');
assert(screens.filter(text => /Block \d+ of \d+ complete/.test(text)).length === 0,
    'and no block-complete screen either — the stages run straight into each other');
assert(screens[screens.length - 1].includes('Session complete'),
    'the session still ends normally');

section('runSession — training trials are excluded from the break summary');

// The summary is about the participant's TEST performance: training stages still
// run with feedback on and are excluded from analysis.
let mixedIndex = 0;
seResponder = () => {
    // Wrong throughout training, correct throughout the test blocks.
    const isCorrect = mixedIndex++ >= 16;
    return { keyPresses: [{ eventType: 'keydown', key: isCorrect ? 'd' : 'a', time: 900, isCorrect }] };
};
screenContainer = makeElement();
await Session.runSession([
    { ...trainingBlockDef('S1'), isTraining: false, numTrials: 16 },
    { blockConfig: { ...TRAINING_BLOCK_CONFIG, blockId: 'test_1' }, numTrials: 4, instructions: 'X' },
    { blockConfig: { ...TRAINING_BLOCK_CONFIG, blockId: 'test_2' }, numTrials: 4, instructions: 'Y' },
], screenContainer, { stimulus: 'abstract' });

breakScreens = screensOf(screenContainer).filter(text => text.includes('Since the last break'));
assert(breakScreens.length === 1, 'the only break follows the first test block');
assert(/100% correct/.test(breakScreens[0]),
    'the 16 failed training trials before it are not counted');

// ============================================================
// Break summary in a REAL canonical session (review finding C2)
// ============================================================

section('runSession — a real CP_*_TRAINING_SESSION actually shows a break summary');

// The three sections above all used SYNTHETIC two-block sessions, which is
// exactly why the bug they were written to cover stayed invisible: every real
// CP_*_TRAINING_SESSION was [S1..S6, S8, testBlock], so runSession skipped the
// break after each training stage AND after the last block, and no participant
// ever saw a summary. That summary is the entire justification for
// `feedback: false`, so the shipped sessions had no speed-accuracy signal of any
// kind. This test runs the real thing end to end.
//
// Real training stages carry a ~500 ms ITI, and a wrong-throughout-training run
// takes every stage to the 48-trial cap, so the session is ~360 trials of real
// sleeping. Fast-forward the clock for the duration — nothing here asserts on
// wall-clock timing.
async function withFastClock(fn) {
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (cb) => realSetTimeout(cb, 0);
    try { return await fn(); } finally { global.setTimeout = realSetTimeout; }
}

// Training blocks run with feedback ON and test blocks with it OFF, and
// buildSEConfig passes that through — so the SE stub can tell which phase it is
// in without counting trials. Wrong all through training, right all through test.
seResponder = (seParams, config) => {
    const isCorrect = !config.feedback;
    return { keyPresses: [{ eventType: 'keydown', key: isCorrect ? 'd' : 'x', time: 900, isCorrect }] };
};

screenContainer = makeElement();
await withFastClock(() => Session.runSession(
    CP_SESSIONS.cp_stroop, screenContainer, { stimulus: 'abstract' }));

screens = screensOf(screenContainer);
breakScreens = screens.filter(text => text.includes('Since the last break'));
data = Session.getData();

const expectedBreaks = CP_TEST_BLOCKS_PER_SESSION - 1;
assert(breakScreens.length === expectedBreaks,
    `the real Stroop session shows ${expectedBreaks} break summaries, one between each pair of ` +
    `test blocks (it used to show none)`);
assert(/100% correct/.test(breakScreens[0]),
    'and it reports only test performance — every training trial was wrong');
assert(/ms per answer/.test(breakScreens[0]), 'with a mean RT');

// The breaks have to land BETWEEN test blocks, not anywhere near a trial: the
// summary's safety argument is entirely about where it is.
const cpTestRows = data.filter(r => r.phase === 'test');
const testBlockOrders = [...new Set(cpTestRows.map(r => r.blockOrder))];
assert(testBlockOrders.length === CP_TEST_BLOCKS_PER_SESSION,
    `the test phase ran as ${CP_TEST_BLOCKS_PER_SESSION} separate blocks`);
assert(testBlockOrders.every(o => cpTestRows.filter(r => r.blockOrder === o).length === 96),
    'each test block ran its full 96 trials');
assert(data.filter(r => r.phase === 'training').length > 0, 'training really ran too');
assert(screens.filter(t => /Block \d+ of \d+ complete/.test(t)).length === expectedBreaks,
    `exactly ${expectedBreaks} block-complete screens — none of the training stages produced one`);
assert(screens[screens.length - 1].includes('Session complete'), 'and the session ends normally');

// Every paradigm, not just Stroop: the structural precondition is that at least
// one non-training block is followed by another block.
for (const [id, session] of Object.entries(CP_SESSIONS)) {
    const lastTrainingIdx = session.map(b => b.phase).lastIndexOf('training');
    const breakOpportunities = session
        .slice(lastTrainingIdx + 1, session.length - 1)
        .filter(b => b.phase !== 'training').length;
    assert(breakOpportunities >= 1,
        `${id}: at least one break falls between two test blocks`);
}

// ============================================================
// Each test block reads its OWN pool CSV, whole
// ============================================================

section('preloadSequences — one CSV per block, read whole');

const poolCsv = (dir) => [
    'block_id,condition,sequence_id,trial_index,task,congruency,target_dir,response_transition',
    ...Array.from({ length: 4 }, (_, i) =>
        `cp_stroop,A,1,${i},mov,${i % 2 ? 'incongruent' : 'congruent'},${dir},First`),
].join('\n');

const realFetch = global.fetch;
// Two different pool blocks, distinguishable by the direction they encode.
global.fetch = async (src) => ({
    ok: true, status: 200,
    text: async () => poolCsv(src.includes('s001') ? 'left' : 'right'),
});

const poolConfigA = { ...TRAINING_BLOCK_CONFIG, blockId: 'pooled', sequenceSource: 'sequences/x_A_s001.csv', sequenceId: 1 };
const poolConfigB = { ...TRAINING_BLOCK_CONFIG, blockId: 'pooled', sequenceSource: 'sequences/x_A_s002.csv', sequenceId: 2 };
seResponder = RESPOND_CORRECT;
await Session.runSession([
    { blockConfig: poolConfigA, instructions: 'A' },
    { blockConfig: poolConfigB, instructions: null },
], makeElement(), { stimulus: 'abstract' });

data = Session.getData();
const block1 = data.filter(r => r.blockOrder === 1);
const block2 = data.filter(r => r.blockOrder === 2);
assert(block1.length === 4 && block2.length === 4,
    'each block runs its own whole 4-row CSV — no file is split');
assert(block1.every(r => r.t1_target_dir === 180) && block2.every(r => r.t1_target_dir === 0),
    'each block runs the trials of the file it was given, not of the other one');

// With no assignment table this column is the only record of the draw.
assert(block1.every(r => r.sequenceId === 1) && block2.every(r => r.sequenceId === 2),
    'every row records the sequence id its block came from');

section('preloadSequences — two blocks on one CSV are refused');

await assertRejects(
    () => Session.runSession([
        { blockConfig: poolConfigA, instructions: 'A' },
        { blockConfig: poolConfigA, instructions: null },
    ], makeElement(), { stimulus: 'abstract' }),
    'read the same sequence CSV',
    'a duplicate draw is rejected, not silently replayed');

// The JS-generator path has no sequence to name.
seResponder = RESPOND_CORRECT;
await Session.runSession(
    [{ blockConfig: TRAINING_BLOCK_CONFIG, numTrials: 2, instructions: 'A' }],
    makeElement(), { stimulus: 'abstract' });
assert(Session.getData().every(r => r.sequenceId === null),
    'a block with no sequenceSource records a null sequenceId');

global.fetch = realFetch;

// ============================================================
// Summary
// ============================================================

console.log(`\n============================`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed!');
}

} // end main

main().catch(err => {
    console.error('\nUNCAUGHT ERROR:', err);
    process.exit(1);
});
