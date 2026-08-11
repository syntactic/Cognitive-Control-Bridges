// advancement_rates.js — exact pass rates for the training advancement criterion.
//
// Run: node analysis/advancement_rates.js
//
// WHY THIS EXISTS. The "across the cap" pass rates for the advancement
// criterion were originally derived as 1 - (1 - p_window)^3, i.e. as though the
// 48-trial cap were three DISJOINT 16-trial windows. It is not. `runBlock`'s
// loop condition is
//
//     i < trials.length && (!isTraining || !meetsAdvancementCriterion(blockOutcomes, ...))
//
// so the rolling window is re-evaluated before every trial from trial 16 on:
// 33 OVERLAPPING opportunities to pass, not 3 independent ones. Every across-cap
// number so derived was therefore understated, some by a lot (10/16 at p = .50 is
// 76.2%, not the 53.9% that justified rejecting it — the conclusion survives, the
// arithmetic did not).
//
// METHOD. Exact, not sampled. The stopping rule depends only on the last
// `windowSize` outcomes, so the process is a Markov chain on the last
// windowSize - 1 = 15 outcomes: 2^15 = 32768 states, 33 steps. We track the
// distribution over "still running" states and accumulate absorbed mass each
// step. Runs in well under a second and gives closed-form answers, so the
// figures can be reproduced exactly rather than re-sampled to within a Monte
// Carlo error bar.
//
// State encoding: an integer whose bit k is the outcome k+1 trials ago. Bit 0 is
// the most recent trial. After the first `windowSize` trials the full window is
// (state << 1 | newOutcome) over windowSize bits.

/**
 * Exact probability of meeting `threshold`-of-`windowSize` at some point within
 * `cap` trials, for i.i.d. per-trial success probability `p`.
 *
 * The criterion is evaluated BEFORE each trial over everything run so far
 * (mirroring runBlock), so the first evaluation is after trial `windowSize` and
 * the last is after trial `cap`.
 *
 * @returns {{ passRate: number, perWindow: number, meanTrials: number }}
 *   perWindow is the single-window figure P(X >= threshold | X ~ Bin(windowSize, p)),
 *   kept alongside so the two are never quoted interchangeably again.
 */
function advancementRate(p, { windowSize = 16, threshold = 14, cap = 48 } = {}) {
    const histBits = windowSize - 1;
    const numStates = 1 << histBits;
    const histMask = numStates - 1;

    // popcount over the low `histBits` bits, precomputed once.
    const popcount = new Uint8Array(numStates);
    for (let s = 1; s < numStates; s++) {
        popcount[s] = popcount[s >> 1] + (s & 1);
    }

    // Distribution over states of the last `histBits` outcomes, conditional on
    // the stage still running. Index = state, value = probability mass.
    let live = new Float64Array(numStates);
    let nextLive = new Float64Array(numStates);
    live[0] = 1;                 // no trials run yet; leading zeros are "not yet run"
    let passed = 0;              // absorbed mass: criterion met, stage stopped
    let expectedTrials = 0;      // sum over trials of P(trial actually runs)

    for (let trial = 1; trial <= cap; trial++) {
        // Every live path runs this trial.
        let liveMass = 0;
        for (let s = 0; s < numStates; s++) liveMass += live[s];
        expectedTrials += liveMass;

        nextLive.fill(0);
        for (let s = 0; s < numStates; s++) {
            const mass = live[s];
            if (mass === 0) continue;
            for (const outcome of [1, 0]) {
                const w = mass * (outcome ? p : 1 - p);
                if (w === 0) continue;
                // Full window over windowSize bits: history shifted up, new outcome in bit 0.
                const fullWindow = ((s << 1) | outcome) & ((1 << windowSize) - 1);
                const nextState = fullWindow & histMask;
                // The criterion can only fire once a full window exists.
                if (trial >= windowSize && popcount[fullWindow >> histBits] + popcount[nextState] >= threshold) {
                    passed += w;
                } else {
                    nextLive[nextState] += w;
                }
            }
        }
        [live, nextLive] = [nextLive, live];
    }

    // Single-window binomial, for explicit contrast with the across-cap figure.
    let perWindow = 0;
    for (let k = threshold; k <= windowSize; k++) {
        perWindow += binom(windowSize, k) * Math.pow(p, k) * Math.pow(1 - p, windowSize - k);
    }

    return { passRate: passed, perWindow, meanTrials: expectedTrials };
}

function binom(n, k) {
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
}

// ------------------------------------------------------------
// Pass rates for the advancement thresholds actually in use
// ------------------------------------------------------------

if (require.main === module) {
    const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
    const row = (label, p, opts) => {
        const r = advancementRate(p, opts);
        const { windowSize = 16, threshold = 14 } = opts || {};
        console.log(
            `  ${label.padEnd(38)} ${threshold}/${windowSize}  p=${p.toFixed(3)}  ` +
            `per-window ${pct(r.perWindow, 3).padStart(8)}   ` +
            `across-cap ${pct(r.passRate, 3).padStart(8)}   ` +
            `mean trials ${r.meanTrials.toFixed(1)}`
        );
    };

    console.log('\nGUESSING FLOORS — what a participant who has learned nothing achieves');
    row('single-response, pure guess', 0.5);
    row('two-response, guessing BOTH', 0.25, { threshold: 12 });
    row('single-response @ the rejected 10/16', 0.5, { threshold: 10 });

    console.log('\nPRP S8 (two responses; trial passes iff BOTH correct)');
    for (const perTask of [0.80, 0.85, 0.90, 0.95]) {
        row(`competent participant @ ${pct(perTask, 0)}/task`, perTask * perTask, { threshold: 12 });
        row(`  same participant under 14/16`, perTask * perTask, { threshold: 14 });
    }

    console.log('\nSINGLE-RESPONSE STAGES (S2-S6, switching S8) at 14/16');
    for (const p of [0.70, 0.75, 0.80, 0.85, 0.90, 0.95]) {
        row(`true accuracy ${pct(p, 0)}`, p);
    }

    console.log('\nS2/S3 EXCLUSION EXPOSURE — P(flagged) = 1 - across-cap pass rate');
    console.log('  (cp_taskswitch_asym ramps S3 to CP_HARD = 0.3)');
    for (const p of [0.80, 0.75, 0.70]) {
        const r = advancementRate(p);
        console.log(`    true accuracy ${pct(p, 0)}  ->  flagged ${pct(1 - r.passRate)}`);
    }
    console.log();
}

module.exports = { advancementRate };
