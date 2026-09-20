// training_stages.js — Builders for the training stages S2-S6 and S8.
//
// The training design is a graded shaping sequence with the same structure
// across all five canonical paradigms; only key maps, response-set
// organization, and test-level coherences differ, supplied per-paradigm via a
// `spec` object.
//
// Loaded right after engine.js and before the config files so a config file
// (canonical_paradigms.js et al.) can call these builders at load time. Nothing
// here reads a global from a later-loading file.
//
// Scope: the shared single-task stages S2, S3, S3a, S3b, S3c, S3d, S4, S6
// (buildSharedTrainingStages) and the paradigm-final S8
// (buildParadigmFinalStage). The shared dual-task PRP stage S7 is assembled in
// cpBuildTrainingSession via buildParadigmFinalStage(kind:'prp'), since the
// shared builder here only emits single-task stages.
//
// Stage ids are non-contiguous: S1, S5, and S7 were dropped from the design,
// and the surviving stages keep their original ids (the `stage` value is a CSV
// column) rather than being renumbered. S7's id was reused for the shared PRP
// stage.
//
// canonical_paradigms.js calls both builders to assemble the five participant-
// facing training + test sessions (CP_*_TRAINING_SESSION).

// ============================================================
// Defaults
// ============================================================
// Everything below is overridable through `spec`. Values that encode a judgment
// call rather than a design directive are flagged INFERRED.

const TRAINING_STAGE_DEFAULTS = {
    // Training runs slower than the test blocks (CP_DEFAULTS, 2000 ms) so a naive
    // participant has room to learn the mappings without being timed out — the
    // filter should catch non-engagement, not first-time slowness (Sebastian,
    // 09-10 l.52/76). The test phase speeds back up to 2000 ms.
    stimulusDuration: 2500,
    responseWindow: 2500,
    iti: { type: 'uniform', value: 500, params: [400, 600] },

    // INFERRED. S4's CSI must be positive so the cue acts as an advance signal,
    // not a go signal. Deliberately not the test CSI (cp_prp tests at 0, which
    // can't teach "the border tells you what's coming"); matching the test CSI
    // is S8's job.
    cueCsi: 200,

    rampFrom: 1.0, // start the ramp at ceiling coherence

    feedback: true, // on throughout training (needed for shaping), off in test
    earlyResolve: true,
    // INFERRED. The 14/16 criterion must measure first-response accuracy. With
    // acceptFirstResponse false, extractSingleStreamResponse keeps looking for a
    // correct press and scores the trial 'corrected', which counts toward
    // criterion — so a participant could pass by pressing both keys every trial.
    acceptFirstResponse: true,

    mapping: 'parallel',
    blockIdPrefix: 'train',
};

// Task order is fixed for every paradigm: movement (S2) then orientation (S3).
// This is independent of which task is the paradigm's target — S3 runs even for
// Stroop, so the distractor dimension gets a trained response pathway too.
const TRAINING_FIRST_TASK = 'mov';
const TRAINING_SECOND_TASK = 'or';

// TRAINING_-prefixed to avoid a name clash: top-level `const`s from every
// <script> in index.html share one global lexical scope, and switch-frequency.js
// already declares an identical `UNIVALENT_CONGRUENCY`. A duplicate declaration
// throws SyntaxError and silently drops the whole later-loading script.
const TRAINING_UNIVALENT_CONGRUENCY = { conditions: ['univalent'], proportions: [1.0] };
const TRAINING_BOTH_CONGRUENCIES = {
    conditions: ['congruent', 'incongruent'],
    proportions: [0.5, 0.5],
};

/**
 * Build the shared training stages for one paradigm, in run order: S2, S3 (learn
 * each pathway), S3a, S3b (Stroop — single-task conflict), S3c, S3d (the cued
 * border shown on one already-known task, no switching yet), S4 (switching,
 * univalent), S6 (switching, bivalent + conflict).
 *
 * All eight are single-canvas, one task on screen at a time — including for cp_prp,
 * whose test block is dual-task. The dual-task PRP stage and the paradigm-specific
 * S8 are assembled in cpBuildTrainingSession, so `spec` has no `paradigm` field.
 *
 * @param {object} spec
 * @param {{mov: object, or: object}} spec.keyMaps - direction->key maps per task,
 *   same shape as blockConfig.keyMaps.
 * @param {string} spec.rso - 'identical' | 'disjoint', matching the test block.
 * @param {{mov: number, or: number}} spec.testCoherenceTarget - per-task target
 *   coherence; the bottom of the S2-S4 ramp.
 * @param {number} spec.testCoherenceDistractor - distractor coherence for the
 *   bivalent stages.
 * @param {object} [spec.testCoherence] - the test block's full coherence object,
 *   used verbatim by S6 so the participant meets every test level first.
 *   Defaults to { target: testCoherenceTarget, distractor: testCoherenceDistractor }.
 * @param {object} [spec.levelFactors] - the test block's levelFactors, so S6
 *   samples all coherence levels. Omit for single-level paradigms.
 * @param {object} [spec.congruency] - congruency config for S6. Defaults to 50/50.
 * @param {number} [spec.cueCsi] - positive CSI for S4-S6 (see defaults above).
 * @param {number} [spec.rampLength] - ramp length in trials; defaults to
 *   TRAINING_RAMP_LENGTH (session_helpers.js), resolved by runBlock.
 * @param {object} [spec.instructions] - optional copy keyed by stage id.
 * @param {object} [spec.demos] - optional instruction-screen cartoon specs keyed
 *   by stage id. The depiction depends on the paradigm's key maps, which this
 *   file doesn't know. Consumed by createInstructionDemo; see cpTrainingDemos.
 * @returns {object[]} blockDef-shaped objects [S2, S3, S3a, S3b, S3c, S3d, S4, S6], in order.
 */
function buildSharedTrainingStages(spec) {
    if (!spec || !spec.keyMaps || !spec.keyMaps.mov || !spec.keyMaps.or) {
        throw new Error(
            'buildSharedTrainingStages: spec.keyMaps must provide both mov and or maps',
        );
    }
    if (!spec.rso) {
        throw new Error('buildSharedTrainingStages: spec.rso is required (matches the test block)');
    }
    const target = spec.testCoherenceTarget;
    if (!target || typeof target.mov !== 'number' || typeof target.or !== 'number') {
        throw new Error(
            'buildSharedTrainingStages: spec.testCoherenceTarget must be { mov: number, or: number }',
        );
    }
    if (typeof spec.testCoherenceDistractor !== 'number') {
        throw new Error('buildSharedTrainingStages: spec.testCoherenceDistractor must be a number');
    }

    const cfg = { ...TRAINING_STAGE_DEFAULTS, ...spec };
    if (!(cfg.cueCsi > 0)) {
        throw new Error(
            `buildSharedTrainingStages: cueCsi must be positive (got ${cfg.cueCsi}). ` +
                'The cued stages (S3c onward) make the cue an ADVANCE signal; a zero CSI cannot.',
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
    // and stop once the 14/16 rolling window is met, so it sets no numTrials.
    const criterionStage = (stage, blockConfig) => ({
        blockConfig: { ...commonConfig, blockId: `${cfg.blockIdPrefix}_${stage}`, ...blockConfig },
        isTraining: true,
        phase: 'training',
        stage,
        instructions: instructionsFor(stage),
        demo: demoFor(stage),
    });

    // Single-task pathway stages (S2, S3): univalent, CSI 0, cue suppressed (cueDuration: 0),
    // coherence ramped from ceiling down to that task's test level.
    const pathwayStage = (stage, task) =>
        criterionStage(stage, {
            csi: 0,
            cueDuration: 0,
            switchRate: 0,
            startTask: task,
            task1: task,
            congruency: TRAINING_UNIVALENT_CONGRUENCY,
            coherence: { target: target[task], distractor: 0 },
            coherenceRamp: { from: cfg.rampFrom, to: target[task], rampLength: cfg.rampLength },
        });

    // Stroop stages (S3a, S3b): one sustained task against a congruent/incongruent
    // distractor. switchRate 0 keeps that task on screen throughout (what separates
    // Stroop from the switching stages); the distractor makes the stimulus bivalent
    // and both congruencies introduce response conflict. No ramp — S2/S3 already
    // brought the target to test level. Cues suppressed since the task is known.
    const stroopStage = (stage, task) =>
        criterionStage(stage, {
            csi: 0,
            cueDuration: 0,
            switchRate: 0,
            startTask: task,
            task1: task,
            congruency: TRAINING_BOTH_CONGRUENCIES,
            coherence: { target: target[task], distractor: cfg.testCoherenceDistractor },
        });

    // Hand-practice stages (S3c, S3d): one already-known task with the cue now
    // SHOWN — positive CSI, cues NOT suppressed. switchRate 0 keeps the task
    // fixed, so the only new thing is the informative border. Under the fourcue
    // scheme the border's SIDE also starts indicating the response hand (varyHand,
    // stamped downstream), so this splits what used to land all at once at S4 (cue
    // debut, switching, and side->hand) into a gentler ramp. No ramp: S2/S3 already
    // brought each task to test level. Univalent, no distractor — same stimulus as
    // the pathway stages, just cued.
    const handPracticeStage = (stage, task) =>
        criterionStage(stage, {
            csi: cfg.cueCsi,
            switchRate: 0,
            startTask: task,
            task1: task,
            congruency: TRAINING_UNIVALENT_CONGRUENCY,
            coherence: { target: target[task], distractor: 0 },
        });

    const stages = [];

    // --- S2/S3: one S-R pathway at a time --------------------------------
    // Timed, criterion-gated single-task stages, movement then orientation. S2
    // opens at ceiling coherence and ramps down to test level.
    stages.push(pathwayStage('S2', TRAINING_FIRST_TASK));
    stages.push(pathwayStage('S3', TRAINING_SECOND_TASK));

    // --- S3a/S3b: Stroop — single-task conflict --------------------------
    // Every participant (not just Stroop ones) meets sustained single-task conflict
    // here, right after learning each mapping. Kept separate from S2/S3 on purpose:
    // an S2/S3 failure means "hasn't learned the mapping" (the exclusion rule),
    // which must not be confounded with "finds conflict hard".
    stages.push(stroopStage('S3a', TRAINING_FIRST_TASK));
    stages.push(stroopStage('S3b', TRAINING_SECOND_TASK));

    // --- S3c/S3d: the informative border on one known task ---------------
    // The cue is shown for the first time here, still on a fixed single task, so
    // the participant reads the border without also having to track a switch. This
    // is the split that made S4 (below) less steep.
    stages.push(handPracticeStage('S3c', TRAINING_FIRST_TASK));
    stages.push(handPracticeStage('S3d', TRAINING_SECOND_TASK));

    // --- S4: switching introduction --------------------------------------
    // Switching is the new skill, introduced univalent to isolate it (even though
    // S3a/S3b already showed bivalence) — each new skill gets its own gentle ramp.
    // The cue is no longer new (it debuted at S3c/S3d); what changes here is that
    // the task starts mixing. Positive CSI puts the cue before the stimulus;
    // startTask null + switchRate 50 mixes the tasks. Ramp is per-task; runBlock
    // resolves it per trial.
    stages.push(
        criterionStage('S4', {
            csi: cfg.cueCsi,
            switchRate: 50,
            startTask: null,
            congruency: TRAINING_UNIVALENT_CONGRUENCY,
            coherence: { target: target, distractor: 0 },
            coherenceRamp: { from: cfg.rampFrom, to: target, rampLength: cfg.rampLength },
        }),
    );

    // --- S6: bivalence + conflict, now while switching -------------------
    // What's new here is the combination: a bivalent, conflicting stimulus while
    // the border also switches tasks. Also the first exposure to every test
    // coherence level, so novelty isn't confounded with the coherence factor in
    // the test block. (Id stays S6 even though S5 was dropped.)
    stages.push(
        criterionStage('S6', {
            csi: cfg.cueCsi,
            switchRate: 50,
            startTask: null,
            congruency: spec.congruency || TRAINING_BOTH_CONGRUENCIES,
            coherence: spec.testCoherence || {
                target: target,
                distractor: cfg.testCoherenceDistractor,
            },
            ...(spec.levelFactors ? { levelFactors: spec.levelFactors } : {}),
        }),
    );

    return stages;
}

// ============================================================
// S8 — the paradigm-specific final stage
// ============================================================
//
// S8 is where the five paradigms diverge: its content is the participant's
// actual test block. Three shapes cover all five paradigms:
//
//   kind          paradigms                             content
//   ------------  ------------------------------------  --------------------------
//   'switching'   cp_taskswitch, cp_taskswitch_asym     mixed switch/repeat at the
//                                                       test switch rate, test CSI
//   'prp'         cp_prp                                both tasks in one trial,
//                                                       fixed order, SOA introduced,
//                                                       test CSI
//   'stroop'      cp_stroop, cp_stroop_crossed          short run at exactly the
//                                                       test parameters
//
// Like buildSharedTrainingStages, a pure builder over an explicit spec, reading
// no paradigm constant and not wired into any SESSION array.

const PARADIGM_FINAL_STAGE_DEFAULTS = {
    // Still a training stage (S7/S8), so it keeps training's slower 2500 ms window
    // rather than the 2000 ms test speed (Sebastian, 09-10 l.52). The step down to
    // test speed happens at the training->test boundary, not within training.
    stimulusDuration: 2500,
    responseWindow: 2500,
    iti: { type: 'uniform', value: 500, params: [400, 600] },
    feedback: true, // on for all of training including S8, off in the test block
    // Both response-regime flags, always together. See assertValidBlockConfig.
    earlyResolve: true,
    acceptFirstResponse: true,
    mapping: 'parallel',
    blockIdPrefix: 'train',
    // Stochastic, not Factorial: a criterion stage stops once its rolling window
    // is met, which would truncate a crossed design's cells anyway.
    sequenceType: 'Random',
    // PRP's S8 is the only two-response stage, and isTrialCorrectForAdvancement
    // requires both responses correct, so it's harder per trial. It uses 12/16
    // rather than the shared 14/16 default: 12/16 clears a weaker-but-competent
    // participant (80%/task) at a workable rate while keeping a stricter guessing
    // floor than 14/16 does. Recompute the exact rates with
    // analysis/advancement_rates.js, not by hand. Per-stage override only.
    prpAdvancementThreshold: 12,
};

/**
 * Build the paradigm-specific final training stage (S8) for one paradigm.
 *
 * @param {object} spec
 * @param {'switching'|'prp'|'stroop'} spec.kind - which of the three S8 shapes
 * @param {{mov: object, or: object}} spec.keyMaps - same maps as the test block
 * @param {string} spec.rso - 'identical' | 'disjoint', matching the test block
 * @param {number} spec.csi - the paradigm's test CSI (200 for switching/Stroop,
 *   0 for PRP). Unlike S4-S6's cueCsi, S8 must match the test block exactly.
 * @param {object} spec.coherence - the test block's coherence object, verbatim
 * @param {object} [spec.levelFactors] - the test block's levelFactors, verbatim
 * @param {object} [spec.congruency] - congruency config; defaults to 50/50
 * @param {number} [spec.switchRate] - required for kind 'switching': the test
 *   block's switch rate
 * @param {string} [spec.task] - required for kind 'stroop': the target dimension
 *   ('mov' | 'or')
 * @param {string} [spec.t1Task] - required for kind 'prp': the condition's T1
 *   task (A = mov, B = or)
 * @param {number[]} [spec.soaLevels] - required for kind 'prp': the test block's
 *   SOA levels. Passed in rather than read from the CP_PRP_SOA_LEVELS placeholder.
 * @param {number} [spec.soaScheduleLength] - trials the descending-SOA intro
 *   spans; defaults to TRAINING_SOA_SCHEDULE_LENGTH in runBlock.
 * @param {number} [spec.numTrials] - override the rehearsal trial count. Ignored
 *   by the two criterion kinds (capped by runBlock at TRAINING_CAP).
 * @param {number} [spec.prpAdvancementThreshold] - kind 'prp' only: correct trials
 *   required in the 16-trial window. Defaults to 12; the other kinds inherit the
 *   shared 14/16.
 * @param {string} [spec.instructions] - stage copy. None is written here.
 * @param {object} [spec.demo] - instruction-screen cartoon spec, same contract as
 *   buildSharedTrainingStages' `demos` (see cpTrainingDemos).
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
        throw new Error(
            "buildParadigmFinalStage: spec.coherence is required (the test block's own)",
        );
    }
    // 0 is a legitimate CSI (cp_prp), so this checks for a number, not truthiness.
    if (!(typeof spec.csi === 'number') || spec.csi < 0) {
        throw new Error(
            `buildParadigmFinalStage: spec.csi must be the paradigm's test CSI in ms (got ${spec.csi})`,
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
        return stageDef(
            {
                paradigm: 'single-task',
                switchRate: cfg.switchRate,
                startTask: null,
            },
            { isTraining: true },
        );
    }

    if (cfg.kind === 'stroop') {
        // Criterion-gated like 'switching' and 'prp'. S6 is bivalent switching; the
        // Stroop test is single-task under conflict (crossed Stroop also adds a
        // distractor-coherence crossing S6 never shows), so it isn't the same task.
        // Ungated, at-chance participants reached the test. isTraining caps at
        // TRAINING_CAP and early-stops on the shared 14/16; numTrials would be dead.
        if (cfg.task !== 'mov' && cfg.task !== 'or') {
            throw new Error(
                "buildParadigmFinalStage: kind 'stroop' requires spec.task ('mov'|'or'), " +
                    "the paradigm's target dimension",
            );
        }
        return stageDef(
            {
                paradigm: 'single-task',
                switchRate: 0,
                startTask: cfg.task,
                task1: cfg.task,
            },
            { isTraining: true },
        );
    }

    if (cfg.kind === 'prp') {
        // Both tasks in one trial, fixed order for the participant's condition,
        // SOA introduced, test CSI (0).
        if (cfg.t1Task !== 'mov' && cfg.t1Task !== 'or') {
            throw new Error(
                "buildParadigmFinalStage: kind 'prp' requires spec.t1Task ('mov'|'or'), " +
                    "the condition's first task",
            );
        }
        if (!Array.isArray(cfg.soaLevels) || cfg.soaLevels.length === 0) {
            throw new Error(
                "buildParadigmFinalStage: kind 'prp' requires spec.soaLevels (the test " +
                    "block's SOA levels)",
            );
        }
        if (spec.coherenceRamp) {
            // A ramp is forbidden here (also caught by assertValidBlockConfig):
            // runBlock ramps T1's channel only, which on a dual-task block would
            // become a T1-difficulty manipulation crossed with SOA.
            throw new Error(
                "buildParadigmFinalStage: kind 'prp' must not carry a coherenceRamp. " +
                    'S8 shapes RESPONSE ORDER via the descending SOA schedule instead.',
            );
        }
        const descending = [...cfg.soaLevels].sort((a, b) => b - a);
        return stageDef(
            {
                paradigm: 'dual-task',
                // T1 fixed per condition, so T2 is always the other task (same rule
                // as the cp_prp test block).
                task1: cfg.t1Task,
                t2Rule: 'switch',
                switchRate: 0,
                startTask: null,
                // Fallback sampler for trials past the schedule; `value` is only
                // used if params are ever emptied.
                soa: {
                    type: 'choice',
                    value: descending[descending.length - 1],
                    params: cfg.soaLevels,
                },
                // Response-order shaping: open at the longest SOA, where "T1 then
                // T2" is self-evident, and descend to the shortest, where the two
                // responses overlap. runBlock imposes this via scheduledSoa; past
                // the schedule it falls back to mixed SOAs like the test block.
                soaSchedule: {
                    levels: cfg.soaLevels,
                    ...(cfg.soaScheduleLength !== undefined
                        ? { scheduleLength: cfg.soaScheduleLength }
                        : {}),
                },
            },
            {
                isTraining: true,
                // The only stage that overrides the shared 14/16 default. runBlock
                // hands this to both the stop-early predicate and the stage summary
                // so they can't disagree.
                advancementThreshold: cfg.prpAdvancementThreshold,
            },
        );
    }

    throw new Error(
        `buildParadigmFinalStage: unknown kind '${cfg.kind}' ` +
            "(expected 'switching' | 'prp' | 'stroop')",
    );
}
