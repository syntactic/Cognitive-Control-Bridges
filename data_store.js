import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDSqcM_kcyRzXAikf2jd_X0mr0sI0O445I",
  authDomain: "canonical-paradigms-dev.firebaseapp.com",
  projectId: "canonical-paradigms-dev",
  storageBucket: "canonical-paradigms-dev.firebasestorage.app",
  messagingSenderId: "826914087397",
  appId: "1:826914087397:web:8a7f9e774376b5b1e5cf0c",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Module-private state: startSession fills these; saveBlock reads them.
let sessionRef = null; // a reference to THIS run's session document
let uid = null; // this participant's anonymous user id

async function startSession(meta) {
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;

  sessionRef = doc(collection(db, "sessions"));

  await setDoc(sessionRef, {
    uid,
    prolific_pid: meta.prolificPid,
    paradigm: meta.paradigm,
    condition: meta.condition,
    schema_version: 1,
    started_at: serverTimestamp(),
  });
}

async function saveBlock(blockOrder, trials) {
  const blockRef = doc(sessionRef, "blocks", String(blockOrder));
  await setDoc(blockRef, {
    uid,
    block_order: blockOrder,
    trials,
    uploaded_at: serverTimestamp(),
  });
}

window.dataStore = { startSession, saveBlock };
