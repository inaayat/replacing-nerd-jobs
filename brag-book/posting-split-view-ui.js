/**
 * Posting split view UI (browser-safe ESM).
 *
 * Left: the resume bullets on this posting, each wearing the requirements it
 * addresses. Right: this posting's job requirements. Drag a requirement
 * onto a bullet (or a bullet onto a requirement) to put it under that bullet.
 * Dragging a requirement chip onto another bullet tags it there as well and
 * leaves it on the first. The "+ Requirement" picker and a selected
 * requirement's "+ R1" buttons are the keyboard and touch path to the same link.
 *
 * Everything persists through the caller's `onSave` (the debounced,
 * merge-safe book save). No bullet is copied: the editor on each card edits
 * the one shared bank record.
 */

import {
  addRequirement,
  deleteBullet,
  deleteRequirement,
  updateRequirement,
} from './engine.js';
import { buildMapEntryEditor } from './posting-requirement-mapping-ui.js';
import {
  SPLIT_DRAG_ENTRY_TYPE,
  SPLIT_DRAG_REQUIREMENT_TYPE,
  BLANK_BULLET_TITLE,
  addBulletToPosting,
  addLibraryBulletToPosting,
  clearDraftSources,
  draftBulletFromBullets,
  resolveComposeJobId,
  applySplitDrop,
  filterSplitBullets,
  linkRequirementToBullet,
  postingSplitViewModel,
  readSplitDragPayload,
  removeBulletFromPosting,
  requirementsAvailableForBullet,
  searchBankBulletsForPosting,
  splitRequirementDisplayOrder,
  splitDropAccepts,
  unlinkRequirementFromBullet,
} from './posting-split-view.js';

export function splitBulletFocusKey(entryId) {
  return `split-bullet-${entryId}`;
}

export function splitRequirementFocusKey(reqId) {
  return `split-req-${reqId}`;
}

/** Session (not stored) UI state for the split view. */
export function emptySplitViewState() {
  return {
    selectedRequirementId: '',
    openRequirementPickerEntryId: '',
    bulletFilter: 'all',
    composeOpen: false,
    composeJobId: '',
    bankQuery: '',
    requirementAddOpen: false,
    deleteRequirementPendingId: '',
    deleteBulletPendingId: '',
    expandedDetailsEntryId: '',
    questionsOpenReqId: '',
    expandedChipKey: '',
    expandAllChips: false,
    /** Phone pane ('requirements' | 'bullets'); empty = pick from the model. Desktop shows both. */
    pane: '',
  };
}

/**
 * Which pane a phone shows. Both columns are always in the DOM; CSS hides the
 * other one below 720px, so this is harmless on desktop.
 */
export function splitPaneFor(state, model) {
  if (state.pane === 'requirements' || state.pane === 'bullets') return state.pane;
  return model.counts.bullets || !model.counts.requirements ? 'bullets' : 'requirements';
}

function dragTypes(event) {
  return Array.from(event?.dataTransfer?.types || []);
}

function payloadKindFromTypes(types) {
  if (types.includes(SPLIT_DRAG_REQUIREMENT_TYPE)) return 'requirement';
  if (types.includes(SPLIT_DRAG_ENTRY_TYPE)) return 'entry';
  return '';
}

/**
 * Wire one card as a drop target. Class toggles happen on the node directly
 * so a drag never re-renders the page; only the drop does.
 */
export function wireSplitDropTarget(node, { targetKind, targetId, onDrop }) {
  const accepts = (event) => splitDropAccepts(payloadKindFromTypes(dragTypes(event)), targetKind);
  node.addEventListener('dragenter', (event) => {
    if (!accepts(event)) return;
    event.preventDefault();
    node.classList.add('is-drop-target');
  });
  node.addEventListener('dragover', (event) => {
    if (!accepts(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'link';
    node.classList.add('is-drop-target');
  });
  node.addEventListener('dragleave', (event) => {
    if (event.relatedTarget && node.contains(event.relatedTarget)) return;
    node.classList.remove('is-drop-target');
  });
  node.addEventListener('drop', (event) => {
    node.classList.remove('is-drop-target');
    const payload = readSplitDragPayload(event.dataTransfer);
    if (!payload || !splitDropAccepts(payload.kind, targetKind)) return;
    event.preventDefault();
    onDrop(payload, { kind: targetKind, id: targetId });
  });
}

/**
 * The card is only draggable while the pointer is down on its handle, so
 * selecting text in the editable line (or the requirement textarea) never
 * starts a drag.
 */
export function wireSplitDragSource(node, { handle, type, id }) {
  const arm = () => node.setAttribute('draggable', 'true');
  const disarm = () => node.removeAttribute('draggable');
  if (handle) {
    // pointerdown covers a tablet finger (iPadOS drags draggable elements); mousedown stays for
    // browsers without pointer events. Arming twice is harmless.
    handle.addEventListener('pointerdown', arm);
    handle.addEventListener('mousedown', arm);
    handle.addEventListener('pointerup', disarm);
    handle.addEventListener('pointercancel', disarm);
    handle.addEventListener('mouseup', disarm);
  } else {
    arm();
  }
  node.addEventListener('dragstart', (event) => {
    if (node.getAttribute('draggable') !== 'true') {
      event.preventDefault();
      return;
    }
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(type, id);
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'link';
    node.classList.add('is-dragging');
  });
  node.addEventListener('dragend', () => {
    node.classList.remove('is-dragging');
    if (handle) disarm();
  });
}

function requirementCard(deps, posting, model, row) {
  const {
    el, btn, store, state, setState, onSave, onRender, setNote,
    renderRequirementQuestions, mapPick,
  } = deps;
  const selected = state.selectedRequirementId === row.id;
  const unaddressed = row.bulletCount === 0 && !row.coveredExperienceIds.length;
  const deletePending = state.deleteRequirementPendingId === row.id;
  const questionsOpen = state.questionsOpenReqId === row.id || row.questionCount > 0;

  const textArea = el('textarea', {
    class: 'table-req-text bb-split-req-text',
    rows: '1',
    'aria-label': unaddressed
      ? `Requirement ${row.ordinal}, no bullet yet`
      : `Requirement ${row.ordinal}, ${row.bulletCount} bullet${row.bulletCount === 1 ? '' : 's'}`,
    'data-focus-key': splitRequirementFocusKey(row.id),
    onInput: (event) => {
      const text = event.target.value;
      if (text === row.text) return;
      onSave(updateRequirement(store, posting.id, row.id, { text: text.trim() ? text : row.text }));
    },
    onBlur: (event) => {
      const text = event.target.value.trim();
      if (!text || text === row.text) return;
      onSave(updateRequirement(store, posting.id, row.id, { text }));
      setNote('Requirement saved.');
    },
  }, row.text);
  textArea.value = row.text;
  if (typeof deps.fitArea === 'function') deps.fitArea(textArea);

  const coverage = row.bulletCount > 0
    ? el('span', { class: 'bb-split-req-count' }, `${row.bulletCount} bullet${row.bulletCount === 1 ? '' : 's'}`)
    : null;

  const selectBtn = el('button', {
    type: 'button',
    class: `row-text-action bb-split-req-select${selected ? ' is-on' : ''}`,
    'aria-pressed': selected ? 'true' : 'false',
    title: selected ? 'Stop adding this requirement to bullets' : 'Pick bullets for this requirement',
    onClick: () => {
      // Selecting also moves a phone to the Bullets pane, where the + Rn buttons are.
      setState({
        selectedRequirementId: selected ? '' : row.id,
        openRequirementPickerEntryId: '',
        pane: selected ? state.pane : 'bullets',
      });
      onRender({ preserveScroll: true, focusKey: selected ? undefined : 'split-selected-done' });
    },
  }, selected ? 'Done' : 'Add to bullets…');

  const actions = el('div', { class: 'bb-split-req-actions bb-action-row' }, [
    coverage,
    selectBtn,
    mapPick?.active
      ? btn('Map here', {
        type: 'button',
        class: 'btn ghost compact-action bb-req-map-here',
        onClick: () => mapPick.onMapHere(row.req),
      })
      : null,
    el('div', { class: 'row-icons' }, [
      btn('?', {
        class: `icon-quiet${state.questionsOpenReqId === row.id ? ' is-on' : ''}`,
        title: 'Add a question',
        'aria-label': 'Add a question',
        onClick: () => deps.onToggleQuestions(row.req),
      }),
      deletePending
        ? el('span', { class: 'bb-split-confirm' }, [
          el('span', { class: 'tiny' }, 'Delete?'),
          btn('Yes', {
            class: 'btn ghost compact-action is-danger',
            onClick: () => {
              setState({ deleteRequirementPendingId: '', selectedRequirementId: selected ? '' : state.selectedRequirementId });
              onSave(deleteRequirement(store, posting.id, row.id));
              onRender({ preserveScroll: true });
              setNote('Requirement deleted. Its bullets stay in the bank and on the resume.');
            },
          }),
          btn('No', {
            class: 'btn ghost compact-action',
            onClick: () => {
              setState({ deleteRequirementPendingId: '' });
              onRender({ preserveScroll: true });
            },
          }),
        ])
        : btn('×', {
          class: 'icon-quiet is-danger',
          title: 'Delete requirement',
          'aria-label': 'Delete requirement',
          onClick: () => {
            setState({ deleteRequirementPendingId: row.id });
            onRender({ preserveScroll: true });
          },
        }),
    ]),
  ]);

  const handle = el('span', { class: 'bb-split-handle', 'aria-hidden': 'true', title: 'Drag onto a bullet' }, '⠇');
  const card = el('article', {
    class: [
      'bb-split-req',
      selected ? 'is-selected' : '',
      unaddressed ? 'is-unaddressed' : '',
      row.bulletCount > 0 ? 'is-addressed' : '',
    ].filter(Boolean).join(' '),
    'data-requirement-id': row.id,
    'data-bullet-count': String(row.bulletCount),
  }, [
    el('div', { class: 'bb-split-req-head' }, [
      handle,
      el('span', { class: 'bb-split-ordinal' }, row.ordinal),
      textArea,
      actions,
    ]),
    questionsOpen && typeof renderRequirementQuestions === 'function'
      ? renderRequirementQuestions(row.req)
      : null,
  ]);

  wireSplitDragSource(card, { handle, type: SPLIT_DRAG_REQUIREMENT_TYPE, id: row.id });
  wireSplitDropTarget(card, {
    targetKind: 'requirement',
    targetId: row.id,
    onDrop: (payload, target) => {
      commitMappedChange(() => {
        onSave(applySplitDrop(store, posting.id, payload, target));
        onRender({ preserveScroll: true });
        setNote(`Bullet now addresses ${row.ordinal}.`);
      });
    },
  });
  return card;
}

function requirementChip(deps, posting, bullet, reqRow) {
  const {
    el, store, state, setState, onSave, onRender, setNote,
  } = deps;
  const chipKey = `${bullet.key}:${reqRow.id}`;
  const expanded = Boolean(state.expandAllChips) || state.expandedChipKey === chipKey;
  // A drag that ends in a drop also fires click. Skip the expand that would follow.
  let dragged = false;
  return el('span', {
    class: `bb-split-chip${expanded ? ' is-expanded' : ''}`,
    'data-requirement-id': reqRow.id,
    title: reqRow.text,
  }, [
    // Tap the chip to read the whole requirement: there is no hover title on touch.
    // Drag it onto another bullet to tag that requirement there too. The source
    // chip stays; this is the same additive link as dragging the requirement card.
    el('button', {
      type: 'button',
      class: 'bb-split-chip-body',
      draggable: 'true',
      title: 'Drag onto another bullet. It stays on this one too.',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-label': `${reqRow.ordinal}: ${reqRow.text}`,
      onClick: (event) => {
        if (dragged) {
          dragged = false;
          event.preventDefault();
          return;
        }
        setState({ expandedChipKey: expanded ? '' : chipKey });
        onRender({ preserveScroll: true });
      },
      onDragstart: (event) => {
        // The bullet card cancels a drag that did not start on its handle.
        // Stop here so that listener never sees this chip drag.
        event.stopPropagation();
        dragged = true;
        if (!event.dataTransfer) return;
        event.dataTransfer.setData(SPLIT_DRAG_REQUIREMENT_TYPE, reqRow.id);
        event.dataTransfer.setData('text/plain', reqRow.id);
        event.dataTransfer.effectAllowed = 'link';
        event.currentTarget.closest('.bb-split-chip')?.classList.add('is-dragging');
      },
      onDragend: (event) => {
        event.currentTarget.closest('.bb-split-chip')?.classList.remove('is-dragging');
      },
    }, [
      el('span', { class: 'bb-split-chip-ordinal' }, reqRow.ordinal),
      el('span', { class: 'bb-split-chip-text' }, expanded ? reqRow.text : reqRow.short),
    ]),
    el('button', {
      type: 'button',
      class: 'bb-split-chip-remove',
      title: `Remove ${reqRow.ordinal} from this bullet`,
      'aria-label': `Remove ${reqRow.ordinal} from this bullet`,
      onClick: () => {
        commitMappedChange(() => {
          if (bullet.legacy) {
            onSave(deleteBullet(store, posting.id, bullet.legacy.reqId, bullet.legacy.bulletId));
          } else {
            onSave(unlinkRequirementFromBullet(store, posting.id, reqRow.id, bullet.entryId));
          }
          onRender({ preserveScroll: true });
          setNote(`${reqRow.ordinal} removed from this bullet. The bullet stays in the bank and on the resume.`);
        });
      },
    }, '×'),
  ]);
}

/**
 * The "+ Requirement" picker. Inline under the bullet on desktop; on a phone
 * the same element is a bottom sheet with a backdrop (CSS ≤720px), so the
 * list is reachable with a thumb and closes on backdrop tap, Close, or Escape.
 */
function requirementPickerMenu(deps, posting, model, bullet) {
  const { el, btn, store, setState, onSave, onRender, setNote } = deps;
  const available = requirementsAvailableForBullet(model, bullet.entryId);
  const close = () => {
    setState({ openRequirementPickerEntryId: '' });
    onRender({ preserveScroll: true, focusKey: `split-add-req-${bullet.entryId}` });
  };
  const head = el('div', { class: 'bb-split-req-menu-head' }, [
    el('span', { class: 'bb-split-req-menu-title' }, 'Add a requirement to this bullet'),
    btn('Close', { class: 'btn ghost compact-action bb-split-req-menu-close', onClick: close }),
  ]);
  const menu = el('div', {
    class: 'bb-split-req-menu',
    role: 'dialog',
    'aria-label': 'Add a requirement to this bullet',
    'data-entry-id': bullet.entryId,
    onKeydown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    },
  }, [
    head,
    available.length
      ? el('div', { class: 'bb-split-req-options', role: 'listbox' }, available.map((req) => el('button', {
        type: 'button',
        class: 'bb-split-req-option',
        role: 'option',
        'aria-selected': 'false',
        'data-requirement-id': req.id,
        onClick: () => {
          commitMappedChange(() => {
            onSave(linkRequirementToBullet(store, posting.id, req.id, bullet.entryId));
            setState({ openRequirementPickerEntryId: '' });
            onRender({ preserveScroll: true, focusKey: `split-add-req-${bullet.entryId}` });
            setNote(`${req.ordinal} added under this bullet.`);
          });
        },
      }, [
        el('span', { class: 'bb-split-chip-ordinal' }, req.ordinal),
        el('span', { class: 'bb-split-req-option-text' }, req.text),
      ])))
      : el('p', { class: 'tiny empty' }, 'Every requirement is already under this bullet.'),
  ]);
  const backdrop = el('div', {
    class: 'bb-split-sheet-backdrop',
    'aria-hidden': 'true',
    onClick: close,
  });
  return el('div', { class: 'bb-split-req-menu-wrap' }, [backdrop, menu]);
}

/** Read the sticky nav height the stylesheet publishes, so a reveal lands under it. */
function navOffsetPx() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-h');
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 48;
  } catch {
    return 48;
  }
}

/**
 * Size the side-by-side panes to the space left under the posting header, so
 * both lists stay on screen and scroll inside themselves.
 */
export function fitSplitColumns() {
  const view = document.querySelector('.bb-split-view');
  if (!view || typeof window === 'undefined') return;
  let wide = (window.innerWidth || 0) >= 861;
  try {
    if (typeof window.matchMedia === 'function') wide = window.matchMedia('(min-width: 861px)').matches;
  } catch {
    wide = (window.innerWidth || 0) >= 861;
  }
  if (!wide) {
    view.style.height = '';
    return;
  }
  const viewport = window.visualViewport?.height || window.innerHeight || 0;
  if (!viewport || typeof view.getBoundingClientRect !== 'function') return;
  const docTop = view.getBoundingClientRect().top + (window.scrollY || 0);
  const height = Math.max(420, Math.round(viewport - docTop - 12));
  view.style.height = `${height}px`;
}

/** Scroll a list when a drag sits near its top or bottom edge, so the other pane can stay put. */
export function wireSplitListScroll(list) {
  if (!list || list.dataset.splitScrollWired === '1') return;
  list.dataset.splitScrollWired = '1';
  list.addEventListener('dragover', (event) => {
    if (typeof list.getBoundingClientRect !== 'function') return;
    const rect = list.getBoundingClientRect();
    const edge = 48;
    const y = event.clientY;
    if (!Number.isFinite(y) || !rect.height) return;
    if (y < rect.top + edge) list.scrollTop -= 18;
    else if (y > rect.bottom - edge) list.scrollTop += 18;
  });
}

/**
 * After a phone pane switch the other pane may be much shorter than where the
 * user had scrolled, so bring the split view's top back under the nav when it
 * has gone above the viewport. Never scrolls when the top is already visible.
 */
export function revealSplitTop(root) {
  if (typeof window === 'undefined' || !root || typeof root.getBoundingClientRect !== 'function') return;
  const top = root.getBoundingClientRect().top;
  const offset = navOffsetPx() + 8;
  if (top >= offset) return;
  window.scrollTo({ top: Math.max(0, (window.scrollY || 0) + top - offset) });
}

function captureRequirementTops() {
  const tops = new Map();
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return tops;
  document.querySelectorAll('.bb-split-req[data-requirement-id]').forEach((node) => {
    const id = node.getAttribute('data-requirement-id');
    if (!id || typeof node.getBoundingClientRect !== 'function') return;
    tops.set(id, node.getBoundingClientRect().top);
  });
  return tops;
}

/** Slide a requirement card from where it was to where the resorted list put it. */
export function settleSplitRequirements(before) {
  if (!before?.size || typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  let reduce = false;
  try {
    reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    reduce = false;
  }
  if (reduce) return;
  document.querySelectorAll('.bb-split-req[data-requirement-id]').forEach((node) => {
    const id = node.getAttribute('data-requirement-id');
    if (!before.has(id) || typeof node.getBoundingClientRect !== 'function') return;
    const dy = before.get(id) - node.getBoundingClientRect().top;
    if (!Number.isFinite(dy) || Math.abs(dy) < 2) return;
    node.style.transition = 'none';
    node.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      node.style.transition = 'transform 280ms ease';
      node.style.transform = '';
    });
  });
}

/** Run a mapping change, then ease requirements that moved because they gained or lost a bullet. */
function commitMappedChange(run) {
  const before = captureRequirementTops();
  run();
  queueMicrotask(() => settleSplitRequirements(before));
}

function bulletCard(deps, posting, model, bullet, { showJobLabel = true } = {}) {
  const {
    el, btn, store, state, setState, onSave, onRender, setNote,
    renderExperiencePicker, renderBulletDetails, onAddToResume,
  } = deps;
  const entry = bullet.entry;
  const selectedReq = state.selectedRequirementId
    ? model.requirements.find((row) => row.id === state.selectedRequirementId)
    : null;
  const addressesSelected = Boolean(selectedReq && bullet.requirementIds.includes(selectedReq.id));
  const pickerOpen = state.openRequirementPickerEntryId === bullet.entryId && Boolean(bullet.entryId);
  const detailsOpen = state.expandedDetailsEntryId === bullet.entryId && Boolean(bullet.entryId);

  const line = entry
    ? buildMapEntryEditor(deps, entry, {
      className: `bb-split-bullet-line${entry.title === BLANK_BULLET_TITLE ? ' is-blank' : ''}`,
      ariaLabel: entry.title === BLANK_BULLET_TITLE ? 'Blank bullet' : 'Resume bullet',
      focusKey: splitBulletFocusKey(entry.id),
    })
    : el('div', { class: 'bb-split-bullet-line is-legacy' }, bullet.line);
  const draftSources = bullet.draftSources || [];
  const draftBlock = draftSources.length
    ? el('div', { class: 'bb-split-draft-sources' }, [
      el('p', { class: 'bb-split-draft-label' }, 'Drafting from'),
      el('ul', {}, draftSources.map((source) => el('li', {
        'data-entry-id': source.entryId,
      }, source.line))),
      btn('Done drafting', {
        type: 'button',
        class: 'row-text-action bb-split-draft-done',
        onClick: () => {
          onSave(clearDraftSources(store, entry.id));
          onRender({ preserveScroll: true });
          setNote('Draft kept. The bullets you wrote from stay as they were.');
        },
      }),
    ])
    : null;

  const addSelected = entry && selectedReq && !addressesSelected
    ? el('button', {
      type: 'button',
      class: 'bb-split-chip bb-split-chip-add',
      title: `Add ${selectedReq.ordinal}: ${selectedReq.text}`,
      onClick: () => {
        commitMappedChange(() => {
          onSave(linkRequirementToBullet(store, posting.id, selectedReq.id, entry.id));
          onRender({ preserveScroll: true });
          setNote(`${selectedReq.ordinal} added under this bullet.`);
        });
      },
    }, [
      el('span', { class: 'bb-split-chip-ordinal' }, `+ ${selectedReq.ordinal}`),
      el('span', { class: 'bb-split-chip-text' }, selectedReq.short),
    ])
    : null;
  const purposeChips = bullet.requirements.length || addSelected
    ? el('div', { class: 'bb-split-purpose' }, [
      ...bullet.requirements.map((reqRow) => requirementChip(deps, posting, bullet, reqRow)),
      addSelected,
    ])
    : null;
  const addRequirement = entry
    ? el('button', {
      type: 'button',
      class: `row-text-action bb-split-add-req${pickerOpen ? ' is-on' : ''}`,
      'aria-expanded': pickerOpen ? 'true' : 'false',
      'data-focus-key': `split-add-req-${entry.id}`,
      onClick: () => {
        setState({ openRequirementPickerEntryId: pickerOpen ? '' : entry.id });
        onRender({ preserveScroll: true, focusKey: `split-add-req-${entry.id}` });
      },
    }, '+ Requirement')
    : null;

  const meta = el('div', { class: 'bb-split-bullet-meta bb-action-row' }, [
    entry && typeof renderExperiencePicker === 'function' ? renderExperiencePicker(entry) : null,
    showJobLabel && bullet.jobLabel ? el('span', { class: 'tiny bb-split-bullet-job' }, bullet.jobLabel) : null,
    entry && !bullet.onResume
      ? btn('+ Add to resume', {
        type: 'button',
        class: 'row-text-action bb-split-add-resume',
        onClick: () => onAddToResume(entry),
      })
      : null,
    !entry && bullet.legacy
      ? el('span', { class: 'tiny bb-split-bullet-job' }, 'Older line saved only on this requirement')
      : null,
    addRequirement,
    entry || bullet.legacy
      ? (state.deleteBulletPendingId === bullet.key
        ? el('span', { class: 'bb-split-confirm' }, [
          el('span', { class: 'tiny' }, 'Remove from this posting?'),
          btn('Yes', {
            class: 'btn ghost compact-action is-danger',
            onClick: () => {
              commitMappedChange(() => {
                setState({ deleteBulletPendingId: '' });
                if (bullet.legacy) {
                  onSave(deleteBullet(store, posting.id, bullet.legacy.reqId, bullet.legacy.bulletId));
                } else {
                  onSave(removeBulletFromPosting(store, posting.id, bullet.entryId));
                }
                onRender({ preserveScroll: true });
                setNote(bullet.legacy
                  ? 'Removed that older line from this posting.'
                  : 'Removed from this posting. It stays in your bullet bank.');
              });
            },
          }),
          btn('No', {
            class: 'btn ghost compact-action',
            onClick: () => {
              setState({ deleteBulletPendingId: '' });
              onRender({ preserveScroll: true });
            },
          }),
        ])
        : btn('Remove from posting', {
          type: 'button',
          class: 'row-text-action bb-split-remove-posting',
          title: 'Take this bullet off this posting. It stays in your bullet bank.',
          onClick: () => {
            setState({ deleteBulletPendingId: bullet.key });
            onRender({ preserveScroll: true });
          },
        }))
      : null,
    entry && typeof renderBulletDetails === 'function'
      ? el('button', {
        type: 'button',
        class: `row-text-action bb-split-details${detailsOpen ? ' is-on' : ''}`,
        'aria-expanded': detailsOpen ? 'true' : 'false',
        onClick: () => {
          setState({ expandedDetailsEntryId: detailsOpen ? '' : entry.id });
          onRender({ preserveScroll: true });
        },
      }, detailsOpen ? 'STAR ↑' : 'STAR ↓')
      : null,
  ]);

  const handle = el('span', { class: 'bb-split-handle', 'aria-hidden': 'true', title: 'Drag onto a requirement, or onto another bullet to start a blank' }, '⠇');
  const card = el('article', {
    class: [
      'bb-split-bullet',
      addressesSelected ? 'is-addressing' : '',
      !bullet.requirements.length ? 'is-without-requirement' : '',
      bullet.legacy ? 'is-legacy' : '',
      draftSources.length ? 'is-draft' : '',
    ].filter(Boolean).join(' '),
    'data-entry-id': bullet.entryId,
    'data-requirement-ids': bullet.requirementIds.join(' '),
  }, [
    el('div', { class: 'bb-split-bullet-head' }, [
      handle,
      line,
    ]),
    draftBlock,
    purposeChips,
    pickerOpen ? requirementPickerMenu(deps, posting, model, bullet) : null,
    meta,
    detailsOpen ? renderBulletDetails(entry) : null,
  ]);

  if (entry) {
    wireSplitDragSource(card, { handle, type: SPLIT_DRAG_ENTRY_TYPE, id: entry.id });
    wireSplitDropTarget(card, {
      targetKind: 'bullet',
      targetId: entry.id,
      onDrop: (payload, target) => {
        if (payload.kind === 'entry') {
          const result = draftBulletFromBullets(store, posting.id, payload.id, target.id);
          if (!result.entryId) {
            setNote('Drop a bullet onto a different bullet to start a blank.');
            return;
          }
          onSave(result.store);
          onRender({
            preserveScroll: true,
            focusKey: result.created ? splitBulletFocusKey(result.entryId) : undefined,
          });
          setNote(result.created
            ? 'Blank bullet added. Draft it from the bullets you dropped — they stay as they were.'
            : 'Added that bullet to the draft.');
          return;
        }
        const req = model.requirements.find((row) => row.id === payload.id);
        const alreadyHere = bullet.requirementIds.includes(payload.id);
        const staysOnOthers = (req?.bulletCount || 0) > (alreadyHere ? 1 : 0);
        commitMappedChange(() => {
          onSave(applySplitDrop(store, posting.id, payload, target));
          onRender({ preserveScroll: true });
          if (alreadyHere) {
            setNote(req ? `${req.ordinal} is already on this bullet.` : 'Already on this bullet.');
          } else if (staysOnOthers) {
            setNote(req
              ? `${req.ordinal} added under this bullet. It stays on the other bullets too.`
              : 'Requirement added under this bullet. It stays on the other bullets too.');
          } else {
            setNote(req ? `${req.ordinal} added under this bullet.` : 'Requirement added under this bullet.');
          }
        });
      },
    });
  }
  return card;
}

function composeBulletForm(deps, posting, model) {
  const {
    el, btn, store, state, setState, onSave, onRender, setNote, primaryJobId,
  } = deps;
  const jobs = store.jobs || [];
  const initialJobId = resolveComposeJobId({
    composeJobId: state.composeJobId,
    primaryJobId,
    jobs,
  });
  const selectedReq = state.selectedRequirementId
    ? model.requirements.find((row) => row.id === state.selectedRequirementId)
    : null;
  const area = el('textarea', {
    class: 'bb-split-compose-text',
    rows: '2',
    placeholder: 'Write a new resume bullet. **Bold lead:** then the result.',
    'aria-label': 'New resume bullet',
    'data-focus-key': 'split-compose',
  });
  const jobSelect = !primaryJobId && jobs.length
    ? el('select', {
      class: 'bb-split-compose-job',
      'aria-label': 'Job for this bullet',
      onChange: (event) => setState({ composeJobId: event.target.value }),
    }, [
      el('option', { value: '' }, 'Job…'),
      ...jobs.map((job) => el('option', {
        value: job.id,
        selected: job.id === initialJobId || undefined,
      }, [job.company, job.title].filter(Boolean).join(' · ') || 'Untitled role')),
    ])
    : null;
  const submit = () => {
    const title = area.value.trim();
    if (!title) {
      setNote('Write the bullet first.');
      return;
    }
    const jobId = resolveComposeJobId({
      selectValue: jobSelect?.value,
      composeJobId: state.composeJobId,
      primaryJobId,
      jobs,
    });
    if (!jobId) {
      setNote('Pick the job this bullet belongs to first.');
      return;
    }
    const result = addBulletToPosting(store, posting.id, {
      title,
      jobId,
      requirementIds: selectedReq ? [selectedReq.id] : [],
    });
    if (!result.entryId) {
      setNote('Could not save that bullet.');
      return;
    }
    onSave(result.store);
    setState({ composeOpen: false, composeJobId: jobId });
    onRender({ preserveScroll: true, focusKey: splitBulletFocusKey(result.entryId) });
    setNote(selectedReq
      ? `Bullet saved to the bank, placed on this resume, under ${selectedReq.ordinal}.`
      : 'Bullet saved to the bank and placed on this resume.');
  };
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape') {
      setState({ composeOpen: false });
      onRender({ preserveScroll: true });
    }
  });
  return el('div', { class: 'bb-split-compose' }, [
    area,
    el('div', { class: 'bb-split-compose-row' }, [
      jobSelect,
      selectedReq
        ? el('span', { class: 'tiny bb-split-compose-under' }, `Starts under ${selectedReq.ordinal}`)
        : null,
      btn('Save bullet', { class: 'btn compact-action', onClick: submit }),
      btn('Cancel', {
        class: 'btn ghost compact-action',
        onClick: () => {
          setState({ composeOpen: false });
          onRender({ preserveScroll: true });
        },
      }),
    ]),
  ]);
}

function bankSearch(deps, posting) {
  const {
    el, store, state, setState, onSave, onRender, setNote,
  } = deps;
  const q = String(state.bankQuery || '').trim();
  const results = q ? searchBankBulletsForPosting(store, posting, q) : [];
  const input = el('input', {
    type: 'search',
    class: 'search bb-split-bank-search',
    placeholder: 'Bring a bullet from the bank…',
    'aria-label': 'Search the bullet bank',
    value: state.bankQuery || '',
    'data-focus-key': 'split-bank-search',
    onInput: (event) => {
      setState({ bankQuery: event.target.value });
      onRender({ preserveScroll: true, focusKey: 'split-bank-search' });
    },
  });
  return el('div', { class: 'bb-split-bank' }, [
    input,
    q
      ? el('div', { class: 'bb-split-bank-results', role: 'listbox' }, results.length
        ? results.map((row) => el('button', {
          type: 'button',
          class: 'bb-split-bank-option',
          role: 'option',
          'data-entry-id': row.entryId,
          onClick: () => {
            const result = addLibraryBulletToPosting(store, posting.id, row.entryId);
            if (result.reason === 'no-job') {
              setNote('Give that bullet a job on Resume bullets first, then it can go on this resume.');
              return;
            }
            onSave(result.store);
            setState({ bankQuery: '' });
            onRender({ preserveScroll: true, focusKey: splitBulletFocusKey(row.entryId) });
            setNote(result.placed ? 'Bullet added to this resume.' : 'That bullet is already on this resume.');
          },
        }, [
          el('span', { class: 'bb-split-bank-line' }, row.line),
          el('span', { class: 'tiny bb-split-bank-meta' }, [row.experienceTitle, row.jobLabel].filter(Boolean).join(' · ')),
        ]))
        : [el('p', { class: 'tiny empty' }, 'No bank bullet matches. Write it as a new bullet instead.')])
      : null,
  ]);
}

function requirementAddForm(deps, posting) {
  const {
    el, btn, store, setState, onSave, onRender, setNote,
  } = deps;
  const area = el('textarea', {
    class: 'bb-split-compose-text',
    rows: '2',
    placeholder: 'One requirement from the posting.',
    'aria-label': 'New requirement',
    'data-focus-key': 'split-req-add',
  });
  const submit = () => {
    const text = area.value.trim();
    if (!text) return;
    const next = addRequirement(store, posting.id, text);
    const added = next.postings.find((row) => row.id === posting.id)?.requirements.slice(-1)[0];
    onSave(next);
    setState({ requirementAddOpen: false });
    onRender({ preserveScroll: true, focusKey: added ? splitRequirementFocusKey(added.id) : undefined });
    setNote('Requirement added.');
  };
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape') {
      setState({ requirementAddOpen: false });
      onRender({ preserveScroll: true });
    }
  });
  return el('div', { class: 'bb-split-compose' }, [
    area,
    el('div', { class: 'bb-split-compose-row' }, [
      btn('Add requirement', { class: 'btn compact-action', onClick: submit }),
      btn('Cancel', {
        class: 'btn ghost compact-action',
        onClick: () => {
          setState({ requirementAddOpen: false });
          onRender({ preserveScroll: true });
        },
      }),
    ]),
  ]);
}

function columnFoot(el, node) {
  if (!node) return null;
  return el('div', { class: 'bb-split-col-foot' }, [node]);
}

function selectedRequirementBar(deps, model, selectedReq) {
  const { el, btn, setState, onRender, setNote } = deps;
  const remaining = model.bullets.filter((bullet) => bullet.entryId && !bullet.requirementIds.includes(selectedReq.id)).length;
  return el('div', {
    class: 'bb-split-selected-bar',
    role: 'status',
    'data-requirement-id': selectedReq.id,
  }, [
    el('span', { class: 'bb-split-chip-ordinal' }, selectedReq.ordinal),
    el('span', { class: 'bb-split-selected-text' }, [
      el('strong', {}, `Adding ${selectedReq.ordinal}`),
      ` · ${selectedReq.short}`,
      el('span', { class: 'tiny bb-split-selected-sub' }, remaining
        ? ` Tap + ${selectedReq.ordinal} on each bullet it fits.`
        : ' Every bullet here already addresses it.'),
    ]),
    btn('Done', {
      class: 'btn compact-action bb-split-selected-done',
      'data-focus-key': 'split-selected-done',
      onClick: () => {
        setState({ selectedRequirementId: '' });
        onRender({ preserveScroll: true });
        setNote(`${selectedReq.ordinal} done.`);
      },
    }),
  ]);
}

/** Phone-only (CSS ≤720px) Requirements | Bullets switch. Desktop shows both columns. */
function paneTabs(deps, model, pane) {
  const { el, btn, setState, onRender } = deps;
  const tab = (key, label) => btn(label, {
    class: `bb-seg-btn bb-split-pane-tab${pane === key ? ' is-on' : ''}`,
    role: 'tab',
    'aria-selected': pane === key ? 'true' : 'false',
    'data-pane': key,
    onClick: () => {
      if (pane === key) return;
      setState({ pane: key });
      onRender({ preserveScroll: true });
      queueMicrotask(() => revealSplitTop(document.querySelector(`.bb-split-view[data-posting-id="${model.postingId}"]`)));
    },
  });
  const open = model.unaddressedRequirementIds.length;
  return el('div', { class: 'bb-split-pane-tabs', role: 'tablist', 'aria-label': 'Bullets or requirements' }, [
    tab('bullets', `Bullets · ${model.counts.bullets}`),
    tab('requirements', `Requirements · ${model.counts.requirements}${open ? ` (${open} open)` : ''}`),
  ]);
}

export function buildPostingSplitView(deps, posting) {
  const {
    el, btn, store, state, setState, onRender,
  } = deps;
  const model = postingSplitViewModel(store, posting);
  const selectedReq = state.selectedRequirementId
    ? model.requirements.find((row) => row.id === state.selectedRequirementId)
    : null;
  const shownBullets = filterSplitBullets(model.bullets, state.bulletFilter);
  const shownRequirements = splitRequirementDisplayOrder(model.requirements);
  const pane = splitPaneFor(state, model);
  const openRequirements = shownRequirements.filter((row) => row.bulletCount === 0);
  const mappedRequirements = shownRequirements.filter((row) => row.bulletCount > 0);
  const groupLabel = (text) => el('h4', { class: 'bb-split-group-label' }, text);

  const requirementsColumn = el('section', {
    class: 'bb-split-col bb-split-requirements',
    'aria-label': 'Job requirements',
  }, [
    el('header', { class: 'bb-split-col-head' }, [
      el('div', { class: 'bb-split-col-title' }, [
        el('h3', {}, 'Job requirements'),
      ]),
      btn('+ Requirement', {
        class: 'btn ghost compact-action bb-split-add-requirement',
        'aria-expanded': state.requirementAddOpen ? 'true' : 'false',
        onClick: () => {
          const opening = !state.requirementAddOpen;
          setState({ requirementAddOpen: opening });
          onRender({ preserveScroll: true, focusKey: opening ? 'split-req-add' : undefined });
        },
      }),
    ]),
    state.requirementAddOpen ? requirementAddForm(deps, posting) : null,
    el('div', { class: 'bb-split-list bb-split-req-list', ref: wireSplitListScroll }, shownRequirements.length
      ? [
        openRequirements.length && mappedRequirements.length ? groupLabel('Still open') : null,
        ...openRequirements.map((row) => requirementCard(deps, posting, model, row)),
        mappedRequirements.length && openRequirements.length ? groupLabel('Mapped') : null,
        ...mappedRequirements.map((row) => requirementCard(deps, posting, model, row)),
      ]
      : [el('p', { class: 'empty' }, 'Paste the job description below to add requirements.')]),
    columnFoot(el, deps.requirementFooter),
  ]);

  const filterBar = el('div', {
    class: 'bb-split-filter',
    role: 'group',
    'aria-label': 'Bullet filter',
  }, [
    btn(`All · ${model.counts.bullets}`, {
      class: `bb-seg-btn${state.bulletFilter !== 'without-requirement' ? ' is-on' : ''}`,
      'aria-pressed': state.bulletFilter !== 'without-requirement' ? 'true' : 'false',
      onClick: () => {
        setState({ bulletFilter: 'all' });
        onRender({ preserveScroll: true });
      },
    }),
    btn(`No requirement · ${model.counts.bulletsWithoutRequirement}`, {
      class: `bb-seg-btn${state.bulletFilter === 'without-requirement' ? ' is-on' : ''}`,
      'aria-pressed': state.bulletFilter === 'without-requirement' ? 'true' : 'false',
      onClick: () => {
        setState({ bulletFilter: 'without-requirement' });
        onRender({ preserveScroll: true });
      },
    }),
  ]);

  const bulletsColumn = el('section', {
    class: 'bb-split-col bb-split-bullets',
    'aria-label': 'Resume bullets on this posting',
  }, [
    el('header', { class: 'bb-split-col-head' }, [
      el('div', { class: 'bb-split-col-title' }, [
        el('h3', {}, 'Bullets'),
      ]),
      el('div', { class: 'bb-split-head-actions' }, [
        model.bullets.some((row) => row.requirements.length)
          ? btn(state.expandAllChips ? 'Collapse' : 'Expand all', {
            class: 'btn ghost compact-action bb-split-expand-all',
            'aria-pressed': state.expandAllChips ? 'true' : 'false',
            onClick: () => {
              setState({ expandAllChips: !state.expandAllChips, expandedChipKey: '' });
              onRender({ preserveScroll: true });
            },
          })
          : null,
        btn('+ New bullet', {
        class: 'btn compact-action bb-split-new-bullet',
        'aria-expanded': state.composeOpen ? 'true' : 'false',
        onClick: () => {
          const opening = !state.composeOpen;
          setState({ composeOpen: opening });
          onRender({ preserveScroll: true, focusKey: opening ? 'split-compose' : undefined });
        },
      }),
      ]),
    ]),
    selectedReq ? selectedRequirementBar(deps, model, selectedReq) : null,
    state.composeOpen ? composeBulletForm(deps, posting, model) : null,
    el('div', { class: 'bb-split-bullet-tools' }, [
      filterBar,
      bankSearch(deps, posting),
    ]),
    el('div', { class: 'bb-split-list bb-split-bullet-list', ref: wireSplitListScroll }, shownBullets.length
      ? shownBullets.map((bullet, index) => bulletCard(deps, posting, model, bullet, {
        showJobLabel: Boolean(bullet.jobLabel) && bullet.jobId !== shownBullets[index - 1]?.jobId,
      }))
      : [el('p', { class: 'empty' }, state.bulletFilter === 'without-requirement'
        ? 'Every bullet on this resume addresses at least one requirement.'
        : 'No bullets on this posting yet. Paste some, or write one.')]),
    columnFoot(el, deps.bulletFooter),
  ]);

  return el('div', {
    class: [
      'bb-split-view',
      `is-pane-${pane}`,
      selectedReq ? 'has-selected-requirement' : '',
    ].filter(Boolean).join(' '),
    'data-posting-id': posting.id,
    'data-pane': pane,
  }, [paneTabs(deps, model, pane), bulletsColumn, requirementsColumn]);
}

export { postingSplitViewModel };
