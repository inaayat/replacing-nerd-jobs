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

// Returns { sha, json } for an existing JSON file, or null if it doesn't exist yet.
async function getJsonFile(path) {
  const res = await gh(`/contents/${path}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { sha: data.sha, json: JSON.parse(content) };
}

async function putJsonFile(path, json, sha, message) {
  const content = Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf-8').toString('base64');
  const res = await gh(`/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const REQUIRED_ITEM_COUNT = 2;

function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object') return 'Missing quiz object.';
  if (!quiz.title || !quiz.title.trim()) return 'Title is required.';
  if (!quiz.type) return 'Quiz type is required.';
  if (!Array.isArray(quiz.items) || quiz.items.length < REQUIRED_ITEM_COUNT) {
    return `Add at least ${REQUIRED_ITEM_COUNT} questions before publishing.`;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  if (!(await isAuthed(req.headers.cookie))) {
    res.status(401).json({ error: 'Not authorized.' });
    return;
  }

  if (!process.env.GITHUB_TOKEN) {
    res.status(503).json({ error: 'GITHUB_TOKEN not configured.' });
    return;
  }

  const { quiz, mode } = req.body || {};
  if (mode !== 'publish') {
    res.status(400).json({ error: `Unsupported mode "${mode}". Only "publish" is supported right now.` });
    return;
  }

  const validationError = validateQuiz(quiz);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const id = quiz.id && quiz.id.trim() ? slugify(quiz.id) : slugify(quiz.title);
  const finalQuiz = { ...quiz, id };
  const quizPath = `${QUIZZES_DIR}/${id}.json`;

  try {
    const existingQuiz = await getJsonFile(quizPath);
    await putJsonFile(
      quizPath,
      finalQuiz,
      existingQuiz ? existingQuiz.sha : undefined,
      `${existingQuiz ? 'Update' : 'Add'} quiz: ${finalQuiz.title}`
    );

    const indexPath = `${QUIZZES_DIR}/index.json`;
    const indexFile = await getJsonFile(indexPath);
    const catalogEntry = { id, title: finalQuiz.title, type: finalQuiz.type, blurb: finalQuiz.blurb || '' };
    const currentIndex = indexFile ? indexFile.json : [];
    const withoutThisId = currentIndex.filter((q) => q.id !== id);
    const newIndex = [...withoutThisId, catalogEntry];
    await putJsonFile(
      indexPath,
      newIndex,
      indexFile ? indexFile.sha : undefined,
      `Add "${finalQuiz.title}" to quiz catalog`
    );

    res.status(200).json({ id, url: `/sporcle-spinoff/play.html?quiz=${encodeURIComponent(id)}` });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
