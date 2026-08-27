# Packing Cubes — beta views: Plan by day + Outfits

**Status:** plan only (not implemented). Written 27 Aug 2026 from Karan's brief.
**Audience:** whoever builds the two extra packing views. Defaults below are
locked so implementation does not wait on unanswered questions. Open questions
are listed at the end; they do not block v1.

The live app this sits on (as of Round 12): list-first suitcase `v: 2` in
`packing-cubes/engine/model.js`, Organize + List / By cube, login required,
private user-built cubes only, opaque JSONB in `pc_suitcase_state`. Do not
rewrite that. Days and outfits are extra groupings over the same list.

---

## 1. What ships

Two **beta** views on the current packing list:

1. **Plan by day** — look at this trip day-by-day (Day 1, Day 2, …).
2. **Outfits** — named looks that live **on this trip**, not in My Cubes.
   Example: a wedding trip with one outfit for the ceremony and another for
   the rehearsal dinner.

They are extra tabs, not a rewrite of packing. List + Organize stay the
default. Login stays required. No guest mode. No public / catalog cubes.
Users still build their own cubes. **The packing list remains the source of
truth** — days and outfits never invent a second inventory.

---

## 2. User stories

### Plan by day

- As a packer, I add Day 1…N without entering calendar dates, so I can
  think "what do I need on day 3?" before I know the weekend.
- As a packer, I assign existing list items to one or more days (rewear:
  the same navy blazer on Day 1 and Day 3).
- As a packer, I assign an outfit to a day ("ceremony" → Day 2) and still
  see unassigned items on the main list — nothing disappears because I
  haven't filed it to a day.
- As a packer, if I later set the trip's start date, Day 1 shows
  "Fri 12 Jun" (or whatever weekday that is) but the day is still Day 1.

### Outfits

- As a packer on a wedding trip, I create "Ceremony" and "Rehearsal dinner"
  as outfits **on this trip**. They do not appear in My Cubes and are not
  cubes.
- As a packer, I build an outfit by picking items already on this trip's
  list (grouping, not a second stock).
- As a packer, I optionally label the event ("Saturday wedding").
- As a packer, I search outfits I used on past trips ("navy suit",
  "rehearsal") and copy one onto the current trip. Copying never creates a
  cube. If a copied item isn't on this list, I am offered the chance to add
  those missing labels to the list.

### Beta

- As a packer who doesn't want this yet, I never see the extra tabs.
- As a packer who does, I turn beta on once (per account) and get Days +
  Outfits on every trip, still next to List / By cube.

---

## 3. UI sketch (words)

The list pane toolbar today (`renderListPanel` in `app.js`):

```
[ Filter items… ]  [ List | By cube ]  [ Hide packed ]  [ Organize ]
```

**Default (beta off):** unchanged. No Days, no Outfits.

**Beta on:** the same toggle grows two extra buttons. Organize and Hide
packed still apply to List / By cube. They do **not** run inside Days or
Outfits (those views have their own assign controls).

```
[ Filter items… ]  [ List | By cube | By day | Outfits ]  [ Hide packed ]  [ Organize ]
                                                              ^
                                              "Beta" text badge on the
                                              toggle group (see §6)
```

Mobile (`max-width: 899px`) stays **Packing list | My cubes** as the pane
tabs. Days and Outfits live **inside** the packing-list pane — do not add a
third mobile pane, and do not put outfits in the My Cubes rail.

### By day

Stacked day cards (one column; same width as the list). Each card:

```
Day 2                          [ × remove day ]
Fri 13 Jun                     ← only if suitcase.startDate is set
────────────────────────────────
Outfits this day
  • Ceremony — Saturday wedding
Loose items
  ☐ Navy blazer
  ☐ Dress shoes
[ + Assign an item ]  [ + Assign an outfit ]
```

Above the cards: `[ + Add day ]` and an optional date row
`Start [ date ]  End [ date ]` (end is display-only / validation; days are
not generated from the range automatically in v1 — the user still taps
+ Add day. If they set a 4-day span and only have 2 days, that's fine).

Below the cards, an **Unassigned** tray of list items that have
`dayIds: []`. This is a reminder, not a hiding place: the same rows still
appear on List / By cube. Removing a day never deletes items.

Rewear: assigning an item already on Day 1 to Day 3 keeps it on both.
Packed is still one checkbox on the item (you pack the object once).

### Outfits

```
[ Search past outfits… ]     [ + New outfit ]
────────────────────────────────
Ceremony · Saturday wedding · Day 2
  Navy suit, white shirt, dress shoes
  [ Edit ]  [ Assign to a day ]  [ Remove from trip ]
────────────────────────────────
Rehearsal dinner
  (empty — add items from this list)
```

**New / edit outfit** is a small modal, not the cube builder:

- Name (required)
- Event label (optional)
- Day (optional select of this trip's days)
- Checklist of **this trip's packing-list items** (multi-select). Creating
  an outfit never writes `pc_cubes`.

**Search past outfits** is a typeahead over every other suitcase in
`state.suitcases` (see §8). Picking a hit opens a confirm:

> Copy "Ceremony" from *Jaipur wedding*?
> Missing from this list: navy suit, pocket square.
> [ Add missing items and copy ]  [ Copy grouping only ]  [ Cancel ]

"Copy grouping only" creates the outfit with only the item ids that already
match by `itemKey` on this list. It never creates a cube.

---

## 4. How this sits on the current app

| Today | Beta views |
|---|---|
| `items[]` is the inventory | Still the only inventory |
| `cubeId` / `addOnId` file into My Cubes | Unchanged. Days/outfits do not set these |
| Organize dropdown = cubes + add-ons | Stays. Day/outfit assign is **inside** those views |
| List / By cube (`listView`) | Add `'day'` and `'outfits'` when beta is on |
| `pc_cubes` / My Cubes rail | Outfits **never** appear here |
| `includeByDefault` cubes seed new trips | Outfits do not seed. Days start empty |
| Sign-in gate, no guest | Unchanged |
| `suitcasesApi.put` opaque JSONB | Still opaque. No new Vercel function |

Do not put browser modules under `/lib/`. New pure helpers go in
`packing-cubes/engine/model.js` (or a sibling `days.js` / `outfits.js`
imported by `model.js` and the tests — only split if `model.js` gets
unwieldy). Tests: extend `scripts/test-packing-cubes-model.mjs`.

Hobby-plan function count stays at whatever is already deployed; this is
client + existing `?route=suitcases` PUT.

---

## 5. Data model

Keep **`v: 2`**. Same pattern as `addOns`: `normalizeSuitcase` fills new
fields so old rows do not need a version bump. Bump `SUITCASE_VERSION` to 3
only if a later change cannot be defaulted (not needed for this spec).

### 5.1 Cloud state blob (`pc_suitcase_state.suitcases` + siblings)

Today the PUT body is `{ activeSuitcaseId, suitcases }`. Add a prefs object
next to them (not inside each trip):

```js
{
  activeSuitcaseId: '…',
  prefs: {
    betaViews: false,   // DEFAULT: off
  },
  suitcases: [ /* … */ ],
}
```

`prefs` missing ⇒ `betaViews: false`. Persist with the same PUT. Also cache
in `localStorage['packing-cubes:suitcases']` the same way the rest of the
blob already is, so a reload before sync does not flip the toggle.

**Default (locked):** beta is **per-user**, not per-trip. One switch, every
trip. If Karan later wants per-trip, add `suitcase.betaViews` as an override;
do not start there.

### 5.2 Fields on each suitcase

```js
{
  v: 2,
  id, name, items, cubeIds, addOns,   // existing

  startDate: null,   // 'YYYY-MM-DD' or null. Label only.
  endDate: null,     // 'YYYY-MM-DD' or null. Label / sanity only.

  days: [
    // Stable ids. Display number is index + 1 after sort by `n`.
    { id: 'day-uuid', n: 1 },
    { id: 'day-uuid-2', n: 2 },
  ],

  outfits: [
    {
      id: 'outfit-uuid',
      name: 'Ceremony',
      event: 'Saturday wedding',  // '' if unused
      dayId: 'day-uuid' | null,   // at most one day in v1
      itemIds: ['item-uuid', …],  // ids of suitcase.items
    },
  ],
}
```

### 5.3 Fields on each list item

```js
{
  id, label, cubeId, addOnId, packed,  // existing
  dayIds: [],                          // 0..N day ids; rewear = multiple
}
```

`dayIds` is the only new item field. Outfits do **not** get a back-pointer
on the item (the outfit owns `itemIds`). One packed flag still covers every
day the item appears on.

### 5.4 Caps (keep the JSONB blob small)

| Thing | Cap | On overflow |
|---|---|---|
| Days per trip | 31 | Refuse + toast |
| Outfits per trip | 40 | Refuse + toast |
| Items per outfit | 40 | Refuse + toast |
| `event` / outfit `name` | 80 chars | Same trim/cap style as cube titles |

### 5.5 New model helpers (pure, tested)

Suggested names — keep them in `model.js` unless a split is cleaner:

- `normalizeSuitcase` — default `days: []`, `outfits: []`, `startDate/endDate: null`,
  each item `dayIds: []`; drop day/outfit ids that don't exist; drop
  `itemIds` that aren't on the list; clamp `n` to 1…N in order.
- `addDay(suitcase)` / `removeDay(suitcase, dayId)` — renumber remaining
  `n`; strip that id from every `item.dayIds`; set `outfit.dayId = null`
  (outfit stays).
- `setTripDates(suitcase, { startDate, endDate })` — store ISO dates or
  null; do not auto-create days.
- `dayLabel(suitcase, day)` — `"Day 2"` or `"Day 2 · Fri 13 Jun"` when
  `startDate` is a valid ISO date. Timezone: interpret the date as a
  calendar date, not a UTC instant (parse `YYYY-MM-DD` as local Y/M/D).
- `assignItemDay(suitcase, itemId, dayId, on)` — add/remove one id;
  ignore unknown ids.
- `itemsForDay(suitcase, dayId)` / `unassignedDayItems(suitcase)`
- `addOutfit` / `updateOutfit` / `removeOutfit` — `removeOutfit` does not
  delete list items.
- `setOutfitItems(suitcase, outfitId, itemIds)`
- `setOutfitDay(suitcase, outfitId, dayId|null)`
- `searchPastOutfits(suitcases, currentId, query)` — see §8
- `copyOutfit(fromSuitcase, outfit, toSuitcase, { addMissing })` — see §8

Deleting a list item (`removeItem`) must also drop its id from every
outfit's `itemIds` and drop it from `dayIds` (the item is gone, so both
are automatic if we always filter through normalize / removeItem).

---

## 6. Beta gating

**Default (locked):** a **Beta** badge on the List / By cube switcher.

- Off: badge is a button, `aria-pressed="false"`, label `Beta`. Clicking
  it sets `prefs.betaViews = true`, saves, and reveals By day + Outfits.
  First click does **not** navigate away from List.
- On: By day + Outfits are visible. The badge stays as `Beta · on` and
  can be clicked again to turn off. Turning off hides the extra tabs and,
  if `listView` is `day` or `outfits`, snaps back to `list`. Data on the
  suitcases is **kept** (days, outfits, `dayIds`) so turning beta back on
  is lossless.
- Not a secret URL flag. Not a trip-level switch. Not a setting buried
  only on `/account.html`.

`localStorage['packing-cubes-list-view-v2']` (today `VIEW_KEY`) may store
`day` / `outfits` only while beta is on; if the stored view is a beta view
and beta is off, treat it as `list`.

---

## 7. Plan by day — rules

**Default (locked):** days are **numbered**, relative to the trip. Day 1
is the first day the user added, not "the calendar start," until/unless
`startDate` is set — and even then the number stays the primary key.

- `+ Add day` appends Day N+1 with a new uuid.
- Removing Day 2 from a 4-day trip renumbers: old 3→2, old 4→3. Stable
  `id`s stay; only `n` changes. Item `dayIds` keep the uuid, so
  assignments survive renumber.
- Same item **may** appear on more than one day (rewear).
- Unassigned items (`dayIds` empty) stay on List / By cube and in the
  Unassigned tray. They are not hidden, not deleted, not auto-filed.
- Outfits: optional single `dayId`. Assigning an outfit to a day does
  **not** auto-write that day onto the outfit's items. The By day card
  shows the outfit as a block; loose items on that day that also sit in
  the outfit are shown **once**, under the outfit (not duplicated as
  loose). Loose = assigned to the day and not in any outfit that is also
  on that day.
- Dates are labels. If `startDate` is `2026-06-12`, Day 1 labels as that
  date, Day 2 as the next calendar day, etc. Changing `startDate` only
  changes labels. Clearing `startDate` drops weekday/date text.
- `endDate` is not used to add/remove days in v1. If `endDate` is before
  `startDate`, ignore `endDate` for labels and do not block save.

---

## 8. Outfits — rules

**Default (locked):** an outfit is a **named grouping of item ids on this
suitcase**. It is not a cube, not in `pc_cubes`, not in My Cubes, not
`includeByDefault`, not publishable.

- Create from items already on the list. Empty outfits are allowed (name
  the look first, pick items after) — same idea as empty cubes.
- Optional `event` string. Optional `dayId`.
- **Default (locked):** an item **may** sit on two outfits the same day.
  A jacket in "Ceremony" and "Dinner" is allowed. (Open question if Karan
  wants exclusivity later.)
- **Default (locked):** names only for v1. No photo field, no upload, no
  Blob. Adding `photoUrl` later is a normalize default, not a v3 bump.
- Remove outfit: grouping gone; items stay on the list and on their days.
- Delete trip: outfits go with the suitcase (they live on the record).
- Delete cube / detach cube: existing rules. Outfits that referenced
  surviving items keep those ids; items that detach-deleted leave the
  list and therefore leave the outfit on the next normalize.

### Search + copy (past outfits)

Search corpus: every `outfit` on every suitcase in `state.suitcases`
except the current one. (Same-user, already loaded — no extra API.)

Haystack per hit: outfit `name`, `event`, parent suitcase `name`, and the
**labels** of its `itemIds` (resolved on that past suitcase). Use the same
case-insensitive `includes` style as `matchesQuery`.

A hit payload for the UI:

```js
{
  suitcaseId, suitcaseName,
  outfitId, name, event,
  labels: ['Navy suit', 'White shirt'],  // resolved, stable order
}
```

`copyOutfit(..., { addMissing })`:

1. Create a new outfit on the current suitcase (new uuid; do not reuse
   the old id). Copy `name` + `event`. `dayId` starts `null` (days don't
   transfer across trips).
2. For each source label, find a current item with the same `itemKey`.
   If found, add its id. If not and `addMissing`, `addItem` then add the
   new id. If not and `!addMissing`, skip.
3. Never call `cubesApi.create`. Never attach a cube.

Sort search results: current query match, then most recently updated
suitcase first (`pc_suitcase_state` has no per-suitcase `updatedAt` today
— **default:** keep array order, which is already how trips are listed,
and prefer the active trip's neighbors as-is). Do not add a new API sort
key in v1.

---

## 9. Edge cases

- **Beta off with leftover data.** Days/outfits remain in JSON. List /
  By cube ignore `dayIds`. Turning beta on restores the views.
- **Stored view is `day` while beta is off.** Snap to `list`.
- **Item deleted.** Strip from outfits and days inside `removeItem`.
- **Day deleted.** Renumber; outfits on that day become `dayId: null`;
  items lose that one id and may remain on other days.
- **All days removed.** `days: []`; every `item.dayIds` clears; outfits
  keep names/items, `dayId` null.
- **Duplicate labels on the list.** Outfits bind **ids**, not labels, so
  two "Black socks" rows can be in different outfits. Copy-from-past
  matches the **first** current item with that `itemKey` (same as cube
  attach dedupe). Document in the confirm: "matches by name."
- **Quick-add while on By day.** New item lands unsorted (`dayIds: []`)
  and appears in the Unassigned tray. Do not auto-assign to the last
  focused day in v1 (too magical). A later "add to this day" control on
  the card can `addItem` + `assignItemDay` if we want it in a follow-up.
- **Quick-add while on Outfits.** Same: item goes on the list only.
- **50-suitcase cap** (already on the API). Search only sees those.
- **Offline / 401.** Same as today: debounce PUT; 401 → sign-in gate;
  last edit is in localStorage.
- **PWA / iOS 16px.** New inputs use `.pc-input` so the coarse-pointer
  16px rule applies. No new focusable control under 16px.
- **Empty trip.** By day shows "Add a day"; Outfits shows "New outfit"
  + search. Neither requires cubes.
- **includeByDefault cubes.** New trips still seed cubes; they do not
  seed days or outfits.

---

## 10. Implementation order (when someone builds this)

1. Model + `normalizeSuitcase` + tests (days, outfits, copy, delete
   cascades). No UI.
2. Persist `prefs.betaViews` through hydrate / `suitcasesApi.put`.
3. Badge + extra `listView` values; hide them when beta is off.
4. By day view (add/remove days, assign items, date labels).
5. Outfits view (create/edit/remove, assign to a day).
6. Past-outfit search + copy confirm.
7. Edge-case pass: delete item / day / trip; beta off/on; mobile toolbar
   wrap (the four-way toggle must wrap, not overflow — reuse the
   `minmax(0, 1fr)` lesson from earlier rounds).

Do not add a Vercel function. Do not put this under `/lib/`. Do not
reintroduce a catalog or guest mode.

---

## 11. Open questions (do not block v1)

Defaults in this file stand until Karan answers.

1. **Days: numbered vs calendar-first.** Default: numbered Day 1…N;
   dates are labels. If he later wants the calendar date as the primary
   key, `days[].date` becomes required and `n` is derived — that would
   be a real v3 (or a one-way normalize) because two "Day 2"s vs two
   Junes are different identities.
2. **Can an item be on two outfits the same day?** Default: **yes**.
   Exclusivity would be a constraint in `setOutfitItems`, not a
   different shape.
3. **Photo on an outfit, or names only?** Default: **names only** for
   v1. Photos need storage (Neon Object / Blob) and a new function or
   upload path we do not have on this page.
4. **Is beta a hidden flag, a settings toggle, or a badge on the view
   switcher?** Default: **badge on the view switcher**, persisted
   per-user as `prefs.betaViews`. Not a `?beta=1` URL. Not account.html.

---

## 12. Explicitly out of scope (v1)

- Sharing outfits or days with another user
- Printing / PDF day sheets
- Auto-building days from a start/end range
- Drag-and-drop between days
- Weather, destination, or packing suggestions
- Photos
- Making an outfit into a cube (a later "Save these items as a cube"
  could reuse Unsorted → Save as cube; not in v1)
- Server-side search (the 50-trip blob is the corpus)
