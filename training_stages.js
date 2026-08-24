// training_stages.js — Generic builders for the training stages S2-S6 and S8
//
// The training design is a graded shaping sequence that is
// structurally IDENTICAL across all five canonical paradigms — only the key maps,
// the response-set organization, and the test-level coherences differ. This file
// translates that stage table into code exactly once; each paradigm supplies those
// differences through a `spec` object.
//
// Deliberately loaded right after engine.js and BEFORE the config files, so a
// config file (canonical_paradigms.js et al.) can call it at load time. Nothing in
// here reads a global from a later-loading file at load time.
//
// Scope: the shared single-task stages S2, S3, S3a, S3b, S4, S6
// (buildSharedTrainingStages) and the paradigm-final S8 (buildParadigmFinalStage).
// The shared dual-task PRP stage (S7) is assembled in cpBuildTrainingSession by
// calling buildParadigmFinalStage(kind:'prp') for every paradigm — it is not built
// here, because this builder emits only single-task stages.
//   - There is NO S1. It was a static, unspeeded 8-trial key-mapping drill; it was
//     dropped from the design 2026-08-25 (08-18 transcript l.92) because S2/S3 teach
//     the same maps under time pressure. Its id is retired rather than reused, so
//     the shared sequence now starts at S2 — the same "keep the id, tolerate a gap"
//     convention S7/S8 already follow ('stage' is a CSV column).
//   - There is NO S7. A comprehension check occupied that slot in the plan and was
//     never built; it was removed from the design 2026-08-10 and nothing replaces
//     it. S8 deliberately keeps its id rather than being renumbered: `stage` is a
//     CSV column and a `kind` mapping here, so the gap is cheaper than the churn.
//   - S8 is paradigm-specific by definition. Its builder lives
//     here too, and takes the paradigm's differences through its own spec, so that
//     no paradigm global is read at load time (see the load-order note above).
//
// canonical_paradigms.js calls both builders to assemble the five participant-
// facing training + test sessions (CP_*_TRAINING_SESSION).

// ============================================================
// Defaults and assumptions
// ============================================================
// Every value below is overridable through `spec`. The ones that encode a
// judgment call rather than a design directive are flagged INFERRED.

const TRAINING_STAGE_DEFAULTS = {
    stimulusDuration: 2000,
    responseWindow: 2000,
    iti: { type: 'uniform', value: 500, params: [400, 600] },

    // INFERRED. S4's CSI must be POSITIVE — that is what turns the cue
    // into an advance signal rather than a go signal. This is intentionally NOT
    // the paradigm's test CSI: cp_prp tests at csi 0, and a 0 CSI cannot teach
    // "the border tells you what's coming". Matching the test CSI is S8's job.
    cueCsi: 200,

    rampFrom: 1.0,               // start the ramp at ceiling ("unmistakable")

    // Feedback ON throughout training (required for shaping), OFF in test.
    feedback: true,
    // earlyResolve everywhere.
    earlyResolve: true,
    // INFERRED. The 14/16 criterion has to measure FIRST-response accuracy. With
    // acceptFirstResponse false, extractSingleStreamResponse keeps looking until a
    // correct press arrives and scores the trial 'corrected', which
    // isTrialCorrectForAdvancement counts as correct — a participant could reach
    // criterion by pressing both keys on every trial.
    acceptFirstResponse: true,

    mapping: 'parallel',
    blockIdPrefix: 'train',
};

// Task order is fixed for every paradigm: movement alone (S2), then orientation
// alone (S3) — first introduce the participant to the movement task, then to the
// orientation task. It does NOT track which task is a given paradigm's target:
// S3 runs even for Stroop, so that the distractor dimension has a trained
// response pathway.
const TRAINING_FIRST_TASK = 'mov';
const TRAINING_SECOND_TASK = 'or';

// TRAINING_-prefixed because top-level `const`s from every <script> in index.html
// share ONE global lexical scope: switch-frequency.js already declares an
// (identical) `UNIVALENT_CONGRUENCY`, and a duplicate top-level declaration makes
// the whole later-loading script fail to execute with a SyntaxError — silently
// removing every switch-frequency session from the page.
const TRAINING_UNIVALENT_CONGRUENCY = { conditions: ['univalent'], proportions: [1.0] };
// (TRAINING_CONGRUENT_ONLY was removed with the congruent-only S5 stage, 2026-08-25.)
const TRAINING_BOTH_CONGRUENCIES = {
    conditions: ['congruent', 'incongruent'], proportions: [0.5, 0.5],
};

/**
 * Build the shared training stages for one paradigm, in run order:
 * S2, S3 (learn each pathway), S3a, S3b (Stroop — single-task conflict), S4
 * (switching, univalent), S6 (switching, bivalent + conflict). Six stages.
 *
 * All six stages are single-canvas, one task on screen at a time — including for
 * cp_prp, whose test block is `dual-task`. The dual-task PRP training stage and
 * the paradigm-specific S8 are assembled OUTSIDE this builder (cpBuildTrainingSession),
 * so `spec` has no `paradigm` field: everything here is 'single-task'.
 *
 * @param {object} spec
 * @param {{mov: object, or: object}} spec.keyMaps - direction->key maps per task,
 *   same shape as blockConfig.keyMaps. Paradigm-specific (shared A/D for
 *   Stroop, disjoint task-tied keys for switching/PRP).
 * @param {string} spec.rso - 'identical' | 'disjoint', matching the test block.
 * @param {{mov: number, or: number}} spec.testCoherenceTarget - test-level target
 *   coherence per task. The bottom of the S2-S4 ramp and the S5 target level.
 * @param {number} spec.testCoherenceDistractor - test-level distractor coherence,
 *   used by the bivalent stages.
 * @param {object} [spec.testCoherence] - the test block's full coherence object,
 *   used verbatim by S6 so the participant meets every test level before the test
 *   block. Defaults to { target: testCoherenceTarget, distractor: testCoherenceDistractor }.
 * @param {object} [spec.levelFactors] - the test block's levelFactors, so S6
 *   samples all coherence levels. Omit for paradigms with a single level.
 * @param {object} [spec.congruency] - congruency config for S6. Defaults to 50/50.
 * @param {number} [spec.cueCsi] - positive CSI for S4-S6 (see defaults above).
 * @param {number} [spec.rampLength] - ramp length in trials; defaults to
 *   TRAINING_RAMP_LENGTH (session_helpers.js) when omitted, resolved by runBlock.
 * @param {object} [spec.instructions] - optional copy keyed by stage id
 *   ({ S2: '...', S3: '...' }). No copy is written here.
 * @param {object} [spec.demos] - optional instruction-screen cartoon specs keyed
 *   by stage id, same shape as `instructions` and for the same reason: the
 *   depiction depends on the paradigm's key maps, which this file does not know.
 *   Consumed by createInstructionDemo (instruction_demo.js); see cpTrainingDemos.
 * @returns {object[]} blockDef-shaped objects [S2, S3, S3a, S3b, S4, S6], in order.
 */
function buildSharedTrainingStages(spec) {
    if (!spec || !spec.keyMaps || !spec.keyMaps.mov || !spec.keyMaps.or) {
        throw new Error('buildSharedTrainingStages: spec.keyMaps must provide both mov and or maps');
    }
    if (!spec.rso) {
        throw new Error('buildSharedTrainingStages: spec.rso is required (matches the test block)');
    }
    const target = spec.testCoherenceTarget;
    if (!target || typeof target.mov !== 'number' || typeof target.or !== 'number') {
        throw new Error('buildSharedTrainingStages: spec.testCoherenceTarget must be { mov: number, or: number }');
    }
    if (typeof spec.testCoherenceDistractor !== 'number') {
        throw new Error('buildSharedTrainingStages: spec.testCoherenceDistractor must be a number');
    }

    const cfg = { ...TRAINING_STAGE_DEFAULTS, ...spec };
    if (!(cfg.cueCsi > 0)) {
        throw new Error(
            `buildSharedTrainingStages: cueCsi must be positive (got ${cfg.cueCsi}). ` +
            'S4 exists to make the cue an ADVANCE signal; a zero CSI cannot do that.'
        );
    }

    const instructionsFor = (stage) => (spec.instructions && spec.instructions[stage]) || null;
    const demoFor = (stage) => (spec.demos && spec.demos[stage]) || null;

    // Fields every stage shares. Anything a stage varies is spread over the top.
    const commonConfig = {
        blockType: 'training',
        paradigm: 'single-task',
        rso: cfg.rso,
        keyMaps: cfg.keyMaps,
        mapping: cfg.mapping,
        sequenceType: 'Random',
        stimulusDuration: cfg.stimulusDuration,
        responseWindow: cfg.responseWindow,
        iti: cfg.iti,
        feedback: cfg.feedback,
        earlyResolve: cfg.earlyResolve,
        acceptFirstResponse: cfg.acceptFirstResponse,
    };

    // A criterion stage: isTraining makes runBlock cap the block at TRAINING_CAP
    // and stop as soon as the 14/16 rolling window is met, so it sets no
    // numTrials of its own.
    const criterionStage = (stage, blockConfig) => ({
        blockConfig: { ...commonConfig, blockId: `${cfg.blockIdPrefix}_${stage}`, ...blockConfig },
        isTraining: true,
        phase: 'training',
        stage,
        instructions: instructionsFor(stage),
        demo: demoFor(stage),
    });

    // Single-task pathway stages (S2, S3): univalent, CSI 0, coherence ramped from
    // ceiling down to that task's test level.
    const pathwayStage = (stage, task) => criterionStage(stage, {
        csi: 0,
        switchRate: 0,
        startTask: task,
        task1: task,
        congruency: TRAINING_UNIVALENT_CONGRUENCY,
        coherence: { target: target[task], distractor: 0 },
        coherenceRamp: { from: cfg.rampFrom, to: target[task], rampLength: cfg.rampLength },
    });

    // Stroop stages (S3a, S3b): sustained SINGLE task against a congruent/
    // incongruent distractor. switchRate 0 keeps one task on screen throughout
    // (the defining feature of Stroop, vs. the switching stages below); the
    // distractor makes the stimulus bivalent; both congruencies introduce
    // response conflict. No ramp — S2/S3 already brought the target to test level,
    // and the distractor sits at its own test level. This is where conflict is
    // FIRST met, in the simplest possible setting (2026-08-25 reorder: Stroop is a
    // single task, so it belongs with the single-task stages, before switching).
    const stroopStage = (stage, task) => criterionStage(stage, {
        // csi 0 (like S2/S3): with only one task on screen the border has nothing
        // to predict, so it stays a non-predictive same-onset border here. The
        // PREDICTIVE cue is still first introduced at S4, keeping that narrative
        // intact — S2, S3, S3a, S3b all run at csi 0.
        csi: 0,
        switchRate: 0,
        startTask: task,
        task1: task,
        congruency: TRAINING_BOTH_CONGRUENCIES,
        coherence: { target: target[task], distractor: cfg.testCoherenceDistractor },
    });

    const stages = [];

    // --- S2/S3: one S-R pathway at a time --------------------------------
    // The sequence opens straight into the timed, criterion-gated single-task
    // stages. S1 — a static 8-trial unspeeded key-mapping drill — was dropped from
    // the design 2026-08-25: S2/S3 teach the same two maps under time pressure and
    // ramp coherence from ceiling, so the untimed pre-drill was redundant (see the
    // 08-18 transcript, l.92). S2 opens at ceiling coherence (coherenceRamp.from),
    // so removing S1 introduces no perceptual cliff. The first task is still
    // movement, per the fixed TRAINING_FIRST/SECOND order.
    stages.push(pathwayStage('S2', TRAINING_FIRST_TASK));
    stages.push(pathwayStage('S3', TRAINING_SECOND_TASK));

    // --- S3a/S3b: Stroop — single-task conflict (2026-08-25) --------------
    // Everyone meets sustained single-task conflict here, in task order (mov then
    // or), right after learning each mapping. This is what makes every participant
    // — not just Stroop ones — train the Stroop shape (08-18 l.121-128), and it is
    // deliberately SEPARATE from S2/S3: an S2/S3 cap failure means "has not learned
    // the mapping" (the exclusion rule), which must not be confounded with "finds
    // conflict hard".
    stages.push(stroopStage('S3a', TRAINING_FIRST_TASK));
    stages.push(stroopStage('S3b', TRAINING_SECOND_TASK));

    // --- S4: cue introduction --------------------------------------------
    // Switching is the NEW skill here, so it is introduced univalent to isolate it
    // — even though bivalence was already seen in S3a/S3b. This is the deliberate
    // "sawtooth": each new skill gets its own gentle ramp. CSI positive so the cue
    // precedes the stimulus; startTask null + switchRate 50 mixes the two tasks.
    // The ramp is per-task ({ mov, or }) — runBlock resolves it against the trial's
    // own task.
    stages.push(criterionStage('S4', {
        csi: cfg.cueCsi,
        switchRate: 50,
        startTask: null,
        congruency: TRAINING_UNIVALENT_CONGRUENCY,
        coherence: { target: target, distractor: 0 },
        coherenceRamp: { from: cfg.rampFrom, to: target, rampLength: cfg.rampLength },
    }));

    // --- S6: bivalence + conflict, now while SWITCHING --------------------
    // The old congruent-only S5 was dropped in the 2026-08-25 reorder: conflict is
    // no longer new here (S3a/S3b introduced it), so the gentle congruent-only
    // easing step is unnecessary. What is new is the COMBINATION — a bivalent,
    // conflicting stimulus while the border also switches tasks. Its id stays S6
    // (S5 is retired, like S1/S7) so the CSV `stage` column and existing block ids
    // are undisturbed. Also the first exposure to every test coherence level, so
    // novelty is not confounded with the coherence factor in the test block.
    stages.push(criterionStage('S6', {
        csi: cfg.cueCsi,
        switchRate: 50,
        startTask: null,
        congruency: spec.congruency || TRAINING_BOTH_CONGRUENCIES,
        coherence: spec.testCoherence
            || { target: target, distractor: cfg.testCoherenceDistractor },
        ...(spec.levelFactors ? { levelFactors: spec.levelFactors } : {}),
    }));

    return stages;
}

// ============================================================
// S8 — the paradigm-specific final stage
// ============================================================
//
// S8 is where the five paradigms diverge: it is the only stage whose content is
// the participant's actual test block. Three shapes cover all five paradigms:
//
//   kind          paradigms                             content
//   ------------  ------------------------------------  --------------------------
//   'switching'   cp_taskswitch, cp_taskswitch_asym     mixed switch/repeat at the
//                                                       test switch rate, test CSI
//   'prp'         cp_prp                                both tasks in one trial,
//                                                       fixed order, SOA introduced,
//                                                       test CSI
//   'stroop'   cp_stroop, cp_stroop_crossed          short run at exactly the
//                                                       test parameters
//
// Like buildSharedTrainingStages this is a pure builder over an explicit spec —
// it reads no paradigm constant — and it is NOT wired into any SESSION array.

const PARADIGM_FINAL_STAGE_DEFAULTS = {
    stimulusDuration: 2000,
    responseWindow: 2000,
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    // Feedback stays ON for training, including S8, and off in the test block.
    feedback: true,
    // Both response-regime flags, always together. See assertValidBlockConfig.
    earlyResolve: true,
    acceptFirstResponse: true,
    mapping: 'parallel',
    blockIdPrefix: 'train',
    // The Stroop rehearsal is 16 trials, no new content, and carries no
    // criterion — it is not an isTraining stage.
    stroopTrials: 16,
    // Stochastic rather than Factorial: a criterion stage stops as soon as the
    // rolling window is met, which would truncate a crossed design's cells anyway.
    sequenceType: 'Random',
    // PRP's S8 is the only TWO-response stage, and
    // isTrialCorrectForAdvancement requires BOTH responses correct, so a trial's
    // pass probability is a PRODUCT of the two per-task accuracies.
    //
    // All rates below are ACROSS THE 48-TRIAL CAP, not per window — runBlock
    // re-checks the criterion before every trial from 16 on, so a stage offers 33
    // overlapping windows. (An earlier version of this comment quoted per-window
    // figures as if they were cap figures and claimed 90%/task cleared 14/16 only
    // 39% of the time; the real number is 91.8%. Recompute with
    // analysis/advancement_rates.js rather than by hand.)
    //
    // The case that justifies 12/16 is the WEAKER competent participant, not the
    // typical one: at 80%/task (joint .64) a 14/16 stage passes only 26.4% of the
    // time and burns a mean of 43 of 48 trials, versus 81.1% under 12/16. At
    // 90%/task both thresholds are fine. 12/16 is also STRICTER on its guessing
    // floor than 14/16 is on its own — 0.059% (guessing both responses, p=.25)
    // versus 2.43% (p=.50) — so the looser-looking threshold is the safer one.
    // It is a per-stage override only; the shared default in session_helpers.js
    // stays 14.
    prpAdvancementThreshold: 12,
};

/**
 * Build the paradigm-specific final training stage (S8) for one paradigm.
 *
 * @param {object} spec
 * @param {'switching'|'prp'|'stroop'} spec.kind - which of the three S8 shapes
 * @param {{mov: object, or: object}} spec.keyMaps - same maps as the test block
 * @param {string} spec.rso - 'identical' | 'disjoint', matching the test block
 * @param {number} spec.csi - the paradigm's TEST CSI (200 for switching/Stroop,
 *   0 for PRP). Unlike S4-S6's cueCsi, S8 must match the test block exactly —
 *   that is the whole point of the stage.
 * @param {object} spec.coherence - the test block's coherence object, verbatim
 * @param {object} [spec.levelFactors] - the test block's levelFactors, verbatim
 * @param {object} [spec.congruency] - congruency config; defaults to 50/50
 * @param {number} [spec.switchRate] - REQUIRED for kind 'switching': the test
 *   block's switch rate
 * @param {string} [spec.task] - REQUIRED for kind 'stroop': the Stroop target
 *   dimension ('mov' | 'or')
 * @param {string} [spec.t1Task] - REQUIRED for kind 'prp': the T1 task for this
 *   participant's between-subjects condition (A = mov, B = or)
 * @param {number[]} [spec.soaLevels] - REQUIRED for kind 'prp': the test block's
 *   SOA levels. Passed in rather than read from CP_PRP_SOA_LEVELS, which is a
 *   placeholder pending advisor input.
 * @param {number} [spec.soaScheduleLength] - trials the descending-SOA
 *   introduction spans; defaults to TRAINING_SOA_SCHEDULE_LENGTH in runBlock.
 * @param {number} [spec.numTrials] - override the rehearsal trial count. Ignored
 *   by the two criterion kinds, which are capped by runBlock at TRAINING_CAP.
 * @param {number} [spec.prpAdvancementThreshold] - kind 'prp' only: correct
 *   trials required within the 16-trial window. Defaults to 12, matched on its
 *   guessing floor to the single-response 14/16; the other kinds deliberately
 *   emit nothing and inherit the shared 14/16.
 * @param {string} [spec.instructions] - stage copy. None is written here.
 * @param {object} [spec.demo] - instruction-screen cartoon spec for this stage,
 *   same contract as buildSharedTrainingStages' `demos` (see cpTrainingDemos).
 * @returns {object} one blockDef-shaped object, stage 'S8'
 */
function buildParadigmFinalStage(spec) {
    if (!spec || !spec.keyMaps || !spec.keyMaps.mov || !spec.keyMaps.or) {
        throw new Error('buildParadigmFinalStage: spec.keyMaps must provide both mov and or maps');
    }
    if (!spec.rso) {
        throw new Error('buildParadigmFinalStage: spec.rso is required (matches the test block)');
    }
    if (!spec.coherence) {
        throw new Error('buildParadigmFinalStage: spec.coherence is required (the test block\'s own)');
    }
    // 0 is a legitimate CSI (cp_prp), so this checks for a number, not truthiness.
    if (!(typeof spec.csi === 'number') || spec.csi < 0) {
        throw new Error(
            `buildParadigmFinalStage: spec.csi must be the paradigm's test CSI in ms (got ${spec.csi})`
        );
    }

    const cfg = { ...PARADIGM_FINAL_STAGE_DEFAULTS, ...spec };

    const commonConfig = {
        blockId: `${cfg.blockIdPrefix}_S8`,
        blockType: 'training',
        rso: cfg.rso,
        keyMaps: cfg.keyMaps,
        mapping: cfg.mapping,
        sequenceType: cfg.sequenceType,
        csi: cfg.csi,
        stimulusDuration: cfg.stimulusDuration,
        responseWindow: cfg.responseWindow,
        iti: cfg.iti,
        congruency: cfg.congruency || TRAINING_BOTH_CONGRUENCIES,
        coherence: cfg.coherence,
        feedback: cfg.feedback,
        earlyResolve: cfg.earlyResolve,
        acceptFirstResponse: cfg.acceptFirstResponse,
        ...(spec.levelFactors ? { levelFactors: spec.levelFactors } : {}),
    };

    const stageDef = (blockConfig, extra) => ({
        blockConfig: { ...commonConfig, ...blockConfig },
        phase: 'training',
        stage: 'S8',
        instructions: spec.instructions || null,
        demo: spec.demo || null,
        ...extra,
    });

    if (cfg.kind === 'switching') {
        // Mixed switch/repeat at CP_SWITCH_RATE, test CSI (200 ms).
        if (typeof cfg.switchRate !== 'number') {
            throw new Error("buildParadigmFinalStage: kind 'switching' requires spec.switchRate");
        }
        return stageDef({
            paradigm: 'single-task',
            switchRate: cfg.switchRate,
            startTask: null,
        }, { isTraining: true });
    }

    if (cfg.kind === 'stroop') {
        // Short rehearsal at exact test parameters (16 trials, no new
        // content). No criterion — there is nothing new to reach criterion ON,
        // and S6 already ran the same stimuli under conflict. Hence isTraining
        // false, which also means runBlock will not cap or early-stop it.
        if (cfg.task !== 'mov' && cfg.task !== 'or') {
            throw new Error(
                "buildParadigmFinalStage: kind 'stroop' requires spec.task ('mov'|'or'), " +
                'the paradigm\'s target dimension'
            );
        }
        return stageDef({
            paradigm: 'single-task',
            switchRate: 0,
            startTask: cfg.task,
            task1: cfg.task,
        }, { isTraining: false, numTrials: cfg.numTrials ?? cfg.stroopTrials });
    }

    if (cfg.kind === 'prp') {
        // Both tasks in one trial, fixed order for the participant's condition,
        // SOA introduced, test CSI (0).
        if (cfg.t1Task !== 'mov' && cfg.t1Task !== 'or') {
            throw new Error(
                "buildParadigmFinalStage: kind 'prp' requires spec.t1Task ('mov'|'or'), " +
                "the condition's first task"
            );
        }
        if (!Array.isArray(cfg.soaLevels) || cfg.soaLevels.length === 0) {
            throw new Error(
                "buildParadigmFinalStage: kind 'prp' requires spec.soaLevels (the test " +
                "block's SOA levels)"
            );
        }
        if (spec.coherenceRamp) {
            // Belt and braces with assertValidBlockConfig: a ramp is forbidden
            // here because runBlock ramps T1's channel only, which on a dual-task
            // block is a T1-difficulty manipulation crossed with SOA.
            throw new Error(
                "buildParadigmFinalStage: kind 'prp' must not carry a coherenceRamp. " +
                'S8 shapes RESPONSE ORDER via the descending SOA schedule instead.'
            );
        }
        const descending = [...cfg.soaLevels].sort((a, b) => b - a);
        return stageDef({
            paradigm: 'dual-task',
            // T1 is fixed per condition, so T2 is always the other task — the same
            // rule the cp_prp test block uses.
            task1: cfg.t1Task,
            t2Rule: 'switch',
            switchRate: 0,
            startTask: null,
            // The fallback sampler for trials past the schedule; `value` is only
            // read if params are ever emptied.
            soa: { type: 'choice', value: descending[descending.length - 1], params: cfg.soaLevels },
            // Response-order shaping: the stage OPENS at the longest SOA,
            // where "answer T1 then T2" is self-evident, and descends to the
            // shortest, where the two responses genuinely overlap. runBlock
            // imposes this on the SOA vector via scheduledSoa; after the schedule
            // the stage falls back to mixed SOAs, matching the test block.
            soaSchedule: {
                levels: cfg.soaLevels,
                ...(cfg.soaScheduleLength !== undefined
                    ? { scheduleLength: cfg.soaScheduleLength }
                    : {}),
            },
        }, {
            isTraining: true,
            // The ONLY stage that overrides the shared 14/16 default.
            // runBlock hands this to both the stop-early predicate and the stage
            // summary, so they cannot disagree.
            advancementThreshold: cfg.prpAdvancementThreshold,
        });
    }

    throw new Error(
        `buildParadigmFinalStage: unknown kind '${cfg.kind}' ` +
        "(expected 'switching' | 'prp' | 'stroop')"
    );
}
