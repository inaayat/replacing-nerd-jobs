// Editor for the multiple-choice player type.
// items: { q, options:[4 strings], answer: index, media? }
export default {
  render(container, quiz, onChange) {
    const list = document.createElement('div');
    container.appendChild(list);

    function syncItems() {
      quiz.items = [...list.children].map((row) => {
        const options = [...row.querySelectorAll('.f-opt')].map((i) => i.value);
        const answer = [...row.querySelectorAll('.f-correct')].findIndex((r) => r.checked);
        const media = row.querySelector('.f-media').value.trim();
        const item = { q: row.querySelector('.f-q').value, options, answer: answer < 0 ? 0 : answer };
        if (media) item.media = media;
        return item;
      });
      onChange();
    }

    function addRow(data) {
      const row = document.createElement('div'); row.className = 'b-item-row';
      const rname = 'correct-' + Math.random().toString(36).slice(2);
      const fields = document.createElement('div'); fields.className = 'b-item-fields';
      fields.innerHTML = `
        <input class="b-mini-input f-q" placeholder="Question text" value="${data ? data.q || '' : ''}">
        <input class="b-mini-input f-media" placeholder="Image URL (optional)" value="${data ? data.media || '' : ''}">`;
      for (let i = 0; i < 4; i++) {
        const r = document.createElement('div'); r.className = 'b-mini-row';
        r.innerHTML = `<label class="b-correct-flag"><input type="radio" class="f-correct" name="${rname}" ${data && data.answer === i ? 'checked' : ''}> correct</label>
          <input class="b-mini-input f-opt" placeholder="Option ${i + 1}" value="${data ? (data.options || [])[i] || '' : ''}">`;
        fields.appendChild(r);
      }
      row.appendChild(fields);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'b-remove-btn'; removeBtn.type = 'button'; removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => { row.remove(); syncItems(); });
      row.appendChild(removeBtn);
      fields.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', syncItems));
      fields.querySelectorAll('input[type="radio"]').forEach((inp) => inp.addEventListener('change', syncItems));
      list.appendChild(row);
    }

    (quiz.items.length ? quiz.items : [null, null]).forEach(addRow);
    syncItems();

    const addBtn = document.createElement('button');
    addBtn.className = 'b-add-row-btn'; addBtn.type = 'button'; addBtn.textContent = '+ Add question';
    addBtn.addEventListener('click', () => { addRow(); syncItems(); });
    container.appendChild(addBtn);
  },
};
