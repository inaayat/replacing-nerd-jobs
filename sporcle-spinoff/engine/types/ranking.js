// Ranking. Reorder a shuffled list into the correct sequence — drag a row by
// its handle, or use the up/down buttons — then submit for scoring (partial
// credit per correct slot). On completion the list is re-shown in the correct
// order with each item's value revealed.
// items: [{ label, value? }, ...] or [string, ...], given in correct order.
// value is any string (a year, "$4.2B", "#1", "8.3M"…), hidden during play
// (it's the answer key) and revealed at the end. quiz.valueLabel optionally
// names what the value is (e.g. "Box office"). "date" is accepted as a legacy
// alias for value.
export default {
  render(root, quiz, engine) {
    const canonical = quiz.items.map((it, i) => ({
      label: typeof it === 'string' ? it : (it.label || ''),
      value: typeof it === 'string' ? '' : (it.value != null ? it.value : (it.date != null ? it.date : '')),
      origIdx: i,
    }));
    let order = shuffle(canonical.slice());
    let submitted = false;

    const caption = document.createElement('div');
    caption.className = 'q-rank-caption';
    caption.textContent = 'Correct order';
    caption.style.display = 'none';
    root.appendChild(caption);

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
        row.innerHTML = `<div class="q-rank-num">${i + 1}</div><div class="q-rank-label"></div><div class="q-rank-handle" title="Drag to reorder">⠿⠿</div>`;
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
      const rightByOrig = {};
      order.forEach((it, i) => { rightByOrig[it.origIdx] = it.origIdx === i; });
      const correct = [...order].sort((a, b) => a.origIdx - b.origIdx);
      list.innerHTML = '';
      correct.forEach((it, i) => {
        const state = credit ? (rightByOrig[it.origIdx] ? 'correct' : 'incorrect') : 'revealed';
        const row = document.createElement('div'); row.className = `q-rank-item ${state}`;
        row.innerHTML = `<div class="q-rank-num">${i + 1}</div><div class="q-rank-label"></div><div class="q-rank-value"></div>`;
        row.querySelector('.q-rank-label').textContent = it.label;
        row.querySelector('.q-rank-value').textContent = it.value != null ? it.value : '';
        list.appendChild(row);
      });
      caption.textContent = quiz.valueLabel ? `Correct order · ${quiz.valueLabel}` : 'Correct order';
      caption.style.display = '';
      actions.style.display = 'none';
    }

    function scoreAndLock(credit) {
      if (submitted) return;
      submitted = true;
      renderAnswer(credit);
      order.forEach((it, i) => {
        if (credit && it.origIdx === i) engine.correct(); else engine.advance();
      });
    }

    submitBtn.addEventListener('click', () => scoreAndLock(true));
    engine.registerReveal(() => scoreAndLock(false));

    renderList();
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
