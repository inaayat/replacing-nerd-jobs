/** User-facing guide — rendered on Settings and shown during account setup. */

function howToUseSteps() {
  return `
    <ul class="al-howto-list">
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Log a screening</h3>
        <p>Use the bar at the top of every page. Date and title are enough; theater and ticket price help savings math.</p>
      </li>
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Watch log</h3>
        <p>Your full history. Search and filter, then tap a poster for format, seat, who you went with, and movie details.</p>
      </li>
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Watch</h3>
        <p>Movies you want to see, sorted by US release date. Logging a film removes it from this list.</p>
      </li>
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Stats</h3>
        <p>Where you watch, what you rate highly, and whether A-List is paying for itself.</p>
      </li>
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Leaderboard</h3>
        <p>Compares members who opt in. Your profile stays private until you turn on Public profile.</p>
      </li>
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Monthly rate</h3>
        <p>One A-List charge per calendar month you see a movie in theaters — not per ticket.</p>
      </li>
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Letterboxd</h3>
        <p>Connect your username above. New diary films land in a review inbox so you can mark In theaters or At home.</p>
      </li>
      <li class="al-howto-item">
        <h3 class="al-howto-item-title">Spreadsheet</h3>
        <p>Import A-List Tracking.xlsx or paste JSON. Duplicates with the same date, title, and theater are skipped.</p>
      </li>
    </ul>
  `;
}

export function renderHowToUseSection({ setup = false } = {}) {
  const intro = setup
    ? `<p class="al-muted al-howto-intro">Welcome. Read this once, then set your monthly rate above to finish setup.</p>`
    : '';

  return `
    <section class="al-panel al-howto al-settings-card" id="how-to-use">
      <details class="al-howto-details">
        <summary class="al-howto-summary">How to use A-Lister</summary>
        <div class="al-howto-body">
          ${intro}
          ${howToUseSteps()}
        </div>
      </details>
    </section>
  `;
}
