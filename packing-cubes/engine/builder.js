// Cube builder: name a cube, list its items, optionally give it add-ons.
// Cubes are private to their owner — there is no catalog and nothing to
// publish, so there is no id field and no visibility choice here.
// Exported as initBuilder() so it can run standalone on builder.html or
// inline inside a modal on the main packing-cubes page.
import { initAuth, wireAuthLink, refreshToken, renderPackingSignIn } from './auth.js';
import { cubesApi } from './api.js';

export function initBuilder({ root, editId = null, auth: passedAuth = null, onSaved, onClose } = {}) {
  const isEditing = !!editId;

  let cube = { title: '', blurb: '', tags: [], items: [{ label: '' }, { label: '' }], addOns: [] };
  let auth = passedAuth;
  let savedId = null;

  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
  function escapeAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function render() {
    root.innerHTML = '';
    root.appendChild(el(`
      <div class="b-head-row">
        <h1 class="b-h1">${isEditing ? 'Edit cube' : 'New cube'}</h1>
        ${onClose ? '<button type="button" class="pc-preview-close" id="b-close" aria-label="Close">&times;</button>' : ''}
      </div>
      <p class="b-lede">A cube is a reusable group of items you can drop onto any packing list.</p>

      <div class="b-block">
        <div class="b-field">
          <label for="f-title">Cube name</label>
          <input type="text" id="f-title" placeholder="Toiletries, Beach, Work trip…" autocomplete="off">
        </div>
        <div class="b-field">
          <label for="f-blurb">Note <span class="b-optional">optional</span></label>
          <input type="text" id="f-blurb" placeholder="A reminder of what this cube is for" autocomplete="off">
        </div>
      </div>

      <div class="b-block">
        <div class="b-block-head">
          <h2 class="b-h2">Items <span class="b-count" id="item-count"></span></h2>
          <button type="button" class="b-text-btn" id="paste-toggle">Paste a list instead</button>
        </div>
        <div id="form-mode">
          <div id="editor-mount"></div>
          <button type="button" class="b-add-row-btn" id="add-item-btn">+ Add item</button>
          <p class="b-hint">Press Enter to jump to the next item.</p>
        </div>
        <div id="paste-mode" class="hidden">
          <p class="b-hint">One item per line — paste from notes, a text message, anywhere.</p>
          <textarea class="b-mini-input" id="paste-box" rows="7" placeholder="Toothbrush&#10;Toothpaste&#10;Deodorant"></textarea>
          <div class="b-paste-actions">
            <button type="button" class="pc-btn primary sm" id="paste-apply">Use these items</button>
            <button type="button" class="b-text-btn" id="paste-cancel">Back to the list</button>
          </div>
        </div>
      </div>

      <div class="b-block">
        <div class="b-block-head">
          <h2 class="b-h2">Add-ons <span class="b-optional">optional</span></h2>
        </div>
        <p class="b-hint">Extras you only sometimes take, grouped and named — travel meds, hair tools. You can switch them on per trip instead of building another cube.</p>
        <div id="addons-mount"></div>
        <button type="button" class="b-add-row-btn" id="add-addon-btn">+ Add an add-on</button>
      </div>

      <div class="b-save-bar">
        <div class="b-validation hidden" id="validation-hint"></div>
        <button type="button" class="pc-btn primary" id="save-btn">${isEditing ? 'Save changes' : 'Create cube'}</button>
        <div class="b-toast" id="save-toast"></div>
      </div>
    `));

    ['f-title', 'f-blurb'].forEach((id) => {
      root.querySelector('#' + id).addEventListener('input', onFieldsChange);
    });
    root.querySelector('#save-btn').addEventListener('click', save);
    root.querySelector('#add-item-btn').addEventListener('click', () => {
      cube.items.push({ label: '' });
      renderEditor();
      focusItem(cube.items.length - 1);
    });
    root.querySelector('#add-addon-btn').addEventListener('click', () => {
      cube.addOns.push({ title: '', items: [{ label: '' }] });
      renderAddOnsEditor();
    });
    root.querySelector('#paste-toggle').addEventListener('click', () => setPasteMode(true));
    root.querySelector('#paste-cancel').addEventListener('click', () => setPasteMode(false));
    root.querySelector('#paste-apply').addEventListener('click', applyPastedList);
    if (onClose) root.querySelector('#b-close').addEventListener('click', onClose);

    renderEditor();
    renderAddOnsEditor();
    if (auth) wireAuthLink(auth);
    updateState();
  }

  function setPasteMode(on) {
    root.querySelector('#form-mode').classList.toggle('hidden', on);
    root.querySelector('#paste-mode').classList.toggle('hidden', !on);
    root.querySelector('#paste-toggle').classList.toggle('hidden', on);
    if (on) root.querySelector('#paste-box').focus();
  }

  function applyPastedList() {
    const lines = root.querySelector('#paste-box').value
      .split('\n')
      // Tolerate bullets and numbering people paste in from notes apps.
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    if (!lines.length) {
      setValidation('Nothing to add — paste one item per line.');
      return;
    }
    const existing = cube.items.filter((i) => i.label.trim());
    const seen = new Set(existing.map((i) => i.label.trim().toLowerCase()));
    for (const label of lines) {
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      existing.push({ label });
    }
    cube.items = existing.length ? existing : [{ label: '' }];
    root.querySelector('#paste-box').value = '';
    setPasteMode(false);
    renderEditor();
    updateState();
  }

  function onFieldsChange() {
    cube.title = root.querySelector('#f-title').value;
    cube.blurb = root.querySelector('#f-blurb').value;
    updateState();
  }

  function focusItem(index) {
    const input = root.querySelectorAll('.b-item-label')[index];
    if (input) input.focus();
  }

  function renderEditor() {
    const mount = root.querySelector('#editor-mount');
    if (!mount) return;
    mount.innerHTML = cube.items.map((item, i) => `
      <div class="b-item-row" data-idx="${i}">
        <input type="text" class="b-mini-input b-item-label" value="${escapeAttr(item.label)}"
          placeholder="Item ${i + 1}" autocomplete="off">
        <button type="button" class="b-remove-btn" title="Remove item" aria-label="Remove item ${i + 1}"
          ${cube.items.length <= 1 ? 'disabled' : ''}>&times;</button>
      </div>
    `).join('');

    mount.querySelectorAll('.b-item-label').forEach((input) => {
      const idx = () => Number(input.closest('.b-item-row').dataset.idx);
      input.addEventListener('input', () => {
        cube.items[idx()].label = input.value;
        updateState();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const i = idx();
        if (i === cube.items.length - 1) {
          if (!input.value.trim()) return;
          cube.items.push({ label: '' });
          renderEditor();
          updateState();
        }
        focusItem(i + 1);
      });
    });

    mount.querySelectorAll('.b-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (cube.items.length <= 1) return;
        cube.items.splice(Number(btn.closest('.b-item-row').dataset.idx), 1);
        renderEditor();
        updateState();
      });
    });
  }

  function renderAddOnsEditor() {
    const mount = root.querySelector('#addons-mount');
    if (!mount) return;
    mount.innerHTML = cube.addOns.map((addOn, ai) => `
      <div class="b-addon" data-addon-idx="${ai}">
        <div class="b-addon-head">
          <input type="text" class="b-mini-input b-addon-title" value="${escapeAttr(addOn.title)}"
            placeholder="Add-on name (e.g. Travel meds)" autocomplete="off">
          <button type="button" class="b-remove-btn b-addon-remove" title="Remove add-on" aria-label="Remove add-on">&times;</button>
        </div>
        <div class="b-addon-items">
          ${addOn.items.map((item, ii) => `
            <div class="b-item-row" data-item-idx="${ii}">
              <input type="text" class="b-mini-input b-addon-item-label" value="${escapeAttr(item.label)}"
                placeholder="Item ${ii + 1}" autocomplete="off">
              <button type="button" class="b-remove-btn b-addon-item-remove" title="Remove" aria-label="Remove item"
                ${addOn.items.length <= 1 ? 'disabled' : ''}>&times;</button>
            </div>`).join('')}
        </div>
        <button type="button" class="b-add-row-btn b-addon-item-add">+ Add item</button>
      </div>
    `).join('');

    const addOnAt = (el2) => cube.addOns[Number(el2.closest('.b-addon').dataset.addonIdx)];
    mount.querySelectorAll('.b-addon-title').forEach((input) => {
      input.addEventListener('input', () => { addOnAt(input).title = input.value; updateState(); });
    });
    mount.querySelectorAll('.b-addon-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        cube.addOns.splice(Number(btn.closest('.b-addon').dataset.addonIdx), 1);
        renderAddOnsEditor();
        updateState();
      });
    });
    mount.querySelectorAll('.b-addon-item-label').forEach((input) => {
      input.addEventListener('input', () => {
        addOnAt(input).items[Number(input.closest('.b-item-row').dataset.itemIdx)].label = input.value;
        updateState();
      });
    });
    mount.querySelectorAll('.b-addon-item-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const addOn = addOnAt(btn);
        if (addOn.items.length <= 1) return;
        addOn.items.splice(Number(btn.closest('.b-item-row').dataset.itemIdx), 1);
        renderAddOnsEditor();
        updateState();
      });
    });
    mount.querySelectorAll('.b-addon-item-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        addOnAt(btn).items.push({ label: '' });
        renderAddOnsEditor();
      });
    });
  }

  function setValidation(message) {
    const hint = root.querySelector('#validation-hint');
    if (!hint) return;
    hint.textContent = message || '';
    hint.classList.toggle('hidden', !message);
  }

  function filledItems() {
    return cube.items.filter((i) => i.label.trim());
  }

  function updateState() {
    const countEl = root.querySelector('#item-count');
    const btn = root.querySelector('#save-btn');
    if (!btn) return;
    const count = filledItems().length;
    if (countEl) countEl.textContent = count ? `· ${count}` : '';

    // Only nag once there's something to nag about — an untouched form is
    // not an error, it's just empty.
    if (!cube.title.trim()) {
      setValidation(count ? 'Give the cube a name to save it.' : '');
      btn.disabled = true;
    } else if (count < 2) {
      setValidation('Add at least two items.');
      btn.disabled = true;
    } else if (!auth?.signedIn || !auth.token) {
      setValidation('Sign in to save cubes.');
      btn.disabled = true;
    } else {
      setValidation('');
      btn.disabled = false;
    }
  }

  function currentCubeObject() {
    return {
      ...(isEditing || savedId ? { id: editId || savedId } : {}),
      title: cube.title.trim(),
      blurb: (cube.blurb || '').trim(),
      tags: cube.tags || [],
      items: filledItems().map((i) => ({ label: i.label.trim() })),
      addOns: cube.addOns
        .map((addOn) => ({
          ...(addOn.id ? { id: addOn.id } : {}),
          title: addOn.title.trim(),
          items: addOn.items.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim() })),
        }))
        .filter((addOn) => addOn.title && addOn.items.length),
    };
  }

  async function save() {
    const btn = root.querySelector('#save-btn');
    const toast = root.querySelector('#save-toast');
    btn.disabled = true;
    toast.className = 'b-toast';
    toast.textContent = 'Saving…';
    try {
      const payload = currentCubeObject();
      const isUpdate = isEditing || !!savedId;
      const data = isUpdate
        ? await cubesApi.update(auth.token, payload)
        : await cubesApi.create(auth.token, payload);
      const saved = data.cube;
      savedId = saved.id;
      toast.textContent = isUpdate ? 'Saved.' : 'Cube created.';
      toast.className = 'b-toast ok';
      if (onSaved) onSaved({ id: saved.id, isEditing, cube: saved });
      if (onClose) setTimeout(onClose, 550);
      else btn.disabled = false;
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
      renderPackingSignIn(root, {
        title: 'Sign in to build cubes',
        copy: 'Cubes live on your account so you can reuse them on every trip.',
        note: !auth.configured
          ? '<p class="pc-gate-error">Sign-in isn’t configured on this deployment yet.</p>'
          : '',
      });
      if (!auth.configured) {
        const form = root.querySelector('#pc-auth');
        if (form) form.hidden = true;
      }
      wireAuthLink(auth);
      return;
    }
    wireAuthLink(auth);
    updateState();

    if (isEditing) {
      const btn = root.querySelector('#save-btn');
      btn.disabled = true;
      try {
        const { cube: loaded } = await cubesApi.get(auth.token, editId);
        if (!loaded.mine) throw new Error('You can only edit your own cubes.');
        cube = {
          title: loaded.title || '',
          blurb: loaded.blurb || '',
          tags: Array.isArray(loaded.tags) ? loaded.tags : [],
          items: (loaded.items || []).map((i) => ({ label: String(i.label || '') })),
          addOns: (loaded.addOns || []).map((a) => ({
            id: a.id,
            title: a.title || '',
            items: (a.items || []).map((i) => ({ label: String(i.label || '') })),
          })),
        };
        if (!cube.items.length) cube.items = [{ label: '' }];
        root.querySelector('#f-title').value = cube.title;
        root.querySelector('#f-blurb').value = cube.blurb;
        renderEditor();
        renderAddOnsEditor();
        updateState();
      } catch (err) {
        root.innerHTML = `<p class="b-signin">Could not open that cube: ${escapeAttr(err.message)}</p>`;
      }
    }
  })();
}

// Standalone bootstrap for builder.html, which has its own dedicated
// #builder-root and reads ?edit= from the page URL.
const standaloneRoot = document.getElementById('builder-root');
if (standaloneRoot) {
  initBuilder({
    root: standaloneRoot,
    editId: new URLSearchParams(location.search).get('edit'),
  });
}
