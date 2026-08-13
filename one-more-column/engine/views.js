/** Page bodies. Every view is a pure function of state — events wire in app.js. */

import { escapeHtml, prettyDate, formatRange } from './shell.js';
import { getSetupProgress } from './setup.js';

/* ── Shared bits ──────────────────────────────────────────────────────── */

export function planOptions(cycles, selectedId) {
  if (!cycles.length) return '<option value="">No plans yet</option>';
  return cycles
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${c.id === selectedId ? ' selected' : ''}>${escapeHtml(c.name)}</option>`,
    )
    .join('');
}

export function workspaceOptions(workspaces, selectedId) {
  if (!workspaces.length) return '<option value="">No workspaces</option>';
  return workspaces
    .map(
      (w) =>
        `<option value="${escapeHtml(w.id)}"${w.id === selectedId ? ' selected' : ''}>${escapeHtml(w.name)}</option>`,
    )
    .join('');
}

function scenarioOptions(scenarios, selectedId) {
  if (!scenarios?.length) return '<option value="">No versions</option>';
  return scenarios
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}"${s.id === selectedId ? ' selected' : ''}>${escapeHtml(s.name)}${s.status === 'active' ? ' (live)' : ''}</option>`,
    )
    .join('');
}

function capacityCellClass(cell) {
  if (cell.band === 'red' || cell.overloaded) return 'cap-cell cap-over';
  if (cell.band === 'yellow') return 'cap-cell cap-tight';
  if (!cell.load) return 'cap-cell cap-idle';
  return 'cap-cell cap-ok';
}

function redirectNotice(redirectedFrom) {
  if (!redirectedFrom) return '';
  const names = {
    planner: 'Planner',
    capacity: 'Capacity',
    team: 'Team',
    'task-types': 'Task types',
  };
  return `<div class="notice notice-info">
    <strong>${escapeHtml(names[redirectedFrom] || 'That page')}</strong> needs a plan before it has anything to show. Create one below and you'll be sent straight there.
  </div>`;
}

/* ── Scratch input helpers ────────────────────────────────────────────
   Quick-add rows, pasted CSV and the like are values the server never sends
   back. They live in state.draft and are written through on every keystroke, so
   a repaint redraws what the user typed instead of blanking it. */

/** Renders value + name attributes for a draft-backed input. */
export function draftAttrs(state, key, fallback = '') {
  const current = state.draft?.[key];
  const value = current === undefined || current === null ? fallback : current;
  return `data-draft="${escapeHtml(key)}" value="${escapeHtml(String(value))}"`;
}

/** Current draft value, falling back when the user hasn't typed yet. */
export function draftValue(state, key, fallback = '') {
  const current = state.draft?.[key];
  return current === undefined || current === null ? fallback : current;
}

/* ── Save status ──────────────────────────────────────────────────────
   Per-row autosave needs somewhere to say what happened. Rows report their own
   state so a failure names the row it belongs to. */

const SAVE_LABELS = {
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Not saved',
  conflict: 'Changed elsewhere',
};

export function rowStatusHtml(status) {
  if (!status || !SAVE_LABELS[status]) return '';
  const kind =
    status === 'failed' ? ' row-status-bad' : status === 'conflict' ? ' row-status-warn' : '';
  return `<span class="row-status${kind}">${escapeHtml(SAVE_LABELS[status])}</span>`;
}

/** The page-level indicator that replaced the Save changes button. */
export function saveStatusHtml(status, pendingCount = 0) {
  if (status === 'saving') return '<span class="save-status">Saving…</span>';
  if (status === 'failed') {
    return '<span class="save-status save-status-bad">Some changes didn\'t save</span>';
  }
  if (status === 'conflict') {
    return '<span class="save-status save-status-warn">Someone else changed this plan</span>';
  }
  if (pendingCount) return '<span class="save-status">Unsaved changes</span>';
  if (status === 'saved') return '<span class="save-status save-status-ok">All changes saved</span>';
  return '<span class="save-status save-status-idle">Changes save automatically</span>';
}

/* ── Plans ────────────────────────────────────────────────────────────── */

export function renderPlansView({ state, redirectedFrom }) {
  const progress = getSetupProgress(state);
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);

  const cards = state.cycles
    .map((cycle) => {
      const isActive = cycle.id === state.activeCycleId;
      const granularity = isActive
        ? state.policy?.config?.tracking_granularity || 'week'
        : null;
      return `
      <div class="plan-card${isActive ? ' active' : ''}" data-plan-id="${escapeHtml(cycle.id)}">
        <div>
          <div class="plan-card-name">${escapeHtml(cycle.name)}</div>
          <div class="plan-card-meta">
            ${escapeHtml(formatRange(cycle))}${granularity ? ` · by ${escapeHtml(granularity)}` : ''}
          </div>
        </div>
        <div class="btn-row">
          ${isActive
            ? '<span class="badge badge-ok">Open</span>'
            : `<button type="button" class="btn btn-ghost btn-sm" data-open-plan="${escapeHtml(cycle.id)}">Open</button>`}
          <button type="button" class="btn btn-ghost btn-sm" data-rename-plan="${escapeHtml(cycle.id)}">Rename</button>
          <button type="button" class="btn btn-danger btn-sm" data-delete-plan="${escapeHtml(cycle.id)}">Delete</button>
        </div>
      </div>`;
    })
    .join('');

  return `
    <div class="page-head">
      <p class="eyebrow">Plans</p>
      <h1 class="page-title">Your plans</h1>
      <p class="page-lead">
        Each plan covers one stretch of time in <strong>${escapeHtml(workspace?.name || 'your workspace')}</strong>.
        Switch between them here or from the sidebar.
      </p>
    </div>

    ${redirectNotice(redirectedFrom)}

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2 class="section-title">${state.cycles.length ? 'All plans' : 'No plans yet'}</h2>
          ${progress.planReady
            ? '<p class="section-sub">Deleting a plan removes its work items, versions, and gates.</p>'
            : ''}
        </div>
        <button type="button" class="btn btn-primary" id="new-plan">+ New plan</button>
      </div>

      ${state.cycles.length
        ? `<div class="plan-list">${cards}</div>`
        : `<div class="empty">
             <span class="empty-title">Nothing planned yet</span>
             <p class="empty-body">A plan is a named date range you're staffing — a quarter, a project, a release. Creating one takes about thirty seconds.</p>
             <button type="button" class="btn btn-primary" id="new-plan-empty">Create your first plan</button>
           </div>`}
    </section>

    <section class="panel">
           <div class="panel-head">
             <div>
               <h2 class="section-title">Workspace</h2>
               <p class="section-sub">${
                 state.workspaces.length > 1
                   ? 'Separate pools of people and plans. Switching changes everything below it.'
                   : 'The pool of people and plans this work lives in. You can rename it.'
               }</p>
             </div>
           </div>
           ${
             state.workspaces.length > 1
               ? `<label class="field" style="max-width:320px">
             <span class="field-label">Active workspace</span>
             <select class="input" id="plans-workspace">${workspaceOptions(state.workspaces, state.activeWorkspaceId)}</select>
           </label>`
               : `<p class="field-hint" style="margin:0 0 10px">Current workspace: <strong>${escapeHtml(workspace?.name || 'your workspace')}</strong></p>`
           }
           <div class="btn-row" style="margin-top:14px">
             <button type="button" class="btn btn-ghost btn-sm" id="rename-workspace">Rename workspace</button>
             ${
               state.workspaces.length > 1
                 ? '<button type="button" class="btn btn-danger btn-sm" id="delete-workspace">Delete this workspace</button>'
                 : ''
             }
           </div>
         </section>
  `;
}

/* ── Planner ──────────────────────────────────────────────────────────── */

const FALLBACK_TASK_TYPES = [
  ['general', 'General'],
  ['deliverable', 'Deliverable'],
  ['review', 'Review'],
  ['meeting', 'Meeting'],
  ['admin', 'Admin'],
  ['other', 'Other'],
];

const GATE_TYPES = [
  ['input_ready', 'Something must be ready'],
  ['handoff_chain', 'Handoff from someone'],
  ['sample_chain', 'Sample chain'],
  ['evidence_ready', 'Evidence ready'],
  ['external_flag', 'Team agreement'],
  ['phase_gate', 'Phase milestone'],
  ['staffing', 'Need a person'],
  ['review_lag', 'Review after work'],
  ['blackout', 'Blackout period'],
];

const GATE_STATUSES = [
  ['open', 'Still open'],
  ['met', 'Done'],
  ['waived', 'Not needed'],
  ['blocked', 'Blocked'],
];

const DAY_KINDS = [
  ['business', 'Business days'],
  ['calendar', 'Calendar days'],
];

const FIELD_TYPES = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['select', 'Select'],
];

function taskTypePairs(taskTypes) {
  if (taskTypes?.length) return taskTypes.map((t) => [t.key, t.label]);
  return FALLBACK_TASK_TYPES;
}

/** Option list keyed by id (for import task-type selector). */
function taskTypeIdOptions(taskTypes, selectedId) {
  const opts = [`<option value=""${!selectedId ? ' selected' : ''}>Built-in columns only</option>`];
  for (const t of taskTypes || []) {
    opts.push(
      `<option value="${escapeHtml(t.id)}"${selectedId === t.id ? ' selected' : ''}>${escapeHtml(t.label)}</option>`,
    );
  }
  return opts.join('');
}

function optionList(pairs, selected) {
  return pairs
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('');
}

/** Normalize select options: main stores string[]; tolerate {value,label} objects. */
function fieldOptionPairs(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => {
      if (o && typeof o === 'object') {
        const value = String(o.value ?? o.label ?? '').trim();
        const label = String(o.label ?? o.value ?? '').trim();
        return value ? [value, label || value] : null;
      }
      const s = String(o).trim();
      return s ? [s, s] : null;
    })
    .filter(Boolean);
}

function renderCustomTypeFields(matchedType, attrs) {
  const fields = matchedType?.fields || [];
  if (!fields.length) return '';

  const inputs = fields
    .map((field) => {
      const value = attrs[field.key];
      const strVal = value == null ? '' : String(value);
      let control = '';
      if (field.field_type === 'select') {
        const pairs = fieldOptionPairs(field.options);
        control = `<select class="input input-sm" data-attr-field="${escapeHtml(field.key)}" aria-label="${escapeHtml(field.label)}">
          <option value="">—</option>
          ${optionList(pairs, strVal)}
        </select>`;
      } else if (field.field_type === 'number') {
        control = `<input class="input input-sm" data-attr-field="${escapeHtml(field.key)}" type="number" step="any"
          value="${escapeHtml(strVal)}" aria-label="${escapeHtml(field.label)}" />`;
      } else if (field.field_type === 'date') {
        control = `<input class="input input-sm" data-attr-field="${escapeHtml(field.key)}" type="date"
          value="${escapeHtml(strVal.slice(0, 10))}" aria-label="${escapeHtml(field.label)}" />`;
      } else {
        control = `<input class="input input-sm" data-attr-field="${escapeHtml(field.key)}" type="text"
          value="${escapeHtml(strVal)}" aria-label="${escapeHtml(field.label)}" />`;
      }
      return `
        <label class="field">
          <span class="field-label">${escapeHtml(field.label)}${field.required ? ' *' : ''}</span>
          ${control}
        </label>`;
    })
    .join('');

  return `
    <div class="gate-drawer-head" style="margin-top:4px">
      <div>
        <div class="gate-drawer-title">${escapeHtml(matchedType.label)} fields</div>
        <p class="gate-drawer-hint">Tracked on this type — edit freely; values save with the row.</p>
      </div>
    </div>
    <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:16px">
      ${inputs}
    </div>`;
}

function gateDrawer(item, deps, allItems, expanded, taskTypes = []) {
  if (!expanded) return '';

  const attrs = item.attributes || {};
  const matchedType = taskTypes.find((t) => t.key === (attrs.task_type || 'general'));
  const hasTemplate = (matchedType?.gate_templates?.length || 0) > 0;

  const itemOptions = (selectedId) =>
    allItems
      .filter((p) => p.id !== item.id)
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(p.title)}</option>`,
      )
      .join('');

  const gates = deps
    .map(
      (dep) => `
    <div class="gate-item" data-dep-id="${escapeHtml(dep.id)}">
      <label class="field">
        <span class="field-label">What must happen</span>
        <input class="input input-sm" data-field="label" value="${escapeHtml(dep.label || '')}" placeholder="e.g. Data handed over" />
      </label>
      <label class="field">
        <span class="field-label">Waiting on</span>
        <select class="input input-sm" data-field="from_plan_item_id">
          <option value="">Nothing in this plan</option>
          ${itemOptions(dep.from_plan_item_id || '')}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Needed by</span>
        <input class="input input-sm" data-field="dep_due" type="date" value="${dep.meta?.due_date ? escapeHtml(String(dep.meta.due_date).slice(0, 10)) : ''}" />
      </label>
      <label class="field">
        <span class="field-label">Status</span>
        <select class="input input-sm" data-field="dep_status">${optionList(GATE_STATUSES, dep.status)}</select>
      </label>
      <button type="button" class="btn-icon" data-delete-gate="${escapeHtml(dep.id)}" aria-label="Remove this gate">
        <span aria-hidden="true">×</span>
      </button>
      <label class="field span-2" style="grid-column:1/-1">
        <span class="field-label">Kind of blocker</span>
        <select class="input input-sm" data-field="dep_type" style="max-width:260px">${optionList(GATE_TYPES, dep.dep_type)}</select>
      </label>
    </div>`,
    )
    .join('');

  return `
    <tr class="gate-drawer" data-drawer-for="${escapeHtml(item.id)}">
      <td colspan="10">
        <div class="gate-drawer-inner">
          <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
            <label class="field">
              <span class="field-label">Duration (days)</span>
              <input class="input input-sm" data-field="duration_days" type="number" step="0.5" min="0"
                value="${attrs.duration_days ?? ''}" placeholder="—" />
            </label>
            <label class="field">
              <span class="field-label">Phase</span>
              <input class="input input-sm" data-field="phase" value="${escapeHtml(item.phase || '')}" placeholder="—" />
            </label>
          </div>

          ${renderCustomTypeFields(matchedType, attrs)}

          <div class="gate-drawer-head">
            <div>
              <div class="gate-drawer-title">Gates</div>
              <p class="gate-drawer-hint">Things that must happen before this row can start. Each open gate pushes the ready-to-start date out.</p>
            </div>
            <div class="btn-row">
              ${hasTemplate
                ? `<button type="button" class="btn btn-ghost btn-sm" data-apply-gate-template="${escapeHtml(item.id)}" data-task-type-id="${escapeHtml(matchedType.id)}">Apply gate template</button>`
                : ''}
              <button type="button" class="btn btn-ghost btn-sm" data-add-gate="${escapeHtml(item.id)}">+ Add a gate</button>
            </div>
          </div>

          ${gates || '<p class="field-hint">No gates on this row — it can start as soon as you are ready.</p>'}
        </div>
      </td>
    </tr>`;
}

/** Autosave indicator plus undo, repainted on its own as saves settle. */
export function plannerSaveBar(state) {
  const pending = state.pendingRows?.size || 0;
  const canUndo = Boolean(state.undoStack?.length);
  return `
    ${saveStatusHtml(state.saveStatus, pending)}
    ${state.saveStatus === 'failed' || state.saveStatus === 'conflict'
      ? '<button type="button" class="btn btn-ghost btn-sm" id="retry-planner">Retry</button>'
      : ''}
    <button type="button" class="btn btn-ghost btn-sm" id="undo-planner"${canUndo ? '' : ' disabled'}>Undo</button>
  `;
}

/** The grid alone, so autosave and row status can repaint just it. */
export function renderPlannerTable(state) {
  const typePairs = taskTypePairs(state.taskTypes);
  const progress = getSetupProgress(state);

  const depsByItem = new Map();
  for (const dep of state.dependencies || []) {
    if (!depsByItem.has(dep.to_plan_item_id)) depsByItem.set(dep.to_plan_item_id, []);
    depsByItem.get(dep.to_plan_item_id).push(dep);
  }
  const readinessByItem = new Map((state.readiness || []).map((r) => [r.plan_item_id, r]));

  const rows = state.planItems
    .map((item, index) => {
      const attrs = item.attributes || {};
      const deps = depsByItem.get(item.id) || [];
      const ready = readinessByItem.get(item.id);
      const expanded = state.expandedRows.has(item.id);
      const openGates = deps.filter((d) => d.status === 'open' || d.status === 'blocked').length;

      const readyCell = ready?.blocked
        ? '<span class="badge badge-bad">Blocked</span>'
        : ready?.ready_to_start
          ? `<span class="badge badge-ok">${escapeHtml(prettyDate(ready.ready_to_start))}</span>`
          : '<span class="badge">Anytime</span>';

      const gateLabel = deps.length
        ? `${deps.length} gate${deps.length === 1 ? '' : 's'}`
        : 'Details';
      const gateClass = ready?.blocked ? 'blocked' : deps.length ? 'has-gates' : '';

      return `
      <tr class="planner-row${ready?.blocked ? ' blocked' : ''}" data-id="${escapeHtml(item.id)}">
        <td class="planner-num">${index + 1}</td>
        <td class="planner-title-col">
          <input class="input input-sm" data-field="title" value="${escapeHtml(item.title)}" aria-label="Title" />
        </td>
        <td>
          <select class="input input-sm" data-field="task_type" aria-label="Type">${optionList(typePairs, attrs.task_type || 'general')}</select>
        </td>
        <td>
          <input class="input input-sm" data-field="work_hours" type="number" step="0.5" min="0"
            value="${item.work_hours ?? 0}" aria-label="Work hours" style="max-width:80px" />
        </td>
        <td>
          <input class="input input-sm" data-field="start_date" type="date"
            value="${attrs.start_date ? escapeHtml(String(attrs.start_date).slice(0, 10)) : ''}" aria-label="Start date" />
        </td>
        <td>
          <input class="input input-sm" data-field="due_week" type="date"
            value="${item.due_week ? escapeHtml(String(item.due_week).slice(0, 10)) : ''}" aria-label="Due date" />
        </td>
        <td>
          <button type="button" class="gate-toggle ${gateClass}" data-toggle-row="${escapeHtml(item.id)}"
            aria-expanded="${expanded}">
            <span class="gate-caret" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
            ${escapeHtml(gateLabel)}${openGates ? ` · ${openGates} open` : ''}
          </button>
        </td>
        <td>${readyCell}</td>
        <td class="planner-status" data-row-status="${escapeHtml(item.id)}">${rowStatusHtml(state.rowStatus?.[item.id])}</td>
        <td class="planner-actions">
          <button type="button" class="btn-icon" data-delete-item="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.title)}">
            <span aria-hidden="true">×</span>
          </button>
        </td>
      </tr>
      ${gateDrawer(item, deps, state.planItems, expanded, state.taskTypes || [])}`;
    })
    .join('');

  return plannerTableHtml({ state, rows, progress, empty: !state.planItems.length });
}

function plannerTableHtml({ state, rows, progress, empty }) {
  if (empty) {
    return `
      <div class="empty">
        <span class="empty-title">Nothing listed yet</span>
        <p class="empty-body">
          ${progress.typesReady
            ? `Use Add work above for the first item. Give it hours and a due date and it will show up
          on the capacity grid straight away — you don't need your team in place first.`
            : `Your catalog isn't shaped yet. Define task types (fields and dependencies) first,
          then add specific work items here.`}
        </p>
        ${!progress.typesReady
          ? `<a class="btn btn-primary" href="#/task-types">Define task types</a>`
          : ''}
      </div>`;
  }

  return `
    <section class="panel panel-flush">
      <div class="table-scroll">
        <table class="table planner-table">
          <thead>
            <tr>
              <th></th>
              <th>What</th>
              <th>Type</th>
              <th>Hours</th>
              <th>Start</th>
              <th>Due</th>
              <th>Details</th>
              <th>Can start</th>
              <th><span class="sr-only">Save state</span></th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

export function renderPlannerView({ state }) {
  const activeScenario = state.scenarios.find((s) => s.id === state.activeScenarioId);
  const isLive = activeScenario?.status === 'active';
  const typePairs = taskTypePairs(state.taskTypes);
  const progress = getSetupProgress(state);

  const preview = state.importPreview;
  const matchedFieldLabels = (preview?.matched_fields || []).map((f) => f.label || f.key);
  const unmatchedCols = preview?.unmatched_headers || [];
  const rowWarnings = (preview?.rows || []).flatMap((r) =>
    (r.warnings || []).map((w) => `Row ${r.row}: ${w}`),
  );
  const importPreview = preview
    ? `<div class="notice notice-info">
         <strong>${preview.count} rows</strong> ready to import${
           preview.task_type_label
             ? ` as <strong>${escapeHtml(preview.task_type_label)}</strong>`
             : ''
         }.
         ${
           matchedFieldLabels.length
             ? `<p class="field-hint" style="margin-top:8px">Also importing: ${escapeHtml(matchedFieldLabels.join(', '))}</p>`
             : ''
         }
         ${
           unmatchedCols.length
             ? `<p class="field-hint" style="margin-top:4px">No match for: ${escapeHtml(unmatchedCols.join(', '))}</p>`
             : ''
         }
         ${
           rowWarnings.length
             ? `<ul style="margin:8px 0 0;padding-left:1.2em;font-size:0.85rem">
                  ${rowWarnings
                    .slice(0, 8)
                    .map((w) => `<li>${escapeHtml(w)}</li>`)
                    .join('')}
                  ${rowWarnings.length > 8 ? `<li>…and ${rowWarnings.length - 8} more</li>` : ''}
                </ul>`
             : ''
         }
         <div class="btn-row" style="margin-top:10px">
           <button type="button" class="btn btn-primary btn-sm" id="confirm-import">Import them</button>
           <button type="button" class="btn btn-ghost btn-sm" id="cancel-import">Cancel</button>
         </div>
       </div>`
    : '';

  return `
    <div class="page-bar">
      <div class="page-head">
        <p class="eyebrow">Planner</p>
        <h1 class="page-title">The work</h1>
        <p class="page-lead">
          One row per thing that needs doing — deliverables, reviews, meetings, whatever else.
          Hours and a due date are what drive the capacity grid.
        </p>
      </div>
      <div class="btn-row" data-section="planner-savebar">
        ${plannerSaveBar(state)}
      </div>
    </div>

    <section class="panel">
      <div class="planner-toolbar">
        <div>
          <span class="field-label" style="display:block;margin-bottom:6px">Version</span>
          <div class="toggle-group" role="group" aria-label="Plan version">
            <button type="button" class="toggle-btn${!isLive ? ' active' : ''}" id="mode-draft">Working draft</button>
            <button type="button" class="toggle-btn${isLive ? ' active' : ''}" id="mode-live">Live plan</button>
          </div>
        </div>
        <div class="btn-row">
          <select id="scenario-select" class="input input-sm" aria-label="Version" style="max-width:200px">
            ${scenarioOptions(state.scenarios, state.activeScenarioId)}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" id="create-scenario">New draft</button>
          <button type="button" class="btn btn-ghost btn-sm" id="finalize-scenario"${isLive ? ' disabled' : ''}>Make this the live plan</button>
          <button type="button" class="btn btn-ghost btn-sm" id="delete-scenario"${(state.scenarios?.length || 0) <= 1 ? ' disabled' : ''}>Delete version</button>
        </div>
      </div>
      <p class="mode-note" style="margin-top:12px">
        ${isLive
          ? '<strong>Live plan</strong> — the version everyone works from. Edits here are real; try risky ideas in a draft instead.'
          : '<strong>Working draft</strong> — a scratch copy. Nothing here counts until you make it the live plan.'}
      </p>
    </section>

    ${!progress.typesReady
      ? `<div class="notice notice-info" style="margin-bottom:16px">
           <strong>Set up task types first.</strong>
           Define the kinds of work you track, the fields on each, and any dependency gates —
           then come back here to add the specific items.
           <div class="btn-row" style="margin-top:10px">
             <a class="btn btn-primary btn-sm" href="#/task-types">Go to Task types</a>
           </div>
         </div>`
      : ''}

    <section class="panel">
      <h2 class="section-title" style="margin-bottom:12px">Add work</h2>
      <div class="quick-add">
        <label class="field">
          <span class="field-label">What needs doing</span>
          <input id="new-item-title" class="input" placeholder="e.g. Draft the Q1 forecast" autocomplete="off"
            ${draftAttrs(state, 'newItemTitle')} />
        </label>
        <label class="field">
          <span class="field-label">Type</span>
          <select id="new-item-type" class="input" data-draft="newItemType">${optionList(typePairs, draftValue(state, 'newItemType', 'general'))}</select>
        </label>
        <label class="field">
          <span class="field-label">Hours</span>
          <input id="new-item-hours" class="input" type="number" step="0.5" min="0" ${draftAttrs(state, 'newItemHours', '8')} />
        </label>
        <label class="field">
          <span class="field-label">Due</span>
          <input id="new-item-due" class="input" type="date" ${draftAttrs(state, 'newItemDue')} />
        </label>
        <button type="button" class="btn btn-primary" id="add-plan-item">Add row</button>
      </div>
    </section>

    <div data-section="planner-table">${renderPlannerTable(state)}</div>

    <section class="panel">
      ${importPreview}
      <details class="disclosure" id="import-disclosure" style="border-top:none;padding-top:0"${state.importSectionOpen ? ' open' : ''}>
        <summary>Import, export, and drift</summary>
        <div class="disclosure-body">
          <label class="field" style="max-width:280px;margin-bottom:12px">
            <span class="field-label">Task type</span>
            <select id="import-task-type" class="input" aria-label="Import task type">
              ${taskTypeIdOptions(state.taskTypes, state.importTaskTypeId)}
            </select>
            <p class="field-hint">Optional — maps extra CSV columns onto that type's custom fields.</p>
          </label>
          <label class="field">
            <span class="field-label">Paste CSV</span>
            <p class="field-hint">Columns: <span class="mono">title, work_hours, due_week, phase</span>${
              (() => {
                const t = (state.taskTypes || []).find((x) => x.id === state.importTaskTypeId);
                const extras = (t?.fields || []).map((f) => f.key);
                return extras.length
                  ? ` · plus <span class="mono">${escapeHtml(extras.join(', '))}</span>`
                  : '';
              })()
            }</p>
            <textarea id="import-csv" class="input" rows="4" data-draft="importCsv" placeholder="title,work_hours,due_week,phase&#10;Draft the forecast,8,2026-01-12,Phase 1">${escapeHtml(draftValue(state, 'importCsv'))}</textarea>
          </label>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost btn-sm" id="preview-import">Preview import</button>
            <button type="button" class="btn btn-ghost btn-sm" id="export-plan">Export this plan as CSV</button>
            <button type="button" class="btn btn-ghost btn-sm" id="check-drift">Compare to last import</button>
          </div>
        </div>
      </details>
    </section>
  `;
}

/* ── Capacity ─────────────────────────────────────────────────────────── */

function formatPeriodLabel(key, granularity) {
  if (granularity === 'month' && /^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const d = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function teamTabs(teams, activeTeam) {
  if (!teams?.length) return '';
  const tabs = [
    `<button type="button" class="pill-tab${!activeTeam ? ' active' : ''}" data-team="">Everyone</button>`,
    ...teams.map(
      (t) =>
        `<button type="button" class="pill-tab${activeTeam === t ? ' active' : ''}" data-team="${escapeHtml(t)}">${escapeHtml(t)}</button>`,
    ),
  ];
  return `<div class="pill-tabs">${tabs.join('')}</div>`;
}

/** Collapsible planning-rules panel — lives on Capacity, not its own tab. */
function renderPlanningRulesPanel(state) {
  const policy = state.policy?.config || {};
  const cycle = state.cycles.find((c) => c.id === state.activeCycleId);

  const fields = [
    ['policy-weekly', 'Default hours per week', policy.weekly_capacity_default ?? 32, 1, 'Used for anyone without their own number on the Team page.'],
    ['policy-yellow', 'Amber below (hours left)', policy.band_yellow_remaining ?? 8, 1, 'A cell turns amber once someone has fewer than this many hours spare.'],
    ['policy-threshold', 'Overload at (× capacity)', policy.overload_threshold ?? 1, 0.05, 'Where red starts. 1 means red as soon as planned hours pass available hours.'],
    ['policy-proximity', 'Warn this many days ahead', policy.alert_proximity_days ?? 14, 1, 'How far out upcoming due dates are flagged (reserved for dependency/gate warnings).'],
    ['policy-review', 'Review ratio', policy.review_ratio ?? 0.35, 0.01, 'Extra review effort added on top of each item, as a fraction of its hours.'],
    ['policy-review-floor', 'Minimum review hours', policy.review_floor_hours ?? 0, 0.5, 'Review effort never drops below this, however small the item.'],
  ];

  return `
    <section class="panel">
      <details class="disclosure" id="rules-disclosure" style="border-top:none;padding-top:0"${state.rulesSectionOpen ? ' open' : ''}>
        <summary>Planning rules</summary>
        <div class="disclosure-body">
          <p class="field-hint" style="margin:0">
            How <strong>${escapeHtml(cycle?.name || 'this plan')}</strong> decides what counts as tight or overloaded.
            These apply to this plan only — they shape the colours on the grid above.
          </p>

          <div class="panel-head" style="padding:0;border:0">
            <h2 class="section-title">Thresholds</h2>
            <button type="button" class="btn btn-primary btn-sm" id="save-policy">Save rules</button>
          </div>
          <div class="form-grid">
            ${fields
              .map(
                ([id, label, value, step, hint]) => `
              <label class="field">
                <span class="field-label">${escapeHtml(label)}</span>
                <input id="${id}" class="input" type="number" step="${step}" ${draftAttrs(state, id, String(value))} />
                <span class="field-hint">${escapeHtml(hint)}</span>
              </label>`,
              )
              .join('')}
          </div>

          <div>
            <h2 class="section-title" style="margin-bottom:8px">Default tracking granularity</h2>
            <p class="section-sub" style="margin-bottom:10px">Sets the default columns for this plan's capacity grid.</p>
            <div class="toggle-group" role="group" aria-label="Tracking granularity">
              ${['week', 'month', 'day']
                .map(
                  (g) =>
                    `<button type="button" class="toggle-btn${(policy.tracking_granularity || 'week') === g ? ' active' : ''}" data-granularity="${g}">${g[0].toUpperCase()}${g.slice(1)}</button>`,
                )
                .join('')}
            </div>
          </div>

          <div>
            <h2 class="section-title" style="margin-bottom:12px">Recent changes</h2>
            ${(state.changelog || []).length
              ? `<ul style="list-style:none;display:flex;flex-direction:column;gap:8px;margin:0;padding:0">
                   ${state.changelog
                     .slice(0, 20)
                     .map(
                       (e) => `<li style="font-size:0.85rem;display:flex;gap:12px">
                         <span class="mono" style="color:var(--faint);white-space:nowrap">${escapeHtml(new Date(e.created_at).toLocaleDateString())}</span>
                         <span>${escapeHtml(e.summary)}</span>
                       </li>`,
                     )
                     .join('')}
                 </ul>`
              : '<p class="field-hint" style="margin:0">Nothing logged yet.</p>'}
          </div>
        </div>
      </details>
    </section>`;
}

export function renderCapacityView({ state }) {
  const progress = getSetupProgress(state);
  const grid = state.capacity;
  const rulesPanel = renderPlanningRulesPanel(state);

  const head = `
    <div class="page-head">
      <p class="eyebrow">Capacity</p>
      <h1 class="page-title">Who has room</h1>
      <p class="page-lead">
        Hours each person is carrying, period by period. Green means room to spare,
        amber means it's getting tight, red means more work than hours.
      </p>
    </div>`;

  if (!progress.hasTeam) {
    return `${head}
      <div class="empty">
        <span class="empty-title">No one to show yet</span>
        <p class="empty-body">
          Capacity compares planned hours against people's available hours — so it needs
          at least one person. Add your team and this grid fills itself in.
        </p>
        <a class="btn btn-primary" href="#/team">Add your team</a>
      </div>
      ${rulesPanel}`;
  }

  if (!progress.hasWork) {
    return `${head}
      <div class="empty">
        <span class="empty-title">No work to measure</span>
        <p class="empty-body">Your team is set up, but there's nothing planned against them yet. List some work and it'll land here.</p>
        <a class="btn btn-primary" href="#/planner">Go to the Planner</a>
      </div>
      ${rulesPanel}`;
  }

  if (!grid) {
    return `${head}<section class="panel"><p class="page-lead">Loading capacity…</p></section>${rulesPanel}`;
  }

  const granularity = grid.granularity || state.capacityGranularity || 'week';
  const periodHeaders = grid.weeks
    .map((w) => `<th class="cap-period">${escapeHtml(formatPeriodLabel(w, granularity))}</th>`)
    .join('');

  let overloadedCells = 0;
  const rows = grid.rows
    .map((row) => {
      const cells = row.weeks
        .map((cell) => {
          if (cell.band === 'red' || cell.overloaded) overloadedCells += 1;
          const title = `${cell.load}h planned of ${cell.capacity}h available · ${cell.remaining}h left`;
          return `<td class="${capacityCellClass(cell)}" title="${escapeHtml(title)}">
            <span class="cap-load">${cell.load || '·'}</span>
            <span class="cap-rem">${cell.remaining}h left</span>
          </td>`;
        })
        .join('');
      return `<tr>
        <th class="cap-person" scope="row">${escapeHtml(row.name)}<span class="cap-team">${escapeHtml(row.team || 'no role set')}</span></th>
        ${cells}
      </tr>`;
    })
    .join('');

  const openGates = (state.dependencies || []).filter(
    (d) => d.status === 'open' || d.status === 'blocked',
  );

  return `
    <div class="page-bar">
      ${head}
      <div class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" id="export-capacity">Export CSV</button>
        <button type="button" class="btn btn-ghost btn-sm" id="refresh-capacity">Refresh</button>
      </div>
    </div>

    <section class="panel">
      <div class="stat-row" style="margin-bottom:16px">
        <div class="stat"><span class="stat-num">${grid.rows.length}</span><span class="stat-label">people</span></div>
        <div class="stat"><span class="stat-num">${grid.weeks.length}</span><span class="stat-label">${escapeHtml(granularity)}s</span></div>
        <div class="stat${overloadedCells ? ' warn' : ''}">
          <span class="stat-num">${overloadedCells}</span><span class="stat-label">overloaded</span>
        </div>
        <div class="stat"><span class="stat-num">${state.planItems.length}</span><span class="stat-label">work items</span></div>
      </div>

      <div class="planner-toolbar" style="margin-bottom:14px">
        ${teamTabs(grid.teams || state.teams, state.activeTeamFilter)}
        <div class="btn-row">
          <div class="toggle-group" role="group" aria-label="Time granularity">
            <button type="button" class="toggle-btn${granularity === 'week' ? ' active' : ''}" id="cap-granularity-week">Weeks</button>
            <button type="button" class="toggle-btn${granularity === 'month' ? ' active' : ''}" id="cap-granularity-month">Months</button>
            <button type="button" class="toggle-btn${granularity === 'day' ? ' active' : ''}" id="cap-granularity-day">Days</button>
          </div>
          <label class="field">
            <span class="sr-only">How hours are counted</span>
            <select id="cap-mode" class="input input-sm" title="How each item's hours land on the grid">
              <option value="due"${grid.mode === 'due' ? ' selected' : ''}>All hours land in the due period</option>
              <option value="spread"${grid.mode === 'spread' ? ' selected' : ''}>Spread hours across the work</option>
            </select>
          </label>
        </div>
      </div>

      ${openGates.length
        ? `<div class="notice notice-warn" style="margin-bottom:14px">
             <strong>${openGates.length} open gate${openGates.length === 1 ? '' : 's'}</strong> — some of this work can't start yet.
             <a href="#/planner">Open the Planner to clear or waive gates</a>.
           </div>`
        : ''}

      <div class="legend" style="margin-bottom:10px">
        <span class="legend-item"><span class="swatch ok"></span> Room to spare</span>
        <span class="legend-item"><span class="swatch tight"></span> Getting tight</span>
        <span class="legend-item"><span class="swatch over"></span> Overloaded</span>
        <span class="legend-item" style="margin-left:auto;color:var(--faint)">Top number is hours planned</span>
      </div>

      <div class="table-scroll">
        <table class="table cap-table">
          <thead><tr><th class="cap-person">Person</th>${periodHeaders}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>

    ${rulesPanel}
  `;
}

/* ── Team ─────────────────────────────────────────────────────────────── */

/** Autosave indicator for the Team page. */
export function teamSaveBar(state) {
  const pending = state.pendingResources?.size || 0;
  return `
    ${saveStatusHtml(state.teamSaveStatus, pending)}
    ${state.teamSaveStatus === 'failed' || state.teamSaveStatus === 'conflict'
      ? '<button type="button" class="btn btn-ghost btn-sm" id="retry-team">Retry</button>'
      : ''}
  `;
}

/** The team grid alone, so autosave can repaint just it. */
export function renderTeamTable(state) {
  if (!state.resources.length) {
    return `
      <div class="empty">
        <span class="empty-title">No one here yet</span>
        <p class="empty-body">Add your first person above. Capacity stays empty until at least one person exists.</p>
      </div>`;
  }

  const rows = state.resources
    .map(
      (r) => `
    <tr data-id="${escapeHtml(r.id)}">
      <td><input class="input input-sm" data-field="name" value="${escapeHtml(r.name)}" aria-label="Name" /></td>
      <td><input class="input input-sm" data-field="team" value="${escapeHtml(r.team || '')}" placeholder="Role" aria-label="Role" /></td>
      <td>
        <input class="input input-sm" data-field="weekly_hours" type="number" step="0.5" min="0"
          value="${r.profiles?.[0]?.weekly_hours ?? 32}" aria-label="Hours per week" style="max-width:90px" />
      </td>
      <td>${(r.time_off || []).length ? `<span class="badge">${r.time_off.length} booked</span>` : '<span class="badge">—</span>'}</td>
      <td class="planner-status" data-row-status="${escapeHtml(r.id)}">${rowStatusHtml(state.resourceStatus?.[r.id])}</td>
      <td class="planner-actions">
        <button type="button" class="btn-icon" data-delete-resource="${escapeHtml(r.id)}" aria-label="Remove ${escapeHtml(r.name)}">
          <span aria-hidden="true">×</span>
        </button>
      </td>
    </tr>`,
    )
    .join('');

  return `
    <section class="panel panel-flush">
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Name</th><th>Role</th><th>Hours/week</th><th>Time off</th><th><span class="sr-only">Save state</span></th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

export function renderTeamView({ state }) {

  const ptoList = state.resources
    .filter((r) => r.time_off?.length)
    .map(
      (r) => `
      <li style="margin-bottom:10px">
        <strong>${escapeHtml(r.name)}</strong>
        ${r.time_off
          .map(
            (t) => `<div class="alert-meta">
              ${escapeHtml(prettyDate(t.start_date))} → ${escapeHtml(prettyDate(t.end_date))}
              (${t.hours_per_day != null ? `${escapeHtml(String(t.hours_per_day))}h/day` : 'full days'})
              <button type="button" class="btn-icon" data-delete-pto="${escapeHtml(t.id)}" aria-label="Remove this time off">
                <span aria-hidden="true">×</span>
              </button>
            </div>`,
          )
          .join('')}
      </li>`,
    )
    .join('');

  return `
    <div class="page-bar">
      <div class="page-head">
        <p class="eyebrow">Team</p>
        <h1 class="page-title">Who's available</h1>
        <p class="page-lead">
          One row per person, with the hours a week they can give to planned work.
          These numbers are the denominator behind every capacity cell.
        </p>
      </div>
      <div class="btn-row" data-section="team-savebar">
        ${teamSaveBar(state)}
      </div>
    </div>

    <section class="panel">
      <h2 class="section-title" style="margin-bottom:12px">Add someone</h2>
      <div class="quick-add" style="grid-template-columns:minmax(0,2fr) minmax(0,1.5fr) minmax(0,0.8fr) auto">
        <label class="field">
          <span class="field-label">Name</span>
          <input id="new-resource-name" class="input" placeholder="Alex Rivera" autocomplete="off"
            ${draftAttrs(state, 'newResourceName')} />
        </label>
        <label class="field">
          <span class="field-label">Role</span>
          <input id="new-resource-team" class="input" placeholder="Analyst" autocomplete="off"
            ${draftAttrs(state, 'newResourceTeam')} />
        </label>
        <label class="field">
          <span class="field-label">Hours/week</span>
          <input id="new-resource-hours" class="input" type="number" step="0.5" min="0"
            ${draftAttrs(state, 'newResourceHours', '32')} />
        </label>
        <button type="button" class="btn btn-primary" id="add-resource">Add</button>
      </div>
      <p class="field-hint" style="margin-top:10px">
        Hours/week is time genuinely available for planned work. 32 is a common starting point for a 40-hour week.
      </p>
    </section>

    <div data-section="team-table">${renderTeamTable(state)}</div>

    ${state.resources.length
      ? `<section class="panel">
           <div class="panel-head">
             <div>
               <h2 class="section-title">Time off</h2>
               <p class="section-sub">Booked leave is subtracted from someone's available hours for those dates.</p>
             </div>
           </div>
           <div class="quick-add" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto">
             <label class="field">
               <span class="field-label">Person</span>
               <select id="pto-resource" class="input">
                 ${state.resources.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('')}
               </select>
             </label>
             <label class="field">
               <span class="field-label">From</span>
               <input id="pto-start" class="input" type="date" ${draftAttrs(state, 'ptoStart')} />
             </label>
             <label class="field">
               <span class="field-label">To</span>
               <input id="pto-end" class="input" type="date" ${draftAttrs(state, 'ptoEnd')} />
             </label>
             <label class="field">
               <span class="field-label">Hours/day</span>
               <input id="pto-hours" class="input" type="number" step="0.5" min="0" placeholder="blank = all day"
                 ${draftAttrs(state, 'ptoHours')} />
             </label>
             <button type="button" class="btn btn-ghost" id="add-pto">Book it</button>
           </div>
           ${ptoList
             ? `<ul style="list-style:none;margin-top:18px">${ptoList}</ul>`
             : '<p class="field-hint" style="margin-top:14px">Nothing booked yet.</p>'}
         </section>`
      : ''}
  `;
}

/* ── Task types ────────────────────────────────────────────────────────── */

/** Autosave indicator for the Task types page. */
export function taskTypesSaveBar(state) {
  const pending = state.pendingTaskTypes?.size || 0;
  return `
    ${saveStatusHtml(state.taskTypesSaveStatus, pending)}
    ${state.taskTypesSaveStatus === 'failed' || state.taskTypesSaveStatus === 'conflict'
      ? '<button type="button" class="btn btn-ghost btn-sm" id="retry-task-types">Retry</button>'
      : ''}
  `;
}

/** The task-type table alone, so autosave can repaint just it. */
export function renderTaskTypesTable(state) {
  const types = state.taskTypes || [];
  const expanded = state.expandedTaskTypes || new Set();

  const rows = types
    .map((t) => {
      const open = expanded.has(t.id);
      const steps = t.gate_templates || [];
      const fields = t.fields || [];
      const stepRows = steps
        .map(
          (s, i) => `
        <tr data-step-id="${escapeHtml(s.id)}" data-type-id="${escapeHtml(t.id)}">
          <td class="planner-num">${i + 1}</td>
          <td>
            <input class="input input-sm" data-step-field="label" value="${escapeHtml(s.label || '')}" aria-label="Step name" />
          </td>
          <td>
            <input class="input input-sm" data-step-field="duration_days" type="number" step="0.5" min="0.5"
              value="${s.duration_days ?? 1}" aria-label="Duration" style="max-width:90px" />
          </td>
          <td>
            <select class="input input-sm" data-step-field="day_kind" aria-label="Day kind">${optionList(DAY_KINDS, s.day_kind || 'business')}</select>
          </td>
          <td>
            <select class="input input-sm" data-step-field="dep_type" aria-label="Gate kind">${optionList(GATE_TYPES, s.dep_type || 'input_ready')}</select>
          </td>
          <td class="planner-actions">
            <button type="button" class="btn-icon" data-delete-step="${escapeHtml(s.id)}" data-type-id="${escapeHtml(t.id)}" aria-label="Remove step">
              <span aria-hidden="true">×</span>
            </button>
          </td>
        </tr>`,
        )
        .join('');

      const fieldRows = fields
        .map(
          (f, i) => `
        <tr data-field-id="${escapeHtml(f.id)}" data-type-id="${escapeHtml(t.id)}">
          <td class="planner-num">${i + 1}</td>
          <td>
            <input class="input input-sm" data-custom-field="label" value="${escapeHtml(f.label || '')}" aria-label="Field label" />
            <div class="field-hint" style="margin-top:4px">Key: <code>${escapeHtml(f.key)}</code></div>
          </td>
          <td>
            <select class="input input-sm" data-custom-field="field_type" aria-label="Field type">${optionList(FIELD_TYPES, f.field_type || 'text')}</select>
          </td>
          <td>
            <input class="input input-sm" data-custom-field="options"
              value="${escapeHtml(Array.isArray(f.options) ? f.options.join(', ') : '')}"
              aria-label="Select options" placeholder="High, Medium, Low"
              ${f.field_type === 'select' ? '' : ' disabled'} />
          </td>
          <td>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem">
              <input type="checkbox" data-custom-field="required"${f.required ? ' checked' : ''} />
              Required
            </label>
          </td>
          <td class="planner-actions">
            <button type="button" class="btn-icon" data-delete-field="${escapeHtml(f.id)}" data-type-id="${escapeHtml(t.id)}" aria-label="Remove field">
              <span aria-hidden="true">×</span>
            </button>
          </td>
        </tr>`,
        )
        .join('');

      const summaryBits = [];
      summaryBits.push(
        steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'}` : 'No steps',
      );
      if (fields.length) {
        summaryBits.push(`${fields.length} field${fields.length === 1 ? '' : 's'}`);
      }

      return `
      <tr data-id="${escapeHtml(t.id)}">
        <td>
          <button type="button" class="gate-toggle" data-toggle-type="${escapeHtml(t.id)}" aria-expanded="${open}">
            <span class="gate-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
            ${escapeHtml(summaryBits.join(' · '))}
          </button>
        </td>
        <td>
          <input class="input input-sm" data-field="label" value="${escapeHtml(t.label)}" aria-label="Type name" />
          <div class="field-hint" style="margin-top:4px">Key: <code>${escapeHtml(t.key)}</code></div>
        </td>
        <td class="planner-actions">
          <button type="button" class="btn-icon" data-delete-task-type="${escapeHtml(t.id)}" aria-label="Delete ${escapeHtml(t.label)}">
            <span aria-hidden="true">×</span>
          </button>
        </td>
      </tr>
      ${open
        ? `<tr class="gate-drawer" data-drawer-for="${escapeHtml(t.id)}">
             <td colspan="3">
               <div class="gate-drawer-inner">
                 <div class="gate-drawer-head">
                   <div>
                     <div class="gate-drawer-title">Gate template</div>
                     <p class="gate-drawer-hint">Ordered steps applied to a work item. Durations chain from an anchor date (usually the item's start date).</p>
                   </div>
                 </div>
                 <div class="quick-add" style="grid-template-columns:minmax(0,2fr) minmax(0,0.8fr) minmax(0,1.2fr) auto;margin-bottom:14px">
                   <label class="field">
                     <span class="field-label">Step name</span>
                     <input class="input" data-new-step-label="${escapeHtml(t.id)}" placeholder="e.g. Obtain population" autocomplete="off"
                       ${draftAttrs(state, `newStepLabel:${t.id}`)} />
                   </label>
                   <label class="field">
                     <span class="field-label">Days</span>
                     <input class="input" data-new-step-days="${escapeHtml(t.id)}" type="number" step="0.5" min="0.5"
                       ${draftAttrs(state, `newStepDays:${t.id}`, '7')} />
                   </label>
                   <label class="field">
                     <span class="field-label">Count as</span>
                     <select class="input" data-new-step-kind="${escapeHtml(t.id)}" data-draft="newStepKind:${escapeHtml(t.id)}">${optionList(DAY_KINDS, draftValue(state, `newStepKind:${t.id}`, 'business'))}</select>
                   </label>
                   <button type="button" class="btn btn-ghost" data-add-step="${escapeHtml(t.id)}">Add step</button>
                 </div>
                 ${steps.length
                   ? `<div class="table-scroll">
                        <table class="table">
                          <thead><tr><th></th><th>What</th><th>Days</th><th>Count as</th><th>Kind</th><th></th></tr></thead>
                          <tbody>${stepRows}</tbody>
                        </table>
                      </div>`
                   : '<p class="field-hint">No steps yet — add the sequence this type always needs.</p>'}

                 <div class="gate-drawer-head" style="margin-top:28px">
                   <div>
                     <div class="gate-drawer-title">Custom fields</div>
                     <p class="gate-drawer-hint">Extra columns CSV import (and attributes) can fill for this type — e.g. Control ID, Reliance, Sampling.</p>
                   </div>
                 </div>
                 <div class="quick-add" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto;margin-bottom:14px">
                   <label class="field">
                     <span class="field-label">Field label</span>
                     <input class="input" data-new-field-label="${escapeHtml(t.id)}" placeholder="e.g. Control ID" autocomplete="off"
                       ${draftAttrs(state, `newFieldLabel:${t.id}`)} />
                   </label>
                   <label class="field">
                     <span class="field-label">Type</span>
                     <select class="input" data-new-field-type="${escapeHtml(t.id)}" data-draft="newFieldType:${escapeHtml(t.id)}">${optionList(FIELD_TYPES, draftValue(state, `newFieldType:${t.id}`, 'text'))}</select>
                   </label>
                   <button type="button" class="btn btn-ghost" data-add-field="${escapeHtml(t.id)}">Add field</button>
                 </div>
                 ${fields.length
                   ? `<div class="table-scroll">
                        <table class="table">
                          <thead><tr><th></th><th>Label</th><th>Type</th><th>Options (select)</th><th></th><th></th></tr></thead>
                          <tbody>${fieldRows}</tbody>
                        </table>
                      </div>`
                   : '<p class="field-hint">No custom fields yet — add ones that CSV import should map into attributes.</p>'}
               </div>
             </td>
           </tr>`
        : ''}`;
    })
    .join('');

  if (!types.length) {
    return `
      <div class="empty">
        <span class="empty-title">No types yet</span>
        <p class="empty-body">Add your first type above. The usual defaults appear once this workspace loads its catalog.</p>
      </div>`;
  }

  return `
    <section class="panel panel-flush">
      <div class="table-scroll">
        <table class="table" id="task-types-table">
          <thead><tr><th>Template</th><th>Type</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

export function renderTaskTypesView({ state }) {
  const progress = getSetupProgress(state);

  return `
    <div class="page-bar">
      <div class="page-head">
        <p class="eyebrow">Task types</p>
        <h1 class="page-title">Kinds of work</h1>
        <p class="page-lead">
          Set this up <strong>before</strong> listing specific work items. For each type, define the
          fields you track and the dependency gates it needs — then tag Planner rows with that type.
        </p>
      </div>
      <div class="btn-row">
        <span data-section="task-types-savebar">${taskTypesSaveBar(state)}</span>
        ${progress.typesReady
          ? `<a class="btn btn-ghost" href="#/planner">Continue to Planner</a>`
          : ''}
      </div>
    </div>

    ${!progress.typesReady && progress.planReady
      ? `<div class="notice notice-info" style="margin-bottom:16px">
           <strong>Next step after creating a plan.</strong>
           Add or expand a type below — attach fields (with value options) and dependency steps —
           before you list individual work items on the Planner.
         </div>`
      : ''}

    <section class="panel">
      <h2 class="section-title" style="margin-bottom:12px">Add a type</h2>
      <div class="quick-add" style="grid-template-columns:minmax(0,2fr) auto">
        <label class="field">
          <span class="field-label">Name</span>
          <input id="new-task-type-label" class="input" placeholder="e.g. Control Testing" autocomplete="off"
            ${draftAttrs(state, 'newTaskTypeLabel')} />
        </label>
        <button type="button" class="btn btn-primary" id="add-task-type">Add</button>
      </div>
      <p class="field-hint" style="margin-top:10px">
        A key is generated from the name (e.g. Control Testing → control_testing) and stored on plan rows.
      </p>
    </section>

    <div data-section="task-types-table">${renderTaskTypesTable(state)}</div>
  `;
}

/* ── Guide ────────────────────────────────────────────────────────────
   This content existed before but was unreachable: normalizeRoute() mapped
   `home` to `planner` and render() never called renderHome(), so the app's
   clearest explanation of itself could not be opened. It is a real route now,
   and its links point at routes that exist. */

export function renderGuideView({ state }) {
  const progress = getSetupProgress(state);
  const stepState = (id) => {
    const step = progress.steps.find((s) => s.id === id);
    if (!step) return '';
    if (step.done) return ' done';
    return progress.nextStep?.id === id ? ' current' : '';
  };

  return `
    <div class="page-head">
      <p class="eyebrow">How it works</p>
      <h1 class="page-title">One More Column, in five minutes</h1>
      <p class="page-lead">
        The idea: define the kinds of work you track, list the items, say who's around, and let
        the grid tell you where it doesn't fit — without maintaining another workbook by hand.
      </p>
    </div>

    <section class="panel">
      <h2 class="section-title" style="margin-bottom:14px">The flow</h2>
      <ol class="guide-steps">
        <li class="guide-step${stepState('plan')}">
          <div class="guide-step-head">
            <span class="guide-step-num">1</span>
            <h3>Create a plan</h3>
          </div>
          <p>A plan is a named date range you're staffing. Give it a name, a start and an end, and pick whether you think in days, weeks, or months.</p>
          <p><a href="#/plans">Go to Plans →</a></p>
        </li>

        <li class="guide-step${stepState('types')}">
          <div class="guide-step-head">
            <span class="guide-step-num">2</span>
            <h3>Define task types</h3>
          </div>
          <p>Do this <strong>before</strong> listing individual work items. For each kind of work, set the fields you track (with value options) and any dependency gates that type always needs.</p>
          <ul>
            <li><strong>Fields</strong> show up on Planner rows tagged with that type.</li>
            <li><strong>Dependencies</strong> become a one-click gate template on those rows.</li>
          </ul>
          <p><a href="#/task-types">Go to Task types →</a></p>
        </li>

        <li class="guide-step${stepState('work')}">
          <div class="guide-step-head">
            <span class="guide-step-num">3</span>
            <h3>List the work</h3>
          </div>
          <p>One row per thing that needs doing. Pick a type, then fill hours and a due date — those are what land on the capacity grid.</p>
          <ul>
            <li><strong>Type</strong> chooses which fields and gate template apply.</li>
            <li><strong>Details</strong> on each row holds type fields, duration, phase, and gates.</li>
          </ul>
          <p><a href="#/planner">Go to the Planner →</a></p>
        </li>

        <li class="guide-step${stepState('team')}">
          <div class="guide-step-head">
            <span class="guide-step-num">4</span>
            <h3>Add your team</h3>
          </div>
          <p>Name, role, and hours a week each person can give to planned work. Book time off here too — it comes straight out of their available hours.</p>
          <p><a href="#/team">Go to Team →</a></p>
        </li>

        <li class="guide-step${stepState('capacity')}">
          <div class="guide-step-head">
            <span class="guide-step-num">5</span>
            <h3>Check capacity</h3>
          </div>
          <p>Every person against every period. The top number in a cell is hours planned; below it is hours left. Open <strong>Planning rules</strong> at the bottom of the page to tune what counts as amber or red.</p>
          <ul>
            <li><span class="badge badge-ok">Green</span> room to spare</li>
            <li><span class="badge badge-warn">Amber</span> getting tight — no slack for surprises</li>
            <li><span class="badge badge-bad">Red</span> more work than hours</li>
          </ul>
          <p><a href="#/capacity">Go to Capacity →</a></p>
        </li>
      </ol>
    </section>

    <section class="panel">
      <h2 class="section-title" style="margin-bottom:14px">What the words mean</h2>
      <div class="glossary">
        <div class="glossary-card">
          <h3>Plan</h3>
          <p>One named stretch of time you're staffing. Holds its own work, versions, and rules.</p>
        </div>
        <div class="glossary-card">
          <h3>Workspace</h3>
          <p>A separate pool of people and plans. Most people need exactly one, and you already have it.</p>
        </div>
        <div class="glossary-card">
          <h3>Live plan vs draft</h3>
          <p>The live plan is what everyone works from. A draft is a scratch copy for trying "what if" without touching it.</p>
        </div>
        <div class="glossary-card">
          <h3>Task type</h3>
          <p>A kind of work you track — with its own fields and dependency template. Set these up before listing individual items.</p>
        </div>
        <div class="glossary-card">
          <h3>Gate</h3>
          <p>Something that must happen before a row can start. Open gates push out its can-start date on the Planner.</p>
        </div>
        <div class="glossary-card">
          <h3>Due period vs spread</h3>
          <p>Whether an item's hours all land in the period it's due, or get spread across the days it runs.</p>
        </div>
        <div class="glossary-card">
          <h3>Where data lives</h3>
          <p>Everything you type is saved to this app's own database. There's no live sync with Jira or anything else.</p>
        </div>
      </div>
    </section>
  `;
}
