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
  cleanPastedText,
  searchEntries,
  suggestEntries,
  linkedEntries,
  bulletEntry,
  compileResumeText,
  resumeTextToWordHtml,
  compileResumeDoc,
  applyImportedResume,
  updatePostingResume,
  replacePostingResume,
  updateCareerJob,
  moveCareerJob,
  addCareerJob,
  deleteCareerJob,
  addCareerGroup,
  deleteCareerGroup,
  addCareerBullet,
  deleteCareerBullet,
  moveCareerBullet,
  moveCareerGroup,
  addResumeGroup,
  moveResumeGroup,
  addPostingLocalJob,
  updatePostingLocalJob,
  deletePostingLocalJob,
  addPostingLocalGroup,
  deletePostingLocalGroup,
  addPostingLocalBullet,
  updatePostingLocalBullet,
  deletePostingLocalBullet,
  movePostingLocalBullet,
  movePostingLocalGroup,
  movePostingJob,
  addPostingLocalEducation,
  updatePostingLocalEducation,
  deletePostingLocalEducation,
  addPostingLocalCredential,
  updatePostingLocalCredential,
  deletePostingLocalCredential,
  addPostingLocalAdditional,
  updatePostingLocalAdditional,
  deletePostingLocalAdditional,
  startPostingResumeFresh,
  resetPostingResumeToBasics,
  choosePostingResumeMode,
  localJobById,
  updateResumeSettings,
  updateEducationItem,
  addEducationItem,
  deleteEducationItem,
  moveEducationItem,
  updateCredentialItem,
  addCredentialItem,
  deleteCredentialItem,
  moveCredentialItem,
  updateAdditionalRow,
  addAdditionalRow,
  deleteAdditionalRow,
  moveAdditionalRow,
  moveAdditionalGroup,
  addAdditionalGroup,
  updateAdditionalGroup,
  deleteAdditionalGroup,
  isResumeDoc,
  visibleResumeDoc,
  moveKey,
  toggleId,
  writeBulletBackToSource,
  clearBulletOverride,
  adoptCompiledJob,
  bulletLineText,
  bulletFromLine,
  markdownToSpans,
  spansToMarkdown,
  DEFAULT_SECTION_ORDER,
  compilePrep,
  prepCoverage,
  listingSummary,
  starFill,
  bookIsEmpty,
  asUrl,
  titleFromJobUrl,
  hostFromJobUrl,
  updateProfile,
  normalizeBookRevision,
  shouldPullRemoteBook,
  roleIsCollapsed,
  toggleRoleCollapsed,
  resumeRoleSummary,
  isRoleHeaderToggleTarget,
} from './engine.js';
import { renderResumeHtml, resumeDocument } from './resume-template.js';
import { fitOnePage, dropOrderFromDoc, applyDroppedIds, PAGE_HEIGHT_PX } from './resume-fit.js';
import { resumeDocxBlob } from './resume-docx.js';
import { parseViewHash, viewHash, viewTitle, logLayout } from './routes.js';
import { loadBook, saveBook } from './store.js';
import { initAuth, refreshToken, renderBragSignIn, wireAuthLink } from './auth.js';

const root = document.getElementById('app');
const localMode = new URLSearchParams(location.search).has('local');
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json';
fileInput.hidden = true;
document.body.appendChild(fileInput);
const resumeFileInput = document.createElement('input');
resumeFileInput.type = 'file';
resumeFileInput.accept = 'application/json';
resumeFileInput.hidden = true;
document.body.appendChild(resumeFileInput);

let store = emptyStore();
let auth = null;
let unlocked = false;
let persistTimer = null;
let bookRevision = null;
let bookDirty = false;
let bookPushing = false;
let query = '';
let kindFilter = 'all';
let statusNote = '';
let expandedBulletKey = '';
let collapsedResumeRoles = [];
let questionComposerKey = '';
const openQuestionIds = new Set();
let resumeFit = { fits: true, fontPt: 10, bulletLineHeight: 1.32, droppedBulletIds: [], overflowPx: 0, vars: {} };
let resumePreviewTimer = null;

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

function rememberServerBook(data) {
  bookRevision = normalizeBookRevision(data?.updatedAt);
  bookDirty = false;
}

function saveStore() {
  cacheStore();
  bookDirty = true;
  if (localMode || !auth?.token) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    pushStore();
  }, 500);
}

async function adoptServerBook(data, note) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  store = normalizeStore(data.book);
  rememberServerBook(data);
  cacheStore();
  render();
  if (note) setNote(note);
}

async function pushStore({ keepalive = false } = {}) {
  if (localMode || !auth?.token) return;
  bookPushing = true;
  try {
    const data = await saveBook(auth.token, store, { keepalive, updatedAt: bookRevision });
    rememberServerBook(data);
    setNote('Saved to your account.');
  } catch (err) {
    if (err.status === 409) {
      try {
        const latest = await loadBook(auth.token);
        await adoptServerBook(
          latest,
          'This book was saved in another tab or browser. Reloaded the latest copy — the edit from this tab was not saved.'
        );
      } catch {
        if (err.book) {
          await adoptServerBook(
            { book: err.book, updatedAt: err.updatedAt },
            'This book was saved in another tab or browser. Reloaded the latest copy — the edit from this tab was not saved.'
          );
        } else {
          setNote(err.message || 'Could not save to your account.');
        }
      }
      return;
    }
    setNote(err.message || 'Could not save to your account.');
  } finally {
    bookPushing = false;
  }
}

async function pullBookIfClean() {
  if (localMode || !auth?.token || !unlocked) return;
  const visible = !document.visibilityState || document.visibilityState === 'visible';
  if (!shouldPullRemoteBook({
    dirty: bookDirty,
    persistPending: persistTimer != null,
    pushing: bookPushing,
    visible,
  })) return;
  try {
    const data = await loadBook(auth.token);
    if (!shouldPullRemoteBook({
      dirty: bookDirty,
      persistPending: persistTimer != null,
      pushing: bookPushing,
      visible: !document.visibilityState || document.visibilityState === 'visible',
    })) return;
    if (data.created) return;
    const remoteRev = normalizeBookRevision(data.updatedAt);
    if (remoteRev && remoteRev === bookRevision) return;
    if (!remoteRev && bookRevision == null) return;
    await adoptServerBook(data, 'Loaded a newer copy saved elsewhere.');
  } catch {
    /* keep the local copy if the cloud is unavailable */
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

function trimEditableTail(node) {
  const sel = document.getSelection();
  const caretInside = (el) => sel && node.contains(sel.anchorNode) && (el === sel.anchorNode || el.contains(sel.anchorNode));
  let child = node.lastChild;
  while (child) {
    const prev = child.previousSibling;
    const tag = child.nodeType === 1 ? child.tagName : '';
    const emptyBlock = tag === 'BR' || ((tag === 'DIV' || tag === 'P') && !child.textContent.replace(/\u00a0/g, '').trim());
    if (!emptyBlock || caretInside(child)) break;
    child.remove();
    child = prev;
  }
}

function caretOffset(node) {
  const sel = document.getSelection();
  if (!sel?.rangeCount || !node.contains(sel.anchorNode)) return (node.textContent || '').length;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(node);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function setCaretOffset(node, offset) {
  const sel = document.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let left = Math.max(0, offset);
  let last = null;
  while (walker.nextNode()) {
    last = walker.currentNode;
    if (left <= last.nodeValue.length) {
      range.setStart(last, left);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    left -= last.nodeValue.length;
  }
  if (last) {
    range.setStart(last, last.nodeValue.length);
  } else {
    range.selectNodeContents(node);
  }
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function editableNeedsFlatten(node) {
  return [...node.childNodes].some((child) => {
    if (child.nodeType !== 1) return false;
    const tag = child.tagName;
    return tag !== 'BR' && tag !== 'STRONG' && tag !== 'B';
  });
}

function insertPlainText(text) {
  if (document.execCommand('insertText', false, text)) return;
  const sel = document.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function tidySpans(spans) {
  const out = [];
  const push = (text, bold) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.bold === bold) last.text += text;
    else out.push({ text, bold });
  };
  let broke = false;
  for (const span of spans) {
    for (const bit of String(span.text || '').split(/(\n+)/)) {
      if (!bit) continue;
      if (/^\n+$/.test(bit)) {
        if (out.length) broke = true;
        continue;
      }
      if (broke) {
        push('\n', false);
        broke = false;
      }
      push(bit.replace(/[ \t]{2,}/g, ' '), Boolean(span.bold));
    }
  }
  while (out.length && /\n$/.test(out[out.length - 1].text)) {
    out[out.length - 1].text = out[out.length - 1].text.replace(/\n+$/, '');
    if (!out[out.length - 1].text) out.pop();
  }
  if (out[0]) out[0].text = out[0].text.replace(/^[ \t]*[-*•–—●▪‣∙][ \t]+/, '');
  return out.filter((span) => span.text);
}

function flattenEditable(node, offset) {
  const spans = tidySpans(readRich(node));
  const plain = spans.map((span) => span.text).join('');
  fillRich(node, spans.length ? spans : null, plain);
  setCaretOffset(node, offset ?? plain.length);
}

function bindRichKeys(node, { onChange, onSubmit } = {}) {
  const changed = () => {
    trimEditableTail(node);
    node.dataset.empty = node.textContent.trim() ? 'false' : 'true';
    onChange?.(readRich(node));
  };
  node.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = cleanPastedText(event.clipboardData?.getData('text/plain') || '');
    if (!text) return;
    const start = caretOffset(node);
    insertPlainText(text);
    if (editableNeedsFlatten(node)) flattenEditable(node, start + text.length);
    changed();
  });
  node.addEventListener('focus', () => {
    if (!editableNeedsFlatten(node)) return;
    flattenEditable(node, caretOffset(node));
    changed();
  });
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
      const data = JSON.parse(String(reader.result || ''));
      const looksLikeBook = Array.isArray(data?.entries) || Array.isArray(data?.postings);
      if (isResumeDoc(data) && !looksLikeBook) {
        applyResumeImport(data);
        return;
      }
      store = normalizeStore(data);
      saveStore();
      go({ kind: 'home' });
      setNote('Imported the book.');
    } catch {
      setNote('That file was not a Brag Book JSON.');
    }
  };
  reader.readAsText(file);
}

function applyResumeImport(data) {
  store = applyImportedResume(store, data);
  saveStore();
  const posting = store.postings[0];
  if (posting) go({ kind: 'jobs', id: posting.id, mode: 'resume' });
  else go({ kind: 'profile' });
  setNote('Imported the resume. It is saved on this account. Open Resume on a posting to tailor a one-page copy.');
}

function importResumeFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      if (!isResumeDoc(data)) {
        setNote('That file is not a resume JSON. Use the classic-serif schema (see brag-book/data/inaayat-gill-resume.json).');
        return;
      }
      applyResumeImport(data);
    } catch {
      setNote('That file was not valid resume JSON.');
    }
  };
  reader.readAsText(file);
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  if (view.kind === 'profile') {
    return el('header', { class: 'hero is-compact' }, [
      el('div', { class: 'hero-row' }, [
        el('div', { class: 'crumb' }, [
          el('button', {
            type: 'button',
            class: 'context-back',
            onClick: () => go({ kind: 'home' }),
          }, '← Start'),
          el('strong', { class: 'page-title' }, 'Resume basics'),
        ]),
        el('div', { class: 'actions' }, [
          btn('Import resume (JSON)', {
            class: 'btn ghost compact-action',
            onClick: () => resumeFileInput.click(),
          }),
        ]),
      ]),
      statusNote ? el('p', { class: 'status', id: 'status-note' }, statusNote) : el('p', { class: 'status', id: 'status-note' }, ''),
    ]);
  }
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
        class: 'start-card',
        onClick: () => go({ kind: 'profile' }),
      }, [
        el('span', { class: 'kicker' }, 'One page'),
        el('strong', {}, 'Resume basics'),
        el('p', {}, store.jobs.length
          ? `${store.jobs.length} role${store.jobs.length === 1 ? '' : 's'} on the classic-serif resume. Import JSON or open a posting to tailor a copy.`
          : 'Import a resume JSON, or fill jobs, credentials, and education, then open a posting to export a one-page PDF.'),
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
      btn('Import book', { class: 'btn ghost', onClick: () => fileInput.click() }),
      btn('Import resume (JSON)', { class: 'btn ghost', onClick: () => resumeFileInput.click() }),
    ]),
  ]);
}

function chip(n, label) {
  return el('span', { class: 'chip' }, [el('strong', {}, String(n)), ` ${label}`]);
}

function entryList(selectedId, { variant = 'rail' } = {}) {
  const rows = searchEntries(store, query).filter((entry) => kindFilter === 'all' || entry.kind === kindFilter);
  const isMain = variant === 'main';
  return el(isMain ? 'section' : 'aside', { class: isMain ? 'panel bb-book-catalog' : 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'The book'),
        isMain ? el('p', { class: 'tiny' }, 'Every pasted win. Open one to fill STAR.') : null,
      ]),
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
      ? el('div', { class: isMain ? 'list bb-book-list' : 'list' }, rows.map((entry) =>
        el('button', {
          type: 'button',
          class: `row${isMain ? ' bb-book-row' : ''}${selectedId === entry.id ? ' is-on' : ''}`,
          onClick: () => go({ kind: 'log', id: entry.id }),
        }, [
          el('div', { class: 'row-title' }, displayExperienceLine(entry.title)),
          el('div', { class: 'row-meta' }, [
            kindLabel(entry.kind),
            entry.when,
            entry.role,
            starFill(entry).ready ? 'STAR ready' : 'STAR open',
          ].filter(Boolean).join(' · ')),
        ])
      ))
      : el('p', { class: 'empty' }, query
        ? 'Nothing in the book matches that.'
        : 'Nothing in the book yet. Use + Add experiences to paste several at once.'),
  ]);
}

function bulkEntryForm({ compact = false } = {}) {
  const paste = el('textarea', {
    class: compact ? 'bb-add-paste' : 'tall',
    rows: compact ? '7' : undefined,
    placeholder: 'One experience per line, or a STAR block:\n\n- Shipped packing cubes sync\n- Hobby-plan function budget\n\nTitle: Multiplexed the API\nSituation: Twelve functions already used.\nTask: Add another signed-in app.\nAction: Branched ?route= on the existing handler.\nResult: Stayed on Hobby.',
    'data-focus-key': 'book-paste',
  });
  const kind = el('select', {}, ENTRY_KINDS.map((value) =>
    el('option', { value, selected: value === 'experience' || undefined }, kindLabel(value))
  ));
  const addToBook = () => {
    const drafts = parseExperiences(paste.value).map((draft) => ({ ...draft, kind: kind.value }));
    if (!drafts.length) {
      setNote('Paste at least one experience — one per line, or a STAR block.');
      return;
    }
    store = addEntries(store, drafts);
    saveStore();
    render({ focusKey: 'book-paste' });
    setNote(`Added ${drafts.length} experience${drafts.length === 1 ? '' : 's'}. They are in the list.`);
  };
  return el('section', { class: compact ? 'panel bb-add-compact' : 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'Add experiences'),
        el('p', { class: 'tiny' }, 'Paste many at once. The list stays in view.'),
      ]),
      el('span', { class: 'beta-pill' }, 'beta'),
    ]),
    el('div', { class: 'panel-body' }, [
      compact
        ? null
        : el('p', { class: 'lede' }, 'Dump a resume, a review doc, or notes. Each line becomes an experience a posting can link.'),
      field('Kind for this paste', kind),
      field('Paste experiences', paste),
      el('div', { class: 'actions' }, [
        btn('Add to the book', {
          class: 'btn',
          onClick: addToBook,
        }),
        compact
          ? btn('Done', { class: 'btn ghost', onClick: () => go({ kind: 'log' }) })
          : btn('Cancel', { class: 'btn ghost', onClick: () => go({ kind: 'log' }) }),
      ]),
    ]),
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
      ]),
      store.jobs.length ? field('Resume job', el('select', { name: 'jobId' }, [
        el('option', { value: '', selected: !draft.jobId || undefined }, 'Not linked'),
        ...store.jobs.map((job) =>
          el('option', { value: job.id, selected: draft.jobId === job.id || undefined }, [job.company, job.title].filter(Boolean).join(' · '))
        ),
      ])) : null,
      el('div', { class: 'grid-2' }, [
        field('When', el('input', { name: 'when', value: draft.when, placeholder: '2026 · A-Lister, or last Tuesday' })),
        field('Tags', el('input', { name: 'tags', value: draft.tags.join(', '), placeholder: 'neon, auth, postgres' })),
      ]),
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
    box.append(el('div', { class: 'table-question-line' }, [
      el('details', {
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
          stories.length
            ? el('div', { class: 'actions' }, [
              btn('Use first experience', {
                class: 'btn ghost',
                onClick: () => {
                  store = answerQuestionFromEntry(store, job.id, req.id, question.id, stories[0].id);
                  saveStore();
                  render();
                  setNote('Used the experience as this answer.');
                },
              }),
            ])
            : null,
        ]),
      ]),
      el('div', { class: 'row-icons' }, [
        btn('×', {
          class: 'icon-quiet is-danger',
          title: 'Delete question',
          'aria-label': 'Delete question',
          onClick: () => {
            if (!confirm('Delete this question?')) return;
            openQuestionIds.delete(question.id);
            store = deleteQuestion(store, job.id, req.id, question.id);
            saveStore();
            render();
          },
        }),
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
  const hideMatches = () => {
    matches.hidden = true;
    activeIndex = -1;
  };
  fresh.addEventListener('focus', () => {
    activeIndex = -1;
    showMatches();
  });
  wrap.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (wrap.contains(document.activeElement)) return;
      hideMatches();
    }, 0);
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
    if (event.key === 'Escape') hideMatches();
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
      el('span', { class: 'bullet-mark', 'aria-hidden': 'true' }, '•'),
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

function sectionOrderFor(posting) {
  if (posting?.resume?.sectionOrder?.length) return posting.resume.sectionOrder.slice();
  if (store.resumeSettings?.sectionOrder?.length) return store.resumeSettings.sectionOrder.slice();
  return DEFAULT_SECTION_ORDER.slice();
}

function showCredentialsFor(posting) {
  if (posting?.resume?.showCredentials === true || posting?.resume?.showCredentials === false) {
    return posting.resume.showCredentials;
  }
  return store.resumeSettings?.showCredentials !== false;
}

function livePosting(id) {
  return store.postings.find((item) => item.id === id) || null;
}

function paintFitChip() {
  const node = document.getElementById('resume-fit-chip');
  if (!node) return;
  const dropped = resumeFit.droppedBulletIds || [];
  if (!resumeFit.fits) {
    node.textContent = `Over by ${Math.max(1, Math.ceil((resumeFit.overflowPx || 0) / 16))} lines — hide or shorten bullets`;
    node.className = 'bb-fit-chip is-warn';
  } else if (dropped.length) {
    node.textContent = `Fits on one page · ${resumeFit.fontPt}pt · hid ${dropped.length} bullet${dropped.length === 1 ? '' : 's'} to fit`;
    node.className = 'bb-fit-chip is-warn';
  } else {
    node.textContent = `Fits on one page · ${resumeFit.fontPt}pt`;
    node.className = 'bb-fit-chip';
  }
  root.querySelectorAll('[data-bullet-wrap]').forEach((wrap) => {
    const id = wrap.getAttribute('data-bullet-wrap');
    wrap.classList.toggle('is-dropped', dropped.includes(id));
  });
}

function scaleResumeFrame(wrap, frame) {
  if (!wrap || !frame) return;
  const page = 8.5 * 96;
  const scale = Math.max(0.28, Math.min(1, (wrap.clientWidth - 8) / page));
  frame.style.transform = `scale(${scale})`;
  wrap.style.height = `${11 * 96 * scale + 12}px`;
}

async function refreshResumePreview(posting) {
  const frame = document.getElementById('resume-preview-frame');
  const wrap = document.getElementById('resume-preview-wrap');
  if (!frame) return;
  const current = posting?.id ? livePosting(posting.id) : posting;
  const doc = compileResumeDoc(current, store);
  const html = resumeDocument(renderResumeHtml(doc, { droppedBulletIds: [] }));
  await new Promise((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const page = frame.contentDocument?.getElementById('page');
  if (!page) return;
  try { await frame.contentDocument.fonts.ready; } catch { /* ignore */ }
  const result = fitOnePage(page, {
    pageHeightPx: PAGE_HEIGHT_PX,
    dropOrder: dropOrderFromDoc(doc),
  });
  resumeFit = result;
  if (current?.id) {
    store = updatePostingResume(store, current.id, {
      fit: {
        fontPt: result.fontPt,
        bulletLineHeight: result.bulletLineHeight,
        droppedBulletIds: result.droppedBulletIds,
        fits: result.fits,
      },
    });
    saveStore();
  }
  paintFitChip();
  scaleResumeFrame(wrap, frame);
  frame.contentDocument?.addEventListener('click', (event) => {
    const li = event.target.closest?.('li[data-bullet-id]');
    const jobNode = event.target.closest?.('[data-job-id]');
    const bulletId = li?.getAttribute('data-bullet-id');
    const jobId = li?.getAttribute('data-job-id') || jobNode?.getAttribute('data-job-id');
    if (!bulletId && !jobId) return;
    const focusKey = bulletId ? `rb-${bulletId}-line` : `rj-${jobId}-company`;
    if (jobId && roleIsCollapsed(collapsedResumeRoles, current?.id, jobId)) {
      collapsedResumeRoles = toggleRoleCollapsed(collapsedResumeRoles, current?.id, jobId);
      render({ focusKey });
      return;
    }
    const field = root.querySelector(`[data-focus-key="${focusKey}"]`)
      || root.querySelector(`[data-focus-key="rb-${bulletId}-body"]`)
      || root.querySelector(`[data-focus-key="rb-${bulletId}-lead"]`);
    field?.focus();
    root.querySelectorAll('.bb-rb.is-on').forEach((node) => node.classList.remove('is-on'));
    if (bulletId) root.querySelector(`[data-bullet-wrap="${bulletId}"]`)?.classList.add('is-on');
  });
}

function scheduleResumePreview(posting) {
  if (resumePreviewTimer) clearTimeout(resumePreviewTimer);
  resumePreviewTimer = setTimeout(() => {
    resumePreviewTimer = null;
    refreshResumePreview(posting);
  }, 140);
}

function exportResumePdf(posting) {
  const frame = document.getElementById('resume-preview-frame');
  if (frame?.contentWindow) {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setNote('Use the print dialog → Save as PDF.');
    return;
  }
  const doc = compileResumeDoc(posting, store);
  const html = resumeDocument(renderResumeHtml(doc, { droppedBulletIds: resumeFit.droppedBulletIds }), {
    fittedVars: resumeFit.vars,
    print: true,
  });
  const win = window.open('', '_blank');
  if (!win) {
    downloadText('resume.html', html, 'text/html');
    setNote('Download the HTML and print it.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function exportResumeDocx(posting) {
  const compiled = compileResumeDoc(posting, store);
  const doc = applyDroppedIds(
    visibleResumeDoc(compiled, { includeFitDrops: true }),
    resumeFit.droppedBulletIds || []
  );
  doc.fit = {
    fontPt: resumeFit.fontPt,
    bulletLineHeight: resumeFit.bulletLineHeight,
    droppedBulletIds: resumeFit.droppedBulletIds || [],
    fits: resumeFit.fits,
  };
  const name = (posting?.title || store.profile?.name || 'resume').replace(/[^\w.-]+/g, '_');
  downloadBlob(`${name}.docx`, resumeDocxBlob(doc));
  setNote('Downloaded a Word resume.');
}

function resumePreviewPane() {
  const chip = el('p', { class: 'bb-fit-chip', id: 'resume-fit-chip' }, 'Measuring one page…');
  const frame = el('iframe', {
    id: 'resume-preview-frame',
    class: 'bb-resume-frame',
    title: 'Resume preview',
  });
  const wrap = el('div', { class: 'bb-resume-preview-wrap', id: 'resume-preview-wrap' }, [frame]);
  return el('div', { class: 'bb-resume-preview' }, [chip, wrap]);
}

function resumeSectionOrder(posting) {
  const order = sectionOrderFor(posting);
  const labels = {
    experience: 'Work Experience',
    credentials: 'Credentials',
    education: 'Education',
    additional: 'Additional Info',
  };
  return el('div', { class: 'bb-resume-order' }, [
    el('p', { class: 'subhead' }, 'Section order'),
    ...order.map((key, index) => el('div', { class: 'bb-order-row' }, [
      el('span', {}, labels[key] || key),
      el('div', { class: 'actions' }, [
        btn('↑', {
          class: 'btn ghost compact-action',
          disabled: index === 0,
          'aria-label': `Move ${labels[key]} up`,
          onClick: () => {
            if (!posting) {
              store = updateResumeSettings(store, { sectionOrder: moveKey(order, key, -1) });
            } else {
              store = updatePostingResume(store, posting.id, { sectionOrder: moveKey(order, key, -1) });
            }
            saveStore();
            render();
          },
        }),
        btn('↓', {
          class: 'btn ghost compact-action',
          disabled: index === order.length - 1,
          'aria-label': `Move ${labels[key]} down`,
          onClick: () => {
            if (!posting) {
              store = updateResumeSettings(store, { sectionOrder: moveKey(order, key, 1) });
            } else {
              store = updatePostingResume(store, posting.id, { sectionOrder: moveKey(order, key, 1) });
            }
            saveStore();
            render();
          },
        }),
      ]),
    ])),
  ]);
}

function careerJobById(id) {
  return (store.jobs || []).find((job) => job.id === id) || null;
}

function isSharedJob(id) {
  return Boolean(careerJobById(id));
}

function isLocalOnlyJob(posting, id) {
  if (!posting) return false;
  return Boolean(localJobById(posting.resume, id)) && !isSharedJob(id);
}

function isLocalResumeRow(posting, key, id) {
  return Boolean(posting && (posting.resume?.[key] || []).some((item) => item.id === id));
}

function lastLocalJob(postingId) {
  const jobs = livePosting(postingId)?.resume?.localJobs || [];
  return jobs[jobs.length - 1] || null;
}

function lastLocalBullet(postingId, jobId, groupId) {
  const job = localJobById(livePosting(postingId)?.resume, jobId);
  const group = (job?.groups || []).find((item) => item.id === groupId)
    || job?.groups[job.groups.length - 1];
  return group?.bullets[group.bullets.length - 1] || null;
}

function lastLocalGroup(postingId, jobId) {
  const job = localJobById(livePosting(postingId)?.resume, jobId);
  return job?.groups[job.groups.length - 1] || null;
}

function bulletCount(career) {
  return (career.groups || []).reduce((sum, group) => sum + (group.bullets || []).length, 0);
}

function splitResumeItems(value) {
  return String(value || '').split(/\s*[·;]\s*|\n/).map((part) => part.trim()).filter(Boolean);
}

function resumeSectionHead(title, action) {
  return el('div', { class: 'bb-section-head' }, [
    el('h3', {}, title),
    action || null,
  ]);
}

function resumeMoveBtns(label, { index, length, onMove }) {
  return el('div', { class: 'actions bb-order-btns' }, [
    btn('↑', {
      class: 'btn ghost compact-action',
      title: `Move ${label} up`,
      'aria-label': `Move ${label} up`,
      disabled: index <= 0,
      onClick: () => onMove(-1),
    }),
    btn('↓', {
      class: 'btn ghost compact-action',
      title: `Move ${label} down`,
      'aria-label': `Move ${label} down`,
      disabled: index >= length - 1,
      onClick: () => onMove(1),
    }),
  ]);
}

function addSubheadingButton(posting, career, { afterId } = {}) {
  return btn(afterId ? '+ Sub-heading here' : '+ Add sub-heading', {
    class: 'btn ghost compact-action',
    onClick: () => {
      const added = addResumeGroup(store, posting?.id || null, career, { afterId });
      store = added.store;
      saveStore();
      render({ focusKey: added.groupId ? `rg-${added.groupId}-heading` : `rj-${career.id}-company` });
    },
  });
}

function resumeBulletEditor(posting, career, group, bullet, bulletIndex = 0) {
  const dropped = (resumeFit.droppedBulletIds || []).includes(bullet.id);
  const shared = isSharedJob(career.id);
  const localBullet = Boolean(bullet.local) || isLocalOnlyJob(posting, career.id);
  const canEdit = !posting || shared || localBullet || Boolean(career.local);
  const lineText = bulletLineText(bullet);
  const commitWording = (spans) => {
    const next = bulletFromLine(spansToMarkdown(spans));
    store = adoptCompiledJob(store, posting?.id || null, career);
    const adoptedLocal = Boolean(posting && localJobById(livePosting(posting.id)?.resume, career.id) && !isSharedJob(career.id));
    if (!posting || isSharedJob(career.id)) {
      const job = careerJobById(career.id) || career;
      store = updateCareerJob(store, career.id, {
        groups: (job.groups || career.groups).map((item) => (
          item.id === group.id
            ? {
              ...item,
              bullets: item.bullets.map((row) => (
                row.id === bullet.id ? { ...row, ...next } : row
              )),
            }
            : item
        )),
      });
    } else if (localBullet || adoptedLocal) {
      store = updatePostingLocalBullet(store, posting.id, career.id, group.id, bullet.id, next);
    } else {
      store = updatePostingResume(store, posting.id, {
        overrides: { [bullet.id]: next },
      });
    }
    saveStore();
    scheduleResumePreview(posting);
  };
  const line = richLine({
    class: 'bb-rb-line',
    'aria-label': 'Bullet',
    'aria-multiline': 'true',
    'data-focus-key': `rb-${bullet.id}-line`,
  }, {
    text: lineText,
    rich: markdownToSpans(lineText),
    onChange: commitWording,
  });
  const wrap = el('div', {
    class: `bb-rb${bullet.included === false ? ' is-excluded' : ''}${dropped ? ' is-dropped' : ''}${bullet.hasOverride ? ' is-override' : ''}`,
    dataset: { bulletWrap: bullet.id },
  }, [
    el('div', { class: 'bb-rb-tools' }, [
      el('label', { class: 'bb-check' }, [
        el('input', {
          type: 'checkbox',
          checked: bullet.included !== false,
          disabled: !posting,
          onChange: () => {
            if (!posting) return;
            store = updatePostingResume(store, posting.id, {
              excludedBulletIds: toggleId(posting.resume.excludedBulletIds, bullet.id),
            });
            saveStore();
            render();
          },
        }),
        ' Include',
      ]),
      el('label', { class: 'bb-check' }, [
        el('input', {
          type: 'checkbox',
          checked: Boolean(bullet.pinned),
          disabled: !posting,
          onChange: () => {
            if (!posting) return;
            store = updatePostingResume(store, posting.id, {
              pinnedBulletIds: toggleId(posting.resume.pinnedBulletIds, bullet.id),
            });
            saveStore();
            render();
          },
        }),
        ' Pin',
      ]),
      dropped ? el('span', { class: 'tiny' }, 'Hidden to fit') : null,
      bullet.hasOverride ? el('span', { class: 'tiny' }, 'Resume wording') : null,
      localBullet ? el('span', { class: 'tiny' }, 'This posting only') : null,
      canEdit ? resumeMoveBtns('bullet', {
        index: bulletIndex,
        length: group.bullets.length,
        onMove: (delta) => {
          if (posting && localBullet) {
            store = movePostingLocalBullet(store, posting.id, career.id, group.id, bullet.id, delta);
          } else if (!posting && shared) {
            store = moveCareerBullet(store, career.id, group.id, bullet.id, delta);
          } else if (posting) {
            const order = (group.bullets || []).map((item) => item.id);
            const moved = order.slice();
            const idx = moved.indexOf(bullet.id);
            const next = idx + delta;
            if (idx < 0 || next < 0 || next >= moved.length) return;
            const [row] = moved.splice(idx, 1);
            moved.splice(next, 0, row);
            store = updatePostingResume(store, posting.id, { bulletOrder: { [group.id]: moved } });
          }
          saveStore();
          render({ focusKey: `rb-${bullet.id}-line` });
        },
      }) : null,
      canEdit ? btn(localBullet || !posting ? 'Remove' : (bullet.included !== false ? 'Remove' : 'Delete'), {
        class: 'btn ghost compact-action is-danger',
        onClick: () => {
          if (posting && localBullet) {
            store = deletePostingLocalBullet(store, posting.id, career.id, group.id, bullet.id);
            saveStore();
            render();
            setNote('Removed this bullet from this posting only.');
            return;
          }
          if (posting) {
            store = updatePostingResume(store, posting.id, {
              excludedBulletIds: toggleId(posting.resume.excludedBulletIds, bullet.id),
            });
            saveStore();
            render();
            setNote('Hidden on this posting. It stays in Resume basics.');
            return;
          }
          if (!confirm('Delete this bullet from the shared career history?')) return;
          store = deleteCareerBullet(store, career.id, group.id, bullet.id);
          saveStore();
          render();
        },
      }) : null,
    ]),
    el('div', { class: 'bb-rb-line-head' }, [
      field('Bullet', line),
      btn('Bold', {
        class: 'btn ghost compact-action',
        onClick: () => {
          line.focus();
          document.execCommand('bold');
          commitWording(readRich(line));
        },
      }),
    ]),
    posting ? el('div', { class: 'actions' }, [
      btn('Reset to source', {
        class: 'btn ghost compact-action',
        disabled: !bullet.hasOverride || localBullet,
        onClick: () => {
          store = replacePostingResume(store, posting.id, clearBulletOverride(livePosting(posting.id).resume, bullet.id));
          saveStore();
          render();
          setNote('Restored this bullet from the source.');
        },
      }),
      btn('Save back to source', {
        class: 'btn ghost compact-action',
        onClick: () => {
          const nextBullet = { ...bullet, ...bulletFromLine(spansToMarkdown(readRich(line))) };
          store = writeBulletBackToSource(store, posting.id, nextBullet);
          const current = livePosting(posting.id);
          store = replacePostingResume(store, posting.id, clearBulletOverride(current.resume, bullet.id));
          saveStore();
          render();
          setNote(localBullet
            ? 'Copied this bullet into Resume basics. Other postings can use it now.'
            : 'Wrote this wording back to the source bullet.');
        },
      }),
    ]) : null,
  ]);
  return wrap;
}

function addRoleButton(posting, { afterId } = {}) {
  return btn('+ Add role', {
    class: 'btn ghost compact-action',
    onClick: () => {
      if (posting) {
        store = addPostingLocalJob(store, posting.id, {}, { afterId });
        const added = lastLocalJob(posting.id);
        saveStore();
        render({ focusKey: added ? `rj-${added.id}-company` : undefined });
        setNote('Added a role on this posting only. Save back to source to copy it into Resume basics.');
        return;
      }
      store = addCareerJob(store);
      const added = store.jobs[store.jobs.length - 1];
      saveStore();
      render({ focusKey: added ? `rj-${added.id}-company` : undefined });
      setNote('Added a role to the shared career history.');
    },
  });
}

function resumeJobEditor(posting, career) {
  const shared = isSharedJob(career.id);
  const localOnly = Boolean(career.local) || isLocalOnlyJob(posting, career.id);
  const company = el('input', {
    value: career.company,
    placeholder: 'Company',
    'aria-label': 'Company',
    'data-focus-key': `rj-${career.id}-company`,
  });
  const title = el('input', {
    value: career.title,
    placeholder: 'Title',
    'aria-label': 'Job title',
    'data-focus-key': `rj-${career.id}-title`,
  });
  const dates = el('input', {
    value: [career.start, career.end].filter(Boolean).join(' – '),
    placeholder: 'October 2021 – Present',
    'aria-label': 'Dates',
    'data-focus-key': `rj-${career.id}-dates`,
  });
  const location = el('input', {
    value: career.location,
    placeholder: 'New York, NY / Seattle, WA',
    'aria-label': 'Location',
    'data-focus-key': `rj-${career.id}-location`,
  });
  const stampJob = () => {
    const [start, end] = dates.value.split(/\s+[–-]\s+/);
    const patch = {
      company: company.value,
      title: title.value,
      location: location.value,
      start: (start || dates.value).trim(),
      end: (end || '').trim(),
    };
    store = adoptCompiledJob(store, posting?.id || null, career);
    const nowShared = isSharedJob(career.id);
    const nowLocal = Boolean(posting && localJobById(livePosting(posting.id)?.resume, career.id) && !nowShared);
    if (posting && nowLocal) {
      store = updatePostingLocalJob(store, posting.id, career.id, patch);
    } else if (nowShared) {
      store = updateCareerJob(store, career.id, patch);
    } else return;
    saveStore();
    scheduleResumePreview(posting);
  };
  [company, title, dates, location].forEach((node) => node.addEventListener('input', stampJob));
  const jobs = (compileResumeDoc(posting, store).sections.experience.jobs || []);
  const jobIndex = jobs.findIndex((item) => item.id === career.id);
  const groups = career.groups || [];
  const allowStructure = Boolean(posting) || shared;
  const collapsed = roleIsCollapsed(collapsedResumeRoles, posting?.id, career.id);
  const summary = resumeRoleSummary(career);
  const toggleRole = () => {
    collapsedResumeRoles = toggleRoleCollapsed(collapsedResumeRoles, posting?.id, career.id);
    render();
  };
  const onHeadActivate = (event) => {
    const target = event.target;
    const tag = target?.tagName || '';
    const interactive = Boolean(target?.closest?.('.bb-job-controls, input, textarea, select, a, label, button:not(.bb-job-fold)'));
    if (!isRoleHeaderToggleTarget(tag, interactive) && target?.closest?.('.bb-job-fold') == null) return;
    if (event.type === 'keydown') event.preventDefault();
    toggleRole();
  };
  return el('div', {
    class: `bb-job-card is-role${career.included === false ? ' is-excluded' : ''}${collapsed ? ' is-collapsed' : ''}`,
  }, [
    el('div', {
      class: 'bb-job-head',
      onClick: onHeadActivate,
    }, [
      el('button', {
        type: 'button',
        class: 'bb-job-fold',
        'aria-expanded': collapsed ? 'false' : 'true',
        'aria-controls': `role-body-${career.id}`,
        'aria-label': collapsed
          ? `Expand ${summary.title}`
          : `Collapse ${summary.title}`,
        onClick: (event) => {
          event.stopPropagation();
          toggleRole();
        },
      }, [
        el('span', { class: 'bb-job-chevron', 'aria-hidden': 'true' }, collapsed ? '▸' : '▾'),
        el('span', { class: 'bb-job-summary' }, [
          el('strong', {}, summary.title),
          collapsed
            ? el('span', { class: 'tiny' }, ` · ${summary.bullets} bullet${summary.bullets === 1 ? '' : 's'}`)
            : null,
        ]),
      ]),
      el('div', { class: 'bb-job-controls' }, [
        el('label', { class: 'bb-check' }, [
          el('input', {
            type: 'checkbox',
            checked: career.included !== false,
            disabled: !posting,
            onChange: () => {
              if (!posting) return;
              store = updatePostingResume(store, posting.id, {
                excludedJobIds: toggleId(posting.resume.excludedJobIds, career.id),
              });
              saveStore();
              render();
            },
          }),
          ' Include this role',
        ]),
        localOnly ? el('span', { class: 'tiny' }, 'This posting only') : null,
        allowStructure ? resumeMoveBtns('role', {
          index: jobIndex,
          length: jobs.length,
          onMove: (delta) => {
            if (posting) store = movePostingJob(store, posting.id, career.id, delta);
            else store = moveCareerJob(store, career.id, delta);
            saveStore();
            render({ focusKey: `rj-${career.id}-company` });
          },
        }) : null,
        allowStructure ? btn('Remove', {
          class: 'btn ghost compact-action is-danger',
          onClick: () => {
            if (posting && localOnly) {
              const n = bulletCount(career);
              if (!confirm(n
                ? `Remove this role and its ${n} bullet${n === 1 ? '' : 's'} from this posting’s resume? Resume basics is unchanged.`
                : 'Remove this role from this posting’s resume? Resume basics is unchanged.')) return;
              store = deletePostingLocalJob(store, posting.id, career.id);
              saveStore();
              render();
              return;
            }
            if (posting) {
              store = updatePostingResume(store, posting.id, {
                excludedJobIds: toggleId(posting.resume.excludedJobIds, career.id),
              });
              saveStore();
              render();
              setNote('Hidden on this posting. It stays in Resume basics.');
              return;
            }
            const n = bulletCount(career);
            if (n && !confirm(`Delete this role and its ${n} bullet${n === 1 ? '' : 's'} from the shared career history?`)) return;
            store = deleteCareerJob(store, career.id);
            saveStore();
            render();
          },
        }) : null,
      ]),
    ]),
    el('div', {
      class: 'bb-job-body',
      id: `role-body-${career.id}`,
      hidden: collapsed,
    }, [
    el('div', { class: 'grid-2' }, [
      field('Company', company),
      field('Dates', dates),
    ]),
    el('div', { class: 'grid-2' }, [
      field('Title', title),
      field('Location', location),
    ]),
    ...groups.flatMap((group, groupIndex) => {
      const heading = el('input', {
        value: group.heading,
        placeholder: 'Optional italic sub-heading',
        'aria-label': 'Group heading',
        'data-focus-key': `rg-${group.id}-heading`,
      });
      heading.addEventListener('input', () => {
        if (posting && (localOnly || group.local)) {
          const job = localJobById(livePosting(posting.id).resume, career.id);
          const groupsNext = (job?.groups || career.groups).map((item) => (
            item.id === group.id ? { ...item, heading: heading.value } : item
          ));
          store = updatePostingLocalJob(store, posting.id, career.id, { groups: groupsNext });
        } else if (posting) {
          store = updatePostingResume(store, posting.id, { groupHeadings: { [group.id]: heading.value } });
        } else if (shared) {
          store = updateCareerJob(store, career.id, {
            groups: career.groups.map((item) => (item.id === group.id ? { ...item, heading: heading.value } : item)),
          });
        }
        saveStore();
        scheduleResumePreview(posting);
      });
      const localGroup = Boolean(group.local) || localOnly;
      return [
        el('div', { class: 'bb-group-head' }, [
          field('Sub-heading', heading),
          allowStructure ? resumeMoveBtns('sub-heading', {
            index: groupIndex,
            length: groups.length,
            onMove: (delta) => {
              store = moveResumeGroup(store, posting?.id || null, career.id, group.id, delta);
              saveStore();
              render({ focusKey: `rg-${group.id}-heading` });
            },
          }) : null,
          allowStructure ? btn('Remove sub-heading', {
            class: 'btn ghost compact-action is-danger',
            onClick: () => {
              if (posting && localGroup) {
                store = deletePostingLocalGroup(store, posting.id, career.id, group.id);
                saveStore();
                render();
                return;
              }
              if (posting) {
                store = updatePostingResume(store, posting.id, { groupHeadings: { [group.id]: '' } });
                saveStore();
                render();
                return;
              }
              const n = (group.bullets || []).length;
              if (groups.length === 1) {
                if (n && !confirm('Clear this sub-heading? The bullets stay on the role.')) return;
                store = updateCareerJob(store, career.id, {
                  groups: career.groups.map((item) => (item.id === group.id ? { ...item, heading: '' } : item)),
                });
                saveStore();
                render();
                return;
              }
              if (n && !confirm('Remove this sub-heading? Its bullets move onto the role above or below.')) return;
              const sink = groups[groupIndex === 0 ? 1 : groupIndex - 1];
              let next = store;
              if (n && sink) {
                next = updateCareerJob(next, career.id, {
                  groups: career.groups.map((item) => {
                    if (item.id === sink.id) return { ...item, bullets: [...item.bullets, ...group.bullets] };
                    if (item.id === group.id) return { ...item, bullets: [] };
                    return item;
                  }),
                });
              }
              store = deleteCareerGroup(next, career.id, group.id);
              saveStore();
              render();
            },
          }) : null,
        ]),
        ...group.bullets.map((bullet, bulletIndex) => resumeBulletEditor(posting, career, group, bullet, bulletIndex)),
        allowStructure ? el('div', { class: 'bb-add-row' }, [
          btn('+ Add bullet', {
            class: 'btn ghost compact-action',
            onClick: () => {
              store = adoptCompiledJob(store, posting?.id || null, career);
              if (posting) {
                store = addPostingLocalBullet(store, posting.id, career.id, group.id);
                const last = lastLocalBullet(posting.id, career.id, group.id);
                saveStore();
                render({ focusKey: last ? `rb-${last.id}-line` : `rg-${group.id}-heading` });
                return;
              }
              store = addCareerBullet(store, career.id, group.id);
              const added = careerJobById(career.id);
              const g = added?.groups.find((item) => item.id === group.id);
              const last = g?.bullets[g.bullets.length - 1];
              saveStore();
              render({ focusKey: last ? `rb-${last.id}-line` : `rg-${group.id}-heading` });
            },
          }),
          addSubheadingButton(posting, career, { afterId: group.id }),
        ]) : null,
      ];
    }),
    allowStructure ? el('div', { class: 'bb-add-row' }, [
      addSubheadingButton(posting, career),
      groups.length ? null : btn('+ Add bullet', {
        class: 'btn ghost compact-action',
        onClick: () => {
          if (posting) {
            store = addPostingLocalBullet(store, posting.id, career.id, '');
            const last = lastLocalBullet(posting.id, career.id, '');
            saveStore();
            render({ focusKey: last ? `rb-${last.id}-line` : `rj-${career.id}-company` });
            return;
          }
          store = addCareerBullet(store, career.id, '');
          const added = careerJobById(career.id);
          const lastGroup = added?.groups[added.groups.length - 1];
          const last = lastGroup?.bullets[lastGroup.bullets.length - 1];
          saveStore();
          render({ focusKey: last ? `rb-${last.id}-line` : `rj-${career.id}-company` });
        },
      }),
    ]) : null,
    ]),
  ]);
}

function resumeEditorPane(posting, doc) {
  const profile = store.profile || {};
  const stampProfile = (key, value) => {
    store = updateProfile(store, { [key]: value });
    saveStore();
    scheduleResumePreview(posting);
  };
  const credToggle = el('label', { class: 'bb-check' }, [
    el('input', {
      type: 'checkbox',
      checked: showCredentialsFor(posting),
      onChange: (event) => {
        if (posting) store = updatePostingResume(store, posting.id, { showCredentials: event.target.checked });
        else store = updateResumeSettings(store, { showCredentials: event.target.checked });
        saveStore();
        render();
      },
    }),
    ' Include credentials',
  ]);
  return el('div', { class: 'bb-resume-editor' }, [
    el('p', { class: 'lede' }, posting
      ? 'Roles and bullets you add here stay on this posting unless you Save back to source. Exclude hides a shared item here. Start fresh empties this posting only.'
      : 'This is the shared career history. Every posting can start from these items. Add roles, bullets, credentials, education, and additional rows here, or import JSON.'),
    resumeSectionOrder(posting),
    credToggle,
    posting ? btn('Save order as my default', {
      class: 'btn ghost compact-action',
      onClick: () => {
        store = updateResumeSettings(store, {
          sectionOrder: sectionOrderFor(posting),
          showCredentials: showCredentialsFor(posting),
        });
        saveStore();
        setNote('Saved as your default section order.');
      },
    }) : null,
    el('h3', {}, 'Header'),
    el('div', { class: 'grid-2' }, [
      field('Name', el('input', {
        value: profile.name,
        placeholder: 'Inaayat Gill',
        'aria-label': 'Name',
        'data-focus-key': 'resume-name',
        onInput: (event) => stampProfile('name', event.target.value),
      })),
      field('Suffix', el('input', {
        value: profile.suffix || '',
        placeholder: 'CPA',
        'aria-label': 'Suffix',
        'data-focus-key': 'resume-suffix',
        onInput: (event) => stampProfile('suffix', event.target.value),
      })),
    ]),
    el('div', { class: 'grid-2' }, [
      field('Locations', el('input', {
        value: (profile.locations || []).join(' / ') || profile.location || '',
        placeholder: 'New York, NY / Seattle, WA',
        'aria-label': 'Locations',
        'data-focus-key': 'resume-locations',
        onInput: (event) => stampProfile('locations', event.target.value.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean)),
      })),
      field('Email', el('input', {
        value: profile.email,
        placeholder: 'you@example.com',
        'aria-label': 'Email',
        'data-focus-key': 'resume-email',
        onInput: (event) => stampProfile('email', event.target.value),
      })),
    ]),
    field('LinkedIn', el('input', {
      value: (profile.links || [])[0]?.url || '',
      placeholder: 'https://www.linkedin.com/in/you',
      'aria-label': 'LinkedIn',
      'data-focus-key': 'resume-linkedin',
      onInput: (event) => stampProfile('links', event.target.value.trim()
        ? [{ label: 'LinkedIn', url: event.target.value.trim() }]
        : []),
    })),
    resumeSectionHead('Work experience', addRoleButton(posting)),
    ...(doc.sections.experience.jobs.length
      ? doc.sections.experience.jobs.flatMap((career) => [
        resumeJobEditor(posting, career),
        el('div', { class: 'bb-add-role-slot' }, [addRoleButton(posting, { afterId: career.id })]),
      ])
      : [el('p', { class: 'empty' }, 'No roles yet. Use + Add role, or import a resume JSON.')]),
    resumeSectionHead('Credentials', btn('+ Add credential', {
      class: 'btn ghost compact-action',
      onClick: () => {
        if (posting) {
          store = addPostingLocalCredential(store, posting.id);
          const added = (livePosting(posting.id).resume.localCredentials || []).slice(-1)[0];
          saveStore();
          render({ focusKey: added ? `cr-${added.id}-name` : undefined });
          return;
        }
        store = addCredentialItem(store);
        const added = store.credentials[store.credentials.length - 1];
        saveStore();
        render({ focusKey: added ? `cr-${added.id}-name` : undefined });
      },
    })),
    ...(doc.sections.credentials.items.length
      ? doc.sections.credentials.items.map((item, index) => {
        const name = el('input', { value: item.name, 'aria-label': 'Credential name', 'data-focus-key': `cr-${item.id}-name` });
        const issued = el('input', { value: item.issued, 'aria-label': 'Issued', 'data-focus-key': `cr-${item.id}-issued` });
        const issuer = el('input', { value: item.issuer, 'aria-label': 'Issuer', 'data-focus-key': `cr-${item.id}-issuer` });
        const cid = el('input', { value: item.credentialId, 'aria-label': 'Credential ID', 'data-focus-key': `cr-${item.id}-id` });
        const stamp = () => {
          const patch = {
            name: name.value, issued: issued.value, issuer: issuer.value, credentialId: cid.value,
          };
          if (posting && isLocalResumeRow(posting, 'localCredentials', item.id)) {
            store = updatePostingLocalCredential(store, posting.id, item.id, patch);
          } else {
            store = updateCredentialItem(store, item.id, patch);
          }
          saveStore();
          scheduleResumePreview(posting);
        };
        [name, issued, issuer, cid].forEach((node) => node.addEventListener('input', stamp));
        return el('div', { class: 'bb-job-card' }, [
          el('div', { class: 'bb-rb-tools' }, [
            resumeMoveBtns('credential', {
              index,
              length: doc.sections.credentials.items.length,
              onMove: (delta) => {
                store = moveCredentialItem(store, item.id, delta);
                saveStore();
                render({ focusKey: `cr-${item.id}-name` });
              },
            }),
            btn('Delete', {
              class: 'btn ghost compact-action is-danger',
              onClick: () => {
                if (posting && isLocalResumeRow(posting, 'localCredentials', item.id)) {
                  store = deletePostingLocalCredential(store, posting.id, item.id);
                  saveStore();
                  render();
                  return;
                }
                if (posting) {
                  setNote('This credential is in Resume basics. Start fresh to hide shared credentials on this posting.');
                  return;
                }
                if (!confirm('Delete this credential?')) return;
                store = deleteCredentialItem(store, item.id);
                saveStore();
                render();
              },
            }),
          ]),
          el('div', { class: 'grid-2' }, [field('Name', name), field('Issued', issued)]),
          el('div', { class: 'grid-2' }, [field('Issuer', issuer), field('Credential ID', cid)]),
        ]);
      })
      : [el('p', { class: 'empty' }, 'None yet. Use + Add credential, or import a resume JSON.')]),
    resumeSectionHead('Education', btn('+ Add education', {
      class: 'btn ghost compact-action',
      onClick: () => {
        if (posting) {
          store = addPostingLocalEducation(store, posting.id);
          const added = (livePosting(posting.id).resume.localEducation || []).slice(-1)[0];
          saveStore();
          render({ focusKey: added ? `ed-${added.id}-school` : undefined });
          return;
        }
        store = addEducationItem(store);
        const added = store.education[store.education.length - 1];
        saveStore();
        render({ focusKey: added ? `ed-${added.id}-school` : undefined });
      },
    })),
    ...(doc.sections.education.items.length
      ? doc.sections.education.items.map((item, index) => {
        const school = el('input', { value: item.school, 'aria-label': 'School', 'data-focus-key': `ed-${item.id}-school` });
        const loc = el('input', { value: item.location, 'aria-label': 'School location', 'data-focus-key': `ed-${item.id}-loc` });
        const degree = el('input', { value: item.degree, 'aria-label': 'Degree', 'data-focus-key': `ed-${item.id}-degree` });
        const details = el('input', { value: item.details, 'aria-label': 'Details', 'data-focus-key': `ed-${item.id}-details` });
        const gpa = el('input', { value: item.gpa, 'aria-label': 'GPA', 'data-focus-key': `ed-${item.id}-gpa` });
        const stamp = () => {
          const patch = {
            school: school.value, location: loc.value, degree: degree.value, details: details.value, gpa: gpa.value,
          };
          if (posting && isLocalResumeRow(posting, 'localEducation', item.id)) {
            store = updatePostingLocalEducation(store, posting.id, item.id, patch);
          } else {
            store = updateEducationItem(store, item.id, patch);
          }
          saveStore();
          scheduleResumePreview(posting);
        };
        [school, loc, degree, details, gpa].forEach((node) => node.addEventListener('input', stamp));
        return el('div', { class: 'bb-job-card' }, [
          el('div', { class: 'bb-rb-tools' }, [
            resumeMoveBtns('education', {
              index,
              length: doc.sections.education.items.length,
              onMove: (delta) => {
                store = moveEducationItem(store, item.id, delta);
                saveStore();
                render({ focusKey: `ed-${item.id}-school` });
              },
            }),
            btn('Delete', {
              class: 'btn ghost compact-action is-danger',
              onClick: () => {
                if (posting && isLocalResumeRow(posting, 'localEducation', item.id)) {
                  store = deletePostingLocalEducation(store, posting.id, item.id);
                  saveStore();
                  render();
                  return;
                }
                if (posting) {
                  setNote('This education row is in Resume basics. Start fresh to hide shared education on this posting.');
                  return;
                }
                if (!confirm('Delete this education row?')) return;
                store = deleteEducationItem(store, item.id);
                saveStore();
                render();
              },
            }),
          ]),
          el('div', { class: 'grid-2' }, [field('School', school), field('Location', loc)]),
          field('Degree', degree),
          field('Details', details),
          field('GPA', gpa),
        ]);
      })
      : [el('p', { class: 'empty' }, 'None yet. Use + Add education, or import a resume JSON.')]),
    resumeSectionHead('Additional info', btn('+ Add row', {
      class: 'btn ghost compact-action',
      onClick: () => {
        if (posting) {
          store = addPostingLocalAdditional(store, posting.id);
          const added = (livePosting(posting.id).resume.localAdditional || []).slice(-1)[0];
          saveStore();
          render({ focusKey: added ? `ad-${added.id}-label` : undefined });
          return;
        }
        store = addAdditionalRow(store);
        const added = store.additional[store.additional.length - 1];
        saveStore();
        render({ focusKey: added ? `ad-${added.id}-label` : undefined });
      },
    })),
    ...(doc.sections.additional.rows.length
      ? doc.sections.additional.rows.map((row, index) => {
        const label = el('input', { value: row.label, 'aria-label': 'Row label', 'data-focus-key': `ad-${row.id}-label` });
        const grouped = Boolean(row.groups?.length);
        const items = el('textarea', {
          rows: '2',
          'aria-label': 'Items',
          'data-focus-key': `ad-${row.id}-items`,
        }, grouped
          ? row.groups.map((group) => `${group.label}: ${(group.items || []).join(', ')}`).join(' · ')
          : (row.items || []).join(' · '));
        items.value = items.textContent;
        const stampLabel = () => {
          const patch = grouped
            ? { label: label.value, groups: row.groups }
            : { label: label.value, items: splitResumeItems(items.value) };
          if (posting && isLocalResumeRow(posting, 'localAdditional', row.id)) {
            store = updatePostingLocalAdditional(store, posting.id, row.id, patch);
          } else {
            store = updateAdditionalRow(store, row.id, patch);
          }
          saveStore();
          scheduleResumePreview(posting);
        };
        label.addEventListener('input', stampLabel);
        if (!grouped) items.addEventListener('input', stampLabel);
        const groupEditors = grouped
          ? row.groups.map((group) => {
            const glabel = el('input', {
              value: group.label,
              placeholder: 'Italic sub-label',
              'aria-label': 'Sub-label',
              'data-focus-key': `sg-${group.id}-label`,
            });
            const gitems = el('textarea', {
              rows: '2',
              'aria-label': 'Group items',
              'data-focus-key': `sg-${group.id}-items`,
            }, (group.items || []).join(' · '));
            gitems.value = gitems.textContent;
            const stampGroup = () => {
              store = updateAdditionalGroup(store, row.id, group.id, {
                label: glabel.value,
                items: splitResumeItems(gitems.value),
              });
              saveStore();
              scheduleResumePreview(posting);
            };
            glabel.addEventListener('input', stampGroup);
            gitems.addEventListener('input', stampGroup);
            return el('div', { class: 'bb-addl-group' }, [
              el('div', { class: 'bb-group-head' }, [
                field('Sub-label', glabel),
                resumeMoveBtns('sub-label', {
                  index: row.groups.findIndex((item) => item.id === group.id),
                  length: row.groups.length,
                  onMove: (delta) => {
                    store = moveAdditionalGroup(store, row.id, group.id, delta);
                    saveStore();
                    render({ focusKey: `sg-${group.id}-label` });
                  },
                }),
                btn('Remove sub-label', {
                  class: 'btn ghost compact-action is-danger',
                  onClick: () => {
                    store = deleteAdditionalGroup(store, row.id, group.id);
                    saveStore();
                    render();
                  },
                }),
              ]),
              field('Items', gitems),
            ]);
          })
          : [field('Items', items)];
        return el('div', { class: 'bb-job-card' }, [
          el('div', { class: 'bb-rb-tools' }, [
            resumeMoveBtns('row', {
              index,
              length: doc.sections.additional.rows.length,
              onMove: (delta) => {
                store = moveAdditionalRow(store, row.id, delta);
                saveStore();
                render({ focusKey: `ad-${row.id}-label` });
              },
            }),
            btn('Delete', {
              class: 'btn ghost compact-action is-danger',
              onClick: () => {
                if (posting && isLocalResumeRow(posting, 'localAdditional', row.id)) {
                  store = deletePostingLocalAdditional(store, posting.id, row.id);
                  saveStore();
                  render();
                  return;
                }
                if (posting) {
                  setNote('This additional-info row is in Resume basics. Start fresh to hide shared rows on this posting.');
                  return;
                }
                if (!confirm('Delete this additional-info row?')) return;
                store = deleteAdditionalRow(store, row.id);
                saveStore();
                render();
              },
            }),
          ]),
          field('Label', label),
          ...groupEditors,
          el('div', { class: 'bb-add-row' }, [
            btn('+ Add sub-label', {
              class: 'btn ghost compact-action',
              onClick: () => {
                store = addAdditionalGroup(store, row.id);
                const added = store.additional.find((item) => item.id === row.id);
                const last = added?.groups[added.groups.length - 1];
                saveStore();
                render({ focusKey: last ? `sg-${last.id}-label` : `ad-${row.id}-label` });
              },
            }),
          ]),
        ]);
      })
      : [el('p', { class: 'empty' }, 'None yet. Use + Add row for a label plus items, or import a resume JSON.')]),
  ]);
}

function resumeWorkspace(posting) {
  const doc = compileResumeDoc(posting, store);
  const wrap = el('section', { class: 'panel bb-resume' });
  wrap.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, posting ? 'Resume' : 'Resume basics'),
        el('p', { class: 'tiny' }, posting
          ? [posting.title, posting.company].filter(Boolean).join(' · ')
          : 'Shared header, jobs, credentials, education'),
      ]),
      el('div', { class: 'actions' }, [
        btn('Import resume (JSON)', { class: 'btn ghost', onClick: () => resumeFileInput.click() }),
        btn('Print / PDF', { class: 'btn', onClick: () => exportResumePdf(posting) }),
        btn('Download Word', { class: 'btn ghost', onClick: () => exportResumeDocx(posting) }),
        posting && posting.resume?.mode !== 'fresh' ? btn('Start fresh', {
          class: 'btn ghost',
          onClick: () => {
            if (!confirm('Empty Work Experience, Education, Credentials, and Additional Info on this posting’s resume? The header stays. Resume basics and other postings are not changed.')) return;
            store = startPostingResumeFresh(store, posting.id);
            saveStore();
            render();
            setNote('This posting’s resume is blank except for the header. Add roles here, or Reset to Resume basics.');
          },
        }) : null,
        posting && posting.resume?.mode === 'fresh' ? btn('Reset to Resume basics', {
          class: 'btn ghost',
          onClick: () => {
            if (!confirm('Replace this posting’s resume with Resume basics? Local roles and bullets on this posting will be removed. Resume basics is unchanged.')) return;
            store = resetPostingResumeToBasics(store, posting.id);
            saveStore();
            render();
            setNote('This posting’s resume again starts from Resume basics.');
          },
        }) : null,
        posting ? btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: posting.id }) }) : null,
      ]),
    ]),
    el('div', { class: 'bb-resume-split' }, [
      resumeEditorPane(posting, doc),
      resumePreviewPane(),
    ])
  );
  queueMicrotask(() => refreshResumePreview(posting));
  return wrap;
}

function resumeChooser(job) {
  return el('section', { class: 'panel bb-resume-choose' }, [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', {}, 'Start this posting’s resume'),
        el('p', { class: 'tiny' }, [job.title, job.company].filter(Boolean).join(' · ')),
      ]),
      btn('Back to posting', { class: 'btn ghost', onClick: () => go({ kind: 'jobs', id: job.id }) }),
    ]),
    el('div', { class: 'panel-body' }, [
      el('p', { class: 'lede' }, 'The header (name, contact, links) always comes from Resume basics. Choose whether this posting starts from that shared career history or from a blank page.'),
      el('div', { class: 'bb-choose-cards' }, [
        el('button', {
          type: 'button',
          class: 'start-card is-primary',
          onClick: () => {
            store = choosePostingResumeMode(store, job.id, 'basics');
            saveStore();
            render();
          },
        }, [
          el('strong', {}, 'Start from Resume basics'),
          el('p', {}, 'Copy in your shared roles, education, credentials, and additional info. You can still hide items and add posting-only roles.'),
        ]),
        el('button', {
          type: 'button',
          class: 'start-card',
          onClick: () => {
            store = choosePostingResumeMode(store, job.id, 'fresh');
            saveStore();
            render();
          },
        }, [
          el('strong', {}, 'Start fresh'),
          el('p', {}, 'Keep the header. Empty Work Experience, Education, Credentials, and Additional Info on this posting only, then build with + Add role.'),
        ]),
      ]),
    ]),
  ]);
}

function resumeView(job) {
  if ((job.resume?.mode || 'basics') === 'choose') return resumeChooser(job);
  const profile = store.profile || {};
  const area = el('textarea', { class: 'resume', 'aria-label': 'Plain text resume' });
  let generated = compileResumeText(job, store) || 'Add a resume bullet on a requirement first.';
  let custom = Boolean(job.resumeText);
  area.value = custom ? job.resumeText : generated;
  const currentText = () => area.value;
  const refreshGenerated = () => {
    generated = compileResumeText(job, store) || 'Add a resume bullet on a requirement first.';
    if (!custom) area.value = generated;
  };
  area.addEventListener('input', () => {
    custom = area.value !== generated;
    store = updatePosting(store, job.id, { resumeText: custom ? area.value : '' });
    saveStore();
  });
  const wordHtml = () => resumeTextToWordHtml(currentText(), job.title || 'Resume');
  const workspace = resumeWorkspace(job);
  workspace.append(el('details', { class: 'utility-box' }, [
    el('summary', {}, 'Plain text copy (.txt / older Word)'),
    el('div', { class: 'utility-body' }, [
      el('p', { class: 'tiny' }, 'Grouped by role. Edits here are what Copy and .txt use. They do not change the one-page layout above.'),
      el('div', { class: 'actions' }, [
        btn('Copy', { class: 'btn ghost', onClick: () => copyText(currentText(), 'Copied the resume.') }),
        btn('Download .txt', {
          class: 'btn ghost',
          onClick: () => {
            downloadText(`${job.title || 'resume'}.txt`, currentText());
            setNote('Downloaded a text resume.');
          },
        }),
        btn('Download .doc', {
          class: 'btn ghost',
          onClick: () => {
            downloadText(`${job.title || 'resume'}.doc`, wordHtml(), 'application/msword');
            setNote('Downloaded a Word resume.');
          },
        }),
        btn('Rebuild text', {
          class: 'btn ghost',
          onClick: () => {
            custom = false;
            store = updatePosting(store, job.id, { resumeText: '' });
            saveStore();
            refreshGenerated();
            setNote('Rebuilt the plain-text resume from experiences.');
          },
        }),
      ]),
      el('div', { class: 'grid-2' }, [
        field('Name', el('input', { value: profile.name, placeholder: 'Your name', 'aria-label': 'Plain-text name', onInput: (event) => {
          store = updateProfile(store, { name: event.target.value });
          saveStore();
          refreshGenerated();
        } })),
        field('Email', el('input', { value: profile.email, placeholder: 'you@example.com', 'aria-label': 'Plain-text email', onInput: (event) => {
          store = updateProfile(store, { email: event.target.value });
          saveStore();
          refreshGenerated();
        } })),
      ]),
      field('Preview', area),
    ]),
  ]));
  return workspace;
}

function profileView() {
  return resumeWorkspace(null);
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
    restoreFocus(captured, options.focusKey);
    return;
  }

  if (view.kind === 'profile') {
    root.replaceChildren(el('div', {}, [toolbar(view), profileView()]));
    restoreFocus(captured, options.focusKey);
    return;
  }

  if (view.kind === 'log') {
    const layoutKind = logLayout(view);
    let body;
    if (layoutKind === 'catalog-add') {
      body = el('div', { class: 'layout is-book-add' }, [
        entryList(null, { variant: 'main' }),
        bulkEntryForm({ compact: true }),
      ]);
    } else if (layoutKind === 'detail') {
      const entry = store.entries.find((item) => item.id === view.id);
      body = el('div', { class: 'layout is-book-detail' }, [
        entryList(view.id, { variant: 'main' }),
        entry ? entryForm(entry) : emptyDetail('log'),
      ]);
    } else {
      body = el('div', { class: 'layout is-wide' }, [
        entryList(null, { variant: 'main' }),
      ]);
    }
    root.replaceChildren(el('div', {}, [toolbar(view), body]));
    restoreFocus(captured, options.focusKey);
    return;
  }

  let detail;
  if (view.kind === 'jobs' && view.id === 'new') detail = jobForm();
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

  const hideRail = Boolean(view.id) || !store.postings.length;
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
      rememberServerBook(data);
      showBook('Moved this browser’s book onto your account.');
      await pushStore();
      return;
    }
    store = remote;
    rememberServerBook(data);
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

resumeFileInput.addEventListener('change', () => {
  importResumeFile(resumeFileInput.files?.[0]);
  resumeFileInput.value = '';
});

window.addEventListener('resize', () => {
  scaleResumeFrame(document.getElementById('resume-preview-wrap'), document.getElementById('resume-preview-frame'));
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
  if (auth?.token) saveBook(auth.token, store, { keepalive: true, updatedAt: bookRevision });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pullBookIfClean();
});

window.addEventListener('focus', () => {
  pullBookIfClean();
});

boot();
