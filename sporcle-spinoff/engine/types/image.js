// Picture round. Every image shows at once in a grid; type the answer in
// the plain box under each one — no clicking through one at a time.
// items: { img, accept:[...] }
export default {
  render(root, quiz, engine) {
    const items = quiz.items;
    const solved = new Array(items.length).fill(false);

    const grid = document.createElement('div');
    grid.className = 'q-image-grid';
    root.appendChild(grid);

    const cells = items.map((it, idx) => {
      const cell = document.createElement('div'); cell.className = 'q-image-cell';
      cell.innerHTML = `
        <div class="q-img-box"><img src="${it.img}" alt="" loading="lazy"></div>
        <input class="q-image-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${quiz.prompt || 'Your answer'}">`;
      grid.appendChild(cell);
      const input = cell.querySelector('input');
      input.addEventListener('input', () => {
        if (solved[idx]) return;
        if (engine.matchAccept(input.value, it.accept)) {
          solved[idx] = true;
          input.value = it.accept[0];
          input.disabled = true;
          cell.classList.add('correct');
          engine.correct();
        }
      });
      return cell;
    });

    engine.registerReveal(() => {
      items.forEach((it, idx) => {
        if (solved[idx]) return;
        solved[idx] = true;
        const input = cells[idx].querySelector('input');
        input.value = it.accept[0];
        input.disabled = true;
        cells[idx].classList.add('missed');
        engine.advance();
      });
    });
  },
};
