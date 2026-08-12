# AMC A-Lister — Bug Bash & UX Review

Review of `https://www.inaayat.xyz/amc-a-lister` against the deployed source
(`origin/main` @ `af17a66`, verified byte-identical to what's live).

Scope: `amc-a-lister/**`, `api/alist.js`, `lib/a-list.js`, `lib/a-list-billing.js`,
`vercel.json`, service worker. Pages reviewed: Log, Want, TV (beta), Statistics,
Leaderboard, Member, Settings, Sign-in, Bulk ratings.

---

## Summary

| # | Severity | Area | Issue |
|---|---|---|---|
| 1–4 | **P0** | Privacy | Every user's identity and full watch diary is readable by anyone, unauthenticated, with no opt-in |
| 5–16 | P1 | Correctness | Timezone date bug, silent wrong-movie tagging, silent price-tier data loss |
| 17–20 | P1 | Performance | Full watch history fetched 2× per page load; up to 22 sequential TMDB calls inside one GET |
| 21–33 | P2 | UX / flow | Want list never clears, no first-run state, orphaned pages, no import undo |
| 34–39 | P2 | Accessibility | `aria-hidden` over focusable inputs, no reduced-motion, no keyboard nav in comboboxes |
| 40–44 | P2 | Ops | Cache-first SW with manual versioning, vulnerable CDN dep, 502-for-everything |
| 45 | P1 | Ops | `/lib/*.js` server source was served publicly as static files |
| 46 | P1 | Correctness | Watchlist titles with no release date were labelled as already released |

**Status: all phases implemented** on `alist-privacy-and-bugfixes`. Two items
were resolved differently from the original plan — see *Deviations* at the end.

---

## P0 — Privacy: the public API leaks everything

**Verified live, no credentials used.**

`GET /api/alist-leaderboard` returns, to anyone:

```json
{"entries":[{"userId":"497d6543-…","displayName":"Inaayat Gill","totalSeen":102,
"totalSavings":136631,"totalCharged":211854,…}, {"displayName":"Karan Narula",…},
{"displayName":"Aditi Vimawala",…}]}
```

Feeding one of those ids to `GET /api/alist-user-profile?user=<id>` returns that
person's **complete diary**:

```json
{"watched_on":"2026-08-11","title":"One Night Only","location":"AMC 34th Street 14",
 "auditorium":"2","seat":"F7","rating":3.5,"in_theaters":true}
```

Date + theater + auditorium + seat, for all 80 of their screenings. That is a
physical-location trail for a named real person, published to the open internet.

**1. `handleUserProfile` / `handleLeaderboard` require no auth** —
`api/alist.js:559-583` and `:617-631` call `requireDbRead()`, which only checks
that `DATABASE_URL` is set. `optionalAuthUserId` is used for highlighting "you",
never for access control.

**2. `handleLeaderboardCompare` accepts an arbitrary `you` id** —
`api/alist.js:585-615`. `you` comes from the query string and only falls back to
the session. Anyone can diff any two members' taste profiles.

**3. Display name falls back to the email local-part** — `lib/a-list.js:106-114`.
A user who never opens Settings has `you@gmail.com` published as `you`.

**4. The profile payload includes home/off-theater watches, seats and auditoriums** —
`lib/a-list.js:373` maps `watchRows` (all watches), not `theaterRows`. Stats
correctly exclude home watches; the raw list does not.

There is no opt-in anywhere. `PLAN.md` lists "Public social feed / followers" as
out of scope for v1, and open question #2 ("Public share links — yes/no?") was
never answered — this shipped as "yes, for everyone, by default."

**Fix** — see [Phase 0](#phase-0--consent-model-and-lockdown-do-first-ship-alone)
for the full design. In short: nothing is public unless the user opts in, the
public identity is a self-chosen username rather than a real name, and theaters
can be withheld separately.

---

## P1 — Correctness

**5. "Today" is computed in UTC — wrong date for evening screenings.**
`quick-log.js:9` and `:244`, `add.js:38`, `settings.js:103,182`,
`watchlist-ui.js:6`, `a-list-billing.js:195`.

```js
const today = new Date().toISOString().slice(0, 10);
```

At 8pm ET on Aug 10, this returns `2026-08-11`. Evening screenings are the normal
case for this app, so the pre-filled date is wrong for roughly a third of every
day, and the user has to notice and correct it. `computeSummary` has the same bug
for "current period," flipping the month a day early. Use a local-date helper
(`toLocaleDateString('en-CA')` or manual `getFullYear/getMonth/getDate`).

**6. Titles get silently tagged with the wrong movie.**
`api.js:64-81`. When the user types a title without picking from the dropdown,
`movieApi.resolve` falls back to substring matching in **both directions**:

```js
return rt.includes(norm) || norm.includes(rt);
```

`norm.includes(rt)` means a short result title matches any longer query
containing it as a substring — "Titanic" contains "it". The resolved `tmdb_id` is
attached with no confirmation, which then drives the poster, runtime, genre, cast
and the rewatch grouping. Called from `quick-log.js:233`, `watch-form.js:172`,
`watchlist-ui.js:641`. Restrict to exact (normalized) match, else leave `tmdb_id`
null and show an "unlinked" affordance on the row.

**7. Settings silently discards price tiers, then reports success.**
`settings.js:203-211`:

```js
cents: Math.round(Number(row.querySelector('.tier-cents').value) * 100)
…
.filter((tier) => tier.effective_on && tier.cents > 0)
```

The field is `type="text"` and labelled "Monthly price", so `$27.99` is a natural
entry — `Number("$27.99")` is `NaN`, the row is dropped by the filter, and the
status line still says "Saved." The rest of the app already has
`parseMoneyInput()` (`format.js:51`) which strips non-numerics. Use it, and
validate loudly instead of filtering silently. Also reject duplicate
`effective_on` values.

**8. Billing charges months with no screenings, contradicting `PLAN.md`.**
`a-list-billing.js:122-134` enumerates *every* calendar month from the first
watch to today. `PLAN.md:258` specifies `totalBilled = sum of distinct
chargeMonth bills`. The implementation is arguably more truthful about a real
subscription, but there is no way to record a cancelled or paused membership, so
a gap year is billed at full price and all-time savings are understated with no
explanation. Needs a product call: either bill only active months, or add
membership start/end/pause dates to Settings. Whichever way, make the two agree.

**9. "Avg rating" on Statistics is biased low by up to 0.5★.**
`insights.js:509-520` averages the *whole-star buckets*, not the ratings. A user
who rates everything 4.5 sees "4★". The rounding caveat is disclosed inside the
Rating profile section but not on the spotlight card. Compute from raw ratings.

**10. The xlsx importer shifts dates and trusts column positions.**
`import-xlsx.js:20-24` — `cellDates: true` yields local-time `Date`s, and
`value.toISOString().slice(0,10)` shifts them back to UTC, moving any pre-noon
date to the previous day for users west of UTC. `:39-44` — columns are hardcoded
indices (`row[0]`, `row[3]`, `row[4]`…) with `rows.slice(1)` blindly dropping the
header. A re-ordered sheet imports garbage into the wrong fields with no error.
Read the header row and map by name; format dates from local components.

**11. Delete on the Log page fails silently.** `log.js:319-332` — no `try/catch`
around `watchesApi.remove`. A network or 502 failure rejects inside the handler,
the row is never removed, and nothing is shown to the user.

**12. No duplicate-submit guard.** The quick-log submit path awaits
`movieApi.resolve` before `create` (`quick-log.js:232-237`), so there's a ~1s
window where a second click creates a second screening. Same in
`watch-form.js:151` and `watchlist-ui.js:635`. Sign-in already does this right
(`sign-in.js:131-143`) — copy that pattern.

**13. Bulk ratings loses unsaved work.** `bulk-ratings.js:128` renders
"N unsaved changes" but nothing registers `beforeunload`, so navigating away
discards them without a prompt.

**14. Sign-up can store a null token.** `sign-in.js:159-162` calls
`storeAuthToken(token)` and redirects without the null check that
`finishWithToken` does, so a signup that returns no token lands on Settings and
immediately bounces back to sign-in with no explanation.

**15. Break-even assumes a $15 ticket.** `a-list-billing.js:199` —
`Math.ceil((currentBill - currentCharged) / 15)`. The user's own `avgTicket` is
right there (~$20.77 for the owner). Note this value is currently computed but
never displayed — the sidebar dropped the "This period" block.

**16. Theater names are never canonicalized.** `a-list-billing.js:225-252` keys
on the raw string, so "AMC Lincoln Square 13" / "AMC Lincoln Square" /
lowercase variants become separate theaters and split the stats. The autocomplete
(`theater-suggest.js`) suggests past values but doesn't prevent new variants.
Normalize (trim + case-fold) for grouping, keep the display string.

---

## P1 — Performance

**17. Each page load fetches the full watch history twice and the summary twice.**

`bootPage` → `ensureMonthlyRateSetup` (`nav.js:194-207`, membership) →
page render → `wireQuickLog` → `loadUserTheaters` (`theater-suggest.js:26-34`,
**full watches list**) → `populateSidebarStats` (summary).

So Statistics issues: membership, summary, watches, watches, summary — five
requests, two of them the expensive one, and `loadUserTheaters` downloads 100+
rows purely to extract distinct theater names. Fetch once per page and share, or
add a cheap `route=theaters` endpoint.

**18. `GET /watches` does up to 22 sequential TMDB round-trips.**
`api/alist.js:168-244`: 12 `getMovieDetails` calls, then up to 10 `searchMovies`
calls, each awaited in a loop, on every list request. `vercel.json` sets
`maxDuration` only for `api/plot-points.js`, so `api/alist.js` runs on the
default limit. Move enrichment to a background/one-shot backfill, or batch it and
cap it hard.

**19. The log re-renders everything on every keystroke.** `log.js:75-79` rebuilds
the entire table's `innerHTML` and re-wires every listener on each `input` event
(`:115-118`), for the full 100+ row list. Debounce the search, or filter by
toggling row visibility.

**20. Import inserts row-by-row.** `api/alist.js:779-821` — one `INSERT` per
watch, awaited serially, with no cap on array length. A 100-row sheet is 100
round-trips inside one function invocation.

---

## P2 — UX and flow

**21. Logging from the Want list doesn't remove it from Want.**
`watchlist-ui.js:515-526` calls `prefillQuickLog`, and the success handler on
that page is `populateSidebarStats` only (`what-to-watch.js:22`). The movie you
just watched stays on "want to watch" forever. This is the single most-noticed
flow gap: the list only grows. On successful log, remove the matching watchlist
item (match on `tmdb_id`) and confirm it inline.

**22. The Want list accepts duplicates.** `api/alist.js:431-463` — no uniqueness
check on `(user_id, tmdb_id)`. Adding the same movie twice yields two cards.

**23. A brand-new user's empty log says "No matches."** `log.js:125`. The
first-run state should explain the quick-log bar and point at the import, not
imply a failed filter.

**24. The Settings beta toggle writes a status message it then destroys.**
`settings.js:113-121` sets `beta-tv-status` and immediately calls
`location.reload()`, so the text never renders — and the reload discards any
unsaved membership edits on the same page. Re-render the nav in place, or move
the toggle out of the form page.

**25. Import is irreversible with no preview.** `settings.js:149-174` — no row
count confirmation, no dry-run, and there is no bulk-delete anywhere in the app
to recover from a bad import. Show a parsed-row preview and require confirmation.

**26. No password reset.** `sign-in.js` offers sign-in and sign-up only.

**27. `saw_alone` is collected only by the importer.** It was removed from the
quick-log form but still lives in the schema (`lib/db.js:69`), every query, the
API (`api/alist.js:157`) and the public profile — and it's not editable in
`add.js`, `watch-form.js` or `quick-log.js`. Imported rows have real values that
no UI can show or change. Either restore the control or drop the column.

**28. Three orphaned pages ship and are precached.**
- `insights.html` — duplicate of `statistics.html`, same `engine/insights.js`.
  Two live URLs for one page.
- `add.html` + `engine/add.js` (185 lines) — nothing links to it.
- `log.html` — a redirect stub to `/amc-a-lister/`.

All three sit in the service worker's `PRECACHE` list, so every visitor
downloads them. Delete, and drop them from `PRECACHE`.

**29. Orphaned label in the watch edit form.** `watch-form.js:24-27` puts
`data-theater-only` on the `<input>` instead of the wrapping `.al-field`, so
un-checking "In theaters" hides the ticket input but leaves the
"Ticket value ($)" label floating. Every other field marks the wrapper.

**30. The edit-form search dropdown won't close on an outside click.**
`watch-form.js:145-147` binds the dismiss handler to the form, not the document —
inconsistent with `quick-log.js:207`.

**31. TV beta is hidden from the nav but `tv.html` stays reachable** and
precached (`nav.js:34-39` filters the nav only).

**32. Statistics has no year or date-range filter** — "By month" is one
unbounded table across all history.

**33. Rewatch dates drop the year.** `insights.js:304` — `d.slice(5)` yields
`07-28`, ambiguous for a movie seen across two years, which is exactly the
rewatch case.

---

## P2 — Accessibility

**34. `aria-hidden="true"` sits on a container full of focusable inputs.**
`quick-log.js:43` — the collapsed `#ql-expand` holds format, auditorium, seat,
rating, DNF and notes. It collapses via `grid-template-rows: 0fr` (`app.css:309`),
not `display:none`, so those inputs remain tabbable while announced as hidden.
Use `inert` (or actually remove them from the tab order) instead.

**35. No `prefers-reduced-motion` anywhere** in 2000+ lines of `app.css`, despite
HUD count-ups (`nav.js:300-312`), meter width transitions (`insights.js:45-50`)
and `scrollIntoView({behavior:'smooth'})` (`quick-log.js:277`).

**36. The movie/theater search dropdowns have no keyboard support.**
`quick-log.js:172-205`, `theater-suggest.js:44-77` — no arrow-key navigation, no
`role="combobox"`/`aria-expanded`/`aria-activedescendant`. Pressing Enter with the
list open submits the form instead of choosing the highlighted result.

**37. `role="button"` rows contain nested `<button>` elements.** `log.js:161` and
`:176-179`, `watchlist-ui.js:372`. Invalid interactive nesting; the handler works
around it with `e.target.closest('.al-row-actions')`.

**38. The column header row is `aria-hidden="true"`.** `log.js:128` — screen
reader users get nine unlabelled values per row.

**39. `confirm()` for every destructive action** (`log.js:322`,
`watchlist-ui.js:207,541`), with no undo anywhere.

---

## P2 — Ops and hardening

**40. The service worker is cache-first with a hand-bumped version.**
`service-worker.js` returns `cached || network` and only purges on a `CACHE`
string change (currently `v13`). If a deploy ships without bumping it, users hold
stale JS indefinitely — and `PRECACHE` omits most engine modules (`log.js`,
`quick-log.js`, `watchlist-ui.js`, `what-to-watch.js`, `settings.js`,
`leaderboard.js`, `member.js`, `tv.js`, `watch-form.js`, `theater-suggest.js`),
so those are runtime-cached separately and can mix old and new module versions.
Switch to network-first (or stale-while-revalidate with a reload prompt) for
HTML and JS, and derive the cache key from the deploy SHA.

**41. `xlsx@0.18.5` is pulled from esm.sh at runtime.** `import-xlsx.js:4`. That
version predates the fixes for CVE-2023-30533 (prototype pollution) and the
ReDoS advisory; it's also an external CDN dependency inside a PWA that otherwise
works offline. Vendor a current version locally.

**42. Error messages are interpolated into HTML unescaped.** `nav.js:245` and
`:258` — `err.message` originates from `data.error`, which for a DB failure can
echo the value the user submitted. Self-inflicted only, but `escapeHtml` is
already imported elsewhere; use it.

**43. Almost every failure returns 502.** `api/alist.js` wraps handlers in
`catch (err) { res.status(502).json({ error: err.message }) }`, so a malformed
date or an out-of-range rating reaches Postgres and surfaces as a 502 with raw
driver text in the UI.

**44. No server-side validation.** `normalizeBody` (`api/alist.js:148-166`) never
checks that `watched_on` is a date, that `rating` is 1–5 (the column is
`NUMERIC(2,1)`, so `rating: 500` is a DB error), or that `ticket_cents` is a
non-negative integer. `handleImport` has no array size cap.

---

## Plan

### Phase 0 — Consent model and lockdown (do first, ship alone)

Three new columns on `alist_membership`, added via `ALTER TABLE … ADD COLUMN IF
NOT EXISTS` in `ensureSchema()` (`lib/db.js:48-59` already establishes that
pattern):

```sql
ALTER TABLE alist_membership
  ADD COLUMN IF NOT EXISTS username             TEXT;
ALTER TABLE alist_membership
  ADD COLUMN IF NOT EXISTS public_profile       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alist_membership
  ADD COLUMN IF NOT EXISTS public_hide_theaters BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS alist_membership_username_lower
  ON alist_membership (lower(username)) WHERE username IS NOT NULL;
```

**0.1 — Username, separate from the personal name.** The app ends up with three
names, each with one job:

| Field | Source | Visibility |
|---|---|---|
| `users.name` | Neon Auth signup | Private. Never leaves the API. |
| `alist_membership.display_name` | Settings | Private. How the app greets you. |
| `alist_membership.username` | Settings / onboarding | **The only thing shown publicly.** |

Rules: 3–24 chars, `[a-z0-9_]`, case-insensitively unique, and **optional** —
leaving it blank shows an opted-in member as their **first name only**. Validated on the server in `handleMembership`
(`api/alist.js:699`) — a unique-violation returns 409 with "That username is
taken", not the current 502-with-driver-text.

`displayNameForUser` (`lib/a-list.js:106-114`) is replaced for all public paths
by `publicDisplayName()`: username, else first name, else `Member`. The old chain
ended at the **email local-part** and included surnames; neither can now reach a
public response by any route (an email sitting in the name field is rejected
too). The opt-in — not the handle — is what protects people.
**Existing `display_name` values are deliberately not copied into `username`**:
today's leaderboard shows "Inaayat Gill" / "Karan Narula", which is exactly the
real-name exposure this is meant to end. Each user picks a handle explicitly.

**0.2 — Opt-in, defaulting to off.**
`public_profile` defaults to `false`, so **on deploy the leaderboard goes empty
until each of the three existing users opts in.** That's the intended behaviour
and worth expecting rather than debugging.

- `getLeaderboard` (`lib/a-list.js:377-436`) filters to
  `public_profile = true AND username IS NOT NULL`. As a bonus this fixes a real
  cost: that function currently loads *every watch row for every user* into
  memory on every request.
- `getUserPublicProfile` returns `null` for a non-public user → 404, identical to
  a non-existent id, so opt-out status isn't probeable.
- `compareUsers` requires both sides public (or the requester to be one of them).

**0.3 — Hide theaters, independently.** `public_hide_theaters` is a second
toggle, meaningful only while `public_profile` is on. When set, the public
payload omits `location` from every watch, and `member.js:82-83` drops the
theater filter `<select>` when no locations are present.

Regardless of either toggle, `seat`, `auditorium` and off-theater
(`in_theaters === false`) rows are **always** stripped from public responses —
`lib/a-list.js:373` currently maps `watchRows`, which includes home watches.
Seat + auditorium + timestamp is a location trail with no upside on a
leaderboard.

**0.4 — Settings UI.** A new "Public profile" panel in `settings.js`, above the
import sections:

```
Public profile
[ ] Show me on the public leaderboard
    Anyone with the link can see your username, screening counts,
    savings, and average rating — no email, no real name, no seats.

    Username   [ ____________ ]   your public handle
    [ ] Hide which theaters I go to
```

The username field and the hide-theaters checkbox are disabled while the opt-in
is unchecked. Submitting with the opt-in on and no valid username blocks and
explains, rather than silently saving a partial state (the existing
`collectTiers` silent-drop bug, finding 7, is the same failure mode).

**0.5 — At account creation.** `sign-in.js:159-162` already sends new signups to
`settings.html?setup=rate`. That screen becomes a two-step onboarding — monthly
rate, then the same Public profile panel, opt-in **unchecked**. Skipping it is
allowed and leaves the account private; `rate_setup_complete` remains the only
thing gating the app.

**0.6 — Auth on the endpoints.** Require a session on `user-profile`; delete the
`you` query param from `leaderboard-compare` (`api/alist.js:598-605`) and take
the id from the token only.

### Phase 1 — Correctness
5. Local-date helper; replace all six `toISOString().slice(0,10)` "today" sites.
6. Tighten `movieApi.resolve` to exact matches; mark unlinked rows in the UI.
7. `parseMoneyInput` in `collectTiers`; validate loudly; reject duplicate dates.
8. Decide the billing-gap question (bill-active-months vs. membership date
   range), implement it, and reconcile `PLAN.md`.
9. Average ratings from raw values, not buckets.
10. Header-mapped xlsx import with local-date parsing.
11. `try/catch` + user-visible error on log delete.
12. Disable submit buttons while in flight (all four forms).
13. `beforeunload` guard on bulk ratings.
14. Null-token check on the sign-up path.
15. Break-even from the user's own average ticket.
16. Case-fold + trim theater keys for grouping.

### Phase 2 — Performance
17. One watches fetch per page; add a lightweight theaters endpoint.
18. Move poster enrichment out of `GET /watches`; set `maxDuration` for
    `api/alist.js`.
19. Debounce log search.
20. Batch import inserts; cap the array.

### Phase 3 — UX and flow
21. **Rename "Want" → "Coming Soon"** (see below).
22. Remove the item from the list when a watchlist title is logged.
23. Dedupe watchlist adds on `(user_id, tmdb_id)`.
24. First-run empty state on the Log page.
25. Fix the beta toggle reload; move it off the form page.
26. Import preview + confirmation; add a way to undo a bad import.
27. Password reset link.
28. Resolve `saw_alone`: restore the control or drop the column.
29. Delete `insights.html`, `add.html`/`add.js`, `log.html`; prune `PRECACHE`.
30. Fix the ticket-field wrapper and the edit-form dropdown dismissal.
31. Year filter on Statistics; years on rewatch dates.

### Phase 4 — Accessibility and ops
32. `inert` instead of `aria-hidden` on the collapsed quick-log.
33. `prefers-reduced-motion` block covering count-ups, meters, smooth scroll.
34. Combobox semantics + arrow-key navigation in both dropdowns.
35. Unnest the interactive rows; expose the column headers.
36. Network-first service worker keyed on the deploy SHA.
37. Vendor a current `xlsx`.
38. Escape error messages; return real status codes; validate request bodies.

---

## "Want" → "Coming Soon"

Three places carry the name:

| File | Line | Current |
|---|---|---|
| `engine/nav.js` | 11 | `{ href: '…/what-to-watch.html', label: 'Want', id: 'what-to-watch' }` |
| `engine/what-to-watch.js` | 15 | `title: 'Want'` |
| `engine/what-to-watch.js` | 16 | `subtitle: 'Coming soon and already in theaters.'` |

Plus the in-page heading "Want to watch" (`what-to-watch.js:33`), the two
`confirm('Remove from want to watch?')` prompts (`watchlist-ui.js:207,541`), and
the summary line that reads `"N already out · M coming soon"`
(`what-to-watch.js:85-88`).

**Decided:** one listing, no section split, sorted so the soonest upcoming
release is row 1. Already-released titles keep their place in the same list and
carry an "Already out" badge.

```
Coming Soon                        14 titles
──────────────────────────────────────────────
  Avatar: Fire and Ash        Dec 19, 2026
  The Odyssey                 Jul 17, 2027
  Untitled Villeneuve         2027 · date TBA
  Dune: Part Three            Release TBA
  [Already out]  One Night Only   Aug 11, 2026
  [Already out]  Sinners          Apr 18, 2025
  [Already out]  The Godfather    Mar 24, 1972
```

Sort key, in `combinedWatchlistItems` (`watchlist-ui.js:41-43`):

```js
export function combinedWatchlistItems(items, today = todayISO()) {
  return [
    ...sortComingSoon(items, today),            // ascending: soonest first
    ...sortAlreadyOut(items, today).reverse(),  // descending: most recent first
  ];
}
```

`sortComingSoon` already produces the right upcoming order — dated ascending,
then year-only (`${year}-12-31` fallback), then undated (`9999-12-31`), which is
why "date TBA" and "Release TBA" land at the bottom of the upcoming block.
`sortAlreadyOut` is ascending today and just needs reversing.

Changes:

- Nav label (`nav.js:11`) and page title (`what-to-watch.js:15`) → **"Coming Soon"**.
- Subtitle (`:16`) → "What's next, and what's already playing."
- In-page heading "Want to watch" (`:33`) → "Coming Soon".
- `combinedWatchlistItems` reordered as above.
- Add an `Already out` badge in `watchlistViewEntryHtml` (`watchlist-ui.js:365`),
  reusing the existing `al-badge al-badge--muted` style that the Log page already
  uses for its "Off-theater" badge (`log.js:167`) — same visual language.
- Drop the `shadeComingSoon` treatment (`what-to-watch.js:101`,
  `watchlist-ui.js:367-369`). It exists to distinguish unreleased rows, which the
  badge now does from the other direction; shading the majority of the list was
  always the wrong way round.
- `confirm('Remove from want to watch?')` (`watchlist-ui.js:207,541`) →
  "Remove from your list?"
- Summary line (`what-to-watch.js:85-88`) already reads "N already out ·
  M coming soon" — keep, it now matches the badge vocabulary.

Note the ordering depends on `release_date`, which is populated lazily by
`enrichWatchlistRows` (`api/alist.js:379-413`, capped at 12 lookups per request).
Titles that have never been enriched sort as undated and sink to the bottom of
the upcoming block. Worth a backfill pass alongside finding 18.


---

## Findings added during the build

**45. `/lib/*.js` was publicly readable.** `vercel.json` sets
`outputDirectory: "."`, so the whole repo is served statically and
`GET /lib/db.js` returned 200 with the source, as did `lib/a-list.js` with all
its SQL. No secrets are embedded (everything reads `process.env`), but the
server logic had no business being public. `middleware.js` now matches
`/lib/:path*` and 404s it. Verified `/package.json` and `/middleware.js` were
already 404ing.

**46. Undated watchlist titles claimed to be released.** `isAlreadyOut()`
returned `true` when an item had neither `release_date` nor `year`, so an
unlinked title was sorted with the released ones. That became a visible bug once
released rows carry an "Already out" badge — and more common once auto-linking
was tightened to exact matches. Replaced with `releaseState()` returning
`upcoming | released | unknown`; unknown titles sort last and carry no badge.
Caught by the sort test.

---

## Deviations from the plan

**Billing gaps (finding 8) — RESOLVED: the code was right, the doc was wrong.**
Confirmed that billing should charge every calendar month since the first watch,
including months with no screenings — A-List bills you whether or not you go, so
an empty month is a real charge against savings. `billingChargeMonths()` already
did this; `PLAN.md` described the opposite ("sum of distinct chargeMonth bills")
and has been corrected. No behaviour or totals changed.

Still true as a consequence: there is no way to record a cancelled or paused
membership, so a genuine gap bills at full price. Noted in `PLAN.md` as future
work (membership start/end dates), not a defect.

**xlsx (finding 41) — updated, not vendored.** The plan said vendor a current
build locally. SheetJS left npm after 0.18.5, so there is no newer npm version
for esm.sh to serve. `import-xlsx.js` now pulls `xlsx-0.20.3` from the vendor's
own CDN (`cdn.sheetjs.com`), which clears the known advisories. It is still a
runtime CDN import, so the offline-PWA caveat stands.

**Server-side "now" is still UTC.** The client-side date bug (finding 5) is
fixed via `engine/dates.js`. `computeSummary`'s notion of the current month
still comes from the server clock, which is UTC on Vercel, so the current-period
figure can flip a day early at a month boundary. Fixing it properly means
sending the browser's timezone with the request; not done.

**Statistics year filter (finding 32) — ledger only.** The "By month" table now
has a year filter. The other panels are still all-time, because their numbers
come from the server's `summary` payload rather than being recomputed client
side.


---

## Outstanding after the build

Everything else in the plan shipped. These did not, or shipped partially.

**27. Password reset — NOT DONE.** The first attempt linked to `/account.html`,
but that page has no reset flow, and neither `engine/neon-browser-auth.js` nor
`api/auth-login.js` exposes one — the auth layer only does signin/signup via
`loginViaApi`. The link was removed rather than left pointing somewhere useless;
the sign-in page now says plainly that there is no self-serve reset. Building one
means adding a Neon Auth reset flow (send email → token → set new password).

**43. Status codes — PARTIAL.** The paths a user actually hits now return real
codes (400 validation, 401 auth, 409 duplicate, 413 oversized import), but 28
`catch` blocks in `api/alist.js` still collapse everything to 502 with the raw
driver message. Untidy rather than dangerous, since validation now runs first.

**44. Request validation — PARTIAL.** `normalizeBody` (movie watches) validates
dates, rating range, ticket bounds and field lengths. `normalizeTvBody` and the
watchlist handlers still don't, so the TV beta can push a malformed date or an
out-of-range rating straight to Postgres and get a 502 back.

**26. Import undo — PARTIAL.** Import now previews and confirms, but there is
still no bulk delete, so a bad import is only reversible row by row.

**39. Destructive actions — NOT DONE.** Five `confirm()` calls remain and there
is no undo anywhere. Deliberately left: doing it properly means an undo affordance
plus soft deletes, which is its own piece of work.

**32. Statistics year filter — PARTIAL.** The "By month" ledger filters by year;
the other panels are still all-time, because their numbers come from the server's
`summary` payload rather than being recomputed client-side.

**41. xlsx — DEVIATION.** Pinned to `xlsx-0.20.3` from `cdn.sheetjs.com`, which
clears the known advisories, but it is still a runtime CDN import rather than a
vendored file, so the offline-PWA caveat stands. SheetJS left npm after 0.18.5,
so there is no newer npm build for esm.sh to serve.

**5. Server-side "now" — PARTIAL.** All client date handling is local via
`engine/dates.js`. `computeSummary`'s notion of the current month still comes
from the server clock (UTC on Vercel), so the current-period figure can flip a
day early at a month boundary. A proper fix sends the browser's timezone.

**Infrastructure, outside this plan:** Vercel *preview* deployments fail for
every commit on every branch, including one that added only a markdown file to a
repo with no build step. Production deploys fine. Likely the Neon preview-branch
integration. It meant this change reached production with no runtime validation.


---

## Post-deploy check of the live site

Run against production after merge. Verified working: all 9 HTML pages and all
23 JS modules load (no broken import from the new `dates.js` / `combobox.js` or
the deleted files); every `/api/alist-*` rewrite resolves; the `/private/`
password gate still 401s after the middleware matcher change; and the other
projects (`/packing-cubes/`, `/sporcle-spinoff/`,
`/one-more-column/`) still route after `vercel.json` was reformatted.
`/api/alist-leaderboard` returning `{"entries":[]}` rather than a 502 confirms
`ensureSchema()` applied the three new columns.

Issues found:

**47. The service worker's BUILD_ID is still hand-edited.** The comment claimed
it was "rewritten on deploy"; nothing does that, since there is no build step —
so the fix reintroduced the manual-versioning problem it was meant to remove.
The consequence is much smaller than before, because HTML and JS are now
network-first and cannot go stale between bumps; only the five precached static
assets depend on the string. Comment corrected to say so.

**48. Logging from the Log page doesn't clear the Coming Soon entry.** The
quick-log bar appears on every page, but only `what-to-watch.js` wires
`clearLoggedFromList`. Log a title from the Log page and it stays on Coming Soon.
Finding 21 is therefore only fixed on the page where the list is visible. Fixing
it properly means the Log page also holding the watchlist, or moving the clearing
into the shared quick-log success path.

**49. Dead code: the watchlist "strip" layout.** `wireWatchlistList` and its
helpers (`watchlistStripHtml`, `watchlistRowsHtml`, `renderWatchlistHtml`,
`positionWatchlistPopup`, `clearWatchlistPopupPosition`, `watchlistPopupHtml`) —
roughly 150 lines — are exported and never imported. Confirmed dead *before* this
branch, so pre-existing rather than introduced.

**50. `leaderboard-compare` returns 400 before 401.** A missing `with` parameter
is reported before the auth check, so an unauthenticated caller sees 400 rather
than 401. Discloses nothing; just inconsistent with the other routes.

Not verifiable without a session: Settings save, username uniqueness (409), the
opt-in round trip, import, backfill, and the batched-insert SQL.
