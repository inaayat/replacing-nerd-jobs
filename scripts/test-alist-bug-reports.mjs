import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeBugReport,
  captureBugContext,
  BUG_MESSAGE_MAX,
  BUG_DETAILS_MAX,
} from '../amc-a-lister/engine/bug-report.js';

assert.equal(normalizeBugReport({}).error, 'Describe the bug in a sentence or two.');
assert.equal(normalizeBugReport({ message: '   ' }).error, 'Describe the bug in a sentence or two.');
assert.equal(normalizeBugReport({ message: 'x'.repeat(BUG_MESSAGE_MAX + 1) }).data.message.length, BUG_MESSAGE_MAX);

const ok = normalizeBugReport({
  message: '  Posters vanished  ',
  details: '  Filtered to Dolby.  ',
  url: 'https://www.inaayat.xyz/amc-a-lister/settings.html',
  user_agent: 'Mozilla/5.0 (iPhone)',
  screenshot: '',
  context: { page: '/amc-a-lister/settings.html', dpr: 2, tv_beta: false },
});
assert.equal(ok.error, undefined);
assert.equal(ok.data.message, 'Posters vanished');
assert.equal(ok.data.details, 'Filtered to Dolby.');
assert.equal(ok.data.url, 'https://www.inaayat.xyz/amc-a-lister/settings.html');
assert.equal(ok.data.user_agent, 'Mozilla/5.0 (iPhone)');
assert.equal(ok.data.screenshot, '');
assert.equal(ok.data.context.page, '/amc-a-lister/settings.html');
assert.equal(ok.data.context.dpr, 2);
assert.equal(ok.data.context.tv_beta, false);

assert.equal(normalizeBugReport({ message: 'x', url: 'javascript:alert(1)' }).data.url, '');
assert.equal(normalizeBugReport({ message: 'x', screenshot: 'not-an-image' }).error, 'Screenshots must be a PNG, JPEG, WebP, or GIF.');
assert.ok(normalizeBugReport({
  message: 'x',
  screenshot: `data:image/png;base64,${'A'.repeat(20)}`,
}).data.screenshot.startsWith('data:image/png;base64,'));
assert.match(
  normalizeBugReport({ message: 'x', screenshot: `data:image/png;base64,${'A'.repeat(400_001)}` }).error,
  /250 KB/,
);
assert.equal(normalizeBugReport({ message: 'x', details: 'y'.repeat(BUG_DETAILS_MAX + 8) }).data.details.length, BUG_DETAILS_MAX);
assert.deepEqual(normalizeBugReport({ message: 'x', context: ['nope'] }).data.context, {});
assert.equal(typeof captureBugContext(), 'object');

const dbSrc = readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
assert.match(dbSrc, /CREATE TABLE IF NOT EXISTS alist_bug_reports/, 'production schema uses IF NOT EXISTS');
assert.match(dbSrc, /status\s+TEXT NOT NULL DEFAULT 'open'/, 'new reports start open');
assert.match(dbSrc, /screenshot\s+TEXT/, 'optional screenshot column');

const sqlFile = readFileSync(new URL('./sql/alist-bug-reports.sql', import.meta.url), 'utf8');
assert.match(sqlFile, /CREATE TABLE IF NOT EXISTS alist_bug_reports/, 'standalone SQL migration is safe to re-run');

const api = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
assert.match(api, /normalizeBugReport/, 'API validates through the shared helper');
assert.match(api, /req\.method !== 'POST'/, 'bug reports are POST-only');
assert.match(api, /requireUser/, 'bug reports require a signed-in user');
assert.doesNotMatch(api, /mailto:|nodemailer|resend|fetch\('https:\/\/hooks/, 'bug reports are not emailed or posted out');

const settings = readFileSync(new URL('../amc-a-lister/engine/settings.js', import.meta.url), 'utf8');
assert.match(settings, /Nothing is emailed/, 'UI says reports stay in-app');
assert.match(settings, /bugReportApi\.create/, 'settings posts to the bug-report route');

console.log('alist bug report tests passed');
