# Brag Book point-in-time resume snapshots

Status: implemented (schema v3, `resumeSnapshots`, bank UI, soft delete).

Goal: let a user save a named, immutable copy of a posting resume, browse a
bank of saved resumes, and render/print/export a copy later exactly as it
looked when saved. The hard invariant is: **no saved resume content is ever
lost because live data changed, an old tab saved, or two tabs conflicted.**

## Product contract

1. `Save a copy` appears on a posting's Resume page
   (`#jobs/:postingId/resume`). It does not replace or change the live resume.
2. The naming form is inline and compact, not `window.prompt`. Prefill:
   `<Company> – <Posting title> – <YYYY-MM-DD>`. Let the user edit it before
   saving. Names are required, trimmed, and capped at 120 characters.
3. A saved copy is a deep copy of a **resolved compiled resume document** and
   its page-fit presentation. It is not a copy of `posting.resume`
   instructions and does not point to live entries, jobs, profile, Additional
   rows, or the posting.
4. Saved copies never change when Resume basics, jobs, bullets, formatting,
   Additional info, posting settings, or the source posting change or are
   deleted.
5. `Saved resumes` opens a global bank. Rows show name, saved date, and frozen
   source company/posting title. A row opens a read-only preview using the same
   HTML resume renderer and offers Print/PDF and Download Word.
6. Rename changes display metadata only. Delete asks for confirmation and
   hides the row. To satisfy no-loss concurrency, delete is a tombstone event:
   the frozen payload is retained in book JSON and cannot be resurrected by a
   stale tab. No Restore UI is required in v1.
7. Duplicate names are allowed. Identity is the generated snapshot id, not
   the name.
8. The bank and save form use the compact house style: thin dividers, small
   labels, minimal padding, current content font. They must work inside the
   responsive rules shipped in `ad97ea9`; desktop layout outside these
   additive surfaces must not change.
9. The optional `Start new resume from this copy` is **not part of v1**. See
   the decisions section.

## Why the snapshot stores a compiled document

`posting.resume` is only a set of instructions. `compileResumeDoc(posting,
store)` currently resolves those instructions against live:

- `store.profile` header/contact data;
- shared and posting-local jobs, groups, and row order;
- linked entry/requirement bullet wording;
- include/exclude and pin state;
- education, credentials, and Additional info overlays;
- section order and current template.

Saving those instructions would drift whenever their sources change. Capture
the output of `compileResumeDoc` instead. Before storing it:

1. `structuredClone` the compiled doc.
2. Keep all compiled jobs/bullets, including `included: false`, so hidden state
   is frozen. Keep `pinned`, group order, headings, ids, and section order.
3. Resolve each bullet's final display spans with `resumeBulletSpans(bullet)`
   and store those spans on the frozen bullet as `rich`; retain lead/body for
   compatibility and plain-text export.
4. Resolve each Additional row with `additionalValueSpans(row)` and store
   those spans as `rich`.
5. Strip live-link/instruction fields that are not required to render:
   `sourceEntryIds`, `sourceBulletIds`, `originalLead`, `originalBody`,
   `originalTitle`, `hasOverride`, `local`, and `hasLocalExtras`. There must be
   no later lookup into `store`.
6. Store the current measured fit result, including dropped bullet ids and
   CSS variables. Do not rerun fit when viewing a snapshot.

The screen preview transform is recomputed for each device width. That
viewport scale is not part of the resume document. The point-in-time page fit
(font size, line height, gaps, fit drops) is stored and immutable.

## Schema

Bump top-level `SCHEMA` in `brag-book/engine.js` from 2 to 3. Add
`resumeSnapshots: []` to `emptyStore` and normalization.

Snapshot schema version starts independently at 1:

```js
{
  v: 1,                              // RESUME_SNAPSHOT_SCHEMA
  id: "rs_<random>",
  name: "Acme – Controller – 2026-10-09", // derived/materialized display name
  initialName: "Acme – Controller – 2026-10-09",
  savedAt: "2026-10-09T12:00:00.000Z",
  sourcePostingId: "posting_123",
  sourcePosting: {
    company: "Acme",
    title: "Controller"
  },
  renderer: {
    template: "classic-serif",
    templateVersion: 1,
    fontFamily: "Cambria, Caladea, 'Times New Roman', serif",
    fontHref: "https://fonts.googleapis.com/..."
  },
  doc: {
    // Deep-cloned, self-contained compileResumeDoc result.
    // Bullet and Additional rich spans are fully resolved.
  },
  fit: {
    fontPt: 9.5,
    bulletLineHeight: 1.17,
    droppedBulletIds: [],
    droppedLabels: [],
    fits: true,
    pinnedBlocked: false,
    vars: {
      "--fs": "9.5pt",
      "--lh-bullet": "1.17",
      "--group-gap": "5pt",
      "--sec-gap": "6pt"
    }
  },
  events: [
    {
      id: "rse_<random>",
      kind: "rename",                // rename | delete
      at: "2026-10-10T12:00:00.000Z",
      name: "Board application – final"
    }
  ],
  recoveryCopies: []
}
```

Rules:

- `doc`, `fit`, `renderer`, `savedAt`, and source fields are immutable.
- Rename and delete are append-only events with independent random ids.
- Normalize events by id and sort deterministically by `at`, then `id`.
- Materialized `name` is `initialName` followed by the last rename event.
- A snapshot is deleted if it has any valid delete event. Later/stale rename
  events cannot resurrect it.
- `activeResumeSnapshots` filters tombstoned rows and sorts `savedAt`
  descending, then id.
- `resumeSnapshotById(..., { includeDeleted: true })` supports merge,
  migration, and tests. It is not a user-facing restore feature.
- A same-id immutable-payload mismatch is corruption or an astronomically
  unlikely id collision. Never choose one and drop the other. Keep the
  canonical record and append the other immutable payload, keyed by a stable
  JSON identity, to `recoveryCopies`. The UI may show a conflict note; both
  copies must survive serialization.

## File-by-file implementation

### 1. `brag-book/resume-snapshots.js` — new browser-safe model

Keep this module dependency-free except imports from browser-safe
`resume-model.js` and `resume-template.js` constants.

Export:

- `RESUME_SNAPSHOT_SCHEMA = 1`
- `defaultResumeSnapshotName(posting, date)`
- `normalizeResumeSnapshot(raw, clock)`
- `normalizeResumeSnapshots(list, clock)`
- `freezeResumeSnapshot(store, posting, { name, fit }, clock, random)`
- `resumeSnapshotToDoc(snapshot)`
- `snapshotDisplayName(snapshot)`
- `snapshotIsDeleted(snapshot)`
- `activeResumeSnapshots(storeOrList)`
- `resumeSnapshotById(storeOrList, id, options)`
- `renameResumeSnapshotRecord(snapshot, name, clock, random)`
- `deleteResumeSnapshotRecord(snapshot, clock, random)`
- `mergeResumeSnapshotRecord(base, local, remote)`
- `mergeResumeSnapshotLists(base, local, remote)`
- `preserveResumeSnapshotLists(incoming, current)`

Capture algorithm:

1. Require a real posting id and nonempty normalized name.
2. Resolve posting from the current store.
3. Call `compileResumeDoc(posting, store)`.
4. Deep-clone and resolve rich spans as described above.
5. Copy current in-memory `resumeFit`, not merely
   `posting.resume.fit`. `resumeFit.vars` is required for HTML/PDF parity.
6. Freeze source posting labels and presentation metadata.
7. Generate independent ids for the snapshot and every later metadata event.
8. Return the normalized record.

Do not use `Object.freeze` as persistence; JSON round-trips remove it.
Immutability comes from API design, deep copies, and merge rules.

### 2. `brag-book/engine.js` — book schema and public operations

- Import/re-export the snapshot model functions needed by app/tests.
- Set `SCHEMA = 3`.
- Add `resumeSnapshots: []` to `emptyStore`.
- In `normalizeStore`, normalize `raw.resumeSnapshots`. Missing data from v1/v2
  becomes `[]`; no migration of live resumes is needed.
- Add these store operations with the exact pending-test contracts:

```js
saveResumeSnapshot(store, postingId, { name, fit }, clock, random)
// => { store, snapshot }

renameResumeSnapshot(store, snapshotId, name, clock, random)
// => normalized store; doc/fit unchanged

deleteResumeSnapshot(store, snapshotId, clock, random)
// => normalized store with delete event; record retained

resumeSnapshotById(store, id, { includeDeleted = false } = {})
activeResumeSnapshots(store)
resumeSnapshotToDoc(snapshot)
preserveResumeSnapshots(incoming, current, clock)
```

- `bookIsEmpty` must ignore tombstoned snapshots but count an active snapshot
  as user data.
- `serializeBook` continues enforcing `BOOK_MAX_CHARS`.
- Extend the server preservation boundary rather than replacing it:

```js
preserveServerHistory(incoming, current)
  = preserveResumeSnapshots(
      preserveLegacyVersions(incoming, current),
      current
    )
```

Keep `preserveLegacyVersions` behavior and tests unchanged.

### 3. `brag-book/save-controller.js` — no-loss three-way merge

Import `mergeResumeSnapshotLists` only if doing so does not create a cycle.
Preferred dependency direction: put generic snapshot merge in
`resume-snapshots.js`, which must not import `engine.js` or
`save-controller.js`.

In `mergeConcurrentBooks`:

- Merge `base/local/remote.resumeSnapshots` by snapshot id.
- Union disjoint snapshot ids.
- For the same id, retain immutable capture fields and union `events` by event
  id.
- Union `recoveryCopies` by stable payload identity.
- Disjoint adds and disjoint metadata events produce no conflict.
- An immutable-payload mismatch may emit a recoverable
  `collection: 'resumeSnapshots'` warning, but merged data must contain both
  payloads. It must never be resolved through whole-record timestamp LWW.
- Never infer deletion from list absence. Only a delete event hides a row.

In `retainLocalConflictValues`, do not overwrite the merged snapshot union with
one side. Snapshot content/events are already retained by the specialized
merge.

### 4. `lib/brag-book.js` — protect against old open tabs

Older clients normalize and PUT without `resumeSnapshots`. A revision-valid
write from such a tab must not strip server snapshots.

- Import `preserveServerHistory` (or both preservation helpers).
- Before every existing-row `serializeBook`, merge current
  `resumeSnapshots` and event histories into incoming data.
- Keep the revision-preconditioned `UPDATE ... WHERE rev = currentRev`.
- New-row insert needs no preservation.
- Add no table and no Vercel function: snapshots remain in the existing JSONB
  payload and `/api/bb-book` route.

### 5. `brag-book/resume-model.js` — frozen render document

- Export a helper to canonicalize a compiled document for snapshot storage,
  or keep it in `resume-snapshots.js`.
- `resumeSnapshotToDoc` must return a fresh deep copy whose `fit` combines the
  frozen document fit with snapshot `fontPt`, `bulletLineHeight`,
  `droppedBulletIds`, and fit vars.
- Renderers must need no live store/posting argument.
- Keep hidden (`included: false`) and pinned values in storage. Existing HTML
  and DOCX renderers already omit excluded and fit-dropped bullets.
- Do not call `projectEntryLines`, `entryById`, or posting variant functions
  when reading a snapshot.

### 6. `brag-book/resume-template.js` and `resume-docx.js`

- Prefer the frozen bullet/Additional `rich` spans. Existing
  `resumeBulletSpans` and `additionalValueSpans` already do this.
- Add renderer-version dispatch only if template v2 is introduced later.
  Snapshot v1 uses the current classic-serif renderer.
- HTML/PDF snapshot export:

```js
const doc = resumeSnapshotToDoc(snapshot);
resumeDocument(
  renderResumeHtml(doc, { droppedBulletIds: snapshot.fit.droppedBulletIds }),
  { fittedVars: snapshot.fit.vars, print: true }
);
```

- DOCX snapshot export:

```js
resumeDocxBlob(resumeSnapshotToDoc(snapshot))
```

- Keep live resume exports byte/behavior compatible.

### 7. `brag-book/routes.js`

Add:

- bank: `#saved-resumes` → `{ kind: 'snapshots' }`
- detail: `#saved-resumes/:snapshotId` →
  `{ kind: 'snapshots', id: snapshotId }`

Parse ids against normalized snapshots, including a tombstoned id only for
safe fallback to the bank. `viewTitle`:

- bank: `Saved resumes`
- detail: `<snapshot name> · Saved resume`

Do not add another top-nav link; the shipped phone nav is already dense.

### 8. `brag-book/app.js` — capture, bank, read-only preview, export

State:

- Add `resumeSnapshotNameOpen` (or equivalent) for the inline naming row.
- Track which live posting the current measured `resumeFit` belongs to.
  `Save a copy` must be disabled while preview says “Measuring one page…” or
  if fit belongs to another posting. This prevents freezing stale fit from a
  previously opened resume.

Live posting Resume header:

- Add `Save a copy` and `Saved resumes`.
- `Save a copy` toggles `.bb-snapshot-save`, containing:
  name label/input, Save, Cancel, and concise point-in-time help.
- Prefill with `defaultResumeSnapshotName`.
- Save calls only `saveResumeSnapshot`, then existing `saveStore()`. Navigate
  to the new snapshot detail or leave the user on the live resume and show a
  saved status; choose one and test it. Preferred: navigate to detail so the
  frozen result is immediately visible.
- Do not show Save a copy on Resume basics (`#profile`) in v1. Show
  `Saved resumes` there for bank access.

Bank:

- `savedResumesBank()` renders `.bb-snapshot-bank`, `.bb-snapshot-list`, and
  `.bb-snapshot-row`.
- Each active row shows display name, `savedAt`, frozen source company/title,
  and Open.
- Detail uses `.bb-snapshot-detail` with read-only title/source/date,
  `Back to saved resumes`, `Print / PDF`, `Download Word`, Rename, and Delete.
- Rename uses an inline form and `renameResumeSnapshot`; no live document
  fields become editable.
- Delete uses `confirm`, then `deleteResumeSnapshot`, saves through the normal
  controller, and returns to the bank.

Read-only preview:

- Add `refreshResumeSnapshotPreview(snapshot)`.
- It calls the same `renderResumeHtml`/`resumeDocument` and the same screen
  `scaleResumeFrame`.
- It passes stored fit vars and fit-drop ids immediately.
- It must **not** call `compileResumeDoc`, `fitOnePage`,
  `updatePostingResume`, or `saveStore`.
- Do not install preview-to-editor click handlers; there is no editor.

Exports:

- Refactor live export inputs behind a small `resumeExportContext` helper or
  add dedicated snapshot export functions. Avoid a boolean maze.
- Snapshot Print/PDF prints the frozen iframe; fallback HTML uses stored fit
  vars.
- Snapshot Word passes the frozen doc directly to `resumeDocxBlob`.
- Name files from snapshot display name after existing filename sanitization.

Render branch:

- Handle `view.kind === 'snapshots'` before the jobs/log branches.
- Snapshot pages must not affect posting selection, resume preview fit state,
  save flush behavior, or conflict UI.

### 9. `brag-book/app.css`

Add only scoped selectors:

- `.bb-snapshot-save`
- `.bb-snapshot-bank`
- `.bb-snapshot-list`
- `.bb-snapshot-row`
- `.bb-snapshot-meta`
- `.bb-snapshot-detail`
- `.bb-snapshot-actions`

Desktop:

- Single compact list with 1px `var(--line)` dividers, 8–10px vertical
  padding, no oversized cards.
- Use `var(--content-font)` for names/source labels and existing mono styles
  for metadata/actions.
- Reuse `.bb-resume-preview-wrap`/`.bb-resume-frame`; do not fork the resume
  page renderer.

Mobile (`@media (max-width: 860px)`):

- Snapshot row content/actions stack.
- Naming input and actions become full width.
- Bank/detail action groups wrap without horizontal page scroll.
- Reuse existing `(pointer: coarse)` 16px inputs and 44px buttons. Explicitly
  include snapshot naming/rename inputs if their class is not already under
  `.field input`.

Do not modify base desktop resume editor/split behavior.

## Merge, reload, and conflict acceptance

The following are required, not optional:

1. A snapshot survives normalize → serialize → JSON parse → normalize.
2. Two tabs add different ids from the same base: merged book has both, no
   snapshot conflict, and retry PUT sends both.
3. One tab renames while another deletes the same id: all metadata events and
   the immutable doc remain; the row is hidden because delete is explicit.
4. A stale/old client omits `resumeSnapshots`: server preservation restores
   all current records/events before serialization.
5. No merge path uses posting/job `updatedAt` LWW for snapshots.
6. No code physically filters tombstoned snapshot records out of stored JSON.
7. Snapshot addition goes through existing `saveStore`, save controller,
   outbox, revision CAS, 409 merge, and retry. Do not create a separate API,
   local-only store, or write path.

## Migration

- Top-level book schema: 2 → 3.
- Snapshot schema: starts at 1 and is normalized independently.
- v1/v2 books normalize with `resumeSnapshots: []`.
- There is no eager snapshot generated from existing postings.
- Current v3 clients must preserve snapshots from payloads with unknown future
  snapshot versions as recovery copies rather than silently dropping them.
- Old v2 tabs are handled by server `preserveResumeSnapshots`.
- Keep local/account/outbox storage keys unchanged; changing keys would strand
  pending edits.

## Payload size

Current `BOOK_MAX_CHARS` is 1,500,000 serialized characters for the entire
book. A measurement using the committed Inaayat sample (2 jobs, 12 bullets,
header, credentials, education, Additional info, fit metadata) produced:

- compiled doc: ~14,243 characters;
- complete snapshot envelope: ~14,571 characters.

Practical estimate:

- typical 10–15 bullet snapshot: **15–25 KB**;
- larger 25–35 bullet snapshot: **30–60 KB**;
- formatting/fit/event metadata: generally under 2 KB beyond content.

The theoretical empty-book capacity at 14.6 KB is about 102 snapshots, but the
live book, recovery history, long bullets, and soft-deleted snapshots share the
same 1.5M cap. A safer product expectation is roughly **25–50 ordinary
snapshots**, not a guaranteed count.

Implementation requirements:

- Before capture, create the candidate store and run `serializeBook`; if it
  exceeds the existing cap, do not mutate/apply it and show a clear
  “Book is too large to save this copy; export/delete older data” message.
- Show current serialized usage or a warning once the book reaches 80% of the
  cap in the Saved resumes bank.
- Do not impose a count limit in v1; content size is what matters.
- Soft delete does not reclaim space. This is intentional for no-loss.
  A separately approved permanent-purge/archive feature would be needed to
  reclaim snapshot bytes safely.

## Tests

New pending suite:

```bash
node scripts/test-brag-book-resume-snapshots.mjs
```

It is intentionally red on this plan-only branch and specifies:

- capture/deep-copy shape;
- hidden and pinned state;
- exact read-only HTML and DOCX render parity at save time;
- immutability after header, job, bullet, group, Additional, and formatting
  edits;
- rename without document mutation;
- soft delete/tombstone retention;
- two-tab disjoint add union;
- concurrent rename/delete event union;
- old-client server preservation;
- normalize/serialize round-trip;
- stored fit CSS vars;
- additive bank/detail source hooks and a no-refit read-only preview.

Extend existing tests:

- `scripts/test-brag-book-bugbash-save.mjs`: explicit 409/retry with disjoint
  snapshots and outbox base.
- `scripts/test-brag-book-bugbash-save-current.mjs`: source assertions that
  `lib/brag-book.js` preserves snapshots before PUT and capture uses existing
  save controller.
- `scripts/test-brag-book-mobile-desktop-lock.mjs`: routes and additive bank
  DOM; current desktop grids/preview/editor remain unchanged.
- `scripts/test-brag-book.mjs`: schema migration, default naming, invalid
  names, id/event dedupe, future-version recovery, payload preflight.

All existing nine suites must remain green:

```bash
node scripts/test-brag-book-mobile-desktop-lock.mjs
node scripts/test-brag-book-bugbash-canonical.mjs
node scripts/test-brag-book-bugbash-save-current.mjs
node scripts/test-brag-book-bugbash-save.mjs
node scripts/test-brag-book-bugbash-rich-text.mjs
node scripts/test-brag-book-bugbash-star-layout.mjs
node scripts/test-brag-book.mjs
node scripts/test-brag-book-drag-dom.mjs
node scripts/test-public-imports.mjs
```

## Implementation order for the next model

1. Implement `resume-snapshots.js` and make the pending pure-model/render tests
   pass.
2. Wire schema normalization and engine operations.
3. Add specialized client merge and server old-client preservation; run save
   suites before UI work.
4. Add routes and compact bank/detail CSS.
5. Add live capture UI with fit-readiness guard.
6. Add read-only preview and snapshot export context.
7. Add source/jsdom responsive locks.
8. Run the pending suite plus all existing nine suites.
9. Confirm the diff does not touch save-controller scheduling, revision
   guards, outbox keys, API routes, or database schema beyond the specialized
   collection merge/preservation described here.

## Decisions for the user

1. **Soft delete versus space reclamation.** Recommended v1 behavior is
   no-loss soft delete: it disappears from the bank but remains recoverable in
   JSON and merge-safe. It does not reclaim payload space. Permanent purge can
   be a later, explicit archive/export flow.
2. **Duplicate names.** Recommended: allow them and distinguish by saved date
   and source posting. Enforcing unique names creates unnecessary rename
   conflicts.
3. **Bank access.** Recommended: buttons on live posting Resume and Resume
   basics, without adding another top-nav item.
4. **Start from this copy.** Leave out of v1. If later approved, it must create
   a brand-new posting-local resume with new job/group/bullet ids, never mutate
   Resume basics, the source posting, or the snapshot.
5. **Screen scale.** Store page-fit typography/drop settings, but recompute the
   viewport preview transform per device. Persisting desktop screen scale
   would make the same snapshot render incorrectly on mobile.
