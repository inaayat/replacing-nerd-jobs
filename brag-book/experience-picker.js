/**
 * Per-bullet Experience membership picker. Browser-safe ESM.
 */

import {
  createExperience,
  moveEntryToExperience,
  removeEntryFromExperience,
  experienceForEntry,
} from './engine.js';
import { compactExperienceIndex, forgetSessionEmptyExperience } from './experiences-index.js';

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
  } = deps;

  const jobId = entry.jobId || '';
  const open = openEntryId === entry.id;

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
  const chip = btn(`Experience: ${label} ▾`, {
    type: 'button',
    class: 'btn ghost compact-action bb-exp-picker-chip',
    title: `Experience: ${label}`,
    'aria-expanded': open ? 'true' : 'false',
    'data-focus-key': anchorFocusKey,
    onClick: (event) => {
      event.stopPropagation();
      if (open) close();
      else {
        onOpenPicker(entry.id);
        onRender({ focusKey: `xp-search-${entry.id}`, preserveScroll: true });
      }
    },
  });

  if (!open) return chip;

  const choices = compactExperienceIndex(store, { query: pickerSearch, includeEmpty: true })
    .filter((row) => row.jobId === jobId);
  const current = experienceForEntry(store, entry.id);

  const menu = el('div', {
    class: 'bb-exp-picker-menu',
    role: 'dialog',
    'aria-label': 'Choose experience',
  }, [
    pickerCreating
      ? el('div', { class: 'bb-exp-picker-create' }, [
        el('input', {
          type: 'text',
          class: 'bb-exp-picker-create-input',
          placeholder: 'Experience title',
          'aria-label': 'New experience title',
          'data-focus-key': `xp-create-${entry.id}`,
          onKeydown: (event) => {
            if (event.key === 'Escape') {
              onPickerCreating(false);
              onRender({ focusKey: anchorFocusKey, preserveScroll: true });
            }
          },
        }),
        el('div', { class: 'bb-exp-picker-create-actions bb-action-row' }, [
          btn('Save', {
            type: 'button',
            class: 'btn',
            onClick: (event) => {
              const title = event.target.closest('.bb-exp-picker-create')
                ?.querySelector('input')?.value?.trim();
              if (!title || !jobId) {
                setNote('Assign a job to this bullet first.');
                return;
              }
              const created = createExperience(store, { jobId, title });
              let next = moveEntryToExperience(created.store, entry.id, created.changedExperienceIds[0]).store;
              forgetSessionEmptyExperience(created.changedExperienceIds[0]);
              applyMembership(next, 'Created experience and assigned this bullet.');
            },
          }),
          btn('Cancel', {
            type: 'button',
            class: 'btn ghost',
            onClick: () => {
              onPickerCreating(false);
              onRender({ focusKey: anchorFocusKey, preserveScroll: true });
            },
          }),
        ]),
      ])
      : el('input', {
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
    pickerCreating ? null : el('div', { class: 'bb-exp-picker-list', role: 'listbox' },
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
      })),
    pickerCreating ? null : el('div', { class: 'bb-exp-picker-footer bb-action-row' }, [
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

  return el('div', { class: 'bb-exp-picker-wrap' }, [chip, menu]);
}
