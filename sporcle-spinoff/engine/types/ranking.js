// Ranking. Reorder a shuffled list into the correct sequence — drag a row by
// its handle, or use the up/down buttons — then submit for scoring (partial
// credit per correct slot). On completion the list is re-shown in the correct
// order with each item's value revealed.
// items: [{ label, value? }, ...] or [string, ...], given in correct order.
// value is any string (a year, "$4.2B", "#1", "8.3M"…), hidden during play
// (it's the answer key) and revealed at the end. quiz.valueLabel optionally
// names what the value is (e.g. "Box office"). "date" is accepted as a legacy
// alias for value.
//
// quiz.sortBy sets what the correct order is:
//   undefined / "author"  → the order the items are listed in (default)
//   "value-desc"          → sorted by value, highest first
//   "value-asc"           → sorted by value, lowest first
// With a value-sort the item order in the file doesn't matter — the engine
// parses each value ($2.92B, #1, 476 AD…) into a number and ranks by it.
export default {
  render(root, quiz, engine) {
    const raw = quiz.items.map((it, i) => ({
      label: typeof it === 'string' ? it : (it.label || ''),
      value: typeof it === 'string' ? '' : (it.value != null ? it.value : (it.date != null ? it.date : '')),
      srcIdx: i,
    }));

    // Assign each item its correct position (correctPos).
    if (quiz.sortBy === 'value-desc' || quiz.sortBy === 'value-asc') {
      const dir = quiz.sortBy === 'value-asc' ? 1 : -1;
      [...raw]
        .sort((a, b) => {
          const na = parseValue(a.value), nb = parseValue(b.value);
          if (na == null && nb == null) return a.srcIdx - b.srcIdx;
          if (na == null) return 1;   // unparseable sinks to the bottom
          if (nb == null) return -1;
          if (na === nb) return a.srcIdx - b.srcIdx;
          return (na - nb) * dir;
        })
        .forEach((it, pos) => { it.correctPos = pos; });
    } else {
      raw.forEach((it, pos) => { it.correctPos = pos; });
    }

    // The value that belongs at each rank (used by the optional hint), and
    // whether there are any values to hint with at all.
    const valuesByPos = [];
    raw.forEach((it) => { valuesByPos[it.correctPos] = it.value; });
    const hasValues = raw.some((it) => it.value !== '' && it.value != null);
    const hintNoun = quiz.valueLabel || 'value';

    let order = shuffle(raw.slice());
    let submitted = false;
    let hintOn = false;

    const caption = document.createElement('div');
    caption.className = 'q-rank-caption';
    caption.textContent = 'Correct order';
    caption.style.display = 'none';
    root.appendChild(caption);

    // Optional hint: show the value that belongs at each rank, so the player
    // places items to match. Off by default (harder); the player toggles it.
    const hintBar = document.createElement('div');
    hintBar.className = 'q-rank-hintbar';
    if (hasValues) {
      hintBar.innerHTML = `<button class="q-btn" id="q-rank-hint" type="button">💡 Show ${hintNoun} hints</button>`;
      root.appendChild(hintBar);
      hintBar.querySelector('#q-rank-hint').addEventListener('click', (e) => {
        hintOn = !hintOn;
        e.target.textContent = hintOn ? `Hide ${hintNoun} hints` : `💡 Show ${hintNoun} hints`;
        renderList();
      });
    }

    const list = document.createElement('div'); list.className = 'q-rank';
    root.appendChild(list);
    const actions = document.createElement('div'); actions.className = 'q-actions'; actions.style.marginTop = '16px';
    actions.innerHTML = '<button class="q-btn primary" id="q-rank-submit">Submit order</button>';
    root.appendChild(actions);
    const submitBtn = actions.querySelector('#q-rank-submit');

    function move(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      renderList();
    }

    let dragEl = null, dragIndex = null, startY = 0, rowHeight = 0;

    function onPointerDown(e, idx) {
      if (submitted) return;
      e.preventDefault();
      dragIndex = idx;
      startY = e.clientY;
      dragEl = list.children[idx];
      rowHeight = dragEl.getBoundingClientRect().height;
      dragEl.classList.add('dragging');
      dragEl.style.zIndex = 10;
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
      if (!dragEl) return;
      const deltaY = e.clientY - startY;
      dragEl.style.transform = `translateY(${deltaY}px)`;
      if (Math.abs(deltaY) > rowHeight / 2) {
        const dir = deltaY > 0 ? 1 : -1;
        const newIndex = dragIndex + dir;
        if (newIndex >= 0 && newIndex < order.length) {
          const [moved] = order.splice(dragIndex, 1);
          order.splice(newIndex, 0, moved);
          dragIndex = newIndex;
          startY = e.clientY;
          renderList();
          dragEl = list.children[dragIndex];
          dragEl.classList.add('dragging');
          dragEl.style.zIndex = 10;
        }
      }
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dragEl = null; dragIndex = null;
      renderList();
    }

    // Play-time render: labels only, no dates (they'd give the order away).
    function renderList() {
      list.innerHTML = '';
      order.forEach((it, i) => {
        const row = document.createElement('div'); row.className = 'q-rank-item';
        // When the hint is on, show the value that belongs at THIS rank (fixed
        // to the position, not the item) so the player can match items to it.
        const hintHtml = hintOn
          ? `<div class="q-rank-value q-rank-hint">${valuesByPos[i] != null ? valuesByPos[i] : ''}</div>`
          : '';
        row.innerHTML = `<div class="q-rank-num">${i + 1}</div><div class="q-rank-label"></div>${hintHtml}<div class="q-rank-handle" title="Drag to reorder">⠿⠿</div>`;
        row.querySelector('.q-rank-label').textContent = it.label;
        const moveBox = document.createElement('div'); moveBox.className = 'q-rank-move';
        const up = document.createElement('button'); up.type = 'button'; up.textContent = '▲'; up.disabled = i === 0;
        const down = document.createElement('button'); down.type = 'button'; down.textContent = '▼'; down.disabled = i === order.length - 1;
        up.addEventListener('click', () => move(i, -1));
        down.addEventListener('click', () => move(i, 1));
        moveBox.appendChild(up); moveBox.appendChild(down);
        row.appendChild(moveBox);
        row.querySelector('.q-rank-handle').addEventListener('pointerdown', (e) => onPointerDown(e, i));
        list.appendChild(row);
      });
    }

    // End-of-quiz render: correct order, values revealed, each row marked by
    // whether the player had placed that item in its right slot.
    function renderAnswer(credit) {
      const rightByPos = {};
      order.forEach((it, i) => { rightByPos[it.correctPos] = it.correctPos === i; });
      const correct = [...order].sort((a, b) => a.correctPos - b.correctPos);
      list.innerHTML = '';
      correct.forEach((it, i) => {
        const state = credit ? (rightByPos[it.correctPos] ? 'correct' : 'incorrect') : 'revealed';
        const row = document.createElement('div'); row.className = `q-rank-item ${state}`;
        row.innerHTML = `<div class="q-rank-num">${i + 1}</div><div class="q-rank-label"></div><div class="q-rank-value"></div>`;
        row.querySelector('.q-rank-label').textContent = it.label;
        row.querySelector('.q-rank-value').textContent = it.value != null ? it.value : '';
        list.appendChild(row);
      });
      caption.textContent = quiz.valueLabel ? `Correct order · ${quiz.valueLabel}` : 'Correct order';
      caption.style.display = '';
      actions.style.display = 'none';
      hintBar.style.display = 'none';
    }

    function scoreAndLock(credit) {
      if (submitted) return;
      submitted = true;
      renderAnswer(credit);
      order.forEach((it, i) => {
        if (credit && it.correctPos === i) engine.correct(); else engine.advance();
      });
    }

    submitBtn.addEventListener('click', () => scoreAndLock(true));
    engine.registerReveal(() => scoreAndLock(false));

    renderList();
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Pull a comparable number out of a formatted value string. Handles money
// ($/€/£, thousands commas), K/M/B/T magnitude suffixes, ranks (#1, No. 3),
// percentages, and years incl. BC (negative). Returns null if there's no
// number to read, so unparseable items can be sorted to the end.
function parseValue(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/,/g, '');
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  const after = cleaned.slice(cleaned.indexOf(m[0]) + m[0].length);
  const suffix = (after.match(/^\s*([kmbt])/i) || [])[1];
  if (suffix) n *= { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[suffix.toLowerCase()];
  if (/\bB\.?C\.?(?:E)?\b/i.test(s) && n > 0) n = -n;
  return n;
}
