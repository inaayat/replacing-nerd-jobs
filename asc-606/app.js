import { CITATIONS, CITATION_SOURCE } from './citations.js';
import { TREE, STEPS } from './tree.js';
import { QUIZZES, quizById } from './quiz.js';
import { TERMS, termsFor } from './glossary.js';
import {
  walk,
  memoLines,
  summarize,
  scoreQuiz,
} from './engine.js';

const STORE = 'asc-606-walk-v1';
const root = document.getElementById('app');

const state = {
  mode: 'walk',
  answers: {},
  quizId: null,
  quizAnswers: {},
  cite: null,
};

function loadWalk() {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.answers === 'object') state.answers = parsed.answers;
  } catch {
    /* ignore */
  }
}

function saveWalk() {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ answers: state.answers }));
  } catch {
    /* ignore */
  }
}

function parseHash() {
  const raw = (location.hash || '#walk').replace(/^#/, '');
  const [mode, extra] = raw.split('/');
  if (mode === 'quiz') {
    state.mode = 'quiz';
    state.quizId = extra || null;
    return;
  }
  if (mode === 'map') {
    state.mode = 'map';
    return;
  }
  state.mode = 'walk';
}

function setHash(mode, extra) {
  const next = extra ? `#${mode}/${extra}` : `#${mode}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

function answersForMode() {
  return state.mode === 'quiz' ? state.quizAnswers : state.answers;
}

function setAnswer(nodeId, choiceId) {
  const bag = answersForMode();
  const result = walk(TREE, bag);
  const keep = {};
  for (const node of result.path) {
    if (node.id === nodeId) break;
    if (bag[node.id]) keep[node.id] = bag[node.id];
  }
  keep[nodeId] = choiceId;
  if (state.mode === 'quiz') state.quizAnswers = keep;
  else {
    state.answers = keep;
    saveWalk();
  }
  render();
}

function rewindTo(nodeId) {
  const bag = answersForMode();
  const result = walk(TREE, bag);
  const keep = {};
  for (const node of result.path) {
    if (node.id === nodeId) break;
    if (bag[node.id]) keep[node.id] = bag[node.id];
  }
  if (state.mode === 'quiz') state.quizAnswers = keep;
  else {
    state.answers = keep;
    saveWalk();
  }
  render();
}

function resetWalk() {
  if (state.mode === 'quiz') state.quizAnswers = {};
  else {
    state.answers = {};
    saveWalk();
  }
  render();
}

function citeChip(id) {
  const text = CITATIONS[id];
  if (!text) return '';
  return `<button type="button" class="cite" data-cite="${escapeAttr(id)}" aria-expanded="false" aria-label="Open the official rule ${escapeAttr(id)}">${escapeHtml(id)}</button>`;
}

function citeList(ids, label = 'See the official rule') {
  const unique = [...new Set(ids || [])].filter((id) => CITATIONS[id]);
  if (!unique.length) return '';
  return `<div class="cite-row"><span>${escapeHtml(label)}</span><div class="cites">${unique.map(citeChip).join('')}</div></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function stepIndex(stepId) {
  return STEPS.findIndex((s) => s.id === stepId);
}

function renderNav(activeStep) {
  return `
    <ol class="steps" aria-label="ASC 606 steps">
      ${STEPS.map((step, i) => {
        const on = step.id === activeStep ? ' is-on' : '';
        const done = stepIndex(activeStep) > i ? ' is-done' : '';
        return `<li class="step${on}${done}"><span class="step-k">${escapeHtml(step.label)}</span><span class="step-s">${escapeHtml(step.short)}</span></li>`;
      }).join('')}
    </ol>
  `;
}

function selectedChoice(node, answers) {
  return node?.choices?.find((choice) => choice.id === answers[node.id]) || null;
}

function renderDecisionFlow(result, answers) {
  return `
    <section class="flow-panel" aria-labelledby="flow-title">
      <div class="flow-head">
        <div>
          <p class="eyebrow">Your path</p>
          <h2 id="flow-title">See how each answer leads to the next question</h2>
        </div>
        <p>Choose an earlier card to change that answer. Everything after it will update.</p>
      </div>
      <div class="flow-viewport">
        <div class="flow-track" id="decision-flow">
          ${result.path
            .map((node) => {
              const isCurrent = node === result.current;
              const choice = selectedChoice(node, answers);
              const step = STEPS.find((item) => item.id === node.step);
              const nodeMarkup = isCurrent
                ? `<article class="flow-node is-current" aria-current="step">
                    <span class="flow-state">You are here</span>
                    <span class="flow-step">${escapeHtml(step?.label || 'Result')}</span>
                    <strong>${escapeHtml(node.title)}</strong>
                  </article>`
                : `<button type="button" class="flow-node is-done" data-rewind="${escapeAttr(node.id)}">
                    <span class="flow-state">Answered</span>
                    <span class="flow-step">${escapeHtml(step?.label || 'Result')}</span>
                    <strong>${escapeHtml(node.title)}</strong>
                  </button>`;
              const connector = choice
                ? `<div class="flow-connector" aria-label="Your answer was ${escapeAttr(choice.label)}">
                    <span>${escapeHtml(choice.label)}</span>
                    <b aria-hidden="true">→</b>
                  </div>`
                : '';
              return `${nodeMarkup}${connector}`;
            })
            .join('')}
        </div>
      </div>
    </section>
  `;
}

function renderTerms(node) {
  const detected = termsFor(`${node?.title || ''} ${node?.plain || ''}`);
  const items = detected.length ? detected : TERMS.slice(0, 3);
  return `
    <section class="translations">
      <p class="eyebrow">Accounting words, translated</p>
      <h2>What the jargon means</h2>
      <dl>
        ${items
          .map(
            (item) => `
          <div>
            <dt>${escapeHtml(item.term)}</dt>
            <dd>${escapeHtml(item.plain)}</dd>
          </div>`
          )
          .join('')}
      </dl>
    </section>
  `;
}

function renderMemo(result) {
  const lines = memoLines(result);
  if (!lines.length) {
    return `
      <section class="memo">
        <p class="eyebrow">What this means</p>
        <h2>Your answer will build a plain-English summary</h2>
        <p class="quiet">We will explain each choice here as you move through the questions.</p>
      </section>`;
  }
  const recent = lines.slice(-4);
  return `
    <section class="memo">
      <p class="eyebrow">What this means</p>
      <h2>Your latest conclusions</h2>
      <ol class="memo-recent">
        ${recent
          .map(
            (line) => `
          <li>
            <p>${escapeHtml(line.text)}</p>
            ${citeList(line.citations, 'Why?')}
          </li>`
          )
          .join('')}
      </ol>
      ${
        lines.length > recent.length
          ? `<details class="memo-all">
              <summary>See all ${lines.length} conclusions</summary>
              <ol>
                ${lines
                  .map(
                    (line) => `<li><p>${escapeHtml(line.text)}</p>${citeList(line.citations, 'Why?')}</li>`
                  )
                  .join('')}
              </ol>
            </details>`
          : ''
      }
    </section>
  `;
}

function renderOutcome(result) {
  const summary = summarize(result);
  const tone = summary.outcome === 'recognize' ? 'ok' : summary.outcome === 'wait' ? 'wait' : 'out';
  return `
    <article class="card outcome is-${tone}">
      <p class="kicker">${summary.outcome === 'recognize' ? 'What to book' : summary.outcome === 'wait' ? 'Do not book revenue yet' : 'Wrong Topic'}</p>
      <h2>${escapeHtml(summary.headline)}</h2>
      ${summary.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      ${citeList(result.current?.citations)}
      <div class="row">
        <button type="button" class="btn" data-reset>Start over</button>
        <button type="button" class="btn ghost" data-mode="map">See the whole tree</button>
      </div>
    </article>
  `;
}

function renderQuestion(node, picked) {
  return `
    <article class="card question-card">
      <div class="question-number">${escapeHtml(STEPS.find((s) => s.id === node.step)?.label || node.step)}</div>
      <p class="eyebrow">Choose what is true for this deal</p>
      <h2>${escapeHtml(node.title)}</h2>
      <div class="plain-help">
        <strong>Why we’re asking</strong>
        <p>${escapeHtml(node.plain)}</p>
      </div>
      ${citeList(node.citations)}
      <div class="choices" role="group" aria-label="Choose the next branch">
        ${node.choices
          .map((choice, index) => {
            const on = picked === choice.id ? ' is-on' : '';
            return `
              <button type="button" class="choice${on}" data-node="${escapeAttr(node.id)}" data-choice="${escapeAttr(choice.id)}">
                <span class="choice-key">${String.fromCharCode(65 + index)}</span>
                <span class="choice-label">${escapeHtml(choice.label)}</span>
                ${citeList(choice.citations || [])}
              </button>`;
          })
          .join('')}
      </div>
    </article>
  `;
}

function renderWalk() {
  const quiz = state.mode === 'quiz' ? quizById(state.quizId) : null;
  const bag = answersForMode();
  const result = walk(TREE, bag);
  const current = result.current;

  const story = quiz
    ? `<section class="story">
        <p class="kicker">${escapeHtml(quiz.industry)} · practice example</p>
        <h1>${escapeHtml(quiz.title)}</h1>
        <p>${escapeHtml(quiz.story)}</p>
      </section>`
    : `<section class="story">
        <p class="kicker">Guided revenue check</p>
        <h1>When should this customer sale become revenue?</h1>
        <p>Answer one question at a time. We will connect your answers into a visible path and explain the accounting in everyday language.</p>
        ${Object.keys(bag).length ? '<p><button type="button" class="btn ghost" data-reset>Start this walk over</button></p>' : ''}
      </section>`;

  const score =
    quiz && result.complete
      ? renderScore(quiz, bag, result)
      : '';

  const body = !current
    ? `<p class="quiet">Something in the tree broke.</p>`
    : current.kind === 'outcome'
      ? renderOutcome(result) + score
      : renderQuestion(current, bag[current.id]);

  return `
    <div class="walk-head">
      ${story}
      ${renderNav(current?.step === 'done' ? '5' : current?.step)}
    </div>
    ${renderDecisionFlow(result, bag)}
    <div class="workbench">
      <div class="main">${body}</div>
      <aside class="guide">
        ${renderTerms(current)}
        ${renderMemo(result)}
      </aside>
    </div>
  `;
}

function renderScore(quiz, bag, result) {
  const scored = scoreQuiz(TREE, quiz, bag);
  const missed = scored.compared.filter((row) => !row.ok);
  return `
    <article class="card score">
      <p class="kicker">Quiz result</p>
      <h2>${scored.correct} / ${scored.total} branches matched the teaching path</h2>
      <p>${escapeHtml(quiz.takeaway)}</p>
      ${
        missed.length
          ? `<details><summary>Where this walk differed</summary>
              <ul>${missed
                .map(
                  (row) =>
                    `<li><strong>${escapeHtml(row.title)}</strong> — you picked <code>${escapeHtml(row.got || '—')}</code>, the teaching path picked <code>${escapeHtml(row.want)}</code>.</li>`
                )
                .join('')}</ul></details>`
          : `<p class="ok-line">You stayed on the teaching path.</p>`
      }
      <div class="row">
        <button type="button" class="btn" data-reset>Try this case again</button>
        <button type="button" class="btn ghost" data-mode="quiz">Pick another case</button>
      </div>
    </article>
  `;
}

function renderQuizPicker() {
  return `
    <section class="story">
      <p class="kicker">Practice with examples</p>
      <h1>Choose a familiar business situation</h1>
      <p>Try the guided questions on a realistic example. At the end, compare your path with the teaching answer. Open any numbered rule to see where the answer comes from.</p>
    </section>
    <div class="quiz-grid">
      ${QUIZZES.map(
        (q) => `
        <button type="button" class="quiz-card" data-quiz="${escapeAttr(q.id)}">
          <span class="kicker">${escapeHtml(q.industry)}</span>
          <strong>${escapeHtml(q.title)}</strong>
          <span>${escapeHtml(q.story)}</span>
        </button>`
      ).join('')}
    </div>
  `;
}

function renderMap() {
  const groups = STEPS.map((step) => ({
    ...step,
    nodes: TREE.filter((n) => n.step === step.id && n.kind !== 'outcome'),
  }));
  const outcomes = TREE.filter((n) => n.kind === 'outcome');
  return `
    <section class="story">
      <p class="kicker">Map</p>
      <h1>See every decision in the guide</h1>
      <p>Start by checking whether the guide applies, then move through the five steps. Open a numbered rule to see the official accounting language behind a question.</p>
    </section>
    <div class="map">
      ${groups
        .map(
          (group) => `
        <section class="map-col">
          <h2>${escapeHtml(group.label)} <span>${escapeHtml(group.short)}</span></h2>
          ${group.nodes
            .map(
              (node) => `
            <article class="map-node">
              <strong>${escapeHtml(node.title)}</strong>
              ${citeList(node.citations)}
            </article>`
            )
            .join('')}
        </section>`
        )
        .join('')}
    </div>
    <section class="map-out">
      <h2>Where a walk can end</h2>
      <div class="map-out-grid">
        ${outcomes
          .map(
            (node) => `
          <article>
            <h3>${escapeHtml(node.title)}</h3>
            <p>${escapeHtml(node.plain)}</p>
            ${citeList(node.citations)}
          </article>`
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderCiteLayer() {
  if (!state.cite) return '';
  const text = CITATIONS[state.cite];
  if (!text) return '';
  return `
    <div class="cite-pop" role="dialog" aria-label="${escapeAttr(state.cite)}">
      <p class="cite-id">${escapeHtml(state.cite)}</p>
      <p class="cite-text">${escapeHtml(text)}</p>
      <p class="cite-src">Excerpt © ${escapeHtml(CITATION_SOURCE.owner)}. Official text: ${escapeHtml(CITATION_SOURCE.title)}. This page is a study map, not the Codification.</p>
    </div>
  `;
}

function render() {
  const tabs = `
    <div class="modes" role="tablist">
      <button type="button" class="mode${state.mode === 'walk' ? ' is-on' : ''}" data-mode="walk">Guided walk</button>
      <button type="button" class="mode${state.mode === 'map' ? ' is-on' : ''}" data-mode="map">Full map</button>
      <button type="button" class="mode${state.mode === 'quiz' && !state.quizId ? ' is-on' : ''}${state.mode === 'quiz' && state.quizId ? ' is-on' : ''}" data-mode="quiz">Practice examples</button>
    </div>
  `;

  let body = '';
  if (state.mode === 'map') body = renderMap();
  else if (state.mode === 'quiz' && !quizById(state.quizId)) body = renderQuizPicker();
  else body = renderWalk();

  root.innerHTML = `
    ${tabs}
    ${body}
    ${renderCiteLayer()}
  `;
  requestAnimationFrame(() => {
    const viewport = root.querySelector('.flow-viewport');
    if (!viewport) return;
    if (window.matchMedia('(max-width: 640px)').matches) {
      viewport.scrollTop = viewport.scrollHeight;
    } else {
      viewport.scrollLeft = viewport.scrollWidth;
    }
  });
}

function hideCite() {
  state.cite = null;
  const pop = root.querySelector('.cite-pop');
  if (pop) pop.remove();
  root.querySelectorAll('.cite[aria-expanded="true"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
}

function showCite(btn) {
  const id = btn.getAttribute('data-cite');
  if (!CITATIONS[id]) return;
  const already = state.cite === id;
  hideCite();
  if (already) return;
  state.cite = id;
  btn.setAttribute('aria-expanded', 'true');
  root.insertAdjacentHTML('beforeend', renderCiteLayer());
  const pop = root.querySelector('.cite-pop');
  if (!pop) return;
  const rect = btn.getBoundingClientRect();
  const pad = 12;
  const top = Math.min(window.innerHeight - pop.offsetHeight - pad, rect.bottom + 8);
  const left = Math.min(window.innerWidth - pop.offsetWidth - pad, Math.max(pad, rect.left));
  pop.style.top = `${Math.max(pad, top)}px`;
  pop.style.left = `${left}px`;
}

root.addEventListener('click', (event) => {
  const mode = event.target.closest('[data-mode]');
  if (mode) {
    state.mode = mode.getAttribute('data-mode');
    if (state.mode === 'quiz') {
      state.quizId = null;
      state.quizAnswers = {};
      setHash('quiz');
    } else {
      setHash(state.mode);
    }
    hideCite();
    render();
    return;
  }

  const quiz = event.target.closest('[data-quiz]');
  if (quiz) {
    state.mode = 'quiz';
    state.quizId = quiz.getAttribute('data-quiz');
    state.quizAnswers = {};
    setHash('quiz', state.quizId);
    hideCite();
    render();
    return;
  }

  const rewind = event.target.closest('[data-rewind]');
  if (rewind) {
    rewindTo(rewind.getAttribute('data-rewind'));
    hideCite();
    return;
  }

  const reset = event.target.closest('[data-reset]');
  if (reset) {
    resetWalk();
    hideCite();
    return;
  }

  const cite = event.target.closest('[data-cite]');
  if (cite) {
    event.preventDefault();
    showCite(cite);
    return;
  }

  const choice = event.target.closest('[data-choice]');
  if (choice) {
    setAnswer(choice.getAttribute('data-node'), choice.getAttribute('data-choice'));
    hideCite();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (!event.target.closest('.cite-pop')) hideCite();
});

root.addEventListener('pointerover', (event) => {
  const cite = event.target.closest('[data-cite]');
  if (!cite) return;
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) showCite(cite);
});

root.addEventListener('focusin', (event) => {
  const cite = event.target.closest('[data-cite]');
  if (cite) showCite(cite);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideCite();
});

window.addEventListener('hashchange', () => {
  parseHash();
  hideCite();
  render();
});

loadWalk();
parseHash();
render();
