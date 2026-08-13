import { badRequest, requireAuth, sendJson } from '../api-helpers.js';
import { buildCapacityForCycle } from '../capacity-build.js';

export async function handleCapacity(req, res) {
  const auth = await requireAuth(req, res, { methods: ['GET'] });
  if (!auth) return;

  const cycleId = String(req.query?.cycle || '').trim();
  if (!cycleId) {
    badRequest(res, 'cycle query param is required.');
    return;
  }

  const grid = await buildCapacityForCycle({
    cycleId,
    scenarioId: String(req.query?.scenario || '').trim(),
    team: String(req.query?.team || '').trim(),
    mode: req.query?.mode === 'spread' ? 'spread' : 'due',
    granularity:
      req.query?.granularity === 'month' || req.query?.granularity === 'day'
        ? req.query.granularity
        : 'week',
  });

  if (!grid) {
    sendJson(res, 404, { error: 'Cycle or scenario not found.' });
    return;
  }

  sendJson(res, 200, grid);
}
