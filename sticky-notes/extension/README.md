# Sticky Notes — Chrome extension

Quick-capture extension for [Sticky Notes](https://inaayat.xyz/sticky-notes/).

## Install (developer / unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `extension/` folder

## Usage

- Click the toolbar icon to open the capture popup
- Right-click selected text → **Pin to Sticky Notes**
- Keyboard shortcut: **Alt+Shift+N** (configure under `chrome://extensions/shortcuts`)

Notes are stored in `chrome.storage.local` until you open the board at
`inaayat.xyz/sticky-notes/`, where a content script merges them into your
browser board and clears the extension queue.

## Icons

PNG icons live in `icons/`. Regenerate from the site SVG with:

```bash
node ../scripts/generate-extension-icons.mjs
```

(Requires a local ImageMagick `convert` or macOS `sips`.)

## Sync note

v0 keeps the website board in `localStorage` and the extension queue in
`chrome.storage`. Full account sync is planned for a later release.
