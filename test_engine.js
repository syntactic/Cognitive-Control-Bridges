// test_engine.js — Quick sanity checks for engine.js
// Run with: node test_engine.js

// Since engine.js uses plain globals (no module.exports), we eval it
const fs = require('fs');
eval(fs.readFileSync('./engine.js', 'utf8'));

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${msg}`);
    }
}

function section(name) {
    console.log(`\n--- ${name} ---`);
}

// ============================================================
section('switchTask');
assert(switchTask('mov') === 'or', 'mov → or');
assert(switchTask('or') === 'mov', 'or → mov');

// ============================================================
section('sampleFromDistribution');

assert(sampleFromDistribution({ type: 'fixed', value: 500 }) === 500, 'fixed returns value');

// uniform: sample 100 times, all should be in [200, 800]
for (let i = 0; i < 100; i++) {
    const v = sampleFromDistribution({ type: 'uniform', value: 0, params: [200, 800] });
    assert(v >= 200 && v <= 800, `uniform in range: got ${v}`);
}

// choice: sample 100 times, all should be from the params array
const choices = [100, 200, 600, 1000];
for (let i = 0; i < 100; i++) {
    const v = sampleFromDistribution({ type: 'choice', value: 0, params: choices });
    assert(choices.includes(v), `choice from set: got ${v}`);
}

// unknown type throws
let threw = false;
try { sampleFromDistribution({ type: 'gaussian', value: 0 }); } catch (e) { threw = true; }
assert(threw, 'unknown type throws');

// ============================================================
section('generateTaskSequence');

// switchRate=0 → all same task
const allSame = generateTaskSequence(50, 'Random', 0, 'mov');
assert(allSame.length === 50, 'correct length');
assert(allSame.every(t => t === 'mov'), 'switchRate=0 → all same');

// switchRate=100 → alternating
const alternating = generateTaskSequence(10, 'Random', 100, 'mov');
assert(alternating.length === 10, 'correct length');
for (let i = 1; i < 10; i++) {
    assert(alternating[i] !== alternating[i - 1], `switchRate=100 always switches at position ${i}`);
}

// AABB pattern
const aabb = generateTaskSequence(8, 'AABB', 0, 'mov');
assert(aabb.length === 8, 'AABB correct length');
assert(aabb[0] === 'mov' && aabb[1] === 'mov', 'AABB first pair');
assert(aabb[2] === 'or' && aabb[3] === 'or', 'AABB second pair');
assert(aabb[4] === 'mov' && aabb[5] === 'mov', 'AABB third pair');

// ============================================================
section('classifyTransitions');

const seq = ['mov', 'mov', 'or', 'or', 'mov'];
const trans = classifyTransitions(seq);
assert(trans[0] === 'First', 'first trial is First');
assert(trans[1] === 'Repeat', 'same task is Repeat');
assert(trans[2] === 'Switch', 'different task is Switch');
assert(trans[3] === 'Repeat', 'same task is Repeat');
assert(trans[4] === 'Switch', 'different task is Switch');

// ============================================================
section('generateCongruencySequence');

const cong = generateCongruencySequence(120, ['congruent', 'incongruent'], [0.5, 0.5]);
assert(cong.length === 120, 'correct length');
const congCount = cong.filter(c => c === 'congruent').length;
const incongCount = cong.filter(c => c === 'incongruent').length;
assert(congCount === 60, `exact congruent count: got ${congCount}`);
assert(incongCount === 60, `exact incongruent count: got ${incongCount}`);

const allUnivalent = generateCongruencySequence(80, ['univalent'], [1.0]);
assert(allUnivalent.every(c => c === 'univalent'), 'all univalent');

// ============================================================
section('assignDirections');

// Single-task congruent: primary == distractor
for (let i = 0; i < 20; i++) {
    const d = assignDirections('mov', 'congruent', 'single-task', 'identical');
    assert(d.ch1_task === d.ch1_distractor, 'congruent: same direction');
    assert([0, 180].includes(d.ch1_task), 'horizontal direction');
    assert(d.ch2_task === 0 && d.ch2_distractor === 0, 'ch2 zeroed');
}

// Single-task incongruent: primary and distractor are 180° apart
for (let i = 0; i < 20; i++) {
    const d = assignDirections('or', 'incongruent', 'single-task', 'identical');
    assert(Math.abs(d.ch1_task - d.ch1_distractor) === 180, 'incongruent: opposite');
}

// Single-task neutral: distractor is 90 or 270
for (let i = 0; i < 20; i++) {
    const d = assignDirections('mov', 'neutral', 'single-task', 'identical');
    assert([90, 270].includes(d.ch1_distractor), `neutral distractor orthogonal: got ${d.ch1_distractor}`);
}

// Single-task univalent: distractor is 0
const uniDir = assignDirections('mov', 'univalent', 'single-task', 'identical');
assert(uniDir.ch1_distractor === 0, 'univalent: distractor is 0');

// Dual-task identical RSO: both channels horizontal
for (let i = 0; i < 20; i++) {
    const d = assignDirections('mov', 'univalent', 'dual-task', 'identical');
    assert([0, 180].includes(d.ch1_task), 'dual-task ch1 horizontal');
    assert([0, 180].includes(d.ch2_task), 'dual-task identical RSO ch2 horizontal');
}

// Dual-task disjoint RSO: ch2 is horizontal (disjointness is in the key maps, not directions)
for (let i = 0; i < 20; i++) {
    const d = assignDirections('mov', 'univalent', 'dual-task', 'disjoint');
    assert([0, 180].includes(d.ch2_task), 'dual-task disjoint RSO ch2 horizontal');
}

// ============================================================
section('buildTrialParams — single-task');

const singleSpec = {
    task1: 'mov',
    task2: null,
    csi: 200,
    dur_ch1: 300,
    dur_ch2: 0,
    soa: 0,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    dir: { ch1_task: 0, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
};
const singleParams = buildTrialParams(singleSpec);

assert(singleParams.task_1 === 'mov', 'task_1 set');
assert(singleParams.task_2 === null, 'task_2 null for single-task');
assert(singleParams.start_1 === 0, 'cue starts at 0');
assert(singleParams.dur_1 === 500, 'cue duration = csi + dur_ch1');
assert(singleParams.start_go_1 === 200, 'go signal at csi');
assert(singleParams.start_mov_1 === 200, 'stimulus at csi');
assert(singleParams.dur_mov_1 === 300, 'stimulus duration');
assert(singleParams.coh_mov_1 === 0.8, 'movement coherence routed');
assert(singleParams.coh_or_1 === 0, 'orientation coherence silenced');
// coh=0 pathways must have dur=0 (coh=0 renders random noise, not invisible)
assert(singleParams.dur_or_1 === 0, 'univalent: orientation duration zeroed');
assert(singleParams.start_or_1 === 0, 'univalent: orientation start zeroed');
assert(singleParams.coh_mov_2 === 0, 'ch2 coherence zero');
assert(singleParams.start_mov_2 === 0, 'ch2 timing zero');
assert(singleParams.dur_mov_2 === 0, 'ch2 mov duration zero');
assert(singleParams.dur_or_2 === 0, 'ch2 or duration zero');

// Count total fields — should be 26
const fieldCount = Object.keys(singleParams).length;
assert(fieldCount === 26, `26 SE fields: got ${fieldCount}`);

// Bivalent case: both pathways should have nonzero duration
const bivalentSpec = {
    task1: 'mov',
    task2: null,
    csi: 200,
    dur_ch1: 300,
    dur_ch2: 0,
    soa: 0,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0.8, ch2_task: 0, ch2_distractor: 0 },
    dir: { ch1_task: 0, ch1_distractor: 180, ch2_task: 0, ch2_distractor: 0 },
};
const bivalentParams = buildTrialParams(bivalentSpec);
assert(bivalentParams.dur_mov_1 === 300, 'bivalent: mov1 duration preserved');
assert(bivalentParams.dur_or_1 === 300, 'bivalent: or1 duration preserved');
assert(bivalentParams.coh_mov_1 === 0.8, 'bivalent: mov1 coherence');
assert(bivalentParams.coh_or_1 === 0.8, 'bivalent: or1 coherence');

// ============================================================
section('buildTrialParams — dual-task with relative offset');

const dualSpec = {
    task1: 'mov',
    task2: 'or',
    csi: 200,
    dur_ch1: 300,
    dur_ch2: 300,
    soa: 100, // short SOA: ch2 starts before ch1 ends
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0.6, ch2_distractor: 0 },
    dir: { ch1_task: 180, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
};
const dualParams = buildTrialParams(dualSpec);

assert(dualParams.task_2 === 'or', 'task_2 set');
// Coherence routing: task2='or' so ch2_task→coh_or_2, ch2_distractor→coh_mov_2
assert(dualParams.coh_or_2 === 0.6, 'ch2 task coherence routed to orientation');
assert(dualParams.coh_mov_2 === 0, 'ch2 distractor coherence zero');
// Active pathway (or2): or1 is silenced (coh=0 → dur=0 → or1.end=0).
// SE computes: or2_absolute = start_or_2 + or1.end = start_or_2 + 0.
// Desired absolute start = csi + soa = 200 + 100 = 300.
// So start_or_2 must equal the desired absolute start (300).
assert(dualParams.start_or_2 === 300, `ch2 or offset: got ${dualParams.start_or_2}`);
assert(dualParams.dur_or_2 === 300, 'ch2 or duration preserved');
// Silenced pathway (mov2): coh=0 → duration zeroed
assert(dualParams.dur_mov_2 === 0, 'ch2 mov silenced: duration zeroed');
assert(dualParams.start_mov_2 === 0, 'ch2 mov silenced: start zeroed');
// Channel 2 cue is absolute
assert(dualParams.start_2 === 300, `ch2 cue absolute: got ${dualParams.start_2}`);
assert(dualParams.start_go_2 === 300, `ch2 go absolute: got ${dualParams.start_go_2}`);

// ============================================================
section('buildTrialParams — dual-task with swapped tasks (T1=or, T2=mov)');

const dualSwappedSpec = {
    task1: 'or',
    task2: 'mov',
    csi: 200,
    dur_ch1: 300,
    dur_ch2: 300,
    soa: 400,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0.6, ch2_distractor: 0 },
    dir: { ch1_task: 0, ch1_distractor: 0, ch2_task: 180, ch2_distractor: 0 },
};
const dualSwappedParams = buildTrialParams(dualSwappedSpec);

// task1='or': or1 is active, mov1 is silenced (coh_mov_1=ch1_distractor=0)
assert(dualSwappedParams.coh_or_1 === 0.8, 'swapped: or1 active');
assert(dualSwappedParams.coh_mov_1 === 0, 'swapped: mov1 silenced');
assert(dualSwappedParams.dur_mov_1 === 0, 'swapped: mov1 dur zeroed');
// task2='mov': mov2 is active, or2 is silenced
assert(dualSwappedParams.coh_mov_2 === 0.6, 'swapped: mov2 active');
assert(dualSwappedParams.coh_or_2 === 0, 'swapped: or2 silenced');
// mov1 is silenced (end=0). SE: mov2_abs = start_mov_2 + mov1.end = start_mov_2 + 0.
// Desired absolute start = csi + soa = 200 + 400 = 600.
assert(dualSwappedParams.start_mov_2 === 600, `swapped: mov2 offset: got ${dualSwappedParams.start_mov_2}`);
assert(dualSwappedParams.dur_mov_2 === 300, 'swapped: mov2 dur preserved');
// Verify SE would produce correct absolute timing
const mov1EndSwapped = dualSwappedParams.start_mov_1 + dualSwappedParams.dur_mov_1; // 0
assert(dualSwappedParams.start_mov_2 + mov1EndSwapped === 600,
    'swapped: SE mov2 absolute start = 600');

// ============================================================
section('buildTrialParams — dual-task bivalent (ch1 counterpart active)');

const dualBivalentSpec = {
    task1: 'mov',
    task2: 'or',
    csi: 200,
    dur_ch1: 300,
    dur_ch2: 300,
    soa: 100,
    responseWindow: 2000,
    // Bivalent: ch1 distractor is active (coh > 0)
    coherence: { ch1_task: 0.8, ch1_distractor: 0.8, ch2_task: 0.6, ch2_distractor: 0 },
    dir: { ch1_task: 180, ch1_distractor: 180, ch2_task: 0, ch2_distractor: 0 },
};
const dualBivalentParams = buildTrialParams(dualBivalentSpec);

// or1 is active (ch1 distractor with coh=0.8). or1 starts at csi=200, dur=300, end=500.
assert(dualBivalentParams.dur_or_1 === 300, 'bivalent dual: or1 dur preserved');
assert(dualBivalentParams.coh_or_1 === 0.8, 'bivalent dual: or1 coh preserved');
// SE: or2_abs = start_or_2 + or1.end = start_or_2 + 500.
// Desired absolute start = csi + soa = 300.
// So start_or_2 = 300 - 500 = -200 (negative is correct here!).
assert(dualBivalentParams.start_or_2 === -200, `bivalent dual: or2 offset: got ${dualBivalentParams.start_or_2}`);
const or1EndBiv = dualBivalentParams.start_or_1 + dualBivalentParams.dur_or_1; // 500
assert(dualBivalentParams.start_or_2 + or1EndBiv === 300,
    'bivalent dual: SE or2 absolute start = 300');

// ============================================================
section('generateBlockTrials — Hirsch PRP block');

const prpConfig = {
    blockId: 'hirsch_prp',
    blockType: 'prp',
    paradigm: 'dual-task',
    task1: 'mov',
    task2: 'or',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    rso: 'identical',
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0.6, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    soa: { type: 'choice', value: 100, params: [50, 100, 200, 400, 600, 1000] },
};

const prpTrials = generateBlockTrials(prpConfig, 24);
assert(prpTrials.length === 24, `24 trials generated: got ${prpTrials.length}`);

// Check every trial has valid structure
let allValid = true;
for (const t of prpTrials) {
    if (!t.seParams || !t.meta) { allValid = false; break; }
    if (t.seParams.task_1 === undefined) { allValid = false; break; }
    if (t.seParams.task_2 === undefined) { allValid = false; break; }
    if (t.meta.soa === null || t.meta.soa === undefined) { allValid = false; break; }
    // Verify SE would place the active ch2 stimulus at the correct absolute time.
    // The ch1 counterpart is silenced (univalent), so ch1_end=0.
    // SE: ch2_abs = start_X_2 + ch1_X.end = start_X_2 + 0 = start_X_2.
    // Desired absolute start = csi + soa.
    const desiredAbsStart = prpConfig.csi + t.meta.soa;
    const activeKey = t.meta.task2 === 'mov' ? 'start_mov_2' : 'start_or_2';
    const silencedKey = t.meta.task2 === 'mov' ? 'start_or_2' : 'start_mov_2';
    // For silenced ch1 counterpart, offset IS the desired absolute start
    if (t.seParams[activeKey] !== desiredAbsStart) { allValid = false; break; }
    // Silenced pathway should be zeroed
    if (t.seParams[silencedKey] !== 0) { allValid = false; break; }
}
assert(allValid, 'all PRP trials have valid structure and correct ch2 offsets');

// Check that T1-T2 switching occurs (with switchRate=50 over 24 trials)
const t1Tasks = prpTrials.map(t => t.meta.task);
const hasSwitch = prpTrials.some(t => t.meta.transitionType === 'Switch');
const hasRepeat = prpTrials.some(t => t.meta.transitionType === 'Repeat');
// With switchRate=50 and 24 trials, probability of zero switches or zero repeats is negligible
assert(hasSwitch, 'PRP block has T1-T2 switches');
assert(hasRepeat, 'PRP block has T1-T2 repetitions');

// Check that task2 is always the opposite of task1
for (const t of prpTrials) {
    assert(t.meta.task2 === switchTask(t.meta.task),
        `task2 is opposite of task1: ${t.meta.task} → ${t.meta.task2}`);
}

// Check SOA values are from the choice set
const validSOAs = new Set([50, 100, 200, 400, 600, 1000]);
for (const t of prpTrials) {
    assert(validSOAs.has(t.meta.soa), `SOA from choice set: got ${t.meta.soa}`);
}

// Check that no fields are NaN or undefined
for (const t of prpTrials) {
    for (const [k, v] of Object.entries(t.seParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `seParams.${k} not NaN/undefined`);
    }
}

// ============================================================
section('generateBlockTrials — pure single-task block');

const pureConfig = {
    blockId: 'hirsch_pure_mov',
    blockType: 'pure',
    paradigm: 'single-task',
    task1: 'mov',
    task2: null,
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov',
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    rso: 'identical',
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'fixed', value: 500, params: [] },
    soa: { type: 'fixed', value: 0, params: [] },
};

const pureTrials = generateBlockTrials(pureConfig, 40);
assert(pureTrials.length === 40, 'pure block: 40 trials');
assert(pureTrials.every(t => t.meta.task === 'mov'), 'pure block: all mov');
assert(pureTrials.every(t => t.meta.task2 === null), 'pure block: no task2');
assert(pureTrials.every(t => t.seParams.task_2 === null), 'pure block: SE task_2 null');
assert(pureTrials.every(t => t.meta.soa === null), 'pure block: soa null');
assert(pureTrials[0].meta.transitionType === 'First', 'pure block: first is First');
assert(pureTrials.slice(1).every(t => t.meta.transitionType === 'Repeat'), 'pure block: rest are Repeat');

// ============================================================
section('generateBlockTrials — mixed task-switching block');

const mixedConfig = {
    blockId: 'hirsch_mixed',
    blockType: 'mixed',
    paradigm: 'single-task',
    task1: 'mov',
    task2: null,
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    rso: 'identical',
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'fixed', value: 500, params: [] },
    soa: { type: 'fixed', value: 0, params: [] },
};

const mixedTrials = generateBlockTrials(mixedConfig, 80);
assert(mixedTrials.length === 80, 'mixed block: 80 trials');
const mixedTasks = new Set(mixedTrials.map(t => t.meta.task));
assert(mixedTasks.has('mov') && mixedTasks.has('or'), 'mixed block: both tasks present');
assert(mixedTrials.every(t => t.meta.task2 === null), 'mixed block: no task2');
assert(mixedTrials.some(t => t.meta.transitionType === 'Switch'), 'mixed block: has switches');
assert(mixedTrials.some(t => t.meta.transitionType === 'Repeat'), 'mixed block: has repeats');

// ============================================================
// Summary
console.log(`\n============================`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed!');
}
