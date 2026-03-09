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
