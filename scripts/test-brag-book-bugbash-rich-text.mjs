/**
 * INTENTIONALLY FAILING — bug-bash phase 3.
 *
 * Run after replacing markdown-as-storage with canonical inline spans:
 *   node scripts/test-brag-book-bugbash-rich-text.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resumeBulletSpans,
  resumeFieldsFromExperience,
  spansToMarkdown,
} from '../brag-book/resume-model.js';
import { renderResumeHtml } from '../brag-book/resume-template.js';
import { resumeDocxBytes } from '../brag-book/resume-docx.js';

const editorSpans = [
  { text: 'Alpha ', bold: false },
  { text: ' bold ', bold: true },
  { text: ' and ', bold: false },
  { text: ' italic ', bold: false, italic: true },
  { text: ' omega', bold: false },
];
const editorText = editorSpans.map((span) => span.text).join('');

// The existing markdown bridge is included in the round trip because it is
// where formatting boundaries are currently converted and spaces are lost.
const fields = resumeFieldsFromExperience(editorText, editorSpans);
const renderedSpans = resumeBulletSpans(fields);

assert.equal(spansToMarkdown(editorSpans).replace(/\*+/g, ''), editorText);
assert.equal(
  renderedSpans.map((span) => span.text).join(''),
  editorText,
  'formatting boundaries must preserve every adjacent space',
);
assert.deepEqual(
  renderedSpans,
  editorSpans,
  'bold and italic marks must survive the editor-to-model round trip exactly',
);

const resume = {
  header: { name: 'Space Test', locations: [], links: [] },
  sectionOrder: ['experience'],
  sections: {
    experience: {
      title: 'Work Experience',
      jobs: [{
        id: 'rj_spaces',
        company: 'Example Co',
        title: 'Manager',
        start: '',
        end: '',
        location: '',
        included: true,
        groups: [{
          id: 'rg_spaces',
          heading: '',
          bullets: [{ id: 'rb_spaces', ...fields, included: true }],
        }],
      }],
    },
  },
  fit: { droppedBulletIds: [], fontPt: 10, bulletLineHeight: 1.32 },
};

const html = renderResumeHtml(resume);
const li = html.match(/<li[^>]*>([\s\S]*?)<\/li>/)?.[1] || '';
const previewText = li.replace(/<[^>]+>/g, '');
assert.equal(previewText, editorText, 'the preview text must equal the textbox text byte-for-byte');
assert.match(li, /<b> bold <\/b>/, 'the preview must retain mid-line bold');
assert.match(li, /<i> italic <\/i>/, 'the preview must retain mid-line italic');

const docx = new TextDecoder().decode(resumeDocxBytes(resume));
assert.match(docx, /<w:b\/>[\s\S]*?<w:t xml:space="preserve"> bold <\/w:t>/);
assert.match(docx, /<w:i\/>[\s\S]*?<w:t xml:space="preserve"> italic <\/w:t>/);

const appSource = readFileSync(new URL('../brag-book/app.js', import.meta.url), 'utf8');
const tidySource = appSource.slice(
  appSource.indexOf('function tidySpans'),
  appSource.indexOf('function flattenEditable'),
);
assert.doesNotMatch(
  tidySource,
  /replace\(\/\[ \\t\]\{2,\}\/g,\s*' '\)/,
  'normalizing a contenteditable DOM must not collapse user-authored spaces',
);

console.log('Brag Book rich-text bug-bash regression passed.');
