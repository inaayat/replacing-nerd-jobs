import assert from 'node:assert/strict';
import { defaultAssumptions, runDriverModel, seedAssumptions, impliedGrowth, effectiveGrowth, applyScenario, runPracticeModel, describeAssumption, assumptionFields, CORE_ASSUMPTIONS } from '../fortune-500/model.js';
import { guessPlaybook, playbookById, industryPlaybooks, DECISION_TREE, GOLDEN_RULES, PLAYBOOKS } from '../fortune-500/playbooks.js';
import { buildWorkbookXml, workbookFilename } from '../fortune-500/workbook.js';

const headlines = {
  asOfYear: 2024,
  metrics: { revenue: { val: 100 }, assets: { val: 200 }, net_income: { val: 20 } },
  ratios: { revenue_yoy: 0.1, net_margin: 0.2, fcf_margin: 0.05, roa: 0.1, gross_margin: 0.4 },
};

const a = defaultAssumptions(headlines);
assert.equal(a.revenueGrowth, 0.1);
assert.equal(a.netMargin, 0.2);
assert.equal(a.fcfMargin, 0.05);

const model = runDriverModel(headlines, { ...a, years: 2 });
assert.equal(model.ok, true);
assert.equal(model.rows.length, 3);
assert.equal(model.rows[0].revenue, 100);
assert.equal(model.rows[0].filed, true);
assert.equal(model.rows[0].netIncome, 20);
assert.ok(Math.abs(model.rows[1].revenue - 110) < 1e-9);
assert.ok(Math.abs(model.rows[1].netIncome - 22) < 1e-9);
assert.ok(Math.abs(model.rows[2].revenue - 121) < 1e-9);

const noRev = runDriverModel({ asOfYear: 2024, metrics: {} }, a);
assert.equal(noRev.ok, false);

const noMargin = runDriverModel(
  { asOfYear: 2024, metrics: { revenue: { val: 50 } }, ratios: {} },
  { years: 1, revenueGrowth: 0, netMargin: null, fcfMargin: null }
);
assert.equal(noMargin.ok, true);
assert.equal(noMargin.rows[0].netIncome, null);
assert.equal(noMargin.rows[0].fcf, null);

assert.equal(guessPlaybook({ fortune_ticker: 'WMT', company: 'Walmart' }).id, 'retail');
assert.equal(guessPlaybook({ fortune_ticker: 'AMZN', company: 'Amazon' }).id, 'marketplace');
assert.equal(guessPlaybook({ fortune_ticker: 'JPM', company: 'JPMorgan' }).id, 'banking');
assert.equal(guessPlaybook({ fortune_ticker: 'ZZZZ', company: 'Mystery Co' }).id, 'generic');

const retail = playbookById('retail');
const seeded = seedAssumptions(headlines, retail);
assert.equal(seeded.playbookId, 'retail');
assert.ok(Math.abs(impliedGrowth(seeded, retail) - ((1.03) * (1.02) - 1)) < 1e-9);
assert.ok(Math.abs(effectiveGrowth(seeded, retail) - impliedGrowth(seeded, retail)) < 1e-9);

const practiced = runPracticeModel(headlines, seeded, retail);
assert.equal(practiced.ok, true);
assert.ok(practiced.sensitivity.rows.length >= 3);
assert.ok(practiced.vsFiled.revenue > 0);

const bull = applyScenario(seeded, 'bull');
assert.equal(bull.scenario, 'bull');
assert.ok(bull.revenueGrowth > seeded.revenueGrowth);
assert.ok(bull.extras.compGrowth > seeded.extras.compGrowth);

const saas = playbookById('saas');
const saasGrowth = impliedGrowth({ extras: { nrr: 1.1, newArrRate: 0.08 } }, saas);
assert.ok(Math.abs(saasGrowth - 0.18) < 1e-9);

const bank = playbookById('banking');
const bankRun = runPracticeModel(
  headlines,
  { ...seedAssumptions(headlines, bank), extras: { loanGrowth: 0.05 } },
  bank
);
assert.ok(Math.abs(bankRun.rows[1].assets - 210) < 1e-9);
assert.ok(Math.abs(bankRun.rows[1].netIncome - 21) < 1e-9);

const xml = buildWorkbookXml({
  company: { company: 'Walmart', fortune_ticker: 'WMT', rank: 2 },
  headlines,
  assumptions: seeded,
  model: practiced,
  playbook: retail,
});
assert.ok(xml.includes('ss:Formula'));
assert.ok(xml.includes('Assumptions!R7C2'));
assert.ok(xml.includes('Worksheet ss:Name="Projection"'));
assert.ok(xml.includes('Worksheet ss:Name="Industry"'));
assert.ok(xml.includes('same-store') || xml.includes('Same-store') || xml.includes('Retail'));
assert.equal(workbookFilename({ fortune_ticker: 'WMT' }), 'WMT-practice-model.xls');
assert.ok(!xml.includes('fpa-crash-course'));
assert.ok(!xml.includes('inaayat.xyz/archive'));
assert.ok(xml.includes('Key inputs'));
assert.ok(xml.includes('Store count'));
assert.ok(xml.includes('Pat the dogs'));

assert.equal(DECISION_TREE.length, 4);
assert.equal(industryPlaybooks().length, 18);
assert.ok(retail.inputs.length >= 5);
assert.ok(retail.metrics.length >= 5);
assert.ok(retail.subs.includes('grocery & supermarket'));
assert.equal(playbookById('startup').id, 'startup');
assert.ok(GOLDEN_RULES.length >= 7);
assert.equal(guessPlaybook({ fortune_ticker: 'ZZZZ', company: 'Mystery Startup LLC' }).id, 'generic');

const sales = CORE_ASSUMPTIONS.find((f) => f.key === 'revenueGrowth');
assert.equal(sales.name, 'Sales growth');
assert.ok(sales.what.endsWith('.'));
assert.ok(!sales.what.includes('revenueGrowth'));
const salesCopy = describeAssumption(sales, headlines, practiced, retail);
assert.match(salesCopy.origin, /Last year’s 10-K/);
assert.match(salesCopy.origin, /10\.0%/);
assert.match(salesCopy.effect, /year-5 revenue/);
assert.match(salesCopy.effect, /\$/);
assert.ok(salesCopy.what.includes('industry’s drivers'));

const missingYoy = defaultAssumptions({ asOfYear: 2024, metrics: { revenue: { val: 100 } }, ratios: {} });
assert.equal(missingYoy.revenueGrowth, null);
const missingCopy = describeAssumption(sales, { ratios: {} }, practiced, playbookById('generic'));
assert.match(missingCopy.origin, /didn’t tag/);

for (const book of PLAYBOOKS) {
  for (const field of book.extras || []) {
    assert.ok(field.what && field.what.endsWith('.'), `${book.id}.${field.key} what`);
    assert.ok(field.what.length >= 40, `${book.id}.${field.key} what too short`);
    assert.ok(field.origin && field.origin.includes('10-K'), `${book.id}.${field.key} origin`);
    assert.ok(!/% \/ yr/.test(field.label), `${book.id}.${field.key} jargon label`);
  }
  const fields = assumptionFields(book);
  assert.equal(fields[0].name, 'Sales growth');
  assert.ok(fields.some((f) => f.key === 'netMargin'));
  assert.ok(fields.some((f) => f.key === 'fcfMargin'));
  assert.ok(fields.some((f) => f.key === 'capexIntensity'));
}

const nrr = playbookById('saas').extras.find((f) => f.key === 'nrr');
assert.match(nrr.what, /existing customers/i);
assert.match(nrr.origin, /110%/);

console.log('fortune-500 model tests passed');
