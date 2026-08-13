/**
 * View-layer smoke tests.
 *
 * Every view is a pure function of state, so they can be rendered in Node
 * without a DOM. These catch the failures that used to only show up in the
 * browser: a view throwing on an empty workspace, an object stringifying into
 * the markup, user data escaping into live HTML, or a route resolving somewhere
 * unexpected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderPlansView,
  renderPlannerView,
  renderPlannerTable,
  renderCapacityView,
  renderTeamView,
  renderTaskTypesView,
  renderGuideView,
  planOptions,
  workspaceOptions,
} from './views.js';
import { renderWizard, blankWizard, validateStep } from './wizard.js';
import { renderShell, renderContext } from './shell.js';
import {
  navItems,
  resolveRoute,
  getInitialRoute,
  normalizeRoute,
  getSetupProgress,
  hasCustomizedTaskTypes,
  postPlanRoute,
} from './setup.js';

const emptyState = {
  workspaces: [{ id: 'w1', name: 'Default workspace' }],
  activeWorkspaceId: 'w1',
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
  changelog: [],
  activeTeamFilter: '',
  capacityGranularity: 'week',
  expandedRows: new Set(),
  expandedTaskTypes: new Set(),
  rulesSectionOpen: false,
  draft: {},
  pendingRows: new Set(),
  pendingResources: new Set(),
  pendingTaskTypes: new Set(),
  rowStatus: {},
  resourceStatus: {},
  saveStatus: null,
  teamSaveStatus: null,
  taskTypesSaveStatus: null,
  undoStack: [],
  wizard: blankWizard(),
};

const fullState = {
  ...emptyState,
  workspaces: [
    { id: 'w1', name: 'Default workspace' },
    { id: 'w2', name: 'Finance' },
  ],
  cycles: [
    { id: 'c1', name: 'Q1 2026', start_date: '2026-01-05', end_date: '2026-04-03' },
    { id: 'c2', name: 'Q2 2026', start_date: '2026-04-06', end_date: '2026-07-03' },
  ],
  activeCycleId: 'c1',
  scenarios: [
    { id: 's1', name: 'Baseline', status: 'active' },
    { id: 's2', name: 'What if', status: 'draft' },
  ],
  activeScenarioId: 's1',
  resources: [
    {
      id: 'r1',
      // Deliberately hostile: an apostrophe plus a script tag.
      name: `O'Brien <script>alert(1)</script>`,
      team: 'Analyst',
      profiles: [{ weekly_hours: 32 }],
      time_off: [{ id: 't1', start_date: '2026-02-02', end_date: '2026-02-06', hours_per_day: null }],
    },
    { id: 'r2', name: 'Sam Lee', team: null, profiles: [], time_off: [] },
  ],
  teams: ['Analyst'],
  taskTypes: [
    {
      id: 'tt1',
      key: 'general',
      label: 'General',
      fields: [],
      gate_templates: [],
    },
    {
      id: 'tt2',
      key: 'deliverable',
      label: 'Deliverable',
      fields: [
        {
          id: 'f1',
          key: 'status',
          label: 'Status',
          field_type: 'select',
          options: ['Draft', 'Final'],
          required: false,
          seq: 1,
        },
      ],
      gate_templates: [
        {
          id: 'gs1',
          label: 'Obtain population',
          duration_days: 7,
          day_kind: 'business',
          dep_type: 'input_ready',
        },
      ],
    },
    {
      id: 'tt3',
      key: 'control_testing',
      label: 'Control Testing',
      gate_templates: [
        { id: 'gs2', label: 'Obtain population', duration_days: 7, day_kind: 'business', dep_type: 'input_ready' },
        { id: 'gs3', label: 'Select samples', duration_days: 7, day_kind: 'business', dep_type: 'sample_chain' },
        { id: 'gs4', label: 'Get sample support', duration_days: 7, day_kind: 'business', dep_type: 'input_ready' },
      ],
      fields: [
        { id: 'cf1', key: 'control_id', label: 'Control ID', field_type: 'text', required: false, seq: 1 },
        {
          id: 'cf2',
          key: 'reliance',
          label: 'Reliance',
          field_type: 'select',
          options: ['High', 'Medium', 'Low'],
          required: false,
          seq: 2,
        },
        { id: 'cf3', key: 'sampling', label: 'Sampling', field_type: 'text', required: false, seq: 3 },
      ],
    },
  ],
  policy: { config: { tracking_granularity: 'week', weekly_capacity_default: 32 } },
  planItems: [
    {
      id: 'p1',
      title: 'Draft "the" forecast & review',
      work_hours: 8,
      due_week: '2026-01-12',
      phase: 'Phase 1',
      attributes: { task_type: 'deliverable', duration_days: 5, start_date: '2026-01-06' },
    },
    { id: 'p2', title: 'Second item', work_hours: 0, due_week: null, phase: null, attributes: {} },
  ],
  dependencies: [
    {
      id: 'd1',
      to_plan_item_id: 'p1',
      from_plan_item_id: 'p2',
      dep_type: 'input_ready',
      label: 'Data handed over',
      status: 'open',
      meta: { due_date: '2026-01-08' },
    },
  ],
  readiness: [
    { plan_item_id: 'p1', title: 'Draft', ready_to_start: '2026-01-09', blocked: true, blockers: [] },
  ],
  capacity: {
    granularity: 'week',
    mode: 'due',
    teams: ['Analyst'],
    weeks: ['2026-01-05', '2026-01-12'],
    rows: [
      {
        resource_id: 'r1',
        name: "O'Brien",
        team: 'Analyst',
        weeks: [
          { week: '2026-01-05', load: 8, capacity: 32, remaining: 24, band: 'green' },
          { week: '2026-01-12', load: 40, capacity: 32, remaining: -8, band: 'red', overloaded: true },
        ],
      },
    ],
  },
  changelog: [{ created_at: '2026-01-02T10:00:00Z', summary: 'Created plan' }],
  expandedRows: new Set(['p1']),
  expandedTaskTypes: new Set(['tt2', 'tt3']),
  draft: { newItemTitle: 'Half-typed row', importCsv: 'title,work_hours\nA,4' },
  pendingRows: new Set(['p1']),
  rowStatus: { p1: 'saving' },
  saveStatus: 'saving',
  undoStack: [{ key: 'planItem:p1:title' }],
};

const views = {
  plans: (s) => renderPlansView({ state: s, redirectedFrom: 'capacity' }),
  planner: (s) => renderPlannerView({ state: s }),
  capacity: (s) => renderCapacityView({ state: s }),
  team: (s) => renderTeamView({ state: s }),
  'task-types': (s) => renderTaskTypesView({ state: s }),
  guide: (s) => renderGuideView({ state: s }),
};

function shellFor(body, state, route) {
  return renderShell({
    body,
    activeRoute: route,
    navItems: navItems(state),
    context: renderContext({
      state,
      planOptions: planOptions(state.cycles, state.activeCycleId),
      workspaceOptions: workspaceOptions(state.workspaces, state.activeWorkspaceId),
      showSwitchers: true,
    }),
    user: { name: 'Test User', email: 't@example.com' },
  });
}

for (const [label, state] of [['empty', emptyState], ['populated', fullState]]) {
  for (const [name, render] of Object.entries(views)) {
    test(`${name} renders with ${label} state`, () => {
      const body = render(state);
      assert.equal(typeof body, 'string');
      assert.ok(body.trim().length > 0, 'produced no output');
      assert.ok(!body.includes('[object Object]'), 'an object leaked into the markup');
      assert.ok(shellFor(body, state, name).includes('sidebar'), 'shell lost its sidebar');
    });
  }
}

test('wizard renders every step, for a first plan and an additional one', () => {
  for (const base of [emptyState, fullState]) {
    for (let step = 1; step <= 3; step += 1) {
      const state = { ...base, wizard: { ...blankWizard(), open: true, step, showWorkspace: true } };
      const out = renderWizard({ state });
      assert.ok(out.includes('wizard-step'), `step ${step} lost its progress chips`);
    }
  }
});

test('wizard validation catches every bad field at once', () => {
  const wizard = {
    ...blankWizard(),
    name: '   ',
    start: '2026-05-01',
    end: '2026-01-01', // before the start
    useNewWorkspace: true,
    newWorkspaceName: '',
  };
  const errors = validateStep(wizard, 1);
  assert.deepEqual(Object.keys(errors).sort(), ['end', 'name', 'newWorkspaceName']);

  wizard.errors = errors;
  const out = renderWizard({ state: { ...emptyState, wizard: { ...wizard, open: true, step: 1, showWorkspace: true } } });
  assert.ok(out.includes('field-error'), 'errors were not shown inline');
});

test('wizard offers day, week, and month granularity', () => {
  const out = renderWizard({ state: { ...emptyState, wizard: { ...blankWizard(), open: true, step: 1 } } });
  assert.ok(out.includes('value="week"'));
  assert.ok(out.includes('value="month"'));
  assert.ok(out.includes('value="day"'), 'day tracking is implemented on the capacity grid');
  assert.ok(out.includes('data-section="wizard-echo"'), 'echo is patchable so date inputs stay mounted');
});

test('legacy hashes still resolve', () => {
  assert.equal(normalizeRoute('home'), 'guide');
  assert.equal(normalizeRoute('settings'), 'plans');
  assert.equal(normalizeRoute('preferences'), 'capacity');
  assert.equal(normalizeRoute('rules'), 'capacity');
  assert.equal(normalizeRoute('dependencies'), 'planner');
  assert.equal(normalizeRoute('alerts'), 'planner');
  assert.equal(normalizeRoute('nonsense'), 'planner');
});

test('routes needing a plan redirect, and say where they came from', () => {
  const { route, redirectedFrom } = resolveRoute('capacity', emptyState);
  assert.equal(route, 'plans');
  assert.equal(redirectedFrom, 'capacity');

  // The guide never needs a plan.
  assert.equal(resolveRoute('guide', emptyState).route, 'guide');
  // With a plan in place, nothing is gated.
  assert.equal(resolveRoute('capacity', fullState).route, 'capacity');
  assert.equal(resolveRoute('capacity', fullState).redirectedFrom, null);
});

test('onboarding sends new users to Plans, then Task types before Planner', () => {
  assert.equal(getInitialRoute(emptyState), 'plans');
  assert.equal(getSetupProgress(emptyState).nextStep.id, 'plan');

  // Plan exists but only seeded types → land on Task types first.
  const planOnly = {
    ...emptyState,
    cycles: [{ id: 'c1', name: 'Q1' }],
    activeCycleId: 'c1',
    taskTypes: [
      { id: 'tt1', key: 'general', label: 'General', fields: [], gate_templates: [] },
    ],
  };
  assert.equal(getInitialRoute(planOnly), 'task-types');
  assert.equal(getSetupProgress(planOnly).nextStep.id, 'types');
  assert.equal(postPlanRoute(planOnly), 'task-types');
  assert.equal(hasCustomizedTaskTypes(planOnly.taskTypes), false);

  // Customized types → Planner.
  assert.equal(getInitialRoute(fullState), 'planner');
  assert.equal(getSetupProgress(fullState).typesReady, true);
  assert.equal(getSetupProgress(fullState).capacityReady, true);
  assert.equal(postPlanRoute(fullState), 'planner');
  assert.ok(navItems(planOnly).find((n) => n.id === 'task-types')?.next);
});

test('planner nudges toward Task types when the catalog is still defaults-only', () => {
  const planOnly = {
    ...emptyState,
    cycles: [{ id: 'c1', name: 'Q1' }],
    activeCycleId: 'c1',
    scenarios: [{ id: 's1', name: 'Default', status: 'active' }],
    activeScenarioId: 's1',
    taskTypes: [
      { id: 'tt1', key: 'general', label: 'General', fields: [], gate_templates: [] },
    ],
  };
  const out = renderPlannerView({ state: planOnly });
  assert.ok(out.includes('Set up task types first'));
  assert.ok(out.includes('href="#/task-types"'));
});

test('planner puts Add work above the empty state', () => {
  const planOnly = {
    ...emptyState,
    cycles: [{ id: 'c1', name: 'Q1' }],
    activeCycleId: 'c1',
    scenarios: [{ id: 's1', name: 'Default', status: 'active' }],
    activeScenarioId: 's1',
    taskTypes: [
      {
        id: 'tt1',
        key: 'custom',
        label: 'Custom',
        fields: [{ id: 'f1', key: 'x', label: 'X', field_type: 'text' }],
        gate_templates: [],
      },
    ],
  };
  const out = renderPlannerView({ state: planOnly });
  const addAt = out.indexOf('Add work');
  const emptyAt = out.indexOf('Nothing listed yet');
  assert.ok(addAt >= 0 && emptyAt >= 0);
  assert.ok(addAt < emptyAt, 'Add work should appear before the empty state');
});

test('capacity embeds planning rules as a disclosure, not a separate tab', () => {
  const out = renderCapacityView({ state: fullState });
  assert.ok(out.includes('id="rules-disclosure"'));
  assert.ok(out.includes('Planning rules'));
  assert.ok(out.includes('id="save-policy"'));
  assert.ok(!navItems(fullState).some((n) => n.id === 'rules'), 'Settings tab should be gone');
  assert.ok(!navItems(fullState).some((n) => n.id === 'alerts'), 'Alerts tab should be archived');
  assert.ok(out.includes('href="#/planner"'), 'open gates should point at Planner, not Alerts');
  assert.ok(!out.includes('href="#/alerts"'));
});

test('user-supplied text is escaped, not executed', () => {
  const team = renderTeamView({ state: fullState });
  assert.ok(!team.includes('<script>'), 'raw script tag survived into the team view');
  assert.ok(team.includes('&lt;script&gt;'), 'the script tag was not escaped');

  const planner = renderPlannerView({ state: fullState });
  assert.ok(!planner.includes('<script>'), 'raw script tag survived into the planner');
});

test('planner shows Apply gate template when the row type has steps', () => {
  const planner = renderPlannerView({ state: fullState });
  assert.ok(planner.includes('data-apply-gate-template="p1"'), 'deliverable with a template should offer Apply');
  assert.ok(planner.includes('Control Testing'), 'custom types appear in the type dropdown');
  assert.ok(planner.includes('data-attr-field="status"'), 'type fields appear in the drawer');
  assert.ok(planner.includes('Deliverable fields'));
});

test('task types view lists custom fields next to the gate template', () => {
  const out = renderTaskTypesView({ state: fullState });
  assert.ok(out.includes('Control Testing'));
  assert.ok(out.includes('Obtain population'));
  assert.ok(out.includes('Select samples'));
  assert.ok(out.includes('data-add-step="tt3"'));
  assert.ok(out.includes('data-add-field="tt3"'));
  assert.ok(out.includes('Control ID'));
  assert.ok(out.includes('Custom fields'));
  assert.ok(out.includes('3 steps · 3 fields'));
});

test('planner import section offers a task type selector', () => {
  const out = renderPlannerView({ state: fullState });
  assert.ok(out.includes('id="import-task-type"'));
  assert.ok(out.includes('Built-in columns only'));
  assert.ok(out.includes('Control Testing'));
});

test('import preview surfaces matched custom fields and unmatched columns', () => {
  const out = renderPlannerView({
    state: {
      ...fullState,
      importSectionOpen: true,
      importPreview: {
        count: 2,
        task_type_label: 'Control Testing',
        matched_fields: [
          { key: 'control_id', label: 'Control ID' },
          { key: 'reliance', label: 'Reliance' },
        ],
        unmatched_headers: ['Extra Col'],
        rows: [
          { row: 2, warnings: ['Reliance: "Maybe" is not in [High, Medium, Low]'] },
        ],
      },
    },
  });
  assert.ok(out.includes('Also importing: Control ID, Reliance'));
  assert.ok(out.includes('No match for: Extra Col'));
  assert.ok(out.includes('Row 2: Reliance'));
});

test('task-types route is gated until a plan exists', () => {
  assert.equal(resolveRoute('task-types', emptyState).route, 'plans');
  assert.equal(resolveRoute('task-types', fullState).route, 'task-types');
  assert.ok(navItems(fullState).some((n) => n.id === 'task-types'));
});

test('gated nav items render as text, not as links that bounce', () => {
  const shell = shellFor('', emptyState, 'plans');
  assert.ok(!shell.includes('href="#/capacity"'), 'a locked route was still clickable');
  assert.ok(shell.includes('aria-disabled="true"'));

  const unlocked = shellFor('', fullState, 'planner');
  assert.ok(unlocked.includes('href="#/capacity"'), 'capacity should be reachable once a plan exists');
});

test('capacity explains itself rather than rendering an empty grid', () => {
  const noTeam = renderCapacityView({ state: { ...fullState, resources: [], capacity: null } });
  assert.ok(noTeam.includes('href="#/team"'), 'should point at the page that fixes it');

  const noWork = renderCapacityView({ state: { ...fullState, planItems: [], capacity: null } });
  assert.ok(noWork.includes('href="#/planner"'), 'should point at the page that fixes it');
});

/* ── Autosave rendering ───────────────────────────────────────────────
   Saving is no longer a button the user has to find. These pin down the
   affordances that replaced it, and the regions autosave repaints on its own. */

test('the manual Save changes buttons are gone from every page', () => {
  for (const render of [
    () => renderPlannerView({ state: fullState }),
    () => renderTeamView({ state: fullState }),
    () => renderTaskTypesView({ state: fullState }),
  ]) {
    const out = render();
    assert.ok(!out.includes('Save changes'), 'a manual save button survived');
    assert.ok(!out.includes('dirty-flag'), 'the unsaved-changes flag should be a save status now');
  }
});

test('each autosaving page exposes the regions the save path repaints', () => {
  const planner = renderPlannerView({ state: fullState });
  assert.ok(planner.includes('data-section="planner-table"'));
  assert.ok(planner.includes('data-section="planner-savebar"'));

  const team = renderTeamView({ state: fullState });
  assert.ok(team.includes('data-section="team-table"'));
  assert.ok(team.includes('data-section="team-savebar"'));

  const types = renderTaskTypesView({ state: fullState });
  assert.ok(types.includes('data-section="task-types-table"'));
  assert.ok(types.includes('data-section="task-types-savebar"'));
});

test('save status reflects what is happening, not a static label', () => {
  const saving = renderPlannerView({ state: { ...fullState, saveStatus: 'saving' } });
  assert.ok(saving.includes('Saving…'));

  const idle = renderPlannerView({
    state: { ...fullState, saveStatus: 'saved', pendingRows: new Set() },
  });
  assert.ok(idle.includes('All changes saved'));

  const failed = renderPlannerView({
    state: { ...fullState, saveStatus: 'failed', pendingRows: new Set() },
  });
  assert.ok(failed.includes("didn't save"));
  assert.ok(failed.includes('id="retry-planner"'), 'a failure has to be retryable');

  const clashed = renderPlannerView({
    state: { ...fullState, saveStatus: 'conflict', pendingRows: new Set() },
  });
  assert.ok(clashed.includes('Someone else changed this plan'));
  assert.ok(clashed.includes('id="retry-planner"'));
});

test('a row carries its own save state so a failure names the row', () => {
  const out = renderPlannerView({
    state: { ...fullState, rowStatus: { p1: 'failed' }, saveStatus: 'failed' },
  });
  assert.ok(out.includes('data-row-status="p1"'));
  assert.ok(out.includes('Not saved'));
});

test('undo is offered only once there is something to undo', () => {
  const withHistory = renderPlannerView({ state: fullState });
  assert.match(withHistory, /id="undo-planner"(?![^>]*disabled)/, 'undo should be live');

  const fresh = renderPlannerView({ state: { ...fullState, undoStack: [] } });
  assert.match(fresh, /id="undo-planner"[^>]*disabled/, 'undo should be disabled with no history');
});

test('scratch inputs render from draft state so a repaint cannot blank them', () => {
  const out = renderPlannerView({ state: fullState });
  assert.ok(out.includes('value="Half-typed row"'), 'a half-typed quick-add row must survive');
  assert.ok(out.includes('data-draft="newItemTitle"'));
  assert.ok(out.includes('title,work_hours'), 'pasted CSV must survive a repaint');
  assert.ok(out.includes('data-draft="importCsv"'));
});

test('draft values are escaped like any other user input', () => {
  const out = renderPlannerView({
    state: { ...fullState, draft: { newItemTitle: `<script>alert(1)</script>` } },
  });
  assert.ok(!out.includes('<script>alert(1)</script>'), 'draft text escaped into live markup');
  assert.ok(out.includes('&lt;script&gt;'));
});

test('draft state falls back to the default when the user has typed nothing', () => {
  const out = renderPlannerView({ state: { ...fullState, draft: {} } });
  assert.ok(out.includes('value="8"'), 'the hours box keeps its 8-hour default');
});

test('the grid header, its rows, and the drawer all agree on a column count', () => {
  const table = renderPlannerTable(fullState);
  const headers = (table.match(/<th[\s>]/g) || []).length;
  const firstRow = table.slice(table.indexOf('<tr class="planner-row'));
  const cells = (firstRow.slice(0, firstRow.indexOf('</tr>')).match(/<td[\s>]/g) || []).length;

  assert.equal(cells, headers, 'a row has a different number of cells than the header');
  assert.ok(
    table.includes(`colspan="${headers}"`),
    `the drawer must span all ${headers} columns or the grid is visibly ragged`,
  );
});

test('views survive a state with no autosave bookkeeping at all', () => {
  // The wizard renders before any of this is populated, so nothing may assume it.
  const bare = { ...fullState };
  delete bare.draft;
  delete bare.pendingRows;
  delete bare.rowStatus;
  delete bare.undoStack;
  delete bare.saveStatus;

  for (const render of [
    () => renderPlannerView({ state: bare }),
    () => renderTeamView({ state: bare }),
    () => renderTaskTypesView({ state: bare }),
  ]) {
    assert.doesNotThrow(render);
  }
});

test('expanded planner row wires + Add a gate to that item', () => {
  const table = renderPlannerTable({
    ...fullState,
    expandedRows: new Set(['p2']),
    dependencies: fullState.dependencies.filter((d) => d.to_plan_item_id !== 'p2'),
  });
  assert.ok(table.includes('data-add-gate="p2"'));
  assert.ok(table.includes('No gates on this row'));
});

test('plan cards and workspace offer rename without dropping delete', () => {
  const out = renderPlansView({ state: fullState });
  assert.ok(out.includes('data-rename-plan="c1"'));
  assert.ok(out.includes('data-delete-plan="c1"'));
  assert.ok(out.includes('id="rename-workspace"'));
  assert.ok(out.includes('id="delete-workspace"'));
});

test('capacity offers day columns next to week and month', () => {
  const out = renderCapacityView({ state: fullState });
  assert.ok(out.includes('id="cap-granularity-day"'));
  assert.ok(out.includes('data-granularity="day"'));
});
