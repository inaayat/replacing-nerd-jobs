/**
 * Compact Experiences side panel index. Browser-safe ESM.
 */

import {
  compactExperienceIndex,
} from './experiences-index.js';
import { registerOverlayClose } from './floating-overlay.js';

export const EXP_PANEL_SEARCH_OVERLAY_ID = 'exp-panel-search';

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
    activeLooseEntryId = '',
    dragOverExperienceId = '',
    onPanelQueryChange,
    onSelectExperience,
    onSelectLooseEntry,
    onDragOverExperience,
    onDropOnExperience,
    onStartPanelCreate,
    renderPanelCreateForm,
    panelCreateOpen = false,
    displayExperienceLine,
    renderPanelQueryResults = null,
    onClosePanelSearch,
    looseSection = null,
    renderLooseBulletRow,
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
    placeholder: posting ? 'Search experiences and bullets…' : 'Search experiences and bullets…',
    value: panelQuery,
    'aria-label': 'Search experiences',
    'data-focus-key': 'exp-panel-search',
    'data-bb-overlay-anchor': EXP_PANEL_SEARCH_OVERLAY_ID,
    onInput: (event) => onPanelQueryChange(event.target.value),
  });

  const queryTrimmed = String(panelQuery || '').trim();
  const searchBlock = el('div', { class: 'bb-exp-panel-search-block' }, [search]);
  if (queryTrimmed && renderPanelQueryResults) {
    const overlay = el('div', {
      class: 'bb-float-overlay-panel bb-post-map-results-overlay',
      'data-bb-overlay-panel': EXP_PANEL_SEARCH_OVERLAY_ID,
    }, [
      el('div', { class: 'bb-float-overlay-body' }, [renderPanelQueryResults]),
    ]);
    registerOverlayClose(overlay, () => {
      if (typeof onClosePanelSearch === 'function') onClosePanelSearch();
    });
    searchBlock.append(overlay);
  }

  const scrollChildren = [];

  if (!queryTrimmed) {
    for (const row of rows) {
      const active = activeExperienceId === row.id;
      const dragOver = dragOverExperienceId === row.id;
      scrollChildren.push(el('button', {
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
      ]));
    }

    if (!rows.length) {
      scrollChildren.push(el('p', { class: 'empty tiny' }, 'No experiences yet. Use + New or assign from a bullet.'));
    }

    if (looseSection?.totalCount && renderLooseBulletRow) {
      const { totalCount, groups, open, onToggleOpen } = looseSection;
      const bodyId = 'bb-exp-panel-loose-body';
      const sectionHead = el('button', {
        type: 'button',
        class: `bb-exp-index-row bb-exp-panel-loose-head${open ? ' is-open' : ''}`,
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': bodyId,
        onClick: () => onToggleOpen(),
      }, [
        el('div', { class: 'bb-exp-index-line1' }, [
          el('span', { class: 'bb-exp-index-title' }, 'No experience'),
          el('span', { class: 'bb-exp-index-count' }, String(totalCount)),
        ]),
      ]);

      scrollChildren.push(el('div', { class: 'bb-exp-panel-loose-section' }, [
        sectionHead,
        open
          ? el('div', { class: 'bb-exp-panel-loose-body', id: bodyId }, groups.flatMap((group) => {
            const nodes = [];
            if (!group.isPrimary && group.jobLabel) {
              nodes.push(el('p', { class: 'tiny bb-exp-panel-loose-job' }, group.jobLabel));
            }
            for (const row of group.rows) {
              nodes.push(renderLooseBulletRow(row));
            }
            return nodes;
          }))
          : null,
      ]));
    }
  }

  const scroll = el('div', { class: 'bb-exp-panel-scroll' }, scrollChildren);

  return el('aside', { class: 'bb-exp-side-panel', 'aria-label': 'Experiences' }, [
    head,
    createSlot,
    searchBlock,
    scroll,
  ]);
}
