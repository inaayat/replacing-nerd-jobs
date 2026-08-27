# I'm Filmin Here — product notes

Status: **live** at `/im-filmin-here/` on [inaayat.xyz](https://inaayat.xyz)
Auth: **none.** Static pages, no serverless function, no Neon.

Two pages, one product:

1. **Locations** (`/im-filmin-here/`) — the default. A curated map of named
   film and TV places from W 59th to W 145th (Upper West Side, Central Park,
   Morningside Heights, Harlem). In beta and a growing list. The camera fits
   the current pins so the map stays walkable; it zooms out only when farther
   places are added.
2. **NYC Film Permit Map** (`/im-filmin-here/permits/`) — the original
   city-wide layer: every Manhattan shooting permit, live from the city's API,
   no production titles.

The permit map shipped first because a 36-block curated list felt too light.
The curated list is back as the default because the city-wide map is hard to
walk and still cannot name a show. Both stay.

---

## Locations (default)

| Decision | Call |
|----------|------|
| Geography | W 59th–W 145th (UWS, Central Park, Morningside, Harlem) |
| Data | Committed catalog `data/locations.json` (one place, many productions) |
| Camera | `boundsOf` the current pins, padded. Corridor-precision pins stay visible but do not set the view |
| Copy | “In beta and a growing list” |
| Titles | Yes — this page is researched examples with sources |
| Serverless | Zero |

`locations.js` is dependency-free ESM: normalize, filter, stats, bounds,
GeoJSON. The browser and `scripts/test-im-filmin-here.mjs` both import it.
Do not put it under `/lib/`.

Adding a place is an edit to `data/locations.json`. A pin farther north or
south than today's list is what opens the camera — there is no hardcoded
neighborhood box in the page besides a test-time UWS sanity range.

---

## NYC Film Permit Map

### One sentence

Every film, TV, and music-video shooting permit the city issued in Manhattan,
drawn on the stretch of street it actually closed.

### Decisions

| Decision | Call |
|----------|------|
| Path | `/im-filmin-here/permits/` |
| Geography | **All of Manhattan** |
| Permit data | **Live** from the NYC Open Data SODA API on every filter change — not a committed snapshot |
| Serverless functions | **Zero.** The dataset sends `Access-Control-Allow-Origin: *`, so the browser queries it directly |
| Map | MapLibre GL + OpenFreeMap `positron`, same idiom as `/world-in-nyc/` |
| Categories | Television, Film, Music Video |
| Event types | Shooting Permit, DCAS Prep/Shoot/Wrap Permit |
| Excluded | Theater load-in/load-out, Rigging, and `subcategoryname` in News / Short / Student Film |
| Date presets | Anchored on the **newest permit in the data**, never on today |
| Street geometry | **Committed** Manhattan centerline + intersection index (`data/streets.json`) |
| Production titles | **There are none.** The dataset has no titles and this page never implies otherwise |

Two things are deliberately split. Permits are live because they change daily and
are the reason to visit. The street grid is committed because it does not change
daily, and because the all-pairs intersection math behind it is not something to
redo in a phone browser on every page load.

---

## The hard part: prose with no coordinates

A permit's location is a string:

```
WEST   88 STREET between WEST END AVENUE and RIVERSIDE DRIVE,  WEST END AVENUE
between WEST   89 STREET and WEST   86 STREET,  BROADWAY between WEST   91
STREET and WEST   89 STREET
```

No latitude, no longitude, several segments packed into one field, irregular
internal whitespace, and — note the second one — cross streets in no particular
geographic order. Meanwhile the Street Centerline dataset (`inkn-q76z`) has the
geometry but exposes **no cross-street columns**, so there is no key to join on.

What the two sides actually key on is a normalized street name plus intersections
computed from the geometry:

1. `scripts/pull-im-filmin-here-streets.mjs` pulls Manhattan centerline segments
   (`rw_type` 1 and 2), chains them into continuous runs per street name, and
   finds every crossing between runs of different streets — real geometric
   crossings, plus endpoints that stop within 12m of another street. That second
   pass is what makes T-junctions and the broken-up Broadway roadbed resolvable.
   Output: 914 street names, 1,962 runs, 5,040 intersections, 680KB committed.
2. `im-filmin-here/streets.js` normalizes names on **both** sides with the same
   function — `WEST   48 STREET` and `W  48 ST` both become `W 48 ST` — then
   slices the block face out of the run between the two intersections.

Using one normalizer on both sides is the whole trick. If the permit side and the
centerline side ever normalize differently, the join rots silently.

**Aliases are alternates, not replacements.** Sixth Avenue is signed as Avenue of
the Americas (1,572 mentions, the single biggest win), Seventh becomes Adam
Clayton Powell Jr in Harlem, Lenox is Malcolm X — and West 59th Street genuinely
exists west of Columbus Circle while being Central Park South to the east. A
rewrite would break the second case; an alternate tried after the primary does
not.

### Placement tiers

How a location was found is part of what it means, so it travels with the
feature:

| Tier | Meaning |
|------|---------|
| `block` | Both corners on the same run — a real block face |
| `span` | A straight line between two intersections, when the run can't be trusted |
| `point` | One corner known; the intersection only |

A run chained through a fork can double back on itself, which would draw a block
face as a mile-long detour. A path more than 2.5× the straight-line distance
between its ends is demoted to `span` instead.

### Dots and lines

Every placed stretch is drawn twice: a **dot** at its midpoint and, when there is
a stretch to draw, the **line** along the street. The dot is not decoration. A
block face is a couple of hundred metres, which at city zoom is a hairline that
reads as empty map — the first version looked like nothing had ever been shot in
most of Manhattan. The dot answers "was anything shot here" at any zoom; the line
answers "how much of the street was closed" once you are near enough to care.
Both are sized by permit count.

For the same reason the permit page opens on the **whole window the city still
holds** rather than a trailing year. A year is 837 permits and 2,165 stretches;
the full window is 3,260 and 5,214. Of the ~1,030 250m cells in Manhattan that
contain any street at all, 67% contain at least one shoot — the remaining third
is genuinely empty, not missing.

**97.5% of segment mentions place**, 86% as exact block faces. The rest are
reported in the rail with the street names behind them — mostly shoots in another
borough filed on a Manhattan permit. A map that silently drops a chunk of its
input looks exactly like a map that doesn't.

---

## What the permit data is, and isn't

| Reality | Consequence |
|---------|-------------|
| **No production titles, ever.** MOME withholds them | The permit map says an episodic TV shoot held a block, never which show. Named scenes live on the Locations page |
| The table is a **rolling window** (currently 2023-01 onward, ~3,400 Manhattan shooting permits in the cut) | Older shoots age out. The page reports the window the city currently holds rather than implying full history |
| `zipcode_s` lists every ZIP a permit touches | Never filter geography by ZIP — an East Side shoot leaks into a West Side query. Filter on parsed segments |
| Parking is held for **trucks**, not the set | A pin is where the crew parked, which is routinely around the corner from the camera. The About panel says this too |
| Theater is the second-largest Manhattan category | Excluded, or the map is just Broadway load-ins |
| Permits stop being filed **weeks before the present** (latest is ~3 months back) | Windows anchor on the newest row in the data. Anchored on today, "3 months" returned **one permit** |
| 121 permits have no `startdatetime` and 31 no `enddatetime` | A plain overlap test drops all 152 from every window in silence. Each is judged on the timestamp it has |

---

## Layout

```
/im-filmin-here/
├── index.html          ← locations shell (default, 59th–145th)
├── app.js              ← MapLibre wiring for the curated pins
├── locations.js        ← catalog helpers: filter, bounds, GeoJSON
├── app.css             ← shared chrome
├── streets.js          ← name normalizer + intersection index (pure, tested)
├── permits.js          ← SoQL, ParkingHeld parsing, rollup (pure, tested)
├── layers.js           ← MapLibre layer defs for the permit map
├── icon.svg
├── permits/
│   ├── index.html      ← NYC Film Permit Map
│   └── app.js          ← live fetch + rollup rendering
└── data/
    ├── locations.json  ← curated 59th–145th catalog
    └── streets.json    ← generated; refresh with the pull script
```

Site conventions this respects:

- Browser modules stay under `/im-filmin-here/`. **Nothing in `/lib/`** —
  `middleware.js` 404s that path in production, and
  `node scripts/test-public-imports.mjs` guards it.
- `streets.js`, `permits.js`, and `locations.js` are dependency-free ESM with
  no `node:` imports.
- No new `api/*.js`. Still 10 of the 12 functions the Hobby plan allows.

Tests: `node scripts/test-im-filmin-here.mjs` covers normalization, ParkingHeld
parsing, the SoQL cut (including that theater, rigging, and News cannot get in),
slicing, the rollup, landmark spot-checks against the committed grid, and the
location catalog (108 scenes, bounds stay 59th–145th, a farther pin opens
the camera).

---

## Ideas not taken

- **Guessing titles on the permit map.** Cluster permits into campaigns, score
  against production windows scraped from Wikipedia, show a confidence badge.
  Interesting, and still a guess on top of a guess.
- **Other boroughs on the permit map.** The parser is borough-agnostic; only
  the committed grid is Manhattan. Brooklyn is a re-run of the pull script and
  a bigger JSON file.
- **IMDb locations as a live scrape.** Richest source by far, and their terms
  prohibit scraping. The Locations catalog cites public IMDb pages by URL.
