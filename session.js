// session.js — Multi-block session runner and data collection
// Depends on: engine.js (loaded first), superExperiment global (from bundle.js)

const Session = (() => {
    // State
    let allTrialData = [];
    let currentSessionDef = null;
    let isRunning = false;
    let canvasContainer = null;

    // SE package references
    const seBlock = superExperiment.block;
    const seEndBlock = superExperiment.endBlock;

    /**
     * SE config for key mappings.
     * For identical RSO: both tasks use a (left) and d (right).
     */
    function buildSEConfig(rso) {
        if (rso === 'disjoint') {
            return {
                movementKeyMap: { 180: 'a', 0: 'd' },
                orientationKeyMap: { 180: 'j', 0: 'l' },
                size: 0.75,
            };
        }
        // identical RSO (default, Hirsch)
        return {
            movementKeyMap: { 180: 'a', 0: 'd' },
            orientationKeyMap: { 180: 'a', 0: 'd' },
            size: 0.75,
        };
    }

    function computeDualCanvasSize() {
        const containerWidth = canvasContainer.clientWidth;
        const gap = 20;
        const targetPx = (containerWidth - gap) / 2;
        const minViewport = Math.min(window.innerWidth, window.innerHeight);
        return targetPx / minViewport;
    }

    function buildDualCanvasSEConfigs(leftTask, rightTask) {
	let leftConfig = {} , rightConfig = {};
	const leftHandHorizontalMapping = { 180: 'a', 0: 'd'};
	const rightHandHorizontalMapping = { 180: 'j', 0: 'l'};
	const dummyMapping = { 180: '!', 0: '!'};
	const dualCanvasSize = computeDualCanvasSize();
	if (leftTask === 'mov') {
	    leftConfig = {'movementKeyMap': { ...leftHandHorizontalMapping }, 'orientationKeyMap': dummyMapping, size: dualCanvasSize };
	} else {
	    leftConfig = {'orientationKeyMap': { ...leftHandHorizontalMapping }, 'movementKeyMap': dummyMapping, size: dualCanvasSize };
	}
	if (rightTask === 'mov') {
	    rightConfig = {'movementKeyMap': { ...rightHandHorizontalMapping }, 'orientationKeyMap': dummyMapping, size: dualCanvasSize };
	} else {
	    rightConfig = {'orientationKeyMap': { ...rightHandHorizontalMapping }, 'movementKeyMap': dummyMapping, size: dualCanvasSize };
	}
	return { leftConfig, rightConfig };
    }

    function setupDualCanvasDOM() {
	canvasContainer.innerHTML = '';
	const t1 = document.createElement('div');
	const t1_label = document.createElement('div');
	t1_label.textContent = 'T1 (respond with left hand)';
	t1_label.style.cssText = 'color: #888; font-size: 0.8em; margin-bottom: 4px;';
	const t1_canvas = document.createElement('div');
	t1.appendChild(t1_label);
	t1.appendChild(t1_canvas);

	const t2 = document.createElement('div');
	const t2_label = document.createElement('div');
	t2_label.textContent = 'T2 (respond with right hand)';
	t2_label.style.cssText = 'color: #888; font-size: 0.8em; margin-bottom: 4px;';
	const t2_canvas = document.createElement('div');
	t2.appendChild(t2_label);
	t2.appendChild(t2_canvas);

	const wrapper = document.createElement('div');
	wrapper.style.cssText = 'display: flex; gap: 20px; justify-content: center; align-items: center';
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
     * @param {number|null} prevResponseTime - timestamp of previous response (for future RSI support)
     * @returns {object} Trial data with meta + rt + accuracy
     */
    async function runTrial(trial, seConfig, prevResponseTime) {
        // --- ITI ---
        // For RSI upgrade: replace this with:
        //   const delay = trial.meta.iti - (performance.now() - prevResponseTime);
        //   await sleep(Math.max(0, delay));
        await sleep(trial.meta.iti);

        // --- Run SE block (single trial) ---
        const data = await seBlock(
            [trial.seParams],   // single-element trial sequence
            0,                  // regen = 0 (no inter-trial interval from SE)
            seConfig,
            false,              // isLoop
            true,               // isFeedback
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

    async function runDualCanvasTrial(trial, leftConfig, rightConfig, prevResponseTime) {
        await sleep(trial.meta.iti);
	const { leftParent, rightParent } = setupDualCanvasDOM();

	const leftPromise = seBlock([trial.leftSeParams], 0, leftConfig, false, true, 'canvasLeft', leftParent);
	const rightPromise = seBlock([trial.rightSeParams], 0, rightConfig, false, true, 'canvasRight', rightParent);
	const [leftData, rightData] = await Promise.all([leftPromise, rightPromise]);

	await seEndBlock('canvasLeft');
	await seEndBlock('canvasRight');
	const result = extractDualCanvasResponse(leftData, rightData, trial);
	return {
	    ...trial.meta,
	    ...result,
	};
    }

    /**
     * Build lookup sets mapping keys to task number (1 or 2) for disjoint RSO.
     * Returns null for identical RSO (falls back to temporal ordering).
     */
    function buildKeyTaskMap(seConfig, trial) {
        // If both tasks share the same keys, we can't disambiguate by key
        const movKeys = Object.values(seConfig.movementKeyMap || {});
        const orKeys = Object.values(seConfig.orientationKeyMap || {});
        const isDisjoint = movKeys.length > 0 && orKeys.length > 0 &&
            !movKeys.some(k => orKeys.includes(k));

        if (!isDisjoint) return null;

        // Map task identity → key set
        const task1 = trial.meta.task;
        const task1Keys = task1 === 'mov' ? movKeys : orKeys;
        const task2Keys = task1 === 'mov' ? orKeys : movKeys;

        return { task1Keys, task2Keys };
    }

    /**
     * Extract RT and accuracy from SE data.
     *
     * SE keypress entries have: { eventType, key, time, isCorrect }
     *   - time: ms relative to block (i.e., trial) onset
     *   - isCorrect: true if key matched the active go signal
     *   - No field distinguishes go1 vs go2.
     *
     * For disjoint RSO: we identify which task a keypress belongs to by
     * checking which key set it falls in. This correctly handles response
     * reversals (T2 answered before T1).
     *
     * For identical RSO: falls back to temporal ordering (1st correct → T1,
     * 2nd correct → T2). This is inherently ambiguous for response reversals.
     *
     * Since sleep(iti) happens before block(), block-internal timestamps
     * start at 0 (after ITI). No ITI subtraction needed.
     */
    function extractResponse(data, trial, seConfig) {
        const keyPresses = data.keyPresses || [];
        const isDualTask = trial.meta.paradigm === 'dual-task';

        let rt1_raw = null;
        let rt2_raw = null;
        let accuracy1 = 'miss';
        let accuracy2 = isDualTask ? 'miss' : null;
        let hadError1 = false;
        let hadError2 = false;

        const keyMap = isDualTask ? buildKeyTaskMap(seConfig, trial) : null;

        if (keyMap) {
            // --- Disjoint RSO: identify task by key ---
            for (const kp of keyPresses) {
                const isT1Key = keyMap.task1Keys.includes(kp.key);
                const isT2Key = keyMap.task2Keys.includes(kp.key);

                if (isT1Key) {
                    if (kp.isCorrect && rt1_raw === null) {
                        rt1_raw = kp.time;
                        accuracy1 = hadError1 ? 'corrected' : 'correct';
                    } else if (!kp.isCorrect && rt1_raw === null) {
                        hadError1 = true;
                        accuracy1 = 'error';
                    }
                } else if (isT2Key) {
                    if (kp.isCorrect && rt2_raw === null) {
                        rt2_raw = kp.time;
                        accuracy2 = hadError2 ? 'corrected' : 'correct';
                    } else if (!kp.isCorrect && rt2_raw === null) {
                        hadError2 = true;
                        accuracy2 = 'error';
                    }
                }
            }
        } else {
            // --- Identical RSO: temporal ordering fallback ---
            for (const kp of keyPresses) {
                if (kp.isCorrect) {
                    if (rt1_raw === null) {
                        rt1_raw = kp.time;
                        accuracy1 = hadError1 ? 'corrected' : 'correct';
                    } else if (isDualTask && rt2_raw === null) {
                        rt2_raw = kp.time;
                        accuracy2 = 'correct';
                    }
                } else {
                    if (rt1_raw === null) {
                        hadError1 = true;
                        accuracy1 = 'error';
                    } else if (isDualTask && rt2_raw === null) {
                        accuracy2 = 'error';
                    }
                }
            }
        }

        // RT relative to go signal onset (= stimulus onset for these demos)
        const rt1 = rt1_raw !== null ? rt1_raw - trial.seParams.start_go_1 : null;
        const rt2 = (isDualTask && rt2_raw !== null)
            ? rt2_raw - trial.seParams.start_go_2
            : null;

        return {
            rt1_raw,
            rt1,
            accuracy1,
            rt2_raw,
            rt2,
            accuracy2,
            responseOrder: (isDualTask && rt1_raw !== null && rt2_raw !== null)
                ? (rt1_raw <= rt2_raw ? 'T1-first' : 'T2-first')
                : null,
            rawKeyPresses: JSON.stringify(keyPresses),
        };
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
	return { rt1, rt1_raw, accuracy1, rt2, rt2_raw, accuracy2, responseOrder, rawKeyPresses: JSON.stringify({ left : leftData.keyPresses, right : rightData.keyPresses} ) }
    }

    /**
     * Run a complete block of trials.
     */
    async function runBlock(blockDef, blockOrder) {
        const { blockConfig, numTrials, instructions } = blockDef;
	let trials;
	let seConfig;
	const canvasType = blockConfig.paradigm ?? 'single-canvas';
	if (canvasType === 'dual-canvas') {
	    trials = generateDualCanvasBlockTrials(blockConfig, numTrials);
	    canvasContainer.classList.toggle('dual-canvas-mode', true);
	} else {
	    trials = generateBlockTrials(blockConfig, numTrials);
	    seConfig = buildSEConfig(blockConfig.rso);
	    canvasContainer.classList.toggle('dual-canvas-mode', false);
	}

        // Show instructions
        if (instructions) {
            await showInstructions(instructions);
        }

        let prevResponseTime = null;
	let trialData;
        for (let i = 0; i < trials.length; i++) {
            if (!isRunning) break;
            // Update status display
            updateStatus(blockConfig.blockId, i + 1, trials.length, blockOrder);
	    if (canvasType === 'dual-canvas') {
		const { leftConfig, rightConfig } = buildDualCanvasSEConfigs(trials[i].meta.task, trials[i].meta.task2);
		trialData = await runDualCanvasTrial(trials[i], leftConfig, rightConfig, prevResponseTime);
	    } else {
		trialData = await runTrial(trials[i], seConfig, prevResponseTime);
	    }
            trialData.blockOrder = blockOrder;
            prevResponseTime = performance.now();

            allTrialData.push(trialData);

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

        for (let b = 0; b < sessionDef.length; b++) {
            if (!isRunning) break;
            await runBlock(sessionDef[b], b + 1);

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
	    'blockOrder', 'blockId', 'blockType', 'paradigm',
	    'trialNumber', 'task', 'task2', 'transitionType',
	    'congruency', 'previousCongruency',
	    'crossCanvasCongruency', 'previousCrossCanvasCongruency',
	    'iti', 'soa',
	    'primaryDirection', 'distractorDirection', 'ch2Direction',
	    'direction_1', 'direction_2',
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
