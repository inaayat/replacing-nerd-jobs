// GitHub Contents API helpers for publishing public packing cubes.
// Used when a signed-in user makes a private cube public: open a PR and
// merge it immediately so the shared static catalog picks it up on deploy.

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

async function deleteJsonFile(path, sha, message, branch = BRANCH) {
  const res = await gh(`/contents/${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DELETE ${path} failed: ${res.status} ${body}`);
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
    throw new Error(`Opening the pull request failed: ${res.status} ${errBody}`);
  }
  return res.json();
}

async function mergePullRequest(number) {
  const res = await gh(`/pulls/${number}/merge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commit_title: `Merge cube publish #${number}`,
      merge_method: 'squash',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auto-merging PR #${number} failed: ${res.status} ${body}`);
  }
  return res.json();
}

function catalogEntry(cube) {
  return {
    id: cube.id,
    title: cube.title,
    blurb: cube.blurb || '',
    tags: Array.isArray(cube.tags) ? cube.tags : [],
  };
}

function fileCube(cube) {
  return {
    id: cube.id,
    title: cube.title,
    blurb: cube.blurb || '',
    tags: Array.isArray(cube.tags) ? cube.tags : [],
    items: (cube.items || []).map((item) => ({ label: item.label })),
  };
}

async function writeCubeAndIndex(cube, branch) {
  const cubePath = `${CUBES_DIR}/${cube.id}.json`;
  const indexPath = `${CUBES_DIR}/index.json`;
  const payload = fileCube(cube);

  const existingCube = await getJsonFile(cubePath, branch);
  await putJsonFile(
    cubePath,
    payload,
    existingCube ? existingCube.sha : undefined,
    `${existingCube ? 'Update' : 'Add'} public cube: ${cube.title}`,
    branch
  );

  const existingIndex = await getJsonFile(indexPath, branch);
  const list = existingIndex && Array.isArray(existingIndex.json) ? [...existingIndex.json] : [];
  const entry = catalogEntry(cube);
  const idx = list.findIndex((row) => row.id === cube.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await putJsonFile(
    indexPath,
    list,
    existingIndex ? existingIndex.sha : undefined,
    `Catalog: ${existingCube ? 'update' : 'add'} ${cube.id}`,
    branch
  );
}

/** Open a PR that publishes the cube to the static catalog, then merge it. */
export async function publishCubeViaAutoMergedPr(cube, { authorLabel } = {}) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN not configured.');
  }

  const branch = `cube-publish/${cube.id}-${Date.now().toString(36)}`;
  await createBranch(branch);
  await writeCubeAndIndex(cube, branch);

  const who = (authorLabel || '').toString().slice(0, 80).trim();
  const pr = await openPullRequest(
    branch,
    `Publish cube: ${cube.title}`,
    [
      `Auto-accepted publish of packing cube **${cube.title}** (${(cube.items || []).length} items).`,
      who ? `Published by: ${who}` : 'Published by a signed-in user.',
      '',
      'This PR was opened by the packing-cubes API and merged automatically.',
    ].join('\n')
  );

  await mergePullRequest(pr.number);
  return { prUrl: pr.html_url, prNumber: pr.number };
}

/** Remove a public cube from the GitHub catalog (direct commit on main). */
export async function unpublishCubeFromGithub(cubeId) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN not configured.');
  }

  const cubePath = `${CUBES_DIR}/${cubeId}.json`;
  const indexPath = `${CUBES_DIR}/index.json`;
  const existing = await getJsonFile(cubePath);
  if (existing) {
    await deleteJsonFile(cubePath, existing.sha, `Unpublish cube: ${existing.json.title || cubeId}`);
  }

  const index = await getJsonFile(indexPath);
  if (!index || !Array.isArray(index.json)) return;
  const updated = index.json.filter((entry) => entry.id !== cubeId);
  if (updated.length === index.json.length) return;
  await putJsonFile(indexPath, updated, index.sha, `Remove ${cubeId} from cube catalog index`);
}
