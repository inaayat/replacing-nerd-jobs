// Cube builder: form + JSON upload, preview, save private / make public.
// Exported as initBuilder() so it can run standalone on builder.html or
// inline inside a modal on the main packing-cubes page.
import { cubeJsonUrl } from './paths.js';
import { initAuth, wireAuthLink, refreshToken } from './auth.js';
import { cubesApi } from './api.js';

export function initBuilder({ root, editId = null, templateId = null, auth: passedAuth = null, onPublished, onClose } = {}) {
  const isEditing = !!editId;

  let cube = { title: '', blurb: '', tags: [], items: [{ label: '' }, { label: '' }], addOns: [], is_public: false };
  let idManuallyEdited = isEditing;
  let auth = passedAuth;
  let buildMode = 'form';
  let existingPublic = false;

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
      <div class="b-head-row">
        <h1 class="b-h1">${isEditing ? 'Edit packing cube' : 'Create a packing cube'}</h1>
        ${onClose ? '<button type="button" class="pc-preview-close" id="b-close" aria-label="Close">&times;</button>' : ''}
      </div>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">1</span><span class="b-step-title">Cube details</span></div>
        <div class="b-field-row">
          <div class="b-field" style="grid-column:1/-1"><label>Title</label><input type="text" id="f-title" placeholder="e.g. Summer beach essentials"></div>
          <div class="b-field" style="grid-column:1/-1"><label>Blurb</label><input type="text" id="f-blurb" placeholder="Short description"></div>
          <div class="b-field" style="grid-column:1/-1"><label>Tags (comma-separated)</label><input type="text" id="f-tags" placeholder="summer, beach, work"></div>
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
          <p class="b-upload-hint">Upload or paste a complete cube JSON. It must include <code>title</code> and an <code>items</code> array with at least 2 entries.</p>
          <input type="file" id="json-file" accept=".json,application/json">
          <div class="b-upload-or">— or paste it below —</div>
          <textarea class="b-mini-input" id="json-paste" rows="6" placeholder='{ "title": "...", "items": [...] }'></textarea>
          <button type="button" class="pc-btn primary" id="json-load" style="margin-top:6px">Load this JSON</button>
          <div class="b-upload-status" id="json-status"></div>
        </div>
      </div>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">3</span><span class="b-step-title">Add-ons (optional)</span></div>
        <p class="b-upload-hint">Named bundles people can toggle onto a trip — travel meds, hair tools — instead of making a whole extra cube.</p>
        <div id="addons-mount"></div>
        <button type="button" class="b-add-row-btn" id="add-addon-btn">+ Add an add-on</button>
      </div>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">4</span><span class="b-step-title">Preview</span></div>
        <div class="b-preview-frame">
          <h2 id="prev-title">Untitled cube</h2>
          <p id="prev-blurb"></p>
          <div class="b-meta" id="prev-meta">0 items</div>
        </div>
      </div>

      <div class="b-step">
        <div class="b-step-head"><span class="b-step-num">5</span><span id="publish-step-title" class="b-step-title">Save</span></div>
        <div class="b-publish-card">
          <div class="b-field" id="id-field"><label>${isEditing ? 'Cube ID (fixed while editing)' : 'Cube ID (auto, editable)'}</label><input type="text" id="f-id" ${isEditing ? 'disabled' : ''}></div>
          <div class="b-id-preview" id="id-preview"></div>
          <label class="pc-toggle-chip" id="make-public-row" style="margin-top:10px">
            <input type="checkbox" id="f-public">
            Make public (share with the whole site — auto-merges a GitHub PR)
          </label>
          <div class="b-validation hidden" id="validation-hint"></div>
          <button type="button" class="pc-btn primary" id="publish-btn" style="margin-top:8px;width:100%">Save private cube</button>
          <div class="b-toast" id="publish-toast"></div>
        </div>
      </div>
    `));

    ['f-title', 'f-blurb', 'f-tags'].forEach((id) => root.querySelector('#' + id).addEventListener('input', onFieldsChange));
    root.querySelector('#f-id').addEventListener('input', () => { idManuallyEdited = true; updatePreview(); });
    root.querySelector('#f-public').addEventListener('change', updatePreview);
    root.querySelector('#publish-btn').addEventListener('click', save);
    root.querySelector('#add-item-btn').addEventListener('click', () => { cube.items.push({ label: '' }); renderEditor(); });
    root.querySelector('#add-addon-btn').addEventListener('click', () => {
      cube.addOns.push({ title: '', items: [{ label: '' }] });
      renderAddOnsEditor();
    });
    root.querySelector('#build-mode').addEventListener('click', (e) => {
      const b = e.target.closest('.b-mode-btn');
      if (b) setBuildMode(b.dataset.mode);
    });
    root.querySelector('#json-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { root.querySelector('#json-paste').value = reader.result; loadJson(reader.result); };
      reader.readAsText(file);
    });
    root.querySelector('#json-load').addEventListener('click', () => loadJson(root.querySelector('#json-paste').value));
    if (onClose) root.querySelector('#b-close').addEventListener('click', onClose);

    renderEditor();
    renderAddOnsEditor();
    applyAuthUi();
  }

  function applyAuthUi() {
    if (auth) wireAuthLink(auth);
    const publicRow = root.querySelector('#make-public-row');
    const publicBox = root.querySelector('#f-public');
    if (existingPublic && publicRow && publicBox) {
      publicRow.innerHTML = '';
      publicBox.checked = true;
      publicBox.disabled = true;
      publicRow.appendChild(publicBox);
      publicRow.appendChild(document.createTextNode(' Already public — saving updates the site catalog'));
    }
    updatePreview();
  }

  function onFieldsChange() {
    cube.title = root.querySelector('#f-title').value;
    cube.blurb = root.querySelector('#f-blurb').value;
    cube.tags = dedupeTags(root.querySelector('#f-tags').value.split(',').map((s) => s.trim()).filter(Boolean));
    updatePreview();
  }

  function renderEditor() {
    const mount = root.querySelector('#editor-mount');
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

  function renderAddOnsEditor() {
    const mount = root.querySelector('#addons-mount');
    if (!mount) return;
    mount.innerHTML = cube.addOns.map((addOn, ai) => `
      <div class="b-addon" data-addon-idx="${ai}">
        <div class="b-addon-head">
          <input type="text" class="b-mini-input b-addon-title" value="${escapeAttr(addOn.title)}" placeholder="Add-on name (e.g. Travel meds)">
          <button type="button" class="b-remove-btn b-addon-remove" title="Remove add-on">&times;</button>
        </div>
        <div class="b-addon-items">
          ${addOn.items.map((item, ii) => `
            <div class="b-item-row" data-item-idx="${ii}">
              <input type="text" class="b-mini-input b-addon-item-label" value="${escapeAttr(item.label)}" placeholder="Item ${ii + 1}">
              <button type="button" class="b-remove-btn b-addon-item-remove" title="Remove" ${addOn.items.length <= 1 ? 'disabled' : ''}>&times;</button>
            </div>`).join('')}
        </div>
        <button type="button" class="b-add-row-btn b-addon-item-add">+ Add item</button>
      </div>
    `).join('');

    const addOnAt = (el) => cube.addOns[Number(el.closest('.b-addon').dataset.addonIdx)];
    mount.querySelectorAll('.b-addon-title').forEach((input) => {
      input.addEventListener('input', () => { addOnAt(input).title = input.value; updatePreview(); });
    });
    mount.querySelectorAll('.b-addon-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        cube.addOns.splice(Number(btn.closest('.b-addon').dataset.addonIdx), 1);
        renderAddOnsEditor();
        updatePreview();
      });
    });
    mount.querySelectorAll('.b-addon-item-label').forEach((input) => {
      input.addEventListener('input', () => {
        addOnAt(input).items[Number(input.closest('.b-item-row').dataset.itemIdx)].label = input.value;
        updatePreview();
      });
    });
    mount.querySelectorAll('.b-addon-item-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const addOn = addOnAt(btn);
        if (addOn.items.length <= 1) return;
        addOn.items.splice(Number(btn.closest('.b-item-row').dataset.itemIdx), 1);
        renderAddOnsEditor();
        updatePreview();
      });
    });
    mount.querySelectorAll('.b-addon-item-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        addOnAt(btn).items.push({ label: '' });
        renderAddOnsEditor();
      });
    });
  }

  function escapeAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function setBuildMode(mode) {
    buildMode = mode;
    root.querySelectorAll('.b-mode-btn').forEach((b) => b.classList.toggle('selected', b.dataset.mode === mode));
    root.querySelector('#form-mode').classList.toggle('hidden', mode !== 'form');
    root.querySelector('#upload-mode').classList.toggle('hidden', mode !== 'upload');
    if (mode === 'form') fillFormFromCube();
  }

  function fillFormFromCube() {
    root.querySelector('#f-title').value = cube.title || '';
    root.querySelector('#f-blurb').value = cube.blurb || '';
    root.querySelector('#f-tags').value = (cube.tags || []).join(', ');
    renderEditor();
    renderAddOnsEditor();
  }

  function setUploadStatus(kind, text) {
    const status = root.querySelector('#json-status');
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
    if (parsed.addOns != null) {
      if (!Array.isArray(parsed.addOns)) return '"addOns" must be a list.';
      for (const addOn of parsed.addOns) {
        if (!addOn || !addOn.title || !String(addOn.title).trim()) return 'Every add-on needs a "title".';
        if (!Array.isArray(addOn.items) || !addOn.items.length) return `Add-on "${addOn.title}" needs an "items" array.`;
        for (const item of addOn.items) {
          if (!item || !item.label || !String(item.label).trim()) return 'Every add-on item needs a "label".';
        }
      }
    }
    return null;
  }

  function normalizeLoaded(parsed) {
    return {
      title: parsed.title || '',
      blurb: parsed.blurb || '',
      tags: Array.isArray(parsed.tags) ? dedupeTags(parsed.tags) : [],
      items: parsed.items.map((item) => ({ label: String(item.label).trim() })),
      addOns: (Array.isArray(parsed.addOns) ? parsed.addOns : []).map((addOn) => ({
        id: addOn.id || undefined,
        title: String(addOn.title || '').trim(),
        items: (addOn.items || []).map((item) => ({ label: String(item.label).trim() })),
      })),
      is_public: !!parsed.is_public,
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
    if (parsed.id) root.querySelector('#f-id').value = slugify(parsed.id);
    setUploadStatus('ok', `✓ Loaded "${cube.title}" — ${cube.items.length} items`);
    fillFormFromCube();
    updatePreview();
  }

  function wantsPublic() {
    const box = root.querySelector('#f-public');
    return !!(box && box.checked);
  }

  function updatePreview() {
    const titleEl = root.querySelector('#prev-title');
    const blurbEl = root.querySelector('#prev-blurb');
    const metaEl = root.querySelector('#prev-meta');
    const idInput = root.querySelector('#f-id');
    const hint = root.querySelector('#validation-hint');
    const btn = root.querySelector('#publish-btn');
    const stepTitle = root.querySelector('#publish-step-title');
    if (!titleEl) return;

    const count = cube.items.filter((i) => i.label.trim()).length;
    const addOnCount = cube.addOns.filter((a) => a.title.trim() && a.items.some((i) => i.label.trim())).length;
    const makePublic = wantsPublic();

    titleEl.textContent = cube.title || 'Untitled cube';
    blurbEl.textContent = cube.blurb || '';
    metaEl.textContent = `${count} item${count === 1 ? '' : 's'}`
      + (addOnCount ? ` · ${addOnCount} add-on${addOnCount === 1 ? '' : 's'}` : '')
      + (makePublic || existingPublic ? ' · public' : ' · private');

    if (!idManuallyEdited) idInput.value = slugify(cube.title);
    root.querySelector('#id-preview').innerHTML = makePublic || existingPublic
      ? `Will be available site-wide at <code>/packing-cubes/cube.html?cube=${slugify(idInput.value)}</code>`
      : `Saved privately to your account (only you can see it until you make it public).`;

    stepTitle.textContent = isEditing ? 'Save changes' : 'Save';
    btn.textContent = existingPublic
      ? 'Save public cube'
      : (makePublic
        ? (isEditing ? 'Save & make public' : 'Save as public cube')
        : (isEditing ? 'Save private cube' : 'Save private cube'));

    if (!cube.title.trim()) {
      hint.textContent = 'Add a title first.'; hint.classList.remove('hidden'); btn.disabled = true;
    } else if (count < 2) {
      hint.textContent = 'Add at least 2 items first.'; hint.classList.remove('hidden'); btn.disabled = true;
    } else if (!auth?.signedIn || !auth.token) {
      hint.textContent = 'Sign in to save cubes.'; hint.classList.remove('hidden'); btn.disabled = true;
    } else {
      hint.classList.add('hidden'); btn.disabled = false;
    }
  }

  function currentCubeObject() {
    const id = slugify(root.querySelector('#f-id').value) || slugify(cube.title);
    return {
      id,
      title: cube.title.trim(),
      blurb: (cube.blurb || '').trim(),
      tags: cube.tags || [],
      items: cube.items.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim() })),
      addOns: cube.addOns
        .map((addOn) => ({
          id: addOn.id,
          title: addOn.title.trim(),
          items: addOn.items.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim() })),
        }))
        .filter((addOn) => addOn.title && addOn.items.length),
    };
  }

  async function save() {
    const btn = root.querySelector('#publish-btn');
    const toast = root.querySelector('#publish-toast');
    btn.disabled = true;
    toast.className = 'b-toast';
    toast.textContent = 'Saving…';
    try {
      const payload = currentCubeObject();
      let saved;
      if (isEditing) {
        const data = await cubesApi.update(auth.token, payload);
        saved = data.cube;
        if (data.warning) toast.textContent = data.warning;
      } else {
        const data = await cubesApi.create(auth.token, payload);
        saved = data.cube;
      }

      if (wantsPublic() && !saved.is_public) {
        toast.textContent = 'Publishing to the site catalog…';
        const published = await cubesApi.publish(auth.token, saved.id);
        saved = published.cube;
        toast.textContent = `Public — live after deploy.${published.prUrl ? ' PR auto-merged.' : ''}`;
        if (published.prUrl) {
          const link = document.createElement('a');
          link.href = published.prUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = ' View PR';
          link.style.color = 'inherit';
          toast.appendChild(link);
        }
      } else if (!toast.textContent || toast.textContent === 'Saving…') {
        toast.textContent = saved.is_public
          ? 'Saved public cube.'
          : 'Saved private cube to your account.';
      }
      toast.className = 'b-toast ok';
      if (onPublished) onPublished({ id: saved.id, isEditing, cube: saved });
      if (!isEditing) {
        // After create, treat further clicks as edits of the new id.
        root.querySelector('#f-id').value = saved.id;
        root.querySelector('#f-id').disabled = true;
      }
      existingPublic = !!saved.is_public;
      applyAuthUi();
    } catch (err) {
      toast.textContent = `Couldn't save: ${err.message}`;
      toast.className = 'b-toast err';
      btn.disabled = false;
    }
  }

  render();

  (async () => {
    if (!auth) {
      auth = await initAuth();
      if (auth.configured && auth.user && !auth.token) await refreshToken(auth);
    }
    if (!auth.signedIn || !auth.token) {
      const loginHref = `/account.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      root.innerHTML = `<p style="font-weight:700;color:var(--brown);padding:24px 0">Sign in to create or edit cubes. <a href="${loginHref}">Log in</a></p>`;
      wireAuthLink(auth);
      return;
    }
    wireAuthLink(auth);
    updatePreview();

    if (templateId && !isEditing) {
      // Prefill from an existing cube as a starting point for the user's own.
      try {
        let source = null;
        try {
          source = (await cubesApi.get(auth.token, templateId)).cube;
        } catch (err) {
          if (err.status !== 404) throw err;
        }
        if (!source) {
          const res = await fetch(cubeJsonUrl(templateId));
          if (!res.ok) throw new Error('template cube not found');
          source = await res.json();
        }
        cube = normalizeLoaded(source);
        // The copy is a personal cube: drop curation tags and start private.
        cube.tags = cube.tags.filter((t) => !['common', 'standard', 'basics'].includes(t.toLowerCase()));
        cube.is_public = false;
        idManuallyEdited = false; // id follows whatever title the user picks
        fillFormFromCube();
        updatePreview();
      } catch (err) {
        setUploadStatus('err', `Couldn't load the template: ${err.message}`);
      }
    }

    if (isEditing) {
      const btn = root.querySelector('#publish-btn');
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const data = await cubesApi.get(auth.token, editId);
        if (!data.cube.mine) throw new Error('You can only edit cubes you own.');
        cube = normalizeLoaded(data.cube);
        existingPublic = !!data.cube.is_public;
        root.querySelector('#f-id').value = editId;
        fillFormFromCube();
        applyAuthUi();
      } catch (err) {
        // Fall back to static file for legacy public cubes the user doesn't own — show read-only error.
        try {
          const res = await fetch(cubeJsonUrl(editId));
          if (!res.ok) throw err;
          root.innerHTML = `<p style="font-weight:700;color:var(--brown);padding:24px 0">You can only edit cubes you own. This catalog cube is read-only.</p>`;
        } catch {
          root.innerHTML = `<p style="font-weight:700;color:var(--brown);padding:24px 0">Could not load that cube to edit: ${escapeAttr(err.message)}</p>`;
        }
      }
    }
  })();
}

// Standalone bootstrap for builder.html, which has its own dedicated
// #builder-root and reads ?edit= from the page URL.
const standaloneRoot = document.getElementById('builder-root');
if (standaloneRoot) {
  const pageParams = new URLSearchParams(location.search);
  initBuilder({
    root: standaloneRoot,
    editId: pageParams.get('edit'),
    templateId: pageParams.get('template'),
  });
}
