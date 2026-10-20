/**
 * Experiences side panel (catalog + posting). Browser-safe ESM.
 */

import {
  libraryCatalogGroups,
  experienceVersions,
  experienceForEntry,
  createExperience,
  draftExperienceVersion,
  postingsUsingEntry,
  experienceRequirementCoverageCount,
} from './engine.js';
import {
  readPanelFilter,
  writePanelFilter,
  librarySectionKey,
} from './experiences-ui.js';

function entryOnPostingResume(store, posting, entryId) {
  if (!posting?.id || !entryId) return false;
  const doc = posting.resume;
  const jobs = [
    ...(store.jobs || []),
    ...((doc?.localJobs) || []),
  ];
  for (const job of jobs) {
    for (const group of job.groups || []) {
      for (const bullet of group.bullets || []) {
        if ((bullet.sourceEntryIds || []).includes(entryId)) return true;
      }
    }
  }
  return false;
}

function requirementOrdinalsForEntry(store, posting, entryId) {
  if (!posting?.requirements?.length || !entryId) return [];
  const ordinals = [];
  posting.requirements.forEach((req, index) => {
    const linked = (req.bullets || []).some((line) => line.entryId === entryId)
      || (req.entryIds || []).includes(entryId);
    if (linked) ordinals.push(`R${index + 1}`);
  });
  return ordinals;
}

function entryMappedOnPosting(store, posting, entryId) {
  return requirementOrdinalsForEntry(store, posting, entryId).length > 0;
}

/**
 * @param {object} deps
 * @param {typeof import('./app.js').el} deps.el
 * @param {Function} deps.btn
 * @param {object} deps.store
 * @param {object|null} deps.posting
 * @param {'catalog'|'posting'} deps.page
 * @param {Set<string>} deps.collapsedPanelJobs
 * @param {Set<string>} deps.collapsedPanelExperiences
 * @param {Set<string>} deps.collapsedLooseSummary
 * @param {Set<string>} deps.selectedEntryIds
 * @param {string} deps.mapTargetEntryId
 * @param {Function} deps.onRender
 * @param {Function} deps.onSave
 * @param {Function} deps.setNote
 * @param {Function} deps.setStore
 * @param {Function} deps.displayExperienceLine
 */
export function buildExperiencesPanel(deps) {
  const {
    el,
    btn,
    store,
    posting,
    page,
    collapsedPanelJobs,
    collapsedPanelExperiences,
    collapsedLooseSummary,
    selectedEntryIds,
    mapTargetEntryId,
    panelQuery = '',
    onRender,
    onSave,
    setNote,
    setStore,
    displayExperienceLine,
  } = deps;

  const filter = readPanelFilter(page === 'posting' ? 'all' : 'all');
  let jobFilter = deps.panelJobFilter || '';

  const filterChip = (id, label) => {
    const on = filter === id;
    return btn(label, {
      type: 'button',
      class: `bb-exp-filter${on ? ' is-on' : ''}`,
      'aria-pressed': on ? 'true' : 'false',
      onClick: () => {
        writePanelFilter(id);
        onRender();
      },
    });
  };

  const catalogFilters = [
    filterChip('all', 'All'),
    filterChip('experiences', 'Experiences'),
    filterChip('loose', 'Loose'),
    filterChip('not-on-resume', 'Not on a resume'),
  ];
  const postingFilters = [
    filterChip('all', 'All'),
    filterChip('not-mapped', 'Not mapped'),
    filterChip('on-resume', 'On resume'),
    filterChip('mapped-here', 'Mapped here'),
  ];

  const groups = libraryCatalogGroups(store, { query: panelQuery });

  const passesFilter = (entry) => {
    const onResume = posting ? entryOnPostingResume(store, posting, entry.id) : false;
    const mapped = posting ? entryMappedOnPosting(store, posting, entry.id) : false;
    const xp = experienceForEntry(store, entry.id);
    const loose = !xp;
    if (filter === 'all') return true;
    if (page === 'catalog') {
      if (filter === 'experiences') return Boolean(xp);
      if (filter === 'loose') return loose;
      if (filter === 'not-on-resume') {
        const used = postingsUsingEntry(store, entry.id);
        return !used.length && !onResume;
      }
    } else {
      if (filter === 'not-mapped') return !mapped;
      if (filter === 'on-resume') return onResume;
      if (filter === 'mapped-here') return mapped;
    }
    return true;
  };

  const mapBtn = (entryId, { mapped = false } = {}) => {
    if (!posting) return null;
    if (mapped) {
      return el('span', { class: 'bb-exp-panel-mapped' }, 'Mapped ✓');
    }
    return btn('+ Map', {
      type: 'button',
      class: 'btn ghost compact-action bb-exp-map-btn',
      onClick: () => {
        deps.onSetMapTarget(entryId);
        setNote('Choose a requirement — use Map here on a row, or tap + Map on a requirement.');
        onRender();
      },
    });
  };

  const versionRow = (entry) => {
    const mapped = posting ? entryMappedOnPosting(store, posting, entry.id) : false;
    if (!passesFilter(entry)) return null;
    const ordinals = posting ? requirementOrdinalsForEntry(store, posting, entry.id) : [];
    const onResume = posting ? entryOnPostingResume(store, posting, entry.id) : false;
    const selected = selectedEntryIds.has(entry.id);
    const isTarget = mapTargetEntryId === entry.id;
    const facts = [
      ordinals.length ? ordinals.join(' · ') : '',
      onResume ? 'On resume ✓' : '',
    ].filter(Boolean).join(' · ');
    return el('div', {
      class: `bb-exp-panel-version${selected ? ' is-selected' : ''}${isTarget ? ' is-target' : ''}`,
      'data-entry-id': entry.id,
    }, [
      el('label', { class: 'bb-exp-panel-check' }, [
        el('input', {
          type: 'checkbox',
          checked: selected,
          'aria-label': 'Select bullet',
          onChange: (event) => {
            if (event.target.checked) selectedEntryIds.add(entry.id);
            else selectedEntryIds.delete(entry.id);
            onRender();
          },
        }),
        el('span', { class: 'bb-exp-panel-version-text' }, displayExperienceLine(entry.title)),
      ]),
      el('div', { class: 'bb-exp-panel-version-actions' }, [
        mapBtn(entry.id, { mapped }),
        posting && !onResume
          ? btn('+ Add to resume', {
            type: 'button',
            class: 'btn ghost compact-action',
            onClick: () => deps.onAddEntriesToResume([entry.id]),
          })
          : onResume
            ? el('span', { class: 'bb-exp-panel-mapped' }, 'On resume ✓')
            : null,
      ]),
      facts ? el('p', { class: 'tiny bb-exp-panel-facts' }, facts) : null,
    ]);
  };

  const experienceBlock = (jobKey, section) => {
    const expKey = librarySectionKey(jobKey, section);
    const expanded = !collapsedPanelExperiences.has(expKey);
    const versions = section.rows
      .map((row) => store.entries.find((item) => item.id === row.id))
      .filter(Boolean);
    const visibleVersions = versions.filter((entry) => passesFilter(entry));
    if (!visibleVersions.length && panelQuery) return null;
    const covers = posting && section.experienceId
      ? experienceRequirementCoverageCount(store, posting, section.experienceId)
      : 0;
    const onResume = posting && section.experienceId
      ? experienceVersions(store, section.experienceId).some((entry) => entryOnPostingResume(store, posting, entry.id))
      : false;
    return el('div', { class: 'bb-exp-panel-xp', 'data-xp-id': section.experienceId }, [
      el('button', {
        type: 'button',
        class: 'bb-exp-panel-xp-head',
        'aria-expanded': expanded ? 'true' : 'false',
        onClick: () => {
          if (expanded) collapsedPanelExperiences.add(expKey);
          else collapsedPanelExperiences.delete(expKey);
          onRender();
        },
      }, [
        el('span', { class: 'bb-exp-panel-chevron', 'aria-hidden': 'true' }, expanded ? '▾' : '▸'),
        el('span', { class: 'bb-exp-panel-xp-title' }, section.label),
        el('span', { class: 'bb-exp-panel-xp-meta' }, [
          `${section.versionCount}`,
          covers ? ` · covers ${covers}` : '',
          onResume ? ' · ✓' : '',
        ].join('')),
      ]),
      expanded
        ? el('div', { class: 'bb-exp-panel-xp-body' }, [
          ...visibleVersions.map((entry) => versionRow(entry)),
          btn('+ Draft version', {
            type: 'button',
            class: 'btn ghost compact-action',
            onClick: () => {
              const drafted = draftExperienceVersion(store, section.experienceId, {
                copyFromEntryId: visibleVersions[0]?.id,
              });
              setStore(drafted.store);
              onSave();
              setNote('Added a draft version.');
              onRender({ focusEntryId: drafted.changedEntryIds?.[0] });
            },
          }),
        ])
        : null,
    ]);
  };

  const looseBlock = (jobKey, section) => {
    if (!section.rows.length) return null;
    const summaryKey = `${jobKey}:loose-summary`;
    const hasExperiences = jobKey !== '__none__';
    const collapsedSummary = hasExperiences && !panelQuery && collapsedLooseSummary.has(summaryKey);
    const entries = section.rows
      .map((row) => store.entries.find((item) => item.id === row.id))
      .filter(Boolean)
      .filter((entry) => passesFilter(entry));
    if (!entries.length) return null;

    if (collapsedSummary) {
      return el('button', {
        type: 'button',
        class: 'bb-exp-panel-loose-summary',
        onClick: () => {
          collapsedLooseSummary.delete(summaryKey);
          onRender();
        },
      }, `${entries.length} loose bullet${entries.length === 1 ? '' : 's'}`);
    }

    return el('div', { class: 'bb-exp-panel-loose' }, [
      section.label
        ? el('p', { class: 'bb-exp-panel-loose-label' }, `${section.label} · ${entries.length}`)
        : null,
      ...entries.map((entry) => el('div', { class: 'bb-exp-panel-loose-row' }, [
        el('span', { class: 'bb-exp-panel-loose-dot', 'aria-hidden': 'true' }, '◦'),
        el('span', { class: 'bb-exp-panel-version-text' }, displayExperienceLine(entry.title)),
        el('div', { class: 'bb-exp-panel-version-actions' }, [
          mapBtn(entry.id, { mapped: posting ? entryMappedOnPosting(store, posting, entry.id) : false }),
          posting && !entryOnPostingResume(store, posting, entry.id)
            ? btn('+ Add to resume', {
              type: 'button',
              class: 'btn ghost compact-action',
              onClick: () => deps.onAddEntriesToResume([entry.id]),
            })
            : null,
        ]),
      ])),
    ]);
  };

  const jobBlock = (group) => {
    const jobKey = group.jobId || '__none__';
    if (jobFilter && jobFilter !== jobKey) return null;
    const jobExpanded = !collapsedPanelJobs.has(jobKey);
    const sectionNodes = [];
    if (jobExpanded) {
      for (const section of group.sections || []) {
        if (section.kind === 'experience') {
          const node = experienceBlock(jobKey, section);
          if (node) sectionNodes.push(node);
        } else {
          const node = looseBlock(jobKey, section);
          if (node) sectionNodes.push(node);
        }
      }
    }
    if (!sectionNodes.length && panelQuery) return null;
    return el('div', { class: 'bb-exp-panel-job', 'data-job-key': jobKey }, [
      el('button', {
        type: 'button',
        class: 'bb-exp-panel-job-head',
        'aria-expanded': jobExpanded ? 'true' : 'false',
        onClick: () => {
          if (jobExpanded) collapsedPanelJobs.add(jobKey);
          else collapsedPanelJobs.delete(jobKey);
          onRender();
        },
      }, [
        el('span', { class: 'bb-exp-panel-job-title' }, group.label.toUpperCase()),
        el('span', { class: 'bb-exp-panel-job-count' }, String(group.count)),
      ]),
      jobExpanded ? el('div', { class: 'bb-exp-panel-job-body' }, sectionNodes) : null,
    ]);
  };

  const targetEntry = mapTargetEntryId
    ? (store.entries || []).find((item) => item.id === mapTargetEntryId)
    : null;

  const body = el('div', { class: 'bb-exp-panel-scroll' }, groups.map((group) => jobBlock(group)).filter(Boolean));

  const selectionCount = selectedEntryIds.size;
  const selectionBar = selectionCount
    ? el('div', { class: 'bb-exp-panel-selection' }, [
      el('span', {}, `${selectionCount} selected`),
      posting
        ? btn(`Add ${selectionCount} to resume`, {
          type: 'button',
          class: 'btn',
          onClick: () => deps.onAddEntriesToResume([...selectedEntryIds]),
        })
        : null,
      btn('Clear', {
        type: 'button',
        class: 'btn ghost',
        onClick: () => {
          selectedEntryIds.clear();
          onRender();
        },
      }),
    ])
    : null;

  return el('aside', { class: 'bb-exp-side-panel', 'aria-label': 'Experiences' }, [
    el('div', { class: 'bb-exp-panel-head' }, [
      el('h2', { class: 'bb-exp-panel-title' }, 'Experiences'),
      btn('+ New', {
        type: 'button',
        class: 'btn ghost compact-action',
        onClick: () => {
          const title = window.prompt('Experience name');
          if (!title?.trim()) return;
          const jobId = jobFilter && jobFilter !== '__none__'
            ? jobFilter
            : (store.jobs?.[0]?.id || '');
          if (!jobId) {
            setNote('Add a job on Resume basics first.');
            return;
          }
          const created = createExperience(store, { jobId, title: title.trim() });
          setStore(created.store);
          onSave();
          setNote('Created experience. Group bullets or add a draft version.');
          onRender();
        },
      }),
    ]),
    el('input', {
      type: 'search',
      class: 'search bb-exp-panel-search',
      placeholder: 'Search experiences and bullets',
      value: panelQuery,
      'aria-label': 'Search experiences panel',
      onInput: (event) => {
        deps.onPanelQueryChange(event.target.value);
      },
    }),
    el('div', { class: 'bb-exp-panel-filters' }, page === 'posting' ? postingFilters : catalogFilters),
    el('label', { class: 'bb-exp-panel-job-filter' }, [
      el('span', { class: 'tiny' }, 'Job'),
      el('select', {
        'aria-label': 'Filter by job',
        onChange: (event) => {
          deps.onPanelJobFilterChange(event.target.value);
        },
      }, [
        el('option', { value: '', selected: !jobFilter }, 'All jobs'),
        ...groups.map((group) => el('option', {
          value: group.jobId || '__none__',
          selected: jobFilter === (group.jobId || '__none__'),
        }, group.label)),
      ]),
    ]),
    targetEntry
      ? el('div', { class: 'bb-exp-panel-target' }, [
        el('span', { class: 'tiny' }, 'Mapping'),
        el('span', { class: 'bb-exp-panel-target-text' }, displayExperienceLine(targetEntry.title)),
        btn('×', {
          type: 'button',
          class: 'btn ghost compact-action',
          'aria-label': 'Clear mapping target',
          onClick: () => {
            deps.onSetMapTarget('');
            onRender();
          },
        }),
      ])
      : null,
    body,
    selectionBar,
  ]);
}
