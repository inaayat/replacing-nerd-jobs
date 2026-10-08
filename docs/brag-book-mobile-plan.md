# Brag Book mobile audit and implementation plan

Status: implemented (excluding approval-gated touch B/I bar, new reorder UI,
and drag auto-scroll). Save/conflict/storage behavior unchanged.

Target: phones around 360–430px, tablets below 1024px, and coarse-pointer
devices. Desktop at 1024px and wider with a fine pointer must remain
pixel-identical and behavior-identical.

## Non-negotiable guardrails

1. Put layout changes in existing or additive `max-width` queries. New
   tablet-wide changes must stop at `1023px`; do not change base desktop rules.
   Put touch ergonomics in `(pointer: coarse)` or
   `(pointer: coarse) and (max-width: 1023px)` queries.
2. Do not replace, remove, reorder, or rename existing DOM. Add classes only
   when CSS cannot target the existing structure. Existing route, drag, rich
   text, resume compile, preview, export, and save tests depend on that DOM.
3. Do not touch `saveStore`, `flushSave`, `performCloudSave`,
   `save-controller.js`, `store.js`, `mergeBook`, API code, outbox/cache keys,
   lifecycle listeners, or conflict resolution. Mobile work is layout and
   additive interaction only.
4. Preserve `.bb-star-stack` as one full-width, single-column stack with thin
   horizontal dividers. Keep `align-items: stretch`, `width: 100%`, segment and
   textarea `width: 100%`, and the full-width
   `.experience-editor .bb-shared-bullet`. Never restore a 2×2 STAR grid.
5. Keep all desktop controls and shortcuts. Do not hide functionality in a
   mobile-only menu unless every action remains reachable and the desktop DOM
   is unchanged.
6. Use CSS/source/jsdom tests only. Do not use browser automation, Computer
   Use, live data, or a database.

## Ranked audit findings

### P0 — prevents comfortable use

1. **iOS focus zoom remains possible.** Many generic `.field` controls,
   posting requirement fields, auth fields, search inputs, resume rich lines,
   and question controls are 13–14px and are not in the current
   `(pointer: coarse)` 16px list.
2. **The top navigation does not fit a phone.** Seven links wrap unpredictably,
   have text-sized hit areas, and can make the sticky header tall. No route may
   disappear: Start, Job postings, Resume, Resume bullets, Knowledge, Projects,
   and Log in/out must all remain available.
3. **Posting tables are touch-dense.** The existing `860px` card conversion is
   structurally correct, but `.icon-quiet` is 22px, `.compact-action` is 26px,
   `.question-add .btn` is 28px, and requirement/experience controls are below
   16px.
4. **Resume editor and preview compete for space.** Between 861 and 1023px they
   remain side by side. On phones the editor has its own viewport-height
   scroll, creating a nested scroll before the scaled preview. The 8.5in
   preview frame is safe only if its wrapper remains width-constrained and
   `scaleResumeFrame` is allowed to run after every resize.
5. **Critical action bars are too dense.** Resume import/export/reset actions,
   conflict actions, posting header actions, and book search/add controls wrap
   into small adjacent targets.

### P1 — feature-specific friction

6. **Resume bullets are usable but too dense.** `.bb-exp-row` stacks only below
   980px, the Jobs catalog remains two columns down to 720px, and search/add
   controls compete for one row. The full-width STAR fix in `7591179` must be
   locked while these containers stack.
7. **Knowledge shows the entire page list above the editor.** At `860px` it
   becomes one column, but a long list can push the sheet well below the fold.
   The existing Bold/Italic/heading/list toolbar wraps into undersized targets.
8. **Touch targets are inconsistent.** Nav links, book tabs, order arrows,
   fold buttons, details buttons, quiet row icons, formatting buttons, and
   compact actions are generally below 44px.
9. **Hover communicates editability in several places.** Critical actions are
   not hover-only, which is good, but `.table-req-text` and some card/fold
   affordances need persistent or `:focus`/`:active` feedback on no-hover
   devices.
10. **The fixed resume preview needs an explicit mobile contract.** It already
    scales, but there is no unit test for its scale floor/cap, wrapper height,
    or the 360/390/430px cases.

### P2 — lower-risk polish

11. Start and recent-item cards already collapse, but import/export buttons
    need coarse-pointer sizing.
12. Prep cue cards have Previous/Next controls and therefore do not require
    keyboard gestures; the keyboard hint should not be the only instruction on
    touch.
13. Projects is an intentional link to `/#projects`, not a Brag Book hash
    route. It still needs the same nav hit area and must remain visible.
14. Native `confirm()` dialogs need no custom mobile modal. There is no custom
    modal in Brag Book to resize.
15. Word export uses an ordinary `.docx` download and should remain unchanged.
    Print/PDF uses the iframe print dialog with an HTML-download fallback; the
    action must remain available and its status copy must wrap.

## Prescriptive implementation sequence

The implementation model should make the following changes in one commit.
Each numbered item includes its acceptance test.

### 1. Lock the current desktop before changing CSS

Files:

- Keep `scripts/test-brag-book-mobile-desktop-lock.mjs` green.
- Extend it only when an additive class is unavoidable.
- Do not weaken exact desktop declarations to make a mobile test pass.

The lock covers nav order, route hashes, desktop grids, posting table markup,
resume editor/preview DOM, Knowledge list/editor DOM, full-width STAR stacks,
thin STAR dividers, native and pointer drag paths, exports, and save lifecycle
hooks.

Acceptance:

- At source level, current base rules for `.layout`, `.start-grid`,
  `.job-table`, `.bb-resume-split`, `.bb-resume-preview`, `.bb-resume-frame`,
  `.bb-exp-row`, `.bb-star-stack`, `.bb-kb`, and
  `.bb-job-catalog-row` remain unchanged.
- Static nav link order and every hash route remain unchanged.
- All nine commands in the verification matrix pass.

### 2. Add a responsive foundation without changing desktop

File: `brag-book/app.css`.

- Append mobile overrides rather than editing base declarations.
- Use `@media (max-width: 1023px)` for tablet layout only where the current
  861–1023 layout is cramped.
- Continue using the existing 860/720/620 breakpoints for phone layout.
- Give `.shell`, `.panel`, `.panel-head`, `.actions`, grid children, table
  cells, and editor columns `min-width: 0` only inside narrow queries when
  needed.
- Constrain page-level overflow: containers may scroll internally where
  called out below, but `html`, `body`, `.shell`, and `#app` must not gain a
  horizontal scrollbar.
- Preserve safe-area padding already on `.nav`, `.shell`, and `.legal`.

Acceptance:

- Source test proves new layout declarations live inside `max-width: 1023px`
  or narrower queries.
- At 360, 390, 430, 768, and 1023 CSS contracts, no child requires a minimum
  inline size wider than its container.
- Desktop-lock test proves no base rule changed.

### 3. Make nav, toolbar, auth, and shared status chrome fit

Files: `brag-book/app.css`; use existing markup in `brag-book/index.html`,
`brag-book/auth.js`, and `brag-book/app.js`.

- At `max-width: 860px`, make `.nav` a stable brand row plus a second
  `.nav-links` strip. Keep all seven links in their current DOM order.
- Let `.nav-links` scroll horizontally inside itself (`overflow-x: auto`,
  `max-width: 100%`, children `flex: none`) rather than causing page overflow.
  Keep the active underline.
- Under `(pointer: coarse)`, make `.nav-links a`, `.bb-book-tab`,
  `.bb-auth-tab`, and actionable status/conflict buttons at least 44px high.
- Make `.panel-head` and its `.actions` stack or wrap at phone width. Use
  `width: 100%` on the action group only in the narrow query.
- Ensure `.status`, `#status-note`, and `.legal` wrap long save/conflict text;
  conflict buttons remain adjacent only when each still has a 44px target.
- Keep the signed-out `.bb-gate-card` within the shell and make `.bb-input`
  16px on coarse pointers.

Acceptance:

- Every nav link remains present and tappable; only `.nav-links` may scroll
  horizontally.
- Signed-in and signed-out nav labels remain Log out / Log in as controlled by
  `wireAuthLink`.
- A conflict message and both “Keep my edits” / “Use saved copy” actions fit
  at 360px without page overflow.
- No save or auth JavaScript changes are required.

### 4. Cover every focusable text control against iOS zoom

File: `brag-book/app.css`, existing `@media (pointer: coarse)` block.

Add 16px font size for the omitted editable families:

- `.field input`, `.field textarea`, `.field select`, `.search`, `.bb-input`
- `.table-req-text`, `.bullet-copy`, `.experience-compose`
- `.requirement-questions input`, `.requirement-questions textarea`
- `.question-add-input`, `.table-add-input`, `.req-text`, `.resume`
- `.field .bb-rb-line`, `.field .bb-addl-items`
- existing Job, STAR, Knowledge, and Shared experience selectors

Do not change their base 13/14px desktop type.

Acceptance:

- A CSS source assertion enumerates the selector families in the coarse block.
- Base desktop font assertions remain 13px/14px as currently locked.
- Every editable control rendered by Start/import, new posting, posting
  requirements/questions/experiences, Resume, Resume bullets, Knowledge, and
  auth resolves to at least 16px on coarse pointers.

### 5. Start, Job postings list, and new-posting form

File: `brag-book/app.css`; existing DOM from `homeView`, `jobList`, and
`jobForm` in `brag-book/app.js`.

- Keep `.start-grid`, `.plot-cards`, and recent sections as one-column phone
  cards; make whole card buttons retain a 44px minimum target.
- Wrap the Start import/export actions to full-width buttons only at phone
  width.
- Keep `.layout` one column below 860px. Do not remove the posting list; cap
  its height only if needed and make the list itself scroll.
- Keep `.grid-2` / `.grid-3` one column below 860px and make paste textareas
  width-safe.
- Make New posting primary/cancel buttons 44px on coarse pointers.

Acceptance:

- Start cards, recent postings, recent bullets, and recent Knowledge remain
  reachable.
- Export, Import book, Import resume JSON, and legacy backup remain present.
- New posting fields and its parsed requirements flow are unchanged; no page
  horizontal scroll at 360px.

### 6. Posting workspace, requirements, questions, and Shared experience

File: `brag-book/app.css`; retain functions `jobDetail`,
`requirementTable`, `requirementTableRow`, `requirementQuestions`,
`experienceAdder`, and `experienceEditor` in `brag-book/app.js`.

- Keep the existing desktop `<table class="job-table">` and the current
  `max-width: 860px` block/card conversion. Do not replace the table DOM.
- In card mode, remove row side margins that consume scarce width, set every
  table/block child to `min-width: 0`, and retain `data-label` pseudo-headings.
- Under coarse pointer, enlarge `.icon-quiet`, `.bullet-open`,
  `.row-text-action`, `.question-add .btn`, `.compact-action`, and posting
  header buttons to a 44px hit box without changing desktop dimensions.
- Keep `.experience-matches` inside its containing width and vertically
  scrollable when the keyboard reduces available height.
- Preserve `.experience-editor .bb-shared-bullet`,
  `.experience-star.bb-star-stack`, the full-width Job select, and the
  full-width one-column Situation → Result stack. Notes and destructive
  actions follow below it.
- Keep Job details and Paste more requirements as native `<details>`; make
  summaries 44px on coarse pointer.

Acceptance:

- Desktop still renders the same two-column posting table.
- At phone width, each requirement is a card with Requirement and Experiences
  labels; questions, bullet Details, add/search experience, and delete actions
  all remain reachable.
- Shared experience Job and STAR stack have equal full width, four ordered
  fields, thin dividers, and no 2×2 grid.
- Existing STAR layout regression and save suites pass unchanged.

### 7. Prep cue cards

File: `brag-book/app.css`; keep `prepView` and its keyboard listener in
`brag-book/app.js`.

- Make `.prep-nav` sticky only if it does not cover content; otherwise use a
  full-width two-button row at phone width.
- Give Previous, Next, Edit in the table, and Back to posting 44px targets on
  coarse pointer.
- Preserve Arrow / j / k desktop shortcuts and all card content.
- In CSS, hide or reword the keyboard-only hint on coarse pointers only; do not
  remove it from desktop DOM.

Acceptance:

- A phone user can walk every card using Previous/Next without a keyboard.
- Desktop keyboard navigation remains covered by the existing tests/source
  contract.

### 8. Resume basics and posting Resume editor

Files: `brag-book/app.css`; preserve `resumeWorkspace`, `resumeEditorPane`,
`resumePreviewPane`, `refreshResumePreview`, `scaleResumeFrame`,
`exportResumePdf`, and `exportResumeDocx` in `brag-book/app.js`.

- At `max-width: 1023px`, stack `.bb-resume-split` to one column and make
  `.bb-resume-preview` non-sticky. This must not affect 1024px.
- At `max-width: 860px`, remove the nested viewport scroll from
  `.bb-resume-editor` (`max-height: none; overflow: visible`) so editor and
  preview share page scroll.
- Keep `.bb-resume-preview-wrap` width/max-width/min-width constrained and
  `overflow: hidden`. Never change `.bb-resume-frame` from 8.5in × 11in;
  `scaleResumeFrame` owns its visual scale.
- Keep the existing resize listener. Extracting pure scale math into
  `resume-fit.js` is allowed only if behavior is byte-for-byte equivalent and
  tests cover 320/360/390/430/816/900px widths.
- On phone width, make resume header actions wrap as full-width or paired
  buttons, with Print/PDF and Download Word prominent but with every existing
  Import/Replace/Restore/Start fresh/Reset/Back action still present.
- Enlarge checkboxes, role-fold controls, order arrows, drag handles, Delete,
  and add-row controls only under coarse pointer.
- Keep plain-text copy/download disclosure and all its actions.

Acceptance:

- No horizontal page scroll; the preview is fully contained and scales to its
  wrapper.
- A 1024px fine-pointer viewport retains the current side-by-side editor and
  preview.
- DOCX still downloads through `resumeDocxBlob`; Print/PDF still invokes the
  iframe print path and fallback. No export JavaScript behavior changes.
- Include/Pin, role collapse, add/delete, sub-heading, preview-to-editor focus,
  one-page fit warnings, and posting-local/shared distinctions remain intact.

### 9. Resume drag and sub-heading reorder: preserve both existing paths

Files: CSS only in the approved implementation. Do not change
`bindResumeRowDrag`, `commitResumeRowDrag`, `applyResumeDrag`, or
`resume-model.js`.

- Keep desktop HTML5 `dragstart/dragover/drop/dragend`.
- Keep the existing pointer path
  `pointerdown/pointermove/pointerup/pointercancel`, pointer capture,
  `touch-action: none`, and blocked drag from form/contenteditable elements.
- Keep coarse `.bb-drag-handle` at least 44×44 and enlarge the existing ↑/↓
  controls to 44px. These arrows are the current non-drag fallback.
- Do not add auto-scroll, a move menu, or new reorder buttons without product
  approval (see approval gates).

Acceptance:

- `scripts/test-brag-book-drag-dom.mjs` remains 24/24 for basics/posting and
  native/pointer modes.
- Dragging from text fields still does nothing.
- Compiled preview and DOCX order still follow persisted drag order.

### 10. Resume bullets, Jobs cards, compact STAR, and search

File: `brag-book/app.css`; preserve `experienceTools`,
`jobCatalogSection`, `experienceRow`, `sharedBulletForm`, and `fitArea`.

- At `max-width: 1023px`, stack `.bb-exp-row` to one column; at phone width,
  make `.bb-exp-tools` search and Add button stack full width.
- At `max-width: 860px`, use one column for `.bb-job-catalog-row` and
  `.bb-new-job`; do not wait until 720px.
- Keep Jobs labels, wrapping Title textarea, On resume action, and delete
  controls.
- Keep `.bb-exp-lead` followed by `.bb-exp-stargrid.bb-star-stack`. The STAR
  container and every segment/textarea stay `width: 100%` with thin dividers.
- Keep Shared experience behavior identical to item 6.
- Preserve search focus/caret capture and `fitArea` auto-height. Do not alter
  model writes or debounce/save calls.

Acceptance:

- Jobs cards, Resume bullet cards, Notes & tags, and Add resume bullet have no
  horizontal overflow at 360–430px.
- At 1024px the current desktop card layout is unchanged.
- Situation, Task, Action, and Result remain full width in both Resume bullets
  and Shared experience; `test-brag-book-bugbash-star-layout.mjs` passes.

### 11. Knowledge page list, sheet editor, and toolbar

File: `brag-book/app.css`; preserve `knowledgeWorkspace`,
`knowledgeEditor`, Knowledge document conversion/paste functions, and save
effects.

- Keep `.bb-kb` two columns on desktop and one column below 860px.
- In the one-column layout, cap `.bb-kb-list` to a reasonable phone viewport
  height (approximately 28–35dvh) and use internal vertical scroll, so the
  sheet remains nearby without hiding any page.
- Keep search and New page visible at the top of the list.
- Reduce only mobile sheet margins/padding; retain the white sheet,
  7px radius, outline, and shadow.
- Let `.bb-kb-editor-bar` wrap, and make existing Bold, Italic, H1–H3, bullet,
  and status controls at least 44px on coarse pointer.
- Do not re-render the document while typing; do not alter
  `knowledgeMarkShortcut`, paste conversion, markdown-line conversion, or
  debounced merge-safe save.

Acceptance:

- The page list, search, New page, title, editor, all formatting controls, and
  save status remain reachable at 360px.
- Older body-only notes still open; typing/paste/format behavior remains
  covered by `scripts/test-brag-book.mjs`.
- Desktop Knowledge two-column layout and sheet styling remain locked.

### 12. Projects, hover states, and download affordances

Files: `brag-book/app.css`; no route change.

- Keep Projects as `<a href="/#projects">Projects</a>` in the nav.
- In `@media (hover: none)`, make editable/clickable state visible with
  persistent borders or `:focus`/`:active` rules for `.table-req-text`,
  `.bullet-link`, `.bb-job-fold`, and quiet icon buttons. Do not expose or hide
  actions based only on hover.
- Keep all download controls ordinary buttons triggered from a user gesture.
  Do not replace Word/PDF behavior. Allow success/fallback status text to wrap.

Acceptance:

- Projects remains visible and leaves Brag Book intentionally.
- Every functional action is visible without hover.
- Export book, backup, resume JSON import, DOCX, Print/PDF, text, and legacy
  Word actions remain present.

### 13. Save, conflict, focus, and scroll regression boundary

Files: tests only. Do not edit save implementation.

- Keep `captureFocus` / `restoreFocus` and same-route scroll restoration.
- If mobile CSS removes `.bb-resume-editor` internal scrolling, leave
  `SCROLL_PANES` intact; an absent scrollable pane is harmless and changing it
  would expand scope.
- Do not alter hashchange, visibilitychange, pagehide, beforeunload, keepalive,
  single-flight, 409 merge, outbox, or revision handling.

Acceptance:

- All save-current assertions pass: input enters the model before blur,
  in-app navigation flushes, lifecycle events flush, PUT stays single-flight,
  and same-entry conflicts are retained.
- Conflict UI remains functional after CSS stacking.

## Approval gates — do not implement yet

These are touch-only UI additions, not required CSS fixes. The user must choose
before implementation.

1. **Visible Bold/Italic controls outside Knowledge.**
   - Current state: resume bullet wording and Additional info support
     Cmd/Ctrl+B/I; most experience lines support Bold only; desktop
     intentionally has no visible Bold button. Knowledge already has visible
     B/I.
   - Proposed option: a small formatting bar appears only while a supported
     contenteditable has focus on `(pointer: coarse)`. It would call the
     existing rich-span/`execCommand` path and disappear on desktop.
   - Decisions needed: apply to resume bullets only, also Additional info, or
     all shared/posting experience lines; and whether Italic should become a
     supported value on experience lines that currently store Bold only.

2. **A new non-drag reorder fallback.**
   - Current state: touch pointer drag is implemented and tested, and existing
     ↑/↓ controls provide a non-drag path. CSS can enlarge both without adding
     UI.
   - Proposed options if the current arrows are not discoverable enough:
     persistent “Move up / Move down” labels, or a touch-only Move menu that
     can select a destination sub-heading.
   - Decision needed: approve one option or retain enlarged existing arrows.
     Do not remove desktop HTML5 drag or the pointer path.

3. **Touch drag auto-scroll.**
   - Current state: dragging a long resume list near a viewport edge does not
     auto-scroll. Existing ↑/↓ controls remain available.
   - Decision needed: whether auto-scroll is worth the added pointer/session
     complexity. Keep it out of the responsive CSS commit unless approved.

## Verification matrix

Run in this order:

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

Source-level acceptance viewport matrix for the implementation:

| Width / input | Required layout contract |
| --- | --- |
| 360px coarse | two-row nav; no page X-scroll; 16px inputs; 44px actions; posting cards; one-column resume/bullets/Knowledge |
| 390px coarse | same; scaled resume preview contained in wrapper |
| 430px coarse | same; search/add and export bars wrap without dropped actions |
| 768px coarse | tablet stack rules; full-width STAR; usable preview; 44px touch controls |
| 1023px fine/coarse | tablet resume and bullet stacks; no change at 1024 |
| 1024px fine | current desktop DOM and pixel layout unchanged |
| 1280px fine | current desktop grids, sticky preview, tables, controls, drag, and shortcuts unchanged |

The implementation is complete only when all functionality named above remains
reachable, all nine automated commands pass, and no save-path file changed.
