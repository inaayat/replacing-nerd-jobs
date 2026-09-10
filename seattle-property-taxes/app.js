import {
  aggregateSlices,
  availableYears,
  centsGrid,
  clampRange,
  displayAddress,
  formatMoney,
  formatPin,
  latestYear,
  parseTaxRollHtml,
  pickReceivable,
  ratesFor,
  yearSlice,
} from './engine.js';
import {
  assessorLinks,
  fetchReceivables,
  fetchTaxRoll,
  searchAddress,
} from './lookup.js';

const $ = (id) => document.getElementById(id);

const state = {
  snapshot: null,
  parcel: null,
  receivables: [],
  taxRoll: [],
  from: null,
  to: null,
};

async function loadSnapshot() {
  const res = await fetch('./data/levy-rates.json');
  if (!res.ok) throw new Error('Could not load levy rates.');
  const data = await res.json();
  if (data.schema !== 1) throw new Error('Levy-rate snapshot is a newer schema.');
  return data;
}

function setStatus(message, isError = false) {
  const el = $('status');
  el.textContent = message || '';
  el.classList.toggle('is-error', Boolean(isError));
}

function fillYearSelects(years, from, to) {
  for (const id of ['year-from', 'year-to']) {
    const sel = $(id);
    const current = id === 'year-from' ? from : to;
    sel.innerHTML = years
      .map((y) => `<option value="${y}"${y === current ? ' selected' : ''}>${y}</option>`)
      .join('');
  }
}

function taxableForYear(parcel, taxRoll, year) {
  const row = taxRoll.find((r) => r.taxYear === year);
  if (row) return row.taxable;
  if (year === parcel.taxYear) return parcel.taxable;
  const latestRoll = [...taxRoll].sort((a, b) => b.taxYear - a.taxYear)[0];
  if (latestRoll && year > latestRoll.taxYear) return latestRoll.taxable;
  return parcel.taxable;
}

function billedForYear(receivables, year) {
  const rec = pickReceivable(receivables, year);
  return rec?.billed || null;
}

function buildSlices() {
  const { snapshot, parcel, receivables, taxRoll, from, to } = state;
  if (!snapshot || !parcel) return [];
  const years = clampRange(availableYears(snapshot), from, to);
  const slices = [];
  for (const year of years) {
    const rates = ratesFor(snapshot, parcel.levyCode, year);
    if (!rates) continue;
    const billed = billedForYear(receivables, year);
    const taxable = taxableForYear(parcel, taxRoll, year);
    const rollHit = taxRoll.some((r) => r.taxYear === year);
    const source = billed
      ? 'King County billed amount'
      : rollHit
        ? 'taxable value × levy rate'
        : year === parcel.taxYear
          ? 'current taxable value × levy rate'
          : 'current taxable value × that year’s levy rate';
    slices.push(yearSlice({ rates, taxable, billed, source }));
  }
  return slices;
}

function renderMatches(matches) {
  const box = $('matches');
  if (!matches.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = matches
    .map(
      (m, i) => `
      <button type="button" class="match-btn" data-i="${i}">
        <span>${escapeHtml(displayAddress(toAttrs(m)))}</span>
        <small>${formatPin(m.pin)} · levy ${m.levyCode}${m.propName ? ` · ${escapeHtml(m.propName)}` : ''}</small>
      </button>`
    )
    .join('');
  box.querySelectorAll('.match-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = matches[Number(btn.dataset.i)];
      openParcel(row);
    });
  });
}

function toAttrs(p) {
  return {
    ADDR_FULL: p.address,
    UNIT_NUM: p.unit,
    CTYNAME: p.city,
    ZIP5: p.zip,
    PIN: p.pin,
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function openParcel(parcel) {
  if (!parcel.seattle) {
    setStatus('That address is outside Seattle city limits.', true);
    $('result').hidden = true;
    return;
  }
  state.parcel = parcel;
  setStatus('Loading tax years…');
  $('matches').hidden = true;
  const [receivables, roll] = await Promise.all([
    fetchReceivables(parcel.account),
    fetchTaxRoll(parcel.pin),
  ]);
  state.receivables = receivables;
  state.taxRoll = parseTaxRollHtml(roll.html);
  const years = availableYears(state.snapshot);
  const current = parcel.taxYear && years.includes(parcel.taxYear)
    ? parcel.taxYear
    : latestYear(state.snapshot);
  state.from = current;
  state.to = current;
  fillYearSelects(years, state.from, state.to);
  renderResult();
  setStatus('');
  history.replaceState(null, '', `?pin=${encodeURIComponent(parcel.pin)}`);
}

function renderResult() {
  const { parcel, snapshot } = state;
  const slices = buildSlices();
  if (!slices.length) {
    setStatus('No levy rates for that levy code in the snapshot years.', true);
    return;
  }
  $('result').hidden = false;
  const agg = aggregateSlices(slices);
  const one = slices.length === 1;
  const focus = one ? slices[0] : agg;

  $('place-title').textContent = displayAddress(toAttrs(parcel));
  $('place-meta').textContent = [
    parcel.propName,
    `PIN ${formatPin(parcel.pin)}`,
    `levy code ${parcel.levyCode}`,
    parcel.levyJuris,
  ]
    .filter(Boolean)
    .join(' · ');
  $('place-facts').innerHTML = [
    ['Taxable value', formatMoney(parcel.taxable)],
    ['Levy year on GIS', parcel.taxYear || '—'],
    ['Land', formatMoney(parcel.land)],
    ['Improvements', formatMoney(parcel.imps)],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');

  $('bill-kicker').textContent = one ? `Tax year ${focus.year}` : `${agg.from}–${agg.to} combined`;
  $('bill-title').textContent = one ? 'Property tax' : 'Property tax over the range';
  $('bill-amount').textContent = formatMoney(focus.tax, 2);
  const note = one
    ? `${focus.estimated ? 'Estimated from taxable value × levy rate.' : 'King County billed amount.'} ${formatMoney(focus.tax / 1000, 2)} of each $1,000 of taxable value.`
    : `${agg.estimated ? 'Some years are estimated from taxable value × that year’s rate. ' : ''}Sum of ${slices.length} tax years.`;
  $('bill-note').textContent = note;

  const grid = centsGrid(focus.destinations);
  $('cent-grid').innerHTML = grid
    .map((c) => `<span class="cent" style="background:${c.color}" title="${escapeHtml(c.name)}"></span>`)
    .join('');
  $('cent-caption').textContent = focus.destinations
    .map((d) => `${d.name}: ${d.cents.toFixed(1)}¢`)
    .join('; ');

  $('dest-title').textContent = one ? 'Where this year’s dollar goes' : 'Where the combined dollars went';
  const coarseYears = slices.filter((s) => s.coarse).map((s) => s.year);
  const destBits = [
    one
      ? 'Each cent is a hundredth of this parcel’s levy rate.'
      : 'Weighted by dollars in the selected years, not an average of rates.',
  ];
  if (coarseYears.length) {
    destBits.push(
      `Years ${coarseYears.join(', ')} use a coarser city / school / other split because those rate books are only partially parsed.`
    );
  }
  $('dest-note').textContent = destBits.join(' ');
  $('dest-list').innerHTML = focus.destinations
    .map((d) => {
      const extra = one && d.id === 'city' && slices[0].cityParts?.length
        ? `<ul class="parts">${slices[0].cityParts
            .filter((p) => p.dollars)
            .map((p) => `<li><span>${escapeHtml(p.name)}</span><span>${formatMoney(p.dollars, 2)}</span></li>`)
            .join('')}</ul>`
        : one && d.id === 'school' && slices[0].schoolParts?.length
          ? `<ul class="parts">${slices[0].schoolParts
              .filter((p) => p.dollars)
              .map((p) => `<li><span>${escapeHtml(p.name)}</span><span>${formatMoney(p.dollars, 2)}</span></li>`)
              .join('')}</ul>`
          : '';
      return `<li class="dest-row">
        <span class="swatch" style="background:${d.color}"></span>
        <span class="dest-name">${escapeHtml(d.name)}${extra}<small>${escapeHtml(d.blurb || d.group || '')}</small></span>
        <span class="dest-cents">${d.cents.toFixed(1)}¢</span>
        <span class="dest-dollars">${formatMoney(d.dollars, 2)}</span>
      </li>`;
    })
    .join('');

  $('year-chart').innerHTML = slices
    .map((s) => {
      const segs = s.destinations
        .map((d) => `<span style="width:${(d.dollars / s.tax) * 100}%;background:${d.color}"></span>`)
        .join('');
      return `<div class="year-bar-row">
        <span>${s.year}</span>
        <div class="year-bar-track">${segs}</div>
        <span class="amt">${formatMoney(s.tax, 2)}</span>
      </div>`;
    })
    .join('');

  const destIds = [...new Set(slices.flatMap((s) => s.destinations.map((d) => d.id)))];
  const head = `<thead><tr><th>Year</th><th>Bill</th>${destIds
    .map((id) => {
      const name = slices.flatMap((s) => s.destinations).find((d) => d.id === id)?.name || id;
      return `<th>${escapeHtml(name)}</th>`;
    })
    .join('')}</tr></thead>`;
  const body = slices
    .map((s) => {
      const map = Object.fromEntries(s.destinations.map((d) => [d.id, d.dollars]));
      return `<tr><td>${s.year}</td><td>${formatMoney(s.tax, 2)}</td>${destIds
        .map((id) => `<td>${map[id] ? formatMoney(map[id], 2) : '—'}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  $('year-table').innerHTML = `${head}<tbody>${body}</tbody>`;

  const links = assessorLinks(parcel.pin);
  $('official-links').innerHTML = [
    ['eReal Property', links.dashboard],
    ['Levy mix by year', links.levyYear],
    ['Pay / tax bill', links.taxBill],
    ['iMap', links.imap],
  ]
    .map(([label, href]) => `<a href="${href}" rel="noopener noreferrer">${label}</a>`)
    .join('');
}

async function onSubmit(event) {
  event.preventDefault();
  const q = $('address').value.trim();
  if (!q) return;
  $('lookup-btn').disabled = true;
  setStatus('Looking up King County parcels…');
  try {
    const { matches, error } = await searchAddress(q);
    if (error && !matches.length) {
      setStatus(error, true);
      $('result').hidden = true;
      renderMatches([]);
      return;
    }
    const seattle = matches.filter((m) => m.seattle);
    if (!seattle.length) {
      setStatus('No parcel inside Seattle city limits matched that address.', true);
      $('result').hidden = true;
      renderMatches([]);
      return;
    }
    if (seattle.length === 1) {
      renderMatches([]);
      await openParcel(seattle[0]);
    } else {
      setStatus(`${seattle.length} Seattle parcels — pick one.`);
      renderMatches(seattle);
      $('result').hidden = true;
    }
  } catch (err) {
    setStatus(err.message || 'Lookup failed.', true);
  } finally {
    $('lookup-btn').disabled = false;
  }
}

function onRangeChange() {
  state.from = Number($('year-from').value);
  state.to = Number($('year-to').value);
  if (state.parcel) renderResult();
}

async function boot() {
  try {
    state.snapshot = await loadSnapshot();
  } catch (err) {
    setStatus(err.message, true);
    return;
  }
  $('lookup-form').addEventListener('submit', onSubmit);
  $('year-from').addEventListener('change', onRangeChange);
  $('year-to').addEventListener('change', onRangeChange);

  const params = new URLSearchParams(location.search);
  const pin = params.get('pin');
  const address = params.get('address');
  if (pin) {
    $('address').value = pin;
    $('lookup-form').requestSubmit();
  } else if (address) {
    $('address').value = address;
    $('lookup-form').requestSubmit();
  }
}

boot();
