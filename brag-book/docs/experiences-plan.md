# Brag Book experiences — design and rollout plan

## Plain-language summary

An **experience** is a light folder for resume bullets that describe the same piece of work in different ways. The bullets remain the real, editable records: each keeps its own wording, STAR fields, job, notes, tags, stable id, posting links, and resume links. Grouping bullets does not merge, copy, rewrite, or delete them.

Existing books do not need a migration that rewrites bullets. Until someone groups anything, every existing bullet behaves as its own one-bullet experience and every screen renders the same content it does now. Grouping adds a stable experience id and a short experience title; ungrouping removes only that relationship.

On desktop, both Resume bullets and an individual job posting use a wide working panel plus a narrow sticky experience index. The index is searchable, filterable by role, shows version counts, and scrolls independently. It supports drag-and-drop with complete non-drag alternatives. On mobile, the same index is a slide-out drawer. On a posting, the user can check several versions of one experience and add them to a chosen resume role and sub-heading in one safe, idempotent action. Experiences and bullets remain many-to-many with requirements, while each stable bullet appears at most once on the generated posting resume.

The first release should be additive and reversible. It should add experience metadata inside the existing Brag Book JSON document, preserve old clients and old imports, keep saved resumes immutable, and continue using the existing revision guard, three-way merge, account-scoped cache, and durable outbox. It must not add a database table or touch the database directly.

The central safety rule is:

> Experience operations may change labels and relationships, but they must never change or delete bullet content.

## User experience walkthrough

The visual treatment should stay consistent with Brag Book: compact system type, thin dividers, quiet count text, subtle outline buttons, and no card-within-card treatment. Text controls should have icon alternatives and accessible labels. Expanding a row should not move focus unexpectedly.

### 1. Resume bullets page

On desktop, use a two-panel workspace. The wide left panel remains the current Resume bullets list grouped by role; it is still where bullets are read and edited. A narrow right panel is the experience index. It is sticky within the workspace, has its own scroll container, and never changes the left panel’s scroll position.

```text
┌────────────────────────────────────────────────────┬────────────────────────┐
│ Resume bullets                           [ + Add ] │ EXPERIENCES            │
│ [ Search bullets, STAR, tags…                   ] │ [ + New experience ]   │
│                                                    │ [ Search experiences… ]│
│ GO DADDY · SENIOR MANAGER                 8  [▾] │ [Role: All          ▾] │
│ ──────────────────────────────────────────────── │ ────────────────────── │
│ • Built an embedded-risk process across… [STAR] │ Rebuilt access reviews │
│   [Embedded-risk launch] [versions (2)]     [⋯] │              3 versions │
│ ──────────────────────────────────────────────── │                        │
│ • Launched a risk program covering 12 teams…    │ Embedded-risk launch ● │
│   [Embedded-risk launch] [versions (2)]     [⋯] │              2 versions │
│ ──────────────────────────────────────────────── │                        │
│ ▸ PWC · MANAGER                            5     │ Controls automation     │
│                                                    │              1 version  │
└────────────────────────────────────────────────────┴────────────────────────┘

Drag from left ───────────────────────────────► drop on an experience
```

Actions:

- **Select/filter:** clicking an experience in the right panel applies it as a left-panel filter and shows only its versions under their role group(s). Clicking the selected experience again clears the filter. The selected row gets a quiet dot/highlight and the left search shows a removable `Experience: …` filter chip.
- **Create an experience:** `+ New experience` stays at the top of the right panel. It creates the label, then invites the user to drag or move versions into it. A cancelled empty draft is not persisted. Multi-select `Group as experience` may remain as a convenience. The proposed default title is display copy only and is not identity.
- **Rename:** the experience title is edited inline. Renaming never edits version wording.
- **Group by drag:** drag a bullet row from the left and drop it on an experience in the right panel. The drop target highlights before release. The mutation uses the dragged entry id and destination experience id; text is never drag payload identity. Moving creates the grouping backup before changing membership.
- **Group without drag:** `⋯ → Move to experience…` opens the same searchable experience list. This is the keyboard, screen-reader, and mobile path, not a secondary capability.
- **Cross-role grouping:** block it in v1 unless the user confirms which job owns the experience; every version retains its own `jobId`.
- **Ungroup one version:** `⋯ → Remove from experience` returns that bullet to an implicit one-bullet experience.
- **Ungroup the whole experience:** `⋯ → Ungroup all versions` removes the relationships and leaves every bullet visible as its own implicit experience.
- **Delete an experience:** use the safer wording `Ungroup and remove label`. It tombstones the experience metadata and never deletes bullets. Bullet deletion remains a separate, explicit action with the existing warning.
- **Draft another version:** creates a new bullet record with a new stable bullet id inside the experience. It may offer to copy STAR/notes from a chosen version, but copying is opt-in and creates independent fields.

The two searches are deliberately independent:

- The **left search** filters bullet/version content (wording, STAR, tags, role, and notes). If an experience is selected, results are the intersection of that experience and the left query. A zero-result state names both filters and offers `Clear experience` and `Clear search`; it never silently clears either.
- The **right search** filters experience titles and the searchable content of their versions. Matching experiences retain their version counts. `Filter by role` narrows the right panel by stable `jobId`, not company/title text.
- Selecting an experience temporarily expands each role containing one of its versions. Clearing the experience restores the role’s prior session-only collapsed state. The app must not persist collapse changes caused by filtering.
- A manually collapsed role remains collapsed during ordinary left search and displays its match count. Selecting a specific experience may temporarily reveal that experience’s versions, with a quiet `Filtered` label explaining why it opened.
- Right-panel scrolling, searching, role filtering, creating, and selecting must not jump or reset the left panel scroll. Left rerenders use the existing capture/restore mechanism.

### 2. Individual job posting page and requirement mapping

An individual posting uses the same two-panel pattern as Resume bullets. The wide left panel keeps the posting details, requirements, mapped experience chips, questions, and Unmapped resume experiences panel. The narrow sticky right panel indexes all experiences and scrolls independently without moving the requirements.

```text
┌───────────────────────────────────────────────────┬─────────────────────────┐
│ Product Risk Lead · Target Co                    │ EXPERIENCES             │
│                                                   │ [ + New experience ]    │
│ REQUIREMENTS                                      │ [ Search experiences… ] │
│ ──────────────────────────────────────────────── │ [Role: All          ▾] │
│ Lead cross-functional risk programs              │ [Mapped here        ▾] │
│ [Embedded-risk launch ✓] [2 versions]            │ ─────────────────────── │
│ • Built an embedded-risk process…                │ ✓ Embedded-risk launch │
│ [ Map experience ] [ + question ]                │   2 versions · 2 reqs  │
│                                                   │                         │
│ Automate evidence collection       ◀ drop here   │ ✓ Controls automation  │
│ [ Map experience ]                               │   3 versions · 1 req   │
│                                                   │                         │
│ ▸ Unmapped resume experiences                 2  │   Audit readiness       │
│                                                   │   1 version · not used │
└───────────────────────────────────────────────────┴─────────────────────────┘

Drag experience from right ───────────────► drop on a requirement

After drop or “Map experience”:

  Embedded-risk launch
  ☑ Built an embedded-risk process across 12 teams…
  ☐ Launched a risk program covering 12 teams…
  [ + Draft new version ]
```

Panel behavior:

- The panel has independent **experience search**, **role filter**, and usage filter: `All`, `Mapped here`, or `Not used yet`.
- “Mapped here” means at least one concrete version from the experience is mapped to at least one requirement on this posting. It is derived from stable entry ids.
- A mapped experience shows a small check and the number of distinct requirements it covers, for example `✓ · covers 2 requirements`. An experience is never marked mapped because its text resembles a requirement or another bullet.
- Clicking an experience highlights every requirement it covers and its mapped chips; clicking it again clears the highlight. It does not hide unrelated requirements or change their order.
- Highlighting temporarily opens a collapsed requirement/disclosure only when needed to reveal the mapped chip, marks it `Highlighted`, and restores its previous session-only state when cleared. The posting’s left scroll position does not jump.
- `+ New experience` is pinned at the top. `+ Draft new version` is available on the selected experience and in each panel-row action menu. A new version remains an independent bullet record.

Mapping behavior:

- Dragging an experience from the panel onto a requirement opens the inline version checklist shown above. The drop itself does **not** persist an abstract experience mapping; checking at least one concrete version creates the existing entry-based requirement link.
- `Map experience` under the requirement opens the same searchable list and is the keyboard, screen-reader, and mobile alternative. Every experience picker in the app uses this same experience-first search, role context, version count, and nested concrete-version selection.
- Checking a version maps that bullet’s stable id through the existing requirement bullet-link structure. Unchecking removes only that requirement link.
- The same experience—and the same concrete bullet version—may be mapped to several requirements on one posting, exactly as today. Mapping is many-to-many: each requirement can reference several versions/experiences, and each version/experience can cover several requirements.
- Unmapping a bullet from one requirement removes only that one requirement-line relationship. It must not remove the bullet from the posting resume, from the library/experience, or from any other requirement.
- `+ Draft new version` inside the inline chooser creates a new stable entry in that experience and checks it only after the draft has valid wording.
- The mapped result uses quiet chips such as `[Embedded-risk launch ✓]` and `[2 versions]`; chips supplement the full selected bullet text and are not primary buttons.
- The existing details panel still edits the selected bullet’s own job, STAR, notes, and tags. An experience title edit is separate.
- The picker clearly marks versions already mapped to this requirement or used on another requirement. It never deduplicates by wording.

Posting-resume multi-add is available from the posting page’s selected experience, the sticky side panel, and the posting resume editor’s Add from library:

```text
Embedded-risk launch                              2 of 3 on resume
☑ Built an embedded-risk process…                 Added
☑ Launched a risk program covering 12 teams…      Added
☐ Cut review time by embedding risk…

Add selected to:
Role          [ GoDaddy · Senior Manager       ▾ ]
Sub-heading   [ Risk programs                  ▾ ]
Order         [ End of Risk programs           ▾ ]
                                      [ Add 1 to resume ]
```

- Checkboxes represent concrete entry ids. A version already anywhere on this posting’s resume is checked and labelled `Added`; it is not queued again.
- The user must confirm a destination **role** and may choose a named **sub-heading** or the role’s unheaded group. The picker defaults to the version’s stable `jobId` when that role is already on the posting resume; otherwise it asks the user to add/choose a role.
- Order defaults to the end of the chosen sub-heading. The user may choose `Start of group` or `After <existing bullet>`. Newly added versions are contiguous in the picker’s displayed order; a confirmation list permits reordering before the write.
- From a resume row, Add from library defaults to that row’s role and sub-heading and inserts after that row. From the posting page or side panel, it defaults to the inferred role and end of group.
- `Add selected` is one atomic book mutation and one save/outbox snapshot. Before changing the posting resume, create the required bulk-operation recovery backup.
- Deduplicate only by stable entry id across every visible and excluded resume row (`sourceEntryIds` and any explicit local source link). Repeating the action is idempotent even after a retry, reload, 409 reconciliation, or two-tab merge.
- Removing one added resume row removes/hides only that concrete resume bullet placement. It does not uncheck, remove, relink, or rewrite sibling versions on the resume, in requirements, or in the experience.

On mobile, the posting’s experience panel is a slide-out drawer opened by the same small experience icon used on Resume bullets. Requirements remain full width behind it. Choosing or dragging is replaced by `Map to requirement…`, which closes the drawer into a full-width requirement/version sheet; closing or completing it returns to the same requirement and scroll offset.

### 3. Unmapped panel

The panel becomes **Unmapped resume experiences**. It counts experiences, not individual versions.

```text
▸ Unmapped resume experiences                              2

▾ Unmapped resume experiences                              2
  On this posting’s visible resume but not covered by a requirement.
  ◦ GoDaddy · Rebuilt access-review program       2 resume versions
  ◦ PwC · Controls automation                     1 resume version
```

Precise coverage rule:

1. Consider only included, visible posting-resume bullets after fit drops, exactly as today.
2. Resolve each resume bullet to a live library bullet by stable `sourceEntryIds`; then resolve its effective experience id.
3. An experience is **covered** when at least one requirement on this posting maps at least one live bullet version in that same experience.
4. If covered, all visible resume versions from that experience are treated as covered for the experience-level panel. The panel is answering “Have I connected this underlying work to a requirement?”, not “Did I map this exact sentence?”
5. A resume bullet with no live library link (fresh local text, an old imported resume line, or an unlinked snapshot copy) is its own synthetic one-bullet experience, keyed by the stable resume-bullet id. It is covered only by its existing stable line/source link; never by equal text.
6. Multiple visible versions from one uncovered experience produce one row with a version count. No text matching is allowed.

The expanded row lists every visible resume version with its own mapped/unmapped marker and may offer `Map to requirement…`. If one of three visible versions is mapped, the experience is covered and leaves the Unmapped list, while its detail can still say `1 of 3 versions directly mapped`. Requirement coverage still counts a requirement once even when several sibling versions map to it. Removing one resume version recalculates the count but cannot change sibling links. The collapsed Unmapped count remains experience-level.

### 4. Posting resume editor and preview

Each linked resume bullet gets a quiet version control. Swapping replaces the linked bullet in the same role, subgroup, order position, inclusion state, and pin state.

```text
☑ Include  ☐ Pin  [versions (3) ▾]              [↑] [↓] [Remove]
Built an embedded-risk process across 12 teams…
─────────────────────────────────────────────────────────────

versions (3)
  ● Built an embedded-risk process across 12 teams…
  ○ Launched a risk program covering 12 teams…
  ○ Cut control-review time by embedding risk…
```

- Choosing another version updates the stable library-bullet link; it does not create a duplicate resume row.
- Preserve the resume bullet row id where possible so fit state, drag order, pins, exclusions, focus, editor scroll, and preview scroll remain stable.
- The control may coexist on several resume rows from the same experience. It shows which versions are on this resume (`2 of 3 on resume`) and identifies the current row separately.
- If the destination version is already elsewhere on this same resume, mark it `Already on resume`, disable it as a swap destination, and offer `Go to existing bullet`; do not silently duplicate, merge, or remove either row.
- Swapping one row affects only that row. Other versions from the experience retain their placement, wording, include/pin state, and requirement mappings.
- The preview, Print/PDF, and Word output show only the selected wording. Experience titles and version controls are editor metadata and do not appear on the resume.
- The picker opens as a popover anchored to the current row and closes without a full-page jump. Reuse the existing scroll snapshot/restore path and add a focused regression test.

`Add from library` is grouped by role, then experience:

```text
[ Search resume bullets… ]
  Rebuilt access-review program (3)
    + Built an access-review program…
    + Cut quarterly review time…
  Controls automation (2)
    + Automated evidence collection…
```

Adding still selects concrete bullet versions, never an abstract experience. It supports the same checkbox multi-add, stable-id dedupe, role/sub-heading/order confirmation, and atomic placement rules as the posting side panel.

### 5. Mobile behavior

At the existing mobile breakpoint, the Resume bullets list keeps the full content width. The experience index becomes a slide-out drawer opened by a small experience icon in the list toolbar. The drawer contains the same `+ New experience`, search, role filter, selected state, and version counts as desktop; closing it returns focus to the opener and preserves list scroll.

```text
Resume bullets              [experiences icon]
[ Search bullets…                            ]
GO DADDY · SENIOR MANAGER
• Built an embedded-risk…      [↔ 2] [⋯]

                          ┌──────────────────────┐
                          │ EXPERIENCES      [×]│
                          │ [+ New experience]  │
                          │[Search experiences…]│
                          │[Role: All        ▾] │
                          │──────────────────────│
                          │Embedded-risk launch │
                          │          2 versions │
                          │Controls automation  │
                          │           1 version │
                          └──────────────────────┘
```

- Role and experience headers stack; no horizontal table scrolling is introduced.
- `Map experience`, version selection, move, and add-from-library open full-width sheets/popovers with search first and 44px touch targets.
- Drag-and-drop is not required on touch. `Move to experience` provides the full grouping flow in the drawer/sheet.
- Use small visible icons (`↔` versions, `⋯` actions, chevrons for disclosure) plus full `aria-label` text. Do not rely on icon meaning alone.
- Requirement rows keep the requirement above the mapped experiences, as the current responsive table does.
- Expanding versions preserves the focused row and scroll position. The posting resume stays editor-first; the preview remains below/behind its existing mobile disclosure.

### 6. First use with an existing book

There is no conversion wizard and no automatic grouping.

```text
Before feature                         First open after feature
• Built access reviews…                ▸ Built access reviews…      1 version
• Cut audit prep time…                 ▸ Cut audit prep time…       1 version
```

Each bullet is presented as an implicit one-bullet experience using its bullet id as the effective identity. The saved JSON is unchanged merely by opening the app. The first write happens only when the user explicitly groups, renames, moves, drafts, or ungroups. A short dismissible hint can say: “Have a few versions of the same work? Group them as an experience.” Dismissing the hint is local UI state, not a book mutation.

## Product definitions and invariants

- **Bullet / version:** the existing `entries[]` record. “Version” is a UI relationship, not a revision-history mechanism. Each version has independent wording, rich spans, STAR, notes, tags, job assignment, timestamps, and id.
- **Experience:** stable metadata that groups zero or more bullet ids through the bullets’ `experienceId` field. It has an id and editable title, but no canonical bullet text.
- **Implicit experience:** a bullet with no `experienceId`; its effective id is `entry:<entry.id>`, title is its current bullet title, and version count is one. It is derived and never persisted merely by reading.
- **Explicit experience:** an `experiences[]` record referenced by one or more bullets.
- **Resume selection:** always one concrete bullet/version, referenced by stable entry id. An experience is never rendered as resume content.
- No operation matches or joins bullets, experiences, jobs, requirements, or resume rows by text. Text may rank search results only.
- No experience operation edits or deletes a bullet. Bullet deletion remains an independent operation.
- Referential repair may clear an invalid experience relationship, but must preserve the bullet and report/recover the relationship.

## Data model decision

### Recommended additive shape

Keep the existing single JSONB book and add a small root collection plus a foreign-key-like field on entries:

```json
{
  "v": 4,
  "experiences": [
    {
      "id": "xp_...",
      "title": "Launched embedded-risk process",
      "createdAt": "2026-10-20T16:00:00.000Z",
      "updatedAt": "2026-10-20T16:00:00.000Z",
      "deletedAt": ""
    }
  ],
  "entries": [
    {
      "id": "en_existing_stable_id",
      "experienceId": "xp_...",
      "title": "Built an embedded-risk process across 12 teams",
      "...": "all existing bullet fields remain"
    }
  ]
}
```

This is not a new SQL table. `brag_books.payload` remains the only durable document, and normal API PUTs remain the only write path.

Why use both `experiences[]` and `entry.experienceId`:

- The experience needs stable identity and a renameable title independent of any version’s wording.
- The bullet owns the one-to-zero/one membership link, so moving one version is a one-record field change and no ordered `versionIds` list can become stale.
- A root experience record can be tombstoned and merged by id across tabs.
- Effective implicit experiences require no persisted metadata and therefore no rewrite of existing bullets.
- Requirement and resume links can continue to point at concrete entry ids; most existing data paths remain intact.

Rejected alternatives:

- **Only `experienceId` on bullets, no metadata record:** cannot rename an experience without choosing one bullet as accidental canonical metadata, and concurrent renames have nowhere safe to merge.
- **Only a separate record with `versionIds`:** creates a second source of truth, dangling ids, order conflicts, and a multi-record update for every move.
- **A SQL experiences table:** breaks the one-document atomic save/merge model, adds a second sync protocol, and is unnecessary for a light grouping layer.
- **Copying versions into an experience record:** rewrites bullet identity and risks losing STAR, requirement, resume, and snapshot links.

Normalization should accept missing `experiences` and missing `experienceId`, preserve only valid bounded strings, keep tombstones, and never create explicit records while reading. A dangling or tombstoned `experienceId` renders as an implicit experience and is surfaced to the recovery log/test diagnostics; it never causes an entry to be dropped.

## Complete bullet-reference inventory and required behavior

The implementation should use this as a checklist. A code search for `entries`, `entryId`, `entryIds`, `sourceEntryIds`, `sourceBulletIds`, requirement `bullets`, career `groups[].bullets`, and “resume bullet” must be repeated before implementation lands.

| Surface / current path | Current identity | Experience behavior |
|---|---|---|
| Resume bullets catalog (`experienceCatalog`, `experienceCatalogGroups`, `experienceTable`) | `entries[].id`, grouped by `jobId` | Group role → effective experience → versions. Search experience metadata and version fields. Existing entries remain implicit. |
| Resume-bullet row/detail, STAR, notes, tags, job selector (`experienceRow`, `sharedBulletForm`) | entry id | Fields remain per version. Add separate experience title/actions; changing a job does not infer identity from company/title. |
| Bulk add / `#experiences/new` (`parseExperiences`, `addEntries`) | new entry ids | Default to implicit experiences. Optional post-create multi-select grouping is a separate, backed-up action. Never auto-group equal lines. |
| Resume-bullet routes/deep links (`routes.js`, `#experiences/:entryId`, legacy `#log`/`#bullets`/`#brag`) | entry id allowlist | Keep entry-version deep links valid. An experience disclosure may open around the requested entry, but URLs continue to identify the concrete bullet. Add a separate experience route only if a stable group-detail page is later needed. |
| Resume-bullet search (`searchEntries`, posting picker, library picker) | entry records | Search experience title plus all existing entry fields; return grouped results but select concrete entry ids. |
| Posting requirements (`requirements[].bullets[].entryId`, `entryIds`) | requirement-line id + entry id | Keep concrete mapped versions in existing arrays. Preserve many-to-many mapping: the same entry id may have distinct line links on several requirements. Group display by effective experience. Do not add a second experience-only requirement mapping. |
| Requirement details and questions (`linkedEntries`, `linkedBulletLine`, `compilePrep`) | entry id | STAR/notes come from the checked version. Experience chip is context only. “Use experience” for an answer must require choosing a version when there are several. |
| Prep cue cards (`compilePrep`, posting prep view) | requirement line id + entry id | Show the chosen version and its STAR data. If several versions in one experience are mapped, keep them as separate cue-card evidence rather than merging their STAR fields. |
| Posting suggestions (`scoreEntry`, `suggestEntries`) | entry content/id | Rank at experience level using all versions, then show versions. Text affects rank only, never identity. |
| Coverage banner / prep counts (`prepCoverage`) | requirements with bullet lines | “Resume bullets” remains count of requirements with ≥1 mapped version. Experience grouping does not inflate it. |
| Unmapped panel (`postingRequirementResumeLinks`, `resumeBulletMappedToPostingRequirements`, `unmappedPostingResumeBullets`) | `sourceEntryIds`/`sourceBulletIds` | Replace output/count with effective-experience rows using the precise coverage rule above. No text fallback. |
| Posting resume editor (`resumeBulletEditor`) | resume bullet id, `sourceEntryIds` | Add in-place swap among entries sharing effective experience. Several siblings may coexist; swapping one row never changes another. Preserve row id/order/group/include/pin/fit state and scroll. |
| Add from library (`libraryBulletPicker`, `libraryBulletChoices`, `resumeTakenEntryIds`, `placeLibraryBullet`) | selected entry ids | Group choices by experience; checkbox-select one or several concrete versions, then place them atomically into an explicit role/sub-heading/order. Taken detection and idempotency are stable-id based. |
| Posting resume compilation (`compileResumeDoc`, projection/claim helpers) | entry/source ids, with legacy text fallbacks | Carry effective experience metadata for editor use only and union multiply mapped bullets by stable entry id so each appears once. New paths must use ids. Retain text fallback solely for reading genuinely old unlinked data; never use it to group, swap, dedupe, or claim a new experience relationship. |
| Resume preview and one-page fit (`renderResumeHtml`, `resume-fit.js`) | compiled bullet rows | No experience labels in output. Swaps preserve row id so drop/pin results stay attached; rerun fit and maintain existing pinned-overflow warnings. |
| Word / posting Print-PDF (`resume-docx.js`, preview print path) | compiled visible doc | Output selected wording only. No chips, experience titles, or alternate versions. |
| Resume basics (`#profile`, shared `jobs[].groups[].bullets`) | career bullet ids and `sourceEntryIds` | Resolve group from linked entry. Add-from-library is grouped by experience; optional version swap follows the same stable-row rule. Grouping bullets never changes basics content. |
| Replace/restore Resume basics (`basicsBackup`, `replaceBasicsWithPosting`, `restorePreviousBasics`) | structured jobs/bullets | Preserve entry links and optional experience provenance in the backup. Restore is exact and does not mutate experience records. |
| Posting-local jobs/bullets (`resume.localJobs`) | local resume bullet id, optional source entry | Linked rows derive experience; unlinked rows are synthetic one-version experiences. Adoption must preserve ids and provenance. |
| Starter resume (`starter-resume.js`, John Doe document) | local career/resume bullet ids without library entries | Keep starter lines synthetic. Merely viewing or seeding the in-memory starter must not create entries or explicit experiences, and must retain the existing “never PUT starter-only data” guarantee. |
| Saved resume creation (`freezeResumeSnapshot`) | immutable compiled document; source links currently stripped | Freeze selected text plus optional `sourceExperienceId` as non-rendering provenance. Never retain a live content dependency. Bump snapshot schema additively. |
| Saved resume bank/detail/print/Word | frozen snapshot doc | Remains immutable and visually unchanged. Experience renames, moves, deletes, and bullet edits do not alter old snapshots. |
| Start from saved resume (`postingVariantFromSnapshot`, `startPostingResumeFromSnapshot`) | new local job/group/bullet ids | Remap every row id as today. Copy `sourceExperienceId` only as provenance; do not restore `sourceEntryIds` automatically. Version control can offer live versions if that experience still exists, and selecting one explicitly creates the live entry link. |
| First-time posting chooser (basics/fresh/snapshot) | chosen resume variant | No choice is changed by the feature. Experience provenance follows the chosen source rules. |
| Old resume JSON import (`importResumeDoc`, `jobsFromResumeDoc`) | imported structured rows, usually no library ids | Imported bullets remain synthetic one-bullet experiences. Never auto-match imported text to an existing experience. Offer an explicit `Link/group` action later. |
| Full-book JSON export/import (`exportBookJsonText`, `parseExportedBookJson`, `normalizeStore`) | lossless normalized book | Include experience records, tombstones, memberships, provenance, and grouping backups. Old JSON imports become implicit. Round-trip equality tests must include mixed implicit/explicit data. |
| Full-book PDF/HTML (`buildBookExportDocument`) | entries, postings, basics, snapshots | Resume Bullets & STAR section prints role → experience → versions. Posting sections group checked versions under experience headings. Resume pages themselves remain unchanged. |
| Legacy requirement-only resume text/HTML (`compileResume`, `compileResumeText`, `compileResumeHtml`) | requirement entry ids plus historical text dedupe | Preserve compatibility output, but replace new dedupe decisions with stable entry ids. Equal wording from distinct ids must not establish shared experience identity. |
| Home (`listingSummary`, recent postings/activity) | entry/posting counts | Keep “resume bullets” as bullet count. If an experience count is shown, label it separately and count effective experiences. Grouping activity should update the touched experience/entries and posting activity only when mappings change. |
| Knowledge pages/search | independent `knowledge[]`; no entry link field exists today | Do not invent links. Knowledge remains independent and unchanged. If links are added later, use stable experience/entry ids, never titles. |
| Legacy wording recovery (`legacyVersions`) | historical text embedded on an entry | Do not treat these as selectable versions: they lack independent stable bullet ids and fields. A user may explicitly promote one into a new entry/version. Preserve server-side exactly as today. |
| Career cleanup / duplicate-role repair (`tidyResumeJobs`, catalog job resolution) | stable job and bullet ids, with legacy label inference | Experience work must not rerun cleanup or infer jobs/groups from text. Use the duplicate-role lesson: identity is ids; labels are display data. |
| Generic delete entry (`deleteEntry`) | entry id and requirement links; current code can leave career `sourceEntryIds` behind | If the last version is deleted, tombstone/retain empty experience metadata until an explicit cleanup action. Never delete sibling versions. Before shipping, define and test cleanup or an explicit warning for linked career/resume rows so stale source ids cannot masquerade as valid experience links. |
| Account-scoped browser cache (`accountStoreKey`) | full normalized book | Cache the additive fields. A cached old book normalizes to implicit experiences. Never upload the legacy unscoped cache automatically. |
| Durable outbox (`accountOutboxKey`, `resumeOutboxAfterBoot`) | full book + base + local version | Include experiences/memberships in base/local snapshots and three-way merge. Do not create a second experience-specific queue. |
| PWA service worker/offline shell | static shell only; `/api/*` excluded | Cache behavior remains network-first. Offline remains read-only, so no grouping/swap controls mutate while offline. Old cached JS is treated as an old client and protected server-side. |
| Server API / JSONB (`api/brag-book.js`, `lib/brag-book.js`) | guarded whole-book PUT, `rev`/legacy `updatedAt` | No route/table change. Normalize and preserve new fields through the existing API; direct database work is forbidden. |
| Account deletion | deletes whole `brag_books` row | No change; experiences live inside the same payload. |

## Mapping and resume semantics

### Requirement mapping

The requirement continues to own concrete version links. The UI may say “Map experience,” but persistence remains `req.bullets[].entryId` plus stable line ids. This avoids an abstract mapping that cannot say which wording and STAR data the user chose.

The same experience may be mapped to multiple requirements, and one requirement may map multiple versions from the same experience. `compilePrep` should preserve each selected version. Coverage counts the requirement once.

Requirement mapping and resume placement are independent many-to-many relationships. The generated posting resume must project each concrete library bullet at most once, keyed by stable entry id, even if five requirements map to it. Requirement-line ids remain distinct so each mapping can be removed independently; resume compilation unions mapped entry ids and never deduplicates by text. Unmapping one requirement does not remove an existing explicit resume placement and does not affect another requirement’s link.

### Version swap

Given resume row `R`, current entry `A`, and selected sibling entry `B`:

1. Verify `effectiveExperienceId(A) === effectiveExperienceId(B)` and both records exist.
2. Verify `B.id` is not already linked by another visible row in the same resume.
3. Keep `R.id`, job/group placement, bullet order, include/exclude, pin, and fit metadata.
4. Replace only the source entry link and project B’s current wording/rich spans.
5. Clear a stale posting wording override for R through the same explicit rules as “Reset to source”; never let A’s override shadow B.
6. Save as one book mutation, rerun compile/fit, and restore editor/preview/window scroll.

No operation searches by title/body to find A, B, R, a role, or a group.

## Compatibility and rollout safety

### Additive schema and old clients

Raise the book schema from 3 to 4 only when normalization, serialization, merge, and server preservation are ready. Missing fields mean implicit experiences. Unknown fields must never be required to render a bullet.

Current old clients normalize unknown root and entry fields away before PUT. Therefore server-side `preserveServerHistory` must be extended before any v4 writer ships:

- Capture the incoming raw schema value **before** `normalizeStore`: current normalization always rewrites `v` to the current constant, so checking `v` after normalization cannot distinguish an old client.
- If incoming `book.v < 4`, overlay the current server’s `experiences`, each matching entry’s `experienceId`, nested resume `sourceExperienceId` provenance, snapshot provenance, and grouping-recovery backups onto the incoming book by stable ids.
- Overlay entry membership only for entry ids still present in the incoming payload; an old client’s explicit bullet deletion must not resurrect that bullet.
- Preserve the old client’s legitimate edits to known bullet fields.
- If incoming `book.v >= 4`, respect explicit empty membership as ungrouping; do not “restore” it.
- Keep the existing protection for `legacyVersions` and immutable resume snapshots.
- Add mixed-client tests: v4 write → v3 edit/save → v4 reload must retain every grouping relationship and all v3 edits.

Deploy order: server preservation first; new model readers second; UI writers last. A service-worker-cached old shell is therefore safe.

### Old imports and existing snapshots

- Old full-book JSON with no experiences imports unchanged and derives one implicit experience per entry.
- Old classic resume JSON has no library identity and remains synthetic; no text matching.
- Snapshot schema 1 remains readable. Missing provenance means a synthetic one-version row.
- Snapshot schema 2 may add `sourceExperienceId` and frozen experience title as provenance. Snapshot rendering is still based entirely on frozen text.
- Existing and new snapshots are immutable. Grouping, renaming, moving, deleting, or editing live records cannot mutate them.
- Starting from a snapshot still creates new posting-local ids and auto-backs up the current posting resume before replacement.

## Sync, conflict, offline, and data-loss analysis

### Existing guarantees retained

- One guarded JSONB row per user.
- Numeric `rev` is the primary optimistic-concurrency guard; timestamp guard remains for legacy clients; unguarded existing-row writes receive 428.
- One single-flight save queue, account-scoped durable outbox, and base/local/remote three-way reconciliation.
- Offline editor is read-only; an already queued/in-flight save remains in the outbox and retries on reconnect.
- Focus/visibility refresh does not overwrite unsaved local edits.

### Required merge changes

Add `experiences` and grouping backups to the id-keyed list merge. Experience records need field-level three-way merge for title, timestamps, and tombstone state rather than the current timestamp-winner whole-record strategy used for jobs/postings. Add `experienceId` to field-level entry merging. Add nested provenance preservation to resume/snapshot merge paths.

Current code still has text-based compatibility paths: bulk paste deduplicates lowercased titles; the posting adder can reuse an exact lowercased title; canonical migration and resume claiming can fall back to full text or a unique long lead; `resumeTakenEntryIds` can treat equal text as already placed; and the legacy requirement-only compiler deduplicates text. Those paths may remain narrowly for old unlinked data, but experience creation, mapping, coverage, moving, swapping, and duplicate prevention must bypass them and use stable ids. Add collision fixtures for every fallback so no new relationship is inferred from equal text.

Conflict cases and expected outcomes:

| Concurrent case | Required result |
|---|---|
| Tab A edits bullet text; Tab B renames its experience | Merge both fields; no conflict. |
| Tab A edits STAR; Tab B moves the bullet | Merge STAR and membership; no conflict. |
| Both tabs rename the same experience differently | Record a field conflict, keep both values in conflict/recovery state, show local text until resolved, and do not auto-retry over it. |
| Both tabs move the same bullet to different experiences | Record an `entries.experienceId` conflict. Keep the bullet content; require a membership choice. Both experience records remain. |
| Tab A ungroups; Tab B edits wording | Merge ungrouping and wording because only one side changed each field. |
| Tab A tombstones an experience; Tab B adds/moves a bullet into it | Keep every bullet; tombstone wins for the label, assignment is repaired to implicit/unassigned and logged as a conflict/recovery item. Never drop the new bullet. |
| Both tabs draft a version | Both new entry ids survive; deterministic list order is local then remote as in the existing id-list merge. |
| Tab A multi-adds versions A/B; Tab B multi-adds B/C to the same posting resume | Reconcile nested resume bullets by stable source entry id so A/B/C each appear exactly once. Preserve non-conflicting placement; if B has conflicting destinations, retain one B and require a placement choice rather than duplicate or drop it. |
| Offline/in-flight save reconnects after remote grouping | Merge from the recorded outbox base, preserve both independent changes, retry only when conflict-free. |
| Old client saves after v4 grouping | Server preservation restores unknown v4 metadata by stable ids while retaining old-client edits. |

Tombstones are required because removing an experience record from one tab otherwise looks like “missing data” and can be resurrected by another. Tombstones can be compacted only by a later, separately designed maintenance operation after all references and recovery windows are clear.

### Delete, ungroup, and move

- **Delete bullet:** existing destructive operation; removes that entry and its requirement links. It must not cascade to sibling versions. Resume links receive the existing explicit warning/repair behavior.
- **Ungroup bullet:** set only that entry’s `experienceId` to empty.
- **Ungroup experience:** create a grouping backup, clear `experienceId` on every currently linked entry by stable id, and tombstone metadata. Do not touch content or external entry links.
- **Move bullet:** set one entry’s `experienceId` after validating destination id. The source experience may become empty but is not silently deleted.
- **Rename experience:** update only metadata title/`updatedAt`.
- **Delete empty experience:** tombstone metadata only.

Every operation should return an explicit change set in tests (`changedEntryIds`, `changedExperienceIds`) so accidental bullet-field mutation is detectable.

## Recovery backup before bulk operations

Before `Group selected`, `Ungroup all`, bulk move, posting-resume multi-add, restore-grouping, or any future automatic grouping, create a bounded recovery record with:

- stable backup id, operation kind, timestamp, and affected ids;
- the pre-operation experience metadata records;
- `{ entryId, experienceId }` membership for all affected entries;
- no copied bullet wording/STAR payload, because those fields are not changed by grouping.

For posting-resume multi-add, the recovery record instead captures the affected posting’s pre-operation resume variant, placement maps, and fit metadata. It does not copy or rewrite library bullet content. Restore returns that posting resume to its prior placements and first creates another recovery record.

Keep at least the latest five operation backups and merge them by backup id. `Restore grouping` restores relationships only and first creates another backup, making undo itself reversible. A full-book import/replace must continue to require the existing JSON export/recovery flow and must not be smuggled into a grouping operation.

This focused backup is smaller and safer than recursively embedding whole-book copies. Full-book JSON export remains the lossless user-controlled backup.

## Why the design does not lose or version bullet data

The design’s proof obligations are structural and testable:

1. A version is still an entry with the same stable id and all existing fields.
2. Grouping changes only `entry.experienceId` and experience metadata.
3. No read-time migration writes data.
4. No group record owns or copies bullet content.
5. Requirements and resumes continue to select concrete entry ids.
6. Saved resumes freeze visible text and never read live content to render.
7. Every bulk relationship change has a bounded pre-operation recovery snapshot.
8. Revision guards reject stale whole-book writes; field/id-aware merge retains independent changes.
9. Old-client saves are recognized by schema version and cannot strip new metadata.
10. Invalid relationships degrade to an implicit one-bullet experience; normalization never drops the bullet.

These are design claims until the shipping-gate tests below pass. The feature must not be described as data-safe in release notes before those tests are green against mixed old/new fixtures.

## Implementation phases and small commits

Each phase should be one or a few reviewable commits; avoid combining model, sync, and UI changes in one commit.

1. **Safety fixtures and preservation**
   - Commit representative schema-3 books, old exports, schema-1 snapshots, duplicate wording, duplicate role labels, two-tab bases, and outbox fixtures.
   - Add server preservation for future v4 fields while UI remains unchanged.
   - Add mixed-client and round-trip tests.
2. **Pure experience model**
   - Add normalization, effective implicit ids, lookup/group helpers, tombstones, immutable group/move/ungroup operations, and recovery backups.
   - Add `experienceId` to field-aware entry merge and `experiences`/backups to id-list merge.
   - No UI behavior yet.
3. **Read-only grouped catalog**
   - Render the Resume bullets and posting two-panel layouts, independent sticky-panel scrolling, role/usage filters, selection/highlighting, collapsed-group restoration, and grouped search, initially behind a local feature flag.
   - Existing implicit data must produce the same visible bullet order/content.
4. **Catalog mutations**
   - Add create, rename, group, ungroup, move, draft-version, and restore-grouping controls.
   - Enable writes only after backup and sync tests pass.
5. **Posting requirement mapping**
   - Add the posting experience side panel, requirement drop targets, experience picker, version checkboxes, draft version, chips, mapped/unused counts, and grouped prep/export output.
   - Keep requirement persistence entry-based.
6. **Experience-level unmapped panel**
   - Implement the exact coverage rule and stable-id-only derivation.
7. **Resume editor**
   - Add checkbox multi-add with explicit role/sub-heading/order placement, grouped library picker, and in-place version swap with stable-id dedupe, override reset, fit, focus, and scroll guarantees.
   - Apply to posting resumes and Resume basics where linked.
8. **Snapshots/import/export/recovery**
   - Add snapshot provenance schema 2, start-from-snapshot behavior, full-book JSON/PDF grouping, and restore UI.
9. **Mobile, accessibility, PWA rollout**
   - Full-width pickers, icon labels, keyboard/focus behavior, offline disabled controls, and cached-old-client checks.
   - Roll out behind a book/UI capability flag, then remove the flag only after telemetry-free manual checks and all pure tests pass.

No phase requires direct SQL or a new API route.

## Test plan and shipping gates

### Pure model and invariant tests

- Existing schema-3 fixture normalizes with byte-equivalent bullet ids/content and zero persisted experiences.
- `effectiveExperienceId` is stable for implicit and explicit records.
- Group/rename/move/ungroup/restore never change entry fields other than `experienceId`.
- Ungroup/delete experience never deletes entries, requirement links, resume rows, STAR, notes, tags, rich spans, or legacy versions.
- Duplicate text produces distinct implicit experiences; grouping happens only by id.
- Moving the last version leaves safe empty/tombstoned metadata.
- Dangling/tombstoned relationships degrade to implicit without dropping entries.
- Backup is created before every bulk operation and restore is reversible.

### Mapping and coverage tests

- Requirement picker maps one or several concrete versions.
- The same stable bullet id maps to two or more requirements, each mapping renders and can be removed independently, and the side panel reports the correct distinct `covers N requirements` count.
- Posting resume compilation includes a multiply mapped bullet exactly once by stable entry id, even when requirement wording and line ids differ.
- Unmapping from one requirement leaves the resume placement and every other requirement mapping intact.
- One mapped sibling covers the experience in the experience-level unmapped panel.
- Two visible uncovered siblings produce one unmapped row and correct version count.
- Several visible siblings with one directly mapped version leave the experience-level Unmapped list while detail reports the exact directly mapped fraction.
- Fit-dropped, excluded, and empty bullets stay excluded as today.
- Unlinked local/import/snapshot bullets are synthetic and never covered by equal text.
- Prep and coverage counts do not inflate when several versions from one experience are mapped.

### Resume tests

- Swap keeps resume row id, job, group, order, include, pin, fit/drop identity, and rich formatting.
- Swap clears/handles stale overrides and preview/Word/PDF show the newly selected wording.
- Swap to an already-present version is blocked by stable entry id.
- Several sibling versions can coexist; swapping or removing one leaves every other sibling unchanged.
- Multi-add places selected versions contiguously in the confirmed role/sub-heading/order and preserves checklist order.
- Repeating identical multi-add is idempotent: already-present stable entry ids stay checked/`Added`, and no source entry appears twice, including excluded rows.
- Removing one multi-added version leaves its siblings, requirement mappings, and experience membership unchanged.
- Resume basics and posting-local overlays remain isolated.
- Duplicate company/title roles are never collapsed or duplicated by text; extend `test-brag-book-duplicate-role.mjs`.
- Editor/window/preview scroll remain stable; extend the existing resume-scroll test.

### Snapshot, import, and export tests

- Schema-1 snapshots render unchanged.
- Schema-2 snapshot provenance does not alter frozen rendering.
- A live rename/edit/delete cannot change an old snapshot’s HTML, Word model, or layout signature.
- Start-from-snapshot remaps row ids, preserves provenance only, leaves source snapshot/basics unchanged, and auto-backs up the overwritten posting.
- Old resume JSON creates synthetic experiences without text matching.
- Full-book JSON round-trips mixed implicit/explicit/tombstoned experiences and backups exactly.
- Full-book PDF groups library and posting sections while resume pages stay unchanged.

### Mandatory sync-safety tests

These must pass before any UI writer is enabled:

- v4 grouping → simulated v3 normalize/edit/save → v4 reload retains grouping and v3 bullet edit.
- Two-tab text-edit + rename merge.
- STAR-edit + move merge.
- rename/rename conflict retains both values for resolution.
- move/move conflict never drops or duplicates the bullet.
- ungroup + wording edit merge.
- tombstone + concurrent new version preserves the version as implicit and reports recovery.
- simultaneous drafts preserve both ids.
- Multi-add A/B followed by the same multi-add after retry/reload still yields exactly one placement per stable entry id.
- Two tabs multi-add overlapping sets (A/B and B/C) to one posting resume; merge/retry yields A/B/C once each, or one explicit placement conflict for B, with no lost or duplicated version.
- Two tabs remove one sibling and add another; the untouched sibling placement survives unchanged.
- Two tabs add/remove different requirement mappings for the same bullet; reconciliation preserves independent mappings, resume compilation still emits one stable-id bullet, and removing one mapping cannot erase the other.
- in-flight save plus a second local edit drains in order.
- reconnect merges account-scoped outbox against its recorded base and retries only when conflict-free.
- 409, 428, stale timestamp client, numeric revision client, and server history preservation all retain experiences, snapshots, and `legacyVersions`.
- offline controls are read-only; mid-save outbox remains and flushes on reconnect.
- cache quota/write failure leaves durable outbox behavior and user warning unchanged.
- empty-overwrite guard treats books with experiences/backups consistently without considering empty metadata a substitute for real content.

### Existing regression suite

Run every `scripts/test-brag-book*.mjs` test, especially canonical wording, save/current save, rich text, duplicate role, experience groups, export, snapshots/start-from-snapshot/chooser, unmapped resume/panel, resume scroll, drag DOM, mobile lock, PWA, and PWA sync guarantees. Also run `node scripts/test-public-imports.mjs`.

No browser automation is required. Manual responsive review may happen later, but it is not a substitute for the pure sync and identity tests.

Add DOM-level tests for both two-panel views: independent side-panel/left scroll, click-again clearing, left-search intersection, temporary role/requirement expansion and collapse restoration, mapped/unused counts, stable-id drag payloads, keyboard `Move/Map experience` alternatives, drawer focus return, and no scroll jump after multi-add.

## Documentation and naming follow-up

The code currently uses “experience” for an entry/bullet in many function and CSS names. Implementation should avoid a risky all-at-once rename. Introduce precise helpers such as `effectiveExperienceId`, `experienceVersions`, and `moveEntryToExperience`, then gradually reserve:

- `entry` or `bullet` for the persistent version record;
- `experience` for the new grouping metadata;
- `resumeBullet` for a compiled/editor resume row.

Shared grouping, identity, and coverage helpers belong in dependency-free `brag-book/engine.js` (or one new browser-safe module imported by it and tests), not duplicated in `app.js`, export, and resume code.

After implementation, update root `README.md`, `AGENTS.md`, and `CURSOR.md` if present with durable architecture and test commands. Do not add branch-specific notes. This planning PR does not change those files because it changes no app behavior.

## Open questions for the user

1. Should one experience be allowed to contain versions assigned to different jobs? The recommendation is “not by default”; require confirmation and keep each version’s job unchanged.
2. When drafting a new version, should copying STAR/notes from an existing version be opt-in (recommended) or automatic?
3. Should mapping any sibling mark the entire experience covered in the Unmapped panel? This plan says yes, while still showing exactly which versions are checked under each requirement.
4. Should an empty named experience remain available in pickers, or be hidden until it has a version? The recommendation is to hide empty/tombstoned records and never persist a cancelled empty creation.
5. Should version swapping also be exposed in Resume basics in the first release, or only posting resumes? The data model supports both; posting resumes are the required first path.
6. Should full-book PDF print every version under an experience (recommended for a complete book) or only a designated preferred version? This plan does not add a preferred-version field.
7. How long should grouping backups be retained? The recommendation is the latest five, bounded by the existing 1.5 MB book limit.
