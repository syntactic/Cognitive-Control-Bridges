// session.js — Multi-block session runner and data collection
// Depends on: engine.js, session_helpers.js (loaded first), superExperiment global (from bundle.js)

const Session = (() => {
    // State
    let allTrialData = [];
    // One stage-summary object per training stage run this session
    // Populated by runSession from runBlock's return value.
    let trainingLog = [];
    let currentSessionDef = null;
    let isRunning = false;
    let canvasContainer = null;

    // SE package references
    let spriteConfig = null; // populated by loadSprites() when sprite mode is on
    async function loadSprites(stimulus = 'bird') {
        const base = 'node_modules/super-experiment/res/';
        const isBird = (stimulus === 'bird');
        const imgFile = isBird ? 'bird_oriented.png' : 'fish_2.png';
        const imgDistFile = isBird ? 'bird_neutral.png' : 'fish_forward.png';
        const img     = await superExperiment.loadImage(base + imgFile);
        const imgDist = await superExperiment.loadImage(base + imgDistFile);
        spriteConfig = {
            img, imgDist,
            imgFramesX: 4, imgFramesY: 2,
            imgDistFramesX: 4, imgDistFramesY: 2,
            objName: isBird ? 'oriented bird' : 'sideways-facing fish',
            distName: isBird ? 'neutral bird' : 'forward-facing fish',
            allName: isBird ? 'bird' : 'fish',
        };
    }

    const _seBlock = superExperiment.block;
    // Merge sprite keys into every trial's config, whichever builder produced it.
    const seBlock = (seq, regen, config, ...rest) =>
        _seBlock(seq, regen, { ...config, ...(spriteConfig || {}) }, ...rest);
    const seEndBlock = superExperiment.endBlock;

    function computeDualCanvasSize() {
        const containerWidth = canvasContainer.clientWidth;
        const gap = 20;
        const targetPx = (containerWidth - gap) / 2;
        const minViewport = Math.min(window.innerWidth, window.innerHeight);
        return targetPx / minViewport;
    }

    function setupDualCanvasDOM(leftLabel='T1 (respond with left hand)', rightLabel='T2 (respond with right hand)') {
	canvasContainer.innerHTML = '';
	const t1 = document.createElement('div');
	const t1_label = document.createElement('div');
	t1_label.textContent = leftLabel;
	t1_label.style.cssText = 'color: #888; font-size: 0.8em; margin-bottom: 4px;';
	const t1_canvas = document.createElement('div');
	t1_canvas.style.cssText = 'min-width: 580px; min-height: 580px;';
	t1.appendChild(t1_label);
	t1.appendChild(t1_canvas);

	const t2 = document.createElement('div');
	const t2_label = document.createElement('div');
	t2_label.textContent = rightLabel;
	t2_label.style.cssText = 'color: #888; font-size: 0.8em; margin-bottom: 4px;';
	const t2_canvas = document.createElement('div');
	t2_canvas.style.cssText = 'min-width: 580px; min-height: 580px;';
	t2.appendChild(t2_label);
	t2.appendChild(t2_canvas);

	const wrapper = document.createElement('div');
	wrapper.style.cssText = 'display: flex; gap: 20px; justify-content: center; align-items: flex-start';
	wrapper.appendChild(t1);
	wrapper.appendChild(t2);
	canvasContainer.appendChild(wrapper);

	return {leftParent: t1_canvas, rightParent: t2_canvas};
    }


    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Inter-trial interval bookkeeping -------------------------------
    //
    // Wall-clock (performance.now()) of the event the current ITI is measured
    // FROM: the participant's response on an earlyResolve trial, otherwise the
    // end of the trial's timeline. Null before the first trial of a block.
    //
    // Sleeping `iti` ms starting from wherever the teardown happened to finish
    // overshot the configured interval every time — by the resolve delay (the
    // trial keeps running after the response), plus a frame of detection lag,
    // plus canvas teardown and creation. Hirsch's nominal 100 ms RSI was landing
    // near 280 ms. Anchoring the sleep to the response and waiting until the
    // deadline absorbs all of that.
    let itiAnchor = null;

    /**
     * Wait until `iti` ms have elapsed since the anchor. Returns the interval
     * actually achieved, which exceeds `iti` only when teardown overran it.
     */
    async function waitITI(iti) {
        const anchor = itiAnchor ?? performance.now();
        const remaining = anchor + iti - performance.now();
        if (remaining > 0) {
            await sleep(remaining);
        }
        return performance.now() - anchor;
    }

    /**
     * Record where the next ITI starts counting from. An earlyResolve trial's
     * timeline ends RESOLVE_DELAY ms after the response, so the response itself
     * is that far in the past by the time we get here.
     */
    function markITIAnchor(config, result) {
        const responded = result.rt1_raw !== null || result.rt2_raw !== null;
        const resolvedOnResponse = Boolean(config.earlyResolve) && responded;
        itiAnchor = performance.now() - (resolvedOnResponse ? RESOLVE_DELAY : 0);
    }

    /**
     * Show an instruction/break screen and wait for a keypress to continue.
     */
    function showInstructions(text, demo = null) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'instructions-overlay';
            overlay.innerHTML = `<div class="instructions-content">${text.replace(/\n/g, '<br>')}</div>`;

            // The animated cartoon, if this screen has one. It goes after the
            // first paragraph — under the "STEP n of 7" heading, above the
            // explanation — and REPLACES the paragraph break it lands on, which
            // is why it costs ~148 px of the height budget rather than its full
            // height. `content` is undefined under the headless DOM stub in
            // test_training.js, which is the intended degradation: the cartoon is
            // pure presentation and no training assertion depends on it.
            let running = null;
            const content = overlay.firstElementChild;
            if (demo && content) {
                running = createInstructionDemo(demo, spriteConfig);
                const firstBreak = content.querySelector('br + br');
                if (firstBreak) {
                    content.insertBefore(running.element, firstBreak.nextSibling);
                    firstBreak.remove();
                } else {
                    content.appendChild(running.element);
                }
            }
            canvasContainer.appendChild(overlay);

            const handler = () => {
                document.removeEventListener('keydown', handler);
                // Before the overlay goes: the cartoon owns an rAF loop and a
                // handful of pending timers, and nothing else will stop them.
                // Leaking one per screen would leave seven running under the
                // first test block.
                if (running) running.stop();
                overlay.remove();
                resolve();
            };
            // Small delay to avoid catching the key that dismissed the previous screen
            setTimeout(() => document.addEventListener('keydown', handler), 200);
        });
    }

    /**
     * Run a single trial: wait ITI, call block(), extract results.
     * @param {object} trial - { seParams, meta } from generateBlockTrials
     * @param {object} seConfig - SE config with key mappings
     * @param {number|null} prevResponseTime - timestamp of previous response
     * @returns {object} Trial data with meta + rt + accuracy
     */
    async function runTrial(trial, seConfig, prevResponseTime) {
        // --- ITI ---
        const itiAchieved = await waitITI(trial.meta.iti);

        // --- Run SE block (single trial) ---
        const data = await seBlock(
            [trial.seParams],   // single-element trial sequence
            0,                  // regen = 0 (no inter-trial interval from SE)
            seConfig,
            false,              // isLoop
            seConfig.feedback,               // isFeedback
            null,               // canvasId (auto-create)
            canvasContainer     // parent element
        );

        // --- Tear down ---
        await seEndBlock();

        // --- Extract RT and accuracy ---
        const result = extractResponse(data, trial, seConfig);
        markITIAnchor(seConfig, result);
        return {
            ...trial.meta,
            ...result,
            iti_achieved: itiAchieved,
        };
    }

    async function runAlternatingTrial(trial, config, leftParent, rightParent) {
	const itiAchieved = await waitITI(trial.meta.iti);
	const side = trial.meta.side;
	let data;
	if (side === 'left') {
	    data = await seBlock([trial.seParams], 0, config, false, config.feedback, 'canvasLeft', leftParent);
	    await seEndBlock('canvasLeft');
	} else {
	    data = await seBlock([trial.seParams], 0, config, false, config.feedback, 'canvasRight', rightParent);
	    await seEndBlock('canvasRight');
	}
	const result = extractAlternatingResponse(data, trial, config);
	markITIAnchor(config, result);
	return {
	    ...trial.meta,
	    ...result,
	    iti_achieved: itiAchieved,
	};
    }

    async function runBaselinePRPTrial(trial, taskConfig, leftParent, rightParent) {
	const itiAchieved = await waitITI(trial.meta.iti);
	const taskSide = trial.meta.side;
	const asteriskParent = taskSide === 'right' ? leftParent : rightParent;
	const taskParent = taskSide === 'right' ? rightParent : leftParent;
	const canvasId = 'canvas' + (taskSide === 'right' ? 'Right' : 'Left');

	// S1 (the asterisk) and the task canvas both go up at trial onset. The SOA
	// lives INSIDE the task canvas's timeline (applySOAOffset in
	// generateSidedTrials), so it is delivered with frame accuracy and the two
	// canvases are on screen together — exactly the layout the dual-canvas PRP
	// condition presents. Previously this slept setTimeout(soa) and only THEN
	// created the task canvas, which made the baseline SOA wall-clock-jittery
	// and gave the baseline a canvas pop-in that real PRP trials do not have,
	// contaminating the single-task RT reference this condition exists to
	// provide.
	const placeholder = document.createElement('div');
	placeholder.style.cssText = 'width:100%; min-height:580px; display:flex; align-items:center; justify-content:center; font-size:6em; color:#888; background:#000;';
	placeholder.textContent = '*';
	asteriskParent.appendChild(placeholder);

	const data = await seBlock([trial.seParams], 0, taskConfig, false, taskConfig.feedback, canvasId, taskParent);
	await seEndBlock(canvasId);
	asteriskParent.innerHTML = '';
	const result = extractAlternatingResponse(data, trial, taskConfig);
	markITIAnchor(taskConfig, result);
	// Remap response to T2 slot: asterisk is T1 (no response), actual task is T2
	return {
	    ...trial.meta,
	    rt1: null, rt1_raw: null, accuracy1: null, anticipations1: null,
	    rt2: result.rt1, rt2_raw: result.rt1_raw, accuracy2: result.accuracy1,
	    anticipations2: result.anticipations1,
	    responseOrder: null,
	    rawKeyPresses: result.rawKeyPresses,
	    iti_achieved: itiAchieved,
	};
    }

    async function runDualCanvasTrial(trial, leftConfig, rightConfig, prevResponseTime) {
        const itiAchieved = await waitITI(trial.meta.iti);
	const t1Side = trial.meta.t1Side ?? 'left';
	const leftLabel = t1Side === 'left' ? 'T1 (respond with left hand)' : 'T2 (respond with left hand)';
	const rightLabel = t1Side === 'left' ? 'T2 (respond with right hand)' : 'T1 (respond with right hand)';
	const { leftParent, rightParent } = setupDualCanvasDOM(leftLabel, rightLabel);

	const leftPromise = seBlock([trial.leftSeParams], 0, leftConfig, false, leftConfig.feedback, 'canvasLeft', leftParent);
	const rightPromise = seBlock([trial.rightSeParams], 0, rightConfig, false, rightConfig.feedback, 'canvasRight', rightParent);
	const [leftData, rightData] = await Promise.all([leftPromise, rightPromise]);

	await seEndBlock('canvasLeft');
	await seEndBlock('canvasRight');

	// Map physical canvas data to temporal roles (T1/T2)
	const t1Data = t1Side === 'left' ? leftData : rightData;
	const t2Data = t1Side === 'left' ? rightData : leftData;
	const t1Config = t1Side === 'left' ? leftConfig : rightConfig;
	const t2Config = t1Side === 'left' ? rightConfig : leftConfig;

	// RT is measured from the imperative stimulus, not from start_go_1 — the
	// go signal now opens with the cue, csi ms earlier.
	const result = extractDualCanvasResponse(
	    t1Data, t2Data, trial.meta.t1_stim_onset, trial.meta.t2_stim_onset, t1Config, t2Config);
	markITIAnchor(t1Config, result);
	return {
	    ...trial.meta,
	    ...result,
	    iti_achieved: itiAchieved,
	};
    }

    /**
     * Run a complete block of trials.
     */
    async function runBlock(blockDef, blockOrder) {
        const { blockConfig, instructions, demo } = blockDef;
	// Fail before anything is shown to the participant: both checked
	// combinations run to completion and export a full CSV, so an
	// un-guarded one costs a whole session's data.
	assertValidBlockConfig(blockConfig);
	const numTrials = blockDef.isTraining ? TRAINING_CAP : blockDef.numTrials;
	// A stage may ask for its own advancement threshold —
	// PRP's S8 uses 12/16 because isTrialCorrectForAdvancement requires BOTH
	// responses correct there, and 14/16 on a product of two accuracies would
	// send a competent participant to the cap (at 80%/task: 26.4% pass under
	// 14/16 vs 81.1% under 12/16, across the cap). Resolved ONCE here and handed
	// to both the stop-early predicate and the stage summary: if the two ever
	// diverged, a stage could stop while its logged criterionMet said it had not.
	// Left `undefined` when the stage does not ask, so session_helpers.js's
	// defaults (16/14) stay the single place the shared default lives — and it
	// must never be lowered, since at 10/16 a pure guesser clears the stage 76.2%
	// of the time. NB the predicate below runs before EVERY trial, so a stage
	// offers 33 overlapping windows, not 3 disjoint ones; quote across-cap rates,
	// not per-window ones.
	const advancementWindow = blockDef.advancementWindow;
	const advancementThreshold = blockDef.advancementThreshold;
	let trials;
	let seConfig;
	const feedback = blockConfig.feedback ?? true;
	const acceptFirstResponse = blockConfig.acceptFirstResponse ?? false;
	const canvasType = blockConfig.paradigm ?? 'single-canvas';
	const t1Side = blockConfig.t1Side ?? 'left';
	let leftParent, rightParent;
	if (canvasType === 'dual-canvas') {
	    trials = generateDualCanvasBlockTrials(blockConfig, numTrials);
	    canvasContainer.classList.toggle('dual-canvas-mode', true);
	} else if (canvasType === 'alternating') {
	    trials = generateSidedTrials(blockConfig, numTrials);
	    canvasContainer.classList.toggle('dual-canvas-mode', true);
	    ({ leftParent, rightParent } = setupDualCanvasDOM('Respond with left hand', 'Respond with right hand'));
	} else if (canvasType === 'prp-baseline') {
	    trials = generateSidedTrials(blockConfig, numTrials);
	    canvasContainer.classList.toggle('dual-canvas-mode', true);
	    if (t1Side === 'left') {
		({ leftParent, rightParent } = setupDualCanvasDOM('S1 (no response needed)', 'Respond with right hand: J/L'));
	    } else {
		({ leftParent, rightParent } = setupDualCanvasDOM('Respond with left hand: A/D', 'S1 (no response needed)'));
	    }
	} else {
	    // SweetPea-backed blocks carry pre-fetched, counterbalanced vectors
	    // (populated in runSession). Fall back to the interim generator otherwise.
	    let preVec = blockDef._vectors || null;
	    // PRP's S8 orders its SOAs longest -> shortest instead of sampling them
	    // (the stage shapes response order, not coherence). The SOA is
	    // baked into the SE timing params at generation time, so unlike the
	    // coherence ramp it cannot be overridden per trial in the loop below —
	    // it has to be imposed on the sequence vectors first. A SweetPea CSV
	    // wins if one is present: its counterbalancing is the whole point of it.
	    if (blockConfig.soaSchedule && !preVec) {
		const scheduleLength = blockConfig.soaSchedule.scheduleLength
		    ?? TRAINING_SOA_SCHEDULE_LENGTH;
		const vectors = generateSequenceVectors(blockConfig, numTrials);
		vectors.soa = vectors.soa.map((sampled, i) =>
		    scheduledSoa(i, blockConfig.soaSchedule.levels, scheduleLength) ?? sampled);
		preVec = vectors;
	    }
	    trials = generateBlockTrials(blockConfig, preVec ? preVec.task1.length : numTrials, preVec);
	    seConfig = buildSEConfig(blockConfig.rso, blockConfig.earlyResolve, feedback, acceptFirstResponse, blockConfig.keyMaps);
	    canvasContainer.classList.toggle('dual-canvas-mode', false);
	}

        // Show instructions
        if (instructions) {
            await showInstructions(instructions, demo);
        }

        // The instruction screen breaks the trial rhythm, so the first trial of
        // a block measures its ITI from here rather than from the last trial of
        // the previous block.
        itiAnchor = null;

	let quest;
	let newCoherence;
	if (blockDef.runQuest) {
	    let priorMean = 0.5;
	    let priorSD = 0.2;
	    if (typeof(blockDef.runQuest) === 'object') {
		priorMean = blockDef.runQuest.priorMean ?? priorMean;
		priorSD = blockDef.runQuest.priorSD ?? priorSD;
	    }
	    quest = createQuest(priorMean, priorSD);
	}
        let prevResponseTime = null;
	let trialData;
	let blockOutcomes = [];
        for (let i = 0; i < trials.length && (!blockDef.isTraining || !meetsAdvancementCriterion(blockOutcomes, advancementWindow, advancementThreshold)); i++) {
            if (!isRunning) break;
            // Update status display
            updateStatus(blockConfig.blockId, i + 1, trials.length, blockOrder);
	    const task_1 = trials[i].meta.t1_task;
	    const task_2 = trials[i].meta.t2_task;

	    // Resolve SE param objects: dual-canvas has leftSeParams/rightSeParams,
	    // all other paradigms have a single seParams.
	    let t1Params, t2Params;
	    if (canvasType === 'dual-canvas') {
		const trialT1Side = trials[i].meta.t1Side ?? 'left';
		t1Params = trialT1Side === 'left' ? trials[i].leftSeParams : trials[i].rightSeParams;
		t2Params = trialT1Side === 'left' ? trials[i].rightSeParams : trials[i].leftSeParams;
	    } else {
		t1Params = trials[i].seParams;
		t2Params = trials[i].seParams;
	    }

	    // override coherence if we're running Quest
	    if (blockDef.runQuest) {
		newCoherence = Math.min(quest.getNextIntensity(), 0.9);
		t1Params["coh_" + task_1 + "_1"] = newCoherence;
	    }
	    // Training coherence ramp: ceiling -> test level
	    // over the first `rampLength` trials of the stage. Same override point as
	    // Quest, and task-agnostic — task_1 is already resolved per trial, so a
	    // stage that alternates mov/or (S4) ramps both without special-casing.
	    // `to` is either a single number or a per-task table { mov, or }.
	    if (blockConfig.coherenceRamp) {
		const ramp = blockConfig.coherenceRamp;
		// Throws rather than writing a coh_null_1 key or a NaN coherence —
		// see resolveRampTarget.
		const rampTo = resolveRampTarget(ramp, task_1, blockConfig.blockId);
		t1Params["coh_" + task_1 + "_1"] =
		    rampedCoherence(i, ramp.from, rampTo, ramp.rampLength ?? TRAINING_RAMP_LENGTH);
	    }
            if (canvasType === 'dual-canvas') {
                const trialT1Side = trials[i].meta.t1Side ?? 'left';
                const leftTask = trialT1Side === 'left' ? trials[i].meta.t1_task : trials[i].meta.t2_task;
                const rightTask = trialT1Side === 'left' ? trials[i].meta.t2_task : trials[i].meta.t1_task;
                const { leftConfig, rightConfig } = buildDualCanvasSEConfigs(leftTask, rightTask, trials[i].meta.earlyResolve, feedback, acceptFirstResponse, computeDualCanvasSize(), blockConfig.mapping);
                trialData = await runDualCanvasTrial(trials[i], leftConfig, rightConfig, prevResponseTime);
            } else if (canvasType === 'alternating') {
                const config = buildAlternatingSEConfig(trials[i].meta.t1_task, trials[i].meta.side, trials[i].meta.earlyResolve, feedback, acceptFirstResponse, computeDualCanvasSize(), blockConfig.mapping);
                trialData = await runAlternatingTrial(trials[i], config, leftParent, rightParent);
            } else if (canvasType === 'prp-baseline') {
                const config = buildAlternatingSEConfig(trials[i].meta.t2_task, trials[i].meta.side, trials[i].meta.earlyResolve, feedback, acceptFirstResponse, computeDualCanvasSize(), blockConfig.mapping);
                trialData = await runBaselinePRPTrial(trials[i], config, leftParent, rightParent);
            } else {
                trialData = await runTrial(trials[i], seConfig, prevResponseTime);
            }

            if (blockDef.isTraining) {
                blockOutcomes.push(isTrialCorrectForAdvancement(trialData));
            }
            trialData.blockOrder = blockOrder;
            trialData.isPractice = blockDef.isPractice || false;
	    // Every row carries which phase and (for training)
	    // which stage produced it, so training trials can be excluded from
	    // analysis and the S2/S3 exclusion rule can be checked from the CSV alone.
	    // Defaults keep every pre-existing blockDef (none set these) at 'test'/null.
	    trialData.phase = blockDef.phase || 'test';
	    trialData.stage = blockDef.stage || null;
	    // Which pool CSV this block's trials came from. There is no assignment
	    // table anywhere — the draw is made in the browser from the participant
	    // id — so this column is the ONLY record of what the participant saw.
	    // Null on the JS-generator path, which has no sequence to name.
	    trialData.sequenceId = blockConfig.sequenceId ?? null;
	    if (task_1) {
		trialData.t1_target_coherence = t1Params["coh_" + task_1 + "_1"];
	    }
	    if (task_2) {
		// Single-canvas: T2 is on channel 2 (_2 suffix).
		// Dual-canvas: each canvas is independent, so T2 is on its own channel 1 (_1 suffix).
		const t2Suffix = canvasType === 'dual-canvas' ? "_1" : "_2";
		trialData.t2_target_coherence = t2Params["coh_" + task_2 + t2Suffix];
	    }
            prevResponseTime = performance.now();
	    if (blockDef.runQuest) {
		quest.update(newCoherence, trialData.accuracy1 === 'correct');
	    }

            allTrialData.push(trialData);

        }
	// originally I ran getFinalEstimate here but in perfect blocks, subtracting the prior causes serious problems
	if (blockDef.runQuest) {
	    return quest.getNextIntensity();
	}
	// Training stages report their outcome to runSession the same way Quest
	// blocks do (nothing outside runBlock sees per-trial results otherwise).
	// runSession disambiguates the two on blockDef.runQuest/isTraining, NOT on
	// the return value — see the comment at the call site.
	if (blockDef.isTraining) {
	    const summary = summarizeAdvancementWindow(
		blockOutcomes, advancementWindow, advancementThreshold);
	    return {
		kind: 'trainingStage',
		stageId: blockDef.stage ?? null,
		blockId: blockConfig.blockId,
		trialsUsed: blockOutcomes.length,
		criterionMet: summary.criterionMet,
		finalWindowAccuracy: summary.accuracy,
		// Recorded so the log says what criterion it was scored against
		// (it is not the same for every stage).
		advancementWindow: summary.windowSize,
		advancementThreshold: summary.threshold,
		// Failing the cap on S2 or S3 is the
		// pre-registered exclusion. Recorded only — acting on it is a
		// separate product decision and is deliberately NOT implemented here.
		exclusionCandidate: (blockDef.stage === 'S2' || blockDef.stage === 'S3')
		    && !summary.criterionMet
		    && blockOutcomes.length >= numTrials,
	    };
	}
    }

    function overwriteCoherence(session, coherences, startIndex) {
	for (let b = startIndex; b < session.length; b++) {
	    if (session[b].useQuest) {
		session[b].blockConfig.coherence = coherences;
	    }
	}
    }

    /** Slice every array in a sequence-vector object to `[from, to)`. */
    function sliceVectors(vectors, from, to) {
        const out = {};
        for (const key of Object.keys(vectors)) {
            out[key] = Array.isArray(vectors[key]) ? vectors[key].slice(from, to) : vectors[key];
        }
        return out;
    }

    /**
     * Reject two blocks of one session reading the same CSV.
     *
     * Each test block now loads its own whole pool CSV, so the only way two of
     * them share a file is a bad draw — a duplicate sequence id, or a session
     * handed fewer ids than it has test blocks. The participant would then run
     * one pool block's trials twice, doubling every cell of that block's design
     * and contaminating their repetition effects. It runs to completion and
     * exports a perfectly normal-looking CSV, so it has to throw.
     *
     * cpApplySweetPea checks the draw itself; this is the backstop for any other
     * caller (and for a session assembled by hand).
     */
    function assertDistinctSequenceSources(sessionDef) {
        const seen = new Map();
        for (const blockDef of sessionDef) {
            const src = blockDef.blockConfig && blockDef.blockConfig.sequenceSource;
            if (!src) continue;
            if (seen.has(src)) {
                throw new Error(
                    `Two blocks of this session read the same sequence CSV '${src}'. ` +
                    'Each test block must get its own pool block — the participant would ' +
                    'otherwise run the same trials twice. Check the sequence-id draw.'
                );
            }
            seen.set(src, blockDef);
        }
    }

    /**
     * Fetch and parse the SweetPea CSV for each block that declares a
     * `sequenceSource`, attaching the parsed vectors as `blockDef._vectors`.
     * One CSV is one complete block, so the whole file is used as-is.
     * Abridged mode then keeps only the first ceil(N/10) rows of whatever this
     * block ended up with (fast smoke test — this DOES break the
     * counterbalancing, so never analyze abridged data).
     */
    async function preloadSequences(sessionDef, options) {
        assertDistinctSequenceSources(sessionDef);
        for (const blockDef of sessionDef) {
            const src = blockDef.blockConfig && blockDef.blockConfig.sequenceSource;
            if (!src) { blockDef._vectors = null; continue; }
            const resp = await fetch(src);
            if (!resp.ok) {
                throw new Error(`Failed to fetch sequence CSV '${src}' (HTTP ${resp.status})`);
            }
            const text = await resp.text();
            let vectors = loadSequenceVectors(text, blockDef.blockConfig);
            if (options.abridged) {
                const keep = Math.max(1, Math.ceil(vectors.task1.length / 10));
                vectors = sliceVectors(vectors, 0, keep);
            }
            blockDef._vectors = vectors;
        }
    }

    /**
     * Run a complete session (multiple blocks).
     */
    async function runSession(sessionDef, containerEl, options = {}) {
        canvasContainer = containerEl;
        currentSessionDef = sessionDef;
        allTrialData = [];
        trainingLog = [];
        isRunning = true;

        // Clear container
        canvasContainer.innerHTML = '';

        // Pre-fetch SweetPea-generated sequence CSVs for any block that declares
        // a `sequenceSource`. Done up front (runSession is async) so runBlock can
        // stay synchronous about trial generation. Blocks without a sequenceSource
        // fall back to the interim generator — nothing here touches them.
        await preloadSequences(sessionDef, options);

        // Concrete (sprite) stimuli are the default (birds by default; fish also supported; ?stimulus=abstract for circles/triangles).
        // Load the sprite sheets once, before any trial runs, because init_oobs() reads
        // img.naturalWidth the moment a block starts.
        if (options.stimulus !== 'abstract') {
            await loadSprites(options.stimulus || 'bird');
        } else {
            spriteConfig = null;
        }

	const questCoherences = { mov: 0.4, or: 0.6}; // some defaults
	// Index into allTrialData of the first trial not yet covered by a break
	// summary. "Since the last break", not "this block": when a break is
	// skipped the next summary spans everything that has accumulated.
	let summaryAnchor = 0;
        for (let b = 0; b < sessionDef.length; b++) {
            if (!isRunning) break;
	    // runBlock returns a Quest coherence for Quest blocks and a training
	    // stage summary for training stages. Branch on what the blockDef ASKED
	    // FOR, never on `!== undefined`: a stage summary reaching
	    // overwriteCoherence would be injected into later blocks as a coherence.
	    const blockDef = sessionDef[b];
	    const blockResult = await runBlock(blockDef, b + 1);
	    if (blockDef.runQuest) {
		questCoherences[blockDef.blockConfig.startTask] = blockResult;
		overwriteCoherence(sessionDef, questCoherences, b + 1);
	    } else if (blockDef.isTraining && blockResult) {
		trainingLog.push(blockResult);
	    }


            // Inter-block break (except after the last block).
            //
            // Skipped after a training stage: every stage is followed immediately
            // by the next stage's own instruction screen, so the generic
            // "block complete" screen is pure noise there, and whether a real
            // break belongs INSIDE training is open pending the advisor.
            const isTrainingStage = blockDef.phase === 'training';
            if (b < sessionDef.length - 1 && isRunning && !isTrainingStage) {
                // The block-level performance summary that replaces the
                // trial-by-trial feedback the test blocks no longer show. It is
                // shown HERE, strictly between blocks, and must never be moved
                // trial-adjacent — the entire point of it is that no exogenous
                // performance signal lands inside a trial's response-selection
                // window. Training rows are excluded: those stages still run with
                // feedback on, and they are not the participant's test data.
                const sinceBreak = allTrialData
                    .slice(summaryAnchor)
                    .filter(row => row.phase !== 'training');
                const summaryLine = formatBreakSummary(summarizeBlockPerformance(sinceBreak));
                summaryAnchor = allTrialData.length;
                await showInstructions(
                    `Block ${b + 1} of ${sessionDef.length} complete.\n\n` +
                    (summaryLine ? `${summaryLine}\n\n` : '') +
                    'Take a short break if needed.\n\n' +
                    'Aim to be both fast and accurate.\n\n' +
                    'Press any key to continue to the next block.'
                );
            }
        }

        if (isRunning) {
            isRunning = false;
            await showInstructions(
                'Session complete! Thank you.\n\n' +
                'Press any key to view your data.'
            );
            enableExport();
        }
    }

    function stopSession() {
        isRunning = false;
    }

    /**
     * Update status display during a block.
     */
    function updateStatus(blockId, trialNum, totalTrials, blockOrder) {
        const statusEl = document.getElementById('session-status');
        if (statusEl) {
            statusEl.textContent =
                `Block ${blockOrder}: ${blockId} — Trial ${trialNum}/${totalTrials}`;
        }
    }

    /**
     * Export all trial data as CSV.
     */
    function exportCSV() {
        if (allTrialData.length === 0) {
            alert('No data to export.');
            return;
        }

        // Column order
	const columns = [
	    'blockOrder', 'blockId', 'blockType', 'paradigm', 'isPractice',
	    'phase', 'stage', 'sequenceId',
	    'trialNumber', 't1_task', 't2_task', 'transitionType',
	    'iti', 'iti_achieved', 'soa', 'side', 't1Side', 'earlyResolve',
	    't1_stim_onset', 't2_stim_onset',
	    't1_target_dir', 't1_distractor_dir',
	    't2_target_dir', 't2_distractor_dir',
	    'target_coh_level', 'distractor_coh_level',
	    't1_target_coherence', 't1_distractor_coherence', 't2_target_coherence',
	    'rt1', 'accuracy1', 'rt2', 'accuracy2',
	    'anticipations1', 'anticipations2',
	    'responseOrder', 'rt1_raw', 'rt2_raw', 'rawKeyPresses',
	];


        const header = columns.join(',');
        const rows = allTrialData.map(row =>
            columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        );

        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function enableExport() {
        const btn = document.getElementById('export-btn');
        if (btn) btn.disabled = false;
    }

    // Public API
    return {
        runSession,
        stopSession,
        exportCSV,
        getData: () => allTrialData,
        getTrainingLog: () => trainingLog,
    };
})();
