// session.js — Multi-block session runner and data collection
// Depends on: engine.js, session_helpers.js (loaded first), superExperiment global (from bundle.js)

const Session = (() => {
    // State
    let allTrialData = [];
    let currentSessionDef = null;
    let isRunning = false;
    let canvasContainer = null;

    // SE package references
    const seBlock = superExperiment.block;
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

    /**
     * Show an instruction/break screen and wait for a keypress to continue.
     */
    function showInstructions(text) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'instructions-overlay';
            overlay.innerHTML = `<div class="instructions-content">${text.replace(/\n/g, '<br>')}</div>`;
            canvasContainer.appendChild(overlay);

            const handler = (e) => {
                document.removeEventListener('keydown', handler);
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
        await sleep(trial.meta.iti);

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
        return {
            ...trial.meta,
            ...result,
        };
    }

    async function runAlternatingTrial(trial, config, leftParent, rightParent) {
	await sleep(trial.meta.iti);
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
	return {
	    ...trial.meta,
	    ...result
	};
    }

    async function runBaselinePRPTrial(trial, rightConfig, leftParent, rightParent) {
	await sleep(trial.meta.iti);
	const placeholder = document.createElement('div');
	placeholder.style.cssText = 'width:100%; min-height:580px; display:flex; align-items:center; justify-content:center; font-size:6em; color:#888; background:#000;';
	placeholder.textContent = '*';
	leftParent.appendChild(placeholder);
	await sleep(trial.meta.soa);

	const data = await seBlock([trial.seParams], 0, rightConfig, false, rightConfig.feedback, 'canvasRight', rightParent);
	await seEndBlock('canvasRight');
	leftParent.innerHTML = '';
	const result = extractAlternatingResponse(data, trial, rightConfig);
	// Remap response to T2 slot: asterisk is T1 (no response), actual task is T2
	return {
	    ...trial.meta,
	    rt1: null, rt1_raw: null, accuracy1: null,
	    rt2: result.rt1, rt2_raw: result.rt1_raw, accuracy2: result.accuracy1,
	    responseOrder: null,
	    rawKeyPresses: result.rawKeyPresses,
	};
    }

    async function runDualCanvasTrial(trial, leftConfig, rightConfig, prevResponseTime) {
        await sleep(trial.meta.iti);
	const { leftParent, rightParent } = setupDualCanvasDOM();

	const leftPromise = seBlock([trial.leftSeParams], 0, leftConfig, false, leftConfig.feedback, 'canvasLeft', leftParent);
	const rightPromise = seBlock([trial.rightSeParams], 0, rightConfig, false, rightConfig.feedback, 'canvasRight', rightParent);
	const [leftData, rightData] = await Promise.all([leftPromise, rightPromise]);

	await seEndBlock('canvasLeft');
	await seEndBlock('canvasRight');
	const result = extractDualCanvasResponse(leftData, rightData, trial, leftConfig, rightConfig);
	return {
	    ...trial.meta,
	    ...result,
	};
    }

    /**
     * Run a complete block of trials.
     */
    async function runBlock(blockDef, blockOrder) {
        const { blockConfig, numTrials, instructions } = blockDef;
	let trials;
	let seConfig;
	const feedback = blockConfig.feedback ?? true;
	const acceptFirstResponse = blockConfig.acceptFirstResponse ?? false;
	const canvasType = blockConfig.paradigm ?? 'single-canvas';
	let leftParent, rightParent;
	if (canvasType === 'dual-canvas') {
	    trials = generateDualCanvasBlockTrials(blockConfig, numTrials);
	    canvasContainer.classList.toggle('dual-canvas-mode', true);
	} else if (canvasType === 'alternating') {
	    trials = generateSidedTrials(blockConfig, numTrials);
	    canvasContainer.classList.toggle('dual-canvas-mode', true);
	    ({ leftParent, rightParent } = setupDualCanvasDOM());
	} else if (canvasType === 'prp-baseline') {
	    trials = generateSidedTrials(blockConfig, numTrials);
	    canvasContainer.classList.toggle('dual-canvas-mode', true);
	    ({ leftParent, rightParent } = setupDualCanvasDOM('S1 (no response needed)', 'Respond with right hand: J/L'));
	} else {
	    trials = generateBlockTrials(blockConfig, numTrials);
	    seConfig = buildSEConfig(blockConfig.rso, blockConfig.earlyResolve, feedback, acceptFirstResponse, blockConfig.keyMaps);
	    canvasContainer.classList.toggle('dual-canvas-mode', false);
	}

        // Show instructions
        if (instructions) {
            await showInstructions(instructions);
        }

	let quest;
	let newCoherence;
	if (blockDef.runQuest) {
	    quest = createQuest(0.5, 0.2);
	}
        let prevResponseTime = null;
	let trialData;
        for (let i = 0; i < trials.length; i++) {
            if (!isRunning) break;
            // Update status display
            updateStatus(blockConfig.blockId, i + 1, trials.length, blockOrder);
	    const task_1 = trials[i].seParams.task_1;
	    const task_2 = trials[i].seParams.task_2;
	    // override coherence if we're running Quest
	    if (blockDef.runQuest) {
		newCoherence = quest.getNextIntensity();
		trials[i].seParams["coh_" + task_1 + "_1"] = newCoherence;
	    }
	    if (canvasType === 'dual-canvas') {
		const { leftConfig, rightConfig } = buildDualCanvasSEConfigs(trials[i].meta.t1_task, trials[i].meta.t2_task, trials[i].meta.earlyResolve, feedback, acceptFirstResponse, computeDualCanvasSize());
		trialData = await runDualCanvasTrial(trials[i], leftConfig, rightConfig, prevResponseTime);
	    } else if (canvasType === 'alternating') {
		const config = buildAlternatingSEConfig(trials[i].meta.t1_task, trials[i].meta.side, trials[i].meta.earlyResolve, feedback, acceptFirstResponse, computeDualCanvasSize());
		trialData = await runAlternatingTrial(trials[i], config, leftParent, rightParent);
	    } else if (canvasType === 'prp-baseline') {
		const config = buildAlternatingSEConfig(trials[i].meta.t2_task, trials[i].meta.side, trials[i].meta.earlyResolve, feedback, acceptFirstResponse, computeDualCanvasSize());
		trialData = await runBaselinePRPTrial(trials[i], config, leftParent, rightParent)
	    } else {
		trialData = await runTrial(trials[i], seConfig, prevResponseTime);
	    }
            trialData.blockOrder = blockOrder;
            trialData.isPractice = blockDef.isPractice || false;
	    if (task_1) {
		trialData.t1_target_coherence = trials[i].seParams["coh_" + task_1 + "_1"];
	    }
	    if (task_2) {
		trialData.t2_target_coherence = trials[i].seParams["coh_" + task_2 + "_2"];
	    }
            prevResponseTime = performance.now();
	    if (blockDef.runQuest) {
		quest.update(newCoherence, trialData.accuracy1 === 'correct');
	    }

            allTrialData.push(trialData);

        }
	if (blockDef.runQuest) {
	    return quest.getFinalEstimate();
	}
    }

    function overwriteCoherence(session, coherences, startIndex) {
	for (let b = startIndex; b < session.length; b++) {
	    if (session[b].useQuest) {
		session[b].blockConfig.coherence = coherences;
	    }
	}
    }

    /**
     * Run a complete session (multiple blocks).
     */
    async function runSession(sessionDef, containerEl) {
        canvasContainer = containerEl;
        currentSessionDef = sessionDef;
        allTrialData = [];
        isRunning = true;

        // Clear container
        canvasContainer.innerHTML = '';

	const questCoherences = { mov: 0.5, or: 0.5}; // some defaults
        for (let b = 0; b < sessionDef.length; b++) {
            if (!isRunning) break;
            const questResult = await runBlock(sessionDef[b], b + 1);
	    if (questResult !== undefined) {
		questCoherences[sessionDef[b].blockConfig.startTask] = questResult;
		overwriteCoherence(sessionDef, questCoherences, b + 1);
	    }


            // Inter-block break (except after the last block)
            if (b < sessionDef.length - 1 && isRunning) {
                await showInstructions(
                    `Block ${b + 1} of ${sessionDef.length} complete.\n\n` +
                    'Take a short break if needed.\n\n' +
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
	    'trialNumber', 't1_task', 't2_task', 'transitionType',
	    'iti', 'soa', 'side', 'earlyResolve',
	    't1_target_dir', 't1_distractor_dir',
	    't2_target_dir', 't2_distractor_dir',
	    'rt1', 'accuracy1', 'rt2', 'accuracy2',
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
    };
})();
