/**
 * Posting split view UI (browser-safe ESM).
 *
 * Left: the resume bullets on this posting, each wearing the requirements it
 * addresses. Right: this posting's job requirements. Drag a requirement
 * onto a bullet (or a bullet onto a requirement) to put it under that bullet;
 * the "+ Requirement" picker and a selected requirement's "+ R1" buttons are
 * the keyboard and touch path to the same link.
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
  addBulletToPosting,
  addLibraryBulletToPosting,
  applySplitDrop,
  filterSplitBullets,
  linkRequirementToBullet,
  postingSplitViewModel,
  readSplitDragPayload,
  requirementsAvailableForBullet,
  searchBankBulletsForPosting,
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
    expandedDetailsEntryId: '',
    questionsOpenReqId: '',
    expandedChipKey: '',
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
    'aria-label': `Requirement ${row.ordinal}`,
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

  const coverage = el('span', {
    class: `bb-split-req-count${unaddressed ? ' is-unaddressed' : ''}`,
  }, unaddressed
    ? 'No bullet yet'
    : `${row.bulletCount} bullet${row.bulletCount === 1 ? '' : 's'}`);

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
    ].filter(Boolean).join(' '),
    'data-requirement-id': row.id,
    'data-bullet-count': String(row.bulletCount),
  }, [
    el('div', { class: 'bb-split-req-head' }, [
      handle,
      el('span', { class: 'bb-split-ordinal' }, row.ordinal),
      textArea,
    ]),
    actions,
    questionsOpen && typeof renderRequirementQuestions === 'function'
      ? renderRequirementQuestions(row.req)
      : null,
  ]);

  wireSplitDragSource(card, { handle, type: SPLIT_DRAG_REQUIREMENT_TYPE, id: row.id });
  wireSplitDropTarget(card, {
    targetKind: 'requirement',
    targetId: row.id,
    onDrop: (payload, target) => {
      onSave(applySplitDrop(store, posting.id, payload, target));
      onRender({ preserveScroll: true });
      setNote(`Bullet now addresses ${row.ordinal}.`);
    },
  });
  return card;
}

function requirementChip(deps, posting, bullet, reqRow) {
  const {
    el, store, state, setState, onSave, onRender, setNote,
  } = deps;
  const chipKey = `${bullet.key}:${reqRow.id}`;
  const expanded = state.expandedChipKey === chipKey;
  return el('span', {
    class: `bb-split-chip${expanded ? ' is-expanded' : ''}`,
    'data-requirement-id': reqRow.id,
    title: reqRow.text,
  }, [
    // Tap the chip to read the whole requirement: there is no hover title on touch.
    el('button', {
      type: 'button',
      class: 'bb-split-chip-body',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-label': `${reqRow.ordinal}: ${reqRow.text}`,
      onClick: () => {
        setState({ expandedChipKey: expanded ? '' : chipKey });
        onRender({ preserveScroll: true });
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
        if (bullet.legacy) {
          onSave(deleteBullet(store, posting.id, bullet.legacy.reqId, bullet.legacy.bulletId));
        } else {
          onSave(unlinkRequirementFromBullet(store, posting.id, reqRow.id, bullet.entryId));
        }
        onRender({ preserveScroll: true });
        setNote(`${reqRow.ordinal} removed from this bullet. The bullet stays in the bank and on the resume.`);
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
          onSave(linkRequirementToBullet(store, posting.id, req.id, bullet.entryId));
          setState({ openRequirementPickerEntryId: '' });
          onRender({ preserveScroll: true, focusKey: `split-add-req-${bullet.entryId}` });
          setNote(`${req.ordinal} added under this bullet.`);
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

function bulletCard(deps, posting, model, bullet) {
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
      className: 'bb-split-bullet-line',
      ariaLabel: 'Resume bullet',
      focusKey: splitBulletFocusKey(entry.id),
    })
    : el('div', { class: 'bb-split-bullet-line is-legacy' }, bullet.line);

  const purposeChips = el('div', { class: 'bb-split-purpose' }, [
    ...bullet.requirements.map((reqRow) => requirementChip(deps, posting, bullet, reqRow)),
    !bullet.requirements.length
      ? el('span', { class: 'bb-split-purpose-empty' }, 'No requirement yet')
      : null,
    entry && selectedReq && !addressesSelected
      ? el('button', {
        type: 'button',
        class: 'bb-split-chip bb-split-chip-add',
        title: `Add ${selectedReq.ordinal}: ${selectedReq.text}`,
        onClick: () => {
          onSave(linkRequirementToBullet(store, posting.id, selectedReq.id, entry.id));
          onRender({ preserveScroll: true });
          setNote(`${selectedReq.ordinal} added under this bullet.`);
        },
      }, [
        el('span', { class: 'bb-split-chip-ordinal' }, `+ ${selectedReq.ordinal}`),
        el('span', { class: 'bb-split-chip-text' }, selectedReq.short),
      ])
      : null,
    entry
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
      : null,
  ]);

  const meta = el('div', { class: 'bb-split-bullet-meta bb-action-row' }, [
    entry && typeof renderExperiencePicker === 'function' ? renderExperiencePicker(entry) : null,
    bullet.jobLabel ? el('span', { class: 'tiny bb-split-bullet-job' }, bullet.jobLabel) : null,
    entry
      ? (bullet.onResume
        ? el('span', { class: 'tiny bb-split-on-resume' }, 'On resume ✓')
        : btn('+ Add to resume', {
          type: 'button',
          class: 'row-text-action bb-split-add-resume',
          onClick: () => onAddToResume(entry),
        }))
      : el('span', { class: 'tiny bb-split-bullet-job' }, 'Older line saved only on this requirement'),
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

  const handle = el('span', { class: 'bb-split-handle', 'aria-hidden': 'true', title: 'Drag onto a requirement' }, '⠇');
  const card = el('article', {
    class: [
      'bb-split-bullet',
      addressesSelected ? 'is-addressing' : '',
      !bullet.requirements.length ? 'is-without-requirement' : '',
      bullet.legacy ? 'is-legacy' : '',
    ].filter(Boolean).join(' '),
    'data-entry-id': bullet.entryId,
    'data-requirement-ids': bullet.requirementIds.join(' '),
  }, [
    el('div', { class: 'bb-split-bullet-head' }, [
      handle,
      line,
    ]),
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
        const req = model.requirements.find((row) => row.id === payload.id);
        onSave(applySplitDrop(store, posting.id, payload, target));
        onRender({ preserveScroll: true });
        setNote(req ? `${req.ordinal} added under this bullet.` : 'Requirement added under this bullet.');
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
  const jobId = state.composeJobId || primaryJobId || (jobs.length === 1 ? jobs[0].id : '');
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
  const submit = () => {
    const title = area.value.trim();
    if (!title) return;
    if (!jobId) {
      setNote('Pick the job this bullet belongs to first.');
      return;
    }
    const result = addBulletToPosting(store, posting.id, {
      title,
      jobId,
      requirementIds: selectedReq ? [selectedReq.id] : [],
    });
    if (!result.entryId) return;
    onSave(result.store);
    setState({ composeOpen: false });
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
      !primaryJobId && jobs.length
        ? el('select', {
          class: 'bb-split-compose-job',
          'aria-label': 'Job for this bullet',
          onChange: (event) => {
            setState({ composeJobId: event.target.value });
          },
        }, [
          el('option', { value: '' }, 'Job…'),
          ...jobs.map((job) => el('option', {
            value: job.id,
            selected: job.id === jobId || undefined,
          }, [job.company, job.title].filter(Boolean).join(' · ') || 'Untitled role')),
        ])
        : null,
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
  const pane = splitPaneFor(state, model);

  const requirementsColumn = el('section', {
    class: 'bb-split-col bb-split-requirements',
    'aria-label': 'Job requirements',
  }, [
    el('header', { class: 'bb-split-col-head' }, [
      el('div', { class: 'bb-split-col-title' }, [
        el('h3', {}, 'Job requirements'),
        el('p', { class: 'tiny' }, model.counts.requirements
          ? `${model.counts.addressedRequirements} of ${model.counts.requirements} have a bullet`
          : 'No requirements yet'),
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
    selectedReq
      ? el('p', { class: 'tiny bb-split-hint' }, `Adding ${selectedReq.ordinal} — tap + ${selectedReq.ordinal} on each bullet it fits, then Done.`)
      : el('p', { class: 'tiny bb-split-hint' }, [
        el('span', { class: 'bb-split-hint-pointer' }, 'Drag a requirement onto a bullet to show what that bullet is for, or tap Add to bullets….'),
        el('span', { class: 'bb-split-hint-touch' }, 'Tap Add to bullets… on a requirement, then tap + on each bullet it fits.'),
      ]),
    el('div', { class: 'bb-split-list bb-split-req-list' }, model.requirements.length
      ? model.requirements.map((row) => requirementCard(deps, posting, model, row))
      : [el('p', { class: 'empty' }, 'Paste the job description below to add requirements.')]),
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
        el('h3', {}, 'Resume bullets'),
        el('p', { class: 'tiny' }, 'Every bullet here is in your bank and on this resume. Edits update the shared record.'),
      ]),
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
    selectedReq ? selectedRequirementBar(deps, model, selectedReq) : null,
    state.composeOpen ? composeBulletForm(deps, posting, model) : null,
    bankSearch(deps, posting),
    filterBar,
    el('div', { class: 'bb-split-list bb-split-bullet-list' }, shownBullets.length
      ? shownBullets.map((bullet) => bulletCard(deps, posting, model, bullet))
      : [el('p', { class: 'empty' }, state.bulletFilter === 'without-requirement'
        ? 'Every bullet on this resume addresses at least one requirement.'
        : 'No bullets on this resume yet. Write one, or bring one from the bank.')]),
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
