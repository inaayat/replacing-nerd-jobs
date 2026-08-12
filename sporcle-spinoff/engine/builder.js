// Quiz builder core: template picker, common fields, dispatches to the
// selected type's editor module (engine/editors/<type>.js), wires up
// preview and submit-for-review. Mirrors engine.js's shape on the player side.
// Everyone (including the site owner) opens a GitHub PR via api/save-quiz.js.
const root = document.getElementById('builder-root');

const TEMPLATES = [
  { id: 'multiple-choice', label: 'Multiple Choice' },
  { id: 'text-entry', label: 'Type the Answer' },
  { id: 'image', label: 'Picture Round' },
  { id: 'matching', label: 'Matching' },
  { id: 'ranking', label: 'Put in Order' },
  { id: 'map', label: 'Click the Map' },
  { id: 'map-highlight', label: 'Name the Highlight' },
];

let quiz = { title: '', blurb: '', tags: [], timeLimitSec: undefined, shuffle: true, type: 'text-entry', items: [] };
let idManuallyEdited = false;
let buildMode = 'form'; // 'form' | 'upload'
let pendingQuizzes = null; // set to an array when a multi-quiz JSON is uploaded

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function slugify(s) { return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
// Case-insensitive dedup, keeping the first-typed casing — matches the merge
// logic api/save-quiz.js applies when a tag is suggested for an existing quiz.
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
    <div>
      <h1 class="b-h1">Create a quiz</h1>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">1</span><span class="b-step-title">Choose a template</span></div>
        <div class="b-tpl-grid" id="tpl-grid"></div>
      </div>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">2</span><span class="b-step-title">Build your questions</span></div>
        <div class="b-mode-toggle" id="build-mode">
          <button type="button" class="b-mode-btn selected" data-mode="form">Build with the form</button>
          <button type="button" class="b-mode-btn" data-mode="upload">Upload JSON</button>
        </div>
        <div id="form-mode">
          <div class="b-field-row">
            <div class="b-field"><label>Title</label><input id="f-title" type="text"></div>
            <div class="b-field"><label>Blurb</label><input id="f-blurb" type="text"></div>
          </div>
          <div class="b-field-row">
            <div class="b-field"><label>Tags (comma-separated, optional)</label><input id="f-tags" type="text" placeholder="e.g. Geography, Pop Culture"></div>
          </div>
          <div class="b-field-row">
            <div class="b-field"><label>Time limit (seconds, optional)</label><input id="f-time" type="number"></div>
            <div class="b-field b-toggle"><label><input id="f-shuffle" type="checkbox" checked> Shuffle question order</label></div>
          </div>
          <div id="editor-mount"></div>
        </div>
        <div id="upload-mode" style="display:none;">
          <p class="b-upload-hint">For anyone comfortable with the format: upload or paste a complete quiz JSON. It must include <code>type</code>, <code>title</code>, and an <code>items</code> array, exactly like the existing quizzes. <a href="https://github.com/inaayat/replacing-nerd-jobs/tree/main/sporcle-spinoff/quizzes" target="_blank" rel="noopener">See examples on GitHub</a>.</p>
          <input type="file" id="json-file" accept=".json,application/json" class="b-mini-input">
          <div class="b-upload-or">— or paste it below —</div>
          <textarea id="json-paste" class="b-mini-input" rows="10" placeholder='{ "title": "My Quiz", "type": "multiple-choice", "items": [ ... ] }'></textarea>
          <button type="button" class="b-add-row-btn" id="json-load" style="width:auto;margin-top:6px;">Load this JSON</button>
          <div class="b-upload-status" id="json-status"></div>
        </div>
      </div>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">3</span><span class="b-step-title">Preview</span></div>
        <div class="b-preview-frame">
          <h2 id="prev-title"></h2>
          <p id="prev-blurb"></p>
          <div class="b-meta" id="prev-meta"></div>
          <button class="q-btn primary" id="preview-btn" type="button">Play full preview</button>
        </div>
      </div>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">4</span><span class="b-step-title">Submit for review</span></div>
        <div class="b-publish-card">
          <div class="b-field" id="id-field"><label>Quiz ID (auto, editable)</label><input id="f-id" type="text"></div>
          <div class="b-id-preview" id="id-preview"></div>
          <div class="b-field" id="submitter-field" style="margin-top:8px;">
            <label>Your name (optional)</label><input id="f-submitter" type="text" placeholder="Shown on the review request">
          </div>
          <div style="margin-top:10px;">
            <button class="q-btn primary" id="publish-btn" type="button" style="width:100%">Submit for review</button>
          </div>
          <div class="b-validation" id="validation-hint" style="display:none"></div>
          <div class="b-toast" id="publish-toast"></div>
        </div>
      </div>
    </div>`));

  const tplGrid = document.getElementById('tpl-grid');
  tplGrid.innerHTML = TEMPLATES.map((t) => `<button type="button" class="b-tpl-card" data-tpl="${t.id}">${t.label}</button>`).join('');
  tplGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.b-tpl-card');
    if (btn) selectTemplate(btn.dataset.tpl);
  });

  ['f-title', 'f-blurb', 'f-tags', 'f-time'].forEach((id) => document.getElementById(id).addEventListener('input', onFieldsChange));
  document.getElementById('f-shuffle').addEventListener('change', onFieldsChange);
  document.getElementById('f-id').addEventListener('input', () => { idManuallyEdited = true; updatePreview(); });
  document.getElementById('preview-btn').addEventListener('click', openPreview);
  document.getElementById('publish-btn').addEventListener('click', publish);

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
}

function onFieldsChange() {
  quiz.title = document.getElementById('f-title').value;
  quiz.blurb = document.getElementById('f-blurb').value;
  quiz.tags = dedupeTags(document.getElementById('f-tags').value.split(',').map((s) => s.trim()).filter(Boolean));
  const t = document.getElementById('f-time').value;
  quiz.timeLimitSec = t ? Number(t) : undefined;
  quiz.shuffle = document.getElementById('f-shuffle').checked;
  updatePreview();
}

// Picking a template starts a fresh form build for that type.
async function selectTemplate(typeId) {
  quiz.type = typeId;
  quiz.items = [];
  quiz.layout = undefined;
  quiz.columns = undefined;
  quiz.region = undefined;
  pendingQuizzes = null;
  showFormMode();
  fillFormFromQuiz();
  await renderEditor();
}

// Renders the editor for the current quiz.type against the current quiz
// (no reset) — used on template pick and when switching back from upload mode.
async function renderEditor() {
  document.querySelectorAll('.b-tpl-card').forEach((c) => c.classList.toggle('selected', c.dataset.tpl === quiz.type));
  const mount = document.getElementById('editor-mount');
  mount.innerHTML = '';
  const mod = await import(`./editors/${quiz.type}.js`);
  mod.default.render(mount, quiz, updatePreview);
  updatePreview();
}

function showFormMode() {
  buildMode = 'form';
  document.querySelectorAll('.b-mode-btn').forEach((b) => b.classList.toggle('selected', b.dataset.mode === 'form'));
  document.getElementById('form-mode').style.display = '';
  document.getElementById('upload-mode').style.display = 'none';
}

async function setBuildMode(mode) {
  buildMode = mode;
  document.querySelectorAll('.b-mode-btn').forEach((b) => b.classList.toggle('selected', b.dataset.mode === mode));
  document.getElementById('form-mode').style.display = mode === 'form' ? '' : 'none';
  document.getElementById('upload-mode').style.display = mode === 'upload' ? '' : 'none';
  if (mode === 'form') { pendingQuizzes = null; fillFormFromQuiz(); await renderEditor(); }
  else updatePreview();
}

// Push the current quiz object back into the form inputs (used after a JSON
// upload so the form reflects it if the user switches to form mode).
function fillFormFromQuiz() {
  document.getElementById('f-title').value = quiz.title || '';
  document.getElementById('f-blurb').value = quiz.blurb || '';
  document.getElementById('f-tags').value = (quiz.tags || []).join(', ');
  document.getElementById('f-time').value = quiz.timeLimitSec || '';
  document.getElementById('f-shuffle').checked = quiz.shuffle !== false;
}

function validateLoaded(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Each quiz must be a JSON object.';
  if (!parsed.type) return 'Missing "type" field (e.g. "multiple-choice").';
  if (!TEMPLATES.some((t) => t.id === parsed.type)) return `Unknown type "${parsed.type}". Valid types: ${TEMPLATES.map((t) => t.id).join(', ')}.`;
  if (!parsed.title || !String(parsed.title).trim()) return 'Missing "title".';
  if (!Array.isArray(parsed.items) || parsed.items.length < 2) return 'Needs an "items" array with at least 2 entries.';
  return null;
}

function normalizeLoaded(parsed) {
  return {
    ...parsed,
    title: parsed.title || '',
    blurb: parsed.blurb || '',
    tags: Array.isArray(parsed.tags) ? dedupeTags(parsed.tags) : [],
    shuffle: parsed.shuffle !== false,
    items: parsed.items,
  };
}

function setUploadStatus(kind, text) {
  const status = document.getElementById('json-status');
  status.className = `b-upload-status ${kind}`;
  status.textContent = text;
}

// Accepts either a single quiz object or an array of them.
function loadJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { setUploadStatus('err', `That isn't valid JSON: ${e.message}`); return; }
  if (Array.isArray(parsed)) loadBatch(parsed);
  else loadSingle(parsed);
}

function loadSingle(parsed) {
  const err = validateLoaded(parsed);
  if (err) { setUploadStatus('err', err); return; }
  pendingQuizzes = null;
  quiz = normalizeLoaded(parsed);
  idManuallyEdited = !!parsed.id;
  if (parsed.id) document.getElementById('f-id').value = slugify(parsed.id);
  document.querySelectorAll('.b-tpl-card').forEach((c) => c.classList.toggle('selected', c.dataset.tpl === quiz.type));
  const label = (TEMPLATES.find((t) => t.id === quiz.type) || {}).label || quiz.type;
  setUploadStatus('ok', `✓ Loaded "${quiz.title || 'Untitled'}" — ${quiz.items.length} question${quiz.items.length === 1 ? '' : 's'} · ${label}`);
  updatePreview();
}

function loadBatch(arr) {
  if (!arr.length) { setUploadStatus('err', 'That array has no quizzes in it.'); return; }
  const normalized = [];
  for (let i = 0; i < arr.length; i++) {
    const err = validateLoaded(arr[i]);
    if (err) { setUploadStatus('err', `Quiz #${i + 1} is invalid: ${err}`); return; }
    normalized.push(normalizeLoaded(arr[i]));
  }
  if (normalized.length === 1) { loadSingle(arr[0]); return; }
  pendingQuizzes = normalized;
  quiz = normalized[0];
  idManuallyEdited = false;
  document.querySelectorAll('.b-tpl-card').forEach((c) => c.classList.toggle('selected', c.dataset.tpl === quiz.type));
  setUploadStatus('ok', `✓ Loaded ${normalized.length} quizzes: ${normalized.map((q) => `“${q.title}”`).join(', ')}`);
  updatePreview();
}

function updatePreview() {
  const batch = pendingQuizzes && pendingQuizzes.length > 1 ? pendingQuizzes : null;
  const filedNote = "on the catalog page once it's reviewed and approved.";
  const label = (TEMPLATES.find((t) => t.id === quiz.type) || {}).label || quiz.type;

  document.getElementById('prev-title').textContent = quiz.title || 'Untitled quiz';
  document.getElementById('prev-blurb').textContent = quiz.blurb || '';
  const count = quiz.items.length;
  const bits = [];
  if (batch) bits.push(`showing 1 of ${batch.length}`);
  bits.push(`${count} question${count === 1 ? '' : 's'}`);
  if (quiz.timeLimitSec) bits.push(`${Math.floor(quiz.timeLimitSec / 60)}:${String(quiz.timeLimitSec % 60).padStart(2, '0')} limit`);
  document.getElementById('prev-meta').textContent = bits.join(' · ');

  const idInput = document.getElementById('f-id');
  document.getElementById('id-field').style.display = batch ? 'none' : '';
  if (!idManuallyEdited && !batch) idInput.value = slugify(quiz.title);
  document.getElementById('id-preview').innerHTML = batch
    ? `${batch.length} quizzes will each be added under their own id, filed by type ${filedNote}`
    : `Will appear at <code>/sporcle-spinoff/play.html?quiz=${slugify(idInput.value)}</code>, filed under <b>${label}</b> ${filedNote}`;

  const hint = document.getElementById('validation-hint');
  const btn = document.getElementById('publish-btn');
  if (batch) {
    hint.style.display = 'none'; btn.disabled = false;
  } else if (!quiz.title.trim()) {
    hint.textContent = 'Add a title first.'; hint.style.display = 'block'; btn.disabled = true;
  } else if (count < 2) {
    hint.textContent = 'Add at least 2 questions first.'; hint.style.display = 'block'; btn.disabled = true;
  } else {
    hint.style.display = 'none'; btn.disabled = false;
  }
}

function currentQuizObject() {
  const id = slugify(document.getElementById('f-id').value) || slugify(quiz.title);
  return { ...quiz, id };
}

function openPreview() {
  const draft = currentQuizObject();
  sessionStorage.setItem('sporcle:preview', JSON.stringify(draft));
  window.open('./play.html?preview=1', '_blank');
}

async function postQuiz(qObj, submitter) {
  const body = { quiz: qObj, mode: 'submit' };
  if (submitter) body.submitter = submitter;
  const res = await fetch('/api/save-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function publish() {
  const btn = document.getElementById('publish-btn');
  const toast = document.getElementById('publish-toast');
  btn.disabled = true;
  toast.className = 'b-toast';
  const batch = pendingQuizzes && pendingQuizzes.length > 1 ? pendingQuizzes : null;
  const submitter = document.getElementById('f-submitter').value.trim();
  try {
    if (batch) {
      // One request per quiz, sequentially so each catalog/index write sees
      // the previous one's result (avoids racing the shared index.json).
      let done = 0;
      for (const q of batch) {
        await postQuiz({ ...q, id: slugify(q.id || q.title) }, submitter);
        done += 1;
        toast.className = 'b-toast ok';
        toast.textContent = `Submitting… ${done}/${batch.length}`;
      }
      toast.textContent = `Submitted all ${batch.length} quizzes for review.`;
    } else {
      await postQuiz(currentQuizObject(), submitter);
      toast.textContent = 'Submitted! Your quiz is waiting for review and approval.';
    }
    toast.className = 'b-toast ok';
  } catch (err) {
    toast.textContent = `Couldn't submit: ${err.message}`;
    toast.className = 'b-toast err';
    btn.disabled = false;
  }
}

render();
selectTemplate('text-entry');
