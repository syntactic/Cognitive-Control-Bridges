import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app-check.js';
import {
  getAuth,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

// Two Firebase projects: a US dev database for local/dev work and an EU prod
// database that holds real participant data (GDPR — EU subjects' data must stay in
// the EU). Which one this page talks to is a property of WHERE THE PAGE IS SERVED,
// NOT of the ?dev UI flag: a participant-controlled URL param must never decide
// where participant data lands. See selectFirebaseConfig() below.

// The prod EU project's hosting hostname(s). Firebase Hosting serves the site on
// BOTH default domains, and location.hostname is whatever the participant loaded —
// so list both, or a page reached via the unlisted one silently writes to dev.
// Add a custom domain here too if you set one up.
const PROD_HOSTS = [
  'cognitive-control-paradigms.web.app',
  'cognitive-control-paradigms.firebaseapp.com',
];

// US dev database (unchanged).
const DEV_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDSqcM_kcyRzXAikf2jd_X0mr0sI0O445I',
  authDomain: 'canonical-paradigms-dev.firebaseapp.com',
  projectId: 'canonical-paradigms-dev',
  storageBucket: 'canonical-paradigms-dev.firebasestorage.app',
  messagingSenderId: '826914087397',
  appId: '1:826914087397:web:8a7f9e774376b5b1e5cf0c',
  // reCAPTCHA Enterprise site key registered for this project's App Check; null
  // turns App Check off.
  recaptchaSiteKey: null,
  // Flip together with the console's enforcement switch. While false, a failed
  // check is recorded on the session doc and the run continues.
  appCheckEnforced: false,
};

// EU prod database (EU region, GDPR). Real participant runs on the prod host land
// here; selectFirebaseConfig() below routes by host.
const PROD_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAQcQW1ng3qHt-ELZ4cEWb9FU0wvLqUwZg',
  authDomain: 'cognitive-control-paradigms.firebaseapp.com',
  projectId: 'cognitive-control-paradigms',
  storageBucket: 'cognitive-control-paradigms.firebasestorage.app',
  messagingSenderId: '348836487217',
  appId: '1:348836487217:web:2068f57d361e10cd6b7510',
  recaptchaSiteKey: '6LepQs8tAAAAABj53guoo-eKt58pdXqyy8sddDmw',
  appCheckEnforced: false,
};

// Pick the database from the deployment host. The prod host writes to EU prod by
// default, so an EU participant's data stays in the EU. The single escape hatch is
// ?db=dev on the prod host, so the real prod page can be smoke-tested without
// polluting prod data — a participant would have to know the param and would only
// divert their OWN run. There is deliberately no reverse hatch (dev host -> prod):
// no use case, and its absence means a dev/test run can never write into the
// participant dataset by accident.
function selectFirebaseConfig() {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  if (!PROD_HOSTS.includes(host)) {
    return { config: DEV_FIREBASE_CONFIG, env: 'dev' };
  }
  const routeToDev = new URLSearchParams(location.search).get('db') === 'dev';
  return routeToDev
    ? { config: DEV_FIREBASE_CONFIG, env: 'dev' }
    : { config: PROD_FIREBASE_CONFIG, env: 'prod' };
}

const { config: firebaseConfig, env: firebaseEnv } = selectFirebaseConfig();
console.log(`[data_store] Firebase target: ${firebaseEnv} (${firebaseConfig.projectId}).`);

// Initialize Firebase
const { recaptchaSiteKey, appCheckEnforced, ...firebaseOptions } = firebaseConfig;
const app = initializeApp(firebaseOptions);

// App Check must start before Firestore or Auth so every request carries a token.
// reCAPTCHA Enterprise scores the browser without showing a puzzle. On localhost the
// SDK logs a debug token instead; register it under App Check > Manage debug tokens
// to test against an enforcing project.
let appCheck = null;
let appCheckStatus = 'off'; // 'off' | 'ok' | 'failed', written to the session doc
if (recaptchaSiteKey) {
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
const db = getFirestore(app);
const auth = getAuth(app);

// Module-private state: startSession fills these; saveBlock reads them.
let sessionRef = null; // a reference to THIS run's session document
let uid = null; // this participant's anonymous user id

async function startSession(meta) {
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;

  sessionRef = doc(collection(db, 'sessions'));

  await setDoc(sessionRef, {
    uid,
    prolific_pid: meta.prolificPid,
    // Prolific's other two identifiers, both substituted into the study URL by
    // Taskflow. study_id names the whole published study; session_id is unique
    // to this one submission attempt. Storing them lets a Firestore record be
    // matched back to a specific Prolific submission at approval time.
    study_id: meta.studyId ?? null,
    session_id: meta.sessionId ?? null,
    paradigm: meta.paradigm,
    condition: meta.condition,
    schema_version: 1,
    app_check: appCheckStatus,
    started_at: serverTimestamp(),
  });
}

async function saveBlock(blockOrder, trials) {
  const blockRef = doc(sessionRef, 'blocks', String(blockOrder));
  await setDoc(blockRef, {
    uid,
    block_order: blockOrder,
    trials,
    uploaded_at: serverTimestamp(),
  });
}

// Mark this run as an idle exclusion on the session doc so a partial record is
// distinguishable from a completed one. Merged, never replacing the fields
// startSession wrote. No-op if the session doc was never created.
async function abortSession(info = {}) {
  if (!sessionRef) return;
  await setDoc(
    sessionRef,
    {
      aborted: true,
      abort_reason: info.reason || 'unknown',
      abort_stage: info.stage ?? null,
      abort_block_order: info.blockOrder ?? null,
      aborted_at: serverTimestamp(),
    },
    { merge: true },
  );
}

// Whether this browser may run the study; called before consent. Under enforcement a
// browser without a token has every write rejected, so it is turned away up front.
// Without enforcement its writes still land, so the failure is only recorded, and
// app_check on the session doc shows how many participants enforcement would cost.
async function verifyBrowser(timeoutMs = 10000) {
  if (!appCheck) return true;
  const ok = await hasAppCheckToken(timeoutMs);
  appCheckStatus = ok ? 'ok' : 'failed';
  return ok || !appCheckEnforced;
}

async function hasAppCheckToken(timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('App Check timed out')), timeoutMs);
  });
  try {
    await Promise.race([getToken(appCheck, false), timeout]);
    return true;
  } catch (e) {
    console.warn('App Check: no token for this browser.', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

window.dataStore = { startSession, saveBlock, abortSession, verifyBrowser };
