import { isAuthed } from '../lib/auth.js';

const OWNER = 'inaayat';
const REPO = 'replacing-nerd-jobs';
const BRANCH = 'main';
const CUBES_DIR = 'packing-cubes/cubes';

function gh(path, options = {}) {
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
}

async function getJsonFile(path, ref = BRANCH) {
  const res = await gh(`/contents/${path}?ref=${ref}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { sha: data.sha, json: JSON.parse(content) };
}

async function putJsonFile(path, json, sha, message, branch = BRANCH) {
  const content = Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf-8').toString('base64');
  const res = await gh(`/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function createBranch(name) {
  const refRes = await gh(`/git/ref/heads/${BRANCH}`);
  if (!refRes.ok) throw new Error(`Could not read ${BRANCH} ref: ${refRes.status}`);
  const { object } = await refRes.json();
  const res = await gh('/git/refs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${name}`, sha: object.sha }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Creating branch failed: ${res.status} ${body}`);
  }
}

async function openPullRequest(head, title, body) {
  const res = await gh('/pulls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, head, base: BRANCH, body }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Opening the review request failed: ${res.status} ${errBody}`);
  }
  return res.json();
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const REQUIRED_ITEM_COUNT = 2;
const MAX_ITEMS = 200;
const MAX_TITLE = 120;

function validateCube(cube) {
  if (!cube || typeof cube !== 'object') return 'Missing cube object.';
  if (!cube.title || !cube.title.trim()) return 'Title is required.';
  if (cube.title.length > MAX_TITLE) return `Title must be under ${MAX_TITLE} characters.`;
  if (!Array.isArray(cube.items) || cube.items.length < REQUIRED_ITEM_COUNT) {
    return `Add at least ${REQUIRED_ITEM_COUNT} items before publishing.`;
  }
  if (cube.items.length > MAX_ITEMS) return `Cubes are capped at ${MAX_ITEMS} items.`;
  for (const item of cube.items) {
    if (!item || typeof item.label !== 'string' || !item.label.trim()) {
      return 'Every item needs a label.';
    }
  }
  return null;
}

async function writeCubeFiles(finalCube, branch, submitted) {
  const cubePath = `${CUBES_DIR}/${finalCube.id}.json`;
  const fileCube = submitted ? { ...finalCube, submitted: true } : finalCube;
  const existingCube = await getJsonFile(cubePath);
  await putJsonFile(
    cubePath,
    fileCube,
    existingCube ? existingCube.sha : undefined,
    `${existingCube ? 'Update' : 'Add'} cube: ${finalCube.title}`,
    branch
  );
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ authed: await isAuthed(req.headers.cookie) });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  if (!process.env.GITHUB_TOKEN) {
    res.status(503).json({ error: 'GITHUB_TOKEN not configured.' });
    return;
  }

  const { cube, mode, submitter } = req.body || {};

  const validationError = validateCube(cube);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const id = cube.id && cube.id.trim() ? slugify(cube.id) : slugify(cube.title);
  const finalCube = {
    id,
    title: cube.title.trim(),
    blurb: (cube.blurb || '').trim(),
    tags: Array.isArray(cube.tags) ? cube.tags.map((t) => t.trim()).filter(Boolean) : [],
    items: cube.items.map((item) => ({ label: item.label.trim() })),
  };

  try {
    if (mode === 'publish') {
      if (!(await isAuthed(req.headers.cookie))) {
        res.status(401).json({ error: 'Publishing directly is owner-only — use "Submit for review" instead.' });
        return;
      }
      await writeCubeFiles(finalCube, BRANCH, false);
      res.status(200).json({ id, url: `/packing-cubes/cube.html?cube=${encodeURIComponent(id)}` });
      return;
    }

    if (mode === 'submit') {
      const branch = `cube-submissions/${id}-${Date.now().toString(36)}`;
      await createBranch(branch);
      await writeCubeFiles(finalCube, branch, true);
      const who = (submitter || '').toString().slice(0, 80).trim();
      const pr = await openPullRequest(
        branch,
        `Cube submission: ${finalCube.title}`,
        [
          `New packing cube submitted from the builder: **${finalCube.title}** (${finalCube.items.length} items).`,
          who ? `Submitted by: ${who}` : 'Submitted anonymously.',
          '',
          'Merging this PR publishes the cube to the catalog.',
        ].join('\n')
      );
      res.status(200).json({ id, prUrl: pr.html_url });
      return;
    }

    res.status(400).json({ error: `Unsupported mode "${mode}".` });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
