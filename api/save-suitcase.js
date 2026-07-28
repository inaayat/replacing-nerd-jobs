// Lets anyone save a suitcase out of localStorage by opening a PR against
// the repo, the same way an anonymous visitor submits a cube for review —
// there's no "owner direct publish" path here, since a suitcase isn't part
// of a curated catalog the way cubes are; every submission goes through review.
const OWNER = 'inaayat';
const REPO = 'replacing-nerd-jobs';
const BRANCH = 'main';
const SUITCASES_DIR = 'packing-cubes/suitcases';

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

async function putJsonFile(path, json, message, branch) {
  const content = Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf-8').toString('base64');
  const res = await gh(`/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, branch }),
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
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const MAX_NAME = 120;
const MAX_CUBES = 50;
const MAX_CUSTOM_ITEMS = 200;
const MAX_LABEL = 200;
const MAX_SUBMITTER = 80;

function validateSuitcase(suitcase) {
  if (!suitcase || typeof suitcase !== 'object') return 'Missing suitcase object.';
  if (suitcase.name && (typeof suitcase.name !== 'string' || suitcase.name.length > MAX_NAME)) {
    return `Trip name must be under ${MAX_NAME} characters.`;
  }
  if (!Array.isArray(suitcase.cubeIds)) return 'cubeIds must be a list.';
  if (suitcase.cubeIds.length > MAX_CUBES) return `Suitcases are capped at ${MAX_CUBES} cubes.`;
  for (const id of suitcase.cubeIds) {
    if (typeof id !== 'string') return 'Invalid cube id.';
  }
  if (suitcase.customItems) {
    if (!Array.isArray(suitcase.customItems)) return 'customItems must be a list.';
    if (suitcase.customItems.length > MAX_CUSTOM_ITEMS) return `Suitcases are capped at ${MAX_CUSTOM_ITEMS} custom items.`;
    for (const item of suitcase.customItems) {
      if (!item || typeof item.label !== 'string') return 'Every custom item needs a label.';
      if (item.label.length > MAX_LABEL) return `Custom item labels must be under ${MAX_LABEL} characters.`;
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  if (!process.env.GITHUB_TOKEN) {
    res.status(503).json({ error: 'GITHUB_TOKEN not configured.' });
    return;
  }

  const { suitcase, submitter } = req.body || {};
  const validationError = validateSuitcase(suitcase);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const baseName = slugify(suitcase.name) || 'trip';
  const fileId = `${baseName}-${Date.now().toString(36)}`;

  const finalSuitcase = {
    name: (suitcase.name || 'Untitled trip').trim(),
    cubeIds: suitcase.cubeIds.filter((id) => typeof id === 'string'),
    customItems: Array.isArray(suitcase.customItems)
      ? suitcase.customItems.map((i) => ({ label: String(i.label).trim() })).filter((i) => i.label)
      : [],
    packed: suitcase.packed && typeof suitcase.packed === 'object' && !Array.isArray(suitcase.packed) ? suitcase.packed : {},
    excludedItems: Array.isArray(suitcase.excludedItems) ? suitcase.excludedItems.filter((k) => typeof k === 'string') : [],
    submittedAt: new Date().toISOString(),
  };

  try {
    const branch = `suitcase-submissions/${fileId}`;
    await createBranch(branch);
    await putJsonFile(`${SUITCASES_DIR}/${fileId}.json`, finalSuitcase, `Save suitcase: ${finalSuitcase.name}`, branch);
    const who = (submitter || '').toString().slice(0, MAX_SUBMITTER).trim();
    const pr = await openPullRequest(
      branch,
      `Suitcase submission: ${finalSuitcase.name}`,
      [
        `A suitcase was submitted from the packing app: **${finalSuitcase.name}** (${finalSuitcase.cubeIds.length} cube${finalSuitcase.cubeIds.length === 1 ? '' : 's'}, ${finalSuitcase.customItems.length} custom item${finalSuitcase.customItems.length === 1 ? '' : 's'}).`,
        who ? `Submitted by: ${who}` : 'Submitted anonymously.',
        '',
        'Merging this PR saves the suitcase to the repo.',
      ].join('\n')
    );
    res.status(200).json({ id: fileId, prUrl: pr.html_url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
