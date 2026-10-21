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

export function formatAddLooseBulletLabel(query) {
  const trimmed = String(query || '').trim();
  if (trimmed) return `+ Add as a new bullet "${trimmed}"`;
  return '+ Add as a new bullet';
}

/** Arrow / Enter navigation for a search field over `[data-exp-picker-option]` rows. */
export function wireExperienceSearchListKeyboard(searchInput, {
  getOptionCount,
  getActiveIndex,
  onActiveIndexChange,
  onCommitIndex,
  onEnterWithText,
}) {
  if (!searchInput) return;
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return;
    const optionCount = typeof getOptionCount === 'function' ? getOptionCount() : 0;
    if (!optionCount) return;
    const activeIndex = typeof getActiveIndex === 'function' ? getActiveIndex() : -1;
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
      if (activeIndex >= 0 && typeof onCommitIndex === 'function') {
        onCommitIndex(activeIndex);
      } else if (typeof onEnterWithText === 'function') {
        onEnterWithText(String(searchInput.value || '').trim());
      }
    }
  });
}

export function paintExperienceSearchOptions(listEl, activeIndex) {
  if (!listEl) return;
  const buttons = listEl.querySelectorAll('[data-exp-picker-option]');
  buttons.forEach((node, i) => {
    const on = i === activeIndex;
    node.classList.toggle('is-active', on);
    node.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) node.scrollIntoView({ block: 'nearest' });
  });
}

export function buildAddLooseBulletOption(deps, {
  query,
  activeIndex,
  optionIndex,
  jobId,
  onAddLooseBulletFromQuery,
  choiceClass = 'bb-exp-picker-choice',
}) {
  const { el, btn } = deps;
  return btn(formatAddLooseBulletLabel(query), {
    type: 'button',
    class: `${choiceClass} bb-post-map-add-loose-row${optionIndex === activeIndex ? ' is-active' : ''}`,
    role: 'option',
    'data-exp-picker-option': '1',
    'aria-selected': optionIndex === activeIndex ? 'true' : 'false',
    onMouseDown: (event) => event.preventDefault(),
    onClick: () => {
      const title = String(query || '').trim();
      if (!jobId || !title) return;
      onAddLooseBulletFromQuery({ title, jobId });
    },
  });
}

export function buildCreateExperienceOption(deps, { query, activeIndex, optionIndex, jobId, onCreateFromQuery, onOpenCreateForm, choiceClass = 'bb-exp-picker-choice' }) {
  const { el, btn } = deps;
  return btn(formatCreateExperienceLabel(query), {
    type: 'button',
    class: `${choiceClass} bb-exp-picker-create-row${optionIndex === activeIndex ? ' is-active' : ''}`,
    role: 'option',
    'data-exp-picker-option': '1',
    'aria-selected': optionIndex === activeIndex ? 'true' : 'false',
    onMouseDown: (event) => event.preventDefault(),
      onClick: () => {
        const title = String(query || '').trim();
        if (!title) return;
        if (!jobId && typeof onOpenCreateForm === 'function') {
          onOpenCreateForm();
          return;
        }
        onCreateFromQuery({ title, jobId });
      },
  });
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

  wireExperienceSearchListKeyboard(searchInput, {
    getOptionCount: () => optionCount,
    getActiveIndex: () => activeIndex,
    onActiveIndexChange,
    onCommitIndex: () => commitActive(),
    onEnterWithText: (title) => {
      if (jobId && title) onCreateFromQuery({ title, jobId });
    },
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
    listNodes.push(buildCreateExperienceOption(deps, {
      query,
      activeIndex,
      optionIndex: createRowIndex,
      jobId,
      onCreateFromQuery,
      onOpenCreateForm,
      choiceClass,
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
    afterMount: () => paintExperienceSearchOptions(listBody, activeIndex),
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
