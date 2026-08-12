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

// Same as getJsonFile but returns the raw text un-parsed, so a caller can
// surgically edit one field via string/regex ops instead of round-tripping
// the whole file through JSON.stringify (which reformats every array).
async function getTextFile(path, ref = BRANCH) {
  const res = await gh(`/contents/${path}?ref=${ref}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const data = await res.json();
  return { sha: data.sha, text: Buffer.from(data.content, 'base64').toString('utf-8') };
}

async function putTextFile(path, text, sha, message, branch = BRANCH) {
  const content = Buffer.from(text, 'utf-8').toString('base64');
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

// ── Tag-suggestion helpers: surgical single-line text patches ──────────
// Reused for both a quiz file (the whole file is one object) and a single
// entry's { ... } substring within index.json's array — never re-stringifies
// a whole file, so unrelated content/formatting is untouched.

function extractField(text, field) {
  const m = text.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

function extractTags(block) {
  const m = block.match(/"tags"\s*:\s*(\[[^\]]*\])/);
  if (!m) return [];
  try { return JSON.parse(m[1]); } catch { return []; }
}

function mergeTags(existing, suggested) {
  const out = [...existing];
  const lowerSet = new Set(existing.map((t) => t.toLowerCase()));
  for (const t of suggested) {
    const trimmed = t.trim();
    if (!trimmed || lowerSet.has(trimmed.toLowerCase())) continue;
    out.push(trimmed);
    lowerSet.add(trimmed.toLowerCase());
  }
  return out;
}

// Replaces an existing "tags": [...] line, or inserts a new one right after
// the "blurb" line (matching its indentation) if the object has none yet.
function patchTagsLine(text, newTags) {
  const tagsJson = JSON.stringify(newTags);
  const tagsRe = /"tags"\s*:\s*\[[^\]]*\]/;
  if (tagsRe.test(text)) return text.replace(tagsRe, `"tags": ${tagsJson}`);

  const blurbLineRe = /^([ \t]*)"blurb"\s*:\s*(?:"(?:[^"\\]|\\.)*")(,?)[ \t]*$/m;
  const m = text.match(blurbLineRe);
  if (!m) throw new Error('Could not find a spot to add tags to this quiz.');
  const [full, indent, hadComma] = m;
  const newBlurbLine = hadComma ? full : `${full},`;
  const insertLine = `\n${indent}"tags": ${tagsJson}${hadComma ? ',' : ''}`;
  return text.slice(0, m.index) + newBlurbLine + insertLine + text.slice(m.index + full.length);
}

// Finds the single { ... } block within index.json's array whose "id" field
// matches, by scanning non-nested object literals (catalog entries never
// nest objects, so this is safe and avoids fragile whole-array regexes).
function findIndexEntryBlock(text, id) {
  const re = /\{[^{}]*\}/g;
  const needle = `"id": "${id}"`;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].includes(needle)) return { start: m.index, end: m.index + m[0].length, block: m[0] };
  }
  return null;
}

function patchIndexEntryTags(indexText, id, newTags) {
  const found = findIndexEntryBlock(indexText, id);
  if (!found) throw new Error(`No catalog entry found for "${id}".`);
  const patchedBlock = patchTagsLine(found.block, newTags);
  return indexText.slice(0, found.start) + patchedBlock + indexText.slice(found.end);
}

const MAX_TAG_LENGTH = 40;
const MAX_TAGS_PER_SUGGESTION = 10;

function validateSuggestedTags(id, tags) {
  if (!id || typeof id !== 'string' || !id.trim()) return 'Missing quiz id.';
  if (!Array.isArray(tags) || !tags.length) return 'Add at least one tag.';
  if (tags.length > MAX_TAGS_PER_SUGGESTION) return `Suggest at most ${MAX_TAGS_PER_SUGGESTION} tags at once.`;
  for (const t of tags) {
    if (typeof t !== 'string' || !t.trim()) return 'Tags cannot be blank.';
    if (t.trim().length > MAX_TAG_LENGTH) return `Each tag must be under ${MAX_TAG_LENGTH} characters.`;
  }
  return null;
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

// Writes only the quiz's own file onto `branch`. The shared catalog
// (quizzes/index.json) is intentionally NOT touched here — it's regenerated
// from the quiz files by the build-quiz-index GitHub Action whenever main
// changes. That's what lets many submissions land without colliding: each
// only ever creates/updates its own uniquely-named file.
async function writeQuizFiles(finalQuiz, branch, submitted) {
  const quizPath = `${QUIZZES_DIR}/${finalQuiz.id}.json`;
  // Bake the submitted flag into the file so the generator can surface it.
  const fileQuiz = submitted ? { ...finalQuiz, submitted: true } : finalQuiz;
  const existingQuiz = await getJsonFile(quizPath);
  await putJsonFile(
    quizPath,
    fileQuiz,
    existingQuiz ? existingQuiz.sha : undefined,
    `${existingQuiz ? 'Update' : 'Add'} quiz: ${finalQuiz.title}`,
    branch
  );
}

// Patches only the quiz file's tags on `branch`. The catalog index is
// regenerated from the files by the GitHub Action, so it isn't touched here.
// No-ops (returns changed:false) if every suggested tag already exists
// (case-insensitively), so callers can skip opening an empty PR/commit.
async function writeTagSuggestion(id, suggestedTags, branch) {
  const quizPath = `${QUIZZES_DIR}/${id}.json`;
  const quizFile = await getTextFile(quizPath);
  if (!quizFile) throw new Error(`Quiz "${id}" not found.`);

  const currentTags = extractTags(quizFile.text);
  const mergedTags = mergeTags(currentTags, suggestedTags);
  const title = extractField(quizFile.text, 'title') || id;
  if (mergedTags.length === currentTags.length) return { title, mergedTags, changed: false };

  const patchedQuizText = patchTagsLine(quizFile.text, mergedTags);
  await putTextFile(quizPath, patchedQuizText, quizFile.sha, `Add tag(s) to "${title}"`, branch);

  return { title, mergedTags, changed: true };
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

  const { quiz, mode, submitter, id: suggestId, tags: suggestedTags } = req.body || {};

  // All catalog writes go through a review PR — there is no site-password
  // "publish straight to main" path anymore.
  if (mode === 'suggest-tags' || mode === 'suggest-tags-publish') {
    const validationError = validateSuggestedTags(suggestId, suggestedTags);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const id = slugify(suggestId);
    try {
      const branch = `tag-suggestions/${id}-${Date.now().toString(36)}`;
      await createBranch(branch);
      const { title, mergedTags, changed } = await writeTagSuggestion(id, suggestedTags, branch);
      if (!changed) {
        res.status(200).json({ id, tags: mergedTags, changed: false });
        return;
      }
      const who = (submitter || '').toString().slice(0, 80).trim();
      const pr = await openPullRequest(
        branch,
        `Suggest tag(s) for: ${title}`,
        [
          `New tag(s) suggested for **${title}**: ${suggestedTags.map((t) => `\`${t.trim()}\``).join(', ')}.`,
          who ? `Suggested by: ${who}` : 'Suggested anonymously.',
          '',
          'Merging this PR adds the tag(s) to the catalog and the quiz page.',
        ].join('\n')
      );
      res.status(200).json({ id, tags: mergedTags, changed: true, prUrl: pr.html_url });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  const validationError = validateQuiz(quiz);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const id = quiz.id && quiz.id.trim() ? slugify(quiz.id) : slugify(quiz.title);
  const finalQuiz = { ...quiz, id };

  try {
    if (mode === 'publish' || mode === 'submit') {
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
