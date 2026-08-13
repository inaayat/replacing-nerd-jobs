import { initAuth, wireAuthLink, refreshToken } from './auth.js';
import {
  meApi,
  workspacesApi,
  cyclesApi,
  scenariosApi,
  policyApi,
  resourcesApi,
  planItemsApi,
  dependenciesApi,
  importApi,
  capacityApi,
  changelogApi,
  exportApi,
  timeOffApi,
  taskTypesApi,
  configureApiAuth,
} from './api.js';
import {
  renderShell,
  renderContext,
  escapeHtml,
  toast,
  confirmDialog,
  promptDialog,
  withBusy,
  patchSection,
  focusWithinSection,
} from './shell.js';
import {
  renderPlansView,
  renderPlannerView,
  renderPlannerTable,
  plannerSaveBar,
  renderCapacityView,
  renderTeamView,
  teamSaveBar,
  renderTaskTypesView,
  renderTaskTypesTable,
  taskTypesSaveBar,
  renderGuideView,
  rowStatusHtml,
  planOptions,
  workspaceOptions,
} from './views.js';
import { renderWizard, blankWizard, validateStep, wizardEchoHtml } from './wizard.js';
import { getInitialRoute, resolveRoute, navItems, normalizeRoute, postPlanRoute } from './setup.js';
import {
  planItemPatch,
  dependencyPatch,
  resourcePatch,
  taskTypePatch,
  policyConfig,
  slugifyFieldKey,
} from './patches.js';

const APP_PATH = '/one-more-column/';
const WORKSPACE_KEY = 'omc_active_workspace_id';
const SCENARIO_KEY = 'omc_active_scenario_id';

const state = {
  auth: null,
  me: null,
  token: null,
  workspaces: [],
  activeWorkspaceId: null,
  cycles: [],
  activeCycleId: null,
  scenarios: [],
  activeScenarioId: null,
  resources: [],
  teams: [],
  taskTypes: [],
  policy: null,
  capacity: null,
  planItems: [],
  dependencies: [],
  readiness: [],
  importPreview: null,
  importSectionOpen: false,
  importTaskTypeId: '',
  rulesSectionOpen: false,
  changelog: [],
  activeTeamFilter: '',
  capacityGranularity: 'week',

  /** Rows whose detail drawer is open, kept across re-renders. */
  expandedRows: new Set(),
  /** Task types whose gate-template drawer is open. */
  expandedTaskTypes: new Set(),

  /** Scratch input values — quick-add rows, pasted CSV, threshold fields.
   *  Written through on every keystroke so a repaint redraws them instead of
   *  needing to read them back out of the DOM first. */
  draft: {},

  /** Rows with a save in flight or queued, per page. */
  pendingRows: new Set(),
  pendingResources: new Set(),
  pendingTaskTypes: new Set(),
  /** id → kind, so a queued save knows which endpoint to call. */
  targetKinds: new Map(),
  /** Rows the server refused because someone else got there first. */
  conflictRows: new Set(),
  /** Rows whose save failed outright. Still pending, so Retry has something. */
  failedRows: new Set(),

  /** Per-row save state, keyed by id, rendered into the row's status cell. */
  rowStatus: {},
  resourceStatus: {},
  /** Page-level save state: saving | saved | failed | conflict. */
  saveStatus: null,
  teamSaveStatus: null,
  taskTypesSaveStatus: null,

  /** Reversible field edits, newest last. */
  undoStack: [],

  redirectedFrom: null,
  wizard: blankWizard(),
};

/* ── Routing ──────────────────────────────────────────────────────────── */

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || '';
  const raw = hash.split('?')[0] || '';
  // An empty hash (date pickers under <base href> sometimes write `#`) must not
  // yank an open wizard onto Planner.
  if (!raw && state.wizard?.open) return 'plans';
  return normalizeRoute(raw || 'planner');
}

function navigate(route) {
  location.hash = `#/${route}`;
}

/* ── Write-through binding ────────────────────────────────────────────
   Every input writes its value straight into state as it is typed, so state is
   always the truth and nothing ever has to be read back out of the DOM. That
   removes the two workarounds this layer replaced: a capture pass before each
   render, and a focus snapshot/restore around it. */

const WIZARD_FIELDS = {
  'wiz-name': ['name'],
  'wiz-start': ['start'],
  'wiz-end': ['end'],
  'wiz-new-workspace': ['newWorkspaceName'],
  'wiz-person-name': ['person', 'name'],
  'wiz-person-role': ['person', 'role'],
  'wiz-person-hours': ['person', 'hours'],
};

function numberOrUndefined(raw) {
  if (raw === '' || raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function setAttribute(item, key, value) {
  item.attributes = { ...(item.attributes || {}) };
  if (value === undefined || value === null || value === '') delete item.attributes[key];
  else item.attributes[key] = value;
}

/** Writes one element's value into state. Returns the row to save, if any. */
function applyEdit(el) {
  const draftKey = el.dataset.draft;
  if (draftKey) {
    state.draft[draftKey] = el.type === 'checkbox' ? el.checked : el.value;
    return null;
  }

  const wizardPath = WIZARD_FIELDS[el.id];
  if (wizardPath) {
    const [head, tail] = wizardPath;
    if (tail) state.wizard[head][tail] = el.value;
    else state.wizard[head] = el.value;
    return null;
  }

  const gate = el.closest('.gate-item[data-dep-id]');
  if (gate) return applyDependencyEdit(gate.dataset.depId, el);

  const drawer = el.closest('.gate-drawer[data-drawer-for]');
  if (drawer && el.closest('#task-types-table')) return applyTaskTypeEdit(el);
  if (drawer) return applyPlanItemEdit(drawer.dataset.drawerFor, el);

  if (el.closest('#task-types-table')) return applyTaskTypeEdit(el);

  const plannerRow = el.closest('.planner-row[data-id]');
  if (plannerRow) return applyPlanItemEdit(plannerRow.dataset.id, el);

  const teamRow = el.closest('[data-section="team-table"] tr[data-id]');
  if (teamRow) return applyResourceEdit(teamRow.dataset.id, el);

  return null;
}

function snapshotPlanItem(item) {
  return {
    title: item.title,
    work_hours: item.work_hours,
    due_week: item.due_week,
    phase: item.phase,
    attributes: { ...(item.attributes || {}) },
  };
}

function applyPlanItemEdit(id, el) {
  const item = state.planItems.find((p) => p.id === id);
  if (!item) return null;
  const before = snapshotPlanItem(item);
  const field = el.dataset.field;
  const attrField = el.dataset.attrField;

  if (attrField) {
    const raw = el.value;
    setAttribute(item, attrField, el.type === 'number' ? numberOrUndefined(raw) : raw);
  } else if (field === 'title') {
    item.title = el.value;
  } else if (field === 'work_hours') {
    item.work_hours = Number(el.value) || 0;
  } else if (field === 'due_week') {
    item.due_week = el.value || null;
  } else if (field === 'phase') {
    item.phase = el.value || null;
  } else if (field === 'start_date') {
    setAttribute(item, 'start_date', el.value);
  } else if (field === 'task_type') {
    setAttribute(item, 'task_type', el.value);
  } else if (field === 'duration_days') {
    setAttribute(item, 'duration_days', numberOrUndefined(el.value));
  } else {
    return null;
  }

  pushUndo({
    key: `planItem:${id}:${attrField || field}`,
    restore: () => {
      const live = state.planItems.find((p) => p.id === id);
      if (live) Object.assign(live, before, { attributes: { ...before.attributes } });
    },
    target: { kind: 'planItem', id },
  });
  return { kind: 'planItem', id };
}

function applyDependencyEdit(id, el) {
  const dep = state.dependencies.find((d) => d.id === id);
  if (!dep) return null;
  const before = { label: dep.label, from_plan_item_id: dep.from_plan_item_id, status: dep.status, dep_type: dep.dep_type, meta: { ...(dep.meta || {}) } };
  const field = el.dataset.field;

  if (field === 'label') dep.label = el.value;
  else if (field === 'from_plan_item_id') dep.from_plan_item_id = el.value || null;
  else if (field === 'dep_status') dep.status = el.value;
  else if (field === 'dep_type') dep.dep_type = el.value;
  else if (field === 'dep_due') dep.meta = el.value ? { ...(dep.meta || {}), due_date: el.value } : {};
  else return null;

  pushUndo({
    key: `dependency:${id}:${field}`,
    restore: () => {
      const live = state.dependencies.find((d) => d.id === id);
      if (live) Object.assign(live, before, { meta: { ...before.meta } });
    },
    target: { kind: 'dependency', id },
  });
  return { kind: 'dependency', id };
}

function applyResourceEdit(id, el) {
  const resource = state.resources.find((r) => r.id === id);
  if (!resource) return null;
  const field = el.dataset.field;

  if (field === 'name') resource.name = el.value;
  else if (field === 'team') resource.team = el.value || null;
  else if (field === 'weekly_hours') {
    const weekly = Number(el.value) || 0;
    if (resource.profiles?.length) resource.profiles[0].weekly_hours = weekly;
    else resource.profiles = [{ weekly_hours: weekly }];
  } else return null;

  return { kind: 'resource', id };
}

function applyTaskTypeEdit(el) {
  const stepRow = el.closest('tr[data-step-id]');
  if (stepRow) {
    const type = state.taskTypes.find((t) => t.id === stepRow.dataset.typeId);
    const step = (type?.gate_templates || []).find((s) => s.id === stepRow.dataset.stepId);
    if (!step) return null;
    const field = el.dataset.stepField;
    if (field === 'label') step.label = el.value;
    else if (field === 'duration_days') step.duration_days = Number(el.value) || 1;
    else if (field === 'day_kind') step.day_kind = el.value;
    else if (field === 'dep_type') step.dep_type = el.value;
    else return null;
    return { kind: 'taskType', id: type.id };
  }

  const fieldRow = el.closest('tr[data-field-id]');
  if (fieldRow) {
    const type = state.taskTypes.find((t) => t.id === fieldRow.dataset.typeId);
    const field = (type?.fields || []).find((f) => f.id === fieldRow.dataset.fieldId);
    if (!field) return null;
    const which = el.dataset.customField;
    if (which === 'label') field.label = el.value;
    else if (which === 'field_type') field.field_type = el.value;
    else if (which === 'options') {
      field.options = el.value
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    } else if (which === 'required') field.required = Boolean(el.checked);
    else return null;
    return { kind: 'taskType', id: type.id };
  }

  const typeRow = el.closest('tr[data-id]');
  if (typeRow && el.dataset.field === 'label') {
    const type = state.taskTypes.find((t) => t.id === typeRow.dataset.id);
    if (!type) return null;
    type.label = el.value;
    return { kind: 'taskType', id: type.id };
  }

  return null;
}

/* ── Undo ─────────────────────────────────────────────────────────────
   Autosave means a mistyped cell is persisted a moment later, so there has to
   be a way back. Consecutive edits to the same field collapse into one entry so
   Undo steps over a word, not a letter. */

const UNDO_COALESCE_MS = 1500;
const UNDO_LIMIT = 50;

function pushUndo(entry) {
  const last = state.undoStack[state.undoStack.length - 1];
  const now = Date.now();
  if (last && last.key === entry.key && now - last.at < UNDO_COALESCE_MS) {
    last.at = now;
    return;
  }
  state.undoStack.push({ ...entry, at: now });
  if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
}

function undoLast() {
  const entry = state.undoStack.pop();
  if (!entry) return;
  entry.restore();
  repaintPlanner();
  queueSave(entry.target, { immediate: true });
}

/* ── Autosave ─────────────────────────────────────────────────────────
   Edits save themselves a short pause after typing stops, one row at a time, so
   a failure names the row it belongs to instead of failing the whole grid. */

const SAVE_DEBOUNCE_MS = 700;
const SAVED_BADGE_MS = 2000;
const saveTimers = new Map();

function pendingSetFor(kind) {
  if (kind === 'resource') return state.pendingResources;
  if (kind === 'taskType') return state.pendingTaskTypes;
  return state.pendingRows;
}

function statusBagFor(kind) {
  return kind === 'resource' ? state.resourceStatus : state.rowStatus;
}

function setRowStatus(kind, id, status) {
  const bag = statusBagFor(kind);
  if (status) bag[id] = status;
  else delete bag[id];

  const cell = document.querySelector(`[data-row-status="${CSS.escape(id)}"]`);
  if (cell) cell.innerHTML = rowStatusHtml(status);

  if (status === 'saved') {
    setTimeout(() => {
      if (bag[id] !== 'saved') return;
      delete bag[id];
      const later = document.querySelector(`[data-row-status="${CSS.escape(id)}"]`);
      if (later) later.innerHTML = '';
    }, SAVED_BADGE_MS);
  }
}

function setPageStatus(kind, status) {
  if (kind === 'resource') state.teamSaveStatus = status;
  else if (kind === 'taskType') state.taskTypesSaveStatus = status;
  else state.saveStatus = status;
  updateSaveBars();
}

/** Repaints the save indicators, skipping any the user is focused inside. */
function updateSaveBars() {
  if (!focusWithinSection('planner-savebar')) patchSection('planner-savebar', plannerSaveBar(state));
  if (!focusWithinSection('team-savebar')) patchSection('team-savebar', teamSaveBar(state));
  if (!focusWithinSection('task-types-savebar')) {
    patchSection('task-types-savebar', taskTypesSaveBar(state));
  }
}

function queueSave(target, { immediate = false } = {}) {
  if (!target) return;
  const key = `${target.kind}:${target.id}`;
  pendingSetFor(target.kind).add(target.id);
  state.targetKinds.set(target.id, target.kind);
  setPageStatus(target.kind, null);

  clearTimeout(saveTimers.get(key));
  if (immediate) {
    saveTimers.delete(key);
    guard(() => saveTarget(target));
    return;
  }
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key);
      guard(() => saveTarget(target));
    }, SAVE_DEBOUNCE_MS),
  );
}

async function saveTarget(target, { force = false } = {}) {
  if (target.kind === 'planItem') return savePlanItemRow(target.id, { force });
  if (target.kind === 'dependency') return saveDependencyRow(target.id, { force });
  if (target.kind === 'resource') return saveResourceRow(target.id);
  if (target.kind === 'taskType') return saveTaskTypeRow(target.id);
  return undefined;
}

/** Settles the page indicator. A row that failed stays pending and stays loud. */
function settle(kind) {
  const pending = pendingSetFor(kind);
  const ids = [...pending];
  if (ids.some((id) => state.conflictRows.has(id))) {
    setPageStatus(kind, 'conflict');
    return;
  }
  if (ids.some((id) => state.failedRows.has(id))) {
    setPageStatus(kind, 'failed');
    return;
  }
  setPageStatus(kind, pending.size ? null : 'saved');
}

/**
 * A failed row is deliberately left in the pending set: it is still unsaved, so
 * Retry has something to act on and the unload warning still fires.
 */
function onSaveFailure(kind, id, err) {
  pendingSetFor(kind).add(id);
  state.targetKinds.set(id, kind);

  if (err.status === 409) {
    state.conflictRows.add(id);
    setRowStatus(kind, id, 'conflict');
    setPageStatus(kind, 'conflict');
    // Adopt the server's guard so Retry is a deliberate overwrite rather than
    // another rejection.
    const current = err.data?.conflicts?.[0]?.current;
    if (current) adoptGuard(kind, id, current.updated_at);
    toast(
      'Someone else changed this row. Retry to keep your version, or reload to see theirs.',
      'warn',
      6000,
    );
    return;
  }

  state.failedRows.add(id);
  setRowStatus(kind, id, 'failed');
  setPageStatus(kind, 'failed');
  toast(err.message || "That change didn't save", 'error');
}

function adoptGuard(kind, id, updatedAt) {
  if (!updatedAt) return;
  const list = kind === 'dependency' ? state.dependencies : state.planItems;
  const row = list.find((r) => r.id === id);
  if (row) row.updated_at = updatedAt;
}

async function savePlanItemRow(id, { force = false } = {}) {
  const item = state.planItems.find((p) => p.id === id);
  if (!item) {
    state.pendingRows.delete(id);
    settle('planItem');
    return;
  }

  setRowStatus('planItem', id, 'saving');
  setPageStatus('planItem', 'saving');
  try {
    const { plan_items } = await planItemsApi.patchOne(state.token, planItemPatch(item), { force });
    if (plan_items?.[0]) item.updated_at = plan_items[0].updated_at;
    state.pendingRows.delete(id);
    state.conflictRows.delete(id);
    state.failedRows.delete(id);
    setRowStatus('planItem', id, 'saved');
    settle('planItem');
  } catch (err) {
    state.pendingRows.delete(id);
    onSaveFailure('planItem', id, err);
  }
}

async function saveDependencyRow(id, { force = false } = {}) {
  const dep = state.dependencies.find((d) => d.id === id);
  if (!dep) {
    state.pendingRows.delete(id);
    settle('dependency');
    return;
  }

  setRowStatus('dependency', id, 'saving');
  setPageStatus('dependency', 'saving');
  try {
    const { dependencies } = await dependenciesApi.patchOne(state.token, dependencyPatch(dep), {
      force,
    });
    if (dependencies?.[0]) dep.updated_at = dependencies[0].updated_at;
    state.pendingRows.delete(id);
    state.conflictRows.delete(id);
    state.failedRows.delete(id);
    setRowStatus('dependency', id, 'saved');
    // Gates drive the readiness column, so refresh it once the write lands.
    await loadDependencies();
    repaintPlanner();
    settle('dependency');
  } catch (err) {
    state.pendingRows.delete(id);
    onSaveFailure('dependency', id, err);
  }
}

async function saveResourceRow(id) {
  const resource = state.resources.find((r) => r.id === id);
  if (!resource) {
    state.pendingResources.delete(id);
    settle('resource');
    return;
  }

  setRowStatus('resource', id, 'saving');
  setPageStatus('resource', 'saving');
  try {
    await resourcesApi.patchOne(state.token, state.activeWorkspaceId, resourcePatch(resource));
    state.pendingResources.delete(id);
    state.failedRows.delete(id);
    setRowStatus('resource', id, 'saved');
    settle('resource');
  } catch (err) {
    state.pendingResources.delete(id);
    onSaveFailure('resource', id, err);
  }
}

async function saveTaskTypeRow(id) {
  const type = state.taskTypes.find((t) => t.id === id);
  if (!type) {
    state.pendingTaskTypes.delete(id);
    settle('taskType');
    return;
  }

  setPageStatus('taskType', 'saving');
  try {
    await taskTypesApi.patch(state.token, state.activeWorkspaceId, taskTypePatch(type));
    state.pendingTaskTypes.delete(id);
    state.failedRows.delete(id);
    settle('taskType');
  } catch (err) {
    state.pendingTaskTypes.delete(id);
    onSaveFailure('taskType', id, err);
  }
}

/** Runs every queued save now. Used before anything that reloads from server. */
async function flushSaves() {
  const targets = [
    ...[...state.pendingRows],
    ...[...state.pendingResources],
    ...[...state.pendingTaskTypes],
  ].map((id) => ({ kind: state.targetKinds.get(id) || 'planItem', id }));

  for (const target of targets) {
    const key = `${target.kind}:${target.id}`;
    clearTimeout(saveTimers.get(key));
    saveTimers.delete(key);
    await saveTarget(target);
  }
}

/**
 * Re-sends whatever didn't land. A row that lost a race is forced, because
 * clicking Retry is the user saying to keep their version; a row that merely
 * failed is retried under its original guard.
 */
async function retryFailed(kind) {
  const ids = [...pendingSetFor(kind)].filter(
    (id) => state.conflictRows.has(id) || state.failedRows.has(id),
  );
  for (const id of ids) {
    const force = state.conflictRows.has(id);
    await saveTarget({ kind: state.targetKinds.get(id) || 'planItem', id }, { force });
  }
  settle(kind);
}

function repaintPlanner() {
  patchSection('planner-table', renderPlannerTable(state));
  updateSaveBars();
}

function clearSaveState() {
  for (const timer of saveTimers.values()) clearTimeout(timer);
  saveTimers.clear();
  state.pendingRows.clear();
  state.pendingResources.clear();
  state.pendingTaskTypes.clear();
  state.conflictRows.clear();
  state.failedRows.clear();
  state.targetKinds.clear();
  state.rowStatus = {};
  state.resourceStatus = {};
  state.saveStatus = null;
  state.teamSaveStatus = null;
  state.taskTypesSaveStatus = null;
  state.undoStack = [];
}

function hasUnsavedWork() {
  return Boolean(
    state.pendingRows.size || state.pendingResources.size || state.pendingTaskTypes.size,
  );
}

/* ── Data loading ─────────────────────────────────────────────────────── */

function persistWorkspace() {
  if (state.activeWorkspaceId) localStorage.setItem(WORKSPACE_KEY, state.activeWorkspaceId);
}

async function loadWorkspaces() {
  const { workspaces } = await workspacesApi.list(state.token);
  state.workspaces = workspaces;

  const stored = localStorage.getItem(WORKSPACE_KEY);
  if (stored && workspaces.some((w) => w.id === stored)) {
    state.activeWorkspaceId = stored;
  } else if (workspaces.length) {
    state.activeWorkspaceId = workspaces[0].id;
    persistWorkspace();
  } else {
    state.activeWorkspaceId = null;
  }
}

async function loadCoreData() {
  const token = state.token;
  if (!state.activeWorkspaceId) {
    Object.assign(state, {
      cycles: [],
      resources: [],
      teams: [],
      taskTypes: [],
      policy: null,
      planItems: [],
      scenarios: [],
      activeScenarioId: null,
      activeCycleId: null,
    });
    return;
  }

  const [{ cycles }, { resources, teams }, { task_types }] = await Promise.all([
    cyclesApi.list(token, state.activeWorkspaceId),
    resourcesApi.list(token, state.activeWorkspaceId),
    taskTypesApi.list(token, state.activeWorkspaceId),
  ]);
  state.cycles = cycles;
  state.resources = resources;
  state.teams = teams;
  state.taskTypes = task_types || [];
  clearSaveState();

  if (state.activeCycleId && !cycles.some((c) => c.id === state.activeCycleId)) {
    state.activeCycleId = null;
    state.activeScenarioId = null;
  }
  if (!state.activeCycleId && cycles.length) state.activeCycleId = cycles[0].id;

  if (state.activeCycleId) {
    const { policy } = await policyApi.get(token, state.activeCycleId);
    state.policy = policy;
    const tracking = policy?.config?.tracking_granularity;
    if (tracking === 'month' || tracking === 'week' || tracking === 'day') {
      state.capacityGranularity = tracking;
    }
    await loadScenarioData();
  }
}

async function loadScenarioData() {
  const token = state.token;
  if (!state.activeCycleId) return;

  const { scenarios } = await scenariosApi.list(token, state.activeCycleId);
  state.scenarios = scenarios;

  const stored = localStorage.getItem(SCENARIO_KEY);
  if (stored && scenarios.some((s) => s.id === stored)) {
    state.activeScenarioId = stored;
  } else if (state.activeScenarioId && scenarios.some((s) => s.id === state.activeScenarioId)) {
    // keep the current selection
  } else if (scenarios.length) {
    const active = scenarios.find((s) => s.status === 'active') || scenarios[0];
    state.activeScenarioId = active.id;
    localStorage.setItem(SCENARIO_KEY, active.id);
  } else {
    state.activeScenarioId = null;
  }

  if (state.activeScenarioId) {
    const { plan_items } = await planItemsApi.list(token, { scenario: state.activeScenarioId });
    state.planItems = plan_items;
    try {
      await loadDependencies();
    } catch (err) {
      console.error(err);
      if (!Array.isArray(state.dependencies)) state.dependencies = [];
      toast(err.message || 'Could not load gates', 'warn');
    }
  } else {
    state.planItems = [];
    state.dependencies = [];
    state.readiness = [];
  }
  clearSaveState();
}

async function loadDependencies() {
  if (!state.activeCycleId || !state.activeScenarioId) {
    state.dependencies = [];
    state.readiness = [];
    return;
  }
  const { dependencies, readiness } = await dependenciesApi.list(state.token, {
    cycle: state.activeCycleId,
    scenario: state.activeScenarioId,
  });
  state.dependencies = dependencies;
  state.readiness = readiness;
}

async function loadCapacity(mode, granularity = state.capacityGranularity) {
  if (!state.activeCycleId) {
    state.capacity = null;
    return;
  }
  const resolvedMode = mode || document.getElementById('cap-mode')?.value || 'due';
  state.capacity = await capacityApi.get(state.token, {
    cycle: state.activeCycleId,
    scenario: state.activeScenarioId || undefined,
    team: state.activeTeamFilter || undefined,
    mode: resolvedMode,
    granularity,
  });
  state.capacityGranularity = granularity;
}

async function loadChangelog() {
  if (!state.activeCycleId) {
    state.changelog = [];
    return;
  }
  const { changelog } = await changelogApi.list(state.token, state.activeCycleId);
  state.changelog = changelog;
}

/** Loads whatever the given route needs beyond core data. */
async function loadForRoute(route) {
  if (route === 'capacity') {
    await Promise.all([loadCapacity(), loadChangelog()]);
  }
}

/* ── Wizard ───────────────────────────────────────────────────────────── */

function openWizard() {
  state.wizard = blankWizard();
  state.wizard.open = true;
  state.redirectedFrom = null;
  render();
}

function closeWizard() {
  state.wizard.open = false;
  render();
}

async function createPlanFromWizard(button) {
  const wizard = state.wizard;
  const errors = validateStep(wizard, 1);
  if (Object.keys(errors).length) {
    wizard.errors = errors;
    wizard.step = 1;
    render();
    toast('Some details still need fixing', 'error');
    return;
  }

  await withBusy(button, 'Creating…', async () => {
    let workspaceId = state.activeWorkspaceId;
    if (wizard.useNewWorkspace) {
      const { workspace } = await workspacesApi.create(state.token, {
        name: wizard.newWorkspaceName.trim(),
        profile: 'default',
      });
      workspaceId = workspace.id;
    }
    state.activeWorkspaceId = workspaceId;
    persistWorkspace();

    const result = await cyclesApi.create(state.token, workspaceId, {
      name: wizard.name.trim(),
      cycle_type: 'custom',
      start_date: wizard.start,
      end_date: wizard.end,
      policy: { tracking_granularity: wizard.granularity },
    });
    state.activeCycleId = result.cycle.id;
    state.activeScenarioId = result.default_scenario_id || null;
    if (state.activeScenarioId) localStorage.setItem(SCENARIO_KEY, state.activeScenarioId);

    for (const person of wizard.people) {
      await resourcesApi.create(state.token, workspaceId, {
        name: person.name,
        team: person.role || null,
        weekly_hours: Number(person.hours) || 32,
      });
    }

    state.wizard = blankWizard();
    await loadWorkspaces();
    await loadCoreData();
    toast(`"${result.cycle.name}" is ready — define your task types next`);
    navigate(postPlanRoute(state));
    render();
  });
}

function wireWizardEvents() {
  const wizard = state.wizard;

  document.getElementById('wiz-show-workspace')?.addEventListener('click', () => {
    wizard.showWorkspace = true;
    render();
  });

  document.querySelectorAll('[data-ws-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizard.useNewWorkspace = btn.dataset.wsMode === 'new';
      render();
    });
  });

  document.getElementById('wiz-workspace')?.addEventListener('change', (e) => {
    state.activeWorkspaceId = e.target.value;
    persistWorkspace();
  });

  document.querySelectorAll('input[name="wiz-granularity"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      wizard.granularity = radio.value;
      document.querySelectorAll('#app-root label.choice').forEach((label) => {
        const input = label.querySelector('input[name="wiz-granularity"]');
        label.classList.toggle('selected', input?.value === wizard.granularity);
      });
      patchSection('wizard-echo', wizardEchoHtml(wizard));
    });
  });

  // Write-through already keeps wizard state current. Patch only the summary
  // so date inputs stay attached — a full render() here was destroying the
  // native picker and sending the leftover click to `#/planner`.
  ['wiz-name', 'wiz-start', 'wiz-end'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => patchSection('wizard-echo', wizardEchoHtml(wizard)));
    el?.addEventListener('change', () => patchSection('wizard-echo', wizardEchoHtml(wizard)));
  });

  document.getElementById('wiz-next')?.addEventListener('click', () => {
    const errors = validateStep(wizard, wizard.step);
    wizard.errors = errors;
    if (Object.keys(errors).length) {
      render();
      return;
    }
    wizard.step = Math.min(wizard.step + 1, 3);
    render();
  });

  document.getElementById('wiz-back')?.addEventListener('click', () => {
    wizard.step = Math.max(1, wizard.step - 1);
    render();
  });

  document.getElementById('wiz-skip')?.addEventListener('click', () => {
    wizard.person = { name: '', role: '', hours: '32' };
    wizard.step = 3;
    render();
  });

  document.getElementById('wiz-add-person')?.addEventListener('click', () => {
    const person = wizard.person;
    if (!person.name.trim()) {
      document.getElementById('wiz-person-name')?.focus();
      return;
    }
    wizard.people.push({
      name: person.name.trim(),
      role: person.role.trim(),
      hours: Number(person.hours) || 32,
    });
    wizard.person = { name: '', role: '', hours: '32' };
    render();
    document.getElementById('wiz-person-name')?.focus();
  });

  document.querySelectorAll('[data-remove-person]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wizard.people.splice(Number(btn.dataset.removePerson), 1);
      render();
    });
  });

  document.getElementById('wiz-create')?.addEventListener('click', (e) => {
    guard(() => createPlanFromWizard(e.currentTarget));
  });

  document.getElementById('wiz-cancel')?.addEventListener('click', closeWizard);
}

/* ── Shared event helpers ─────────────────────────────────────────────── */

/** Runs an async handler, surfacing failures as a toast instead of a crash.
 *  fn is invoked synchronously so handlers can still read event.currentTarget,
 *  which the browser nulls out once dispatch finishes. */
function guard(fn) {
  const onError = (err) => {
    console.error(err);
    toast(err.message || 'Something went wrong', 'error');
  };
  try {
    return Promise.resolve(fn()).catch(onError);
  } catch (err) {
    onError(err);
    return Promise.resolve();
  }
}

/* ── Delegated events ─────────────────────────────────────────────────
   Regions that repaint on their own — the two grids and the save indicators —
   can't own their listeners, because replacing their markup would throw those
   listeners away. One listener on the app root outlives every repaint. */

function repaintTaskTypes() {
  patchSection('task-types-table', renderTaskTypesTable(state));
  updateSaveBars();
}

/** Puts the caret back after a repaint the user's own change triggered. */
function refocus(rowId, selector) {
  if (!rowId) return;
  const el = document.querySelector(`[data-id="${CSS.escape(rowId)}"] ${selector}`);
  el?.focus();
}

function onDelegatedEdit(e) {
  const el = e.target;
  if (!el?.matches?.('input, select, textarea')) return;

  const target = applyEdit(el);
  if (target) queueSave(target);

  // Two selects change what their neighbours should render, so they repaint the
  // grid they live in. Both are `change` on a select, so nothing is mid-typing.
  if (e.type !== 'change') return;

  if (el.dataset.field === 'task_type') {
    const row = el.closest('.planner-row[data-id]');
    if (row && state.expandedRows.has(row.dataset.id)) {
      repaintPlanner();
      refocus(row.dataset.id, '[data-field="task_type"]');
    }
    return;
  }

  if (el.dataset.customField === 'field_type') {
    const row = el.closest('tr[data-field-id]');
    repaintTaskTypes();
    if (row) {
      const fresh = document.querySelector(
        `tr[data-field-id="${CSS.escape(row.dataset.fieldId)}"] [data-custom-field="field_type"]`,
      );
      fresh?.focus();
    }
  }
}

function onDelegatedClick(e) {
  const addGateBtn = e.target.closest('[data-add-gate]');
  if (addGateBtn) {
    e.preventDefault();
    return void guard(() => addGate(addGateBtn.dataset.addGate));
  }

  const el = e.target.closest('button');
  if (!el) return;
  const d = el.dataset;

  if (el.id === 'undo-planner') return void undoLast();
  if (el.id === 'retry-planner') {
    return void guard(() => withBusy(el, 'Retrying…', () => retryFailed('planItem')));
  }
  if (el.id === 'retry-team') {
    return void guard(() => withBusy(el, 'Retrying…', () => retryFailed('resource')));
  }
  if (el.id === 'retry-task-types') {
    return void guard(() => withBusy(el, 'Retrying…', () => retryFailed('taskType')));
  }

  if (d.toggleRow) {
    const id = d.toggleRow;
    if (state.expandedRows.has(id)) state.expandedRows.delete(id);
    else state.expandedRows.add(id);
    // Only the grid changed, so anything being typed elsewhere is left alone.
    return void repaintPlanner();
  }

  if (d.toggleType) {
    const id = d.toggleType;
    if (state.expandedTaskTypes.has(id)) state.expandedTaskTypes.delete(id);
    else state.expandedTaskTypes.add(id);
    return void repaintTaskTypes();
  }

  if (d.applyGateTemplate) {
    return void guard(() => applyGateTemplate(d.applyGateTemplate, d.taskTypeId));
  }
  if (d.deleteGate) return void guard(() => deleteGate(d.deleteGate));
  if (d.deleteItem) return void guard(() => deletePlanItem(d.deleteItem));
  if (d.deleteResource) return void guard(() => deleteResource(d.deleteResource));
  if (d.deleteTaskType) return void guard(() => deleteTaskType(d.deleteTaskType));
  if (d.addStep) return void guard(() => addGateStep(d.addStep));
  if (d.deleteStep) return void guard(() => deleteGateStep(d.typeId, d.deleteStep));
  if (d.addField) return void guard(() => addCustomField(d.addField));
  if (d.deleteField) return void guard(() => deleteCustomField(d.typeId, d.deleteField));
}

/* ── Planner row actions ──────────────────────────────────────────────── */

async function addGate(planItemId) {
  await flushSaves();
  const { dependency } = await dependenciesApi.create(state.token, {
    cycle_id: state.activeCycleId,
    to_plan_item_id: planItemId,
    dep_type: 'input_ready',
    label: '',
  });
  if (dependency) {
    state.dependencies = [...(state.dependencies || []), dependency];
  }
  state.expandedRows.add(planItemId);
  repaintPlanner();
  try {
    await loadDependencies();
    repaintPlanner();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Gate saved, but the list could not refresh', 'warn');
  }
}

async function applyGateTemplate(itemId, taskTypeId) {
  const item = state.planItems.find((p) => p.id === itemId);
  const today = new Date().toISOString().slice(0, 10);
  const defaultAnchor =
    (item?.attributes?.start_date && String(item.attributes.start_date).slice(0, 10)) || today;

  const result = await promptDialog({
    title: 'Apply gate template',
    body: 'Due dates are chained from this anchor — each step starts after the previous one finishes. You can edit any gate afterward.',
    label: 'Anchor date',
    value: defaultAnchor,
    confirmLabel: 'Create gates',
    inputType: 'date',
  });
  if (!result) return;

  await flushSaves();
  const { count } = await dependenciesApi.applyGateTemplate(state.token, {
    plan_item_id: itemId,
    task_type_id: taskTypeId,
    anchor_date: result.value,
  });
  state.expandedRows.add(itemId);
  await loadScenarioData();
  toast(`Added ${count} gate${count === 1 ? '' : 's'}`);
  repaintPlanner();
}

async function deleteGate(depId) {
  await flushSaves();
  await dependenciesApi.delete(state.token, depId);
  await loadScenarioData();
  toast('Gate removed');
  repaintPlanner();
}

async function deletePlanItem(id) {
  const item = state.planItems.find((p) => p.id === id);
  const ok = await confirmDialog({
    title: 'Delete this row?',
    body: `"${escapeHtml(item?.title || 'Untitled')}" and any gates on it will be removed.`,
    confirmLabel: 'Delete row',
    danger: true,
  });
  if (!ok) return;
  await flushSaves();
  await planItemsApi.delete(state.token, id);
  state.expandedRows.delete(id);
  await loadScenarioData();
  toast('Row deleted');
  repaintPlanner();
}

/* ── Team row actions ─────────────────────────────────────────────────── */

async function deleteResource(id) {
  const resource = state.resources.find((r) => r.id === id);
  const ok = await confirmDialog({
    title: `Remove ${resource?.name || 'this person'}?`,
    body: 'Their time off goes too, and they disappear from the capacity grid.',
    confirmLabel: 'Remove',
    danger: true,
  });
  if (!ok) return;
  await flushSaves();
  await resourcesApi.delete(state.token, state.activeWorkspaceId, id);
  await loadCoreData();
  toast('Person removed');
  render();
}

/* ── Task type actions ────────────────────────────────────────────────── */

async function deleteTaskType(id) {
  const type = state.taskTypes.find((t) => t.id === id);
  const ok = await confirmDialog({
    title: `Delete ${type?.label || 'this type'}?`,
    body: 'Its gate template and custom fields go too. Existing plan rows keep their type key, but the dropdown option disappears.',
    confirmLabel: 'Delete type',
    danger: true,
  });
  if (!ok) return;
  await flushSaves();
  await taskTypesApi.delete(state.token, state.activeWorkspaceId, id);
  state.expandedTaskTypes.delete(id);
  await loadCoreData();
  toast('Type deleted');
  render();
}

async function addGateStep(typeId) {
  const label = String(state.draft[`newStepLabel:${typeId}`] || '').trim();
  if (!label) {
    document.querySelector(`[data-new-step-label="${CSS.escape(typeId)}"]`)?.focus();
    toast('Give the step a name first', 'warn');
    return;
  }
  const type = state.taskTypes.find((t) => t.id === typeId);
  if (!type) return;

  if (!type.gate_templates) type.gate_templates = [];
  type.gate_templates.push({
    id: crypto.randomUUID(),
    task_type_id: typeId,
    seq: type.gate_templates.length + 1,
    label,
    duration_days: Number(state.draft[`newStepDays:${typeId}`] ?? 7) || 7,
    day_kind: state.draft[`newStepKind:${typeId}`] || 'business',
    dep_type: 'input_ready',
  });
  state.expandedTaskTypes.add(typeId);
  state.draft[`newStepLabel:${typeId}`] = '';

  // Structural changes persist straight away rather than waiting out the
  // debounce, so a refresh can't lose a step that is already on screen.
  await saveTaskTypeRow(typeId);
  repaintTaskTypes();
}

async function deleteGateStep(typeId, stepId) {
  const type = state.taskTypes.find((t) => t.id === typeId);
  if (!type) return;
  type.gate_templates = (type.gate_templates || []).filter((s) => s.id !== stepId);
  await saveTaskTypeRow(typeId);
  toast('Step removed');
  repaintTaskTypes();
}

async function addCustomField(typeId) {
  const label = String(state.draft[`newFieldLabel:${typeId}`] || '').trim();
  if (!label) {
    document.querySelector(`[data-new-field-label="${CSS.escape(typeId)}"]`)?.focus();
    toast('Give the field a label first', 'warn');
    return;
  }
  const type = state.taskTypes.find((t) => t.id === typeId);
  if (!type) return;

  const fieldType = state.draft[`newFieldType:${typeId}`] || 'text';
  if (!type.fields) type.fields = [];
  type.fields.push({
    id: crypto.randomUUID(),
    task_type_id: typeId,
    key: slugifyFieldKey(label) || `field_${type.fields.length + 1}`,
    label,
    field_type: fieldType,
    options: fieldType === 'select' ? [] : null,
    required: false,
    seq: type.fields.length + 1,
  });
  state.expandedTaskTypes.add(typeId);
  state.draft[`newFieldLabel:${typeId}`] = '';

  await saveTaskTypeRow(typeId);
  repaintTaskTypes();
}

async function deleteCustomField(typeId, fieldId) {
  const type = state.taskTypes.find((t) => t.id === typeId);
  if (!type) return;
  type.fields = (type.fields || []).filter((f) => f.id !== fieldId);
  await saveTaskTypeRow(typeId);
  toast('Field removed');
  repaintTaskTypes();
}

function wireContextEvents() {
  document.getElementById('ctx-cycle')?.addEventListener('change', (e) => {
    guard(async () => {
      await flushSaves();
      state.activeCycleId = e.target.value || null;
      state.activeScenarioId = null;
      localStorage.removeItem(SCENARIO_KEY);
      await loadCoreData();
      await loadForRoute(currentRoute());
      render();
    });
  });

  const switchWorkspace = (workspaceId) =>
    guard(async () => {
      if (!workspaceId || workspaceId === state.activeWorkspaceId) return;
      await flushSaves();
      state.activeWorkspaceId = workspaceId;
      state.activeCycleId = null;
      state.activeScenarioId = null;
      state.capacity = null;
      localStorage.removeItem(SCENARIO_KEY);
      persistWorkspace();
      await loadCoreData();
      await loadForRoute(currentRoute());
      render();
    });

  document.getElementById('ctx-workspace')?.addEventListener('change', (e) =>
    switchWorkspace(e.target.value),
  );
  document.getElementById('plans-workspace')?.addEventListener('change', (e) =>
    switchWorkspace(e.target.value),
  );
}

/* ── Plans view events ────────────────────────────────────────────────── */

function wirePlansEvents() {
  document.getElementById('new-plan')?.addEventListener('click', openWizard);
  document.getElementById('new-plan-empty')?.addEventListener('click', openWizard);

  document.querySelectorAll('[data-open-plan]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(async () => {
        state.activeCycleId = btn.dataset.openPlan;
        state.activeScenarioId = null;
        localStorage.removeItem(SCENARIO_KEY);
        await loadCoreData();
        toast('Plan opened');
        navigate(postPlanRoute(state));
      }),
    );
  });

  document.querySelectorAll('[data-rename-plan]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(async () => {
        const id = btn.dataset.renamePlan;
        const cycle = state.cycles.find((c) => c.id === id);
        const result = await promptDialog({
          title: 'Rename plan',
          label: 'Plan name',
          value: cycle?.name || '',
          confirmLabel: 'Rename',
        });
        if (!result) return;
        const { cycle: updated } = await cyclesApi.patch(state.token, state.activeWorkspaceId, {
          id,
          name: result.value,
        });
        const live = state.cycles.find((c) => c.id === id);
        if (live && updated) live.name = updated.name;
        else if (live) live.name = result.value;
        toast('Plan renamed');
        render();
      }),
    );
  });

  document.querySelectorAll('[data-delete-plan]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(async () => {
        const id = btn.dataset.deletePlan;
        const cycle = state.cycles.find((c) => c.id === id);
        const ok = await confirmDialog({
          title: `Delete "${cycle?.name || 'this plan'}"?`,
          body: 'Its work items, versions, and gates go with it. This cannot be undone.',
          confirmLabel: 'Delete plan',
          danger: true,
        });
        if (!ok) return;

        await cyclesApi.delete(state.token, state.activeWorkspaceId, id);
        state.cycles = state.cycles.filter((c) => c.id !== id);
        if (state.activeCycleId === id) {
          state.activeCycleId = state.cycles[0]?.id ?? null;
          state.activeScenarioId = null;
          localStorage.removeItem(SCENARIO_KEY);
        }
        await loadCoreData();
        toast('Plan deleted');
        render();
      }),
    );
  });

  document.getElementById('rename-workspace')?.addEventListener('click', () =>
    guard(async () => {
      const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      const result = await promptDialog({
        title: 'Rename workspace',
        label: 'Workspace name',
        value: workspace?.name || '',
        confirmLabel: 'Rename',
      });
      if (!result) return;
      const { workspace: updated } = await workspacesApi.patch(state.token, {
        id: state.activeWorkspaceId,
        name: result.value,
      });
      const live = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (live && updated) live.name = updated.name;
      else if (live) live.name = result.value;
      toast('Workspace renamed');
      render();
    }),
  );

  document.getElementById('delete-workspace')?.addEventListener('click', () =>
    guard(async () => {
      if (state.workspaces.length <= 1) {
        toast('You need at least one workspace', 'warn');
        return;
      }
      const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      const ok = await confirmDialog({
        title: `Delete "${workspace?.name || 'this workspace'}"?`,
        body: 'Every plan and every person in it will be deleted too. This cannot be undone.',
        confirmLabel: 'Delete workspace',
        danger: true,
      });
      if (!ok) return;

      await workspacesApi.delete(state.token, state.activeWorkspaceId);
      localStorage.removeItem(WORKSPACE_KEY);
      state.activeCycleId = null;
      state.activeScenarioId = null;
      await loadWorkspaces();
      await loadCoreData();
      toast('Workspace deleted');
      render();
    }),
  );
}

/* ── Planner events ───────────────────────────────────────────────────── */

function wirePlannerEvents() {
  document.getElementById('add-plan-item')?.addEventListener('click', (e) =>
    guard(async () => {
      const title = String(state.draft.newItemTitle || '').trim();
      if (!title) {
        document.getElementById('new-item-title')?.focus();
        toast('Give the row a name first', 'warn');
        return;
      }
      await withBusy(e.currentTarget, 'Adding…', async () => {
        await flushSaves();
        const { plan_item } = await planItemsApi.create(state.token, {
          cycle_id: state.activeCycleId,
          scenario_id: state.activeScenarioId,
          title,
          work_hours: Number(state.draft.newItemHours ?? 8) || 0,
          due_week: state.draft.newItemDue || null,
          attributes: { task_type: state.draft.newItemType || 'general' },
        });
        // Clearing the draft is what empties the form — the inputs render from
        // it, so there is no separate DOM reset to keep in step.
        state.draft.newItemTitle = '';
        state.draft.newItemDue = '';
        if (plan_item) {
          state.planItems = [...state.planItems, plan_item];
          repaintPlanner();
        }
        try {
          await loadScenarioData();
        } catch (err) {
          console.error(err);
          toast(err.message || 'Row saved, but the list could not refresh', 'warn');
        }
        render();
        document.getElementById('new-item-title')?.focus();
      });
    }),
  );

  const switchScenario = (mode) =>
    guard(async () => {
      await flushSaves();
      if (mode === 'live') {
        const live = state.scenarios.find((s) => s.status === 'active');
        if (!live) {
          toast('No live plan yet — mark a draft as live first', 'warn');
          return;
        }
        state.activeScenarioId = live.id;
      } else {
        const draft = state.scenarios.find((s) => s.status !== 'active');
        if (!draft) {
          toast('No drafts yet — create one with "New draft"', 'warn');
          return;
        }
        state.activeScenarioId = draft.id;
      }
      localStorage.setItem(SCENARIO_KEY, state.activeScenarioId);
      await loadScenarioData();
      render();
    });

  document.getElementById('mode-draft')?.addEventListener('click', () => switchScenario('draft'));
  document.getElementById('mode-live')?.addEventListener('click', () => switchScenario('live'));

  document.getElementById('scenario-select')?.addEventListener('change', (e) =>
    guard(async () => {
      await flushSaves();
      state.activeScenarioId = e.target.value || null;
      if (state.activeScenarioId) localStorage.setItem(SCENARIO_KEY, state.activeScenarioId);
      await loadScenarioData();
      render();
    }),
  );

  document.getElementById('create-scenario')?.addEventListener('click', () =>
    guard(async () => {
      const result = await promptDialog({
        title: 'New draft',
        body: 'A draft is a scratch copy of this plan. Nothing in it counts until you make it live.',
        label: 'Draft name',
        placeholder: 'e.g. What if we hire two more',
        confirmLabel: 'Create draft',
        checkbox: state.activeScenarioId
          ? { label: 'Start from a copy of the current rows', checked: true }
          : null,
      });
      if (!result) return;

      await flushSaves();
      const { scenario } = await scenariosApi.create(state.token, {
        cycle_id: state.activeCycleId,
        name: result.value,
        status: 'draft',
        clone_from_scenario_id: result.checked ? state.activeScenarioId : undefined,
      });
      state.activeScenarioId = scenario.id;
      localStorage.setItem(SCENARIO_KEY, scenario.id);
      await loadScenarioData();
      toast(`Draft "${scenario.name}" created`);
      render();
    }),
  );

  document.getElementById('finalize-scenario')?.addEventListener('click', () =>
    guard(async () => {
      const ok = await confirmDialog({
        title: 'Make this the live plan?',
        body: 'This becomes the version everyone works from.',
        confirmLabel: 'Make it live',
      });
      if (!ok) return;
      await flushSaves();
      await scenariosApi.patch(state.token, { id: state.activeScenarioId, status: 'active' });
      await loadScenarioData();
      toast('This is now the live plan');
      render();
    }),
  );

  document.getElementById('delete-scenario')?.addEventListener('click', () =>
    guard(async () => {
      if (state.scenarios.length <= 1) return;
      const scenario = state.scenarios.find((s) => s.id === state.activeScenarioId);
      const ok = await confirmDialog({
        title: `Delete "${scenario?.name || 'this version'}"?`,
        body: 'Its rows and gates go with it. This cannot be undone.',
        confirmLabel: 'Delete version',
        danger: true,
      });
      if (!ok) return;

      await scenariosApi.delete(state.token, state.activeScenarioId);
      state.scenarios = state.scenarios.filter((s) => s.id !== state.activeScenarioId);
      const next = state.scenarios.find((s) => s.status === 'active') || state.scenarios[0];
      state.activeScenarioId = next?.id ?? null;
      if (state.activeScenarioId) localStorage.setItem(SCENARIO_KEY, state.activeScenarioId);
      else localStorage.removeItem(SCENARIO_KEY);
      await loadScenarioData();
      toast('Version deleted');
      render();
    }),
  );

  document.getElementById('preview-import')?.addEventListener('click', () =>
    guard(async () => {
      const csv_text = state.draft.importCsv;
      if (!csv_text?.trim()) {
        toast('Paste some CSV first', 'warn');
        return;
      }
      const task_type_id = state.importTaskTypeId || '';
      state.importPreview = await importApi.preview(state.token, {
        cycle_id: state.activeCycleId,
        scenario_id: state.activeScenarioId,
        csv_text,
        ...(task_type_id ? { task_type_id } : {}),
      });
      // Keep the section open so the preview appears next to the CSV that
      // produced it, instead of the disclosure snapping shut on render.
      state.importSectionOpen = true;
      render();
    }),
  );

  document.getElementById('confirm-import')?.addEventListener('click', () =>
    guard(async () => {
      const csv_text = state.draft.importCsv;
      if (!csv_text) {
        toast('Paste some CSV first', 'warn');
        return;
      }
      const task_type_id = state.importTaskTypeId || '';
      await importApi.commit(state.token, {
        cycle_id: state.activeCycleId,
        scenario_id: state.activeScenarioId,
        csv_text,
        ...(task_type_id ? { task_type_id } : {}),
      });
      state.importPreview = null;
      state.draft.importCsv = '';
      await loadScenarioData();
      toast('Rows imported');
      render();
    }),
  );

  document.getElementById('cancel-import')?.addEventListener('click', () => {
    state.importPreview = null;
    render();
  });

  document.getElementById('import-task-type')?.addEventListener('change', (e) => {
    state.importTaskTypeId = e.target.value || '';
    state.importPreview = null;
    render();
  });

  document.getElementById('import-disclosure')?.addEventListener('toggle', (e) => {
    state.importSectionOpen = e.target.open;
  });

  document.getElementById('export-plan')?.addEventListener('click', () =>
    guard(() => downloadExport('plan')),
  );

  document.getElementById('check-drift')?.addEventListener('click', () =>
    guard(async () => {
      const data = await exportApi.drift(state.token, {
        cycle: state.activeCycleId,
        scenario: state.activeScenarioId,
      });
      toast(
        `Since your last import: ${data.added} added, ${data.modified} changed, ${data.removed} removed`,
        'ok',
        5000,
      );
    }),
  );
}

/* ── Capacity events ──────────────────────────────────────────────────── */

function wireCapacityEvents() {
  document.querySelectorAll('.pill-tab[data-team]').forEach((tab) => {
    tab.addEventListener('click', () =>
      guard(async () => {
        state.activeTeamFilter = tab.dataset.team || '';
        await loadCapacity();
        render();
      }),
    );
  });

  document.getElementById('cap-mode')?.addEventListener('change', (e) =>
    guard(async () => {
      await loadCapacity(e.target.value);
      render();
    }),
  );

  document.getElementById('cap-granularity-week')?.addEventListener('click', () =>
    guard(async () => {
      await loadCapacity(null, 'week');
      render();
    }),
  );

  document.getElementById('cap-granularity-month')?.addEventListener('click', () =>
    guard(async () => {
      await loadCapacity(null, 'month');
      render();
    }),
  );

  document.getElementById('cap-granularity-day')?.addEventListener('click', () =>
    guard(async () => {
      await loadCapacity(null, 'day');
      render();
    }),
  );

  document.getElementById('refresh-capacity')?.addEventListener('click', (e) =>
    guard(() =>
      withBusy(e.currentTarget, 'Refreshing…', async () => {
        await loadCapacity();
        render();
      }),
    ),
  );

  document.getElementById('export-capacity')?.addEventListener('click', () =>
    guard(() => downloadExport('capacity')),
  );

  document.getElementById('rules-disclosure')?.addEventListener('toggle', (e) => {
    state.rulesSectionOpen = e.target.open;
  });

  document.getElementById('save-policy')?.addEventListener('click', (e) =>
    guard(() =>
      withBusy(e.currentTarget, 'Saving…', async () => {
        await savePolicy({});
        await loadCapacity();
        await loadChangelog();
        toast('Rules saved');
        render();
      }),
    ),
  );

  document.querySelectorAll('[data-granularity]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(async () => {
        await savePolicy({ tracking_granularity: btn.dataset.granularity });
        state.capacityGranularity = btn.dataset.granularity;
        state.rulesSectionOpen = true;
        await loadCapacity();
        toast(`Now tracking by ${btn.dataset.granularity}`);
        render();
      }),
    );
  });
}

/* ── Team events ──────────────────────────────────────────────────────── */

function wireTeamEvents() {
  document.getElementById('add-resource')?.addEventListener('click', (e) =>
    guard(async () => {
      const name = String(state.draft.newResourceName || '').trim();
      if (!name) {
        document.getElementById('new-resource-name')?.focus();
        toast('Give the person a name first', 'warn');
        return;
      }
      await withBusy(e.currentTarget, 'Adding…', async () => {
        await flushSaves();
        await resourcesApi.create(state.token, state.activeWorkspaceId, {
          name,
          team: String(state.draft.newResourceTeam || '').trim() || null,
          weekly_hours: Number(state.draft.newResourceHours ?? 32) || 32,
        });
        state.draft.newResourceName = '';
        state.draft.newResourceTeam = '';
        await loadCoreData();
        render();
        document.getElementById('new-resource-name')?.focus();
      });
    }),
  );

  document.getElementById('add-pto')?.addEventListener('click', (e) =>
    guard(async () => {
      const start = state.draft.ptoStart;
      const end = state.draft.ptoEnd;
      if (!start || !end) {
        toast('Pick both a start and an end date', 'warn');
        return;
      }
      if (end < start) {
        toast('The end date is before the start date', 'warn');
        return;
      }
      await withBusy(e.currentTarget, 'Saving…', async () => {
        await timeOffApi.create(state.token, state.activeWorkspaceId, {
          resource_id: document.getElementById('pto-resource')?.value,
          start_date: start,
          end_date: end,
          hours_per_day: state.draft.ptoHours || null,
          reason: 'PTO',
        });
        state.draft.ptoStart = '';
        state.draft.ptoEnd = '';
        state.draft.ptoHours = '';
        await loadCoreData();
        toast('Time off booked');
        render();
      });
    }),
  );

  document.querySelectorAll('[data-delete-pto]').forEach((btn) => {
    btn.addEventListener('click', () =>
      guard(async () => {
        await timeOffApi.delete(state.token, btn.dataset.deletePto);
        await loadCoreData();
        toast('Time off removed');
        render();
      }),
    );
  });
}

/* ── Task type events ─────────────────────────────────────────────────── */

function wireTaskTypesEvents() {
  document.getElementById('add-task-type')?.addEventListener('click', (e) =>
    guard(async () => {
      const label = String(state.draft.newTaskTypeLabel || '').trim();
      if (!label) {
        document.getElementById('new-task-type-label')?.focus();
        toast('Give the type a name first', 'warn');
        return;
      }
      await withBusy(e.currentTarget, 'Adding…', async () => {
        await flushSaves();
        const { task_type } = await taskTypesApi.create(state.token, state.activeWorkspaceId, {
          label,
        });
        state.expandedTaskTypes.add(task_type.id);
        state.draft.newTaskTypeLabel = '';
        await loadCoreData();
        render();
        document.getElementById('new-task-type-label')?.focus();
      });
    }),
  );
}

/* ── Rules helpers (wired from Capacity) ──────────────────────────────── */

async function savePolicy(overrides) {
  if (!state.activeCycleId) return;
  const config = policyConfig(state.draft, state.policy?.config || {}, overrides);
  const { policy } = await policyApi.update(state.token, state.activeCycleId, config);
  state.policy = policy;
}

/* ── Export ───────────────────────────────────────────────────────────── */

async function downloadExport(type) {
  const url = exportApi.downloadUrl({
    type,
    cycle: state.activeCycleId,
    scenario: state.activeScenarioId,
    team: state.activeTeamFilter,
    mode: document.getElementById('cap-mode')?.value || 'due',
  });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${type}-export.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV downloaded');
}

/* ── Render ───────────────────────────────────────────────────────────── */

function renderSignIn(auth) {
  const loginHref = `/account.html?next=${encodeURIComponent(location.pathname || APP_PATH)}`;
  return `
    <div class="signin-wrap">
      <div class="signin">
        <div class="signin-brand">
          <img src="./icon.svg" alt="" width="30" height="30" />
          <h1>One More Column</h1>
        </div>
        <p class="page-lead">Capacity planning that doesn't need another spreadsheet.</p>
        ${auth.needsReauth
          ? '<div class="notice notice-warn"><strong>Your session expired.</strong> Sign in again to pick up where you left off.</div>'
          : ''}
        <p class="page-lead">Use the same account as the rest of inaayat.xyz.</p>
        <a class="btn btn-primary btn-lg" href="${loginHref}">Sign in</a>
        <a class="sidebar-link" style="color:var(--muted)" href="/">← beep boop</a>
      </div>
    </div>`;
}

function render() {
  const root = document.getElementById('app-root');
  const requested = currentRoute();

  const { route, redirectedFrom } = resolveRoute(requested, state);
  if (route !== requested) {
    state.redirectedFrom = redirectedFrom;
    navigate(route);
    return;
  }

  // The wizard takes over the Plans page when there is nothing to list, so the
  // first thing a new user sees is the thing they came to do.
  const showWizard = route === 'plans' && (state.wizard.open || !state.cycles.length);
  if (showWizard) state.wizard.open = true;

  let body;
  if (route === 'plans') {
    body = showWizard
      ? renderWizard({ state })
      : renderPlansView({ state, redirectedFrom: state.redirectedFrom });
  }   else if (route === 'planner') body = renderPlannerView({ state });
  else if (route === 'capacity') body = renderCapacityView({ state });
  else if (route === 'team') body = renderTeamView({ state });
  else if (route === 'task-types') body = renderTaskTypesView({ state });
  else body = renderGuideView({ state });

  root.innerHTML = renderShell({
    body,
    activeRoute: route,
    navItems: navItems(state),
    context: renderContext({
      state,
      planOptions: planOptions(state.cycles, state.activeCycleId),
      workspaceOptions: workspaceOptions(state.workspaces, state.activeWorkspaceId),
      showSwitchers: !showWizard,
    }),
    user: state.me?.user || state.auth?.user || {},
    narrow: route === 'guide' || showWizard,
  });

  wireAuthLink(state.auth);
  wireContextEvents();

  if (route === 'plans' && showWizard) wireWizardEvents();
  else if (route === 'plans') wirePlansEvents();
  else if (route === 'planner') wirePlannerEvents();
  else if (route === 'capacity') wireCapacityEvents();
  else if (route === 'team') wireTeamEvents();
  else if (route === 'task-types') wireTaskTypesEvents();

  state.redirectedFrom = null;
}

/* ── Boot ─────────────────────────────────────────────────────────────── */

async function boot() {
  const root = document.getElementById('app-root');
  let auth;

  try {
    auth = await initAuth();
    state.auth = auth;

    if (auth.configured && auth.user && !auth.token) await refreshToken(auth);

    configureApiAuth({
      getToken: () => state.token,
      refresh: async () => {
        const token = await refreshToken(state.auth);
        if (token) {
          state.token = token;
          if (state.auth) {
            state.auth.token = token;
            state.auth.signedIn = true;
            state.auth.needsReauth = false;
          }
        }
        return token;
      },
    });

    if (!auth.signedIn || !auth.token) {
      root.innerHTML = renderSignIn(auth);
      wireAuthLink(auth);
      return;
    }

    state.token = auth.token;

    const startSession = async () => {
      state.me = await meApi.get(state.token);
      await loadWorkspaces();
      await loadCoreData();

      const emptyHash = !location.hash || location.hash === '#/' || location.hash === '#';
      if (emptyHash) {
        location.replace(`#/${getInitialRoute(state)}`);
      } else {
        const { route } = resolveRoute(currentRoute(), state);
        if (route !== currentRoute()) location.replace(`#/${route}`);
      }

      await loadForRoute(currentRoute());
      render();
    };

    try {
      await startSession();
    } catch (err) {
      if (err.status === 401 && auth.configured) {
        const refreshed = await refreshToken(auth);
        if (refreshed) {
          state.token = refreshed;
          auth.token = refreshed;
          auth.signedIn = true;
          auth.needsReauth = false;
          await startSession();
        } else {
          auth.signedIn = false;
          auth.needsReauth = !!auth.user;
          root.innerHTML = renderSignIn(auth);
          wireAuthLink(auth);
          return;
        }
      } else {
        throw err;
      }
    }

    // Attached once to the container that survives every render, so repainting
    // a region never takes its listeners with it.
    root.addEventListener('input', onDelegatedEdit);
    root.addEventListener('change', onDelegatedEdit);
    root.addEventListener('click', onDelegatedClick);

    window.addEventListener('hashchange', () =>
      guard(async () => {
        const raw = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
        if (state.wizard.open && !raw) {
          history.replaceState(null, '', `${location.pathname}${location.search}#/plans`);
          return;
        }
        await loadForRoute(currentRoute());
        render();
      }),
    );

    // Edits save themselves, but a reload inside the debounce window would still
    // outrun the last one.
    window.addEventListener('beforeunload', (e) => {
      if (!hasUnsavedWork()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  } catch (err) {
    console.error(err);
    if (err.status === 401 && auth?.configured) {
      auth.signedIn = false;
      auth.needsReauth = !!auth.user;
      root.innerHTML = renderSignIn(auth);
      wireAuthLink(auth);
      return;
    }
    root.innerHTML = `
      <div class="signin-wrap">
        <div class="signin">
          <h1>Something went wrong</h1>
          <div class="notice notice-error">${escapeHtml(err.message || 'Unknown error')}</div>
          <a class="btn btn-ghost" href="${APP_PATH}">Reload</a>
        </div>
      </div>`;
  }
}

boot();
