/**
 * Full-book export: lossless JSON and print-ready HTML/PDF shell.
 * Browser-safe ESM — read-only; never mutates the store.
 */

import {
  serializeBook,
  normalizeStore,
  compilePrep,
  compileResumeDoc,
  starFill,
  activeResumeSnapshots,
  resumeSnapshotToDoc,
  libraryCatalogGroups,
} from './engine.js';
import { esc, renderResumeHtml } from './resume-template.js';
import { knowledgeDocForEditor } from './knowledge-doc.js';

export const BOOK_EXPORT_SECTIONS = [
  { id: 'resume-basics', title: 'Resume basics' },
  { id: 'jobs', title: 'Jobs' },
  { id: 'resume-bullets', title: 'Resume bullets & STAR' },
  { id: 'knowledge', title: 'Knowledge' },
  { id: 'postings', title: 'Postings' },
  { id: 'saved-resumes', title: 'Saved resumes' },
];

const HEADING_TYPES = new Set(['h1', 'h2', 'h3']);

function renderSpans(spans) {
  return (spans || []).map((span) => {
    const text = esc(span?.text).replaceAll('\n', '<br>');
    if (span?.bold && span?.italic && span?.code) return `<strong><em><code>${text}</code></em></strong>`;
    if (span?.bold && span?.code) return `<strong><code>${text}</code></strong>`;
    if (span?.italic && span?.code) return `<em><code>${text}</code></em>`;
    if (span?.code) return `<code>${text}</code>`;
    if (span?.bold && span?.italic) return `<strong><em>${text}</em></strong>`;
    if (span?.bold) return `<strong>${text}</strong>`;
    if (span?.italic) return `<em>${text}</em>`;
    return text;
  }).join('');
}

function renderKnowledgeTable(block) {
  const rows = block.rows || [];
  if (!rows.length) return '';
  const align = block.align || [];
  const cellTag = (rowIndex, cell, colIndex) => {
    const tag = rowIndex === 0 ? 'th' : 'td';
    const style = `text-align:${esc(align[colIndex] || 'left')}`;
    return `<${tag} style="${style}">${renderSpans(cell?.spans)}</${tag}>`;
  };
  const body = rows.map((row, rowIndex) => {
    const cells = (row.cells || []).map((cell, colIndex) => cellTag(rowIndex, cell, colIndex)).join('');
    return `<tr class="bb-export-table-row">${cells}</tr>`;
  }).join('');
  return `<table class="bb-export-table"><tbody>${body}</tbody></table>`;
}

export function renderKnowledgeDocHtml(doc) {
  const blocks = knowledgeDocForEditor(doc);
  let html = '';
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === 'table') {
      html += renderKnowledgeTable(block);
      i += 1;
      continue;
    }
    if (block.type === 'li') {
      html += '<ul class="bb-export-list">';
      while (i < blocks.length && blocks[i].type === 'li') {
        const li = blocks[i];
        const pad = Math.min(Number(li.indent) || 0, 6) * 1.1;
        html += `<li class="bb-export-li" style="margin-left:${pad}em">${renderSpans(li.spans)}</li>`;
        i += 1;
      }
      html += '</ul>';
      continue;
    }
    const tag = block.type === 'p' ? 'p' : block.type;
    if (HEADING_TYPES.has(tag)) {
      html += `<${tag} class="bb-export-kb-heading">${renderSpans(block.spans)}</${tag}>`;
    } else {
      html += `<${tag}>${renderSpans(block.spans)}</${tag}>`;
    }
    i += 1;
  }
  return html;
}

function renderStarFields(detail) {
  const parts = [
    ['Situation', detail?.situation],
    ['Task', detail?.task],
    ['Action', detail?.action],
    ['Result', detail?.result],
  ].filter(([, value]) => String(value || '').trim());
  if (!parts.length) return '';
  const rows = parts.map(([label, value]) => (
    `<div class="bb-export-star"><span class="bb-export-star-k">${esc(label)}</span><span>${esc(value).replaceAll('\n', '<br>')}</span></div>`
  )).join('');
  const notes = String(detail?.notes || '').trim();
  const notesHtml = notes
    ? `<div class="bb-export-star"><span class="bb-export-star-k">Notes</span><span>${esc(notes).replaceAll('\n', '<br>')}</span></div>`
    : '';
  return `<div class="bb-export-star-block">${rows}${notesHtml}</div>`;
}

function jobLabel(job) {
  return [job?.company, job?.title].filter(Boolean).join(' · ') || 'Role';
}

function sectionShell(id, title, inner) {
  if (!String(inner || '').trim()) return '';
  return `<section class="bb-export-section" id="${esc(id)}" aria-labelledby="${esc(id)}-heading">
    <h1 id="${esc(id)}-heading">${esc(title)}</h1>
    ${inner}
  </section>`;
}

function renderResumeBasicsSection(store) {
  const doc = compileResumeDoc(null, store);
  const inner = renderResumeHtml(doc, { droppedBulletIds: [] });
  return `<div class="bb-export-resume-sheet">${inner}</div>`;
}

function renderJobsSection(store) {
  const jobs = store?.jobs || [];
  if (!jobs.length) return '<p class="bb-export-quiet">No career jobs on file.</p>';
  return jobs.map((job) => {
    const groups = (job.groups || []).map((group) => {
      const bullets = (group.bullets || []).map((b) => {
        const text = (b.lead || b.body || '').trim();
        if (!text) return '';
        return `<li class="bb-export-bullet">${esc(text)}</li>`;
      }).filter(Boolean).join('');
      const heading = group.heading ? `<h3>${esc(group.heading)}</h3>` : '';
      return bullets ? `${heading}<ul>${bullets}</ul>` : '';
    }).join('');
    const dates = [job.start, job.end].filter(Boolean).join(' – ');
    return `<article class="bb-export-job">
      <h2>${esc(jobLabel(job))}</h2>
      <p class="bb-export-meta">${esc([dates, job.location].filter(Boolean).join(' · '))}</p>
      ${groups || '<p class="bb-export-quiet">No bullets in library groups.</p>'}
    </article>`;
  }).join('<hr class="bb-export-rule">');
}

function renderResumeBulletArticle(store, entry) {
  const star = starFill(entry);
  const job = (store.jobs || []).find((row) => row.id === entry.jobId);
  const meta = [jobLabel(job), entry.when].filter(Boolean).join(' · ');
  return `<article class="bb-export-entry">
    <h3>${esc(entry.title || 'Untitled')}</h3>
    <p class="bb-export-meta">${esc(meta)}${star.ready ? '' : ` · STAR ${star.filled}/${star.total}`}</p>
    ${renderStarFields(entry)}
  </article>`;
}

function renderResumeBulletsSection(store) {
  const entries = store?.entries || [];
  if (!entries.length) return '<p class="bb-export-quiet">No resume bullets in the library.</p>';
  const groups = libraryCatalogGroups(store);
  if (!groups.length) return renderResumeBulletsSectionFlat(store);
  return groups.map((group) => {
    const dates = group.dates ? ` · ${esc(group.dates)}` : '';
    const sections = (group.sections || []).map((section) => {
      if (section.kind === 'experience') {
        const bullets = section.rows.map((row) => {
          const entry = entries.find((item) => item.id === row.id);
          return entry ? renderResumeBulletArticle(store, entry) : '';
        }).join('');
        return `<div class="bb-export-xp">
          <h3>${esc(section.label)} <span class="bb-export-meta">(${section.versionCount} version${section.versionCount === 1 ? '' : 's'})</span></h3>
          ${bullets}
        </div>`;
      }
      const loose = section.rows.map((row) => {
        const entry = entries.find((item) => item.id === row.id);
        return entry ? renderResumeBulletArticle(store, entry) : '';
      }).join('');
      const label = section.label
        ? `<p class="bb-export-meta">${esc(section.label)}</p>`
        : '';
      return `${label}${loose}`;
    }).join('');
    return `<article class="bb-export-job-group">
      <h2>${esc(group.label)}${dates}</h2>
      ${sections || '<p class="bb-export-quiet">No bullets.</p>'}
    </article>`;
  }).join('<hr class="bb-export-rule">');
}

function renderResumeBulletsSectionFlat(store) {
  return (store?.entries || []).map((entry) => {
    const star = starFill(entry);
    const job = (store.jobs || []).find((row) => row.id === entry.jobId);
    const meta = [jobLabel(job), entry.when].filter(Boolean).join(' · ');
    return `<article class="bb-export-entry">
      <h2>${esc(entry.title || 'Untitled')}</h2>
      <p class="bb-export-meta">${esc(meta)}${star.ready ? '' : ` · STAR ${star.filled}/${star.total}`}</p>
      ${renderStarFields(entry)}
    </article>`;
  }).join('<hr class="bb-export-rule">');
}

function renderKnowledgeSection(store) {
  const notes = store?.knowledge || [];
  if (!notes.length) return '<p class="bb-export-quiet">No knowledge pages.</p>';
  return notes.map((note) => (
    `<article class="bb-export-kb" id="kb-${esc(note.id)}">
      <h2>${esc(note.title || 'Note')}</h2>
      ${note.tags?.length ? `<p class="bb-export-meta">${esc(note.tags.join(', '))}</p>` : ''}
      <div class="bb-export-kb-body">${renderKnowledgeDocHtml(note.doc)}</div>
    </article>`
  )).join('<hr class="bb-export-rule">');
}

function renderPostingsSection(store) {
  const postings = store?.postings || [];
  if (!postings.length) return '<p class="bb-export-quiet">No job postings.</p>';
  return postings.map((posting) => {
    const cards = compilePrep(store, posting);
    const reqs = cards.map((req) => {
      const bullets = (req.bulletDetails || []).map((detail) => (
        `<div class="bb-export-mapped">
          <h4>${esc(detail.title || detail.text || 'Bullet')}</h4>
          ${renderStarFields(detail)}
        </div>`
      )).join('');
      const questions = (req.questions || []).map((q) => (
        `<div class="bb-export-question">
          <h4>${esc(q.text)}</h4>
          ${q.answer ? `<p>${esc(q.answer).replaceAll('\n', '<br>')}</p>` : ''}
          ${renderStarFields(q)}
        </div>`
      )).join('');
      const stories = (req.stories || []).map((story) => (
        `<div class="bb-export-story">
          <h4>${esc(story.title)}</h4>
          ${renderStarFields(story)}
        </div>`
      )).join('');
      const summary = req.bullets?.length
        ? `<ul>${req.bullets.map((line) => `<li class="bb-export-bullet">${esc(line)}</li>`).join('')}</ul>`
        : '';
      return `<div class="bb-export-req">
        <h3>${esc(req.text || 'Requirement')}</h3>
        ${summary}
        ${bullets}
        ${questions}
        ${stories}
      </div>`;
    }).join('');
    return `<article class="bb-export-posting" id="posting-${esc(posting.id)}">
      <h2>${esc([posting.title, posting.company].filter(Boolean).join(' · ') || 'Posting')}</h2>
      <p class="bb-export-meta">${esc(posting.status || '')}</p>
      ${reqs || '<p class="bb-export-quiet">No requirements yet.</p>'}
    </article>`;
  }).join('<hr class="bb-export-rule">');
}

function renderSavedResumesSection(store) {
  const rows = activeResumeSnapshots(store);
  if (!rows.length) return '<p class="bb-export-quiet">No saved resume snapshots.</p>';
  return rows.map((snapshot) => {
    const doc = resumeSnapshotToDoc(snapshot);
    const name = snapshot.name || snapshot.initialName || 'Saved resume';
    const savedAt = snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleString() : '';
    const body = doc ? renderResumeHtml(doc, { droppedBulletIds: snapshot.fit?.droppedBulletIds }) : '';
    return `<article class="bb-export-snapshot" id="snapshot-${esc(snapshot.id)}">
      <h2>${esc(name)}</h2>
      <p class="bb-export-meta">${esc(savedAt)}</p>
      <div class="bb-export-resume-sheet">${body}</div>
    </article>`;
  }).join('<hr class="bb-export-rule">');
}

function renderTableOfContents(extraLinks = []) {
  const items = [
    ...BOOK_EXPORT_SECTIONS.map((row) => ({ href: `#${row.id}`, label: row.title })),
    ...extraLinks,
  ];
  return `<nav class="bb-export-toc" aria-label="Table of contents">
    <h2>Contents</h2>
    <ol>${items.map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`).join('')}</ol>
  </nav>`;
}

export const BOOK_EXPORT_PRINT_CSS = `
@page { size: letter; margin: 0.65in; }
@page { @bottom-center { content: counter(page); font: 10pt system-ui, sans-serif; color: #666; } }
* { box-sizing: border-box; }
body.bb-book-export {
  margin: 0;
  font: 11pt/1.45 system-ui, -apple-system, Segoe UI, sans-serif;
  color: #1a1a1a;
  background: #fff;
}
.bb-export-cover {
  min-height: 85vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  page-break-after: always;
}
.bb-export-cover h1 { font-size: 2rem; margin: 0 0 0.35em; font-weight: 600; }
.bb-export-cover .bb-export-sub { color: #555; margin: 0; }
.bb-export-toc { page-break-after: always; }
.bb-export-toc ol { margin: 0; padding-left: 1.25em; }
.bb-export-toc a { color: #0b57d0; text-decoration: none; }
.bb-export-toc a:hover { text-decoration: underline; }
.bb-export-section { margin: 0 0 2rem; }
.bb-export-section > h1 {
  font-size: 1.35rem;
  font-weight: 600;
  margin: 0 0 1rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid #ccc;
  page-break-after: avoid;
}
.bb-export-section h2 { font-size: 1.05rem; margin: 1.25rem 0 0.35rem; page-break-after: avoid; }
.bb-export-section h3 { font-size: 0.98rem; margin: 1rem 0 0.25rem; page-break-after: avoid; }
.bb-export-section h4 { font-size: 0.92rem; margin: 0.75rem 0 0.2rem; page-break-after: avoid; }
.bb-export-meta { color: #555; font-size: 0.92rem; margin: 0 0 0.5rem; }
.bb-export-quiet { color: #666; font-style: italic; }
.bb-export-rule { border: none; border-top: 1px solid #ddd; margin: 1.25rem 0; }
.bb-export-bullet, .bb-export-li, .bb-export-table-row, .bb-export-star-block, .bb-export-mapped, .bb-export-question {
  break-inside: avoid;
  page-break-inside: avoid;
}
.bb-export-star-block { margin: 0.35rem 0 0.75rem; padding-left: 0.5rem; border-left: 2px solid #e0e0e0; }
.bb-export-star { display: grid; grid-template-columns: 5.5em 1fr; gap: 0.35em 0.75em; margin: 0.25em 0; }
.bb-export-star-k { font-size: 0.85rem; font-weight: 600; color: #444; text-transform: uppercase; letter-spacing: 0.02em; }
.bb-export-table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; table-layout: fixed; }
.bb-export-table th, .bb-export-table td {
  border-bottom: 1px solid #ddd;
  padding: 0.35em 0.5em;
  vertical-align: top;
  word-wrap: break-word;
}
.bb-export-table th { font-weight: 600; background: #fafafa; }
.bb-export-list { margin: 0.35rem 0 0.75rem; padding-left: 1.25em; }
.bb-export-kb-body { max-width: 100%; }
.bb-export-resume-sheet header h1 { font-size: 1.25rem; }
.bb-export-resume-sheet .sec h2 { font-size: 1rem; border-bottom: 1px solid #ccc; }
.bb-export-resume-sheet ul { margin: 0.25rem 0; padding-left: 1.1em; }
.bb-export-resume-sheet li { break-inside: avoid; page-break-inside: avoid; }
@media print {
  body.bb-book-export { print-color-adjust: exact; }
  a { color: #0b57d0; }
}
`;

/** Lossless JSON text suitable for Import book (normalizeStore on read). */
export function exportBookJsonText(store) {
  const { book } = serializeBook(store);
  return JSON.stringify(book, null, 2);
}

export function exportBookJsonFilename(store) {
  const name = String(store?.profile?.name || 'brag-book').replace(/[^\w.-]+/g, '_').slice(0, 48);
  return `${name || 'brag-book'}.json`;
}

/** Full HTML document for print / Save as PDF. Read-only. */
export function buildBookExportDocument(store, { exportedAt = new Date() } = {}) {
  const profileName = store?.profile?.name || 'Brag Book';
  const dateLabel = exportedAt instanceof Date && !Number.isNaN(exportedAt.getTime())
    ? exportedAt.toLocaleString()
    : String(exportedAt || '');

  const extraToc = [];
  for (const note of store?.knowledge || []) {
    if (note?.title) extraToc.push({ href: `#kb-${note.id}`, label: note.title });
  }
  for (const posting of store?.postings || []) {
    const label = [posting.title, posting.company].filter(Boolean).join(' · ');
    if (label) extraToc.push({ href: `#posting-${posting.id}`, label });
  }

  const sections = [
    sectionShell('resume-basics', 'Resume basics', renderResumeBasicsSection(store)),
    sectionShell('jobs', 'Jobs', renderJobsSection(store)),
    sectionShell('resume-bullets', 'Resume bullets & STAR', renderResumeBulletsSection(store)),
    sectionShell('knowledge', 'Knowledge', renderKnowledgeSection(store)),
    sectionShell('postings', 'Postings', renderPostingsSection(store)),
    sectionShell('saved-resumes', 'Saved resumes', renderSavedResumesSection(store)),
  ].filter(Boolean).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(profileName)} — Brag Book export</title>
  <style>${BOOK_EXPORT_PRINT_CSS}</style>
</head>
<body class="bb-book-export">
  <header class="bb-export-cover">
    <h1>${esc(profileName)}</h1>
    <p class="bb-export-sub">Brag Book · exported ${esc(dateLabel)}</p>
  </header>
  ${renderTableOfContents(extraToc)}
  ${sections}
</body>
</html>`;
}

/** Test helper: parsed export round-trips through normalizeStore. */
export function parseExportedBookJson(text) {
  return normalizeStore(JSON.parse(String(text || '{}')));
}

/** Stable JSON snapshot for equality checks in tests. */
export function normalizedBookSnapshot(store) {
  return serializeBook(store).book;
}
