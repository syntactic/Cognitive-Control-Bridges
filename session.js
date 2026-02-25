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
                movementKeyMap: { 180: 'a', 0: 'd', 90: 'w', 270: 's' },
                orientationKeyMap: { 180: 'j', 0: 'l', 90: 'i', 270: 'k' },
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
        const result = extractResponse(data, trial);
        return {
            ...trial.meta,
            ...result,
        };
    }

    /**
     * Extract RT and accuracy from SE data.
     *
     * SE keypress entries have: { eventType, key, time, isCorrect }
     *   - time: ms relative to block (i.e., trial) onset
     *   - isCorrect: true if key matched the active go signal
     *   - No field distinguishes go1 vs go2. But go1 is checked first
     *     (see trial.js keyDownHandler), so:
     *       1st correct keypress → go1 response
     *       2nd correct keypress → go2 response (dual-task only)
     *
     * Since sleep(iti) happens before block(), block-internal timestamps
     * start at 0 (after ITI). No ITI subtraction needed.
     */
    function extractResponse(data, trial) {
        const keyPresses = data.keyPresses || [];
        const isDualTask = trial.meta.paradigm === 'dual-task';

        let rt1_raw = null;
        let rt2_raw = null;
        let accuracy1 = 'miss';
        let accuracy2 = isDualTask ? 'miss' : null;
        let hadError1 = false;

        for (const kp of keyPresses) {
            if (kp.isCorrect) {
                if (rt1_raw === null) {
                    // First correct keypress → go1
                    rt1_raw = kp.time;
                    accuracy1 = hadError1 ? 'corrected' : 'correct';
                } else if (isDualTask && rt2_raw === null) {
                    // Second correct keypress → go2
                    rt2_raw = kp.time;
                    accuracy2 = 'correct';
                }
            } else {
                // Error keypress
                if (rt1_raw === null) {
                    hadError1 = true;
                    accuracy1 = 'error';
                } else if (isDualTask && rt2_raw === null) {
                    accuracy2 = 'error';
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
            rawKeyPresses: JSON.stringify(keyPresses),
        };
    }

    /**
     * Run a complete block of trials.
     */
    async function runBlock(blockDef, blockOrder) {
        const { blockConfig, numTrials, instructions } = blockDef;
        const trials = generateBlockTrials(blockConfig, numTrials);
        const seConfig = buildSEConfig(blockConfig.rso);

        // Show instructions
        if (instructions) {
            await showInstructions(instructions);
        }

        let prevResponseTime = null;

        for (let i = 0; i < trials.length; i++) {
            if (!isRunning) break;

            const trialData = await runTrial(trials[i], seConfig, prevResponseTime);
            trialData.blockOrder = blockOrder;
            prevResponseTime = performance.now();

            allTrialData.push(trialData);

            // Update status display
            updateStatus(blockConfig.blockId, i + 1, trials.length, blockOrder);
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
            'iti', 'soa',
            'primaryDirection', 'distractorDirection', 'ch2Direction',
            'rt1', 'accuracy1', 'rt2', 'accuracy2',
            'rt1_raw', 'rt2_raw',
        ];

        const header = columns.join(',');
        const rows = allTrialData.map(row =>
            columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
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
