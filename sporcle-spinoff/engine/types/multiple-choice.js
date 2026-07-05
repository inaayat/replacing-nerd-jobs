// Multiple-choice / true-false. All questions render at once; answer them
// in any order. items: { q, options:[...], answer, media? } where answer is
// the index or the exact option string. media (optional) is an image URL
// shown above the question.
export default {
  render(root, quiz, engine) {
    const items = quiz.shuffle ? shuffle(quiz.items.slice()) : quiz.items.slice();
    const answered = new Array(items.length).fill(false);

    function answerIndex(it) {
      if (typeof it.answer === 'number') return it.answer;
      return it.options.findIndex((o) => o === it.answer);
    }

    function lockIn(opts, ans, picked) {
      [...opts.children].forEach((b, k) => {
        b.disabled = true;
        if (k === ans) b.classList.add('correct');
        else if (k === picked) b.classList.add('wrong');
      });
    }

    items.forEach((it, idx) => {
      const ans = answerIndex(it);
      const block = document.createElement('div');
      block.className = 'q-mc-block';
      if (it.media) {
        const w = document.createElement('div'); w.className = 'q-image-wrap';
        w.innerHTML = `<img src="${it.media}" alt="">`;
        block.appendChild(w);
      }
      const q = document.createElement('div'); q.className = 'q-question'; q.textContent = `${idx + 1}. ${it.q}`;
      block.appendChild(q);
      const opts = document.createElement('div'); opts.className = 'q-options';
      it.options.forEach((opt, oi) => {
        const b = document.createElement('button');
        b.className = 'q-opt'; b.textContent = opt;
        b.addEventListener('click', () => {
          if (answered[idx]) return;
          answered[idx] = true;
          lockIn(opts, ans, oi);
          if (oi === ans) engine.correct(); else engine.advance();
        });
        opts.appendChild(b);
      });
      block.appendChild(opts);
      root.appendChild(block);
    });

    engine.registerReveal(() => {
      items.forEach((it, idx) => {
        if (answered[idx]) return;
        answered[idx] = true;
        const opts = root.children[idx].querySelector('.q-options');
        lockIn(opts, answerIndex(it), -1);
        engine.advance();
      });
    });
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
