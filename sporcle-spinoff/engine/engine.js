// Quiz engine — the shared shell. Loads a quiz by ?quiz=<id>, renders the
// start screen, runs a timer + score/progress HUD, dispatches to the renderer
// module named by quiz.type, and shows a results screen. Persists a best score
// per quiz id in localStorage.
import { normalize, matchAccept } from './normalize.js';

const root = document.getElementById('quiz-root');

const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};
const bestKey = (id) => `sporcle:best:${id}`;
const getBest = (id) => { const v = +localStorage.getItem(bestKey(id)); return Number.isFinite(v) ? v : 0; };
const setBest = (id, v) => { if (v > getBest(id)) localStorage.setItem(bestKey(id), String(v)); };

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

async function boot() {
  const params = new URLSearchParams(location.search);
  let quiz;

  if (params.get('preview') === '1') {
    try {
      quiz = JSON.parse(sessionStorage.getItem('sporcle:preview'));
      if (!quiz) throw new Error('no draft found');
    } catch (e) {
      root.innerHTML = '<div class="q-card"><h1>No preview available</h1><p class="blurb">Go back to the builder and try again.</p></div>';
      return;
    }
    document.title = `${quiz.title || 'Preview'} — Sporcle Spinoff (preview)`;
    showStart(quiz, true);
    return;
  }

  const id = params.get('quiz');
  if (!id) { root.innerHTML = '<div class="q-card"><h1>No quiz selected</h1><p class="blurb">Pick one from the catalog.</p><div class="q-actions"><a class="q-btn primary" href="./">Browse quizzes</a></div></div>'; return; }
  try {
    const r = await fetch(`./quizzes/${id}.json`);
    if (!r.ok) throw new Error(r.status);
    quiz = await r.json();
  } catch (e) {
    root.innerHTML = `<div class="q-card"><h1>Quiz not found</h1><p class="blurb">Couldn't load "${id}".</p><div class="q-actions"><a class="q-btn primary" href="./">Browse quizzes</a></div></div>`;
    return;
  }
  document.title = `${quiz.title} — Sporcle Spinoff`;
  showStart(quiz);
}

function showStart(quiz, isPreview = false) {
  const total = quiz.items ? quiz.items.length : 0;
  const best = getBest(quiz.id);
  const meta = [
    total ? `${total} question${total !== 1 ? 's' : ''}` : '',
    quiz.timeLimitSec ? `${fmtTime(quiz.timeLimitSec)} limit` : 'no time limit',
    best ? `best: ${best}/${total}` : '',
  ].filter(Boolean).join(' · ');
  root.innerHTML = '';
  const card = el(`
    <div class="q-card">
      <h1></h1>
      <p class="blurb"></p>
      <div class="q-tags" id="q-tags"></div>
      <div class="q-tag-suggest" id="q-tag-suggest"></div>
      <div class="q-meta">${meta}</div>
      <div class="q-actions">
        <button class="q-btn primary" id="q-start">Start quiz</button>
        <a class="q-btn" href="./">Back to quizzes</a>
      </div>
    </div>`);
  card.querySelector('h1').textContent = quiz.title;
  card.querySelector('.blurb').textContent = quiz.blurb || '';
  renderTagPills(card.querySelector('#q-tags'), quiz.tags);
  if (isPreview) {
    card.querySelector('#q-tag-suggest').remove();
  } else {
    setupTagSuggest(card.querySelector('#q-tag-suggest'), quiz);
  }
  root.appendChild(card);
  card.querySelector('#q-start').addEventListener('click', () => runQuiz(quiz));
}

function renderTagPills(container, tags) {
  container.innerHTML = '';
  (tags || []).forEach((t) => {
    const pill = document.createElement('span');
    pill.className = 'q-tag';
    pill.textContent = t;
    container.appendChild(pill);
  });
}

// "+ suggest a tag" — same publish/submit-for-review duality as the builder:
// owners write straight to main, everyone else opens a PR (api/save-quiz.js
// mode: 'suggest-tags'/'suggest-tags-publish').
function setupTagSuggest(container, quiz) {
  container.innerHTML = '<button type="button" class="q-tag-suggest-link" id="q-tag-suggest-btn">+ suggest a tag</button>';
  container.querySelector('#q-tag-suggest-btn').addEventListener('click', () => openTagSuggestForm(container, quiz), { once: true });
}

async function openTagSuggestForm(container, quiz) {
  let isOwner = false;
  try {
    const r = await fetch('/api/save-quiz');
    isOwner = !!(await r.json()).authed;
  } catch (e) { /* treat as anonymous */ }

  container.innerHTML = `
    <div class="q-tag-form">
      <input type="text" id="q-tag-input" placeholder="e.g. Sports, History">
      ${isOwner ? '' : '<input type="text" id="q-tag-submitter" placeholder="Your name (optional)">'}
      <button type="button" class="q-btn primary" id="q-tag-submit">${isOwner ? 'Add' : 'Suggest'}</button>
    </div>
    <div class="q-tag-toast" id="q-tag-toast"></div>`;

  container.querySelector('#q-tag-submit').addEventListener('click', async () => {
    const tags = container.querySelector('#q-tag-input').value.split(',').map((s) => s.trim()).filter(Boolean);
    const toast = container.querySelector('#q-tag-toast');
    if (!tags.length) { toast.textContent = 'Type at least one tag.'; toast.className = 'q-tag-toast err'; return; }

    const btn = container.querySelector('#q-tag-submit');
    btn.disabled = true;
    toast.textContent = ''; toast.className = 'q-tag-toast';
    try {
      const body = { id: quiz.id, tags, mode: isOwner ? 'suggest-tags-publish' : 'suggest-tags' };
      if (!isOwner) body.submitter = container.querySelector('#q-tag-submitter').value.trim();
      const res = await fetch('/api/save-quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      if (data.changed === false) {
        toast.textContent = 'This quiz already has that tag.';
        toast.className = 'q-tag-toast err';
        btn.disabled = false;
        return;
      }
      if (isOwner) {
        quiz.tags = data.tags;
        renderTagPills(document.getElementById('q-tags'), data.tags);
        toast.textContent = 'Added!';
      } else {
        toast.textContent = 'Submitted for review — thanks!';
      }
      toast.className = 'q-tag-toast ok';
    } catch (err) {
      toast.textContent = err.message;
      toast.className = 'q-tag-toast err';
      btn.disabled = false;
    }
  });
}

async function runQuiz(quiz) {
  const total = quiz.items.length;
  const state = { score: 0, done: 0, total, ended: false, startedAt: Date.now(), revealFn: null, timer: null };

  root.innerHTML = '';
  const hud = el(`
    <div>
      <h2 class="q-hud-title"></h2>
      <div class="q-hud">
        <div class="q-stat"><b id="q-score">0</b><span>Score</span></div>
        <div class="q-stat"><b id="q-count">0/${total}</b><span>Found</span></div>
        <div class="q-stat"><b id="q-time">${quiz.timeLimitSec ? fmtTime(quiz.timeLimitSec) : '0:00'}</b><span>Time</span></div>
        <div class="q-spacer"></div>
        <a class="q-btn" href="./">🏠 Quizzes</a>
        <button class="q-btn danger" id="q-giveup">Give up</button>
      </div>
      <div class="q-progress-bar"><i id="q-bar"></i></div>
      <div id="q-body" style="margin-top:16px"></div>
    </div>`);
  hud.querySelector('.q-hud-title').textContent = quiz.title;
  root.appendChild(hud);

  const $score = hud.querySelector('#q-score');
  const $count = hud.querySelector('#q-count');
  const $time = hud.querySelector('#q-time');
  const $bar = hud.querySelector('#q-bar');
  const body = hud.querySelector('#q-body');

  function refresh() {
    $score.textContent = state.score;
    $count.textContent = `${state.done}/${state.total}`;
    $bar.style.width = state.total ? `${(state.done / state.total) * 100}%` : '0%';
  }

  // Timer: countdown when timeLimitSec set, else count up.
  state.timer = setInterval(() => {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (quiz.timeLimitSec) {
      const left = quiz.timeLimitSec - elapsed;
      $time.textContent = fmtTime(left);
      if (left <= 0) finish('time');
    } else {
      $time.textContent = fmtTime(elapsed);
    }
  }, 250);

  const engine = {
    normalize, matchAccept,
    // A correct answer landed. delta counts toward both score and progress.
    correct(delta = 1) {
      state.score += delta; state.done += delta; refresh();
      if (state.done >= state.total) finish('complete');
    },
    // Advance progress without awarding points (e.g. a wrong MC answer).
    advance(delta = 1) {
      state.done += delta; refresh();
      if (state.done >= state.total) finish('complete');
    },
    setTotal(n) { state.total = n; refresh(); },
    registerReveal(fn) { state.revealFn = fn; },
    finish: () => finish('done'),
  };

  function finish(reason) {
    if (state.ended) return;
    state.ended = true;
    clearInterval(state.timer);
    if (state.revealFn) { try { state.revealFn(); } catch (e) { console.error(e); } }
    const elapsed = (Date.now() - state.startedAt) / 1000;
    setBest(quiz.id, state.score);
    showResults(quiz, state, reason, elapsed);
  }

  hud.querySelector('#q-giveup').addEventListener('click', () => finish('gaveup'));

  refresh();
  try {
    const mod = await import(`./types/${quiz.type}.js`);
    mod.default.render(body, quiz, engine);
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="q-card"><h1>Broken quiz</h1><p class="blurb">Unknown type "${quiz.type}".</p></div>`;
  }
}

function showResults(quiz, state, reason, elapsed) {
  const pct = state.total ? Math.round((state.score / state.total) * 100) : 0;
  const headline = reason === 'time' ? "⏱ Time's up!" : reason === 'complete' ? '🎉 Perfect!' : 'Results';
  const results = el(`
    <div class="q-card" style="margin-top:16px">
      <h1>${headline}</h1>
      <div class="q-result-score">${state.score} / ${state.total}</div>
      <div class="q-result-best">${pct}% · ${fmtTime(elapsed)} · best ${getBest(quiz.id)}/${state.total}</div>
      <div class="q-actions">
        <button class="q-btn primary" id="q-again">Play again</button>
        <a class="q-btn" href="./">Back to quizzes</a>
      </div>
    </div>`);
  root.appendChild(results);
  results.scrollIntoView({ behavior: 'smooth', block: 'center' });
  results.querySelector('#q-again').addEventListener('click', () => showStart(quiz));
}

boot();
