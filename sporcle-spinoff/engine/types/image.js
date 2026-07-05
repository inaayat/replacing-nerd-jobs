// Image / visual identification. Shows an image; user types the answer or
// picks from choices. One item at a time.
// items: { img, accept:[...] }            (typed)
//    or: { img, options:[...], answer }   (multiple choice; answer = idx or string)
export default {
  render(root, quiz, engine) {
    const items = quiz.shuffle ? shuffle(quiz.items.slice()) : quiz.items.slice();
    let i = 0;
    const stage = document.createElement('div');
    root.appendChild(stage);

    function show() {
      const it = items[i];
      stage.innerHTML = `<div class="q-image-wrap"><img src="${it.img}" alt="mystery image"></div>`;
      if (it.options) renderChoices(it); else renderInput(it);
    }

    function next(wasCorrect) {
      if (wasCorrect) engine.correct(); else engine.advance();
      i++;
      if (i < items.length) setTimeout(show, wasCorrect ? 500 : 900);
    }

    function renderChoices(it) {
      const ans = typeof it.answer === 'number' ? it.answer : it.options.findIndex(o => o === it.answer);
      const opts = document.createElement('div'); opts.className = 'q-options';
      it.options.forEach((opt, idx) => {
        const b = document.createElement('button'); b.className = 'q-opt'; b.textContent = opt;
        b.addEventListener('click', () => {
          [...opts.children].forEach((el, k) => { el.disabled = true; if (k === ans) el.classList.add('correct'); else if (k === idx) el.classList.add('wrong'); });
          next(idx === ans);
        });
        opts.appendChild(b);
      });
      stage.appendChild(opts);
    }

    function renderInput(it) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<input class="q-input" placeholder="${quiz.prompt || 'Your answer…'}" autocomplete="off" spellcheck="false"><div style="text-align:center;margin-top:10px"><button class="q-btn" data-skip>Skip →</button></div>`;
      const input = wrap.querySelector('input');
      const submit = () => {
        if (engine.matchAccept(input.value, it.accept)) {
          input.disabled = true; input.classList.add('q-flash-ok'); next(true);
        }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      input.addEventListener('input', submit);
      wrap.querySelector('[data-skip]').addEventListener('click', () => next(false));
      stage.appendChild(wrap);
      setTimeout(() => input.focus(), 50);
    }

    engine.registerReveal(() => { while (i < items.length) { engine.advance(); i++; } });
    show();
  },
};

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
