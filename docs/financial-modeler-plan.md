# Financial Modeler product and implementation plan

Status: approved planning baseline  
Scope: `/financial-modeler/` browser experience and its generated Excel workbooks

## 1. Goal

Turn Financial Modeler into a spacious, guided modeling workspace that teaches a
user how to build and understand:

- an integrated three-statement model;
- a discounted cash flow valuation;
- a trading-comparables valuation;
- operating scenarios and two-variable sensitivities;
- a single-unit and portfolio unit-economics model;
- a capital-intensive project model;
- a strategic-investment appraisal; and
- a regional market-entry analysis.

The product must explain what the user is doing, where every important value
came from, which outputs an assumption affects, and how the model's schedules
connect. Existing Excel reliability is a hard constraint, not a feature to
rebuild casually.

## 2. Non-negotiable behavior

An implementation is not complete if it violates any of these rules:

1. Missing filing data remains missing. Never convert an absent value to zero.
2. Cash remains the balance-sheet plug in the existing three-statement model.
3. Interest uses beginning debt and cash balances. Do not introduce circular
   calculations or require Excel iterative calculation.
4. Inputs remain isolated on an assumptions sheet in generated workbooks.
5. Workbook colors retain their existing meaning:
   - blue: hard-coded input;
   - black: formula;
   - green: cross-sheet link.
6. Browser and workbook explanations come from shared metadata rather than
   separately maintained prose wherever practical.
7. The balance sheet must tie in every projected period before a workbook is
   described as ready.
8. The existing model, workbook, unit-economics, extras, and public-import tests
   must pass after every implementation phase.
9. Keep browser-imported modules dependency-free ESM. Do not move them under
   `/lib/`, which is unavailable to browsers in production.
10. Do not add a serverless function for this work. The models can remain
    browser-side and static.

## 3. Current implementation map

Use these files as the starting points:

| File | Responsibility |
|---|---|
| `financial-modeler/index.html` | Page structure, setup steps, workspace, download dock |
| `financial-modeler/app.css` | Responsive layout, cramped `has-company` viewport mode |
| `financial-modeler/app.js` | Browser state, company and peer selection, rendering, download |
| `financial-modeler/dials.js` | Existing assumption names, explanations, sources, and effects |
| `financial-modeler/engine.js` | Three-statement, DCF, comps, scenarios, sensitivity |
| `financial-modeler/unit-econ.js` | Lemonade/single-unit model and its assumptions |
| `financial-modeler/workbook.js` | OOXML workbook generation and formula wiring |

Existing regression suites:

```bash
node scripts/test-financial-modeler-engine.mjs
node scripts/test-financial-modeler-workbook.mjs
node scripts/test-financial-modeler-unit-econ.mjs
node scripts/test-financial-modeler-extras.mjs
node scripts/test-public-imports.mjs
```

## 4. Usability standard for every model

Every model template must use the same learning sequence.

### 4.1 Orient

Before showing a large table, state:

- the business question this model answers;
- the principal output;
- the required inputs;
- the sequence in which the model is built; and
- the checks that determine whether the result can be trusted.

### 4.2 Build

Show a visible checklist with one active step. Each step must contain:

- a plain-English instruction;
- the relevant assumptions;
- the formula or calculation being performed;
- the affected rows or schedules;
- a live output preview; and
- a completion state.

Instructions belong beside the active work. Do not place essential instructions
only beneath a long table.

### 4.3 Explain assumptions

Each editable assumption must provide:

- plain-English label and definition;
- exact current value with an editable numeric field;
- unit and valid range;
- source category: filing, historical calculation, market data, provided
  project data, or user assumption;
- source detail and, when available, source period;
- formula used to derive the starting value;
- Base, Upside, Downside, and Custom values;
- outputs and schedules affected;
- reset-to-source action; and
- a warning for invalid or unusually aggressive values.

Sliders may be retained as optional quick controls, but a precise text field
must be the primary input.

### 4.4 Trace

Selecting an assumption or model row must reveal a compact dependency path.
Examples:

```text
Revenue growth → Revenue → EBIT → Free cash flow → Implied share price
Days to get paid → Receivables → Cash from operations → Ending cash
Ending debt → Next year's interest expense → Net income
```

Use the same handoff colors on the website and in Excel. Color must supplement,
not replace, text labels.

### 4.5 Validate

Keep a visible status area containing:

- balance-sheet tie;
- cash-balance warning;
- invalid DCF relationship such as terminal growth greater than WACC;
- missing-data warnings;
- model-specific integrity checks; and
- workbook readiness.

### 4.6 Decide

End each model with a short decision summary rather than only raw tables:

- principal result;
- Base/Upside/Downside range;
- assumptions with the greatest effect;
- capital required and timing;
- major risks;
- failed checks; and
- next action.

Advanced accounting detail must use progressive disclosure: explain the concept
in one sentence first, then offer formulas, schedules, and accounting notes in
an expandable area.

## 5. Target browser information architecture

### 5.1 Setup

Keep exercise and company selection, but collapse completed setup into a summary
bar containing:

- selected exercise and company;
- selected models;
- selected peer count;
- filing period;
- Change buttons; and
- overall model status.

### 5.2 Workspace

Use one main vertical page scroll. Do not lock the body to `100vh` or create
simultaneous vertical scroll areas for assumptions and outputs.

Desktop layout:

- top: model summary and progress;
- center: full-width active model;
- right drawer: collapsible assumptions and explanation inspector;
- bottom or header: persistent checks and download action.

Mobile layout:

- one content column;
- model tabs scroll horizontally or become a select control;
- assumptions open in a bottom sheet or inline panel;
- no fixed element may obscure table rows or instructions.

### 5.3 Primary model navigation

After setup, use these tabs:

1. `3 Statements`
2. `DCF`
3. `Comps`
4. `Scenarios`
5. `Sensitivity`
6. `Checks & Download`

Tabs should describe dependencies:

- DCF depends on the three-statement free cash flow.
- Comps depends on a user-selected peer set and market prices.
- Scenarios change coherent groups of assumptions.
- Sensitivity changes two assumptions while holding the others constant.

Model selection controls whether a model is included in Excel. Tabs control what
is visible. Do not use one state value for both responsibilities.

## 6. Shared data contracts to introduce

Create browser-safe modules under `financial-modeler/`; names may be adjusted if
the repository already has an equivalent helper.

### 6.1 Assumption metadata

Evolve dial metadata into a shared assumption catalog:

```js
{
  key: 'revenueGrowth',
  group: 'operations',
  models: ['three', 'dcf'],
  name: 'Sales growth',
  shortDefinition: 'How much sales increase each year.',
  formulaText: 'Current-year revenue ÷ prior-year revenue − 1',
  sourceType: 'historical-calculation',
  sourceText(context) {},
  affects: ['revenue', 'ebit', 'unleveredFcf', 'impliedPrice'],
  format: 'percent',
  min: -0.2,
  max: 0.4,
  step: 0.005
}
```

The catalog must supply browser cards and workbook assumption notes.

### 6.2 Scenario state

Replace the single assumptions object plus destructive preset switch with:

```js
{
  activeScenario: 'base',
  scenarios: {
    downside: { values: {}, label: 'Downside' },
    base: { values: {}, label: 'Base' },
    upside: { values: {}, label: 'Upside' },
    custom: { values: {}, label: 'Custom' }
  }
}
```

Changing the active scenario must not overwrite values in another scenario.
Initialize each case once from filed defaults plus documented tilts. A user edit
changes only the active case.

### 6.3 Dependency metadata

Add a declarative map rather than embedding dependency prose in event handlers:

```js
{
  revenueGrowth: {
    path: ['Revenue', 'EBIT', 'Unlevered FCF', 'Implied share price'],
    rowKeys: ['revenue', 'ebit', 'unleveredFcf'],
    outputKeys: ['impliedPrice']
  }
}
```

Render highlights from this map. Do not alter calculation logic to implement
visual tracing.

### 6.4 Sensitivity specification

Use one generic shape:

```js
{
  rowInput: 'terminalGrowth',
  columnInput: 'wacc',
  output: 'impliedPrice',
  rowValues: [],
  columnValues: [],
  baseRowValue: 0.025,
  baseColumnValue: 0.085
}
```

The sensitivity runner must clone assumptions for every cell and must not mutate
the active scenario.

## 7. Delivery phases

Complete phases in order. Do not start a new model template before the common
workspace, explanation, scenario, and workbook foundations are stable.

### Phase 1 — Spacious workspace foundation

Objective: remove the cramped dashboard without changing financial results.

Implementation tasks:

1. In `app.css`, remove the desktop `body.has-company` fixed-height and
   `overflow: hidden` behavior.
2. Replace dual vertical scrolling with normal page flow.
3. Retain horizontal scrolling only around genuinely wide tables.
4. Add model-tab markup to `index.html`.
5. In `app.js`, introduce `activeTab` independently of `state.models`.
6. Collapse completed setup steps into a summary component after company
   selection. Every selection must remain changeable.
7. Move assumptions into a collapsible inspector on desktop and an inline or
   bottom-sheet presentation on small screens.
8. Keep model checks and Download Excel readily visible without obscuring
   content.
9. Preserve keyboard focus styles and use actual buttons for tab controls.

Acceptance criteria:

- At 1440×900, the browser has one vertical scrollbar.
- The main statement table receives the majority of page width.
- Essential setup descriptions and model instructions are not hidden merely
  because a company is selected.
- At 390×844, the download control does not cover content.
- Switching visible tabs does not alter selected workbook models.
- Existing numeric model and generated workbook outputs are unchanged.

Verification:

- Run all existing Financial Modeler tests.
- Manually exercise company selection, every tab, model selection, peer
  selection, assumption editing, and Excel download at desktop and mobile
  widths.

### Phase 2 — Guided construction and traceability

Objective: make each calculation sequence and statement handoff understandable.

Implementation tasks:

1. Add a reusable build-checklist renderer.
2. Define these three-statement steps:
   - revenue;
   - operating margins;
   - working capital;
   - CapEx and depreciation;
   - financing;
   - cash and equity roll-forwards; and
   - balance check.
3. Define these DCF steps:
   - forecast unlevered free cash flow;
   - calculate cost of equity and WACC;
   - calculate terminal value;
   - discount forecast and terminal cash flow; and
   - bridge enterprise value to implied share price.
4. Define these comps steps:
   - choose appropriate peers;
   - inspect missing data;
   - review relevant multiples;
   - calculate mean and median;
   - apply selected multiples; and
   - compare implied values with DCF.
5. Add the shared assumption and dependency metadata described in Section 6.
6. When an assumption is focused, highlight affected rows and show its
   dependency path.
7. Move current statement, DCF, and comps explanations into the active step or
   inspector. Keep short overview copy above each model.
8. Show source badges and distinguish sourced defaults from user overrides.
9. Add inline invalid-value messages associated with the input using accessible
   descriptions.

Acceptance criteria:

- A first-time user can identify the next required step without scrolling to
  the end of a model.
- Every editable assumption identifies its source and affected outputs.
- Selecting Sales growth highlights Revenue, EBIT, free cash flow, and DCF
  value without changing calculations.
- Statement handoffs remain explicitly labeled in text and color.
- Missing values are displayed as missing, with an explanation.
- Browser and workbook assumption descriptions originate from the same
  metadata.

### Phase 3 — Persistent scenario manager

Objective: let users build and compare coherent cases without losing edits.

Reference:
[Wall Street Prep scenario analysis](https://www.wallstreetprep.com/knowledge/financial-modeling-techniques-selecting-operating-and-financing-scenarios/).

Implementation tasks:

1. Implement the scenario state contract in Section 6.2.
2. Replace `applyScenario(defaultAssumptions(...), scenario)` on every scenario
   click. Use it only to initialize each scenario once.
3. Allow each driver to carry Downside, Base, Upside, and Custom values.
4. Add a scenario manager table with drivers as rows and scenarios as columns.
5. Start with these scenario drivers:
   - revenue growth;
   - gross and operating margin;
   - DSO and inventory days;
   - CapEx and depreciation;
   - tax;
   - debt repayment;
   - WACC components; and
   - terminal growth.
6. Show scenario outputs side by side:
   - revenue;
   - EBITDA or EBIT;
   - net income;
   - ending cash;
   - debt;
   - unlevered free cash flow;
   - implied share price; and
   - balance-check status.
7. Clearly state that a scenario changes several assumptions together, unlike a
   sensitivity that isolates one or two variables.
8. Add Reset active case and Reset all cases actions with confirmation.

Acceptance criteria:

- Editing Upside, switching to Downside, and returning to Upside preserves the
  Upside edit.
- Scenario output columns are calculated independently from the correct values.
- Every scenario still runs model integrity checks.
- Base reproduces the original default model.
- No scenario interaction mutates filing data or peer data.

Required tests:

- Scenario initialization is deterministic.
- Scenario edits are isolated by case.
- Switching cases preserves edits.
- Each case produces a tied balance sheet under valid assumptions.

### Phase 4 — Sensitivity analysis and goal seek

Objective: teach ranges of outcomes instead of presenting one false-precision
answer.

Reference:
[Wall Street Prep sensitivity analysis](https://www.wallstreetprep.com/knowledge/financial-modeling-techniques-sensitivity-what-if-analysis-2/).

Implementation tasks:

1. Generalize the existing DCF sensitivity code to the specification in
   Section 6.4 while preserving its current output.
2. Add presets:
   - DCF: WACC × terminal growth → implied share price;
   - operations: revenue growth × EBIT margin → net income;
   - liquidity: revenue growth × DSO → ending cash; and
   - comps: selected multiple × forecast metric → implied share price.
3. Let the user choose row input, column input, output, range, and step from
   valid options.
4. Mark the active-case cell and apply an accessible heatmap with numeric
   values.
5. Display a sentence interpreting directionality, such as “Higher WACC lowers
   implied value.”
6. Sanity-check monotonic presets and warn when results behave unexpectedly.
7. Add one-variable goal seek:
   - choose a target output;
   - enter a target value;
   - choose one editable input;
   - respect the input's minimum and maximum;
   - report the solved value or explain that the target is unreachable.
8. Use a deterministic bounded solver such as bisection only when the selected
   relationship is monotonic over the allowed range. Do not silently return a
   misleading result for a non-monotonic relationship.
9. Defer multi-input constrained Solver until Phase 9.

Acceptance criteria:

- The center DCF sensitivity cell equals the active DCF result.
- Running a sensitivity does not modify active assumptions.
- Increasing WACC lowers DCF value when other values are fixed.
- A user can explain the row input, column input, and measured output from the
  labels alone.
- Goal seek reports both solved and unreachable states.

Required tests:

- Preserve existing DCF sensitivity center-cell and monotonicity tests.
- Test generic matrix construction and non-mutation.
- Test goal-seek convergence, bounds, and unreachable targets.

### Phase 5 — Excel teaching and scenario parity

Objective: ensure the downloaded workbook remains trustworthy and explains the
same model as the browser.

Implementation tasks:

1. Add or expand a `Read Me`/Cover section containing:
   - purpose and principal output;
   - build order;
   - sheet map;
   - color legend;
   - statement handoffs;
   - scenario versus sensitivity explanation; and
   - integrity checks.
2. Add scenario blocks to the Assumptions sheet:
   - one column per scenario;
   - a validated scenario selector;
   - an active-value column used by downstream formulas.
3. Use `INDEX` or `CHOOSE` for active scenario values. Avoid volatile `OFFSET`
   unless compatibility testing demonstrates a specific need.
4. Keep every scenario hard-code blue and every formula black or green according
   to existing conventions.
5. Preserve the current formula-driven DCF sensitivity matrix. Do not replace it
   with an Excel Data Table, because deterministic formulas are easier to test
   and more portable to Numbers and Sheets.
6. Add an explanation of how the matrix corresponds to Excel's What-If Analysis
   Data Table:
   - link the top-left result;
   - list one input across columns;
   - list the other input down rows;
   - identify row and column input cells; and
   - sanity-check direction.
7. Add Checks rows for scenario selector validity and scenario balance ties.
8. If browser scenarios are included in a download, write all scenario values
   into the workbook and select the currently active case.

Acceptance criteria:

- Changing the scenario selector in Excel updates statements, DCF, checks, and
  relevant outputs.
- Inputs remain isolated on the Assumptions sheet.
- Existing sheet formulas remain live.
- Workbook opens in Excel, Numbers, and Google Sheets without `undefined`,
  `NaN`, macros, or iterative calculation.
- Existing workbook style and formula tests pass, with new assertions for
  scenario wiring.

### Phase 6 — Single-unit and portfolio economics

Objective: turn the existing lemonade exercise into a reusable Single Unit P&L
framework while preserving the simple learning example.

Add an exercise choice named `Single-unit economics`. Let the user begin with a
simple example or a blank template.

Required workbook/browser sections:

1. Unit assumptions
2. Revenue build
3. Unit P&L
4. Unit cash flow
5. Opening investment
6. Cohort/location rollout
7. Portfolio consolidation
8. Returns
9. Scenarios and sensitivity
10. Checks

Minimum drivers:

- capacity;
- utilization;
- customers or transactions;
- core price;
- product mix;
- memberships/subscriptions;
- advertising, licensing, concessions, services, or other secondary revenue;
- variable cost per transaction;
- staffing and labor thresholds;
- rent and occupancy;
- royalties or revenue share;
- local and central marketing;
- allocated overhead;
- opening costs;
- maintenance CapEx;
- ramp time; and
- cannibalization between units.

Required outputs:

- revenue by stream;
- contribution margin;
- unit EBITDA;
- unit cash flow;
- breakeven volume and utilization;
- mature-unit economics;
- cash-on-cash return;
- unit IRR and NPV;
- payback period; and
- portfolio peak funding requirement.

Modeling rules:

- Separate one-time opening costs from recurring costs.
- Keep unit economics visible before portfolio aggregation.
- Model rollout by opening cohort so units can ramp independently.
- Do not hide central overhead allocation inside a unit-level variable cost.

Acceptance criteria:

- One unit can be evaluated without enabling a portfolio rollout.
- Adding a unit cohort updates consolidated cash needs and returns.
- Secondary revenue streams are separately visible and can be disabled.
- Unit and portfolio cash flows reconcile.
- Base/Upside/Downside cases and sensitivities use shared infrastructure.

### Phase 7 — Capital-intensive project model

Objective: model construction, financing, operation, and long recoupment cycles.

Add an exercise named `Capital project`.

Required workbook/browser sections:

1. Assumptions
2. Construction schedule
3. Sources and uses
4. Operating forecast
5. Working capital
6. Debt and interest schedule
7. Fixed assets and depreciation
8. Integrated three statements
9. Recoupment waterfall
10. Project returns
11. Scenarios and sensitivity
12. Checks

Minimum drivers:

- construction phases and milestones;
- spend by phase;
- delay and cost-overrun assumptions;
- initial and maintenance CapEx;
- capacity and utilization ramp;
- price, volume, and inflation;
- fixed and variable operating costs;
- debt/equity funding mix;
- drawdown timing;
- interest, fees, amortization, and maturity;
- tax and incentives;
- revenue share or recoupment priority; and
- terminal or exit value.

Required outputs:

- unlevered project IRR;
- levered equity IRR;
- NPV at a selected hurdle rate;
- payback and recoupment dates;
- peak funding requirement;
- minimum cash balance;
- DSCR and interest coverage;
- debt repayment profile;
- terminal-value share of NPV; and
- downside liquidity requirement.

Implementation rules:

- Construction delays must shift related CapEx, funding, depreciation, and
  operating start dates.
- Capitalized interest must be explicit if supported; never mix it invisibly
  with operating interest.
- Separate project and equity cash flows so their IRRs cannot be confused.
- XIRR-style dated returns may be added only with deterministic date handling
  and tests.

Acceptance criteria:

- Sources equal uses.
- Debt opening + draws − repayments equals closing debt.
- Fixed assets roll forward from opening balance, CapEx, and depreciation.
- Project and equity returns reconcile to their respective cash-flow series.
- Delay and cost-overrun cases update funding needs and returns.

### Phase 8 — Strategic investment and market entry

Objective: compare strategic alternatives and regional roadmaps using consistent
economics.

#### Strategic-investment appraisal

Required alternatives:

- build;
- buy;
- partner or joint venture;
- license;
- lease;
- delay; and
- do nothing.

Required outputs:

- incremental NPV and IRR;
- economic profit;
- capital at risk;
- time to cash breakeven;
- downside loss;
- probability-weighted expected value; and
- qualitative strategic score displayed separately from financial return.

Do not add qualitative scores to NPV as if they shared a financial unit.

#### Market-entry analysis

Required regional drivers:

- addressable market and growth;
- price and demand elasticity;
- labor, rent, utilities, and logistics;
- inflation and foreign exchange;
- corporate tax, withholding, tariffs, and incentives;
- localization and regulatory costs;
- partner economics;
- rollout timing;
- capacity and ramp-up; and
- country risk premium.

Required commercial structures:

- wholly owned;
- franchise;
- licensing;
- joint venture;
- distributor; and
- revenue share.

Required outputs:

- market and structure-level NPV and IRR;
- required investment;
- breakeven year;
- risk-adjusted return;
- currency and inflation exposure;
- preferred entry structure; and
- recommended rollout sequence.

Acceptance criteria:

- Common assumptions are shared; alternative-specific assumptions remain
  isolated.
- “Do nothing” provides an explicit baseline for incremental results.
- Currency conversion identifies local and reporting currencies.
- Regional rankings expose their financial and qualitative components.
- Probability weights must sum to 100% before an expected value is trusted.

### Phase 9 — Advanced schedules and optimization

Objective: support sophisticated variables without making the default experience
harder to understand.

#### Negative working capital

Model receivables, inventory, payables, and deferred revenue separately using
days or turnover assumptions. Explain that customer cash received before
supplier payment can create a source of cash. Do not force working capital to be
a positive percentage of revenue.

#### Lease capitalization

Add a dedicated schedule containing:

- opening lease liability;
- new leases;
- interest;
- cash payments;
- principal reduction;
- closing lease liability;
- right-of-use asset additions;
- amortization or depreciation; and
- closing right-of-use asset.

Keep reported-accounting treatment separate from valuation adjustments. Prevent
double counting when leases are treated as debt and rent is adjusted in EBITDA.

#### Multi-input optimization

Only after one-variable goal seek is stable, add a Solver-style tool:

- selected objective;
- multiple editable inputs;
- lower and upper bounds;
- operating or financing constraints; and
- clear convergence/failure result.

Do not claim a global optimum unless the algorithm can establish one. Label a
local or approximate solution accurately.

Acceptance criteria:

- Working-capital components reconcile to operating cash flow.
- Lease assets and liabilities roll forward independently and tie.
- Lease-adjusted valuation explains every adjustment.
- Optimizer honors every stated constraint and reports failure explicitly.

## 8. Decision dashboards

Every advanced template must end with a one-page decision view showing:

- model purpose and selected case;
- principal recommendation;
- IRR, NPV, payback, and peak funding as applicable;
- scenario range;
- top five value drivers;
- key assumptions and sources;
- principal risks;
- failed checks;
- next decision or required approval; and
- date or filing period of the underlying data.

Keep the dashboard concise. It is a summary of the model, not a replacement for
its schedules.

## 9. Shared helpers to prefer

Before duplicating logic, look for or create focused browser-safe helpers for:

- assumption metadata and formatting;
- build checklists;
- source/provenance badges;
- dependency tracing;
- scenario initialization and selection;
- sensitivity matrices;
- bounded goal seek;
- period and date columns;
- rollout/ramp curves;
- working-capital schedules;
- fixed-asset corkscrews;
- debt corkscrews;
- lease schedules;
- IRR, XIRR, NPV, and payback;
- integrity checks; and
- workbook section generation.

Financial logic must live in engines or schedule helpers, not DOM render
functions. Rendering helpers must not become an independent source of formulas.

## 10. Testing and release gate for every phase

Before considering any phase complete:

1. Commit the implementation before testing, in accordance with the repository
   workflow.
2. Run the five existing tests listed in Section 3.
3. Add pure-function tests for every new calculation or state transition.
4. Compare representative browser results with workbook cached values/formulas.
5. Verify missing values remain blank rather than zero.
6. Verify all enabled scenarios and model templates pass their integrity checks.
7. Test desktop and mobile browser flows.
8. Generate and open at least one workbook for each affected exercise.
9. Confirm formulas, sheet links, color conventions, and download names.
10. Update `README.md`, `CURSOR.md` if it exists, and `AGENTS.md` only when an
    enduring architectural or operational fact has changed. Do not record
    branch-specific progress in those files.

## 11. Explicit non-goals

- Do not replace the deterministic workbook generator with a new spreadsheet
  library solely for convenience.
- Do not introduce live external APIs unless a model cannot function without
  them and a separate design approves the data source and failure behavior.
- Do not auto-select trading peers and imply that the selection is authoritative.
- Do not present a single valuation as certain.
- Do not merge strategic qualitative scores into financial returns.
- Do not expose every advanced schedule in the beginner default view.
- Do not build all templates in one change. Each phase must remain reviewable
  and independently tested.

## 12. Source material reflected in this plan

- [Wall Street Prep: Selecting operating and financing scenarios](https://www.wallstreetprep.com/knowledge/financial-modeling-techniques-selecting-operating-and-financing-scenarios/)
- [Wall Street Prep: Sensitivity / what-if analysis](https://www.wallstreetprep.com/knowledge/financial-modeling-techniques-sensitivity-what-if-analysis-2/)
- User-provided training transcripts covering:
  - Goal Seek and constrained Solver;
  - one- and two-variable sensitivity tables;
  - Base/Upside/Downside scenario selection;
  - free cash flow;
  - CAPM and WACC;
  - terminal value;
  - discounting;
  - enterprise-to-equity value;
  - implied share price; and
  - DCF sensitivity to WACC and terminal growth.

