# Never-Ending Internet Lore — next chunks

MVP shipped: static JSON timeline, person filter chips, expandable rows with outbound links. No auth, no API.

## Planned follow-ups

1. **Richer timeline UI** — era lanes, month grouping, search, and deep-linkable event ids in the hash.
2. **Media embeds** — optional YouTube/Twitch clip ids per event (still no server unfurl in v1).
3. **Relationship web viz** — force-directed or simple SVG graph from `relations.json`, toggled beside the list.
4. **Source quality** — primary links (court PDFs, official posts) prioritized over recap blogs where possible.
5. **Editor workflow** — validate JSON schema in CI (`scripts/test-never-ending-internet-lore.mjs`) before expanding past ~50 events.
