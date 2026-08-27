/**
 * ASC 606 decision tree: citations, walk integrity, quiz paths.
 */
import assert from 'node:assert/strict';
import { CITATIONS, citationText } from '../asc-606/citations.js';
import { TREE, STEPS } from '../asc-606/tree.js';
import { QUIZZES, quizById } from '../asc-606/quiz.js';
import { TERMS, termById, termsFor } from '../asc-606/glossary.js';
import {
  START_ID,
  walk,
  nodeById,
  validateTree,
  reachableIds,
  scoreQuiz,
  summarize,
  memoLines,
  findingValue,
} from '../asc-606/engine.js';

const errors = validateTree(TREE, CITATIONS);
assert.deepEqual(errors, [], errors.join('\n'));

assert.equal(START_ID, 'start');
assert.ok(nodeById(TREE, 'start'));
assert.equal(STEPS.length, 6);
assert.equal(STEPS[0].short, 'Does this guide apply?');

assert.ok(TERMS.length >= 15);
assert.match(termById('performance-obligation').plain, /promise/i);
assert.equal(termById('missing'), null);
assert.deepEqual(
  termsFor('Allocate the transaction price to each performance obligation').map((item) => item.id),
  ['performance-obligation', 'transaction-price']
);

const reachable = reachableIds(TREE);
const missingReach = TREE.filter((n) => !reachable.has(n.id)).map((n) => n.id);
assert.deepEqual(missingReach, [], `unreachable nodes: ${missingReach.join(', ')}`);

for (const [id, text] of Object.entries(CITATIONS)) {
  assert.match(id, /^606-10-\d{2}-\d+[A-Z]{0,2}$/);
  assert.ok(text.length > 40, `${id} excerpt is too short`);
  assert.ok(!text.includes('['), `${id} still has bracket junk`);
}
assert.ok(citationText('606-10-25-1').includes('probable'));
assert.equal(citationText('nope'), null);

const empty = walk(TREE, {});
assert.equal(empty.complete, false);
assert.equal(empty.current.id, 'start');
assert.equal(empty.path.length, 1);

const first = walk(TREE, { start: 'begin' });
assert.equal(first.current.id, 'scope-customer');

const notCustomer = walk(TREE, {
  start: 'begin',
  'scope-customer': 'no',
});
assert.equal(notCustomer.complete, true);
assert.equal(notCustomer.current.id, 'outcome-not-customer');
assert.equal(findingValue(notCustomer.findings, 'customer'), false);
const outSummary = summarize(notCustomer);
assert.equal(outSummary.outcome, 'out');

const lease = walk(TREE, {
  start: 'begin',
  'scope-customer': 'yes',
  'scope-kind': 'lease',
});
assert.equal(lease.current.id, 'outcome-other-topic');
assert.equal(findingValue(lease.findings, 'otherTopic'), '842');

const deposit = walk(TREE, {
  start: 'begin',
  'scope-customer': 'yes',
  'scope-kind': 'in',
  's1-form': 'yes',
  's1-approved': 'yes',
  's1-rights': 'yes',
  's1-payment': 'yes',
  's1-substance': 'yes',
  's1-collect': 'no',
  's1-fail': 'cash',
});
assert.equal(deposit.complete, true);
assert.equal(deposit.current.id, 'outcome-deposit');
assert.equal(findingValue(deposit.findings, 'contractOk'), false);
assert.match(summarize(deposit).headline, /liability/i);

for (const quiz of QUIZZES) {
  const result = walk(TREE, quiz.answers);
  assert.equal(result.error, null, `${quiz.id}: ${result.error}`);
  assert.equal(result.complete, true, `${quiz.id} does not reach an outcome`);
  assert.ok(result.current.kind === 'outcome', `${quiz.id} ended on ${result.current?.id}`);
  const scored = scoreQuiz(TREE, quiz, quiz.answers);
  assert.equal(scored.correct, scored.total, `${quiz.id} teaching path does not score 100%`);
  assert.ok(memoLines(result).length > 0, `${quiz.id} produced no memo`);
}

assert.equal(quizById('saas').industry, 'Software');
assert.equal(quizById('missing'), null);

const saas = walk(TREE, quizById('saas').answers);
assert.equal(saas.current.id, 'outcome-recognize');
assert.equal(findingValue(saas.findings, 'contractOk'), true);
assert.equal(findingValue(saas.findings, 'distinct'), true);
assert.equal(findingValue(saas.findings, 'series'), true);
assert.equal(findingValue(saas.findings, 'timing'), 'over-time');
assert.equal(findingValue(saas.findings, 'alloc'), 'observable');

const build = walk(TREE, quizById('custom-build').answers);
assert.equal(findingValue(build.findings, 'overTime'), 'b');
assert.equal(findingValue(build.findings, 'distinct'), false);
assert.equal(findingValue(build.findings, 'warranty'), 'assurance');

const market = walk(TREE, quizById('marketplace').answers);
assert.equal(findingValue(market.findings, 'role'), 'agent');
assert.match(summarize(market).lines.join(' '), /fee or commission/);

const returns = walk(TREE, quizById('returns').answers);
assert.equal(findingValue(returns.findings, 'variable'), true);
assert.equal(findingValue(returns.findings, 'varMethod'), 'expected');
assert.equal(findingValue(returns.findings, 'timing'), 'point');

const brand = walk(TREE, quizById('brand-license').answers);
assert.equal(findingValue(brand.findings, 'constrained'), 'royalty');
assert.equal(findingValue(brand.findings, 'license'), 'access');

const gift = walk(TREE, quizById('gift-card').answers);
assert.equal(findingValue(gift.findings, 'materialRight'), true);
assert.equal(findingValue(gift.findings, 'financing'), false);

const cited = new Set();
for (const node of TREE) {
  for (const id of node.citations || []) cited.add(id);
  for (const choice of node.choices || []) {
    for (const id of choice.citations || []) cited.add(id);
    for (const finding of choice.findings || []) {
      for (const id of finding.citations || []) cited.add(id);
    }
  }
}
const unused = Object.keys(CITATIONS).filter((id) => !cited.has(id));
assert.ok(unused.length < Object.keys(CITATIONS).length, 'every citation unused — tree is empty?');

console.log('ASC 606 decision-tree tests passed');
