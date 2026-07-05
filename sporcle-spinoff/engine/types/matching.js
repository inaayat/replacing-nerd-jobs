// Matching. Click a left item, then a right item (either order); a correct
// pair locks in green, a wrong pair shakes and clears the selection.
// items: [{ left, right }, ...] — left/right within one object are the
// correct pair. Column display order is shuffled independently of the
// original pairing, which is tracked by array index.
export default {
  render(root, quiz, engine) {
    const items = quiz.items;
    const matched = new Array(items.length).fill(false);
    let selLeft = null; // { idx, el }
    let selRight = null;

    const wrap = document.createElement('div'); wrap.className = 'q-match';
    const colL = document.createElement('div'); colL.className = 'q-col';
    const colR = document.createElement('div'); colR.className = 'q-col';
    wrap.appendChild(colL); wrap.appendChild(colR);
    root.appendChild(wrap);

    function makeItem(label, idx, col, side) {
      const b = document.createElement('button');
      b.className = 'q-match-item';
      b.textContent = label;
      b.addEventListener('click', () => pick(idx, b, side));
      col.appendChild(b);
      return b;
    }

    shuffle(items.map((it, i) => ({ label: it.left, idx: i }))).forEach(({ label, idx }) => makeItem(label, idx, colL, 'left'));
    shuffle(items.map((it, i) => ({ label: it.right, idx: i }))).forEach(({ label, idx }) => makeItem(label, idx, colR, 'right'));

    function pick(idx, el, side) {
      if (matched[idx] && el.classList.contains('matched')) return;
      const cur = side === 'left' ? selLeft : selRight;
      if (cur) cur.el.classList.remove('selected');
      if (side === 'left') selLeft = { idx, el }; else selRight = { idx, el };
      el.classList.add('selected');
      if (selLeft && selRight) attempt();
    }

    function attempt() {
      const { idx: li, el: le } = selLeft;
      const { idx: ri, el: re } = selRight;
      if (li === ri) {
        matched[li] = true;
        [le, re].forEach((el) => { el.classList.remove('selected'); el.classList.add('matched'); });
        selLeft = null; selRight = null;
        engine.correct();
      } else {
        [le, re].forEach((el) => el.classList.add('badmatch'));
        setTimeout(() => {
          [le, re].forEach((el) => el.classList.remove('badmatch', 'selected'));
        }, 350);
        selLeft = null; selRight = null;
      }
    }

    engine.registerReveal(() => {
      [...colL.children, ...colR.children].forEach((el) => { el.disabled = true; });
      const revealEl = (col, label) => {
        const el = [...col.children].find((c) => c.textContent === label && !c.classList.contains('matched'));
        if (el) el.classList.add('matched');
      };
      items.forEach((it, idx) => {
        if (matched[idx]) return;
        revealEl(colL, it.left);
        revealEl(colR, it.right);
        engine.advance();
      });
    });
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
