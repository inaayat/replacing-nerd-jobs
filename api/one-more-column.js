import { getAuth } from '../lib/neon-auth.js';
import { db, ensureSchema } from '../one-more-column/lib/db.js';
import { handleWorkspaces } from '../one-more-column/lib/handlers/workspaces.js';
import { handleScenarios } from '../one-more-column/lib/handlers/scenarios.js';
import { handleDependencies } from '../one-more-column/lib/handlers/dependencies.js';
import { handleImport } from '../one-more-column/lib/handlers/import.js';
import { handleCycles } from '../one-more-column/lib/handlers/cycles.js';
import { handlePolicy } from '../one-more-column/lib/handlers/policy.js';
import { handleResources } from '../one-more-column/lib/handlers/resources.js';
import { handlePlanItems } from '../one-more-column/lib/handlers/plan-items.js';
import { handleCapacity } from '../one-more-column/lib/handlers/capacity.js';
import { handleAssumptions, handleChangelog } from '../one-more-column/lib/handlers/assumptions.js';
import { handleAlerts } from '../one-more-column/lib/handlers/alerts.js';
import { handleExport } from '../one-more-column/lib/handlers/export.js';
import { handleTimeOff } from '../one-more-column/lib/handlers/time-off.js';
import { handleTaskTypes } from '../one-more-column/lib/handlers/task-types.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim();
  switch (route) {
    case 'me':
      return handleMe(req, res);
    case 'workspaces':
      return handleWorkspaces(req, res);
    case 'scenarios':
      return handleScenarios(req, res);
    case 'dependencies':
      return handleDependencies(req, res);
    case 'import':
      return handleImport(req, res);
    case 'cycles':
      return handleCycles(req, res);
    case 'policy':
      return handlePolicy(req, res);
    case 'resources':
      return handleResources(req, res);
    case 'task-types':
      return handleTaskTypes(req, res);
    case 'plan-items':
      return handlePlanItems(req, res);
    case 'capacity':
      return handleCapacity(req, res);
    // Legacy: Assumptions UI was removed; gates on Planner rows replaced it.
    // Route kept so old data and scripts don't 404.
    case 'assumptions':
      return handleAssumptions(req, res);
    case 'changelog':
      return handleChangelog(req, res);
    // Alerts UI archived; engine still powers GET for future inline surfacing.
    case 'alerts':
      return handleAlerts(req, res);
    case 'export':
      return handleExport(req, res);
    case 'time-off':
      return handleTimeOff(req, res);
    default:
      res.status(404).json({ error: 'Unknown OMC route.' });
  }
}

async function handleMe(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  if (!process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'NEON_AUTH_BASE_URL not configured.' });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  try {
    await ensureSchema();
    const rows = await db()`
      INSERT INTO users (id, email, name)
      VALUES (${auth.sub}, ${auth.email || null}, ${auth.name || null})
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = now()
      RETURNING id, email, name, created_at, last_seen_at
    `;
    res.status(200).json({ user: rows[0], auth: { sub: auth.sub } });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
