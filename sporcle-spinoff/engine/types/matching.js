// Matching. Select one tile in each column, or drag a right-column tile onto
// its matching left-column prompt. Correct pairs lock in green; wrong pairs
// shake. items: [{ left, right }, ...].
export default {
  render(root, quiz, engine) {
    const items = quiz.items;
    const matched = new Array(items.length).fill(false);
    let ended = false;

    const wrap = document.createElement('div'); wrap.className = 'q-match';
    const colL = document.createElement('div'); colL.className = 'q-col';
    const colR = document.createElement('div'); colR.className = 'q-col';
    wrap.appendChild(colL); wrap.appendChild(colR);
    root.appendChild(wrap);

    // Left column = fixed drop targets. Right column = draggable answer tiles.
    const leftEls = [];
    shuffle(items.map((it, i) => ({ label: it.left, idx: i }))).forEach(({ label, idx }) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'q-match-item q-match-target';
      el.textContent = label;
      el.dataset.idx = idx;
      el.setAttribute('aria-label', `Prompt: ${label}`);
      el.setAttribute('aria-pressed', 'false');
      el.addEventListener('click', () => selectTile(el, 'left'));
      colL.appendChild(el);
      leftEls.push(el);
    });
    const rightEls = [];
    shuffle(items.map((it, i) => ({ label: it.right, idx: i }))).forEach(({ label, idx }) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'q-match-item q-match-drag';
      el.textContent = label;
      el.dataset.idx = idx;
      el.setAttribute('aria-label', `Answer: ${label}`);
      el.setAttribute('aria-pressed', 'false');
      el.addEventListener('pointerdown', (e) => startDrag(e, el, idx));
      el.addEventListener('click', () => {
        if (Date.now() < suppressClickUntil) return;
        selectTile(el, 'right');
      });
      colR.appendChild(el);
      rightEls.push(el);
    });

    let dragEl = null, clone = null, dragIdx = null, hoverTarget = null, offsetX = 0, offsetY = 0;
    let selectedEl = null, selectedSide = null, suppressClickUntil = 0;

    function clearSelection() {
      if (selectedEl) {
        selectedEl.classList.remove('selected');
        selectedEl.setAttribute('aria-pressed', 'false');
      }
      selectedEl = null;
      selectedSide = null;
    }

    function markPair(left, right, idx) {
      matched[idx] = true;
      left.classList.add('matched');
      right.classList.add('matched');
      left.disabled = true;
      right.disabled = true;
      clearSelection();
      engine.correct();
    }

    function shakePair(first, second) {
      first.classList.add('badmatch');
      second.classList.add('badmatch');
      setTimeout(() => {
        first.classList.remove('badmatch');
        second.classList.remove('badmatch');
      }, 350);
      clearSelection();
    }

    function selectTile(el, side) {
      const idx = Number(el.dataset.idx);
      if (ended || matched[idx]) return;
      if (selectedEl === el) {
        clearSelection();
        return;
      }
      if (!selectedEl || selectedSide === side) {
        clearSelection();
        selectedEl = el;
        selectedSide = side;
        el.classList.add('selected');
        el.setAttribute('aria-pressed', 'true');
        return;
      }

      const first = selectedEl;
      const left = side === 'left' ? el : first;
      const right = side === 'right' ? el : first;
      if (Number(left.dataset.idx) === Number(right.dataset.idx)) {
        markPair(left, right, Number(left.dataset.idx));
      } else {
        shakePair(first, el);
      }
    }

    function moveClone(x, y) {
      clone.style.left = `${x - offsetX}px`;
      clone.style.top = `${y - offsetY}px`;
    }

    function startDrag(e, el, idx) {
      if (ended || matched[idx]) return;
      e.preventDefault();
      dragEl = el; dragIdx = idx;
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      clone = el.cloneNode(true);
      clone.classList.add('q-match-clone');
      clone.style.width = `${rect.width}px`;
      document.body.appendChild(clone);
      moveClone(e.clientX, e.clientY);
      el.classList.add('dragging-src');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    function onMove(e) {
      if (!clone) return;
      moveClone(e.clientX, e.clientY);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = under && under.closest('.q-match-target');
      const valid = target && !target.classList.contains('matched') ? target : null;
      if (valid !== hoverTarget) {
        if (hoverTarget) hoverTarget.classList.remove('drop-hover');
        hoverTarget = valid;
        if (hoverTarget) hoverTarget.classList.add('drop-hover');
      }
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const target = hoverTarget;
      if (target) suppressClickUntil = Date.now() + 400;
      if (hoverTarget) hoverTarget.classList.remove('drop-hover');
      if (clone) { clone.remove(); clone = null; }
      dragEl.classList.remove('dragging-src');

      if (target && Number(target.dataset.idx) === dragIdx) {
        markPair(target, dragEl, dragIdx);
      } else if (target) {
        shakePair(dragEl, target);
      }
      dragEl = null; dragIdx = null; hoverTarget = null;
    }

    engine.registerReveal(() => {
      ended = true;
      clearSelection();
      items.forEach((it, idx) => {
        if (matched[idx]) return;
        const l = leftEls.find((e) => Number(e.dataset.idx) === idx);
        const r = rightEls.find((e) => Number(e.dataset.idx) === idx);
        if (l) { l.classList.add('matched'); l.disabled = true; }
        if (r) { r.classList.add('matched'); r.disabled = true; }
        engine.advance();
      });
    });
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
