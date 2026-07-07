// Editor for the ranking player type. Rows are listed top-to-bottom in the
// correct order — drag the handle to reorder, same pointer-based drag as the
// live player renderer. items: [{ label, value? }, ...]
// value is any string (year, "$4.2B", "#1", "8.3M"…), hidden while playing and
// revealed in order at the end. quiz.valueLabel optionally names what it is.
export default {
  render(container, quiz, onChange) {
    const hint = document.createElement('div');
    hint.className = 'b-step-hint';
    hint.style.cssText = 'font-size:11px;color:var(--gray);font-weight:600;margin:0 0 8px;';
    container.appendChild(hint);
    function updateHint() {
      hint.textContent = quiz.sortBy === 'value-desc' || quiz.sortBy === 'value-asc'
        ? 'Rows are ranked automatically by their value — the order you list them in doesn\'t matter. The value is hidden during play and revealed at the end.'
        : 'List these top-to-bottom in the correct order — drag the handle to reorder. The value is hidden during play and revealed at the end.';
    }

    const optRow = document.createElement('div');
    optRow.className = 'b-field-row'; optRow.style.maxWidth = '540px';
    optRow.innerHTML = `
      <div class="b-field"><label>What the value is (optional)</label>
        <input class="b-mini-input" id="f-value-label" placeholder="e.g. Year, Box office, Population"></div>
      <div class="b-field"><label>Correct order</label>
        <select class="b-mini-input" id="f-sortby">
          <option value="author">Author's order (rows as listed)</option>
          <option value="value-desc">Highest value first</option>
          <option value="value-asc">Lowest value first</option>
        </select></div>`;
    container.appendChild(optRow);

    const valueLabelInput = optRow.querySelector('#f-value-label');
    valueLabelInput.value = quiz.valueLabel || '';
    valueLabelInput.addEventListener('input', () => {
      quiz.valueLabel = valueLabelInput.value.trim() || undefined;
      onChange();
    });

    const sortByInput = optRow.querySelector('#f-sortby');
    sortByInput.value = quiz.sortBy || 'author';
    sortByInput.addEventListener('change', () => {
      quiz.sortBy = sortByInput.value === 'author' ? undefined : sortByInput.value;
      updateHint();
      onChange();
    });
    updateHint();

    const list = document.createElement('div');
    container.appendChild(list);

    const valOf = (it) => (it.value != null ? it.value : (it.date != null ? it.date : '')) || '';
    let items = (quiz.items.length ? quiz.items : [{ label: '' }, { label: '' }])
      .map((it) => ({ label: it.label || '', value: valOf(it) }));

    function syncItems() {
      quiz.items = items.map((it) => (it.value ? { label: it.label, value: it.value } : { label: it.label }));
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
            <input class="b-mini-input f-label" value="${it.label}" placeholder="Item (e.g. Moon landing)" style="flex:1;">
            <input class="b-mini-input f-value" value="${it.value}" placeholder="Value (e.g. 1969, $4.2B, #1)" style="flex:0 0 140px;">
            <div class="q-rank-handle" title="Drag to reorder">⠿⠿</div>
          </div>`;
        const labelInput = row.querySelector('.f-label');
        const valueInput = row.querySelector('.f-value');
        labelInput.addEventListener('input', () => { items[i].label = labelInput.value; syncItems(); });
        valueInput.addEventListener('input', () => { items[i].value = valueInput.value; syncItems(); });
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
    addBtn.addEventListener('click', () => { items.push({ label: '', value: '' }); renderRows(); syncItems(); });
    container.appendChild(addBtn);
  },
};
