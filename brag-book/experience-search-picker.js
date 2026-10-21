/**
 * Shared experience search list (membership + bulk pickers). Browser-safe ESM.
 */

import { compactExperienceIndex } from './experiences-index.js';
import { buildExperienceCreateForm } from './experiences-forms.js';

export function formatCreateExperienceLabel(query) {
  const trimmed = String(query || '').trim();
  if (trimmed) return `+ Create experience "${trimmed}"`;
  return '+ Create experience';
}

function experienceRowsForJob(store, jobId, query) {
  return compactExperienceIndex(store, { query, includeEmpty: true })
    .filter((row) => row.jobId === jobId);
}

/**
 * Search head + listbox (+ optional remove footer). Caller supplies overlay shell.
 */
export function buildExperienceSearchPickerBody(deps) {
  const {
    el,
    btn,
    store,
    jobId = '',
    query = '',
    onQueryChange,
    searchFocusKey = 'xp-search',
    activeIndex = -1,
    onActiveIndexChange,
    currentExperienceId = '',
    onSelectExperience,
    onCreateFromQuery,
    onRemoveFromExperience,
    showRemove = false,
    /** When job is unknown, inline form instead of instant create */
    renderCreateForm = null,
    createFormOpen = false,
    onOpenCreateForm,
    choiceClass = 'bb-exp-picker-choice',
    listClass = 'bb-exp-picker-list',
  } = deps;

  const choices = jobId ? experienceRowsForJob(store, jobId, query) : [];
  const optionCount = choices.length + (jobId || createFormOpen ? 1 : 0);
  const createRowIndex = choices.length;

  const paintActive = (listEl, index) => {
    if (!listEl) return;
    const buttons = listEl.querySelectorAll('[data-exp-picker-option]');
    buttons.forEach((node, i) => {
      const on = i === index;
      node.classList.toggle('is-active', on);
      node.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) node.scrollIntoView({ block: 'nearest' });
    });
  };

  const commitActive = () => {
    if (activeIndex < 0) return;
    if (activeIndex < choices.length) {
      onSelectExperience(choices[activeIndex].id);
      return;
    }
    if (activeIndex === createRowIndex) {
      const title = String(query || '').trim();
      if (!jobId) {
        if (typeof onOpenCreateForm === 'function') onOpenCreateForm();
        return;
      }
      if (!title) return;
      onCreateFromQuery({ title, jobId });
    }
  };

  const searchInput = el('input', {
    type: 'search',
    class: 'search bb-exp-picker-search',
    placeholder: jobId ? 'Search experiences for this job…' : 'Search experiences…',
    'aria-label': 'Search experiences',
    'aria-autocomplete': 'list',
    'aria-expanded': 'true',
    value: query,
    'data-focus-key': searchFocusKey,
    'data-bb-exp-membership-search': '1',
  });

  searchInput.addEventListener('input', (event) => {
    onQueryChange(event.target.value);
    if (typeof onActiveIndexChange === 'function') onActiveIndexChange(-1);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return;
    if (!optionCount) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = activeIndex < 0 ? 0 : Math.min(activeIndex + 1, optionCount - 1);
      if (typeof onActiveIndexChange === 'function') onActiveIndexChange(next);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = activeIndex <= 0 ? optionCount - 1 : activeIndex - 1;
      if (typeof onActiveIndexChange === 'function') onActiveIndexChange(next);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0) commitActive();
      else if (jobId && String(query || '').trim()) {
        onCreateFromQuery({ title: String(query).trim(), jobId });
      }
    }
  });

  const head = el('div', { class: 'bb-float-overlay-head' }, [searchInput]);

  if (createFormOpen && renderCreateForm) {
    return {
      head,
      body: el('div', { class: 'bb-float-overlay-body' }, [renderCreateForm()]),
      foot: null,
      afterMount: () => {},
    };
  }

  const listNodes = choices.map((row, index) => {
    const selected = currentExperienceId === row.id;
    return btn(`${selected ? '✓ ' : ''}${row.title} · ${row.versionCount} bullet${row.versionCount === 1 ? '' : 's'}`, {
      type: 'button',
      class: `${choiceClass}${selected ? ' is-on' : ''}${index === activeIndex ? ' is-active' : ''}`,
      role: 'option',
      'data-exp-picker-option': '1',
      'aria-selected': index === activeIndex ? 'true' : 'false',
      onMouseDown: (event) => event.preventDefault(),
      onClick: () => onSelectExperience(row.id),
    });
  });

  if (jobId || typeof onOpenCreateForm === 'function') {
    listNodes.push(btn(formatCreateExperienceLabel(query), {
      type: 'button',
      class: `${choiceClass} bb-exp-picker-create-row${createRowIndex === activeIndex ? ' is-active' : ''}`,
      role: 'option',
      'data-exp-picker-option': '1',
      'aria-selected': createRowIndex === activeIndex ? 'true' : 'false',
      onMouseDown: (event) => event.preventDefault(),
      onClick: () => {
        const title = String(query || '').trim();
        if (!jobId) {
          if (typeof onOpenCreateForm === 'function') onOpenCreateForm();
          return;
        }
        if (!title) return;
        onCreateFromQuery({ title, jobId });
      },
    }));
  }

  const listBody = el('div', {
    class: `bb-float-overlay-body ${listClass}`,
    role: 'listbox',
    'aria-label': 'Experiences',
  }, listNodes.length ? listNodes : [
    el('p', { class: 'tiny bb-exp-picker-empty' }, jobId ? 'No experiences yet.' : 'Assign a job to these bullets first.'),
  ]);

  const foot = showRemove && currentExperienceId && onRemoveFromExperience
    ? el('div', { class: 'bb-float-overlay-foot bb-exp-picker-footer bb-action-row' }, [
      btn('Remove from experience', {
        type: 'button',
        class: 'btn ghost compact-action',
        onClick: () => onRemoveFromExperience(),
      }),
    ])
    : null;

  return {
    head,
    body: listBody,
    foot,
    afterMount: () => paintActive(listBody, activeIndex),
  };
}

/** Inline create when job must be chosen (no jobId on bullet). */
export function buildExperienceSearchCreateForm(deps) {
  const {
    el,
    btn,
    store,
    jobId: initialJobId = '',
    defaultName = '',
    focusKey = 'xp-create',
    onSubmit,
    onCancel,
    onRender,
  } = deps;
  return buildExperienceCreateForm({
    el,
    btn,
    store,
    jobId: initialJobId,
    lockJob: Boolean(initialJobId),
    defaultName,
    focusKey,
    submitLabel: 'Create & assign',
    onSubmit,
    onCancel,
    onRender,
  });
}
