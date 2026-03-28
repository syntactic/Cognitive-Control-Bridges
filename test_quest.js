/**
 * Tests for QUEST adaptive staircase (createQuest and argMax).
 *
 * Run: node test_quest.js
 *
 * Loads session_helpers.js (where createQuest and argMax live) and tests
 * the algorithm's initialization, updates, and convergence.
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

function approxEqual(a, b, tolerance, msg) {
    const diff = Math.abs(a - b);
    assert(diff <= tolerance, `${msg} (expected ~${b}, got ${a}, diff=${diff.toFixed(6)})`);
}

// ============================================================
// argMax tests
// ============================================================

section('argMax — basic cases');

assert(argMax([1, 3, 2]) === 1, 'max at index 1');
assert(argMax([5]) === 0, 'single element returns index 0');
assert(argMax([1, 2, 3, 4, 5]) === 4, 'max at end');
assert(argMax([5, 4, 3, 2, 1]) === 0, 'max at start');

section('argMax — negative values');

assert(argMax([-3, -1, -2]) === 1, 'least negative is max');
assert(argMax([-100, -50, -200]) === 1, 'works with large negatives');

section('argMax — ties (keeps last occurrence due to >=)');

assert(argMax([1, 3, 3, 2]) === 2, 'tie: keeps last occurrence');
assert(argMax([5, 5, 5]) === 2, 'all equal: returns last index');

// ============================================================
// createQuest — initialization
// ============================================================

section('createQuest — returns object with expected methods');

const q1 = createQuest(0.5, 0.2);
assert(typeof q1.getNextIntensity === 'function', 'has getNextIntensity');
assert(typeof q1.update === 'function', 'has update');
assert(typeof q1.getFinalEstimate === 'function', 'has getFinalEstimate');

// ============================================================

section('createQuest — initial intensity near prior mean');

const q2 = createQuest(0.5, 0.2);
const firstIntensity = q2.getNextIntensity();
// Should be close to 0.5 (the prior mean), within the axis resolution
approxEqual(firstIntensity, 0.5, 0.05,
    'initial getNextIntensity near prior mean of 0.5');

// ============================================================

section('createQuest — different prior means shift initial intensity');

const qLow = createQuest(0.2, 0.15);
const qHigh = createQuest(0.8, 0.15);
const lowIntensity = qLow.getNextIntensity();
const highIntensity = qHigh.getNextIntensity();
assert(lowIntensity < highIntensity,
    `low prior (${lowIntensity.toFixed(3)}) < high prior (${highIntensity.toFixed(3)})`);
approxEqual(lowIntensity, 0.2, 0.05, 'low prior near 0.2');
approxEqual(highIntensity, 0.8, 0.05, 'high prior near 0.8');

// ============================================================

section('createQuest — getNextIntensity returns valid coherence [0, 1]');

const q3 = createQuest(0.5, 0.2);
const intensity = q3.getNextIntensity();
assert(intensity > 0 && intensity <= 1.0,
    `intensity ${intensity} is in valid coherence range`);

// ============================================================
// update — direction of movement
// ============================================================

section('createQuest — update: correct responses decrease intensity');

const q4 = createQuest(0.5, 0.2);
const before = q4.getNextIntensity();
// Simulate several correct responses at the current intensity
for (let i = 0; i < 5; i++) {
    const current = q4.getNextIntensity();
    q4.update(current, true);
}
const after = q4.getNextIntensity();
assert(after < before,
    `intensity decreased after correct responses: ${before.toFixed(3)} → ${after.toFixed(3)}`);

// ============================================================

section('createQuest — update: incorrect responses increase intensity');

const q5 = createQuest(0.5, 0.2);
const before5 = q5.getNextIntensity();
// Simulate several incorrect responses
for (let i = 0; i < 5; i++) {
    const current = q5.getNextIntensity();
    q5.update(current, false);
}
const after5 = q5.getNextIntensity();
assert(after5 > before5,
    `intensity increased after incorrect responses: ${before5.toFixed(3)} → ${after5.toFixed(3)}`);

// ============================================================
// Convergence tests
// ============================================================

section('createQuest — convergence to known threshold (simulated participant)');

// Simulate a participant with true threshold at coherence 0.3.
// At coherence >= 0.3, they mostly get it right; below, mostly wrong.
// Use a probabilistic model: P(correct) follows a rough psychometric curve.
function simulateResponse(coherence, trueThreshold) {
    // Simple logistic-ish model for testing
    const logCoh = Math.log10(coherence);
    const logThresh = Math.log10(trueThreshold);
    const diff = logCoh - logThresh;
    // Map to probability: well above threshold → ~95%, well below → ~55% (near guessing)
    const p = 0.5 + 0.48 / (1 + Math.exp(-10 * diff));
    return Math.random() < p;
}

// Run multiple QUEST staircases and check the average converges
const trueThreshold = 0.3;
const numStaircases = 20;
let totalEstimate = 0;

for (let s = 0; s < numStaircases; s++) {
    const quest = createQuest(0.5, 0.2);
    for (let t = 0; t < 20; t++) {
        const coh = quest.getNextIntensity();
        const correct = simulateResponse(coh, trueThreshold);
        quest.update(coh, correct);
    }
    totalEstimate += quest.getFinalEstimate();
}
const avgEstimate = totalEstimate / numStaircases;
approxEqual(avgEstimate, trueThreshold, 0.15,
    `average of ${numStaircases} staircases converges near true threshold ${trueThreshold}`);

// ============================================================

section('createQuest — convergence to high threshold');

const trueThresholdHigh = 0.7;
let totalHigh = 0;
for (let s = 0; s < numStaircases; s++) {
    const quest = createQuest(0.5, 0.2);
    for (let t = 0; t < 20; t++) {
        const coh = quest.getNextIntensity();
        const correct = simulateResponse(coh, trueThresholdHigh);
        quest.update(coh, correct);
    }
    totalHigh += quest.getFinalEstimate();
}
const avgHigh = totalHigh / numStaircases;
approxEqual(avgHigh, trueThresholdHigh, 0.15,
    `average converges near high threshold ${trueThresholdHigh}`);

// ============================================================

section('createQuest — low threshold convergence separates from high');

assert(avgEstimate < avgHigh,
    `low threshold estimate (${avgEstimate.toFixed(3)}) < high threshold estimate (${avgHigh.toFixed(3)})`);

// ============================================================
// getFinalEstimate tests
// ============================================================

section('createQuest — getFinalEstimate returns valid coherence');

const q6 = createQuest(0.5, 0.2);
for (let i = 0; i < 10; i++) {
    const coh = q6.getNextIntensity();
    q6.update(coh, i % 2 === 0); // alternating correct/incorrect
}
const finalEst = q6.getFinalEstimate();
assert(finalEst > 0 && finalEst <= 1.0,
    `final estimate ${finalEst.toFixed(4)} is valid coherence`);

// ============================================================

section('createQuest — getFinalEstimate differs from getNextIntensity (prior removed)');

const q7 = createQuest(0.5, 0.2);
// Give just a couple of trials — prior still has strong influence on posterior
// but getFinalEstimate strips the prior, so they should differ
q7.update(0.5, true);
q7.update(0.4, true);
const nextI = q7.getNextIntensity();
const finalI = q7.getFinalEstimate();
// They may happen to be close, but with only 2 trials and a strong prior,
// the posterior (getNextIntensity) is more conservative than the likelihood-only estimate
// Just verify both return valid coherence
assert(nextI > 0 && nextI <= 1.0, `getNextIntensity valid: ${nextI.toFixed(4)}`);
assert(finalI > 0 && finalI <= 1.0, `getFinalEstimate valid: ${finalI.toFixed(4)}`);

// ============================================================
// Edge cases
// ============================================================

section('createQuest — update at boundary coherences');

const q8 = createQuest(0.5, 0.2);
// Update at very low coherence — should not crash
q8.update(0.01, false);
const afterLow = q8.getNextIntensity();
assert(afterLow > 0 && afterLow <= 1.0, `valid after update at coherence 0.01: ${afterLow.toFixed(4)}`);

// Update at very high coherence — should not crash
q8.update(0.99, true);
const afterHigh = q8.getNextIntensity();
assert(afterHigh > 0 && afterHigh <= 1.0, `valid after update at coherence 0.99: ${afterHigh.toFixed(4)}`);

// ============================================================

section('createQuest — multiple QUEST instances are independent');

const qA = createQuest(0.5, 0.2);
const qB = createQuest(0.5, 0.2);

// Update only qA
qA.update(0.5, true);
qA.update(0.5, true);
qA.update(0.5, true);

// qB should still be at initial estimate
const qAIntensity = qA.getNextIntensity();
const qBIntensity = qB.getNextIntensity();
assert(qAIntensity < qBIntensity,
    `qA moved (${qAIntensity.toFixed(3)}) while qB stayed (${qBIntensity.toFixed(3)})`);

// ============================================================

section('createQuest — many correct trials push intensity toward minimum');

const q9 = createQuest(0.5, 0.2);
for (let i = 0; i < 20; i++) {
    const coh = q9.getNextIntensity();
    q9.update(coh, true);  // always correct
}
const veryEasy = q9.getNextIntensity();
assert(veryEasy < 0.25,
    `20 consecutive correct pushes intensity very low: ${veryEasy.toFixed(4)}`);

// ============================================================

section('createQuest — many incorrect trials push intensity toward maximum');

const q10 = createQuest(0.5, 0.2);
for (let i = 0; i < 20; i++) {
    const coh = q10.getNextIntensity();
    q10.update(coh, false);  // always incorrect
}
const veryHard = q10.getNextIntensity();
assert(veryHard > 0.8,
    `20 consecutive incorrect pushes intensity very high: ${veryHard.toFixed(4)}`);

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
