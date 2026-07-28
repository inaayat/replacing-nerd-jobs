// Cube builder: form + JSON upload, preview, publish/submit for review.
import { cubeJsonUrl } from './paths.js';

const root = document.getElementById('builder-root');

const editId = new URLSearchParams(location.search).get('edit');
const isEditing = !!editId;

let cube = { title: '', blurb: '', tags: [], items: [{ label: '' }, { label: '' }] };
let idManuallyEdited = isEditing;
let isOwner = false;
let buildMode = 'form';

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
function slugify(s) { return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function dedupeTags(tags) {
  const seen = new Set();
  return tags.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function render() {
  root.innerHTML = '';
  root.appendChild(el(`
    <h1 class="b-h1">${isEditing ? 'Edit packing cube' : 'Create a packing cube'}</h1>

    <div class="b-step">
      <div class="b-step-head"><span class="b-step-num">1</span><span class="b-step-title">Cube details</span></div>
      <div class="b-field-row">
        <div class="b-field" style="grid-column:1/-1"><label>Title</label><input type="text" id="f-title" placeholder="e.g. Summer beach essentials"></div>
        <div class="b-field" style="grid-column:1/-1"><label>Blurb</label><input type="text" id="f-blurb" placeholder="Short description"></div>
        <div class="b-field" style="grid-column:1/-1"><label>Tags (comma-separated)</label><input type="text" id="f-tags" placeholder="basics, summer, beach"></div>
      </div>
    </div>

    <div class="b-step">
      <div class="b-step-head"><span class="b-step-num">2</span><span class="b-step-title">Pack list items</span></div>
      <div class="b-mode-toggle" id="build-mode">
        <button type="button" class="b-mode-btn selected" data-mode="form">Build with the form</button>
        <button type="button" class="b-mode-btn" data-mode="upload">Upload JSON</button>
      </div>
      <div id="form-mode">
        <div id="editor-mount"></div>
        <button type="button" class="b-add-row-btn" id="add-item-btn">+ Add item</button>
      </div>
      <div id="upload-mode" class="hidden">
        <p class="b-upload-hint">Upload or paste a complete cube JSON. It must include <code>title</code> and an <code>items</code> array with at least 2 entries. See examples on <a href="https://github.com/inaayat/replacing-nerd-jobs/tree/main/packing-cubes/cubes" target="_blank" rel="noopener">GitHub</a>.</p>
        <input type="file" id="json-file" accept=".json,application/json">
        <div class="b-upload-or">— or paste it below —</div>
        <textarea class="b-mini-input" id="json-paste" rows="10" placeholder='{ "title": "...", "items": [...] }'></textarea>
        <button type="button" class="pc-btn primary" id="json-load" style="margin-top:8px">Load this JSON</button>
        <div class="b-upload-status" id="json-status"></div>
      </div>
    </div>

    <div class="b-step">
      <div class="b-step-head"><span class="b-step-num">3</span><span class="b-step-title">Preview</span></div>
      <div class="b-preview-frame">
        <h2 id="prev-title">Untitled cube</h2>
        <p id="prev-blurb"></p>
        <div class="b-meta" id="prev-meta">0 items</div>
      </div>
    </div>

    <div class="b-step">
      <div class="b-step-head"><span class="b-step-num">4</span><span id="publish-step-title" class="b-step-title">Submit for review</span></div>
      <div class="b-publish-card">
        <div class="b-field" id="id-field"><label>${isEditing ? 'Cube ID (fixed while editing)' : 'Cube ID (auto, editable)'}</label><input type="text" id="f-id" ${isEditing ? 'disabled' : ''}></div>
        <div class="b-id-preview" id="id-preview"></div>
        <div class="b-field" id="submitter-field" style="margin-top:8px"><label>Your name (optional)</label><input type="text" id="f-submitter" placeholder="How should we credit you?"></div>
        <div class="b-validation hidden" id="validation-hint"></div>
        <button type="button" class="pc-btn primary" id="publish-btn" style="margin-top:10px;width:100%">Submit for review</button>
        <div class="b-toast" id="publish-toast"></div>
      </div>
    </div>
  `));

  ['f-title', 'f-blurb', 'f-tags'].forEach((id) => document.getElementById(id).addEventListener('input', onFieldsChange));
  document.getElementById('f-id').addEventListener('input', () => { idManuallyEdited = true; updatePreview(); });
  document.getElementById('publish-btn').addEventListener('click', publish);
  document.getElementById('add-item-btn').addEventListener('click', () => { cube.items.push({ label: '' }); renderEditor(); });
  document.getElementById('build-mode').addEventListener('click', (e) => {
    const b = e.target.closest('.b-mode-btn');
    if (b) setBuildMode(b.dataset.mode);
  });
  document.getElementById('json-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById('json-paste').value = reader.result; loadJson(reader.result); };
    reader.readAsText(file);
  });
  document.getElementById('json-load').addEventListener('click', () => loadJson(document.getElementById('json-paste').value));

  renderEditor();
}

function applyOwnerState() {
  const btn = document.getElementById('publish-btn');
  const stepTitle = document.getElementById('publish-step-title');
  const submitterField = document.getElementById('submitter-field');
  if (isOwner) {
    btn.textContent = isEditing ? 'Save changes' : 'Publish cube';
    stepTitle.textContent = isEditing ? 'Save changes' : 'Publish';
    submitterField.style.display = 'none';
  } else {
    btn.textContent = isEditing ? 'Submit edit for review' : 'Submit for review';
    stepTitle.textContent = isEditing ? 'Submit edit for review' : 'Submit for review';
    submitterField.style.display = '';
  }
  updatePreview();
}

function onFieldsChange() {
  cube.title = document.getElementById('f-title').value;
  cube.blurb = document.getElementById('f-blurb').value;
  cube.tags = dedupeTags(document.getElementById('f-tags').value.split(',').map((s) => s.trim()).filter(Boolean));
  updatePreview();
}

function renderEditor() {
  const mount = document.getElementById('editor-mount');
  if (!mount) return;
  mount.innerHTML = cube.items.map((item, i) => `
    <div class="b-item-row" data-idx="${i}">
      <input type="text" class="b-mini-input b-item-label" value="${escapeAttr(item.label)}" placeholder="Item ${i + 1}">
      <button type="button" class="b-remove-btn" title="Remove" ${cube.items.length <= 2 ? 'disabled' : ''}>&times;</button>
    </div>
  `).join('');

  mount.querySelectorAll('.b-item-label').forEach((input) => {
    input.addEventListener('input', (e) => {
      cube.items[Number(e.target.closest('.b-item-row').dataset.idx)].label = e.target.value;
      updatePreview();
    });
  });
  mount.querySelectorAll('.b-remove-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (cube.items.length <= 2) return;
      const idx = Number(e.target.closest('.b-item-row').dataset.idx);
      cube.items.splice(idx, 1);
      renderEditor();
      updatePreview();
    });
  });
}

function escapeAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function setBuildMode(mode) {
  buildMode = mode;
  document.querySelectorAll('.b-mode-btn').forEach((b) => b.classList.toggle('selected', b.dataset.mode === mode));
  document.getElementById('form-mode').classList.toggle('hidden', mode !== 'form');
  document.getElementById('upload-mode').classList.toggle('hidden', mode !== 'upload');
  if (mode === 'form') fillFormFromCube();
}

function fillFormFromCube() {
  document.getElementById('f-title').value = cube.title || '';
  document.getElementById('f-blurb').value = cube.blurb || '';
  document.getElementById('f-tags').value = (cube.tags || []).join(', ');
  renderEditor();
}

function setUploadStatus(kind, text) {
  const status = document.getElementById('json-status');
  if (!status) return;
  status.className = `b-upload-status ${kind}`;
  status.textContent = text;
}

function validateLoaded(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Cube must be a JSON object.';
  if (!parsed.title || !String(parsed.title).trim()) return 'Missing "title".';
  if (!Array.isArray(parsed.items) || parsed.items.length < 2) return 'Needs an "items" array with at least 2 entries.';
  for (const item of parsed.items) {
    if (!item || !item.label || !String(item.label).trim()) return 'Every item needs a "label".';
  }
  return null;
}

function normalizeLoaded(parsed) {
  return {
    title: parsed.title || '',
    blurb: parsed.blurb || '',
    tags: Array.isArray(parsed.tags) ? dedupeTags(parsed.tags) : [],
    items: parsed.items.map((item) => ({ label: String(item.label).trim() })),
  };
}

function loadJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { setUploadStatus('err', `That isn't valid JSON: ${e.message}`); return; }
  const err = validateLoaded(parsed);
  if (err) { setUploadStatus('err', err); return; }
  cube = normalizeLoaded(parsed);
  idManuallyEdited = !!parsed.id;
  if (parsed.id) document.getElementById('f-id').value = slugify(parsed.id);
  setUploadStatus('ok', `✓ Loaded "${cube.title}" — ${cube.items.length} items`);
  fillFormFromCube();
  updatePreview();
}

function updatePreview() {
  const titleEl = document.getElementById('prev-title');
  const blurbEl = document.getElementById('prev-blurb');
  const metaEl = document.getElementById('prev-meta');
  const idInput = document.getElementById('f-id');
  const hint = document.getElementById('validation-hint');
  const btn = document.getElementById('publish-btn');
  if (!titleEl) return;

  const count = cube.items.filter((i) => i.label.trim()).length;
  const filedNote = isOwner ? 'on the catalog page.' : "on the catalog page once it's reviewed and approved.";

  titleEl.textContent = cube.title || 'Untitled cube';
  blurbEl.textContent = cube.blurb || '';
  metaEl.textContent = `${count} item${count === 1 ? '' : 's'}`;

  if (!idManuallyEdited) idInput.value = slugify(cube.title);
  document.getElementById('id-preview').innerHTML = isEditing
    ? `Updating <code>/packing-cubes/cube.html?cube=${slugify(idInput.value)}</code>, filed ${filedNote}`
    : `Will appear at <code>/packing-cubes/cube.html?cube=${slugify(idInput.value)}</code>, filed ${filedNote}`;

  if (!cube.title.trim()) {
    hint.textContent = 'Add a title first.'; hint.classList.remove('hidden'); btn.disabled = true;
  } else if (count < 2) {
    hint.textContent = 'Add at least 2 items first.'; hint.classList.remove('hidden'); btn.disabled = true;
  } else {
    hint.classList.add('hidden'); btn.disabled = false;
  }
}

function currentCubeObject() {
  const id = slugify(document.getElementById('f-id').value) || slugify(cube.title);
  return {
    ...cube,
    id,
    items: cube.items.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim() })),
  };
}

async function publish() {
  const btn = document.getElementById('publish-btn');
  const toast = document.getElementById('publish-toast');
  btn.disabled = true;
  toast.className = 'b-toast';
  const submitter = !isOwner ? document.getElementById('f-submitter').value.trim() : undefined;
  try {
    const res = await fetch('/api/save-cube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cube: currentCubeObject(), mode: isOwner ? 'publish' : 'submit', submitter }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    toast.textContent = isOwner
      ? `${isEditing ? 'Updated' : 'Published'} — now live at ${data.url}`
      : `Submitted! Your ${isEditing ? 'edit is' : 'cube is'} waiting for review.${data.prUrl ? ` Track it on GitHub.` : ''}`;
    toast.className = 'b-toast ok';
    if (data.prUrl) {
      const link = document.createElement('a');
      link.href = data.prUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = ' View pull request';
      link.style.color = 'inherit';
      toast.appendChild(link);
    }
  } catch (err) {
    toast.textContent = `Couldn't ${isOwner ? 'publish' : 'submit'}: ${err.message}`;
    toast.className = 'b-toast err';
    btn.disabled = false;
  }
}

render();

const ownerReady = fetch('/api/save-cube')
  .then((r) => r.json())
  .then((d) => { isOwner = !!d.authed; })
  .catch(() => { isOwner = false; });

if (isEditing) {
  const btn = document.getElementById('publish-btn');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  fetch(cubeJsonUrl(editId))
    .then((r) => { if (!r.ok) throw new Error('not found'); return r.json(); })
    .then((loaded) => {
      cube = normalizeLoaded(loaded);
      document.getElementById('f-id').value = editId;
      fillFormFromCube();
      ownerReady.then(applyOwnerState);
    })
    .catch(() => {
      root.innerHTML = '<p style="font-weight:700;color:var(--brown);padding:24px 0">Could not load that cube to edit.</p>';
    });
} else {
  ownerReady.then(applyOwnerState);
}
