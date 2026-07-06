import { isAuthed } from '../lib/auth.js';

const OWNER = 'inaayat';
const REPO = 'replacing-nerd-jobs';
const BRANCH = 'main';
const QUIZZES_DIR = 'sporcle-spinoff/quizzes';

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

// Returns { sha, json } for an existing JSON file, or null if it doesn't exist.
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
const MAX_ITEMS = 500;
const MAX_TITLE = 120;

function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object') return 'Missing quiz object.';
  if (!quiz.title || !quiz.title.trim()) return 'Title is required.';
  if (quiz.title.length > MAX_TITLE) return `Title must be under ${MAX_TITLE} characters.`;
  if (!quiz.type) return 'Quiz type is required.';
  if (!Array.isArray(quiz.items) || quiz.items.length < REQUIRED_ITEM_COUNT) {
    return `Add at least ${REQUIRED_ITEM_COUNT} questions before publishing.`;
  }
  if (quiz.items.length > MAX_ITEMS) return `Quizzes are capped at ${MAX_ITEMS} questions.`;
  return null;
}

// Write the quiz file + updated catalog entry onto `branch`. File shas are
// read from main; for submission branches (freshly forked from main) those
// shas are identical, so the same update applies cleanly on either.
async function writeQuizFiles(finalQuiz, branch, submitted) {
  const quizPath = `${QUIZZES_DIR}/${finalQuiz.id}.json`;
  const existingQuiz = await getJsonFile(quizPath);
  await putJsonFile(
    quizPath,
    finalQuiz,
    existingQuiz ? existingQuiz.sha : undefined,
    `${existingQuiz ? 'Update' : 'Add'} quiz: ${finalQuiz.title}`,
    branch
  );

  const indexPath = `${QUIZZES_DIR}/index.json`;
  const indexFile = await getJsonFile(indexPath);
  const catalogEntry = {
    id: finalQuiz.id, title: finalQuiz.title, type: finalQuiz.type, blurb: finalQuiz.blurb || '',
    ...(submitted ? { submitted: true } : {}),
  };
  const currentIndex = indexFile ? indexFile.json : [];
  const newIndex = [...currentIndex.filter((q) => q.id !== finalQuiz.id), catalogEntry];
  await putJsonFile(
    indexPath,
    newIndex,
    indexFile ? indexFile.sha : undefined,
    `Add "${finalQuiz.title}" to quiz catalog`,
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

  const { quiz, mode, submitter } = req.body || {};

  const validationError = validateQuiz(quiz);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const id = quiz.id && quiz.id.trim() ? slugify(quiz.id) : slugify(quiz.title);
  const finalQuiz = { ...quiz, id };

  try {
    if (mode === 'publish') {
      if (!(await isAuthed(req.headers.cookie))) {
        res.status(401).json({ error: 'Publishing directly is owner-only — use "Submit for review" instead.' });
        return;
      }
      await writeQuizFiles(finalQuiz, BRANCH, false);
      res.status(200).json({ id, url: `/sporcle-spinoff/play.html?quiz=${encodeURIComponent(id)}` });
      return;
    }

    if (mode === 'submit') {
      const branch = `quiz-submissions/${id}-${Date.now().toString(36)}`;
      await createBranch(branch);
      await writeQuizFiles(finalQuiz, branch, true);
      const who = (submitter || '').toString().slice(0, 80).trim();
      const pr = await openPullRequest(
        branch,
        `Quiz submission: ${finalQuiz.title}`,
        [
          `New **${finalQuiz.type}** quiz submitted from the builder: **${finalQuiz.title}** (${finalQuiz.items.length} questions).`,
          who ? `Submitted by: ${who}` : 'Submitted anonymously.',
          '',
          'Merging this PR publishes the quiz to the catalog.',
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
