/**
 * Extended XBRL metric packs for the Fortune 500 / Financial Modeler snapshots.
 *
 * Core 19 tags stay in catalog.js METRICS so the ratios page and modeler
 * engines do not change coverage or defaults. This module is the catalog for
 * everything else pulled from Company Facts (balance sheet detail, income
 * detail, leases, financing, bank tags) plus student-facing copy for the
 * Financial Modeler information page.
 *
 * Browser-safe ESM. Academic register — definitions a student would use.
 */

function usdInstant(key, label, student, tags, candidates, whyMissing) {
  return {
    key,
    pack: this.pack,
    label,
    student,
    whyMissing,
    tags,
    unit: 'USD',
    kind: 'instant',
    better: null,
    candidates,
  };
}

function usdDuration(key, label, student, tags, candidates, whyMissing) {
  return {
    key,
    pack: this.pack,
    label,
    student,
    whyMissing,
    tags,
    unit: 'USD',
    kind: 'duration',
    better: null,
    candidates,
  };
}

const BS = { pack: 'balance_sheet' };
const ID = { pack: 'income_detail' };
const LS = { pack: 'leases' };
const FN = { pack: 'financing' };
const BK = { pack: 'bank' };

export const BALANCE_SHEET_METRICS = [
  usdInstant.call(
    BS,
    'ppe_net',
    'Net property, plant, and equipment',
    'The carrying amount of long-lived tangible assets used in operations — land, buildings, machinery, equipment — after accumulated depreciation. This is the stock of physical capital on the balance sheet, not the cash spent this year (that is capital expenditure).',
    'PropertyPlantAndEquipmentNet',
    [
      { taxonomy: 'us-gaap', tag: 'PropertyPlantAndEquipmentNet' },
      { taxonomy: 'ifrs-full', tag: 'PropertyPlantAndEquipment' },
    ],
    'Many service and financial firms have little PP&E, or they fold it into a broader “other assets” tag we do not read as PP&E.'
  ),
  usdInstant.call(
    BS,
    'accumulated_depreciation',
    'Accumulated depreciation',
    'The cumulative depreciation charged against gross PP&E since those assets were placed in service. Gross PP&E minus this contra-asset equals net PP&E. It is a stock (balance-sheet) amount, not this year’s depreciation expense.',
    'AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment',
    [
      { taxonomy: 'us-gaap', tag: 'AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment' },
      { taxonomy: 'ifrs-full', tag: 'AccumulatedDepreciationAmortisationAndImpairmentPropertyPlantAndEquipment' },
    ],
    'Often omitted when the filer reports only net PP&E.'
  ),
  usdInstant.call(
    BS,
    'goodwill',
    'Goodwill',
    'The excess of purchase price over the fair value of identifiable net assets acquired in a business combination. It is an intangible asset that is tested for impairment rather than amortized under U.S. GAAP. Growth in goodwill usually indicates acquisitions, not organic investment.',
    'Goodwill',
    [
      { taxonomy: 'us-gaap', tag: 'Goodwill' },
      { taxonomy: 'ifrs-full', tag: 'Goodwill' },
    ],
    'Absent when the company has not recorded acquisition goodwill, or uses a combined intangibles tag.'
  ),
  usdInstant.call(
    BS,
    'intangibles_net',
    'Intangible assets, net (excluding goodwill)',
    'Identifiable intangible assets such as patents, trademarks, customer relationships, and capitalized software, net of accumulated amortization. Distinct from goodwill, which is residual from acquisitions.',
    'IntangibleAssetsNetExcludingGoodwill',
    [
      { taxonomy: 'us-gaap', tag: 'IntangibleAssetsNetExcludingGoodwill' },
      { taxonomy: 'us-gaap', tag: 'IntangibleAssetsNetIncludingGoodwill' },
      { taxonomy: 'ifrs-full', tag: 'IntangibleAssetsOtherThanGoodwill' },
    ],
    'Some filers combine goodwill and other intangibles; we prefer the excluding-goodwill tag when both exist.'
  ),
  usdInstant.call(
    BS,
    'accounts_payable',
    'Accounts payable',
    'Amounts owed to suppliers for goods and services already received. An increase in payables is a source of cash (the firm is paying later); a decrease is a use of cash. Used with cost of sales to estimate days payable outstanding.',
    'AccountsPayableCurrent',
    [
      { taxonomy: 'us-gaap', tag: 'AccountsPayableCurrent' },
      { taxonomy: 'ifrs-full', tag: 'TradeAndOtherCurrentPayables' },
    ],
    'Retailers sometimes combine payables with accrued expenses; banks typically do not use a trade-payables tag.'
  ),
  usdInstant.call(
    BS,
    'accrued_liabilities',
    'Accrued liabilities',
    'Operating obligations incurred but not yet invoiced or paid — wages, taxes, utilities, and similar accruals. Like payables, they are a working-capital liability; unlike payables, they are not typically trade invoices.',
    'AccruedLiabilitiesCurrent',
    [
      { taxonomy: 'us-gaap', tag: 'AccruedLiabilitiesCurrent' },
      { taxonomy: 'us-gaap', tag: 'EmployeeRelatedLiabilitiesCurrent' },
      { taxonomy: 'ifrs-full', tag: 'OtherCurrentLiabilities' },
    ],
    'Coverage is uneven; many issuers roll accruals into “other current liabilities.”'
  ),
  usdInstant.call(
    BS,
    'deferred_revenue_current',
    'Deferred revenue (current)',
    'Cash (or a receivable) collected before the related performance obligation is satisfied, due to be recognized as revenue within one year. Common in software subscriptions, gift cards, and prepaid services. An increase funds operations and reduces reported working-capital investment.',
    'ContractWithCustomerLiabilityCurrent',
    [
      { taxonomy: 'us-gaap', tag: 'ContractWithCustomerLiabilityCurrent' },
      { taxonomy: 'us-gaap', tag: 'DeferredRevenueCurrent' },
      { taxonomy: 'ifrs-full', tag: 'CurrentContractLiabilities' },
    ],
    'Not tagged by firms without material contract liabilities, or when current and noncurrent are combined.'
  ),
  usdInstant.call(
    BS,
    'deferred_revenue_noncurrent',
    'Deferred revenue (noncurrent)',
    'The portion of contract liabilities expected to be recognized as revenue after one year — multi-year licenses, long-term service contracts, and similar arrangements.',
    'ContractWithCustomerLiabilityNoncurrent',
    [
      { taxonomy: 'us-gaap', tag: 'ContractWithCustomerLiabilityNoncurrent' },
      { taxonomy: 'us-gaap', tag: 'DeferredRevenueNoncurrent' },
      { taxonomy: 'ifrs-full', tag: 'NoncurrentContractLiabilities' },
    ],
    'Often zero or untagged when all deferred revenue is current.'
  ),
  usdInstant.call(
    BS,
    'prepaid_expenses',
    'Prepaid expenses',
    'Payments made in advance for future operating costs (rent, insurance, software). These are current assets: cash has left, but the expense has not yet been recognized. An increase is a use of cash.',
    'PrepaidExpenseCurrent',
    [
      { taxonomy: 'us-gaap', tag: 'PrepaidExpenseCurrent' },
      { taxonomy: 'us-gaap', tag: 'PrepaidExpenseAndOtherAssetsCurrent' },
      { taxonomy: 'ifrs-full', tag: 'PrepaymentsCurrent' },
    ],
    'Frequently combined with other current assets and therefore missing as a standalone tag.'
  ),
  usdInstant.call(
    BS,
    'debt_current',
    'Current portion of debt',
    'Borrowings due within one year, including the current portion of long-term debt, short-term notes, and commercial paper. Together with noncurrent debt this is the usual input to net debt (debt minus cash).',
    'LongTermDebtCurrent, DebtCurrent, ShortTermBorrowings',
    [
      { taxonomy: 'us-gaap', tag: 'LongTermDebtCurrent' },
      { taxonomy: 'us-gaap', tag: 'DebtCurrent' },
      { taxonomy: 'us-gaap', tag: 'ShortTermBorrowings' },
      { taxonomy: 'us-gaap', tag: 'CommercialPaper' },
      { taxonomy: 'ifrs-full', tag: 'CurrentBorrowings' },
    ],
    'Issuers use several debt tags; blank means we did not find a current-debt roll-up, not that maturities are zero.'
  ),
  usdInstant.call(
    BS,
    'debt_noncurrent',
    'Long-term debt, noncurrent',
    'Interest-bearing debt due after one year. Preferred over the legacy LongTermDebt tag when both exist, because LongTermDebt is sometimes the current-plus-noncurrent total and sometimes only the long-term piece.',
    'LongTermDebtNoncurrent, LongTermDebt, LongTermDebtAndCapitalLeaseObligations',
    [
      { taxonomy: 'us-gaap', tag: 'LongTermDebtNoncurrent' },
      { taxonomy: 'us-gaap', tag: 'LongTermDebt' },
      { taxonomy: 'us-gaap', tag: 'LongTermDebtAndCapitalLeaseObligations' },
      { taxonomy: 'ifrs-full', tag: 'NoncurrentBorrowings' },
    ],
    'About half of filers skip a clean long-term-debt tag; blank is not evidence of an unlevered balance sheet.'
  ),
  usdDuration.call(
    BS,
    'da_expense',
    'Depreciation and amortization expense',
    'The period’s allocation of the cost of PP&E and finite-lived intangibles. A non-cash expense on the income statement; added back in operating cash flow. Distinct from capital expenditure, which is the cash spent to acquire new assets.',
    'DepreciationDepletionAndAmortization',
    [
      { taxonomy: 'us-gaap', tag: 'DepreciationDepletionAndAmortization' },
      { taxonomy: 'us-gaap', tag: 'Depreciation' },
      { taxonomy: 'us-gaap', tag: 'DepreciationAndAmortization' },
      { taxonomy: 'ifrs-full', tag: 'DepreciationAmortisationAndImpairmentExpense' },
    ],
    'Some filers report D&A only in the cash-flow statement footnotes under a tag we do not read.'
  ),
];

export const INCOME_DETAIL_METRICS = [
  usdDuration.call(
    ID,
    'cogs',
    'Cost of goods and services sold',
    'Direct costs of producing or delivering the goods and services that generated revenue — merchandise, manufacturing, and (for many services) associated delivery costs. Revenue minus this amount is gross profit. Banks generally do not report COGS.',
    'CostOfGoodsAndServicesSold, CostOfRevenue',
    [
      { taxonomy: 'us-gaap', tag: 'CostOfGoodsAndServicesSold' },
      { taxonomy: 'us-gaap', tag: 'CostOfRevenue' },
      { taxonomy: 'us-gaap', tag: 'CostOfGoodsSold' },
      { taxonomy: 'us-gaap', tag: 'CostOfGoodsSoldAndServicesSold' },
      { taxonomy: 'ifrs-full', tag: 'CostOfSales' },
    ],
    'Financial companies and some service firms skip this line; a missing tag is not a zero cost of sales.'
  ),
  usdDuration.call(
    ID,
    'sga',
    'Selling, general, and administrative expense',
    'Operating expenses not included in cost of sales: selling, marketing, and corporate overhead. Together with R&D (when tagged) and D&A, SG&A is the usual bridge from gross profit to operating income.',
    'SellingGeneralAndAdministrativeExpense',
    [
      { taxonomy: 'us-gaap', tag: 'SellingGeneralAndAdministrativeExpense' },
      { taxonomy: 'us-gaap', tag: 'GeneralAndAdministrativeExpense' },
      { taxonomy: 'us-gaap', tag: 'SellingAndMarketingExpense' },
      { taxonomy: 'ifrs-full', tag: 'AdministrativeExpense' },
      { taxonomy: 'ifrs-full', tag: 'SellingExpense' },
    ],
    'Issuers often split SG&A into several tags; we take the first consolidated candidate that exists for the year.'
  ),
  usdDuration.call(
    ID,
    'interest_expense',
    'Interest expense',
    'The period cost of borrowed money. Under U.S. GAAP this is typically the contractual interest on debt (and, after ASC 842, the interest accretion on finance leases). Divide by average interest-bearing debt to estimate an implied rate.',
    'InterestExpense, InterestExpenseDebt',
    [
      { taxonomy: 'us-gaap', tag: 'InterestExpense' },
      { taxonomy: 'us-gaap', tag: 'InterestExpenseDebt' },
      { taxonomy: 'us-gaap', tag: 'InterestExpenseNonoperating' },
      { taxonomy: 'us-gaap', tag: 'InterestExpenseDeposits' },
      { taxonomy: 'us-gaap', tag: 'InterestExpenseBorrowings' },
      { taxonomy: 'ifrs-full', tag: 'FinanceCosts' },
    ],
    'Some filers report only net interest (income minus expense). Banks often use deposit-interest tags instead of a single industrial InterestExpense line.'
  ),
  usdDuration.call(
    ID,
    'interest_income',
    'Interest income',
    'Interest earned on cash, marketable securities, and (for banks) the loan book. For non-financial firms this is usually small relative to operating profit; for banks it is a primary revenue line.',
    'InterestIncomeOperating, InterestAndDividendIncomeOperating',
    [
      { taxonomy: 'us-gaap', tag: 'InterestIncomeOperating' },
      { taxonomy: 'us-gaap', tag: 'InterestAndDividendIncomeOperating' },
      { taxonomy: 'us-gaap', tag: 'InvestmentIncomeInterest' },
      { taxonomy: 'us-gaap', tag: 'InterestIncomeDepositsWithFinancialInstitutions' },
      { taxonomy: 'us-gaap', tag: 'InterestIncomeExpenseNet' },
      { taxonomy: 'ifrs-full', tag: 'FinanceIncome' },
    ],
    'Industrial filers often omit it when immaterial; InterestIncomeExpenseNet is a net figure and is used only if a gross interest-income tag is absent.'
  ),
  usdDuration.call(
    ID,
    'income_tax_expense',
    'Income tax expense',
    'Current plus deferred income tax recognized in the income statement. Divide by pretax income to obtain the effective tax rate. A negative amount is a tax benefit.',
    'IncomeTaxExpenseBenefit',
    [
      { taxonomy: 'us-gaap', tag: 'IncomeTaxExpenseBenefit' },
      { taxonomy: 'ifrs-full', tag: 'IncomeTaxExpenseContinuingOperations' },
    ],
    'Rarely missing on a 10-K; if blank, the period did not match the latest revenue year or the filer used a tag we do not list.'
  ),
  usdDuration.call(
    ID,
    'pretax_income',
    'Income before tax',
    'Profit after interest and other non-operating items, before income tax. The denominator of the effective tax rate. Not the same as operating income, which is before interest.',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxes…',
    [
      {
        taxonomy: 'us-gaap',
        tag: 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      },
      {
        taxonomy: 'us-gaap',
        tag: 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
      },
      { taxonomy: 'ifrs-full', tag: 'ProfitLossBeforeTax' },
    ],
    'Some issuers skip a pretax roll-up and go from operating income to net income.'
  ),
];

export const LEASE_METRICS = [
  usdInstant.call(
    LS,
    'operating_lease_liability',
    'Operating lease liability',
    'The present value of remaining operating-lease payments recognized under ASC 842 / IFRS 16. It is a liability, not a rent expense. If the filer tags only current and noncurrent pieces, those two amounts are added.',
    'OperatingLeaseLiability',
    [{ taxonomy: 'us-gaap', tag: 'OperatingLeaseLiability' }],
    'Pre-ASC 842 filings and some foreign issuers have no capitalized operating-lease liability.'
  ),
  usdInstant.call(
    LS,
    'operating_lease_liability_current',
    'Operating lease liability, current',
    'The portion of the operating-lease liability due within one year. Used with the noncurrent piece when a consolidated OperatingLeaseLiability tag is absent.',
    'OperatingLeaseLiabilityCurrent',
    [{ taxonomy: 'us-gaap', tag: 'OperatingLeaseLiabilityCurrent' }],
    'Often omitted when only the total liability is tagged.'
  ),
  usdInstant.call(
    LS,
    'operating_lease_liability_noncurrent',
    'Operating lease liability, noncurrent',
    'The portion of the operating-lease liability due after one year.',
    'OperatingLeaseLiabilityNoncurrent',
    [{ taxonomy: 'us-gaap', tag: 'OperatingLeaseLiabilityNoncurrent' }],
    'Often omitted when only the total liability is tagged.'
  ),
  usdInstant.call(
    LS,
    'finance_lease_liability',
    'Finance lease liability',
    'The present value of remaining finance-lease (formerly capital-lease) payments. Treated like debt for leverage analysis. Distinct from operating-lease liabilities, which are often added back only in lease-adjusted enterprise value.',
    'FinanceLeaseLiability, CapitalLeaseObligations',
    [
      { taxonomy: 'us-gaap', tag: 'FinanceLeaseLiability' },
      { taxonomy: 'us-gaap', tag: 'CapitalLeaseObligations' },
      { taxonomy: 'us-gaap', tag: 'FinanceLeaseLiabilityNoncurrent' },
    ],
    'Many lessees have operating leases only.'
  ),
  usdInstant.call(
    LS,
    'operating_lease_rou',
    'Operating-lease right-of-use asset',
    'The corresponding asset for capitalized operating leases: the right to use the leased item over the lease term, typically amortized on a straight-line basis. Should be analyzed with the operating-lease liability, not as owned PP&E.',
    'OperatingLeaseRightOfUseAsset',
    [{ taxonomy: 'us-gaap', tag: 'OperatingLeaseRightOfUseAsset' }],
    'Missing in filings that predate ASC 842 or that do not tag the ROU asset separately.'
  ),
  usdInstant.call(
    LS,
    'finance_lease_rou',
    'Finance-lease right-of-use asset',
    'The right-of-use asset associated with finance leases, generally amortized like owned PP&E and paired with the finance-lease liability.',
    'FinanceLeaseRightOfUseAsset',
    [{ taxonomy: 'us-gaap', tag: 'FinanceLeaseRightOfUseAsset' }],
    'Absent when the firm has no finance leases, or folds them into PP&E.'
  ),
  usdDuration.call(
    LS,
    'operating_lease_cost',
    'Operating lease cost',
    'The period cost of operating leases recognized in earnings (typically straight-line). Under ASC 842 this is not identical to cash rent paid, nor to the interest-plus-amortization split used for finance leases.',
    'OperatingLeaseCost, OperatingLeaseExpense',
    [
      { taxonomy: 'us-gaap', tag: 'OperatingLeaseCost' },
      { taxonomy: 'us-gaap', tag: 'OperatingLeaseExpense' },
    ],
    'Not always tagged; cash lease payments may exist without a P&L cost tag.'
  ),
  usdDuration.call(
    LS,
    'operating_lease_cash_paid',
    'Cash paid for operating leases',
    'Cash outflows for operating-lease payments during the period. The cash-flow counterpart to operating-lease cost. Used when building a lease corkscrew or adjusting free cash flow.',
    'OperatingLeasePayments',
    [{ taxonomy: 'us-gaap', tag: 'OperatingLeasePayments' }],
    'Not always tagged; the P&L operating-lease cost tag may exist without a cash-paid tag.'
  ),
];

export const FINANCING_METRICS = [
  usdDuration.call(
    FN,
    'dividends_paid',
    'Dividends paid',
    'Cash distributed to shareholders during the period. Dividends paid divided by net income is the cash payout ratio. Distinct from dividends declared, which may not yet have been paid.',
    'PaymentsOfDividends',
    [
      { taxonomy: 'us-gaap', tag: 'PaymentsOfDividends' },
      { taxonomy: 'us-gaap', tag: 'PaymentsOfDividendsCommonStock' },
      { taxonomy: 'us-gaap', tag: 'PaymentsOfOrdinaryDividends' },
      { taxonomy: 'ifrs-full', tag: 'DividendsPaid' },
    ],
    'Growth firms often pay no dividend and therefore do not tag this line.'
  ),
  usdDuration.call(
    FN,
    'share_repurchases',
    'Repurchases of common stock',
    'Cash used to buy back the company’s own shares. A financing outflow. Combined with dividends, it is total cash returned to owners. Share count may still rise if stock-based compensation issues more shares than were retired.',
    'PaymentsForRepurchaseOfCommonStock',
    [
      { taxonomy: 'us-gaap', tag: 'PaymentsForRepurchaseOfCommonStock' },
      { taxonomy: 'us-gaap', tag: 'PaymentsForRepurchaseOfEquity' },
      { taxonomy: 'ifrs-full', tag: 'PurchaseOfOwnShares' },
    ],
    'Untagged when the issuer did not repurchase stock, or when buybacks sit in a broader financing line.'
  ),
  usdDuration.call(
    FN,
    'debt_proceeds',
    'Proceeds from issuance of debt',
    'Cash inflows from new borrowings during the period (bonds, term loans, notes). A financing source. Compare with repayments to see whether the firm was a net issuer or net repayer of debt.',
    'ProceedsFromIssuanceOfLongTermDebt',
    [
      { taxonomy: 'us-gaap', tag: 'ProceedsFromIssuanceOfLongTermDebt' },
      { taxonomy: 'us-gaap', tag: 'ProceedsFromIssuanceOfDebt' },
      { taxonomy: 'us-gaap', tag: 'ProceedsFromNotesPayable' },
      { taxonomy: 'us-gaap', tag: 'ProceedsFromIssuanceOfSeniorLongTermDebt' },
    ],
    'Revolvers and commercial paper are sometimes tagged separately and will not appear here.'
  ),
  usdDuration.call(
    FN,
    'debt_repayments',
    'Repayments of debt',
    'Cash used to repay principal on borrowings. A financing use. Scheduled amortization plus optional prepayments, depending on how the issuer tags the line.',
    'RepaymentsOfLongTermDebt',
    [
      { taxonomy: 'us-gaap', tag: 'RepaymentsOfLongTermDebt' },
      { taxonomy: 'us-gaap', tag: 'RepaymentsOfDebt' },
      { taxonomy: 'us-gaap', tag: 'RepaymentsOfNotesPayable' },
      { taxonomy: 'us-gaap', tag: 'RepaymentsOfSeniorDebt' },
    ],
    'Interest paid is a separate cash-flow item and is not included here.'
  ),
  {
    key: 'shares_diluted_wavg',
    pack: 'financing',
    label: 'Weighted-average diluted shares',
    student:
      'The average number of common shares outstanding during the period, including dilutive potential shares (options, convertibles, RSUs) as defined for diluted EPS. Net income divided by this count is diluted EPS. Distinct from period-end shares outstanding, which is a point-in-time stock.',
    whyMissing: 'A few filers report only basic weighted-average shares, or skip per-share tags.',
    tags: 'WeightedAverageNumberOfDilutedSharesOutstanding',
    unit: 'shares',
    kind: 'duration',
    better: null,
    candidates: [
      { taxonomy: 'us-gaap', tag: 'WeightedAverageNumberOfDilutedSharesOutstanding' },
      { taxonomy: 'us-gaap', tag: 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted' },
    ],
  },
  {
    key: 'shares_basic_wavg',
    pack: 'financing',
    label: 'Weighted-average basic shares',
    student:
      'The average number of common shares actually outstanding during the period, excluding dilutive securities. The denominator of basic EPS.',
    whyMissing: 'Same as diluted weighted-average shares — some 10-Ks skip the tag.',
    tags: 'WeightedAverageNumberOfSharesOutstandingBasic',
    unit: 'shares',
    kind: 'duration',
    better: null,
    candidates: [{ taxonomy: 'us-gaap', tag: 'WeightedAverageNumberOfSharesOutstandingBasic' }],
  },
  usdDuration.call(
    FN,
    'stock_compensation',
    'Share-based compensation expense',
    'The income-statement cost of equity awards to employees (options, RSUs). A non-cash expense added back in operating cash flow. It also explains why diluted share count can rise even when the firm is repurchasing stock.',
    'ShareBasedCompensation',
    [
      { taxonomy: 'us-gaap', tag: 'ShareBasedCompensation' },
      { taxonomy: 'us-gaap', tag: 'AllocatedShareBasedCompensationExpense' },
      { taxonomy: 'us-gaap', tag: 'EmployeeServiceShareBasedCompensationNoncashExpense' },
    ],
    'Asset-light technology firms usually tag this; many industrials fold it into SG&A without a separate tag.'
  ),
];

export const BANK_METRICS = [
  usdDuration.call(
    BK,
    'net_interest_income',
    'Net interest income',
    'Interest earned on loans and securities minus interest paid on deposits and other funding. The core spread-based revenue line for a bank. Not comparable to industrial “revenue.”',
    'InterestIncomeExpenseNet, NetInterestIncome',
    [
      { taxonomy: 'us-gaap', tag: 'InterestIncomeExpenseNet' },
      { taxonomy: 'us-gaap', tag: 'NetInterestIncome' },
      { taxonomy: 'us-gaap', tag: 'InterestRevenueExpenseNet' },
    ],
    'Industrial companies generally do not tag this. Blank on a retailer is expected.'
  ),
  usdDuration.call(
    BK,
    'noninterest_income',
    'Noninterest income',
    'Bank revenue other than net interest: fees, trading, asset management, investment banking, and similar items. Together with net interest income it is the usual “total revenue” for a bank P&L.',
    'NoninterestIncome',
    [
      { taxonomy: 'us-gaap', tag: 'NoninterestIncome' },
      { taxonomy: 'us-gaap', tag: 'FeesAndCommissions' },
      { taxonomy: 'us-gaap', tag: 'NoninterestIncomeOtherOperatingIncome' },
    ],
    'Not a standard tag for non-financial issuers.'
  ),
  usdDuration.call(
    BK,
    'noninterest_expense',
    'Noninterest expense',
    'A bank’s operating costs: compensation, occupancy, technology, and other expenses other than interest and credit-loss provisions. The numerator of a simple efficiency ratio when divided by total revenue.',
    'NoninterestExpense',
    [
      { taxonomy: 'us-gaap', tag: 'NoninterestExpense' },
      { taxonomy: 'us-gaap', tag: 'LaborAndRelatedExpense' },
      { taxonomy: 'us-gaap', tag: 'OtherNoninterestExpense' },
    ],
    'Not a standard tag for non-financial issuers.'
  ),
  usdDuration.call(
    BK,
    'provision_credit_losses',
    'Provision for credit losses',
    'The income-statement charge (or release) that builds or reduces the allowance for credit losses on loans and similar assets. Analogous to an insurance expense for expected defaults, not a cash write-off.',
    'ProvisionForLoanLeaseAndOtherLosses',
    [
      { taxonomy: 'us-gaap', tag: 'ProvisionForLoanLeaseAndOtherLosses' },
      { taxonomy: 'us-gaap', tag: 'ProvisionForCreditLosses' },
      { taxonomy: 'us-gaap', tag: 'FinancingReceivableCreditLossExpenseReversal' },
    ],
    'Industrial trade receivables sometimes have a bad-debt expense under a different tag.'
  ),
  usdInstant.call(
    BK,
    'deposits',
    'Total deposits',
    'Customer deposit liabilities — the primary funding source for a commercial bank. Analogous to debt in a leverage discussion, but economically different: deposits are typically withdrawable and are the product a bank sells.',
    'Deposits',
    [
      { taxonomy: 'us-gaap', tag: 'Deposits' },
      { taxonomy: 'us-gaap', tag: 'DepositsDomestic' },
      { taxonomy: 'us-gaap', tag: 'InterestBearingDepositLiabilities' },
    ],
    'Expected to be blank for non-banks.'
  ),
  usdInstant.call(
    BK,
    'loans_net',
    'Loans, net',
    'The loan portfolio after the allowance for credit losses. For a bank this is the principal earning asset, analogous to inventory-plus-PP&E at an industrial firm.',
    'LoansAndLeasesReceivableNetReportedAmount',
    [
      { taxonomy: 'us-gaap', tag: 'LoansAndLeasesReceivableNetReportedAmount' },
      { taxonomy: 'us-gaap', tag: 'FinancingReceivableNet' },
      { taxonomy: 'us-gaap', tag: 'NotesReceivableNet' },
    ],
    'Expected to be blank for non-banks.'
  ),
  usdInstant.call(
    BK,
    'allowance_credit_losses',
    'Allowance for credit losses',
    'The contra-asset reserve against expected losses on loans. Loans gross minus this allowance equals loans net. An increase in the allowance is typically funded by the provision for credit losses.',
    'FinancingReceivableAllowanceForCreditLosses',
    [
      { taxonomy: 'us-gaap', tag: 'FinancingReceivableAllowanceForCreditLosses' },
      { taxonomy: 'us-gaap', tag: 'AllowanceForLoanAndLeaseLossesRealEstate' },
    ],
    'Expected to be blank for non-banks.'
  ),
  {
    key: 'tier1_capital_ratio',
    pack: 'bank',
    label: 'Common Equity Tier 1 ratio',
    student:
      'Common equity tier 1 capital divided by risk-weighted assets, as reported under bank regulatory capital rules. A solvency ratio, not an accounting profitability ratio. Values are stored as tagged (often a percentage point figure or a decimal).',
    whyMissing: 'Only banks and some broker-dealers tag regulatory capital ratios in XBRL.',
    tags: 'CommonEquityTier1CapitalRatio',
    unit: 'pure',
    kind: 'instant',
    better: 'higher',
    candidates: [
      { taxonomy: 'us-gaap', tag: 'CommonEquityTier1CapitalRatio' },
      { taxonomy: 'us-gaap', tag: 'TierOneLeverageCapitalRatio' },
    ],
  },
];

export const EXTENDED_FILED_METRICS = [
  ...BALANCE_SHEET_METRICS,
  ...INCOME_DETAIL_METRICS,
  ...LEASE_METRICS,
  ...FINANCING_METRICS,
  ...BANK_METRICS,
];

export const EXTENDED_DERIVED = [
  {
    key: 'effective_tax_rate',
    pack: 'income_detail',
    label: 'Effective tax rate',
    student:
      'Income tax expense divided by pretax income. It is an accounting rate, not the statutory corporate rate, and can differ because of credits, foreign mix, and discrete items. Hidden when pretax income is missing or non-positive.',
    whyMissing: 'Needs income tax expense and positive pretax income for the same year.',
    formula: 'Income tax expense ÷ pretax income',
    format: 'percent',
    better: null,
    needs: ['income_tax_expense', 'pretax_income'],
  },
  {
    key: 'implied_interest_rate',
    pack: 'income_detail',
    label: 'Implied interest rate on debt',
    student:
      'Interest expense divided by interest-bearing debt (current plus noncurrent when both are tagged, otherwise the legacy long-term debt tag). A rough average coupon, not a market yield. Beginning-of-year debt would be more precise; this snapshot uses year-end debt.',
    whyMissing: 'Needs interest expense and a debt stock for the same year.',
    formula: 'Interest expense ÷ (current debt + noncurrent debt)',
    format: 'percent',
    better: null,
    needs: ['interest_expense', 'debt_noncurrent'],
  },
  {
    key: 'payout_ratio',
    pack: 'financing',
    label: 'Dividend payout ratio',
    student:
      'Cash dividends paid divided by net income. Values above 100% mean dividends exceeded earnings (paid from retained earnings or cash). Undefined when net income is zero or negative.',
    whyMissing: 'Needs dividends paid and positive net income.',
    formula: 'Dividends paid ÷ net income',
    format: 'percent',
    better: null,
    needs: ['dividends_paid', 'net_income'],
  },
  {
    key: 'efficiency_ratio',
    pack: 'bank',
    label: 'Efficiency ratio',
    student:
      'Noninterest expense divided by the sum of net interest income and noninterest income. A bank operating-cost ratio: lower means a smaller cost base per dollar of revenue. Computed only when the bank revenue tags exist.',
    whyMissing: 'Needs noninterest expense and bank revenue (NII + noninterest income).',
    formula: 'Noninterest expense ÷ (net interest income + noninterest income)',
    format: 'percent',
    better: 'lower',
    needs: ['noninterest_expense', 'net_interest_income'],
  },
];

export const FILED_PACK_GROUPS = [
  {
    id: 'core_income',
    pack: 'core',
    label: 'Income statement (core)',
    summary: 'Headline annual profit-and-loss tags used by the existing Fortune 500 snapshot.',
    keys: ['revenue', 'gross_profit', 'operating_income', 'net_income', 'rd'],
  },
  {
    id: 'core_pershare',
    pack: 'core',
    label: 'Per share (core)',
    summary: 'Earnings per share and period-end shares outstanding.',
    keys: ['eps_diluted', 'eps_basic', 'shares_out'],
  },
  {
    id: 'core_balance',
    pack: 'core',
    label: 'Balance sheet (core)',
    summary: 'The original snapshot’s balance-sheet tags.',
    keys: ['assets', 'liabilities', 'equity', 'cash', 'long_term_debt', 'inventory', 'receivables'],
  },
  {
    id: 'core_cashflow',
    pack: 'core',
    label: 'Cash flow (core)',
    summary: 'The original snapshot’s cash-flow tags.',
    keys: ['cfo', 'cfi', 'cff', 'capex'],
  },
  {
    id: 'balance_sheet',
    pack: 'balance_sheet',
    label: 'Balance sheet detail',
    summary: 'PP&E, working-capital components, and a split of current versus noncurrent debt.',
    keys: BALANCE_SHEET_METRICS.map((m) => m.key),
  },
  {
    id: 'income_detail',
    pack: 'income_detail',
    label: 'Income statement detail',
    summary: 'Cost, overhead, interest, and tax lines that sit between revenue and net income.',
    keys: INCOME_DETAIL_METRICS.map((m) => m.key),
  },
  {
    id: 'leases',
    pack: 'leases',
    label: 'Leases (ASC 842 / IFRS 16)',
    summary: 'Capitalized lease liabilities, right-of-use assets, and related period costs.',
    keys: LEASE_METRICS.map((m) => m.key),
  },
  {
    id: 'financing',
    pack: 'financing',
    label: 'Capital structure and distributions',
    summary: 'Dividends, buybacks, debt issuance and repayment, and share-count bridges.',
    keys: FINANCING_METRICS.map((m) => m.key),
  },
  {
    id: 'bank',
    pack: 'bank',
    label: 'Bank-specific tags',
    summary: 'Deposit, loan, and spread tags. Expected to be untagged for industrial issuers.',
    keys: BANK_METRICS.map((m) => m.key),
  },
];

export const DERIVED_PACK_GROUPS = [
  {
    id: 'ratios_core',
    pack: 'core',
    label: 'Core ratios',
    summary: 'Profitability, returns, leverage, and cash-quality ratios from the original snapshot.',
    keys: [
      'gross_margin',
      'operating_margin',
      'net_margin',
      'roa',
      'roe',
      'debt_equity',
      'debt_assets',
      'rd_intensity',
      'fcf',
      'fcf_margin',
      'cash_conversion',
      'capex_intensity',
      'asset_turnover',
      'leverage',
      'book_value_ps',
      'receivables_days',
      'revenue_yoy',
    ],
  },
  {
    id: 'ratios_extended',
    pack: 'extended',
    label: 'Extended ratios',
    summary: 'Rates computed from the new tax, interest, dividend, and bank tags.',
    keys: EXTENDED_DERIVED.map((m) => m.key),
  },
];

export const SERIES_ANNUAL_YEARS = 5;
export const SERIES_QUARTERLY_LIMIT = 12;
export const QUARTERLY_SERIES_KEYS = ['revenue', 'net_income'];

export const EXTENDED_FILED_BY_KEY = Object.fromEntries(EXTENDED_FILED_METRICS.map((m) => [m.key, m]));
export const EXTENDED_DERIVED_BY_KEY = Object.fromEntries(EXTENDED_DERIVED.map((m) => [m.key, m]));

/** Academic definitions for the original 19 filed tags (information page). */
export const CORE_STUDENT = {
  revenue:
    'Total sales from the firm’s ordinary activities during the fiscal year, before subtracting operating costs. It is the starting point of the income statement. Different industries tag this under different US-GAAP names; the winning tag is recorded on the point.',
  net_income:
    'Profit remaining after all expenses, interest, and tax attributable to the parent. The usual meaning of “earnings” for the year. Negative values are losses.',
  gross_profit:
    'Revenue minus cost of goods or services sold. It measures the contribution of the product itself before operating overhead. Many banks and insurers do not report this line.',
  operating_income:
    'Profit from continuing operations before interest and income tax (EBIT, when the filer tags it this way). It excludes financing structure and tax jurisdiction.',
  assets:
    'The total of resources controlled by the entity at period-end — cash, receivables, inventory, PP&E, intangibles, and other assets. A stock, not a flow.',
  liabilities:
    'The total of present obligations at period-end. Assets − equity when the 10-K does not tag a consolidated Liabilities line. Individual debts (payables, borrowings, leases) are listed separately and do not sum to this total.',
  equity:
    'Residual interest in assets after deducting liabilities — book value attributable to shareholders. Not market capitalization.',
  cash:
    'Cash and cash equivalents at carrying value on the balance-sheet date. A stock of liquidity, distinct from operating cash flow (a flow over the year).',
  cfo:
    'Net cash provided by (used in) operating activities. The cash counterpart of earnings after working-capital and non-cash adjustments.',
  cfi:
    'Net cash from investing activities: purchases and sales of PP&E, acquisitions, and investment securities. Growing firms are often negative here because they are buying assets.',
  cff:
    'Net cash from financing activities: debt issuance and repayment, equity issuance, dividends, and share repurchases.',
  eps_diluted:
    'Net income per share after including dilutive potential common shares. Not a market price.',
  eps_basic:
    'Net income per share using only shares actually outstanding. Diluted EPS is the more conservative (usually smaller) figure.',
  shares_out:
    'Common shares outstanding at period-end. A stock count; the DCF share count typically uses this or diluted weighted-average shares, depending on the model.',
  long_term_debt:
    'The legacy long-term-debt tag. Coverage is uneven; prefer debt_current plus debt_noncurrent when those are tagged.',
  inventory:
    'Goods held for sale, net of reserves. Used with cost of sales to estimate days inventory outstanding. Often untagged for banks and software firms.',
  receivables:
    'Trade receivables, net of allowances. Used with revenue to estimate days sales outstanding.',
  rd:
    'Research and development expense recognized in the period. A flow, not a capitalized asset, under typical U.S. GAAP treatment of internal R&D.',
  capex:
    'Cash paid to acquire property, plant, and equipment. An investing outflow. Distinct from depreciation, which allocates past capex through earnings.',
  gross_margin: 'Gross profit divided by revenue. The share of each sales dollar remaining after direct product cost.',
  operating_margin: 'Operating income divided by revenue. Operating profitability before financing and tax.',
  net_margin: 'Net income divided by revenue. Bottom-line profitability.',
  roa: 'Net income divided by total assets. Return on the whole asset base.',
  roe: 'Net income divided by book equity. Return on shareholders’ accounting capital; can be inflated by buybacks that shrink equity.',
  debt_equity: 'Long-term debt divided by equity. A simple book-leverage ratio.',
  debt_assets: 'Long-term debt divided by total assets.',
  rd_intensity: 'R&D expense divided by revenue.',
  fcf: 'Operating cash flow minus capital expenditure (adding capex if it is stored as a negative outflow). An approximation of unlevered-plus-interest free cash flow, not a textbook unlevered FCF.',
  fcf_margin: 'Approximate free cash flow divided by revenue.',
  cash_conversion: 'Operating cash flow divided by net income. Values well below 1 suggest earnings are not turning into cash.',
  capex_intensity: 'Absolute capital expenditure divided by revenue.',
  asset_turnover: 'Revenue divided by total assets. How many sales dollars the asset base supports.',
  leverage: 'Assets divided by equity. The equity multiplier in a DuPont decomposition.',
  book_value_ps: 'Book equity divided by shares outstanding.',
  receivables_days: 'Receivables divided by revenue, times 365. An estimate of collection period.',
  revenue_yoy: 'This year’s revenue divided by last year’s revenue, minus one.',
};

export function studentText(def) {
  if (!def) return '';
  const academic = String(def.student || CORE_STUDENT[def.key] || '').trim();
  const plain = String(def.plain || '').trim();
  if (plain && academic) {
    if (academic.startsWith(plain) || academic.toLowerCase().startsWith(plain.toLowerCase())) {
      return academic;
    }
    const lead = /[.!?]$/.test(plain) ? plain : `${plain}.`;
    return `${lead} ${academic}`;
  }
  return academic || plain;
}

