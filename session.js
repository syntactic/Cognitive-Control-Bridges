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

    // Idle-abort budget for a single instruction screen. Set per session from
    // options.instructionTimeoutMs (index.html hands participants DEFAULT; dev and
    // test runs pass 0 = disabled). Populated once in runSession, read by runBlock.
    // abortInfo records why a session ended early.
    //
    // A screen left idle past the budget is a strike, not an immediate abort
    // (Sebastian, 09-04 l.115: "just advance it"). Only TRAINING screens count,
    // and only MAX_INSTRUCTION_TIMEOUTS of them ends the session — a participant
    // who reached the test phase keeps all their data no matter how long they idle
    // a test screen. Separately, a participant who maxes out the trial cap without
    // meeting criterion on MAX_TRAINING_STAGE_FAILURES training stages is aborted
    // too (09-04 l.117; #12): failing two easy stages is a non-engagement signal,
    // and the point is to stop paying for unusable data.
    const DEFAULT_INSTRUCTION_TIMEOUT_MS = 120000; // 2 minutes per screen
    const MAX_INSTRUCTION_TIMEOUTS = 3;
    const MAX_TRAINING_STAGE_FAILURES = 2;
    let instructionTimeoutMs = 0;
    let instructionTimeouts = 0; // training screens left idle so far this session
    let trainingStageFailures = 0; // training stages maxed out without passing
    let abortInfo = null;

    // Adaptive training hints: after HINT_STREAK trials in a row with the same error (a
    // single-task mapping error, or a reversed answer order on a PRP trial), show a
    // corrective hint for HINT_HOLD_MS between trials, then hold off for HINT_COOLDOWN
    // trials so a struggling participant isn't shown it every trial. Training only. See
    // classifyMappingError (session_helpers.js) for how an error is named.
    const HINT_STREAK = 3;
    const HINT_COOLDOWN = 4;
    const HINT_HOLD_MS = 2500;
    // Direction (deg) -> arrow for the hint's key legend. 0=right, 180=left, 90=up,
    // 270=down (canvas Y is inverted).
    const DIR_ARROWS = { 0: '→', 90: '↑', 180: '←', 270: '↓' };

    // Total blockDefs in the running session, so the block-progress readout can
    // show "Block X of N" continuously across training and test. Set in runSession.
    let sessionBlockCount = 0;

    // Master switch for the client-side CSV download. Real participants upload to
    // Firestore block by block (data_store.js), so the download is a developer
    // convenience only — enabled in developer mode (dev_mode.js), off for
    // participants. exportCSV() and all its column logic stay intact regardless.
    // Guarded for the node test env, where window is undefined.
    const CSV_EXPORT_ENABLED = typeof window !== 'undefined' && !!window.DEV_MODE;

    // SE package references
    let spriteConfig = null; // populated by loadSprites() when sprite mode is on
    async function loadSprites(stimulus = 'bird') {
        const base = 'node_modules/super-experiment/res/';
        const isBird = stimulus === 'bird';
        const imgFile = isBird ? 'bird_oriented.png' : 'fish_2.png';
        const imgDistFile = isBird ? 'bird_neutral.png' : 'fish_forward.png';
        const img = await superExperiment.loadImage(base + imgFile);
        const imgDist = await superExperiment.loadImage(base + imgDistFile);
        spriteConfig = {
            img,
            imgDist,
            imgFramesX: 4,
            imgFramesY: 2,
            imgDistFramesX: 4,
            imgDistFramesY: 2,
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

    function setupDualCanvasDOM(
        leftLabel = 'T1 (respond with left hand)',
        rightLabel = 'T2 (respond with right hand)',
    ) {
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
        wrapper.style.cssText =
            'display: flex; gap: 20px; justify-content: center; align-items: flex-start';
        wrapper.appendChild(t1);
        wrapper.appendChild(t2);
        canvasContainer.appendChild(wrapper);

        return { leftParent: t1_canvas, rightParent: t2_canvas };
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // --- Inter-trial interval bookkeeping -------------------------------
    //
    // Wall-clock (performance.now()) of the event the current ITI is measured from:
    // the participant's response on an earlyResolve trial, otherwise the end of the
    // trial's timeline. Null before a block's first trial.
    //
    // Sleeping `iti` ms from wherever teardown happened to finish overshot the
    // interval every time — by the resolve delay, a frame of detection lag, and
    // canvas teardown/creation — turning a nominal 100 ms RSI into ~280 ms.
    // Anchoring the sleep to the response and waiting until the deadline absorbs
    // all of that.
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
     * Resolves 'continue' on a keypress. If timeoutMs > 0 and the screen is left
     * open that long with no keypress, resolves 'timeout' instead — the caller
     * (runBlock) then aborts the session. timeoutMs 0 keeps the old behavior
     * (press-any-key only), which is what dev and headless test runs pass.
     */
    function showInstructions(text, demo = null, timeoutMs = 0) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'instructions-overlay';
            // Must know whether the cartoon can be placed BEFORE rendering the
            // copy, so a `[[demo]]` marker never survives into the participant-
            // facing text. test_training.js's headless DOM has no querySelector
            // (same tell showBreak uses) — the cartoon is pure presentation and
            // no training assertion depends on it.
            const willDemo = Boolean(demo && typeof overlay.querySelector === 'function');
            overlay.innerHTML = `<div class="instructions-content">${instructionHtml(text, willDemo)}</div>`;

            // Placement is instruction_demo.js's call (placeInstructionDemo): a
            // training screen has no marker and eats the after-first-paragraph
            // break instead; a test screen names the spot with `[[demo]]`
            // since its first paragraph belongs to CP_TEST_BLOCK_PREAMBLE.
            let running = null;
            const content = overlay.firstElementChild;
            if (willDemo && content) {
                running = placeInstructionDemo(content, demo, spriteConfig);
            }
            canvasContainer.appendChild(overlay);

            let done = false;
            let timer = null;
            const finish = (status) => {
                if (done) return; // a keypress and the timeout can race
                done = true;
                if (timer) clearTimeout(timer);
                document.removeEventListener('keydown', handler);
                // The cartoon owns an rAF loop and timers nothing else stops.
                if (running) running.stop();
                overlay.remove();
                resolve(status);
            };
            const handler = () => finish('continue');
            // Arm the idle timeout BEFORE the keypress listener so that under the
            // headless test's flattened clock (all setTimeout delays -> 0) the timer
            // fires first and the timeout path is reachable; with a real clock the
            // 3-minute timer simply outlives any prompt keypress.
            if (timeoutMs > 0) {
                timer = setTimeout(() => finish('timeout'), timeoutMs);
            }
            // Small delay to avoid catching the key that dismissed the previous screen
            setTimeout(() => document.addEventListener('keydown', handler), 200);
        });
    }

    /**
     * Show a between-trial training hint over the cleared canvas and remove it after
     * `durationMs` with no keypress. `correctMap` is the {direction: key} map for the trial's
     * task; each entry becomes an arrow + keycap row. 'wrong-set' names the hand and sits on
     * that hand's side; 'reversal' and 'distractor' center. 'distractor' names the feature to
     * answer, not a direction: the keys are already right, so it reminds the participant which
     * feature is the target ('mov' = flying, 'or' = facing) and to ignore the other. `task`
     * ('mov'/'or') is only read for the 'distractor' wording. 'order' shows no keys: the
     * participant has both mappings right and only needs the order rule. Its wording is the
     * S7 screen's, which names no task, so it reads the same in every condition.
     */
    function showTrainingHint(kind, correctMap, side, durationMs, task) {
        return new Promise((resolve) => {
            if (!canvasContainer || typeof document.createElement !== 'function') {
                resolve();
                return;
            }
            let rows = '';
            try {
                if (kind !== 'order') {
                    rows = Object.entries(correctMap)
                        .map(([dir, key]) => {
                            const arrow = DIR_ARROWS[dir] ?? '';
                            return (
                                `<div class="hint-row"><span class="hint-arrow">${arrow}</span>` +
                                `<img class="hint-key" src="${demoKeycap(key).src}" alt="${key}"></div>`
                            );
                        })
                        .join('');
                }
            } catch (e) {
                // demoKeycap throws on a key with no art; skip the hint, not the trial.
                resolve();
                return;
            }
            let title;
            if (kind === 'order') {
                title = 'Answer the question whose border appeared first, then the other one';
            } else if (kind === 'wrong-set') {
                title = `Use your ${side} hand`;
            } else if (kind === 'distractor') {
                // Name the target feature the participant should answer. The words match the
                // instruction copy: movement = "flying", orientation = "facing".
                const target = task === 'mov' ? 'flying' : 'facing';
                const other = task === 'mov' ? 'facing' : 'flying';
                title = `Answer which way the birds are ${target}, not ${other}`;
            } else {
                title = 'Match each key to its direction';
            }
            const hint = document.createElement('div');
            hint.className =
                'training-hint' + (kind === 'wrong-set' ? ` training-hint-${side}` : '');
            hint.innerHTML = `<div class="hint-title">${title}</div>${rows}`;
            canvasContainer.appendChild(hint);
            setTimeout(() => {
                hint.remove();
                resolve();
            }, durationMs);
        });
    }

    /**
     * Keyboard check before the first block: each response key must be pressed once,
     * and its keycap turns green when it registers. In the first pilot two runs logged
     * 36 misses in a row with no key recorded, which looks like a layout or focus
     * problem rather than a participant who stopped. Presses go through
     * normalizeResponseKey, so the check passes only if a trial would accept the keys.
     * Resolves 'continue' once every key has registered, or 'timeout' after `timeoutMs`
     * (0 waits indefinitely, as in dev and headless runs).
     */
    function showKeyCheck(keys, timeoutMs = 0) {
        return new Promise((resolve) => {
            if (!canvasContainer || typeof document.createElement !== 'function' || !keys.length) {
                resolve('continue');
                return;
            }
            const overlay = document.createElement('div');
            if (typeof overlay.querySelector !== 'function') {
                resolve('continue');
                return;
            }
            const half = Math.ceil(keys.length / 2);
            const cap = (key) =>
                `<span class="keycheck-cap" data-key="${key}">${key.toUpperCase()}</span>`;
            overlay.className = 'instructions-overlay';
            overlay.innerHTML = `
      <div class="instructions-content keycheck">
        <h2>Keyboard check</h2>
        <p>Press each of these keys once. Each one turns green when it works.</p>
        <div class="keycheck-row">
          <div class="keycheck-group">${keys.slice(0, half).map(cap).join('')}</div>
          <div class="keycheck-group">${keys.slice(half).map(cap).join('')}</div>
        </div>
        <p class="keycheck-note" aria-live="polite"></p>
      </div>`;
            canvasContainer.appendChild(overlay);

            const valid = new Set(keys);
            const seen = new Set();
            const note = overlay.querySelector('.keycheck-note');
            let timer = null;
            let done = false;
            const finish = (status) => {
                if (done) return;
                done = true;
                if (timer) clearTimeout(timer);
                document.removeEventListener('keydown', handler);
                overlay.remove();
                resolve(status);
            };
            const handler = (event) => {
                const key = normalizeResponseKey(event, valid);
                if (key === null) {
                    // Modifier and lock keys on their own say nothing about the layout.
                    if (event.key && event.key.length === 1) {
                        note.textContent =
                            "That key isn't one of these. If none of them turn green, " +
                            'check that your keyboard is set to an English layout.';
                    }
                    return;
                }
                if (seen.has(key)) return;
                seen.add(key);
                overlay.querySelector(`[data-key="${key}"]`).classList.add('keycheck-ok');
                note.textContent = '';
                if (seen.size === valid.size) {
                    note.textContent = 'All keys work.';
                    document.removeEventListener('keydown', handler);
                    setTimeout(() => finish('continue'), 800);
                }
            };
            if (timeoutMs > 0) {
                timer = setTimeout(() => finish('timeout'), timeoutMs);
            }
            // Same guard as showInstructions: don't take the key that closed the last screen.
            setTimeout(() => document.addEventListener('keydown', handler), 200);
        });
    }

    /**
     * Update the "Block X of N" progress readout above the canvas. Numbered
     * continuously across training and test so a participant sees steady progress
     * (blockOrder runs 1..sessionBlockCount). Pass no order to hide it (consent,
     * debrief, abort). No-op when the element or DOM is absent (headless tests).
     */
    function setBlockProgress(blockOrder) {
        if (typeof document === 'undefined' || !document.getElementById) return;
        const el = document.getElementById('block-progress');
        if (!el) return;
        if (blockOrder && sessionBlockCount) {
            el.textContent = `Block ${blockOrder} of ${sessionBlockCount}`;
            el.hidden = false;
        } else {
            el.textContent = '';
            el.hidden = true;
        }
    }

    /**
     * True for a phone/tablet — a device with no fine pointer (mouse or trackpad).
     * Prolific's device restriction is advisory only, so a touch user can still
     * open the study; their RT data would be unusable. Pointer type is the reliable
     * proxy (a physical keyboard cannot be feature-detected). (any-pointer: fine)
     * matches if ANY attached pointer is fine, so a touchscreen laptop — which also
     * has a trackpad — still passes. Returns false when it cannot tell (headless).
     */
    function isUnsupportedDevice() {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return false;
        }
        return !window.matchMedia('(any-pointer: fine)').matches;
    }

    /**
     * Terminal screen shown when the device is unsupported. A dead end with no
     * completion redirect — a phone/tablet user cannot do the task at all, so they
     * return the study in Prolific rather than being paid for unusable data. (This
     * is distinct from an early exit mid-session, which now routes to the normal
     * debrief and is paid; see the end of runSession.)
     */
    function showDeviceBlock(containerEl) {
        if (typeof document === 'undefined' || !containerEl) return Promise.resolve();
        containerEl.classList.add('consent-mode');
        const overlay = document.createElement('div');
        overlay.className = 'consent-overlay';
        overlay.innerHTML = `
      <div class="consent-header">
        <h2>Desktop or laptop required</h2>
      </div>
      <div class="consent-body">
        <p>This study needs a <strong>desktop or laptop computer</strong> with a
        physical keyboard and a mouse or trackpad. It cannot run on a phone or
        tablet — the task measures fast, precise key presses.</p>
        <p>Please <strong>return your submission</strong> on Prolific (you will not
        be penalized). If you can, you are welcome to take the study again on a
        computer.</p>
      </div>
    `;
        containerEl.appendChild(overlay);
        return Promise.resolve();
    }

    /**
     * Terminal screen for a participant run that cannot save data: the data store never
     * loaded ('unavailable', e.g. an ad blocker on gstatic) or refused the browser under
     * an enforced App Check ('unverified').
     */
    function showBrowserBlock(containerEl, reason) {
        if (typeof document === 'undefined' || !containerEl) return Promise.resolve();
        containerEl.classList.add('consent-mode');
        const overlay = document.createElement('div');
        overlay.className = 'consent-overlay';
        overlay.innerHTML = `
      <div class="consent-header">
        <h2>${reason === 'unavailable' ? "This page couldn't finish loading" : "We couldn't verify your browser"}</h2>
      </div>
      <div class="consent-body">
        <p>${
            reason === 'unavailable'
                ? 'The part of the study that saves your answers did not load in ' +
                  'this browser, so nothing you did would be recorded. An ad blocker ' +
                  'or a strict privacy extension is the usual cause.'
                : 'This study runs an automatic check to keep automated programs out, ' +
                  'and it did not pass in this browser. This can happen behind a VPN ' +
                  'or with strict privacy or tracker-blocking extensions.'
        }</p>
        <p>Please <strong>return your submission</strong> on Prolific (you will not
        be penalized). You are welcome to try again in a different browser or with
        those extensions turned off.</p>
      </div>
    `;
        containerEl.appendChild(overlay);
        return Promise.resolve();
    }

    /**
     * data_store.js is a module and runs after the classic scripts, so a run launched
     * on page load can get here first. Returns null if the store is not up within
     * `timeoutMs`.
     */
    async function waitForDataStore(timeoutMs) {
        const start = Date.now();
        while (!window.dataStore && Date.now() - start < timeoutMs) {
            await new Promise((r) => setTimeout(r, 50));
        }
        return window.dataStore || null;
    }

    function showConsent(containerEl, options = {}) {
        if (options.skipConsent || typeof document === 'undefined' || !containerEl) {
            return Promise.resolve();
        }
        containerEl.classList.add('consent-mode');
        const overlay = document.createElement('div');
        overlay.className = 'consent-overlay';
        overlay.innerHTML = `
      <div class="consent-header">
      <h2>Informed Consent & Study Information</h2>
      </div>
      <div class="consent-body">
        ${options.consentText || (typeof DEFAULT_CONSENT_TEXT !== 'undefined' ? DEFAULT_CONSENT_TEXT : '')}
      </div>
      <div class="consent-footer">
        <label class="checkbox-label">
          <input type="checkbox" id="consent-agree-cb">
          I have read the information above and agree to participate
        </label>
        <button id="consent-continue-btn" disabled>Continue to Experiment</button>
      </div>
      `;
        containerEl.appendChild(overlay);

        if (typeof overlay.querySelector !== 'function') {
            containerEl.classList.remove('consent-mode');
            overlay.remove();
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const checkbox = overlay.querySelector('#consent-agree-cb');
            const button = overlay.querySelector('#consent-continue-btn');
            checkbox.addEventListener('change', () => {
                button.disabled = !checkbox.checked;
            });
            button.addEventListener('click', () => {
                containerEl.classList.remove('consent-mode');
                overlay.remove();
                resolve();
            });
        });
    }

    function showDebrief(containerEl, options = {}) {
        containerEl.classList.add('consent-mode');
        const overlay = document.createElement('div');
        overlay.className = 'consent-overlay';
        const completionCode = options.completionCode || 'C19XYZ84';
        const prolificUrl =
            options.prolificUrl ||
            `https://app.prolific.com/submissions/complete?cc=${completionCode}`;
        // Only a real, configured code turns on the automatic redirect. Without one
        // (dev runs, or the code not yet pasted from the Prolific dashboard) we show
        // the manual button and never navigate — auto-redirecting on the placeholder
        // code would strand every participant on a dead Prolific URL. Automatic
        // redirect is what prevents NOCODE submissions from participants who never
        // click through.
        const hasRealCode = !!(options.completionCode || options.prolificUrl);
        const isDev = typeof window !== 'undefined' && !!window.DEV_MODE;
        const autoRedirect = hasRealCode && !isDev;
        // Delay so the debrief text and completion code are actually seen before the
        // page navigates away.
        const redirectDelayMs = options.redirectDelayMs ?? 10000;

        overlay.innerHTML = `
      <div class="consent-header">
        <h2>Session complete — Study Debriefing</h2>
      </div>
      <div class="consent-body">
        ${
            options.debriefText ||
            (typeof DEFAULT_DEBRIEF_TEXT !== 'undefined' ? DEFAULT_DEBRIEF_TEXT : '')
        }
        <div style="margin-top: 16px; padding: 12px; background: #16213e; border: 1px solid #333; border-radius: 6px; text-align: center;">
          <p style="margin-bottom: 4px; font-weight: bold; color: #a0c4ff;">Your Prolific Completion Code:</p>
          <code style="font-size: 1.3em; letter-spacing: 2px; color: #fff;">${completionCode}</code>
          <p style="margin: 8px 0 0; font-size: 0.88em; color: #aaa;">
            Questions or issues? Contact the study team at
            <a href="mailto:cognitivecontrolparadigms@gmail.com" style="color: #a0c4ff;">cognitivecontrolparadigms@gmail.com</a>
          </p>
        </div>
        ${
            autoRedirect
                ? `<p id="debrief-redirect-note" style="margin-top: 12px; text-align: center; color: #a0c4ff;">
             Returning you to Prolific automatically… if nothing happens, use the button below.
           </p>`
                : ''
        }
      </div>
      <div class="consent-footer">
        <div style="display: flex; gap: 12px;">
          ${
              CSV_EXPORT_ENABLED
                  ? `<button id="debrief-export-btn" style="background: #1a3c1a; border-color: #3a6b3a;">Download Data (CSV)</button>`
                  : ''
          }
          <a href="${prolificUrl}" rel="noopener noreferrer" style="text-decoration: none;">
            <button style="background: #0f3460; border-color: #4488ff;">Return to Prolific →</button>
          </a>
        </div>
      </div>
    `;
        containerEl.appendChild(overlay);

        if (typeof overlay.querySelector !== 'function') {
            return Promise.resolve();
        }

        // Hook up CSV export button (only rendered when CSV_EXPORT_ENABLED)
        const exportBtn = overlay.querySelector('#debrief-export-btn');
        if (CSV_EXPORT_ENABLED && exportBtn) {
            exportBtn.addEventListener('click', () => exportCSV());
        }

        // Automatic same-window redirect for a real participant. The final block was
        // already uploaded per block (data_store.js), so nothing is pending here; the
        // manual link above is the fallback if the browser blocks the navigation.
        if (autoRedirect && typeof window !== 'undefined') {
            setTimeout(() => window.location.assign(prolificUrl), redirectDelayMs);
        }

        return Promise.resolve();
    }

    /**
     * A capped, mash-proof inter-block break. Unlike showInstructions, this
     * deliberately does NOT dismiss on any key: it shows a live one-minute
     * countdown and advances only on a deliberate arm-then-confirm gesture
     * (managed by createBreakController), preventing accidental skips.
     * At the 60s cap, the break auto-advances.
     */
    /**
     * Bar chart of test-block accuracies, oldest to newest. The three best blocks get
     * gold/silver/bronze; the rest a neutral bar. Rank is within this participant's own
     * blocks, never against anyone else. Empty string for no scores (the training->test
     * seam break, before any test block has run).
     */
    function renderScoreChart(scores) {
        if (!scores || scores.length === 0) return '';
        const medals = new Array(scores.length).fill('other');
        scores
            .map((s, i) => ({ i, acc: s.accuracy }))
            .sort((a, b) => b.acc - a.acc)
            .slice(0, 3)
            .forEach(({ i }, rank) => {
                medals[i] = ['gold', 'silver', 'bronze'][rank];
            });
        const MAX_H = 110; // px for a perfect block
        const bars = scores
            .map((s, i) => {
                const pct = Math.round(s.accuracy * 100);
                const h = Math.max(4, Math.round(s.accuracy * MAX_H));
                return (
                    '<div class="score-col">' +
                    `<div class="score-pct">${pct}%</div>` +
                    `<div class="score-bar score-bar-${medals[i]}" style="height:${h}px"></div>` +
                    `<div class="score-num">${i + 1}</div>` +
                    '</div>'
                );
            })
            .join('');
        return `<div class="score-chart">${bars}</div>`;
    }

    function showBreak(bodyText, opts = {}) {
        const { scores = null, final = false } = opts;
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'instructions-overlay';
            const idlePrompt = final
                ? `Press ${BREAK_ADVANCE_KEY} to finish.`
                : `Press ${BREAK_ADVANCE_KEY} if you want to continue now.`;
            const armedPrompt = `Press ${BREAK_ADVANCE_KEY} again to confirm.`;
            // Built as an innerHTML string so the full screen (including summary)
            // is observable in headless testing. Live countdown updates happen via querySelector.
            overlay.innerHTML =
                '<div class="instructions-content">' +
                bodyText.replace(/\n/g, '<br>') +
                renderScoreChart(scores) +
                '<div class="break-countdown" style="margin-top:16px; font-variant-numeric:tabular-nums;"></div>' +
                `<div class="break-prompt" style="margin-top:12px; color:#c0c0c0;">${idlePrompt}</div>` +
                '</div>';
            canvasContainer.appendChild(overlay);

            const q = (sel) => (overlay.querySelector ? overlay.querySelector(sel) : null);
            const countdown = q('.break-countdown');
            const prompt = q('.break-prompt');

            const controller = createBreakController();
            const startedAt = performance.now();
            let done = false;
            let iv = null;

            const handler = (e) => {
                const now = e && typeof e.timeStamp === 'number' ? e.timeStamp : performance.now();
                const result = controller.press(e && e.key, now, e && e.repeat);
                if (result === 'armed') {
                    if (prompt) prompt.textContent = armedPrompt;
                } else if (result === 'advance') finish();
            };
            const finish = () => {
                if (done) return;
                done = true;
                if (iv) clearInterval(iv);
                document.removeEventListener('keydown', handler);
                overlay.remove();
                resolve();
            };

            const renderCountdown = () => {
                const remMs = BREAK_CAP_MS - (performance.now() - startedAt);
                const remSec = Math.max(0, Math.ceil(remMs / 1000));
                if (countdown) {
                    countdown.textContent = `${final ? 'Finishing' : 'Break'}: ${remSec} s remaining.`;
                    // Draw the eye as the auto-advance approaches.
                    const urgent = remSec <= 10;
                    countdown.style.color = urgent ? '#ff5555' : '';
                    countdown.style.fontWeight = urgent ? 'bold' : '';
                }
                if (remMs <= 0) finish(); // cap reached — auto-advance
            };
            renderCountdown();
            iv = setInterval(renderCountdown, 250);

            // 200 ms guard prevents catching keys held down from the preceding trial.
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
        const itiAchieved = await waitITI(trial.meta.iti);

        const data = await seBlock(
            [trial.seParams], // single-trial sequence
            0, // regen
            seConfig,
            false, // isLoop
            seConfig.feedback, // isFeedback
            null, // canvasId (auto-create)
            canvasContainer, // parent element
        );
        await seEndBlock();

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
            data = await seBlock(
                [trial.seParams],
                0,
                config,
                false,
                config.feedback,
                'canvasLeft',
                leftParent,
            );
            await seEndBlock('canvasLeft');
        } else {
            data = await seBlock(
                [trial.seParams],
                0,
                config,
                false,
                config.feedback,
                'canvasRight',
                rightParent,
            );
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

        // Both canvases go up at trial onset; the SOA lives inside the task
        // canvas's timeline (applySOAOffset in generateSidedTrials), not a
        // setTimeout here, so it lands with frame accuracy and no canvas pop-in
        // contaminates this condition's single-task RT reference.
        const placeholder = document.createElement('div');
        placeholder.style.cssText =
            'width:100%; min-height:580px; display:flex; align-items:center; justify-content:center; font-size:6em; color:#888; background:#000;';
        placeholder.textContent = '*';
        asteriskParent.appendChild(placeholder);

        const data = await seBlock(
            [trial.seParams],
            0,
            taskConfig,
            false,
            taskConfig.feedback,
            canvasId,
            taskParent,
        );
        await seEndBlock(canvasId);
        asteriskParent.innerHTML = '';
        const result = extractAlternatingResponse(data, trial, taskConfig);
        markITIAnchor(taskConfig, result);
        // Remap response to T2 slot: asterisk is T1 (no response), actual task is T2
        return {
            ...trial.meta,
            rt1: null,
            rt1_raw: null,
            accuracy1: null,
            anticipations1: null,
            rt2: result.rt1,
            rt2_raw: result.rt1_raw,
            accuracy2: result.accuracy1,
            anticipations2: result.anticipations1,
            responseOrder: null,
            rawKeyPresses: result.rawKeyPresses,
            iti_achieved: itiAchieved,
        };
    }

    async function runDualCanvasTrial(trial, leftConfig, rightConfig, prevResponseTime) {
        const itiAchieved = await waitITI(trial.meta.iti);
        const t1Side = trial.meta.t1Side ?? 'left';
        const leftLabel =
            t1Side === 'left' ? 'T1 (respond with left hand)' : 'T2 (respond with left hand)';
        const rightLabel =
            t1Side === 'left' ? 'T2 (respond with right hand)' : 'T1 (respond with right hand)';
        const { leftParent, rightParent } = setupDualCanvasDOM(leftLabel, rightLabel);

        const leftPromise = seBlock(
            [trial.leftSeParams],
            0,
            leftConfig,
            false,
            leftConfig.feedback,
            'canvasLeft',
            leftParent,
        );
        const rightPromise = seBlock(
            [trial.rightSeParams],
            0,
            rightConfig,
            false,
            rightConfig.feedback,
            'canvasRight',
            rightParent,
        );
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
            t1Data,
            t2Data,
            trial.meta.t1_stim_onset,
            trial.meta.t2_stim_onset,
            t1Config,
            t2Config,
        );
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
        setBlockProgress(blockOrder);
        const numTrials = blockDef.isTraining ? TRAINING_CAP : blockDef.numTrials;
        // A stage may ask for its own advancement threshold — PRP's S8 uses 12/16
        // (see training_stages.js for why). Resolved once here and handed to both
        // the stop-early predicate and the stage summary, so they can't diverge and
        // let a stage stop while its logged criterionMet says otherwise. Left
        // `undefined` when the stage doesn't ask, so the 16/14 defaults in
        // session_helpers.js stay the single home for the shared value.
        const advancementWindow = blockDef.advancementWindow;
        const advancementThreshold = blockDef.advancementThreshold;
        let trials;
        let seConfig;
        const feedback = blockConfig.feedback ?? true;
        const acceptFirstResponse = blockConfig.acceptFirstResponse ?? false;
        const canvasType = blockConfig.paradigm ?? 'single-canvas';
        // Fourcue single-task blocks route keys + cue side per trial from meta.hand
        // (see the single-canvas trial branch below). PRP (dual-task) is task-tied and
        // excluded; disjoint has cueMode 'hue' and is untouched.
        const fourcueSingleTask = isFourcueSingleTaskBlock(blockConfig, canvasType);
        const t1Side = blockConfig.t1Side ?? 'left';
        let leftParent, rightParent;
        if (canvasType === 'dual-canvas') {
            trials = generateDualCanvasBlockTrials(blockConfig, numTrials);
            canvasContainer.classList.toggle('dual-canvas-mode', true);
        } else if (canvasType === 'alternating') {
            trials = generateSidedTrials(blockConfig, numTrials);
            canvasContainer.classList.toggle('dual-canvas-mode', true);
            ({ leftParent, rightParent } = setupDualCanvasDOM(
                'Respond with left hand',
                'Respond with right hand',
            ));
        } else if (canvasType === 'prp-baseline') {
            trials = generateSidedTrials(blockConfig, numTrials);
            canvasContainer.classList.toggle('dual-canvas-mode', true);
            if (t1Side === 'left') {
                ({ leftParent, rightParent } = setupDualCanvasDOM(
                    'S1 (no response needed)',
                    'Respond with right hand: J/L',
                ));
            } else {
                ({ leftParent, rightParent } = setupDualCanvasDOM(
                    'Respond with left hand: A/D',
                    'S1 (no response needed)',
                ));
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
                const scheduleLength =
                    blockConfig.soaSchedule.scheduleLength ?? TRAINING_SOA_SCHEDULE_LENGTH;
                const vectors = generateSequenceVectors(blockConfig, numTrials);
                vectors.soa = vectors.soa.map(
                    (sampled, i) =>
                        scheduledSoa(i, blockConfig.soaSchedule.levels, scheduleLength) ?? sampled,
                );
                preVec = vectors;
            }
            trials = generateBlockTrials(
                blockConfig,
                preVec ? preVec.task1.length : numTrials,
                preVec,
            );
            seConfig = buildSEConfig(
                blockConfig.rso,
                blockConfig.earlyResolve,
                feedback,
                acceptFirstResponse,
                blockConfig.keyMaps,
                blockConfig.cueMode,
                blockConfig.cueBorderStyle,
            );
            canvasContainer.classList.toggle('dual-canvas-mode', false);
        }

        if (instructions) {
            const status = await showInstructions(instructions, demo, instructionTimeoutMs);
            if (status === 'timeout' && blockDef.isTraining) {
                // A training screen left idle is a strike. On the third, abort:
                // record why and stop the run (isRunning=false makes runSession skip
                // this block's break/upload and the final debrief and show the abort
                // screen instead — no trials ran, so nothing to log). Before the
                // third, fall through and start the block anyway ("just advance it").
                instructionTimeouts += 1;
                if (instructionTimeouts >= MAX_INSTRUCTION_TIMEOUTS) {
                    abortInfo = {
                        reason: 'instruction_timeout',
                        stage: blockDef.stage ?? null,
                        blockId: blockConfig.blockId ?? null,
                        blockOrder,
                        timeouts: instructionTimeouts,
                    };
                    isRunning = false;
                    return;
                }
            }
            // A test-phase timeout (status === 'timeout' && !isTraining) is not a
            // strike and never aborts — it just advances into the block, keeping the
            // data of a participant who already made it to the test phase.
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
            if (typeof blockDef.runQuest === 'object') {
                priorMean = blockDef.runQuest.priorMean ?? priorMean;
                priorSD = blockDef.runQuest.priorSD ?? priorSD;
            }
            quest = createQuest(priorMean, priorSD);
        }
        let prevResponseTime = null;
        let trialData;
        let blockOutcomes = [];
        // Running counts of consecutive mapping errors, for the adaptive training hints.
        let wrongSetStreak = 0;
        let reversalStreak = 0;
        let distractorStreak = 0;
        let orderStreak = 0;
        let hintCooldown = 0;
        for (
            let i = 0;
            i < trials.length &&
            (!blockDef.isTraining ||
                !meetsAdvancementCriterion(blockOutcomes, advancementWindow, advancementThreshold));
            i++
        ) {
            if (!isRunning) break;
            updateStatus(blockConfig.blockId, i + 1, trials.length, blockOrder);
            const task_1 = trials[i].meta.t1_task;
            const task_2 = trials[i].meta.t2_task;
            // The single-task SE config this trial used, for mapping-error detection.
            // Stays null on the dual/alternating paths, which have no single "task".
            let usedSeConfig = null;

            // Resolve SE param objects: dual-canvas has leftSeParams/rightSeParams,
            // all other paradigms have a single seParams.
            const trialT1Side = trials[i].meta.t1Side ?? 'left';
            let t1Params, t2Params;
            if (canvasType === 'dual-canvas') {
                t1Params =
                    trialT1Side === 'left' ? trials[i].leftSeParams : trials[i].rightSeParams;
                t2Params =
                    trialT1Side === 'left' ? trials[i].rightSeParams : trials[i].leftSeParams;
            } else {
                t1Params = trials[i].seParams;
                t2Params = trials[i].seParams;
            }

            // override coherence if we're running Quest
            if (blockDef.runQuest) {
                newCoherence = Math.min(quest.getNextIntensity(), 0.9);
                t1Params['coh_' + task_1 + '_1'] = newCoherence;
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
                t1Params['coh_' + task_1 + '_1'] = rampedCoherence(
                    i,
                    ramp.from,
                    rampTo,
                    ramp.rampLength ?? TRAINING_RAMP_LENGTH,
                );
            }
            if (canvasType === 'dual-canvas') {
                const leftTask =
                    trialT1Side === 'left' ? trials[i].meta.t1_task : trials[i].meta.t2_task;
                const rightTask =
                    trialT1Side === 'left' ? trials[i].meta.t2_task : trials[i].meta.t1_task;
                const { leftConfig, rightConfig } = buildDualCanvasSEConfigs(
                    leftTask,
                    rightTask,
                    trials[i].meta.earlyResolve,
                    feedback,
                    acceptFirstResponse,
                    computeDualCanvasSize(),
                    blockConfig.mapping,
                );
                trialData = await runDualCanvasTrial(
                    trials[i],
                    leftConfig,
                    rightConfig,
                    prevResponseTime,
                );
            } else if (canvasType === 'alternating') {
                const config = buildAlternatingSEConfig(
                    trials[i].meta.t1_task,
                    trials[i].meta.side,
                    trials[i].meta.earlyResolve,
                    feedback,
                    acceptFirstResponse,
                    computeDualCanvasSize(),
                    blockConfig.mapping,
                );
                trialData = await runAlternatingTrial(trials[i], config, leftParent, rightParent);
            } else if (canvasType === 'prp-baseline') {
                const config = buildAlternatingSEConfig(
                    trials[i].meta.t2_task,
                    trials[i].meta.side,
                    trials[i].meta.earlyResolve,
                    feedback,
                    acceptFirstResponse,
                    computeDualCanvasSize(),
                    blockConfig.mapping,
                );
                trialData = await runBaselinePRPTrial(trials[i], config, leftParent, rightParent);
            } else {
                // Fourcue single-task: the response hand (and therefore the key
                // set and the cue's side) varies per trial, so the SE config is
                // rebuilt from this trial's hand. Dual-task PRP is excluded — its
                // hands are task-tied by condition, so the block-level seConfig
                // already places them. Disjoint has no meta.hand and keeps seConfig.
                let trialSeConfig = seConfig;
                if (fourcueSingleTask && trials[i].meta.hand) {
                    const km = fourcueSingleTaskKeyMaps(task_1, trials[i].meta.hand);
                    trialSeConfig = buildSEConfig(
                        blockConfig.rso,
                        blockConfig.earlyResolve,
                        feedback,
                        acceptFirstResponse,
                        km,
                        blockConfig.cueMode,
                        blockConfig.cueBorderStyle,
                    );
                }
                usedSeConfig = trialSeConfig;
                trialData = await runTrial(trials[i], trialSeConfig, prevResponseTime);
            }

            if (blockDef.isTraining) {
                blockOutcomes.push(isTrialCorrectForAdvancement(trialData));
            }

            // Adaptive hint: track runs of the same error and, once one reaches HINT_STREAK,
            // show a hint before the next trial. usedSeConfig is null off the single-canvas
            // path, so dual-canvas and alternating blocks never hint.
            if (blockDef.isTraining && usedSeConfig) {
                const errType = classifyMappingError(trialData, usedSeConfig);
                wrongSetStreak = errType === 'wrong-set' ? wrongSetStreak + 1 : 0;
                reversalStreak = errType === 'reversal' ? reversalStreak + 1 : 0;
                distractorStreak = errType === 'distractor' ? distractorStreak + 1 : 0;
                orderStreak = errType === 'order' ? orderStreak + 1 : 0;

                if (hintCooldown > 0) {
                    hintCooldown--;
                } else if (
                    wrongSetStreak >= HINT_STREAK ||
                    reversalStreak >= HINT_STREAK ||
                    distractorStreak >= HINT_STREAK ||
                    orderStreak >= HINT_STREAK
                ) {
                    const kind =
                        wrongSetStreak >= HINT_STREAK
                            ? 'wrong-set'
                            : reversalStreak >= HINT_STREAK
                              ? 'reversal'
                              : distractorStreak >= HINT_STREAK
                                ? 'distractor'
                                : 'order';
                    const correctMap =
                        task_1 === 'mov'
                            ? usedSeConfig.movementKeyMap
                            : usedSeConfig.orientationKeyMap;
                    const side =
                        demoKeycap(Object.values(correctMap)[0]).set === 'wasd' ? 'left' : 'right';
                    await showTrainingHint(kind, correctMap, side, HINT_HOLD_MS, task_1);
                    // The hint ran during what would have been the ITI, so re-anchor: its
                    // dwell shouldn't be billed to the next trial's achieved ITI.
                    itiAnchor = null;
                    hintCooldown = HINT_COOLDOWN;
                    wrongSetStreak = 0;
                    reversalStreak = 0;
                    distractorStreak = 0;
                    orderStreak = 0;
                }
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
            Object.assign(
                trialData,
                deriveTargetCoherenceFields(task_1, task_2, t1Params, t2Params, canvasType),
            );
            prevResponseTime = performance.now();
            if (blockDef.runQuest) {
                quest.update(newCoherence, trialData.accuracy1 === 'correct');
            }

            allTrialData.push(trialData);
        }
        // Not getFinalEstimate: in a near-perfect block, subtracting the prior back out is unstable.
        if (blockDef.runQuest) {
            return quest.getNextIntensity();
        }
        // Training stages report their outcome to runSession the same way Quest
        // blocks do (nothing outside runBlock sees per-trial results otherwise).
        // runSession disambiguates the two on blockDef.runQuest/isTraining, NOT on
        // the return value — see the comment at the call site.
        if (blockDef.isTraining) {
            const summary = summarizeAdvancementWindow(
                blockOutcomes,
                advancementWindow,
                advancementThreshold,
            );
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
                exclusionCandidate:
                    (blockDef.stage === 'S2' || blockDef.stage === 'S3') &&
                    !summary.criterionMet &&
                    blockOutcomes.length >= numTrials,
                // Any training stage the participant maxed out without meeting
                // criterion. runSession counts these across the whole training
                // sequence and aborts on the second (MAX_TRAINING_STAGE_FAILURES).
                stageFailed: !summary.criterionMet && blockOutcomes.length >= numTrials,
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
                        'otherwise run the same trials twice. Check the sequence-id draw.',
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
            if (!src) {
                blockDef._vectors = null;
                continue;
            }
            const resp = await fetch(src);
            if (!resp.ok) {
                throw new Error(`Failed to fetch sequence CSV '${src}'(HTTP ${resp.status})`);
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
        // Desktop/keyboard gate, before consent. Refuse a real participant run on a
        // touch-only device (dev is on a desktop; headless tests pass no window, so
        // isUnsupportedDevice returns false). options.skipDeviceCheck overrides it
        // for the rare case of piloting on an unusual device.
        if (
            !options.skipDeviceCheck &&
            typeof window !== 'undefined' &&
            !window.DEV_MODE &&
            isUnsupportedDevice()
        ) {
            await showDeviceBlock(containerEl);
            return;
        }
        // Participant runs only, before consent. CSV export is dev-only, so a
        // participant run without the data store would save nothing. verifyBrowser
        // decides whether a failed App Check blocks (only under enforcement).
        if (options.prolificPid && typeof window !== 'undefined' && !window.DEV_MODE) {
            const store = await waitForDataStore(options.dataStoreWaitMs ?? 10000);
            if (!store) {
                await showBrowserBlock(containerEl, 'unavailable');
                return;
            }
            if (store.verifyBrowser && !(await store.verifyBrowser())) {
                await showBrowserBlock(containerEl, 'unverified');
                return;
            }
        }
        // Per-screen idle budget. index.html passes DEFAULT for participants and 0
        // for dev; tests omit it entirely (falsy -> 0 = disabled).
        instructionTimeoutMs = Number(options.instructionTimeoutMs) || 0;
        instructionTimeouts = 0;
        trainingStageFailures = 0;
        abortInfo = null;
        sessionBlockCount = sessionDef.length;
        await showConsent(canvasContainer, options);

        // Progressive data upload is enabled only for a real participant run: the
        // shim (data_store.js) must have loaded, AND the participant metadata that
        // index.html threads in from participantMode must be present. The demo
        // dropdown path has neither, so it never writes to Firestore.
        let uploadActive = !!(
            window.dataStore &&
            options.paradigm &&
            options.condition &&
            options.prolificPid
        );
        if (uploadActive) {
            try {
                await window.dataStore.startSession(options);
            } catch (e) {
                // A failed session-doc write must not stop the experiment — the
                // end-of-session CSV download stays as the backstop. Disable further
                // upload attempts, since saveBlock needs the session doc that failed.
                console.warn('Data upload disabled: startSession failed.', e);
                uploadActive = false;
            }
        }

        currentSessionDef = sessionDef;
        allTrialData = [];
        trainingLog = [];
        isRunning = true;

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

        // After startSession, so a timeout here still reaches the Firestore record. It
        // ends the run like any other idle exit: abort recorded, ordinary debrief.
        const keyCheck = await showKeyCheck(sessionResponseKeys(sessionDef), instructionTimeoutMs);
        if (keyCheck === 'timeout') {
            abortInfo = { reason: 'key_check_timeout', stage: null, blockId: null, blockOrder: 0 };
            isRunning = false;
        }

        const questCoherences = { mov: 0.4, or: 0.6 }; // starting values, refined by QUEST
        // Index into allTrialData of the first trial not yet covered by a break
        // summary. "Since the last break", not "this block": when a break is
        // skipped the next summary spans everything accumulated since.
        let summaryAnchor = 0;
        // One accuracy summary per finished test block, oldest first, for the running-score
        // chart on the break screens (and the final screen). Training blocks never enter it.
        const testBlockScores = [];
        for (let b = 0; b < sessionDef.length; b++) {
            if (!isRunning) break;
            // runBlock returns a Quest coherence for Quest blocks and a training
            // stage summary for training stages. Branch on what the blockDef ASKED
            // FOR, never on `!== undefined`: a stage summary reaching
            // overwriteCoherence would be injected into later blocks as a coherence.
            const blockStartIdx = allTrialData.length;
            const blockDef = sessionDef[b];
            const blockResult = await runBlock(blockDef, b + 1);
            // An idle-timeout abort inside runBlock: stop before this block's break
            // and upload (no trials ran) and fall through to the abort screen below.
            if (abortInfo) break;
            if (blockDef.runQuest) {
                questCoherences[blockDef.blockConfig.startTask] = blockResult;
                overwriteCoherence(sessionDef, questCoherences, b + 1);
            } else if (blockDef.isTraining && blockResult) {
                trainingLog.push(blockResult);
                // Training-failure abort: two maxed-out-without-passing stages ends
                // the session. Unlike the timeout abort this block's trials DID run,
                // so we set isRunning=false (which skips the break below) but let the
                // saveBlock at the end of this iteration upload the stage's data
                // before the loop breaks on the next `!isRunning` check.
                if (blockResult.stageFailed) {
                    trainingStageFailures += 1;
                    if (trainingStageFailures >= MAX_TRAINING_STAGE_FAILURES) {
                        abortInfo = {
                            reason: 'training_failure',
                            stage: blockDef.stage ?? null,
                            blockId: blockDef.blockConfig?.blockId ?? null,
                            blockOrder: b + 1,
                            failures: trainingStageFailures,
                        };
                        isRunning = false;
                    }
                }
            }

            // Capped inter-block break: placed (a) between test blocks and (b) at the
            // training->test seam. Skipped between adjacent training stages, which transition
            // directly via their own instruction screens.
            const isTrainingStage = blockDef.phase === 'training';
            const nextBlockDef = sessionDef[b + 1];
            if (b < sessionDef.length - 1 && isRunning) {
                const nextIsTraining = nextBlockDef.phase === 'training';
                const seam = isTrainingStage && !nextIsTraining; // last training -> first test
                const betweenTests = !isTrainingStage; // test -> test
                if (seam || betweenTests) {
                    // Block-level performance summary between test blocks. Placed strictly
                    // between blocks so no exogenous feedback appears during trial response windows.
                    // Training trials (which have instant feedback) are excluded.
                    const sinceBreak = allTrialData
                        .slice(summaryAnchor)
                        .filter((row) => row.phase !== 'training');
                    const summary = summarizeBlockPerformance(sinceBreak);
                    const summaryLine = formatBreakSummary(summary);
                    summaryAnchor = allTrialData.length;
                    // A test->test break follows exactly one test block, so its summary is
                    // that block's score. The seam break has no test rows yet (null summary).
                    if (betweenTests && summary) testBlockScores.push(summary);
                    const heading = seam
                        ? 'Training complete — the test blocks begin next.'
                        : 'Block complete.';
                    await showBreak(
                        `${heading} \n\n` +
                            (summaryLine ? `${summaryLine} \n\n` : '') +
                            'Take a break — up to one minute.',
                        { scores: testBlockScores },
                    );
                }
            }
            const blockRows = allTrialData.slice(blockStartIdx);
            if (uploadActive) {
                try {
                    await window.dataStore.saveBlock(b + 1, blockRows);
                } catch (e) {
                    // Non-fatal: log and keep running. A later block may still upload,
                    // and the CSV export remains complete regardless.
                    console.warn(`Data upload: saveBlock ${b + 1} failed.`, e);
                }
            }
        }

        setBlockProgress(null); // no block number on the terminal screens

        if (abortInfo && uploadActive && window.dataStore.abortSession) {
            // Persist the early exit so the Firestore record marks a non-completer
            // for the completion-rate analysis (non-fatal if the write fails). The
            // participant is NOT shown a failure screen — see below.
            try {
                await window.dataStore.abortSession(abortInfo);
            } catch (e) {
                console.warn('Data upload: abortSession failed.', e);
            }
        }
        // Show the debrief on a completed OR an early-exited session, but not on a
        // bare external stopSession() (a dev control: isRunning false, no abort).
        // Per Sebastian (09-10 l.64-68) an early-exited participant is treated as a
        // completer for payment: the same debrief, the same completion code, no
        // failure screen — so they receive the flat reward and are not made to feel
        // penalized, and we avoid maintaining a special-case abort screen. The abort
        // is still recorded above, so attrition is measurable without punishing anyone.
        if (abortInfo || isRunning) {
            isRunning = false;
            // Final running-score screen before the debrief. The last test block never
            // triggers a break (no block follows it), so add its score here and show the
            // full chart — the highest-motivation moment to end on. Skipped when a run
            // never reached the test (aborted or training-only), where there's no score.
            if (!abortInfo) {
                const finalRows = allTrialData
                    .slice(summaryAnchor)
                    .filter((row) => row.phase !== 'training');
                const finalSummary = summarizeBlockPerformance(finalRows);
                if (finalSummary) testBlockScores.push(finalSummary);
                if (testBlockScores.length > 0) {
                    await showBreak(
                        "That's the last block — thank you.\n\n" +
                            'Here is how you did across the test blocks.',
                        { scores: testBlockScores, final: true },
                    );
                }
            }
            await showDebrief(canvasContainer, options);
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
        // The per-trial "Trial X/Total" readout is a developer aid only. A
        // participant must not see it: a number that ticks every trial invites
        // eye-darting away from the stimulus mid-task. (#block-progress "Block X of
        // N" stays for everyone — it updates once per block, not per trial.) The
        // #session-status element itself is left in place so index.html can still
        // write error messages into it.
        if (typeof window === 'undefined' || !window.DEV_MODE) return;
        const statusEl = document.getElementById('session-status');
        if (statusEl) {
            statusEl.textContent = `Block ${blockOrder}: ${blockId} — Trial ${trialNum}/${totalTrials}`;
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
            'blockOrder',
            'blockId',
            'blockType',
            'paradigm',
            'isPractice',
            'phase',
            'stage',
            'sequenceId',
            'trialNumber',
            't1_task',
            't2_task',
            'transitionType',
            'iti',
            'iti_achieved',
            'soa',
            'side',
            't1Side',
            'earlyResolve',
            't1_stim_onset',
            't2_stim_onset',
            't1_target_dir',
            't1_distractor_dir',
            't2_target_dir',
            't2_distractor_dir',
            'target_coh_level',
            'distractor_coh_level',
            't1_target_coherence',
            't1_distractor_coherence',
            't2_target_coherence',
            'rt1',
            'accuracy1',
            'rt2',
            'accuracy2',
            'anticipations1',
            'anticipations2',
            'responseOrder',
            'rt1_raw',
            'rt2_raw',
            'rawKeyPresses',
        ];

        const header = columns.join(',');
        const rows = allTrialData.map((row) =>
            columns
                .map((col) => {
                    const val = row[col];
                    if (val === null || val === undefined) return '';
                    if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                        return `"${val.replace(/"/g, '""')}"`;
                    }
                    return val;
                })
                .join(','),
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
        // No-op while CSV export is disabled: the toolbar button stays greyed out.
        if (!CSV_EXPORT_ENABLED) return;
        const btn = document.getElementById('export-btn');
        if (btn) btn.disabled = false;
    }

    // Public API
    return {
        runSession,
        stopSession,
        exportCSV,
        showConsent,
        showDebrief,
        getData: () => allTrialData,
        getTrainingLog: () => trainingLog,
        getAbortInfo: () => abortInfo,
        DEFAULT_INSTRUCTION_TIMEOUT_MS,
    };
})();
