// export_firestore.js — pull session data out of Firestore for local analysis.
//
// Reads run through the Firebase Admin SDK, bypassing client security rules.
// Requires serviceAccountKey.json in the repo root (download from Firebase Console ->
// Project Settings -> Service Accounts -> "Generate new private key").
// Both serviceAccountKey.json and exported data files are gitignored.
//
// Usage:
//   node export_firestore.js                     # Export complete sessions only (default)
//   node export_firestore.js --all               # Export all sessions with trials (including dev runs)
//   node export_firestore.js --pid <id>          # Filter by specific participant ID
//   node export_firestore.js --no-combined       # Skip generating combined_trials.csv
//   node export_firestore.js --out-dir ./exports # Custom output directory (default: data/exports)

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const KEY_PATH = process.env.FIREBASE_KEY || './serviceAccountKey.json';

if (!fs.existsSync(KEY_PATH)) {
    console.error(
        `\nERROR: Service account key not found at ${KEY_PATH}.\n` +
        'Download it from Firebase Console -> Project Settings -> Service Accounts -> "Generate new private key",\n' +
        'and save it as serviceAccountKey.json in the repository root.\n',
    );
    process.exit(1);
}

initializeApp({ credential: cert(require(path.resolve(KEY_PATH))) });
const db = getFirestore();

// Standard column schema across all single-canvas and dual-canvas experimental paradigms
const CSV_COLUMNS = [
    'session_id', 'prolific_pid', 'study_id', 'paradigm', 'condition', 'started_at',
    'blockOrder', 'blockId', 'blockType', 'phase', 'stage', 'isPractice', 'sequenceId',
    'trialNumber', 't1_task', 't2_task', 'transitionType', 'hand', 'target_coh_level',
    't1_target_coherence', 't1_distractor_coherence', 't2_target_coherence',
    't1_target_dir', 't1_distractor_dir', 't2_target_dir', 't2_distractor_dir',
    'congruency', 'iti', 'iti_achieved', 'soa', 'earlyResolve',
    'rt1', 'accuracy1', 'rt2', 'accuracy2', 'anticipations1', 'anticipations2',
    'responseOrder', 'rt1_raw', 'rt2_raw', 'rawKeyPresses',
];

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
            if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
        }).join(','),
    );
    return [header, ...rows].join('\n');
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
        outDir: './data/exports',
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--all') {
            options.all = true;
        } else if (args[i] === '--complete-only') {
            options.all = false;
        } else if (args[i] === '--combined') {
            options.combined = true;
        } else if (args[i] === '--no-combined') {
            options.combined = false;
        } else if (args[i] === '--pid' && i + 1 < args.length) {
            options.pid = args[++i];
        } else if (args[i] === '--out-dir' && i + 1 < args.length) {
            options.outDir = args[++i];
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Usage: node export_firestore.js [options]

Options:
  --complete-only   Export only complete sessions that reached the test phase (default)
  --all             Export all sessions with data (including incomplete & dev runs)
  --pid <id>        Filter sessions by participant ID
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
    fs.mkdirSync(options.outDir, { recursive: true });

    console.log('\nFetching session records from Firestore...');
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
    allSessions.sort((a, b) => (b.started_at?.toMillis?.() ?? 0) - (a.started_at?.toMillis?.() ?? 0));

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
        'SESSION ID'
    );
    console.log('-'.repeat(90));

    const exportedSessionFiles = [];
    const allExportedTrials = [];

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
                    t.started_at = s.started_at?.toDate?.() ? s.started_at.toDate().toISOString() : '';

                    if (t.phase === 'test' || (!t.isPractice && t.blockOrder >= 9)) {
                        hasTestTrials = true;
                    }
                    trials.push(t);
                }
            }
        }

        // Full participant run has 8 training stages (144 trials) + 5 test blocks (480 trials) = 624 trials.
        // A dev run skipping straight to test has 480 trials.
        const isComplete = trials.length >= 624 || (hasTestTrials && trials.length >= 480);
        const isFalseStart = trials.length === 0;

        let statusTag = '';
        if (isComplete) {
            statusTag = '[COMPLETE]';
        } else if (isFalseStart) {
            statusTag = '[FALSE START - 0 trials]';
        } else {
            statusTag = `[PARTIAL - ${trials.length} trials]`;
        }

        console.log(
            `  ${statusTag.padEnd(24)} ` +
            `${(s.prolific_pid || 'unknown').slice(0, 10).padEnd(11)} ` +
            `${(s.paradigm || 'none').slice(0, 20).padEnd(21)} ` +
            `${(s.condition || '-').padEnd(5)} ` +
            `${String(s.blocks.length).padStart(2).padEnd(7)} ` +
            `${String(trials.length).padStart(4).padEnd(7)} ` +
            `${s.id}`,
        );

        // Apply PID filter if requested
        if (options.pid && s.prolific_pid !== options.pid) {
            continue;
        }

        // By default export only complete runs; with --all, export any run that logged trials
        const shouldExport = options.all ? !isFalseStart : isComplete;
        if (shouldExport && trials.length > 0) {
            const startDate = s.started_at?.toDate?.()
                ? s.started_at.toDate().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                : s.id.slice(0, 8);
            const csvName = `session_${s.prolific_pid || 'anon'}_${s.paradigm || 'unknown'}_${s.condition || 'A'}_${startDate}.csv`;
            const csvPath = path.join(options.outDir, csvName);
            fs.writeFileSync(csvPath, trialsToCSV(trials));
            exportedSessionFiles.push(csvName);
            allExportedTrials.push(...trials);
        }
    }

    console.log('-'.repeat(90));
    console.log(`\nExport Mode: ${options.all ? 'ALL sessions with trials (--all)' : 'COMPLETE sessions only (default)'}`);
    console.log(`Export Directory: ${path.resolve(options.outDir)}`);
    console.log(`Exported Individual Session CSVs: ${exportedSessionFiles.length}`);
    for (const f of exportedSessionFiles) {
        console.log(`  -> ${f}`);
    }

    if (options.combined && allExportedTrials.length > 0) {
        const combinedPath = path.join(options.outDir, 'combined_trials.csv');
        fs.writeFileSync(combinedPath, trialsToCSV(allExportedTrials));
        console.log(`\nGenerated Master Combined CSV: ${combinedPath} (${allExportedTrials.length} total trials)`);
    }
    console.log();
}

main().catch((e) => {
    console.error('Fatal error during Firestore export:', e);
    process.exit(1);
});
