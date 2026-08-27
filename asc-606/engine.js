/**
 * ASC 606 decision-tree walker.
 * Browser-safe ESM — no node: imports.
 */

export const START_ID = 'start';

export function nodeById(tree, id) {
  return tree.find((n) => n.id === id) || null;
}

export function choiceById(node, choiceId) {
  if (!node || !node.choices) return null;
  return node.choices.find((c) => c.id === choiceId) || null;
}

/**
 * Replay answers in order. `answers` is { [nodeId]: choiceId }.
 * Stops at the first unanswered question or an outcome node.
 */
export function walk(tree, answers = {}) {
  const path = [];
  const findings = [];
  let id = START_ID;
  const seen = new Set();

  while (id) {
    if (seen.has(id)) {
      return { path, findings, current: null, complete: false, error: `cycle at ${id}` };
    }
    seen.add(id);
    const node = nodeById(tree, id);
    if (!node) {
      return { path, findings, current: null, complete: false, error: `missing node ${id}` };
    }
    path.push(node);
    if (node.kind === 'outcome') {
      return { path, findings, current: node, complete: true, error: null };
    }
    const picked = answers[node.id];
    const choice = picked ? choiceById(node, picked) : null;
    if (!choice) {
      return { path, findings, current: node, complete: false, error: null };
    }
    if (choice.findings) findings.push(...choice.findings.map((f) => ({ ...f, nodeId: node.id, choiceId: choice.id })));
    id = choice.next;
  }

  return { path, findings, current: null, complete: false, error: 'open path' };
}

export function finding(findings, key) {
  for (let i = findings.length - 1; i >= 0; i--) {
    if (findings[i].key === key) return findings[i];
  }
  return null;
}

export function findingValue(findings, key, fallback = null) {
  const hit = finding(findings, key);
  return hit ? hit.value : fallback;
}

/** Plain-English memo lines from the walk, newest last. */
export function memoLines(result) {
  return result.findings
    .filter((f) => f.text)
    .map((f) => ({
      key: f.key,
      text: f.text,
      citations: f.citations || [],
      step: f.step || null,
    }));
}

export function validateTree(tree, citations = null) {
  const errors = [];
  const ids = new Set();
  if (!Array.isArray(tree) || !tree.length) errors.push('tree is empty');
  for (const node of tree || []) {
    if (!node.id) errors.push('node missing id');
    else if (ids.has(node.id)) errors.push(`duplicate id ${node.id}`);
    else ids.add(node.id);
    if (!node.title) errors.push(`${node.id || '?'} missing title`);
    if (!node.plain) errors.push(`${node.id || '?'} missing plain`);
    if (!node.step) errors.push(`${node.id || '?'} missing step`);
    if (!Array.isArray(node.citations)) errors.push(`${node.id || '?'} citations must be an array`);
    if (citations) {
      for (const cite of node.citations || []) {
        if (!citations[cite]) errors.push(`${node.id} cites unknown ${cite}`);
      }
    }
    if (node.kind === 'outcome') {
      if (node.choices && node.choices.length) errors.push(`${node.id} outcome has choices`);
      continue;
    }
    if (!node.choices || !node.choices.length) errors.push(`${node.id} has no choices`);
    const choiceIds = new Set();
    for (const choice of node.choices || []) {
      if (!choice.id) errors.push(`${node.id} choice missing id`);
      else if (choiceIds.has(choice.id)) errors.push(`${node.id} duplicate choice ${choice.id}`);
      else choiceIds.add(choice.id);
      if (!choice.label) errors.push(`${node.id}/${choice.id} missing label`);
      if (!choice.next) errors.push(`${node.id}/${choice.id} missing next`);
      if (citations) {
        for (const cite of choice.citations || []) {
          if (!citations[cite]) errors.push(`${node.id}/${choice.id} cites unknown ${cite}`);
        }
        for (const f of choice.findings || []) {
          for (const cite of f.citations || []) {
            if (!citations[cite]) errors.push(`${node.id}/${choice.id} finding cites unknown ${cite}`);
          }
        }
      }
    }
  }
  if (!ids.has(START_ID)) errors.push(`missing start node ${START_ID}`);
  for (const node of tree || []) {
    for (const choice of node.choices || []) {
      if (choice.next && !ids.has(choice.next)) {
        errors.push(`${node.id}/${choice.id} points to missing ${choice.next}`);
      }
    }
  }
  return errors;
}

/** Reachable node ids from start following any choice. */
export function reachableIds(tree) {
  const seen = new Set();
  const queue = [START_ID];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodeById(tree, id);
    for (const choice of node?.choices || []) {
      if (choice.next) queue.push(choice.next);
    }
  }
  return seen;
}

export function summarize(result) {
  const { findings, current } = result;
  const lines = [];
  const timing = findingValue(findings, 'timing');
  const role = findingValue(findings, 'role');
  const contractOk = findingValue(findings, 'contractOk');
  const license = findingValue(findings, 'license');

  if (current?.outcome === 'out') {
    lines.push(current.plain);
    return { headline: current.title, lines, outcome: current.outcome };
  }
  if (current?.outcome === 'wait') {
    lines.push(current.plain);
    return { headline: current.title, lines, outcome: current.outcome };
  }

  if (contractOk) lines.push('A Topic 606 contract exists — all five Step 1 criteria were met.');
  if (role === 'agent') lines.push('Recognize only the fee or commission (agent), not the customer’s gross spend.');
  if (role === 'principal') lines.push('Recognize the gross consideration (principal).');
  if (findingValue(findings, 'distinct') === false) {
    lines.push('Promises that are not distinct are combined into one performance obligation.');
  }
  if (findingValue(findings, 'distinct') === true) {
    lines.push('At least one promise is distinct and is accounted for separately.');
  }
  if (findingValue(findings, 'series')) {
    lines.push('Repeating units with the same over-time pattern are one series obligation.');
  }
  if (findingValue(findings, 'materialRight')) {
    lines.push('A material right is its own performance obligation: that slice waits for the future good or expiry.');
  }
  if (findingValue(findings, 'warranty') === 'assurance') {
    lines.push('The assurance warranty is Topic 460, not a 606 performance obligation.');
  }
  if (findingValue(findings, 'variable')) {
    const c = findingValue(findings, 'constrained');
    if (c === 'royalty') lines.push('Sales- or usage-based IP royalties wait for the later of the sale/usage and satisfaction.');
    else if (c === 'partial') lines.push('Include only the constrained portion of variable consideration in the transaction price.');
    else lines.push('Estimate variable consideration and include it to the extent a significant reversal is not probable.');
  }
  if (findingValue(findings, 'financing')) {
    lines.push('Impute a significant financing component: revenue at the cash selling price, interest separately.');
  }
  if (findingValue(findings, 'payable') === 'reduce') {
    lines.push('Payments to the customer reduce the transaction price except to the extent they buy a distinct good at fair value.');
  }
  if (timing === 'over-time') {
    const method = findingValue(findings, 'progress');
    if (method === 'cost-recovery') {
      lines.push('Over time, but progress cannot be measured yet — recognize only recoverable costs.');
    } else {
      lines.push(`Recognize over time using a ${method || 'progress'} method that depicts transfer of control.`);
    }
  } else if (timing === 'point') {
    lines.push('Recognize at the point in time the customer obtains control.');
  }
  if (license === 'use') lines.push('The IP license is a right to use, satisfied at a point in time.');
  if (license === 'access') lines.push('The IP license is a right to access, satisfied over time.');
  lines.push('Present a contract liability if they paid first, a contract asset if you performed and payment is still conditional, or a receivable if only time remains.');
  return {
    headline: current?.title || 'Recognize when (or as) control transfers.',
    lines,
    outcome: current?.outcome || 'recognize',
  };
}

export function expectedAnswers(scenario) {
  return { ...(scenario.answers || {}) };
}

export function scoreQuiz(tree, scenario, answers) {
  const expected = expectedAnswers(scenario);
  const keys = Object.keys(expected);
  let correct = 0;
  const compared = [];
  for (const nodeId of keys) {
    const want = expected[nodeId];
    const got = answers[nodeId];
    const ok = got === want;
    if (ok) correct += 1;
    const node = nodeById(tree, nodeId);
    compared.push({
      nodeId,
      title: node?.title || nodeId,
      want,
      got: got || null,
      ok,
    });
  }
  const expectedWalk = walk(tree, expected);
  return {
    total: keys.length,
    correct,
    compared,
    expectedWalk,
    complete: walk(tree, answers).complete,
  };
}
