/**
 * Posting workspace "By experience" view (browser-safe ESM).
 */

import { experienceVersions } from './engine.js';
import { entryOnPostingResume } from './experiences-index.js';
import {
  postingExperienceViewGroups,
  requirementShortLabel,
  requirementOrdinalsForPosting,
  entryMappedOnRequirement,
  setEntryMappedAcrossRequirements,
} from './posting-requirement-mapping.js';
import {
  buildMapEntryEditor,
  buildAddBulletRow,
  buildIncludedBulletRow,
} from './posting-requirement-mapping-ui.js';

function buildAggregateVersionRow(deps, job, group, entry) {
  const { el, store, onSave, onRender } = deps;
  const selected = group.requirements.some(({ req }) => entryMappedOnRequirement(req, entry.id));
  const onResume = entryOnPostingResume(store, job, entry.id);
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
      event.currentTarget.parentElement?.querySelector('.bb-post-map-version-edit')?.focus?.();
    },
  }, '✎');
  return el('div', { class: 'bb-post-map-version' }, [
    el('label', { class: 'bb-post-map-version-check' }, [
      el('input', {
        type: 'checkbox',
        checked: selected,
        onChange: (event) => {
          const reqs = group.requirements.map((row) => row.req);
          onSave(setEntryMappedAcrossRequirements(
            store,
            job.id,
            reqs,
            entry.id,
            event.target.checked,
          ));
          onRender({ preserveScroll: true });
        },
      }),
    ]),
    el('div', { class: 'bb-post-map-version-body' }, [
      editor,
      onResume
        ? el('span', { class: 'bb-post-xp-on-resume' }, 'On resume')
        : null,
      pencil,
    ]),
  ]);
}

function buildExperienceCard(deps, job, group, { onJumpToRequirement }) {
  const { el, store, onRender, onSave } = deps;
  const primaryReq = group.requirements[0]?.req;
  const reqList = el('ul', { class: 'bb-post-xp-req-list' }, group.requirements.map(({ req, ordinal, text }) => (
    el('li', {}, [
      el('button', {
        type: 'button',
        class: 'bb-post-xp-req-link',
        title: text,
        'aria-label': `${ordinal}: ${text}`,
        onClick: () => onJumpToRequirement(req.id),
      }, [
        el('span', { class: 'bb-post-xp-req-ordinal' }, ordinal),
        el('span', { class: 'bb-post-xp-req-text' }, requirementShortLabel(text)),
      ]),
    ])
  )));

  const versions = experienceVersions(store, group.experienceId);
  const versionBlock = el('div', { class: 'bb-post-map-bucket-versions' }, [
    ...versions.map((entry) => buildAggregateVersionRow(deps, job, group, entry)),
    primaryReq
      ? buildAddBulletRow(deps, job, primaryReq, { experienceId: group.experienceId })
      : null,
  ].filter(Boolean));

  return el('article', {
    class: 'bb-post-xp-card',
    'data-experience-id': group.experienceId,
  }, [
    el('header', { class: 'bb-post-xp-card-head' }, [
      el('h3', { class: 'bb-post-xp-card-title' }, group.title),
      el('p', { class: 'bb-post-xp-card-meta' }, `Covers ${group.coversCount} requirement${group.coversCount === 1 ? '' : 's'}`),
    ]),
    reqList,
    versionBlock,
  ]);
}

function buildLooseCard(deps, job, looseRows, { onJumpToRequirement }) {
  const { el } = deps;
  const ordinals = requirementOrdinalsForPosting(job);
  const byReq = new Map();
  for (const row of looseRows) {
    if (!byReq.has(row.req.id)) byReq.set(row.req.id, []);
    byReq.get(row.req.id).push(row);
  }
  const sections = [...byReq.entries()].map(([reqId, rows]) => {
    const req = rows[0].req;
    const ordinal = ordinals.get(reqId)?.ordinal || '';
    const head = el('button', {
      type: 'button',
      class: 'bb-post-xp-req-link bb-post-xp-loose-req',
      onClick: () => onJumpToRequirement(reqId),
    }, [
      ordinal ? el('span', { class: 'bb-post-xp-req-ordinal' }, ordinal) : null,
      el('span', { class: 'bb-post-xp-req-text' }, requirementShortLabel(req.text)),
    ].filter(Boolean));
    return el('div', { class: 'bb-post-xp-loose-section' }, [
      head,
      ...rows.map((row) => buildIncludedBulletRow(deps, job, req, row)),
    ]);
  });
  return el('article', { class: 'bb-post-xp-card bb-post-xp-card-loose' }, [
    el('header', { class: 'bb-post-xp-card-head' }, [
      el('h3', { class: 'bb-post-xp-card-title' }, 'No experience'),
    ]),
    el('div', { class: 'bb-post-xp-loose-body' }, sections),
  ]);
}

export function buildPostingExperienceView(deps, job) {
  const { el, onJumpToRequirement } = deps;
  const { experienceGroups, looseRows } = postingExperienceViewGroups(deps.store, job);
  if (!experienceGroups.length && !looseRows.length) {
    return el('p', { class: 'empty bb-post-xp-empty' }, 'Map experiences or bullets to requirements to see them here.');
  }
  const cards = [
    ...experienceGroups.map((group) => buildExperienceCard(deps, job, group, { onJumpToRequirement })),
    looseRows.length ? buildLooseCard(deps, job, looseRows, { onJumpToRequirement }) : null,
  ].filter(Boolean);
  return el('div', { class: 'bb-post-xp-view' }, cards);
}

export { postingExperienceViewGroups, requirementShortLabel };
