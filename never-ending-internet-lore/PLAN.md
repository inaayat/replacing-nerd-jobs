# Never-Ending Internet Lore — status and next chunks

Chunk 2 shipped: 40-event sourced timeline, searchable era/person filters, sticky
year markers, deep links, expandable media/source cards, and an SVG relationship
web derived from the same JSON. The web supports pointer pan/zoom, keyboard
navigation, and a compact connection list. No auth, API, or server-only imports.

## Current data contract

- `events.json` is the source of truth for both views. Events have stable `id`,
  ISO `date`, `title`, `summary`, `era`, known `people`, and one or more links.
  Optional `tease` and `media.thumbnail` fields enhance cards without being
  required.
- `people.json` holds display copy, filter tags, and optional profile links.
- `relations.json` names public relationship context. Multiple relations may
  share a pair; the web consolidates them visually.
- `engine.js` stays dependency-free browser-safe ESM. The Node test imports it.

## Planned follow-ups

1. **Source maintenance** — periodically verify outbound links and prefer court
   records, official uploads, and first-party statements over recap sites.
2. **Editorial workflow** — add
   `scripts/test-never-ending-internet-lore.mjs` to CI if the archive grows past
   roughly 50 events.
3. **Optional portraits** — add licensed or creator-provided image URLs only;
   the current node labels and YouTube thumbnails intentionally work without
   scraping.
