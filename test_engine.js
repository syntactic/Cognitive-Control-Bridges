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
    assert(t.meta.task !== t.meta.task2,
        `switch: T1=${t.meta.task} differs from T2=${t.meta.task2}`);
    assert(t.meta.task2 === switchTask(t.meta.task),
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
    assert(t.meta.task === t.meta.task2,
        `same: T1=${t.meta.task} matches T2=${t.meta.task2}`);
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
const hasRepeatPairing = indTrials.some(t => t.meta.task === t.meta.task2);
const hasSwitchPairing = indTrials.some(t => t.meta.task !== t.meta.task2);
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
section('generateDualCanvasBlockTrials — crossCanvasCongruency');

// Check that crossCanvasCongruency is correctly computed from directions
for (const t of soaTrials) {
    const sameDir = t.meta.direction_1 === t.meta.direction_2;
    const expected = sameDir ? 'congruent' : 'incongruent';
    assert(t.meta.crossCanvasCongruency === expected,
        `congruency: directions ${t.meta.direction_1}/${t.meta.direction_2} → ${expected}`);
}

// ============================================================
section('generateDualCanvasBlockTrials — previousCrossCanvasCongruency');

assert(soaTrials[0].meta.previousCrossCanvasCongruency === null,
    'previousCongruency: null on first trial');
for (let i = 1; i < soaTrials.length; i++) {
    assert(soaTrials[i].meta.previousCrossCanvasCongruency === soaTrials[i-1].meta.crossCanvasCongruency,
        `previousCongruency: trial ${i+1} matches trial ${i}'s crossCanvasCongruency`);
}

// ============================================================
section('generateDualCanvasBlockTrials — coherence fallback');

// Default: both canvases use ch1_task (0.8) when leftCoherence/rightCoherence not set
const cohTrial = soaTrials[0];
assert(cohTrial.leftSeParams.coh_mov_1 === 0.8 || cohTrial.leftSeParams.coh_or_1 === 0.8,
    'coherence fallback: left canvas uses ch1_task=0.8');
assert(cohTrial.rightSeParams.coh_mov_1 === 0.8 || cohTrial.rightSeParams.coh_or_1 === 0.8,
    'coherence fallback: right canvas uses ch1_task=0.8');

// Override: leftCoherence/rightCoherence take precedence
const dualCanvasCustomCohConfig = {
    ...dualCanvasSwitchConfig,
    blockId: 'test_dual_coh',
    leftCoherence: 0.9,
    rightCoherence: 0.5,
    soa: { type: 'fixed', value: 100, params: [] },
};

const cohTrials = generateDualCanvasBlockTrials(dualCanvasCustomCohConfig, 10);
for (const t of cohTrials) {
    // Left canvas active pathway should have 0.9 coherence
    const leftActiveCoh = t.meta.task === 'mov' ? t.leftSeParams.coh_mov_1 : t.leftSeParams.coh_or_1;
    assert(leftActiveCoh === 0.9, `custom coherence: left=${leftActiveCoh}, expected 0.9`);
    // Right canvas active pathway should have 0.5 coherence
    const rightActiveCoh = t.meta.task2 === 'mov' ? t.rightSeParams.coh_mov_1 : t.rightSeParams.coh_or_1;
    assert(rightActiveCoh === 0.5, `custom coherence: right=${rightActiveCoh}, expected 0.5`);
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
// generateAlternatingBlockTrials
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

section('generateAlternatingBlockTrials — basic structure');

const altTrials = generateAlternatingBlockTrials(alternatingConfig, 20);
assert(altTrials.length === 20, 'generates correct number of trials');
assert(altTrials[0].seParams !== undefined, 'trial has seParams');
assert(altTrials[0].meta !== undefined, 'trial has meta');

// ============================================================
section('generateAlternatingBlockTrials — alternating sides');

for (let i = 0; i < altTrials.length; i++) {
    const expected = (i % 2 === 0) ? 'left' : 'right';
    assert(altTrials[i].meta.side === expected,
        `trial ${i+1}: side=${altTrials[i].meta.side}, expected ${expected}`);
}

// ============================================================
section('generateAlternatingBlockTrials — metadata fields');

for (const t of altTrials) {
    assert(t.meta.paradigm === 'alternating', 'paradigm is alternating');
    assert(t.meta.blockType === 'mixed', 'blockType is mixed');
    assert(t.meta.blockId === 'test_alternating', 'blockId matches config');
    assert(t.meta.task2 === null, 'task2 is null (single-task per trial)');
    assert(t.meta.congruency === 'univalent', 'congruency is univalent');
    assert(t.meta.earlyResolve === true, 'earlyResolve logged in meta');
    assert(t.meta.direction === 0 || t.meta.direction === 180,
        `direction is 0 or 180, got ${t.meta.direction}`);
    assert(t.meta.task === 'mov' || t.meta.task === 'or',
        `task is mov or or, got ${t.meta.task}`);
}

// ============================================================
section('generateAlternatingBlockTrials — earlyResolve defaults to false');

const altConfigNoER = { ...alternatingConfig, blockId: 'test_alt_no_er' };
delete altConfigNoER.earlyResolve;
const altTrialsNoER = generateAlternatingBlockTrials(altConfigNoER, 5);
for (const t of altTrialsNoER) {
    assert(t.meta.earlyResolve === false, 'earlyResolve defaults to false when not set');
}

// ============================================================
section('generateAlternatingBlockTrials — transition classification');

assert(altTrials[0].meta.transitionType === 'First', 'first trial is First');
for (let i = 1; i < altTrials.length; i++) {
    const prev = altTrials[i - 1].meta.task;
    const curr = altTrials[i].meta.task;
    const expected = curr === prev ? 'Repeat' : 'Switch';
    assert(altTrials[i].meta.transitionType === expected,
        `trial ${i+1}: task ${prev}→${curr}, transition=${altTrials[i].meta.transitionType}, expected ${expected}`);
}

// ============================================================
section('generateAlternatingBlockTrials — task sequence respects switchRate');

// With switchRate=50 over 100 trials, expect both repeats and switches
const altManyTrials = generateAlternatingBlockTrials(alternatingConfig, 100);
const altHasRepeat = altManyTrials.some(t => t.meta.transitionType === 'Repeat');
const altHasSwitch = altManyTrials.some(t => t.meta.transitionType === 'Switch');
assert(altHasRepeat, 'switchRate 50: has repeat transitions');
assert(altHasSwitch, 'switchRate 50: has switch transitions');

// switchRate=0: all repeats after first trial
const altPureConfig = { ...alternatingConfig, blockId: 'test_alt_pure', switchRate: 0, startTask: 'mov' };
const altPureTrials = generateAlternatingBlockTrials(altPureConfig, 20);
for (let i = 1; i < altPureTrials.length; i++) {
    assert(altPureTrials[i].meta.transitionType === 'Repeat',
        `pure block: trial ${i+1} is Repeat`);
    assert(altPureTrials[i].meta.task === 'mov',
        `pure block: trial ${i+1} is mov`);
}

// ============================================================
section('generateAlternatingBlockTrials — ITI sampling');

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
const altChoiceTrials = generateAlternatingBlockTrials(altChoiceITIConfig, 50);
const itiValues = new Set(altChoiceTrials.map(t => t.meta.iti));
assert(itiValues.has(100), 'choice iti: includes 100');
assert(itiValues.has(600), 'choice iti: includes 600');
assert(itiValues.size === 2, `choice iti: only 2 distinct values, got ${itiValues.size}`);

// ============================================================
section('generateAlternatingBlockTrials — SE params are single-channel only');

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
section('generateAlternatingBlockTrials — coherence in active pathway');

for (const t of altTrials) {
    if (t.meta.task === 'mov') {
        assert(t.seParams.coh_mov_1 === 0.8, `mov trial: coh_mov_1=0.8, got ${t.seParams.coh_mov_1}`);
        assert(t.seParams.coh_or_1 === 0, `mov trial: coh_or_1=0 (silenced)`);
    } else {
        assert(t.seParams.coh_or_1 === 0.8, `or trial: coh_or_1=0.8, got ${t.seParams.coh_or_1}`);
        assert(t.seParams.coh_mov_1 === 0, `or trial: coh_mov_1=0 (silenced)`);
    }
}

// ============================================================
section('generateAlternatingBlockTrials — no NaN or undefined in SE params');

for (const t of altTrials) {
    for (const [k, v] of Object.entries(t.seParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `seParams.${k} not NaN/undefined`);
    }
}

// ============================================================
// generateBaselinePRPTrials
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

section('generateBaselinePRPTrials — basic structure');

const blTrials = generateBaselinePRPTrials(baselineConfig, 20);
assert(blTrials.length === 20, 'generates correct number of trials');
assert(blTrials[0].seParams !== undefined, 'trial has seParams');
assert(blTrials[0].meta !== undefined, 'trial has meta');

// ============================================================
section('generateBaselinePRPTrials — all trials on right side');

for (const t of blTrials) {
    assert(t.meta.side === 'right', `side is right, got ${t.meta.side}`);
}

// ============================================================
section('generateBaselinePRPTrials — metadata fields');

for (const t of blTrials) {
    assert(t.meta.paradigm === 'prp-baseline', 'paradigm is prp-baseline');
    assert(t.meta.blockType === 'prp-baseline', 'blockType is prp-baseline');
    assert(t.meta.blockId === 'test_baseline', 'blockId matches config');
    assert(t.meta.task2 === null, 'task2 is null (single-task)');
    assert(t.meta.congruency === 'univalent', 'congruency is univalent');
    assert(t.meta.earlyResolve === true, 'earlyResolve logged in meta');
    assert(t.meta.direction === 0 || t.meta.direction === 180,
        `direction is 0 or 180, got ${t.meta.direction}`);
}

// ============================================================
section('generateBaselinePRPTrials — single task (switchRate 0)');

for (const t of blTrials) {
    assert(t.meta.task === 'mov', `task is mov (switchRate=0, startTask=mov), got ${t.meta.task}`);
}

// All transitions after first should be Repeat
assert(blTrials[0].meta.transitionType === 'First', 'first trial is First');
for (let i = 1; i < blTrials.length; i++) {
    assert(blTrials[i].meta.transitionType === 'Repeat',
        `trial ${i+1}: transitionType is Repeat, got ${blTrials[i].meta.transitionType}`);
}

// ============================================================
section('generateBaselinePRPTrials — orientation baseline');

const baselineOrConfig = { ...baselineConfig, blockId: 'test_baseline_or', startTask: 'or' };
const blOrTrials = generateBaselinePRPTrials(baselineOrConfig, 10);
for (const t of blOrTrials) {
    assert(t.meta.task === 'or', `or baseline: task is or, got ${t.meta.task}`);
}

// ============================================================
section('generateBaselinePRPTrials — SOA sampling');

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
const blFixedTrials = generateBaselinePRPTrials(baselineFixedSOA, 5);
for (const t of blFixedTrials) {
    assert(t.meta.soa === 300, `fixed SOA: got ${t.meta.soa}, expected 300`);
}

// ============================================================
section('generateBaselinePRPTrials — ITI sampling');

for (const t of blTrials) {
    assert(t.meta.iti === 1000, `fixed iti: got ${t.meta.iti}, expected 1000`);
}

// ============================================================
section('generateBaselinePRPTrials — SE params are single-channel only');

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
section('generateBaselinePRPTrials — coherence in active pathway');

for (const t of blTrials) {
    // All trials are mov (switchRate=0, startTask=mov)
    assert(t.seParams.coh_mov_1 === 0.8, `mov trial: coh_mov_1=0.8, got ${t.seParams.coh_mov_1}`);
    assert(t.seParams.coh_or_1 === 0, `mov trial: coh_or_1=0 (silenced)`);
}

// ============================================================
section('generateBaselinePRPTrials — no NaN or undefined in SE params');

for (const t of blTrials) {
    for (const [k, v] of Object.entries(t.seParams)) {
        assert(v !== undefined && (typeof v !== 'number' || !isNaN(v)),
            `seParams.${k} not NaN/undefined`);
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
