// Free-response / fill-in / "name all N" completionist, or a table of
// dedicated per-row inputs. items: { accept:[...], display, clue? }
//   accept  = strings that count as correct (aliases ok)
//   display = what shows once solved
//   clue    = hint text (shown in the slot before solved, or as a table column)
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

function renderFillIn(root, quiz, engine) {
  const items = quiz.items.slice();
  const solved = new Array(items.length).fill(false);

  root.innerHTML = `
    <input class="q-input" id="te-input" placeholder="${quiz.prompt || 'Type an answer…'}" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <div class="q-slots" id="te-slots"></div>`;
  const input = root.querySelector('#te-input');
  const slotsEl = root.querySelector('#te-slots');

  const slots = items.map((it) => {
    const d = document.createElement('div');
    d.className = 'q-slot';
    d.textContent = it.clue || ' ';
    slotsEl.appendChild(d);
    return d;
  });

  function fill(idx, missed) {
    solved[idx] = true;
    slots[idx].textContent = items[idx].display;
    slots[idx].classList.add(missed ? 'missed' : 'filled');
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
        input.value = it.display || it.accept[0];
        input.disabled = true;
        tr.classList.add('correct');
        engine.correct();
      }
    });
    return tr;
  });

  engine.registerReveal(() => {
    items.forEach((it, idx) => {
      if (solved[idx]) return;
      solved[idx] = true;
      const input = rows[idx].querySelector('input');
      input.value = it.display || it.accept[0];
      input.disabled = true;
      rows[idx].classList.add('missed');
      engine.advance();
    });
  });
}
