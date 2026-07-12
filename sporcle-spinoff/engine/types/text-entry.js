// Free-response / fill-in / "name all N" completionist, or a table of
// dedicated per-row inputs. items: { accept:[...], clue?, group? }
//   accept  = strings that count as correct (aliases ok); accept[0] is
//             shown as the solved/revealed answer
//   clue    = hint text (shown in the slot before solved, or as a table column)
//   group   = (fill-in layout only) buckets this item under a labeled
//             sub-box instead of the flat slot list; items sharing a group
//             name fill into the same box, each with its own "found/total"
//             counter, while a single input still serves every group at
//             once — a correct guess routes to whichever group it belongs
//             to. Sections render in order of each group's first
//             appearance in items[]; ungrouped items keep rendering in one
//             flat, unlabeled section exactly as before.
//
// Default layout: one shared input; each correct typed answer fills its slot.
// layout: "table" — every row gets its own always-visible input, with
// quiz.columns:[{key,label}] rendered as read-only context columns first
// (matches a classic "clue sheet" quiz).
export default {
  render(root, quiz, engine) {
    if (quiz.layout === 'table') return renderTable(root, quiz, engine);
    return renderFillIn(root, quiz, engine);
  },
};

// accept[] is authored lowercase for matching; title-case it when shown as
// the solved/revealed answer so it doesn't look like a typo.
function titleCase(s) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

function renderFillIn(root, quiz, engine) {
  const items = quiz.items.slice();
  const solved = new Array(items.length).fill(false);

  root.innerHTML = `
    <input class="q-input" id="te-input" placeholder="${quiz.prompt || 'Type an answer…'}" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <div id="te-groups"></div>`;
  const input = root.querySelector('#te-input');
  const groupsEl = root.querySelector('#te-groups');

  // Bucket items by group (in order of first appearance); ungrouped items
  // ('' key) render in one flat, unlabeled section — identical markup to
  // before grouping existed, so untagged quizzes are unaffected.
  const order = [];
  const bucket = new Map();
  items.forEach((it, idx) => {
    const key = it.group || '';
    if (!bucket.has(key)) { bucket.set(key, []); order.push(key); }
    bucket.get(key).push(idx);
  });

  const slots = new Array(items.length);
  const counters = new Map(); // group key -> { el, found, total }

  order.forEach((key) => {
    const idxs = bucket.get(key);
    const section = document.createElement('div');
    section.className = 'q-group';
    if (key) {
      section.innerHTML = `<div class="q-group-head"><span class="q-group-label">${key}</span><span class="q-group-count">0/${idxs.length}</span></div>`;
      counters.set(key, { el: section.querySelector('.q-group-count'), found: 0, total: idxs.length });
    }
    const slotsEl = document.createElement('div');
    slotsEl.className = 'q-slots';
    section.appendChild(slotsEl);
    groupsEl.appendChild(section);

    idxs.forEach((idx) => {
      const d = document.createElement('div');
      d.className = 'q-slot';
      d.textContent = items[idx].clue || ' ';
      slotsEl.appendChild(d);
      slots[idx] = d;
    });
  });

  function fill(idx, missed) {
    solved[idx] = true;
    slots[idx].textContent = titleCase(items[idx].accept[0]);
    slots[idx].classList.add(missed ? 'missed' : 'filled');
    const key = items[idx].group;
    if (!missed && key && counters.has(key)) {
      const c = counters.get(key);
      c.found += 1;
      c.el.textContent = `${c.found}/${c.total}`;
    }
  }

  function tryAnswer() {
    const val = input.value;
    if (!engine.normalize(val)) return;
    for (let i = 0; i < items.length; i++) {
      if (solved[i]) continue;
      if (engine.matchAccept(val, items[i].accept)) {
        fill(i, false);
        input.value = '';
        input.classList.remove('q-flash-ok'); void input.offsetWidth; input.classList.add('q-flash-ok');
        engine.correct();
        return;
      }
    }
  }

  input.addEventListener('input', tryAnswer);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAnswer(); });
  setTimeout(() => input.focus(), 50);

  engine.registerReveal(() => {
    input.disabled = true;
    items.forEach((_, i) => { if (!solved[i]) fill(i, true); });
  });
}

function renderTable(root, quiz, engine) {
  const items = quiz.items;
  const columns = quiz.columns || (items[0] && items[0].clue !== undefined ? [{ key: 'clue', label: 'Clue' }] : []);
  const solved = new Array(items.length).fill(false);

  const table = document.createElement('table');
  table.className = 'q-table';
  table.innerHTML = `
    <thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}<th>${quiz.answerLabel || 'Answer'}</th></tr></thead>
    <tbody></tbody>`;
  root.appendChild(table);
  const tbody = table.querySelector('tbody');

  const rows = items.map((it, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map((c) => `<td>${it[c.key] != null ? it[c.key] : ''}</td>`).join('')
      + `<td><input class="q-table-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${quiz.prompt || 'Type it…'}"></td>`;
    tbody.appendChild(tr);
    const input = tr.querySelector('input');
    input.addEventListener('input', () => {
      if (solved[idx]) return;
      if (engine.matchAccept(input.value, it.accept)) {
        solved[idx] = true;
        input.value = titleCase(it.accept[0]);
        input.disabled = true;
        tr.classList.add('correct');
        engine.correct();
        focusNextUnsolved(idx);
      }
    });
    return tr;
  });

  function focusNextUnsolved(fromIdx) {
    for (let k = 1; k <= items.length; k++) {
      const idx = (fromIdx + k) % items.length;
      if (!solved[idx]) { rows[idx].querySelector('input').focus(); return; }
    }
  }

  engine.registerReveal(() => {
    items.forEach((it, idx) => {
      if (solved[idx]) return;
      solved[idx] = true;
      const input = rows[idx].querySelector('input');
      input.value = titleCase(it.accept[0]);
      input.disabled = true;
      rows[idx].classList.add('missed');
      engine.advance();
    });
  });
}
