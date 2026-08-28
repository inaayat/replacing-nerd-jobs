/**
 * ASC 606 company decision tree.
 * Each question is plain English; citation chips point at CITATIONS.
 */

function f(key, value, text, citations, step) {
  return { key, value, text, citations: citations || [], step: step || null };
}

export const STEPS = [
  { id: 'scope', label: 'First check', short: 'Does this guide apply?' },
  { id: '1', label: 'Step 1', short: 'Do you have a real deal?' },
  { id: '2', label: 'Step 2', short: 'What did you promise?' },
  { id: '3', label: 'Step 3', short: 'How much will you get?' },
  { id: '4', label: 'Step 4', short: 'Split the total price' },
  { id: '5', label: 'Step 5', short: 'When do you earn it?' },
];

export const TREE = [
  {
    id: 'start',
    step: 'scope',
    title: 'When can you count this sale as revenue?',
    plain:
      'ASC 606 is a five-step recipe for deciding how much revenue to record and when to record it. Answer these questions for one real customer deal. The small numbered buttons open the official accounting rule behind each question.',
    citations: ['606-10-05-3', '606-10-05-4', '606-10-10-2'],
    choices: [
      {
        id: 'begin',
        label: 'Start — check whether this guide applies',
        next: 'scope-customer',
      },
    ],
  },

  {
    id: 'scope-customer',
    step: 'scope',
    title: 'Are they buying something your business normally sells?',
    plain:
      'This guide is for sales to customers. Say yes when the other party is paying for a product or service your business normally provides. A research partner sharing risk, a donor, or another business swapping similar inventory is usually not a customer for this rule.',
    citations: ['606-10-15-3', '606-10-15-2A'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — they are buying what we normally sell',
        next: 'scope-kind',
        findings: [
          f('customer', true, 'The counterparty is a customer: they are buying an output of ordinary activities for consideration.', ['606-10-15-3'], 'scope'),
        ],
      },
      {
        id: 'no',
        label: 'No — collaborator, contributor, or something else',
        next: 'outcome-not-customer',
        findings: [
          f('customer', false, 'The counterparty is not a customer, so Topic 606 does not apply to this arrangement.', ['606-10-15-3'], 'scope'),
        ],
      },
    ],
  },

  {
    id: 'scope-kind',
    step: 'scope',
    title: 'Is this a normal sale, rather than a lease, insurance policy, or financial instrument?',
    plain:
      'Most sales of products and services use ASC 606. Leases, insurance policies, loans, investments, derivatives, and most guarantees use different accounting rules. If a deal contains both kinds, separate the other piece first and use this guide for the customer-sale piece that remains.',
    citations: ['606-10-15-2', '606-10-15-4'],
    choices: [
      {
        id: 'in',
        label: 'This is a normal sale of goods or services — 606 owns it',
        next: 's1-form',
        findings: [
          f('scope', 'in', 'The contract is within Topic 606. No scoped-out Topic takes it first.', ['606-10-15-2'], 'scope'),
        ],
      },
      {
        id: 'lease',
        label: 'It is a lease (right to use an identified asset)',
        next: 'outcome-other-topic',
        findings: [
          f('scope', 'lease', 'This is a lease. Measure and present it under Topic 842, not 606.', ['606-10-15-2'], 'scope'),
          f('otherTopic', '842', 'Apply Topic 842, Leases.', ['606-10-15-2'], 'scope'),
        ],
      },
      {
        id: 'insurance',
        label: 'It is an insurance contract',
        next: 'outcome-other-topic',
        findings: [
          f('scope', 'insurance', 'This is an insurance contract. Topic 944 owns it.', ['606-10-15-2'], 'scope'),
          f('otherTopic', '944', 'Apply Topic 944, Financial Services—Insurance.', ['606-10-15-2'], 'scope'),
        ],
      },
      {
        id: 'instrument',
        label: 'It is a financial instrument, debt, derivative, or similar',
        next: 'outcome-other-topic',
        findings: [
          f('scope', 'instrument', 'Financial instruments and similar rights sit in other Topics (310, 320, 321, 323, 325, 405, 470, 815, 825, 860).', ['606-10-15-2'], 'scope'),
          f('otherTopic', 'instruments', 'Apply the financial-instrument Topic that owns the contract.', ['606-10-15-2'], 'scope'),
        ],
      },
      {
        id: 'guarantee',
        label: 'It is a guarantee (not a product or service warranty)',
        next: 'outcome-other-topic',
        findings: [
          f('scope', 'guarantee', 'Non-warranty guarantees are scoped to Topic 460.', ['606-10-15-2'], 'scope'),
          f('otherTopic', '460', 'Apply Topic 460, Guarantees.', ['606-10-15-2'], 'scope'),
        ],
      },
      {
        id: 'swap',
        label: 'Same-line inventory swap to serve each other\'s customers',
        next: 'outcome-other-topic',
        findings: [
          f('scope', 'swap', 'A nonmonetary exchange between entities in the same line of business to facilitate sales is outside 606. Topic 845 may apply.', ['606-10-15-2'], 'scope'),
          f('otherTopic', '845', 'Consider Topic 845, Nonmonetary Transactions.', ['606-10-15-2'], 'scope'),
        ],
      },
      {
        id: 'mixed',
        label: 'Mixed — part lease / instrument / other, part sale',
        next: 'scope-mixed',
        findings: [
          f('scope', 'mixed', 'The contract is only partly in 606. Separate and measure the other Topic first, then run these five steps on the leftover consideration.', ['606-10-15-4'], 'scope'),
        ],
      },
    ],
  },

  {
    id: 'scope-mixed',
    step: 'scope',
    title: 'Peel off the other Topic, then keep walking.',
    plain:
      'If 842 (or another listed Topic) tells you how to carve and measure its piece, do that first and drop that amount out of the 606 transaction price. If it does not, 606 does the carving. Either way, the leftover is what you will allocate to performance obligations.',
    citations: ['606-10-15-4'],
    choices: [
      {
        id: 'continue',
        label: 'The leftover is a customer sale — continue to Step 1',
        next: 's1-form',
      },
    ],
  },

  {
    id: 's1-form',
    step: '1',
    title: 'Is there an agreement that a court would enforce?',
    plain:
      'A contract is any agreement that creates enforceable rights and obligations. It can be written, oral, or implied by how you actually do business. If either side can walk away from a wholly unperformed deal for free, 606 says there is no contract yet. Duration is only the period of present enforceable rights — month-to-month and auto-renew deals are measured that way.',
    citations: ['606-10-25-2', '606-10-25-3', '606-10-25-4'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — written, oral, or implied, and it binds both sides',
        next: 's1-approved',
        findings: [
          f('enforceable', true, 'There is an enforceable agreement (written, oral, or implied by customary practice).', ['606-10-25-2'], '1'),
        ],
      },
      {
        id: 'no',
        label: 'No — nothing a court would enforce, or either side can cancel a blank deal for free',
        next: 's1-fail',
        findings: [
          f('enforceable', false, 'There is no enforceable contract yet (or each party can cancel a wholly unperformed deal without compensating the other).', ['606-10-25-2', '606-10-25-4'], '1'),
          f('contractOk', false, 'Step 1 fails: no enforceable contract.', ['606-10-25-1', '606-10-25-4'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-approved',
    step: '1',
    title: 'Have both sides approved the deal and committed to do their part?',
    plain:
      'Approval can be a signature, a verbal go-ahead, or the way you always close this kind of sale. Commitment means each side intends to perform — a letter of intent that is still a shopping list is not enough.',
    citations: ['606-10-25-1'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — approved and both sides are committed',
        next: 's1-rights',
        findings: [
          f('approved', true, 'The parties have approved the contract and are committed to perform.', ['606-10-25-1'], '1'),
        ],
      },
      {
        id: 'no',
        label: 'Not yet — still negotiating or one side can still walk',
        next: 's1-fail',
        findings: [
          f('approved', false, 'The parties have not both approved and committed. Criterion 606-10-25-1(a) fails.', ['606-10-25-1'], '1'),
          f('contractOk', false, 'Step 1 fails: the contract is not approved and committed.', ['606-10-25-1'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-rights',
    step: '1',
    title: 'Can you tell what each side is entitled to get?',
    plain:
      'You need to know which goods or services you must transfer and what the customer is entitled to receive. If the statement of work is still “TBD,” you cannot identify the rights.',
    citations: ['606-10-25-1'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — we can name the goods or services and each side\'s rights',
        next: 's1-payment',
        findings: [
          f('rights', true, "Each party's rights regarding the goods or services can be identified.", ['606-10-25-1'], '1'),
        ],
      },
      {
        id: 'no',
        label: 'No — the deliverable is still too vague',
        next: 's1-fail',
        findings: [
          f('rights', false, "The parties' rights cannot be identified. Criterion 606-10-25-1(b) fails.", ['606-10-25-1'], '1'),
          f('contractOk', false, 'Step 1 fails: rights are not identifiable.', ['606-10-25-1'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-payment',
    step: '1',
    title: 'Can you tell how you will get paid?',
    plain:
      'Payment terms have to be identifiable. They do not have to be a single fixed number — variable fees, milestones, and royalties still count if you know the formula or the event that sets the price. “We will figure out price later” does not.',
    citations: ['606-10-25-1'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — fixed, formula, or milestone terms are clear',
        next: 's1-substance',
        findings: [
          f('paymentTerms', true, 'Payment terms for the goods or services can be identified.', ['606-10-25-1'], '1'),
        ],
      },
      {
        id: 'no',
        label: 'No — price or payment is still open',
        next: 's1-fail',
        findings: [
          f('paymentTerms', false, 'Payment terms cannot be identified. Criterion 606-10-25-1(c) fails.', ['606-10-25-1'], '1'),
          f('contractOk', false, 'Step 1 fails: payment terms are not identifiable.', ['606-10-25-1'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-substance',
    step: '1',
    title: 'Does the deal change your cash-flow risk, timing, or amount?',
    plain:
      'Commercial substance means the contract is expected to change the risk, timing, or amount of your future cash flows. A circular swap that leaves you in the same place, or a deal done only for presentation, fails this test.',
    citations: ['606-10-25-1'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — cash flows actually change because of this deal',
        next: 's1-collect',
        findings: [
          f('substance', true, 'The contract has commercial substance: risk, timing, or amount of cash flows is expected to change.', ['606-10-25-1'], '1'),
        ],
      },
      {
        id: 'no',
        label: 'No — it is circular or economically empty',
        next: 's1-fail',
        findings: [
          f('substance', false, 'The contract lacks commercial substance. Criterion 606-10-25-1(d) fails.', ['606-10-25-1'], '1'),
          f('contractOk', false, 'Step 1 fails: no commercial substance.', ['606-10-25-1'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-collect',
    step: '1',
    title: 'Do you expect the customer to pay what they owe?',
    plain:
      'Ask whether the customer is likely to have both the ability and the intention to pay. If you already expect to lower the price, test whether they can pay that realistic lower amount — not the price printed on the contract.',
    citations: ['606-10-25-1', '606-10-55-3A'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — they can and intend to pay substantially all of what we will be entitled to',
        next: 's1-combine',
        findings: [
          f('collectible', true, 'Collectibility is probable for substantially all of the consideration to which the entity will be entitled.', ['606-10-25-1', '606-10-55-3A'], '1'),
          f('contractOk', true, 'All five Step 1 criteria are met. Account for this as a 606 contract.', ['606-10-25-1'], '1'),
        ],
      },
      {
        id: 'no',
        label: 'No — they probably cannot or will not pay enough',
        next: 's1-fail',
        findings: [
          f('collectible', false, 'Collectibility is not probable. Criterion 606-10-25-1(e) fails.', ['606-10-25-1', '606-10-55-3A'], '1'),
          f('contractOk', false, 'Step 1 fails: collectibility is not probable.', ['606-10-25-1'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-fail',
    step: '1',
    title: 'Have you already taken cash (or other consideration) from them?',
    plain:
      'If the five criteria are not met, keep watching the deal — they can be met later. Cash you already collected is a liability, not revenue, until one of the 25-7 events happens (you are done and the cash is nonrefundable, the contract is terminated and the cash is nonrefundable, or you have transferred control of what that cash relates to, stopped work, have no more obligation, and the cash is nonrefundable).',
    citations: ['606-10-25-6', '606-10-25-7', '606-10-25-8'],
    choices: [
      {
        id: 'cash',
        label: 'Yes — we already have their money or other consideration',
        next: 'outcome-deposit',
        findings: [
          f('cashHeld', true, 'Consideration received is a liability until a 606-10-25-7 event occurs or the Step 1 criteria are later met.', ['606-10-25-7', '606-10-25-8'], '1'),
        ],
      },
      {
        id: 'none',
        label: 'No — we have not been paid anything yet',
        next: 'outcome-no-contract',
      },
    ],
  },

  {
    id: 's1-combine',
    step: '1',
    title: 'Should this be combined with another deal with the same customer?',
    plain:
      'Two or more contracts signed at or near the same time with the same customer (or their related party) are one contract if they were negotiated as a package, if the price of one depends on the other, or if the promises across them are a single performance obligation. Combining stops people from hiding a discount in a side letter.',
    citations: ['606-10-25-9'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — package deal, linked pricing, or one performance obligation',
        next: 's1-mod',
        findings: [
          f('combine', true, 'Combine the related contracts and account for them as one.', ['606-10-25-9'], '1'),
        ],
      },
      {
        id: 'no',
        label: 'No — this contract stands on its own',
        next: 's1-mod',
        findings: [
          f('combine', false, 'No combination. Account for this contract on its own.', ['606-10-25-9'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-mod',
    step: '1',
    title: 'Has the contract been changed after it started?',
    plain:
      'A modification is an approved change in scope, price, or both — change order, variation, amendment. If the parties have not approved it yet, keep applying 606 to the old contract. An approved scope change with a price still being argued is still a modification: estimate the price change as variable consideration.',
    citations: ['606-10-25-10', '606-10-25-11'],
    choices: [
      {
        id: 'no',
        label: 'No change — this is the original deal',
        next: 's2-promises',
        findings: [
          f('modified', false, 'No contract modification at this point.', ['606-10-25-10'], '1'),
        ],
      },
      {
        id: 'yes',
        label: 'Yes — scope or price changed (or both)',
        next: 's1-mod-type',
        findings: [
          f('modified', true, 'A contract modification exists: an approved change in scope or price (or both).', ['606-10-25-10'], '1'),
        ],
      },
    ],
  },

  {
    id: 's1-mod-type',
    step: '1',
    title: 'How should the change be treated?',
    plain:
      'New distinct goods at their standalone selling price → treat as a brand-new contract sitting next to the old one. Remaining work is distinct but the price is not standalone → terminate the old contract and start a new one for leftover consideration plus the new price. Remaining work is not distinct (you are mid-build) → catch the change up into the existing obligation. A mix of those uses both treatments.',
    citations: ['606-10-25-12', '606-10-25-13'],
    choices: [
      {
        id: 'separate',
        label: 'Added distinct goods or services at (adjusted) standalone price',
        next: 's2-promises',
        findings: [
          f('modType', 'separate', 'Account for the modification as a separate contract. The original contract is untouched.', ['606-10-25-12'], '1'),
        ],
      },
      {
        id: 'new',
        label: 'Remaining work is distinct, but the price is not standalone',
        next: 's2-promises',
        findings: [
          f('modType', 'new', 'Treat as a termination of the old contract and creation of a new one for remaining distinct work. Leftover unearned consideration plus the new price is the new transaction price.', ['606-10-25-13'], '1'),
        ],
      },
      {
        id: 'catchup',
        label: 'Remaining work is not distinct — we are mid-performance',
        next: 's2-promises',
        findings: [
          f('modType', 'catchup', 'Treat the modification as part of the existing performance obligation and adjust revenue on a cumulative catch-up basis.', ['606-10-25-13'], '1'),
        ],
      },
      {
        id: 'mix',
        label: 'Some remaining work is distinct, some is not',
        next: 's2-promises',
        findings: [
          f('modType', 'mix', 'Apply both modification treatments: new-contract logic to the distinct leftover, catch-up logic to the part that is not distinct.', ['606-10-25-13'], '1'),
        ],
      },
    ],
  },

  {
    id: 's2-promises',
    step: '2',
    title: 'What exactly did you promise to deliver?',
    plain:
      'Make a list of every product, service, future discount, and support promise the customer reasonably expects — including promises created by your normal business practice or sales statements. Leave out internal admin work that gives the customer nothing.',
    citations: ['606-10-25-14', '606-10-25-16', '606-10-25-16A', '606-10-25-16B', '606-10-25-17', '606-10-25-18'],
    choices: [
      {
        id: 'continue',
        label: 'I have the list of promises — check the usual extras',
        next: 's2-setup',
        findings: [
          f('promises', true, 'Identify promised goods and services from the contract and from implied promises that create a reasonable customer expectation.', ['606-10-25-16', '606-10-25-18'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-setup',
    step: '2',
    title: 'Is the “onboarding” or setup something the customer actually receives?',
    plain:
      'Tasks you do to get ready — opening an account, loading a tenant, internal kickoff — are not performance obligations unless they transfer a good or service to the customer as you do them. Implementation that hands the customer a configured system they can use is a different story.',
    citations: ['606-10-25-17'],
    choices: [
      {
        id: 'none',
        label: 'No setup, or it is only our internal admin',
        next: 's2-shipping',
        findings: [
          f('setup', 'none', 'Setup or admin work that does not transfer a good or service to the customer is not a performance obligation.', ['606-10-25-17'], '2'),
        ],
      },
      {
        id: 'transfer',
        label: 'Yes — implementation or setup transfers something they can use',
        next: 's2-shipping',
        findings: [
          f('setup', 'transfer', 'Implementation or setup transfers a good or service to the customer, so it stays on the promise list and must be tested for distinctness.', ['606-10-25-17', '606-10-25-18'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-shipping',
    step: '2',
    title: 'Does shipping or handling happen after the customer already has control?',
    plain:
      'Shipping before the customer has control is just fulfillment — not a separate promise. Shipping after control has passed can be a promised service, but you may elect, consistently, to treat it as fulfillment and accrue the cost.',
    citations: ['606-10-25-18A', '606-10-25-18B'],
    choices: [
      {
        id: 'na',
        label: 'No physical good, or shipping is before they get control',
        next: 's2-warranty',
        findings: [
          f('shipping', 'fulfill', 'Shipping, if any, is a fulfillment activity rather than a promised service.', ['606-10-25-18A'], '2'),
        ],
      },
      {
        id: 'elect',
        label: 'Shipping is after control — we will use the fulfillment election',
        next: 's2-warranty',
        findings: [
          f('shipping', 'elect', 'Shipping after transfer of control is treated as fulfillment under the 25-18B policy election. Accrue the shipping cost if revenue for the good is recognized first.', ['606-10-25-18B'], '2'),
        ],
      },
      {
        id: 'service',
        label: 'Shipping is after control — treat it as its own promise',
        next: 's2-warranty',
        findings: [
          f('shipping', 'service', 'Post-control shipping is a promised service and must be tested as a performance obligation.', ['606-10-25-18B'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-warranty',
    step: '2',
    title: 'Is there a warranty — and is it just a promise the product works?',
    plain:
      'An assurance warranty (“it will meet spec”) is not a 606 performance obligation; it lives in Topic 460. A service warranty the customer can buy separately, or extra coverage beyond spec, is a promised service and gets a slice of the price.',
    citations: ['606-10-55-30', '606-10-55-32', '606-10-55-33'],
    choices: [
      {
        id: 'none',
        label: 'No warranty',
        next: 's2-option',
        findings: [f('warranty', 'none', 'No warranty promise in this contract.', ['606-10-55-30'], '2')],
      },
      {
        id: 'assurance',
        label: 'Assurance only — it will work as specified, not sold separately',
        next: 's2-option',
        findings: [
          f('warranty', 'assurance', 'Assurance-type warranty is accounted for under Topic 460, not as a 606 performance obligation.', ['606-10-55-33'], '2'),
        ],
      },
      {
        id: 'service',
        label: 'Service warranty — sold separately or more than assurance',
        next: 's2-option',
        findings: [
          f('warranty', 'service', 'The warranty is a distinct service (sold separately or more than assurance). Treat it as a performance obligation and allocate price to it.', ['606-10-55-32'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-option',
    step: '2',
    title: 'Did you give them an option that is actually a material right?',
    plain:
      'A renewal, extra units, or a future discount is a performance obligation only if it is a material right they would not get without this contract — usually a discount better than what that class of customer already gets. An option at standalone selling price is just a marketing offer: ignore it until they exercise it. Gift-card-like unused rights are this question in cheap clothing.',
    citations: ['606-10-55-41', '606-10-55-42', '606-10-55-43', '606-10-25-16B'],
    choices: [
      {
        id: 'none',
        label: 'No option, or the option is at the normal standalone price',
        next: 's2-principal',
        findings: [
          f('materialRight', false, 'No material right. An option at standalone selling price is a marketing offer, accounted for only if exercised.', ['606-10-55-43'], '2'),
        ],
      },
      {
        id: 'yes',
        label: 'Yes — incremental discount, free extra, or similar right',
        next: 's2-principal',
        findings: [
          f('materialRight', true, 'The option is a material right. The customer paid in advance for future goods or services. Recognize that slice when the future goods transfer or the option expires.', ['606-10-55-41', '606-10-55-42'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-principal',
    step: '2',
    title: 'Are you the principal, or are you arranging someone else’s sale?',
    plain:
      'If another party helps deliver, decide for each specified good or service whether you control it before the customer gets it. Control (you are the principal) usually shows up as: you are primarily responsible, you have inventory risk, and you set the price. A principal books gross; an agent books the fee.',
    citations: ['606-10-55-36', '606-10-55-36A', '606-10-55-37', '606-10-55-38', '606-10-55-39'],
    choices: [
      {
        id: 'principal',
        label: 'Principal — we control the good or service before the customer gets it',
        next: 's2-capable',
        findings: [
          f('role', 'principal', 'The entity is a principal: it controls the specified good or service before transfer. Revenue is the gross consideration.', ['606-10-55-37', '606-10-55-38'], '2'),
        ],
      },
      {
        id: 'agent',
        label: 'Agent — we only arrange for the other party to provide it',
        next: 's2-capable',
        findings: [
          f('role', 'agent', 'The entity is an agent: it arranges for another party to provide the specified good or service. Revenue is the fee or commission, not the customer’s gross spend.', ['606-10-55-36', '606-10-55-38'], '2'),
        ],
      },
      {
        id: 'alone',
        label: 'No other party is involved',
        next: 's2-capable',
        findings: [
          f('role', 'alone', 'No third party is involved in providing the specified goods or services.', ['606-10-55-36'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-capable',
    step: '2',
    title: 'Could the customer use this product or service on its own?',
    plain:
      'Say yes if the customer could use it, consume it, resell it, or combine it with something they already have. If you regularly sell it by itself, that is strong evidence. A component that is useless without the rest of one custom build is probably not separate.',
    citations: ['606-10-25-19', '606-10-25-20'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — they could use it alone or with something readily available',
        next: 's2-separable',
        findings: [
          f('capable', true, 'The good or service is capable of being distinct: the customer can benefit from it on its own or with readily available resources.', ['606-10-25-19', '606-10-25-20'], '2'),
        ],
      },
      {
        id: 'no',
        label: 'No — it is useless without the rest of this contract',
        next: 's2-series',
        findings: [
          f('capable', false, 'The good or service is not capable of being distinct. Combine it with other promises until the bundle is distinct.', ['606-10-25-19', '606-10-25-22'], '2'),
          f('distinct', false, 'Not distinct. Combine promises into one performance obligation (or keep combining until the bundle is distinct).', ['606-10-25-22'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-separable',
    step: '2',
    title: 'Did the customer buy this separately, or did they buy one combined result?',
    plain:
      'Treat it separately only when you are truly delivering it on its own. Combine it with the rest when your job is to integrate several pieces into one result, one piece heavily changes another, or the pieces depend on each other. For example, software plus ordinary support may be two promises; software plus heavy customization into one working system may be one.',
    citations: ['606-10-25-19', '606-10-25-21', '606-10-25-22'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — we are transferring this piece individually',
        next: 's2-series',
        findings: [
          f('separable', true, 'The promise is separately identifiable in the contract. Together with being capable of being distinct, it is a distinct performance obligation.', ['606-10-25-19', '606-10-25-21'], '2'),
          f('distinct', true, 'At least one promised good or service is distinct and is accounted for separately.', ['606-10-25-19'], '2'),
        ],
      },
      {
        id: 'no',
        label: 'No — we are really selling one combined output',
        next: 's2-series',
        findings: [
          f('separable', false, 'The promise is not separately identifiable (integration, significant customization, or highly interdependent). Combine it with the related promises.', ['606-10-25-21', '606-10-25-22'], '2'),
          f('distinct', false, 'Not distinct within the contract. Combine promises into one performance obligation.', ['606-10-25-22'], '2'),
        ],
      },
    ],
  },

  {
    id: 's2-series',
    step: '2',
    title: 'Is this a series of the same thing, transferred the same way?',
    plain:
      'A series of distinct goods or services that are substantially the same and have the same pattern of transfer is one performance obligation. Both tests: each unit would be over-time under 25-27, and you would measure progress the same way. Daily hotel rooms, monthly SaaS access, and many stand-ready services land here. The series election keeps you from allocating price to 365 tiny rooms.',
    citations: ['606-10-25-14', '606-10-25-15'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — repeating units, same over-time pattern',
        next: 's3-variable',
        findings: [
          f('series', true, 'Account for the repeating distinct goods or services as a single series performance obligation.', ['606-10-25-14', '606-10-25-15'], '2'),
        ],
      },
      {
        id: 'no',
        label: 'No — one-off, or the pattern is not the same',
        next: 's3-variable',
        findings: [
          f('series', false, 'Not a series. Keep each distinct promise as its own performance obligation (or the combined bundle as one).', ['606-10-25-14'], '2'),
        ],
      },
    ],
  },

  {
    id: 's3-variable',
    step: '3',
    title: 'Could the amount you get paid change?',
    plain:
      'Say yes for returns, refunds, rebates, discounts, bonuses, penalties, usage fees, or any payment that depends on a future event. A return right makes the price uncertain even when the price tag is fixed. Sales tax collected for the government is not your revenue.',
    citations: ['606-10-32-2', '606-10-32-2A', '606-10-32-3', '606-10-32-5', '606-10-32-6'],
    choices: [
      {
        id: 'no',
        label: 'No — a fixed amount (other than sales tax we collect)',
        next: 's3-finance',
        findings: [
          f('variable', false, 'Consideration is fixed. Transaction price starts as that fixed amount, excluding amounts collected for third parties.', ['606-10-32-2'], '3'),
        ],
      },
      {
        id: 'yes',
        label: 'Yes — returns, bonuses, rebates, royalties, or similar',
        next: 's3-method',
        findings: [
          f('variable', true, 'Part or all of the consideration is variable. Estimate it, then constrain the estimate.', ['606-10-32-5', '606-10-32-6'], '3'),
        ],
      },
    ],
  },

  {
    id: 's3-method',
    step: '3',
    title: 'Which estimate better predicts what you will be entitled to?',
    plain:
      'Use expected value (probability-weighted average) when you have a pile of similar contracts — returns, volume rebates. Use most likely amount when there are two outcomes, like a bonus you either get or do not. Pick one method for that uncertainty and stick with it. If you expect to refund some cash, book a refund liability for the amount you do not expect to keep.',
    citations: ['606-10-32-8', '606-10-32-10'],
    choices: [
      {
        id: 'expected',
        label: 'Expected value — many similar contracts or a range of amounts',
        next: 's3-constraint',
        findings: [
          f('varMethod', 'expected', 'Estimate variable consideration using expected value (probability-weighted amounts).', ['606-10-32-8'], '3'),
        ],
      },
      {
        id: 'likely',
        label: 'Most likely amount — basically yes or no',
        next: 's3-constraint',
        findings: [
          f('varMethod', 'likely', 'Estimate variable consideration using the most likely amount.', ['606-10-32-8'], '3'),
        ],
      },
    ],
  },

  {
    id: 's3-constraint',
    step: '3',
    title: 'Are you confident you will not have to reverse a large amount later?',
    plain:
      'Only count the uncertain amount you are likely to keep. Include less when the result depends on other people, weather, a long wait, limited history, frequent extra discounts, or many possible outcomes. Royalties based on sales or usage of licensed intellectual property have a special rule: usually wait until the sale or usage happens.',
    citations: ['606-10-32-11', '606-10-32-12', '606-10-32-13', '606-10-55-65'],
    choices: [
      {
        id: 'full',
        label: 'Yes — probable no significant reversal; include the estimate',
        next: 's3-finance',
        findings: [
          f('constrained', 'full', 'The variable-consideration estimate is included in the transaction price. A significant reversal is not probable.', ['606-10-32-11'], '3'),
        ],
      },
      {
        id: 'partial',
        label: 'Only part of it — constrain the rest',
        next: 's3-finance',
        findings: [
          f('constrained', 'partial', 'Include only the portion of variable consideration for which a significant reversal is not probable. Update the estimate each period.', ['606-10-32-11', '606-10-32-12', '606-10-32-14'], '3'),
        ],
      },
      {
        id: 'royalty',
        label: 'It is a sales- or usage-based IP royalty — wait for the sale or usage',
        next: 's3-finance',
        findings: [
          f('constrained', 'royalty', 'For a sales-based or usage-based royalty in exchange for a license of IP, recognize when (or as) the later of the subsequent sale or usage and satisfaction of the related performance obligation occurs.', ['606-10-32-13', '606-10-55-65'], '3'),
        ],
      },
    ],
  },

  {
    id: 's3-finance',
    step: '3',
    title: 'Is someone getting a significant financing out of the payment timing?',
    plain:
      'If paying early or late is really a loan, adjust the price to the cash selling price and show interest separately. Skip the adjustment if you expect payment within a year (practical expedient). Also skip if the customer prepaid and chooses when to take the good (gift card), if the amount is a sales-based royalty, or if the extra is really protection rather than finance.',
    citations: ['606-10-32-15', '606-10-32-16', '606-10-32-17', '606-10-32-18'],
    choices: [
      {
        id: 'no',
        label: 'No significant financing — or the one-year expedient applies',
        next: 's3-noncash',
        findings: [
          f('financing', false, 'No significant financing component, or the one-year practical expedient is used. Do not impute interest into the transaction price.', ['606-10-32-15', '606-10-32-18'], '3'),
        ],
      },
      {
        id: 'yes',
        label: 'Yes — adjust to the cash selling price and book interest separately',
        next: 's3-noncash',
        findings: [
          f('financing', true, 'The contract has a significant financing component. Adjust the promised consideration to the cash selling price and present interest separately from revenue.', ['606-10-32-15', '606-10-32-16'], '3'),
        ],
      },
    ],
  },

  {
    id: 's3-noncash',
    step: '3',
    title: 'Are they paying with something other than cash?',
    plain:
      'Shares, advertising, equipment, or labor they contribute: measure noncash consideration at estimated fair value at contract inception. If you cannot estimate that fair value, use the standalone selling price of what you are giving them. If they contribute materials you control, that is noncash consideration too.',
    citations: ['606-10-32-21', '606-10-32-22'],
    choices: [
      {
        id: 'no',
        label: 'No — they are paying cash (or a cash equivalent)',
        next: 's3-payable',
        findings: [f('noncash', false, 'Consideration is cash. No fair-value measurement of noncash consideration.', ['606-10-32-2'], '3')],
      },
      {
        id: 'yes',
        label: 'Yes — measure it at fair value (or at our SSP if FV is not estimable)',
        next: 's3-payable',
        findings: [
          f('noncash', true, 'Measure noncash consideration at estimated fair value at contract inception, or indirectly at the standalone selling price of the promised goods or services if fair value cannot be reasonably estimated.', ['606-10-32-21', '606-10-32-22'], '3'),
        ],
      },
    ],
  },

  {
    id: 's3-payable',
    step: '3',
    title: 'Will you pay the customer (slotting, rebate, coupon, equity)?',
    plain:
      'Cash, coupons, or equity you give the customer (or someone who buys from them) usually reduce the transaction price, unless you are buying a distinct good or service from them at fair value. Any excess over that fair value still knocks revenue down. Recognize the reduction at the later of when you recognize the related revenue and when you promise the payment.',
    citations: ['606-10-32-25', '606-10-32-26'],
    choices: [
      {
        id: 'no',
        label: 'No payments to the customer',
        next: 's4-ssp',
        findings: [f('payable', false, 'No consideration payable to the customer.', ['606-10-32-25'], '3')],
      },
      {
        id: 'reduce',
        label: 'Yes — treat it as a reduction of the price (or the excess over FV)',
        next: 's4-ssp',
        findings: [
          f('payable', 'reduce', 'Consideration payable to the customer reduces the transaction price, except to the extent it is a payment for a distinct good or service at fair value.', ['606-10-32-25', '606-10-32-26'], '3'),
        ],
      },
    ],
  },

  {
    id: 's4-ssp',
    step: '4',
    title: 'What would you normally charge for each promise on its own?',
    plain:
      'When a deal includes several separate promises, divide the total price using the normal separate price of each one. Use actual separate sales when you have them. Otherwise estimate from the market or from cost plus a reasonable profit. If there is only one promise, there is nothing to divide.',
    citations: ['606-10-32-28', '606-10-32-29', '606-10-32-31', '606-10-32-32', '606-10-32-33', '606-10-32-34', '606-10-32-35'],
    choices: [
      {
        id: 'single',
        label: 'Only one performance obligation — nothing to allocate',
        next: 's5-overtime-a',
        findings: [
          f('alloc', 'single', 'A single performance obligation takes the entire transaction price. No relative-SSP allocation.', ['606-10-32-28'], '4'),
        ],
      },
      {
        id: 'observable',
        label: 'We sell each piece separately — use those prices',
        next: 's4-discount',
        findings: [
          f('alloc', 'observable', 'Allocate on relative standalone selling prices using observable separate sales.', ['606-10-32-31', '606-10-32-32'], '4'),
        ],
      },
      {
        id: 'estimate',
        label: 'Estimate missing SSPs (market or cost-plus)',
        next: 's4-discount',
        findings: [
          f('alloc', 'estimate', 'Estimate unobservable standalone selling prices so the allocation still depicts the consideration for each promise.', ['606-10-32-33', '606-10-32-34'], '4'),
        ],
      },
      {
        id: 'residual',
        label: 'Residual — one piece is highly variable or never sold alone',
        next: 's4-discount',
        findings: [
          f('alloc', 'residual', 'Use a residual estimate only because the selling price is highly variable or the good or service has not been sold standalone.', ['606-10-32-34', '606-10-32-35'], '4'),
        ],
      },
    ],
  },

  {
    id: 's4-discount',
    step: '4',
    title: 'Does a bundle discount belong to only some of the promises?',
    plain:
      'If the sum of standalone prices is more than the deal price, there is a discount. Default: spread it across everything. You allocate a discount to only some obligations when you regularly sell the pieces separately, you regularly sell a particular bundle at that same discount, and that pattern is observable evidence of which promises the discount belongs to.',
    citations: ['606-10-32-36', '606-10-32-37'],
    choices: [
      {
        id: 'spread',
        label: 'Spread any discount across all performance obligations',
        next: 's4-var-alloc',
        findings: [
          f('discount', 'spread', 'Allocate the bundle discount proportionately to all performance obligations.', ['606-10-32-36'], '4'),
        ],
      },
      {
        id: 'specific',
        label: 'Observable evidence pins the discount on specific obligations',
        next: 's4-var-alloc',
        findings: [
          f('discount', 'specific', 'Allocate the discount entirely to the performance obligation(s) the observable bundle evidence points to.', ['606-10-32-37'], '4'),
        ],
      },
    ],
  },

  {
    id: 's4-var-alloc',
    step: '4',
    title: 'Does variable consideration belong entirely to one obligation?',
    plain:
      'A bonus for finishing one milestone, or a usage fee that tracks one service, can sit entirely on that obligation if the terms relate specifically to it and the result still matches the allocation objective. Otherwise the variable amount is allocated like the rest of the price. Then go satisfy the obligations.',
    citations: ['606-10-32-39', '606-10-32-40'],
    choices: [
      {
        id: 'spread',
        label: 'No — allocate variable amounts with the rest of the price',
        next: 's5-overtime-a',
        findings: [
          f('varAlloc', 'spread', 'Variable consideration is allocated with the remaining transaction price, not pinned to one obligation.', ['606-10-32-40'], '4'),
        ],
      },
      {
        id: 'specific',
        label: 'Yes — the variable terms are specifically about one promise',
        next: 's5-overtime-a',
        findings: [
          f('varAlloc', 'specific', 'Allocate the variable amount entirely to the related performance obligation (or distinct series unit), consistent with the allocation objective.', ['606-10-32-39'], '4'),
        ],
      },
    ],
  },

  {
    id: 's5-overtime-a',
    step: '5',
    title: 'Does the customer receive the benefit while you work?',
    plain:
      'This is common for services. Cleaning, ready-to-help support, and monthly software access usually qualify because the customer benefits every day. Another clue: a replacement provider would not need to redo most of the work already completed. A product waiting in your warehouse usually does not qualify.',
    citations: ['606-10-25-23', '606-10-25-24', '606-10-25-27'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — they get the benefit as we work',
        next: 's5-progress',
        findings: [
          f('overTime', 'a', 'Performance obligation is satisfied over time: the customer simultaneously receives and consumes the benefit as the entity performs.', ['606-10-25-27'], '5'),
          f('timing', 'over-time', 'Recognize revenue over time as progress is made.', ['606-10-25-27', '606-10-25-31'], '5'),
        ],
      },
      {
        id: 'no',
        label: 'No — not a consume-as-you-go service',
        next: 's5-overtime-b',
      },
    ],
  },

  {
    id: 's5-overtime-b',
    step: '5',
    title: 'Are you creating or improving an asset the customer already controls?',
    plain:
      'Think work on the customer’s land, or an enhancement to something they already own. If they control the work-in-process as you build, you recognize over time. A standard item you could sell to someone else off your own floor usually fails this test.',
    citations: ['606-10-25-27'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — they control the WIP as we create or enhance it',
        next: 's5-progress',
        findings: [
          f('overTime', 'b', "Performance obligation is satisfied over time: the entity's performance creates or enhances an asset the customer controls as it is created or enhanced.", ['606-10-25-27'], '5'),
          f('timing', 'over-time', 'Recognize revenue over time as progress is made.', ['606-10-25-27', '606-10-25-31'], '5'),
        ],
      },
      {
        id: 'no',
        label: 'No — they do not control the asset yet',
        next: 's5-overtime-c-alt',
      },
    ],
  },

  {
    id: 's5-overtime-c-alt',
    step: '5',
    title: 'Could you readily use this asset for someone else?',
    plain:
      'No alternative use means you are contractually blocked from sending the asset to another customer, or practically limited from doing so once it is finished (custom specs that would need expensive rework). Assess this at inception. A vanilla unit from inventory has alternative use.',
    citations: ['606-10-25-27', '606-10-25-28'],
    choices: [
      {
        id: 'no',
        label: 'No alternative use — it is theirs, contractually or practically',
        next: 's5-overtime-c-pay',
        findings: [
          f('altUse', false, 'The asset has no alternative use to the entity (contractual restriction or practical limitation).', ['606-10-25-28'], '5'),
        ],
      },
      {
        id: 'yes',
        label: 'Yes — we could redirect it to another customer',
        next: 's5-point',
        findings: [
          f('altUse', true, 'The asset has an alternative use, so 25-27(c) cannot be met. If (a) and (b) also failed, this is a point-in-time obligation.', ['606-10-25-27', '606-10-25-28'], '5'),
        ],
      },
    ],
  },

  {
    id: 's5-overtime-c-pay',
    step: '5',
    title: 'If they cancel for convenience, do you have an enforceable right to be paid for work to date?',
    plain:
      'You need a right, throughout the contract, to an amount that at least pays you for performance completed to date if the customer (or another party) cancels for reasons other than your breach. It does not have to be a fixed invoice — but it cannot be only a recovery of scrap. Both no-alternative-use and this payment right are required for 25-27(c).',
    citations: ['606-10-25-27', '606-10-25-29'],
    choices: [
      {
        id: 'yes',
        label: 'Yes — we are entitled to payment for performance to date',
        next: 's5-progress',
        findings: [
          f('payToDate', true, 'Enforceable right to payment for performance completed to date exists. Together with no alternative use, the obligation is satisfied over time under 25-27(c).', ['606-10-25-27', '606-10-25-29'], '5'),
          f('overTime', 'c', 'Performance obligation is satisfied over time: no alternative use and an enforceable right to payment for performance to date.', ['606-10-25-27'], '5'),
          f('timing', 'over-time', 'Recognize revenue over time as progress is made.', ['606-10-25-27', '606-10-25-31'], '5'),
        ],
      },
      {
        id: 'no',
        label: 'No — we only get paid if they take the finished thing',
        next: 's5-point',
        findings: [
          f('payToDate', false, 'No enforceable right to payment for performance to date, so 25-27(c) fails. Recognize at a point in time when control transfers.', ['606-10-25-27', '606-10-25-29', '606-10-25-30'], '5'),
        ],
      },
    ],
  },

  {
    id: 's5-progress',
    step: '5',
    title: 'What is the clearest way to show how much work is finished?',
    plain:
      'Use completed results, units delivered, or time passed when those show progress clearly. Otherwise use resources such as labor hours or cost. Use the same method consistently. Do not count waste as progress. If you cannot measure progress reliably yet, record revenue only up to recoverable costs until you can.',
    citations: ['606-10-25-31', '606-10-25-32', '606-10-25-33', '606-10-25-36', '606-10-25-37'],
    choices: [
      {
        id: 'output',
        label: 'Output method — and we can measure it',
        next: 's5-license',
        findings: [
          f('progress', 'output', 'Measure over-time progress with an output method that depicts transfer of control. Remeasure each reporting period.', ['606-10-25-31', '606-10-25-33'], '5'),
        ],
      },
      {
        id: 'input',
        label: 'Input method — and we can measure it',
        next: 's5-license',
        findings: [
          f('progress', 'input', 'Measure over-time progress with an input method that depicts transfer of control. Remeasure each reporting period.', ['606-10-25-31', '606-10-25-33'], '5'),
        ],
      },
      {
        id: 'cost',
        label: 'Cannot measure outcome yet — recognize only recoverable costs',
        next: 's5-license',
        findings: [
          f('progress', 'cost-recovery', 'Cannot reasonably measure progress, but costs are expected to be recovered. Recognize revenue only to the extent of costs incurred until a measure of progress exists.', ['606-10-25-36', '606-10-25-37'], '5'),
        ],
      },
    ],
  },

  {
    id: 's5-point',
    step: '5',
    title: 'What event shows the customer now has the product?',
    plain:
      'If the customer did not receive the benefit over time, record revenue when they gain the ability to use and benefit from the product. Look at whether payment is due, title and possession moved, major risks moved, and the customer accepted it. No single clue always decides the answer.',
    citations: ['606-10-25-23', '606-10-25-25', '606-10-25-30'],
    choices: [
      {
        id: 'continue',
        label: 'Control transfers at a point in time — then check licenses',
        next: 's5-license',
        findings: [
          f('timing', 'point', 'The performance obligation is satisfied at a point in time, when the customer obtains control (payment right, title, possession, risks and rewards, acceptance).', ['606-10-25-24', '606-10-25-30'], '5'),
        ],
      },
    ],
  },

  {
    id: 's5-license',
    step: '5',
    title: 'For a license, does the customer get today’s IP or ongoing access as it changes?',
    plain:
      '“Use” means the customer receives the intellectual property as it exists today, often at one point in time. “Access” means your ongoing work significantly changes or supports the IP and the customer is exposed to those changes, so revenue is usually earned over time. Brands often mean access; finished software often means use. Sales-based royalties normally wait until the related sales happen.',
    citations: ['606-10-55-54', '606-10-55-57', '606-10-55-58', '606-10-55-58A', '606-10-55-58C', '606-10-55-62', '606-10-55-65'],
    choices: [
      {
        id: 'none',
        label: 'Not a license of intellectual property',
        next: 'outcome-recognize',
        findings: [f('license', 'none', 'No license of intellectual property in this contract.', ['606-10-55-54'], '5')],
      },
      {
        id: 'use',
        label: 'Right to use — IP as it exists when granted (point in time)',
        next: 'outcome-recognize',
        findings: [
          f('license', 'use', "The license is a right to use the IP as it exists at grant. That promise is satisfied at a point in time (when the customer can use and benefit from the license).", ['606-10-55-62'], '5'),
        ],
      },
      {
        id: 'access',
        label: 'Right to access — our ongoing activities significantly affect the IP',
        next: 'outcome-recognize',
        findings: [
          f('license', 'access', 'The license is a right to access IP as it changes. Recognize that promise over time.', ['606-10-55-58A', '606-10-55-58C'], '5'),
          f('timing', 'over-time', 'The license-of-IP promise is satisfied over time (right to access).', ['606-10-55-58C'], '5'),
        ],
      },
    ],
  },

  {
    id: 'outcome-not-customer',
    kind: 'outcome',
    step: 'done',
    outcome: 'out',
    title: 'Stop — this is not a 606 customer contract.',
    plain:
      'Topic 606 applies only when the counterparty is a customer. Look at the Topic that actually owns the relationship: contributions (958-605), collaborative arrangements (808), or whatever governs the share of risk. Do not force a five-step model onto a deal that is not a sale to a customer.',
    citations: ['606-10-15-3', '606-10-15-2A'],
  },

  {
    id: 'outcome-other-topic',
    kind: 'outcome',
    step: 'done',
    outcome: 'out',
    title: 'Stop — another Topic owns this contract.',
    plain:
      '606 explicitly hands leases, insurance, most financial instruments, non-warranty guarantees, and same-line inventory swaps to other Topics. If only part of the deal is carved out, go back and keep walking on the leftover customer-sale piece.',
    citations: ['606-10-15-2', '606-10-15-4'],
  },

  {
    id: 'outcome-no-contract',
    kind: 'outcome',
    step: 'done',
    outcome: 'wait',
    title: 'There is no 606 contract yet. Do not recognize revenue.',
    plain:
      'Keep assessing. If the five criteria later become true, start the five steps from that date. Until then there is nothing to allocate and nothing to recognize.',
    citations: ['606-10-25-1', '606-10-25-6'],
  },

  {
    id: 'outcome-deposit',
    kind: 'outcome',
    step: 'done',
    outcome: 'wait',
    title: 'Hold the cash as a liability. It is not revenue yet.',
    plain:
      'Book what you received as a liability (obligation to perform or to refund), measured at the amount received. Turn it into revenue only when a 25-7 event happens or the Step 1 criteria are subsequently met. This is the collectibility-fail / incomplete-contract pattern people still call the “deposit method.”',
    citations: ['606-10-25-7', '606-10-25-8'],
  },

  {
    id: 'outcome-recognize',
    kind: 'outcome',
    step: 'done',
    outcome: 'recognize',
    title: 'Recognize the allocated price when (or as) control transfers.',
    plain:
      'Revenue for each performance obligation is the slice of transaction price allocated to it — after variable-consideration constraints. Over-time obligations recognize as you measure progress. Point-in-time obligations recognize when the customer obtains control. Present a contract liability if they paid (or payment is due) before you perform; a contract asset if you performed and payment is still conditional on something other than time; a receivable if only time has to pass. Incremental costs to obtain the contract may be an asset under 340-40. Disclose enough for a reader to see nature, amount, timing, and uncertainty.',
    citations: ['606-10-32-1', '606-10-25-23', '606-10-45-1', '606-10-45-2', '606-10-45-3', '606-10-45-4', '606-10-50-1', '606-10-15-5'],
  },
];
