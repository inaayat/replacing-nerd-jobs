// Quiz builder core: template picker, common fields, dispatches to the
// selected type's editor module (engine/editors/<type>.js), wires up
// preview and publish. Mirrors engine.js's shape on the player side.
// The page is public: owners (site password cookie) publish directly;
// everyone else can submit a quiz for review, which opens a GitHub PR.
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
let isOwner = false;

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
        <div class="b-step-head"><span class="b-step-num">4</span><span class="b-step-title" id="publish-step-title">Publish</span></div>
        <div class="b-publish-card">
          <div class="b-field"><label>Quiz ID (auto, editable)</label><input id="f-id" type="text"></div>
          <div class="b-id-preview" id="id-preview"></div>
          <div class="b-field" id="submitter-field" style="display:none;margin-top:8px;">
            <label>Your name (optional)</label><input id="f-submitter" type="text" placeholder="Shown on the review request">
          </div>
          <div style="margin-top:10px;">
            <button class="q-btn primary" id="publish-btn" type="button" style="width:100%">Publish quiz</button>
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
}

function applyOwnerState() {
  const btn = document.getElementById('publish-btn');
  const stepTitle = document.getElementById('publish-step-title');
  const submitterField = document.getElementById('submitter-field');
  if (isOwner) {
    btn.textContent = 'Publish quiz';
    stepTitle.textContent = 'Publish';
    submitterField.style.display = 'none';
  } else {
    btn.textContent = 'Submit for review';
    stepTitle.textContent = 'Submit for review';
    submitterField.style.display = '';
  }
  updatePreview();
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

async function selectTemplate(typeId) {
  quiz.type = typeId;
  quiz.items = [];
  quiz.layout = undefined;
  quiz.columns = undefined;
  quiz.region = undefined;
  document.querySelectorAll('.b-tpl-card').forEach((c) => c.classList.toggle('selected', c.dataset.tpl === typeId));
  const mount = document.getElementById('editor-mount');
  mount.innerHTML = '';
  const mod = await import(`./editors/${typeId}.js`);
  mod.default.render(mount, quiz, updatePreview);
  updatePreview();
}

function updatePreview() {
  document.getElementById('prev-title').textContent = quiz.title || 'Untitled quiz';
  document.getElementById('prev-blurb').textContent = quiz.blurb || '';
  const count = quiz.items.length;
  const bits = [`${count} question${count === 1 ? '' : 's'}`];
  if (quiz.timeLimitSec) bits.push(`${Math.floor(quiz.timeLimitSec / 60)}:${String(quiz.timeLimitSec % 60).padStart(2, '0')} limit`);
  document.getElementById('prev-meta').textContent = bits.join(' · ');

  const idInput = document.getElementById('f-id');
  if (!idManuallyEdited) idInput.value = slugify(quiz.title);
  const filedNote = isOwner
    ? 'on the catalog page.'
    : "on the catalog page once it's reviewed and approved.";
  document.getElementById('id-preview').innerHTML =
    `Will appear at <code>/sporcle-spinoff/play.html?quiz=${slugify(idInput.value)}</code>, filed under <b>${TEMPLATES.find((t) => t.id === quiz.type).label}</b> ${filedNote}`;

  const hint = document.getElementById('validation-hint');
  const btn = document.getElementById('publish-btn');
  if (!quiz.title.trim()) {
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

async function publish() {
  const btn = document.getElementById('publish-btn');
  const toast = document.getElementById('publish-toast');
  btn.disabled = true;
  toast.className = 'b-toast';
  try {
    const body = { quiz: currentQuizObject(), mode: isOwner ? 'publish' : 'submit' };
    if (!isOwner) body.submitter = document.getElementById('f-submitter').value.trim();
    const res = await fetch('/api/save-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    toast.textContent = isOwner
      ? `Published — now live at ${data.url}`
      : 'Submitted! Your quiz is waiting for the owner to review and approve it.';
    toast.className = 'b-toast ok';
  } catch (err) {
    toast.textContent = `Couldn't ${isOwner ? 'publish' : 'submit'}: ${err.message}`;
    toast.className = 'b-toast err';
    btn.disabled = false;
  }
}

render();
selectTemplate('text-entry');
fetch('/api/save-quiz')
  .then((r) => r.json())
  .then((d) => { isOwner = !!d.authed; applyOwnerState(); })
  .catch(() => applyOwnerState());
