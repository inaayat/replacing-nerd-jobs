/**
 * Per-bullet Experience membership picker. Browser-safe ESM.
 */

import {
  moveEntryToExperience,
  removeEntryFromExperience,
  experienceForEntry,
} from './engine.js';
import { forgetSessionEmptyExperience } from './experiences-index.js';
import { buildExperienceSearchPickerBody } from './experience-search-picker.js';
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
    pickerActiveIndex = -1,
    pickerCreateFormOpen = false,
    onOpenPicker,
    onPickerSearch,
    onPickerActiveIndex,
    onPickerCreateFormOpen,
    onStore,
    onSave,
    onRender,
    setNote,
    renderCreateForm,
    onCreateAndAssign,
  } = deps;

  const jobId = entry.jobId || '';
  const open = openEntryId === entry.id;
  const overlayId = experiencePickerOverlayId(entry.id);

  const close = ({ refocusAnchor = true } = {}) => {
    onOpenPicker('');
    onPickerCreateFormOpen(false);
    onPickerSearch('');
    onPickerActiveIndex(-1);
    onRender({
      preserveScroll: true,
      ...(refocusAnchor ? { focusKey: anchorFocusKey } : {}),
    });
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

  const current = experienceForEntry(store, entry.id);

  const pickerParts = buildExperienceSearchPickerBody({
    el,
    btn,
    store,
    jobId,
    query: pickerSearch,
    onQueryChange: (value) => {
      onPickerSearch(value);
      onRender({ focusKey: `xp-search-${entry.id}`, preserveScroll: true });
    },
    searchFocusKey: `xp-search-${entry.id}`,
    activeIndex: pickerActiveIndex,
    onActiveIndexChange: (index) => {
      onPickerActiveIndex(index);
      onRender({ focusKey: `xp-search-${entry.id}`, preserveScroll: true });
    },
    currentExperienceId: current?.id || '',
    onSelectExperience: (experienceId) => {
      if (current?.id === experienceId) {
        close();
        return;
      }
      if (!jobId) {
        setNote('Assign a job to this bullet first.');
        return;
      }
      const moved = moveEntryToExperience(store, entry.id, experienceId);
      forgetSessionEmptyExperience(experienceId);
      applyMembership(moved.store, 'Moved bullet to that experience.');
    },
    onCreateFromQuery: ({ title, jobId: resolvedJobId }) => {
      if (typeof onCreateAndAssign === 'function') {
        onCreateAndAssign({ title, jobId: resolvedJobId, entryId: entry.id });
      }
    },
    onRemoveFromExperience: current
      ? () => applyMembership(removeEntryFromExperience(store, entry.id).store, 'Bullet is loose under the same job.')
      : null,
    showRemove: Boolean(current),
    createFormOpen: pickerCreateFormOpen,
    onOpenCreateForm: () => {
      onPickerCreateFormOpen(true);
      onRender({ focusKey: `xp-create-${entry.id}`, preserveScroll: true });
    },
    renderCreateForm: pickerCreateFormOpen && renderCreateForm ? renderCreateForm : null,
  });

  const menu = el('div', {
    class: 'bb-exp-picker-menu bb-float-overlay-panel',
    role: 'dialog',
    'aria-label': 'Choose experience',
    'data-bb-overlay-panel': overlayId,
  }, [
    pickerParts.head,
    pickerParts.body,
    pickerParts.foot,
  ]);

  registerOverlayClose(menu, () => close({ refocusAnchor: false }));
  if (typeof pickerParts.afterMount === 'function') {
    queueMicrotask(() => pickerParts.afterMount());
  }

  return el('div', { class: 'bb-exp-picker-wrap' }, [chip, menu]);
}
