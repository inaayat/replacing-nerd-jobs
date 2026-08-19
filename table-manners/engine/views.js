import { groupsFromSheet } from './sheet.js';

function fieldInput(field, rowId, { onSelect, onCommit }) {
  const label = document.createElement('label');
  label.className = 'tm-field';
  const name = document.createElement('span');
  name.className = 'tm-field-name';
  name.textContent = field.name;
  const input = document.createElement('input');
  input.className = 'tm-field-input';
  input.value = field.value;
  input.addEventListener('focus', () => onSelect?.({ rowId, colId: field.colId }));
  input.addEventListener('change', () => onCommit?.(rowId, field.colId, input.value));
  label.append(name, input);
  return label;
}

export function renderCards(root, sheet, { selected, onSelect, onCommit, onAddRow, onRenameGroup }) {
  root.replaceChildren();
  root.className = 'tm-cards-wrap';

  const groups = groupsFromSheet(sheet);
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'tm-cards-empty';
    const p = document.createElement('p');
    p.textContent = 'No rows yet.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-btn tm-btn-ghost';
    btn.textContent = 'Add a row';
    btn.addEventListener('click', () => onAddRow?.());
    empty.append(p, btn);
    root.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'tm-cards';

  groups.forEach((group) => {
    const related = group.rows.length > 1;
    const article = document.createElement('article');
    article.className = related ? 'tm-card tm-card-map' : 'tm-card';
    article.dataset.groupId = group.id;
    if (group.rows.some((row) => row.id === selected?.rowId)) article.classList.add('is-selected');
    article.addEventListener('mousedown', (e) => {
      if (e.target.closest('input,button,label')) return;
      onSelect?.({
        rowId: selected?.rowId && group.rows.some((row) => row.id === selected.rowId)
          ? selected.rowId
          : group.rows[0].id,
        colId: selected?.colId || group.header?.id,
      });
    });

    const head = document.createElement('header');
    head.className = 'tm-card-head';
    const title = document.createElement('input');
    title.className = 'tm-card-title-input';
    title.value = group.label;
    title.placeholder = group.header?.name || 'Row header';
    title.setAttribute('aria-label', 'Row header');
    title.addEventListener('focus', () => onSelect?.({ rowId: group.rows[0].id, colId: group.header?.id }));
    title.addEventListener('change', () => {
      if (onRenameGroup) onRenameGroup(group.rows.map((row) => row.id), title.value);
      else onCommit?.(group.rows[0].id, group.header?.id, title.value);
    });
    const meta = document.createElement('span');
    meta.className = 'tm-card-num';
    meta.textContent = related ? `${group.rows.length} related` : '1 row';
    head.append(title, meta);
    article.appendChild(head);

    if (related) {
      const note = document.createElement('p');
      note.className = 'tm-map-note';
      note.textContent = 'Same row header — one relationship.';
      article.appendChild(note);
    }

    const body = document.createElement('div');
    body.className = related ? 'tm-map-rels' : 'tm-card-fields';

    group.rows.forEach((row, index) => {
      const fields = group.rest.map((col) => ({
        colId: col.id,
        name: col.name,
        type: col.type,
        value: row[col.id] == null ? '' : String(row[col.id]),
      }));
      const block = document.createElement('div');
      block.className = related ? 'tm-map-rel' : 'tm-card-fields';
      block.dataset.rowId = row.id;
      if (related) {
        const tag = document.createElement('span');
        tag.className = 'tm-map-rel-tag';
        tag.textContent = `Related ${index + 1}`;
        block.appendChild(tag);
      }
      if (!fields.length && related) {
        const empty = document.createElement('p');
        empty.className = 'tm-map-note';
        empty.textContent = 'Add a column for related facts.';
        block.appendChild(empty);
      }
      fields.forEach((field) => {
        block.appendChild(fieldInput(field, row.id, { onSelect, onCommit }));
      });
      body.appendChild(block);
    });

    article.appendChild(body);
    list.appendChild(article);
  });

  root.appendChild(list);

  if (selected?.rowId) {
    const el = root.querySelector(`[data-row-id="${CSS.escape(selected.rowId)}"]`)
      || root.querySelector(`[data-group-id="${CSS.escape(selected.rowId)}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
}
