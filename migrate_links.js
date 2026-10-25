// migrate_links.js — move Prolific identifiers off session docs written before
// schema_version 2 and into links/{session id}, where new sessions already keep them.
//
// Dry run by default: prints what it would move and writes nothing.
//
// Usage:
//   node migrate_links.js --key serviceAccountKey_dev.json            # dry run
//   node migrate_links.js --key serviceAccountKey_prod.json --apply   # write
//
// Run node export_firestore.js first: its firestore_export.json is the backup.

const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PID_FIELDS = ['prolific_pid', 'study_id', 'session_id'];

async function main() {
    const args = process.argv.slice(2);
    const keyPath = args[args.indexOf('--key') + 1];
    const apply = args.includes('--apply');
    if (!args.includes('--key') || !keyPath || !fs.existsSync(keyPath)) {
        console.error('Usage: node migrate_links.js --key <service account key> [--apply]');
        process.exit(1);
    }

    const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    initializeApp({ credential: cert(keyData) });
    const db = getFirestore();

    const sessions = await db.collection('sessions').get();
    const toMove = sessions.docs.filter((d) => PID_FIELDS.some((f) => f in d.data()));
    console.log(
        `${keyData.project_id}: ${toMove.length} of ${sessions.size} sessions carry Prolific ids.`,
    );
    if (!apply) {
        console.log('Dry run. Re-run with --apply to move them.');
        return;
    }

    // A batch holds at most 500 writes; each session takes two.
    for (let i = 0; i < toMove.length; i += 200) {
        const batch = db.batch();
        for (const d of toMove.slice(i, i + 200)) {
            const data = d.data();
            batch.set(db.collection('links').doc(d.id), {
                uid: data.uid ?? null,
                prolific_pid: data.prolific_pid ?? null,
                study_id: data.study_id ?? null,
                session_id: data.session_id ?? null,
                created_at: data.started_at ?? FieldValue.serverTimestamp(),
            });
            batch.update(d.ref, Object.fromEntries(PID_FIELDS.map((f) => [f, FieldValue.delete()])));
        }
        await batch.commit();
    }
    console.log(`Moved ${toMove.length} sessions.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
