/**
 * Desktop/DOM lock for the Brag Book mobile pass.
 *
 * Mobile implementation may add max-width/coarse-pointer overrides and
 * additive JS paths. It must not rewrite the desktop layout, route DOM,
 * drag/export paths, STAR structure, or save lifecycle hooks asserted here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseViewHash, viewHash } from '../brag-book/routes.js';
import {
  resumePreviewScale,
  resumePreviewWrapHeight,
  RESUME_PAGE_HEIGHT_PX,
} from '../brag-book/resume-fit.js';

const css = readFileSync(new URL('../brag-book/app.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../brag-book/index.html', import.meta.url), 'utf8');

function cssRule(pattern, label) {
  const match = css.match(pattern);
  assert.ok(match, `missing desktop CSS rule: ${label}`);
  return match[0];
}

function sourceSection(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing source section start: ${start}`);
  assert.ok(to > from, `missing source section end: ${end}`);
  return app.slice(from, to);
}

// Static navigation order and destinations are desktop and mobile contracts.
const dom = new JSDOM(html);
const nav = [...dom.window.document.querySelectorAll('.nav-links a')];
assert.deepEqual(
  nav.map((link) => [link.textContent.trim(), link.getAttribute('href')]),
  [
    ['Start', '#home'],
    ['Job postings', '#jobs'],
    ['Resume', '#profile'],
    ['Resume bullets', '#experiences'],
    ['Knowledge', '#kb'],
    ['Projects', '/#projects'],
    ['Log in', '#bb-auth'],
  ],
);
assert.equal(
  dom.window.document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
  'width=device-width, initial-scale=1, viewport-fit=cover',
);

// Route round-trips: mobile work must not drop or redirect a feature.
const routeContext = {
  entryIds: ['entry-1'],
  postingIds: ['posting-1'],
  knowledgeIds: ['knowledge-1'],
};
const views = [
  { kind: 'home' },
  { kind: 'jobs' },
  { kind: 'jobs', id: 'new' },
  { kind: 'jobs', id: 'posting-1' },
  { kind: 'jobs', id: 'posting-1', mode: 'prep' },
  { kind: 'jobs', id: 'posting-1', mode: 'resume' },
  { kind: 'jobs', id: 'posting-1', mode: 'bullet', reqId: 'req-1', bulletId: 'bullet-1' },
  { kind: 'profile' },
  { kind: 'log' },
  { kind: 'log', id: 'new' },
  { kind: 'log', id: 'entry-1' },
  { kind: 'kb' },
  { kind: 'kb', id: 'new' },
  { kind: 'kb', id: 'knowledge-1' },
];
for (const view of views) {
  assert.deepEqual(parseViewHash(viewHash(view), routeContext), view, `route changed: ${viewHash(view)}`);
}

// Base desktop typography and primary layouts. Mobile changes belong in
// overrides; changing these declarations changes desktop at 1024px+.
const rootType = cssRule(/html, body\s*\{[^}]*\}/, 'html/body');
assert.match(rootType, /font-size:\s*13px/);
assert.match(rootType, /line-height:\s*1\.4/);

const navRule = cssRule(/(?:^|\n)\.nav\s*\{[^}]*\}/, 'nav');
assert.match(navRule, /display:\s*flex/);
assert.match(navRule, /justify-content:\s*space-between/);
assert.match(navRule, /position:\s*sticky/);

const navLinksRule = cssRule(/\.nav-links\s*\{[^}]*\}/, 'nav links');
assert.match(navLinksRule, /display:\s*flex/);
assert.match(navLinksRule, /gap:\s*13px/);
assert.match(navLinksRule, /flex-wrap:\s*wrap/);

const layoutRule = cssRule(/(?:^|\n)\.layout\s*\{[^}]*\}/, 'main layout');
assert.match(layoutRule, /grid-template-columns:\s*minmax\(180px,\s*16vw\)\s+minmax\(0,\s*1fr\)/);
assert.match(layoutRule, /gap:\s*12px/);

const startRule = cssRule(/\.start-grid\s*\{[^}]*\}/, 'Start grid');
assert.match(startRule, /grid-template-columns:\s*1fr\s+1fr/);

const tableRule = cssRule(/\.job-table\s*\{[^}]*\}/, 'posting table');
assert.match(tableRule, /width:\s*100%/);
assert.match(tableRule, /table-layout:\s*fixed/);

const resumeSplitRule = cssRule(
  /\.bb-resume-split\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*1fr\)[^}]*\}/,
  'resume split',
);
assert.match(
  resumeSplitRule,
  /grid-template-columns:\s*minmax\(280px,\s*1fr\)\s+minmax\(0,\s*1\.2fr\)/,
);
const resumePreviewRule = cssRule(
  /\.bb-resume-preview\s*\{[^}]*position:\s*sticky[^}]*\}/,
  'resume preview',
);
assert.match(resumePreviewRule, /position:\s*sticky/);
assert.match(resumePreviewRule, /top:\s*56px/);
const resumeFrameRule = cssRule(/\.bb-resume-frame\s*\{[^}]*\}/, 'resume frame');
assert.match(resumeFrameRule, /width:\s*8\.5in/);
assert.match(resumeFrameRule, /height:\s*11in/);

const experienceRule = cssRule(/\.bb-exp-row\s*\{[^}]*\}/, 'Resume bullets card');
assert.match(
  experienceRule,
  /grid-template-columns:\s*minmax\(15rem,\s*0\.85fr\)\s+minmax\(0,\s*1\.35fr\)/,
);
assert.match(experienceRule, /align-items:\s*start/);

// The 7591179 full-width fix and thin-divider stack are explicit locks.
const starRule = cssRule(/\.bb-star-stack\s*\{[^}]*\}/, 'STAR stack');
assert.match(starRule, /display:\s*flex/);
assert.match(starRule, /flex-direction:\s*column/);
assert.match(starRule, /align-items:\s*stretch/);
assert.match(starRule, /width:\s*100%/);
assert.match(starRule, /max-width:\s*100%/);
const starSegmentRule = cssRule(
  /\.bb-star-stack > \.bb-star-cell,\s*\.bb-star-stack > \.field\s*\{[^}]*\}/,
  'STAR segment',
);
assert.match(starSegmentRule, /border-top:\s*1px solid var\(--line\)/);
assert.match(starSegmentRule, /width:\s*100%/);
const sharedShellRule = cssRule(
  /\.experience-editor \.bb-shared-bullet\s*\{[^}]*\}/,
  'Shared experience shell',
);
assert.match(sharedShellRule, /width:\s*100%/);
assert.match(sharedShellRule, /max-width:\s*100%/);

const knowledgeRule = cssRule(/\.bb-kb\s*\{[^}]*\}/, 'Knowledge split');
assert.match(knowledgeRule, /grid-template-columns:\s*minmax\(14rem,\s*18rem\)\s+1fr/);
const knowledgeSheetRule = cssRule(/\.bb-kb-sheet\s*\{[^}]*\}/, 'Knowledge sheet');
assert.match(knowledgeSheetRule, /border-radius:\s*7px/);
assert.match(knowledgeSheetRule, /box-shadow:/);

const jobsRule = cssRule(/\.bb-job-catalog-row\s*\{[^}]*\}/, 'Jobs catalog');
assert.match(jobsRule, /minmax\(18rem,\s*1\.7fr\)/);
assert.match(jobsRule, /grid-template-columns:[^;]*auto/);

// Keep current breakpoint behavior at the desktop boundary. New mobile rules
// may be added at 1023px or below, but 1024px retains these current contracts.
assert.match(
  css,
  /@media \(max-width:\s*1100px\)\s*\{[^}]*\.bb-job-catalog-row\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
);
assert.match(
  css,
  /@media \(max-width:\s*980px\)\s*\{[^}]*\.bb-exp-row\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
);
assert.match(
  css,
  /@media \(max-width:\s*860px\)[\s\S]*?\.bb-resume-split\s*\{\s*grid-template-columns:\s*1fr/,
);
assert.match(
  css,
  /@media \(max-width:\s*860px\)[\s\S]*?\.bb-kb\s*\{\s*grid-template-columns:\s*1fr/,
);

// Route DOM constructors keep the same desktop structures.
const sharedForm = sourceSection('function sharedBulletForm', 'function experienceControl');
assert.match(sharedForm, /class:\s*'bb-shared-bullet'/);
assert.match(sharedForm, /class:\s*'experience-star bb-star-stack'/);

const experienceRow = sourceSection('function experienceRow', 'function experienceTable');
assert.match(experienceRow, /class:\s*'bb-exp-row'/);
assert.match(experienceRow, /class:\s*'bb-exp-lead'/);
assert.match(experienceRow, /class:\s*'bb-exp-stargrid bb-star-stack'/);

const requirementTable = sourceSection('function requirementTable', 'function jobDetailsDisclosure');
assert.match(requirementTable, /el\('table',\s*\{\s*class:\s*'job-table'/);
assert.match(requirementTable, /'Job requirement'/);
assert.match(requirementTable, /'Experiences'/);

const resumeWorkspace = sourceSection('function resumeWorkspace', 'function resumeChooser');
assert.match(resumeWorkspace, /class:\s*'bb-resume-split'/);
assert.match(resumeWorkspace, /resumeEditorPane\(posting,\s*doc\)/);
assert.match(resumeWorkspace, /resumePreviewPane\(\)/);
assert.match(resumeWorkspace, /exportResumePdf\(posting\)/);
assert.match(resumeWorkspace, /exportResumeDocx\(posting\)/);

const previewPane = sourceSection('function resumePreviewPane', 'function resumeSectionOrder');
assert.match(previewPane, /id:\s*'resume-preview-frame'/);
assert.match(previewPane, /class:\s*'bb-resume-frame'/);
assert.match(previewPane, /id:\s*'resume-preview-wrap'/);

const knowledgeWorkspace = sourceSection('function knowledgeWorkspace', 'function jobForm');
assert.match(knowledgeWorkspace, /class:\s*'bb-kb'/);
assert.match(knowledgeWorkspace, /class:\s*'bb-kb-list'/);
assert.match(knowledgeWorkspace, /class:\s*'bb-kb-editor/);

// Desktop drag, touch pointer drag, rich shortcuts, and export paths all stay.
const drag = sourceSection('function bindResumeRowDrag', 'function resumeRoleRows');
for (const eventName of ['dragstart', 'dragover', 'drop', 'dragend', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
  assert.match(drag, new RegExp(`addEventListener\\('${eventName}'`), `missing ${eventName} reorder path`);
}
const rich = sourceSection('function bindRichKeys', 'function richLine');
assert.match(rich, /execCommand\('bold'\)/);
assert.match(rich, /execCommand\('italic'\)/);
assert.match(app, /downloadBlob\(`\$\{name\}\.docx`,\s*resumeDocxBlob\(doc\)\)/);
assert.match(app, /frame\.contentWindow\.print\(\)/);

// Responsive work must not alter the save lifecycle boundary.
assert.match(app, /window\.addEventListener\('hashchange'/);
assert.match(app, /window\.addEventListener\('pagehide'/);
assert.match(app, /window\.addEventListener\('beforeunload'/);
assert.match(app, /document\.addEventListener\('visibilitychange'/);

// Mobile overrides must live in narrow/coarse queries, not in base desktop rules.
assert.match(
  css,
  /@media \(max-width:\s*1023px\)[\s\S]*?\.bb-resume-split\s*\{\s*grid-template-columns:\s*1fr/,
  'tablet resume stack at 1023px',
);
assert.match(
  css,
  /@media \(max-width:\s*860px\)[\s\S]*?\.nav-links\s*\{[^}]*overflow-x:\s*auto/,
  'phone nav horizontal scroll strip',
);
const coarseBlocks = css.match(/@media \(pointer:\s*coarse\)\s*\{[\s\S]*?\n\}/g) || [];
const coarseCss = coarseBlocks.join('\n');
assert.match(coarseCss, /\.field input,/);
assert.match(coarseCss, /\.table-req-text,/);
assert.match(coarseCss, /\.field \.bb-rb-line,/);
assert.match(coarseCss, /\.nav-links a\s*\{[^}]*min-height:\s*44px/);

assert.equal(resumePreviewScale(200), 0.28);
assert.ok(Math.abs(resumePreviewScale(360) - 0.431) < 0.02);
assert.ok(Math.abs(resumePreviewScale(390) - 0.468) < 0.02);
assert.ok(Math.abs(resumePreviewScale(430) - 0.517) < 0.02);
assert.ok(resumePreviewScale(816) >= 0.98);
assert.equal(resumePreviewScale(900), 1);
assert.equal(
  resumePreviewWrapHeight(resumePreviewScale(360)),
  RESUME_PAGE_HEIGHT_PX * resumePreviewScale(360) + 12,
);

console.log('Brag Book mobile desktop/DOM lock passed.');
