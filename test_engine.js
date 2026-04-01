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
    const activeKey = t.meta.t2_task === 'mov' ? 'start_mov_2' : 'start_or_2';
    const silencedKey = t.meta.t2_task === 'mov' ? 'start_or_2' : 'start_mov_2';
    // For silenced ch1 counterpart, offset IS the desired absolute start
    if (t.seParams[activeKey] !== desiredAbsStart) { allValid = false; break; }
    // Silenced pathway should be zeroed
    if (t.seParams[silencedKey] !== 0) { allValid = false; break; }
}
assert(allValid, 'all PRP trials have valid structure and correct ch2 offsets');

// Check that T1-T2 switching occurs (with switchRate=50 over 24 trials)
const t1Tasks = prpTrials.map(t => t.meta.t1_task);
const hasSwitch = prpTrials.some(t => t.meta.transitionType === 'Switch');
const hasRepeat = prpTrials.some(t => t.meta.transitionType === 'Repeat');
// With switchRate=50 and 24 trials, probability of zero switches or zero repeats is negligible
assert(hasSwitch, 'PRP block has T1-T2 switches');
assert(hasRepeat, 'PRP block has T1-T2 repetitions');

// Check that task2 is always the opposite of task1
for (const t of prpTrials) {
    assert(t.meta.t2_task === switchTask(t.meta.t1_task),
        `task2 is opposite of task1: ${t.meta.t1_task} → ${t.meta.t2_task}`);
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
section('generateBlockTrials — task-indexed coherence (PRP)');

const prpTaskCohConfig = {
    ...prpConfig,
    blockId: 'test_prp_task_coh',
    coherence: { mov: 0.3, or: 0.7 },
};
const prpTaskCohTrials = generateBlockTrials(prpTaskCohConfig, 20);
for (const t of prpTaskCohTrials) {
    // T1 coherence should match its task identity
    const t1CohKey = t.meta.t1_task === 'mov' ? 'coh_mov_1' : 'coh_or_1';
    const expectedT1 = t.meta.t1_task === 'mov' ? 0.3 : 0.7;
    assert(t.seParams[t1CohKey] === expectedT1,
        `task-indexed PRP: T1 task=${t.meta.t1_task}, ${t1CohKey}=${t.seParams[t1CohKey]}, expected=${expectedT1}`);

    // T2 coherence should match its task identity
    const t2CohKey = t.meta.t2_task === 'mov' ? 'coh_mov_2' : 'coh_or_2';
    const expectedT2 = t.meta.t2_task === 'mov' ? 0.3 : 0.7;
    assert(t.seParams[t2CohKey] === expectedT2,
        `task-indexed PRP: T2 task=${t.meta.t2_task}, ${t2CohKey}=${t.seParams[t2CohKey]}, expected=${expectedT2}`);
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
assert(pureTrials.every(t => t.meta.t1_task === 'mov'), 'pure block: all mov');
assert(pureTrials.every(t => t.meta.t2_task === null), 'pure block: no task2');
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
const mixedTasks = new Set(mixedTrials.map(t => t.meta.t1_task));
assert(mixedTasks.has('mov') && mixedTasks.has('or'), 'mixed block: both tasks present');
assert(mixedTrials.every(t => t.meta.t2_task === null), 'mixed block: no task2');
assert(mixedTrials.some(t => t.meta.transitionType === 'Switch'), 'mixed block: has switches');
assert(mixedTrials.some(t => t.meta.transitionType === 'Repeat'), 'mixed block: has repeats');

// ============================================================
section('buildSingleCanvasSpec');
const singleCanvasUnivalent = buildSingleCanvasSpec('mov', 100, 1000, 1000, 0.8, 0, null, null);
assert(singleCanvasUnivalent.task1 === 'mov', 'univalent: task1 is mov');
assert(singleCanvasUnivalent.task2 === null, 'univalent: task2 is null');
assert(singleCanvasUnivalent.soa === 0, 'univalent: soa is 0');
assert(singleCanvasUnivalent.coherence.ch1_task === 0.8, 'univalent: ch1_task coherence is 0.8');
assert(singleCanvasUnivalent.coherence.ch1_distractor === 0, 'univalent: ch1_distractor coherence defaults to 0');
assert(singleCanvasUnivalent.coherence.ch2_task === 0, 'univalent: ch2_task coherence is 0');
assert(singleCanvasUnivalent.coherence.ch2_distractor === 0, 'univalent: ch2_distractor coherence is 0');
assert(singleCanvasUnivalent.dir.ch2_distractor === 0, 'univalent: ch2_distractor direction is 0');
assert(singleCanvasUnivalent.dir.ch2_task === 0, 'univalent: ch2_task direction is 0');
const singleCanvasBivalent = buildSingleCanvasSpec('mov', 100, 1000, 1000, 0.8, 0, 0.5, 180);
assert(singleCanvasBivalent.coherence.ch1_distractor === 0.5, 'bivalent: ch1_distractor coherence is 0.5');
assert(singleCanvasBivalent.dir.ch1_distractor === 180, 'bivalent: ch1_distractor direction is 180');
// 3. Feed it into buildTrialParams: This is the real integration test. Build a spec with your function, pass it to buildTrialParams(), and verify the output has the right SE parameter names and values. This tests that your spec is actually compatible with the downstream pipeline.
const bivalentTrialParams = buildTrialParams(singleCanvasBivalent);
assert(bivalentTrialParams.task_1 === 'mov', 'bivalent: task 1 is movement');
assert(bivalentTrialParams.start_mov_1 === 100, 'bivalent: movement starts at 100ms');
assert(bivalentTrialParams.dur_mov_1 === 1000, 'bivalent: movement lasts for 1000ms');
assert(bivalentTrialParams.coh_mov_1 === 0.8, 'bivalent: movement coherence is 0.8');
assert(bivalentTrialParams.start_or_1 === 100, 'bivalent: orientation distractor starts at 100ms');
assert(bivalentTrialParams.dur_or_1 === 1000, 'bivalent: orientation distractor lasts for 1000ms');
assert(bivalentTrialParams.coh_or_1 === 0.5, 'bivalent: orientation coherence is 0.5');
assert(bivalentTrialParams.task_2 === null, 'bivalent: no second task');
assert(bivalentTrialParams.start_mov_2 === 0, 'bivalent: movement 2 doesn\'t start');
assert(bivalentTrialParams.dur_mov_2 === 0, 'bivalent: movement 2 doesn\'t last');
assert(bivalentTrialParams.coh_mov_2 === 0, 'bivalent: movement 2 coherence is 0');

// ===
section('applySOAOffset');
const shiftedSingleCanvasBivalent = applySOAOffset(bivalentTrialParams, 150);
assert(shiftedSingleCanvasBivalent.start_mov_1 === 250, 'correctly shifted movement stimulus');
assert(bivalentTrialParams.start_mov_1 === 100, 'original movement unshifted');
assert(shiftedSingleCanvasBivalent.dur_mov_1 === 1000, 'preserved movement duration');
assert(shiftedSingleCanvasBivalent.coh_mov_1 === 0.8, 'preserved movement coherence');
assert(shiftedSingleCanvasBivalent.start_or_1 === 250, 'correctled shifted orientation stimulus');
assert(bivalentTrialParams.start_or_1 === 100, 'original orientation unshifted');
assert(shiftedSingleCanvasBivalent.dur_or_1 === 1000, 'preserved orientation duration');
assert(shiftedSingleCanvasBivalent.coh_or_1 === 0.5, 'preserved orientation coherence');
assert(shiftedSingleCanvasBivalent.start_go_1 === 250, 'shifted go start');
assert(shiftedSingleCanvasBivalent.dur_1 === 1250, 'shifted cue duration: 1100 + 150');

// Silenced pathways should not be shifted
const univalentTrialParams = buildTrialParams(singleCanvasUnivalent);
// singleCanvasUnivalent has task='mov', so or1 is silenced (coh=0 → dur_or_1=0)
assert(univalentTrialParams.dur_or_1 === 0, 'silenced: or1 duration is 0 before shift');
const shiftedUnivalent = applySOAOffset(univalentTrialParams, 200);
assert(shiftedUnivalent.start_or_1 === univalentTrialParams.start_or_1,
    'silenced: or1 start not shifted when dur_or_1 is 0');
assert(shiftedUnivalent.start_mov_1 === univalentTrialParams.start_mov_1 + 200,
    'silenced: active mov1 still shifted');
assert(shiftedUnivalent.start_go_1 === univalentTrialParams.start_go_1 + 200,
    'silenced: go signal still shifted');

// Zero offset returns a copy, not the same reference
const zeroOffsetCopy = applySOAOffset(bivalentTrialParams, 0);
assert(zeroOffsetCopy !== bivalentTrialParams, 'zero offset: returns new object, not same reference');
assert(zeroOffsetCopy.start_mov_1 === bivalentTrialParams.start_mov_1,
    'zero offset: values are identical');
assert(zeroOffsetCopy.start_go_1 === bivalentTrialParams.start_go_1,
    'zero offset: go signal unchanged');
assert(zeroOffsetCopy.dur_1 === bivalentTrialParams.dur_1,
    'zero offset: cue duration unchanged');

// Original not mutated after all shifts above
assert(bivalentTrialParams.start_mov_1 === 100, 'original still unmodified after multiple shifts');
assert(bivalentTrialParams.start_go_1 === 100, 'original go signal still unmodified');

// ============================================================
section('classifyDualCanvasTransitions');

const dualTrans = classifyDualCanvasTransitions(
    ['mov', 'mov', 'or', 'mov'],
    ['mov', 'or',  'or', 'or']
);
assert(dualTrans.length === 4, 'dual transitions: correct length');
assert(dualTrans[0] === 'Repeat', 'dual transitions: same tasks → Repeat');
assert(dualTrans[1] === 'Switch', 'dual transitions: different tasks → Switch');
assert(dualTrans[2] === 'Repeat', 'dual transitions: both or → Repeat');
assert(dualTrans[3] === 'Switch', 'dual transitions: mov vs or → Switch');

// ============================================================
section('generateDualCanvasBlockTrials — t2Rule switch');

const dualCanvasSwitchConfig = {
    blockId: 'test_dual_switch',
    blockType: 'prp',
    paradigm: 'dual-canvas',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
    rso: 'disjoint',
    t2Rule: 'switch',
    earlyResolve: true,
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0.6, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'fixed', value: 500, params: [] },
    soa: { type: 'choice', value: 100, params: [100, 600] },
};

const switchTrials = generateDualCanvasBlockTrials(dualCanvasSwitchConfig, 24);
assert(switchTrials.length === 24, 'switch: 24 trials generated');

// Every trial should have opposite tasks on left and right
for (const t of switchTrials) {
    assert(t.meta.t1_task !== t.meta.t2_task,
        `switch: T1=${t.meta.t1_task} differs from T2=${t.meta.t2_task}`);
    assert(t.meta.t2_task === switchTask(t.meta.t1_task),
        'switch: T2 is switchTask(T1)');
    assert(t.meta.transitionType === 'Switch',
        'switch: all transitions are Switch when tasks always differ');
}

// Return shape: leftSeParams, rightSeParams, meta
const firstSwitch = switchTrials[0];
assert(firstSwitch.leftSeParams !== undefined, 'switch: has leftSeParams');
assert(firstSwitch.rightSeParams !== undefined, 'switch: has rightSeParams');
assert(firstSwitch.meta !== undefined, 'switch: has meta');
assert(firstSwitch.leftSeParams.task_1 !== undefined, 'switch: leftSeParams has task_1');
assert(firstSwitch.rightSeParams.task_1 !== undefined, 'switch: rightSeParams has task_1');

// Both canvases should be channel-1-only (task_2 null, ch2 zeroed)
assert(firstSwitch.leftSeParams.task_2 === null, 'switch: left canvas task_2 is null');
assert(firstSwitch.rightSeParams.task_2 === null, 'switch: right canvas task_2 is null');
assert(firstSwitch.leftSeParams.dur_mov_2 === 0, 'switch: left canvas ch2 mov silenced');
assert(firstSwitch.leftSeParams.dur_or_2 === 0, 'switch: left canvas ch2 or silenced');

// ============================================================
section('generateDualCanvasBlockTrials — t2Rule same');

const dualCanvasSameConfig = {
    ...dualCanvasSwitchConfig,
    blockId: 'test_dual_same',
    t2Rule: 'same',
};

const sameTrials = generateDualCanvasBlockTrials(dualCanvasSameConfig, 24);
assert(sameTrials.length === 24, 'same: 24 trials generated');

// Every trial should have identical tasks on both canvases
for (const t of sameTrials) {
    assert(t.meta.t1_task === t.meta.t2_task,
        `same: T1=${t.meta.t1_task} matches T2=${t.meta.t2_task}`);
    assert(t.meta.transitionType === 'Repeat',
        'same: all transitions are Repeat when tasks always match');
}

// ============================================================
section('generateDualCanvasBlockTrials — t2Rule independent');

const dualCanvasIndependentConfig = {
    ...dualCanvasSwitchConfig,
    blockId: 'test_dual_independent',
    t2Rule: 'independent',
};

const indTrials = generateDualCanvasBlockTrials(dualCanvasIndependentConfig, 60);
assert(indTrials.length === 60, 'independent: 60 trials generated');

// With independent sequences over 60 trials, expect both same and different pairings
const hasRepeatPairing = indTrials.some(t => t.meta.t1_task === t.meta.t2_task);
const hasSwitchPairing = indTrials.some(t => t.meta.t1_task !== t.meta.t2_task);
assert(hasRepeatPairing, 'independent: has some same-task pairings');
assert(hasSwitchPairing, 'independent: has some different-task pairings');

// ============================================================
section('generateDualCanvasBlockTrials — SOA offset on right canvas');

// Use fixed SOA to make assertions deterministic
const dualCanvasFixedSOAConfig = {
    ...dualCanvasSwitchConfig,
    blockId: 'test_dual_soa',
    soa: { type: 'fixed', value: 400, params: [] },
};

const soaTrials = generateDualCanvasBlockTrials(dualCanvasFixedSOAConfig, 5);
for (const t of soaTrials) {
    // Left canvas: go signal at csi (200)
    assert(t.leftSeParams.start_go_1 === 200,
        `SOA: left go signal at csi=200, got ${t.leftSeParams.start_go_1}`);
    // Right canvas: go signal shifted by SOA (200 + 400 = 600)
    assert(t.rightSeParams.start_go_1 === 600,
        `SOA: right go signal at csi+soa=600, got ${t.rightSeParams.start_go_1}`);
    // Right canvas: cue duration extended by SOA
    assert(t.rightSeParams.dur_1 === dualCanvasFixedSOAConfig.csi + dualCanvasFixedSOAConfig.stimulusDuration + 400,
        `SOA: right cue duration extended by SOA`);
    // Meta records the SOA
    assert(t.meta.soa === 400, 'SOA: meta records soa=400');
}

// ============================================================
section('generateDualCanvasBlockTrials — channel-indexed coherence fallback');

// Default: both canvases use ch1_task (0.8) when task-indexed coherence not set
const cohTrial = soaTrials[0];
assert(cohTrial.leftSeParams.coh_mov_1 === 0.8 || cohTrial.leftSeParams.coh_or_1 === 0.8,
    'coherence fallback: left canvas uses ch1_task=0.8');
assert(cohTrial.rightSeParams.coh_mov_1 === 0.8 || cohTrial.rightSeParams.coh_or_1 === 0.8,
    'coherence fallback: right canvas uses ch1_task=0.8');

// ============================================================
section('generateDualCanvasBlockTrials — task-indexed coherence');

// Task-indexed format: each task gets its own coherence regardless of canvas side
const dualCanvasTaskCohConfig = {
    ...dualCanvasSwitchConfig,
    blockId: 'test_dual_task_coh',
    coherence: { mov: 0.9, or: 0.5 },
    soa: { type: 'fixed', value: 100, params: [] },
};

const cohTrials = generateDualCanvasBlockTrials(dualCanvasTaskCohConfig, 10);
for (const t of cohTrials) {
    // Movement task should always get 0.9, regardless of which canvas it's on
    const leftActiveCoh = t.meta.t1_task === 'mov' ? t.leftSeParams.coh_mov_1 : t.leftSeParams.coh_or_1;
    const expectedLeft = t.meta.t1_task === 'mov' ? 0.9 : 0.5;
    assert(leftActiveCoh === expectedLeft,
        `task-indexed coh: left task=${t.meta.t1_task}, got=${leftActiveCoh}, expected=${expectedLeft}`);

    const rightActiveCoh = t.meta.t2_task === 'mov' ? t.rightSeParams.coh_mov_1 : t.rightSeParams.coh_or_1;
    const expectedRight = t.meta.t2_task === 'mov' ? 0.9 : 0.5;
    assert(rightActiveCoh === expectedRight,
        `task-indexed coh: right task=${t.meta.t2_task}, got=${rightActiveCoh}, expected=${expectedRight}`);
}

// ============================================================
section('generateDualCanvasBlockTrials — throws on non-disjoint RSO');

let threwOnIdentical = false;
try {
    generateDualCanvasBlockTrials({ ...dualCanvasSwitchConfig, rso: 'identical' }, 10);
} catch (e) {
    threwOnIdentical = true;
}
assert(threwOnIdentical, 'throws when rso is not disjoint');

// ============================================================
section('generateDualCanvasBlockTrials — earlyResolve propagated to meta');

for (const t of switchTrials) {
    assert(t.meta.earlyResolve === true, 'earlyResolve propagated from config');
}

// ============================================================
section('generateDualCanvasBlockTrials — earlyResolve defaults to false');

const dualCanvasNoERConfig = { ...dualCanvasSwitchConfig, blockId: 'test_dual_no_er' };
delete dualCanvasNoERConfig.earlyResolve;
const noERTrials = generateDualCanvasBlockTrials(dualCanvasNoERConfig, 5);
for (const t of noERTrials) {
    assert(t.meta.earlyResolve === false, 'earlyResolve defaults to false when not set');
}

// ============================================================
section('generateDualCanvasBlockTrials — no NaN or undefined in SE params');

for (const t of switchTrials) {
    for (const [k, v] of Object.entries(t.leftSeParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `leftSeParams.${k} not NaN/undefined`);
    }
    for (const [k, v] of Object.entries(t.rightSeParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `rightSeParams.${k} not NaN/undefined`);
    }
}

// ============================================================
// generateSidedTrials
// ============================================================

const alternatingConfig = {
    blockId: 'test_alternating',
    blockType: 'mixed',
    paradigm: 'alternating',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
    earlyResolve: true,
    csi: 200,
    stimulusDuration: 2500,
    responseWindow: 2500,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    iti: { type: 'fixed', value: 600, params: [] },
};

section('generateSidedTrials — basic structure');

const altTrials = generateSidedTrials(alternatingConfig, 20);
assert(altTrials.length === 20, 'generates correct number of trials');
assert(altTrials[0].seParams !== undefined, 'trial has seParams');
assert(altTrials[0].meta !== undefined, 'trial has meta');

// ============================================================
section('generateSidedTrials — alternating sides');

for (let i = 0; i < altTrials.length; i++) {
    const expected = (i % 2 === 0) ? 'left' : 'right';
    assert(altTrials[i].meta.side === expected,
        `trial ${i+1}: side=${altTrials[i].meta.side}, expected ${expected}`);
}

// ============================================================
section('generateSidedTrials — metadata fields');

for (const t of altTrials) {
    assert(t.meta.paradigm === 'alternating', 'paradigm is alternating');
    assert(t.meta.blockType === 'mixed', 'blockType is mixed');
    assert(t.meta.blockId === 'test_alternating', 'blockId matches config');
    assert(t.meta.t2_task === null, 't2_task is null (single-task per trial)');
    assert(t.meta.earlyResolve === true, 'earlyResolve logged in meta');
    assert(t.meta.t1_target_dir === 0 || t.meta.t1_target_dir === 180,
        `t1_target_dir is 0 or 180, got ${t.meta.t1_target_dir}`);
    assert(t.meta.t1_task === 'mov' || t.meta.t1_task === 'or',
        `t1_task is mov or or, got ${t.meta.t1_task}`);
}

// ============================================================
section('generateSidedTrials — earlyResolve defaults to false');

const altConfigNoER = { ...alternatingConfig, blockId: 'test_alt_no_er' };
delete altConfigNoER.earlyResolve;
const altTrialsNoER = generateSidedTrials(altConfigNoER, 5);
for (const t of altTrialsNoER) {
    assert(t.meta.earlyResolve === false, 'earlyResolve defaults to false when not set');
}

// ============================================================
section('generateSidedTrials — transition classification');

assert(altTrials[0].meta.transitionType === 'First', 'first trial is First');
for (let i = 1; i < altTrials.length; i++) {
    const prev = altTrials[i - 1].meta.t1_task;
    const curr = altTrials[i].meta.t1_task;
    const expected = curr === prev ? 'Repeat' : 'Switch';
    assert(altTrials[i].meta.transitionType === expected,
        `trial ${i+1}: task ${prev}→${curr}, transition=${altTrials[i].meta.transitionType}, expected ${expected}`);
}

// ============================================================
section('generateSidedTrials — task sequence respects switchRate');

// With switchRate=50 over 100 trials, expect both repeats and switches
const altManyTrials = generateSidedTrials(alternatingConfig, 100);
const altHasRepeat = altManyTrials.some(t => t.meta.transitionType === 'Repeat');
const altHasSwitch = altManyTrials.some(t => t.meta.transitionType === 'Switch');
assert(altHasRepeat, 'switchRate 50: has repeat transitions');
assert(altHasSwitch, 'switchRate 50: has switch transitions');

// switchRate=0: all repeats after first trial
const altPureConfig = { ...alternatingConfig, blockId: 'test_alt_pure', switchRate: 0, startTask: 'mov' };
const altPureTrials = generateSidedTrials(altPureConfig, 20);
for (let i = 1; i < altPureTrials.length; i++) {
    assert(altPureTrials[i].meta.transitionType === 'Repeat',
        `pure block: trial ${i+1} is Repeat`);
    assert(altPureTrials[i].meta.t1_task === 'mov',
        `pure block: trial ${i+1} is mov`);
}

// ============================================================
section('generateSidedTrials — ITI sampling');

// Fixed ITI
for (const t of altTrials) {
    assert(t.meta.iti === 600, `fixed iti: got ${t.meta.iti}, expected 600`);
}

// Choice ITI
const altChoiceITIConfig = {
    ...alternatingConfig,
    blockId: 'test_alt_choice_iti',
    iti: { type: 'choice', value: 100, params: [100, 600] },
};
const altChoiceTrials = generateSidedTrials(altChoiceITIConfig, 50);
const itiValues = new Set(altChoiceTrials.map(t => t.meta.iti));
assert(itiValues.has(100), 'choice iti: includes 100');
assert(itiValues.has(600), 'choice iti: includes 600');
assert(itiValues.size === 2, `choice iti: only 2 distinct values, got ${itiValues.size}`);

// ============================================================
section('generateSidedTrials — SE params are single-channel only');

for (const t of altTrials) {
    // Channel 2 should be zeroed out
    assert(t.seParams.dur_mov_2 === 0, 'dur_mov_2 is 0');
    assert(t.seParams.dur_or_2 === 0, 'dur_or_2 is 0');
    assert(t.seParams.dur_go_2 === 0, 'dur_go_2 is 0');
    assert(t.seParams.dur_2 === 0, 'dur_2 is 0');
    assert(t.seParams.task_2 === null, 'task_2 is null');

    // Go signal at csi
    assert(t.seParams.start_go_1 === 200,
        `go signal at csi=200, got ${t.seParams.start_go_1}`);
}

// ============================================================
section('generateSidedTrials — coherence in active pathway');

for (const t of altTrials) {
    if (t.meta.t1_task === 'mov') {
        assert(t.seParams.coh_mov_1 === 0.8, `mov trial: coh_mov_1=0.8, got ${t.seParams.coh_mov_1}`);
        assert(t.seParams.coh_or_1 === 0, `mov trial: coh_or_1=0 (silenced)`);
    } else {
        assert(t.seParams.coh_or_1 === 0.8, `or trial: coh_or_1=0.8, got ${t.seParams.coh_or_1}`);
        assert(t.seParams.coh_mov_1 === 0, `or trial: coh_mov_1=0 (silenced)`);
    }
}

// ============================================================
section('generateSidedTrials — task-indexed coherence (alternating)');

const altTaskCohConfig = {
    ...alternatingConfig,
    blockId: 'test_alt_task_coh',
    coherence: { mov: 0.9, or: 0.4 },
};
const altTaskCohTrials = generateSidedTrials(altTaskCohConfig, 20);
for (const t of altTaskCohTrials) {
    if (t.meta.t1_task === 'mov') {
        assert(t.seParams.coh_mov_1 === 0.9, `task-indexed alt mov: coh_mov_1=0.9, got ${t.seParams.coh_mov_1}`);
        assert(t.seParams.coh_or_1 === 0, `task-indexed alt mov: coh_or_1=0 (silenced)`);
    } else {
        assert(t.seParams.coh_or_1 === 0.4, `task-indexed alt or: coh_or_1=0.4, got ${t.seParams.coh_or_1}`);
        assert(t.seParams.coh_mov_1 === 0, `task-indexed alt or: coh_mov_1=0 (silenced)`);
    }
}

// ============================================================
section('generateSidedTrials — no NaN or undefined in SE params');

for (const t of altTrials) {
    for (const [k, v] of Object.entries(t.seParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `seParams.${k} not NaN/undefined`);
    }
}

// ============================================================
// generateSidedTrials
// ============================================================

const baselineConfig = {
    blockId: 'test_baseline',
    blockType: 'prp-baseline',
    paradigm: 'prp-baseline',
    sequenceType: 'Random',
    switchRate: 0,
    startTask: 'mov',
    earlyResolve: true,
    csi: 200,
    stimulusDuration: 2500,
    responseWindow: 2500,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    iti: { type: 'fixed', value: 1000, params: [] },
    soa: { type: 'choice', value: 600, params: [100, 600] },
};

section('generateSidedTrials — basic structure');

const blTrials = generateSidedTrials(baselineConfig, 20);
assert(blTrials.length === 20, 'generates correct number of trials');
assert(blTrials[0].seParams !== undefined, 'trial has seParams');
assert(blTrials[0].meta !== undefined, 'trial has meta');

// ============================================================
section('generateSidedTrials — all trials on right side');

for (const t of blTrials) {
    assert(t.meta.side === 'right', `side is right, got ${t.meta.side}`);
}

// ============================================================
section('generateSidedTrials — metadata fields');

for (const t of blTrials) {
    assert(t.meta.paradigm === 'prp-baseline', 'paradigm is prp-baseline');
    assert(t.meta.blockType === 'prp-baseline', 'blockType is prp-baseline');
    assert(t.meta.blockId === 'test_baseline', 'blockId matches config');
    assert(t.meta.t1_task === null, 't1_task is null (asterisk)');
    assert(t.meta.t2_task !== null, 't2_task is the actual task');
    assert(t.meta.earlyResolve === true, 'earlyResolve logged in meta');
    assert(t.meta.t2_target_dir === 0 || t.meta.t2_target_dir === 180,
        `t2_target_dir is 0 or 180, got ${t.meta.t2_target_dir}`);
}

// ============================================================
section('generateSidedTrials — single task (switchRate 0)');

for (const t of blTrials) {
    assert(t.meta.t2_task === 'mov', `t2_task is mov (switchRate=0, startTask=mov), got ${t.meta.t2_task}`);
}

// All transitions after first should be Repeat
assert(blTrials[0].meta.transitionType === 'First', 'first trial is First');
for (let i = 1; i < blTrials.length; i++) {
    assert(blTrials[i].meta.transitionType === 'Repeat',
        `trial ${i+1}: transitionType is Repeat, got ${blTrials[i].meta.transitionType}`);
}

// ============================================================
section('generateSidedTrials — orientation baseline');

const baselineOrConfig = { ...baselineConfig, blockId: 'test_baseline_or', startTask: 'or' };
const blOrTrials = generateSidedTrials(baselineOrConfig, 10);
for (const t of blOrTrials) {
    assert(t.meta.t2_task === 'or', `or baseline: t2_task is or, got ${t.meta.t2_task}`);
}

// ============================================================
section('generateSidedTrials — SOA sampling');

const blSOAValues = new Set(blTrials.map(t => t.meta.soa));
assert(blSOAValues.has(100) || blSOAValues.has(600), 'SOA sampled from choice set');
// Over 20 trials with 2 choices, very likely both appear
// But to avoid flaky tests, just check they're valid values
for (const t of blTrials) {
    assert(t.meta.soa === 100 || t.meta.soa === 600,
        `SOA is 100 or 600, got ${t.meta.soa}`);
}

// Fixed SOA
const baselineFixedSOA = { ...baselineConfig, blockId: 'test_bl_fixed_soa', soa: { type: 'fixed', value: 300, params: [] } };
const blFixedTrials = generateSidedTrials(baselineFixedSOA, 5);
for (const t of blFixedTrials) {
    assert(t.meta.soa === 300, `fixed SOA: got ${t.meta.soa}, expected 300`);
}

// ============================================================
section('generateSidedTrials — ITI sampling');

for (const t of blTrials) {
    assert(t.meta.iti === 1000, `fixed iti: got ${t.meta.iti}, expected 1000`);
}

// ============================================================
section('generateSidedTrials — SE params are single-channel only');

for (const t of blTrials) {
    assert(t.seParams.dur_mov_2 === 0, 'dur_mov_2 is 0');
    assert(t.seParams.dur_or_2 === 0, 'dur_or_2 is 0');
    assert(t.seParams.dur_go_2 === 0, 'dur_go_2 is 0');
    assert(t.seParams.dur_2 === 0, 'dur_2 is 0');
    assert(t.seParams.task_2 === null, 'task_2 is null');
    assert(t.seParams.start_go_1 === 200,
        `go signal at csi=200, got ${t.seParams.start_go_1}`);
}

// ============================================================
section('generateSidedTrials — coherence in active pathway');

for (const t of blTrials) {
    // All trials are mov (switchRate=0, startTask=mov)
    assert(t.seParams.coh_mov_1 === 0.8, `mov trial: coh_mov_1=0.8, got ${t.seParams.coh_mov_1}`);
    assert(t.seParams.coh_or_1 === 0, `mov trial: coh_or_1=0 (silenced)`);
}

// ============================================================
section('generateSidedTrials — no NaN or undefined in SE params');

for (const t of blTrials) {
    for (const [k, v] of Object.entries(t.seParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `seParams.${k} not NaN/undefined`);
    }
}

// ============================================================
// EXPANDED COVERAGE
// ============================================================

// ============================================================
section('sampleFromDistribution — uniform fallback on missing params');

const uniformNoParams = sampleFromDistribution({ type: 'uniform', value: 42 });
assert(uniformNoParams === 42, 'uniform with no params falls back to value');

const uniformShortParams = sampleFromDistribution({ type: 'uniform', value: 99, params: [5] });
assert(uniformShortParams === 99, 'uniform with 1 param falls back to value');

// ============================================================
section('sampleFromDistribution — choice fallback on empty params');

const choiceEmpty = sampleFromDistribution({ type: 'choice', value: 77, params: [] });
assert(choiceEmpty === 77, 'choice with empty params falls back to value');

const choiceNoParams = sampleFromDistribution({ type: 'choice', value: 33 });
assert(choiceNoParams === 33, 'choice with undefined params falls back to value');

// ============================================================
section('sampleFromDistribution — uniform with reversed params (max < min)');

for (let i = 0; i < 50; i++) {
    const v = sampleFromDistribution({ type: 'uniform', value: 0, params: [800, 200] });
    assert(v >= 200 && v <= 800, `uniform reversed params in range: got ${v}`);
}

// ============================================================
section('sampleFromDistribution — choice with single element');

for (let i = 0; i < 10; i++) {
    const v = sampleFromDistribution({ type: 'choice', value: 0, params: [42] });
    assert(v === 42, `choice single element: got ${v}`);
}

// ============================================================
section('generateCongruencySequence — three conditions with uneven split');

const threeCong = generateCongruencySequence(10, ['a', 'b', 'c'], [0.33, 0.33, 0.34]);
assert(threeCong.length === 10, 'three conditions: correct length');
const aCount = threeCong.filter(c => c === 'a').length;
const bCount = threeCong.filter(c => c === 'b').length;
const cCount = threeCong.filter(c => c === 'c').length;
assert(aCount + bCount + cCount === 10, 'three conditions: all accounted for');
// Math.round(10*0.33)=3, Math.round(10*0.33)=3, remainder=4
assert(aCount === 3, `three conditions: a count=${aCount}, expected 3`);
assert(bCount === 3, `three conditions: b count=${bCount}, expected 3`);
assert(cCount === 4, `three conditions: c count=${cCount}, expected 4`);

// ============================================================
section('generateTaskSequence — unknown sequenceType throws');

let threwUnknownSeq = false;
try { generateTaskSequence(10, 'ABAB', 50, null); } catch (e) { threwUnknownSeq = true; }
assert(threwUnknownSeq, 'unknown sequenceType throws');

// ============================================================
section('generateTaskSequence — null startTask random coin flip');

// Over 100 runs, both mov and or should appear as first task
let seenMovFirst = false, seenOrFirst = false;
for (let i = 0; i < 100; i++) {
    const seq = generateTaskSequence(1, 'Random', 0, null);
    if (seq[0] === 'mov') seenMovFirst = true;
    if (seq[0] === 'or') seenOrFirst = true;
}
assert(seenMovFirst, 'null startTask: saw mov as first task');
assert(seenOrFirst, 'null startTask: saw or as first task');

// ============================================================
section('generateTaskSequence — length 1');

const singleTrial = generateTaskSequence(1, 'Random', 50, 'or');
assert(singleTrial.length === 1, 'length-1 sequence');
assert(singleTrial[0] === 'or', 'length-1 with startTask=or');

// ============================================================
section('generateBlockTrials — T1=or PRP block (reversed task routing)');

const prpOrConfig = {
    ...prpConfig,
    blockId: 'test_prp_or_first',
    task1: 'or',
    task2: 'mov',
    switchRate: 0,
    startTask: null,
};
const prpOrTrials = generateBlockTrials(prpOrConfig, 10);
// With switchRate=0 and PRP paradigm, T1 is always or, T2 is always mov
for (const t of prpOrTrials) {
    assert(t.meta.t1_task === 'or', `or-first PRP: task1=${t.meta.t1_task}`);
    assert(t.meta.t2_task === 'mov', `or-first PRP: task2=${t.meta.t2_task}`);
    // Coherence routing: T1=or → coh_or_1 gets ch1_task, coh_mov_1 gets ch1_distractor
    assert(t.seParams.coh_or_1 === 0.8, `or-first PRP: coh_or_1=${t.seParams.coh_or_1}`);
    assert(t.seParams.coh_mov_1 === 0, `or-first PRP: coh_mov_1=${t.seParams.coh_mov_1}`);
    // T2=mov → coh_mov_2 gets ch2_task, coh_or_2 gets ch2_distractor
    assert(t.seParams.coh_mov_2 === 0.6, `or-first PRP: coh_mov_2=${t.seParams.coh_mov_2}`);
    assert(t.seParams.coh_or_2 === 0, `or-first PRP: coh_or_2=${t.seParams.coh_or_2}`);
}

// ============================================================
section('generateBlockTrials — meta fields completeness');

const firstTrial = prpTrials[0];
assert(firstTrial.meta.trialNumber === 1, 'meta: trialNumber starts at 1');
assert(firstTrial.meta.blockId === 'hirsch_prp', 'meta: blockId from config');
assert(firstTrial.meta.blockType === 'prp', 'meta: blockType from config');
assert(firstTrial.meta.paradigm === 'dual-task', 'meta: paradigm from config');
assert(typeof firstTrial.meta.iti === 'number', 'meta: iti is a number');
assert(firstTrial.meta.iti >= 400 && firstTrial.meta.iti <= 600, 'meta: iti in uniform range');
assert(firstTrial.meta.t1_distractor_dir === null, 'meta: distractorDirection null for univalent');

// ============================================================
section('generateBlockTrials — single-task meta directions');

const pureTrial = pureTrials[0];
assert([0, 180].includes(pureTrial.meta.t1_target_dir), 'single-task: primaryDirection is 0 or 180');
assert(pureTrial.meta.t2_target_dir === null, 'single-task: ch2Direction is null');

// ============================================================
section('applySOAOffset — negative offset');

const negShifted = applySOAOffset(bivalentTrialParams, -50);
assert(negShifted.start_mov_1 === 50, 'negative offset: start_mov_1 = 100 + (-50) = 50');
assert(negShifted.start_or_1 === 50, 'negative offset: start_or_1 = 100 + (-50) = 50');
assert(negShifted.start_go_1 === 50, 'negative offset: start_go_1 = 100 + (-50) = 50');
assert(negShifted.dur_1 === 1050, 'negative offset: dur_1 = 1100 + (-50) = 1050');

// ============================================================
section('applySOAOffset — large offset');

const largeShifted = applySOAOffset(bivalentTrialParams, 1000);
assert(largeShifted.start_mov_1 === 1100, 'large offset: start_mov_1 = 100 + 1000');
assert(largeShifted.start_go_1 === 1100, 'large offset: start_go_1 = 100 + 1000');
assert(largeShifted.dur_1 === 2100, 'large offset: dur_1 = 1100 + 1000');

// ============================================================
section('buildTrialParams — dual-task: task1=or, task2=mov, bivalent ch1');

// This covers: or→mov routing with bivalent ch1 distractor
// ch1_distractor routes to coh_mov_1 (because task1=or, distractor is mov pathway)
const dualOrBivalentSpec = {
    task1: 'or',
    task2: 'mov',
    csi: 200,
    dur_ch1: 300,
    dur_ch2: 300,
    soa: 150,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0.5, ch2_task: 0.6, ch2_distractor: 0 },
    dir: { ch1_task: 0, ch1_distractor: 180, ch2_task: 0, ch2_distractor: 0 },
};
const dualOrBivalentParams = buildTrialParams(dualOrBivalentSpec);
// task1=or: or1 = ch1_task, mov1 = ch1_distractor
assert(dualOrBivalentParams.coh_or_1 === 0.8, 'or-bivalent: or1 coherence = 0.8');
assert(dualOrBivalentParams.coh_mov_1 === 0.5, 'or-bivalent: mov1 (distractor) coherence = 0.5');
assert(dualOrBivalentParams.dur_or_1 === 300, 'or-bivalent: or1 duration preserved');
assert(dualOrBivalentParams.dur_mov_1 === 300, 'or-bivalent: mov1 (distractor) duration preserved');
// task2=mov: mov2 = ch2_task, or2 = ch2_distractor (silenced)
assert(dualOrBivalentParams.coh_mov_2 === 0.6, 'or-bivalent: mov2 coherence = 0.6');
assert(dualOrBivalentParams.coh_or_2 === 0, 'or-bivalent: or2 silenced');
// mov1 is active (coh=0.5), end = 200+300 = 500
// SE: mov2_abs = start_mov_2 + mov1.end = start_mov_2 + 500
// Desired = csi + soa = 200 + 150 = 350
// start_mov_2 = 350 - 500 = -150
assert(dualOrBivalentParams.start_mov_2 === -150,
    `or-bivalent: mov2 offset = -150, got ${dualOrBivalentParams.start_mov_2}`);

// ============================================================
section('generateDualCanvasBlockTrials — unknown t2Rule throws descriptive error');

const unknownT2Config = {
    ...dualCanvasSwitchConfig,
    blockId: 'test_unknown_t2',
    t2Rule: 'unknown_rule',
};
let threwOnUnknownT2 = false;
let unknownT2ErrorMsg = '';
try {
    generateDualCanvasBlockTrials(unknownT2Config, 5);
} catch (e) {
    threwOnUnknownT2 = true;
    unknownT2ErrorMsg = e.message;
}
assert(threwOnUnknownT2, 'unknown t2Rule throws');
assert(unknownT2ErrorMsg.includes('unknown_rule'), 'error message includes the invalid t2Rule value');

// ============================================================
section('generateSidedTrials — pure or block (startTask=or)');

const altPureOrConfig = {
    ...alternatingConfig,
    blockId: 'test_alt_pure_or',
    switchRate: 0,
    startTask: 'or',
};
const altPureOrTrials = generateSidedTrials(altPureOrConfig, 10);
for (const t of altPureOrTrials) {
    assert(t.meta.t1_task === 'or', `alt pure or: task=${t.meta.t1_task}`);
    assert(t.seParams.coh_or_1 === 0.8, `alt pure or: coh_or_1=0.8, got ${t.seParams.coh_or_1}`);
    assert(t.seParams.coh_mov_1 === 0, `alt pure or: coh_mov_1=0 (silenced), got ${t.seParams.coh_mov_1}`);
    // Silenced pathway duration should be zeroed
    assert(t.seParams.dur_mov_1 === 0, `alt pure or: dur_mov_1=0 (silenced)`);
}

// ============================================================
section('generateSidedTrials — earlyResolve defaults to false');

const baselineNoER = { ...baselineConfig, blockId: 'test_bl_no_er' };
delete baselineNoER.earlyResolve;
const blNoERTrials = generateSidedTrials(baselineNoER, 3);
for (const t of blNoERTrials) {
    assert(t.meta.earlyResolve === false, 'baseline PRP: earlyResolve defaults to false');
}

// ============================================================
section('buildSingleCanvasSpec — or task routing');

const orCanvasSpec = buildSingleCanvasSpec('or', 200, 1000, 1000, 0.8, 180, null, null);
assert(orCanvasSpec.task1 === 'or', 'or spec: task1 is or');
assert(orCanvasSpec.coherence.ch1_task === 0.8, 'or spec: ch1_task coherence');
assert(orCanvasSpec.dir.ch1_task === 180, 'or spec: ch1_task direction is 180');
// Feed through buildTrialParams and verify routing
const orCanvasParams = buildTrialParams(orCanvasSpec);
assert(orCanvasParams.coh_or_1 === 0.8, 'or spec→params: coh_or_1 = 0.8');
assert(orCanvasParams.dir_or_1 === 180, 'or spec→params: dir_or_1 = 180');
assert(orCanvasParams.coh_mov_1 === 0, 'or spec→params: coh_mov_1 = 0 (silenced)');
assert(orCanvasParams.dur_mov_1 === 0, 'or spec→params: dur_mov_1 = 0 (silenced)');

// ============================================================
section('buildSingleCanvasSpec — bivalent or task with distractor');

const orBivSpec = buildSingleCanvasSpec('or', 100, 500, 500, 0.8, 0, 0.4, 180);
assert(orBivSpec.coherence.ch1_distractor === 0.4, 'or bivalent: distractor coherence 0.4');
assert(orBivSpec.dir.ch1_distractor === 180, 'or bivalent: distractor direction 180');
const orBivParams = buildTrialParams(orBivSpec);
// task1=or: or1 gets ch1_task, mov1 gets ch1_distractor
assert(orBivParams.coh_or_1 === 0.8, 'or bivalent→params: or1 = 0.8');
assert(orBivParams.coh_mov_1 === 0.4, 'or bivalent→params: mov1 (distractor) = 0.4');
assert(orBivParams.dir_mov_1 === 180, 'or bivalent→params: mov1 direction = 180');
assert(orBivParams.dur_mov_1 === 500, 'or bivalent→params: mov1 duration preserved');

// ============================================================
section('buildTimingParams — verified through buildTrialParams edge cases');

// soa = dur_ch1 → relative offset should be 0 for active ch2 when ch1 counterpart is active
const soaEqualsDurSpec = {
    task1: 'mov',
    task2: 'or',
    csi: 100,
    dur_ch1: 300,
    dur_ch2: 300,
    soa: 300,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0.8, ch2_task: 0.6, ch2_distractor: 0 },
    dir: { ch1_task: 0, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
};
const soaEqualsParams = buildTrialParams(soaEqualsDurSpec);
// or1 active (coh=0.8, distractor pathway), end = 100+300 = 400
// desired ch2 start = csi + soa = 100+300 = 400
// offset = 400 - 400 = 0
assert(soaEqualsParams.start_or_2 === 0,
    `soa=dur_ch1: or2 offset = 0, got ${soaEqualsParams.start_or_2}`);

// soa = 0 → ch2 starts at same time as ch1
const soaZeroSpec = {
    task1: 'mov',
    task2: 'or',
    csi: 200,
    dur_ch1: 300,
    dur_ch2: 300,
    soa: 0,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0.6, ch2_distractor: 0 },
    dir: { ch1_task: 0, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
};
const soaZeroParams = buildTrialParams(soaZeroSpec);
// or1 silenced (coh=0 → dur=0, end=0). SE: or2_abs = start_or_2 + 0 = start_or_2
// desired = csi + soa = 200 + 0 = 200
assert(soaZeroParams.start_or_2 === 200,
    `soa=0: or2 offset = 200 (absolute), got ${soaZeroParams.start_or_2}`);
assert(soaZeroParams.start_go_2 === 200, `soa=0: go2 at csi`);
assert(soaZeroParams.start_2 === 200, `soa=0: cue2 at csi`);

// ============================================================
// NEW: generateFactorialSequence
// ============================================================

section('generateFactorialSequence — single factor');

const singleFactor = generateFactorialSequence(12, { transition: ['Repeat', 'Switch'] });
assert(singleFactor.length === 12, 'single factor: correct length');
const repeatCount = singleFactor.filter(c => c.transition === 'Repeat').length;
const switchCount = singleFactor.filter(c => c.transition === 'Switch').length;
assert(repeatCount === 6, `single factor: 6 Repeat cells, got ${repeatCount}`);
assert(switchCount === 6, `single factor: 6 Switch cells, got ${switchCount}`);

// ============================================================
section('generateFactorialSequence — two factors (2x2)');

const twoFactors = generateFactorialSequence(20, {
    transition: ['Repeat', 'Switch'],
    soa: [100, 600],
});
assert(twoFactors.length === 20, 'two factors: correct length');
// 4 cells, 20/4 = 5 reps each
const cellCounts2x2 = {};
for (const c of twoFactors) {
    const key = `${c.transition}_${c.soa}`;
    cellCounts2x2[key] = (cellCounts2x2[key] || 0) + 1;
}
assert(Object.keys(cellCounts2x2).length === 4, '2x2: exactly 4 unique cells');
assert(cellCounts2x2['Repeat_100'] === 5, '2x2: Repeat/100 has 5 reps');
assert(cellCounts2x2['Repeat_600'] === 5, '2x2: Repeat/600 has 5 reps');
assert(cellCounts2x2['Switch_100'] === 5, '2x2: Switch/100 has 5 reps');
assert(cellCounts2x2['Switch_600'] === 5, '2x2: Switch/600 has 5 reps');

// ============================================================
section('generateFactorialSequence — three factors (2x2x2)');

const threeFactors = generateFactorialSequence(24, {
    transition: ['Repeat', 'Switch'],
    soa: [100, 600],
    congruency: ['congruent', 'incongruent'],
});
assert(threeFactors.length === 24, 'three factors: correct length');
// 8 cells, 24/8 = 3 reps each
const cellCounts2x2x2 = {};
for (const c of threeFactors) {
    const key = `${c.transition}_${c.soa}_${c.congruency}`;
    cellCounts2x2x2[key] = (cellCounts2x2x2[key] || 0) + 1;
}
assert(Object.keys(cellCounts2x2x2).length === 8, '2x2x2: exactly 8 unique cells');
for (const [key, count] of Object.entries(cellCounts2x2x2)) {
    assert(count === 3, `2x2x2: cell ${key} has 3 reps, got ${count}`);
}

// ============================================================
section('generateFactorialSequence — remainder when not perfectly divisible');

// 10 trials, 4 cells: 2 full reps (8) + 2 random remainder
const remainder = generateFactorialSequence(10, {
    transition: ['Repeat', 'Switch'],
    soa: [100, 600],
});
assert(remainder.length === 10, 'remainder: correct length');
// Each cell should have at least 2 (from full reps) and at most 4 (2 + both remainder items)
const remCounts = {};
for (const c of remainder) {
    const key = `${c.transition}_${c.soa}`;
    remCounts[key] = (remCounts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(remCounts)) {
    assert(count >= 2, `remainder: cell ${key} has at least 2, got ${count}`);
    assert(count <= 4, `remainder: cell ${key} has at most 4, got ${count}`);
}
// Total should be 10
const remTotal = Object.values(remCounts).reduce((a, b) => a + b, 0);
assert(remTotal === 10, `remainder: total is 10, got ${remTotal}`);

// ============================================================
section('generateFactorialSequence — empty factors');

const empty = generateFactorialSequence(5, {});
assert(empty.length === 5, 'empty factors: correct length');
assert(empty.every(c => Object.keys(c).length === 0), 'empty factors: all empty objects');

// ============================================================
section('generateFactorialSequence — single cell (1x1)');

const singleCell = generateFactorialSequence(8, { transition: ['Repeat'] });
assert(singleCell.length === 8, 'single cell: correct length');
assert(singleCell.every(c => c.transition === 'Repeat'), 'single cell: all Repeat');

// ============================================================
section('generateFactorialSequence — shuffled (not in product order)');

// With 100 trials and 2 cells, probability of all Repeat first is vanishingly small
const shuffleCheck = generateFactorialSequence(100, { transition: ['Repeat', 'Switch'] });
// Check that the first 50 aren't all Repeat (would indicate no shuffle)
const first50Repeat = shuffleCheck.slice(0, 50).every(c => c.transition === 'Repeat');
assert(!first50Repeat, 'shuffled: not all Repeat in first half');

// ============================================================
// NEW: deriveTasksFromTransitions
// ============================================================

section('deriveTasksFromTransitions — basic');

const derived = deriveTasksFromTransitions(['First', 'Repeat', 'Switch', 'Switch', 'Repeat'], 'mov');
assert(derived.length === 5, 'derived: correct length');
assert(derived[0] === 'mov', 'derived: starts with mov');
assert(derived[1] === 'mov', 'derived: Repeat keeps mov');
assert(derived[2] === 'or', 'derived: Switch flips to or');
assert(derived[3] === 'mov', 'derived: Switch flips back to mov');
assert(derived[4] === 'mov', 'derived: Repeat keeps mov');

// ============================================================
section('deriveTasksFromTransitions — all Repeat');

const allRepeat = deriveTasksFromTransitions(['First', 'Repeat', 'Repeat', 'Repeat'], 'or');
assert(allRepeat.every(t => t === 'or'), 'all Repeat: all or');

// ============================================================
section('deriveTasksFromTransitions — all Switch');

const allSwitch = deriveTasksFromTransitions(['First', 'Switch', 'Switch', 'Switch'], 'mov');
assert(allSwitch[0] === 'mov', 'all Switch: starts mov');
assert(allSwitch[1] === 'or', 'all Switch: trial 2 is or');
assert(allSwitch[2] === 'mov', 'all Switch: trial 3 is mov');
assert(allSwitch[3] === 'or', 'all Switch: trial 4 is or');

// ============================================================
section('deriveTasksFromTransitions — roundtrip with classifyTransitions');

const roundtripStart = 'or';
const roundtripTransitions = ['First', 'Switch', 'Repeat', 'Switch', 'Repeat', 'Repeat'];
const roundtripTasks = deriveTasksFromTransitions(roundtripTransitions, roundtripStart);
const reclassified = classifyTransitions(roundtripTasks);
for (let i = 0; i < roundtripTransitions.length; i++) {
    assert(reclassified[i] === roundtripTransitions[i],
        `roundtrip: index ${i} — ${reclassified[i]} === ${roundtripTransitions[i]}`);
}

// ============================================================
// NEW: generateSequenceVectors
// ============================================================

// Shared base config for generateSequenceVectors tests
const gsvBaseConfig = {
    blockId: 'test_gsv',
    blockType: 'mixed',
    paradigm: 'single-task',
    sequenceType: 'Random',
    switchRate: 50,
    startTask: null,
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'fixed', value: 500 },
};

section('generateSequenceVectors — stochastic: vector lengths');

const gsvStochastic = generateSequenceVectors(gsvBaseConfig, 30);
assert(gsvStochastic.task1.length === 30, 'stochastic: task1 length');
assert(gsvStochastic.task2.length === 30, 'stochastic: task2 length');
assert(gsvStochastic.transition.length === 30, 'stochastic: transition length');
assert(gsvStochastic.soa.length === 30, 'stochastic: soa length');
assert(gsvStochastic.iti.length === 30, 'stochastic: iti length');
assert(gsvStochastic.congruency.length === 30, 'stochastic: congruency length');

// ============================================================
section('generateSequenceVectors — stochastic: single-task T2 is null');

assert(gsvStochastic.task2.every(t => t === null), 'stochastic single-task: all task2 null');

// ============================================================
section('generateSequenceVectors — stochastic: first transition is First');

assert(gsvStochastic.transition[0] === 'First', 'stochastic: first transition is First');

// ============================================================
section('generateSequenceVectors — stochastic: SOA null when no soa config');

const gsvNoSOA = generateSequenceVectors({ ...gsvBaseConfig, blockId: 'test_gsv_no_soa' }, 10);
assert(gsvNoSOA.soa.every(s => s === null), 'no soa config: all null');

// ============================================================
section('generateSequenceVectors — missing congruency defaults to univalent');

const gsvNoCong = { ...gsvBaseConfig, blockId: 'test_gsv_no_cong' };
delete gsvNoCong.congruency;
const vecNoCong = generateSequenceVectors(gsvNoCong, 10);
assert(vecNoCong.congruency.every(c => c === 'univalent'), 'missing congruency: all univalent');

// ============================================================
section('generateSequenceVectors — dual-task: T2 defaults to switch');

const gsvDualTask = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_dual',
    paradigm: 'dual-task',
    task1: 'mov',
    soa: { type: 'choice', value: 100, params: [100, 600] },
}, 20);
for (let i = 0; i < 20; i++) {
    assert(gsvDualTask.task2[i] === switchTask(gsvDualTask.task1[i]),
        `dual-task default: task2 is switchTask(task1) at trial ${i+1}`);
}

// ============================================================
section('generateSequenceVectors — dual-canvas: T2 defaults to independent');

const gsvDualCanvas = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_dc',
    paradigm: 'dual-canvas',
    rso: 'disjoint',
    soa: { type: 'fixed', value: 100 },
}, 60);
// With independent T2 over 60 trials, expect both same and different pairings
const dcHasSame = gsvDualCanvas.task1.some((t, i) => t === gsvDualCanvas.task2[i]);
const dcHasDiff = gsvDualCanvas.task1.some((t, i) => t !== gsvDualCanvas.task2[i]);
assert(dcHasSame, 'dual-canvas independent: has some same-task pairings');
assert(dcHasDiff, 'dual-canvas independent: has some different-task pairings');

// ============================================================
section('generateSequenceVectors — dual-canvas: transitions reflect T1-T2 match');

for (let i = 0; i < gsvDualCanvas.task1.length; i++) {
    const expected = gsvDualCanvas.task1[i] === gsvDualCanvas.task2[i] ? 'Repeat' : 'Switch';
    assert(gsvDualCanvas.transition[i] === expected,
        `dual-canvas transition[${i}]: ${gsvDualCanvas.transition[i]} === ${expected}`);
}

// ============================================================
section('generateSequenceVectors — prp-baseline: task1 null, task2 has actual task');

const gsvBaseline = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_bl',
    paradigm: 'prp-baseline',
    switchRate: 0,
    startTask: 'mov',
    soa: { type: 'fixed', value: 100 },
}, 10);
assert(gsvBaseline.task1.every(t => t === null), 'prp-baseline: all task1 null');
assert(gsvBaseline.task2.every(t => t === 'mov'), 'prp-baseline: all task2 mov');

// ============================================================
section('generateSequenceVectors — effectiveStartTask: dual-task uses task1 field');

const gsvDTStart = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_dt_start',
    paradigm: 'dual-task',
    task1: 'or',
    startTask: null,
    switchRate: 0,
    soa: { type: 'fixed', value: 100 },
}, 10);
// task1 field is 'or', so all task1 should be 'or'
assert(gsvDTStart.task1.every(t => t === 'or'), 'dual-task start: uses task1 field, all or');

// ============================================================
section('generateSequenceVectors — effectiveStartTask: single-task uses startTask (null = random)');

// Over 50 runs, null startTask should produce both mov and or
let gsvSeenMov = false, gsvSeenOr = false;
for (let i = 0; i < 50; i++) {
    const v = generateSequenceVectors({
        ...gsvBaseConfig,
        blockId: 'test_gsv_st_random',
        startTask: null,
        switchRate: 0,
    }, 1);
    if (v.task1[0] === 'mov') gsvSeenMov = true;
    if (v.task1[0] === 'or') gsvSeenOr = true;
}
assert(gsvSeenMov, 'single-task null startTask: saw mov');
assert(gsvSeenOr, 'single-task null startTask: saw or');

// ============================================================
section('generateSequenceVectors — Factorial: switchRate validation');

let threwOnBadRate = false;
try {
    generateSequenceVectors({
        ...gsvBaseConfig,
        blockId: 'test_gsv_bad_rate',
        sequenceType: 'Factorial',
        switchRate: 75,
    }, 10);
} catch (e) {
    threwOnBadRate = true;
}
assert(threwOnBadRate, 'Factorial throws on switchRate 75');

// switchRate 0 should NOT throw
let threwOnZeroRate = false;
try {
    generateSequenceVectors({
        ...gsvBaseConfig,
        blockId: 'test_gsv_zero_rate',
        sequenceType: 'Factorial',
        switchRate: 0,
        startTask: 'mov',
    }, 10);
} catch (e) {
    threwOnZeroRate = true;
}
assert(!threwOnZeroRate, 'Factorial does not throw on switchRate 0');

// ============================================================
section('generateSequenceVectors — Factorial: pure block (switchRate=0, all Repeat)');

const gsvFactPure = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_fact_pure',
    sequenceType: 'Factorial',
    switchRate: 0,
    startTask: 'mov',
    iti: { type: 'choice', params: [100, 600] },
}, 10);
assert(gsvFactPure.transition[0] === 'First', 'Factorial pure: first is First');
assert(gsvFactPure.transition.slice(1).every(t => t === 'Repeat'), 'Factorial pure: rest are Repeat');
assert(gsvFactPure.task1.every(t => t === 'mov'), 'Factorial pure: all mov');
// ITI should still be crossed
const factPureITI = new Set(gsvFactPure.iti);
assert(factPureITI.has(100) && factPureITI.has(600), 'Factorial pure: ITI crossed');
assert(gsvFactPure.iti.filter(v => v === 100).length === 5, 'Factorial pure: balanced ITI 100');
assert(gsvFactPure.iti.filter(v => v === 600).length === 5, 'Factorial pure: balanced ITI 600');

// ============================================================
section('generateSequenceVectors — Factorial: transition x SOA crossed');

const gsvFactCrossed = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_fact_crossed',
    sequenceType: 'Factorial',
    switchRate: 50,
    startTask: 'mov',
    soa: { type: 'choice', params: [100, 600] },
    iti: { type: 'fixed', value: 500 },
}, 20);
assert(gsvFactCrossed.transition[0] === 'First', 'Factorial crossed: first is First');
// After first trial, check balanced cells (ignoring first which is forced to First)
// 20 trials, 4 cells (2 trans x 2 soa). First trial forced to First.
// Count transition x SOA cells for trials 1-19 (index 1+)
const factCellCounts = {};
for (let i = 1; i < 20; i++) {
    const key = `${gsvFactCrossed.transition[i]}_${gsvFactCrossed.soa[i]}`;
    factCellCounts[key] = (factCellCounts[key] || 0) + 1;
}
// The factorial crossing gives 5 of each cell in the pool of 20, but trial 0's
// transition was forced to First (overwriting one Repeat or Switch). So 19 trials
// remain with the original SOA values but a modified transition[0].
// Total Repeat + Switch in trials 1..19 should be 19
const factNonFirstCount = Object.values(factCellCounts).reduce((a, b) => a + b, 0);
assert(factNonFirstCount === 19, `Factorial crossed: 19 non-First trials, got ${factNonFirstCount}`);
// SOA should be perfectly balanced across all 20 trials (First override doesn't touch SOA)
const soa100Count = gsvFactCrossed.soa.filter(s => s === 100).length;
const soa600Count = gsvFactCrossed.soa.filter(s => s === 600).length;
assert(soa100Count === 10, `Factorial crossed: 10 SOA=100, got ${soa100Count}`);
assert(soa600Count === 10, `Factorial crossed: 10 SOA=600, got ${soa600Count}`);

// ============================================================
section('generateSequenceVectors — Factorial: congruency crossed');

const gsvFactCong = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_fact_cong',
    sequenceType: 'Factorial',
    switchRate: 50,
    startTask: 'mov',
    congruency: { conditions: ['congruent', 'incongruent'], proportions: [0.5, 0.5] },
    iti: { type: 'fixed', value: 500 },
}, 24);
// 2 transitions x 2 congruencies = 4 cells, 24/4 = 6 each
const congCounts = {};
for (const c of gsvFactCong.congruency) {
    congCounts[c] = (congCounts[c] || 0) + 1;
}
assert(congCounts['congruent'] === 12, `Factorial cong: 12 congruent, got ${congCounts['congruent']}`);
assert(congCounts['incongruent'] === 12, `Factorial cong: 12 incongruent, got ${congCounts['incongruent']}`);

// ============================================================
section('generateSequenceVectors — Factorial: task sequence consistent with transitions');

// After deriveTasksFromTransitions, reclassifying should match (except First)
for (let i = 1; i < gsvFactCrossed.task1.length; i++) {
    const prev = gsvFactCrossed.task1[i - 1];
    const curr = gsvFactCrossed.task1[i];
    const expected = curr === prev ? 'Repeat' : 'Switch';
    assert(gsvFactCrossed.transition[i] === expected,
        `Factorial task-transition consistency: trial ${i+1} ${prev}->${curr} = ${expected}`);
}

// ============================================================
section('generateSequenceVectors — Factorial: non-crossed factors use fallback sampling');

const gsvFactFallback = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_fact_fb',
    sequenceType: 'Factorial',
    switchRate: 50,
    startTask: 'mov',
    soa: { type: 'fixed', value: 200 },  // fixed, so not crossed
    iti: { type: 'choice', params: [100, 600] },  // choice, so crossed
}, 10);
// SOA should be sampled from fixed distribution (all 200)
assert(gsvFactFallback.soa.every(s => s === 200),
    'Factorial fallback: fixed SOA all 200');
// ITI should be crossed (balanced)
assert(gsvFactFallback.iti.filter(v => v === 100).length === 5,
    'Factorial fallback: ITI 100 balanced');

// ============================================================
section('generateSequenceVectors — Factorial: SOA null when no soa config');

const gsvFactNoSOA = generateSequenceVectors({
    ...gsvBaseConfig,
    blockId: 'test_gsv_fact_no_soa',
    sequenceType: 'Factorial',
    switchRate: 0,
    startTask: 'mov',
}, 8);
assert(gsvFactNoSOA.soa.every(s => s === null), 'Factorial no soa: all null');

// ============================================================
// NEW: Integration — generateBlockTrials with Factorial
// ============================================================

section('generateBlockTrials — Factorial: balanced SOA and transitions');

const factBlockConfig = {
    blockId: 'test_fact_block',
    blockType: 'mixed',
    paradigm: 'single-task',
    sequenceType: 'Factorial',
    switchRate: 50,
    startTask: 'mov',
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    rso: 'disjoint',
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'fixed', value: 500 },
};

const factTrials = generateBlockTrials(factBlockConfig, 20);
assert(factTrials.length === 20, 'Factorial block: 20 trials');

// All SOAs should be null for single-task
assert(factTrials.every(t => t.meta.soa === null), 'Factorial block: SOA null for single-task');

// First trial is First
assert(factTrials[0].meta.transitionType === 'First', 'Factorial block: first is First');

// Transitions (excluding first) should be balanced: ~9-10 Repeat, ~9-10 Switch
const factRepeat = factTrials.filter(t => t.meta.transitionType === 'Repeat').length;
const factSwitch = factTrials.filter(t => t.meta.transitionType === 'Switch').length;
// 20 trials: 1 First + 19 distributed. Original pool has 10R/10S, one becomes First.
assert(factRepeat + factSwitch === 19,
    `Factorial block: 19 non-First transitions, got ${factRepeat + factSwitch}`);

// SE params should be valid
for (const t of factTrials) {
    for (const [k, v] of Object.entries(t.seParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `Factorial block: seParams.${k} not NaN/undefined`);
    }
}

// ============================================================
section('generateBlockTrials — Factorial: dual-task PRP with crossed SOA');

const factPRPConfig = {
    blockId: 'test_fact_prp',
    blockType: 'prp',
    paradigm: 'dual-task',
    sequenceType: 'Factorial',
    switchRate: 50,
    task1: 'mov',
    startTask: null,
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    rso: 'disjoint',
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0.6, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'fixed', value: 500 },
    soa: { type: 'choice', value: 100, params: [100, 600] },
};

const factPRPTrials = generateBlockTrials(factPRPConfig, 20);
assert(factPRPTrials.length === 20, 'Factorial PRP: 20 trials');

// SOA should be balanced
const prpSOA100 = factPRPTrials.filter(t => t.meta.soa === 100).length;
const prpSOA600 = factPRPTrials.filter(t => t.meta.soa === 600).length;
assert(prpSOA100 === 10, `Factorial PRP: 10 SOA=100, got ${prpSOA100}`);
assert(prpSOA600 === 10, `Factorial PRP: 10 SOA=600, got ${prpSOA600}`);

// T2 should always be switch of T1 (default t2Rule for dual-task)
for (const t of factPRPTrials) {
    assert(t.meta.t2_task === switchTask(t.meta.t1_task),
        `Factorial PRP: T2 is switch of T1`);
}

// ============================================================
section('generateBlockTrials — Factorial: pure block (switchRate=0)');

const factPureBlockConfig = {
    ...factBlockConfig,
    blockId: 'test_fact_pure_block',
    switchRate: 0,
    startTask: 'or',
};

const factPureTrials = generateBlockTrials(factPureBlockConfig, 12);
assert(factPureTrials.length === 12, 'Factorial pure block: 12 trials');
assert(factPureTrials.every(t => t.meta.t1_task === 'or'), 'Factorial pure block: all or');
assert(factPureTrials[0].meta.transitionType === 'First', 'Factorial pure block: first is First');
assert(factPureTrials.slice(1).every(t => t.meta.transitionType === 'Repeat'),
    'Factorial pure block: rest are Repeat');

// ============================================================
// NEW: Integration — generateSidedTrials with Factorial
// ============================================================

section('generateSidedTrials — Factorial: alternating with crossed ITI');

const factAltConfig = {
    blockId: 'test_fact_alt',
    blockType: 'mixed',
    paradigm: 'alternating',
    sequenceType: 'Factorial',
    switchRate: 50,
    startTask: 'mov',
    earlyResolve: true,
    csi: 200,
    stimulusDuration: 2500,
    responseWindow: 2500,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    iti: { type: 'choice', params: [100, 600] },
};

const factAltTrials = generateSidedTrials(factAltConfig, 20);
assert(factAltTrials.length === 20, 'Factorial alternating: 20 trials');

// SOA should be null for alternating
assert(factAltTrials.every(t => t.meta.soa === null), 'Factorial alternating: SOA null');

// ITI should be balanced
const altITI100 = factAltTrials.filter(t => t.meta.iti === 100).length;
const altITI600 = factAltTrials.filter(t => t.meta.iti === 600).length;
assert(altITI100 === 10, `Factorial alternating: 10 ITI=100, got ${altITI100}`);
assert(altITI600 === 10, `Factorial alternating: 10 ITI=600, got ${altITI600}`);

// Sides alternate
for (let i = 0; i < factAltTrials.length; i++) {
    const expected = (i % 2 === 0) ? 'left' : 'right';
    assert(factAltTrials[i].meta.side === expected,
        `Factorial alternating: trial ${i+1} side=${factAltTrials[i].meta.side}`);
}

// No NaN/undefined in SE params
for (const t of factAltTrials) {
    for (const [k, v] of Object.entries(t.seParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `Factorial alternating: seParams.${k} not NaN/undefined`);
    }
}

// ============================================================
section('generateSidedTrials — Factorial: prp-baseline with crossed SOA');

const factBlConfig = {
    blockId: 'test_fact_bl',
    blockType: 'prp-baseline',
    paradigm: 'prp-baseline',
    sequenceType: 'Factorial',
    switchRate: 0,
    startTask: 'mov',
    earlyResolve: true,
    csi: 200,
    stimulusDuration: 2500,
    responseWindow: 2500,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0, ch2_distractor: 0 },
    iti: { type: 'fixed', value: 1000 },
    soa: { type: 'choice', params: [100, 600] },
};

const factBlTrials = generateSidedTrials(factBlConfig, 10);
assert(factBlTrials.length === 10, 'Factorial baseline: 10 trials');

// SOA should be balanced
const blSOA100 = factBlTrials.filter(t => t.meta.soa === 100).length;
const blSOA600 = factBlTrials.filter(t => t.meta.soa === 600).length;
assert(blSOA100 === 5, `Factorial baseline: 5 SOA=100, got ${blSOA100}`);
assert(blSOA600 === 5, `Factorial baseline: 5 SOA=600, got ${blSOA600}`);

// Task remapping: t1 null, t2 has actual task
assert(factBlTrials.every(t => t.meta.t1_task === null), 'Factorial baseline: all t1_task null');
assert(factBlTrials.every(t => t.meta.t2_task === 'mov'), 'Factorial baseline: all t2_task mov');
assert(factBlTrials.every(t => t.meta.side === 'right'), 'Factorial baseline: all side right');

// ============================================================
// NEW: Integration — generateDualCanvasBlockTrials with Factorial
// ============================================================

section('generateDualCanvasBlockTrials — Factorial: crossed SOA');

const factDCConfig = {
    blockId: 'test_fact_dc',
    blockType: 'prp',
    paradigm: 'dual-canvas',
    sequenceType: 'Factorial',
    switchRate: 50,
    startTask: null,
    rso: 'disjoint',
    t2Rule: 'switch',
    earlyResolve: true,
    csi: 200,
    stimulusDuration: 300,
    responseWindow: 2000,
    coherence: { ch1_task: 0.8, ch1_distractor: 0, ch2_task: 0.6, ch2_distractor: 0 },
    congruency: { conditions: ['univalent'], proportions: [1.0] },
    iti: { type: 'fixed', value: 500 },
    soa: { type: 'choice', params: [100, 600] },
};

const factDCTrials = generateDualCanvasBlockTrials(factDCConfig, 20);
assert(factDCTrials.length === 20, 'Factorial dual-canvas: 20 trials');

// SOA balanced
const dcSOA100 = factDCTrials.filter(t => t.meta.soa === 100).length;
const dcSOA600 = factDCTrials.filter(t => t.meta.soa === 600).length;
assert(dcSOA100 === 10, `Factorial dual-canvas: 10 SOA=100, got ${dcSOA100}`);
assert(dcSOA600 === 10, `Factorial dual-canvas: 10 SOA=600, got ${dcSOA600}`);

// t2Rule=switch: all trials should have opposite tasks
for (const t of factDCTrials) {
    assert(t.meta.t1_task !== t.meta.t2_task, 'Factorial dual-canvas switch: T1 !== T2');
    // With switch rule, transitions are always Switch
    assert(t.meta.transitionType === 'Switch', 'Factorial dual-canvas switch: transition is Switch');
}

// Return shape preserved
assert(factDCTrials[0].leftSeParams !== undefined, 'Factorial dual-canvas: has leftSeParams');
assert(factDCTrials[0].rightSeParams !== undefined, 'Factorial dual-canvas: has rightSeParams');

// No NaN/undefined
for (const t of factDCTrials) {
    for (const [k, v] of Object.entries(t.leftSeParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `Factorial dual-canvas: leftSeParams.${k} not NaN/undefined`);
    }
    for (const [k, v] of Object.entries(t.rightSeParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `Factorial dual-canvas: rightSeParams.${k} not NaN/undefined`);
    }
}

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
