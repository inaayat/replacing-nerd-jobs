// Ranking. Reorder a shuffled list into the correct sequence — drag a row by
// its handle, or use the up/down buttons — then submit for scoring (partial
// credit per correct slot). items: [{label}, ...] or [string, ...] already
// given in correct order.
export default {
  render(root, quiz, engine) {
    const correctOrder = quiz.items.map((it) => (typeof it === 'string' ? it : it.label));
    let order = shuffle(correctOrder.map((label, origIdx) => ({ label, origIdx })));
    let submitted = false;

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

    function renderList() {
      list.innerHTML = '';
      order.forEach((it, i) => {
        const row = document.createElement('div'); row.className = 'q-rank-item';
        row.innerHTML = `<div class="q-rank-num">${i + 1}</div><div class="q-rank-label"></div><div class="q-rank-handle" title="Drag to reorder">⠿⠿</div>`;
        row.querySelector('.q-rank-label').textContent = it.label;
        const moveBox = document.createElement('div'); moveBox.className = 'q-rank-move';
        const up = document.createElement('button'); up.type = 'button'; up.textContent = '▲'; up.disabled = submitted || i === 0;
        const down = document.createElement('button'); down.type = 'button'; down.textContent = '▼'; down.disabled = submitted || i === order.length - 1;
        up.addEventListener('click', () => move(i, -1));
        down.addEventListener('click', () => move(i, 1));
        moveBox.appendChild(up); moveBox.appendChild(down);
        row.appendChild(moveBox);
        const handle = row.querySelector('.q-rank-handle');
        if (submitted) handle.style.visibility = 'hidden';
        else handle.addEventListener('pointerdown', (e) => onPointerDown(e, i));
        list.appendChild(row);
      });
    }

    function scoreAndLock(credit) {
      if (submitted) return;
      submitted = true;
      renderList();
      [...list.children].forEach((row, i) => {
        const isRight = order[i].origIdx === i;
        row.classList.add(credit && isRight ? 'correct' : 'incorrect');
      });
      order.forEach((it, i) => {
        if (credit && it.origIdx === i) engine.correct(); else engine.advance();
      });
      submitBtn.disabled = true;
    }

    submitBtn.addEventListener('click', () => scoreAndLock(true));
    engine.registerReveal(() => {
      if (submitted) return;
      order = correctOrder.map((label, origIdx) => ({ label, origIdx }));
      scoreAndLock(false);
    });

    renderList();
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
