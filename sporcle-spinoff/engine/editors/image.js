// Editor for the image (Picture Round) player type.
// items: { img, accept:[...] }
export default {
  render(container, quiz, onChange) {
    const list = document.createElement('div');
    container.appendChild(list);

    function syncItems() {
      quiz.items = [...list.children].map((row) => ({
        img: row.querySelector('.f-img').value,
        accept: row.querySelector('.f-accept').value.split(',').map((s) => s.trim()).filter(Boolean),
      }));
      onChange();
    }

    function addRow(data) {
      const row = document.createElement('div'); row.className = 'b-item-row';
      const fields = document.createElement('div'); fields.className = 'b-item-fields';
      fields.innerHTML = `
        <div class="b-mini-row">
          <img class="f-thumb" src="${data ? data.img || '' : ''}" style="width:32px;height:22px;object-fit:cover;border-radius:4px;border:1px solid var(--lgray);${data && data.img ? '' : 'display:none;'}">
          <input class="b-mini-input f-img" placeholder="Image URL" value="${data ? data.img || '' : ''}">
        </div>
        <div class="b-mini-row"><input class="b-mini-input f-accept" placeholder="Accepted answers, comma-separated" value="${data ? (data.accept || []).join(', ') : ''}"></div>`;
      row.appendChild(fields);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'b-remove-btn'; removeBtn.type = 'button'; removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => { row.remove(); syncItems(); });
      row.appendChild(removeBtn);
      const imgInput = fields.querySelector('.f-img');
      const thumb = fields.querySelector('.f-thumb');
      imgInput.addEventListener('input', () => {
        thumb.src = imgInput.value;
        thumb.style.display = imgInput.value ? '' : 'none';
        syncItems();
      });
      fields.querySelector('.f-accept').addEventListener('input', syncItems);
      list.appendChild(row);
    }

    (quiz.items.length ? quiz.items : [null, null]).forEach(addRow);
    syncItems();

    const addBtn = document.createElement('button');
    addBtn.className = 'b-add-row-btn'; addBtn.type = 'button'; addBtn.textContent = '+ Add image';
    addBtn.addEventListener('click', () => { addRow(); syncItems(); });
    container.appendChild(addBtn);
  },
};
