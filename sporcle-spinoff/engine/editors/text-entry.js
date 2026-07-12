// Editor for the text-entry player type. Supports both layouts it renders:
// fill-in-the-blank (one shared input, optionally grouped into labeled
// sub-boxes) and table (dedicated input per row). Row shape matches the
// player's item shape directly: { accept, clue, group? }. The solved/
// revealed display is always the first accepted answer — there's no
// separate "display text" to author.
export default {
  render(container, quiz, onChange) {
    let layout = quiz.layout === 'table' ? 'table' : 'fill-in';

    const layoutRow = document.createElement('div');
    layoutRow.className = 'b-radio-choice';
    layoutRow.innerHTML = `
      <label><input type="radio" name="te-layout" value="fill-in" ${layout === 'fill-in' ? 'checked' : ''}> Fill-in-the-blank (one shared box)</label>
      <label><input type="radio" name="te-layout" value="table" ${layout === 'table' ? 'checked' : ''}> Table (a box per row, clue always visible)</label>`;
    container.appendChild(layoutRow);
    layoutRow.addEventListener('change', (e) => {
      layout = e.target.value === 'table' ? 'table' : 'fill-in';
      quiz.layout = layout === 'table' ? 'table' : undefined;
      quiz.columns = layout === 'table' ? [{ key: 'clue', label: 'Clue' }] : undefined;
      list.querySelectorAll('.f-group-row').forEach((r) => r.classList.toggle('hidden', layout !== 'fill-in'));
      syncItems();
    });

    const list = document.createElement('div');
    container.appendChild(list);

    function syncItems() {
      quiz.items = [...list.children].map((row) => {
        const item = {
          clue: row.querySelector('.f-clue').value,
          accept: row.querySelector('.f-accept').value.split(',').map((s) => s.trim()).filter(Boolean),
        };
        const group = row.querySelector('.f-group').value.trim();
        if (layout === 'fill-in' && group) item.group = group;
        return item;
      });
      onChange();
    }

    function addRow(data) {
      const row = document.createElement('div'); row.className = 'b-item-row';
      const fields = document.createElement('div'); fields.className = 'b-item-fields';
      fields.innerHTML = `
        <div class="b-mini-row f-group-row${layout === 'fill-in' ? '' : ' hidden'}"><input class="b-mini-input f-group" placeholder="Group (optional — buckets this into a labeled sub-box)" value="${data ? data.group || '' : ''}"></div>
        <div class="b-mini-row"><input class="b-mini-input f-clue" placeholder="Clue (shown before solved)" value="${data ? data.clue || '' : ''}"></div>
        <div class="b-mini-row"><input class="b-mini-input f-accept" placeholder="Accepted answers, comma-separated (first = shown when solved)" value="${data ? (data.accept || []).join(', ') : ''}"></div>`;
      row.appendChild(fields);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'b-remove-btn'; removeBtn.type = 'button'; removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => { row.remove(); syncItems(); });
      row.appendChild(removeBtn);
      fields.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', syncItems));
      list.appendChild(row);
    }

    (quiz.items.length ? quiz.items : [null, null]).forEach(addRow);
    syncItems();

    const addBtn = document.createElement('button');
    addBtn.className = 'b-add-row-btn'; addBtn.type = 'button'; addBtn.textContent = '+ Add row';
    addBtn.addEventListener('click', () => { addRow(); syncItems(); });
    container.appendChild(addBtn);
  },
};
