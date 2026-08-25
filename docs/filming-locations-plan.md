# I'm Filmin Here — product notes

Status: **live** at `/im-filmin-here/` on [inaayat.xyz](https://inaayat.xyz)
Auth: **none.** Static page, no serverless function, no Neon.

This started as a plan for a hand-curated map of 36 Upper West Side blocks. That
was too light, and the pivot was to build the real thing: all of Manhattan, live
from the city's API, no curation step. What follows is what shipped and why —
the UWS-box plan is gone, not deferred.

---

## One sentence

Every film, TV, and music-video shooting permit the city issued in Manhattan,
drawn on the stretch of street it actually closed.

---

## Decisions

| Decision | Call |
|----------|------|
| Name | **I'm Filmin Here** (`/im-filmin-here/`) |
| Geography | **All of Manhattan** |
| Permit data | **Live** from the NYC Open Data SODA API on every filter change — not a committed snapshot |
| Serverless functions | **Zero.** The dataset sends `Access-Control-Allow-Origin: *`, so the browser queries it directly |
| Map | MapLibre GL + OpenFreeMap `positron`, same idiom as `/world-in-nyc/` |
| Categories | Television, Film, Music Video |
| Event types | Shooting Permit, DCAS Prep/Shoot/Wrap Permit |
| Excluded | Theater load-in/load-out, Rigging, and `subcategoryname` in News / Short / Student Film |
| Date presets | Anchored on the **newest permit in the data**, never on today |
| Street geometry | **Committed** Manhattan centerline + intersection index (`data/streets.json`) |
| Production titles | **There are none.** The dataset has no titles and the UI never implies otherwise |
| Curated famous-scene layer | Dropped. Permits are measurement; curation was going to be a different product |

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

For the same reason the page opens on the **whole window the city still holds**
rather than a trailing year. A year is 837 permits and 2,165 stretches; the full
window is 3,260 and 5,214. Of the ~1,030 250m cells in Manhattan that contain any
street at all, 67% contain at least one shoot — the remaining third is genuinely
empty, not missing.

**97.5% of segment mentions place**, 86% as exact block faces. The rest are
reported in the rail with the street names behind them — mostly shoots in another
borough filed on a Manhattan permit. A map that silently drops a chunk of its
input looks exactly like a map that doesn't.

---

## What the data is, and isn't

| Reality | Consequence |
|---------|-------------|
| **No production titles, ever.** MOME withholds them | The map says an episodic TV shoot held a block, never which show. The About panel says so out loud |
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
├── index.html          ← map shell, filters, detail rail
├── app.css
├── app.js              ← MapLibre wiring, live fetch, rollup rendering
├── streets.js          ← name normalizer + intersection index (pure, tested)
├── permits.js          ← SoQL, ParkingHeld parsing, rollup (pure, tested)
├── icon.svg
└── data/
    └── streets.json    ← generated; refresh with the pull script
```

Site conventions this respects:

- Browser modules stay under `/im-filmin-here/`. **Nothing in `/lib/`** —
  `middleware.js` 404s that path in production, and
  `node scripts/test-public-imports.mjs` guards it.
- `streets.js` and `permits.js` are dependency-free ESM with no `node:` imports,
  because the pull script and the browser both load them.
- No new `api/*.js`. Still 10 of the 12 functions the Hobby plan allows.

Tests: `node scripts/test-im-filmin-here.mjs` covers normalization, ParkingHeld
parsing, the SoQL cut (including that theater, rigging, and News cannot get in),
slicing, the rollup, and landmark spot-checks against the committed grid with a
bound on how long a crosstown block may measure.

---

## Ideas not taken

- **Guessing titles.** Cluster permits into campaigns, score against production
  windows scraped from Wikipedia, show a confidence badge. Interesting, and still
  a guess on top of a guess. It needs a bridge source (the sites that publish
  daily filming schedules carry title + street + date) to validate against before
  it earns a place.
- **A curated famous-scene layer.** Editorial, not measurement. It was the
  original plan and it is a different product; the contrast between "blocks
  tourists visit" and "blocks that get closed" only works if the second one is
  real first.
- **Other boroughs.** The parser is borough-agnostic; only the committed grid is
  Manhattan. Brooklyn is a re-run of the pull script and a bigger JSON file.
- **IMDb locations.** Richest source by far, and their terms prohibit scraping.
