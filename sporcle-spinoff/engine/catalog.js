export const TYPE_ORDER = ['text-entry', 'multiple-choice', 'image', 'matching', 'ranking', 'map', 'map-highlight'];

export const TYPE_LABELS = {
  'text-entry': 'Type the Answer',
  'multiple-choice': 'Multiple Choice',
  image: 'Picture Round',
  matching: 'Matching',
  ranking: 'Put in Order',
  map: 'Click the Map',
  'map-highlight': 'Name the Highlight',
};

const CARD_COLORS = ['card-red', 'card-orange', 'card-peach', 'card-teal', 'card-gold'];
const RECENT_KEY = 'sporcle:recent';

export function quizMatches(quiz, filters = {}) {
  const query = String(filters.query || '').trim().toLocaleLowerCase();
  const type = String(filters.type || '');
  const tag = String(filters.tag || '');
  if (type && quiz.type !== type) return false;
  if (tag && !(quiz.tags || []).some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase())) return false;
  if (!query) return true;
  return [quiz.title, quiz.blurb, TYPE_LABELS[quiz.type] || quiz.type, ...(quiz.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(query);
}

export function filterQuizzes(quizzes, filters = {}) {
  return quizzes.filter((quiz) => quizMatches(quiz, filters));
}

export function tagCounts(quizzes) {
  const counts = new Map();
  quizzes.forEach((quiz) => {
    (quiz.tags || []).forEach((tag) => {
      const display = String(tag).trim();
      if (!display) return;
      const key = display.toLocaleLowerCase();
      const current = counts.get(key);
      counts.set(key, { label: current?.label || display, count: (current?.count || 0) + 1 });
    });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function readRecentIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').slice(0, 3) : [];
  } catch {
    return [];
  }
}

function makeCard(quiz, index, recent = false) {
  const card = document.createElement('a');
  card.className = `quiz-card ${CARD_COLORS[index % CARD_COLORS.length]}`;
  card.href = `./play.html?quiz=${encodeURIComponent(quiz.id)}`;
  card.dataset.quizId = quiz.id;

  const meta = document.createElement('div');
  meta.className = 'quiz-card-meta';
  const type = document.createElement('span');
  type.textContent = TYPE_LABELS[quiz.type] || quiz.type;
  meta.appendChild(type);
  if (recent) {
    const recentLabel = document.createElement('span');
    recentLabel.textContent = 'Recently played';
    meta.appendChild(recentLabel);
  }

  const title = document.createElement('h3');
  title.className = 'quiz-card-title';
  title.textContent = quiz.title;

  const blurb = document.createElement('p');
  blurb.className = 'quiz-card-blurb';
  blurb.textContent = quiz.blurb || 'Open this quiz and see how you do.';

  const footer = document.createElement('div');
  footer.className = 'quiz-card-footer';
  const tags = document.createElement('span');
  tags.textContent = (quiz.tags || []).slice(0, 2).join(' · ') || 'Trivia';
  const play = document.createElement('span');
  play.className = 'quiz-card-play';
  play.textContent = 'Play →';
  footer.append(tags, play);

  card.append(meta, title, blurb, footer);
  return card;
}

function initCatalog() {
  const search = document.getElementById('quiz-search');
  if (!search) return;

  const typeSelect = document.getElementById('quiz-type');
  const tagsRoot = document.getElementById('quiz-tags');
  const grid = document.getElementById('quiz-grid');
  const recentGrid = document.getElementById('recent-quizzes');
  const recentSection = document.getElementById('recent-section');
  const count = document.getElementById('quiz-count');
  const noResults = document.getElementById('quiz-no-results');
  const allHeading = document.getElementById('all-heading');
  const clearButton = document.getElementById('clear-filters');
  const params = new URLSearchParams(location.search);
  const filters = {
    query: params.get('q') || '',
    type: params.get('type') || '',
    tag: params.get('tag') || '',
  };
  let allQuizzes = [];

  search.value = filters.query;

  function hasFilters() {
    return Boolean(filters.query || filters.type || filters.tag);
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (filters.query) next.set('q', filters.query);
    if (filters.type) next.set('type', filters.type);
    if (filters.tag) next.set('tag', filters.tag);
    history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
  }

  function renderTags() {
    tagsRoot.replaceChildren();
    const tags = [{ label: 'All topics', value: '' }, ...tagCounts(allQuizzes).map(({ label }) => ({ label, value: label }))];
    tags.forEach(({ label, value }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-chip${filters.tag === value ? ' is-active' : ''}`;
      button.textContent = label;
      button.setAttribute('aria-pressed', String(filters.tag === value));
      button.addEventListener('click', () => {
        filters.tag = value;
        syncUrl();
        render();
      });
      tagsRoot.appendChild(button);
    });
  }

  function renderRecent() {
    recentGrid.replaceChildren();
    if (hasFilters()) {
      recentSection.classList.add('hidden');
      return;
    }
    const byId = new Map(allQuizzes.map((quiz) => [quiz.id, quiz]));
    const recent = readRecentIds().map((id) => byId.get(id)).filter(Boolean);
    recent.forEach((quiz, index) => recentGrid.appendChild(makeCard(quiz, index, true)));
    recentSection.classList.toggle('hidden', recent.length === 0);
  }

  function render() {
    const visible = filterQuizzes(allQuizzes, filters);
    grid.replaceChildren();
    visible.forEach((quiz, index) => grid.appendChild(makeCard(quiz, index)));
    const filtered = hasFilters();
    count.textContent = `${visible.length} quiz${visible.length === 1 ? '' : 'zes'}${filtered ? ' found' : ' ready to play'}`;
    clearButton.classList.toggle('hidden', !filtered);
    grid.classList.toggle('hidden', visible.length === 0);
    allHeading.classList.toggle('hidden', visible.length === 0);
    noResults.classList.toggle('hidden', visible.length !== 0);
    renderTags();
    renderRecent();
  }

  function clearFilters() {
    filters.query = '';
    filters.type = '';
    filters.tag = '';
    search.value = '';
    typeSelect.value = '';
    syncUrl();
    render();
    search.focus();
  }

  search.addEventListener('input', () => {
    filters.query = search.value.trim();
    syncUrl();
    render();
  });
  typeSelect.addEventListener('change', () => {
    filters.type = typeSelect.value;
    syncUrl();
    render();
  });
  clearButton.addEventListener('click', clearFilters);
  document.getElementById('empty-clear').addEventListener('click', clearFilters);
  document.getElementById('random-quiz').addEventListener('click', () => {
    const choices = filterQuizzes(allQuizzes, filters);
    const pool = choices.length ? choices : allQuizzes;
    if (!pool.length) return;
    const quiz = pool[Math.floor(Math.random() * pool.length)];
    location.href = `./play.html?quiz=${encodeURIComponent(quiz.id)}`;
  });

  fetch('./quizzes/index.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      return response.json();
    })
    .then((quizzes) => {
      allQuizzes = Array.isArray(quizzes) ? quizzes : [];
      const types = [...new Set(allQuizzes.map((quiz) => quiz.type))].sort(
        (a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)
      );
      types.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = TYPE_LABELS[value] || value;
        typeSelect.appendChild(option);
      });
      typeSelect.value = types.includes(filters.type) ? filters.type : '';
      filters.type = typeSelect.value;
      render();
    })
    .catch(() => {
      count.textContent = 'Couldn’t load the quiz catalog.';
      noResults.classList.remove('hidden');
      allHeading.classList.add('hidden');
      noResults.querySelector('h2').textContent = 'Catalog unavailable';
      noResults.querySelector('p').textContent = 'Check your connection and refresh the page.';
      noResults.querySelector('button').classList.add('hidden');
    });
}

if (typeof document !== 'undefined') initCatalog();
