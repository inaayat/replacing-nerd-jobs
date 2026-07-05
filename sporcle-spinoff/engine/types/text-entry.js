// Free-response / fill-in / "name all N" completionist. One input box; each
// correct typed answer fills its slot. No multiple choice shown.
// items: { accept:[...], display, clue? }
//   accept  = strings that count as correct (aliases ok)
//   display = what shows in the slot once solved
//   clue    = optional hint shown in the slot before it's solved
export default {
  render(root, quiz, engine) {
    const items = quiz.items.slice();
    const solved = new Array(items.length).fill(false);

    root.innerHTML = `
      <input class="q-input" id="te-input" placeholder="${quiz.prompt || 'Type an answer…'}" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <div class="q-slots" id="te-slots"></div>`;
    const input = root.querySelector('#te-input');
    const slotsEl = root.querySelector('#te-slots');

    const slots = items.map((it) => {
      const d = document.createElement('div');
      d.className = 'q-slot';
      d.textContent = it.clue || ' ';
      slotsEl.appendChild(d);
      return d;
    });

    function fill(idx, missed) {
      solved[idx] = true;
      slots[idx].textContent = items[idx].display;
      slots[idx].classList.add(missed ? 'missed' : 'filled');
    }

    function tryAnswer() {
      const val = input.value;
      if (!engine.normalize(val)) return;
      for (let i = 0; i < items.length; i++) {
        if (solved[i]) continue;
        if (engine.matchAccept(val, items[i].accept)) {
          fill(i, false);
          input.value = '';
          input.classList.remove('q-flash-ok'); void input.offsetWidth; input.classList.add('q-flash-ok');
          engine.correct();
          return;
        }
      }
      // no match: brief clear-on-Enter only, keep value so user can fix typos
    }

    input.addEventListener('input', tryAnswer);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAnswer(); });
    setTimeout(() => input.focus(), 50);

    engine.registerReveal(() => {
      input.disabled = true;
      items.forEach((_, i) => { if (!solved[i]) fill(i, true); });
    });
  },
};
