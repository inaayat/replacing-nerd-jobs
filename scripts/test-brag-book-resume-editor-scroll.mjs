/**
 * Posting resume editor: window, editor column, and preview wrap scroll
 * stay put after structure toggles (include, pin, remove, sub-heading, reorder).
 */
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  STORE_KEY,
  emptyStore,
  addCareerJob,
  addPosting,
  updatePostingResume,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-05T12:00:00.000Z');
const random = () => 0.25;

const TARGET_WINDOW_Y = 480;
const TARGET_EDITOR_Y = 360;
const TARGET_PREVIEW_Y = 120;

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
<main id="app" class="shell"></main>
<footer class="legal"></footer>
</body></html>`;

function sampleBook() {
  let book = addCareerJob(emptyStore(), {
    id: 'rj_scroll',
    company: 'Scroll Co',
    title: 'Analyst',
    onResume: true,
    groups: [
      {
        id: 'g1',
        heading: 'Alpha',
        bullets: [
          { id: 'b1', lead: 'One', body: 'first' },
          { id: 'b2', lead: 'Two', body: 'second' },
        ],
      },
      {
        id: 'g2',
        heading: 'Beta',
        bullets: [{ id: 'b3', lead: 'Three', body: 'third' }],
      },
    ],
  }, clock, random);
  book = addPosting(book, { id: 'job_scroll', title: 'Scroll posting', company: 'Scroll Co' }, clock);
  book = updatePostingResume(book, 'job_scroll', {
    includedJobIds: ['rj_scroll'],
    mode: 'basics',
    pinnedBulletIds: [],
  }, clock);
  return book;
}

function installScrollTrackers(window, document) {
  const state = {
    windowX: 0,
    windowY: TARGET_WINDOW_Y,
    editorY: TARGET_EDITOR_Y,
    previewY: TARGET_PREVIEW_Y,
  };
  window.scrollTo = (x, y) => {
    state.windowX = x;
    state.windowY = y;
  };
  Object.defineProperty(window, 'scrollX', { get: () => state.windowX, configurable: true });
  Object.defineProperty(window, 'scrollY', { get: () => state.windowY, configurable: true });
  Object.defineProperty(window.document.documentElement, 'scrollTop', {
    get: () => state.windowY,
    set: (value) => { state.windowY = value; },
    configurable: true,
  });
  Object.defineProperty(window.document.body, 'scrollTop', {
    get: () => state.windowY,
    set: (value) => { state.windowY = value; },
    configurable: true,
  });

  const wire = () => {
    const editor = document.querySelector('.bb-resume-editor');
    if (editor) {
      Object.defineProperty(editor, 'scrollTop', {
        get: () => state.editorY,
        set: (value) => { state.editorY = value; },
        configurable: true,
      });
      editor.scrollTop = state.editorY;
    }
    const wrap = document.getElementById('resume-preview-wrap');
    if (wrap) {
      Object.defineProperty(wrap, 'scrollTop', {
        get: () => state.previewY,
        set: (value) => { state.previewY = value; },
        configurable: true,
      });
      wrap.scrollTop = state.previewY;
    }
  };

  return { state, wire };
}

function assertScroll(state, label) {
  assert.equal(state.windowY, TARGET_WINDOW_Y, `${label}: window scrollY`);
  assert.equal(state.editorY, TARGET_EDITOR_Y, `${label}: editor scrollTop`);
  assert.equal(state.previewY, TARGET_PREVIEW_Y, `${label}: preview wrap scrollTop`);
}

function installGlobals(dom, scroll) {
  const window = dom.window;
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
  window.innerWidth = 1280;
  window.innerHeight = 900;
  window.matchMedia = (query) => ({
    matches: query.includes('min-width: 1024px'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  window.confirm = () => false;
  window.alert = () => {};
  window.open = () => null;
  scroll.wire();
}

let bootSeq = 0;

async function bootResumeEditor() {
  globalThis.__BB_TEST_RESUME_SCROLL__ = true;
  const book = sampleBook();
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push(String(err?.message || err)));
  const dom = new JSDOM(SHELL, {
    url: 'http://127.0.0.1/brag-book/?local=1#jobs/job_scroll/resume',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const scroll = installScrollTrackers(dom.window, dom.window.document);
  installGlobals(dom, scroll);
  dom.window.localStorage.setItem(STORE_KEY, JSON.stringify(book));
  bootSeq += 1;
  const href = new URL('../brag-book/app.js', import.meta.url);
  await import(`${href.href}?scroll=${bootSeq}`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  scroll.wire();
  scroll.state.windowY = TARGET_WINDOW_Y;
  scroll.state.editorY = TARGET_EDITOR_Y;
  scroll.state.previewY = TARGET_PREVIEW_Y;
  return { document: dom.window.document, window: dom.window, scroll, errors };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 220));
}

async function runAction(label, run) {
  const session = await bootResumeEditor();
  assert.equal(session.errors.length, 0, session.errors.join('\n'));
  session.scroll.wire();
  await run(session);
  await settle();
  session.scroll.wire();
  assertScroll(session.scroll.state, label);
}

await runAction('uncheck bullet include', async ({ document, window }) => {
  const box = document.querySelector('[data-focus-key="rb-b2-include"]');
  assert.ok(box);
  box.checked = false;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
});

await runAction('toggle bullet pin', async ({ document, window }) => {
  const box = document.querySelector('[data-focus-key="rb-b2-pin"]');
  assert.ok(box);
  box.checked = true;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
});

await runAction('uncheck role include', async ({ document, window }) => {
  const box = document.querySelector('[data-focus-key="rj-rj_scroll-include"]');
  assert.ok(box);
  box.checked = false;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
});

await runAction('hide bullet via remove', async ({ document }) => {
  const row = document.querySelector('[data-focus-key="rb-b2-line"]')?.closest('.bb-rb');
  const remove = row && [...row.querySelectorAll('.btn')].find((node) => node.textContent.trim() === 'Remove');
  assert.ok(remove);
  remove.click();
});

await runAction('add sub-heading', async ({ document }) => {
  const add = [...document.querySelectorAll('.btn')]
    .find((node) => /\+ Sub-heading/.test(node.textContent));
  assert.ok(add);
  add.click();
});

await runAction('reorder bullet down', async ({ document }) => {
  const row = document.querySelector('[data-focus-key="rb-b1-line"]')?.closest('.bb-rb');
  const down = row?.querySelector('.bb-order-btns .btn:last-child');
  assert.ok(down);
  down.click();
});

assert.ok(globalThis.__bbTestResumeScroll?.SCROLL_PANES?.includes('.bb-resume-editor'));
assert.ok(globalThis.__bbTestResumeScroll?.SCROLL_PANES?.includes('#resume-preview-wrap'));

console.log('test-brag-book-resume-editor-scroll.mjs: ok');
