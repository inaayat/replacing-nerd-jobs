// Multiple-choice / true-false. One question at a time; pick an option.
// items: { q, options:[...], answer, media? }  where answer is the index or
// the exact option string. media (optional) is an image URL shown above.
export default {
  render(root, quiz, engine) {
    const items = quiz.shuffle ? shuffle(quiz.items.slice()) : quiz.items.slice();
    let i = 0;

    const stage = document.createElement('div');
    root.appendChild(stage);

    function answerIndex(it) {
      if (typeof it.answer === 'number') return it.answer;
      return it.options.findIndex(o => o === it.answer);
    }

    function show() {
      const it = items[i];
      const ans = answerIndex(it);
      stage.innerHTML = '';
      if (it.media) {
        const w = document.createElement('div'); w.className = 'q-image-wrap';
        w.innerHTML = `<img src="${it.media}" alt="">`;
        stage.appendChild(w);
      }
      const q = document.createElement('div'); q.className = 'q-question'; q.textContent = it.q;
      stage.appendChild(q);
      const opts = document.createElement('div'); opts.className = 'q-options';
      it.options.forEach((opt, idx) => {
        const b = document.createElement('button');
        b.className = 'q-opt'; b.textContent = opt;
        b.addEventListener('click', () => pick(idx, ans, opts));
        opts.appendChild(b);
      });
      stage.appendChild(opts);
    }

    function pick(idx, ans, opts) {
      [...opts.children].forEach((b, k) => {
        b.disabled = true;
        if (k === ans) b.classList.add('correct');
        else if (k === idx) b.classList.add('wrong');
      });
      if (idx === ans) engine.correct(); else engine.advance();
      i++;
      if (i < items.length) setTimeout(show, 750);
      // when i reaches length, engine auto-finishes via correct/advance
    }

    engine.registerReveal(() => {
      // reveal remaining answers instantly by fast-forwarding progress
      while (i < items.length) { engine.advance(); i++; }
    });

    show();
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
