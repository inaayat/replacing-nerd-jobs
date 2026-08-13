import { db } from './db.js';
import { DEFAULT_POLICY_CONFIG } from './default-policy.js';
import { computeWeeklyCapacity, computeDailyCapacity, enumerateWeeks, enumerateDays } from '../engines/availability.js';
import { buildCapacityGrid, computeWeeklyLoad } from '../engines/capacity.js';

import { rollupGridToMonths } from '../engines/period_rollup.js';

export async function buildCapacityForCycle({ cycleId, scenarioId, team, mode = 'due', granularity = 'week' }) {
  const cycleRows = await db()`
    SELECT id, workspace_id, name, profile, status, cycle_type, start_date, end_date
    FROM planning_cycles WHERE id = ${cycleId}
  `;
  if (!cycleRows.length) return null;
  const cycle = cycleRows[0];

  let scenario = null;
  if (scenarioId) {
    const rows = await db()`SELECT id, name, status FROM scenarios WHERE id = ${scenarioId}`;
    scenario = rows[0] || null;
  } else {
    const rows = await db()`
      SELECT id, name, status FROM scenarios
      WHERE cycle_id = ${cycleId} AND status = 'active'
      ORDER BY created_at LIMIT 1
    `;
    scenario = rows[0] || null;
  }
  if (!scenario) return null;

  const policyRows = await db()`
    SELECT config FROM planning_policies WHERE cycle_id = ${cycleId} ORDER BY version DESC LIMIT 1
  `;
  const policy = { ...DEFAULT_POLICY_CONFIG, ...(policyRows[0]?.config || {}) };
  const workspaceId = cycle.workspace_id;

  const resourceRows = team
    ? await db()`
        SELECT id, name, email, team, active, jira_account_id
        FROM resources WHERE workspace_id = ${workspaceId} AND active = true AND team = ${team}
        ORDER BY name
      `
    : await db()`
        SELECT id, name, email, team, active, jira_account_id
        FROM resources WHERE workspace_id = ${workspaceId} AND active = true
        ORDER BY team NULLS LAST, name
      `;

  const teamRows = await db()`
    SELECT DISTINCT team FROM resources
    WHERE workspace_id = ${workspaceId} AND active = true AND team IS NOT NULL
    ORDER BY team
  `;
  const teams = teamRows.map((r) => r.team);

  const ids = resourceRows.map((r) => r.id);
  let profiles = [];
  let timeOff = [];
  if (ids.length) {
    profiles = await db()`
      SELECT resource_id, effective_from, weekly_hours, daily_hours
      FROM resource_profiles WHERE resource_id = ANY(${ids})
    `;
    timeOff = await db()`
      SELECT resource_id, start_date, end_date, hours_per_day, reason
      FROM resource_time_off WHERE resource_id = ANY(${ids})
    `;
  }

  const resources = resourceRows.map((r) => ({
    ...r,
    profiles: profiles.filter((p) => p.resource_id === r.id),
    time_off: timeOff.filter((t) => t.resource_id === r.id),
  }));

  const startDate = cycle.start_date || defaultRangeStart();
  const endDate = cycle.end_date || defaultRangeEnd();

  const planItems = await db()`
    SELECT id, title, work_hours, review_hours, due_week, assignee_ids
    FROM plan_items WHERE scenario_id = ${scenario.id}
  `;

  const capacityMatrix =
    granularity === 'day'
      ? computeDailyCapacity(resources, enumerateDays(startDate, endDate), policy)
      : computeWeeklyCapacity(resources, enumerateWeeks(startDate, endDate), policy);
  const periods = granularity === 'day' ? enumerateDays(startDate, endDate) : enumerateWeeks(startDate, endDate);
  const loadMatrix = computeWeeklyLoad(planItems, mode, policy, granularity === 'day' ? 'day' : 'week');
  const grid = buildCapacityGrid({ resources, weeks: periods, capacityMatrix, loadMatrix, policy });
  grid.mode = mode;
  grid.granularity = granularity === 'day' ? 'day' : 'week';
  grid.cycle = { id: cycle.id, name: cycle.name, cycle_type: cycle.cycle_type };
  grid.workspace_id = workspaceId;
  grid.scenario = scenario;
  grid.team = team || null;
  grid.teams = teams;
  grid.policy = policy;

  if (granularity === 'month') return rollupGridToMonths(grid);
  return grid;
}

function defaultRangeStart() {
  const d = new Date();
  d.setUTCMonth(0, 1);
  return d.toISOString().slice(0, 10);
}

function defaultRangeEnd() {
  const d = new Date();
  d.setUTCMonth(11, 31);
  return d.toISOString().slice(0, 10);
}
