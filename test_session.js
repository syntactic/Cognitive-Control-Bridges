/**
 * Tests for session helper functions.
 *
 * Run: node test_session.js
 *
 * Loads session_helpers.js (pure functions, no DOM/SE dependencies) and tests
 * their logic directly.
 */

const fs = require('fs');
eval(fs.readFileSync('./session_helpers.js', 'utf8'));

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

// Fixed size for testing (real code computes from DOM via computeDualCanvasSize)
const TEST_SIZE = 0.5;

// Minimal SE configs for testing extractors
const NO_ACCEPT_FIRST = { acceptFirstResponse: false };
const ACCEPT_FIRST = { acceptFirstResponse: true };

// ============================================================
// buildDualCanvasSEConfigs tests
// ============================================================

section('buildDualCanvasSEConfigs — cross-type (mov + or)');

const { leftConfig: lc1, rightConfig: rc1 } = buildDualCanvasSEConfigs(
    'mov',
    'or',
    false,
    true,
    false,
    TEST_SIZE,
);
assert(lc1.movementKeyMap[180] === 'a', 'left mov: 180 -> a');
assert(lc1.movementKeyMap[0] === 'd', 'left mov: 0 -> d');
assert(lc1.orientationKeyMap[180] === '!', 'left or: dummy');
assert(lc1.orientationKeyMap[0] === '!', 'left or: dummy');
assert(rc1.orientationKeyMap[180] === 'j', 'right or: 180 -> j');
assert(rc1.orientationKeyMap[0] === 'l', 'right or: 0 -> l');
assert(rc1.movementKeyMap[180] === '!', 'right mov: dummy');
assert(rc1.movementKeyMap[0] === '!', 'right mov: dummy');

// ============================================================

section('buildDualCanvasSEConfigs — cross-type reversed (or + mov)');

const { leftConfig: lc2, rightConfig: rc2 } = buildDualCanvasSEConfigs(
    'or',
    'mov',
    false,
    true,
    false,
    TEST_SIZE,
);
assert(lc2.orientationKeyMap[180] === 'a', 'left or: 180 -> a');
assert(lc2.orientationKeyMap[0] === 'd', 'left or: 0 -> d');
assert(lc2.movementKeyMap[180] === '!', 'left mov: dummy');
assert(rc2.movementKeyMap[180] === 'j', 'right mov: 180 -> j');
assert(rc2.movementKeyMap[0] === 'l', 'right mov: 0 -> l');
assert(rc2.orientationKeyMap[180] === '!', 'right or: dummy');

// ============================================================

section('buildDualCanvasSEConfigs — same-type (mov + mov)');

const { leftConfig: lc3, rightConfig: rc3 } = buildDualCanvasSEConfigs(
    'mov',
    'mov',
    false,
    true,
    false,
    TEST_SIZE,
);
assert(lc3.movementKeyMap[180] === 'a', 'left mov: 180 -> a');
assert(lc3.movementKeyMap[0] === 'd', 'left mov: 0 -> d');
assert(rc3.movementKeyMap[180] === 'j', 'right mov: 180 -> j');
assert(rc3.movementKeyMap[0] === 'l', 'right mov: 0 -> l');
// Both orientation maps are dummy
assert(lc3.orientationKeyMap[180] === '!', 'left or: dummy');
assert(rc3.orientationKeyMap[180] === '!', 'right or: dummy');

// ============================================================

section('buildDualCanvasSEConfigs — same-type (or + or)');

const { leftConfig: lc4, rightConfig: rc4 } = buildDualCanvasSEConfigs(
    'or',
    'or',
    false,
    true,
    false,
    TEST_SIZE,
);
assert(lc4.orientationKeyMap[180] === 'a', 'left or: 180 -> a');
assert(lc4.orientationKeyMap[0] === 'd', 'left or: 0 -> d');
assert(rc4.orientationKeyMap[180] === 'j', 'right or: 180 -> j');
assert(rc4.orientationKeyMap[0] === 'l', 'right or: 0 -> l');
// Both movement maps are dummy
assert(lc4.movementKeyMap[180] === '!', 'left mov: dummy');
assert(rc4.movementKeyMap[180] === '!', 'right mov: dummy');

// ============================================================

section('buildDualCanvasSEConfigs — disjoint keys (no overlap)');

// Verify left and right configs never share real keys
const allConfigs = [
    buildDualCanvasSEConfigs('mov', 'or', false, true, false, TEST_SIZE),
    buildDualCanvasSEConfigs('or', 'mov', false, true, false, TEST_SIZE),
    buildDualCanvasSEConfigs('mov', 'mov', false, true, false, TEST_SIZE),
    buildDualCanvasSEConfigs('or', 'or', false, true, false, TEST_SIZE),
];

for (const { leftConfig, rightConfig } of allConfigs) {
    const leftKeys = new Set(
        [
            ...Object.values(leftConfig.movementKeyMap),
            ...Object.values(leftConfig.orientationKeyMap),
        ].filter((k) => k !== '!'),
    );
    const rightKeys = new Set(
        [
            ...Object.values(rightConfig.movementKeyMap),
            ...Object.values(rightConfig.orientationKeyMap),
        ].filter((k) => k !== '!'),
    );
    const overlap = [...leftKeys].filter((k) => rightKeys.has(k));
    assert(
        overlap.length === 0,
        `no real key overlap: left={${[...leftKeys]}} right={${[...rightKeys]}}`,
    );
}

// ============================================================

section('buildDualCanvasSEConfigs — size parameter');

const { leftConfig: lcSz, rightConfig: rcSz } = buildDualCanvasSEConfigs(
    'mov',
    'or',
    false,
    true,
    false,
    0.42,
);
assert(lcSz.size === 0.42, 'left config gets passed size');
assert(rcSz.size === 0.42, 'right config gets passed size');

// ============================================================

section('buildDualCanvasSEConfigs — earlyResolve parameter');

const { leftConfig: lcEr, rightConfig: rcEr } = buildDualCanvasSEConfigs(
    'mov',
    'or',
    true,
    true,
    false,
    TEST_SIZE,
);
assert(lcEr.earlyResolve === true, 'left config gets earlyResolve true');
assert(rcEr.earlyResolve === true, 'right config gets earlyResolve true');
const { leftConfig: lcNoEr, rightConfig: rcNoEr } = buildDualCanvasSEConfigs(
    'mov',
    'or',
    false,
    true,
    false,
    TEST_SIZE,
);
assert(lcNoEr.earlyResolve === false, 'left config gets earlyResolve false');
assert(rcNoEr.earlyResolve === false, 'right config gets earlyResolve false');

// ============================================================
// extractDualCanvasResponse tests
// New signature: (t1Data, t2Data, t1GoOnset, t2GoOnset, t1Config, t2Config)
// ============================================================

section('extractDualCanvasResponse — both correct on first press');

const t1GoOnset = 200;
const t2GoOnset = 600; // includes SOA offset

const result1 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 900, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
assert(result1.accuracy1 === 'correct', 'T1: correct on first press');
assert(result1.accuracy2 === 'correct', 'T2: correct on first press');
assert(result1.rt1_raw === 500, 'T1: rt1_raw = 500');
assert(result1.rt2_raw === 900, 'T2: rt2_raw = 900');
assert(result1.rt1 === 300, 'T1: rt1 = 500 - 200 = 300');
assert(result1.rt2 === 300, 'T2: rt2 = 900 - 600 = 300');
assert(result1.responseOrder === 'T1-first', 'T1 responded first');

// ============================================================

section('extractDualCanvasResponse — corrected response');

const result2 = extractDualCanvasResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'a', time: 550, isCorrect: true },
        ],
    },
    { keyPresses: [{ key: 'j', time: 900, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
assert(result2.accuracy1 === 'corrected', 'T1: corrected after error');
assert(result2.accuracy2 === 'correct', 'T2: correct on first press');
assert(result2.rt1_raw === 550, 'T1: rt1_raw from correct press');
assert(result2.rt1 === 350, 'T1: rt1 = 550 - 200 = 350');

// ============================================================

section('extractDualCanvasResponse — error (no correct response)');

const result3 = extractDualCanvasResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'd', time: 600, isCorrect: false },
        ],
    },
    { keyPresses: [{ key: 'l', time: 900, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
assert(result3.accuracy1 === 'error', 'T1: error (only wrong keys)');
assert(result3.rt1_raw === null, 'T1: no rt1_raw on error');
assert(result3.rt1 === null, 'T1: no rt1 on error');
assert(result3.accuracy2 === 'correct', 'T2: still correct');
assert(result3.responseOrder === null, 'no responseOrder when one is missed');

// ============================================================

section('extractDualCanvasResponse — miss (no keypresses)');

const result4 = extractDualCanvasResponse(
    { keyPresses: [] },
    { keyPresses: [{ key: 'j', time: 800, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
assert(result4.accuracy1 === 'miss', 'T1: miss (no keypresses)');
assert(result4.accuracy2 === 'correct', 'T2: correct');
assert(result4.rt1 === null, 'T1: no rt1 on miss');
assert(result4.responseOrder === null, 'no responseOrder when one is missed');

// ============================================================

section('extractDualCanvasResponse — both miss');

const result5 = extractDualCanvasResponse(
    { keyPresses: [] },
    { keyPresses: [] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
assert(result5.accuracy1 === 'miss', 'T1: miss');
assert(result5.accuracy2 === 'miss', 'T2: miss');
assert(result5.rt1 === null, 'no rt1');
assert(result5.rt2 === null, 'no rt2');
assert(result5.responseOrder === null, 'no responseOrder');

// ============================================================

section('extractDualCanvasResponse — response reversal (T2 first)');

const result6 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 1000, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 700, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
assert(result6.responseOrder === 'T2-first', 'T2 responded before T1');
assert(result6.rt1_raw === 1000, 'rt1_raw is 1000');
assert(result6.rt2_raw === 700, 'rt2_raw is 700');

// ============================================================

section('extractDualCanvasResponse — simultaneous responses');

const result7 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 800, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 800, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
// Equal timestamps: rt2_raw - rt1_raw = 0, which is NOT > 0, so T2-first
assert(result7.responseOrder === 'T2-first', 'equal timestamps -> T2-first by convention');

// ============================================================

section('extractDualCanvasResponse — rawKeyPresses format');

const result8 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 900, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
const parsed = JSON.parse(result8.rawKeyPresses);
assert(parsed.t1 !== undefined, 'rawKeyPresses has t1');
assert(parsed.t2 !== undefined, 'rawKeyPresses has t2');
assert(parsed.t1.length === 1, 't1 has 1 keypress');
assert(parsed.t2.length === 1, 't2 has 1 keypress');

// ============================================================

section('extractDualCanvasResponse — RT at timestamp 0');

// Edge case: response at exactly time 0 (should not be treated as null)
const result9 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 0, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 0, isCorrect: true }] },
    0,
    0,
    NO_ACCEPT_FIRST,
    NO_ACCEPT_FIRST,
);
assert(result9.rt1_raw === 0, 'rt1_raw is 0 (not null)');
assert(result9.rt2_raw === 0, 'rt2_raw is 0 (not null)');
assert(result9.rt1 === 0, 'rt1 is 0');
assert(result9.rt2 === 0, 'rt2 is 0');
assert(result9.responseOrder !== null, 'responseOrder computed even at time 0');

// ============================================================
// buildAlternatingSEConfig tests
// ============================================================

section('buildAlternatingSEConfig — left side, mov task');

const altLC1 = buildAlternatingSEConfig('mov', 'left', true, true, false, TEST_SIZE);
assert(altLC1.movementKeyMap[180] === 'a', 'left mov: 180 -> a');
assert(altLC1.movementKeyMap[0] === 'd', 'left mov: 0 -> d');
assert(altLC1.orientationKeyMap[180] === '!', 'left or: dummy');
assert(altLC1.orientationKeyMap[0] === '!', 'left or: dummy');
assert(altLC1.earlyResolve === true, 'earlyResolve is true');

// ============================================================

section('buildAlternatingSEConfig — left side, or task');

const altLC2 = buildAlternatingSEConfig('or', 'left', true, true, false, TEST_SIZE);
assert(altLC2.orientationKeyMap[180] === 'a', 'left or: 180 -> a');
assert(altLC2.orientationKeyMap[0] === 'd', 'left or: 0 -> d');
assert(altLC2.movementKeyMap[180] === '!', 'left mov: dummy');
assert(altLC2.movementKeyMap[0] === '!', 'left mov: dummy');

// ============================================================

section('buildAlternatingSEConfig — right side, mov task');

const altRC1 = buildAlternatingSEConfig('mov', 'right', false, true, false, TEST_SIZE);
assert(altRC1.movementKeyMap[180] === 'j', 'right mov: 180 -> j');
assert(altRC1.movementKeyMap[0] === 'l', 'right mov: 0 -> l');
assert(altRC1.orientationKeyMap[180] === '!', 'right or: dummy');
assert(altRC1.earlyResolve === false, 'earlyResolve is false');

// ============================================================

section('buildAlternatingSEConfig — right side, or task');

const altRC2 = buildAlternatingSEConfig('or', 'right', true, true, false, TEST_SIZE);
assert(altRC2.orientationKeyMap[180] === 'j', 'right or: 180 -> j');
assert(altRC2.orientationKeyMap[0] === 'l', 'right or: 0 -> l');
assert(altRC2.movementKeyMap[180] === '!', 'right mov: dummy');

// ============================================================

section('buildAlternatingSEConfig — disjoint keys across sides');

const allAltConfigs = [
    [
        buildAlternatingSEConfig('mov', 'left', true, true, false, TEST_SIZE),
        buildAlternatingSEConfig('mov', 'right', true, true, false, TEST_SIZE),
    ],
    [
        buildAlternatingSEConfig('or', 'left', true, true, false, TEST_SIZE),
        buildAlternatingSEConfig('or', 'right', true, true, false, TEST_SIZE),
    ],
    [
        buildAlternatingSEConfig('mov', 'left', true, true, false, TEST_SIZE),
        buildAlternatingSEConfig('or', 'right', true, true, false, TEST_SIZE),
    ],
    [
        buildAlternatingSEConfig('or', 'left', true, true, false, TEST_SIZE),
        buildAlternatingSEConfig('mov', 'right', true, true, false, TEST_SIZE),
    ],
];

for (const [leftCfg, rightCfg] of allAltConfigs) {
    const leftKeys = new Set(
        [
            ...Object.values(leftCfg.movementKeyMap),
            ...Object.values(leftCfg.orientationKeyMap),
        ].filter((k) => k !== '!'),
    );
    const rightKeys = new Set(
        [
            ...Object.values(rightCfg.movementKeyMap),
            ...Object.values(rightCfg.orientationKeyMap),
        ].filter((k) => k !== '!'),
    );
    const overlap = [...leftKeys].filter((k) => rightKeys.has(k));
    assert(
        overlap.length === 0,
        `no real key overlap: left={${[...leftKeys]}} right={${[...rightKeys]}}`,
    );
}

// ============================================================

section('buildAlternatingSEConfig — size parameter');

const altSz = buildAlternatingSEConfig('mov', 'left', true, true, false, 0.37);
assert(altSz.size === 0.37, 'config gets passed size');

// ============================================================
// extractAlternatingResponse tests
// ============================================================

// RT is measured from the imperative stimulus, which meta now carries. (It used
// to come from seParams.start_go_1, but the go signal opens with the cue.)
const altTrial = {
    seParams: {},
    meta: { t1_stim_onset: 200, t2_stim_onset: null },
};

section('extractAlternatingResponse — correct on first press');

const altRes1 = extractAlternatingResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    altTrial,
    NO_ACCEPT_FIRST,
);
assert(altRes1.accuracy1 === 'correct', 'correct on first press');
assert(altRes1.rt1_raw === 500, 'rt1_raw = 500');
assert(altRes1.rt1 === 300, 'rt1 = 500 - 200 = 300');
assert(altRes1.rt2 === null, 'rt2 is null (single task)');
assert(altRes1.accuracy2 === null, 'accuracy2 is null');
assert(altRes1.rt2_raw === null, 'rt2_raw is null');

// ============================================================

section('extractAlternatingResponse — corrected response');

const altRes2 = extractAlternatingResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'a', time: 550, isCorrect: true },
        ],
    },
    altTrial,
    NO_ACCEPT_FIRST,
);
assert(altRes2.accuracy1 === 'corrected', 'corrected after error');
assert(altRes2.rt1_raw === 550, 'rt1_raw from correct press');
assert(altRes2.rt1 === 350, 'rt1 = 550 - 200 = 350');

// ============================================================

section('extractAlternatingResponse — error (no correct response)');

const altRes3 = extractAlternatingResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'd', time: 600, isCorrect: false },
        ],
    },
    altTrial,
    NO_ACCEPT_FIRST,
);
assert(altRes3.accuracy1 === 'error', 'error (only wrong keys)');
assert(altRes3.rt1_raw === null, 'no rt1_raw on error');
assert(altRes3.rt1 === null, 'no rt1 on error');

// ============================================================

section('extractAlternatingResponse — miss (no keypresses)');

const altRes4 = extractAlternatingResponse({ keyPresses: [] }, altTrial, NO_ACCEPT_FIRST);
assert(altRes4.accuracy1 === 'miss', 'miss (no keypresses)');
assert(altRes4.rt1_raw === null, 'no rt1_raw on miss');
assert(altRes4.rt1 === null, 'no rt1 on miss');

// ============================================================

section('extractAlternatingResponse — rawKeyPresses format');

const altRes5 = extractAlternatingResponse(
    {
        keyPresses: [
            { key: 'a', time: 500, isCorrect: true },
            { key: 'd', time: 700, isCorrect: false },
        ],
    },
    altTrial,
    NO_ACCEPT_FIRST,
);
const altParsed = JSON.parse(altRes5.rawKeyPresses);
assert(Array.isArray(altParsed), 'rawKeyPresses is a JSON array');
assert(altParsed.length === 2, 'rawKeyPresses has 2 entries');

// ============================================================
// buildSEConfig tests
// ============================================================

section('buildSEConfig — disjoint RSO');

const disjointConfig = buildSEConfig('disjoint');
assert(disjointConfig.movementKeyMap[180] === 'a', 'disjoint: mov 180 -> a');
assert(disjointConfig.movementKeyMap[0] === 'd', 'disjoint: mov 0 -> d');
assert(disjointConfig.orientationKeyMap[180] === 'j', 'disjoint: or 180 -> j');
assert(disjointConfig.orientationKeyMap[0] === 'l', 'disjoint: or 0 -> l');
assert(disjointConfig.size === 0.75, 'disjoint: size 0.75');
// Verify keys are actually disjoint
const dMovKeys = Object.values(disjointConfig.movementKeyMap);
const dOrKeys = Object.values(disjointConfig.orientationKeyMap);
const dOverlap = dMovKeys.filter((k) => dOrKeys.includes(k));
assert(dOverlap.length === 0, 'disjoint: no key overlap');

// ============================================================

section('buildSEConfig — identical RSO');

const identicalConfig = buildSEConfig('identical');
assert(identicalConfig.movementKeyMap[180] === 'a', 'identical: mov 180 -> a');
assert(identicalConfig.movementKeyMap[0] === 'd', 'identical: mov 0 -> d');
assert(identicalConfig.orientationKeyMap[180] === 'a', 'identical: or 180 -> a');
assert(identicalConfig.orientationKeyMap[0] === 'd', 'identical: or 0 -> d');
// Verify keys ARE the same (identical RSO)
const iMovKeys = Object.values(identicalConfig.movementKeyMap);
const iOrKeys = Object.values(identicalConfig.orientationKeyMap);
assert(
    iMovKeys.every((k, i) => k === iOrKeys[i]),
    'identical: mov and or keys match',
);

// ============================================================

section('buildSEConfig — earlyResolve parameter');

const erConfig = buildSEConfig('disjoint', true);
assert(erConfig.earlyResolve === true, 'buildSEConfig passes earlyResolve true');
const noErConfig = buildSEConfig('disjoint', false);
assert(noErConfig.earlyResolve === false, 'buildSEConfig passes earlyResolve false');
const defaultErConfig = buildSEConfig('disjoint');
assert(
    defaultErConfig.earlyResolve === undefined,
    'buildSEConfig earlyResolve undefined when omitted',
);

// ============================================================
// buildKeyTaskMap tests
// ============================================================

section('buildKeyTaskMap — disjoint RSO returns key sets');

const disjointSEConfig = buildSEConfig('disjoint');
const movTrial = { meta: { t1_task: 'mov' } };
const keyMap1 = buildKeyTaskMap(disjointSEConfig, movTrial);
assert(keyMap1 !== null, 'disjoint: returns non-null');
assert(keyMap1.task1Keys.includes('a'), 'disjoint mov trial: T1 keys include a');
assert(keyMap1.task1Keys.includes('d'), 'disjoint mov trial: T1 keys include d');
assert(keyMap1.task2Keys.includes('j'), 'disjoint mov trial: T2 keys include j');
assert(keyMap1.task2Keys.includes('l'), 'disjoint mov trial: T2 keys include l');

const orTrial = { meta: { t1_task: 'or' } };
const keyMap2 = buildKeyTaskMap(disjointSEConfig, orTrial);
assert(keyMap2.task1Keys.includes('j'), 'disjoint or trial: T1 keys include j');
assert(keyMap2.task1Keys.includes('l'), 'disjoint or trial: T1 keys include l');
assert(keyMap2.task2Keys.includes('a'), 'disjoint or trial: T2 keys include a');
assert(keyMap2.task2Keys.includes('d'), 'disjoint or trial: T2 keys include d');

// ============================================================

section('buildKeyTaskMap — identical RSO returns null');

const identicalSEConfig = buildSEConfig('identical');
const keyMap3 = buildKeyTaskMap(identicalSEConfig, movTrial);
assert(keyMap3 === null, 'identical RSO: returns null');

// ============================================================
// classifyMappingError tests (the training-hint detector)
// ============================================================

section('classifyMappingError — names the error a hint should respond to');

// disjoint maps: mov = a(180)/d(0), or = j(180)/l(0). Trial fields are flat, as
// runTrial merges them. Presses land after the 500 ms onset unless stated.
const mkTrial = (over) => ({
    t1_task: 'mov',
    t1_target_dir: 0, // correct mov key is 'd'
    t1_distractor_dir: null,
    t1_stim_onset: 500,
    paradigm: 'single-task',
    rawKeyPresses: '[]',
    ...over,
});
const presses = (arr) =>
    JSON.stringify(arr.map(([key, time]) => ({ key, time, isCorrect: false })));

assert(
    classifyMappingError(
        mkTrial({ t1_task: 'or', t1_target_dir: 0, rawKeyPresses: presses([['a', 900]]) }),
        disjointSEConfig,
    ) === 'wrong-set',
    'other hand keys -> wrong-set',
);
assert(
    classifyMappingError(mkTrial({ rawKeyPresses: presses([['a', 900]]) }), disjointSEConfig) ===
        'reversal',
    'right hand, opposite direction, no distractor -> reversal',
);
assert(
    classifyMappingError(
        mkTrial({ t1_distractor_dir: 0, rawKeyPresses: presses([['a', 900]]) }),
        disjointSEConfig,
    ) === 'reversal',
    'congruent distractor still counts as reversal',
);
assert(
    classifyMappingError(
        mkTrial({ t1_distractor_dir: 180, rawKeyPresses: presses([['a', 900]]) }),
        disjointSEConfig,
    ) === 'distractor',
    'incongruent, press matches distractor direction -> distractor (not reversal)',
);
assert(
    classifyMappingError(
        mkTrial({
            t1_task: 'or',
            t1_target_dir: 0, // correct or key is 'l'
            t1_distractor_dir: 180,
            rawKeyPresses: presses([['j', 900]]), // j = or 180 = distractor direction
        }),
        disjointSEConfig,
    ) === 'distractor',
    'distractor-tracking on the other task -> distractor',
);
assert(
    classifyMappingError(mkTrial({ rawKeyPresses: presses([['d', 900]]) }), disjointSEConfig) ===
        null,
    'correct key -> null',
);
assert(
    classifyMappingError(mkTrial({ rawKeyPresses: presses([['a', 100]]) }), disjointSEConfig) ===
        null,
    'a press before onset is ignored',
);
const dualTrial = (over) =>
    mkTrial({ paradigm: 'dual-task', t2_task: 'or', responseOrder: 'T1-first', ...over });
assert(
    classifyMappingError(dualTrial({ responseOrder: 'T2-first' }), disjointSEConfig) === 'order',
    'dual-task, T2 answered first -> order',
);
assert(
    classifyMappingError(
        dualTrial({ responseOrder: 'T2-first', t1_task: 'or', t2_task: 'mov' }),
        disjointSEConfig,
    ) === 'order',
    'dual-task reversal is caught whichever task is T1',
);
assert(
    classifyMappingError(dualTrial({}), disjointSEConfig) === null,
    'dual-task, answered in order -> null',
);
assert(
    classifyMappingError(dualTrial({ responseOrder: null }), disjointSEConfig) === null,
    'dual-task with a missed response has no order -> null',
);
assert(
    classifyMappingError(dualTrial({ rawKeyPresses: presses([['a', 900]]) }), disjointSEConfig) ===
        null,
    'dual-task: a wrong key is left to the criterion, not read as a single-task mapping error',
);
assert(
    classifyMappingError(dualTrial({ responseOrder: 'T2-first' }), identicalSEConfig) === null,
    'dual-task with identical maps: order is not observable -> null',
);
assert(
    classifyMappingError(mkTrial({ rawKeyPresses: presses([['a', 900]]) }), identicalSEConfig) ===
        null,
    'identical maps: hand and direction are inseparable -> null',
);

// ============================================================
// extractResponse tests (the single-canvas response extractor)
// ============================================================

// --- Single-task extractResponse tests ---

section('extractResponse — single-task correct');

const stTrial = {
    seParams: {},
    meta: { paradigm: 'single-task', t1_task: 'mov', t1_stim_onset: 200, t2_stim_onset: null },
};
const stRes1 = extractResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    stTrial,
    identicalSEConfig,
);
assert(stRes1.accuracy1 === 'correct', 'single-task: correct');
assert(stRes1.rt1_raw === 500, 'single-task: rt1_raw = 500');
assert(stRes1.rt1 === 300, 'single-task: rt1 = 300');
assert(stRes1.accuracy2 === null, 'single-task: accuracy2 null');
assert(stRes1.rt2 === null, 'single-task: rt2 null');
assert(stRes1.responseOrder === null, 'single-task: no responseOrder');

// ============================================================

section('extractResponse — single-task corrected');

const stRes2 = extractResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'a', time: 600, isCorrect: true },
        ],
    },
    stTrial,
    identicalSEConfig,
);
assert(stRes2.accuracy1 === 'corrected', 'single-task corrected');
assert(stRes2.rt1_raw === 600, 'single-task corrected: rt1_raw from correct press');

// ============================================================

section('extractResponse — single-task error');

const stRes3 = extractResponse(
    { keyPresses: [{ key: 'd', time: 400, isCorrect: false }] },
    stTrial,
    identicalSEConfig,
);
assert(stRes3.accuracy1 === 'error', 'single-task error');
assert(stRes3.rt1_raw === null, 'single-task error: no rt1_raw');

// ============================================================

section('extractResponse — single-task miss');

const stRes4 = extractResponse({ keyPresses: [] }, stTrial, identicalSEConfig);
assert(stRes4.accuracy1 === 'miss', 'single-task miss');
assert(stRes4.rt1_raw === null, 'single-task miss: no rt1_raw');

// --- Disjoint RSO dual-task extractResponse tests ---

section('extractResponse — disjoint RSO dual-task: normal order');

const dtTrial = {
    seParams: {},
    meta: {
        paradigm: 'dual-task',
        t1_task: 'mov',
        t2_task: 'or',
        t1_stim_onset: 200,
        t2_stim_onset: 400,
    },
};
const dtRes1 = extractResponse(
    {
        keyPresses: [
            { key: 'a', time: 500, isCorrect: true },
            { key: 'j', time: 800, isCorrect: true },
        ],
    },
    dtTrial,
    disjointSEConfig,
);
assert(dtRes1.accuracy1 === 'correct', 'disjoint dual: T1 correct');
assert(dtRes1.accuracy2 === 'correct', 'disjoint dual: T2 correct');
assert(dtRes1.rt1 === 300, 'disjoint dual: rt1 = 500 - 200');
assert(dtRes1.rt2 === 400, 'disjoint dual: rt2 = 800 - 400');
assert(dtRes1.responseOrder === 'T1-first', 'disjoint dual: T1 first');

// ============================================================

section('extractResponse — disjoint RSO dual-task: response reversal (T2 before T1)');

const dtRes2 = extractResponse(
    {
        keyPresses: [
            { key: 'j', time: 500, isCorrect: true }, // T2 key answered first
            { key: 'a', time: 800, isCorrect: true }, // T1 key answered second
        ],
    },
    dtTrial,
    disjointSEConfig,
);
assert(dtRes2.accuracy1 === 'correct', 'reversal: T1 correct (by key, not order)');
assert(dtRes2.accuracy2 === 'correct', 'reversal: T2 correct (by key, not order)');
assert(dtRes2.rt1_raw === 800, 'reversal: rt1_raw = 800 (T1 key answered later)');
assert(dtRes2.rt2_raw === 500, 'reversal: rt2_raw = 500 (T2 key answered earlier)');
assert(dtRes2.responseOrder === 'T2-first', 'reversal: T2 first');

// ============================================================

section('extractResponse — disjoint RSO dual-task: T1 error then T2 correct');

const dtRes3 = extractResponse(
    {
        keyPresses: [
            { key: 'd', time: 300, isCorrect: false }, // T1 error
            { key: 'j', time: 600, isCorrect: true }, // T2 correct
            { key: 'a', time: 900, isCorrect: true }, // T1 corrected
        ],
    },
    dtTrial,
    disjointSEConfig,
);
assert(dtRes3.accuracy1 === 'corrected', 'disjoint: T1 corrected');
assert(dtRes3.accuracy2 === 'correct', 'disjoint: T2 correct');
assert(dtRes3.rt1_raw === 900, 'disjoint: T1 rt from corrected press');
assert(dtRes3.rt2_raw === 600, 'disjoint: T2 rt from first correct');

// ============================================================

section('extractResponse — disjoint RSO dual-task: T2 error then correct');

const dtRes4 = extractResponse(
    {
        keyPresses: [
            { key: 'a', time: 400, isCorrect: true }, // T1 correct
            { key: 'l', time: 600, isCorrect: false }, // T2 error
            { key: 'j', time: 800, isCorrect: true }, // T2 corrected
        ],
    },
    dtTrial,
    disjointSEConfig,
);
assert(dtRes4.accuracy1 === 'correct', 'disjoint T2 error: T1 correct');
assert(dtRes4.accuracy2 === 'corrected', 'disjoint T2 error: T2 corrected');
assert(dtRes4.rt2_raw === 800, 'disjoint T2 error: T2 rt from corrected press');

// ============================================================

section('extractResponse — disjoint RSO dual-task: both miss');

const dtRes5 = extractResponse({ keyPresses: [] }, dtTrial, disjointSEConfig);
assert(dtRes5.accuracy1 === 'miss', 'disjoint both miss: T1 miss');
assert(dtRes5.accuracy2 === 'miss', 'disjoint both miss: T2 miss');
assert(dtRes5.responseOrder === null, 'disjoint both miss: no responseOrder');

// --- Identical RSO dual-task extractResponse tests (temporal ordering fallback) ---

section('extractResponse — identical RSO dual-task: temporal ordering');

const dtIdenticalTrial = {
    seParams: {},
    meta: {
        paradigm: 'dual-task',
        t1_task: 'mov',
        t2_task: 'or',
        t1_stim_onset: 200,
        t2_stim_onset: 400,
    },
};
const dtIdRes1 = extractResponse(
    {
        keyPresses: [
            { key: 'a', time: 500, isCorrect: true }, // 1st correct → T1
            { key: 'd', time: 800, isCorrect: true }, // 2nd correct → T2
        ],
    },
    dtIdenticalTrial,
    identicalSEConfig,
);
assert(dtIdRes1.accuracy1 === 'correct', 'identical RSO: T1 correct (1st correct press)');
assert(dtIdRes1.accuracy2 === 'correct', 'identical RSO: T2 correct (2nd correct press)');
assert(dtIdRes1.rt1 === 300, 'identical RSO: rt1 = 500 - 200');
assert(dtIdRes1.rt2 === 400, 'identical RSO: rt2 = 800 - 400');
assert(dtIdRes1.responseOrder === 'T1-first', 'identical RSO: T1 first');

// ============================================================

section('extractResponse — identical RSO dual-task: error before T1');

const dtIdRes2 = extractResponse(
    {
        keyPresses: [
            { key: 'a', time: 300, isCorrect: false }, // error → hadError1
            { key: 'd', time: 500, isCorrect: true }, // 1st correct → T1 corrected
            { key: 'a', time: 800, isCorrect: true }, // 2nd correct → T2
        ],
    },
    dtIdenticalTrial,
    identicalSEConfig,
);
assert(dtIdRes2.accuracy1 === 'corrected', 'identical RSO error: T1 corrected');
assert(dtIdRes2.accuracy2 === 'correct', 'identical RSO error: T2 correct');
assert(dtIdRes2.rt1_raw === 500, 'identical RSO error: T1 rt from corrected press');
assert(dtIdRes2.rt2_raw === 800, 'identical RSO error: T2 rt');

// ============================================================

section('extractResponse — identical RSO dual-task: error between T1 and T2');

const dtIdRes3 = extractResponse(
    {
        keyPresses: [
            { key: 'a', time: 400, isCorrect: true }, // 1st correct → T1
            { key: 'd', time: 600, isCorrect: false }, // error → hadError2
            { key: 'a', time: 800, isCorrect: true }, // 2nd correct → T2
        ],
    },
    dtIdenticalTrial,
    identicalSEConfig,
);
assert(dtIdRes3.accuracy1 === 'correct', 'identical error between: T1 correct');
assert(
    dtIdRes3.accuracy2 === 'corrected',
    'identical error between: T2 corrected (error preceded correct)',
);
assert(dtIdRes3.rt2_raw === 800, 'identical error between: T2 rt');

// ============================================================

section('extractResponse — identical RSO dual-task: all errors, no correct');

const dtIdRes4 = extractResponse(
    {
        keyPresses: [
            { key: 'd', time: 300, isCorrect: false },
            { key: 'a', time: 500, isCorrect: false },
        ],
    },
    dtIdenticalTrial,
    identicalSEConfig,
);
assert(dtIdRes4.accuracy1 === 'error', 'identical all errors: accuracy1 error');
// Errors stay in T1 bucket because rt1_raw is never set — T2 stays 'miss'
assert(
    dtIdRes4.accuracy2 === 'miss',
    'identical all errors: accuracy2 stays miss (errors dont spill)',
);
assert(dtIdRes4.rt1 === null, 'identical all errors: rt1 null');
assert(dtIdRes4.rt2 === null, 'identical all errors: rt2 null');

// ============================================================

section('extractAlternatingResponse — response at time 0');

const altTrialZero = {
    seParams: {},
    meta: { t1_stim_onset: 0, t2_stim_onset: null },
};
const altResZero = extractAlternatingResponse(
    { keyPresses: [{ key: 'a', time: 0, isCorrect: true }] },
    altTrialZero,
    NO_ACCEPT_FIRST,
);
assert(altResZero.rt1_raw === 0, 'time 0: rt1_raw is 0 (not null)');
assert(altResZero.rt1 === 0, 'time 0: rt1 is 0');
assert(altResZero.accuracy1 === 'correct', 'time 0: correct');

// ============================================================
section('extractSingleStreamResponse — anticipations before stimulus onset');

// The regression this guards: acceptFirstResponse used to take the very first
// keypress no matter when it arrived. On a dual-canvas trial the T2 canvas is
// blank for one whole SOA, so a twitch in that window became the T2 response
// with a NEGATIVE rt, and the participant's real answer was discarded.
const antEarly = extractSingleStreamResponse(
    [
        { key: 'j', time: 300, isCorrect: false },
        { key: 'l', time: 900, isCorrect: true },
    ],
    600,
    true,
);
assert(antEarly.anticipations === 1, 'pre-stimulus press counted as an anticipation');
assert(
    antEarly.rt_raw === 900,
    'acceptFirstResponse skips the anticipation and takes the real press',
);
assert(antEarly.rt === 300, 'rt measured from the stimulus, not the anticipation');
assert(antEarly.accuracy === 'correct', 'anticipation does not mark the trial an error');

// Same stream without acceptFirstResponse: the anticipation must not count as an
// error either, so accuracy stays 'correct' rather than 'corrected'.
const antStrict = extractSingleStreamResponse(
    [
        { key: 'j', time: 300, isCorrect: false },
        { key: 'l', time: 900, isCorrect: true },
    ],
    600,
    false,
);
assert(antStrict.anticipations === 1, 'strict mode also counts the anticipation');
assert(antStrict.accuracy === 'correct', 'strict mode: anticipation is not a within-window error');

// A genuine post-stimulus error still behaves exactly as before.
const antRealError = extractSingleStreamResponse(
    [
        { key: 'j', time: 700, isCorrect: false },
        { key: 'l', time: 900, isCorrect: true },
    ],
    600,
    false,
);
assert(antRealError.anticipations === 0, 'post-stimulus press is not an anticipation');
assert(antRealError.accuracy === 'corrected', 'post-stimulus error still yields corrected');

// Nothing but anticipations = no response at all.
const antOnly = extractSingleStreamResponse([{ key: 'j', time: 100, isCorrect: false }], 600, true);
assert(antOnly.anticipations === 1, 'lone anticipation counted');
assert(antOnly.rt_raw === null, 'lone anticipation leaves rt null');
assert(antOnly.accuracy === 'miss', 'lone anticipation scores as a miss, not an error');

// RTs can never come out negative now.
for (const onset of [0, 200, 600]) {
    const r = extractSingleStreamResponse(
        [
            { key: 'a', time: 50, isCorrect: true },
            { key: 'a', time: 5000, isCorrect: true },
        ],
        onset,
        true,
    );
    assert(r.rt === null || r.rt >= 0, `no negative rt for stimulus onset ${onset}`);
}

// ============================================================

section('extractResponse — empty keyPresses object (undefined)');

const stResUndef = extractResponse({}, stTrial, identicalSEConfig);
assert(stResUndef.accuracy1 === 'miss', 'undefined keyPresses: miss');
assert(stResUndef.rt1 === null, 'undefined keyPresses: rt1 null');

// ============================================================

section('extractResponse — single-task ignores extra correct presses');

const stResExtra = extractResponse(
    {
        keyPresses: [
            { key: 'a', time: 400, isCorrect: true },
            { key: 'd', time: 600, isCorrect: true },
        ],
    },
    stTrial,
    identicalSEConfig,
);
assert(stResExtra.rt1_raw === 400, 'extra presses: rt1 from first correct');
assert(stResExtra.accuracy2 === null, 'extra presses: accuracy2 still null (single-task)');

// ============================================================
// extractSingleStreamResponse tests
// ============================================================

section('extractSingleStreamResponse — correct on first press');

const ssRes1 = extractSingleStreamResponse([{ key: 'a', time: 500, isCorrect: true }], 200);
assert(ssRes1.accuracy === 'correct', 'correct on first press');
assert(ssRes1.rt_raw === 500, 'rt_raw = 500');
assert(ssRes1.rt === 300, 'rt = 500 - 200 = 300');
assert(ssRes1.consumedCount === 1, 'consumed 1 keypress');

// ============================================================

section('extractSingleStreamResponse — corrected');

const ssRes2 = extractSingleStreamResponse(
    [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'a', time: 550, isCorrect: true },
    ],
    200,
);
assert(ssRes2.accuracy === 'corrected', 'corrected after error');
assert(ssRes2.rt_raw === 550, 'rt_raw from correct press');
assert(ssRes2.rt === 350, 'rt = 550 - 200');
assert(ssRes2.consumedCount === 2, 'consumed 2 keypresses');

// ============================================================

section('extractSingleStreamResponse — error (no correct)');

const ssRes3 = extractSingleStreamResponse(
    [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'd', time: 600, isCorrect: false },
    ],
    200,
);
assert(ssRes3.accuracy === 'error', 'error (only wrong keys)');
assert(ssRes3.rt_raw === null, 'no rt_raw');
assert(ssRes3.rt === null, 'no rt');
assert(ssRes3.consumedCount === 2, 'consumed all keypresses');

// ============================================================

section('extractSingleStreamResponse — miss (empty array)');

const ssRes4 = extractSingleStreamResponse([], 200);
assert(ssRes4.accuracy === 'miss', 'miss (no keypresses)');
assert(ssRes4.rt_raw === null, 'no rt_raw');
assert(ssRes4.rt === null, 'no rt');
assert(ssRes4.consumedCount === 0, 'consumed 0');

// ============================================================

section('extractSingleStreamResponse — correct at time 0');

const ssRes5 = extractSingleStreamResponse([{ key: 'a', time: 0, isCorrect: true }], 0);
assert(ssRes5.rt_raw === 0, 'rt_raw is 0 (not null)');
assert(ssRes5.rt === 0, 'rt is 0');
assert(ssRes5.accuracy === 'correct', 'correct at time 0');

// ============================================================

section('extractSingleStreamResponse — ignores keypresses after first correct');

const ssRes6 = extractSingleStreamResponse(
    [
        { key: 'a', time: 400, isCorrect: true },
        { key: 'd', time: 600, isCorrect: false },
        { key: 'a', time: 800, isCorrect: true },
    ],
    200,
);
assert(ssRes6.rt_raw === 400, 'rt_raw from first correct');
assert(ssRes6.accuracy === 'correct', 'correct (ignores later presses)');
assert(ssRes6.consumedCount === 1, 'consumed only up to first correct');

// ============================================================
// acceptFirstResponse tests — extractSingleStreamResponse
// ============================================================

section('extractSingleStreamResponse — acceptFirstResponse: correct on first press');

const afrRes1 = extractSingleStreamResponse([{ key: 'a', time: 500, isCorrect: true }], 200, true);
assert(afrRes1.accuracy === 'correct', 'acceptFirst: correct on first press');
assert(afrRes1.rt_raw === 500, 'acceptFirst: rt_raw = 500');
assert(afrRes1.rt === 300, 'acceptFirst: rt = 300');
assert(afrRes1.consumedCount === 1, 'acceptFirst: consumed 1');

// ============================================================

section('extractSingleStreamResponse — acceptFirstResponse: error on first press');

const afrRes2 = extractSingleStreamResponse(
    [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'a', time: 600, isCorrect: true },
    ],
    200,
    true,
);
assert(afrRes2.accuracy === 'error', 'acceptFirst error: takes first wrong press');
assert(afrRes2.rt_raw === 400, 'acceptFirst error: rt_raw from wrong press');
assert(afrRes2.rt === 200, 'acceptFirst error: rt = 400 - 200');
assert(afrRes2.consumedCount === 1, 'acceptFirst error: consumed only 1');

// ============================================================

section('extractSingleStreamResponse — acceptFirstResponse: miss (empty)');

const afrRes3 = extractSingleStreamResponse([], 200, true);
assert(afrRes3.accuracy === 'miss', 'acceptFirst miss: still miss on empty');
assert(afrRes3.rt_raw === null, 'acceptFirst miss: no rt_raw');
assert(afrRes3.consumedCount === 0, 'acceptFirst miss: consumed 0');

// ============================================================

section('extractSingleStreamResponse — acceptFirstResponse: single wrong press');

const afrRes4 = extractSingleStreamResponse([{ key: 'd', time: 400, isCorrect: false }], 200, true);
assert(afrRes4.accuracy === 'error', 'acceptFirst single wrong: error');
assert(afrRes4.rt_raw === 400, 'acceptFirst single wrong: rt_raw set');
assert(afrRes4.rt === 200, 'acceptFirst single wrong: rt = 400 - 200');
assert(afrRes4.consumedCount === 1, 'acceptFirst single wrong: consumed 1');

// ============================================================
// acceptFirstResponse tests — higher-level extractors
// ============================================================

section('extractResponse — single-task acceptFirstResponse: error on first press');

const stAfrConfig = buildSEConfig('identical', false, true, true);
const stAfrRes = extractResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'a', time: 600, isCorrect: true },
        ],
    },
    stTrial,
    stAfrConfig,
);
assert(stAfrRes.accuracy1 === 'error', 'single-task acceptFirst: error on first press');
assert(stAfrRes.rt1_raw === 400, 'single-task acceptFirst: rt_raw from wrong press');
assert(stAfrRes.rt1 === 200, 'single-task acceptFirst: rt1 = 400 - 200');

// ============================================================

section('extractAlternatingResponse — acceptFirstResponse: error on first press');

const altAfrRes = extractAlternatingResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'a', time: 600, isCorrect: true },
        ],
    },
    altTrial,
    ACCEPT_FIRST,
);
assert(altAfrRes.accuracy1 === 'error', 'alt acceptFirst: error on first press');
assert(altAfrRes.rt1_raw === 400, 'alt acceptFirst: rt_raw from wrong press');
assert(altAfrRes.rt1 === 200, 'alt acceptFirst: rt1 = 400 - 200');

// ============================================================

section('extractDualCanvasResponse — acceptFirstResponse: error on first press');

const dcAfrRes = extractDualCanvasResponse(
    {
        keyPresses: [
            { key: 'd', time: 400, isCorrect: false },
            { key: 'a', time: 600, isCorrect: true },
        ],
    },
    { keyPresses: [{ key: 'j', time: 900, isCorrect: true }] },
    t1GoOnset,
    t2GoOnset,
    ACCEPT_FIRST,
    ACCEPT_FIRST,
);
assert(dcAfrRes.accuracy1 === 'error', 'dc acceptFirst: T1 error on first press');
assert(dcAfrRes.rt1_raw === 400, 'dc acceptFirst: T1 rt_raw from wrong press');
assert(dcAfrRes.accuracy2 === 'correct', 'dc acceptFirst: T2 correct');

// ============================================================
// feedback and acceptFirstResponse builder tests
// ============================================================

section('buildSEConfig — feedback and acceptFirstResponse parameters');

const fbConfig = buildSEConfig('disjoint', false, true, false);
assert(fbConfig.feedback === true, 'buildSEConfig: feedback true');
assert(fbConfig.acceptFirstResponse === false, 'buildSEConfig: acceptFirstResponse false');

const fbConfig2 = buildSEConfig('disjoint', false, false, true);
assert(fbConfig2.feedback === false, 'buildSEConfig: feedback false');
assert(fbConfig2.acceptFirstResponse === true, 'buildSEConfig: acceptFirstResponse true');

// ============================================================

section('buildSEConfig — cueBorderStyle parameter');

const testMovKeyMap = { 180: 'a', 0: 'd' };
const testOrKeyMap = { 180: 'j', 0: 'l' };

const solidConfig = buildSEConfig(
    'disjoint',
    false,
    true,
    true,
    { mov: testMovKeyMap, or: testOrKeyMap },
    'hue',
    'solid',
);
assert(
    solidConfig.cueBorderStyle === 'solid',
    'buildSEConfig: cueBorderStyle solid passed explicitly',
);

const defaultKeyMapConfig = buildSEConfig('disjoint', false, true, true, {
    mov: testMovKeyMap,
    or: testOrKeyMap,
});
assert(
    defaultKeyMapConfig.cueBorderStyle === 'solid',
    'buildSEConfig: keyMaps config defaults cueBorderStyle to solid',
);

const defaultIdenticalConfig = buildSEConfig('identical');
assert(
    defaultIdenticalConfig.cueBorderStyle === 'segmented',
    'buildSEConfig: identical RSO defaults to segmented',
);

// ============================================================

section('buildDualCanvasSEConfigs — feedback and acceptFirstResponse parameters');

const { leftConfig: lcFb, rightConfig: rcFb } = buildDualCanvasSEConfigs(
    'mov',
    'or',
    false,
    true,
    false,
    TEST_SIZE,
);
assert(lcFb.feedback === true, 'dual: left feedback true');
assert(lcFb.acceptFirstResponse === false, 'dual: left acceptFirstResponse false');
assert(rcFb.feedback === true, 'dual: right feedback true');
assert(rcFb.acceptFirstResponse === false, 'dual: right acceptFirstResponse false');

const { leftConfig: lcFb2, rightConfig: rcFb2 } = buildDualCanvasSEConfigs(
    'mov',
    'or',
    false,
    false,
    true,
    TEST_SIZE,
);
assert(lcFb2.feedback === false, 'dual: left feedback false');
assert(lcFb2.acceptFirstResponse === true, 'dual: left acceptFirstResponse true');

// ============================================================

section('buildAlternatingSEConfig — feedback and acceptFirstResponse parameters');

const altFbConfig = buildAlternatingSEConfig('mov', 'left', true, true, false, TEST_SIZE);
assert(altFbConfig.feedback === true, 'alt: feedback true');
assert(altFbConfig.acceptFirstResponse === false, 'alt: acceptFirstResponse false');

const altFbConfig2 = buildAlternatingSEConfig('mov', 'left', true, false, true, TEST_SIZE);
assert(altFbConfig2.feedback === false, 'alt: feedback false');
assert(altFbConfig2.acceptFirstResponse === true, 'alt: acceptFirstResponse true');

// ============================================================
// drawSequenceIds — the sequence-pool draw
// ============================================================

section('drawSequenceIds — determinism');

// The whole reason the draw is seeded: a participant who refreshes mid-session
// must get the same five blocks, or a partly-saved session and its retry could
// overlap or duplicate blocks.
const drawA = drawSequenceIds('participant-xyz|cp_stroop|A', 50, 5);
const drawA2 = drawSequenceIds('participant-xyz|cp_stroop|A', 50, 5);
assert(drawA.join() === drawA2.join(), 'the same seed key yields the same draw, in the same order');
assert(
    drawSequenceIds('participant-xyz|cp_stroop|B', 50, 5).join() !== drawA.join(),
    'a different condition draws differently — one id reused across cells is not one draw',
);
assert(
    drawSequenceIds('someone-else|cp_stroop|A', 50, 5).join() !== drawA.join(),
    'a different participant draws differently',
);

section('drawSequenceIds — distinctness and range');

// Distinctness is the invariant: running one pool block twice doubles every cell
// of its design for that participant and contaminates repetition effects, and the
// exported CSV looks entirely normal.
let allDistinct = true;
let allInRange = true;
for (let i = 0; i < 2000; i++) {
    const draw = drawSequenceIds(`pid-${i}|cp_taskswitch|A`, 50, 5);
    if (draw.length !== 5 || new Set(draw).size !== 5) allDistinct = false;
    if (!draw.every((id) => Number.isInteger(id) && id >= 1 && id <= 50)) allInRange = false;
}
assert(allDistinct, '2000 draws are each 5 DISTINCT ids');
assert(allInRange, '2000 draws stay within [1, poolSize] and are integers');

// A draw of the whole pool is a permutation — the strongest available check that
// the partial shuffle neither drops nor repeats an id.
const whole = drawSequenceIds('seed', 12, 12);
assert(
    new Set(whole).size === 12 && Math.min(...whole) === 1 && Math.max(...whole) === 12,
    'drawing the entire pool yields a permutation of 1..poolSize',
);

section('drawSequenceIds — coverage');

// A draw that always started from the same corner of the pool would be
// deterministic AND distinct while still using only a handful of blocks.
const used = new Set();
for (let i = 0; i < 500; i++) {
    for (const id of drawSequenceIds(`pid-${i}|cp_prp|A`, 50, 5)) used.add(id);
}
assert(
    used.size === 50,
    `500 participants between them use every block in the pool (used ${used.size}/50)`,
);

section('drawSequenceIds — refusals');

const drawThrows = (fn, message) => {
    let threw = false;
    try {
        fn();
    } catch (e) {
        threw = true;
    }
    assert(threw, message);
};
drawThrows(
    () => drawSequenceIds('seed', 4, 5),
    'drawing more blocks than the pool holds throws instead of repeating one',
);
drawThrows(() => drawSequenceIds('', 50, 5), 'an empty seed key is refused');
drawThrows(() => drawSequenceIds(null, 50, 5), 'a null seed key is refused');
drawThrows(() => drawSequenceIds('seed', 0, 5), 'a pool size of 0 is refused');
drawThrows(() => drawSequenceIds('seed', 50, 0), 'a draw count of 0 is refused');
drawThrows(() => drawSequenceIds('seed', 50.5, 5), 'a non-integer pool size is refused');

// ============================================================
section('fourcueSingleTaskKeyMaps — 2x2 hand routing');
// The cued task takes the cued hand's vertical keys; the other task takes the
// other hand's, so buildSEConfig places the cue on the cued side and a wrong-hand
// press still lands in a real key map. Covers all four color x side combos.
{
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const W = { 90: 'w', 270: 's' }; // left-hand vertical
    const I = { 90: 'i', 270: 'k' }; // right-hand vertical

    let km = fourcueSingleTaskKeyMaps('mov', 'left');
    assert(eq(km.mov, W) && eq(km.or, I), 'mov+left: mov on left (W/S), or on right (I/K)');
    assert(seHandSideOf(km.mov) === 'left', 'mov+left: cue side left');

    km = fourcueSingleTaskKeyMaps('mov', 'right');
    assert(eq(km.mov, I) && eq(km.or, W), 'mov+right: mov on right (I/K), or on left (W/S)');
    assert(seHandSideOf(km.mov) === 'right', 'mov+right: cue side right');

    km = fourcueSingleTaskKeyMaps('or', 'left');
    assert(eq(km.or, W) && eq(km.mov, I), 'or+left: or on left (W/S), mov on right (I/K)');
    assert(seHandSideOf(km.or) === 'left', 'or+left: cue side left');

    km = fourcueSingleTaskKeyMaps('or', 'right');
    assert(eq(km.or, I) && eq(km.mov, W), 'or+right: or on right (I/K), mov on left (W/S)');
    assert(seHandSideOf(km.or) === 'right', 'or+right: cue side right');

    // The two maps are always disjoint (distinct fingers), so a wrong-hand press
    // is a scorable error rather than an unmatched (dropped) key.
    const all = fourcueSingleTaskKeyMaps('mov', 'left');
    const movK = Object.values(all.mov),
        orK = Object.values(all.or);
    assert(!movK.some((k) => orK.includes(k)), 'fourcue single-task maps are disjoint');
}

// ============================================================
// createBreakController — capped break's mash-proof advance (08-18 l.12-13)
// ============================================================

section('createBreakController — deliberate advance, mash-proof');
{
    // A single press only ARMS; it never advances (Sebastian: "confirm another
    // time so that they don't accidentally press anything").
    let c = createBreakController();
    assert(c.press('Enter', 1000) === 'armed', 'first Enter arms');
    assert(c.armed === true, 'armed flag set after first press');
    assert(c.press('Enter', 2000) === 'advance', 'second Enter (after debounce) advances');

    // Only the advance key counts — mashing arbitrary keys does nothing. This is
    // the whole difference from showInstructions' any-key dismissal.
    c = createBreakController();
    for (const k of ['a', 'd', ' ', 'Escape', 'j', 'l', 'Shift', 'ArrowLeft']) {
        assert(c.press(k, 1000) === 'ignored', `key '${k}' is ignored, not an advance`);
    }
    assert(c.armed === false, 'a burst of wrong keys never arms');

    // Auto-repeat (a held key) is ignored: holding Enter cannot arm-then-confirm.
    c = createBreakController();
    assert(c.press('Enter', 1000, true) === 'ignored', 'held-key repeat does not arm');
    assert(c.armed === false, 'repeat leaves the controller idle');
    assert(c.press('Enter', 1000, false) === 'armed', 'a real (non-repeat) press then arms');

    // A second keydown that fires too soon after arming (a bounced/double-fired
    // physical press) is refused, so one press cannot arm AND confirm. Uses an
    // explicit confirmMinMs so the test does not depend on the module default.
    c = createBreakController({ confirmMinMs: 250 });
    assert(c.press('Enter', 1000) === 'armed', 'arm at t=1000');
    assert(c.press('Enter', 1010) === 'ignored', 'confirm 10 ms later is too soon');
    assert(c.press('Enter', 1250) === 'advance', 'confirm past the debounce advances');

    // A custom advance key is honored, and Enter no longer counts under it.
    c = createBreakController({ advanceKey: ' ' });
    assert(c.press('Enter', 1000) === 'ignored', 'non-advance key ignored under custom advanceKey');
    assert(c.press(' ', 1000) === 'armed', 'the configured advance key arms');
    assert(c.press(' ', 2000) === 'advance', 'and confirms');

    // A wrong key while armed does not disarm, and does not advance.
    c = createBreakController();
    c.press('Enter', 1000);
    assert(c.press('x', 1500) === 'ignored', 'stray key while armed is ignored');
    assert(c.armed === true, 'stray key does not disarm');
    assert(c.press('Enter', 2000) === 'advance', 'confirm still works after a stray key');
}

// ============================================================
section('isFourcueSingleTaskBlock');
{
    const fourcueCfg = { cueMode: 'hue+position', paradigm: 'single-task' };
    const disjointCfg = { cueMode: 'hue', paradigm: 'single-task' };

    assert(
        isFourcueSingleTaskBlock(fourcueCfg, 'single-canvas') === true,
        'fourcue + single-canvas -> true',
    );
    assert(
        isFourcueSingleTaskBlock(disjointCfg, 'single-canvas') === false,
        'disjoint cueMode -> false regardless of canvasType',
    );
    assert(
        isFourcueSingleTaskBlock(fourcueCfg, 'dual-canvas') === false,
        'dual-canvas excluded even with fourcue cueMode',
    );
    assert(isFourcueSingleTaskBlock(fourcueCfg, 'alternating') === false, 'alternating excluded');
    assert(isFourcueSingleTaskBlock(fourcueCfg, 'prp-baseline') === false, 'prp-baseline excluded');
    assert(
        isFourcueSingleTaskBlock({ ...fourcueCfg, paradigm: 'dual-task' }, 'single-canvas') ===
            false,
        'dual-task paradigm excluded (task-tied hands) even on single-canvas layout',
    );
}

// ============================================================
section('deriveTargetCoherenceFields');
{
    // Single-canvas: T1 on channel 1, T2 on channel 2 of the SAME params object.
    const scParams = { coh_mov_1: 0.7, coh_or_2: 0.4 };
    const scFields = deriveTargetCoherenceFields('mov', 'or', scParams, scParams, 'single-task');
    assert(scFields.t1_target_coherence === 0.7, 'single-canvas: t1 reads channel 1');
    assert(scFields.t2_target_coherence === 0.4, 'single-canvas: t2 reads channel 2 (_2 suffix)');

    // Dual-canvas: T1 and T2 are each their own canvas's channel 1.
    const dcT1Params = { coh_mov_1: 0.6 };
    const dcT2Params = { coh_or_1: 0.3 };
    const dcFields = deriveTargetCoherenceFields(
        'mov',
        'or',
        dcT1Params,
        dcT2Params,
        'dual-canvas',
    );
    assert(dcFields.t1_target_coherence === 0.6, 'dual-canvas: t1 reads its own channel 1');
    assert(
        dcFields.t2_target_coherence === 0.3,
        'dual-canvas: t2 reads ITS canvas channel 1 (_1 suffix, not _2)',
    );

    // task_1/task_2 falsy (prp-baseline's null T1, single-task's null T2):
    // the corresponding key must be OMITTED, not set to undefined.
    const nullT1Fields = deriveTargetCoherenceFields(null, 'or', scParams, scParams, 'single-task');
    assert(!('t1_target_coherence' in nullT1Fields), 'null task_1: key omitted entirely');
    assert(nullT1Fields.t2_target_coherence === 0.4, 'null task_1: t2 field still derived');

    const nullT2Fields = deriveTargetCoherenceFields(
        'mov',
        null,
        scParams,
        scParams,
        'single-task',
    );
    assert(nullT2Fields.t1_target_coherence === 0.7, 'null task_2: t1 field still derived');
    assert(!('t2_target_coherence' in nullT2Fields), 'null task_2: key omitted entirely');

    // Ramp/QUEST-override interaction: runBlock writes its override into
    // t1Params['coh_<task_1>_1'] BEFORE calling this function, so a value
    // written there (simulating rampedCoherence/quest.getNextIntensity) must
    // be what gets logged, not some pre-override value.
    const overriddenParams = { coh_mov_1: 0.15 }; // e.g. rampedCoherence's early-ramp value
    const overriddenFields = deriveTargetCoherenceFields(
        'mov',
        null,
        overriddenParams,
        overriddenParams,
        'single-task',
    );
    assert(
        overriddenFields.t1_target_coherence === 0.15,
        'reads the post-override coherence value (ramp/QUEST write-then-read preserved)',
    );
}

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
