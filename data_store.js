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
    writeBatch,
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
    // Proof of Human site key (public, like the reCAPTCHA key); null turns it off.
    pohSiteKey: 'pub-dncmwRIIvZW3wgNT4tPE',
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
    appCheckEnforced: true,
    // Same workspace as dev; the env:prod tag keeps prod sessions apart.
    pohSiteKey: 'pub-dncmwRIIvZW3wgNT4tPE',
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
const { recaptchaSiteKey, appCheckEnforced, pohSiteKey, ...firebaseOptions } = firebaseConfig;
const app = initializeApp(firebaseOptions);

// reCAPTCHA Enterprise reads browser and device signals and sends them to Google, so
// App Check starts only once the participant has consented to it: connect() is first
// called after the consent screen. It must still start before Firestore or Auth so
// every request carries a token. On localhost the SDK logs a debug token instead;
// register it under App Check > Manage debug tokens to test against an enforcing
// project.
let appCheck = null;
let appCheckStatus = 'off'; // 'off' | 'ok' | 'failed', written to the session doc
let db = null;
let auth = null;

function connect() {
    if (db) return;
    if (recaptchaSiteKey) {
        if (['localhost', '127.0.0.1'].includes(location.hostname)) {
            self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }
        appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
            isTokenAutoRefreshEnabled: true,
        });
    }
    db = getFirestore(app);
    auth = getAuth(app);
}

// Module-private state: startSession fills these; saveBlock reads them.
let sessionRef = null; // a reference to THIS run's session document
let uid = null; // this participant's anonymous user id

async function startSession(meta) {
    connect();
    const cred = await signInAnonymously(auth);
    uid = cred.user.uid;

    sessionRef = doc(collection(db, 'sessions'));

    // The Prolific identifiers go to links/, which clients may create but never read, so
    // the research record carries only its random document id. One batch, so a session
    // never lands without the link that payment and deletion requests need.
    const batch = writeBatch(db);
    batch.set(sessionRef, {
        uid,
        paradigm: meta.paradigm,
        condition: meta.condition,
        schema_version: 2, // 2: Prolific identifiers moved to links/
        app_check: appCheckStatus,
        started_at: serverTimestamp(),
    });
    batch.set(doc(db, 'links', sessionRef.id), {
        uid,
        prolific_pid: meta.prolificPid,
        // Both substituted into the study URL by Taskflow. study_id names the published
        // study; session_id is unique to this submission attempt, so a record can be
        // matched to a specific Prolific submission at approval time.
        study_id: meta.studyId ?? null,
        session_id: meta.sessionId ?? null,
        created_at: serverTimestamp(),
    });
    await batch.commit();
}

// Proof of Human bot scoring, record only: no run is treated differently on its score.
// Like reCAPTCHA it starts only after consent, and it is given the anonymous uid, never
// the Prolific ID. Scores are pulled afterwards with the secret key (analysis/poh_report.js).
// ?pohrun=<label> tags a test run so its sessions can be found together.
function startPoh() {
    if (!pohSiteKey || !sessionRef) return;
    const run = new URLSearchParams(location.search).get('pohrun');
    window.addEventListener(
        'poh:ready',
        () => {
            const record = { poh_session_id: window.getPOHSessionId?.() ?? null, poh_run: run };
            setDoc(sessionRef, record, { merge: true }).catch((e) =>
                console.warn('Proof of Human: session id not recorded.', e),
            );
        },
        { once: true },
    );
    const script = document.createElement('script');
    script.src = 'https://cdn.poh.org/v1/poh.js';
    script.dataset.siteKey = pohSiteKey;
    script.dataset.userId = uid;
    script.dataset.tags = [`env:${firebaseEnv}`, ...(run ? [`run:${run}`] : [])].join(',');
    document.head.appendChild(script);
}

// stageSummary is a training stage's outcome (criterionMet, stageFailed); null for test blocks.
async function saveBlock(blockOrder, trials, stageSummary = null) {
    const blockRef = doc(sessionRef, 'blocks', String(blockOrder));
    await setDoc(blockRef, {
        uid,
        block_order: blockOrder,
        trials,
        ...(stageSummary ? { stage_summary: stageSummary } : {}),
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

// Whether this browser may run the study; called right after consent. Under enforcement
// a browser without a token has every write rejected, so it is turned away before the
// task. Without enforcement its writes still land, so the failure is only recorded, and
// app_check on the session doc shows how many participants enforcement would cost.
async function verifyBrowser(timeoutMs = 10000) {
    connect();
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

window.dataStore = { startSession, startPoh, saveBlock, abortSession, verifyBrowser };
