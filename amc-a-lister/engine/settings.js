import { bootPage, renderShell, requireSignIn, populateSidebarStats, isTvBetaEnabled, setTvBetaEnabled } from './nav.js';
import { membershipApi, importApi, backfillApi, letterboxdApi, showingInvitesApi, bugReportApi, watchesApi } from './api.js';
import { sentInvitesListHtml } from './sent-invites.js';
import { parseXlsxFile } from './import-xlsx.js';
import { downloadImportTemplate, downloadWatchLogExport } from './import-template.js';
import { EXAMPLE_IMPORT_JSON } from './import-watch.js';
import { theatersFromWatches } from './theater-suggest.js';
import { escapeHtml, parseMoneyInput } from './format.js';
import { todayISO } from './dates.js';
import { renderHowToUseSection } from './how-to-use.js';
import { captureBugContext, BUG_SCREENSHOT_MAX } from './bug-report.js';

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
      ? 'Welcome — set your monthly rate to finish setup.'
      : 'Membership pricing, Letterboxd, import and export, and account.',
    signedIn: true,
    body: `
    <main class="al-main al-main--settings">
      ${renderHowToUseSection({ setup: needsRateSetup })}

      ${needsRateSetup ? `
        <section class="al-panel al-panel--setup al-settings-card">
          <p class="al-settings-kicker">Setup</p>
          <h2 class="serif al-settings-title">Set your monthly rate</h2>
          <p class="al-muted al-settings-lead">Enter what A-List charges you each month. Add a row later if the price changes.</p>
        </section>
      ` : ''}

      <section class="al-panel al-settings-card al-settings-profile">
        <p class="al-settings-kicker">Profile</p>
        <h2 class="serif al-settings-title">Name &amp; visibility</h2>
        <div class="al-settings-compact">
          <div class="al-field al-settings-field">
            <label for="display_name">Display name</label>
            <input class="al-input" id="display_name" form="membership-form" value="${escapeHtml(membership.display_name || '')}" />
          </div>
          <div class="al-field al-settings-field">
            <label for="username">Username</label>
            <input class="al-input" id="username" form="membership-form" maxlength="24" placeholder="letterboxd_lurker"
                   value="${escapeHtml(membership.username || '')}" />
            <p class="al-muted al-field-hint">3–24 letters, numbers, _ · blank shows as ${escapeHtml(membership.public_name_without_username || 'Member')}</p>
          </div>
          <form id="letterboxd-form">
            <div class="al-field al-settings-field">
              <label for="letterboxd-username">Letterboxd username</label>
              <div class="al-lb-connect-row">
                <input class="al-input" id="letterboxd-username" maxlength="80" placeholder="your_name"
                       autocomplete="off" autocapitalize="off" spellcheck="false" />
                <button class="al-btn al-btn-primary" type="submit" id="letterboxd-save">Connect</button>
              </div>
              <p class="al-muted al-field-hint">Diary films land in a review inbox</p>
            </div>
            <div class="al-settings-actions al-settings-actions--lb">
              <button class="al-btn" type="button" id="letterboxd-clear" hidden>Disconnect</button>
              <a class="al-btn" href="/amc-a-lister/letterboxd.html" id="letterboxd-review" hidden>Review inbox</a>
              <p class="al-muted" id="letterboxd-status" aria-live="polite"></p>
            </div>
          </form>
          <div class="al-privacy-section">
            <label class="al-check al-check--block">
              <input type="checkbox" id="public_profile" form="membership-form" ${membership.public_profile ? 'checked' : ''} />
              Public profile
            </label>
            <p class="al-muted al-field-hint">Name, counts, savings, ratings — never email or at-home watches</p>
            <div class="al-privacy-detail" id="public-profile-detail">
              <label class="al-check al-check--block">
                <input type="checkbox" id="public_hide_theaters" form="membership-form" ${membership.public_hide_theaters ? 'checked' : ''} />
                Hide theaters
              </label>
            </div>
          </div>
        </div>
      </section>

      <form id="membership-form" class="al-settings-form">
        <section class="al-panel al-settings-card al-tier-section">
          <p class="al-settings-kicker">Billing</p>
          <h2 class="serif al-settings-title">Monthly rates</h2>
          <p class="al-muted al-settings-lead">One monthly charge from your first theater screening through this month. Add a row when the price changes. Use $0 to pause.</p>
          <div class="al-tier-table" id="price-tiers">
            <div class="al-tier-row al-tier-row--head">
              <span>Date</span>
              <span>Price</span>
              <span class="al-tier-remove-spacer" aria-hidden="true"></span>
            </div>
            ${tiers.map((tier, index) => tierRowHtml(tier, index)).join('')}
          </div>
          <button class="al-btn" type="button" id="add-tier">+ Add price change</button>
        </section>

        <div class="al-settings-save">
          <button class="al-btn al-btn-primary" type="submit">${needsRateSetup ? 'Save and continue' : 'Save membership'}</button>
          <p class="al-muted" id="membership-status"></p>
        </div>
      </form>

      <section class="al-panel al-settings-card" id="sent-invites">
        <p class="al-settings-kicker">Sharing</p>
        <h2 class="serif al-settings-title">Invites you sent</h2>
        <p class="al-muted al-settings-lead">Waiting on someone else. They accept or deny from their watch log.</p>
        <div id="sent-invites-list"><p class="al-muted">Loading…</p></div>
        <p class="al-error" id="sent-invites-status" role="alert" hidden></p>
      </section>

      <section class="al-panel al-settings-card">
        <p class="al-settings-kicker">Features</p>
        <h2 class="serif al-settings-title">Beta</h2>
        <p class="al-muted al-settings-lead">Optional experiments. Turn these on when you want them in the nav.</p>
        <label class="al-check al-check--block">
          <input type="checkbox" id="beta-tv" ${isTvBetaEnabled() ? 'checked' : ''} />
          TV Shows — track series separately from theater movies
        </label>
        <p class="al-muted" id="beta-tv-status"></p>
      </section>

      <section class="al-panel al-settings-card" id="settings-data">
        <p class="al-settings-kicker">Library</p>
        <h2 class="serif al-settings-title">Watch log import &amp; export</h2>
        <p class="al-muted al-settings-lead">
          Download the template, fill the Watches sheet, then upload. Export uses the same file.
          Same date, title, and theater are skipped. Backfill fills missing posters and TMDB ids
          for every A-Lister watch log — never theater, cost, rating, or date.
        </p>
        <div class="al-settings-actions">
          <button class="al-btn" type="button" id="template-download-btn">Download import template</button>
          <button class="al-btn" type="button" id="export-log-btn">Export my watch log</button>
        </div>
        <div class="al-settings-actions al-settings-actions--file">
          <input type="file" id="xlsx-file" accept=".xlsx,.xls" />
          <button class="al-btn al-btn-primary" type="button" id="xlsx-import-btn">Upload filled template</button>
        </div>
        <div class="al-settings-actions">
          <button class="al-btn" type="button" id="backfill-btn">Backfill posters</button>
          <p class="al-muted" id="backfill-status"></p>
        </div>
        <h3 class="al-settings-sub">Import JSON</h3>
        <p class="al-muted al-settings-lead" id="import-json-help">
          Advanced. Same fields as the template. theater / theatre / location, ticket_price / cost / $15.99, format, seat, companions, rating.
        </p>
        <p class="al-import-example" id="import-json-example">${escapeHtml(EXAMPLE_IMPORT_JSON)}</p>
        <textarea class="al-textarea" id="import-json" rows="6" placeholder='Paste a JSON array of screenings'></textarea>
        <div class="al-settings-actions">
          <button class="al-btn" type="button" id="import-btn">Import JSON</button>
        </div>
        <p class="al-muted" id="import-status"></p>
      </section>

      <section class="al-panel al-settings-card" id="bug-report">
        <p class="al-settings-kicker">Help</p>
        <h2 class="serif al-settings-title">Report a bug</h2>
        <p class="al-muted al-settings-lead">A short note is enough. This page, device, and account are attached automatically. Nothing is emailed.</p>
        <form id="bug-report-form">
          <div class="al-field al-settings-field">
            <label for="bug-message">What happened</label>
            <input class="al-input" id="bug-message" maxlength="500" required
                   placeholder="Posters disappeared after I filtered the log" />
          </div>
          <div class="al-field al-settings-field">
            <label for="bug-details">Steps or details <span class="al-muted">(optional)</span></label>
            <textarea class="al-textarea" id="bug-details" rows="3" maxlength="4000"
                      placeholder="I tapped Filter, chose Dolby, then the grid went blank."></textarea>
          </div>
          <div class="al-field al-settings-field">
            <label for="bug-screenshot">Screenshot <span class="al-muted">(optional)</span></label>
            <input class="al-input" type="file" id="bug-screenshot" accept="image/*" />
          </div>
          <div class="al-settings-actions">
            <button class="al-btn al-btn-primary" type="submit" id="bug-report-submit">Send report</button>
            <p class="al-muted" id="bug-report-status" role="status" aria-live="polite"></p>
          </div>
        </form>
      </section>

      <section class="al-panel al-settings-card" id="settings-account">
        <p class="al-settings-kicker">Account</p>
        <h2 class="serif al-settings-title">Sign in</h2>
        <p class="al-muted al-settings-lead">Manage email and password, or log out of this device.</p>
        <div class="al-settings-actions">
          <a class="al-btn" href="/account.html">Account</a>
          <a class="al-btn" href="/account.html" data-nav-auth>Log out</a>
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
    const remove = e.target.closest('.tier-remove');
    if (remove) {
      remove.closest('[data-tier-row]')?.remove();
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

  const setStatus = (msg) => { document.getElementById('import-status').textContent = msg; };

  const knownTheatersForImport = async () => {
    try {
      const { watches } = await watchesApi.list(auth.token);
      return theatersFromWatches(watches);
    } catch {
      return [];
    }
  };

  document.getElementById('template-download-btn').addEventListener('click', () => {
    downloadImportTemplate();
    setStatus('Template downloaded. Fill the Watches sheet, delete the sample rows, then upload.');
  });

  document.getElementById('export-log-btn').addEventListener('click', async () => {
    setStatus('Preparing export…');
    try {
      const { watches } = await watchesApi.list(auth.token);
      downloadWatchLogExport(watches || []);
      setStatus(`Exported ${(watches || []).length} screening${(watches || []).length === 1 ? '' : 's'}.`);
    } catch (err) {
      setStatus(err.message || 'Could not export the watch log.');
    }
  });

  const publicToggle = document.getElementById('public_profile');
  const usernameInput = document.getElementById('username');
  const hideTheatersInput = document.getElementById('public_hide_theaters');
  const privacyDetail = document.getElementById('public-profile-detail');

  const syncPrivacyFields = () => {
    const on = publicToggle.checked;
    privacyDetail.classList.toggle('is-active', on);
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

  wireLetterboxdSettings(auth);
  wireSentInvites(auth);
  wireBugReport(auth);

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
      const knownTheaters = await knownTheatersForImport();
      await runImport(await parseXlsxFile(file, { knownTheaters }), file.name);
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
    status.textContent = 'Looking up titles on TMDB for every account…';
    const totals = { linked: 0, cached: 0, ranks: 0 };
    try {
      for (let i = 0; i < 50; i += 1) {
        const { linked = 0, cached = 0, ranks = 0, remaining = 0 } = await backfillApi.run(
          auth.token,
          { scope: 'all', limit: 30 },
        );
        totals.linked += linked;
        totals.cached += cached;
        totals.ranks += ranks;
        status.textContent = remaining > 0
          ? `Linked ${totals.linked}, cached ${totals.cached} posters, filled ${totals.ranks} ranks. ${remaining} still to go…`
          : `Linked ${totals.linked} titles, cached ${totals.cached} posters, filled ${totals.ranks} ranks. All caught up.`;
        if (!remaining) break;
      }
    } catch (err) {
      status.textContent = err.message || 'Backfill failed.';
    } finally {
      backfillBtn.disabled = false;
    }
  });
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });

function wireSentInvites(auth) {
  const list = document.getElementById('sent-invites-list');
  const status = document.getElementById('sent-invites-status');
  if (!list) return;

  const showError = (message) => {
    if (!status) return;
    status.textContent = message || '';
    status.hidden = !message;
  };

  const paint = (outgoing) => {
    list.innerHTML = sentInvitesListHtml(outgoing);
  };

  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-invite-cancel]');
    if (!btn || !list.contains(btn)) return;
    const id = btn.dataset.inviteCancel;
    if (!id) return;
    btn.disabled = true;
    showError('');
    try {
      await showingInvitesApi.cancel(auth.token, id);
      btn.closest('.al-invites-outgoing-item')?.remove();
      if (!list.querySelector('.al-invites-outgoing-item')) paint([]);
    } catch (err) {
      btn.disabled = false;
      showError(err.message || 'Could not delete invite.');
    }
  });

  showingInvitesApi.list(auth.token)
    .then(({ outgoing = [] }) => paint(outgoing))
    .catch((err) => {
      list.innerHTML = '';
      showError(err.message || 'Could not load invites.');
    });
}

function wireLetterboxdSettings(auth) {
  const form = document.getElementById('letterboxd-form');
  const input = document.getElementById('letterboxd-username');
  const saveBtn = document.getElementById('letterboxd-save');
  const clearBtn = document.getElementById('letterboxd-clear');
  const reviewLink = document.getElementById('letterboxd-review');
  const status = document.getElementById('letterboxd-status');

  const show = (state) => {
    const connected = Boolean(state.username);
    input.value = state.username || '';
    clearBtn.hidden = !connected;
    reviewLink.hidden = !connected;
    saveBtn.textContent = connected ? 'Save' : 'Connect';
    const waiting = state.items?.length || 0;
    reviewLink.textContent = waiting ? `Review inbox (${waiting})` : 'Review inbox';
  };

  letterboxdApi.get(auth.token).then(show).catch((err) => {
    status.textContent = err.message || 'Could not load Letterboxd settings.';
  });

  const save = async (username) => {
    saveBtn.disabled = true;
    clearBtn.disabled = true;
    status.textContent = username ? 'Checking Letterboxd…' : 'Disconnecting…';
    try {
      const state = await letterboxdApi.setUsername(auth.token, username);
      show(state);
      if (!state.username) status.textContent = 'Disconnected.';
      else if (state.items.length) {
        status.textContent = `Connected. ${state.items.length} film${state.items.length === 1 ? '' : 's'} to review.`;
      } else status.textContent = 'Connected. Nothing new to review.';
    } catch (err) {
      status.textContent = err.message || 'Could not save.';
      input.focus();
    } finally {
      saveBtn.disabled = false;
      clearBtn.disabled = false;
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save(input.value.trim() || null);
  });
  clearBtn.addEventListener('click', () => save(null));
}

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

const TIER_REMOVE_ICON = '<svg class="al-tier-remove-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 7.6h13.6"/><path d="M9.2 7.5V5.8h5.6v1.7"/><path d="M7.4 7.6l.8 11.2h7.6l.8-11.2"/><path d="M10.4 10.6v5.2M13.6 10.6v5.2"/></svg>';

function tierRowHtml(tier, index) {
  const remove = index > 0
    ? `<button type="button" class="al-link-btn al-watchlist-icon-btn tier-remove" aria-label="Remove rate" title="Remove">${TIER_REMOVE_ICON}</button>`
    : '<span class="al-tier-remove-spacer" aria-hidden="true"></span>';
  return `
    <div class="al-tier-row" data-tier-row>
      <div class="al-tier-date">
        <input class="al-input tier-effective" type="date" value="${tier.effective_on}" required />
      </div>
      <div class="al-tier-price">
        <span class="al-tier-price-prefix" aria-hidden="true">$</span>
        <input class="al-input tier-cents" type="text" inputmode="decimal" value="${(tier.cents / 100).toFixed(2)}" required aria-label="Monthly price" />
      </div>
      ${remove}
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
    if (!effective_on || cents == null || cents < 0) {
      invalid.push(i + 1);
      return;
    }
    tiers.push({ effective_on, cents });
  });

  tiers.sort((a, b) => a.effective_on.localeCompare(b.effective_on));
  return { tiers, invalid };
}

function readScreenshotFile(file) {
  if (!file) return Promise.resolve('');
  if (!String(file.type || '').startsWith('image/')) {
    return Promise.reject(new Error('Choose an image file.'));
  }
  // Data URLs are ~4/3 the file size. Stay under BUG_SCREENSHOT_MAX.
  if (file.size > Math.floor(BUG_SCREENSHOT_MAX * 0.72)) {
    return Promise.reject(new Error('Keep the screenshot under 250 KB, or skip it.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that screenshot.'));
    reader.readAsDataURL(file);
  });
}

function wireBugReport(auth) {
  const form = document.getElementById('bug-report-form');
  if (!form) return;
  const status = document.getElementById('bug-report-status');
  const submit = document.getElementById('bug-report-submit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Sending…';
    submit.disabled = true;
    try {
      const screenshot = await readScreenshotFile(document.getElementById('bug-screenshot').files[0]);
      await bugReportApi.create(auth.token, {
        message: document.getElementById('bug-message').value,
        details: document.getElementById('bug-details').value,
        url: location.href,
        user_agent: navigator.userAgent || '',
        screenshot,
        context: { ...captureBugContext(), tv_beta: isTvBetaEnabled() },
      });
      form.reset();
      status.textContent = 'Thanks — report sent.';
    } catch (err) {
      status.textContent = err.message || 'Could not send the report.';
    } finally {
      submit.disabled = false;
    }
  });
}
