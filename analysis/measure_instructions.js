// measure_instructions.js — assert that no instruction screen overflows the canvas.
//
// Run: node analysis/measure_instructions.js        (exits non-zero on overflow)
//
// WHY THIS IS A HARD REQUIREMENT, not a nicety. `showInstructions()` in
// session.js attaches a keydown handler that dismisses the screen on ANY key
// after 200 ms. So a screen taller than the 600 px #canvas-container cannot be
// read: pressing Space or PageDown to scroll starts the block instead. The
// `overflow-y: auto` on .instructions-overlay keeps such a screen from being
// clipped at both ends, but it is a safety net, not a reading affordance.
//
// Intercepting the scroll keys is NOT the fix — every screen ends with "press
// any key to begin", and making that false is worse than a long screen. The fix
// is that nothing overflows, which is what this script enforces.
//
// It boots a throwaway static server and drives real Chromium via Playwright, so
// the numbers come from an actual layout engine. Wrapping at
// .instructions-content's `max-width: 80%` is most of the height, and no line
// count approximates it — the pre-trim cp_prp screen was 22 source lines and
// 819 rendered px. Playwright resolves through npx; the browsers already live in
// ~/Library/Caches/ms-playwright (installed by the Chrome MCP server).
//
// The page it drives is analysis/measure_instructions.html, which copies the
// overlay CSS verbatim from index.html. If you restyle the overlay there, update
// the harness too or this audit measures fiction.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.csv': 'text/csv',
};

function serve() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
            const file = path.join(ROOT, rel);
            if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
            });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

/**
 * Playwright is deliberately NOT a dependency of this repo — it is a hand-run
 * audit, and the repo has no build step or dev-dependency tree to hang it on.
 * Resolve it from wherever it already exists: this repo, the global root, or the
 * npx cache (`npx playwright --version` puts it in a hash-named dir there, and
 * the Chrome MCP server has already installed the browsers into
 * ~/Library/Caches/ms-playwright).
 */
function loadPlaywright() {
    const home = require('os').homedir();
    // Where Playwright unpacks browsers on macOS/Linux respectively.
    const browserCaches = [
        path.join(home, 'Library', 'Caches', 'ms-playwright'),
        path.join(home, '.cache', 'ms-playwright'),
    ].filter(fs.existsSync);

    const roots = [path.join(ROOT, 'node_modules')];
    try {
        roots.push(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim());
    } catch (e) {
        /* npm absent */
    }
    const npxCache = path.join(home, '.npm', '_npx');
    if (fs.existsSync(npxCache)) {
        for (const dir of fs.readdirSync(npxCache))
            roots.push(path.join(npxCache, dir, 'node_modules'));
    }

    // A package being present is NOT enough: each Playwright release pins one
    // chromium revision, and the npx cache happily holds several versions whose
    // browsers were never downloaded. (Observed here: 1.63.0-alpha wants
    // chromium 1237, 1.62.1 wants 1234, only 1148 is on disk — from 1.49.1, which
    // the Chrome MCP server installed.) Pick the first candidate whose pinned
    // revision actually exists, otherwise launch() dies with "Executable doesn't
    // exist" and tells you to run `npx playwright install`, which is the wrong fix.
    const candidates = [];
    for (const root of roots) {
        const pkgDir = path.join(root, 'playwright');
        if (!fs.existsSync(pkgDir)) continue;
        let revision = null;
        try {
            const browsers = require(path.join(root, 'playwright-core', 'browsers.json'));
            revision = (browsers.browsers.find((b) => b.name === 'chromium') || {}).revision;
        } catch (e) {
            /* unknown pin; treat as last resort */
        }
        const installed =
            revision != null &&
            browserCaches.some(
                (cache) =>
                    fs.existsSync(path.join(cache, `chromium-${revision}`)) ||
                    fs.existsSync(path.join(cache, `chromium_headless_shell-${revision}`)),
            );
        candidates.push({ pkgDir, revision, installed });
    }
    candidates.sort((a, b) => Number(b.installed) - Number(a.installed));
    for (const c of candidates) {
        try {
            return require(c.pkgDir);
        } catch (e) {
            /* keep looking */
        }
    }
    return null;
}

async function main() {
    const playwright = loadPlaywright();
    if (!playwright) {
        console.error(
            'Could not resolve playwright from this repo, the global npm root, or the npx cache.\n' +
                'It is not a dependency here on purpose — this audit is run by hand, not in CI.\n' +
                'Populate the npx cache once with:  npx playwright --version\n' +
                'or open analysis/measure_instructions.html directly under `npx serve .`.',
        );
        process.exit(2);
    }
    const { chromium } = playwright;

    const server = await serve();
    const { port } = server.address();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${port}/analysis/measure_instructions.html`);
        await page.waitForFunction(() => window.__AUDIT__ !== undefined, { timeout: 15000 });
        const audit = await page.evaluate(() => window.__AUDIT__);

        if (errors.length) {
            console.error('page errors:\n  ' + errors.join('\n  '));
            process.exit(1);
        }
        console.log(audit.text);
        process.exit(audit.overflowing === 0 ? 0 : 1);
    } finally {
        await browser.close();
        server.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
