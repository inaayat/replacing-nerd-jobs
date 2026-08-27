/**
 * Plain-English translations for accounting terms used by Topic 606.
 * Browser-safe ESM — the walk and tests both use this catalog.
 */

export const TERMS = [
  {
    id: 'consideration',
    term: 'Consideration',
    plain: 'What the customer gives you — usually money.',
    match: /\bconsideration\b/i,
  },
  {
    id: 'performance-obligation',
    term: 'Performance obligation',
    plain: 'A promise to deliver a distinct product or service.',
    match: /\bperformance obligation/i,
  },
  {
    id: 'transaction-price',
    term: 'Transaction price',
    plain: 'The total amount you expect to earn from the deal.',
    match: /\btransaction price\b/i,
  },
  {
    id: 'standalone-selling-price',
    term: 'Standalone selling price',
    plain: 'What you would normally charge for that product or service by itself.',
    match: /\bstandalone (?:selling )?price\b/i,
  },
  {
    id: 'control',
    term: 'Control',
    plain: 'The customer can use the product, benefit from it, and stop others from using it.',
    match: /\bcontrol\b/i,
  },
  {
    id: 'variable-consideration',
    term: 'Variable consideration',
    plain: 'Payment that can change because of returns, discounts, bonuses, penalties, or usage.',
    match: /\bvariable consideration\b/i,
  },
  {
    id: 'constraint',
    term: 'Constraint',
    plain: 'Do not count uncertain payment yet if you may have to reverse a large amount later.',
    match: /\bconstrain(?:ed|t|ing)?\b/i,
  },
  {
    id: 'commercial-substance',
    term: 'Commercial substance',
    plain: 'The deal has a real economic effect — it changes your future cash flows.',
    match: /\bcommercial substance\b/i,
  },
  {
    id: 'probable',
    term: 'Probable',
    plain: 'Likely to happen. In this step, ask whether the customer can and intends to pay.',
    match: /\bprobable\b/i,
  },
  {
    id: 'distinct',
    term: 'Distinct',
    plain: 'Useful on its own and not merely an ingredient in one combined result.',
    match: /\bdistinct(?:ness)?\b/i,
  },
  {
    id: 'material-right',
    term: 'Material right',
    plain: 'A valuable future discount or option the customer only receives because of this deal.',
    match: /\bmaterial right\b/i,
  },
  {
    id: 'principal-agent',
    term: 'Principal vs. agent',
    plain: 'A principal sells its own product or service and records the full price. An agent arranges someone else’s sale and records only its fee.',
    match: /\bprincipal\b|\bagent\b/i,
  },
  {
    id: 'financing-component',
    term: 'Significant financing component',
    plain: 'The payment timing effectively gives one side a meaningful loan.',
    match: /\bfinancing (?:component|out of the payment timing)\b/i,
  },
  {
    id: 'noncash',
    term: 'Noncash consideration',
    plain: 'Payment with something other than money, such as shares, equipment, labor, or advertising.',
    match: /\bnoncash\b|something other than cash/i,
  },
  {
    id: 'contract-liability',
    term: 'Contract liability',
    plain: 'The customer paid before you earned it — often called deferred or unearned revenue.',
    match: /\bcontract liability\b/i,
  },
  {
    id: 'contract-asset',
    term: 'Contract asset',
    plain: 'You earned it, but something besides time must happen before you can bill unconditionally.',
    match: /\bcontract asset\b/i,
  },
  {
    id: 'receivable',
    term: 'Receivable',
    plain: 'You have an unconditional right to payment; only time must pass before it is due.',
    match: /\breceivable\b/i,
  },
  {
    id: 'output-input',
    term: 'Output vs. input method',
    plain: 'Measure progress by results delivered (output) or resources used, such as hours or cost (input).',
    match: /\boutput method\b|\binput method\b|\boutput\b.*\binput\b/i,
  },
  {
    id: 'right-to-use-access',
    term: 'Right to use vs. right to access',
    plain: 'Use means the customer gets the IP as it exists today. Access means it keeps changing because of your ongoing work.',
    match: /\bright to use\b|\bright to access\b/i,
  },
];

export function termsFor(text, limit = 4) {
  const source = String(text || '');
  return TERMS.filter((item) => item.match.test(source)).slice(0, limit);
}

export function termById(id) {
  return TERMS.find((item) => item.id === id) || null;
}
