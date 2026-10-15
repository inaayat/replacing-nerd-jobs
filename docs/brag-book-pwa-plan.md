# Brag Book installable PWA

Status: implementation plan only. This branch must not change Brag Book app
code, service-worker behavior, icons, or tests.

Goal: make `/brag-book/` installable and useful from a phone home screen while
preserving the existing desktop app and its no-loss save semantics. A future
implementation should ship this plan in one commit.

## Product contract

1. Brag Book remains the same application at `https://inaayat.xyz/brag-book/`.
   Installation adds a standalone launch surface; it does not create another
   data store, API, login flow, or resume format.
2. An installed app that has opened successfully online before can open its
   account-scoped local mirror while offline, accept edits, and retain those
   edits in the existing durable outbox.
3. The service worker caches static application code only. It must never
   cache or synthesize a response for `/api/*`, auth, account, book, or other
   user-data requests.
4. Reconnecting uses the existing revision-aware GET, merge, and PUT path.
   A service worker must not turn a failed request into a fake success.
5. Desktop at `>=1024px` is visually and functionally unchanged. PWA status
   chrome is hidden unless it has something to report.
6. No browser automation, Computer Use, screenshots, or recordings are
   required. Verify through Node tests.

## Important current behavior

The implementation must work with these existing invariants rather than
replacing them:

- `brag-book/app.js` writes every edit to the account mirror
  `brag-book-store-v2:<userId>` before scheduling a cloud save.
- `brag-book/save-controller.js` is a single-flight queue. `markDirty` calls
  `persistPending`, retries transient failures, and clears pending state only
  after a confirmed response.
- `brag-book-outbox-v2:<userId>` contains the pending book, base book, base
  revision, and local version.
- `/api/bb-book` performs revision CAS. Missing preconditions return 428;
  stale preconditions return 409 and the latest book.
- `mergeConcurrentBooks` merges collections and has specialized append-only
  handling for immutable `resumeSnapshots`.
- Resume bullets remain one id-keyed record. PWA work must not create an
  operation log, a second bullet store, or duplicate a bullet during retry.
- `lib/brag-book.js` preserves resume snapshots and legacy recovery versions
  against writes from older clients.
- `brag-book/index.html` already has `viewport-fit=cover`.
- `brag-book/app.css` already applies top/left/right safe-area insets to the
  nav and shell. Bottom safe-area spacing is incomplete.
- Authentication is already popup-free. The in-page form posts to the
  first-party `/api/auth-login`, stores a JWT, and reloads in scope. Logout
  clears the JWT and navigates to `/brag-book/`.

### Offline cold-launch gap that must be fixed

`initAuth()` currently treats a failed `/api/auth-config` fetch as
`configured: false`, so a cold offline launch paints the sign-in gate before
it can load `brag-book-store-v2:<userId>`. A stored JWT alone is insufficient
because the app also needs the user id to select the correct account mirror
and outbox.

Do not “fix” this by caching auth responses or trusting an unverified identity
from arbitrary data. Persist a minimal last-verified account descriptor after
an online authenticated boot, bind it to a one-way fingerprint of that exact
stored token, and use it only as an offline routing hint.

## Files to add

### `brag-book/manifest.webmanifest`

Commit a valid JSON manifest:

```json
{
  "id": "/brag-book/",
  "name": "Brag Book",
  "short_name": "Brag Book",
  "description": "Resume tailoring and interview preparation from your saved experience.",
  "start_url": "/brag-book/",
  "scope": "/brag-book/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "categories": ["productivity", "business"],
  "icons": [
    {
      "src": "/brag-book/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/brag-book/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/brag-book/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

Use white for theme/background because `app.css` defines `--bg: #ffffff`.
Keep gold `#e8c47a` as icon artwork, not browser-chrome color.

Do not add share targets, file handlers, shortcuts, or a second start route in
v1. Hash routes continue to work after launch from the root.

### `brag-book/icons/app-icon.svg`

Create a committed source icon with no external image or font dependency.
Recommended art:

- full white square background;
- current black line-book motif from `brag-book/icon.svg`;
- gold `#e8c47a` accent;
- a simple `BB` monogram rendered as SVG paths or system-independent shapes;
- all essential art inside the central 80% safe zone so the source can also
  produce a maskable icon.

Do not load the current dog image, Google Fonts, or any remote asset at icon
render time or app launch.

### `brag-book/icons/icon-192.png`

Committed 192×192 PNG generated from `app-icon.svg`.

### `brag-book/icons/icon-512.png`

Committed 512×512 PNG generated from `app-icon.svg`.

### `brag-book/icons/icon-maskable-512.png`

Committed 512×512 PNG. It must have an opaque full-bleed background and keep
essential artwork in the maskable safe zone. It may use the same SVG source if
that source already satisfies those constraints.

### `scripts/generate-brag-book-icons.mjs`

Follow `scripts/generate-sticky-notes-icons.mjs`:

```bash
npm install --no-save sharp
node scripts/generate-brag-book-icons.mjs
```

Read the committed SVG and generate all three PNGs. The script is a
maintenance tool only; deployed code never runs Sharp. Do not add Sharp to
`package.json`. Commit generated PNGs.

### `brag-book/sw-policy.js`

Keep request classification pure and testable. Use a small classic-script
module that attaches a frozen policy object to `self` (and therefore can be
evaluated in a Node `vm` test):

```js
self.BragBookSwPolicy = Object.freeze({
  ROOT: '/brag-book/',
  STATIC_SHELL_PATHS: Object.freeze([/* explicit paths below */]),
  classifyRequest({ url, method, mode }, origin) {
    // returns: "bypass" | "navigation" | "shell"
  }
});
```

`STATIC_SHELL_PATHS` is the single source for the worker’s allowlist;
`service-worker.js` must use it as `APP_SHELL` rather than duplicating the
paths.

Classification rules, in order:

1. Any method other than `GET`: `bypass`.
2. Any cross-origin URL: `bypass`.
3. Any pathname beginning `/api/`: `bypass`.
4. `/account.html` and any explicitly recognized auth/account document:
   `bypass`.
5. A navigation request under `/brag-book/`: `navigation`.
6. A queryless URL exactly present in the static `APP_SHELL` allowlist:
   `shell`.
7. Everything else: `bypass`.

“Bypass” means the fetch listener does not call `respondWith`; the browser
performs a normal network request. Never use cached error/auth/data responses.
Unknown JSON, image, or document URLs are not runtime-cached.

### `brag-book/service-worker.js`

Use a classic service worker and:

```js
importScripts('./sw-policy.js');

const SHELL_VERSION = 'v1';
const CACHE_PREFIX = 'brag-book-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${SHELL_VERSION}`;
const { ROOT, STATIC_SHELL_PATHS: APP_SHELL } = self.BragBookSwPolicy;
```

`SHELL_VERSION` is the one cache/build constant. Bump it whenever any shell
file, shell import, icon, manifest, or worker behavior changes. The test must
make this policy visible. Do not reuse Sticky Notes’ cache name.

Precache only this explicit shell:

- `/brag-book/`
- `/brag-book/app.css`
- `/brag-book/app.js`
- `/brag-book/auth.js`
- `/brag-book/book-view.js`
- `/brag-book/engine.js`
- `/brag-book/knowledge-doc.js`
- `/brag-book/pwa.js`
- `/brag-book/resume-docx.js`
- `/brag-book/resume-fit.js`
- `/brag-book/resume-model.js`
- `/brag-book/resume-snapshots.js`
- `/brag-book/resume-template.js`
- `/brag-book/routes.js`
- `/brag-book/save-controller.js`
- `/brag-book/starter-resume.js`
- `/brag-book/store.js`
- `/brag-book/sw-policy.js`
- `/brag-book/manifest.webmanifest`
- `/brag-book/icon.svg`
- all three committed PNG icons
- `/engine/neon-browser-auth.js`
- `/engine/sign-in-form.js`
- `/ugly-dog-images/dog-3.png`

If the implementation adds another browser-imported local module, add it to
this list and the shell-completeness test. Google Font CSS and the external
Neon Auth package are not cached. Offline rendering uses the current system
font fallbacks, and offline auth fallback must avoid importing Neon.

Lifecycle:

- `install`: `cache.addAll(APP_SHELL)`. Do **not** call `skipWaiting`
  automatically; the current page must control update timing.
- `activate`: delete only cache keys beginning `CACHE_PREFIX` that are not
  `CACHE_NAME`, then `clients.claim()`.
- message `{ type: "SKIP_WAITING" }`: call `self.skipWaiting()`.
- fetch `navigation`: network-first. On network failure return the cached
  `/brag-book/` shell. Do not write arbitrary navigations to cache.
- fetch `shell`: cache-first from `CACHE_NAME`, with network fallback. Because
  the shell is versioned and completely precached, do not add runtime entries.
- fetch `bypass`: do not call `respondWith`.

The worker must never intercept PUT/POST saves, `/api/bb-book`,
`/api/auth-config`, `/api/auth-login`, `/api/me`, or Neon’s cross-origin
requests. It therefore cannot swallow a write, forge a successful save, or
return a stale book.

Register from `/brag-book/service-worker.js` with scope `/brag-book/` and
`updateViaCache: "none"`. Deployment remains static; do not add an API
function or a `vercel.json` route.

### `brag-book/pwa.js`

Keep lifecycle/status code out of the already-large `app.js`. Export pure or
dependency-injected helpers so Node tests can run without a real browser:

```js
export function setOfflineBanner(elements, online) {}
export async function activateWaitingWorker({
  registration,
  flushBeforeReload,
  reload,
  serviceWorker
}) {}
export function initBragBookPwa({
  flushBeforeReload,
  onReconnect
}) {}
```

Responsibilities:

- Toggle the offline status from `navigator.onLine`, `online`, and `offline`.
  Treat `navigator.onLine` as a UI hint only; save failures remain
  authoritative.
- Register the worker after `load`.
- Detect both an already-waiting worker and
  `registration.updatefound → installing.state === "installed"` when a
  controller exists.
- Reveal “Update available — Reload” only when a replacement worker waits.
- Reload action:
  1. disable the button;
  2. `await flushBeforeReload()`;
  3. if it returns `false` or throws, do not activate/reload; restore the
     button and show “Save pending — update after reconnecting”;
  4. listen once for `controllerchange`;
  5. post `{ type: "SKIP_WAITING" }` to `registration.waiting`;
  6. reload once after `controllerchange`.
- Avoid reload loops with a local boolean guard.
- Call `onReconnect` after the online banner updates.
- Registration or cache failure must not block normal browser use.

Do not show an in-app install button in v1. Chrome’s native install surface
and iOS Share menu are sufficient and avoid changing desktop chrome.

### `scripts/test-brag-book-pwa.mjs`

One pure Node suite covers the contracts listed in “Tests” below.

## Existing files to update

### `brag-book/index.html`

Keep the existing viewport value exactly:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

Add:

```html
<link rel="manifest" href="./manifest.webmanifest" />
<link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png" />
<link rel="apple-touch-icon" sizes="192x192" href="./icons/icon-192.png" />
<meta name="theme-color" content="#ffffff" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Brag Book" />
```

Replace the dog favicon with the app icon but leave the Beep boop nav dog
unchanged.

Add one status region immediately after `nav`:

```html
<div class="bb-pwa-status" id="pwa-status" role="status" aria-live="polite" hidden>
  <span id="pwa-offline" hidden>Offline — edits will save when you reconnect</span>
  <span id="pwa-update" hidden>
    Update available — <button type="button" id="pwa-reload">Reload</button>
  </span>
</div>
```

Both messages may be present; render them as compact inline items. This is
status chrome, not a modal and not a permanent nav item.

### `brag-book/app.css`

Preserve all base desktop layout declarations and all breakpoints asserted by
`test-brag-book-mobile-desktop-lock.mjs`.

Add scoped `.bb-pwa-*` styles:

- hidden means no layout or visual change;
- visible status is a small fixed pill/strip near the bottom edge;
- use existing mono type, `--panel`, `--line-strong`, `--ink`, and `--gold`;
- constrain width to the viewport;
- `left`/`right` use `env(safe-area-inset-left/right)`;
- `bottom` uses `max(8px, env(safe-area-inset-bottom))`;
- z-index above page panels but below blocking dialogs;
- the Reload button uses the existing quiet action treatment and a >=44px
  target inside the existing `(pointer: coarse)` block.

Finish bottom safe-area support without changing desktop:

```css
.shell {
  padding-bottom: max(40px, calc(16px + env(safe-area-inset-bottom)));
}
.legal {
  padding-bottom: max(40px, calc(16px + env(safe-area-inset-bottom)));
}
```

At an environment inset of zero this remains the current 40px. Do not change
desktop grid columns, editor heights, nav link order, resume scaling, or
drag/export controls.

The nav already uses top/left/right safe-area insets. Keep that code and test
it; do not create a second mobile-only nav.

### `brag-book/auth.js`

Add a Brag-specific verified account descriptor:

```js
const BRAG_ACCOUNT_KEY = 'brag-book-last-account-v1';
// { id, email, name, tokenFingerprint }
```

Provide safe read/write/clear helpers. `tokenFingerprint` is a SHA-256 digest
of the exact JWT, produced with `crypto.subtle`; it is not the token. Update
the descriptor only after an online auth response has verified the user
(`getSession`, `/api/me`, or successful sign-in). It is not authorization and
must never be sent instead of a JWT.

`initAuth()` behavior:

1. Try the current online `/api/auth-config` and Neon session flow.
2. A successful configured response keeps current behavior and refreshes the
   descriptor.
3. If the config request fails due to network unavailability, and both a
   stored JWT and descriptor exist, recompute the JWT fingerprint. Continue
   only when it exactly matches the descriptor. If Web Crypto is unavailable
   or the fingerprint differs, require an online sign-in instead of risking
   opening another account’s mirror.
4. With a matching descriptor, return:

   ```js
   {
     configured: true,
     signedIn: true,
     offline: true,
     user: descriptor,
     token: storedToken,
     client: null
   }
   ```

5. If the server responds successfully but auth is not configured, do not
   invent an offline session.
6. With no verified descriptor/token, retain the sign-in gate and explain
   that first sign-in needs a connection.

The offline branch must return before `loadNeonAuth`, because its package is a
cross-origin dynamic import unavailable offline.

On successful in-page sign-in, persist the returned user descriptor before
reload. On logout, clear JWT and descriptor, but **do not delete** the
account-scoped mirror or outbox; deleting them could lose pending edits.

Current sign-in/out is compatible with iOS standalone:

- login and sign-up are inline and POST to first-party `/api/auth-login`;
- no popup or OAuth callback is used;
- reload and logout stay under `/brag-book/`.

`/account.html` is outside manifest scope and may open in Safari from
standalone mode. That is acceptable for account deletion/settings and does
not affect sign-in/out. Do not replace inline login with a popup.

### `brag-book/app.js`

Import and initialize `initBragBookPwa` after save functions exist:

```js
initBragBookPwa({
  flushBeforeReload: () => flushSave('navigation'),
  onReconnect: reconnectBook
});
```

Do not move save ownership into the PWA module.

#### Offline boot

After offline auth selects `cacheUserId`:

1. Read `brag-book-store-v2:<userId>`.
2. Read the matching account outbox.
3. If the outbox has a book, use that as the freshest local store; otherwise
   use the account mirror.
4. Set `outboxBaseBook` from `outbox.baseBook` or a clone of the clean cached
   book. Preserve `outbox.baseRevision` if present.
5. If an outbox exists, call `restorePending`; otherwise initialize the save
   controller without marking clean data dirty.
6. Render the book with the offline banner. Never call `loadBook` while known
   offline.

This guarantees an installed app reopens the exact pending snapshot,
including `resumeSnapshots`, rather than an older mirror.

#### Offline edits

Do not special-case model writes. Existing `saveStore()` must continue:

1. updating the account mirror synchronously;
2. calling `markDirty`;
3. persisting the full pending book to the account outbox;
4. attempting the network save;
5. retaining pending data after a transient fetch failure.

The service worker bypasses that request. The controller’s retry status may
coexist with the friendlier offline banner.

#### Reconnect

Do not immediately PUT a revisionless offline book. A clean cached book does
not currently store its server revision, so that would correctly receive
428.

Implement `reconnectBook()`:

1. If not authenticated, return.
2. GET `/api/bb-book` through `loadBook` (network only).
3. Use the existing `resumeOutboxAfterBoot(remote, data)` path or factor its
   merge into a shared helper:
   - base = outbox `baseBook` or the cached book captured at offline boot;
   - local = current/outbox book;
   - remote = GET book;
   - merge with `mergeConcurrentBooks`;
   - retain local conflict values;
   - call `rememberServerBook(data)` to obtain the current revision.
4. Restore/mark the merged book pending, then call the save controller’s
   existing immediate retry/flush path.
5. A 409 still goes through existing reconciliation. A 428 is not bypassed or
   converted into success; refetch and merge before retry.
6. Pull a remote book only after pending local data is confirmed.

Make reconnect single-flight so repeated `online`/focus events cannot start
parallel GET/PUT sequences. Keep the save controller itself single-flight.

Do not alter `normalizeStore`, bullet ids, snapshot event merging,
`preserveServerHistory`, storage-key names, or the database/API schema.

### `AGENTS.md`

After implementation, add concise repository notes:

- Brag Book is installable at `/brag-book/`.
- shell cache version and bump rule;
- API/auth/data are network-only;
- committed icon generation command;
- offline edits use the existing account mirror/outbox;
- name the new PWA test command.

Do not paste this full plan into `AGENTS.md`.

## Update lifecycle and no-loss sequence

```text
edit
  -> normalize existing model
  -> account-scoped local mirror
  -> save-controller markDirty
  -> account-scoped durable outbox
  -> network-only PUT
  -> CAS success: clear outbox
     409: existing three-way merge/retry
     428: refetch baseline/revision before retry
     offline: retain outbox and retry later

new service worker waiting
  -> show Update available
  -> user taps Reload
  -> await save-controller flush
  -> only on success: SKIP_WAITING
  -> controllerchange
  -> reload
```

The Cache API never stores the book, JWT, account response, outbox, or resume
snapshot payload. Cache deletion cannot delete user content. Conversely,
clearing browser site data can remove local pending edits; the offline banner
must not promise protection against OS/browser storage eviction.

## Tests

Add `scripts/test-brag-book-pwa.mjs`. It must be pure Node and use `assert`,
`fs`, `vm`, and jsdom only where DOM behavior is needed.

### Manifest and HTML

- Parse the manifest.
- Assert exact `id`, `start_url`, and `scope` `/brag-book/`.
- Assert name/short name, standalone display, white colors, and categories.
- Assert 192, 512, and maskable entries are in app scope.
- Read PNG IHDR bytes and assert actual 192×192 / 512×512 dimensions.
- Assert all icon files and SVG source exist.
- Assert HTML manifest, apple-touch-icon, installability meta tags,
  `theme-color`, and exact viewport string.

### Shell completeness and request policy

- Assert every declared shell file exists.
- Assert the known local imports of `app.js`, `engine.js`, `auth.js`,
  `save-controller.js`, snapshot/render modules, and shared engine auth files
  are represented in `APP_SHELL`.
- Evaluate `sw-policy.js` in a Node `vm`.
- Table-test:
  - `GET /brag-book/` navigation -> `navigation`;
  - `GET /brag-book/app.js` -> `shell`;
  - `GET /api/bb-book` -> `bypass`;
  - `PUT /api/bb-book` -> `bypass`;
  - `GET /api/auth-config`, `/api/auth-login`, `/api/me` -> `bypass`;
  - `GET /account.html` -> `bypass`;
  - cross-origin Neon/font URL -> `bypass`;
  - unknown same-origin JSON/data URL -> `bypass`.
- Assert bypass requests are not passed to `respondWith`.
- Assert navigation is network-first and has cached-root fallback.
- Assert no worker code caches `/api/`, response bodies, or runtime unknowns.

### Version cleanup

Evaluate the worker with fake `self` and `caches`:

- install opens exactly `CACHE_NAME` and adds exactly `APP_SHELL`;
- no automatic `skipWaiting` during install;
- activate deletes older `brag-book-shell-*` entries;
- activate keeps current and unrelated app caches;
- the explicit message invokes `skipWaiting`;
- `clients.claim` runs after cleanup.

### Status and update prompt

With jsdom/fakes:

- offline event reveals exactly
  “Offline — edits will save when you reconnect”;
- online event hides it and invokes `onReconnect` once;
- a waiting worker reveals “Update available — Reload”;
- Reload awaits the injected flush promise before posting `SKIP_WAITING`;
- failed/false flush does not post or reload and leaves the prompt;
- `controllerchange` reloads once after a successful flush;
- all PWA status elements remain hidden in the normal online/no-update case.

### Auth and persistence

- Offline auth fallback requires a stored JWT and a matching fingerprint on
  the last verified descriptor.
- It never runs after a successful “auth not configured” server response.
- Logout clears token/descriptor but not account mirror/outbox.
- Simulate a controller save whose first network call fails:
  - account mirror contains the edit;
  - outbox contains the complete normalized book and `resumeSnapshots`;
  - controller does not report saved or clear pending.
- Simulate reconnect GET, three-way merge, and successful retry:
  - current server revision is used;
  - pending local and disjoint remote changes both survive;
  - resume snapshot events survive;
  - outbox clears only after confirmation;
  - each resume bullet id occurs once.
- Simulate a 409 and retain current merge behavior.
- Simulate a missing offline base revision and assert reconnect GET happens
  before PUT, avoiding a blind revisionless write.

### Regression runs

Run:

```bash
node scripts/test-brag-book-pwa.mjs
node scripts/test-brag-book-resume-snapshots.mjs
node scripts/test-brag-book-mobile-desktop-lock.mjs
node scripts/test-brag-book-bugbash-canonical.mjs
node scripts/test-brag-book-bugbash-save-current.mjs
node scripts/test-brag-book-bugbash-save.mjs
node scripts/test-brag-book-bugbash-rich-text.mjs
node scripts/test-brag-book-bugbash-star-layout.mjs
node scripts/test-brag-book.mjs
node scripts/test-brag-book-drag-dom.mjs
node scripts/test-public-imports.mjs
node scripts/test-sign-in-form.mjs
```

`test-brag-book-mobile-desktop-lock.mjs` must continue asserting the same
desktop nav, grids, resume editor/preview, drag controls, exports, and save
lifecycle. Add only PWA-safe-area/status assertions; do not relax existing
locks.

## Implementation order for the next model

1. Add manifest, SVG sources, icon generator, and committed PNGs.
2. Add pure service-worker policy and its classification tests.
3. Add the versioned static-shell worker and lifecycle tests.
4. Add HTML metadata/status markup and scoped CSS/safe-area rules.
5. Add `pwa.js` with offline/update UI and flush-before-reload tests.
6. Add verified offline account routing in `auth.js`.
7. Add offline boot and reconnect GET/merge/retry wiring in `app.js`.
8. Add no-loss controller/outbox/auth tests.
9. Update concise `AGENTS.md` guidance.
10. Run the full regression list above.
11. Review the final diff: no API function, database migration, data-cache
    route, storage-key rename, desktop layout rewrite, or model duplication.
12. Commit the entire implementation and tests as one commit.

## Acceptance checklist

- Installability audit has a valid scoped manifest and local icons.
- iPhone standalone uses safe areas and does not hide nav/status/footer.
- Android/desktop installation launches `/brag-book/` standalone.
- Browser use without SW support remains fully functional.
- A prior online account can open its mirror and edit offline.
- First-ever sign-in still requires a connection and uses the inline form.
- Offline edits survive reload and reconnect.
- API/auth/data never come from Cache Storage.
- Update reload is blocked until save flush succeeds.
- 409/428 semantics remain explicit.
- Resume snapshots and one-record-per-bullet semantics survive reconnect.
- Desktop at 1024px and wider is unchanged.
- All listed Node suites pass.

## Final implementation report requirements

Report:

- implementation commit SHA and PR;
- shell cache version;
- all test commands/results;
- any auth/offline caveat encountered;
- install instructions:
  - iPhone/iPad Safari: open `inaayat.xyz/brag-book/`, tap **Share**, then
    **Add to Home Screen**;
  - Android Chrome: open the site, use **Install app** from the browser menu
    or install prompt;
  - desktop Chrome/Edge: open the site and choose **Install Brag Book** from
    the address-bar install icon or browser menu.

State explicitly that offline use requires one successful prior online open,
and that unsynced edits rely on browser local storage until reconnection.

## Risks

1. **Offline identity selection.** A JWT without a verified user id cannot
   safely select an account mirror. The descriptor requirement prevents
   cross-account reads.
2. **Revisionless reconnect.** Cached books do not currently carry server
   revision. GET/merge before PUT is mandatory after an offline cold launch.
3. **iOS storage eviction.** Safari may evict Cache Storage/localStorage under
   pressure. Synced server data remains safe; pending local-only edits cannot
   be guaranteed after site-data eviction.
4. **External fonts/Auth SDK.** They are intentionally not cached. Offline UI
   uses fallback fonts, and offline boot must not import Neon.
5. **Worker update timing.** Automatic `skipWaiting` could reload during an
   edit. Only the flush-gated prompt may activate a waiting worker.
6. **Shell drift.** A new browser module omitted from `APP_SHELL` can break
   offline startup. Keep the explicit import-closure test and bump
   `SHELL_VERSION`.
7. **False online signals.** `navigator.onLine` is advisory. Actual fetch
   success/failure and the save controller remain authoritative.
