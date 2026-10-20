/**
 * Compact Experiences side panel index. Browser-safe ESM.
 */

import {
  compactExperienceIndex,
} from './experiences-index.js';

/**
 * @param {object} deps — DOM helpers and session callbacks from app.js
 */
export function buildExperiencesPanel(deps) {
  const {
    el,
    btn,
    store,
    posting,
    panelQuery = '',
    activeExperienceId = '',
    dragOverExperienceId = '',
    onPanelQueryChange,
    onSelectExperience,
    onDragOverExperience,
    onDropOnExperience,
    onStartPanelCreate,
    renderPanelCreateForm,
    panelCreateOpen = false,
    displayExperienceLine,
    renderPanelQueryResults = null,
  } = deps;

  const rows = compactExperienceIndex(store, {
    query: panelQuery,
    posting,
    includeEmpty: true,
  });

  const head = el('div', { class: 'bb-exp-panel-head bb-action-row' }, [
    el('h2', { class: 'bb-exp-panel-title' }, 'Experiences'),
    el('div', { class: 'bb-exp-panel-head-actions' }, [
      panelCreateOpen
        ? null
        : btn('+ New', {
          type: 'button',
          class: 'btn ghost compact-action',
          onClick: () => onStartPanelCreate(),
        }),
    ]),
  ]);

  const createSlot = panelCreateOpen && renderPanelCreateForm
    ? el('div', { class: 'bb-exp-panel-create-slot' }, [renderPanelCreateForm()])
    : null;

  const search = el('input', {
    type: 'search',
    class: 'search bb-exp-panel-search',
    placeholder: posting ? 'Search experiences and bullets…' : 'Search experiences…',
    value: panelQuery,
    'aria-label': 'Search experiences',
    'data-focus-key': 'exp-panel-search',
    onInput: (event) => onPanelQueryChange(event.target.value),
  });

  const queryTrimmed = String(panelQuery || '').trim();
  const scroll = el('div', { class: 'bb-exp-panel-scroll' }, queryTrimmed && renderPanelQueryResults
    ? [renderPanelQueryResults]
    : rows.map((row) => {
    const active = activeExperienceId === row.id;
    const dragOver = dragOverExperienceId === row.id;
    return el('button', {
      type: 'button',
      class: `bb-exp-index-row${active ? ' is-active' : ''}${dragOver ? ' is-drop-target' : ''}`,
      'data-experience-id': row.id,
      'data-job-id': row.jobId,
      onClick: () => onSelectExperience(row.id),
      onDragover: (event) => {
        event.preventDefault();
        onDragOverExperience(row.id);
      },
      onDragleave: () => onDragOverExperience(''),
      onDrop: (event) => {
        event.preventDefault();
        onDropOnExperience(row.id, event);
      },
    }, [
      el('div', { class: 'bb-exp-index-line1' }, [
        el('span', { class: 'bb-exp-index-title' }, row.title),
        el('span', { class: 'bb-exp-index-count' }, `${row.versionCount} bullet${row.versionCount === 1 ? '' : 's'}`),
      ]),
      row.postingFact
        ? el('p', { class: 'tiny bb-exp-index-fact' }, row.postingFact)
        : null,
      row.preview
        ? el('p', { class: 'bb-exp-index-preview' }, displayExperienceLine(row.preview))
        : el('p', { class: 'bb-exp-index-preview bb-exp-index-preview-empty' }, 'No bullets yet'),
      row.jobLabel && rows.filter((r) => r.title === row.title).length > 1
        ? el('p', { class: 'tiny bb-exp-index-role' }, row.jobLabel)
        : null,
    ]);
  }));

  if (!queryTrimmed && !rows.length) {
    scroll.append(el('p', { class: 'empty tiny' }, 'No experiences yet. Use + New or assign from a bullet.'));
  }

  return el('aside', { class: 'bb-exp-side-panel', 'aria-label': 'Experiences' }, [
    head,
    createSlot,
    search,
    scroll,
  ]);
}
