# Follow-ups

Current known gaps after the UX / autosave passes — roughly in the order worth doing.
Each item says what's wrong now, why it matters, and where to start.

Shipped overview and architecture live in [`README.md`](./README.md). This file is the
living backlog; completed items are left marked **Done** so the trail stays readable.

---

## 1. Autosave can still drop a row that fails twice — done, with a caveat

**Done:** edits save themselves ~700ms after typing stops, one row at a time.
Each row shows its own saving/saved/failed state, the page shows a save status
where *Save changes* used to be, and Undo steps back through field edits
(coalesced per field so it undoes a word, not a letter).

**What's left:** a row whose save fails stays in the pending set and is retried
on demand, but `clearSaveState()` runs on every server reload — so if a save
fails and the user then switches plan or version, that edit is discarded with
only the toast as a record. Either block the reload while anything is unsaved,
or keep failed rows across it.

**Where to look:** `queueSave` / `onSaveFailure` / `clearSaveState` in
`engine/app.js`.

---

## 2. Targeted rendering — done

**Done:** inputs write straight into state on every keystroke, so nothing is
read back out of the DOM and typing no longer triggers a repaint at all. The
grids and save indicators are marked with `data-section` and repainted on their
own via `patchSection()`. `captureGridEdits()`, `captureFocus()`,
`restoreFocus()` and the `skipCapture` flag are all gone.

**What's left:** the whole-page `render()` still exists for navigation and
structural changes, which is fine — but because a repainted region takes its
listeners with it, controls inside one must be handled by the delegated listener
in `onDelegatedClick`, not wired per render. That's an invariant with nothing
enforcing it: a new button added to a grid and wired the old way will work until
the first repaint, then silently stop. Worth a comment at minimum, or a dev-mode
assertion that no listeners are attached inside a `data-section`.

---

## 3. Concurrent edits — done

**Done:** the client sends the `updated_at` it loaded a row with; the handler
rejects a write whose guard no longer matches with a 409 carrying the server's
copy. The row shows "Changed elsewhere" and *Retry* re-sends with `force` to
keep the local version deliberately.

**What's left:** the guard compares `date_trunc('milliseconds', ...)` because a
JSON round-trip of a `timestamptz` doesn't reliably preserve microseconds. Two
writes inside the same millisecond can still both win. A monotonic integer
`version` column would remove the ambiguity. Only `plan_items` and
`dependencies` are guarded — `resources` and `task_types` are still last-write-
wins.

---

## 4. Day-level tracking — done

**Done:** wizard, Capacity toggle, and planning rules offer Day / Week / Month.
`GET /api/omc-capacity?granularity=day` draws one column per calendar day
(weekends have zero capacity when `working_days_per_week` is 5). Existing plans
stored as `day` now render daily columns instead of being coerced to weeks.

---

## 5. Capacity view settings don't persist

**Now:** the due-vs-spread mode and the week/month toggle live in the DOM. They
reset every reload, and *spread* mode has to be re-picked each visit.

**Where to start:** move both into the plan's policy alongside
`tracking_granularity`, so the plan remembers how its owner reads it.

---

## 6. Creating a plan with a team is N+1 round trips

**Now:** `createPlanFromWizard()` loops `await resourcesApi.create(...)` once per
person. Ten people is ten sequential round trips to a serverless Postgres.

**Where to start:** a bulk POST on `/api/omc-resources` taking an array.
`patchResources` already handles arrays — creation should match.

---

## 7. "Versions" is still the most confusing thing on the Planner

**Now:** the draft/live toggle, the version dropdown, *New draft*, *Make this
the live plan* and *Delete version* are all on screen from the first visit, even
when only one version exists. The copy explains them, but they're still five
controls for a concept most users won't need on day one.

**Where to start:** collapse to a single "Working on: Baseline" control that
only expands into the full set once a second version exists.

---

## 8. Alerts UI archived — fold into dependencies later

**Now:** the Alerts page and sidebar entry are removed. `#/alerts` redirects to
the Planner. Overload / proximity / gate signals still exist in `engines/alerts.js`
and `GET /api/omc-alerts`, but nothing in the SPA surfaces them.

**Where to start:** when dependency/gate UX is deepened, surface the relevant
alert types inline on blocked rows (and optionally Capacity overloads) instead of
bringing back a standalone Alerts tab.

---

## 9. The Planner has no sort, filter, or bulk edit

**Now:** rows render in whatever order the API returns. On a real plan of 80
items, finding the one you want means scrolling.

**Where to start:** sort by due date by default, then add column sort and a
text filter. Type is already a field and would make a good filter chip row.

---

## 10. Modals don't trap focus

**Now:** `confirmDialog` and `promptDialog` handle Escape, restore focus to the
opener, and focus the right control on open — but Tab can still walk out of the
dialog into the page behind it.

**Where to start:** a focus-trap loop in `engine/shell.js`, plus `inert` on the
app root while a dialog is open.

---

## 11. There's no page-level test coverage of behaviour

**Now:** `engine/views.test.js` covers rendering, escaping, routing and gating,
and `engine/patches.test.js` covers the autosave payloads — all pure functions.
Nothing tests the event wiring, which is where the two bugs an earlier pass fixed
actually lived, and which the autosave work made substantially more intricate:
the `applyEdit` dispatch resolves which row an input belongs to by walking
`closest()` selectors, and a selector drifting out of step with the markup would
silently stop saving that field.

**Where to start:** Playwright is already available in the sibling
`replacing-nerd-jobs` repo. A handful of flows would pay for themselves: create
a plan, add a row, edit and save, delete a row with edits pending.

---

## 12. Smaller things

- **Dates are hardcoded `en-US`** in `prettyDate()` and the changelog. Use the
  browser locale.
- **The blocked-row indicator is a 3px red border** on the title input, which is
  easy to miss. The "Can start" badge does the real work; consider dropping the
  border.
- **Capacity band colours should be verified for contrast** — they're paired
  with numbers and text labels so they don't rely on colour alone, but the
  amber-on-cream combination is worth measuring.
- **No skip link** to jump past the sidebar nav.
- **Toasts vanish after ~3s** with no history. A failed save that the user
  glanced away from leaves no trace.
