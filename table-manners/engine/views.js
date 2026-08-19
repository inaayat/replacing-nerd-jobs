import { cardsFromSheet } from './sheet.js';

export function renderCards(root, sheet, { selected, onSelect, onCommit, onAddRow }) {
  root.replaceChildren();
  root.className = 'tm-cards-wrap';

  const cards = cardsFromSheet(sheet);
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'tm-cards-empty';
    empty.innerHTML = '<p>No rows yet.</p>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-btn tm-btn-ghost';
    btn.textContent = 'Add a row';
    btn.addEventListener('click', () => onAddRow?.());
    empty.appendChild(btn);
    root.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'tm-cards';

  cards.forEach((card, index) => {
    const article = document.createElement('article');
    article.className = 'tm-card';
    article.dataset.rowId = card.id;
    if (selected?.rowId === card.id) article.classList.add('is-selected');
    article.addEventListener('mousedown', () => onSelect?.({ rowId: card.id, colId: selected?.colId || card.fields[0]?.colId }));

    const head = document.createElement('header');
    head.className = 'tm-card-head';
    const num = document.createElement('span');
    num.className = 'tm-card-num';
    num.textContent = String(index + 1);
    const title = document.createElement('h3');
    title.className = 'tm-card-title';
    title.textContent = card.fields[0]?.value || 'Untitled row';
    head.append(num, title);
    article.appendChild(head);

    const fields = document.createElement('div');
    fields.className = 'tm-card-fields';
    card.fields.forEach((field) => {
      const label = document.createElement('label');
      label.className = 'tm-field';
      const name = document.createElement('span');
      name.className = 'tm-field-name';
      name.textContent = field.name;
      const input = document.createElement('input');
      input.className = 'tm-field-input';
      input.value = field.value;
      input.addEventListener('focus', () => onSelect?.({ rowId: card.id, colId: field.colId }));
      input.addEventListener('change', () => onCommit?.(card.id, field.colId, input.value));
      label.append(name, input);
      fields.appendChild(label);
    });
    article.appendChild(fields);
    list.appendChild(article);
  });

  root.appendChild(list);

  if (selected?.rowId) {
    const el = root.querySelector(`[data-row-id="${CSS.escape(selected.rowId)}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
}
