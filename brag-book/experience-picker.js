/**
 * Per-bullet Experience membership picker. Browser-safe ESM.
 */

import {
  moveEntryToExperience,
  removeEntryFromExperience,
  experienceForEntry,
} from './engine.js';
import { compactExperienceIndex, forgetSessionEmptyExperience } from './experiences-index.js';
import { buildExperienceCreateForm } from './experiences-forms.js';
import { registerOverlayClose } from './floating-overlay.js';

export function experiencePickerOverlayId(entryId) {
  return `exp-picker-${entryId}`;
}

export function experiencePickerLabel(store, entry) {
  const xp = experienceForEntry(store, entry.id);
  return xp?.title ? xp.title : 'Not assigned';
}

export function buildExperiencePicker(deps) {
  const {
    el,
    btn,
    store,
    entry,
    anchorFocusKey,
    openEntryId,
    pickerSearch,
    pickerCreating,
    onOpenPicker,
    onPickerSearch,
    onPickerCreating,
    onStore,
    onSave,
    onRender,
    setNote,
    renderCreateForm,
  } = deps;

  const jobId = entry.jobId || '';
  const open = openEntryId === entry.id;
  const overlayId = experiencePickerOverlayId(entry.id);

  const close = () => {
    onOpenPicker('');
    onPickerCreating(false);
    onPickerSearch('');
    onRender({ focusKey: anchorFocusKey, preserveScroll: true });
  };

  const applyMembership = (nextStore, message) => {
    onStore(nextStore);
    onSave();
    setNote(message);
    close();
  };

  const label = experiencePickerLabel(store, entry);
  const chip = el('button', {
    type: 'button',
    class: 'row-text-action bb-exp-picker-chip',
    title: `Experience: ${label}`,
    'aria-expanded': open ? 'true' : 'false',
    'data-focus-key': anchorFocusKey,
    'data-bb-overlay-anchor': overlayId,
    onClick: (event) => {
      event.stopPropagation();
      if (open) close();
      else {
        onOpenPicker(entry.id);
        onRender({ focusKey: `xp-search-${entry.id}`, preserveScroll: true });
      }
    },
  }, `Experience: ${label} ▾`);

  if (!open) return chip;

  const choices = compactExperienceIndex(store, { query: pickerSearch, includeEmpty: true })
    .filter((row) => row.jobId === jobId);
  const current = experienceForEntry(store, entry.id);

  const createBody = pickerCreating
    ? (renderCreateForm
      ? renderCreateForm()
      : buildExperienceCreateForm({
        el,
        btn,
        store,
        jobId,
        lockJob: Boolean(jobId),
        focusKey: `xp-create-${entry.id}`,
        onSubmit: ({ title, jobId: resolvedJobId }) => {
          deps.onCreateAndAssign({ title, jobId: resolvedJobId, entryId: entry.id });
        },
        onCancel: () => {
          onPickerCreating(false);
          onRender({ focusKey: anchorFocusKey, preserveScroll: true });
        },
        onRender,
      }))
    : null;

  const listBody = pickerCreating
    ? null
    : el('div', { class: 'bb-float-overlay-body bb-exp-picker-list', role: 'listbox' },
      choices.map((row) => {
        const selected = current?.id === row.id;
        return btn(`${selected ? '✓ ' : ''}${row.title} · ${row.versionCount} bullet${row.versionCount === 1 ? '' : 's'}`, {
          type: 'button',
          class: `bb-exp-picker-choice${selected ? ' is-on' : ''}`,
          role: 'option',
          onClick: () => {
            if (selected) { close(); return; }
            if (!jobId) {
              setNote('Assign a job to this bullet first.');
              return;
            }
            const moved = moveEntryToExperience(store, entry.id, row.id);
            forgetSessionEmptyExperience(row.id);
            applyMembership(moved.store, 'Moved bullet to that experience.');
          },
        });
      }));

  const menu = el('div', {
    class: 'bb-exp-picker-menu bb-float-overlay-panel',
    role: 'dialog',
    'aria-label': 'Choose experience',
    'data-bb-overlay-panel': overlayId,
  }, [
    createBody
      ? el('div', { class: 'bb-float-overlay-body' }, [createBody])
      : el('div', { class: 'bb-float-overlay-head' }, [
        el('input', {
          type: 'search',
          class: 'search bb-exp-picker-search',
          placeholder: 'Search experiences for this job…',
          'aria-label': 'Search experiences',
          value: pickerSearch,
          onInput: (event) => {
            onPickerSearch(event.target.value);
            onRender({ focusKey: `xp-search-${entry.id}`, preserveScroll: true });
          },
          'data-focus-key': `xp-search-${entry.id}`,
        }),
      ]),
    listBody,
    pickerCreating ? null : el('div', { class: 'bb-float-overlay-foot bb-exp-picker-footer bb-action-row' }, [
      btn('+ Create new experience', {
        type: 'button',
        class: 'btn ghost compact-action',
        onClick: () => {
          onPickerCreating(true);
          onRender({ focusKey: `xp-create-${entry.id}`, preserveScroll: true });
        },
      }),
      current
        ? btn('Remove from experience', {
          type: 'button',
          class: 'btn ghost compact-action',
          onClick: () => {
            applyMembership(removeEntryFromExperience(store, entry.id).store, 'Bullet is loose under the same job.');
          },
        })
        : null,
    ]),
  ]);

  registerOverlayClose(menu, close);

  return el('div', { class: 'bb-exp-picker-wrap' }, [chip, menu]);
}
