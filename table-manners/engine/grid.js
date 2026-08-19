import { cellValue, neighborCell, colLetter } from './sheet.js';

function cellKey(rowId, colId) {
  return `${rowId}:${colId}`;
}

export function renderGrid(root, sheet, { selected, editing, onSelect, onStartEdit, onCommit, onCancel, onRenameColumn }) {
  root.replaceChildren();
  root.className = 'tm-grid-wrap';

  const table = document.createElement('table');
  table.className = 'tm-grid';
  table.setAttribute('role', 'grid');

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'tm-grid-corner';
  corner.textContent = '';
  headRow.appendChild(corner);

  sheet.columns.forEach((col, i) => {
    const th = document.createElement('th');
    th.className = 'tm-grid-colhead';
    th.dataset.colId = col.id;
    if (selected?.colId === col.id) th.classList.add('is-sel-col');
    if (i === 0) th.classList.add('is-row-header');
    const letter = document.createElement('button');
    letter.type = 'button';
    letter.className = 'tm-grid-letter';
    letter.textContent = colLetter(i + 1);
    letter.setAttribute('aria-label', `Select column ${colLetter(i + 1)}`);
    letter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect?.({ rowId: selected?.rowId || sheet.rows[0]?.id, colId: col.id });
    });
    const name = document.createElement('input');
    name.className = 'tm-grid-colname';
    name.value = col.name;
    name.placeholder = i === 0 ? 'Row header' : 'Column name';
    name.setAttribute('aria-label', i === 0 ? 'Row header column name' : `Column ${colLetter(i + 1)} name`);
    name.addEventListener('change', () => onRenameColumn?.(col.id, name.value));
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        name.blur();
      }
    });
    const hint = document.createElement('span');
    hint.className = 'tm-grid-colhint';
    hint.textContent = i === 0 ? 'Row header' : 'Name';
    th.append(letter, name, hint);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  sheet.rows.forEach((row, r) => {
    const tr = document.createElement('tr');
    const rh = document.createElement('th');
    rh.className = 'tm-grid-rowhead';
    rh.textContent = String(r + 1);
    if (selected?.rowId === row.id) rh.classList.add('is-sel-row');
    tr.appendChild(rh);

    sheet.columns.forEach((col) => {
      const td = document.createElement('td');
      td.className = 'tm-grid-cell';
      if (col.id === sheet.columns[0]?.id) td.classList.add('is-row-header');
      td.dataset.rowId = row.id;
      td.dataset.colId = col.id;
      const isSel = selected && selected.rowId === row.id && selected.colId === col.id;
      if (isSel) td.classList.add('is-selected');
      if (isSel && editing) {
        const input = document.createElement('input');
        input.className = 'tm-grid-edit';
        input.value = cellValue(row, col.id);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit?.(row.id, col.id, input.value, { dRow: 1, dCol: 0 });
          } else if (e.key === 'Tab') {
            e.preventDefault();
            onCommit?.(row.id, col.id, input.value, { dRow: 0, dCol: e.shiftKey ? -1 : 1 });
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel?.();
          }
        });
        input.addEventListener('blur', () => onCommit?.(row.id, col.id, input.value));
        td.appendChild(input);
        queueMicrotask(() => {
          input.focus();
          input.select();
        });
      } else {
        td.textContent = cellValue(row, col.id);
        td.tabIndex = isSel ? 0 : -1;
        td.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (isSel && !editing) onStartEdit?.(row.id, col.id);
          else onSelect?.({ rowId: row.id, colId: col.id });
        });
        td.addEventListener('dblclick', (e) => {
          e.preventDefault();
          onStartEdit?.(row.id, col.id);
        });
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  root.appendChild(table);

  return {
    focusSelected() {
      const sel = root.querySelector('.tm-grid-cell.is-selected');
      if (sel && !sel.querySelector('input')) sel.focus();
    },
    cellKey,
  };
}

export function bindGridKeys(target, getState, { onSelect, onStartEdit, onClear }) {
  const handler = (e) => {
    const { selected, editing, face, sheet } = getState();
    if (face !== 'grid' || !selected || editing) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      onStartEdit?.(selected.rowId, selected.colId);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onClear?.(selected.rowId, selected.colId);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      onSelect?.(neighborCell(sheet, selected, 0, e.shiftKey ? -1 : 1));
      return;
    }
    const map = { ArrowUp: [ -1, 0 ], ArrowDown: [ 1, 0 ], ArrowLeft: [ 0, -1 ], ArrowRight: [ 0, 1 ] };
    if (map[e.key]) {
      e.preventDefault();
      const [dRow, dCol] = map[e.key];
      onSelect?.(neighborCell(sheet, selected, dRow, dCol));
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      onStartEdit?.(selected.rowId, selected.colId, e.key);
    }
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
