/** FAQ & set up — Settings (top) and the first-run rate setup screen. */

import { EXAMPLE_IMPORT_JSON } from './import-watch.js';
import { escapeHtml } from './format.js';

function faqItem(question, answer) {
  return `
    <details class="al-faq-item">
      <summary class="al-faq-q">${question}</summary>
      <p class="al-faq-a">${answer}</p>
    </details>
  `;
}

function faqSection(title, items) {
  return `
    <section class="al-faq-section">
      <h3 class="al-faq-section-title">${title}</h3>
      ${items.join('')}
    </section>
  `;
}

function faqBody() {
  return [
    faqSection('Getting started', [
      faqItem(
        'How do I finish setup?',
        'Set your monthly A-List rate in Membership pricing on this page. Date plus price is enough. The rest of A-Lister works after you save.',
      ),
      faqItem(
        'How do I log a screening?',
        'Use the bar at the top of every page. Date and title are enough. Theater and ticket price feed Stats savings. Format, seat, notes, rating, and Seen with are optional.',
      ),
      faqItem(
        'What is the Watch page?',
        'Movies you want to see, sorted by US release date. Logging a film removes it from this list. Watch at home is a separate flag on those titles.',
      ),
    ]),
    faqSection('Logging &amp; watch log', [
      faqItem(
        'Where is my history?',
        'Log is your full diary. Search and filter, then tap a poster for format, seat, who you went with, and movie details. Edit or delete from there.',
      ),
      faqItem(
        'In theaters vs at home?',
        'Uncheck In theaters when you watched at home. At-home entries stay in the log and Rank, but they do not use a theater, ticket price, or Seen with, and they do not count toward A-List savings.',
      ),
      faqItem(
        'How does Rank work?',
        'Rank is a stack of titles you have already logged. Unranked queues every logged title that is not in the stack. Compare two posters to insert a new one.',
      ),
    ]),
    faqSection('Membership pricing &amp; savings', [
      faqItem(
        'What if my A-List price changes?',
        'Add a new row in Membership pricing with the effective date and the new price. Older months keep the old rate. Stats picks the last row whose date falls in that calendar month.',
      ),
      faqItem(
        'How do I pause membership?',
        'Add a $0 row starting the pause date, then a row with your real price when it resumes. Only do this if you saw no movies on A-List during the pause. If you logged theater screenings in those months, a $0 rate makes savings look falsely high because ticket prices still count against a $0 bill.',
      ),
      faqItem(
        'How are savings calculated?',
        'Only theater screenings count. Stats bills one monthly rate for every calendar month from your first theater screening through this month — including months you skipped. Savings is the sum of those ticket prices minus those monthly charges. At-home watches are ignored.',
      ),
    ]),
    faqSection('Import / export', [
      faqItem(
        'How do I import my watch log?',
        'On this page under Library: Download import template, fill the Watches sheet (Watch date and Movie title required), delete the two sample rows, then Upload filled template. Same date, title, and theater as an existing row is skipped.',
      ),
      faqItem(
        'How do I export, edit, and re-import?',
        'Export my watch log downloads your current entries in the same template. Edit in Excel, Google Sheets, or Numbers, then upload. The date + title + theater rule skips rows that are already in your log, so a round-trip does not create duplicates.',
      ),
      faqItem(
        'What belongs in each template column?',
        'Watch date is YYYY-MM-DD. Theater, format, ticket price in dollars, seat, auditorium, companions (A-Lister usernames, comma-separated), rating 1–5 or DNF, notes, Where (In theaters or At home), and Saw alone. Ticket price 19.99 means $19.99, not 19.99 cents.',
      ),
      faqItem(
        'Can I paste JSON instead?',
        `Yes — Library still accepts a JSON array for advanced imports. Flexible keys work (theater or theatre or location, ticket_price or cost or ticket_cents). Dollar strings like $15.99 parse as dollars. Integer ticket_cents stays cents, matching older pastes. Example: ${escapeHtml(EXAMPLE_IMPORT_JSON.replace(/\s+/g, ' ').trim())}`,
      ),
    ]),
    faqSection('Sharing &amp; friends', [
      faqItem(
        'How do I add someone to a movie?',
        'On a theater log entry, type their A-Lister username in Seen with. If they already logged the same movie on the same date, you are tagged as watched together immediately. Otherwise they get a pending showing invite with the movie, theater, and ticket cost.',
      ),
      faqItem(
        'What happens when someone invites me?',
        'Showing invites appear on your Watch log. Accept adds it to your log, or tags an existing same-date/movie row — never a duplicate. Deny dismisses it. Invites you sent live on this Settings page; you can delete one before they respond.',
      ),
    ]),
    faqSection('Leaderboard &amp; privacy', [
      faqItem(
        'When does my profile show on the leaderboard?',
        'Only after you turn on Public profile. Until then your name, counts, and savings stay private. Public profile shares name, counts, savings, and ratings — never email, and never at-home watches. Hide theaters if you want the rest public without venues.',
      ),
    ]),
    faqSection('Letterboxd', [
      faqItem(
        'How does Letterboxd import work?',
        'Connect your Letterboxd username in the profile card above. Diary films land in a review inbox so you can mark In theaters or At home. Opening the Watch log or inbox checks the feed (about the last 50 entries), at most every 15 minutes. Same film within a day is a duplicate; a film already in your log is skipped unless Letterboxd marked it a rewatch. Nothing is posted back to Letterboxd.',
      ),
    ]),
    faqSection('TV', [
      faqItem(
        'How do I track TV?',
        'Turn on TV Shows under Beta on this page. It adds a TV nav item for series, separate from theater movies. TV does not use A-List savings, theaters, or showing invites.',
      ),
    ]),
    faqSection('Troubleshooting / report a bug', [
      faqItem(
        'Something looks wrong. What should I try?',
        'Refresh after a save. If posters are missing, Backfill posters in Library fills artwork and TMDB ids without changing theater, cost, rating, or date.',
      ),
      faqItem(
        'How do I report a bug?',
        'Use Report a bug lower on this page. A short description is enough; steps and a screenshot are optional. This page, device, and account are attached automatically. Nothing is emailed. Reports are stored for the site owner to read.',
      ),
    ]),
  ].join('');
}

export function renderHowToUseSection({ setup = false } = {}) {
  const intro = setup
    ? `<p class="al-muted al-howto-intro">Welcome. Read this once, then set your monthly rate below to finish setup.</p>`
    : '';

  return `
    <section class="al-panel al-howto al-settings-card" id="how-to-use">
      <p class="al-settings-kicker">Help</p>
      <details class="al-howto-details">
        <summary class="al-howto-summary al-settings-title">FAQ &amp; Set Up Instructions</summary>
        <div class="al-howto-body">
          ${intro}
          ${faqBody()}
        </div>
      </details>
    </section>
  `;
}
