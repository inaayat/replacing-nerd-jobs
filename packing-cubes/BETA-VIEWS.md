# Packing Cubes — beta views: Plan by day + Outfits

**Status:** implementing / locked spec. First draft 27 Aug 2026; **calendar-first
days locked the same day** (Karan: dates are the identity, not Day 1 / Day 2).
**Audience:** whoever builds or extends the two extra packing views.

The live app this sits on (as of Round 12): list-first suitcase `v: 2` in
`packing-cubes/engine/model.js`, Organize + List / By cube, login required,
private user-built cubes only, opaque JSONB in `pc_suitcase_state`. Do not
rewrite that. Days and outfits are extra groupings over the same list.

---

## 1. What ships

1. **Outfits** (main-line) — named looks that live **on this trip**, not in
   My Cubes. Example: a wedding trip with one outfit for the ceremony and
   another for the rehearsal dinner. Always on List / By cube / the Outfits
   tab — not behind Beta.
2. **Plan by day** (beta) — look at this trip by **calendar date**. A day is a
   `YYYY-MM-DD` on the trip, displayed as weekday + date (e.g. Fri 13 Jun).
   A "Day 2" suffix may be derived from `startDate` if useful; it is **not**
   the identity.

They are extra groupings, not a rewrite of packing. List + Organize stay.
Login stays required. No guest mode. No public / catalog cubes. Users still
build their own cubes. **The packing list remains the source of truth** —
days and outfits never invent a second inventory. Removing an item on a
trip never edits `pc_cubes`.

---

## 2. User stories

### Plan by day

- As a packer, I set this trip's start and end dates and see one card per
  date on that span (the natural day list).
- As a packer, I can add a date outside that range (an extra travel day)
  without inventing an abstract Day 5.
- As a packer, I assign existing list items to one or more **dates** (rewear:
  the same navy blazer on 12 Jun and 14 Jun).
- As a packer, I assign an outfit to a date ("ceremony" → Sat 13 Jun) and
  still see unassigned items on the main list — nothing disappears because I
  haven't filed it to a day.
- As a packer, removing 13 Jun removes that date only. 14 Jun stays 14 Jun;
  nothing renumbers.

### Outfits

- As a packer on a wedding trip, I create "Ceremony" and "Rehearsal dinner"
  as outfits **on this trip**. They do not appear in My Cubes and are not
  cubes.
- As a packer, I build an outfit by picking items already on this trip's
  list **or typing new ones in the create/edit view**. A typed item is added
  to the packing list once and attached to the outfit. Two outfits can share
  that same list row.
- As a packer, I can save an outfit with **no date**. A look does not need
  a day. The date field is optional and never auto-filled.
- As a packer, I optionally label the event ("Saturday wedding").
- As a packer, I search outfits I used on past trips ("navy suit",
  "rehearsal") and copy one onto the current trip. Copying never creates a
  cube. If a copied item isn't on this list, I am offered the chance to add
  those missing labels to the list.
- As a packer in List (beta off), I see a condensed packing list: one row
  per item, sorted by cube then outfit, Unsorted last, with a chip of the
  cube or outfit. No collapsible sections. Shared items appear once.
  Checking an item slides it to the bottom; unchecking puts it back in
  cube / outfit order. Each row has a compact Worn toggle (`item.worn`,
  trip-local, not on `pc_cubes`). Packed ≠ worn. A Worn filter shows
  what you actually put on.
- As a packer in By cube, I see outfits and cubes as collapsible groups
  (including empty ones). Outfit groups are not My Cubes cubes. Collapse
  all folds every group. An item may sit under its outfit and its cube.
  One item id, one packed checkbox, one trip-local worn mark. When every item in a cube (including
  its add-ons) or an outfit is packed, that group moves to the bottom
  (Unsorted stays last). Cubes can be dragged to set `cubeIds` order.
  Blank add-ins are created from My Cubes / Edit cube, not from this list.

### Beta

- As a packer who doesn't want Plan by day yet, I never see that tab.
  Outfits stay visible.
- As a packer who does, I turn beta on once (per account) and get **By day**
  next to List / By cube / Outfits.

---

## 3. UI sketch (words)

The list pane toolbar today (`renderListPanel` in `app.js`):

```
[ Filter items… ]  [ List | By cube | Outfits ]  [ Hide packed ]  [ Organize ]
```

**Default (beta off):** List, By cube, and Outfits. List is grouped (outfit
or cube, then Unsorted). No By day.

**Beta on:** By day appears. Organize and Hide packed still apply to List /
By cube. They do **not** run inside Days or Outfits (those views have their
own assign controls).

```
[ Filter items… ]  [ List | By cube | By day | Outfits ]  [ Hide packed ]  [ Organize ]
                                                              ^
                                              "Beta" text badge — gates
                                              By day only (see §6)
```

Mobile (`max-width: 899px`) stays **Packing list | My cubes** as the pane
tabs. Days and Outfits live **inside** the packing-list pane — do not add a
third mobile pane, and do not put outfits in the My Cubes rail.

### By day

Stacked day cards (one column; same width as the list), **sorted by date**.
Each card:

```
Fri 13 Jun · Day 2             [ × remove this date ]
────────────────────────────────
Outfits this day
  • Ceremony — Saturday wedding
Loose items
  ☐ Navy blazer
  ☐ Dress shoes
[ + Assign an item ]
```

("Day 2" only if `startDate` is set and this date is on/after it.)

Above the cards:

```
Start [ date ]  End [ date ]   [ date + Add ]
```

Setting start + end **fills** every calendar date in that inclusive range
into `days` (the natural flow). It does **not** delete dates the user added
outside the range. `+ Add` picks one extra `YYYY-MM-DD`. Removing a card
removes that date only — neighbors keep their dates.

Below the cards, an **Unassigned** tray of list items that have
`dates: []`. This is a reminder, not a hiding place: the same rows still
appear on List / By cube. Removing a day never deletes items.

Rewear: assigning an item already on 12 Jun to 14 Jun keeps it on both.
Packed is still one checkbox on the item (you pack the object once).

### Outfits

```
[ Search past outfits… ]     [ + New outfit ]
────────────────────────────────
Ceremony · Saturday wedding · Fri 13 Jun
  Navy suit, white shirt, dress shoes
  [ Edit ]  [ Assign to a date ]  [ Remove from trip ]
────────────────────────────────
Rehearsal dinner
  (empty — add items from this list)
```

**New / edit outfit** is a small modal, not the cube builder:

- Name (required)
- Event label (optional)
- Date (optional select of this trip's dates — hidden if the trip has no
  days yet). **Never required. Never auto-assigned.** Saving with no date
  is the normal path.
- Quick-add: type a label, Add. That creates the item on the trip packing
  list (or reuses the existing row with the same name) **and** attaches it
  to this outfit. Existing list items stay selectable as chips.
- Creating an outfit never writes `pc_cubes`.
- **List** is condensed, not sections: one row per item id, sorted by
  cube (then outfit if the item has no cube), Unsorted last. Each row
  shows the label plus a chip of the cube or outfit. No collapsible
  headers. Shared items appear once.
- **By cube** lists each outfit as a **cube-like collapsible group**
  (same card / section chrome as a cube). **Collapse all** (and Expand
  all) toggles every group. Outfits are still not cubes — they never
  appear in My Cubes, `pc_cubes`, or the cube library. Empty outfits
  still show as a group. An item in an outfit may also sit in its cube
  (or add-on) section as the **same** item / same packed checkbox.
  Unsorted items that only belong to an outfit appear under that outfit
  group, not in Unsorted. Blank add-on create lives on My Cubes / Edit
  cube / the builder — not on List or By cube.

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
| List / By cube (`listView`) | `'outfits'` is always on. Add `'day'` when beta is on |
| `pc_cubes` / My Cubes rail | Outfits **never** appear here |
| `includeByDefault` cubes seed new trips | Outfits do not seed. Days start empty until dates are set |
| Sign-in gate, no guest | Unchanged |
| `suitcasesApi.put` opaque JSONB | Still opaque. Prefs ride along. No new Vercel function |

Do not put browser modules under `/lib/`. New pure helpers live in
`packing-cubes/engine/model.js`. Tests: extend
`scripts/test-packing-cubes-model.mjs`.

Hobby-plan function count stays at whatever is already deployed; this is
client + existing `?route=suitcases` PUT.

---

## 5. Data model

Keep **`v: 2`**. Same pattern as `addOns`: `normalizeSuitcase` fills new
fields so old rows do not need a version bump.

### 5.1 Discarded draft (do not implement)

An earlier plan used numbered days as the primary key:

```js
// DISCARDED — do not store or write this
days: [{ id: 'day-uuid', n: 1 }],
item.dayIds: ['day-uuid'],
outfit.dayId: 'day-uuid',
```

Renumber-on-delete was part of that draft. **Karan locked calendar-first
instead.** Implementers must:

- Use `YYYY-MM-DD` as the day identity (`days[].date`, `item.dates[]`,
  `outfit.date`).
- In `normalizeSuitcase`, **drop** `days` entries that have an `n`/`id`
  but no valid `date`, drop `item.dayIds`, and drop `outfit.dayId`.
  If a leftover object has both `date` and `n`, keep only `date`.
- Never generate uuid day ids. Never shuffle dates when one is removed.

### 5.2 Cloud state blob (`pc_suitcase_state`)

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

`prefs` missing ⇒ `betaViews: false`. Persist with the same PUT (prefs
column on `pc_suitcase_state`, plus the localStorage cache). 

**Locked:** beta is **per-user**, not per-trip.

### 5.3 Fields on each suitcase

```js
{
  v: 2,
  id, name, items, cubeIds, addOns,   // existing

  startDate: null,   // 'YYYY-MM-DD' or null. Inclusive range start.
  endDate: null,     // 'YYYY-MM-DD' or null. Inclusive range end.

  days: [
    // Date is the identity. Sorted ascending. No uuid, no n.
    { date: '2026-06-12' },
    { date: '2026-06-13' },
  ],

  outfits: [
    {
      id: 'outfit-uuid',
      name: 'Ceremony',
      event: 'Saturday wedding',  // '' if unused
      date: '2026-06-13' | null,  // at most one calendar date in v1
      itemIds: ['item-uuid', …],  // ids of suitcase.items
    },
  ],
}
```

`startDate` / `endDate` **matter**: `setTripDates` fills every date in the
inclusive span into `days`. Extra dates the user added outside the span
stay until they remove them.

### 5.4 Fields on each list item

```js
{
  id, label, cubeId, addOnId, packed, worn,  // worn is trip-local, not pc_cubes
  dates: [],                           // 0..N ISO dates; rewear = multiple
}
```

`dates` and `worn` are trip-local. Outfits do **not** get a back-pointer
on the item (the outfit owns `itemIds`). One packed flag still covers every
date the item appears on. Packed ≠ worn.

### 5.5 Caps (keep the JSONB blob small)

| Thing | Cap | On overflow |
|---|---|---|
| Days per trip | 31 | Refuse + toast |
| Outfits per trip | 40 | Refuse + toast |
| Items per outfit | 40 | Refuse + toast |
| `event` / outfit `name` | 80 chars | Same trim/cap style as cube titles |

### 5.6 New model helpers (pure, tested)

- `isIsoDate` / `datesInRange` / `dayLabel(suitcase, date)` — weekday +
  date as a calendar date (not a UTC instant). Optional `· Day N` when
  `startDate` is set and the date is on/after it.
- `normalizeSuitcase` — default `days: []`, `outfits: []`, dates null,
  each item `dates: []`; drop discarded numbered-day fields; drop outfit
  `itemIds` that aren't on the list; drop item/outfit dates that are not
  on `days`? **Keep** item dates even if the day card was removed? No —
  `removeDay` strips that date from items. Normalize drops dates that are
  not valid ISO, and drops item/outfit dates that are not in `days` so
  the grouping cannot point at a missing card.
- `addDay(suitcase, date)` / `removeDay(suitcase, date)` — no renumber.
  `removeDay` strips that date from every `item.dates` and sets
  `outfit.date = null` when it matched (outfit stays).
- `setTripDates(suitcase, { startDate, endDate })` — store valid ISO or
  null; if both valid and start ≤ end, `addDay` each date in range
  (stop at the cap). Does not delete days outside the range.
- `assignItemDate(suitcase, itemId, date, on)` — add/remove one date;
  ignore unknown dates (not on `days`).
- `itemsForDate` / `unassignedDateItems`
- `addOutfit` / `updateOutfit` / `removeOutfit` — `removeOutfit` does not
  delete list items.
- `setOutfitItems` / `setOutfitDate`
- `searchPastOutfits(suitcases, currentId, query)` — see §8
- `copyOutfit(fromSuitcase, outfit, toSuitcase, { addMissing })` — see §8
- `normalizePrefs`

Deleting a list item (`removeItem`) must also drop its id from every
outfit's `itemIds`.

---

## 6. Beta gating

**Locked:** a **Beta** badge on the List / By cube switcher.

- Off: badge is a button, `aria-pressed="false"`, label `Beta`. Clicking
  it sets `prefs.betaViews = true`, saves, and reveals **By day** only.
  Outfits stay visible either way. First click does **not** navigate
  away from List.
- On: By day is visible. The badge stays as `Beta · on` and can be
  clicked again to turn off. Turning off hides By day and, if
  `listView` is `day`, snaps back to `list`. `outfits` is never snapped
  away. Data on the suitcases is **kept** (days, outfits, `dates`).
- Not a secret URL flag. Not a trip-level switch. Not a setting buried
  only on `/account.html`.

`localStorage` view key may store `outfits` always. Store `day` only
while beta is on; if the stored view is `day` and beta is off, treat it
as `list`.

---

## 7. Plan by day — rules

**Locked: calendar-first.** The primary key of a day is `YYYY-MM-DD`.

- Display is weekday + date. Optional `· Day N` derived from `startDate`
  (Day 1 = startDate). Never store `n`.
- `setTripDates` with a valid inclusive range fills those dates into
  `days`. That is the natural way to get a week of cards.
- `addDay` picks one extra date (allowed outside the range).
- `removeDay` deletes that date only. 12 Jun and 14 Jun do not become
  "Day 1 and Day 2"; they stay those dates. **No renumbering.**
- Same item **may** appear on more than one date (rewear).
- Unassigned items (`dates` empty) stay on List / By cube and in the
  Unassigned tray.
- Outfits: optional single `date`. Assigning an outfit to a date does
  **not** auto-write that date onto the outfit's items. The By day card
  shows the outfit as a block; loose items on that date that also sit in
  the outfit are shown **once**, under the outfit.
- If `endDate` is before `startDate`, ignore `endDate` (do not fill,
  do not block save). Treat dates as local calendar dates, not UTC
  instants (`new Date(y, m - 1, d)`).

---

## 8. Outfits — rules

**Locked:** an outfit is a **named grouping of item ids on this
suitcase**. It is not a cube, not in `pc_cubes`, not in My Cubes, not
`includeByDefault`, not publishable.

- Build from items already on the list **or** quick-add in the create/edit
  view (`ensureListItem` / `addItemToOutfit`). Empty outfits are allowed.
- Optional `event` string. **Optional `date` — null is valid. Do not
  require a date. Do not auto-assign the first trip day.**
- **Locked:** an item **may** sit on two outfits. **List** is exclusive:
  first outfit that owns it, else cube, else Unsorted — one packed
  checkbox. Outfits are groupings, not extra inventory.
- **By cube** treats outfits as cube-like groups (same section language).
  They are **not** real cubes. Empty outfits still render. A shared item
  can appear under its outfit group **and** its cube group; packed is
  still one flag on that item id. Unsorted-only-in-outfit rows stay
  under the outfit, not Unsorted.
- **Cube templates are additive across trips.** Assigning or creating an
  item into a cube / add-on on a trip **appends** that label to
  `pc_cubes` (`syncOfficialCubeFromTrip`) so the next trip gets it —
  including Basics / `includeByDefault` / tagged cubes. The write GETs
  the official row via `/api/packing-cubes?route=cubes&id=` (so a
  `/api/pc-cubes` rewrite cannot drop `id`), recovers `{ cube }` or the
  matching row from a list-shaped `{ cubes }` response, appends missing
  labels, PATCHes immediately, and updates catalog/cache from the
  response. Errors toast. Adding a label on the official cube (Edit
  cube / My Cubes) copies **only that new label** onto every suitcase
  whose `cubeIds` already include the cube (`propagateOfficialCubeToTrips`,
  deduped by `itemKey`). Add-on items go only to trips that have that
  add-on enabled. Trips that do not include the cube are left alone.
  A trip-list delete is not re-added. A one-time boot backfill
  (`CUBE_TEMPLATE_BACKFILL` on `prefs`) unions already-filed trip labels
  onto official cubes so My Cubes catches up after the persist miss;
  it does not re-add rows a trip deleted. Removing or unassigning on List /
  By cube / Organize / outfits is suitcase-only. **The only place that
  deletes an item from the reusable cube is Edit cube.**
- **Locked:** names only for v1. No photo field.
- Remove outfit: grouping gone; items stay on the list and on their dates.
- Delete trip: outfits go with the suitcase.
- Delete cube / detach cube: surviving items keep their outfit membership;
  deleted rows leave outfits on the next prune.

### Search + copy (past outfits)

Search corpus: every `outfit` on every suitcase in `state.suitcases`
except the current one. (Same-user, already loaded — no extra API.)

Haystack per hit: outfit `name`, `event`, parent suitcase `name`, and the
**labels** of its `itemIds`. Case-insensitive `includes`, same idea as
`matchesQuery`.

```js
{
  suitcaseId, suitcaseName,
  outfitId, name, event,
  labels: ['Navy suit', 'White shirt'],
}
```

`copyOutfit(..., { addMissing })`:

1. New outfit on the current suitcase (new uuid). Copy `name` + `event`.
   `date` starts `null` (dates don't transfer across trips).
2. For each source label, find a current item with the same `itemKey`.
   If found, add its id. If not and `addMissing`, `addItem` then add the
   new id. If not and `!addMissing`, skip.
3. Never call `cubesApi.create`. Never attach a cube.

Sort: array order of trips (already how they are listed).

---

## 9. Edge cases

- **Beta off with leftover data.** Days/outfits remain in JSON. List /
  By cube ignore `dates`. Outfits stay visible. Turning beta on restores
  By day.
- **Stored view is `day` while beta is off.** Snap to `list`.
  Stored `outfits` is kept.
- **Item deleted.** Strip from outfits inside `removeItem`.
- **Date deleted.** That date only; outfits on it become `date: null`;
  items lose that one date and may remain on other dates.
- **All days removed.** `days: []`; every `item.dates` clears; outfits
  keep names/items, `date` null.
- **Duplicate labels on the list.** Outfits bind **ids**. Copy-from-past
  matches the **first** current item with that `itemKey`.
- **Quick-add while on By day / Outfits.** New item lands with `dates: []`
  (Unassigned tray). Do not auto-assign to the last focused date in v1.
- **50-suitcase cap** (already on the API). Search only sees those.
- **Offline / 401.** Same as today.
- **PWA / iOS 16px.** New inputs use `.pc-input`.
- **Empty trip.** By day still shows start/end + add-date. Outfits shows
  New outfit + search. Neither requires cubes or list items (empty outfit
  allowed).
- **includeByDefault cubes.** New trips still seed cubes; they do not
  seed days or outfits.
- **Range longer than 31 days.** Fill until the cap, toast the rest.

---

## 10. Implementation order

1. Model + `normalizeSuitcase` + tests (calendar days, discard numbered
   draft, outfits, copy, delete cascades). No UI.
2. Persist `prefs.betaViews` through hydrate / `suitcasesApi.put`.
3. Badge + extra `listView` values; hide them when beta is off.
4. By day view (range fill, add/remove dates, assign items).
5. Outfits view (create/edit/remove, assign to a date).
6. Past-outfit search + copy confirm.
7. Edge-case pass: delete item / date / trip; beta off/on; mobile toolbar
   wrap.

Do not add a Vercel function. Do not put this under `/lib/`. Do not
reintroduce a catalog or guest mode.

---

## 11. Open questions

1. **Days: numbered vs calendar-first.** **Decided (Karan, 27 Aug 2026):
   calendar-first.** `YYYY-MM-DD` is the identity. Display is date /
   weekday. "Day 2" may be derived from `startDate` only. The numbered
   `{ id, n }` / `dayIds` draft is discarded (§5.1).
2. **Can an item be on two outfits the same day?** **Yes** (locked).
3. **Photo on an outfit, or names only?** **Names only** for v1.
4. **Is beta a hidden flag, a settings toggle, or a badge on the view
   switcher?** **Badge on the view switcher**, persisted per-user as
   `prefs.betaViews`.

---

## 12. Explicitly out of scope (v1)

- Sharing outfits or days with another user
- Printing / PDF day sheets
- Auto-deleting dates that fall outside a newly shrunk range
- Drag-and-drop between days
- Weather, destination, or packing suggestions
- Photos
- Making an outfit into a cube
- Server-side search (the 50-trip blob is the corpus)
