/**
 * Compact Experiences side panel index. Browser-safe ESM.
 */

import {
  createExperience,
  renameExperience,
} from './engine.js';
import {
  compactExperienceIndex,
  rememberSessionEmptyExperience,
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
    onRender,
    onSave,
    setNote,
    setStore,
    displayExperienceLine,
    onPanelQueryChange,
    onSelectExperience,
    onDragOverExperience,
    onDropOnExperience,
  } = deps;

  const rows = compactExperienceIndex(store, {
    query: panelQuery,
    posting,
    includeEmpty: true,
  });

  const head = el('div', { class: 'bb-exp-panel-head bb-action-row' }, [
    el('h2', { class: 'bb-exp-panel-title' }, 'Experiences'),
    el('div', { class: 'bb-exp-panel-head-actions' }, [
      btn('+ New', {
        type: 'button',
        class: 'btn ghost compact-action',
        onClick: () => {
          const title = window.prompt('Experience title');
          if (!title?.trim()) return;
          const jobs = store.jobs || [];
          let jobId = jobs[0]?.id || '';
          if (jobs.length > 1) {
            const pick = window.prompt(
              `Job id for this experience (${jobs.map((j) => `${j.company || j.title}:${j.id}`).join(', ')})`,
              jobId,
            );
            if (pick?.trim()) jobId = pick.trim();
          }
          if (!jobId) {
            setNote('Add a job on Resume basics first.');
            return;
          }
          const created = createExperience(store, { jobId, title: title.trim() });
          rememberSessionEmptyExperience(created.changedExperienceIds[0]);
          setStore(created.store);
          onSave();
          setNote('Empty experience — assign a bullet before you leave this session.');
          onRender();
        },
      }),
    ]),
  ]);

  const search = el('input', {
    type: 'search',
    class: 'search bb-exp-panel-search',
    placeholder: 'Search experiences…',
    value: panelQuery,
    'aria-label': 'Search experiences',
    'data-focus-key': 'exp-panel-search',
    onInput: (event) => onPanelQueryChange(event.target.value),
  });

  const scroll = el('div', { class: 'bb-exp-panel-scroll' }, rows.map((row) => {
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

  if (!rows.length) {
    scroll.append(el('p', { class: 'empty tiny' }, panelQuery
      ? 'No experiences match that search.'
      : 'No experiences yet. Use + New or assign from a bullet.'));
  }

  return el('aside', { class: 'bb-exp-side-panel', 'aria-label': 'Experiences' }, [
    head,
    search,
    scroll,
  ]);
}
