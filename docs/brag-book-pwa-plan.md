# Brag Book installable PWA

Status: **implemented** (A-Lister–style, online-first). Brag Book matches the
proven pattern in `amc-a-lister/` (manifest, icons, Apple meta tags,
`engine/pwa.js` registration, network-first service worker). There is **no
offline editing**: when the browser reports offline, the app shows a banner
(“You're offline. Reconnect to keep editing.”) and the signed-in editor is
read-only until connectivity returns.

## Product contract

1. Same application at `https://inaayat.xyz/brag-book/`. Installation adds a
   standalone launch surface only.
2. **Online-first**: book data always loads from `/api/bb-book` when online;
   saves go to the server through the existing save controller. The service
   worker never caches or serves `/api/*`, auth, or book payloads.
3. **Offline**: cached HTML/JS may load the shell for viewing only. Inputs,
   contenteditable regions, and action buttons in `#app` are disabled
   (`inert` + `html.bb-offline-readonly`). No new edits or `markDirty` while
   offline.
4. **Mid-save safety** (unchanged): if a save was in flight when the connection
   dropped, the account outbox and save-controller retry still flush on
   reconnect (GET/merge when revision is needed, then PUT). 409/428 semantics
   and `mergeConcurrentBooks` are unchanged.
5. Desktop at `>=1024px` unchanged except optional PWA status chrome when
   offline or an update is waiting.
6. Verify with Node tests only (no browser automation).

## Files

| Area | Path |
|------|------|
| Manifest | `brag-book/manifest.webmanifest` |
| Icons | `brag-book/icons/` (+ `scripts/generate-brag-book-icons.mjs`) |
| SW | `brag-book/service-worker.js` (modelled on `amc-a-lister/service-worker.js`) |
| Register | `brag-book/engine/pwa.js` |
| Status / read-only / update reload | `brag-book/pwa.js` |
| Shell | `brag-book/index.html`, `brag-book/app.css` |

### Service worker

- `BUILD_ID` in `service-worker.js` — bump when icons or manifest change.
- Precache only static assets (root HTML shell, manifest, icon SVG/PNG).
- **Network-first** for HTML/JS/CSS under `/brag-book/`; update cache on
  successful fetch; fall back to cache only when `fetch` fails.
- **Cache-first** for immutable extensions (png, svg, webmanifest, woff).
- Never intercept `/api/*` or non-GET.
- `SKIP_WAITING` via message only (update reload waits for save flush in
  `pwa.js`).

### Not in scope (removed from earlier plan drafts)

- Offline auth descriptor / offline cold boot from local mirror.
- Offline editing or “edit while offline” UX.
- Caching Neon Auth SDK or Google Fonts.

## Tests

```bash
node scripts/test-brag-book-pwa.mjs
node scripts/test-brag-book-pwa-sync-guarantees.mjs
node scripts/test-brag-book-mobile-desktop-lock.mjs
# plus existing Brag Book regression suites (see AGENTS.md)
```

### Sync guarantees (`test-brag-book-pwa-sync-guarantees.mjs`)

| Guarantee | Test name |
|-----------|-----------|
| Online PUT reaches server; SW never shadows API | `guarantee_1_online_put_not_shadowed_by_service_worker` |
| In-flight save + reconnect GET/merge, no 428 | `guarantee_2_inflight_save_reconnect_get_merge_no_428` |
| 409 phone/laptop merge keeps both sides | `guarantee_3_409_phone_laptop_merge_keeps_both_sides` |
| Update reload / pagehide flush or outbox retained | `guarantee_4_update_reload_and_pagehide_flush_or_outbox` |
| SW cache cleanup never deletes mirror/outbox | `guarantee_5_sw_cache_cleanup_never_deletes_outbox_or_mirror` |
| One bullet record after sync | `guarantee_6_single_bullet_record_after_sync` |
| Offline read-only editor | `guarantee_7_offline_readonly_disables_editor_inputs` |

## Install (users)

- **iPhone/iPad Safari**: open `inaayat.xyz/brag-book/`, Share → Add to Home Screen.
- **Android Chrome**: Install app from the menu or prompt.
- **Desktop Chrome/Edge**: Install from the address bar or browser menu.

Editing requires a live connection. Unsynced data from an interrupted save is
held in the existing account outbox until the server confirms a PUT.
