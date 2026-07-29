import { getAuth } from '../lib/neon-auth.js';
import { upsertUser } from '../lib/a-list.js';
import {
  validateCube,
  normalizeCubeInput,
  listVisibleCubes,
  getCube,
  getOwnedCube,
  insertCube,
  updateOwnedCube,
  markCubePublic,
  deleteOwnedCube,
  getSuitcaseState,
  putSuitcaseState,
} from '../lib/packing-cubes.js';
import { publishCubeViaAutoMergedPr, unpublishCubeFromGithub } from '../lib/github-cubes.js';

export default async function handler(req, res) {
  const route = String(req.query?.route || 'cubes').trim();
  switch (route) {
    case 'cubes':
      return handleCubes(req, res);
    case 'publish':
      return handlePublish(req, res);
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
      const cubes = await listVisibleCubes(userId);
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
      res.status(400).json({ error: 'Could not derive a cube id from the title.' });
      return;
    }
    try {
      const existing = await getCube(cube.id, userId);
      if (existing) {
        res.status(409).json({ error: `A cube with id "${cube.id}" already exists. Pick another id.` });
        return;
      }
      const created = await insertCube(userId, cube);
      res.status(201).json({ cube: created });
    } catch (err) {
      if (String(err.message || '').includes('duplicate key')) {
        res.status(409).json({ error: `A cube with id "${cube.id}" already exists.` });
        return;
      }
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
      // Keep the GitHub catalog in sync when the owner edits a public cube.
      if (updated.is_public) {
        try {
          const publish = await publishCubeViaAutoMergedPr(updated, {
            authorLabel: session.auth.email || session.auth.name,
          });
          updated.github_pr_url = publish.prUrl;
          await markCubePublic(userId, updated.id, { prUrl: publish.prUrl });
        } catch (err) {
          res.status(200).json({
            cube: updated,
            warning: `Saved privately, but GitHub sync failed: ${err.message}`,
          });
          return;
        }
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
      if (deleted.is_public) {
        try {
          await unpublishCubeFromGithub(id);
        } catch (err) {
          res.status(200).json({
            id,
            warning: `Deleted from your account, but GitHub cleanup failed: ${err.message}`,
          });
          return;
        }
      }
      res.status(200).json({ id });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET, POST, PATCH, or DELETE.' });
}

async function handlePublish(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  if (!requireDb(res)) return;
  const session = await requireUser(req, res);
  if (!session) return;
  const { userId, auth } = session;

  const id = String((req.body || {}).id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Missing cube id.' });
    return;
  }

  try {
    const owned = await getOwnedCube(id, userId);
    if (!owned) {
      res.status(404).json({ error: 'Cube not found, or you do not own it.' });
      return;
    }
    const validationError = validateCube(owned);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const publish = await publishCubeViaAutoMergedPr(owned, {
      authorLabel: auth.email || auth.name,
    });
    const cube = await markCubePublic(userId, id, { prUrl: publish.prUrl });
    res.status(200).json({
      cube,
      prUrl: publish.prUrl,
      url: `/packing-cubes/cube.html?cube=${encodeURIComponent(id)}`,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
