import {
  STORE_KEY,
  ENTRY_KINDS,
  POSTING_STATUSES,
  emptyStore,
  normalizeStore,
  addEntry,
  updateEntry,
  deleteEntry,
  updatePosting,
  deletePosting,
  addRequirement,
  addRequirements,
  updateRequirement,
  deleteRequirement,
  addExperience,
  updateExperience,
  deleteExperience,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  addResponse,
  updateResponse,
  deleteResponse,
  openNewPosting,
  linkEntry,
  unlinkEntry,
  parseRequirements,
  searchEntries,
  suggestEntries,
  linkedEntries,
  compileResumeText,
  compilePrep,
  prepCoverage,
  listingSummary,
  starFill,
  starScript,
  bookIsEmpty,
  titleFromJobUrl,
  hostFromJobUrl,
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
    chip(summary.entries, 'in the book'),
    chip(summary.stories, 'experiences'),
    chip(summary.projects, 'projects'),
    chip(summary.skillsets, 'skillsets'),
    chip(summary.postings, 'jobs'),
  ]);
}

function toolbar(view) {
  if (view.kind === 'home') return homeHero();
  return el('header', { class: 'hero' }, [
    el('button', { type: 'button', class: 'btn ghost', onClick: () => go({ kind: 'home' }) }, '← Start'),
    el('p', { class: 'kicker' }, view.kind === 'jobs' ? 'Start from a posting' : 'Start from the book'),
    el('div', { class: 'hero-row' }, [
      el('div', {}, [
        el('h1', {}, viewTitle(view, store)),
        el('p', { class: 'lede' },
          view.kind === 'jobs'
            ? 'Paste the posting. Each bullet becomes a row. Add experiences, potential questions, and STAR responses per requirement.'
            : 'Collect wins while you work. Later, pin them to a job when you are writing a resume or prepping an interview.'
        ),
      ]),
      el('div', { class: 'actions' }, [
        btn(view.kind === 'jobs' ? 'New job posting' : 'New win', {
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
    el('p', { class: 'eyebrow' }, 'Two ways in'),
    el('h1', { class: 'mast-title' }, 'Brag Book'),
    markSvg(),
    el('p', { class: 'lede' }, 'Collect wins as you work, or start from a job posting and pull stories from the book when you need them.'),
    countRow(),
    statusNote ? el('p', { class: 'status', id: 'status-note' }, statusNote) : el('p', { class: 'status', id: 'status-note' }, ''),
  ]);
}

function homeView() {
  const summary = listingSummary(store);
  const recentWins = store.entries.slice(0, 4);
  const recentJobs = store.postings.slice(0, 4);
  return el('div', {}, [
    el('div', { class: 'start-grid' }, [
      el('button', {
        type: 'button',
        class: 'start-card',
        onClick: () => go({ kind: 'log', id: store.entries.length ? undefined : 'new' }),
      }, [
        el('span', { class: 'kicker' }, 'The book'),
        el('strong', {}, 'Log a win'),
        el('p', {}, summary.entries
          ? `${summary.entries} already in the book. Add another STAR story, project, or skillset.`
          : 'Start the running log: a meeting, a ship, a skill you just learned.'),
      ]),
      el('button', {
        type: 'button',
        class: 'start-card',
        onClick: () => go({ kind: 'jobs', id: 'new' }),
      }, [
        el('span', { class: 'kicker' }, 'A posting'),
        el('strong', {}, 'New job posting'),
        el('p', {}, summary.postings
          ? `${summary.postings} posting${summary.postings === 1 ? '' : 's'} on file. Open the table, or start another.`
          : 'Paste the requirements. Each bullet is a row — add experiences, questions, and STAR responses.'),
      ]),
    ]),
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
          el('p', {}, [entry.when, starFill(entry).ready ? 'STAR ready' : entry.tags.slice(0, 3).join(' · ')].filter(Boolean).join(' · ') || 'Open to fill in STAR'),
        ])
      )),
    ]) : null,
    recentJobs.length ? el('section', { class: 'recent' }, [
      el('h2', {}, 'Recent postings'),
      el('div', { class: 'plot-cards' }, recentJobs.map((job) => {
        const cover = prepCoverage(store, job);
        return el('button', {
          type: 'button',
          class: 'plot-card',
          onClick: () => go({ kind: 'jobs', id: job.id }),
        }, [
          el('span', { class: 'kicker' }, job.status),
          el('strong', {}, job.title),
          el('p', {}, [job.company, hostFromJobUrl(job.url), `${cover.ready}/${cover.total || 0} ready`].filter(Boolean).join(' · ')),
        ]);
      })),
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
          entry.tags.length ? el('div', { class: 'tags' }, entry.tags.map((tag) => el('span', { class: 'tag' }, tag))) : null,
        ])
      ))
      : el('p', { class: 'empty' }, query ? 'Nothing in the book matches that.' : 'No wins yet. Add one after a good meeting, a ship, or a skill you just learned.'),
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
          el('div', { class: 'row-meta' }, [job.company, hostFromJobUrl(job.url), job.status, `${cover.ready}/${cover.total || 0} ready`].filter(Boolean).join(' · ')),
        ]);
      }))
      : el('p', { class: 'empty' }, 'No postings yet. Start a new job posting and paste the requirements.'),
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
      el('h2', {}, isNew ? 'Add a win' : 'Edit win'),
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
  if (!job.url) return el('p', { class: 'tiny' }, 'No posting link saved yet.');
  return el('div', { class: 'job-link' }, [
    el('a', { class: 'job-link-url', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, job.url),
    el('div', { class: 'actions' }, [
      el('a', { class: 'btn ghost', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open'),
      btn('Copy link', { class: 'btn ghost', onClick: () => copyText(job.url, 'Copied the posting link.') }),
    ]),
  ]);
}

function startNewPosting() {
  const opened = openNewPosting(store);
  store = opened.store;
  if (opened.created) saveStore();
  const next = { kind: 'jobs', id: opened.posting.id };
  const hash = viewHash(next);
  if (location.hash !== hash) history.replaceState(null, '', hash);
  return opened.posting;
}

function pullRequirements(job, text) {
  const lines = parseRequirements(text);
  if (!lines.length && String(text || '').trim()) lines.push(String(text).trim());
  if (!lines.length) {
    setNote('Paste bullets from the posting — one requirement per line.');
    return;
  }
  store = addRequirements(store, job.id, lines);
  store = updatePosting(store, job.id, { sourceText: text, status: job.status === 'draft' ? 'prepping' : job.status });
  if (!job.title || job.title === 'New job posting') {
    const fromUrl = titleFromJobUrl(job.url);
    if (fromUrl) store = updatePosting(store, job.id, { title: fromUrl });
  }
  saveStore();
  render();
  setNote(`Added ${lines.length} requirement${lines.length === 1 ? '' : 's'} to the table.`);
}

function jobSheet(job) {
  const cover = prepCoverage(store, job);
  const paste = el('textarea', {
    class: 'tall',
    placeholder: 'Paste the posting here.\n- Ship production Javascript…\n- Comfortable with Postgres\n\nEach bullet becomes a row. Parsing from the link comes later.',
  });
  if (job.sourceText && !job.requirements.length) paste.value = job.sourceText;

  const wrap = el('section', { class: 'panel job-sheet' });
  wrap.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, job.title || 'New job posting'),
        el('p', { class: 'tiny' }, [job.company, hostFromJobUrl(job.url), job.status].filter(Boolean).join(' · ') || 'Fill in the role, then paste requirements into the table.'),
      ]),
      el('div', { class: 'actions' }, [
        btn('Prep', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'prep' }) }),
        btn('Resume', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'resume' }) }),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'banner' },
        `${cover.total || 0} requirements · ${cover.withExperience} with experiences · ${cover.withQuestion} with questions · ${cover.withResponse} with STAR responses · ${cover.ready}/${cover.total || 0} ready`
      ),
      el('div', { class: 'grid-2' }, [
        field('Role', el('input', {
          value: job.title,
          placeholder: 'Product engineer',
          onChange: (event) => { store = updatePosting(store, job.id, { title: event.target.value }); saveStore(); },
        })),
        field('Company', el('input', {
          value: job.company,
          placeholder: 'Beep boop',
          onChange: (event) => { store = updatePosting(store, job.id, { company: event.target.value }); saveStore(); },
        })),
      ]),
      el('div', { class: 'grid-2' }, [
        field('Posting link — kept for later (we do not fetch it yet)', el('input', {
          type: 'url',
          value: job.url,
          placeholder: 'https://boards.example.com/jobs/product-engineer',
          onChange: (event) => { store = updatePosting(store, job.id, { url: event.target.value }); saveStore(); },
          onBlur: () => render(),
        })),
        field('Status', el('select', {
          onChange: (event) => { store = updatePosting(store, job.id, { status: event.target.value }); saveStore(); render(); },
        }, POSTING_STATUSES.map((status) =>
          el('option', { value: status, selected: job.status === status || undefined }, status)
        ))),
      ]),
      job.url ? jobLinkBar(job) : null,
      el('p', { class: 'subhead' }, 'Paste requirements'),
      paste,
      el('div', { class: 'actions' }, [
        btn('Add rows from paste', {
          class: 'btn',
          onClick: () => pullRequirements(job, paste.value),
        }),
        btn('Add a blank row', {
          class: 'btn ghost',
          onClick: () => {
            store = addRequirement(store, job.id, 'New requirement');
            saveStore();
            render();
          },
        }),
        btn('Delete posting', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this posting and its table? The book stays.')) return;
            store = deletePosting(store, job.id);
            saveStore();
            go({ kind: 'jobs' });
          },
        }),
      ]),
    ]),
    requirementTable(job)
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
    fresh.value = '';
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

function starResponseEditor(job, req) {
  const box = el('div', { class: 'cell-stack' });
  for (const star of req.responses) {
    const form = el('div', { class: 'star-mini' });
    const title = el('input', { value: star.title, placeholder: 'Story title' });
    const fields = {
      situation: el('textarea', { placeholder: 'Situation — what was going on?' }, star.situation),
      task: el('textarea', { placeholder: 'Task — what were you on the hook for?' }, star.task),
      action: el('textarea', { placeholder: 'Action — what did you do?' }, star.action),
      result: el('textarea', { placeholder: 'Result — what changed?' }, star.result),
    };
    form.append(
      el('div', { class: 'line-row' }, [
        title,
        btn('Save', {
          class: 'btn ghost',
          onClick: () => {
            store = updateResponse(store, job.id, req.id, star.id, {
              title: title.value,
              situation: fields.situation.value,
              task: fields.task.value,
              action: fields.action.value,
              result: fields.result.value,
            });
            saveStore();
            render();
          },
        }),
        el('button', {
          type: 'button',
          class: 'icon-btn',
          title: 'Remove',
          onClick: () => {
            store = deleteResponse(store, job.id, req.id, star.id);
            saveStore();
            render();
          },
        }, '×'),
      ]),
      ...['situation', 'task', 'action', 'result'].map((key) =>
        el('label', { class: 'star-mini-field' }, [
          el('b', {}, key[0].toUpperCase()),
          fields[key],
        ])
      )
    );
    box.append(form);
  }
  box.append(btn('Add STAR response', {
    class: 'btn ghost',
    onClick: () => {
      store = addResponse(store, job.id, req.id, {});
      saveStore();
      render();
    },
  }));
  return box;
}

function experienceCell(job, req) {
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
    lineEditor(req.experiences, {
      placeholder: 'An experience that maps to this requirement',
      onAdd: (text) => { store = addExperience(store, job.id, req.id, text); saveStore(); render(); },
      onEdit: (id, text) => { store = updateExperience(store, job.id, req.id, id, text); saveStore(); render(); },
      onDelete: (id) => { store = deleteExperience(store, job.id, req.id, id); saveStore(); render(); },
    }),
    stories.length
      ? el('div', {}, stories.map((entry) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, entry.title),
        el('div', { class: 'tiny' }, starScript(entry) || entry.notes || 'No STAR yet — open it in the book.'),
        el('div', { class: 'actions' }, [
          btn('Open', { class: 'btn ghost', onClick: () => go({ kind: 'log', id: entry.id }) }),
          btn('Unpin', { class: 'btn ghost', onClick: () => { store = unlinkEntry(store, job.id, req.id, entry.id); saveStore(); render(); } }),
        ]),
      ])))
      : null,
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

function requirementTable(job) {
  const table = el('table', { class: 'req-table' });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Requirement'),
        el('th', {}, 'Experiences'),
        el('th', {}, 'Potential questions'),
        el('th', {}, 'Responses (STAR)'),
      ]),
    ])
  );
  const body = el('tbody');
  if (!job.requirements.length) {
    body.append(el('tr', {}, [
      el('td', { class: 'req-empty', colspan: '4' },
        'Paste the posting above — each bullet becomes a row. Or add a blank row and type the requirement.'
      ),
    ]));
  }
  for (const req of job.requirements) {
    const text = el('textarea', { class: 'req-text' }, req.text);
    text.value = req.text;
    body.append(el('tr', { class: req.ready ? 'is-ready' : '' }, [
      el('td', { 'data-label': 'Requirement' }, [
        text,
        el('div', { class: 'req-head' }, [
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
          el('div', { class: 'actions' }, [
            btn('Save', {
              class: 'btn ghost',
              onClick: () => {
                store = updateRequirement(store, job.id, req.id, { text: text.value });
                saveStore();
                render();
              },
            }),
            btn('Remove', {
              class: 'btn danger',
              onClick: () => {
                store = deleteRequirement(store, job.id, req.id);
                saveStore();
                render();
              },
            }),
          ]),
        ]),
      ]),
      el('td', { 'data-label': 'Experiences' }, [experienceCell(job, req)]),
      el('td', { 'data-label': 'Potential questions' }, [
        lineEditor(req.questions, {
          placeholder: 'Tell me about a time you…',
          onAdd: (textValue) => { store = addQuestion(store, job.id, req.id, textValue); saveStore(); render(); },
          onEdit: (id, textValue) => { store = updateQuestion(store, job.id, req.id, id, textValue); saveStore(); render(); },
          onDelete: (id) => { store = deleteQuestion(store, job.id, req.id, id); saveStore(); render(); },
        }),
      ]),
      el('td', { 'data-label': 'Responses (STAR)' }, [starResponseEditor(job, req)]),
    ]));
  }
  table.append(body);
  return el('div', { class: 'req-table-wrap' }, [table]);
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
    wrap.append(el('p', { class: 'empty' }, 'Add a requirement first, then walk the cards.'));
    return wrap;
  }
  const step = (next) => {
    sessionStorage.setItem(prepKey(job.id), String(next));
    render();
  };
  wrap.append(el('div', { class: 'panel-body' }, [
    el('p', { class: 'kicker' }, job.company || 'Interview'),
    el('h3', {}, card.text),
    card.experiences.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Experiences'),
      ...card.experiences.map((text) => el('p', {}, `• ${text}`)),
    ]) : null,
    card.responses.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'STAR responses'),
      ...card.responses.map((star) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, star.title || 'Untitled response'),
        el('pre', { class: 'tiny' }, star.script || 'Open the table and fill STAR.'),
      ])),
    ]) : null,
    card.stories.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'From the book'),
      ...card.stories.map((story) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, story.title),
        el('pre', { class: 'tiny' }, story.script || story.notes || 'Open the book and fill STAR.'),
      ])),
    ]) : null,
    !card.experiences.length && !card.responses.length && !card.stories.length
      ? el('p', { class: 'tiny' }, 'No experiences or STAR responses yet. Jump back to the table.')
      : null,
    card.questions.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'They might ask'),
      ...card.questions.map((text) => el('p', {}, `? ${text}`)),
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
    ]),
    el('div', { class: 'prep-nav' }, [
      btn('Previous', {
        class: 'btn ghost',
        disabled: index <= 0,
        onClick: () => step(index - 1),
      }),
      btn('Next', {
        class: 'btn ghost',
        disabled: index >= cards.length - 1,
        onClick: () => step(index + 1),
      }),
    ]),
  ]));
  return wrap;
}

function resumeView(job) {
  const text = compileResumeText(job) || 'Add experiences on the table first.';
  const area = el('textarea', { class: 'resume', readonly: true });
  area.value = text;
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'Compiled resume lines'),
      el('div', { class: 'actions' }, [
        btn('Copy', {
          class: 'btn',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(text);
              setNote('Copied.');
            } catch {
              area.select();
              setNote('Select and copy.');
            }
          },
        }),
        btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id }) }),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      el('p', { class: 'lede' }, 'One block per requirement. Edit experiences on the table — this page is just the clean copy.'),
      area,
    ]),
  ]);
}

function emptyDetail(kind) {
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-body empty' },
      kind === 'jobs'
        ? 'Pick a posting, or start a new job posting and paste the requirements into the table.'
        : 'Pick a win, or add whatever you just did — ship, story, or skill.'
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
  if (view.kind === 'log' && view.id === 'new') detail = entryForm(null);
  else if (view.kind === 'log' && view.id) {
    const entry = store.entries.find((item) => item.id === view.id);
    detail = entry ? entryForm(entry) : emptyDetail('log');
  } else if (view.kind === 'log') detail = emptyDetail('log');
  else if (view.kind === 'jobs' && view.id === 'new') {
    const job = startNewPosting();
    view = { kind: 'jobs', id: job.id };
    document.title = `${viewTitle(view, store)} — Brag Book`;
    detail = jobSheet(job);
  } else if (view.kind === 'jobs' && view.id && view.mode === 'prep') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? prepView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id && view.mode === 'resume') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? resumeView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id) {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? jobSheet(job) : emptyDetail('jobs');
  } else detail = emptyDetail('jobs');

  const wideJob = view.kind === 'jobs' && view.id && view.id !== 'new';
  const next = el('div', {}, [
    toolbar(view),
    wideJob
      ? el('div', { class: 'layout is-wide' }, [detail])
      : el('div', { class: 'layout' }, [
        view.kind === 'jobs' ? jobList(view.id) : entryList(view.id),
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
    copy: 'Sign in with the same account as Packing Cubes. Your wins, postings, and cue cards stay on that account.',
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

window.addEventListener('pagehide', () => {
  if (!persistTimer) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  if (auth?.token) saveBook(auth.token, store, { keepalive: true });
});

boot();
