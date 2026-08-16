# XBRL extraction expansion plan

Status: approved planning baseline (metrics frozen for implementation)  
Scope: Fortune 500 headline snapshot, Financial Modeler extras, live `/api/f500-headlines` fallback

This document specifies **exact metrics** to pull from SEC XBRL for each
implementation priority. Nothing in this plan commits raw Company Facts blobs to
git. Every item below is extracted with the same machinery as today
(`collectPoints` / `pickForYear` in `fortune-500/extract.js`), stored as slim
point objects `{ val, unit, start, end, fy, fp, form, filed, tag, taxonomy }`,
and governed by the same rules: **missing stays missing, never zero**.

---

## 1. Current baseline (already shipped)

**Source:** `GET https://data.sec.gov/api/xbrl/companyfacts/CIK{10}.json`  
**Pull scripts:** `scripts/pull-fortune500-headlines.mjs`, `scripts/pull-financial-modeler-extras.mjs`  
**Snapshot:** `fortune-500/data/headlines-snapshot.json` (+ `financial-modeler/extras-headlines.json`)  
**Schema:** `SNAPSHOT_SCHEMA = 3`, `PAYLOAD_SCHEMA = 3`

**Stored per company today:**

| Pack | Keys | Periods |
|------|------|---------|
| `core` | 19 headline metrics (table below) | Latest FY full point + prior FY value map (`priorMetrics`) |

### Core metrics (existing — not re-pulled, included in Priority 5 series)

| Key | Unit | Kind | Candidate tags (first hit wins) |
|-----|------|------|----------------------------------|
| `revenue` | USD | duration | `us-gaap:Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`, `RegulatedAndUnregulatedOperatingRevenue`, `RevenueFromContractWithCustomerIncludingAssessedTax`, `RevenuesNetOfInterestExpense`, `ifrs-full:RevenueFromContractsWithCustomers`, `Revenue` |
| `net_income` | USD | duration | `us-gaap:NetIncomeLoss`, `ifrs-full:ProfitLossAttributableToOwnersOfParent`, `ProfitLoss` |
| `gross_profit` | USD | duration | `us-gaap:GrossProfit`, `ifrs-full:GrossProfit` |
| `operating_income` | USD | duration | `us-gaap:OperatingIncomeLoss`, `ifrs-full:ProfitLossFromOperatingActivities` |
| `assets` | USD | instant | `us-gaap:Assets`, `ifrs-full:Assets` |
| `liabilities` | USD | instant | `us-gaap:Liabilities`, `ifrs-full:Liabilities` |
| `equity` | USD | instant | `us-gaap:StockholdersEquity`, `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest`, `ifrs-full:Equity`, `EquityAttributableToOwnersOfParent` |
| `cash` | USD | instant | `us-gaap:CashAndCashEquivalentsAtCarryingValue`, `ifrs-full:CashAndCashEquivalents` |
| `cfo` | USD | duration | `us-gaap:NetCashProvidedByUsedInOperatingActivities`, `ifrs-full:NetCashFlowsFromUsedInOperatingActivities` |
| `cfi` | USD | duration | `us-gaap:NetCashProvidedByUsedInInvestingActivities` |
| `cff` | USD | duration | `us-gaap:NetCashProvidedByUsedInFinancingActivities` |
| `eps_diluted` | USD/shares | duration | `us-gaap:EarningsPerShareDiluted` |
| `eps_basic` | USD/shares | duration | `us-gaap:EarningsPerShareBasic` |
| `shares_out` | shares | instant | `us-gaap:CommonStockSharesOutstanding`, `dei:EntityCommonStockSharesOutstanding` |
| `long_term_debt` | USD | instant | `us-gaap:LongTermDebt` |
| `inventory` | USD | instant | `us-gaap:InventoryNet`, `ifrs-full:Inventories`, `InventoriesTotal` |
| `receivables` | USD | instant | `us-gaap:AccountsReceivableNetCurrent`, `ifrs-full:TradeAndOtherCurrentReceivables` |
| `rd` | USD | duration | `us-gaap:ResearchAndDevelopmentExpense` |
| `capex` | USD | duration | `us-gaap:PaymentsToAcquirePropertyPlantAndEquipment`, `ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities`, `PaymentsToAcquireProductiveAssets` |

---

## 2. Non-negotiable extraction rules (all priorities)

1. Annual points: `form` ∈ `{10-K, 10-K/A, 20-F, 20-F/A}`, `fp = FY`, duration ≥ 300 days.
2. Quarterly points (Priority 6 only): `form` ∈ `{10-Q, 10-Q/A}`, `fp` ∈ `{Q1,Q2,Q3,Q4}`.
3. Pick by **period `end` year**, not `fy` alone (restated columns share `fy`).
4. Reject stale tags: if a candidate’s latest annual point is more than two years older than `asOfYear`, treat as missing (existing `extract.js` behaviour).
5. Candidate order is “first hit wins” within a year; filed-date scoring is tiebreaker only among the same tag.
6. Missing tag → `null` in snapshot. Never impute zero.
7. Bump `SNAPSHOT_SCHEMA` and `PAYLOAD_SCHEMA` together when any stored field the UI reads changes shape.
8. Do not commit raw Company Facts JSON. Slim extracted points only.

---

## 3. Priority 1 — Balance sheet detail (pack: `balance_sheet`)

**Why:** Removes Financial Modeler “other assets / other liabilities” residuals; enables PP&E corkscrew and full working-capital schedule.

**Snapshot keys:** add under `metrics` alongside core (same FY + `priorMetrics` value map).

| Key | Label | Unit | Kind | Candidate tags (order) |
|-----|-------|------|------|-------------------------|
| `ppe_net` | Net PP&E | USD | instant | `us-gaap:PropertyPlantAndEquipmentNet`, `ifrs-full:PropertyPlantAndEquipment` |
| `accumulated_depreciation` | Accumulated depreciation | USD | instant | `us-gaap:AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment`, `ifrs-full:AccumulatedDepreciationAmortisationAndImpairmentPropertyPlantAndEquipment` |
| `goodwill` | Goodwill | USD | instant | `us-gaap:Goodwill`, `ifrs-full:Goodwill` |
| `intangibles_net` | Intangible assets (net) | USD | instant | `us-gaap:IntangibleAssetsNetExcludingGoodwill`, `IntangibleAssetsNetIncludingGoodwill`, `ifrs-full:IntangibleAssetsOtherThanGoodwill` |
| `accounts_payable` | Accounts payable | USD | instant | `us-gaap:AccountsPayableCurrent`, `ifrs-full:TradeAndOtherCurrentPayables` |
| `accrued_liabilities` | Accrued liabilities | USD | instant | `us-gaap:AccruedLiabilitiesCurrent`, `EmployeeRelatedLiabilitiesCurrent`, `ifrs-full:OtherCurrentLiabilities` |
| `deferred_revenue_current` | Deferred revenue (current) | USD | instant | `us-gaap:ContractWithCustomerLiabilityCurrent`, `DeferredRevenueCurrent`, `ifrs-full:CurrentContractLiabilities` |
| `deferred_revenue_noncurrent` | Deferred revenue (noncurrent) | USD | instant | `us-gaap:ContractWithCustomerLiabilityNoncurrent`, `DeferredRevenueNoncurrent`, `ifrs-full:NoncurrentContractLiabilities` |
| `prepaid_expenses` | Prepaid expenses | USD | instant | `us-gaap:PrepaidExpenseCurrent`, `PrepaidExpenseAndOtherAssetsCurrent`, `ifrs-full:PrepaymentsCurrent` |
| `debt_current` | Current debt | USD | instant | `us-gaap:LongTermDebtCurrent`, `DebtCurrent`, `ShortTermBorrowings`, `CommercialPaper`, `ifrs-full:CurrentBorrowings` |
| `debt_noncurrent` | Long-term debt (noncurrent) | USD | instant | `us-gaap:LongTermDebtNoncurrent`, `LongTermDebt`, `LongTermDebtAndCapitalLeaseObligations`, `ifrs-full:NoncurrentBorrowings` |
| `da_expense` | Depreciation & amortization | USD | duration | `us-gaap:DepreciationDepletionAndAmortization`, `Depreciation`, `DepreciationAndAmortization`, `ifrs-full:DepreciationAmortisationAndImpairmentExpense` |

**Derived checks (not stored as inputs):**

- `ppe_net` + `accumulated_depreciation` ≈ gross PP&E when both tagged.
- `debt_current` + `debt_noncurrent` replaces standalone `long_term_debt` for net-debt when both present (keep `long_term_debt` for backward compatibility).

**Schema bump:** `SNAPSHOT_SCHEMA = 4`, `PAYLOAD_SCHEMA = 4`.

---

## 4. Priority 2 — Income statement detail (pack: `income_detail`)

**Why:** Default assumptions from filing components instead of margin guesses and flat 21% tax.

| Key | Label | Unit | Kind | Candidate tags (order) |
|-----|-------|------|------|-------------------------|
| `cogs` | Cost of goods / services sold | USD | duration | `us-gaap:CostOfGoodsAndServicesSold`, `CostOfRevenue`, `CostOfGoodsSold`, `CostOfGoodsSoldAndServicesSold`, `ifrs-full:CostOfSales` |
| `sga` | SG&A | USD | duration | `us-gaap:SellingGeneralAndAdministrativeExpense`, `GeneralAndAdministrativeExpense`, `SellingAndMarketingExpense`, `ifrs-full:AdministrativeExpense`, `SellingExpense` |
| `interest_expense` | Interest expense | USD | duration | `us-gaap:InterestExpense`, `InterestExpenseDebt`, `InterestExpenseNonoperating`, `ifrs-full:FinanceCosts` |
| `interest_income` | Interest income | USD | duration | `us-gaap:InterestIncomeOperating`, `InterestIncomeExpenseNet`, `InvestmentIncomeInterest`, `InterestAndDividendIncomeOperating`, `ifrs-full:FinanceIncome` |
| `income_tax_expense` | Income tax expense | USD | duration | `us-gaap:IncomeTaxExpenseBenefit`, `ifrs-full:IncomeTaxExpenseContinuingOperations` |
| `pretax_income` | Pretax income | USD | duration | `us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest`, `IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments`, `ifrs-full:ProfitLossBeforeTax` |

**Derived ratios (computed in `extract.js`, stored in `ratios` when inputs exist):**

| Ratio key | Formula |
|-----------|---------|
| `effective_tax_rate` | `income_tax_expense / pretax_income` (clamp 0–0.5; null if either missing) |
| `implied_interest_rate` | `interest_expense / average(debt_current + debt_noncurrent)` (null if debt untagged) |

**Schema bump:** same as Priority 1 if shipped together (`4`); else `5`.

---

## 5. Priority 3 — Leases (pack: `leases`)

**Why:** Phase 9 lease schedule, ai-buildout parity, lease-adjusted leverage.

| Key | Label | Unit | Kind | Candidate tags (order) |
|-----|-------|------|------|-------------------------|
| `operating_lease_liability` | Operating lease liability | USD | instant | `us-gaap:OperatingLeaseLiability`, `OperatingLeaseLiabilityNoncurrent` + current if only split tags exist: `OperatingLeaseLiabilityCurrent` (if both current and noncurrent tagged, store sum in extractor helper — do not double-count if consolidated tag also exists) |
| `finance_lease_liability` | Finance lease liability | USD | instant | `us-gaap:FinanceLeaseLiability`, `CapitalLeaseObligations`, `FinanceLeaseLiabilityNoncurrent` |
| `operating_lease_rou` | Operating lease ROU asset | USD | instant | `us-gaap:OperatingLeaseRightOfUseAsset` |
| `finance_lease_rou` | Finance lease ROU asset | USD | instant | `us-gaap:FinanceLeaseRightOfUseAsset` |
| `operating_lease_cost` | Operating lease cost (P&L) | USD | duration | `us-gaap:OperatingLeaseCost`, `OperatingLeaseExpense` |
| `operating_lease_cash_paid` | Operating lease cash paid | USD | duration | `us-gaap:OperatingLeasePayments`, `FinanceLeasePrincipalPayments` (fallback only if operating tag missing — document in provenance) |

**Note:** When filers report `OperatingLeaseLiabilityCurrent` and `OperatingLeaseLiabilityNoncurrent` but not the consolidated tag, the extractor sums them into `operating_lease_liability`. If the consolidated tag exists, use it alone.

**Schema bump:** `6` if shipped alone.

---

## 6. Priority 4 — Financing flows (pack: `financing`)

**Why:** Payout ratio defaults, buyback/share-count bridge, debt schedule seed, credit model.

| Key | Label | Unit | Kind | Candidate tags (order) |
|-----|-------|------|------|-------------------------|
| `dividends_paid` | Dividends paid | USD | duration | `us-gaap:PaymentsOfDividends`, `PaymentsOfDividendsCommonStock`, `PaymentsOfOrdinaryDividends`, `ifrs-full:DividendsPaid` |
| `share_repurchases` | Share repurchases | USD | duration | `us-gaap:PaymentsForRepurchaseOfCommonStock`, `PaymentsForRepurchaseOfEquity`, `ifrs-full:PurchaseOfOwnShares` |
| `debt_proceeds` | Debt proceeds | USD | duration | `us-gaap:ProceedsFromIssuanceOfLongTermDebt`, `ProceedsFromIssuanceOfDebt`, `ProceedsFromNotesPayable`, `ProceedsFromIssuanceOfSeniorLongTermDebt` |
| `debt_repayments` | Debt repayments | USD | duration | `us-gaap:RepaymentsOfLongTermDebt`, `RepaymentsOfDebt`, `RepaymentsOfNotesPayable`, `RepaymentsOfSeniorDebt` |
| `shares_diluted_wavg` | Weighted avg diluted shares | shares | duration | `us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding`, `WeightedAverageNumberOfShareOutstandingBasicAndDiluted` |
| `shares_basic_wavg` | Weighted avg basic shares | shares | duration | `us-gaap:WeightedAverageNumberOfSharesOutstandingBasic` |
| `stock_compensation` | Stock-based compensation | USD | duration | `us-gaap:ShareBasedCompensation`, `AllocatedShareBasedCompensationExpense`, `EmployeeServiceShareBasedCompensationNoncashExpense` |

**Derived ratios:**

| Ratio key | Formula |
|-----------|---------|
| `payout_ratio` | `dividends_paid / net_income` (null if either missing or NI ≤ 0) |
| `buyback_yield` | `share_repurchases / (shares_out × price)` — price from Yahoo, not XBRL; ratio computed at display time only |

**Schema bump:** `7` if shipped alone.

---

## 7. Priority 5 — Five-year annual series (pack: `series_annual`)

**Why:** Fortune 500 history charts, trend defaults in Financial Modeler, stale-tag detection.

**Storage shape** (new top-level key per company, not inside `metrics` point):

```json
"series_annual": {
  "years": 5,
  "metrics": {
    "revenue": [ { "year": 2021, "val": ..., "end": "...", "tag": "...", "form": "10-K" }, ... ],
    "ppe_net": [ ... ]
  }
}
```

**Metrics included in the series** (5 most recent distinct fiscal `end` years per CIK):

All **core** keys (19) **plus** every key from packs `balance_sheet`, `income_detail`, `leases`, and `financing` (44 keys total when all packs shipped).

| Series group | Keys |
|--------------|------|
| Core (19) | `revenue`, `net_income`, `gross_profit`, `operating_income`, `assets`, `liabilities`, `equity`, `cash`, `cfo`, `cfi`, `cff`, `eps_diluted`, `eps_basic`, `shares_out`, `long_term_debt`, `inventory`, `receivables`, `rd`, `capex` |
| Balance sheet (12) | `ppe_net`, `accumulated_depreciation`, `goodwill`, `intangibles_net`, `accounts_payable`, `accrued_liabilities`, `deferred_revenue_current`, `deferred_revenue_noncurrent`, `prepaid_expenses`, `debt_current`, `debt_noncurrent`, `da_expense` |
| Income detail (6) | `cogs`, `sga`, `interest_expense`, `interest_income`, `income_tax_expense`, `pretax_income` |
| Leases (6) | `operating_lease_liability`, `finance_lease_liability`, `operating_lease_rou`, `finance_lease_rou`, `operating_lease_cost`, `operating_lease_cash_paid` |
| Financing (7) | `dividends_paid`, `share_repurchases`, `debt_proceeds`, `debt_repayments`, `shares_diluted_wavg`, `shares_basic_wavg`, `stock_compensation` |

**Point selection:** For each metric × year, use the same `pickForYear` logic as headlines. Store `{ year, val, end, start, tag, taxonomy, form, filed }`; omit years with no point.

**Size estimate:** 473 filers × 44 metrics × 5 years ≈ 104k points (~4–8 MB added to snapshot depending on provenance fields).

**Schema bump:** `8`.

---

## 8. Priority 6 — Quarterly series (optional pack: `series_quarterly`)

**Why:** Retail seasonality, intra-year trends. **Off by default** in snapshot until a consumer needs it.

**Storage:**

```json
"series_quarterly": {
  "metrics": {
    "revenue": [ { "fy": 2025, "fp": "Q1", "end": "...", "val": ... }, ... ],
    "net_income": [ ... ]
  }
}
```

**Metrics (2 only):**

| Key | Unit | Kind | Forms | Candidate tags |
|-----|------|------|-------|----------------|
| `revenue` | USD | duration | 10-Q, 10-Q/A | Same candidate list as core `revenue` |
| `net_income` | USD | duration | 10-Q, 10-Q/A | Same candidate list as core `net_income` |

**Window:** Last **12 quarters** (3 years) per CIK, or 20 quarters if snapshot size allows after measurement.

**Schema bump:** `9`.

---

## 9. Priority 7 — Bank tag pack (pack: `bank`)

**Why:** JPM, BAC, WFC, GS, MS et al. do not file industrial COGS / inventory; they need spread-based tags.

**Activation:** Only extracted and stored when `sic_major_group === 6` (finance) from Submissions metadata, **or** when core `revenue` resolves to `RevenuesNetOfInterestExpense`. Other filers omit the pack entirely (no empty keys).

| Key | Label | Unit | Kind | Candidate tags (order) |
|-----|-------|------|------|-------------------------|
| `net_interest_income` | Net interest income | USD | duration | `us-gaap:InterestIncomeExpenseNet`, `NetInterestIncome`, `InterestRevenueExpenseNet` |
| `interest_income` | Interest income | USD | duration | `us-gaap:InterestAndDividendIncomeOperating`, `InterestIncomeOperating`, `InterestIncomeDepositsWithFinancialInstitutions` |
| `interest_expense` | Interest expense | USD | duration | `us-gaap:InterestExpense`, `InterestExpenseDeposits`, `InterestExpenseBorrowings` |
| `noninterest_income` | Noninterest income | USD | duration | `us-gaap:NoninterestIncome`, `FeesAndCommissions`, `NoninterestIncomeOtherOperatingIncome` |
| `noninterest_expense` | Noninterest expense | USD | duration | `us-gaap:NoninterestExpense`, `LaborAndRelatedExpense`, `OtherNoninterestExpense` |
| `provision_credit_losses` | Provision for credit losses | USD | duration | `us-gaap:ProvisionForLoanLeaseAndOtherLosses`, `ProvisionForCreditLosses`, `FinancingReceivableCreditLossExpenseReversal` |
| `deposits` | Total deposits | USD | instant | `us-gaap:Deposits`, `DepositsDomestic`, `InterestBearingDepositLiabilities` |
| `loans_net` | Loans, net | USD | instant | `us-gaap:LoansAndLeasesReceivableNetReportedAmount`, `FinancingReceivableNet`, `NotesReceivableNet` |
| `allowance_credit_losses` | Allowance for credit losses | USD | instant | `us-gaap:FinancingReceivableAllowanceForCreditLosses`, `AllowanceForLoanAndLeaseLossesRealEstate` |
| `tier1_capital_ratio` | CET1 ratio | pure | instant | `us-gaap:CommonEquityTier1CapitalRatio`, `TierOneLeverageCapitalRatio` (store as decimal; tag often unitless) |
| `efficiency_ratio` | Efficiency ratio | pure | duration | `us-gaap:EfficiencyRatio` (when tagged; else derive `noninterest_expense / (net_interest_income + noninterest_income)`) |

**Bank pack also included in `series_annual`** when active (11 keys × 5 years).

**Schema bump:** `10`.

---

## 10. Priority 8 — Segments (separate artifact)

**Why:** SOTP teaching. **Not** Company Facts — filing-level inline XBRL only.

**Source:**

1. `GET https://data.sec.gov/submissions/CIK{10}.json` → latest `10-K` / `20-F` accession + primary document.
2. `GET https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{primary.htm}`

**Output file:** `fortune-500/data/segments-snapshot.json` (separate from headlines; separate schema `SEGMENT_SNAPSHOT_SCHEMA`).

**Pull script:** `scripts/pull-fortune500-segments.mjs`  
**Extractor:** `fortune-500/extract-segments.js` (browser-safe pure functions + Node pull tests)

### 10.1 Segment metrics pulled (per member, per axis)

| Metric key | XBRL concept names matched | Unit | Period |
|------------|---------------------------|------|--------|
| `revenue` | `RevenueFromContractWithCustomerExcludingAssessedTax`, `Revenues`, `SalesRevenueNet`, `RevenuesNetOfInterestExpense` | USD | Latest FY (`start`/`end` from context) |
| `operating_income` | `OperatingIncomeLoss`, `SegmentReportingInformationOperatingIncomeLoss` | USD | Latest FY |
| `assets` | `Assets`, `SegmentReportingSegmentAssets` | USD | Instant at FY `end` |
| `depreciation_amortization` | `DepreciationDepletionAndAmortization`, `SegmentReportingInformationDepreciationDepletionAndAmortization` | USD | Latest FY |

Missing concept → `null` for that member. Never zero.

### 10.2 Axes extracted (explicitMember dimensions)

| Axis ID | XBRL dimension | Use |
|---------|----------------|-----|
| `product` | `srt:ProductOrServiceAxis` | Product / service lines (Apple iPhone, Services, …) |
| `operating` | `us-gaap:StatementBusinessSegmentsAxis` | Reportable operating segments (Americas, CCB, …) |
| `geography` | `srt:StatementGeographicalAxis`, `us-gaap:StatementGeographicalAxis` | Country / region when not same as operating |

**Rules:**

- Store each axis separately. **Never sum product + geography** into one SOTP total.
- Ignore contexts with more than two explicit members unless the outer member is `OperatingSegmentsMember` (nested segment — keep leaf member label).
- Skip axes where fewer than two members have `revenue` for the latest FY (single-segment filer → `flags: ["single_segment"]`).
- Banks (`bank` pack active): set `flags: ["bank_segment_excluded"]` in v1; do not attempt industrial SOTP normalization on `FinancingReceivablePortfolioSegmentAxis`.

### 10.3 Consolidated sanity checks (stored per company)

| Check key | Rule |
|-----------|------|
| `revenue_ties` | Sum of `operating` axis `revenue` members within ±2% of core headline `revenue`, or flag `revenue_mismatch` |
| `axes_disjoint` | Product and operating revenue sums must not both be presented as “total segment revenue” in UI |
| `filing_fresh` | Segment filing `end` matches headline `asOfYear` period end (or flag `period_mismatch`) |

### 10.4 v1 filer scope (before all 473)

Pilot CIKs: `320193` (AAPL), `789019` (MSFT), `1018724` (AMZN), `1652044` (GOOGL), `1326801` (META), `200406` (JNJ), `40545` (GE), `66740` (3M), `70858` (BAC — expect `bank_segment_excluded`), `19617` (JPM — excluded).

Expand to full Fortune 500 after pilot checks pass.

**Schema bump:** `SEGMENT_SNAPSHOT_SCHEMA = 1`.

---

## 11. Implementation phases (build order)

| Phase | Delivers | Schema | Tests |
|-------|----------|--------|-------|
| P1 | Pack `balance_sheet` in catalog + extract + snapshot | 4 | Extend `test-fortune500-extract.mjs` fixtures |
| P2 | Pack `income_detail` + derived tax rate | 4 or 5 | Same |
| P3 | Pack `leases` | 6 | Lease sum helper tests |
| P4 | Pack `financing` | 7 | Same |
| P5 | `series_annual` for all shipped keys | 8 | Series length, year ordering, no mutation |
| P6 | Optional `series_quarterly` | 9 | Q4 lines up with 10-K FY |
| P7 | Conditional `bank` pack | 10 | BAC/JPM fixtures; industrial filer must omit pack |
| P8 | `segments-snapshot.json` pilot | SEG 1 | Apple product revenue sums; MSFT operating axis |
| P9 | Wire Financial Modeler defaults to new tags (PP&E, D&A, AP, deferred rev, tax, interest) | — | Existing FM engine tests unchanged numerically until defaults source changes |

Financial Modeler and Fortune 500 UI work **follow** snapshot shape stability. Do not change model math until P1–P2 snapshots are committed.

---

## 12. Files touched (when implementing)

| File | Change |
|------|--------|
| `fortune-500/catalog.js` | Add `BALANCE_SHEET_METRICS`, `INCOME_DETAIL_METRICS`, … pack exports |
| `fortune-500/extract.js` | `extractHeadlines` merges packs; `extractSeriesAnnual`; optional bank gate |
| `fortune-500/extract-segments.js` | New — filing HTML dimensional extractor |
| `scripts/pull-fortune500-headlines.mjs` | `slim()` includes new fields; schema constant |
| `scripts/pull-fortune500-segments.mjs` | New |
| `api/fortune-500.js` | `PAYLOAD_SCHEMA` parity |
| `scripts/pull-financial-modeler-extras.mjs` | Same packs for extras |
| `scripts/test-fortune500-extract.mjs` | Fixtures per pack |
| `scripts/test-fortune500-segments.mjs` | New |

---

## 13. What we still will not pull from XBRL

| Item | Reason |
|------|--------|
| Segment data via Company Facts | Dimensions stripped; use Priority 8 filing pull |
| MD&A / risk narrative | Unstructured HTML |
| Stock price / market cap | Yahoo (`/api/f500-prices`) |
| Covenant terms, debt maturity schedule | Footnote prose or non-standard tags |
| Headcount | Inconsistent (`dei:EntityNumberOfEmployees`); defer |
| Raw Company Facts blob | Size; policy |

---

## 14. Metric count summary

| Priority | Pack | New keys | Series (P5) | Quarterly (P6) |
|----------|------|----------|---------------|----------------|
| 1 | `balance_sheet` | 12 | 12 | — |
| 2 | `income_detail` | 6 | 6 | — |
| 3 | `leases` | 6 | 6 | — |
| 4 | `financing` | 7 | 7 | — |
| 5 | `series_annual` | 0 (wraps 44 total incl. core) | 44 × 5 yrs | — |
| 6 | `series_quarterly` | 0 | — | 2 × 12 qtrs |
| 7 | `bank` | 11 (conditional) | 11 when active | — |
| 8 | `segments` | 4 metrics × N members × ≤3 axes | Separate file | — |

**Total new Company Facts keys (industrial filer, all packs):** 31 per latest FY (+ prior in `priorMetrics` when P1–P4 extend the prior map).

---

## 15. Acceptance gate (each phase)

1. `node scripts/test-fortune500-extract.mjs` passes.
2. `node scripts/test-financial-modeler-extras.mjs` passes.
3. Spot-check: Apple `ppe_net`, `da_expense`, `accounts_payable`, `deferred_revenue_current`, `debt_noncurrent` tie to FY2025 10-K.
4. Missing tags remain null in snapshot JSON (grep `"val": 0` only where filer truly reported zero).
5. Snapshot size stays under 15 MB committed until measured otherwise.
6. Segment pilot: Apple product revenue members sum to consolidated revenue within 2%.

---

*Last updated: 2026-08-16. Metrics in sections 3–10 are frozen for implementation; bump this doc’s revision date if tags change.*
