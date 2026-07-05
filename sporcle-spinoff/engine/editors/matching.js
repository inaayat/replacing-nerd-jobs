// Editor for the matching player type.
// items: [{ left, right }, ...]
export default {
  render(container, quiz, onChange) {
    const list = document.createElement('div');
    container.appendChild(list);

    function syncItems() {
      quiz.items = [...list.children].map((row) => ({
        left: row.querySelector('.f-left').value,
        right: row.querySelector('.f-right').value,
      }));
      onChange();
    }

    function addRow(data) {
      const row = document.createElement('div'); row.className = 'b-item-row';
      const fields = document.createElement('div'); fields.className = 'b-item-fields';
      fields.style.gridTemplateColumns = '1fr 1fr'; fields.style.display = 'grid';
      fields.innerHTML = `
        <input class="b-mini-input f-left" placeholder="Left item" value="${data ? data.left || '' : ''}">
        <input class="b-mini-input f-right" placeholder="Right match" value="${data ? data.right || '' : ''}">`;
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
    addBtn.className = 'b-add-row-btn'; addBtn.type = 'button'; addBtn.textContent = '+ Add pair';
    addBtn.addEventListener('click', () => { addRow(); syncItems(); });
    container.appendChild(addBtn);
  },
};
