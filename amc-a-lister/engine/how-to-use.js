/** User-facing guide — rendered on Settings and shown during account setup. */

function howToUseSteps() {
  return `
    <ol class="al-howto-steps">
      <li>
        <strong>Log a screening.</strong>
        Use the quick-log bar at the top of every page. Pick a date and movie title —
        theater, format, and ticket price are optional but help savings math.
        Switch to <em>Not in theaters</em> for streams or discs you still want in your diary.
      </li>
      <li>
        <strong><a href="/amc-a-lister/">Watch log</a></strong>
        is your full history. Search, filter by theater or rating, and expand a row to
        edit details or add a star rating later.
      </li>
      <li>
        <strong><a href="/amc-a-lister/what-to-watch.html">Coming Soon</a></strong>
        tracks movies you want to see. Add titles from search; they sort by US release date
        when TMDB has one. Expand a row on Coming Soon or Watch at Home for the same movie
        details you get in your watch log. Logging a film removes it from this list.
      </li>
      <li>
        <strong><a href="/amc-a-lister/statistics.html">Statistics</a></strong>
        shows where you watch, what you rate highly, and whether A-List is paying for itself.
        Sidebar totals update as you log.
      </li>
      <li>
        <strong><a href="/amc-a-lister/leaderboard.html">Leaderboard</a></strong>
        compares opted-in members. Your profile stays private until you turn on
        <em>Public profile</em> below.
      </li>
      <li>
        <strong>Monthly rate (below)</strong>
        powers billed-vs-ticket savings. One A-List charge applies per calendar month you
        see a movie in theaters — not per ticket.
      </li>
      <li>
        <strong>Already have a spreadsheet?</strong>
        Scroll down to import your <code>A-List Tracking.xlsx</code> or paste JSON.
        Duplicates (same date, title, and theater) are skipped.
      </li>
    </ol>
  `;
}

export function renderHowToUseSection({ setup = false } = {}) {
  const intro = setup
    ? `<p class="al-muted al-howto-intro">
         Welcome! Read this once, then set your monthly rate to finish account setup.
       </p>`
    : '';

  if (setup) {
    return `
      <section class="al-panel al-panel--setup al-howto" id="how-to-use">
        <h2 class="al-howto-title">How to use A-Lister</h2>
        ${intro}
        ${howToUseSteps()}
      </section>
    `;
  }

  return `
    <section class="al-panel al-howto" id="how-to-use">
      <details class="al-howto-details">
        <summary class="al-howto-summary">How to use A-Lister</summary>
        <div class="al-howto-body">
          ${howToUseSteps()}
        </div>
      </details>
    </section>
  `;
}
