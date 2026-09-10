/**
 * Seattle property taxes: levy allocation, address normalize, tax-roll parse.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SNAPSHOT_SCHEMA,
  allocate,
  aggregateSlices,
  centsGrid,
  clampRange,
  displayAddress,
  formatPin,
  isSeattleParcel,
  latestYear,
  moneyToCents,
  normalizeAddress,
  normalizePin,
  padLevyCode,
  parseLevyPiesHtml,
  parsePackedCents,
  parseTaxRollHtml,
  pickReceivable,
  ratesFor,
  taxFromTaxable,
  yearSlice,
} from '../seattle-property-taxes/engine.js';
import { parcelSearchUrl, parcelByPinUrl, receivablesUrl, slimParcel } from '../seattle-property-taxes/lookup.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = JSON.parse(
  readFileSync(resolve(ROOT, 'seattle-property-taxes/data/levy-rates.json'), 'utf8')
);

assert.equal(snapshot.schema, SNAPSHOT_SCHEMA);
assert.equal(latestYear(snapshot), 2026);

const r26 = ratesFor(snapshot, '10', 2026);
assert.equal(r26.levyCode, '0010');
assert.equal(r26.schoolName, 'Seattle Public Schools');
const shareSum = r26.destinations.reduce((s, d) => s + d.rate, 0);
assert.ok(Math.abs(shareSum - r26.totalRegular) < 0.00002, shareSum);

const billed = taxFromTaxable(72153700, r26.totalRegular);
assert.equal(moneyToCents(billed), 71493133);
const rows = allocate(billed, r26.destinations);
assert.equal(rows.reduce((s, d) => s + moneyToCents(d.dollars), 0), moneyToCents(billed));
assert.equal(Math.round(rows.reduce((s, d) => s + d.cents, 0) * 10), 1000);
const city = rows.find((d) => d.id === 'city');
assert.ok(city.cents > 30 && city.cents < 31);

const grid = centsGrid(r26.destinations);
assert.equal(grid.length, 100);
assert.ok(grid.every((c) => c.color && c.id));

const highline = ratesFor(snapshot, '0030', 2026);
assert.equal(highline.schoolName, 'Highline Public Schools');
assert.ok(highline.totalRegular > r26.totalRegular);

assert.equal(ratesFor(snapshot, '0011', 2026).totalRegular, r26.totalRegular);
assert.equal(ratesFor(snapshot, '9999', 2026), null);

const slice = yearSlice({ rates: r26, taxable: 72153700, billed: 714931.33 });
assert.equal(slice.estimated, false);
assert.equal(slice.tax, 714931.33);

const est = yearSlice({ rates: r26, taxable: 72153700 });
assert.equal(est.estimated, true);

const y25 = ratesFor(snapshot, '0010', 2025);
const agg = aggregateSlices([
  yearSlice({ rates: y25, taxable: 59723600 }),
  yearSlice({ rates: r26, taxable: 72153700 }),
]);
assert.equal(agg.from, 2025);
assert.equal(agg.to, 2026);
assert.ok(agg.tax > 1_000_000);
assert.equal(agg.destinations.reduce((s, d) => s + moneyToCents(d.dollars), 0), moneyToCents(agg.tax));

assert.deepEqual(clampRange([2019, 2022, 2026], 2024, 2020), [2022]);
assert.deepEqual(clampRange([2022, 2023, 2024], 2023, 2023), [2023]);

assert.equal(isSeattleParcel({ LEVY_JURIS: 'SEATTLE', CTYNAME: 'Seattle' }), true);
assert.equal(isSeattleParcel({ LEVY_JURIS: 'BELLEVUE', CTYNAME: 'Bellevue' }), false);
assert.equal(isSeattleParcel({ CTYNAME: 'seattle' }), true);

assert.equal(normalizeAddress('400 Broad Street, Seattle, WA 98109').query, '400 BROAD ST');
assert.equal(normalizeAddress('1215 4th Ave').house, '1215');
assert.equal(normalizePin('198520-0495'), '1985200495');
assert.equal(padLevyCode(10), '0010');
assert.equal(formatPin('1985200495'), '198520-0495');
assert.equal(parsePackedCents('0071493133'), 714931.33);

const html = `
<table class="GridViewStyle" id="cphContent_GridViewDBTaxRoll">
  <tr class="GridViewHeaderStyle"><th>x</th></tr>
  <tr class="GridViewRowStyle">
    <td><font>2025</font></td><td><font>2026</font></td>
    <td><font>1</font></td><td><font>2</font></td><td><font>3</font></td>
    <td><font>0</font></td>
    <td><font>11,109,000</font></td><td><font>61,044,700</font></td>
    <td><font>72,153,700</font></td>
  </tr>
</table>`;
const roll = parseTaxRollHtml(html);
assert.equal(roll[0].taxYear, 2026);
assert.equal(roll[0].taxable, 72153700);

const pies = parseLevyPiesHtml(
  "data.addRows([['State School Fund, 2.24959, 22.70%', 2.24959],['City, 3.01677, 30.45%', 3.01677]])"
);
assert.equal(pies[0].destinations[0].id, 'state-schools');
assert.equal(pies[0].destinations[1].id, 'city');

const rec = pickReceivable(
  [
    { bill_year: '2026', receivable_type: 'V', billed_amount: '0000001289', levy_code: '9430' },
    { bill_year: '2026', receivable_type: 'R', billed_amount: '0071493133', levy_code: '0010', land_value: '011109000', imps_value: '061044700' },
  ],
  2026
);
assert.equal(rec.billed, 714931.33);
assert.equal(rec.levyCode, '0010');
assert.equal(rec.taxable, 72153700);

const url = parcelSearchUrl('400 Broad St, Seattle');
assert.match(url, /DistrictsReport\/MapServer\/1\/query/);
assert.match(url, /SEATTLE/);
assert.match(url, /400(\+|%20)BROAD(\+|%20)ST/);
assert.match(parcelByPinUrl('1985200495'), /1985200495/);
assert.match(parcelByPinUrl('1985200495'), /PIN/);
assert.match(receivablesUrl('198520049505'), /dkna-i698/);

const parcel = slimParcel({
  PIN: '1985200495',
  ADDR_FULL: '400 BROAD ST',
  CTYNAME: 'Seattle',
  LEVYCODE: '0010',
  LEVY_JURIS: 'SEATTLE',
  TAX_LNDVAL: 11109000,
  TAX_IMPR: 61044700,
  ACCNT_NUM: '198520049505',
  KCTP_TAXYR: 2026,
});
assert.equal(parcel.seattle, true);
assert.equal(parcel.taxable, 72153700);
assert.equal(displayAddress({ ADDR_FULL: '400 BROAD ST', CTYNAME: 'Seattle', ZIP5: '98109' }), '400 BROAD ST, Seattle, 98109');

for (const year of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
  const rates = ratesFor(snapshot, '0010', year);
  const sum = rates.destinations.reduce((s, d) => s + d.rate, 0);
  assert.ok(Math.abs(sum - rates.totalRegular) < 0.00003, `${year} ${sum} vs ${rates.totalRegular}`);
}

const y21 = ratesFor(snapshot, '0010', 2021);
assert.equal(y21.coarse, true);
assert.equal(y21.destinations.find((d) => d.id === 'city').rate, 2.25041);
assert.equal(y21.destinations.find((d) => d.id === 'other').rate, 7.06079);
assert.equal(y21.destinations.find((d) => d.id === 'school'), undefined);

const cityParts = r26.cityParts.reduce((s, p) => s + p.rate, 0);
assert.ok(Math.abs(cityParts - city.rate) < 0.00002, cityParts);

console.log('seattle-property-taxes tests ok');
