import {
  STORE_KEY,
  ENTRY_KINDS,
  POSTING_STATUSES,
  emptyStore,
  normalizeStore,
  addEntry,
  updateEntry,
  deleteEntry,
  addPosting,
  updatePosting,
  deletePosting,
  addRequirement,
  addRequirements,
  updateRequirement,
  deleteRequirement,
  addBullet,
  updateBullet,
  deleteBullet,
  addQuestion,
  updateQuestion,
  deleteQuestion,
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
} from './engine.js';
import { parseViewHash, viewHash, viewTitle } from './routes.js';

const root = document.getElementById('app');
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json';
fileInput.hidden = true;
document.body.appendChild(fileInput);

let store = loadStore();
let query = '';
let kindFilter = 'all';
let statusNote = '';

function loadStore() {
  try {
    return normalizeStore(JSON.parse(localStorage.getItem(STORE_KEY) || 'null'));
  } catch {
    return emptyStore();
  }
}

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
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
      go({ kind: 'log' });
      setNote('Imported the book.');
    } catch {
      setNote('That file was not a Brag Book JSON.');
    }
  };
  reader.readAsText(file);
}

function toolbar(view) {
  const summary = listingSummary(store);
  return el('header', { class: 'hero' }, [
    el('p', { class: 'kicker' }, 'Win log · job postings · STAR cue cards'),
    el('div', { class: 'hero-row' }, [
      el('div', {}, [
        el('h1', {}, viewTitle(view, store)),
        el('p', { class: 'lede' },
          view.kind === 'jobs'
            ? 'Paste a posting, map each requirement to a resume bullet, a story from the book, and a question you might get.'
            : 'Collect wins while you work. Later, pin them to a job when you are writing a resume or prepping an interview.'
        ),
      ]),
      el('div', { class: 'actions' }, [
        btn(view.kind === 'jobs' ? 'New posting' : 'New win', {
          class: 'btn',
          onClick: () => go(view.kind === 'jobs' ? { kind: 'jobs', id: 'new' } : { kind: 'log', id: 'new' }),
        }),
        btn('Export', { class: 'btn ghost', onClick: exportStore }),
        btn('Import', { class: 'btn ghost', onClick: () => fileInput.click() }),
      ]),
    ]),
    el('div', { class: 'counts' }, [
      chip(summary.entries, 'in the book'),
      chip(summary.stories, 'experiences'),
      chip(summary.projects, 'projects'),
      chip(summary.skillsets, 'skillsets'),
      chip(summary.postings, 'jobs'),
    ]),
    statusNote ? el('p', { class: 'status', id: 'status-note' }, statusNote) : el('p', { class: 'status', id: 'status-note' }, ''),
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
          el('div', { class: 'row-meta' }, [job.company, job.status, `${cover.ready}/${cover.total || 0} ready`].filter(Boolean).join(' · ')),
        ]);
      }))
      : el('p', { class: 'empty' }, 'No postings yet. Paste a job and the requirements become cue cards.'),
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

function jobForm() {
  const form = el('form', {
    class: 'panel',
    onSubmit: (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const lines = parseRequirements(data.sourceText);
      store = addPosting(store, data);
      const job = store.postings[0];
      store = addRequirements(store, job.id, lines);
      saveStore();
      go({ kind: 'jobs', id: job.id });
      setNote(lines.length ? `Pulled ${lines.length} requirement${lines.length === 1 ? '' : 's'} from the posting.` : 'Saved the posting. Add requirements by hand.');
    },
  });
  form.append(
    el('div', { class: 'panel-head' }, [el('h2', {}, 'New posting')]),
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'grid-2' }, [
        field('Role', el('input', { name: 'title', required: true, maxlength: '160', placeholder: 'Product engineer' })),
        field('Company', el('input', { name: 'company', maxlength: '160', placeholder: 'Beep boop' })),
      ]),
      field('Posting URL', el('input', { name: 'url', type: 'url', placeholder: 'https://' })),
      field('Paste the posting — bullets become requirement cards',
        el('textarea', { name: 'sourceText', class: 'tall', placeholder: 'Requirements:\n- Ship production Javascript…\n- Comfortable with Postgres' })
      ),
      el('div', { class: 'actions' }, [
        el('button', { type: 'submit', class: 'btn' }, 'Create posting'),
        btn('Cancel', { class: 'btn ghost', onClick: () => go({ kind: 'jobs' }) }),
      ]),
    ])
  );
  return form;
}

function jobDetail(job) {
  const cover = prepCoverage(store, job);
  const wrap = el('section', { class: 'panel' });
  const source = el('textarea', { class: 'tall', placeholder: 'One requirement per line, or paste more bullets' });
  wrap.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, job.title),
        el('p', { class: 'tiny' }, [job.company, job.status].filter(Boolean).join(' · ')),
      ]),
      el('div', { class: 'actions' }, [
        btn('Prep', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'prep' }) }),
        btn('Resume', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id, mode: 'resume' }) }),
      ]),
    ]),
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'banner' },
        `${cover.withBullet} bullets · ${cover.withStory} stories · ${cover.withQuestion} question sets · ${cover.ready}/${cover.total || 0} marked ready`
      ),
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
        field('URL', el('input', {
          type: 'url',
          value: job.url,
          onChange: (event) => { store = updatePosting(store, job.id, { url: event.target.value }); saveStore(); },
        })),
        field('Status', el('select', {
          onChange: (event) => { store = updatePosting(store, job.id, { status: event.target.value }); saveStore(); render(); },
        }, POSTING_STATUSES.map((status) =>
          el('option', { value: status, selected: job.status === status || undefined }, status)
        ))),
      ]),
      ...job.requirements.map((req) => requirementCard(job, req)),
      el('h3', { class: 'subhead' }, 'Add requirements'),
      source,
      el('div', { class: 'actions' }, [
        btn('Add from paste', {
          class: 'btn',
          onClick: () => {
            const lines = parseRequirements(source.value);
            if (!lines.length && source.value.trim()) lines.push(source.value.trim());
            store = addRequirements(store, job.id, lines);
            saveStore();
            render();
          },
        }),
        btn('Delete posting', {
          class: 'btn danger',
          onClick: () => {
            if (!confirm('Delete this posting and its cue cards? The book stays.')) return;
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
  const box = el('div');
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
  box.append(el('div', { class: 'line-row' }, [
    fresh,
    btn('Add', { class: 'btn ghost', onClick: () => { onAdd(fresh.value); fresh.value = ''; } }),
  ]));
  return box;
}

function requirementCard(job, req) {
  const stories = linkedEntries(store, req);
  const suggested = suggestEntries(store, req);
  const card = el('article', { class: `req${req.ready ? ' is-ready' : ''}` });
  const picker = el('select', {}, [
    el('option', { value: '' }, 'Pin a win from the book…'),
    ...store.entries
      .filter((entry) => !req.entryIds.includes(entry.id))
      .map((entry) => el('option', { value: entry.id }, `${entry.title} (${kindLabel(entry.kind)})`)),
  ]);
  card.append(
    el('div', { class: 'req-head' }, [
      el('p', {}, req.text),
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
    lineEditor(req.bullets, {
      placeholder: 'Wrote a multiplexed API so the Hobby plan stayed under 12 functions.',
      onAdd: (text) => { store = addBullet(store, job.id, req.id, text); saveStore(); render(); },
      onEdit: (id, text) => { store = updateBullet(store, job.id, req.id, id, text); saveStore(); render(); },
      onDelete: (id) => { store = deleteBullet(store, job.id, req.id, id); saveStore(); render(); },
    }),
    el('p', { class: 'subhead' }, 'Stories from the book'),
    stories.length
      ? el('div', {}, stories.map((entry) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, entry.title),
        el('div', { class: 'tiny' }, starScript(entry) || entry.notes || 'No STAR yet — open it in the book.'),
        el('div', { class: 'actions' }, [
          btn('Open', { class: 'btn ghost', onClick: () => go({ kind: 'log', id: entry.id }) }),
          btn('Unpin', { class: 'btn ghost', onClick: () => { store = unlinkEntry(store, job.id, req.id, entry.id); saveStore(); render(); } }),
        ]),
      ])))
      : el('p', { class: 'tiny' }, 'Nothing pinned yet. Add wins on the brag sheet, then attach them here.'),
    picker,
    suggested.length
      ? el('div', { class: 'tags' }, suggested.map((entry) => el('button', {
        type: 'button',
        class: 'tag kind-experience',
        onClick: () => { store = linkEntry(store, job.id, req.id, entry.id); saveStore(); render(); },
      }, `+ ${entry.title}`)))
      : null,
    el('p', { class: 'subhead' }, 'Potential questions'),
    lineEditor(req.questions, {
      placeholder: 'Tell me about a time you shipped without a build pipeline.',
      onAdd: (text) => { store = addQuestion(store, job.id, req.id, text); saveStore(); render(); },
      onEdit: (id, text) => { store = updateQuestion(store, job.id, req.id, id, text); saveStore(); render(); },
      onDelete: (id) => { store = deleteQuestion(store, job.id, req.id, id); saveStore(); render(); },
    }),
    el('div', { class: 'actions' }, [
      btn('Remove requirement', {
        class: 'btn danger',
        onClick: () => {
          store = deleteRequirement(store, job.id, req.id);
          saveStore();
          render();
        },
      }),
    ])
  );
  picker.addEventListener('change', () => {
    if (!picker.value) return;
    store = linkEntry(store, job.id, req.id, picker.value);
    saveStore();
    render();
  });
  return card;
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
    card.bullets.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'Say it as a resume line'),
      ...card.bullets.map((text) => el('p', {}, `• ${text}`)),
    ]) : null,
    card.stories.length ? el('div', {}, [
      el('p', { class: 'subhead' }, 'STAR stories'),
      ...card.stories.map((story) => el('div', { class: 'story' }, [
        el('div', { class: 'row-title' }, story.title),
        el('pre', { class: 'tiny' }, story.script || story.notes || 'Open the book and fill STAR.'),
      ])),
    ]) : el('p', { class: 'tiny' }, 'No story pinned. Jump back and attach one from the book.'),
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
  const text = compileResumeText(job) || 'Add resume bullets on the posting first.';
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
      el('p', { class: 'lede' }, 'One block per requirement. Edit the bullets on the posting — this page is just the clean copy.'),
      area,
    ]),
  ]);
}

function emptyDetail(kind) {
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-body empty' },
      kind === 'jobs'
        ? 'Pick a posting, or start one from a pasted job description.'
        : 'Pick a win, or add whatever you just did — ship, story, or skill.'
    ),
  ]);
}

function render() {
  const view = currentView();
  document.title = `${viewTitle(view, store)} — Brag Book`;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-on', link.getAttribute('data-nav') === view.kind);
  });

  let detail;
  if (view.kind === 'log' && view.id === 'new') detail = entryForm(null);
  else if (view.kind === 'log' && view.id) {
    const entry = store.entries.find((item) => item.id === view.id);
    detail = entry ? entryForm(entry) : emptyDetail('log');
  } else if (view.kind === 'log') detail = emptyDetail('log');
  else if (view.kind === 'jobs' && view.id === 'new') detail = jobForm();
  else if (view.kind === 'jobs' && view.id && view.mode === 'prep') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? prepView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id && view.mode === 'resume') {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? resumeView(job) : emptyDetail('jobs');
  } else if (view.kind === 'jobs' && view.id) {
    const job = store.postings.find((item) => item.id === view.id);
    detail = job ? jobDetail(job) : emptyDetail('jobs');
  } else detail = emptyDetail('jobs');

  const next = el('div', {}, [
    toolbar(view),
    el('div', { class: 'layout' }, [
      view.kind === 'jobs' ? jobList(view.id) : entryList(view.id),
      detail,
    ]),
  ]);
  root.replaceChildren(next);
}

fileInput.addEventListener('change', () => {
  importStore(fileInput.files?.[0]);
  fileInput.value = '';
});

window.addEventListener('hashchange', render);
if (!location.hash) location.hash = '#log';
else render();
