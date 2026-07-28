import { bootPage, renderShell, requireSignIn } from './nav.js';
import { membershipApi, importApi } from './api.js';
import { parseXlsxFile } from './import-xlsx.js';
import { escapeHtml } from './format.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  const { membership } = await membershipApi.get(auth.token);

  root.innerHTML = `
    ${renderShell({
      title: 'Settings',
      subtitle: 'Membership pricing and spreadsheet import.',
    })}
    <main class="al-main">
      <form class="al-panel al-form-grid" id="membership-form">
        <div class="al-field">
          <label for="display_name">Display name</label>
          <input class="al-input" id="display_name" value="${escapeHtml(membership.display_name || '')}" />
        </div>
        <div class="al-field">
          <label for="price_bump_on">Price bump date</label>
          <input class="al-input" id="price_bump_on" type="date" value="${(membership.price_bump_on || '').slice(0, 10)}" />
        </div>
        <div class="al-field">
          <label for="promo_cents">Promo month ($)</label>
          <input class="al-input" id="promo_cents" inputmode="decimal" value="${(membership.promo_cents / 100).toFixed(2)}" />
        </div>
        <div class="al-field">
          <label for="standard_cents">Standard ($)</label>
          <input class="al-input" id="standard_cents" inputmode="decimal" value="${(membership.standard_cents / 100).toFixed(2)}" />
        </div>
        <div class="al-field">
          <label for="current_cents">Current ($)</label>
          <input class="al-input" id="current_cents" inputmode="decimal" value="${(membership.current_cents / 100).toFixed(2)}" />
        </div>
        <div class="al-field" style="display:flex;align-items:end">
          <button class="al-btn al-btn-primary" type="submit">Save membership</button>
        </div>
        <p class="span-2 al-muted" id="membership-status"></p>
      </form>

      <section class="al-panel">
        <h2 class="serif">Import from A-List Tracking.xlsx</h2>
        <p class="al-muted">Upload your spreadsheet (Movies sheet). Duplicates by date + title + location are skipped.</p>
        <div class="al-toolbar">
          <input type="file" id="xlsx-file" accept=".xlsx,.xls" />
          <button class="al-btn al-btn-primary" type="button" id="xlsx-import-btn">Upload spreadsheet</button>
          <button class="al-btn" type="button" id="seed-import-btn">Re-import bundled log</button>
        </div>
        <p class="al-muted" id="import-status"></p>
      </section>

      <section class="al-panel">
        <h2 class="serif">Import from JSON</h2>
        <textarea class="al-textarea" id="import-json" rows="5" placeholder='[{"watched_on":"2025-01-15","title":"Dune: Part Two","ticket_cents":2495}]'></textarea>
        <div class="al-toolbar" style="margin-top:8px">
          <button class="al-btn" type="button" id="import-btn">Import JSON</button>
        </div>
      </section>
    </main>
  `;

  const setStatus = (msg) => { document.getElementById('import-status').textContent = msg; };

  document.getElementById('membership-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('membership-status');
    status.textContent = 'Saving…';
    try {
      const dollars = (id) => Math.round(Number(document.getElementById(id).value) * 100);
      await membershipApi.update(auth.token, {
        display_name: document.getElementById('display_name').value.trim() || null,
        price_bump_on: document.getElementById('price_bump_on').value,
        promo_cents: dollars('promo_cents'),
        standard_cents: dollars('standard_cents'),
        current_cents: dollars('current_cents'),
      });
      status.textContent = 'Saved.';
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

  document.getElementById('seed-import-btn').addEventListener('click', async () => {
    setStatus('Importing bundled log…');
    try {
      const seed = await fetch('/amc-a-lister/data/movies-bill.json').then((r) => r.json());
      const result = await importApi.run(auth.token, seed);
      setStatus(`Bundled log: inserted ${result.inserted}, skipped ${result.skipped}.`);
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
});
