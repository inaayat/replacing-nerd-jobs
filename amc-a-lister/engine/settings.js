import { bootPage, renderShell, requireSignIn, populateSidebarStats, isTvBetaEnabled, setTvBetaEnabled } from './nav.js';
import { isDarkModeEnabled, setDarkModeEnabled } from './theme.js';
import { membershipApi, importApi, backfillApi } from './api.js';
import { parseXlsxFile } from './import-xlsx.js';
import { escapeHtml, parseMoneyInput } from './format.js';
import { todayISO } from './dates.js';
import { renderHowToUseSection } from './how-to-use.js';

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
      ? 'Welcome — learn the basics below, then set your monthly rate to finish setup.'
      : 'Membership pricing, beta features, and spreadsheet import.',
    signedIn: true,
    body: `
    <main class="al-main">
      ${renderHowToUseSection({ setup: needsRateSetup })}

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

        <div class="al-privacy-section">
          <div class="al-tier-header">
            <h2>Public profile</h2>
            <p class="al-muted">Off by default. Nothing about your log is visible to anyone else until you turn this on.</p>
          </div>
          <label class="al-check al-check--block">
            <input type="checkbox" id="public_profile" ${membership.public_profile ? 'checked' : ''} />
            Show me on the public leaderboard
          </label>
          <div class="al-privacy-detail" id="public-profile-detail">
            <p class="al-muted">
              Anyone can see your name, how many films you've seen, your savings and
              your average rating. They never see your email, your surname, your seat or
              auditorium numbers, or anything you watched at home.
            </p>
            <div class="al-field">
              <label for="username">Username <span class="al-muted">(optional)</span></label>
              <input class="al-input" id="username" maxlength="24" placeholder="letterboxd_lurker"
                     value="${escapeHtml(membership.username || '')}" />
              <p class="al-muted al-field-hint">
                3–24 characters, letters, numbers and underscores. Leave it blank and
                you'll show as <strong>${escapeHtml(membership.public_name_without_username || 'Member')}</strong> instead.
              </p>
            </div>
            <label class="al-check al-check--block">
              <input type="checkbox" id="public_hide_theaters" ${membership.public_hide_theaters ? 'checked' : ''} />
              Hide which theaters I go to
            </label>
          </div>
        </div>

        <div class="al-toolbar" style="margin-top:12px">
          <button class="al-btn al-btn-primary" type="submit">${needsRateSetup ? 'Save and continue' : 'Save membership'}</button>
          <p class="al-muted" id="membership-status" style="margin:0"></p>
        </div>
      </form>

      <section class="al-panel">
        <h2>Appearance</h2>
        <p class="al-muted">Dark mode uses black and dark grey surfaces with red accents. Your choice is saved on this device.</p>
        <label class="al-check al-check--block">
          <input type="checkbox" id="dark-mode" ${isDarkModeEnabled() ? 'checked' : ''} />
          Dark mode
        </label>
        <p class="al-muted" id="dark-mode-status" style="margin-top:8px"></p>
      </section>

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
        <h2>Posters &amp; movie data</h2>
        <p class="al-muted">
          Links any screenings that aren't matched to TMDB yet and caches their artwork.
          Runs in batches — press again if it reports more to go.
        </p>
        <div class="al-toolbar">
          <button class="al-btn" type="button" id="backfill-btn">Backfill posters</button>
          <p class="al-muted" id="backfill-status" style="margin:0"></p>
        </div>
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
    row.innerHTML = tierRowHtml({ effective_on: todayISO(), cents: 2999 }, 99);
    tiersEl.appendChild(row.firstElementChild);
  });

  tiersEl.addEventListener('click', (e) => {
    if (e.target.matches('.tier-remove')) {
      e.target.closest('[data-tier-row]')?.remove();
    }
  });

  document.getElementById('beta-tv').addEventListener('change', (e) => {
    setTvBetaEnabled(e.target.checked);
    // No reload — that discarded unsaved membership edits on this same page,
    // and destroyed the status message before it ever rendered.
    document.getElementById('beta-tv-status').textContent = e.target.checked
      ? 'TV Shows enabled. It appears in the nav on your next page load.'
      : 'TV Shows hidden from the nav.';
  });

  document.getElementById('dark-mode').addEventListener('change', (e) => {
    setDarkModeEnabled(e.target.checked);
    document.getElementById('dark-mode-status').textContent = e.target.checked
      ? 'Dark mode on.'
      : 'Dark mode off.';
  });

  const setStatus = (msg) => { document.getElementById('import-status').textContent = msg; };

  const publicToggle = document.getElementById('public_profile');
  const usernameInput = document.getElementById('username');
  const hideTheatersInput = document.getElementById('public_hide_theaters');
  const privacyDetail = document.getElementById('public-profile-detail');

  const syncPrivacyFields = () => {
    const on = publicToggle.checked;
    privacyDetail.classList.toggle('is-active', on);
    usernameInput.disabled = !on;
    hideTheatersInput.disabled = !on;
  };
  publicToggle.addEventListener('change', syncPrivacyFields);
  syncPrivacyFields();

  const membershipForm = document.getElementById('membership-form');
  const membershipSubmit = membershipForm.querySelector('button[type="submit"]');

  membershipForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('membership-status');
    const { tiers: price_tiers, invalid } = collectTiers();

    // Never silently drop a row the user typed — say which one is wrong.
    if (invalid.length) {
      status.textContent = invalid.length === 1
        ? `Check the monthly price on row ${invalid[0]} — use a number like 27.99.`
        : `Check the monthly prices on rows ${invalid.join(', ')}.`;
      return;
    }
    if (!price_tiers.length) {
      status.textContent = 'Add at least one monthly rate.';
      return;
    }
    const duplicate = price_tiers.find(
      (tier, i) => i > 0 && tier.effective_on === price_tiers[i - 1].effective_on,
    );
    if (duplicate) {
      status.textContent = `Two rates start on ${duplicate.effective_on}. Give each a different date.`;
      return;
    }
    status.textContent = 'Saving…';
    membershipSubmit.disabled = true;
    try {
      await membershipApi.update(auth.token, {
        display_name: document.getElementById('display_name').value.trim() || null,
        username: usernameInput.value.trim() || null,
        public_profile: publicToggle.checked,
        public_hide_theaters: hideTheatersInput.checked,
        price_tiers,
        rate_setup_complete: true,
      });
      status.textContent = 'Saved.';
      if (needsRateSetup) {
        location.replace('/amc-a-lister/');
      }
    } catch (err) {
      status.textContent = err.message;
      if (/username/i.test(err.message || '')) usernameInput.focus();
    } finally {
      membershipSubmit.disabled = false;
    }
  });

  /**
   * Import has no undo and there is no bulk delete to recover with, so show
   * what was parsed and make the user confirm before anything is written.
   */
  const runImport = async (watches, sourceLabel) => {
    const sample = watches.slice(0, 3).map((w) => `${w.watched_on} · ${w.title}`).join('\n');
    const ok = confirm(
      `Import ${watches.length} screening${watches.length === 1 ? '' : 's'} from ${sourceLabel}?\n\n`
      + `First rows:\n${sample}${watches.length > 3 ? `\n…and ${watches.length - 3} more` : ''}\n\n`
      + 'Existing rows with the same date, title and theater are skipped. '
      + 'This cannot be undone.',
    );
    if (!ok) {
      setStatus('Import cancelled.');
      return;
    }
    setStatus(`Importing ${watches.length} rows…`);
    const result = await importApi.run(auth.token, watches);
    setStatus(`Imported ${result.inserted} screenings (${result.skipped} duplicates skipped).`);
  };

  document.getElementById('xlsx-import-btn').addEventListener('click', async () => {
    const file = document.getElementById('xlsx-file').files?.[0];
    if (!file) {
      setStatus('Choose an .xlsx file first.');
      return;
    }
    setStatus('Reading spreadsheet…');
    try {
      await runImport(await parseXlsxFile(file), file.name);
    } catch (err) {
      setStatus(err.message);
    }
  });

  document.getElementById('import-btn').addEventListener('click', async () => {
    const raw = document.getElementById('import-json').value.trim();
    if (!raw) {
      setStatus('Paste some JSON first.');
      return;
    }
    try {
      let watches;
      try {
        watches = JSON.parse(raw);
      } catch {
        setStatus('That is not valid JSON. Expected an array of screenings.');
        return;
      }
      if (!Array.isArray(watches) || !watches.length) {
        setStatus('Expected a non-empty JSON array of screenings.');
        return;
      }
      await runImport(watches, 'the pasted JSON');
    } catch (err) {
      setStatus(err.message);
    }
  });

  const backfillBtn = document.getElementById('backfill-btn');
  backfillBtn.addEventListener('click', async () => {
    const status = document.getElementById('backfill-status');
    backfillBtn.disabled = true;
    status.textContent = 'Looking up titles on TMDB…';
    try {
      const { linked, cached, remaining } = await backfillApi.run(auth.token);
      status.textContent = remaining > 0
        ? `Linked ${linked}, cached ${cached} posters. ${remaining} still to go — run it again.`
        : `Linked ${linked} titles and cached ${cached} posters. All caught up.`;
    } catch (err) {
      status.textContent = err.message || 'Backfill failed.';
    } finally {
      backfillBtn.disabled = false;
    }
  });
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function resolveTiers(membership, needsRateSetup) {
  if (Array.isArray(membership.price_tiers) && membership.price_tiers.length) {
    return [...membership.price_tiers].sort((a, b) => a.effective_on.localeCompare(b.effective_on));
  }
  if (needsRateSetup) {
    return [{ effective_on: todayISO(), cents: membership.current_cents || 2999 }];
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

/**
 * Rows that don't parse are reported by position rather than dropped — the old
 * behaviour silently discarded anything typed as "$27.99" and still said "Saved".
 */
function collectTiers() {
  const tiers = [];
  const invalid = [];

  [...document.querySelectorAll('[data-tier-row]')].forEach((row, i) => {
    const effective_on = row.querySelector('.tier-effective').value;
    const raw = row.querySelector('.tier-cents').value.trim();
    if (!effective_on && !raw) return;

    const cents = parseMoneyInput(raw);
    if (!effective_on || cents == null || cents <= 0) {
      invalid.push(i + 1);
      return;
    }
    tiers.push({ effective_on, cents });
  });

  tiers.sort((a, b) => a.effective_on.localeCompare(b.effective_on));
  return { tiers, invalid };
}
