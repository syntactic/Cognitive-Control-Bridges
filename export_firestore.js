// export_firestore.js — pull session data OUT of Firestore for local inspection.
//
// Reads run through the Admin SDK, which runs server-side and BYPASSES the
// security rules (the rules deny all browser reads on purpose). That means this
// needs a service-account key — a SECRET. The key and this script's output are
// gitignored; never commit either.
//
// Setup (one time):
//   1. Firebase console -> gear/Project settings -> Service accounts tab ->
//      "Generate new private key". Save the downloaded file as
//      serviceAccountKey.json in this folder.
//   2. npm i -D firebase-admin
// Run:
//   node export_firestore.js
//
// Writes firestore_export.json (every session + its blocks) and prints a
// one-line summary per session.

// firebase-admin v13+ dropped the single `admin.*` namespace; import the app
// and firestore pieces from their subpaths instead.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const KEY_PATH = process.env.FIREBASE_KEY || "./serviceAccountKey.json";

initializeApp({ credential: cert(require(path.resolve(KEY_PATH))) });
const db = getFirestore();

async function main() {
  const out = [];
  const sessionsSnap = await db.collection("sessions").get();

  for (const sessionDoc of sessionsSnap.docs) {
    const session = { id: sessionDoc.id, ...sessionDoc.data() };
    const blocksSnap = await sessionDoc.ref.collection("blocks").get();
    session.blocks = blocksSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.block_order ?? 0) - (b.block_order ?? 0));
    out.push(session);
  }

  // Newest session first. started_at is a Firestore Timestamp (has toMillis()).
  out.sort(
    (a, b) =>
      (b.started_at?.toMillis?.() ?? 0) - (a.started_at?.toMillis?.() ?? 0),
  );

  const file = "firestore_export.json";
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Exported ${out.length} session(s) to ${file}\n`);
  for (const s of out) {
    const trials = s.blocks.reduce((n, b) => n + (b.trials?.length ?? 0), 0);
    console.log(
      `  ${s.id}  paradigm=${s.paradigm} condition=${s.condition} ` +
        `pid=${s.prolific_pid}  blocks=${s.blocks.length} trials=${trials}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
