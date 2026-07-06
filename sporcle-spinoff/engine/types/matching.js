// Matching. Drag a right-column tile onto its matching left-column prompt.
// A correct drop locks the pair in green; a wrong drop shakes and the tile
// returns. items: [{ left, right }, ...] — left/right within one object are
// the correct pair. Each column is shuffled independently of the pairing,
// which is tracked by the original array index.
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
      const el = document.createElement('div');
      el.className = 'q-match-item q-match-target';
      el.textContent = label;
      el.dataset.idx = idx;
      colL.appendChild(el);
      leftEls.push(el);
    });
    const rightEls = [];
    shuffle(items.map((it, i) => ({ label: it.right, idx: i }))).forEach(({ label, idx }) => {
      const el = document.createElement('div');
      el.className = 'q-match-item q-match-drag';
      el.textContent = label;
      el.dataset.idx = idx;
      el.addEventListener('pointerdown', (e) => startDrag(e, el, idx));
      colR.appendChild(el);
      rightEls.push(el);
    });

    let dragEl = null, clone = null, dragIdx = null, hoverTarget = null, offsetX = 0, offsetY = 0;

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
      if (hoverTarget) hoverTarget.classList.remove('drop-hover');
      if (clone) { clone.remove(); clone = null; }
      dragEl.classList.remove('dragging-src');

      if (target && Number(target.dataset.idx) === dragIdx) {
        matched[dragIdx] = true;
        target.classList.add('matched');
        dragEl.classList.add('matched');
        engine.correct();
      } else if (target) {
        const src = dragEl;
        src.classList.add('badmatch'); target.classList.add('badmatch');
        setTimeout(() => { src.classList.remove('badmatch'); target.classList.remove('badmatch'); }, 350);
      }
      dragEl = null; dragIdx = null; hoverTarget = null;
    }

    engine.registerReveal(() => {
      ended = true;
      items.forEach((it, idx) => {
        if (matched[idx]) return;
        const l = leftEls.find((e) => Number(e.dataset.idx) === idx);
        const r = rightEls.find((e) => Number(e.dataset.idx) === idx);
        if (l) l.classList.add('matched');
        if (r) r.classList.add('matched');
        engine.advance();
      });
    });
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
