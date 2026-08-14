/**
 * Generic two-variable sensitivity matrices and one-variable goal seek.
 * Clones assumptions per cell — never mutates the active scenario.
 */
import { runThreeStatement, runDcf, dcfSensitivity, WACC_STEPS, GROWTH_STEPS } from './engine.js';
import { runSingleUnitPortfolio } from './unit-portfolio.js';

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function linspace(base, steps, { min = -Infinity, max = Infinity } = {}) {
  return steps.map((d) => clamp(base + d, min, max));
}

export const SENSITIVITY_PRESETS = {
  dcfWaccGrowth: {
    id: 'dcfWaccGrowth',
    label: 'WACC × terminal growth → implied share price',
    rowInput: 'waccOffset',
    columnInput: 'terminalGrowth',
    output: 'impliedPrice',
    rowSteps: WACC_STEPS,
    colSteps: GROWTH_STEPS,
    monotonic: { row: -1, col: 1 },
    interpret: 'Higher WACC lowers implied value; higher terminal growth raises it.',
  },
  opsGrowthMargin: {
    id: 'opsGrowthMargin',
    label: 'Revenue growth × EBIT margin → net income',
    rowInput: 'revenueGrowth',
    columnInput: 'ebitMargin',
    output: 'netIncome',
    rowSteps: [-0.03, -0.015, 0, 0.015, 0.03],
    colSteps: [-0.03, -0.015, 0, 0.015, 0.03],
    monotonic: { row: 1, col: 1 },
    interpret: 'Higher sales growth and wider margins raise net income.',
  },
  liquidityGrowthDso: {
    id: 'liquidityGrowthDso',
    label: 'Revenue growth × DSO → ending cash',
    rowInput: 'revenueGrowth',
    columnInput: 'dsoDays',
    output: 'endingCash',
    rowSteps: [-0.03, -0.015, 0, 0.015, 0.03],
    colSteps: [-15, -7, 0, 7, 15],
    monotonic: { row: null, col: -1 },
    interpret: 'Longer days to get paid usually lowers ending cash.',
  },
  compsMultiple: {
    id: 'compsMultiple',
    label: 'Peer EV/Revenue multiple → implied share price',
    rowInput: 'compsMultiple',
    columnInput: 'compsMultiple',
    output: 'compsImpliedPrice',
    rowSteps: [-0.5, -0.25, 0, 0.25, 0.5],
    colSteps: null,
    oneWay: true,
    interpret: 'A higher peer multiple implies a higher share price.',
  },
  unitPriceUtil: {
    id: 'unitPriceUtil',
    label: 'Core price × utilization → unit EBITDA (Y1)',
    rowInput: 'corePrice',
    columnInput: 'utilization',
    output: 'unitEbitda',
    rowSteps: [-0.5, -0.25, 0, 0.25, 0.5],
    colSteps: [-0.1, -0.05, 0, 0.05, 0.1],
    monotonic: { row: 1, col: 1 },
    interpret: 'Higher price and utilization raise first-year EBITDA.',
  },
};

const INPUT_BOUNDS = {
  revenueGrowth: { min: -0.2, max: 0.4 },
  ebitMargin: { min: -0.2, max: 0.7 },
  terminalGrowth: { min: 0, max: 0.05 },
  dsoDays: { min: 0, max: 240 },
  riskFreeRate: { min: 0, max: 0.1 },
  corePrice: { min: 0.5, max: 500 },
  utilization: { min: 0, max: 1 },
};

export function evaluateSensitivityOutput(outputKey, ctx) {
  const { model, dcf, comps, assumptions, shares, price, headlines, peers, waccOffset = 0 } = ctx;
  if (outputKey === 'impliedPrice') {
    if (waccOffset !== 0 && dcf?.ok) {
      const patched = { ...assumptions };
      const m = runThreeStatement(headlines, patched);
      if (!m.ok) return null;
      const wacc = dcf.wacc.wacc + waccOffset;
      const g = patched.terminalGrowth;
      if (!(wacc > g)) return null;
      const d = runDcf(m, { price, shares });
      if (!d.ok) return null;
      const netDebt = m.rows[0].debt - m.rows[0].cash;
      const valued = discountedPatch(m, wacc, g);
      if (!valued) return null;
      const equity = valued - netDebt;
      return finite(shares) && shares > 0 ? equity / shares : equity;
    }
    return dcf?.impliedPrice ?? null;
  }
  if (outputKey === 'netIncome') {
    const m = model?.ok ? model : null;
    return m?.rows?.find((r) => r.offset === 1)?.netIncome ?? null;
  }
  if (outputKey === 'endingCash') {
    const m = model?.ok ? model : null;
    return m?.rows?.find((r) => r.offset === 1)?.cash ?? null;
  }
  if (outputKey === 'compsImpliedPrice') {
    return comps?.implied?.[0]?.pricePerShare ?? null;
  }
  if (outputKey === 'unitEbitda') {
    const m = model?.ok ? model : null;
    return m?.rows?.[0]?.ebitda ?? m?.unitYears?.[0]?.ebitda ?? null;
  }
  return null;
}

function discountedPatch(model, wacc, terminalGrowth) {
  const rows = model.rows;
  let pvExplicit = 0;
  let lastFcf = null;
  let lastDf = null;
  for (const r of rows) {
    if (r.offset === 0) continue;
    const df = 1 / (1 + wacc) ** r.offset;
    pvExplicit += r.unleveredFcf * df;
    lastFcf = r.unleveredFcf;
    lastDf = df;
  }
  if (!finite(lastFcf) || !(wacc > terminalGrowth)) return null;
  const terminalValue = (lastFcf * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  return pvExplicit + terminalValue * lastDf;
}

/** Build matrix without mutating base assumptions. */
export function runSensitivityMatrix(spec, baseContext, { runModel } = {}) {
  const preset = typeof spec === 'string' ? SENSITIVITY_PRESETS[spec] : spec;
  if (!preset) return null;

  if (preset.id === 'dcfWaccGrowth' && baseContext.dcf?.ok) {
    const sens = dcfSensitivity(baseContext.model, baseContext.dcf, { shares: baseContext.shares });
    if (!sens) return null;
    return {
      ...preset,
      rowLabel: 'WACC',
      colLabel: 'Terminal growth',
      rowValues: sens.rows.map((r) => r.wacc),
      colValues: sens.growths,
      rows: sens.rows.map((r) => ({ rowValue: r.wacc, cells: r.cells })),
      baseRowIndex: 2,
      baseColIndex: 2,
      unit: sens.unit,
      centerValue: baseContext.dcf.impliedPrice,
    };
  }

  const assumptions = baseContext.assumptions;
  const rowBase = preset.rowInput === 'waccOffset' ? 0 : assumptions[preset.rowInput];
  const colBase = assumptions[preset.columnInput];
  if (rowBase == null && preset.rowInput !== 'compsMultiple') return null;
  if (colBase == null && preset.columnInput !== 'compsMultiple') return null;

  const rowBounds = INPUT_BOUNDS[preset.rowInput] || { min: -Infinity, max: Infinity };
  const colBounds = INPUT_BOUNDS[preset.columnInput] || { min: -Infinity, max: Infinity };
  const rowValues = linspace(rowBase ?? 0, preset.rowSteps, rowBounds);
  const colValues = linspace(colBase ?? 0, preset.colSteps || [0], colBounds);

  const runner =
    runModel ||
    ((patch) => {
      const m = runThreeStatement(baseContext.headlines, patch);
      if (!m.ok) return { model: m, dcf: null };
      const dcf = runDcf(m, { price: baseContext.price, shares: baseContext.shares });
      return { model: m, dcf, comps: baseContext.comps };
    });

  const rows = rowValues.map((rv) => {
    const cells = colValues.map((cv) => {
      const patch = { ...assumptions, [preset.rowInput]: rv, [preset.columnInput]: cv };
      const run = runner(patch);
      return evaluateSensitivityOutput(preset.output, { ...baseContext, ...run, assumptions: patch });
    });
    return { rowValue: rv, cells };
  });

  const baseRowIndex = rowValues.findIndex((v) => Math.abs(v - rowBase) < 1e-9);
  const baseColIndex = colValues.findIndex((v) => Math.abs(v - colBase) < 1e-9);
  const centerValue =
    baseRowIndex >= 0 && baseColIndex >= 0 ? rows[baseRowIndex]?.cells[baseColIndex] : null;

  return {
    ...preset,
    rowLabel: preset.rowInput,
    colLabel: preset.columnInput,
    rowValues,
    colValues,
    rows,
    baseRowIndex: baseRowIndex >= 0 ? baseRowIndex : Math.floor(rowValues.length / 2),
    baseColIndex: baseColIndex >= 0 ? baseColIndex : Math.floor(colValues.length / 2),
    centerValue,
    unit: preset.output === 'impliedPrice' || preset.output === 'compsImpliedPrice' ? 'price' : 'millions',
  };
}

export function checkMonotonicity(matrix) {
  if (!matrix?.monotonic || !matrix.rows?.length) return { ok: true };
  const { row: rowSign, col: colSign } = matrix.monotonic;
  const warnings = [];
  const ri = matrix.baseRowIndex ?? Math.floor(matrix.rows.length / 2);
  const ci = matrix.baseColIndex ?? Math.floor(matrix.rows[0]?.cells.length / 2);
  const mid = matrix.rows[ri]?.cells[ci];

  if (rowSign && matrix.rows.length >= 2) {
    const low = matrix.rows[0]?.cells[ci];
    const high = matrix.rows[matrix.rows.length - 1]?.cells[ci];
    if (finite(low) && finite(high) && finite(mid) && rowSign * (high - low) < 0) {
      warnings.push('Row input moves opposite to the expected direction.');
    }
  }
  if (colSign && matrix.rows[ri]?.cells?.length >= 2) {
    const low = matrix.rows[ri].cells[0];
    const high = matrix.rows[ri].cells[matrix.rows[ri].cells.length - 1];
    if (finite(low) && finite(high) && finite(mid) && colSign * (high - low) < 0) {
      warnings.push('Column input moves opposite to the expected direction.');
    }
  }
  return { ok: warnings.length === 0, warnings };
}

/**
 * Deterministic bisection goal seek when relationship is monotonic over range.
 * Returns { ok, solved, unreachable, reason }.
 */
export function goalSeek({
  targetOutput,
  targetValue,
  inputKey,
  assumptions,
  evaluate,
  min,
  max,
  monotonic = 1,
  tolerance = 1e-4,
  maxIter = 48,
}) {
  if (!finite(targetValue)) return { ok: false, unreachable: true, reason: 'Target must be a number.' };
  const lo = min;
  const hi = max;
  const f = (x) => {
    const patch = { ...assumptions, [inputKey]: x };
    const y = evaluate(patch);
    return finite(y) ? y - targetValue : null;
  };
  const flo = f(lo);
  const fhi = f(hi);
  if (!finite(flo) || !finite(fhi)) {
    return { ok: false, unreachable: true, reason: 'Output is missing at the range bounds.' };
  }
  if (flo * fhi > 0) {
    return { ok: false, unreachable: true, reason: 'Target is not bracketed between min and max — try a wider range or different input.' };
  }
  let a = lo;
  let b = hi;
  let fa = flo;
  for (let i = 0; i < maxIter; i++) {
    const mid = (a + b) / 2;
    const fm = f(mid);
    if (!finite(fm)) return { ok: false, unreachable: true, reason: 'Output became invalid while searching.' };
    if (Math.abs(fm) < tolerance || Math.abs(b - a) < tolerance) {
      return { ok: true, solved: mid, unreachable: false };
    }
    if (fa * fm <= 0) {
      b = mid;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return { ok: true, solved: (a + b) / 2, unreachable: false, approximate: true };
}

export { WACC_STEPS, GROWTH_STEPS };

/**
 * Coordinate search for multi-input optimization (Phase 9). Reports local optimum only.
 */
export function multiInputOptimize({
  objective,
  inputs,
  assumptions,
  evaluate,
  constraints = [],
  steps = 8,
  tolerance = 1e-3,
}) {
  if (!inputs?.length || typeof evaluate !== 'function') {
    return { ok: false, reason: 'Missing inputs or evaluate function.' };
  }

  const clampInput = (spec, v) => Math.min(spec.max, Math.max(spec.min, v));
  let best = { value: -Infinity, patch: { ...assumptions }, feasible: false };

  const grid = (depth, patch) => {
    if (depth >= inputs.length) {
      for (const c of constraints) {
        const v = c.check(patch);
        if (!v.ok) return;
      }
      const score = evaluate(patch, objective);
      if (score != null && score > best.value) {
        best = { value: score, patch: { ...patch }, feasible: true };
      }
      return;
    }
    const spec = inputs[depth];
    const base = patch[spec.key] ?? assumptions[spec.key] ?? (spec.min + spec.max) / 2;
    const deltas = Array.from({ length: steps }, (_, i) => spec.min + ((spec.max - spec.min) * i) / (steps - 1));
    for (const d of deltas) {
      const v = clampInput(spec, Number.isFinite(d) ? d : base);
      grid(depth + 1, { ...patch, [spec.key]: v });
    }
  };

  grid(0, { ...assumptions });

  if (!best.feasible) {
    return { ok: false, reason: 'No feasible solution found within bounds and constraints.' };
  }
  return {
    ok: true,
    objective,
    value: best.value,
    solution: best.patch,
    localOptimum: true,
    approximate: true,
  };
}
