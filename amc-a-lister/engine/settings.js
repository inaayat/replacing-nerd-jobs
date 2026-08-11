import { bootPage, renderShell, requireSignIn, populateSidebarStats, isTvBetaEnabled, setTvBetaEnabled } from './nav.js';
import { membershipApi, importApi } from './api.js';
import { parseXlsxFile } from './import-xlsx.js';
import { escapeHtml } from './format.js';

const DEFAULT_TIERS = [
  { effective_on: '2018-06-01', cents: 2495 },
  { effective_on: '2025-05-01', cents: 2799 },
  { effective_on: '2026-07-15', cents: 2999 },
];

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  const params = new URLSearchParams(location.search);
  const rateSetup = params.get('setup') === 'rate';
  const { membership } = await membershipApi.get(auth.token);
  const needsRateSetup = rateSetup || membership.rate_setup_complete === false;
  const tiers = resolveTiers(membership, needsRateSetup);

  root.innerHTML = renderShell({
    title: 'Settings',
    subtitle: needsRateSetup
      ? 'Set your A-List monthly rate to finish account setup.'
      : 'Membership pricing, beta features, and spreadsheet import.',
    signedIn: true,
    body: `
    <main class="al-main">
      ${needsRateSetup ? `
        <section class="al-panel al-panel--setup">
          <h2 class="serif">Set your monthly rate</h2>
          <p class="al-muted">
            Enter what A-List charges you each month. If your price changes later — or was different
            in earlier periods — you can add price changes below (or anytime from this settings panel).
          </p>
        </section>
      ` : ''}

      <form class="al-panel" id="membership-form">
        <div class="al-form-grid">
          <div class="al-field">
            <label for="display_name">Display name</label>
            <input class="al-input" id="display_name" value="${escapeHtml(membership.display_name || '')}" />
          </div>
        </div>

        <div class="al-tier-section">
          <div class="al-tier-header">
            <h2>Monthly rates</h2>
            <p class="al-muted">One A-List charge per calendar month you see a movie. Add a row for each price increase.</p>
          </div>
          <div class="al-tier-table" id="price-tiers">
            <div class="al-tier-row al-tier-row--head">
              <span>Effective date</span>
              <span>Monthly price</span>
              <span></span>
            </div>
            ${tiers.map((tier, index) => tierRowHtml(tier, index)).join('')}
          </div>
          <button class="al-btn" type="button" id="add-tier">+ Add price change</button>
        </div>

        <div class="al-toolbar" style="margin-top:12px">
          <button class="al-btn al-btn-primary" type="submit">${needsRateSetup ? 'Save monthly rate' : 'Save membership'}</button>
          <p class="al-muted" id="membership-status" style="margin:0"></p>
        </div>
      </form>

      <section class="al-panel">
        <h2>Beta features</h2>
        <p class="al-muted">Optional experiments. Turn these on when you want them in the nav.</p>
        <label class="al-check al-check--block">
          <input type="checkbox" id="beta-tv" ${isTvBetaEnabled() ? 'checked' : ''} />
          TV Shows — track series separately from theater movies
        </label>
        <p class="al-muted" id="beta-tv-status" style="margin-top:8px"></p>
      </section>

      <section class="al-panel">
        <h2>Import from A-List Tracking.xlsx</h2>
        <p class="al-muted">Upload your spreadsheet (Movies sheet). Duplicates by date + title + location are skipped.</p>
        <div class="al-toolbar">
          <input type="file" id="xlsx-file" accept=".xlsx,.xls" />
          <button class="al-btn al-btn-primary" type="button" id="xlsx-import-btn">Upload spreadsheet</button>
        </div>
        <p class="al-muted" id="import-status"></p>
      </section>

      <section class="al-panel">
        <h2>Import from JSON</h2>
        <textarea class="al-textarea" id="import-json" rows="5" placeholder='[{"watched_on":"2025-01-15","title":"Dune: Part Two","ticket_cents":2495}]'></textarea>
        <div class="al-toolbar" style="margin-top:8px">
          <button class="al-btn" type="button" id="import-btn">Import JSON</button>
        </div>
      </section>
    </main>
    `,
  });

  const tiersEl = document.getElementById('price-tiers');
  document.getElementById('add-tier').addEventListener('click', () => {
    const row = document.createElement('div');
    row.innerHTML = tierRowHtml({ effective_on: new Date().toISOString().slice(0, 10), cents: 2999 }, 99);
    tiersEl.appendChild(row.firstElementChild);
  });

  tiersEl.addEventListener('click', (e) => {
    if (e.target.matches('.tier-remove')) {
      e.target.closest('[data-tier-row]')?.remove();
    }
  });

  document.getElementById('beta-tv').addEventListener('change', (e) => {
    setTvBetaEnabled(e.target.checked);
    const status = document.getElementById('beta-tv-status');
    status.textContent = e.target.checked
      ? 'TV Shows enabled — it will show in the nav after refresh.'
      : 'TV Shows hidden from nav.';
    // Re-render shell nav without full reload
    location.reload();
  });

  const setStatus = (msg) => { document.getElementById('import-status').textContent = msg; };

  document.getElementById('membership-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('membership-status');
    status.textContent = 'Saving…';
    try {
      const price_tiers = collectTiers();
      if (!price_tiers.length) {
        status.textContent = 'Add at least one monthly rate.';
        return;
      }
      await membershipApi.update(auth.token, {
        display_name: document.getElementById('display_name').value.trim() || null,
        price_tiers,
        rate_setup_complete: true,
      });
      status.textContent = 'Saved.';
      if (needsRateSetup) {
        location.replace('/amc-a-lister/');
      }
    } catch (err) {
      status.textContent = err.message;
    }
  });

  document.getElementById('xlsx-import-btn').addEventListener('click', async () => {
    const file = document.getElementById('xlsx-file').files?.[0];
    if (!file) {
      setStatus('Choose an .xlsx file first.');
      return;
    }
    setStatus('Reading spreadsheet…');
    try {
      const watches = await parseXlsxFile(file);
      const result = await importApi.run(auth.token, watches);
      setStatus(`Imported ${result.inserted} screenings (${result.skipped} duplicates skipped).`);
    } catch (err) {
      setStatus(err.message);
    }
  });

  document.getElementById('import-btn').addEventListener('click', async () => {
    setStatus('Importing JSON…');
    try {
      const watches = JSON.parse(document.getElementById('import-json').value);
      const result = await importApi.run(auth.token, watches);
      setStatus(`Inserted ${result.inserted}, skipped ${result.skipped}.`);
    } catch (err) {
      setStatus(err.message);
    }
  });
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function resolveTiers(membership, needsRateSetup) {
  if (Array.isArray(membership.price_tiers) && membership.price_tiers.length) {
    return [...membership.price_tiers].sort((a, b) => a.effective_on.localeCompare(b.effective_on));
  }
  if (needsRateSetup) {
    return [{ effective_on: new Date().toISOString().slice(0, 10), cents: membership.current_cents || 2999 }];
  }
  if (membership.price_bump_on) {
    return [
      { effective_on: '2018-06-01', cents: membership.standard_cents || 2495 },
      { effective_on: membership.price_bump_on.slice(0, 10), cents: membership.current_cents || 2799 },
    ];
  }
  return DEFAULT_TIERS;
}

function tierRowHtml(tier, index) {
  return `
    <div class="al-tier-row" data-tier-row>
      <input class="al-input tier-effective" type="date" value="${tier.effective_on}" required />
      <input class="al-input tier-cents" type="text" inputmode="decimal" value="${(tier.cents / 100).toFixed(2)}" required />
      ${index > 0 ? '<button type="button" class="al-link-btn tier-remove">Remove</button>' : '<span></span>'}
    </div>
  `;
}

function collectTiers() {
  return [...document.querySelectorAll('[data-tier-row]')]
    .map((row) => ({
      effective_on: row.querySelector('.tier-effective').value,
      cents: Math.round(Number(row.querySelector('.tier-cents').value) * 100),
    }))
    .filter((tier) => tier.effective_on && tier.cents > 0)
    .sort((a, b) => a.effective_on.localeCompare(b.effective_on));
}
