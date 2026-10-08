# Brag Book bug-bash plan

Status: investigation only. This branch adds no application or database changes.

## What the investigation established

The four reports are real, but they have three different causes:

1. Bullet wording has several live sources (`entries`, requirement-line copies,
   career bullets, posting-local career bullets, and `resume.overrides`). The
   compiler still intentionally lets an `edited: true` override beat the shared
   entry, so “linked” does not currently mean canonical.
2. The browser has a debounce, not a durable save queue. It can run overlapping
   full-book PUTs, acknowledge an old response after a newer edit, discard local
   work after a second 409, and leave a failed save with no retry.
3. Resume rich text is converted from spans to markdown and back. Several
   functions trim or collapse whitespace, and current `main` deliberately strips
   mid-line bold in the preview and DOCX.
4. The screenshot is a paint/layout failure, not evidence that the first
   characters were removed from JSON. The missing characters and mangled labels
   occur only on the left edge of the STAR grid. The entry update/normalize/
   serialize path does not remove initial characters.

The production database was not accessed or changed.

## Ranked bug list

### P0.1 — A failed or interrupted debounce can lose the last edit

**Root cause**

- `brag-book/app.js:saveStore` writes `localStorage`, marks one global
  `bookDirty` boolean, and starts a 500 ms timer. It does not flush on blur or
  in-app navigation.
- `app.js:jobCatalogRow` keeps company/title/dates/location only in DOM plus a
  private 300 ms timer. Until `stamp()` runs, the shared store is still “clean,”
  so focus/visibility pull can replace it and pagehide cannot flush it.
- `app.js:jobMeta` and the requirement textarea in `requirementTableRow` use
  `change` rather than `input`; closing or navigating without blur leaves their
  newest value only in the DOM.
- `app.js` handles `pagehide` only when `persistTimer` is non-null. A previous
  failed save has `bookDirty === true` but no timer, so pagehide does nothing.
- The pagehide handler calls `saveBook` without awaiting or catching it and
  clears the timer first. A keepalive request is not a durable outbox and large
  books can exceed a browser's keepalive request budget.
- `visibilitychange` flushes nothing when the document becomes hidden;
  `beforeunload` is not handled.
- `app.js:boot` replaces the cache with the server response whenever the server
  row exists. An unsent cached edit therefore disappears on the next load even
  though it was present in local storage.
- `app.js:cacheStore` does not catch quota/security errors. A `setItem` failure
  aborts `saveStore` before the server timer is scheduled.

**Exact fix**

Create browser-safe `brag-book/save-controller.js` and make it the only owner of
save state. Persist an account-scoped outbox synchronously on every model edit:
`{ userId, baseRevision, baseBook, book, localVersion, updatedAt }`. Cache errors
must be reported but must not prevent the server save.

Expose `markDirty(book)`, `flush(reason)`, `retryNow()`, `whenIdle()`, and
`state`. Wire `blur`, in-app navigation (`go` before changing the hash),
`visibilitychange` when hidden, `pagehide`, and `beforeunload` through
`flush`. Page lifecycle flushes should request `keepalive`, but correctness must
come from the outbox: on boot, load remote plus the matching user's outbox,
three-way merge from `baseBook`, and resume the PUT. Never overwrite the outbox
with remote data until the local version is confirmed.

Remove component-local persistence timers such as `jobCatalogRow.saveTimer`.
Update the in-memory store immediately on input and let the one controller
debounce only network I/O. Add a registry for editors that genuinely buffer DOM
state; call those commit callbacks before navigation/lifecycle flush.

**Risks**

- Local storage is shared by all sessions on the origin; keying and cleanup must
  use the authenticated user id.
- `beforeunload` cannot wait for a network response. Tests and UI copy must treat
  local outbox persistence, not the keepalive request, as the durability
  guarantee.
- Do not retry permanent 400/401/413 responses forever.

**Acceptance**

- Type and immediately blur, switch tabs/routes, hide the page, dispatch
  pagehide/beforeunload, or reload. The exact edit is present after boot.
- Repeat that matrix for job catalog fields, posting role/company/link, and
  requirement text before their old blur/timer paths would have run.
- Simulate a rejected keepalive request; the account-scoped outbox survives and
  sends on the next boot.
- Simulate `localStorage.setItem` throwing; a visible warning appears and the
  server request still runs.
- `node scripts/test-brag-book-bugbash-save-current.mjs` no longer reproduces
  missing lifecycle hooks or overlapping PUTs.
- `node scripts/test-brag-book-bugbash-save.mjs` passes.

### P0.2 — Overlapping full-book PUTs can acknowledge stale state out of order

**Root cause**

- `app.js:pushStore` sets `bookPushing = true` but does not use it as a lock.
  Another debounce can call `pushStore` while the first request is in flight.
- Every success calls `rememberServerBook`, which unconditionally sets
  `bookDirty = false`, updates `bookRevision`, and replaces `lastServerBook`.
  It does not know which local version the response acknowledged.
- An older response can arrive after a newer conflict/retry response and move
  `bookRevision` and `lastServerBook` backward. A response for edit A can also
  clear the dirty flag for edit B.

**Exact fix**

The save controller must be single-flight. Capture an immutable
`{ book, localVersion, expectedRevision }` per request. While it is in flight,
coalesce later edits into one queued snapshot. A response may update confirmed
state only for the active request id. Clear dirty state only through that
request's `localVersion`; if a newer local version exists, immediately send it
with the newly confirmed revision.

Delete `bookPushing`, `bookDirty`, `persistTimer`, `bookRevision`, and
`lastServerBook` from `app.js` after the controller owns those concepts.

**Risks**

- A continuous typer can keep a queued snapshot pending; debounce before the
  first request, but never debounce the queued request after an acknowledgment.
- Snapshot before calling `fetch`; do not serialize a later mutable object.

**Acceptance**

- Deferred promises prove that only one PUT is active.
- Edit B while edit A is active; resolving A cannot show Saved or clear B.
- The second request uses the revision returned for A.
- Reversing network completion opportunities cannot move the confirmed revision
  backward.

### P0.3 — Conflict handling can overwrite or explicitly discard newer work

**Root cause**

- `engine.js:mergeBook` merges only top-level list records. A posting and a
  career job are atomic records even though many independent requirements,
  questions, groups, bullets, and layout fields live inside them.
- `engine.js:pickRecord` resolves a same-record conflict with client-generated
  `updatedAt`; career jobs have no record timestamp, and
  `applyExperienceLine` changes nested posting data without touching the
  posting timestamp. Equal/unknown timestamps choose local.
- `app.js:pushStore` automatically retries the merged whole book. If that retry
  also conflicts, `adoptServerBook` replaces the local store and says the edit
  was not saved. This is the reported data-loss path.
- Client clocks are not a safe ordering source across tabs/devices.

**Exact fix**

Implement `mergeConcurrentBooks(base, local, remote)` in
`save-controller.js`. Merge lists recursively by stable id and fields by a true
three-way comparison:

- only local changed → local;
- only remote changed → remote;
- both made the same change → that value;
- both changed different fields → combine;
- both changed the same field differently → keep the confirmed remote value,
  retain the local value in a `syncConflicts`/outbox record, stop automatic PUTs,
  and show a resolver with both values.

Canonical bullet text/rich and STAR fields need field-level handling. Posting
requirements/questions and resume placement/layout maps need id/key-level
handling rather than whole-posting replacement. Deletions need tombstones or an
equivalent base-aware decision so a remote edit cannot silently resurrect a
local delete.

Retry transient network/429/5xx failures with bounded exponential backoff and
jitter. A 409 is reconciliation, not a blind retry. Never call
`adoptServerBook` while unresolved local changes exist.

**Risks**

- Array order is user data. Merge order using explicit order/placement ids, not
  object iteration.
- Conflict records must not be serialized into the public resume output.

**Acceptance**

- Two tabs editing different entries, STAR fields, requirements, or postings
  retain both edits.
- Two tabs editing the same bullet wording produce one visible conflict; neither
  value is discarded and no automatic retry overwrites the server.
- A same-record, different-field edit merges without a conflict.
- A failed conflict retry never re-renders over an active editor.

### P0.4 — Resume bullets still have multiple live wording records

**Root cause**

The nominal canonical record is `store.entries[]`, but wording also lives in:

- `posting.requirements[].bullets[].text/rich`;
- `store.jobs[].groups[].bullets[].lead/body`;
- `posting.resume.localJobs[].groups[].bullets[].lead/body`;
- `posting.resume.overrides[bulletId].lead/body`.

`engine.js:applyExperienceLine`, `rewriteResumeWording`, and
`projectResumeStore` try to keep copies aligned. `resume-model.js` then has a
second projection stack (`claimExperienceLine`, `fieldsFromLinks`,
`projectEntryLines`, and `mergePostingBullets`). Most importantly,
`applyBulletVariant` intentionally applies any legacy `edited: true` override,
so a stale posting copy beats the latest library entry. `applyResumeBulletEdit`
clears only the override for the line being edited. Untouched postings can
continue to render old wording indefinitely.

**Exact fix**

Bump the Brag Book document schema and make `entries[]` the only live bullet
record:

- An entry owns `text` (or `title` during a compatibility window), `rich`, STAR,
  notes, tags, job id, and `updatedAt`.
- A career/resume group stores a placement `{ id, entryId, priority, pinned }`.
- A requirement stores a relationship `{ id, entryId }` plus only truly
  requirement-local metadata.
- Posting variants store inclusion/order/group/title layout only. Remove
  wording overrides.

All editors, including Resume basics, posting resumes, and requirement detail,
must call one entry update function. `compileResumeDoc` must resolve every
placement through `entryId` and attach the entry's current rich spans.
`resume-template.js` and `resume-docx.js` consume those spans directly.

Delete the live-copy machinery after migration:
`clearStaleOverrides`, `rewriteResumeWording`, `projectResumeStore`,
`projectExperienceOntoJobs`, `claimExperienceLine`, `fieldsFromLinks`,
`projectEntryLines`, `writeBulletBackToSource`, and the wording part of
`applyBulletVariant`.

**Legacy migration, without losing wording**

Add a pure, idempotent `migrateCanonicalBullets` called by `normalizeStore`:

1. Group candidates by explicit `entryId`/`sourceEntryIds`, then by
   `sourceBulletIds`. Use text matching only when it is unique; never merge two
   unrelated bullets merely because their text matches.
2. Collect entry text/rich, requirement copies, shared/local career copies, and
   overrides. Give candidates their real record timestamp where available
   (entry or parent posting). Do not invent ordering from array position.
3. Choose the newest timestamped candidate. When timestamps are absent or tied,
   prefer the existing entry as canonical, retain every distinct losing
   candidate in a non-rendering `legacyVersions` recovery list, and show a
   one-time “Recovered prior wording” control. An explicit `edited: true`
   override may win only when its parent posting timestamp is newer than the
   entry.
4. Create an entry for every unlinked legacy placement, preserving text, rich,
   STAR, notes, and stable source ids.
5. Rewrite every placement/reference to `entryId`, remove live wording copies
   and overrides in memory, and serialize only the new shape on the user's next
   normal save. Reading alone must not write the database.

**Risks**

- `posting.updatedAt` may reflect an unrelated edit, so ambiguous losers must
  remain recoverable rather than being deleted.
- Deleting an entry must remove or tombstone all placements atomically.
- Placement ids and entry ids are different concepts; preserve both.

**Acceptance**

- One edit from any surface changes the entry once; basics, every posting,
  preview, and DOCX immediately show exactly that entry.
- The serialized v2 book contains no live bullet wording outside entries and no
  `resume.overrides`.
- The migration is idempotent and every distinct legacy wording is either the
  canonical entry or in `legacyVersions`.
- A newer entry beats an older `edited: true` override.
- `node scripts/test-brag-book-bugbash-canonical.mjs` passes.

### P0.5 — The local cache is not scoped to a login

**Root cause**

`engine.js:STORE_KEY` is one origin-wide key. `app.js:loadCached` reads it before
the authenticated user is known. In `boot`, a newly created account with an
empty remote row automatically uploads any non-empty cache. That cache can
belong to a previously signed-in account. On a cloud failure, the same stale
cache is displayed for the current account.

**Exact fix**

Use `brag-book-store-v2:<userId>` and
`brag-book-outbox-v2:<userId>` after authentication. Keep a separate explicitly
local key for `?local=1`. Never auto-import the old unowned key into a signed-in
account; offer it as an explicit “Import browser backup” after showing its
summary. Clear in-memory content when auth identity changes.

**Risks**

- Do not delete the legacy key until the user explicitly imports or discards it.
- User ids must be treated as opaque key suffixes.

**Acceptance**

- Sign in as A, sign out, and sign in as B: B never sees or uploads A's cache.
- Offline boot selects only the current user's cache/outbox.

### P0.6 — The API still permits unguarded legacy overwrites

**Root cause**

`engine.js:bookSaveGuard` returns `{ ok: true, reason: 'legacy' }` when the
precondition is omitted. `lib/brag-book.js:putBook` then runs an unconditional
UPDATE. This can overwrite any newer browser's full JSON document. The database
already has a numeric `rev`, but the client sends and compares `updatedAt`.

**Exact fix**

Make `revision` the write precondition. `store.js:saveBook` sends
`expectedRevision`; `api/brag-book.js` validates it; and
`lib/brag-book.js:putBook` performs one `UPDATE ... WHERE user_id = ? AND rev =
?`, incrementing and returning `rev`. A missing precondition on an existing row
returns 428 (or 409 with the latest row), never an unconditional update. Keep
`updatedAt` for display only. New-row creation expects a null revision and uses
the existing insert race protection.

**Risks**

- Old open clients will receive a conflict instead of saving. Return the latest
  book in the response so they fail safely.

**Acceptance**

- Missing, stale, and malformed revisions cannot update an existing row.
- Two requests with the same expected revision: exactly one succeeds.
- No database integration is needed for unit coverage; retain the pure guard
  tests and mock the conditional update result.

### P1.1 — Rich text is lossy and preview/DOCX do not match the editor

**Root cause**

- `applyResumeBulletEdit` saves entry spans, but
  `resumeFieldsFromExperience` immediately converts them with
  `spansToMarkdown` and splits them into `lead/body`.
- `resumeBulletParts`/`ignoreBoldMarkers` remove `**`, trim ends, and collapse
  repeated spaces. `inlineMarkerSpans` does the same around italic markers.
- `app.js:tidySpans` collapses repeated spaces while flattening editable DOM.
- Both `resume-model.js:asString` and entry normalization trim text.
- On current `main`, `resumeBulletSpans` intentionally strips mid-line bold;
  only the inferred lead before a colon is bold. The Oct. 8 mid-line-bold patch
  was reverted after the marker path caused bad boundary behavior. The editor
  can still issue Cmd/Ctrl+B, so the editor and output disagree.
- `resume-template.js` and `resume-docx.js` share
  `resumeBulletSpans`; they agree with each other but can both disagree with the
  textbox.

**Exact fix**

Do not use markdown as an internal interchange format. Normalize canonical
entry spans without trimming/collapsing their text; derive plain text with
`spans.map(...).join('')`. Preserve literal `*` characters. The compiled bullet
must carry canonical `rich` spans. Preview and DOCX render those exact spans;
if the product still wants an automatically bold lead, make that an explicit
stored/default span transformation at creation time, not a colon parser applied
on every read.

Keep markdown parsing only at import/paste boundaries. Add a migration parser
for legacy lead/body markers, produce spans once, and never serialize markers
again. Remove `boldMetrics` from save/compile paths; automatic metric emphasis
must not mutate user text.

Update `fillRich`, `readRich`, and normalization so marks can split/merge spans
without changing any text node. Do not collapse repeated spaces or trim span
edges. For a one-line bullet, reject/normalize newlines explicitly without
touching ordinary spaces.

**Risks**

- HTML collapses ordinary repeated spaces unless rendered with
  `white-space: pre-wrap`; keep that style in preview.
- DOCX runs with leading/trailing spaces require `xml:space="preserve"`; the
  existing `t()` helper already supports this.
- Unicode NBSP policy should be explicit and tested.

**Acceptance**

- Leading, trailing, single, and repeated spaces immediately inside and outside
  bold/italic boundaries survive typing, save, reload, preview, and DOCX.
- Bold-only, italic-only, bold+italic, adjacent marked spans, literal asterisks,
  punctuation, and a selection that includes a space all round-trip exactly.
- Preview plain text equals the textbox's plain text byte-for-byte.
- Preview and DOCX contain the same marked ranges as the canonical entry.
- `node scripts/test-brag-book-bugbash-rich-text.mjs` passes.

### P1.2 — “Saved” can be shown before the current data is confirmed

**Root cause**

- `knowledgeEditor` always mounts `#kb-save-state` with “Saved”.
- `scheduleKnowledgeSave` changes its internal state to `saved` before awaiting
  `pushStore`.
- `createKnowledgePage` paints “Saved” immediately after scheduling.
- The footer in `index.html` says “Saved to your account” statically.
- A non-conflict failure only calls `setNote`; there is no retry timer and no
  persistent error state. A later render can restore the optimistic Saved copy.

**Exact fix**

The save controller exposes one status model:
`local`, `dirty`, `saving`, `saved`, `retrying`, `conflict`, or `error`, with
the acknowledged local version. Render the same status in the global toolbar
and Knowledge editor. “Saved” is legal only when
`confirmedVersion === localVersion`, no request/queue/conflict exists, and the
server returned success. Replace the static footer sentence.

**Acceptance**

- Deferred save tests never observe Saved before resolution.
- Rejection shows “Couldn’t save — retrying…” and remains visible across render.
- Retry success is the only transition back to Saved.

### P1.3 — Server reconciliation can re-render over text being edited

**Root cause**

`adoptServerBook` always calls `render`. The second-conflict path invokes it
after discarding local work. The current clean/dirty flags can also be wrong
after an out-of-order response, allowing `pullBookIfClean` to adopt remote while
an editor has newer DOM/model text.

Some fields (`jobCatalogRow`) buffer values in a closure before putting them in
the store, so a route render can remove the DOM that still owns the newest
value.

**Exact fix**

Put every input change in the model immediately. Reconciliation merges model
state but never calls a destructive full render while an editor is composing or
while local changes/conflicts exist. Preserve focus, selection, and IME
composition. Render a server update only after field-level merge, and patch
unfocused nodes where possible.

**Acceptance**

- Type while a remote response resolves; the textbox, model, preview, and final
  save retain the typed value.
- Route changes commit registered buffered editors before `replaceChildren`.
- Composition events are not interrupted by save status updates.

### P1.4 — STAR text is painted under an adjacent column

**Root cause**

The screenshot is diagnostic:

- Situation and Action (the left STAR column) lose their first painted
  characters at exactly the boundary with `.bb-exp-lead`.
- Task and Result (the right STAR column) are intact.
- The labels at that same boundary are also missing their starts (“…UATION”,
  “…ION”). A data mutation cannot selectively erase pixels from labels, which
  are constants from `book-view.js:STAR_FIELDS`.

The DOM path itself preserves values:
`app.js:experienceControl` reads `event.target.value`,
`patchEntry` calls `engine.js:updateEntry`, and `normalizeEntry` copies the STAR
string as a whole. The regression test serializes and reloads the exact reported
prefixes.

The vulnerable layout is `app.css:.bb-exp-row` (30% lead next to the STAR grid),
`.bb-exp-lead` (no paint containment), and `.bb-inline-area`
(`field-sizing: content` inside a constrained grid). An overflowing lead/editor
or intrinsic textarea is allowed to paint over the next grid item.

**Exact fix**

- Add paint containment to the lead column (`overflow: clip`, with `hidden` as
  fallback).
- Isolate the STAR grid's stacking context (`isolation: isolate`).
- Give `.bb-inline-area` `min-width: 0; max-width: 100%` and remove
  `field-sizing: content`; `fitArea` already grows textarea height.
- Keep `box-sizing: border-box`, explicit padding, and the one-column mobile
  breakpoint.

Do not “repair” stored STAR strings or run a database migration for this report.

**Risks**

- Clipping must not hide focus outlines; apply it to the column content area and
  keep an inset focus treatment if needed.
- Removing `field-sizing` requires `fitArea` on every STAR textarea, which the
  current constructors already do.

**Acceptance**

- The reported strings round-trip with `Our` and `I` intact.
- CSS pins containment and bounded textarea width.
- Long bullet/STAR text cannot paint across either grid boundary.
- `node scripts/test-brag-book-bugbash-star-layout.mjs` passes.

### P2.1 — The empty-overwrite heuristic is incomplete and masks the real guard

`shouldBlockEmptyOverwrite` counts entries, posting bullets, and knowledge, but
not profile, jobs, education, credentials, or additional rows. It can neither
protect every valuable book nor distinguish a legitimate delete. Remove it once
revisioned saves and the outbox are in place; destructive changes should be
ordinary versioned edits with tombstones/three-way merge.

### P2.2 — Full-book saves amplify every conflict

One keystroke serializes up to `BOOK_MAX_CHARS` (1.5 MB), changes replicated
copies, and PUTs the entire account row. This worsens keepalive reliability and
turns unrelated edits into conflicts. The phased fix can retain a JSONB book
initially, but only canonical data should be serialized. A later refactor can
send versioned operations/patches; do not make that refactor a prerequisite for
the data-loss fixes.

### P2.3 — Legacy normalization mutates on read

`normalizeStore` calls `alignExperienceLines`, which projects entry wording into
several copies and may clear overrides. A read therefore performs undocumented
conflict resolution based on iteration order. Replace it with the explicit,
idempotent schema migration above and keep ordinary normalization shape-only.

### P2.4 — Save errors do not recover an expired auth token

`store.js:saveBook` surfaces a 401, but `app.js:pushStore` does not call
`refreshToken` as boot does. The controller should refresh once, retry with the
same immutable snapshot/revision, then retain the outbox and require sign-in if
the refresh fails. Never treat a 401 as a successful local save.

### P2.5 — Existing consistency checks cannot detect formatting drift

`engine.js:bulletConsistency` compares normalized plain text, skips active
overrides, and does not compare rich spans. Extend the diagnostic during phase 1
to report unresolved legacy versions, missing entry references, and rich-span
drift. Remove the copy-drift cases after v2 serialization makes those copies
impossible.

## Implementation phases

Each phase is independently shippable. Keep the new tests separate until its
phase lands, then add that script to the normal verification list.

### Phase 1 — Canonical bullet schema and lossless legacy migration

1. Add schema v2, placement references, `migrateCanonicalBullets`, and
   `legacyVersions`.
2. Make all editor functions update entries only.
3. Simplify `compileResumeDoc` to resolve placements by `entryId`.
4. Remove live overrides/copy projection from serialization.
5. Turn on `test-brag-book-bugbash-canonical.mjs`.

Ship criterion: every surface renders one entry and every legacy candidate is
accounted for. No save-controller work is required in this phase.

### Phase 2 — Durable single-flight saves and revision conflicts

1. Add `save-controller.js` with the contract in
   `test-brag-book-bugbash-save.mjs`.
2. Add account-scoped cache/outbox boot reconciliation.
3. Route every model edit and lifecycle event through the controller.
4. Change API/lib writes to require numeric revision.
5. Add global confirmed save status, retry, and conflict resolution.
6. Turn on `test-brag-book-bugbash-save-current.mjs` and
   `test-brag-book-bugbash-save.mjs`.

Ship criterion: no overlapping PUTs, no false Saved state, no discarded local
value, and reload recovers an interrupted edit.

### Phase 3 — Native rich spans end to end

1. Compile canonical entry spans directly; retire markdown from internal paths.
2. Preserve whitespace in DOM/model normalization.
3. Render the same spans in preview and DOCX.
4. Migrate legacy marker strings once.
5. Turn on `test-brag-book-bugbash-rich-text.mjs`.

Ship criterion: text and mark boundaries are identical after reload and in both
exports.

### Phase 4 — STAR containment

1. Apply the bounded, isolated grid rules.
2. Keep the pure data round-trip assertion.
3. Turn on `test-brag-book-bugbash-star-layout.mjs`.

Ship criterion: all STAR labels and values are legible at desktop and mobile
breakpoints, with no data rewrite.

### Phase 5 — Cleanup and consolidation

Delete obsolete projection/override helpers and collapse save-status code onto
the controller. Consider a shared inline-span helper for Brag Book bullet,
Additional Info, and Knowledge normalization, but keep the document/block
semantics separate. Consider a generic id-based three-way merge helper for
entries, postings, requirements, and resume placements so conflict logic is not
duplicated.

## Verification matrix

Run after the relevant phase:

```sh
node scripts/test-brag-book-bugbash-canonical.mjs
node scripts/test-brag-book-bugbash-save-current.mjs
node scripts/test-brag-book-bugbash-save.mjs
node scripts/test-brag-book-bugbash-rich-text.mjs
node scripts/test-brag-book-bugbash-star-layout.mjs
node scripts/test-brag-book.mjs
node scripts/test-brag-book-drag-dom.mjs
node scripts/test-public-imports.mjs
```

The four bug-bash scripts intentionally fail on the investigated revision.
They are separate from the existing passing suite so each can be enabled when
its phase is implemented.
