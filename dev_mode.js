// dev_mode.js — single source of truth for developer conveniences.
//
// Publishes window.DEV_MODE (boolean) BEFORE session.js runs, so session.js can
// read it when its IIFE evaluates CSV_EXPORT_ENABLED, and the index.html inline
// script can read it to choose between the dev, participant, and blank page
// states. Also owns the self-contained dev UI: hiding the .controls toolbar for
// non-dev visitors and showing a DEV banner.
//
// Trigger: dev mode is OFF by default everywhere. Add ?dev (or ?dev=true) to the
// URL to turn it on; ?dev=false is treated the same as absent. A bare visit with
// no ?dev is a real/blank page; a dev opts in explicitly.
//
// What dev mode turns on (see the consumers): the CSV export button
// (CSV_EXPORT_ENABLED in session.js), the .controls toolbar (below), and the dev
// setup controls (condition radio + participant-id box in index.html).
(function () {
    const params = new URLSearchParams(location.search);
    const DEV_MODE = params.has('dev') && params.get('dev') !== 'false';
    window.DEV_MODE = DEV_MODE;

    if (!DEV_MODE) {
        // Not a dev: hide the whole dev toolbar (dropdown, condition, participant id,
        // Start, Stop, Abridged, Export). A real participant's session auto-launches
        // from index.html into the consent screen; a param-less visitor gets the
        // blank page (index.html renderBlank). Inline display beats the
        // `.controls { display: flex }` author rule (which would override the
        // `[hidden]` attribute), so set style.display directly.
        const controls = document.querySelector('.controls');
        if (controls) controls.style.display = 'none';
        // The .info hint is a dev aid too; hide it so it doesn't sit under the
        // canvas for a participant's whole session.
        const info = document.querySelector('.info');
        if (info) info.style.display = 'none';
        return;
    }

    // Dev run: make it unmistakable so a dev session is never taken for real data.
    console.log(
        '[DEV MODE ON] CSV export enabled, dev controls shown. ' +
            'Remove ?dev from the URL for the real participant / blank page.',
    );

    const banner = document.createElement('div');
    banner.textContent = 'DEV MODE';
    banner.style.cssText =
        'position: fixed; top: 0; left: 0; right: 0; z-index: 99999; ' +
        'background: #7a2a2a; color: #fff; text-align: center; ' +
        'font: bold 12px/24px system-ui, sans-serif; letter-spacing: 1px; ' +
        'pointer-events: none;';
    if (document.body) {
        document.body.appendChild(banner);
    } else {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(banner));
    }
})();
