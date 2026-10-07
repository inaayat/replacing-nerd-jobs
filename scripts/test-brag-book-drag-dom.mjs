/**
 * DOM-level drag tests for the resume editor. jsdom renders the real page
 * (?local=1) and dispatches HTML5 drag events plus the pointer fallback.
 * jsdom has no DragEvent, so this file supplies a small one that the page
 * handlers read (dataTransfer, clientY).
 */
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  STORE_KEY,
  emptyStore,
  addCareerJob,
  addPosting,
  updatePostingResume,
  compileResumeDoc,
  normalizeStore,
} from '../brag-book/engine.js';
import { renderResumeHtml } from '../brag-book/resume-template.js';
import { resumeDocxBytes } from '../brag-book/resume-docx.js';

const clock = () => Date.parse('2026-10-05T12:00:00.000Z');
const random = () => 0.25;

const SHELL = `<!doctype html>
<html><body>
<nav class="nav"><div class="nav-links">
  <a href="#home" data-nav="home" hidden>Start</a>
  <a href="#jobs" data-nav="jobs" hidden>Job postings</a>
  <a href="#profile" data-nav="profile" hidden>Resume</a>
  <a href="#experiences" data-nav="log" hidden>Resume bullets</a>
  <a href="#kb" data-nav="kb" hidden>Knowledge</a>
  <a id="nav-auth-link" href="#bb-auth">Log in</a>
</div></nav>
<main id="app"></main>
<footer class="legal"></footer>
</body></html>`;

function sampleBook() {
  let book = addCareerJob(emptyStore(), {
    id: 'rj_drag',
    company: 'Drag Co',
    title: 'Analyst',
    onResume: true,
    groups: [
      {
        id: 'h1',
        heading: 'Alpha',
        bullets: [
          { id: 'a1', lead: 'Alpha one', body: 'kept' },
          { id: 'a2', lead: 'Alpha two', body: 'kept' },
        ],
      },
      {
        id: 'h2',
        heading: 'Beta',
        bullets: [
          { id: 'b1', lead: 'Beta one', body: 'kept' },
        ],
      },
    ],
  }, clock, random);
  book = addPosting(book, { id: 'job_drag', title: 'Drag posting', company: 'Drag Co' }, clock);
  book = updatePostingResume(book, 'job_drag', {
    includedJobIds: ['rj_drag'],
    mode: 'basics',
    pinnedBulletIds: ['a1'],
  }, clock);
  return book;
}

function installDragEvents(window) {
  class DataTransfer {
    constructor() {
      this.effectAllowed = 'uninitialized';
      this.dropEffect = 'none';
      this.types = [];
      this._data = new Map();
    }
    setData(type, value) {
      this._data.set(String(type), String(value));
      if (!this.types.includes(String(type))) this.types.push(String(type));
    }
    getData(type) {
      return this._data.get(String(type)) || '';
    }
  }
  class DragEvent extends window.Event {
    constructor(type, init = {}) {
      super(type, init);
      this.dataTransfer = init.dataTransfer || null;
      this.clientX = Number(init.clientX) || 0;
      this.clientY = Number(init.clientY) || 0;
    }
  }
  window.DataTransfer = DataTransfer;
  window.DragEvent = DragEvent;
}

function installGlobals(dom) {
  const window = dom.window;
  installDragEvents(window);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.localStorage = window.localStorage;
  globalThis.sessionStorage = window.sessionStorage;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (fn) => window.setTimeout(() => fn(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.confirm = () => false;
  window.alert = () => {};
  window.open = () => null;
  window.scrollTo = () => {};
}

let bootSeq = 0;

async function boot({ hash, book, label }) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    errors.push(`jsdom: ${err?.message || err}`);
  });
  virtualConsole.on('error', (message) => {
    errors.push(`console: ${message}`);
  });
  const dom = new JSDOM(SHELL, {
    url: `http://127.0.0.1/brag-book/?local=1${hash}`,
    pretendToBeVisual: true,
    virtualConsole,
  });
  dom.window.addEventListener('error', (event) => {
    errors.push(`window: ${event.message || event.error || 'error'}`);
  });
  dom.window.addEventListener('unhandledrejection', (event) => {
    errors.push(`rejection: ${event.reason?.message || event.reason}`);
  });
  installGlobals(dom);
  dom.window.localStorage.setItem(STORE_KEY, JSON.stringify(book));
  bootSeq += 1;
  const href = new URL('../brag-book/app.js', import.meta.url);
  await import(`${href.href}?dom=${label}-${bootSeq}`);
  await new Promise((resolve) => setTimeout(resolve, 40));
  return { dom, window: dom.window, document: dom.window.document, errors };
}

function layoutRows(document) {
  const rows = [...document.querySelectorAll('.bb-drag-row')];
  rows.forEach((row, index) => {
    const top = index * 40;
    row.getBoundingClientRect = () => ({
      x: 0,
      y: top,
      top,
      left: 0,
      right: 240,
      bottom: top + 40,
      width: 240,
      height: 40,
      toJSON() { return {}; },
    });
  });
  return rows;
}

function clientYFor(index, count) {
  if (index >= count) return count * 40 + 8;
  return index * 40 + 10;
}

function rowIds(document) {
  return [...document.querySelectorAll('.bb-drag-row')].map((row) => row.dataset.dragId);
}

function handles(document) {
  return [...document.querySelectorAll('.bb-drag-handle')];
}

function assertHandles(document) {
  const rows = [...document.querySelectorAll('.bb-drag-row')];
  const grips = handles(document);
  assert.ok(rows.length >= 4, `expected resume rows, saw ${rows.length}`);
  assert.equal(grips.length, rows.length);
  for (const row of rows) {
    const handle = row.querySelector('.bb-drag-handle');
    assert.ok(handle);
    assert.equal(handle.getAttribute('draggable'), 'true');
    assert.match(handle.textContent, /⠇/);
  }
}

function savedBook(window) {
  return normalizeStore(JSON.parse(window.localStorage.getItem(STORE_KEY)));
}

function compiledGroups(book, surface) {
  const posting = surface === 'posting'
    ? book.postings.find((job) => job.id === 'job_drag')
    : null;
  const job = compileResumeDoc(posting, book).sections.experience.jobs.find((item) => item.id === 'rj_drag');
  return {
    posting,
    groups: (job?.groups || []).map((group) => ({
      id: group.id,
      heading: group.heading,
      bullets: (group.bullets || []).map((bullet) => bullet.id),
    })),
  };
}

function assertOrder(book, surface, leads) {
  const { posting } = compiledGroups(book, surface);
  const html = renderResumeHtml(compileResumeDoc(posting, book));
  const docx = new TextDecoder().decode(resumeDocxBytes(compileResumeDoc(posting, book)));
  let htmlAt = -1;
  let docxAt = -1;
  for (const lead of leads) {
    const nextHtml = html.indexOf(lead);
    const nextDocx = docx.indexOf(lead);
    assert.ok(nextHtml > htmlAt, `preview missing ${lead} after the previous line`);
    assert.ok(nextDocx > docxAt, `DOCX missing ${lead} after the previous line`);
    htmlAt = nextHtml;
    docxAt = nextDocx;
  }
}

function html5Drag(window, document, fromId, toIndex) {
  const rows = layoutRows(document);
  const from = rows.find((row) => row.dataset.dragId === fromId);
  assert.ok(from, `missing row ${fromId}`);
  const handle = from.querySelector('.bb-drag-handle');
  const dataTransfer = new window.DataTransfer();
  const start = new window.DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });
  handle.dispatchEvent(start);
  assert.equal(start.defaultPrevented, false);
  const y = clientYFor(toIndex, rows.length);
  const list = from.closest('.bb-drag-list');
  const over = new window.DragEvent('dragover', { bubbles: true, cancelable: true, clientY: y, dataTransfer });
  list.dispatchEvent(over);
  assert.equal(over.defaultPrevented, true);
  assert.equal(list.querySelector('.bb-drop-line').hidden, false);
  list.dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, clientY: y, dataTransfer }));
  list.dispatchEvent(new window.DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
}

function pointerDrag(window, document, fromId, toIndex) {
  const rows = layoutRows(document);
  const from = rows.find((row) => row.dataset.dragId === fromId);
  assert.ok(from, `missing row ${fromId}`);
  const handle = from.querySelector('.bb-drag-handle');
  const y = clientYFor(toIndex, rows.length);
  const base = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', button: 0 };
  handle.dispatchEvent(new window.PointerEvent('pointerdown', { ...base, clientX: 0, clientY: 0 }));
  handle.dispatchEvent(new window.PointerEvent('pointermove', { ...base, clientX: 0, clientY: y }));
  const list = from.closest('.bb-drag-list');
  assert.equal(list.querySelector('.bb-drop-line').hidden, false);
  handle.dispatchEvent(new window.PointerEvent('pointerup', { ...base, clientX: 0, clientY: y }));
}

async function openSurface(surface) {
  const hash = surface === 'posting' ? '#jobs/job_drag/resume' : '#profile';
  const session = await boot({ hash, book: sampleBook(), label: surface });
  assertHandles(session.document);
  assert.deepEqual(rowIds(session.document), ['h1', 'a1', 'a2', 'h2', 'b1']);
  return session;
}

function drag(window, document, mode, fromId, toIndex) {
  const before = handles(document);
  if (mode === 'pointer') pointerDrag(window, document, fromId, toIndex);
  else html5Drag(window, document, fromId, toIndex);
  for (const handle of before) assert.equal(handle.isConnected, false);
  assertHandles(document);
}

const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    results.push({ name, passed: false, message: err?.message || String(err) });
    console.log(`FAIL ${name}`);
    console.log(err?.stack || err);
  }
}

function expectGroups(book, surface, expected) {
  const { groups } = compiledGroups(book, surface);
  assert.deepEqual(groups.map((group) => [group.heading, group.bullets]), expected);
}

async function runReorder(surface, mode) {
  await check(`(${surface}, ${mode}) (1) bullet within a group`, async () => {
    const { window, document, errors } = await openSurface(surface);
    drag(window, document, mode, 'a1', 3);
    assert.deepEqual(rowIds(document), ['h1', 'a2', 'a1', 'h2', 'b1']);
    const book = savedBook(window);
    expectGroups(book, surface, [['Alpha', ['a2', 'a1']], ['Beta', ['b1']]]);
    assertOrder(book, surface, ['Alpha two', 'Alpha one', 'Beta one']);
    if (surface === 'posting') {
      assert.equal(book.jobs[0].groups[0].bullets.map((bullet) => bullet.id).join(','), 'a1,a2');
      assert.deepEqual(book.postings.find((job) => job.id === 'job_drag').resume.pinnedBulletIds, ['a1']);
    }
    assert.deepEqual(errors, []);
  });

  await check(`(${surface}, ${mode}) (2) bullet into another sub-heading`, async () => {
    const { window, document, errors } = await openSurface(surface);
    drag(window, document, mode, 'b1', 1);
    assert.deepEqual(rowIds(document), ['h1', 'b1', 'a1', 'a2', 'h2']);
    const book = savedBook(window);
    expectGroups(book, surface, [['Alpha', ['b1', 'a1', 'a2']], ['Beta', []]]);
    assertOrder(book, surface, ['Beta one', 'Alpha one', 'Alpha two']);
    assert.deepEqual(errors, []);
  });

  await check(`(${surface}, ${mode}) (3) sub-heading moved past bullets`, async () => {
    const { window, document, errors } = await openSurface(surface);
    drag(window, document, mode, 'h2', 2);
    assert.deepEqual(rowIds(document), ['h1', 'a1', 'h2', 'a2', 'b1']);
    const book = savedBook(window);
    expectGroups(book, surface, [['Alpha', ['a1']], ['Beta', ['a2', 'b1']]]);
    assertOrder(book, surface, ['Alpha one', 'Alpha two', 'Beta one']);
    const html = renderResumeHtml(compileResumeDoc(
      surface === 'posting' ? book.postings.find((job) => job.id === 'job_drag') : null,
      book,
    ));
    assert.ok(html.indexOf('subhead">Alpha') < html.indexOf('Alpha one'));
    assert.ok(html.indexOf('Alpha one') < html.indexOf('subhead">Beta'));
    assert.ok(html.indexOf('subhead">Beta') < html.indexOf('Alpha two'));
    assert.deepEqual(errors, []);
  });

  await check(`(${surface}, ${mode}) (4) drop at first and last position`, async () => {
    const first = await openSurface(surface);
    drag(first.window, first.document, mode, 'b1', 0);
    const firstBook = savedBook(first.window);
    const firstGroups = compiledGroups(firstBook, surface).groups;
    assert.equal(firstGroups[0].heading, '');
    assert.deepEqual(firstGroups[0].bullets, ['b1']);
    assert.deepEqual(firstGroups[1].bullets, ['a1', 'a2']);
    assert.equal(rowIds(first.document)[0], 'b1');
    assert.equal(rowIds(first.document).filter((id) => id === 'h1').length, 1);
    assertOrder(firstBook, surface, ['Beta one', 'Alpha one', 'Alpha two']);
    assert.deepEqual(first.errors, []);

    const last = await openSurface(surface);
    drag(last.window, last.document, mode, 'a1', 5);
    assert.deepEqual(rowIds(last.document), ['h1', 'a2', 'h2', 'b1', 'a1']);
    const lastBook = savedBook(last.window);
    expectGroups(lastBook, surface, [['Alpha', ['a2']], ['Beta', ['b1', 'a1']]]);
    assertOrder(lastBook, surface, ['Alpha two', 'Beta one', 'Alpha one']);
    assert.deepEqual(last.errors, []);
  });

  await check(`(${surface}, ${mode}) (5) order persists after save and reload`, async () => {
    const first = await openSurface(surface);
    drag(first.window, first.document, mode, 'a1', 3);
    const stored = first.window.localStorage.getItem(STORE_KEY);
    const hash = surface === 'posting' ? '#jobs/job_drag/resume' : '#profile';
    const again = await boot({
      hash,
      book: JSON.parse(stored),
      label: `${surface}-reload`,
    });
    assert.deepEqual(rowIds(again.document), ['h1', 'a2', 'a1', 'h2', 'b1']);
    assertHandles(again.document);
    const book = savedBook(again.window);
    expectGroups(book, surface, [['Alpha', ['a2', 'a1']], ['Beta', ['b1']]]);
    assertOrder(book, surface, ['Alpha two', 'Alpha one', 'Beta one']);
    assert.deepEqual(again.errors, []);
  });

  await check(`(${surface}, ${mode}) (6) dragging from inside a text field does not start a drag`, async () => {
    const { window, document, errors } = await openSurface(surface);
    const before = rowIds(document);
    const stored = window.localStorage.getItem(STORE_KEY);
    const heading = document.querySelector('[data-focus-key="rg-h1-heading"]');
    const line = document.querySelector('[data-focus-key="rb-a1-line"]');
    assert.equal(heading.tagName, 'INPUT');
    assert.equal(line.getAttribute('contenteditable'), 'true');
    const dataTransfer = new window.DataTransfer();
    for (const field of [heading, line]) {
      const start = new window.DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });
      field.dispatchEvent(start);
      assert.equal(start.defaultPrevented, true);
      const list = field.closest('.bb-drag-list');
      list.dispatchEvent(new window.DragEvent('dragover', {
        bubbles: true, cancelable: true, clientY: 200, dataTransfer,
      }));
      list.dispatchEvent(new window.DragEvent('drop', {
        bubbles: true, cancelable: true, clientY: 200, dataTransfer,
      }));
      const base = { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', button: 0 };
      field.dispatchEvent(new window.PointerEvent('pointerdown', { ...base, clientX: 4, clientY: 4 }));
      field.dispatchEvent(new window.PointerEvent('pointermove', { ...base, clientX: 4, clientY: 80 }));
      field.dispatchEvent(new window.PointerEvent('pointerup', { ...base, clientX: 4, clientY: 80 }));
    }
    assert.deepEqual(rowIds(document), before);
    assert.equal(window.localStorage.getItem(STORE_KEY), stored);
    assert.equal(document.querySelector('.bb-drag-row.is-dragging'), null);
    assert.deepEqual(errors, []);
  });
}

await runReorder('basics', 'html5');
await runReorder('basics', 'pointer');
await runReorder('posting', 'html5');
await runReorder('posting', 'pointer');

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} DOM drag cases passed`);
if (failed.length) {
  for (const item of failed) console.log(`FAILED ${item.name}: ${item.message}`);
  process.exit(1);
}
