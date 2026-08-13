/**
 * Routing, onboarding progress, and sidebar nav.
 *
 * Route names describe what the page is for. Legacy aliases keep old bookmarks
 * working: `settings` → Plans, `preferences` / `rules` → Capacity (where
 * planning rules now live).
 */

export const ROUTES = ['planner', 'capacity', 'team', 'task-types', 'plans', 'guide'];

/** Routes that need a workspace + plan before they can show anything. */
const NEEDS_PLAN = new Set(['planner', 'capacity', 'team', 'task-types']);

const LEGACY_ROUTES = {
  home: 'guide',
  settings: 'plans',
  preferences: 'capacity',
  rules: 'capacity',
  plan: 'planner',
  dependencies: 'planner',
  /** Alerts UI archived — dependency/gate issues surface on the Planner for now. */
  alerts: 'planner',
  setup: 'plans',
};

/** Seeded catalog keys — present before anyone customizes. */
const DEFAULT_TYPE_KEYS = new Set([
  'general',
  'deliverable',
  'review',
  'meeting',
  'admin',
  'other',
]);

/**
 * True once the workspace has shaped its work catalog: a custom type, or any
 * type with fields / gate dependencies. Seeded defaults alone don't count.
 */
export function hasCustomizedTaskTypes(taskTypes = []) {
  return taskTypes.some(
    (t) =>
      !DEFAULT_TYPE_KEYS.has(t.key) ||
      (t.fields || []).length > 0 ||
      (t.gate_templates || []).length > 0,
  );
}

export function normalizeRoute(route) {
  const mapped = LEGACY_ROUTES[route] || route;
  return ROUTES.includes(mapped) ? mapped : 'planner';
}

export function getSetupProgress(state) {
  const hasWorkspace = state.workspaces.length > 0 && Boolean(state.activeWorkspaceId);
  const hasPlan = state.cycles.length > 0 && Boolean(state.activeCycleId);
  const hasTeam = state.resources.length > 0;
  const hasWork = state.planItems.length > 0;
  const hasTypes = hasCustomizedTaskTypes(state.taskTypes);

  /** Workspace + plan — the minimum needed to open other pages. */
  const planReady = hasWorkspace && hasPlan;
  /** Types (fields + dependency templates) should be shaped before listing work. */
  const typesReady = planReady && hasTypes;
  /** Work listed and people to do it — the minimum for capacity to mean anything. */
  const capacityReady = planReady && hasWork && hasTeam;

  const steps = [
    { id: 'plan', label: 'Create a plan', done: planReady, route: 'plans' },
    { id: 'types', label: 'Define task types', done: typesReady, route: 'task-types' },
    { id: 'work', label: 'List the work', done: hasWork, route: 'planner' },
    { id: 'team', label: 'Add your team', done: hasTeam, route: 'team' },
    { id: 'capacity', label: 'Check capacity', done: capacityReady, route: 'capacity' },
  ];

  return {
    steps,
    nextStep: steps.find((s) => !s.done) || null,
    planReady,
    typesReady,
    capacityReady,
    hasWorkspace,
    hasPlan,
    hasTypes,
    hasTeam,
    hasWork,
  };
}

export function getInitialRoute(state) {
  const progress = getSetupProgress(state);
  if (!progress.planReady) return 'plans';
  if (!progress.typesReady) return 'task-types';
  return 'planner';
}

/**
 * Resolves a requested route to one the current data can actually render.
 * Returns the reason so the destination can explain the redirect rather than
 * silently bouncing the user, which is what the old version did.
 */
export function resolveRoute(route, state) {
  const normalized = normalizeRoute(route);
  const progress = getSetupProgress(state);
  if (!progress.planReady && NEEDS_PLAN.has(normalized)) {
    return { route: 'plans', redirectedFrom: normalized };
  }
  return { route: normalized, redirectedFrom: null };
}

/** Best landing route after creating or opening a plan. */
export function postPlanRoute(state) {
  return getSetupProgress(state).typesReady ? 'planner' : 'task-types';
}

export function navItems(state) {
  const progress = getSetupProgress(state);
  const next = progress.nextStep?.route;
  const locked = !progress.planReady;
  const lockedTitle = 'Create a plan first';

  return [
    {
      id: 'task-types',
      label: 'Task types',
      locked,
      lockedHint: 'needs a plan',
      lockedTitle,
      next: next === 'task-types',
    },
    {
      id: 'planner',
      label: 'Planner',
      locked,
      lockedHint: 'needs a plan',
      lockedTitle,
      next: next === 'planner',
    },
    {
      id: 'capacity',
      label: 'Capacity',
      locked,
      lockedHint: 'needs a plan',
      lockedTitle,
      next: next === 'capacity',
    },
    {
      id: 'team',
      label: 'Team',
      locked,
      lockedHint: 'needs a plan',
      lockedTitle,
      next: next === 'team',
    },
    { id: 'plans', label: 'Plans', next: next === 'plans' },
    { id: 'guide', label: 'How it works' },
  ];
}
