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
  addEntryBullet,
  createEntryBullet,
  updateBullet,
  deleteBullet,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  answerQuestionFromEntry,
  parseRequirements,
  parseExperiences,
  searchEntries,
  suggestEntries,
  linkedEntries,
  bulletEntry,
  compileResumeText,
  compileResumeHtml,
  resumeTextToWordHtml,
  compilePrep,
  prepCoverage,
  listingSummary,
  starFill,
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
let expandedBulletKey = '';
let questionComposerKey = '';
const openQuestionIds = new Set();

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

function displayExperienceLine(text) {
  return String(text || '').replace(/^\s*[-*•–—●▪‣∙]\s+/, '').trim() || String(text || '').trim();
}

function fillRich(node, rich, plain) {
  node.replaceChildren();
  const spans = rich?.length ? rich : [{ text: plain || '', bold: false }];
  for (const span of spans) {
    const parts = String(span.text || '').split('\n');
    parts.forEach((part, index) => {
      if (part) {
        const text = document.createTextNode(part);
        if (span.bold) {
          const strong = document.createElement('strong');
          strong.append(text);
          node.append(strong);
        } else node.append(text);
      }
      if (index < parts.length - 1) node.append(document.createElement('br'));
    });
  }
  node.dataset.empty = node.textContent.trim() ? 'false' : 'true';
}

function readRich(node) {
  const spans = [];
  const push = (text, bold) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === bold) last.text += text;
    else spans.push({ text, bold });
  };
  const walk = (parent, bold) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === 3) {
        push(child.nodeValue.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n'), bold);
      } else if (child.nodeType === 1) {
        const tag = child.tagName;
        const weight = child.style?.fontWeight;
        const nextBold = bold || tag === 'B' || tag === 'STRONG' || weight === 'bold' || Number(weight) >= 600;
        if (tag === 'BR') push('\n', bold);
        else {
          if ((tag === 'DIV' || tag === 'P') && spans.length && !spans[spans.length - 1].text.endsWith('\n')) push('\n', false);
          walk(child, nextBold);
        }
      }
    }
  };
  walk(node, false);
  return spans;
}

function bindRichKeys(node, { onChange, onSubmit } = {}) {
  const changed = () => {
    node.dataset.empty = node.textContent.trim() ? 'false' : 'true';
    onChange?.(readRich(node));
  };
  node.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      document.execCommand('bold');
      changed();
      return;
    }
    if (onSubmit && event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      onSubmit(readRich(node));
    }
  });
  node.addEventListener('input', changed);
}

function richLine(attrs, { text, rich, onChange, onSubmit } = {}) {
  const node = el('div', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', ...attrs });
  fillRich(node, rich, text);
  bindRichKeys(node, { onChange, onSubmit });
  return node;
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
  const isJob = view.kind === 'jobs';
  const hasRecord = Boolean(view.id && view.id !== 'new');
  return el('header', { class: 'hero is-compact' }, [
    el('div', { class: 'hero-row' }, [
      el('div', { class: 'crumb' }, [
        hasRecord
          ? el('button', {
            type: 'button',
            class: 'context-back',
            onClick: () => go({ kind: view.kind }),
          }, `← ${isJob ? 'Job postings' : 'Experiences'}`)
          : null,
        el('strong', { class: 'page-title' }, viewTitle(view, store)),
      ]),
      el('div', { class: 'actions' }, [
        btn(isJob ? '+ New posting' : '+ Add experiences', {
          class: 'btn ghost compact-action',
          onClick: () => go(isJob ? { kind: 'jobs', id: 'new' } : { kind: 'log', id: 'new' }),
        }),
      ]),
    ]),
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
          ? `${summary.postings} on file. Paste another, or keep adding experiences, questions, and STAR answers.`
          : 'Paste the description. We pull the requirements. You add an experience, a resume bullet, and a question with a STAR answer.'),
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
          : 'Optional. Paste several experiences at once so a posting can reuse one on more than one requirement.'),
      ]),
    ]),
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
          el('p', {}, [job.company, cover.hints[0] || `${cover.withAnswer}/${cover.total || 0} answered`].filter(Boolean).join(' · ')),
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
        placeholder: 'Search experiences, roles, STAR…',
        value: query,
        'data-focus-key': 'book-search',
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
      : el('p', { class: 'empty' }, query ? 'Nothing in the book matches that.' : 'Paste several experiences, then link one from a requirement.'),
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
          el('div', { class: 'row-meta' }, [job.company, `${cover.withAnswer}/${cover.total || 0} answered`].filter(Boolean).join(' · ')),
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
      el('p', { class: 'lede' }, 'Dump a resume, a review doc, or notes. Each line becomes an experience a posting can link.'),
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
            setNote(`Added ${drafts.length} experience${drafts.length === 1 ? '' : 's'}. Link one from a posting next.`);
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
      el('h2', {}, isNew ? 'Add one experience' : 'Edit experience'),
      entry ? el('span', { class: `tag kind-${entry.kind}` }, kindLabel(entry.kind)) : null,
    ]),
    el('div', { class: 'panel-body' }, [
      field('Experience', el('input', { name: 'title', required: true, maxlength: '4000', value: draft.title, placeholder: 'Shipped the suitcase sync' })),
      el('div', { class: 'grid-2' }, [
        field('Kind', el('select', { name: 'kind' }, ENTRY_KINDS.map((kind) =>
          el('option', { value: kind, selected: draft.kind === kind || undefined }, kindLabel(kind))
        ))),
        field('Role', el('input', { name: 'role', value: draft.role || '', placeholder: 'Product engineer, Beep boop' })),
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
            if (!confirm('Remove this experience from the book? Requirements will drop the link.')) return;
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
    setNote('Paste the job description. Requirement lines become rows. Try Use sample.');
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
      if (count) {
        go({ kind: 'jobs', id: job.id });
        setNote(`Pulled ${count} requirement${count === 1 ? '' : 's'} into the table. Add an experience beside each one.`);
      } else {
        go({ kind: 'jobs', id: job.id });
        setNote('Saved the posting. Paste the job description to pull requirement rows.');
      }
    },
  });
  form.append(
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'Paste the job posting'),
      el('span', { class: 'tiny' }, 'Bullets become rows. We do not fetch the link yet.'),
    ]),
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'grid-3' }, [
        field('Role', el('input', { name: 'title', maxlength: '160', placeholder: 'Product engineer' })),
        field('Company', el('input', { name: 'company', maxlength: '160', placeholder: 'Beep boop' })),
        field('Posting link', el('input', { name: 'url', type: 'url', placeholder: 'https://…' })),
      ]),
      field('Job description',
        el('textarea', { name: 'sourceText', class: 'tall', placeholder: SAMPLE_JD })
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
  const chip = (value, total, label) => el('span', { class: 'progress-chip' }, [
    el('strong', {}, `${value}/${total || 0}`),
    ` ${label}`,
  ]);
  return el('div', { class: 'banner banner-progress' }, [
    el('p', { class: 'banner-hint' }, cover.hints[0] || `${cover.withAnswer}/${cover.total || 0} requirements have an answer`),
    el('div', { class: 'progress-chips' }, [
      chip(cover.withBullet, cover.total, 'resume bullets'),
      chip(cover.withQuestion, cover.total, 'questions'),
      chip(cover.withAnswer, cover.total, 'answers'),
    ]),
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
  const source = el('textarea', {
    class: 'tall',
    placeholder: SAMPLE_JD,
    'aria-label': 'Job description',
  });
  return el('div', { class: 'paste-more' }, [
    field('Job description', source),
    el('p', { class: 'tiny' }, 'Each requirement line becomes a row. The sample shows the shape.'),
    el('div', { class: 'actions' }, [
      btn('Use sample', {
        class: 'btn ghost',
        onClick: () => {
          source.value = SAMPLE_JD;
          source.focus();
        },
      }),
      btn('Pull requirements', {
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

function latestQuestion(jobId, reqId) {
  const job = store.postings.find((item) => item.id === jobId);
  const requirement = job?.requirements.find((item) => item.id === reqId);
  return requirement?.questions[requirement.questions.length - 1] || null;
}

function requirementQuestions(job, req) {
  const box = el('div', { class: 'requirement-questions' });
  if (req.questions.length) {
    box.append(el('div', { class: 'requirement-subhead' }, [
      el('span', {}, `Potential questions (${req.questions.length})`),
    ]));
  }
  for (const question of req.questions) {
    const answered = Boolean(question.answer || starFill(question).filled);
    const text = el('input', { value: question.text, placeholder: 'They might ask…', 'aria-label': 'Question' });
    const answer = el('textarea', {
      rows: '2',
      placeholder: 'Short answer, or fill STAR below.',
      'aria-label': 'Answer',
    }, question.answer);
    answer.value = question.answer;
    const fields = {
      situation: el('textarea', { rows: '2', placeholder: 'What was going on?', 'aria-label': 'Situation' }, question.situation),
      task: el('textarea', { rows: '2', placeholder: 'What were you responsible for?', 'aria-label': 'Task' }, question.task),
      action: el('textarea', { rows: '2', placeholder: 'What did you do?', 'aria-label': 'Action' }, question.action),
      result: el('textarea', { rows: '2', placeholder: 'What changed?', 'aria-label': 'Result' }, question.result),
    };
    const save = () => {
      if (!text.value.trim()) return;
      store = updateQuestion(store, job.id, req.id, question.id, {
        text: text.value,
        answer: answer.value,
        situation: fields.situation.value,
        task: fields.task.value,
        action: fields.action.value,
        result: fields.result.value,
      });
      saveStore();
    };
    [text, answer, ...Object.values(fields)].forEach((node) => node.addEventListener('input', save));
    const stories = linkedEntries(store, req);
    box.append(el('details', {
      class: 'table-question',
      open: openQuestionIds.has(question.id),
      onToggle: (event) => {
        if (event.target.open) openQuestionIds.add(question.id);
        else openQuestionIds.delete(question.id);
      },
    }, [
      el('summary', {}, [
        el('span', { class: 'table-question-text' }, question.text),
        el('span', { class: answered ? 'question-status is-answered' : 'question-status' }, answered ? 'Answered' : 'Needs answer'),
      ]),
      el('div', { class: 'table-question-body' }, [
        field('Question', text),
        field('Answer', answer),
        el('div', { class: 'table-question-star' }, [
          ['situation', 'Situation'],
          ['task', 'Task'],
          ['action', 'Action'],
          ['result', 'Result'],
        ].map(([key, label]) => field(label, fields[key]))),
        el('div', { class: 'actions' }, [
          stories.length
            ? btn('Use first experience', {
              class: 'btn ghost',
              onClick: () => {
                store = answerQuestionFromEntry(store, job.id, req.id, question.id, stories[0].id);
                saveStore();
                render();
                setNote('Used the experience as this answer.');
              },
            })
            : null,
          btn('Delete', {
            class: 'btn danger',
            onClick: () => {
              if (!confirm('Delete this potential question?')) return;
              store = deleteQuestion(store, job.id, req.id, question.id);
              saveStore();
              render();
            },
          }),
        ]),
      ]),
    ]));
  }
  const composerKey = `${job.id}:${req.id}`;
  if (questionComposerKey === composerKey) {
    const fresh = el('input', {
      class: 'question-add-input',
      placeholder: 'They might ask…',
      'aria-label': 'Potential question',
      'data-focus-key': `add-q-${req.id}`,
    });
    const add = () => {
      if (!fresh.value.trim()) return;
      store = addQuestion(store, job.id, req.id, fresh.value);
      const created = latestQuestion(job.id, req.id);
      if (created) openQuestionIds.add(created.id);
      saveStore();
      render({ focusKey: `add-q-${req.id}` });
      setNote('Question added under the requirement.');
    };
    fresh.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        questionComposerKey = '';
        render();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      add();
    });
    box.append(el('div', { class: 'question-add' }, [
      fresh,
      btn('+', { class: 'btn ghost', title: 'Add question', 'aria-label': 'Add question', onClick: add }),
    ]));
  }
  return box;
}

function experienceEditor(job, req, bullet) {
  const entry = bulletEntry(store, bullet);
  const detail = entry || bullet;
  const role = entry ? el('input', {
    value: entry.role || '',
    placeholder: 'Product engineer, Beep boop',
    'aria-label': 'Role',
  }) : null;
  const notes = el('textarea', {
    rows: '3',
    placeholder: 'Context, scope, metrics, links, or a longer description.',
    'aria-label': 'Description',
  }, detail.notes);
  notes.value = detail.notes;
  const fields = {
    situation: el('textarea', { rows: '2', placeholder: 'What was going on?', 'aria-label': 'Situation' }, detail.situation),
    task: el('textarea', { rows: '2', placeholder: 'What were you responsible for?', 'aria-label': 'Task' }, detail.task),
    action: el('textarea', { rows: '2', placeholder: 'What did you do?', 'aria-label': 'Action' }, detail.action),
    result: el('textarea', { rows: '2', placeholder: 'What changed? Add numbers when you can.', 'aria-label': 'Result' }, detail.result),
  };
  const save = () => {
    const patch = {
      notes: notes.value,
      situation: fields.situation.value,
      task: fields.task.value,
      action: fields.action.value,
      result: fields.result.value,
    };
    if (entry) store = updateEntry(store, entry.id, { ...patch, role: role.value });
    else if (!entry) store = updateBullet(store, job.id, req.id, bullet.id, patch);
    saveStore();
  };
  [notes, ...Object.values(fields), role].filter(Boolean).forEach((node) => {
    node.addEventListener('input', save);
  });
  return el('div', { class: 'experience-editor' }, [
    el('div', { class: 'experience-editor-head' }, [
      el('div', {}, [
        el('strong', {}, entry ? 'Shared experience' : 'Experience details'),
        el('p', { class: 'tiny' }, entry
          ? 'STAR and notes update everywhere this experience is used.'
          : 'This older experience is saved only on this requirement.'),
      ]),
      btn('Close', {
        class: 'btn ghost compact-action',
        onClick: () => { expandedBulletKey = ''; render(); },
      }),
    ]),
    entry ? field('Role', role) : null,
    field('Description', notes),
    el('div', { class: 'experience-star' }, [
      ['situation', 'Situation'],
      ['task', 'Task'],
      ['action', 'Action'],
      ['result', 'Result'],
    ].map(([key, label]) => field(label, fields[key]))),
    el('div', { class: 'actions experience-actions' }, [
      btn('Remove here', {
        class: 'btn ghost',
        onClick: () => {
          if (!confirm('Remove this experience from this requirement? It will stay in the Brag Book.')) return;
          store = deleteBullet(store, job.id, req.id, bullet.id);
          expandedBulletKey = '';
          saveStore();
          render();
        },
      }),
      entry
        ? btn('Delete from Brag Book', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this experience from the Brag Book and every requirement using it?')) return;
            store = deleteEntry(store, entry.id);
            expandedBulletKey = '';
            saveStore();
            render();
          },
        })
        : btn('Delete', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this experience?')) return;
            store = deleteBullet(store, job.id, req.id, bullet.id);
            expandedBulletKey = '';
            saveStore();
            render();
          },
        }),
    ]),
  ]);
}

function experienceAdder(job, req) {
  const wrap = el('div', { class: 'experience-add' });
  const fresh = richLine({
    class: 'experience-compose',
    'data-placeholder': 'Search experiences, or type a new one',
    'aria-label': 'Add an experience',
    'data-focus-key': `add-exp-${req.id}`,
  }, {
    onChange: () => {
      activeIndex = -1;
      showMatches();
    },
    onSubmit: (spans) => {
      if (activeIndex >= 0 && choices[activeIndex]) addExisting(choices[activeIndex]);
      else addNew(spans);
    },
  });
  const matches = el('div', { class: 'experience-matches', hidden: true, role: 'listbox' });
  const linked = new Set(req.bullets.map((bullet) => bullet.entryId).filter(Boolean));
  let choices = [];
  let activeIndex = -1;

  const addExisting = (entry) => {
    store = addEntryBullet(store, job.id, req.id, entry.id);
    saveStore();
    render({ focusKey: `add-exp-${req.id}` });
    setNote('Linked the existing experience.');
  };
  const plain = () => fresh.textContent.replace(/\u00a0/g, ' ').trim();
  const addNew = (spans = readRich(fresh)) => {
    const text = spans.map((span) => span.text).join('').trim();
    if (!text) return;
    const exact = store.entries.find((entry) =>
      entry.kind === 'experience'
      && entry.title.toLowerCase() === text.toLowerCase()
      && !linked.has(entry.id)
    );
    if (exact) {
      addExisting(exact);
      return;
    }
    store = createEntryBullet(store, job.id, req.id, text, undefined, spans);
    saveStore();
    render({ focusKey: `add-exp-${req.id}` });
    setNote('Added the experience here and to the Brag Book.');
  };
  const paintMatches = () => {
    matches.replaceChildren(...choices.map((entry, index) =>
      el('button', {
        type: 'button',
        class: `experience-match${index === activeIndex ? ' is-active' : ''}`,
        role: 'option',
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => addExisting(entry),
      }, [
        el('span', {}, entry.title),
        el('small', {}, [entry.role, entry.when, starFill(entry).ready ? 'STAR ready' : 'Add STAR'].filter(Boolean).join(' · ')),
      ])
    ));
    matches.hidden = !choices.length;
  };
  const showMatches = () => {
    const value = plain();
    const pool = value
      ? searchEntries(store, value)
      : (suggestEntries(store, req).length
        ? suggestEntries(store, req)
        : store.entries);
    choices = pool
      .filter((entry) => entry.kind === 'experience' && !linked.has(entry.id))
      .slice(0, 6);
    if (activeIndex >= choices.length) activeIndex = choices.length - 1;
    paintMatches();
  };
  fresh.addEventListener('focus', () => {
    activeIndex = -1;
    showMatches();
  });
  fresh.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && choices.length) {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, choices.length - 1);
      paintMatches();
      return;
    }
    if (event.key === 'ArrowUp' && choices.length) {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      paintMatches();
      return;
    }
    if (event.key === 'Escape') {
      matches.hidden = true;
      activeIndex = -1;
    }
  });
  wrap.append(
    el('div', { class: 'table-add' }, [
      fresh,
      btn('+ New', { class: 'btn ghost', onClick: addNew }),
    ]),
    matches,
  );
  return wrap;
}

function requirementTableRow(job, req) {
  const requirement = el('textarea', {
    class: 'table-req-text',
    rows: '1',
    'aria-label': 'Requirement',
    title: 'Edit requirement — saves when you leave the field',
    onChange: (event) => {
      const text = event.target.value.trim();
      if (!text || text === req.text) return;
      store = updateRequirement(store, job.id, req.id, { text });
      saveStore();
      setNote('Requirement saved.');
    },
  }, req.text);
  requirement.value = req.text;
  const composerKey = `${job.id}:${req.id}`;
  const bullets = el('div', { class: 'table-bullets' });
  for (const bullet of req.bullets) {
    const bulletKey = `${job.id}:${req.id}:${bullet.id}`;
    const isOpen = expandedBulletKey === bulletKey;
    const shown = displayExperienceLine(bullet.text);
    const line = richLine({
      class: 'bullet-copy is-marked',
      'aria-label': 'Experience',
    }, {
      text: shown,
      rich: shown === String(bullet.text || '').trim() ? bullet.rich : null,
      onChange: (spans) => {
        const text = spans.map((span) => span.text).join('');
        if (!text.trim()) return;
        store = updateBullet(store, job.id, req.id, bullet.id, { text, rich: spans });
        saveStore();
      },
    });
    bullets.append(el('div', { class: `bullet-link${isOpen ? ' is-open' : ''}` }, [
      line,
      btn(isOpen ? 'Close ↑' : 'Details ↓', {
        class: 'bullet-open',
        'aria-expanded': String(isOpen),
        onClick: () => {
          expandedBulletKey = isOpen ? '' : bulletKey;
          render();
        },
      }),
    ]));
    if (isOpen) bullets.append(experienceEditor(job, req, bullet));
  }
  bullets.append(experienceAdder(job, req));

  return el('tr', { class: 'job-table-row' }, [
    el('td', { class: 'requirement-cell', 'data-label': 'Requirement' }, [
      el('div', { class: 'requirement-line' }, [
        requirement,
        el('div', { class: 'row-icons' }, [
          btn('?', {
            class: 'icon-quiet',
            title: 'Add a question',
            'aria-label': 'Add a question',
            onClick: () => {
              const opening = questionComposerKey !== composerKey;
              questionComposerKey = opening ? composerKey : '';
              render(opening ? { focusKey: `add-q-${req.id}` } : undefined);
            },
          }),
          btn('×', {
            class: 'icon-quiet is-danger',
            title: 'Delete requirement',
            'aria-label': 'Delete requirement',
            onClick: () => {
              if (!confirm('Delete this requirement and its questions? Experiences stay in the Brag Book.')) return;
              store = deleteRequirement(store, job.id, req.id);
              saveStore();
              render();
            },
          }),
        ]),
      ]),
      req.questions.length || questionComposerKey === composerKey
        ? requirementQuestions(job, req)
        : null,
    ]),
    el('td', { class: 'bullets-cell', 'data-label': 'Experiences' }, [
      el('div', { class: 'bullets-stack' }, [bullets]),
    ]),
  ]);
}

function requirementTable(job) {
  const table = el('table', { class: 'job-table' });
  table.append(el('thead', {}, [
    el('tr', {}, [
      el('th', {}, 'Job requirement'),
      el('th', {}, 'Experiences'),
    ]),
  ]));
  const body = el('tbody');
  for (const req of job.requirements) {
    body.append(requirementTableRow(job, req));
  }
  table.append(body);
  return el('div', { class: 'job-table-wrap' }, [table]);
}

function jobDetailsDisclosure(job) {
  return el('details', { class: 'utility-box' }, [
    el('summary', {}, 'Job details'),
    el('div', { class: 'utility-body' }, [
      jobMeta(job),
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
    ]),
  ]);
}

function pasteMoreDisclosure(job) {
  return el('details', { class: 'utility-box' }, [
    el('summary', {}, '+ Paste more requirements'),
    el('div', { class: 'utility-body' }, [pasteMore(job)]),
  ]);
}

function jobDetail(job) {
  const wrap = el('section', { class: 'panel job-workspace' });
  wrap.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, job.title),
        el('p', { class: 'tiny' }, [job.company, hostFromJobUrl(job.url), job.status].filter(Boolean).join(' · ')),
      ]),
      el('div', { class: 'actions' }, [
        btn('Prep', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'prep' }) }),
        btn('Resume', { class: 'btn', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'resume' }) }),
      ]),
    ]),
    el('div', { class: 'workspace-status' }, [coverageBanner(job)]),
    job.requirements.length
      ? requirementTable(job)
      : el('div', { class: 'panel-body empty-posting' }, [
        el('p', { class: 'empty' }, 'Paste the job description. Each requirement becomes a row, then add an experience beside it.'),
        pasteMore(job),
      ]),
    el('div', { class: 'workspace-utilities' }, [
      job.requirements.length ? pasteMoreDisclosure(job) : null,
      jobDetailsDisclosure(job),
    ])
  );
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
    card.bulletDetails.some((bullet) => bullet.script || bullet.notes) ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Experience details'),
      ...card.bulletDetails
        .filter((bullet) => bullet.script || bullet.notes)
        .map((bullet) => el('div', { class: 'story' }, [
          el('div', { class: 'row-title' }, bullet.text),
          el('pre', { class: 'tiny' }, bullet.script || bullet.notes),
        ])),
    ]) : null,
    card.stories.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Linked experiences'),
      ...card.stories.map((story) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, story.title),
        el('pre', { class: 'tiny' }, story.script || story.notes || 'Open the book and fill STAR.'),
      ])),
    ]) : null,
    card.bullets.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Resume bullet'),
      ...card.bullets.map((text) => el('p', {}, `• ${text}`)),
    ]) : null,
    el('div', { class: 'actions' }, [
      btn('Edit in the table', {
        class: 'btn ghost',
        onClick: () => go({ kind: 'jobs', id: job.id }),
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
  const area = el('textarea', { class: 'resume', 'aria-label': 'Resume preview' });
  let generated = compileResumeText(job, store) || 'Add a resume bullet on a requirement first.';
  let custom = Boolean(job.resumeText);
  area.value = custom ? job.resumeText : generated;
  const currentText = () => area.value;
  const refreshGenerated = () => {
    generated = compileResumeText(job, store) || 'Add a resume bullet on a requirement first.';
    if (!custom) area.value = generated;
  };
  const stamp = (key, value) => {
    store = updateProfile(store, { [key]: value });
    saveStore();
    refreshGenerated();
  };
  area.addEventListener('input', () => {
    custom = area.value !== generated;
    store = updatePosting(store, job.id, { resumeText: custom ? area.value : '' });
    saveStore();
  });
  const wordHtml = () => resumeTextToWordHtml(currentText(), job.title || 'Resume');
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', {}, 'Resume'),
      el('div', { class: 'actions' }, [
        btn('Copy', { class: 'btn', onClick: () => copyText(currentText(), 'Copied the resume.') }),
        btn('Download .txt', {
          class: 'btn ghost',
          onClick: () => {
            downloadText(`${job.title || 'resume'}.txt`, currentText());
            setNote('Downloaded a text resume.');
          },
        }),
        btn('Download Word', {
          class: 'btn ghost',
          onClick: () => {
            downloadText(`${job.title || 'resume'}.doc`, wordHtml(), 'application/msword');
            setNote('Downloaded a Word resume.');
          },
        }),
        btn('Print / PDF', {
          class: 'btn ghost',
          onClick: () => {
            const html = wordHtml();
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
        btn('Rebuild', {
          class: 'btn ghost',
          onClick: () => {
            custom = false;
            store = updatePosting(store, job.id, { resumeText: '' });
            saveStore();
            refreshGenerated();
            setNote('Rebuilt the resume from experiences.');
          },
        }),
        btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id }) }),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      el('p', { class: 'lede' }, 'Grouped by role, with each experience listed once. Edits in the preview are what Copy and Download use. Rebuild starts again from the posting.'),
      el('div', { class: 'grid-2' }, [
        field('Name', el('input', { value: profile.name, placeholder: 'Your name', 'aria-label': 'Name', onInput: (event) => stamp('name', event.target.value) })),
        field('Email', el('input', { value: profile.email, placeholder: 'you@example.com', 'aria-label': 'Email', onInput: (event) => stamp('email', event.target.value) })),
      ]),
      el('div', { class: 'grid-2' }, [
        field('Location', el('input', { value: profile.location, placeholder: 'New York, NY', 'aria-label': 'Location', onInput: (event) => stamp('location', event.target.value) })),
        field('Skills', el('input', { value: profile.skills, placeholder: 'javascript, postgres', 'aria-label': 'Skills', onInput: (event) => stamp('skills', event.target.value) })),
      ]),
      field('Summary', el('textarea', { 'aria-label': 'Summary', onInput: (event) => stamp('summary', event.target.value) }, profile.summary)),
      field('Preview', area),
    ]),
  ]);
}

function emptyDetail(kind) {
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-body empty' },
      kind === 'jobs'
        ? 'Paste a job posting. That is the first click — requirements, then experiences, then questions + STAR.'
        : 'Paste several experiences, or pick one to fill STAR.'
    ),
  ]);
}

function captureFocus() {
  const active = document.activeElement;
  if (!active?.dataset?.focusKey) return null;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return { key: active.dataset.focusKey, start: active.selectionStart, end: active.selectionEnd };
  }
  if (active.isContentEditable) return { key: active.dataset.focusKey, editable: true };
  return null;
}

function restoreFocus(captured, focusKey) {
  const key = focusKey || captured?.key;
  if (!key) return;
  const node = root.querySelector(`[data-focus-key="${key.replace(/"/g, '')}"]`);
  if (!node) return;
  node.focus();
  if (focusKey || typeof captured?.start !== 'number' || !node.setSelectionRange) return;
  const max = node.value.length;
  node.setSelectionRange(Math.min(captured.start, max), Math.min(captured.end, max));
}

function render(options = {}) {
  const captured = options.focusKey ? null : captureFocus();
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
  } else if (view.kind === 'jobs' && view.id && view.mode === 'bullet') {
    const job = store.postings.find((item) => item.id === view.id);
    if (job) {
      expandedBulletKey = `${job.id}:${view.reqId}:${view.bulletId}`;
      detail = jobDetail(job);
    } else {
      detail = emptyDetail('jobs');
    }
  } else if (view.kind === 'jobs' && view.id) {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? jobDetail(job) : emptyDetail('jobs');
  } else detail = emptyDetail('jobs');

  const hideRail = (view.kind === 'jobs' && (Boolean(view.id) || !store.postings.length))
    || (view.kind === 'log' && (view.id === 'new' || !store.entries.length));
  const next = el('div', {}, [
    toolbar(view),
    el('div', { class: hideRail ? 'layout is-wide' : 'layout' }, [
      hideRail ? null : (view.kind === 'jobs' ? jobList(view.id) : entryList(view.id)),
      detail,
    ]),
  ]);
  root.replaceChildren(next);
  restoreFocus(captured, options.focusKey);
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
    copy: 'Sign in with the same account as Packing Cubes. Compare requirements and experiences in one table, then open an experience for STAR and questions.',
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
});

window.addEventListener('pagehide', () => {
  if (!persistTimer) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  if (auth?.token) saveBook(auth.token, store, { keepalive: true });
});

boot();
