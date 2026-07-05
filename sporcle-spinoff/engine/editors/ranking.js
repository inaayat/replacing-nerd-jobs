// Editor for the ranking player type. Rows are listed top-to-bottom in the
// correct order — drag the handle to reorder, same pointer-based drag as
// the live player renderer. items: [{ label }, ...]
export default {
  render(container, quiz, onChange) {
    const hint = document.createElement('div');
    hint.className = 'b-step-hint';
    hint.style.cssText = 'font-size:11px;color:var(--gray);font-weight:600;margin:0 0 8px;';
    hint.textContent = 'List these top-to-bottom in the correct order — drag the handle to reorder.';
    container.appendChild(hint);

    const list = document.createElement('div');
    container.appendChild(list);

    let items = (quiz.items.length ? quiz.items : [{ label: '' }, { label: '' }]).map((it) => ({ label: it.label || '' }));

    function syncItems() {
      quiz.items = items.map((it) => ({ label: it.label }));
      onChange();
    }

    let dragEl = null, dragIndex = null, startY = 0, rowH = 0;

    function startDrag(e, idx) {
      e.preventDefault();
      dragIndex = idx; startY = e.clientY;
      dragEl = list.children[idx];
      rowH = dragEl.getBoundingClientRect().height;
      dragEl.classList.add('dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
    function onMove(e) {
      if (!dragEl) return;
      const dy = e.clientY - startY;
      dragEl.style.transform = `translateY(${dy}px)`;
      if (Math.abs(dy) > rowH / 2) {
        const dir = dy > 0 ? 1 : -1;
        const ni = dragIndex + dir;
        if (ni >= 0 && ni < items.length) {
          const [m] = items.splice(dragIndex, 1);
          items.splice(ni, 0, m);
          dragIndex = ni; startY = e.clientY;
          renderRows();
          dragEl = list.children[dragIndex];
          dragEl.classList.add('dragging');
        }
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragEl = null;
      renderRows();
      syncItems();
    }

    function renderRows() {
      list.innerHTML = '';
      items.forEach((it, i) => {
        const row = document.createElement('div'); row.className = 'b-item-row';
        row.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;width:100%;">
            <div class="q-rank-num" style="flex-shrink:0;">${i + 1}</div>
            <input class="b-mini-input f-label" value="${it.label}" placeholder="Item text" style="flex:1;">
            <div class="q-rank-handle" title="Drag to reorder">⠿⠿</div>
          </div>`;
        const input = row.querySelector('.f-label');
        input.addEventListener('input', () => { items[i].label = input.value; syncItems(); });
        const removeBtn = document.createElement('button');
        removeBtn.className = 'b-remove-btn'; removeBtn.type = 'button'; removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => { items.splice(i, 1); renderRows(); syncItems(); });
        row.appendChild(removeBtn);
        row.querySelector('.q-rank-handle').addEventListener('pointerdown', (e) => startDrag(e, i));
        list.appendChild(row);
      });
    }

    renderRows();
    syncItems();

    const addBtn = document.createElement('button');
    addBtn.className = 'b-add-row-btn'; addBtn.type = 'button'; addBtn.textContent = '+ Add item';
    addBtn.addEventListener('click', () => { items.push({ label: '' }); renderRows(); syncItems(); });
    container.appendChild(addBtn);
  },
};
