# Experiences mapping UX v2

Plan only. This document proposes no database work or app-behavior change by itself. It supersedes the catalog and side-panel interaction in `experiences-ux-spec.md`; that document's stable-ID, resume, mapping, export, and data-safety rules remain in force.

Priority: desktop web first. Mobile follows after the desktop interactions pass the safety and compatibility gates.

## Plain-language summary

Putting a resume bullet into an experience should be an obvious action on that bullet, not something inferred from a checkbox or a crowded side panel. Every bullet gets a quiet **Experience** control. Clicking it opens a searchable list of experiences for that job, with **Create new experience** and **Remove from experience** when relevant. Dragging a bullet onto an experience remains a desktop shortcut. Checkboxes appear only after the user deliberately enters bulk-select mode.

The right panel becomes an index of experiences, not a second copy of the bullet library. Each row shows an experience title, a small bullet count, and one clamped preview line in the app's normal reading font. The large loose-bullet block, raw bullet rows, and the current chip wall disappear from the panel. Loose bullets remain full-width in the left library and can be assigned from their own Experience control.

The same assignment control is available on bullet rows in a job posting, including mapped and Unmapped rows. Requirement mapping and experience membership remain separate: changing a bullet's experience never maps or unmaps it, adds it to a resume, changes its wording, or affects a sibling bullet. The Unmapped list remains exact and per bullet.

No bullet is copied, merged, or rewritten. The change only updates that persistent bullet's `experienceId` or creates additive experience metadata. Every phase is blocked on the existing backward-compatibility, preservation, sync/outbox, and full Brag Book test gates.

## 1. Problem to solve

The shipped interface exposes the data model instead of the user's task:

- A checkbox on every bullet does not say “put this bullet in an experience.”
- `Not in an experience · 20` gives loose bullets more visual weight than the work itself.
- The Experiences panel repeats complete bullet text in a narrow column, often in cramped monospace.
- `All / Experiences / Loose / Not on a resume` plus a Job dropdown makes the panel feel like a second library.
- The same bullet appears in both columns, but neither copy provides an obvious, direct assignment action.

The v2 success test is simple: without instruction, a user can assign one bullet to an existing or new experience, can see the result in place, and does not wonder whether the bullet or resume was duplicated.

## 2. Design rules

1. **Act on the bullet.** Experience membership is edited from the bullet row that owns it.
2. **The panel is an index, not an editor.** It lists experiences once; it does not render raw or loose bullet rows.
3. **Single and bulk actions look different.** A per-row Experience control handles the common case. Selection mode is an explicit tool for bulk work.
4. **Keep the existing compact visual language.** Thin dividers, quiet buttons, readable content type, no nested cards, no oversized empty-state block.
5. **Never move the viewport as a side effect.** Assignment, creation, rename, filtering, and bulk actions update in place and preserve both column scroll positions.
6. **Membership is metadata only.** Requirement links, resume placement, STAR, notes, tags, wording, and bullet identity do not change.
7. **Desktop first, mobile complete.** Desktop defines the interaction; mobile keeps bullets full-width and moves the index into a drawer.

## 3. Resume bullets page

### 3.1 Desktop wireframe

```text
Resume bullets
[ Search bullets, STAR, tags…                          ] [Select] [+ Add]
────────────────────────────────────────────────────────┬─────────────────────────────
GODADDY · SENIOR MANAGER                         8  ▾   │ EXPERIENCES          [+ New]
────────────────────────────────────────────────────────│ [Search experiences…       ]
Embedded-risk launch · 2 bullets                  ⋯    │
  • Built an embedded-risk process across 12 teams…    │ Embedded-risk launch      2
    [Experience: Embedded-risk launch ▾] [STAR ▸]       │ Built an embedded-risk…
  • Launched a risk program covering 12 teams…          │
    [Experience: Embedded-risk launch ▾] [STAR ▸]       │ Access-review program     3
────────────────────────────────────────────────────────│ Quarterly access reviews…
Not in an experience · 3                               │
  • Cut audit prep time 40% by…                         │ Controls automation       2
    [Experience: Not assigned ▾] [STAR ▸]               │ Automated control testing…
  • Automated evidence collection…                     │
    [Experience: Not assigned ▾] [STAR ▸]               │
────────────────────────────────────────────────────────┴─────────────────────────────
```

- The left panel remains the source of truth: **Job → Experience → Resume bullets**, followed by a quiet `Not in an experience · N` divider under that job.
- `Not in an experience` is not a large card. It is a thin section divider and its bullets use the same full-width rows as grouped bullets.
- Every bullet has a quiet chip/button:
  - `Experience: Not assigned ▾` for a loose bullet.
  - `Experience: <title> ▾` for a grouped bullet.
- The chip is always visible on desktop; it must not depend on hover. The current experience title may truncate visually, but its accessible name and tooltip use the full title.
- Clicking a panel experience filters/highlights its versions in the left list without changing the left scroll. Clicking the active row again clears the filter. The left search stays intact; the panel selection combines with it as an additional filter.
- When the selected experience is inside a collapsed role, the role header shows a quiet match count and highlight. It does **not** auto-expand or scroll. The user expands it deliberately.
- If the left search excludes all versions of the selected experience, show `This experience has no matches in the current search` with `Clear bullet search`; do not silently clear either state.
- Renaming an experience edits its title in place. The row height and panel scroll anchor remain stable.

### 3.2 Experience picker

```text
Experience
┌──────────────────────────────────────────┐
│ [Search experiences for this job…      ]│
│ ✓ Embedded-risk launch       2 bullets  │
│   Access-review program      3 bullets  │
│ ──────────────────────────────────────── │
│ + Create new experience                 │
│   Remove from experience                │  shown only when assigned
└──────────────────────────────────────────┘
```

- The first click opens an anchored picker beside the bullet. Search receives focus.
- Search matches experience title and its one-line representative preview. Results remain experience rows, never an expanded list of versions.
- Existing experiences are limited to the bullet's job. Cross-job choices are not offered because the shipped model blocks mixed-job experiences.
- `Create new experience` replaces the results with a one-line title field. Saving creates the experience and assigns the same bullet in one logical save. Cancel leaves both unchanged.
- Selecting an existing row updates only this bullet's membership.
- `Remove from experience` makes the bullet loose under the same job; it never deletes the experience or bullet.
- Success is visible in place: the chip changes and the left grouping updates. Focus returns to the same bullet control.
- Empty experiences may appear only if the product retains them (open question 4). They never cause a bullet copy.

### 3.3 Drag and bulk assignment

- On desktop, a bullet drag handle can drag a bullet from the left onto an experience row in the right panel. The row says `Move bullet to <title>` while targeted.
- Drop invokes the same stable-ID membership operation as the picker. It is a shortcut, not a separate behavior.
- Dragging must not trigger panel filtering, auto-scroll the left document, or alter resume order. Panel edge auto-scroll is allowed inside the panel only.
- A visible `Select` action enters bulk mode. Only then do row checkboxes and a sticky selection bar appear.
- The bulk bar offers `Move to experience…`, `Create new experience…`, and `Remove from experience`.
- Bulk assignment requires all selected bullets to belong to the destination job. Mixed-job selection explains which bullets are incompatible and makes no partial save.
- A grouping backup is captured before every bulk membership operation. Undo uses stable bullet and experience ids.
- Leaving bulk mode removes the checkboxes; selection is session-only and is never persisted.

## 4. Experiences side panel redesign

```text
┌ EXPERIENCES ───────────────────── [+ New] ┐
│ [Search experiences…                    ] │
├───────────────────────────────────────────┤
│ Embedded-risk launch          2 bullets  │
│ Built an embedded-risk process across…   │
├───────────────────────────────────────────┤
│ Access-review program         3 bullets  │
│ Cut quarterly review time by 40%…        │
├───────────────────────────────────────────┤
│ Controls automation           2 bullets  │
│ Automated evidence collection across…    │
└───────────────────────────────────────────┘
```

- Render exactly one compact row per experience.
- First line: title plus `N bullet(s)`. Second line: one representative bullet line, clamped to one line.
- Use `var(--content-font)` for titles and previews. Reserve monospace for the small count and controls.
- Do not show loose bullets, nested versions, STAR, notes, tags, checkboxes, or full bullet text in the panel.
- Remove the `All / Experiences / Loose / Not on a resume` chip row. The panel's one purpose is finding an experience.
- Default proposal: remove the Job dropdown too. Search spans experience titles and previews across roles; each result may show a quiet role label only when duplicate titles or search context make it useful. See open question 1.
- The panel is narrow (approximately 300–340px), sticky below navigation, and has its own scroll. Left and right scroll positions are independent.
- `+ New` asks for a role/job and title because a new empty experience has no bullet from which to infer its job. Creating it does not move any bullet.
- Panel search and active selection are session state, not book data.

## 5. Job posting page

### 5.1 Desktop wireframe

```text
Job posting · Acme
[Requirements] [Resume] [Prep]
────────────────────────────────────────────────────────┬─────────────────────────────
R1  Build a scalable risk program                       │ EXPERIENCES          [+ New]
    • Built an embedded-risk process across 12 teams…   │ [Search experiences…       ]
      [Experience: Embedded-risk launch ▾] [Unmap]      │
    [+ Map bullet]                                      │ Embedded-risk launch      2
────────────────────────────────────────────────────────│ Built an embedded-risk…
R2  Automate evidence collection                        │
    • Automated evidence collection across…             │ Access-review program     3
      [Experience: Not assigned ▾] [Unmap]               │ Quarterly access reviews…
────────────────────────────────────────────────────────│
Unmapped resume bullets · 2                             │ Controls automation       2
    • Cut audit prep time 40% by…                        │ Automated control testing…
      [Experience: Not assigned ▾] [Map to requirement] │
────────────────────────────────────────────────────────┴─────────────────────────────
```

- Every concrete bullet row on the posting page gets the same Experience control, including:
  - bullets mapped under requirements;
  - loose bullets shown by existing mapping flows; and
  - bullets in the Unmapped resume bullets panel.
- The picker and `Create new experience` behavior are identical to the Resume bullets page.
- Dragging one of these bullet rows onto a panel experience changes **experience membership only**. During drag the panel says `Move bullet to…`, never `Map to requirement`.
- Requirement mapping remains a separate many-to-many relationship. Existing Map/Unmap controls remain near the requirement.
- The same bullet can map to several requirements. Changing its experience changes none of those links.
- Clicking an experience in the panel highlights visible bullet rows that belong to it. It may also add a quiet highlight to requirements containing those exact bullet ids. Clicking again clears the highlight. It never maps, unmaps, expands a collapsed section, or scrolls either panel.
- `+ New` can create an empty experience. A bullet-level `Create new experience` creates and assigns in one action.
- Bulk-select mode is available on posting bullet rows for assigning several compatible bullets. It does not bulk-map requirements or add bullets to the resume.

### 5.2 Unmapped remains per bullet

“Unmapped” continues to mean: this exact stable bullet id is on this posting's resume but is not linked to any requirement on this posting.

- Grouping an Unmapped bullet does not remove it from Unmapped.
- Mapping a sibling version does not hide this bullet.
- Mapping this exact bullet to one or more requirements removes its one Unmapped row.
- Unmapping it from one requirement keeps it out of Unmapped while another requirement still links the same id.
- Removing its final requirement link returns it to Unmapped if it is still on the resume.
- Experience membership and panel selection are never inputs to this calculation.

## 6. Mobile behavior

- At `≤720px`, the left content is one full-width column. Bullet wording remains full width; the Experience control sits in the quiet action row below it.
- The Experiences panel becomes a slide-out drawer opened by a small labelled icon in the page header. It contains the same search and compact experience rows, not a reduced raw-bullet catalog.
- Tapping an experience in the drawer highlights/filters the page after the drawer closes. A persistent header chip names the active filter and provides `×` to clear it.
- The Experience picker becomes a full-width bottom sheet with 16px-or-larger input text and 44px minimum touch targets.
- Drag is not required on touch. Picker and explicit bulk-select actions provide complete parity.
- Mobile work follows the desktop rollout; no mobile layout may reintroduce permanent row checkboxes or narrow the bullet text to make room for the experience index.

## 7. Visual and interaction details

- Thin dividers separate role, experience, and bullet rows. Avoid nested borders, filled cards, and large shaded loose-bullet wells.
- Buttons are subtle but named. Do not use an unlabeled checkbox as the only affordance for assignment.
- Bullet text, experience title, and preview use the app's normal content font. Mono remains appropriate for tiny metadata, counts, labels, and actions.
- Inline rename and create fields replace their label in the same row; save/cancel does not rebuild the page around them.
- Preserve on every local render:
  - `window.scrollY`;
  - left editor/list scroll;
  - panel/drawer scroll;
  - focused bullet or control;
  - open role/experience sections;
  - search strings and selection mode.
- Do not call `scrollIntoView` after assignment, creation, rename, drag/drop, or bulk changes. Only an explicit navigation command may move the viewport.
- Offline keeps all mutation controls disabled with `Offline — read-only`; browsing, search, and highlighting remain available from the local mirror.

## 8. Data and safety invariants

This is a UX change over the shipped additive model, not a new schema proposal.

### 8.1 One record per bullet

- A bullet remains one `entries[]` record with its stable `entry.id`, wording, STAR, notes, tags, and job.
- Membership remains the additive `entry.experienceId` relationship.
- An experience remains metadata in `experiences[]` with a stable `experience.id`, `jobId`, title, and timestamps.
- Assignment updates only `experienceId` and normal update metadata. It does not copy or merge the entry.
- All matching uses stable ids. Never infer identity from bullet text, title, role text, array position, or a representative preview.
- Existing helpers such as `moveEntryToExperience`, `groupEntriesAsExperience`, `createExperience`, and grouping backups remain the semantic boundary; new UI handlers must not implement alternate mutation logic.

### 8.2 Additive data and backward compatibility

- No direct database work and no destructive migration.
- No rewrite of existing bullets, resumes, snapshots, requirement links, Knowledge links, exports, or backups.
- Old books without Experiences still normalize safely: all existing bullets remain loose.
- Old clients may omit Experiences fields when saving. Server/client preservation rules must keep unknown additive fields, or reject/reload a stale write; an old tab must never erase experience metadata.
- Old JSON imports without Experiences remain valid and loose. Current exports continue to retain Experiences fields and bullet membership.
- Saved resume snapshots remain immutable documents referencing the same stable bullet provenance they already store. Assignment cannot alter frozen snapshot content.
- Resume basics, posting resume order, overrides, fit, preview, DOCX/PDF, full-book PDF, and Knowledge links do not use experience membership to identify a bullet.
- The backward-compatibility promise in `experiences-backward-compat.md` remains a release gate.

### 8.3 Save controller, two tabs, and outbox

- Every assignment goes through the existing debounced, merge-safe save controller. The picker must not issue a side-channel write.
- A create-and-assign action is one logical local state transition and one queued save. A failure must leave neither a phantom assignment nor duplicate experience after reconciliation.
- Before bulk movement, capture the existing grouping backup. Individual moves continue to retain Undo state without deleting bullets.
- Two tabs editing different bullets must merge both stable-id changes.
- Two tabs moving the same bullet must follow the existing revision/409 path: refetch, merge by stable id, and present the surviving membership. It must not create a second bullet or silently discard unrelated edits.
- A concurrent experience rename and bullet assignment must preserve both because they target different stable records.
- If one tab removes/ungroups an experience while another assigns to it, normalization/reconciliation must leave the bullet loose or attached to the still-live stable experience according to the accepted revision—never dangling, deleted, or duplicated.
- Offline is read-only, so new grouping mutations cannot originate while disconnected. An in-flight save or pre-existing outbox item at disconnect must retain its stable ids, retry once connectivity returns, and use the same 409 merge path.
- Service-worker and local mirror changes are out of scope unless a test proves the new UI asset must be included. `/api/*` remains uncached.

## 9. Phased implementation and tests

Each phase is a small, independently reviewable commit. **Before and after every phase**, run the compatibility baseline:

```bash
node scripts/test-brag-book-experiences-backward-compat.mjs
node scripts/test-brag-book-experiences-preservation.mjs
node scripts/test-brag-book-pwa-sync-guarantees.mjs
```

Any failure blocks the phase. No phase is allowed to defer a safety regression to a later commit.

### Phase 0 — Pin the shipped behavior and v2 contracts

Documentation/tests only:

- Add DOM/model fixtures for loose, grouped, multi-requirement, on-resume, no-role, duplicate-text/different-id, and old-schema books.
- Pin Unmapped as an exact per-bullet calculation.
- Pin scroll/focus state contracts before replacing markup.

Tests:

```bash
node scripts/test-brag-book-experiences-ui-catalog.mjs
node scripts/test-brag-book-unmapped-experience-siblings.mjs
node scripts/test-brag-book-unmapped-resume.mjs
node scripts/test-brag-book-resume-editor-scroll.mjs
```

### Phase 1 — Add the single-bullet Experience picker

- Add the explicit Experience control to Resume bullets rows.
- Search existing same-job experiences, create-and-assign, move, and remove.
- Route every operation through the existing stable-ID helpers and save controller.
- Hide permanent checkboxes until explicit selection mode.

Tests:

- Picker opens from grouped and loose bullets; current membership is selected.
- Search returns experiences, not raw versions.
- Create-and-assign produces one experience and updates one existing bullet id.
- Move/remove changes only `experienceId`; STAR, notes, tags, text, job, resume use, and requirement links are byte-equivalent.
- Duplicate bullet text never confuses identity.
- Cross-job destination is absent/rejected with no partial write.
- Focus and scroll do not jump.
- Re-run model, catalog, preservation, backward-compatibility, and sync gates.

### Phase 2 — Replace the panel with the compact experience index

- Render one row per experience with title, count, and one-line preview.
- Remove nested version/loose rows, permanent checkboxes, chip wall, and (subject to decision) Job dropdown.
- Add search, active highlight/filter toggle, independent sticky scroll, and inline rename.

Tests:

- The panel has exactly one result per live stable experience id.
- Loose bullets never render as panel rows.
- Counts derive from stable membership; representative text is display-only.
- Long text is clamped and uses the content-font class.
- Clicking twice sets then clears the active experience.
- Left search + active experience intersection is correct.
- Collapsed roles show match state but remain collapsed.
- Rename preserves panel and page scroll/focus.
- Lightweight DOM tests do not depend on unsupported convenience APIs.

### Phase 3 — Add desktop drag and intentional bulk mode

- Drop left-side bullets onto panel experiences.
- Add `Select` mode and a stable selection bar for bulk assign/create/remove.
- Capture a grouping backup before bulk mutation.

Tests:

- Drag and picker call the same membership operation.
- Dragging duplicate-text bullets moves only the dragged stable id.
- Dropping twice is idempotent.
- Mixed-job bulk selection is rejected atomically.
- Bulk move changes every selected id once, no unselected id, and creates no bullet.
- Removing one selected bullet from an experience does not alter its siblings.
- Undo restores exact stable-id placements.
- Left and panel scrolling remain independent.
- Re-run `test-brag-book-drag-dom.mjs` plus model, preservation, compatibility, and sync gates.

### Phase 4 — Apply the control to job posting bullet rows

- Reuse the same picker on mapped and Unmapped rows.
- Enable posting-page drag and explicit bulk membership mode.
- Keep requirement Map/Unmap and resume Add/Remove independent.
- Add panel highlighting without automatic scrolling or expansion.

Tests:

- The same bullet can remain mapped to multiple requirements while its experience changes.
- Unmapping one requirement does not affect membership, resume presence, or other requirement links.
- Generated resume contains each bullet at most once by stable id.
- Grouping an Unmapped bullet leaves it Unmapped.
- Mapping one sibling does not hide another sibling from Unmapped.
- A bullet added directly to the posting resume remains the same library record, loose by default, until explicitly assigned.
- No picker/drag operation adds to or removes from a posting resume.
- Re-run Unmapped, resume preservation, version-swap, multi-requirement, and posting DOM suites.

### Phase 5 — Two-tab, outbox, and failure-path hardening

- Exercise single assignment, create-and-assign, rename, drag, and bulk operations through revision conflicts and reconnect.
- Add deterministic reconciliation messages where the accepted server state differs from the stale tab.

Tests:

- Two tabs assign different bullets: both survive.
- Two tabs assign the same bullet differently: one stable bullet survives with one valid membership; unrelated edits survive.
- One tab renames while the other assigns: both accepted changes survive.
- One tab ungroups/removes while another assigns: no dangling `experienceId`, bullet loss, or duplicate.
- Retried create-and-assign and bulk outbox operations are idempotent by stable ids.
- An in-flight disconnect and reconnect neither loses nor repeats the move.
- Offline controls cannot enqueue a new mutation.
- 409 refetch/merge preserves Experiences, old-client fields, resume state, and requirement links.

Required:

```bash
node scripts/test-brag-book-pwa-sync-guarantees.mjs
node scripts/test-brag-book-experiences-backward-compat.mjs
node scripts/test-brag-book-experiences-preservation.mjs
```

### Phase 6 — Mobile drawer and visual cleanup

- Convert the panel to a drawer and picker to a bottom sheet.
- Keep bullets full width and controls touch-safe.
- Remove obsolete panel/checkbox CSS and retain thin-divider compact styling.

Tests:

```bash
node scripts/test-brag-book-mobile-desktop-lock.mjs
node scripts/test-brag-book-exp-concise.mjs
node scripts/test-brag-book-experiences-ui-catalog.mjs
node scripts/test-brag-book-resume-editor-scroll.mjs
```

Also assert drawer open/close and active-filter behavior, 16px inputs, touch target sizing, full-width bullet layout, and no permanent mobile checkboxes. Verification remains shell/unit/DOM based; no browser automation.

### Final shipping gate

Run every Brag Book test plus public-import validation:

```bash
for test in scripts/test-brag-book*.mjs; do node "$test" || exit 1; done
node scripts/test-public-imports.mjs
```

Do not ship if any compatibility, preservation, sync, Unmapped, resume deduplication, snapshot, import/export, backup, scroll, or offline-read-only test fails.

## 10. Non-goals

- No new database table, API route, direct database edit, or data migration.
- No merging, cloning, or deleting bullets as part of assignment.
- No change to requirement-to-bullet many-to-many mapping.
- No change to posting resume membership, ordering, groups, snapshots, or version swap.
- No experience-level Unmapped calculation.
- No full-text duplicate detection or text-based identity.
- No browser automation in planning or implementation verification.

## 11. Open questions for the user

1. **Role filter:** Should the simplified panel have no Job dropdown, as recommended, or a single quiet role filter for very large libraries?
2. **Panel click:** Should clicking an experience temporarily hide nonmatching left rows (strong filter), or keep all rows and highlight/expand only the matching role headers (lighter orientation)?
3. **Representative line:** Should the panel preview use the first version in library order, the most recently edited version, or the first version currently on the active posting's resume?
4. **Empty experiences:** Should a newly created empty experience remain available in the panel indefinitely, or disappear after the session unless a bullet is assigned?
5. **Bulk mode entry:** Is one page-level `Select` button sufficient, or should each role header also have `Select bullets` for long libraries?
6. **Posting panel facts:** Should posting rows retain one quiet aggregate such as `2 mapped` or `1 on resume`, or should the v2 panel show only title, bullet count, and preview everywhere?
7. **After assignment:** Should the moved bullet stay visually where it was until the current edit ends, or move immediately under its experience while focus stays anchored? The recommendation is immediate movement with focus preserved and no viewport jump.
