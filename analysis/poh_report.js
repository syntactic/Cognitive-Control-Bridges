// poh_report.js — fetch the final Proof of Human report for every session that recorded
// a poh_session_id. Scores are record only; nothing in the study acts on them.
//
// Usage:
//   POH_SECRET_KEY=... node analysis/poh_report.js --key serviceAccountKey_dev.json [--run <label>]
//
// Writes poh_reports.json (full responses) and poh_reports.csv (one row per session:
// session doc id, run label, risk score, recommended action, and every check reported as
// "Detected") to the current directory.

const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

async function fetchReport(pohSessionId, secret) {
    const res = await fetch(`https://api.poh.org/v1/sessions/${pohSessionId}/report`, {
        headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return res.json();
}

// "biometric:programmatic_typing; device:vpn" — the checks that fired.
function detectedChecks(report) {
    return Object.entries(report)
        .filter(([field, value]) => field.endsWith('_checks') && value)
        .flatMap(([field, checks]) =>
            Object.entries(checks)
                .filter(([, result]) => result === 'Detected')
                .map(([name]) => `${field.replace('_checks', '')}:${name}`),
        )
        .join('; ');
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
    const args = process.argv.slice(2);
    const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
    const keyPath = arg('--key');
    const run = arg('--run');
    const secret = process.env.POH_SECRET_KEY;
    if (!keyPath || !fs.existsSync(keyPath) || !secret) {
        console.error(
            'Usage: POH_SECRET_KEY=... node analysis/poh_report.js --key <service account key> [--run <label>]',
        );
        process.exit(1);
    }

    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
    const snap = await getFirestore().collection('sessions').get();
    const sessions = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.poh_session_id && (!run || s.poh_run === run));

    const results = [];
    for (const s of sessions) {
        const report = await fetchReport(s.poh_session_id, secret);
        results.push({ session: s.id, run: s.poh_run ?? '', app_check: s.app_check, report });
    }

    fs.writeFileSync('poh_reports.json', JSON.stringify(results, null, 2));
    const header = ['session', 'run', 'app_check', 'risk_score', 'recommended_action', 'detected'];
    const rows = results.map(({ session, run, app_check, report }) => [
        session,
        run,
        app_check,
        report.risk_score ?? report.error,
        report.recommended_action,
        report.error ? '' : detectedChecks(report),
    ]);
    fs.writeFileSync(
        'poh_reports.csv',
        [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n',
    );
    console.log(`${results.length} sessions -> poh_reports.json, poh_reports.csv`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
