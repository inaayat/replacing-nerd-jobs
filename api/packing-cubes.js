import { getAuth } from '../lib/neon-auth.js';
import { upsertUser } from '../lib/a-list.js';
import {
  validateCube,
  normalizeCubeInput,
  listOwnCubes,
  getCube,
  insertCube,
  updateOwnedCube,
  deleteOwnedCube,
  nextFreeId,
  takenCubeIds,
  getSuitcaseState,
  putSuitcaseState,
} from '../lib/packing-cubes.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || 'cubes').trim();
  switch (route) {
    case 'cubes':
      return handleCubes(req, res);
    case 'suitcases':
      return handleSuitcases(req, res);
    default:
      res.status(404).json({ error: 'Unknown packing-cubes route.' });
  }
}

function requireDb(res) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return false;
  }
  if (!process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'NEON_AUTH_BASE_URL not configured.' });
    return false;
  }
  return true;
}

async function requireUser(req, res) {
  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  try {
    const userId = await upsertUser(auth);
    return { auth, userId };
  } catch (err) {
    res.status(502).json({ error: err.message });
    return null;
  }
}

async function handleCubes(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  const { userId } = session;

  if (req.method === 'GET') {
    const id = String(req.query?.id || '').trim();
    try {
      if (id) {
        const cube = await getCube(id, userId);
        if (!cube) {
          res.status(404).json({ error: 'Cube not found.' });
          return;
        }
        res.status(200).json({ cube });
        return;
      }
      const cubes = await listOwnCubes(userId);
      res.status(200).json({ cubes });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const validationError = validateCube(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const cube = normalizeCubeInput(body);
    if (!cube.id) {
      res.status(400).json({ error: 'Give the cube a name first.' });
      return;
    }
    try {
      // Ids are derived from the title and never shown, so resolve collisions
      // (including with other users' cubes) instead of asking for a new id.
      cube.id = nextFreeId(cube.id, await takenCubeIds(cube.id));
      const created = await insertCube(userId, cube);
      res.status(201).json({ cube: created });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const validationError = validateCube(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const cube = normalizeCubeInput(body, { fallbackId: body.id });
    if (!cube.id) {
      res.status(400).json({ error: 'Missing cube id.' });
      return;
    }
    try {
      const updated = await updateOwnedCube(userId, cube);
      if (!updated) {
        res.status(404).json({ error: 'Cube not found, or you do not own it.' });
        return;
      }
      res.status(200).json({ cube: updated });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const id = String((req.body || {}).id || req.query?.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Missing cube id.' });
      return;
    }
    try {
      const deleted = await deleteOwnedCube(userId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Cube not found, or you do not own it.' });
        return;
      }
      res.status(200).json({ id });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET, POST, PATCH, or DELETE.' });
}

async function handleSuitcases(req, res) {
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  const { userId } = session;

  if (req.method === 'GET') {
    try {
      const state = await getSuitcaseState(userId);
      res.status(200).json(state);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    if (!Array.isArray(body.suitcases)) {
      res.status(400).json({ error: 'suitcases must be an array.' });
      return;
    }
    if (body.suitcases.length > 50) {
      res.status(400).json({ error: 'Too many suitcases (max 50).' });
      return;
    }
    try {
      const state = await putSuitcaseState(userId, body);
      res.status(200).json(state);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET or PUT.' });
}
