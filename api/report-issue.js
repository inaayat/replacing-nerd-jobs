// Lets anyone flag a problem with a quiz directly from its page. Unlike
// save-quiz.js's publish/submit duality, this always just opens a GitHub
// Issue — there's no "apply directly" version of a bug report, so no
// owner/public branching is needed here.
const OWNER = 'inaayat';
const REPO = 'replacing-nerd-jobs';

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

const MAX_DESCRIPTION = 2000;
const MAX_TITLE = 120;
const MAX_REPORTER = 80;

function validate(id, description) {
  if (!id || typeof id !== 'string' || !id.trim()) return 'Missing quiz id.';
  if (!description || typeof description !== 'string' || !description.trim()) return 'Description is required.';
  if (description.trim().length > MAX_DESCRIPTION) return `Description must be under ${MAX_DESCRIPTION} characters.`;
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

  const { id, title, description, reporter } = req.body || {};
  const validationError = validate(id, description);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const quizTitle = (title || id).toString().slice(0, MAX_TITLE);
  const who = (reporter || '').toString().slice(0, MAX_REPORTER).trim();
  const origin = req.headers.origin || 'https://inaayat.xyz';
  const quizUrl = `${origin}/sporcle-spinoff/play.html?quiz=${encodeURIComponent(id)}`;

  try {
    const ghRes = await gh('/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `[Quiz Issue] ${quizTitle}`,
        body: [
          `**Quiz:** [${quizTitle}](${quizUrl}) (\`${id}\`)`,
          '',
          '**Description:**',
          description.toString().trim(),
          '',
          who ? `Reported by: ${who}` : 'Reported anonymously.',
        ].join('\n'),
      }),
    });
    if (!ghRes.ok) {
      const body = await ghRes.text();
      throw new Error(`Creating issue failed: ${ghRes.status} ${body}`);
    }
    const issue = await ghRes.json();
    res.status(200).json({ issueUrl: issue.html_url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
