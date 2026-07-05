// Ranking. Reorder a shuffled list into the correct sequence using up/down
// move buttons, then submit for scoring (partial credit per correct slot).
// items: [{label}, ...] or [string, ...] already given in correct order.
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

    function renderList() {
      list.innerHTML = '';
      order.forEach((it, i) => {
        const row = document.createElement('div'); row.className = 'q-rank-item';
        row.innerHTML = `<div class="q-rank-num">${i + 1}</div><div class="q-rank-label"></div>`;
        row.querySelector('.q-rank-label').textContent = it.label;
        const moveBox = document.createElement('div'); moveBox.className = 'q-rank-move';
        const up = document.createElement('button'); up.type = 'button'; up.textContent = '▲'; up.disabled = submitted || i === 0;
        const down = document.createElement('button'); down.type = 'button'; down.textContent = '▼'; down.disabled = submitted || i === order.length - 1;
        up.addEventListener('click', () => move(i, -1));
        down.addEventListener('click', () => move(i, 1));
        moveBox.appendChild(up); moveBox.appendChild(down);
        row.appendChild(moveBox);
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
