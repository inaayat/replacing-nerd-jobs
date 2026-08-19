# Sticky Notes

Status: v0 published — idea captured, board + extension scaffold live  
Scope: `/sticky-notes/` web board and `/sticky-notes/extension/` Chrome extension

## 1. Problem

Disorganized people lose track of things in too many places: browser tabs, Notes app
drafts, texts to themselves, and half-written todos. Sticky Notes is a single cork
board for **low-friction capture** — the stuff that is not quite a task but still
matters.

## 2. Product shape

| Surface | Role |
|--------|------|
| **Web board** | Full cork board: drag, resize, color, edit, delete. Persists in `localStorage`. |
| **Chrome extension** | Quick capture from any tab (popup, context menu, `Alt+Shift+N`). Queues in `chrome.storage.local`. |
| **Merge on visit** | Opening the board merges the extension queue into the web store and clears the queue. |

## 3. Later (not in v0)

- Neon Auth + Postgres sync so board follows the user across devices
- Firefox / Safari extensions
- Optional page overlay sticky (true “sticky on the page you’re reading”)
- Shareable boards / collaboration
- Mobile home-screen PWA with share target

## 4. Files

| File | Responsibility |
|------|----------------|
| `sticky-notes/index.html` | Landing + board shell + extension install instructions |
| `sticky-notes/app.js` | Board UI, drag/resize, CRUD |
| `sticky-notes/app.css` | Cork board + note styling |
| `sticky-notes/notes.js` | Shared data model (`localStorage` on web) |
| `sticky-notes/extension-bridge.js` | Accepts extension import via `postMessage` |
| `sticky-notes/extension/*` | Manifest V3 extension (popup, background, content script) |

Keep `sticky-notes/notes.js` and `sticky-notes/extension/notes.js` in sync until
a build step copies one into the other.

## 5. Non-goals for v0

- No new serverless function (Hobby budget)
- No account system yet
- No real-time sync between extension and board without visiting the page
