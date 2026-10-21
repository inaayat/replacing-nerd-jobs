/**
 * Posting requirement mapping UI (browser-safe ESM).
 */

import { registerOverlayClose } from './floating-overlay.js';
import {
  searchPostingMapTargets,
  requirementMappingBuckets,
  mapExperienceBucketToRequirement,
  mapEntryToRequirement,
  setRequirementEntryMapped,
  unmapExperienceBucketFromRequirement,
  unmapEntryFromRequirement,
  displayMapLine,
} from './posting-requirement-mapping.js';

export function requirementBucketKey(postingId, requirementId, experienceId) {
  return `${postingId}:${requirementId}:xp:${experienceId}`;
}

export function postingMapSearchOverlayId(postingId, requirementId) {
  return `post-map-search-${postingId}-${requirementId}`;
}

export function postingMapAddBulletFocusKey(postingId, requirementId, experienceId = '') {
  return experienceId
    ? `${postingId}:${requirementId}:add:${experienceId}`
    : `${postingId}:${requirementId}:add:loose`;
}

export function buildPostingMapSearchResults(deps, targets) {
  const { el, btn, onPickExperience, onPickBullet } = deps;
  const { experiences, bullets } = targets;
  if (!experiences.length && !bullets.length) {
    return el('p', { class: 'tiny bb-post-map-empty' }, 'No matches.');
  }
  const nodes = [];
  if (experiences.length) {
    nodes.push(el('p', { class: 'bb-post-map-group-label' }, 'Experiences'));
    for (const row of experiences) {
      nodes.push(el('button', {
        type: 'button',
        class: 'bb-post-map-choice',
        onClick: () => onPickExperience(row.experienceId),
      }, [
        el('span', { class: 'bb-post-map-choice-title' }, row.title),
        el('span', { class: 'bb-post-map-choice-meta' }, `${row.versionCount} version${row.versionCount === 1 ? '' : 's'} · ${row.jobLabel}`),
      ]));
    }
  }
  if (bullets.length) {
    nodes.push(el('p', { class: 'bb-post-map-group-label' }, 'Bullets'));
    for (const row of bullets) {
      nodes.push(el('button', {
        type: 'button',
        class: 'bb-post-map-choice',
        onClick: () => onPickBullet(row.entryId),
      }, [
        el('span', { class: 'bb-post-map-choice-title' }, row.line),
        el('span', { class: 'bb-post-map-choice-meta' }, row.sublabel),
      ]));
    }
  }
  return el('div', { class: 'bb-post-map-results' }, nodes);
}

function buildMapEntryEditor(deps, entry, { className = 'bb-post-map-bullet-line', ariaLabel = 'Resume bullet', focusKey = '' }) {
  const {
    store, displayExperienceLine, richLine, updateEntry, onSave,
  } = deps;
  if (!entry?.id) return null;
  const shown = displayExperienceLine(entry.title);
  return richLine({
    class: className,
    'aria-label': ariaLabel,
    ...(focusKey ? { 'data-focus-key': focusKey } : {}),
  }, {
    text: shown,
    rich: shown === String(entry.title || '').trim() ? entry.rich : null,
    onChange: (spans) => {
      const text = spans.map((span) => span.text).join('');
      if (!text.trim()) return;
      onSave(updateEntry(store, entry.id, { title: text, rich: spans }));
    },
  });
}

function buildIncludedBulletRow(deps, job, req, { bullet, entry }) {
  const {
    el, store, expandedBulletKey, setExpandedBulletKey, onSave, onRender,
    experienceEditor,
  } = deps;
  const bulletKey = `${job.id}:${req.id}:${bullet.id}`;
  const isOpen = expandedBulletKey === bulletKey;
  const line = buildMapEntryEditor(deps, entry, {
    className: 'bb-post-map-bullet-line',
    ariaLabel: 'Resume bullet',
    focusKey: entry?.id ? `post-map-version-${entry.id}` : '',
  });
  const actions = el('div', { class: 'bb-post-map-bullet-actions bb-action-row' }, [
    el('button', {
      type: 'button',
      class: `row-text-action bb-post-map-details bb-exp-action${isOpen ? ' is-on' : ''}`,
      'aria-expanded': isOpen ? 'true' : 'false',
      onClick: () => {
        setExpandedBulletKey(isOpen ? '' : bulletKey);
        onRender({ preserveScroll: true });
      },
    }, isOpen ? 'Details ↑' : 'Details ↓'),
    el('button', {
      type: 'button',
      class: 'row-text-action bb-post-map-unmap is-danger',
      title: 'Unmap from this requirement',
      'aria-label': 'Unmap from this requirement',
      onClick: () => {
        if (!entry?.id) return;
        onSave(unmapEntryFromRequirement(store, job.id, req.id, entry.id));
        onRender({ preserveScroll: true });
      },
    }, '×'),
  ]);
  const row = el('div', {
    class: 'bb-post-map-bullet',
    'data-entry-id': entry?.id || '',
  }, [
    line,
    actions,
  ]);
  if (isOpen) {
    return el('div', { class: 'bb-post-map-bullet-block' }, [
      row,
      experienceEditor(job, req, bullet),
    ]);
  }
  return row;
}

function buildAddBulletRow(deps, job, req, { experienceId = '' }) {
  const { el, onAddBullet, addBulletFocusKey } = deps;
  const focusKey = postingMapAddBulletFocusKey(job.id, req.id, experienceId);
  return el('button', {
    type: 'button',
    class: 'row-text-action bb-post-map-add-bullet',
    'data-focus-key': focusKey,
    onClick: () => onAddBullet(job, req, { experienceId: experienceId || '' }),
  }, '+ Add bullet');
}

function buildVersionRow(deps, job, req, { entry, selected }) {
  const { el, store, onSave, onRender } = deps;
  const focusKey = `post-map-version-${entry.id}`;
  const editor = buildMapEntryEditor(deps, entry, {
    className: 'bb-post-map-version-line bb-post-map-version-edit',
    ariaLabel: 'Resume bullet version',
    focusKey,
  });
  const pencil = el('button', {
    type: 'button',
    class: 'row-text-action bb-post-map-version-pencil',
    title: 'Edit version text',
    'aria-label': 'Edit version text',
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      const field = event.currentTarget.parentElement?.querySelector('.bb-post-map-version-edit');
      field?.focus?.();
    },
  }, '✎');
  return el('div', { class: 'bb-post-map-version' }, [
    el('label', { class: 'bb-post-map-version-check' }, [
      el('input', {
        type: 'checkbox',
        checked: selected,
        onChange: (event) => {
          onSave(setRequirementEntryMapped(
            store,
            job.id,
            req.id,
            entry.id,
            event.target.checked,
          ));
          onRender({ preserveScroll: true });
        },
      }),
    ]),
    el('div', { class: 'bb-post-map-version-body' }, [editor, pencil]),
  ]);
}

function buildExperienceBucket(deps, job, req, bucket, { expanded }) {
  const {
    el, btn, store, onSave, onRender, isBucketExpanded, toggleBucketExpanded,
  } = deps;
  const { experienceId, title, totalVersions, selectedCount, versions, lines } = bucket;
  const bKey = requirementBucketKey(job.id, req.id, experienceId);
  const open = expanded ?? isBucketExpanded(bKey);

  const selectedLines = lines.filter((row) => row.entry?.id);
  const headerMeta = `${selectedCount} of ${totalVersions}`;

  const headToggle = el('button', {
    type: 'button',
    class: `bb-post-map-bucket-head${selectedCount ? ' has-selected' : ''}`,
    'aria-expanded': open ? 'true' : 'false',
    onClick: (event) => {
      event.preventDefault();
      toggleBucketExpanded(bKey);
      onRender({ preserveScroll: true });
    },
  }, [
    el('span', { class: 'bb-chevron bb-post-map-bucket-chevron', 'aria-hidden': 'true' }),
    el('span', { class: 'bb-post-map-bucket-title' }, title),
    el('span', { class: 'bb-post-map-bucket-meta' }, headerMeta),
  ]);
  const header = el('div', { class: 'bb-post-map-bucket-head-row' }, [
    headToggle,
    selectedCount || req.coveredExperienceIds?.includes(experienceId)
      ? btn('×', {
        type: 'button',
        class: 'bb-post-map-bucket-clear icon-quiet is-danger',
        title: 'Unmap entire experience from this requirement',
        'aria-label': 'Unmap entire experience',
        onClick: () => {
          onSave(unmapExperienceBucketFromRequirement(store, job.id, req.id, experienceId));
          onRender({ preserveScroll: true });
        },
      })
      : null,
  ]);

  const children = [header];

  if (!open) {
    if (selectedCount) {
      children.push(el('div', { class: 'bb-post-map-bucket-included' },
        selectedLines.map((row) => buildIncludedBulletRow(deps, job, req, row))));
    }
    return el('div', {
      class: 'bb-post-map-bucket is-collapsed',
      'data-experience-id': experienceId,
      'data-selected-count': String(selectedCount),
    }, children);
  }

  children.push(el('div', { class: 'bb-post-map-bucket-versions' }, [
    ...versions.map((row) => buildVersionRow(deps, job, req, row)),
    buildAddBulletRow(deps, job, req, { experienceId }),
  ]));
  return el('div', {
    class: 'bb-post-map-bucket is-expanded',
    'data-experience-id': experienceId,
    'data-selected-count': String(selectedCount),
  }, children);
}

export function buildRequirementMappingStack(deps, job, req) {
  const {
    el,
    store,
    searchValue,
    onSearchChange,
    focusKey,
    onPickExperience,
    onPickBullet,
    expandedBulletKey,
  } = deps;

  const stack = el('div', { class: 'bb-post-map-stack' });
  const liveReq = (store.postings || []).find((p) => p.id === job.id)?.requirements
    ?.find((row) => row.id === req.id) || req;
  const { experienceBuckets, otherBullets } = requirementMappingBuckets(store, liveReq);

  for (const bucket of experienceBuckets) {
    stack.append(buildExperienceBucket(deps, job, liveReq, bucket, {}));
  }

  stack.append(el('div', { class: 'bb-post-map-loose-group' }, [
    el('p', { class: 'bb-post-map-loose-label' }, 'No experience'),
    el('div', { class: 'bb-post-map-loose-bullets' }, [
      ...otherBullets.map((row) => buildIncludedBulletRow(deps, job, liveReq, row)),
      buildAddBulletRow(deps, job, liveReq, { experienceId: '' }),
    ]),
  ]));

  const overlayId = postingMapSearchOverlayId(job.id, req.id);
  const searchInput = el('input', {
    type: 'search',
    class: 'search bb-post-map-search',
    placeholder: 'Search experiences and bullets…',
    value: searchValue,
    'aria-label': 'Search experiences and bullets',
    'data-focus-key': focusKey,
    'data-bb-overlay-anchor': overlayId,
    onInput: (event) => onSearchChange(event.target.value),
  });

  const searchWrap = el('div', { class: 'bb-post-map-search-wrap' }, [searchInput]);

  const q = String(searchValue || '').trim();
  if (q) {
    const targets = searchPostingMapTargets(store, q);
    const resultsInner = buildPostingMapSearchResults(deps, targets);
    const results = el('div', {
      class: 'bb-float-overlay-panel bb-post-map-results-overlay',
      'data-bb-overlay-panel': overlayId,
    }, [
      el('div', { class: 'bb-float-overlay-body' }, [resultsInner]),
    ]);
    registerOverlayClose(results, () => onSearchChange(''));
    searchWrap.append(results);
  }

  stack.append(searchWrap);
  return stack;
}

export {
  mapExperienceBucketToRequirement,
  mapEntryToRequirement,
  searchPostingMapTargets,
  requirementMappingBuckets,
};
