// export_firestore.js — pull session data out of Firestore for local analysis.
//
// Reads run through the Firebase Admin SDK, bypassing client security rules.
// Requires serviceAccountKey.json in the repo root (download from Firebase Console ->
// Project Settings -> Service Accounts -> "Generate new private key").
// Both serviceAccountKey.json and exported data files are gitignored.
//
// Usage:
//   node export_firestore.js                     # Auto-detects prod or dev service account
//   node export_firestore.js --prod              # Explicitly use EU prod key (serviceAccountKey_prod.json)
//   node export_firestore.js --dev               # Explicitly use US dev key (serviceAccountKey_dev.json)
//   node export_firestore.js --key <path>        # Use custom key path (or via FIREBASE_KEY env var)
//   node export_firestore.js --all               # Export all sessions with trials (including dev runs)
//   node export_firestore.js --pid <id>          # Filter by specific participant ID
//   node export_firestore.js --no-combined       # Skip generating combined_trials.csv
//   node export_firestore.js --out-dir ./exports # Custom output directory (default: data/exports)

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Standard column schema across all single-canvas and dual-canvas experimental paradigms
// Mirrors the flat per-trial record uploaded by saveBlock() (session.js), plus the
// session-level fields joined in from the parent doc. Congruency is intentionally NOT
// here: it is never stored, and is reconstructed from the direction columns in analysis.
const CSV_COLUMNS = [
    'session_id',
    'prolific_pid',
    'study_id',
    'paradigm',
    'condition',
    'started_at',
    'blockOrder',
    'blockId',
    'blockType',
    'phase',
    'stage',
    'isPractice',
    'sequenceId',
    'trialNumber',
    't1_task',
    't2_task',
    'transitionType',
    'hand',
    'side',
    't1Side',
    'target_coh_level',
    'distractor_coh_level',
    't1_target_coherence',
    't1_distractor_coherence',
    't2_target_coherence',
    't1_target_dir',
    't1_distractor_dir',
    't2_target_dir',
    't2_distractor_dir',
    't1_stim_onset',
    't2_stim_onset',
    'iti',
    'iti_achieved',
    'soa',
    'earlyResolve',
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

// Full test-block size per paradigm (canonical_paradigms.js). Crossed Stroop is 108
// (its 36-cell crossing doesn't divide 96); the rest are 96. A run counts as complete
// only when all five test blocks are present at full size, not by a total trial count
// (which marks a long-training, partial-test run as done).
const FULL_BLOCK_SIZES = {
    cp_prp: 96,
    cp_taskswitch: 96,
    cp_taskswitch_asym: 96,
    cp_stroop: 96,
    cp_stroop_crossed: 108,
};
const TEST_BLOCKS_PER_SESSION = 5;

// Participants dropped from export, e.g. at-chance runs that slipped past a training gate.
// Full prolific_pids only. analysis/rt_sanity.py flags at-chance runs; copy them here or
// pass --exclude-pid <id>.
const EXCLUDED_PIDS = new Set([
    // Two at-chance Stroop pilot runs that reached the test through the ungated final stage
    // (test acc ~47% / ~46%). The gate (training_stages.js) fixes future runs; this drops
    // the data already collected under the old ungated stage.
    '69ab872f2dc6e02760face50', // cp_stroop B, test acc ~47%
    '69b04f7df5ccc90335fec74e', // cp_stroop_crossed A, test acc ~46% (also failed S6)
]);

/**
 * Converts a list of trial records into an RFC 4180 compliant CSV string.
 * Escapes internal quotes and commas so raw keypress JSON dumps don't corrupt columns.
 */
function trialsToCSV(trials) {
    const header = CSV_COLUMNS.join(',');
    const rows = trials.map((t) =>
        CSV_COLUMNS.map((col) => {
            let val = t[col];
            if (val === undefined || val === null) return '';
            if (
                typeof val === 'string' &&
                (val.includes(',') || val.includes('"') || val.includes('\n'))
            ) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
        }).join(','),
    );
    return [header, ...rows].join('\n');
}

/**
 * True if a block holds test-phase trials. Uses the per-trial `phase` field stamped by
 * session.js, with a blockOrder>=9 fallback for older runs that predate it.
 */
function blockIsTest(b) {
    return (
        Array.isArray(b.trials) &&
        b.trials.some((t) => t.phase === 'test' || (!t.isPractice && (t.blockOrder ?? 0) >= 9))
    );
}

/**
 * Classifies a session from the fields pass 1 attaches (_trials, _hasTestTrials,
 * _fullTestBlocks). Order matters: complete wins over an abort flag. ABANDONED is a
 * training drop-off with no recorded abort (a tab-close); ABORTED carries data_store's reason.
 */
function classifySession(s) {
    const n = s._trials.length;
    const fullSize = FULL_BLOCK_SIZES[s.paradigm];
    const complete = fullSize !== undefined && s._fullTestBlocks >= TEST_BLOCKS_PER_SESSION;
    if (complete) return { tag: '[COMPLETE]', kind: 'complete' };
    if (n === 0) return { tag: '[FALSE START - 0 trials]', kind: 'falsestart' };
    if (s.aborted) return { tag: `[ABORTED - ${s.abort_reason || 'unknown'}]`, kind: 'aborted' };
    if (!s._hasTestTrials) return { tag: '[ABANDONED - no test]', kind: 'abandoned' };
    return { tag: `[PARTIAL - ${n} trials]`, kind: 'partial' };
}

/**
 * Resolves the service account key file path based on environment flags,
 * explicit path options, or automatic discovery in the repository root.
 */
function resolveKeyPath(options) {
    if (options.key) return options.key;
    if (process.env.FIREBASE_KEY) return process.env.FIREBASE_KEY;

    if (options.env === 'prod') {
        const prodCandidates = [
            './serviceAccountKey_prod.json',
            './serviceAccountKey.prod.json',
            './serviceAccountKey-prod.json',
        ];
        for (const p of prodCandidates) {
            if (fs.existsSync(p)) return p;
        }
        return './serviceAccountKey_prod.json';
    }

    if (options.env === 'dev') {
        const devCandidates = [
            './serviceAccountKey_dev.json',
            './serviceAccountKey.dev.json',
            './serviceAccountKey-dev.json',
            './serviceAccountKey.json',
        ];
        for (const p of devCandidates) {
            if (fs.existsSync(p)) return p;
        }
        return './serviceAccountKey_dev.json';
    }

    // Auto-discovery order: prod key -> general key -> dev key
    const defaultCandidates = [
        './serviceAccountKey_prod.json',
        './serviceAccountKey.prod.json',
        './serviceAccountKey-prod.json',
        './serviceAccountKey.json',
        './serviceAccountKey_dev.json',
        './serviceAccountKey.dev.json',
        './serviceAccountKey-dev.json',
    ];
    for (const p of defaultCandidates) {
        if (fs.existsSync(p)) return p;
    }
    return './serviceAccountKey.json';
}

/**
 * Parses CLI flags to configure export scope and file destination.
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        all: false,
        combined: true,
        pid: null,
        excludePids: new Set(),
        outDir: './data/exports',
        env: null,
        key: null,
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--prod') {
            options.env = 'prod';
        } else if (args[i] === '--dev') {
            options.env = 'dev';
        } else if (args[i] === '--key' && i + 1 < args.length) {
            options.key = args[++i];
        } else if (args[i] === '--all') {
            options.all = true;
        } else if (args[i] === '--complete-only') {
            options.all = false;
        } else if (args[i] === '--combined') {
            options.combined = true;
        } else if (args[i] === '--no-combined') {
            options.combined = false;
        } else if (args[i] === '--pid' && i + 1 < args.length) {
            options.pid = args[++i];
        } else if (args[i] === '--exclude-pid' && i + 1 < args.length) {
            options.excludePids.add(args[++i]);
        } else if (args[i] === '--out-dir' && i + 1 < args.length) {
            options.outDir = args[++i];
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Usage: node export_firestore.js [options]

Options:
  --prod            Export from EU production database (serviceAccountKey_prod.json)
  --dev             Export from US development database (serviceAccountKey_dev.json)
  --key <path>      Explicit path to a service account JSON key file
  --complete-only   Export only complete sessions that reached the test phase (default)
  --all             Export all sessions with data (including incomplete & dev runs)
  --pid <id>        Filter sessions by participant ID
  --exclude-pid <id> Drop a participant from export (repeatable; adds to EXCLUDED_PIDS)
  --combined        Generate combined_trials.csv containing all exported sessions (default: true)
  --no-combined     Skip generating the combined CSV
  --out-dir <dir>   Output directory for CSV files (default: ./data/exports)
  -h, --help        Show this help message
`);
            process.exit(0);
        }
    }
    return options;
}

async function main() {
    const options = parseArgs();
    const keyPath = resolveKeyPath(options);

    if (!fs.existsSync(keyPath)) {
        console.error(
            `\nERROR: Service account key not found at ${keyPath}.\n` +
                'To export from the EU production database (cognitive-control-paradigms):\n' +
                '  Download the key from Firebase Console -> Project Settings -> Service Accounts -> "Generate new private key",\n' +
                '  and save it as serviceAccountKey_prod.json (or serviceAccountKey.json) in the repository root.\n' +
                'To export from the US dev database (canonical-paradigms-dev):\n' +
                '  Save it as serviceAccountKey_dev.json in the repository root and run with --dev.\n',
        );
        process.exit(1);
    }

    const keyData = JSON.parse(fs.readFileSync(path.resolve(keyPath), 'utf8'));
    initializeApp({ credential: cert(keyData) });
    const db = getFirestore();

    console.log(
        `\nConnected to Firestore project: ${keyData.project_id} (using ${path.basename(keyPath)})`,
    );

    fs.mkdirSync(options.outDir, { recursive: true });

    console.log('Fetching session records from Firestore...');
    const sessionsSnap = await db.collection('sessions').get();
    const allSessions = [];

    for (const sessionDoc of sessionsSnap.docs) {
        const session = { id: sessionDoc.id, ...sessionDoc.data() };
        const blocksSnap = await sessionDoc.ref.collection('blocks').get();
        // Blocks are stored as subcollections; sort by block_order to preserve presentation sequence
        session.blocks = blocksSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.block_order ?? 0) - (b.block_order ?? 0));
        allSessions.push(session);
    }

    // Sort newest session first so recent pilot test runs appear at the top of the summary
    allSessions.sort(
        (a, b) => (b.started_at?.toMillis?.() ?? 0) - (a.started_at?.toMillis?.() ?? 0),
    );

    // Save full JSON snapshot for provenance before flattening into CSVs
    const jsonFile = path.join(options.outDir, 'firestore_export.json');
    fs.writeFileSync(jsonFile, JSON.stringify(allSessions, null, 2));

    console.log(`Pulled ${allSessions.length} session(s) -> ${jsonFile}\n`);
    console.log('='.repeat(90));
    console.log('  FIRESTORE SESSION AUDIT & EXPORT SUMMARY');
    console.log('='.repeat(90));
    console.log(
        '  STATUS'.padEnd(26) +
            'PID'.padEnd(12) +
            'PARADIGM'.padEnd(22) +
            'COND'.padEnd(6) +
            'BLOCKS'.padEnd(8) +
            'TRIALS'.padEnd(8) +
            'SESSION ID',
    );
    console.log('-'.repeat(90));

    const exportedSessionFiles = [];
    const allExportedTrials = [];

    // Pass 1: flatten trials, stamp session metadata, and assess each session's test-block
    // coverage. Kept separate from display so the dedup pass can run between the two.
    for (const s of allSessions) {
        const trials = [];
        let hasTestTrials = false;

        for (const b of s.blocks) {
            if (Array.isArray(b.trials)) {
                for (const t of b.trials) {
                    // Stamp session metadata onto every trial row so the CSV is tidy
                    // and can be analyzed across subjects without separate metadata joins.
                    t.session_id = s.id;
                    t.prolific_pid = s.prolific_pid || '';
                    t.study_id = s.study_id || '';
                    t.condition = s.condition || '';
                    t.paradigm = t.paradigm || s.paradigm || '';
                    t.started_at = s.started_at?.toDate?.()
                        ? s.started_at.toDate().toISOString()
                        : '';

                    if (t.phase === 'test' || (!t.isPractice && t.blockOrder >= 9)) {
                        hasTestTrials = true;
                    }
                    trials.push(t);
                }
            }
        }

        const fullSize = FULL_BLOCK_SIZES[s.paradigm];
        s._trials = trials;
        s._hasTestTrials = hasTestTrials;
        // Count of test-phase blocks present at the paradigm's full size; COMPLETE needs all five.
        s._fullTestBlocks = fullSize
            ? s.blocks.filter((b) => blockIsTest(b) && (b.trials?.length ?? 0) >= fullSize).length
            : 0;
    }

    // Pass 2 (dedup): a participant who refreshed or restarted leaves several session docs.
    // Keep one per pid: the most complete (most trials), newest on a tie (sessions are sorted
    // newest-first, so a strict > keeps the first-seen). Anonymous runs (no pid) are never
    // merged. The others still print, tagged [DUPLICATE], but are not exported.
    const primaryByPid = new Map();
    for (const s of allSessions) {
        if (!s.prolific_pid) continue;
        const cur = primaryByPid.get(s.prolific_pid);
        if (!cur || s._trials.length > cur._trials.length) {
            primaryByPid.set(s.prolific_pid, s);
        }
    }

    // Pass 3: display, classify, and export the surviving primary sessions.
    const tally = {};
    for (const s of allSessions) {
        const isDuplicate = Boolean(s.prolific_pid) && primaryByPid.get(s.prolific_pid) !== s;
        const isExcluded =
            Boolean(s.prolific_pid) &&
            (EXCLUDED_PIDS.has(s.prolific_pid) || options.excludePids.has(s.prolific_pid));

        let statusTag;
        let kind;
        if (isExcluded) {
            statusTag = '[EXCLUDED]';
            kind = 'excluded';
        } else if (isDuplicate) {
            statusTag = '[DUPLICATE]';
            kind = 'duplicate';
        } else {
            ({ tag: statusTag, kind } = classifySession(s));
        }
        tally[kind] = (tally[kind] || 0) + 1;

        console.log(
            `  ${statusTag.padEnd(24)} ` +
                `${(s.prolific_pid || 'unknown').slice(0, 10).padEnd(11)} ` +
                `${(s.paradigm || 'none').slice(0, 20).padEnd(21)} ` +
                `${(s.condition || '-').padEnd(5)} ` +
                `${String(s.blocks.length).padStart(2).padEnd(7)} ` +
                `${String(s._trials.length).padStart(4).padEnd(7)} ` +
                `${s.id}`,
        );

        // Apply PID filter if requested
        if (options.pid && s.prolific_pid !== options.pid) {
            continue;
        }

        // Never export an excluded or duplicate run. Otherwise: default exports only complete
        // runs; --all exports any surviving run that logged trials.
        if (isExcluded || isDuplicate) {
            continue;
        }
        const shouldExport = options.all ? s._trials.length > 0 : kind === 'complete';
        if (shouldExport && s._trials.length > 0) {
            const startDate = s.started_at?.toDate?.()
                ? s.started_at.toDate().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                : s.id.slice(0, 8);
            const csvName = `session_${s.prolific_pid || 'anon'}_${s.paradigm || 'unknown'}_${s.condition || 'A'}_${startDate}.csv`;
            const csvPath = path.join(options.outDir, csvName);
            fs.writeFileSync(csvPath, trialsToCSV(s._trials));
            exportedSessionFiles.push(csvName);
            allExportedTrials.push(...s._trials);
        }
    }

    console.log('-'.repeat(90));

    // Participant-level tally. Completion rate counts complete sessions over unique pids, so
    // duplicates and anonymous docs don't distort it.
    const uniquePeople = new Set(
        allSessions.filter((s) => s.prolific_pid).map((s) => s.prolific_pid),
    ).size;
    const completeCount = tally.complete || 0;
    console.log(
        `\nParticipants: ${uniquePeople} unique pid(s) across ${allSessions.length} session doc(s).`,
    );
    console.log(
        `  complete ${completeCount} · partial ${tally.partial || 0} · ` +
            `abandoned ${tally.abandoned || 0} · aborted ${tally.aborted || 0} · ` +
            `false-start ${tally.falsestart || 0} · duplicate ${tally.duplicate || 0} · ` +
            `excluded ${tally.excluded || 0}`,
    );
    if (uniquePeople > 0) {
        console.log(
            `  completion rate: ${completeCount}/${uniquePeople} ` +
                `(${((completeCount / uniquePeople) * 100).toFixed(0)}%)`,
        );
    }
    console.log(
        `\nExport Mode: ${options.all ? 'ALL sessions with trials (--all)' : 'COMPLETE sessions only (default)'}`,
    );
    console.log(`Export Directory: ${path.resolve(options.outDir)}`);
    console.log(`Exported Individual Session CSVs: ${exportedSessionFiles.length}`);
    for (const f of exportedSessionFiles) {
        console.log(`  -> ${f}`);
    }

    if (options.combined && allExportedTrials.length > 0) {
        const combinedPath = path.join(options.outDir, 'combined_trials.csv');
        fs.writeFileSync(combinedPath, trialsToCSV(allExportedTrials));
        console.log(
            `\nGenerated Master Combined CSV: ${combinedPath} (${allExportedTrials.length} total trials)`,
        );
    }
    console.log();
}

// Run as a CLI only when invoked directly, so the pure classification helpers can be
// required from a verification script without connecting to Firestore.
if (require.main === module) {
    main().catch((e) => {
        console.error('Fatal error during Firestore export:', e);
        process.exit(1);
    });
}

module.exports = { blockIsTest, classifySession, FULL_BLOCK_SIZES, TEST_BLOCKS_PER_SESSION };
