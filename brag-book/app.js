import {
  STORE_KEY,
  ENTRY_KINDS,
  POSTING_STATUSES,
  SAMPLE_JD,
  emptyStore,
  normalizeStore,
  addEntry,
  addEntries,
  updateEntry,
  deleteEntry,
  addPosting,
  updatePosting,
  deletePosting,
  addRequirement,
  addRequirements,
  updateRequirement,
  deleteRequirement,
  moveRequirement,
  addBullet,
  updateBullet,
  deleteBullet,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  answerQuestionFromEntry,
  linkEntry,
  unlinkEntry,
  parseRequirements,
  parseExperiences,
  searchEntries,
  suggestEntries,
  linkedEntries,
  compileResumeText,
  compileResumeHtml,
  compilePrep,
  prepCoverage,
  listingSummary,
  starFill,
  starScript,
  draftBulletFromEntry,
  bookIsEmpty,
  asUrl,
  titleFromJobUrl,
  hostFromJobUrl,
  updateProfile,
} from './engine.js';
import { parseViewHash, viewHash, viewTitle } from './routes.js';
import { loadBook, saveBook } from './store.js';
import { initAuth, refreshToken, renderBragSignIn, wireAuthLink } from './auth.js';

const root = document.getElementById('app');
const localMode = new URLSearchParams(location.search).has('local');
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json';
fileInput.hidden = true;
document.body.appendChild(fileInput);

let store = emptyStore();
let auth = null;
let unlocked = false;
let persistTimer = null;
let query = '';
let kindFilter = 'all';
let statusNote = '';
let showAllReqs = false;

function loadCached() {
  try {
    return normalizeStore(JSON.parse(localStorage.getItem(STORE_KEY) || 'null'));
  } catch {
    return emptyStore();
  }
}

function cacheStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function saveStore() {
  cacheStore();
  if (localMode || !auth?.token) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    pushStore();
  }, 500);
}

async function pushStore({ keepalive = false } = {}) {
  if (localMode || !auth?.token) return;
  try {
    await saveBook(auth.token, store, { keepalive });
    setNote('Saved to your account.');
  } catch (err) {
    setNote(err.message || 'Could not save to your account.');
  }
}

function currentView() {
  return parseViewHash(location.hash, {
    entryIds: store.entries.map((entry) => entry.id),
    postingIds: store.postings.map((job) => job.id),
  });
}

function go(view) {
  const hash = viewHash(view);
  if (location.hash === hash) render();
  else location.hash = hash;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'checked' || key === 'hidden' || key === 'disabled' || key === 'selected') node[key] = Boolean(value);
    else if (key === 'value' && 'value' in node) node.value = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function btn(label, attrs) {
  return el('button', { type: 'button', class: 'btn', ...attrs }, label);
}

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', {}, label), control]);
}

function kindLabel(kind) {
  return ({ experience: 'Experience', project: 'Project', skillset: 'Skillset' })[kind] || kind;
}

function setNote(text) {
  statusNote = text;
  const node = document.getElementById('status-note');
  if (node) node.textContent = text;
}

function exportStore() {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'brag-book.json' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setNote('Downloaded a JSON copy.');
}

function importStore(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      store = normalizeStore(JSON.parse(String(reader.result || '')));
      saveStore();
      go({ kind: 'home' });
      setNote('Imported the book.');
    } catch {
      setNote('That file was not a Brag Book JSON.');
    }
  };
  reader.readAsText(file);
}

function downloadText(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function markSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mark');
  svg.setAttribute('viewBox', '0 9 420 67');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path class="arc" d="M8 70 C 70 70, 92 62, 126 48 S 186 18, 214 14 S 268 22, 302 40 S 368 70, 412 70"/>
    <circle cx="8" cy="70" r="3.5"/>
    <circle cx="214" cy="14" r="3.5"/>
    <circle cx="412" cy="70" r="3.5"/>
  `;
  return svg;
}

function countRow() {
  const summary = listingSummary(store);
  return el('div', { class: 'counts' }, [
    chip(summary.postings, 'postings'),
    chip(summary.entries, 'in the book'),
    chip(summary.stories, 'experiences'),
  ]);
}

function toolbar(view) {
  if (view.kind === 'home') return homeHero();
  return el('header', { class: 'hero' }, [
    el('button', { type: 'button', class: 'btn ghost', onClick: () => go({ kind: 'home' }) }, '← Start'),
    el('p', { class: 'kicker' }, view.kind === 'jobs' ? '1. Paste a posting  ·  2. Fill each requirement  ·  3. Resume + Prep' : 'The book · beta'),
    el('div', { class: 'hero-row' }, [
      el('div', {}, [
        el('h1', {}, viewTitle(view, store)),
        el('p', { class: 'lede' },
          view.kind === 'jobs'
            ? 'Paste the job. Review the bullets. For each requirement: a resume line, a potential question, and a STAR answer.'
            : 'Paste several experiences at once. Pin them onto a posting when you need a resume bullet or a STAR answer.'
        ),
      ]),
      el('div', { class: 'actions' }, [
        btn(view.kind === 'jobs' ? 'New job posting' : 'Add experiences', {
          class: 'btn',
          onClick: () => go(view.kind === 'jobs' ? { kind: 'jobs', id: 'new' } : { kind: 'log', id: 'new' }),
        }),
        btn('Export', { class: 'btn ghost', onClick: exportStore }),
        btn('Import', { class: 'btn ghost', onClick: () => fileInput.click() }),
      ]),
    ]),
    countRow(),
    statusNote ? el('p', { class: 'status', id: 'status-note' }, statusNote) : el('p', { class: 'status', id: 'status-note' }, ''),
  ]);
}

function homeHero() {
  return el('header', { class: 'hero is-home' }, [
    el('p', { class: 'eyebrow' }, [el('span', { class: 'beta-pill' }, 'beta'), ' Interview prep']),
    el('h1', { class: 'mast-title' }, 'Brag Book'),
    markSvg(),
    el('p', { class: 'lede' }, 'Paste a job posting. Turn each requirement into a resume bullet, a question they might ask, and a STAR answer. Then copy a resume and walk the cue cards.'),
    countRow(),
    statusNote ? el('p', { class: 'status', id: 'status-note' }, statusNote) : el('p', { class: 'status', id: 'status-note' }, ''),
  ]);
}

function homeView() {
  const summary = listingSummary(store);
  const recentWins = store.entries.slice(0, 4);
  const recentJobs = store.postings.slice(0, 4);
  return el('div', {}, [
    el('div', { class: 'start-grid is-focus' }, [
      el('button', {
        type: 'button',
        class: 'start-card is-primary',
        onClick: () => go({ kind: 'jobs', id: store.postings.length ? undefined : 'new' }),
      }, [
        el('span', { class: 'kicker' }, 'The loop'),
        el('strong', {}, store.postings.length ? 'Open a posting' : 'New job posting'),
        el('p', {}, store.postings.length
          ? `${summary.postings} on file. Paste another, or keep filling bullets, questions, and STAR answers.`
          : 'Paste the description. We pull the requirement bullets. You add a resume line, a question, and a STAR answer on each.'),
      ]),
      el('button', {
        type: 'button',
        class: 'start-card is-beta',
        onClick: () => go({ kind: 'log', id: 'new' }),
      }, [
        el('span', { class: 'kicker' }, [el('span', { class: 'beta-pill' }, 'beta'), ' The book']),
        el('strong', {}, 'Add experiences'),
        el('p', {}, summary.entries
          ? `${summary.entries} already in the book. Paste more in one go, then pin them onto a posting.`
          : 'Optional. Paste several wins at once so a posting can steal a resume bullet or a STAR answer.'),
      ]),
    ]),
    recentJobs.length ? el('section', { class: 'recent' }, [
      el('h2', {}, 'Recent postings'),
      el('div', { class: 'plot-cards' }, recentJobs.map((job) => {
        const cover = prepCoverage(store, job);
        return el('button', {
          type: 'button',
          class: 'plot-card',
          onClick: () => go({ kind: 'jobs', id: job.id, mode: job.requirements.length ? 'fill' : undefined }),
        }, [
          el('span', { class: 'kicker' }, job.status),
          el('strong', {}, job.title),
          el('p', {}, [job.company, cover.hints[0] || `${cover.ready}/${cover.total || 0} ready`].filter(Boolean).join(' · ')),
        ]);
      })),
    ]) : null,
    recentWins.length ? el('section', { class: 'recent' }, [
      el('h2', {}, 'Recent in the book'),
      el('div', { class: 'plot-cards' }, recentWins.map((entry) =>
        el('button', {
          type: 'button',
          class: 'plot-card',
          onClick: () => go({ kind: 'log', id: entry.id }),
        }, [
          el('span', { class: 'kicker' }, kindLabel(entry.kind)),
          el('strong', {}, entry.title),
          el('p', {}, [entry.when, starFill(entry).ready ? 'STAR ready' : 'Open to fill STAR'].filter(Boolean).join(' · ')),
        ])
      )),
    ]) : null,
    el('div', { class: 'actions' }, [
      btn('Export', { class: 'btn ghost', onClick: exportStore }),
      btn('Import', { class: 'btn ghost', onClick: () => fileInput.click() }),
    ]),
  ]);
}

function chip(n, label) {
  return el('span', { class: 'chip' }, [el('strong', {}, String(n)), ` ${label}`]);
}

function entryList(selectedId) {
  const rows = searchEntries(store, query).filter((entry) => kindFilter === 'all' || entry.kind === kindFilter);
  return el('aside', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'The book'),
      el('span', { class: 'tiny' }, `${rows.length}`),
    ]),
    el('div', { class: 'panel-body' }, [
      el('input', {
        class: 'search',
        type: 'search',
        placeholder: 'Search wins, tags, STAR…',
        value: query,
        onInput: (event) => { query = event.target.value; render(); },
      }),
      field('Kind', el('select', {
        onChange: (event) => { kindFilter = event.target.value; render(); },
      }, ['all', ...ENTRY_KINDS].map((kind) =>
        el('option', { value: kind, selected: kindFilter === kind || undefined }, kind === 'all' ? 'All kinds' : kindLabel(kind))
      ))),
    ]),
    rows.length
      ? el('div', { class: 'list' }, rows.map((entry) =>
        el('button', {
          type: 'button',
          class: `row${selectedId === entry.id ? ' is-on' : ''}`,
          onClick: () => go({ kind: 'log', id: entry.id }),
        }, [
          el('div', { class: 'row-title' }, entry.title),
          el('div', { class: 'row-meta' }, [kindLabel(entry.kind), entry.when, starFill(entry).ready ? 'STAR ready' : null].filter(Boolean).join(' · ')),
        ])
      ))
      : el('p', { class: 'empty' }, query ? 'Nothing in the book matches that.' : 'Paste several experiences — then pin them onto a posting.'),
  ]);
}

function jobList(selectedId) {
  return el('aside', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'Postings'),
      el('span', { class: 'tiny' }, `${store.postings.length}`),
    ]),
    store.postings.length
      ? el('div', { class: 'list' }, store.postings.map((job) => {
        const cover = prepCoverage(store, job);
        return el('button', {
          type: 'button',
          class: `row${selectedId === job.id ? ' is-on' : ''}`,
          onClick: () => go({ kind: 'jobs', id: job.id }),
        }, [
          el('div', { class: 'row-title' }, job.title),
          el('div', { class: 'row-meta' }, [job.company, `${cover.ready}/${cover.total || 0} ready`].filter(Boolean).join(' · ')),
        ]);
      }))
      : el('p', { class: 'empty' }, 'No postings yet. Paste a job description — that is the start of the loop.'),
  ]);
}

function bulkEntryForm() {
  const paste = el('textarea', {
    class: 'tall',
    placeholder: 'One experience per line, or a STAR block:\n\n- Shipped packing cubes sync\n- Hobby-plan function budget\n\nTitle: Multiplexed the API\nSituation: Twelve functions already used.\nTask: Add another signed-in app.\nAction: Branched ?route= on the existing handler.\nResult: Stayed on Hobby.',
  });
  const kind = el('select', {}, ENTRY_KINDS.map((value) =>
    el('option', { value, selected: value === 'experience' || undefined }, kindLabel(value))
  ));
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'Add experiences'),
        el('p', { class: 'tiny' }, 'Beta — paste many at once. Open one later to fill STAR.'),
      ]),
      el('span', { class: 'beta-pill' }, 'beta'),
    ]),
    el('div', { class: 'panel-body' }, [
      el('p', { class: 'lede' }, 'Dump a resume, a review doc, or notes. Each line becomes a win a posting can pin.'),
      field('Kind for this paste', kind),
      field('Paste experiences', paste),
      el('div', { class: 'actions' }, [
        btn('Add to the book', {
          class: 'btn',
          onClick: () => {
            const drafts = parseExperiences(paste.value).map((draft) => ({ ...draft, kind: kind.value }));
            if (!drafts.length) {
              setNote('Paste at least one experience — one per line, or a STAR block.');
              return;
            }
            store = addEntries(store, drafts);
            saveStore();
            go({ kind: 'log' });
            setNote(`Added ${drafts.length} experience${drafts.length === 1 ? '' : 's'}. Pin one onto a posting next.`);
          },
        }),
        btn('Cancel', { class: 'btn ghost', onClick: () => go({ kind: 'log' }) }),
      ]),
    ]),
  ]);
}

function entryForm(entry) {
  const isNew = !entry;
  const draft = entry || {
    title: '',
    kind: 'experience',
    when: '',
    tags: [],
    situation: '',
    task: '',
    action: '',
    result: '',
    notes: '',
  };
  const form = el('form', {
    class: 'panel',
    onSubmit: (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (isNew) {
        store = addEntry(store, data);
        const created = store.entries[0];
        saveStore();
        go({ kind: 'log', id: created.id });
        setNote('Saved to the book.');
      } else {
        store = updateEntry(store, entry.id, data);
        saveStore();
        render();
        setNote('Updated.');
      }
    },
  });
  form.append(
    el('div', { class: 'panel-head' }, [
      el('h2', {}, isNew ? 'Add one win' : 'Edit win'),
      entry ? el('span', { class: `tag kind-${entry.kind}` }, kindLabel(entry.kind)) : null,
    ]),
    el('div', { class: 'panel-body' }, [
      field('Title', el('input', { name: 'title', required: true, maxlength: '160', value: draft.title, placeholder: 'Shipped the suitcase sync' })),
      el('div', { class: 'grid-2' }, [
        field('Kind', el('select', { name: 'kind' }, ENTRY_KINDS.map((kind) =>
          el('option', { value: kind, selected: draft.kind === kind || undefined }, kindLabel(kind))
        ))),
        field('When', el('input', { name: 'when', value: draft.when, placeholder: '2026 · A-Lister, or last Tuesday' })),
      ]),
      field('Tags', el('input', { name: 'tags', value: draft.tags.join(', '), placeholder: 'neon, auth, postgres' })),
      el('div', { class: 'star' }, [
        starField('Situation', 'situation', draft.situation, 'What was going on?'),
        starField('Task', 'task', draft.task, 'What were you on the hook for?'),
        starField('Action', 'action', draft.action, 'What did you actually do?'),
        starField('Result', 'result', draft.result, 'What changed? Numbers help.'),
      ]),
      field('Notes', el('textarea', { name: 'notes', placeholder: 'Extra color, links, or a one-line version.' }, draft.notes)),
      el('div', { class: 'actions' }, [
        el('button', { type: 'submit', class: 'btn' }, isNew ? 'Save to the book' : 'Save'),
        btn('Cancel', { class: 'btn ghost', onClick: () => go({ kind: 'log' }) }),
        entry ? btn('Delete', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Remove this win from the book? Jobs will drop the link.')) return;
            store = deleteEntry(store, entry.id);
            saveStore();
            go({ kind: 'log' });
          },
        }) : null,
      ]),
    ])
  );
  return form;
}

function starField(label, name, value, placeholder) {
  return el('label', { class: 'star-card' }, [
    el('b', {}, label),
    el('textarea', { name, placeholder }, value || ''),
  ]);
}

async function copyText(text, ok = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text);
    setNote(ok);
  } catch {
    setNote('Select and copy.');
  }
}

function jobLinkBar(job) {
  if (!job.url) return el('p', { class: 'tiny' }, 'No posting link saved yet — paste still works.');
  return el('div', { class: 'job-link' }, [
    el('a', { class: 'job-link-url', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, job.url),
    el('div', { class: 'actions' }, [
      el('a', { class: 'btn ghost', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open'),
      btn('Copy link', { class: 'btn ghost', onClick: () => copyText(job.url, 'Copied the posting link.') }),
    ]),
  ]);
}

function pullRequirements(job, text, { replace = false } = {}) {
  const lines = parseRequirements(text);
  if (!lines.length && String(text || '').trim()) lines.push(String(text).trim());
  if (!lines.length) {
    setNote('Paste the posting — bullets become rows. Try the sample in the box.');
    return 0;
  }
  if (replace) {
    for (const req of [...job.requirements]) store = deleteRequirement(store, job.id, req.id);
  }
  store = addRequirements(store, job.id, lines);
  store = updatePosting(store, job.id, { sourceText: text, status: job.status === 'draft' ? 'prepping' : job.status });
  saveStore();
  return lines.length;
}

function jobForm() {
  const form = el('form', {
    class: 'panel',
    onSubmit: (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.url = asUrl(data.url);
      if (!data.title) data.title = titleFromJobUrl(data.url);
      if (!data.title) data.title = 'New job posting';
      store = addPosting(store, data);
      const job = store.postings[0];
      const count = pullRequirements(job, data.sourceText);
      const next = store.postings.find((item) => item.id === job.id);
      if (count) {
        go({ kind: 'jobs', id: job.id, mode: 'fill', reqId: next.requirements[0]?.id });
        setNote(`Pulled ${count} requirement${count === 1 ? '' : 's'}. Fill this one: a resume bullet, then a question + STAR.`);
      } else {
        go({ kind: 'jobs', id: job.id });
        setNote('Saved the posting. Paste the job description to pull requirement rows.');
      }
    },
  });
  form.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'New job posting'),
        el('p', { class: 'tiny' }, 'Step 1 of 3 — paste. We do not fetch the link yet.'),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      el('p', { class: 'lede' }, 'Paste the posting. Each bullet becomes a requirement you fill one at a time.'),
      field('Paste the job posting',
        el('textarea', { name: 'sourceText', class: 'tall', placeholder: SAMPLE_JD })
      ),
      el('div', { class: 'grid-2' }, [
        field('Role', el('input', { name: 'title', maxlength: '160', placeholder: 'Product engineer — or leave blank' })),
        field('Company', el('input', { name: 'company', maxlength: '160', placeholder: 'Beep boop' })),
      ]),
      field('Posting link — kept for later',
        el('input', { name: 'url', type: 'url', placeholder: 'https://boards.example.com/jobs/product-engineer' })
      ),
      el('div', { class: 'actions' }, [
        el('button', { type: 'submit', class: 'btn' }, 'Pull requirements'),
        btn('Cancel', { class: 'btn ghost', onClick: () => go({ kind: 'jobs' }) }),
      ]),
    ])
  );
  return form;
}

function coverageBanner(job) {
  const cover = prepCoverage(store, job);
  return el('div', { class: 'banner' }, [
    el('p', {}, cover.hints[0] || `${cover.ready}/${cover.total || 0} marked ready`),
    el('p', { class: 'tiny' }, [
      `${cover.withBullet}/${cover.total || 0} bullets`,
      `${cover.withQuestion}/${cover.total || 0} questions`,
      `${cover.withAnswer}/${cover.total || 0} answers`,
      `${cover.ready}/${cover.total || 0} ready`,
    ].join(' · ')),
  ]);
}

function jobMeta(job) {
  return el('div', {}, [
    jobLinkBar(job),
    el('div', { class: 'grid-2' }, [
      field('Role', el('input', {
        value: job.title,
        onChange: (event) => { store = updatePosting(store, job.id, { title: event.target.value }); saveStore(); },
      })),
      field('Company', el('input', {
        value: job.company,
        onChange: (event) => { store = updatePosting(store, job.id, { company: event.target.value }); saveStore(); },
      })),
    ]),
    el('div', { class: 'grid-2' }, [
      field('Posting link', el('input', {
        type: 'url',
        value: job.url,
        placeholder: 'https://',
        onChange: (event) => { store = updatePosting(store, job.id, { url: event.target.value }); saveStore(); },
        onBlur: () => render(),
      })),
      field('Status', el('select', {
        onChange: (event) => { store = updatePosting(store, job.id, { status: event.target.value }); saveStore(); render(); },
      }, POSTING_STATUSES.map((status) =>
        el('option', { value: status, selected: job.status === status || undefined }, status)
      ))),
    ]),
  ]);
}

function pasteMore(job) {
  const source = el('textarea', { class: 'tall', placeholder: SAMPLE_JD });
  return el('div', { class: 'paste-more' }, [
    el('p', { class: 'subhead' }, 'Paste more'),
    source,
    el('div', { class: 'actions' }, [
      btn('Add these bullets', {
        class: 'btn',
        onClick: () => {
          const count = pullRequirements(job, source.value);
          if (count) {
            render();
            setNote(`Added ${count} requirement${count === 1 ? '' : 's'}.`);
          }
        },
      }),
    ]),
  ]);
}

function requirementRow(job, req, index) {
  const cover = {
    bullet: req.bullets.length,
    question: req.questions.length,
    answer: req.questions.some((question) => question.answer || starFill(question).filled),
  };
  return el('div', { class: `req-row${req.ready ? ' is-ready' : ''}` }, [
    el('div', { class: 'req-row-main' }, [
      el('p', {}, req.text),
      el('p', { class: 'tiny' }, [
        cover.bullet ? 'bullet' : 'needs a bullet',
        cover.question ? 'question' : 'needs a question',
        cover.answer ? 'STAR' : 'needs a STAR answer',
      ].join(' · ')),
    ]),
    el('div', { class: 'actions' }, [
      btn('Fill', { class: 'btn', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'fill', reqId: req.id }) }),
      btn('↑', {
        class: 'btn ghost',
        disabled: index === 0,
        onClick: () => { store = moveRequirement(store, job.id, req.id, -1); saveStore(); render(); },
      }),
      btn('↓', {
        class: 'btn ghost',
        disabled: index === job.requirements.length - 1,
        onClick: () => { store = moveRequirement(store, job.id, req.id, 1); saveStore(); render(); },
      }),
      btn('×', {
        class: 'btn danger',
        onClick: () => { store = deleteRequirement(store, job.id, req.id); saveStore(); render(); },
      }),
    ]),
  ]);
}

function jobDetail(job) {
  const wrap = el('section', { class: 'panel' });
  wrap.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, job.title),
        el('p', { class: 'tiny' }, [job.company, hostFromJobUrl(job.url), job.status].filter(Boolean).join(' · ')),
      ]),
      el('div', { class: 'actions' }, [
        job.requirements.length
          ? btn('Fill one at a time', { class: 'btn', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'fill', reqId: job.requirements[0].id }) })
          : null,
        btn('Prep', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'prep' }) }),
        btn('Resume', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'resume' }) }),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      coverageBanner(job),
      jobMeta(job),
      el('p', { class: 'subhead' }, 'Requirements'),
      job.requirements.length
        ? el('div', { class: 'req-list' }, job.requirements.map((req, index) => requirementRow(job, req, index)))
        : el('p', { class: 'empty' }, 'Paste the posting below. Each bullet becomes a row you fill one at a time.'),
      pasteMore(job),
      job.requirements.length
        ? el('div', { class: 'actions' }, [
          btn(showAllReqs ? 'Hide full cards' : 'Power user — show full cards', {
            class: 'btn ghost',
            onClick: () => { showAllReqs = !showAllReqs; render(); },
          }),
        ])
        : null,
      showAllReqs ? el('div', {}, job.requirements.map((req) => requirementCard(job, req))) : null,
      el('div', { class: 'actions' }, [
        btn('Delete posting', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this posting? The book stays.')) return;
            store = deletePosting(store, job.id);
            saveStore();
            go({ kind: 'jobs' });
          },
        }),
      ]),
    ])
  );
  return wrap;
}

function lineEditor(items, { onAdd, onEdit, onDelete, placeholder }) {
  const box = el('div', { class: 'cell-stack' });
  for (const item of items) {
    const input = el('textarea', { value: item.text });
    input.value = item.text;
    box.append(el('div', { class: 'line-row' }, [
      input,
      btn('Save', { class: 'btn ghost', onClick: () => onEdit(item.id, input.value) }),
      el('button', { type: 'button', class: 'icon-btn', title: 'Remove', onClick: () => onDelete(item.id) }, '×'),
    ]));
  }
  const fresh = el('input', { placeholder });
  const add = () => {
    if (!fresh.value.trim()) return;
    onAdd(fresh.value);
  };
  fresh.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  });
  box.append(el('div', { class: 'line-row' }, [
    fresh,
    btn('Add', { class: 'btn ghost', onClick: add }),
  ]));
  return box;
}

function questionEditor(job, req) {
  const box = el('div', { class: 'cell-stack' });
  const stories = linkedEntries(store, req);
  for (const question of req.questions) {
    const text = el('textarea', { placeholder: 'They might ask…' }, question.text);
    text.value = question.text;
    const answer = el('textarea', { placeholder: 'Your answer in a sentence, or fill STAR below.' }, question.answer);
    answer.value = question.answer;
    const fields = {
      situation: el('textarea', { placeholder: 'Situation' }, question.situation),
      task: el('textarea', { placeholder: 'Task' }, question.task),
      action: el('textarea', { placeholder: 'Action' }, question.action),
      result: el('textarea', { placeholder: 'Result' }, question.result),
    };
    const save = () => {
      store = updateQuestion(store, job.id, req.id, question.id, {
        text: text.value,
        answer: answer.value,
        situation: fields.situation.value,
        task: fields.task.value,
        action: fields.action.value,
        result: fields.result.value,
      });
      saveStore();
      render();
    };
    box.append(el('article', { class: 'q-card' }, [
      el('p', { class: 'subhead' }, 'Potential question'),
      text,
      el('p', { class: 'subhead' }, 'Answer / STAR'),
      answer,
      el('div', { class: 'star' }, ['situation', 'task', 'action', 'result'].map((key) =>
        el('label', { class: 'star-card' }, [el('b', {}, key[0].toUpperCase()), fields[key]])
      )),
      el('div', { class: 'actions' }, [
        btn('Save', { class: 'btn ghost', onClick: save }),
        stories.length
          ? btn('Use pinned story', {
            class: 'btn ghost',
            onClick: () => {
              store = answerQuestionFromEntry(store, job.id, req.id, question.id, stories[0].id);
              saveStore();
              render();
              setNote('Copied that story into the STAR answer.');
            },
          })
          : null,
        btn('Remove', {
          class: 'btn danger',
          onClick: () => { store = deleteQuestion(store, job.id, req.id, question.id); saveStore(); render(); },
        }),
      ]),
    ]));
  }
  const fresh = el('input', { placeholder: 'Tell me about a time you…' });
  box.append(el('div', { class: 'line-row' }, [
    fresh,
    btn('Add question', {
      class: 'btn ghost',
      onClick: () => {
        if (!fresh.value.trim()) return;
        store = addQuestion(store, job.id, req.id, fresh.value);
        saveStore();
        render();
      },
    }),
  ]));
  return box;
}

function storyBlock(job, req) {
  const stories = linkedEntries(store, req);
  const suggested = suggestEntries(store, req);
  const picker = el('select', {}, [
    el('option', { value: '' }, 'Pin a win from the book…'),
    ...store.entries
      .filter((entry) => !req.entryIds.includes(entry.id))
      .map((entry) => el('option', { value: entry.id }, `${entry.title} (${kindLabel(entry.kind)})`)),
  ]);
  picker.addEventListener('change', () => {
    if (!picker.value) return;
    store = linkEntry(store, job.id, req.id, picker.value);
    saveStore();
    render();
  });
  return el('div', { class: 'cell-stack' }, [
    stories.length
      ? el('div', {}, stories.map((entry) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, entry.title),
        el('pre', { class: 'tiny' }, starScript(entry) || entry.notes || 'No STAR yet — open it in the book.'),
        el('div', { class: 'actions' }, [
          btn('Use as resume bullet', {
            class: 'btn ghost',
            onClick: () => {
              const line = draftBulletFromEntry(entry);
              if (!line) return;
              store = addBullet(store, job.id, req.id, line);
              saveStore();
              render();
              setNote('Drafted a resume bullet from that story.');
            },
          }),
          btn('Open', { class: 'btn ghost', onClick: () => go({ kind: 'log', id: entry.id }) }),
          btn('Unpin', { class: 'btn ghost', onClick: () => { store = unlinkEntry(store, job.id, req.id, entry.id); saveStore(); render(); } }),
        ]),
      ])))
      : el('p', { class: 'empty' }, store.entries.length
        ? 'Pin a win from the book, or skip and write the STAR on the question.'
        : 'No wins in the book yet. Write the STAR on the question, or paste experiences in the book.'),
    picker,
    suggested.length
      ? el('div', { class: 'tags' }, suggested.map((entry) => el('button', {
        type: 'button',
        class: 'tag kind-experience',
        onClick: () => { store = linkEntry(store, job.id, req.id, entry.id); saveStore(); render(); },
      }, `+ ${entry.title}`)))
      : null,
  ]);
}

function requirementCard(job, req) {
  const card = el('article', { class: `req${req.ready ? ' is-ready' : ''}` });
  const text = el('textarea', { class: 'req-text' }, req.text);
  text.value = req.text;
  card.append(
    el('div', { class: 'req-head' }, [
      text,
      el('label', { class: 'tiny' }, [
        el('input', {
          type: 'checkbox',
          checked: req.ready,
          onChange: (event) => {
            store = updateRequirement(store, job.id, req.id, { ready: event.target.checked });
            saveStore();
            render();
          },
        }),
        ' ready',
      ]),
    ]),
    el('p', { class: 'subhead' }, 'Resume bullets'),
    req.bullets.length ? null : el('p', { class: 'tiny' }, 'Write the line you want on the resume, or pin a story and tap “Use as resume bullet”.'),
    lineEditor(req.bullets, {
      placeholder: 'Kept every public page on static files plus 11 serverless functions.',
      onAdd: (value) => { store = addBullet(store, job.id, req.id, value); saveStore(); render(); },
      onEdit: (id, value) => { store = updateBullet(store, job.id, req.id, id, value); saveStore(); render(); },
      onDelete: (id) => { store = deleteBullet(store, job.id, req.id, id); saveStore(); render(); },
    }),
    el('p', { class: 'subhead' }, 'Stories from the book'),
    storyBlock(job, req),
    el('p', { class: 'subhead' }, 'Potential questions + STAR'),
    req.questions.length ? null : el('p', { class: 'tiny' }, 'Add the question they will ask, then write the STAR answer on it.'),
    questionEditor(job, req),
    el('div', { class: 'actions' }, [
      btn('Save requirement', {
        class: 'btn ghost',
        onClick: () => {
          store = updateRequirement(store, job.id, req.id, { text: text.value });
          saveStore();
          render();
        },
      }),
    ])
  );
  return card;
}

function fillView(job, reqId) {
  const list = job.requirements;
  let index = list.findIndex((req) => req.id === reqId);
  if (index < 0) index = 0;
  const req = list[index];
  const wrap = el('section', { class: 'panel' });
  wrap.append(el('div', { class: 'panel-head' }, [
    el('div', {}, [
      el('h2', {}, `Requirement ${list.length ? index + 1 : 0} of ${list.length}`),
      el('p', { class: 'tiny' }, 'Bullet → story → question + STAR. Arrow keys move. Then Resume or Prep.'),
    ]),
    el('div', { class: 'actions' }, [
      btn('All requirements', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id }) }),
      btn('Resume', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'resume' }) }),
      btn('Prep', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'prep' }) }),
    ]),
  ]));
  if (!req) {
    wrap.append(el('div', { class: 'panel-body' }, [
      el('p', { class: 'empty' }, 'Paste the posting first so there is a requirement to fill.'),
      pasteMore(job),
    ]));
    return wrap;
  }
  const step = (next) => {
    const target = list[next];
    if (!target) return;
    go({ kind: 'jobs', id: job.id, mode: 'fill', reqId: target.id });
  };
  wrap.append(el('div', { class: 'panel-body' }, [
    coverageBanner(job),
    el('p', { class: 'kicker' }, job.company || job.title),
    requirementCard(job, req),
    el('div', { class: 'prep-nav' }, [
      btn('Previous', { class: 'btn ghost', disabled: index <= 0, onClick: () => step(index - 1) }),
      btn(index >= list.length - 1 ? 'Resume' : 'Next requirement', {
        class: 'btn',
        onClick: () => {
          if (index >= list.length - 1) go({ kind: 'jobs', id: job.id, mode: 'resume' });
          else step(index + 1);
        },
      }),
    ]),
  ]));
  wrap.dataset.fillIndex = String(index);
  wrap.dataset.fillJob = job.id;
  return wrap;
}

function prepKey(jobId) {
  return `brag-book-prep-i:${jobId}`;
}

function prepView(job) {
  const cards = compilePrep(store, job);
  let index = Number(sessionStorage.getItem(prepKey(job.id)) || '0');
  index = Math.min(Math.max(index, 0), Math.max(cards.length - 1, 0));
  const card = cards[index];
  const wrap = el('section', { class: 'panel' });
  wrap.append(el('div', { class: 'panel-head' }, [
    el('h2', {}, `Cue card ${cards.length ? index + 1 : 0} of ${cards.length}`),
    btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id }) }),
  ]));
  if (!card) {
    wrap.append(el('p', { class: 'empty' }, 'Add a requirement first, then walk the cards. Arrow keys once you have some.'));
    return wrap;
  }
  const step = (next) => {
    sessionStorage.setItem(prepKey(job.id), String(next));
    render();
  };
  wrap.append(el('div', { class: 'panel-body' }, [
    coverageBanner(job),
    el('p', { class: 'kicker' }, job.company || 'Interview'),
    el('h3', {}, card.text),
    card.questions.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'They might ask'),
      ...card.questions.map((question) => el('div', { class: 'q-card' }, [
        el('p', {}, `? ${question.text}`),
        question.script || question.answer
          ? el('pre', { class: 'tiny' }, question.script || question.answer)
          : el('p', { class: 'tiny' }, 'No STAR answer yet. Jump back and write one on this question.'),
      ])),
    ]) : el('p', { class: 'empty' }, 'No question on this requirement yet. Add one, then come back.'),
    card.stories.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'From the book'),
      ...card.stories.map((story) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, story.title),
        el('pre', { class: 'tiny' }, story.script || story.notes || 'Open the book and fill STAR.'),
      ])),
    ]) : null,
    card.bullets.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Resume line'),
      ...card.bullets.map((text) => el('p', {}, `• ${text}`)),
    ]) : null,
    el('div', { class: 'actions' }, [
      btn(card.ready ? 'Ready' : 'Mark ready', {
        class: card.ready ? 'btn' : 'btn ghost',
        onClick: () => {
          store = updateRequirement(store, job.id, card.id, { ready: !card.ready });
          saveStore();
          render();
        },
      }),
      btn('Edit this requirement', {
        class: 'btn ghost',
        onClick: () => go({ kind: 'jobs', id: job.id, mode: 'fill', reqId: card.id }),
      }),
    ]),
    el('p', { class: 'tiny' }, '← → on the keyboard walks the cards.'),
    el('div', { class: 'prep-nav' }, [
      btn('Previous', { class: 'btn ghost', disabled: index <= 0, onClick: () => step(index - 1) }),
      btn('Next', { class: 'btn ghost', disabled: index >= cards.length - 1, onClick: () => step(index + 1) }),
    ]),
  ]));
  wrap.dataset.prepJob = job.id;
  wrap.dataset.prepIndex = String(index);
  wrap.dataset.prepMax = String(cards.length - 1);
  return wrap;
}

function resumeView(job) {
  const profile = store.profile || {};
  const text = compileResumeText(job, store) || 'Add resume bullets on a requirement first.';
  const html = compileResumeHtml(job, store);
  const area = el('textarea', { class: 'resume', readonly: true });
  area.value = text;
  const stamp = (key, value) => {
    store = updateProfile(store, { [key]: value });
    saveStore();
  };
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'Resume'),
      el('div', { class: 'actions' }, [
        btn('Copy', { class: 'btn', onClick: () => copyText(text, 'Copied the resume.') }),
        btn('Download .txt', {
          class: 'btn ghost',
          onClick: () => {
            downloadText(`${job.title || 'resume'}.txt`, text);
            setNote('Downloaded a text resume.');
          },
        }),
        btn('Print / PDF', {
          class: 'btn ghost',
          onClick: () => {
            const win = window.open('', '_blank');
            if (!win) {
              downloadText(`${job.title || 'resume'}.html`, html, 'text/html');
              setNote('Download the HTML and print it.');
              return;
            }
            win.document.write(html);
            win.document.close();
            win.focus();
            win.print();
          },
        }),
        btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id }) }),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      el('p', { class: 'lede' }, 'Optional header, then one section per requirement. Edit bullets on the posting — this is the clean copy.'),
      el('div', { class: 'grid-2' }, [
        field('Name', el('input', { value: profile.name, placeholder: 'Your name', onChange: (event) => stamp('name', event.target.value) })),
        field('Email', el('input', { value: profile.email, placeholder: 'you@example.com', onChange: (event) => stamp('email', event.target.value) })),
      ]),
      el('div', { class: 'grid-2' }, [
        field('Location', el('input', { value: profile.location, placeholder: 'New York, NY', onChange: (event) => stamp('location', event.target.value) })),
        field('Skills', el('input', { value: profile.skills, placeholder: 'javascript, postgres — or leave blank to use skillsets in the book', onChange: (event) => stamp('skills', event.target.value) })),
      ]),
      field('Summary', el('textarea', { onChange: (event) => stamp('summary', event.target.value) }, profile.summary)),
      area,
    ]),
  ]);
}

function emptyDetail(kind) {
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-body empty' },
      kind === 'jobs'
        ? 'Paste a job posting. That is the first click — requirements, then bullets, then questions + STAR.'
        : 'Paste several experiences, or pick one to fill STAR.'
    ),
  ]);
}

function render() {
  const view = currentView();
  document.title = `${viewTitle(view, store)} — Brag Book`;
  document.body.dataset.view = view.kind;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const key = link.getAttribute('data-nav');
    link.classList.toggle('is-on', key === view.kind || (key === 'home' && view.kind === 'home'));
  });

  if (view.kind === 'home') {
    root.replaceChildren(el('div', {}, [toolbar(view), homeView()]));
    return;
  }

  let detail;
  if (view.kind === 'log' && view.id === 'new') detail = bulkEntryForm();
  else if (view.kind === 'log' && view.id) {
    const entry = store.entries.find((item) => item.id === view.id);
    detail = entry ? entryForm(entry) : emptyDetail('log');
  } else if (view.kind === 'log') detail = bulkEntryForm();
  else if (view.kind === 'jobs' && view.id === 'new') detail = jobForm();
  else if (view.kind === 'jobs' && view.id && view.mode === 'prep') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? prepView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id && view.mode === 'resume') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? resumeView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id && view.mode === 'fill') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? fillView(job, view.reqId) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id) {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? jobDetail(job) : emptyDetail('jobs');
  } else detail = emptyDetail('jobs');

  const next = el('div', {}, [
    toolbar(view),
    el('div', { class: view.mode === 'fill' || view.mode === 'resume' || view.mode === 'prep' ? 'layout is-wide' : 'layout' }, [
      view.mode === 'fill' || view.mode === 'resume' || view.mode === 'prep'
        ? null
        : (view.kind === 'jobs' ? jobList(view.id) : entryList(view.id)),
      detail,
    ]),
  ]);
  root.replaceChildren(next);
}

function setAppNav(on) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.hidden = !on;
  });
}

function renderSignInGate() {
  unlocked = false;
  setAppNav(false);
  const note = !auth?.configured
    ? '<p class="bb-gate-error">Sign-in isn’t configured on this server yet. Open <a href="/brag-book/?local=1">?local=1</a> to use this browser only.</p>'
    : (auth?.needsReauth
      ? '<p class="bb-gate-error">Your session expired. Sign in again to open your book.</p>'
      : '');
  renderBragSignIn(root, {
    art: '<img class="bb-gate-art" src="/brag-book/icon.svg" alt="" width="72" height="72">',
    title: 'Brag Book',
    copy: 'Sign in with the same account as Packing Cubes. Paste a posting, fill each requirement, then copy a resume and walk Prep.',
    note,
    onSuccess: () => location.reload(),
  });
  if (!auth?.configured) {
    const form = root.querySelector('#bb-auth');
    if (form) form.hidden = true;
  }
  wireAuthLink(auth || { configured: false, signedIn: false });
  const legal = document.querySelector('.legal');
  if (legal) legal.textContent = 'Sign in to keep the book on your account. Nothing is stored until you do.';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function showBook(note) {
  unlocked = true;
  setAppNav(true);
  if (!location.hash) location.hash = '#home';
  render();
  if (note) setNote(note);
}

async function boot() {
  if (localMode) {
    auth = { configured: true, signedIn: true, token: null, local: true };
    store = loadCached();
    const legal = document.querySelector('.legal');
    if (legal) legal.textContent = 'This device only (?local=1). Sign in without that flag to keep the book on your account.';
    showBook('This device only');
    const link = document.getElementById('nav-auth-link');
    if (link) {
      link.textContent = 'Local';
      link.href = '/brag-book/';
    }
    return;
  }

  auth = await initAuth();
  if (auth.configured && auth.user && !auth.token) await refreshToken(auth);
  wireAuthLink(auth);

  if (!auth.configured || !auth.signedIn || !auth.token) {
    renderSignInGate();
    return;
  }

  const cached = loadCached();

  try {
    const data = await loadBook(auth.token);
    const remote = normalizeStore(data.book);
    if (data.created && bookIsEmpty(remote) && !bookIsEmpty(cached)) {
      store = cached;
      showBook('Moved this browser’s book onto your account.');
      await pushStore();
      return;
    }
    store = remote;
    cacheStore();
    showBook(data.created ? 'New book' : 'Saved to your account.');
  } catch (err) {
    if (err.status === 401) {
      auth.needsReauth = true;
      auth.signedIn = false;
      renderSignInGate();
      return;
    }
    if (!bookIsEmpty(cached)) {
      store = cached;
      showBook('Cloud copy unavailable — showing this device.');
      return;
    }
    root.innerHTML = `<p class="quiet">Could not load Brag Book: ${escapeHtml(err.message)}</p>`;
  }
}

fileInput.addEventListener('change', () => {
  importStore(fileInput.files?.[0]);
  fileInput.value = '';
});

window.addEventListener('hashchange', () => {
  if (unlocked) render();
});

window.addEventListener('keydown', (event) => {
  if (!unlocked) return;
  if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  const view = currentView();
  if (view.kind !== 'jobs' || !view.id) return;
  const job = store.postings.find((item) => item.id === view.id);
  if (!job) return;
  if (view.mode === 'prep') {
    const max = Math.max(job.requirements.length - 1, 0);
    let index = Number(sessionStorage.getItem(prepKey(job.id)) || '0');
    if (event.key === 'ArrowRight' || event.key === 'j') {
      event.preventDefault();
      sessionStorage.setItem(prepKey(job.id), String(Math.min(index + 1, max)));
      render();
    }
    if (event.key === 'ArrowLeft' || event.key === 'k') {
      event.preventDefault();
      sessionStorage.setItem(prepKey(job.id), String(Math.max(index - 1, 0)));
      render();
    }
  }
  if (view.mode === 'fill') {
    const list = job.requirements;
    let index = list.findIndex((req) => req.id === view.reqId);
    if (index < 0) index = 0;
    if (event.key === 'ArrowRight' || event.key === 'j') {
      event.preventDefault();
      const next = list[Math.min(index + 1, list.length - 1)];
      if (next) go({ kind: 'jobs', id: job.id, mode: 'fill', reqId: next.id });
    }
    if (event.key === 'ArrowLeft' || event.key === 'k') {
      event.preventDefault();
      const prev = list[Math.max(index - 1, 0)];
      if (prev) go({ kind: 'jobs', id: job.id, mode: 'fill', reqId: prev.id });
    }
  }
});

window.addEventListener('pagehide', () => {
  if (!persistTimer) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  if (auth?.token) saveBook(auth.token, store, { keepalive: true });
});

boot();
