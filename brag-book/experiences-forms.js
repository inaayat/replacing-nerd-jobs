/**
 * Inline Experiences forms (browser-safe ESM). No prompt/alert/confirm.
 */

import {
  createExperience,
  moveEntryToExperience,
  careerJobGroupLabel,
} from './engine.js';
import { compactExperienceIndex, forgetSessionEmptyExperience } from './experiences-index.js';
import { registerOverlayClose } from './floating-overlay.js';

export const BULK_EXP_OVERLAY_ID = 'bulk-add-to-experience';

export function jobDisplayLabel(job) {
  if (!job) return 'Untitled job';
  return careerJobGroupLabel(job) || [job.company, job.title].filter(Boolean).join(' · ') || 'Untitled job';
}

/**
 * Apply bulk assign of entry ids to an existing or new experience (same job only).
 */
export function bulkAssignEntriesToExperience(
  store,
  entryIds,
  { experienceId = '', newTitle = '', jobId = '' } = {},
  clock = Date.now,
) {
  const ids = [...new Set((entryIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Select at least one bullet.');
  const entries = ids.map((id) => store.entries.find((row) => row.id === id)).filter(Boolean);
  if (entries.length !== ids.length) throw new Error('Bullet not found.');
  const jobs = new Set(entries.map((entry) => String(entry.jobId || '').trim()).filter(Boolean));
  if (jobs.size !== 1) throw new Error('Selected bullets must share one job.');
  const resolvedJobId = jobId || [...jobs][0];
  if (!resolvedJobId) throw new Error('Assign a job to these bullets first.');
  if (entries.some((entry) => entry.jobId !== resolvedJobId)) {
    throw new Error('Selected bullets must share one job.');
  }

  let next = store;
  let xpId = experienceId;
  if (!xpId) {
    const title = String(newTitle || '').trim();
    if (!title) throw new Error('Experience name required.');
    const created = createExperience(next, { jobId: resolvedJobId, title }, clock);
    next = created.store;
    xpId = created.changedExperienceIds[0];
  }
  for (const id of ids) {
    next = moveEntryToExperience(next, id, xpId, { clock }).store;
  }
  forgetSessionEmptyExperience(xpId);
  return { store: next, experienceId: xpId, entryIds: ids };
}

/**
 * Inline create form: name + optional job dropdown (human labels only).
 */
export function buildExperienceCreateForm(deps) {
  const {
    el,
    btn,
    store,
    jobId: initialJobId = '',
    lockJob = false,
    defaultName = '',
    focusKey = 'xp-inline-name',
    submitLabel = 'Save',
    onSubmit,
    onCancel,
    onRender,
  } = deps;

  const jobs = store.jobs || [];
  let draftJobId = initialJobId || jobs[0]?.id || '';
  const nameInput = el('input', {
    type: 'text',
    class: 'bb-exp-inline-name',
    value: defaultName,
    placeholder: 'Experience name',
    'aria-label': 'Experience name',
    'data-focus-key': focusKey,
  });

  const commit = () => {
    const title = String(nameInput.value || '').trim();
    if (!title) return;
    const jobId = lockJob ? initialJobId : draftJobId;
    if (!jobId) return;
    onSubmit({ title, jobId });
  };

  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  });

  const jobField = lockJob || jobs.length <= 1
    ? (draftJobId
      ? el('p', { class: 'tiny bb-exp-inline-job' }, jobDisplayLabel(jobs.find((j) => j.id === draftJobId)))
      : el('p', { class: 'tiny bb-exp-inline-hint' }, 'Assign a job to this bullet first.'))
    : fieldInline(deps, 'Job', el('select', {
      class: 'bb-job-select',
      'aria-label': 'Job',
      onChange: (event) => {
        draftJobId = event.target.value;
      },
    }, jobs.map((job) => el('option', {
      value: job.id,
      selected: job.id === draftJobId || undefined,
    }, jobDisplayLabel(job)))));

  return el('div', { class: 'bb-exp-inline-form' }, [
    el('label', { class: 'bb-exp-inline-field' }, [
      el('span', { class: 'tiny' }, 'Name'),
      nameInput,
    ]),
    jobField,
    el('div', { class: 'bb-exp-inline-actions bb-action-row' }, [
      btn(submitLabel, { type: 'button', class: 'btn', onClick: commit }),
      btn('Cancel', {
        type: 'button',
        class: 'btn ghost',
        onClick: () => onCancel(),
      }),
    ]),
  ]);
}

function fieldInline(deps, label, control) {
  const { el } = deps;
  return el('label', { class: 'bb-exp-inline-field' }, [
    el('span', { class: 'tiny' }, label),
    control,
  ]);
}

/** Sticky bulk bar: Add to experience menu + Cancel. */
export function buildBulkExperienceBar(deps) {
  const {
    el,
    btn,
    store,
    selectedEntryIds,
    menuOpen,
    menuSearch,
    createOpen,
    onToggleMenu,
    onMenuSearch,
    onOpenCreate,
    onCloseCreate,
    onAssignExisting,
    onCreateAndAssign,
    onCancelBulk,
    renderCreateForm,
  } = deps;

  const ids = [...selectedEntryIds];
  const count = ids.length;
  if (!count) return null;

  const jobs = new Set();
  for (const id of ids) {
    const entry = store.entries.find((row) => row.id === id);
    if (entry?.jobId) jobs.add(entry.jobId);
  }
  const singleJob = jobs.size === 1 ? [...jobs][0] : '';

  const addBtn = btn('Add to experience ▾', {
    type: 'button',
    class: 'btn',
    disabled: !singleJob,
    'aria-expanded': menuOpen ? 'true' : 'false',
    'data-bb-overlay-anchor': BULK_EXP_OVERLAY_ID,
    onClick: () => onToggleMenu(),
  });

  const menu = menuOpen
    ? el('div', {
      class: 'bb-exp-bulk-menu bb-float-overlay-panel',
      role: 'dialog',
      'aria-label': 'Add to experience',
      'data-bb-overlay-panel': BULK_EXP_OVERLAY_ID,
    }, [
      jobs.size > 1
        ? el('p', { class: 'tiny bb-exp-bulk-hint' }, 'Selected bullets span more than one job. Narrow the selection to one job to add them to an experience.')
        : null,
      !createOpen && singleJob
        ? el('div', { class: 'bb-float-overlay-head' }, [
          el('input', {
            type: 'search',
            class: 'search',
            placeholder: 'Search experiences…',
            value: menuSearch,
            'aria-label': 'Search experiences',
            'data-focus-key': 'bulk-xp-search',
            onInput: (event) => onMenuSearch(event.target.value),
          }),
        ])
        : null,
      !createOpen && singleJob
        ? el('div', { class: 'bb-float-overlay-body bb-exp-bulk-menu-list' },
          compactExperienceIndex(store, { query: menuSearch, includeEmpty: true })
            .filter((row) => row.jobId === singleJob)
            .map((row) => btn(row.title, {
              type: 'button',
              class: 'bb-exp-picker-choice',
              onClick: () => onAssignExisting(row.id),
            })))
        : null,
      !createOpen && singleJob
        ? el('div', { class: 'bb-float-overlay-foot bb-action-row' }, [
          btn('Create new experience…', {
            type: 'button',
            class: 'btn ghost compact-action',
            onClick: () => onOpenCreate(),
          }),
        ])
        : null,
      createOpen && singleJob && renderCreateForm
        ? el('div', { class: 'bb-float-overlay-body' }, [renderCreateForm()])
        : null,
    ])
    : null;

  if (menu) registerOverlayClose(menu, () => onToggleMenu());

  return el('div', { class: 'bb-exp-bulk-bar bb-action-row', role: 'region', 'aria-label': 'Bulk actions' }, [
    el('span', { class: 'bb-exp-bulk-count' }, `${count} selected`),
    addBtn,
    btn('Cancel', {
      type: 'button',
      class: 'btn ghost',
      onClick: () => onCancelBulk(),
    }),
    menu,
  ]);
}
