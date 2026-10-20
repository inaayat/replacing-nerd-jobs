/**
 * Posting requirement mapping UI (browser-safe ESM).
 */

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

function buildIncludedBulletRow(deps, job, req, { bullet, entry }) {
  const {
    el, btn, store, linkedBulletLine, displayExperienceLine, richLine,
    updateBullet, expandedBulletKey, setExpandedBulletKey, onSave, onRender,
    experienceEditor,
  } = deps;
  const bulletKey = `${job.id}:${req.id}:${bullet.id}`;
  const isOpen = expandedBulletKey === bulletKey;
  const linked = linkedBulletLine(store, bullet);
  const shown = displayExperienceLine(linked.text);
  const line = richLine({
    class: 'bb-post-map-bullet-line',
    'aria-label': 'Resume bullet',
  }, {
    text: shown,
    rich: shown === String(linked.text || '').trim() ? linked.rich : null,
    onChange: (spans) => {
      const text = spans.map((span) => span.text).join('');
      if (!text.trim()) return;
      onSave(updateBullet(store, job.id, req.id, bullet.id, { text, rich: spans }));
    },
  });
  const row = el('div', {
    class: 'bb-post-map-bullet',
    'data-entry-id': entry?.id || '',
  }, [
    line,
    btn('×', {
      type: 'button',
      class: 'bb-post-map-unmap icon-quiet is-danger',
      title: 'Unmap from this requirement',
      'aria-label': 'Unmap from this requirement',
      onClick: () => {
        if (!entry?.id) return;
        onSave(unmapEntryFromRequirement(store, job.id, req.id, entry.id));
        onRender({ preserveScroll: true });
      },
    }),
    btn(isOpen ? 'Details ↑' : 'Details', {
      type: 'button',
      class: 'bb-post-map-details btn ghost compact-action',
      onClick: () => {
        setExpandedBulletKey(isOpen ? '' : bulletKey);
        onRender({ preserveScroll: true });
      },
    }),
  ]);
  if (isOpen) {
    return el('div', { class: 'bb-post-map-bullet-block' }, [
      row,
      experienceEditor(job, req, bullet),
    ]);
  }
  return row;
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
    el('span', { class: 'bb-post-map-bucket-chevron', 'aria-hidden': 'true' }),
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

  children.push(el('div', { class: 'bb-post-map-bucket-versions' },
    versions.map(({ entry, selected }) => {
      const label = displayMapLine(entry.title);
      return el('label', { class: 'bb-post-map-version' }, [
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
        el('span', { class: 'bb-post-map-version-line' }, label),
      ]);
    })));
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

  if (otherBullets.length) {
    stack.append(el('div', { class: 'bb-post-map-loose-group' }, [
      el('p', { class: 'bb-post-map-loose-label' }, 'No experience'),
      el('div', { class: 'bb-post-map-loose-bullets' },
        otherBullets.map((row) => buildIncludedBulletRow(deps, job, liveReq, row))),
    ]));
  }

  const searchWrap = el('div', { class: 'bb-post-map-search-wrap' }, [
    el('input', {
      type: 'search',
      class: 'search bb-post-map-search',
      placeholder: 'Search experiences and bullets…',
      value: searchValue,
      'aria-label': 'Search experiences and bullets',
      'data-focus-key': focusKey,
      onInput: (event) => onSearchChange(event.target.value),
    }),
  ]);

  const q = String(searchValue || '').trim();
  if (q) {
    const targets = searchPostingMapTargets(store, q);
    searchWrap.append(buildPostingMapSearchResults(deps, targets));
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
