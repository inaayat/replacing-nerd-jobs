# Brag Book experiences — UX spec

Companion to `experiences-plan.md` (PR #473). This doc is a design review and interaction spec only; it changes no app code and does not edit the plan. Where the two disagree, the **decisions** section below records what the user has decided since the plan was written.

Priority: desktop web first, then mobile.

---

## Top 5 recommendations

1. **No experience chrome until the user asks for it.** On first open every bullet is a plain loose bullet under its job, exactly as today. The library only shows an experience header after someone groups bullets. There is no "1 version" label, no chevron on a single bullet, and no wizard.
2. **One "target" model for mapping and adding.** Click a requirement (or a resume sub-heading) on the left and it becomes the target. Every row in the right-hand Experiences panel then shows one button that acts on that target: `+ Map` or `+ Add`. This replaces the plan's two-step `Map experience ▾` dropdown followed by version checkboxes. Mapping costs 2 clicks instead of 4–5, and the same panel works on both pages.
3. **Keep mapping and the resume visibly separate.** A bullet can cover many requirements and still appear on the resume once. The panel says `covers 3 requirements` and `On resume ✓` as two separate facts. Unmapping from one requirement never touches the other requirements or the resume, and the toast says so in plain words.
4. **Two verbs with one Undo instead of five verbs and a backup screen.** Keep `Remove from experience` (one bullet) and `Ungroup` (the whole experience). Every grouping change shows an 8-second toast with Undo. The plan's grouping backups stay as internal safety, but there is no `Restore grouping` screen and no separate `Ungroup and remove label` or `Delete empty experience` action in v1.
5. **Cut v1 scope where it adds complexity without much value.** Block grouping across jobs instead of offering a confirm flow. Draft new versions blank, with no prompt to copy STAR. Swap versions on posting resumes only, not Resume basics. Add no experience route. Show no STAR on mobile.

---

## Decisions this spec assumes

| Decision | Source |
|---|---|
| The library hierarchy is **Job › Experience › Resume bullets**. | User decision, after the plan |
| Bullets not in an experience are **loose bullets**, not implicit one-bullet experiences. They sit in a `Not in an experience` section under each job. The last group, `No role`, holds bullets with no job. | User decision; supersedes the plan's "implicit experience" UI |
| One bullet (and therefore one experience) can map to **many requirements on the same posting**, and the generated resume shows each bullet **once**. | User requirement |
| Requirement links and resume rows keep pointing at concrete bullet ids (`req.bullets[].entryId`, `sourceEntryIds`). | Plan |
| Mapping a bullet to a requirement does **not** add it to the posting resume, and unmapping does not remove it. That is today's behaviour (the posting resume compiles from basics, fresh, or choose mode; requirement links are a separate list), and this spec keeps it. | Current code |
| The resume already dedupes by stable bullet id (`resumeTakenEntryIds`, `placeLibraryBullet` skips a bullet that is already placed). | Current code |

### What "loose bullets" changes in the plan

- The plan's `effectiveExperienceId = entry:<id>` can stay as an **internal** key for coverage math. The UI must never call a loose bullet an experience, count it as one, or give it an experience title.
- The Unmapped panel lists **two row kinds**: experiences and loose bullets (see §7.4).
- An experience needs to live under one job. The plan stores no job on the experience record, so it should either add `experience.jobId` or derive the job from its versions and block mixed jobs. Recommended: block cross-job grouping in v1 (`These bullets are under different jobs. Move them to one job first.`). If someone changes a grouped bullet's job, take it out of the experience into the new job's loose section, and show a toast with Undo.
- First-run state = every bullet loose. The "group them as an experience" hint appears only in a loose section that has two or more bullets.

---

## 1. Vocabulary and microcopy

Use the same words everywhere. Avoid internal terms such as implicit, effective, entry, tombstone, and provenance.

| Concept | UI word | Notes |
|---|---|---|
| A persisted `entries[]` record | **bullet** (in the library), **version** (only inside an experience) | "3 versions" only appears on an experience. A loose bullet is just "bullet". |
| Group record | **experience** | Title is the user's short name, e.g. `Embedded-risk launch`. |
| Bullet with no experience | **loose bullet**; section label `Not in an experience` | Section header: `Not in an experience · 3`. Panel summary: `3 loose bullets`. |
| Bullet with no job | group label `No role` | Always last. |
| Requirement link | **map / mapped / unmap** | `+ Map`, `Mapped ✓`, `Unmap from R3`. |
| Posting resume membership | **on resume / add to resume** | `+ Add to resume`, `On resume ✓`. Never "map to resume". |
| Requirement coverage count | `covers N requirements` (`covers 1 requirement`) | Counts distinct requirements on this posting. |
| Requirement ordinal | `R1, R2…` | New quiet mono gutter label on the posting table. Display only, derived from order. Tooltip and `aria-label` carry the full requirement text. |

Key strings:

- Group button: `Group as experience` (selection bar). After grouping, the title field is focused with the placeholder `Name this experience`. The pre-fill is the first selected bullet's lead-in before a colon, or its first 6 words.
- New experience: `+ New experience`.
- Draft: `+ Draft version`.
- Move: `Move to…` (picker title `Move bullet to`; options are this job's experiences plus `Not in an experience`).
- Remove one: `Remove from experience`. The toast reads `Moved to Not in an experience. [Undo]`.
- Ungroup: `Ungroup`. The confirm-free toast reads `Ungrouped "Embedded-risk launch". 3 bullets are now loose. [Undo]`.
- Version swap trigger on a resume row: `Versions 3 ▾`.
- First-run hint (dismissible, local only): `Have a few ways of saying the same thing? Select them and Group as experience.`
- Offline: controls disabled with the tooltip `Offline — read-only`.

---

## 2. Information architecture and navigation

```text
Home
├── Resume bullets  (#experiences)   ◀── library: Job › Experience › bullets
├── Knowledge       (#kb)
├── Jobs            (#jobs)
│   └── Job posting (#jobs/:id)      ◀── requirements × mapped bullets
│        ├── Posting resume (#jobs/:id/resume)  ◀── editor + live preview
│        └── Prep (cue cards)
└── Resume basics   (#profile)
```

- The three surfaces in scope share **one Experiences panel component**. It is the same rows, search, and filters everywhere; only the target and the row button change:

| Page | Left (main) | Right panel button | Target |
|---|---|---|---|
| Resume bullets | Library editor (Job › Experience › bullets, STAR) | none by default; checkboxes for grouping | none (selection bar instead) |
| Job posting | Requirement table + Unmapped panel | `+ Map` / `Mapped ✓`, and `+ Add to resume` / `On resume ✓` | the clicked requirement |
| Posting resume | Editor + live preview (existing split) | `+ Add` (via the existing `Add from library` popover, grouped the same way) | the role or sub-heading whose `Add from library` was clicked |

- The posting context bar keeps today's tabs: `Requirements · Resume · Prep`. Each panel row has a quiet `↗` link to open that bullet in Resume bullets (`#experiences/:entryId`), which expands its experience in place.
- Deep links stay bullet-level, as the plan says. No `#experiences/x/:id` route in v1.
- Cross-surface cues:
  - On Job posting, a mapped bullet's chip `On resume ✓` links to `#jobs/:id/resume` and scrolls that row into view (user-initiated, so allowed).
  - On Posting resume, each editor row may show a quiet `covers 2 requirements` tag that links back to the posting table with those rows highlighted.

---

## 3. Layout system (desktop first)

| Width | Layout |
|---|---|
| ≥ 1100px | Two panels. Left content `minmax(0, 1fr)`; right Experiences panel **320px** (clamped 300–360), `position: sticky; top: <nav height>`, `max-height: calc(100vh - nav)`, with its own scroll. A thin `--line` divider, no card or shadow. Collapsible to a 36px rail (`▸ Experiences`), remembered in `localStorage` (the Sticky Notes pattern). |
| 721–1099px | Left content goes full width. The panel becomes a **right overlay drawer** (360px) opened by an `Experiences` button in the page header. The drawer stays open while you work, until Esc or ×. |
| ≤ 720px | Single column. The panel becomes a **bottom sheet** (see §11). |

The 1100px and 720px breakpoints match existing `app.css` breakpoints.

### 3.1 Experiences panel anatomy

```text
┌ EXPERIENCES ──────────────────── [+ New] ┐
│ [/  Search experiences and bullets     ] │   ← `/` focuses
│ All · Experiences · Loose · Not mapped   │   ← filter chips (one active)
│ Job [All jobs ▾]                         │
│ Mapping to  R3 Partner with eng…     ×   │   ← target strip (posting only)
├──────────────────────────────────────────┤
│ GODADDY · SR MANAGER                   8 │   ← job header, sticky in panel
│ ▸ Embedded-risk launch   2 · covers 3  ✓ │   ← experience row (collapsed)
│ ▾ Access-review program  3 · covers 1    │   ← experience row (expanded)
│   ☐ Built an access-review prog…  [+Map] │      version row
│        R2 · On resume ✓                  │      quiet facts line
│   ☐ Cut quarterly review time…    [+Map] │
│   ☐ Ran 40 reviews a quarter…  [Mapped✓] │
│        R3                                │
│   + Draft version                        │
│   Not in an experience · 3               │   ← loose section label
│   ◦ Cut audit prep 40%…           [+Map] │      loose bullet row
│   ◦ Automated evidence…           [+Map] │
│   ◦ Hired 4 analysts…             [+Map] │
│ PWC · SR ASSOCIATE                     5 │
│ ▸ Controls automation    2               │
│   Not in an experience · 1               │
│ NO ROLE                                2 │
│   ◦ Spoke at RSA…                 [+Map] │
├──────────────────────────────────────────┤
│ 2 selected  [Add 2 to resume] [Clear]    │   ← selection bar (only when ≥1 ☐)
└──────────────────────────────────────────┘
```

Row rules:

- **Job header**: uppercase mono, count = bullets under the job. It sticks inside the panel scroll. Clicking it collapses that job in the panel only, for the session.
- **Experience row**: chevron, title, `N` versions, `covers N` (posting page only, hidden when 0), and `✓` when at least one version is on this posting's resume. Collapsed by default. A search match auto-expands it.
- **Version row** (inside an experience): checkbox, a two-line clamp of the bullet text, and a row button. The facts line shows the requirement ordinals this version covers and `On resume ✓`.
- **Loose bullet row**: hollow bullet `◦` instead of a checkbox until hover or selection mode (keeps it calm), the same text clamp, the same row button, and the same facts line. **It looks like a version row without an experience header**, so moving between the two states is not a visual jump.
- **Loose section label** `Not in an experience · N` is quiet muted text with no chevron. It is collapsed into a single line `N loose bullets` while the panel search is empty and the job has experiences. Clicking the line expands it. A job with no experiences shows its loose bullets directly.
- Panel rows never show STAR, notes, or tags. Those belong to the left editor or the details drawer.

Filters (one chip active; `All` default):

- Resume bullets page: `All · Experiences · Loose · Not on a resume`.
- Job posting page: `All · Not mapped · On resume · Mapped here`.
- A job select narrows to one job (`No role` is an option).

---

## 4. Resume bullets page (desktop)

The left side keeps today's role-grouped catalog, collapsible jobs, and STAR collapsed by default. The new level is inserted between the job and its bullets.

```text
Brag Book · Home  Jobs  Resume bullets  Knowledge                                    ○ Saved
──────────────────────────────────────────────────────────────────────────────────────────────
[Resume bullets]  Knowledge
Resume bullets                                         │ EXPERIENCES                 [+ New]
[ Search bullets, experiences, STAR…        ] [+ Add]  │ [/ Search…                       ]
                                                       │ All · Experiences · Loose · Not on…
GODADDY · SENIOR MANAGER · 2021–NOW         8  ▾  ⋯   │ Job [All jobs ▾]
───────────────────────────────────────────────────────│──────────────────────────────────
▾ Embedded-risk launch                2 versions  ⋯    │ GODADDY                         8
   ☐ ⠇ • Built an embedded-risk process across…  STAR▸ │ ▸ Embedded-risk launch          2
   ☐ ⠇ • Launched a risk program covering 12…    STAR▸ │ ▸ Access-review program         3
       + Draft version                                 │   3 loose bullets
───────────────────────────────────────────────────────│ PWC                             5
▸ Access-review program               3 versions  ⋯    │ ▸ Controls automation           2
───────────────────────────────────────────────────────│   1 loose bullet
Not in an experience · 3                               │ NO ROLE                         2
   ☐ ⠇ • Cut audit prep time 40% by…             STAR▸ │   2 loose bullets
   ☐ ⠇ • Automated evidence collection for…      STAR▸ │
   ☐ ⠇ • Hired and trained 4 analysts…           STAR▸ │
   + New experience in GoDaddy                         │
                                                       │
PWC · SENIOR ASSOCIATE · 2017–2021          5  ▾      │
…                                                      │
NO ROLE                                     2  ▾      │
   ☐ ⠇ • Spoke at RSA on control testing…        STAR▸ │
───────────────────────────────────────────────────────┴──────────────────────────────────
                 2 selected · [Group as experience] [Move to… ▾] [Clear]        ← sticky bar
```

- **Duplication guard.** On this page the panel is an **index and filter**, not a second editor. Experience rows do not expand to bullet text here. Clicking a row scrolls the left list to that experience and expands it there (user-initiated). Recommendation: if user testing shows the duplicate list feels redundant on this page, default the panel to the 36px rail on Resume bullets and keep it open on Job posting.
- Checkboxes appear on row hover or focus. Once one is checked, every row shows its checkbox and the **selection bar** docks at the bottom of the left column. It never covers the panel.
- An experience header is one line: title (inline-editable on click; Enter or blur saves), version count, and `⋯` with `Rename`, `Draft version`, `Move to job…` (only when the experience is empty or all its versions move together), and `Ungroup`.
- A version inside an experience has `⋯` with `Move to…`, `Remove from experience`, `Open details`, and `Delete bullet…` (the existing destructive confirm, visually separated at the bottom).
- A loose bullet has `⋯` with `Group with…` (opens the picker described in §9.1), `Move to experience…`, `Open details`, and `Delete bullet…`.

### 4.1 First run (no experiences yet)

```text
GODADDY · SENIOR MANAGER · 2021–NOW                    8  ▾
──────────────────────────────────────────────────────────────
 ┆ Have a few ways of saying the same thing? Select them
 ┆ and Group as experience.                          [Got it]
   ☐ • Built an embedded-risk process across 12 teams…  STAR▸
   ☐ • Launched a risk program covering 12 teams…       STAR▸
   ☐ • Cut audit prep time 40% by…                      STAR▸
   …
```

- When a job has no experiences, its bullets render directly, with **no `Not in an experience` label**, so the page looks exactly as it does today.
- The hint shows once per device, in the first job with two or more bullets. It is a thin left rule plus muted text, not a banner. Dismissing it writes only to `localStorage`.
- The panel shows job headers with `8 bullets` and no experience rows. Its empty line reads `No experiences yet. Select bullets on the left and Group as experience.`

### 4.2 Empty states

| State | Copy |
|---|---|
| Empty library | Left: existing `No resume bullets yet…`. Panel: `Nothing here yet. Add a resume bullet to get started.` with `+ Add`. |
| Search, no match | `Nothing matches "foo".` plus `Clear search`. Job headers hide when empty (existing behaviour). |
| Filter, no match | `No loose bullets — everything is grouped.` / `Every bullet is mapped.` (positive framing) |
| Experience with zero versions (after moves) | Row reads `Embedded-risk launch · empty`, with `⋯ → Ungroup` to clear it. It is hidden from pickers (plan open question 4). |
| No role group empty | Hidden. |

---

## 5. Job posting page (desktop)

Today this page is a two-column table (requirement | experiences) with a details expander and an `Unmapped resume bullets` disclosure below. The table stays as the left content, and the Experiences panel sits on the right.

```text
← Jobs  Acme Corp · Risk Lead                          Requirements · Resume · Prep   ○ Saved
Coverage 5 of 7 requirements mapped · Resume 9 bullets
────────────────────────────────────────────────────────┬───────────────────────────────────
#   JOB REQUIREMENT              MAPPED BULLETS          │ EXPERIENCES               [+ New]
────────────────────────────────────────────────────────│ [/ Search…                      ]
R1  Lead cross-functional risk   • Built an embedded-    │ All · Not mapped · On resume
    programs              ? ×      risk process across…  │ Mapping to R3 Partner w/ eng… ×
                                   Embedded-risk launch  │ ─────────────────────────────────
                                   also R3 · R6   ×      │ GODADDY                        8
                                 + Map                   │ ▾ Embedded-risk launch 2 · covers 3 ✓
────────────────────────────────────────────────────────│   ☐ Built an embedded-risk…[Mapped✓]
R2  Run quarterly access         • Ran 40 reviews a      │       R1 · R3 · R6 · On resume ✓
    reviews               ? ×      quarter…              │   ☐ Launched a risk program… [+Map]
                                   Access-review program │   + Draft version
                                 + Map                   │ ▸ Access-review program 3 · covers 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│   Not in an experience · 3
▌R3 Partner with engineering     • Built an embedded-    │   ◦ Cut audit prep 40%…     [+Map]
▌   on control design     ? ×      risk process across…  │   ◦ Automated evidence…     [+Map]
▌   ● target                       Embedded-risk launch  │       R5
▌                                  also R1 · R6   ×      │   ◦ Hired 4 analysts…       [+Map]
▌                                + Map                   │ PWC                            5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ ▸ Controls automation 2 · covers 1
R4  SOX experience               (nothing mapped)        │ NO ROLE                        2
                          ? ×    + Map                   │   ◦ Spoke at RSA…           [+Map]
…                                                        │
────────────────────────────────────────────────────────│
▸ Unmapped resume bullets                             2  │
────────────────────────────────────────────────────────┴───────────────────────────────────
```

### 5.1 The target

- Clicking anywhere on a requirement row outside a text field, or its `+ Map` button, makes it the **target**. The row gets a 3px gold left rule and a muted `● target` label. The panel shows a `Mapping to R3 …` strip with `×`.
- With a target set, each panel version or loose row shows `+ Map`, or `Mapped ✓` if already linked to that requirement. Clicking `Mapped ✓` unmaps it (it is a toggle with `aria-pressed`).
- With no target, row buttons read `+ Add to resume` / `On resume ✓`, and the target strip reads `Click a requirement to map bullets to it.`
- The target persists while you work in the panel. It clears on Esc, on ×, or when you click another requirement. It is session state only and is never saved.

### 5.2 How mapped bullets read on each requirement

Each mapped bullet in the `MAPPED BULLETS` cell shows:

1. The full bullet text (existing `richLine`, still editable in place).
2. A quiet chip line (muted, 0.78rem, no fill):
   - `Embedded-risk launch`: the experience title, only when the bullet is in an experience. Loose bullets show nothing here.
   - `also R3 · R6`: other requirements on this posting that map the **same bullet**. Each ordinal is a small text button that highlights that requirement (§6.2). It is omitted when the bullet maps only here.
   - `On resume ✓` (optional, 1 word). Show it only when the posting resume exists, so a user can see at a glance that mapping and resume are separate facts.
3. `×` (`Unmap from R3`) at the end of the chip line, plus the existing `Details ↓` expander.

If two different versions of the same experience are mapped to one requirement, both lines show, each with its own chip. The experience title chip appears only on the first of the pair, to avoid repeating it.

### 5.3 Unmapped panel (bottom of left column)

The title stays `Unmapped resume bullets`, because loose bullets are bullets. Rows come in two kinds:

```text
▾ Unmapped resume bullets                                         2
  On this posting's resume but not mapped to any requirement.
  ▸ GoDaddy · Access-review program        2 versions on resume   [Map…]
  ◦ PwC · Built a SOX testing calendar…                           [Map…]
```

- **Experience row**: no version of this experience is mapped to any requirement on this posting, and at least one version is visible on the resume. It shows one row with `N versions on resume` and expands to list them.
- **Loose bullet row**: a visible resume bullet that is loose (or unlinked, such as fresh local text or an imported line) with no requirement link.
- The count is the number of rows: experiences plus loose bullets. The `aria-label` reads `2 unmapped: 1 experience, 1 bullet`.
- `Map…` makes that item the "source" and turns the requirement table into the picker: each requirement row shows `Map here` until you pick one or press Esc. That is the mirror image of the target model, with no modal.

---

## 6. Many requirements, one resume bullet

This is the core requirement: one bullet or experience can cover several requirements, and the resume shows it once.

### 6.1 The model in one sentence (for the UI)

> **Mapping says which requirements a bullet proves. The resume is a separate list of bullets you chose to print. A bullet can prove many requirements but prints once.**

Every surface below is built so the user never has to guess which of those two lists a click changed.

### 6.2 Selecting an experience highlights what it covers

Clicking an experience title or a bullet's text in the panel **selects** it. This is different from the target, which is a requirement:

```text
────────────────────────────────────────────────────────┬──────────────────────────────────
▌R1  Lead cross-functional risk  • Built an embedded-…   │ ▾ Embedded-risk launch ◉ covers 3 ✓
▌    ◉ covered by Embedded-risk     Embedded-risk launch │   Covers  R1 · R3 · R6
▌      launch                       also R3 · R6         │   On resume  1 version
────────────────────────────────────────────────────────│   ☐ Built an embedded-risk…
 R2  Run quarterly access        • Ran 40 reviews…       │       R1 · R3 · R6 · On resume ✓
     reviews                                             │   ☐ Launched a risk program…
────────────────────────────────────────────────────────│       not mapped
▌R3  Partner with engineering    • Built an embedded-…   │
▌    ◉ covered by Embedded-risk     …                    │
────────────────────────────────────────────────────────│
 R4  SOX experience              (nothing mapped)        │
 R5  …                                                   │
▌R6  Communicate risk to execs   • Built an embedded-…   │
▌    ◉ covered by Embedded-risk     …                    │
```

- Covered requirements get a 3px **ink** left rule (gold stays reserved for the target) plus visible text `◉ covered by Embedded-risk launch`. That makes the highlight readable without colour.
- Rows that are not covered are **not dimmed**, because dimming hurts reading. Only covered rows change.
- The selected experience expands and shows a summary block: `Covers R1 · R3 · R6` (each ordinal scrolls to that row on click) and `On resume 1 version`.
- Selecting a single version narrows the highlight to that version's requirements, and the summary reads `This version covers R1 · R3 · R6`.
- Desktop hover gives a lighter preview of the same highlight (rule only, no label) after a 150ms delay. Focus behaves like hover for keyboard users.
- The highlight **never scrolls the page by itself**. If covered rows are off-screen, the summary line adds `2 below ↓`, and clicking it scrolls to the next one.
- It clears on Esc, on a click on empty space, or when you select something else.

### 6.3 `covers N requirements` in the side panel

- Experience row: `covers N` = the number of distinct requirements on **this posting** that map **any** version of the experience. Mapping two versions to R1 still counts R1 once.
- Version and loose rows: the facts line lists ordinals (`R1 · R3 · R6`) instead of a number, because three ordinals fit and are more useful than "3".
- The count changes in place with a 600ms underline flash, not a layout shift, when you map or unmap.
- On the Resume bullets page (no posting context), the panel shows no coverage. Coverage only means something per posting.

### 6.4 The resume shows it once

- Adding is idempotent. `+ Add to resume` on a bullet that is already on the posting resume can't happen, because the button already reads `On resume ✓`. Clicking `On resume ✓` jumps to that row on `#jobs/:id/resume`. It does not remove the bullet: removing happens in the resume editor, where the effect is visible.
- **Two versions of one experience on the resume** is allowed, because the user chose it explicitly, but it is surfaced softly. The experience row reads `✓ 2 versions on resume`, and the resume editor rows of that experience show a muted `also on this resume: "Launched a risk…"` with `Go to it`. This is not an error, but it is likely a mistake on a one-page resume.
- In the posting resume editor, each linked row carries a quiet `covers 3 requirements` tag (clicking it opens the posting with those rows highlighted). The preview, Word, and PDF never show it.

### 6.5 Unmapping feedback (one requirement only)

Unmapping is one click (`×` on the requirement chip line, or `Mapped ✓` in the panel with that requirement targeted). Nothing else changes. The toast tells the user what stayed:

| Situation | Toast (with `[Undo]`, 8s) |
|---|---|
| Still mapped elsewhere and on resume | `Unmapped from R3. Still covers R1 and R6 · still on your resume.` |
| Still mapped elsewhere, not on resume | `Unmapped from R3. Still covers R1 and R6.` |
| Last requirement, on resume | `Unmapped from R3. No requirements left — it's still on your resume and now shows in Unmapped.` |
| Last requirement, not on resume | `Unmapped from R3. The bullet is still in your library.` |

The row also gives visual confirmation:

- The bullet leaves R3's cell with a 150ms fade. R3's row height animates closed, and the table below does not jump (scroll anchoring stays on R3's top edge).
- In the other covered rows, the `also …` chips drop `R3` in place.
- The panel's `covers 3` becomes `covers 2`, with an underline flash.
- If it was the last link and the bullet is on the resume, the `Unmapped resume bullets` count increments and its badge flashes once. The panel does not auto-expand.

**Deleting a bullet** is a different, destructive action (`⋯ → Delete bullet…`). It keeps the existing confirm, and its copy now spells out the effect: `Delete this bullet everywhere? It is mapped to R1, R3, R6 and is on 2 posting resumes.`

---

## 7. Posting resume page (desktop)

The existing side-by-side editor and live preview stays. The Experiences panel is **not** added here, because a third column would squeeze the preview. Library access stays in the existing `Add from library` popover, regrouped.

```text
← Acme · Risk Lead     Requirements · [Resume] · Prep                         ○ Saved
──────────────────────────────────────────────────┬──────────────────────────────────────
EDITOR                                            │ PREVIEW                    1 page ✓
GODADDY · Senior Manager · 2021–Now        ▾      │ ┌──────────────────────────────────┐
  Risk programs                     ⠇ ↑ ↓ ×       │ │ JANE DOE                         │
  ⠇ ☑ Include ☐ Pin  Versions 2 ▾  ↑ ↓ Remove     │ │ GoDaddy — Senior Manager         │
    Built an embedded-risk process across 12…     │ │ Risk programs                    │
    covers 3 requirements                         │ │ • Built an embedded-risk process │
  ⠇ ☑ Include ☐ Pin                ↑ ↓ Remove     │ │   across 12 teams…               │
    Cut audit prep time 40% by…                   │ │ • Cut audit prep time 40% by…    │
    loose · covers 1 requirement                  │ │                                  │
  [+ Add from library]  [+ Sub-heading]           │ └──────────────────────────────────┘
──────────────────────────────────────────────────┴──────────────────────────────────────
```

### 7.1 Version swap

```text
  ⠇ ☑ Include ☐ Pin  Versions 2 ▾  ↑ ↓ Remove
    Built an embedded-risk process across 12…
    ┌ Embedded-risk launch ─────────────────────┐
    │ ● Built an embedded-risk process across…  │  R1 · R3 · R6
    │ ○ Launched a risk program covering 12…    │  not mapped
    │ ─────────────────────────────────────────  │
    │ + Draft version                            │
    └────────────────────────────────────────────┘
```

- `Versions N ▾` appears **only** on rows linked to a bullet in an experience with two or more versions. Loose rows, single-version rows, and unlinked rows show nothing (progressive disclosure).
- It is a popover anchored to the row with radio semantics. Each option shows its own coverage (`R1 · R3 · R6`) so the user can see that swapping changes wording, **not** mapping.
- Picking a version swaps in place: same row id, position, include, and pin state, and editor and preview scroll restore (plan §Version swap). Toast: `Swapped wording. Requirement mapping didn't change. [Undo]`.
- If the chosen version is already elsewhere on this resume, the option is disabled with `Already on this resume · Go to it`.
- Should mapping follow the swap? **No** in v1 (keep it explicit). The toast includes `Map new wording to R1, R3, R6?` as a second action only when the old version had mappings and the new one has none. One click copies those links. The default stays explicit.

### 7.2 `Add from library` popover

```text
┌ Add to Risk programs ───────────────────────────┐
│ [ Search bullets…                             ] │
│ GODADDY                                         │
│ ▾ Embedded-risk launch                          │
│    ✓ Built an embedded-risk…      On resume     │
│    ☐ Launched a risk program…     R1 · R3       │
│ ▾ Access-review program                         │
│    ☐ Built an access-review prog… R2            │
│    ☐ Cut quarterly review time…                 │
│ Not in an experience                            │
│    ☐ Hired 4 analysts…                          │
│ PWC  ▸   NO ROLE  ▸                             │
├─────────────────────────────────────────────────┤
│ 2 selected                [Cancel] [Add 2]      │
└─────────────────────────────────────────────────┘
```

- This is a multi-select (a change from today's one-at-a-time). The current role's job is expanded first and other jobs are collapsed. Versions mapped to this posting's requirements sort first within an experience and show their ordinals as a hint.
- Bullets already on this resume are shown checked and disabled with `On resume`, never hidden, so the user understands why they can't add them.

---

## 8. Core flows with click counts

"Clicks" count pointer presses and exclude typing. Drag counts as 1. Shortcut equivalents are in §10.

| # | Flow | Where | Clicks | Steps |
|---|---|---|---|---|
| 1 | **Group loose bullets into a new experience** | Resume bullets | **n + 1** (3 bullets = 4) | Check n bullets → `Group as experience` → type title → Enter |
| 1b | Group by drag (quick way) | Resume bullets | **1 drag** | Drag a loose bullet onto another loose bullet → title field appears pre-filled → Enter |
| 1c | Add a loose bullet to an existing experience | either page | **1 drag** or **3** | Drag onto the experience header, or `⋯ → Move to experience… → pick` |
| 2 | **Map an experience's version to a requirement** | Job posting | **2** (3 if collapsed) | Click requirement (target) → expand experience → `+ Map` on the version. If the experience has one version, `+ Map` sits on the experience row itself. |
| 2b | **Map a loose bullet directly** | Job posting | **2** | Click requirement → `+ Map` on the loose row |
| 2c | Map one bullet to several requirements | Job posting | **2 + 2 per extra** | Click R1 → `+ Map`; click R3 → `+ Map`… The target switches and the panel stays put. |
| 2d | Map by drag | Job posting | **1 drag** | Drag a panel row onto a requirement row |
| 3 | **Multi-select versions and add to posting resume** | Job posting panel | **n + 2** | Expand experience → check n versions → `Add n to resume` |
| 3b | Same, from the resume | Posting resume | **n + 2** | `+ Add from library` → check n → `Add n` |
| 4 | **Swap a version in place** | Posting resume | **2** | `Versions 3 ▾` → pick |
| 5 | **Draft a new version** | any | **2** | Expand experience → `+ Draft version` → type → Enter. On Job posting with a target, the draft has `☑ Map to R3` checked by default. On Posting resume, it is placed in that row's slot. |
| 6 | **Create an experience** | either page | **1–2** | `+ New experience` (panel or job's loose section) → type title → Enter. Then it shows `Drag bullets here or pick from Not in an experience`, with the loose rows of that job offering `+ Add here` until you click away. Cancelling with an empty title persists nothing. |
| 7 | **Remove one version from an experience** | either | **2** | `⋯ → Remove from experience` → it lands in `Not in an experience` |
| 8 | **Move a version** | either | **1 drag** or **3** | Drag to another experience header or the loose section, or `⋯ → Move to… → pick` |
| 9 | **Ungroup an experience** | either | **2** | Header `⋯ → Ungroup` → toast with Undo (no confirm, because nothing is deleted) |
| 10 | Unmap from one requirement | Job posting | **1** | `×` on the chip line, or the `Mapped ✓` toggle |

Placement for flow 3: each added bullet goes under its own job on the posting resume. It goes directly after a sibling version if one is already there, otherwise at the end of the role's first sub-heading. If the role isn't on this posting resume, it is added through the existing duplicate-safe role path. Toast: `Added 2 to your resume under GoDaddy. [View] [Undo]`. If one-page fit hides one: `Added 2 · 1 hidden by one-page fit. [View]`.

---

## 9. Quick grouping of loose bullets

This gets its own section because grouping is the user's main new task and must feel lightweight.

### 9.1 Paths, fastest first

1. **Drag onto a sibling** (desktop): drop loose bullet A on loose bullet B. B's row shows a dashed outline `Drop to group`. On drop, both move under a new header whose title field is focused and pre-filled. Enter accepts; Esc keeps the default title.
2. **Select and group**: hover a loose bullet → checkbox → check others → selection bar `Group as experience`. The selection bar also offers `Add to "Access-review program" ▾` when the job already has experiences.
3. **`Group with…` from one bullet** (also the mobile and keyboard path): `⋯ → Group with…` opens a small sheet listing this job's other loose bullets with checkboxes, plus `Or add to an experience` with that job's experiences. `Group 3` creates the experience.
4. **Keyboard**: `x` on each row, then `g`.

### 9.2 Rules

- Grouping only offers bullets from the **same job**. Loose bullets under `No role` can be grouped with each other. A cross-job selection disables `Group as experience` with the tooltip `Pick bullets from one job`.
- Grouping never reorders the job's other bullets. The new experience appears where the first selected bullet was, and focus moves to its title field.
- Toast: `Grouped 3 bullets as "Embedded-risk launch". [Undo]`.

---

## 10. Drag and drop, keyboard, and accessibility

### 10.1 Drag targets and their non-drag equivalents

| Drag | Drop target | Result | Non-drag alternative |
|---|---|---|---|
| Loose bullet | another loose bullet | new experience | select → `Group as experience`, or `⋯ → Group with…` |
| Bullet or version | experience header | move into that experience | `⋯ → Move to…` |
| Version | `Not in an experience` label | remove from experience | `⋯ → Remove from experience` |
| Panel row | requirement row (posting) | map | target + `+ Map` |
| Panel row | resume role or sub-heading (if the panel is ever shown on the resume page) | add | `Add from library` |
| Resume row ⠇ | existing resume drag | reorder (unchanged) | ↑/↓ (unchanged) |

- Drag uses the existing ⠇ handle and the HTML5-plus-pointer fallback already used by `applyResumeDrag`. Panel rows are draggable by the whole row on fine pointers. On coarse pointers, drag is **off** for mapping and grouping, because a finger on a row is nearly always scrolling. Buttons are the path there.
- Drop zones show a 2px dashed `--line-strong` outline plus a text label (`Drop to map to R3`), never colour alone.

### 10.2 Keyboard shortcuts

These are active only when focus is not in a text field, so Cmd/Ctrl+B and Cmd/Ctrl+I in editors are unaffected. Press `?` to open the list.

| Key | Action |
|---|---|
| `/` | Focus panel search |
| `j` / `k` | Next / previous row in the panel (scoped to panel focus, so it doesn't clash with prep cue-card j/k) |
| `Enter` / `→` `←` | Expand / collapse an experience or job |
| `x` | Toggle select on the focused row |
| `g` | Group selected as experience |
| `m` | Map focused row to target (toggle) |
| `a` | Add focused or selected rows to the posting resume |
| `t` | Make the focused requirement the target (in the table) |
| `v` | Open `Versions ▾` on the focused resume row |
| `Esc` | Close popover → clear highlight → clear selection → clear target (one layer per press) |
| `Ctrl/Cmd+Z` | Undo the last experience or mapping action while its toast is visible |

### 10.3 Accessibility

- The panel is `<aside aria-label="Experiences">` with headed lists (`h3` per job). It uses disclosure buttons (`aria-expanded`, `aria-controls`), not an ARIA tree. That is simpler and matches the existing Unmapped toggle.
- The row button text carries the full context in `aria-label`: `Map "Built an embedded-risk…" to R3 Partner with engineering`. `Mapped ✓` is `aria-pressed="true"`.
- Checkboxes are real `<input type="checkbox">`. The selection bar is announced via a polite live region (`2 selected`).
- Highlights carry visible text (`◉ covered by …`), and the covered rows get `aria-describedby` pointing at it. Selecting an experience announces `Covers 3 requirements: R1, R3, R6`.
- Toasts live in one `role="status"` region (reuse `#status-note` as the live region, or a sibling). Undo is a real button, and focus does not move to the toast.
- Focus after each action: grouping → new title field; map/unmap → stays on the toggled button; ungroup → the first former version; swap → the row's `Versions` button; delete → the next row.
- Targets are at least 24×24 on desktop and 44×44 on touch. Muted text stays at least 4.5:1 on paper.

---

## 11. Feedback, undo, and scroll stability

### 11.1 Toast and undo

- One toast at a time, bottom-centre of the left column (above the mobile bottom bar), for 8 seconds, pausing on hover or focus. This is a new pattern for Brag Book; reuse the Sticky Notes toast-with-Undo shape (`#toast-undo`).
- Undo re-applies the pre-action state through the normal debounced, merge-safe save. For bulk grouping operations it uses the plan's grouping backup. If a 409 merge happened in between, Undo still applies by stable ids.
- Today's single status line (`setNote`) keeps showing save state. The toast is for the result of an action and the status line is for sync.

### 11.2 The "added" state

- `+ Add to resume` becomes `On resume ✓` in place. The button keeps the same width (`min-width`), so the row does not reflow.
- `+ Map` becomes `Mapped ✓` in place, and the requirement's mapped-bullets cell gains the line with a 150ms fade-in.
- A newly added resume row gets a 1.2s soft gold background fade in both the editor and the preview.

### 11.3 No scroll jumps

- Every mutation in this spec captures and restores scroll (`captureScroll` / `restoreScroll`) for the window, the panel's own scroller, the resume editor, and the preview. Each gets a regression test in the existing resume-scroll test style.
- Expanding or collapsing inserts content **below** the clicked row, so the clicked row's top edge stays put.
- A row that leaves a list (unmap, move, ungroup) collapses its height over 150ms instead of disappearing instantly.
- Only explicit navigation scrolls: clicking an ordinal (`R6`), `Go to it`, `View`, or a panel row on Resume bullets. Those use `scrollIntoView({ block: 'nearest' })` and move focus to the destination.
- Popovers are anchored and absolutely positioned, so opening them never changes document height.

---

## 12. Mobile (≤ 720px)

Principles: full width, small icons with 44px hit areas, no STAR anywhere, no drag for mapping or grouping, and the panel as a bottom sheet.

### 12.1 Resume bullets (mobile)

```text
┌──────────────────────────────┐
│ Resume bullets      [+]  [⋯] │
│ [ Search…                  ] │
│                              │
│ GODADDY · SR MANAGER    8  ▾ │
│ ──────────────────────────── │
│ ▾ Embedded-risk launch    ⋯  │
│   2 versions                 │
│   • Built an embedded-risk   │
│     process across 12…   ⋯   │
│   • Launched a risk program  │
│     covering 12 teams…   ⋯   │
│   + Draft version            │
│ ──────────────────────────── │
│ ▸ Access-review program   ⋯  │
│ ──────────────────────────── │
│ Not in an experience · 3     │
│   • Cut audit prep 40%…  ⋯   │
│   • Automated evidence…  ⋯   │
│   • Hired 4 analysts…    ⋯   │
│                              │
│ NO ROLE                 2  ▸ │
├──────────────────────────────┤
│ 2 selected  [Group] [Move] × │  ← only in select mode
└──────────────────────────────┘
```

- There is no side panel on this page on mobile; the list itself is the index. Search stays at the top.
- Select mode starts from `⋯ (page) → Select bullets` or a 400ms long-press on a row, and shows a sticky bottom bar with `Group`, `Move`, and `×`.
- `⋯` on a loose bullet: `Group with…`, `Move to experience…`, `Edit`, `Delete…`. `Group with…` is the main quick-group path on mobile (§9.1, path 3), as a full-width sheet.
- Bullet `Edit` opens the full-width editor with wording, job, notes, and tags. **No STAR fields.** STAR is kept and simply not shown, with no mobile hint required.

### 12.2 Job posting (mobile)

```text
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ ← Acme · Risk Lead           │     │ ──── (grab)                  │
│ Reqs · Resume · Prep         │     │ Mapping to R3            ×   │
│ 5 of 7 mapped                │     │ Partner with engineering…    │
│ ──────────────────────────── │     │ [ Search…                  ] │
│ R1 Lead cross-functional     │     │ All · Not mapped · On resume │
│    risk programs      ? ×    │     │ ──────────────────────────── │
│  • Built an embedded-risk    │     │ GODADDY                      │
│    process across 12…        │     │ ▾ Embedded-risk launch       │
│    Embedded-risk launch      │     │   covers 3 · on resume ✓     │
│    also R3 · R6         ×    │     │   Built an embedded-risk     │
│  [+ Map]                     │     │   process…       [Mapped ✓]  │
│ ──────────────────────────── │     │   R1 · R3 · R6               │
│ R3 Partner with engineering  │     │   Launched a risk            │
│    on control design  ? ×    │     │   program…         [+ Map]   │
│  (nothing mapped)            │     │ Not in an experience · 3     │
│  [+ Map]                     │     │   Cut audit prep…  [+ Map]   │
│ ──────────────────────────── │     │   …                          │
│ ▸ Unmapped resume bullets  2 │     │                              │
├──────────────────────────────┤     ├──────────────────────────────┤
│ [ ☰ Experiences · 14       ] │     │ [Done]                       │
└──────────────────────────────┘     └──────────────────────────────┘
        page                               bottom sheet (85vh)
```

- A sticky full-width bottom button, `☰ Experiences · 14` (48px tall, safe-area aware), opens the sheet with no target set (add-to-resume mode).
- A requirement's `[+ Map]` opens the same sheet **with that requirement as the target**, shown in the strip at the top. Mapping keeps the sheet open, so you can map several bullets. `Done` closes it, and the page scroll is where you left it.
- The sheet is the same panel component at full width: row buttons are at least 44px tall, icons are 16px glyphs inside 44px hit areas, and text clamps to 2 lines.
- Highlighting (§6.2) on mobile: tapping `covers 3` in the sheet closes the sheet and highlights the covered requirements on the page, with a dismissible pill `Showing what Embedded-risk launch covers ×` pinned above the bottom button.
- No drag. The requirement stays stacked above its mapped bullets, as the current responsive table does.

### 12.3 Posting resume (mobile)

```text
┌──────────────────────────────┐
│ ← Acme  Reqs · Resume · Prep │
│ [Editor] [Preview]           │  ← existing mobile disclosure
│ GODADDY · Sr Manager      ▾  │
│ ──────────────────────────── │
│ ☑ ☐📌  [↔ 2]  [↑][↓]  [⋯]    │
│ Built an embedded-risk       │
│ process across 12 teams…     │
│ covers 3 requirements        │
│ ──────────────────────────── │
│ [+ Add from library]         │
└──────────────────────────────┘
```

- `↔ 2` is the compact `Versions 2` control (`aria-label="Versions: 2 — swap wording"`). It opens a full-width sheet with the version radio list.
- `Add from library` opens a full-width sheet with search first and the same grouped multi-select as §7.2.

---

## 13. Plan review: what's confusing or overcomplicated

| # | In the plan | Problem | Proposed simplification |
|---|---|---|---|
| 1 | Implicit one-bullet experiences everywhere in the UI ("1 version" rows, chevrons on every bullet, first-run table) | Superseded by the user's decision. It also made first run look busier than today. | Loose bullets in `Not in an experience`. Keep `entry:<id>` as an internal key only. |
| 2 | `Map experience ▾` dropdown → choose experience → check versions → chips | 4–5 clicks and a mode inside a cell; the picker duplicates the panel | Target + per-row `+ Map` in the shared panel (2 clicks), plus drag |
| 3 | Five relationship verbs: Remove from experience, Ungroup all versions, Ungroup and remove label, Delete empty experience, Restore grouping | Users can't tell them apart, and "remove label" sounds destructive | `Remove from experience` + `Ungroup`, both with Undo. Backups stay internal. |
| 4 | Cross-role grouping "blocked unless the user confirms which job owns the experience", while each version keeps its own `jobId` | An experience under Job A could contain a Job B bullet, which breaks the Job › Experience › bullet tree | Block cross-job grouping in v1. Add or derive `experience.jobId`. Changing a version's job takes it out of the experience. |
| 5 | Requirement chips `[Embedded-risk launch] [2 versions]` | `2 versions` on a requirement is noise; the user needs to know what else this bullet covers | `Embedded-risk launch` + `also R3 · R6` + optional `On resume ✓` |
| 6 | No numbering for requirements | Coverage can't be expressed compactly | Add display-only `R1…` ordinals |
| 7 | Mapping and resume membership are never contrasted in the UI | The user worries unmapping removes the bullet from the resume | §6: separate facts, `covers N`, and toasts that say what stayed |
| 8 | Draft version "may offer to copy STAR/notes" | It adds a decision at the moment of writing | Blank draft. A later `Copy STAR from…` in details (desktop) |
| 9 | Version swap in Resume basics "where linked" | It doubles the test surface for little gain | Posting resumes only in v1 (plan open question 5) |
| 10 | Unmapped panel renamed "Unmapped resume experiences" | Loose bullets are not experiences under the new model | Keep `Unmapped resume bullets`, with experience rows and loose rows |
| 11 | Mobile wireframe uses `★` and `↔` icons with no legend; STAR implied | Unclear meaning, and STAR doesn't fit on a phone | `↔ N` with `aria-label`, no `★`, no STAR on mobile |
| 12 | `+ New experience` from inside the requirement picker | It creates and maps in one nested popover | Create from the panel's `+ New`. With a target set, the first drafted version has `☑ Map to R3` |
| 13 | A right column that changes "experience-first" on the posting page plus the existing per-requirement adder | Two ways to add from inside each cell | Keep the cell's existing `+ Add` for **typing a new bullet**. The panel is for **existing** bullets. |

### Open questions for the user

1. When the user swaps a resume row's wording to a version with no mappings, should the toast offer to copy the old version's requirement links (proposed), or never?
2. Should two versions of one experience on the same resume be a soft warning (proposed) or blocked?
3. On Resume bullets, should the side panel default to open or to the 36px rail? (Proposed: open, and revisit after use.)
4. Are the `R1…` requirement ordinals acceptable as visible labels, or should chips use truncated requirement text?

---

## 14. Implementation notes for the UI agent (non-binding)

- Build the panel once (`experiencesPanel({ page, target, selection })`) and render it on Resume bullets and Job posting. Feed it from one pure grouping helper in `engine.js` (Job › Experience › versions plus loose plus No role) so the left catalog, panel, `Add from library`, and export share it.
- Put coverage in one pure helper (`postingCoverage(store, posting)` → per-bullet requirement ids, per-experience distinct counts), used by chips, the panel, the editor tag, and the Unmapped panel.
- Keep target, selection, highlight, and panel collapsed state as session UI state (like `collapsedResumeRoles`), never on the book.
