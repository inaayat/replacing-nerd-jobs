import { groupRows, groupLabelText, rowFields } from './sheet.js';

function fieldRow(field, rowId, { onSelect, onCommit }) {
  const label = document.createElement('label');
  label.className = 'tm-field';
  const name = document.createElement('span');
  name.className = 'tm-field-name';
  name.textContent = field.name;
  const input = document.createElement('input');
  input.className = 'tm-field-input';
  input.value = field.value;
  input.inputMode = field.type === 'number' ? 'decimal' : 'text';
  input.placeholder = field.type === 'number' ? '0' : '—';
  input.addEventListener('focus', () => onSelect?.({ rowId, colId: field.colId }));
  input.addEventListener('change', () => onCommit?.(rowId, field.colId, input.value));
  label.append(name, input);
  return label;
}

function recordCard(row, sheet, index, opts) {
  const { selected, onSelect, onCommit, onDeleteRow } = opts;
  const article = document.createElement('article');
  article.className = 'tm-card';
  article.dataset.rowId = row.id;
  if (selected?.rowId === row.id) article.classList.add('is-selected');

  const head = document.createElement('header');
  head.className = 'tm-card-head';
  const num = document.createElement('span');
  num.className = 'tm-card-num';
  num.textContent = String(index);
  const title = document.createElement('h3');
  title.className = 'tm-card-title';
  const first = sheet.columns[0];
  title.textContent = (first && String(row[first.id] || '').trim()) || 'New record';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'tm-icon-btn';
  del.title = 'Delete this record';
  del.setAttribute('aria-label', 'Delete this record');
  del.textContent = '×';
  del.addEventListener('click', () => onDeleteRow?.(row.id));
  head.append(num, title, del);
  article.appendChild(head);

  const fields = document.createElement('div');
  fields.className = 'tm-card-fields';
  rowFields(row, sheet.columns).forEach((field) => {
    fields.appendChild(fieldRow(field, row.id, { onSelect, onCommit }));
  });
  article.appendChild(fields);
  return article;
}

export function renderForm(root, sheet, opts) {
  const { groupBy, onAddRecord } = opts;
  root.replaceChildren();
  root.className = 'tm-form-wrap';

  const buckets = groupRows(sheet, groupBy);
  let counter = 0;

  buckets.forEach((bucket) => {
    const section = document.createElement('section');
    section.className = 'tm-group';

    if (bucket.column) {
      const head = document.createElement('div');
      head.className = 'tm-group-head';
      const label = document.createElement('h2');
      label.className = 'tm-group-title';
      label.textContent = groupLabelText(bucket);
      const count = document.createElement('span');
      count.className = 'tm-group-count';
      count.textContent = bucket.rows.length === 1 ? '1 record' : `${bucket.rows.length} records`;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'tm-btn tm-btn-ghost tm-btn-sm';
      add.textContent = 'Add here';
      add.addEventListener('click', () => onAddRecord?.({ [bucket.column.id]: bucket.label }));
      head.append(label, count, add);
      section.appendChild(head);
    }

    const list = document.createElement('div');
    list.className = 'tm-cards';
    bucket.rows.forEach((row) => {
      counter += 1;
      list.appendChild(recordCard(row, sheet, counter, opts));
    });
    section.appendChild(list);
    root.appendChild(section);
  });

  const footer = document.createElement('div');
  footer.className = 'tm-form-footer';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'tm-btn tm-btn-add';
  add.textContent = '+ Add record';
  add.addEventListener('click', () => onAddRecord?.());
  footer.appendChild(add);
  root.appendChild(footer);

  if (opts.selected?.rowId) {
    const el = root.querySelector(`[data-row-id="${CSS.escape(opts.selected.rowId)}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
}
