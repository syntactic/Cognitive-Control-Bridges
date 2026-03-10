/**
 * Tests for session.js dual-canvas functions.
 *
 * Run: node test_session.js
 *
 * The session.js functions live inside an IIFE and can't be imported directly.
 * This file redefines the pure functions (no DOM/SE dependencies) and tests
 * their logic independently. If the function signatures or logic change in
 * session.js, these copies must be updated to match.
 */

// ============================================================
// Test harness (same as test_engine.js)
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

// ============================================================
// Function copies (must match session.js implementations)
// ============================================================

// Note: the real buildDualCanvasSEConfigs in session.js computes size dynamically
// via computeDualCanvasSize() (requires DOM). This test copy uses a fixed placeholder
// size since we're testing key mapping logic, not canvas sizing.
const TEST_SIZE = 0.5;

function buildDualCanvasSEConfigs(leftTask, rightTask) {
    let leftConfig = {} , rightConfig = {};
    const leftHandHorizontalMapping = { 180: 'a', 0: 'd'};
    const rightHandHorizontalMapping = { 180: 'j', 0: 'l'};
    const dummyMapping = { 180: '!', 0: '!'};
    if (leftTask === 'mov') {
        leftConfig = {'movementKeyMap': { ...leftHandHorizontalMapping }, 'orientationKeyMap': dummyMapping, size: TEST_SIZE };
    } else {
        leftConfig = {'orientationKeyMap': { ...leftHandHorizontalMapping }, 'movementKeyMap': dummyMapping, size: TEST_SIZE };
    }
    if (rightTask === 'mov') {
        rightConfig = {'movementKeyMap': { ...rightHandHorizontalMapping }, 'orientationKeyMap': dummyMapping, size: TEST_SIZE };
    } else {
        rightConfig = {'orientationKeyMap': { ...rightHandHorizontalMapping }, 'movementKeyMap': dummyMapping, size: TEST_SIZE };
    }
    return { leftConfig, rightConfig };
}

function extractDualCanvasResponse(leftData, rightData, trial) {
    let leftResponse, rightResponse;
    let accuracy1 = 'miss', accuracy2 = 'miss';
    for (let i = 0; i < leftData.keyPresses.length; i++) {
        if (leftData.keyPresses[i].isCorrect) {
            leftResponse = leftData.keyPresses[i];
            accuracy1 = (i === 0) ? 'correct' : 'corrected';
            break;
        }
    }
    if (accuracy1 === 'miss' && leftData.keyPresses.length > 0) {
        accuracy1 = 'error';
    }

    for (let i = 0; i < rightData.keyPresses.length; i++) {
        if (rightData.keyPresses[i].isCorrect) {
            rightResponse = rightData.keyPresses[i];
            accuracy2 = (i === 0) ? 'correct' : 'corrected';
            break;
        }
    }
    if (accuracy2 === 'miss' && rightData.keyPresses.length > 0) {
        accuracy2 = 'error';
    }

    let rt1_raw = null, rt2_raw = null, rt1 = null, rt2 = null;
    if (leftResponse != null) {
        rt1_raw = leftResponse.time;
        rt1 = rt1_raw - trial.leftSeParams.start_go_1;
    }
    if (rightResponse != null) {
        rt2_raw = rightResponse.time;
        rt2 = rt2_raw - trial.rightSeParams.start_go_1;
    }
    let responseOrder = null;
    if (rt1_raw !== null && rt2_raw !== null) {
        responseOrder = (rt2_raw - rt1_raw > 0) ? 'T1-first' : 'T2-first';
    }
    return { rt1, rt1_raw, accuracy1, rt2, rt2_raw, accuracy2, responseOrder,
        rawKeyPresses: JSON.stringify({ left: leftData.keyPresses, right: rightData.keyPresses }) };
}

// ============================================================
// buildDualCanvasSEConfigs tests
// ============================================================

section('buildDualCanvasSEConfigs — cross-type (mov + or)');

const { leftConfig: lc1, rightConfig: rc1 } = buildDualCanvasSEConfigs('mov', 'or');
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

const { leftConfig: lc2, rightConfig: rc2 } = buildDualCanvasSEConfigs('or', 'mov');
assert(lc2.orientationKeyMap[180] === 'a', 'left or: 180 -> a');
assert(lc2.orientationKeyMap[0] === 'd', 'left or: 0 -> d');
assert(lc2.movementKeyMap[180] === '!', 'left mov: dummy');
assert(rc2.movementKeyMap[180] === 'j', 'right mov: 180 -> j');
assert(rc2.movementKeyMap[0] === 'l', 'right mov: 0 -> l');
assert(rc2.orientationKeyMap[180] === '!', 'right or: dummy');

// ============================================================

section('buildDualCanvasSEConfigs — same-type (mov + mov)');

const { leftConfig: lc3, rightConfig: rc3 } = buildDualCanvasSEConfigs('mov', 'mov');
assert(lc3.movementKeyMap[180] === 'a', 'left mov: 180 -> a');
assert(lc3.movementKeyMap[0] === 'd', 'left mov: 0 -> d');
assert(rc3.movementKeyMap[180] === 'j', 'right mov: 180 -> j');
assert(rc3.movementKeyMap[0] === 'l', 'right mov: 0 -> l');
// Both orientation maps are dummy
assert(lc3.orientationKeyMap[180] === '!', 'left or: dummy');
assert(rc3.orientationKeyMap[180] === '!', 'right or: dummy');

// ============================================================

section('buildDualCanvasSEConfigs — same-type (or + or)');

const { leftConfig: lc4, rightConfig: rc4 } = buildDualCanvasSEConfigs('or', 'or');
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
    buildDualCanvasSEConfigs('mov', 'or'),
    buildDualCanvasSEConfigs('or', 'mov'),
    buildDualCanvasSEConfigs('mov', 'mov'),
    buildDualCanvasSEConfigs('or', 'or'),
];

for (const { leftConfig, rightConfig } of allConfigs) {
    const leftKeys = new Set([
        ...Object.values(leftConfig.movementKeyMap),
        ...Object.values(leftConfig.orientationKeyMap),
    ].filter(k => k !== '!'));
    const rightKeys = new Set([
        ...Object.values(rightConfig.movementKeyMap),
        ...Object.values(rightConfig.orientationKeyMap),
    ].filter(k => k !== '!'));
    const overlap = [...leftKeys].filter(k => rightKeys.has(k));
    assert(overlap.length === 0,
        `no real key overlap: left={${[...leftKeys]}} right={${[...rightKeys]}}`);
}

// ============================================================
// extractDualCanvasResponse tests
// ============================================================

section('extractDualCanvasResponse — both correct on first press');

const trial1 = {
    leftSeParams: { start_go_1: 200 },
    rightSeParams: { start_go_1: 600 },  // includes SOA offset
};

const result1 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 900, isCorrect: true }] },
    trial1
);
assert(result1.accuracy1 === 'correct', 'left: correct on first press');
assert(result1.accuracy2 === 'correct', 'right: correct on first press');
assert(result1.rt1_raw === 500, 'left: rt1_raw = 500');
assert(result1.rt2_raw === 900, 'right: rt2_raw = 900');
assert(result1.rt1 === 300, 'left: rt1 = 500 - 200 = 300');
assert(result1.rt2 === 300, 'right: rt2 = 900 - 600 = 300');
assert(result1.responseOrder === 'T1-first', 'T1 responded first');

// ============================================================

section('extractDualCanvasResponse — corrected response');

const result2 = extractDualCanvasResponse(
    { keyPresses: [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'a', time: 550, isCorrect: true },
    ]},
    { keyPresses: [{ key: 'j', time: 900, isCorrect: true }] },
    trial1
);
assert(result2.accuracy1 === 'corrected', 'left: corrected after error');
assert(result2.accuracy2 === 'correct', 'right: correct on first press');
assert(result2.rt1_raw === 550, 'left: rt1_raw from correct press');
assert(result2.rt1 === 350, 'left: rt1 = 550 - 200 = 350');

// ============================================================

section('extractDualCanvasResponse — error (no correct response)');

const result3 = extractDualCanvasResponse(
    { keyPresses: [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'd', time: 600, isCorrect: false },
    ]},
    { keyPresses: [{ key: 'l', time: 900, isCorrect: true }] },
    trial1
);
assert(result3.accuracy1 === 'error', 'left: error (only wrong keys)');
assert(result3.rt1_raw === null, 'left: no rt1_raw on error');
assert(result3.rt1 === null, 'left: no rt1 on error');
assert(result3.accuracy2 === 'correct', 'right: still correct');
assert(result3.responseOrder === null, 'no responseOrder when one is missed');

// ============================================================

section('extractDualCanvasResponse — miss (no keypresses)');

const result4 = extractDualCanvasResponse(
    { keyPresses: [] },
    { keyPresses: [{ key: 'j', time: 800, isCorrect: true }] },
    trial1
);
assert(result4.accuracy1 === 'miss', 'left: miss (no keypresses)');
assert(result4.accuracy2 === 'correct', 'right: correct');
assert(result4.rt1 === null, 'left: no rt1 on miss');
assert(result4.responseOrder === null, 'no responseOrder when one is missed');

// ============================================================

section('extractDualCanvasResponse — both miss');

const result5 = extractDualCanvasResponse(
    { keyPresses: [] },
    { keyPresses: [] },
    trial1
);
assert(result5.accuracy1 === 'miss', 'left: miss');
assert(result5.accuracy2 === 'miss', 'right: miss');
assert(result5.rt1 === null, 'no rt1');
assert(result5.rt2 === null, 'no rt2');
assert(result5.responseOrder === null, 'no responseOrder');

// ============================================================

section('extractDualCanvasResponse — response reversal (T2 first)');

const result6 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 1000, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 700, isCorrect: true }] },
    trial1
);
assert(result6.responseOrder === 'T2-first', 'T2 responded before T1');
assert(result6.rt1_raw === 1000, 'rt1_raw is 1000');
assert(result6.rt2_raw === 700, 'rt2_raw is 700');

// ============================================================

section('extractDualCanvasResponse — simultaneous responses');

const result7 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 800, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 800, isCorrect: true }] },
    trial1
);
// Equal timestamps: rt2_raw - rt1_raw = 0, which is NOT > 0, so T2-first
assert(result7.responseOrder === 'T2-first', 'equal timestamps -> T2-first by convention');

// ============================================================

section('extractDualCanvasResponse — rawKeyPresses format');

const result8 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 900, isCorrect: true }] },
    trial1
);
const parsed = JSON.parse(result8.rawKeyPresses);
assert(parsed.left !== undefined, 'rawKeyPresses has left');
assert(parsed.right !== undefined, 'rawKeyPresses has right');
assert(parsed.left.length === 1, 'left has 1 keypress');
assert(parsed.right.length === 1, 'right has 1 keypress');

// ============================================================

section('extractDualCanvasResponse — RT at timestamp 0');

// Edge case: response at exactly time 0 (should not be treated as null)
const trialZero = {
    leftSeParams: { start_go_1: 0 },
    rightSeParams: { start_go_1: 0 },
};
const result9 = extractDualCanvasResponse(
    { keyPresses: [{ key: 'a', time: 0, isCorrect: true }] },
    { keyPresses: [{ key: 'j', time: 0, isCorrect: true }] },
    trialZero
);
assert(result9.rt1_raw === 0, 'rt1_raw is 0 (not null)');
assert(result9.rt2_raw === 0, 'rt2_raw is 0 (not null)');
assert(result9.rt1 === 0, 'rt1 is 0');
assert(result9.rt2 === 0, 'rt2 is 0');
assert(result9.responseOrder !== null, 'responseOrder computed even at time 0');

// ============================================================
// buildAlternatingSEConfig tests
// ============================================================

// Note: the real buildAlternatingSEConfig in session.js computes size dynamically
// via computeDualCanvasSize() (requires DOM). This test copy uses a fixed placeholder.
function buildAlternatingSEConfig(task, side, earlyResolve) {
    const dummyMapping = { 180: '!', 0: '!'};
    let horizontalMapping;
    if (side === 'left') {
        horizontalMapping = { 180: 'a', 0: 'd' };
    } else {
        horizontalMapping = { 180: 'j', 0: 'l' };
    }
    let seConfig;
    if (task === 'mov') {
        seConfig = { movementKeyMap: { ...horizontalMapping }, orientationKeyMap: { ...dummyMapping }, size: TEST_SIZE, earlyResolve: earlyResolve };
    } else {
        seConfig = { movementKeyMap: { ...dummyMapping }, orientationKeyMap: { ...horizontalMapping }, size: TEST_SIZE, earlyResolve: earlyResolve };
    }
    return seConfig;
}

function extractAlternatingResponse(data, trial) {
    let response;
    let accuracy1 = 'miss';
    for (let i = 0; i < data.keyPresses.length; i++) {
        if (data.keyPresses[i].isCorrect) {
            response = data.keyPresses[i];
            accuracy1 = (i === 0) ? 'correct' : 'corrected';
            break;
        }
    }
    if (accuracy1 === 'miss' && data.keyPresses.length > 0) {
        accuracy1 = 'error';
    }
    let rt1_raw = null, rt1 = null;
    if (response != null) {
        rt1_raw = response.time;
        rt1 = rt1_raw - trial.seParams.start_go_1;
    }
    return { rt1, rt1_raw, accuracy1, rt2: null, rt2_raw: null, accuracy2: null, rawKeyPresses: JSON.stringify(data.keyPresses) };
}

// ============================================================

section('buildAlternatingSEConfig — left side, mov task');

const altLC1 = buildAlternatingSEConfig('mov', 'left', true);
assert(altLC1.movementKeyMap[180] === 'a', 'left mov: 180 -> a');
assert(altLC1.movementKeyMap[0] === 'd', 'left mov: 0 -> d');
assert(altLC1.orientationKeyMap[180] === '!', 'left or: dummy');
assert(altLC1.orientationKeyMap[0] === '!', 'left or: dummy');
assert(altLC1.earlyResolve === true, 'earlyResolve is true');

// ============================================================

section('buildAlternatingSEConfig — left side, or task');

const altLC2 = buildAlternatingSEConfig('or', 'left', true);
assert(altLC2.orientationKeyMap[180] === 'a', 'left or: 180 -> a');
assert(altLC2.orientationKeyMap[0] === 'd', 'left or: 0 -> d');
assert(altLC2.movementKeyMap[180] === '!', 'left mov: dummy');
assert(altLC2.movementKeyMap[0] === '!', 'left mov: dummy');

// ============================================================

section('buildAlternatingSEConfig — right side, mov task');

const altRC1 = buildAlternatingSEConfig('mov', 'right', false);
assert(altRC1.movementKeyMap[180] === 'j', 'right mov: 180 -> j');
assert(altRC1.movementKeyMap[0] === 'l', 'right mov: 0 -> l');
assert(altRC1.orientationKeyMap[180] === '!', 'right or: dummy');
assert(altRC1.earlyResolve === false, 'earlyResolve is false');

// ============================================================

section('buildAlternatingSEConfig — right side, or task');

const altRC2 = buildAlternatingSEConfig('or', 'right', true);
assert(altRC2.orientationKeyMap[180] === 'j', 'right or: 180 -> j');
assert(altRC2.orientationKeyMap[0] === 'l', 'right or: 0 -> l');
assert(altRC2.movementKeyMap[180] === '!', 'right mov: dummy');

// ============================================================

section('buildAlternatingSEConfig — disjoint keys across sides');

const allAltConfigs = [
    [buildAlternatingSEConfig('mov', 'left', true), buildAlternatingSEConfig('mov', 'right', true)],
    [buildAlternatingSEConfig('or', 'left', true), buildAlternatingSEConfig('or', 'right', true)],
    [buildAlternatingSEConfig('mov', 'left', true), buildAlternatingSEConfig('or', 'right', true)],
    [buildAlternatingSEConfig('or', 'left', true), buildAlternatingSEConfig('mov', 'right', true)],
];

for (const [leftCfg, rightCfg] of allAltConfigs) {
    const leftKeys = new Set([
        ...Object.values(leftCfg.movementKeyMap),
        ...Object.values(leftCfg.orientationKeyMap),
    ].filter(k => k !== '!'));
    const rightKeys = new Set([
        ...Object.values(rightCfg.movementKeyMap),
        ...Object.values(rightCfg.orientationKeyMap),
    ].filter(k => k !== '!'));
    const overlap = [...leftKeys].filter(k => rightKeys.has(k));
    assert(overlap.length === 0,
        `no real key overlap: left={${[...leftKeys]}} right={${[...rightKeys]}}`);
}

// ============================================================
// extractAlternatingResponse tests
// ============================================================

const altTrial = {
    seParams: { start_go_1: 200 },
};

section('extractAlternatingResponse — correct on first press');

const altRes1 = extractAlternatingResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    altTrial
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
    { keyPresses: [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'a', time: 550, isCorrect: true },
    ]},
    altTrial
);
assert(altRes2.accuracy1 === 'corrected', 'corrected after error');
assert(altRes2.rt1_raw === 550, 'rt1_raw from correct press');
assert(altRes2.rt1 === 350, 'rt1 = 550 - 200 = 350');

// ============================================================

section('extractAlternatingResponse — error (no correct response)');

const altRes3 = extractAlternatingResponse(
    { keyPresses: [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'd', time: 600, isCorrect: false },
    ]},
    altTrial
);
assert(altRes3.accuracy1 === 'error', 'error (only wrong keys)');
assert(altRes3.rt1_raw === null, 'no rt1_raw on error');
assert(altRes3.rt1 === null, 'no rt1 on error');

// ============================================================

section('extractAlternatingResponse — miss (no keypresses)');

const altRes4 = extractAlternatingResponse(
    { keyPresses: [] },
    altTrial
);
assert(altRes4.accuracy1 === 'miss', 'miss (no keypresses)');
assert(altRes4.rt1_raw === null, 'no rt1_raw on miss');
assert(altRes4.rt1 === null, 'no rt1 on miss');

// ============================================================

section('extractAlternatingResponse — rawKeyPresses format');

const altRes5 = extractAlternatingResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }, { key: 'd', time: 700, isCorrect: false }] },
    altTrial
);
const altParsed = JSON.parse(altRes5.rawKeyPresses);
assert(Array.isArray(altParsed), 'rawKeyPresses is a JSON array');
assert(altParsed.length === 2, 'rawKeyPresses has 2 entries');

// ============================================================
// EXPANDED COVERAGE
// ============================================================

// ============================================================
// buildSEConfig tests
// ============================================================

// Local copy of buildSEConfig (pure function, no DOM dependency)
function buildSEConfig(rso) {
    if (rso === 'disjoint') {
        return {
            movementKeyMap: { 180: 'a', 0: 'd' },
            orientationKeyMap: { 180: 'j', 0: 'l' },
            size: 0.75
        };
    }
    return {
        movementKeyMap: { 180: 'a', 0: 'd' },
        orientationKeyMap: { 180: 'a', 0: 'd' },
        size: 0.75
    };
}

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
const dOverlap = dMovKeys.filter(k => dOrKeys.includes(k));
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
assert(iMovKeys.every((k, i) => k === iOrKeys[i]), 'identical: mov and or keys match');

// ============================================================
// buildKeyTaskMap tests
// ============================================================

// Local copy of buildKeyTaskMap
function buildKeyTaskMap(seConfig, trial) {
    const movKeys = Object.values(seConfig.movementKeyMap || {});
    const orKeys = Object.values(seConfig.orientationKeyMap || {});
    const isDisjoint = movKeys.length > 0 && orKeys.length > 0 &&
        !movKeys.some(k => orKeys.includes(k));
    if (!isDisjoint) return null;
    const task1 = trial.meta.task;
    const task1Keys = task1 === 'mov' ? movKeys : orKeys;
    const task2Keys = task1 === 'mov' ? orKeys : movKeys;
    return { task1Keys, task2Keys };
}

section('buildKeyTaskMap — disjoint RSO returns key sets');

const disjointSEConfig = buildSEConfig('disjoint');
const movTrial = { meta: { task: 'mov' } };
const keyMap1 = buildKeyTaskMap(disjointSEConfig, movTrial);
assert(keyMap1 !== null, 'disjoint: returns non-null');
assert(keyMap1.task1Keys.includes('a'), 'disjoint mov trial: T1 keys include a');
assert(keyMap1.task1Keys.includes('d'), 'disjoint mov trial: T1 keys include d');
assert(keyMap1.task2Keys.includes('j'), 'disjoint mov trial: T2 keys include j');
assert(keyMap1.task2Keys.includes('l'), 'disjoint mov trial: T2 keys include l');

const orTrial = { meta: { task: 'or' } };
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
// extractResponse tests (the single-canvas response extractor)
// ============================================================

// Local copy of extractResponse
function extractResponse(data, trial, seConfig) {
    const keyPresses = data.keyPresses || [];
    const isDualTask = trial.meta.paradigm === 'dual-task';
    let rt1_raw = null, rt2_raw = null;
    let accuracy1 = 'miss', accuracy2 = isDualTask ? 'miss' : null;
    let hadError1 = false, hadError2 = false;
    const keyMap = isDualTask ? buildKeyTaskMap(seConfig, trial) : null;
    if (keyMap) {
        for (const kp of keyPresses) {
            const isT1Key = keyMap.task1Keys.includes(kp.key);
            const isT2Key = keyMap.task2Keys.includes(kp.key);
            if (isT1Key) {
                if (kp.isCorrect && rt1_raw === null) {
                    rt1_raw = kp.time;
                    accuracy1 = hadError1 ? 'corrected' : 'correct';
                } else if (!kp.isCorrect && rt1_raw === null) {
                    hadError1 = true;
                    accuracy1 = 'error';
                }
            } else if (isT2Key) {
                if (kp.isCorrect && rt2_raw === null) {
                    rt2_raw = kp.time;
                    accuracy2 = hadError2 ? 'corrected' : 'correct';
                } else if (!kp.isCorrect && rt2_raw === null) {
                    hadError2 = true;
                    accuracy2 = 'error';
                }
            }
        }
    } else {
        for (const kp of keyPresses) {
            if (kp.isCorrect) {
                if (rt1_raw === null) {
                    rt1_raw = kp.time;
                    accuracy1 = hadError1 ? 'corrected' : 'correct';
                } else if (isDualTask && rt2_raw === null) {
                    rt2_raw = kp.time;
                    accuracy2 = 'correct';
                }
            } else {
                if (rt1_raw === null) {
                    hadError1 = true;
                    accuracy1 = 'error';
                } else if (isDualTask && rt2_raw === null) {
                    accuracy2 = 'error';
                }
            }
        }
    }
    const rt1 = rt1_raw !== null ? rt1_raw - trial.seParams.start_go_1 : null;
    const rt2 = (isDualTask && rt2_raw !== null) ? rt2_raw - trial.seParams.start_go_2 : null;
    return {
        rt1_raw, rt1, accuracy1, rt2_raw, rt2, accuracy2,
        responseOrder: (isDualTask && rt1_raw !== null && rt2_raw !== null)
            ? (rt1_raw <= rt2_raw ? 'T1-first' : 'T2-first') : null,
        rawKeyPresses: JSON.stringify(keyPresses),
    };
}

// --- Single-task extractResponse tests ---

section('extractResponse — single-task correct');

const stTrial = {
    seParams: { start_go_1: 200, start_go_2: 0 },
    meta: { paradigm: 'single-task', task: 'mov' },
};
const stRes1 = extractResponse(
    { keyPresses: [{ key: 'a', time: 500, isCorrect: true }] },
    stTrial, identicalSEConfig
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
    { keyPresses: [
        { key: 'd', time: 400, isCorrect: false },
        { key: 'a', time: 600, isCorrect: true },
    ]},
    stTrial, identicalSEConfig
);
assert(stRes2.accuracy1 === 'corrected', 'single-task corrected');
assert(stRes2.rt1_raw === 600, 'single-task corrected: rt1_raw from correct press');

// ============================================================

section('extractResponse — single-task error');

const stRes3 = extractResponse(
    { keyPresses: [{ key: 'd', time: 400, isCorrect: false }] },
    stTrial, identicalSEConfig
);
assert(stRes3.accuracy1 === 'error', 'single-task error');
assert(stRes3.rt1_raw === null, 'single-task error: no rt1_raw');

// ============================================================

section('extractResponse — single-task miss');

const stRes4 = extractResponse(
    { keyPresses: [] },
    stTrial, identicalSEConfig
);
assert(stRes4.accuracy1 === 'miss', 'single-task miss');
assert(stRes4.rt1_raw === null, 'single-task miss: no rt1_raw');

// --- Disjoint RSO dual-task extractResponse tests ---

section('extractResponse — disjoint RSO dual-task: normal order');

const dtTrial = {
    seParams: { start_go_1: 200, start_go_2: 400 },
    meta: { paradigm: 'dual-task', task: 'mov', task2: 'or' },
};
const dtRes1 = extractResponse(
    { keyPresses: [
        { key: 'a', time: 500, isCorrect: true },
        { key: 'j', time: 800, isCorrect: true },
    ]},
    dtTrial, disjointSEConfig
);
assert(dtRes1.accuracy1 === 'correct', 'disjoint dual: T1 correct');
assert(dtRes1.accuracy2 === 'correct', 'disjoint dual: T2 correct');
assert(dtRes1.rt1 === 300, 'disjoint dual: rt1 = 500 - 200');
assert(dtRes1.rt2 === 400, 'disjoint dual: rt2 = 800 - 400');
assert(dtRes1.responseOrder === 'T1-first', 'disjoint dual: T1 first');

// ============================================================

section('extractResponse — disjoint RSO dual-task: response reversal (T2 before T1)');

const dtRes2 = extractResponse(
    { keyPresses: [
        { key: 'j', time: 500, isCorrect: true },  // T2 key answered first
        { key: 'a', time: 800, isCorrect: true },  // T1 key answered second
    ]},
    dtTrial, disjointSEConfig
);
assert(dtRes2.accuracy1 === 'correct', 'reversal: T1 correct (by key, not order)');
assert(dtRes2.accuracy2 === 'correct', 'reversal: T2 correct (by key, not order)');
assert(dtRes2.rt1_raw === 800, 'reversal: rt1_raw = 800 (T1 key answered later)');
assert(dtRes2.rt2_raw === 500, 'reversal: rt2_raw = 500 (T2 key answered earlier)');
assert(dtRes2.responseOrder === 'T2-first', 'reversal: T2 first');

// ============================================================

section('extractResponse — disjoint RSO dual-task: T1 error then T2 correct');

const dtRes3 = extractResponse(
    { keyPresses: [
        { key: 'd', time: 300, isCorrect: false },  // T1 error
        { key: 'j', time: 600, isCorrect: true },   // T2 correct
        { key: 'a', time: 900, isCorrect: true },   // T1 corrected
    ]},
    dtTrial, disjointSEConfig
);
assert(dtRes3.accuracy1 === 'corrected', 'disjoint: T1 corrected');
assert(dtRes3.accuracy2 === 'correct', 'disjoint: T2 correct');
assert(dtRes3.rt1_raw === 900, 'disjoint: T1 rt from corrected press');
assert(dtRes3.rt2_raw === 600, 'disjoint: T2 rt from first correct');

// ============================================================

section('extractResponse — disjoint RSO dual-task: T2 error then correct');

const dtRes4 = extractResponse(
    { keyPresses: [
        { key: 'a', time: 400, isCorrect: true },   // T1 correct
        { key: 'l', time: 600, isCorrect: false },  // T2 error
        { key: 'j', time: 800, isCorrect: true },   // T2 corrected
    ]},
    dtTrial, disjointSEConfig
);
assert(dtRes4.accuracy1 === 'correct', 'disjoint T2 error: T1 correct');
assert(dtRes4.accuracy2 === 'corrected', 'disjoint T2 error: T2 corrected');
assert(dtRes4.rt2_raw === 800, 'disjoint T2 error: T2 rt from corrected press');

// ============================================================

section('extractResponse — disjoint RSO dual-task: both miss');

const dtRes5 = extractResponse(
    { keyPresses: [] },
    dtTrial, disjointSEConfig
);
assert(dtRes5.accuracy1 === 'miss', 'disjoint both miss: T1 miss');
assert(dtRes5.accuracy2 === 'miss', 'disjoint both miss: T2 miss');
assert(dtRes5.responseOrder === null, 'disjoint both miss: no responseOrder');

// --- Identical RSO dual-task extractResponse tests (temporal ordering fallback) ---

section('extractResponse — identical RSO dual-task: temporal ordering');

const dtIdenticalTrial = {
    seParams: { start_go_1: 200, start_go_2: 400 },
    meta: { paradigm: 'dual-task', task: 'mov', task2: 'or' },
};
const dtIdRes1 = extractResponse(
    { keyPresses: [
        { key: 'a', time: 500, isCorrect: true },  // 1st correct → T1
        { key: 'd', time: 800, isCorrect: true },  // 2nd correct → T2
    ]},
    dtIdenticalTrial, identicalSEConfig
);
assert(dtIdRes1.accuracy1 === 'correct', 'identical RSO: T1 correct (1st correct press)');
assert(dtIdRes1.accuracy2 === 'correct', 'identical RSO: T2 correct (2nd correct press)');
assert(dtIdRes1.rt1 === 300, 'identical RSO: rt1 = 500 - 200');
assert(dtIdRes1.rt2 === 400, 'identical RSO: rt2 = 800 - 400');
assert(dtIdRes1.responseOrder === 'T1-first', 'identical RSO: T1 first');

// ============================================================

section('extractResponse — identical RSO dual-task: error before T1');

const dtIdRes2 = extractResponse(
    { keyPresses: [
        { key: 'a', time: 300, isCorrect: false },  // error → hadError1
        { key: 'd', time: 500, isCorrect: true },   // 1st correct → T1 corrected
        { key: 'a', time: 800, isCorrect: true },   // 2nd correct → T2
    ]},
    dtIdenticalTrial, identicalSEConfig
);
assert(dtIdRes2.accuracy1 === 'corrected', 'identical RSO error: T1 corrected');
assert(dtIdRes2.accuracy2 === 'correct', 'identical RSO error: T2 correct');
assert(dtIdRes2.rt1_raw === 500, 'identical RSO error: T1 rt from corrected press');
assert(dtIdRes2.rt2_raw === 800, 'identical RSO error: T2 rt');

// ============================================================

section('extractResponse — identical RSO dual-task: error between T1 and T2');

const dtIdRes3 = extractResponse(
    { keyPresses: [
        { key: 'a', time: 400, isCorrect: true },   // 1st correct → T1
        { key: 'd', time: 600, isCorrect: false },  // error → hadError2
        { key: 'a', time: 800, isCorrect: true },   // 2nd correct → T2
    ]},
    dtIdenticalTrial, identicalSEConfig
);
assert(dtIdRes3.accuracy1 === 'correct', 'identical error between: T1 correct');
// Note: in the identical RSO path, errors between T1 and T2 set accuracy2 to 'error'
// but a subsequent correct press sets rt2 and accuracy2 to 'correct' (no 'corrected' tracking)
assert(dtIdRes3.accuracy2 === 'correct', 'identical error between: T2 correct (no corrected tracking in identical RSO)');
assert(dtIdRes3.rt2_raw === 800, 'identical error between: T2 rt');

// ============================================================

section('extractResponse — identical RSO dual-task: all errors, no correct');

const dtIdRes4 = extractResponse(
    { keyPresses: [
        { key: 'd', time: 300, isCorrect: false },
        { key: 'a', time: 500, isCorrect: false },
    ]},
    dtIdenticalTrial, identicalSEConfig
);
assert(dtIdRes4.accuracy1 === 'error', 'identical all errors: accuracy1 error');
// Errors stay in T1 bucket because rt1_raw is never set — T2 stays 'miss'
assert(dtIdRes4.accuracy2 === 'miss', 'identical all errors: accuracy2 stays miss (errors dont spill)');
assert(dtIdRes4.rt1 === null, 'identical all errors: rt1 null');
assert(dtIdRes4.rt2 === null, 'identical all errors: rt2 null');

// ============================================================

section('extractAlternatingResponse — response at time 0');

const altTrialZero = {
    seParams: { start_go_1: 0 },
};
const altResZero = extractAlternatingResponse(
    { keyPresses: [{ key: 'a', time: 0, isCorrect: true }] },
    altTrialZero
);
assert(altResZero.rt1_raw === 0, 'time 0: rt1_raw is 0 (not null)');
assert(altResZero.rt1 === 0, 'time 0: rt1 is 0');
assert(altResZero.accuracy1 === 'correct', 'time 0: correct');

// ============================================================

section('extractResponse — empty keyPresses object (undefined)');

const stResUndef = extractResponse(
    {},
    stTrial, identicalSEConfig
);
assert(stResUndef.accuracy1 === 'miss', 'undefined keyPresses: miss');
assert(stResUndef.rt1 === null, 'undefined keyPresses: rt1 null');

// ============================================================

section('extractResponse — single-task ignores extra correct presses');

const stResExtra = extractResponse(
    { keyPresses: [
        { key: 'a', time: 400, isCorrect: true },
        { key: 'd', time: 600, isCorrect: true },
    ]},
    stTrial, identicalSEConfig
);
assert(stResExtra.rt1_raw === 400, 'extra presses: rt1 from first correct');
assert(stResExtra.accuracy2 === null, 'extra presses: accuracy2 still null (single-task)');

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
