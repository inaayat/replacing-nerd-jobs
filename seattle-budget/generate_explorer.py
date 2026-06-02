"""
Generates budget-explorer.html from:
  - City_of_Seattle_Operating_Budget_20260602.csv  (2026 rows)
  - seattle_budget_by_program.xlsx                 (program descriptions / FTEs)
"""

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

try:
    import openpyxl
except ImportError:
    import subprocess, sys
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'openpyxl', '-q'])
    import openpyxl

HERE = Path(__file__).parent
CSV_PATH  = Path.home() / 'Downloads/seattle-data/City_of_Seattle_Operating_Budget_20260602.csv'
XLSX_PATH = HERE / 'seattle_budget_by_program.xlsx'
OUT_PATH  = HERE / 'budget-explorer.html'

SERVICE_COLORS = {
    'Administration':                          ('#d4e4c8', '#6a9e5a'),
    'Arts, Culture & Recreation':              ('#f5d8e8', '#c07aa8'),
    'Education & Human Services':              ('#c9dae1', '#5a8a9e'),
    'Livable & Inclusive Communities':         ('#f0e8c0', '#a89030'),
    'Public Safety':                           ('#e8cccc', '#b05858'),
    'Utilities, Transportation & Environment': ('#c8e0d4', '#5a9e7a'),
}

# ── 1. Load Excel enrichment ──────────────────────────────────────────────────
enrichment = {}   # (dept_lower, prog_lower) -> dict
wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
ws = wb['Programs']
cols = [c.value for c in next(ws.rows)]
ci = {c: i for i, c in enumerate(cols) if c}

for row in ws.iter_rows(min_row=2):
    def g(col):
        return row[ci[col]].value if col in ci else None
    dept = g('Department (CSV)') or ''
    prog = g('Program') or ''
    key  = (dept.strip().lower(), prog.strip().lower())
    enrichment[key] = {
        'description': (g('Program Description') or '').strip(),
        'bsl':         (g('Budget Summary Level') or '').strip(),
        'bslDesc':     (g('BSL Description') or '').strip(),
        'ftes':        g('2026 Adopted FTEs'),
        'act2024':     g('2024 Actuals $ (PDF)'),
        'adp2025':     g('2025 Adopted $ (PDF)'),
    }
wb.close()
print(f'Loaded {len(enrichment)} Excel enrichment records')

# ── 2. Load CSV ───────────────────────────────────────────────────────────────
# Keys: (service, dept, program, fund, fund_type, is_gf, is_labor)
# Values: dollar amount
totals = defaultdict(float)
all_funds_by_prog = defaultdict(set)   # (service,dept,prog) -> set of fund names

with open(CSV_PATH, encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['Fiscal Year'] != '2026':
            continue
        svc   = row['Service'].strip()
        dept  = row['Department'].strip()
        prog  = row['Program'].strip()
        fund  = row['Fund'].strip()
        ftype = row['Fund Type'].strip()
        desc  = row['Description'].strip().lower()
        is_labor = 'non' not in desc   # "Labor" vs "Non-Labor"
        is_gf    = 'general fund' in fund.lower()
        try:
            amt = float(row['Approved Amount'].replace(',', '').replace('"', '').strip())
        except ValueError:
            amt = 0.0

        key = (svc, dept, prog, fund, ftype, is_gf, is_labor)
        totals[key] += amt
        all_funds_by_prog[(svc, dept, prog)].add(fund)

print(f'Loaded {len(totals)} CSV aggregation keys')

# ── 3. Build hierarchy ────────────────────────────────────────────────────────
# Aggregate to (service, dept, prog) -> {total, labor, nonlabor, gf_total, gf_labor, gf_nonlabor}
prog_agg = defaultdict(lambda: {'total':0,'labor':0,'nonlabor':0,'gf_total':0,'gf_labor':0,'gf_nonlabor':0})

for (svc, dept, prog, fund, ftype, is_gf, is_labor), amt in totals.items():
    k = (svc, dept, prog)
    prog_agg[k]['total'] += amt
    if is_labor:
        prog_agg[k]['labor'] += amt
    else:
        prog_agg[k]['nonlabor'] += amt
    if is_gf:
        prog_agg[k]['gf_total'] += amt
        if is_labor:
            prog_agg[k]['gf_labor'] += amt
        else:
            prog_agg[k]['gf_nonlabor'] += amt

# Build nested structure
services_map = {}  # service -> dept -> prog -> data

for (svc, dept, prog), agg in prog_agg.items():
    if svc not in services_map:
        services_map[svc] = {}
    if dept not in services_map[svc]:
        services_map[svc][dept] = {}
    funds_list = sorted(all_funds_by_prog[(svc, dept, prog)])
    enr = enrichment.get((dept.lower(), prog.lower()), {})
    services_map[svc][dept][prog] = {
        'total':      round(agg['total']),
        'labor':      round(agg['labor']),
        'nonlabor':   round(agg['nonlabor']),
        'gf_total':   round(agg['gf_total']),
        'gf_labor':   round(agg['gf_labor']),
        'gf_nonlabor':round(agg['gf_nonlabor']),
        'funds':      funds_list,
        'description': enr.get('description', ''),
        'bsl':         enr.get('bsl', ''),
        'bslDesc':     enr.get('bslDesc', ''),
        'ftes':        enr.get('ftes'),
        'act2024':     enr.get('act2024'),
        'adp2025':     enr.get('adp2025'),
    }

# Serialize to list-of-dicts for JSON
services_list = []
grand_total = 0

for svc_name in sorted(services_map.keys()):
    color, dot = SERVICE_COLORS.get(svc_name, ('#e8e0c0', '#595b4a'))
    depts_list = []
    svc_total = 0

    for dept_name in sorted(services_map[svc_name].keys()):
        progs_list = []
        dept_total = 0

        for prog_name, pdata in sorted(
            services_map[svc_name][dept_name].items(),
            key=lambda x: -x[1]['total']
        ):
            progs_list.append({'name': prog_name, **pdata})
            dept_total += pdata['total']

        depts_list.append({'name': dept_name, 'total': dept_total, 'programs': progs_list})
        svc_total += dept_total

    depts_list.sort(key=lambda d: -d['total'])
    services_list.append({
        'name': svc_name, 'total': svc_total, 'color': color, 'dot': dot,
        'departments': depts_list,
    })
    grand_total += svc_total

services_list.sort(key=lambda s: -s['total'])

DATA = {'total': round(grand_total), 'services': services_list}
data_json = json.dumps(DATA, separators=(',', ':'))

dept_count = sum(len(s['departments']) for s in services_list)
prog_count = sum(len(d['programs']) for s in services_list for d in s['departments'])
print(f'Grand total: ${grand_total:,.0f}')
print(f'Services: {len(services_list)}, Depts: {dept_count}, Programs: {prog_count}')

# ── 4. Generate HTML ──────────────────────────────────────────────────────────
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>2026 Seattle Budget Explorer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../site.css">
<style>
/* ── Layout (overrides site.css .main which has max-width/margin:auto) ── */
.page-layout {{ display: flex; align-items: flex-start; }}
.page-layout .main {{ flex: 1; min-width: 0; max-width: none; margin: 0; }}

/* ── Sidebar (matches index.html) ── */
.sidebar {{
  width: 210px; flex-shrink: 0;
  border-right: var(--border);
  position: sticky; top: 0;
  height: 100vh; overflow-y: auto;
}}
.sidebar-block {{
  padding: 16px;
  border-bottom: var(--border);
}}
.sidebar-block .section-label {{ margin-bottom: 10px; }}
.sidebar-links {{
  display: flex; flex-direction: column; gap: 10px;
}}
.sidebar-links a,
.sidebar-links label {{
  font-size: 0.65rem; color: var(--mid);
  text-decoration: none; line-height: 1.4;
  cursor: pointer; display: flex; align-items: center; gap: 6px;
}}
.sidebar-links a:hover,
.sidebar-links label:hover {{ color: var(--ink); text-decoration: underline; }}
.sidebar-links input[type="radio"] {{
  accent-color: var(--ink); cursor: pointer; margin: 0; flex-shrink: 0;
}}
@media (max-width: 768px) {{
  .page-layout {{ flex-direction: column; }}
  .sidebar {{ width: 100%; height: auto; position: static; border-right: none; border-bottom: var(--border); }}
}}

/* ── Explorer-specific overrides ── */
.main {{ padding: 14px 20px 24px; }}

.page-header {{
  display: flex; align-items: baseline; gap: 16px;
  margin-bottom: 10px; flex-wrap: wrap;
}}
.page-header h1 {{ font-size: 1.05rem; font-weight: 500; margin: 0; letter-spacing: 0.5px; flex-shrink: 0; }}
.total-banner {{
  font-size: 0.65rem; color: var(--mid); letter-spacing: 1.2px; text-transform: uppercase;
}}
.total-banner strong {{ color: var(--ink); font-size: 0.9rem; letter-spacing: 0; text-transform: none; font-weight: 500; }}

/* ── Four-column explorer ── */
.explorer-grid {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: var(--border);
  margin-bottom: 0;
}}
.explorer-col {{
  border-right: var(--border);
  height: 64vh;
  min-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}}
.explorer-col:last-child {{ border-right: none; }}
.col-header {{
  padding: 10px 14px 6px;
  border-bottom: var(--border);
  position: sticky; top: 0;
  background: var(--bg);
  z-index: 1;
}}
.col-header .section-label {{ margin-bottom: 2px; }}
.col-context {{
  font-size: 0.65rem; color: var(--mid); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; margin-top: 1px;
}}
.col-body {{ flex: 1; overflow-y: auto; padding: 4px 0; }}

/* ── Bar rows ── */
.bar-row {{
  padding: 7px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--faint);
  transition: background 0.1s;
}}
.bar-row:last-child {{ border-bottom: none; }}
.bar-row:hover {{ background: var(--hover); }}
.bar-row.selected {{ background: var(--faint); }}
.bar-row.dimmed {{ opacity: 0.35; }}
.bar-label {{
  display: flex; align-items: center; gap: 6px;
  font-size: 0.72rem; font-weight: 400; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}}
.bar-row.selected .bar-label {{ font-weight: 500; }}
.bar-track {{
  height: 5px; background: var(--faint); border-radius: 3px; overflow: hidden;
}}
.bar-fill {{
  height: 100%; border-radius: 3px;
  transition: width 0.25s ease;
}}
.bar-amount {{
  font-size: 0.63rem; color: var(--mid); margin-top: 3px;
  display: flex; justify-content: space-between;
}}
.bar-pct {{ color: var(--ink); font-weight: 500; }}

/* ── Summary strip above explorer ── */
.summary-strip {{
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  border: var(--border);
  border-bottom: none;
}}
.svc-chip {{
  padding: 8px 10px;
  border-right: var(--border);
  cursor: pointer;
  transition: background 0.1s;
}}
.svc-chip:last-child {{ border-right: none; }}
.svc-chip:hover {{ background: var(--hover); }}
.svc-chip.active {{ background: var(--faint); }}
.svc-chip-name {{ font-size: 0.6rem; color: var(--mid); text-transform: uppercase; letter-spacing: 1px; line-height: 1.3; }}
.svc-chip-amt  {{ font-size: 0.85rem; font-weight: 500; color: var(--ink); margin-top: 2px; }}
.svc-chip-bar  {{ height: 3px; border-radius: 2px; margin-top: 5px; }}

/* ── 4th column: program detail ── */
.detail-section-label {{
  font-size: 0.58rem; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--mid); margin-bottom: 6px;
}}
.detail-prog-name {{
  font-size: 0.82rem; font-weight: 500; color: var(--ink);
  margin-bottom: 2px; line-height: 1.3;
}}
.detail-breadcrumb {{
  font-size: 0.62rem; color: var(--mid); margin-bottom: 12px; line-height: 1.4;
}}
.detail-meta-item {{
  border: 1px solid var(--faint); padding: 7px 10px; margin-bottom: 6px;
}}
.detail-meta-val {{ font-size: 0.85rem; font-weight: 500; color: var(--ink); }}
.detail-meta-key {{ font-size: 0.58rem; color: var(--mid); text-transform: uppercase; letter-spacing: 1px; margin-top: 1px; }}
.detail-desc {{
  font-size: 0.68rem; line-height: 1.65; color: var(--ink); margin-top: 4px;
}}
.detail-desc.empty {{ color: var(--mid); font-style: italic; }}
.detail-bsl {{
  font-size: 0.62rem; color: var(--mid); margin-top: 8px; line-height: 1.5;
}}
.detail-funds {{ font-size: 0.62rem; color: var(--mid); margin-top: 8px; }}
.detail-funds-list {{ margin-top: 3px; }}
.fund-tag {{
  display: inline-block; padding: 2px 6px; margin: 2px 2px 0 0;
  background: var(--faint); font-size: 0.58rem;
}}
.detail-body {{ padding: 12px 14px; }}
.detail-placeholder {{
  display: flex; align-items: center; justify-content: center;
  height: 100%; padding: 20px 14px;
  font-size: 0.68rem; color: var(--mid); font-style: italic;
  text-align: center; line-height: 1.6;
}}

/* ── Labor bar inside detail ── */
.labor-bar-track {{ height: 14px; background: var(--faint); position: relative; border-radius: 2px; overflow: hidden; margin: 4px 0 3px; }}
.labor-bar-fill  {{ height: 100%; background: var(--ink); position: absolute; left: 0; top: 0; transition: width .3s; }}
.labor-bar-labels {{ display: flex; justify-content: space-between; font-size: 0.58rem; color: var(--mid); }}


/* ── No-data state ── */
.empty-state {{
  padding: 24px 14px; color: var(--mid);
  font-size: 0.68rem; text-align: center; font-style: italic;
}}

/* ── Responsive ── */
@media (max-width: 1100px) {{
  .explorer-grid {{ grid-template-columns: repeat(2, 1fr); }}
  .explorer-col  {{ height: 44vh; }}
}}
@media (max-width: 900px) {{
  .summary-strip {{ grid-template-columns: repeat(3,1fr); }}
  .explorer-grid  {{ grid-template-columns: 1fr; }}
  .explorer-col   {{ height: 38vh; border-right: none; border-bottom: var(--border); }}
}}
</style>
</head>
<body>
<div class="page-layout">

<!-- ── Sidebar ── -->
<aside class="sidebar">
  <div class="sidebar-block">
    <div class="section-label">Navigate</div>
    <nav class="sidebar-links">
      <a href="/seattle-budget/">&#8592; Budget Overview</a>
      <a href="/seattle-budget/fund-explorer.html">Fund Explorer &#8594;</a>
    </nav>
  </div>

  <div class="sidebar-block">
    <div class="section-label">Fund</div>
    <nav class="sidebar-links">
      <label><input type="radio" name="fund" value="all" checked> All funds</label>
      <label><input type="radio" name="fund" value="gf"> General Fund only</label>
    </nav>
  </div>

  <div class="sidebar-block">
    <div class="section-label">Spending</div>
    <nav class="sidebar-links">
      <label><input type="radio" name="labor" value="all" checked> Total</label>
      <label><input type="radio" name="labor" value="labor"> Labor only</label>
      <label><input type="radio" name="labor" value="nonlabor"> Non-labor only</label>
    </nav>
  </div>
</aside>

<!-- ── Main ── -->
<div class="main">

  <div class="page-header">
    <h1>2026 Seattle Operating Budget</h1>
    <div class="total-banner" id="totalBanner"></div>
  </div>

  <!-- Summary strip -->
  <div class="summary-strip" id="summaryStrip"></div>

  <!-- Four-column explorer -->
  <div class="explorer-grid">
    <div class="explorer-col" id="colService">
      <div class="col-header">
        <div class="section-label">Service Area</div>
        <div class="col-context" id="ctxService">All services</div>
      </div>
      <div class="col-body" id="bodyService"></div>
    </div>
    <div class="explorer-col" id="colDept">
      <div class="col-header">
        <div class="section-label">Department</div>
        <div class="col-context" id="ctxDept">All departments</div>
      </div>
      <div class="col-body" id="bodyDept"></div>
    </div>
    <div class="explorer-col" id="colProg">
      <div class="col-header">
        <div class="section-label">Program</div>
        <div class="col-context" id="ctxProg">All programs</div>
      </div>
      <div class="col-body" id="bodyProg"></div>
    </div>
    <div class="explorer-col" id="colDetail">
      <div class="col-header">
        <div class="section-label">Program Detail</div>
        <div class="col-context" id="ctxDetail">&nbsp;</div>
      </div>
      <div class="col-body" id="bodyDetail">
        <div class="detail-placeholder">Select a program to see its budget details and description.</div>
      </div>
    </div>
  </div>

</div><!-- /main -->
</div><!-- /page-layout -->

<script>
const DATA = {data_json};

// ── State ────────────────────────────────────────────────────────────────────
let state = {{ fundFilter: 'all', laborFilter: 'all', selService: null, selDept: null }};

// ── Helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = n => n == null ? '—' : (Math.abs(n) >= 1e9
  ? '$' + (n/1e9).toFixed(2) + 'B'
  : Math.abs(n) >= 1e6
  ? '$' + (n/1e6).toFixed(1) + 'M'
  : '$' + n.toLocaleString());

function getValue(obj) {{
  const base = state.fundFilter === 'gf' ? 'gf_' : '';
  if (state.laborFilter === 'labor')    return obj[base + 'labor']    ?? 0;
  if (state.laborFilter === 'nonlabor') return obj[base + 'nonlabor'] ?? 0;
  return obj[base + 'total'] ?? 0;
}}

function getProgVal(prog) {{ return getValue(prog); }}

function getDeptVal(dept) {{
  return dept.programs.reduce((s, p) => s + getProgVal(p), 0);
}}

function getSvcVal(svc) {{
  return svc.departments.reduce((s, d) => s + getDeptVal(d), 0);
}}

// ── Render helpers ───────────────────────────────────────────────────────────
function makeBar(name, val, maxVal, dot, color, selected, dimmed, onClick) {{
  const pct = maxVal > 0 ? val / maxVal * 100 : 0;
  const row = document.createElement('div');
  row.className = 'bar-row' + (selected ? ' selected' : '') + (dimmed ? ' dimmed' : '');
  row.innerHTML = `
    <div class="bar-label">
      ${{dot ? `<span class="dot" style="background:${{dot}}"></span>` : ''}}
      <span style="overflow:hidden;text-overflow:ellipsis;">${{name}}</span>
    </div>
    <div class="bar-track">
      <div class="bar-fill" style="width:${{pct.toFixed(1)}}%;background:${{color || 'var(--ink)'}}"></div>
    </div>
    <div class="bar-amount">
      <span>${{fmt(val)}}</span>
      <span class="bar-pct">${{pct.toFixed(1)}}%</span>
    </div>`;
  row.addEventListener('click', onClick);
  return row;
}}

// ── Render columns ───────────────────────────────────────────────────────────
function renderService() {{
  const body = $('bodyService');
  body.innerHTML = '';
  const grand = DATA.services.reduce((s, sv) => s + getSvcVal(sv), 0);
  DATA.services.forEach(svc => {{
    const val = getSvcVal(svc);
    const selected = state.selService === svc.name;
    const dimmed   = state.selService && !selected;
    body.appendChild(makeBar(svc.name, val, grand, svc.dot, svc.dot, selected, dimmed, () => {{
      state.selService = selected ? null : svc.name;
      state.selDept    = null;
      hideDetail();
      renderAll();
    }}));
  }});
  $('ctxService').textContent = state.selService
    ? `Showing: ${{state.selService}}`
    : `All services · ${{fmt(grand)}}`;
}}

function renderDept() {{
  const body = $('bodyDept');
  body.innerHTML = '';
  const svcs = state.selService
    ? DATA.services.filter(s => s.name === state.selService)
    : DATA.services;

  const allDepts = svcs.flatMap(s => s.departments.map(d => ({{...d, svcDot: s.dot, svcColor: s.dot}})));
  // merge same-dept-across-services (shouldn't happen but defensive)
  const deptMap = {{}};
  allDepts.forEach(d => {{
    if (!deptMap[d.name]) deptMap[d.name] = {{...d, programs: [...d.programs]}};
    else deptMap[d.name].programs.push(...d.programs);
  }});
  const depts = Object.values(deptMap).sort((a,b) => getDeptVal(b) - getDeptVal(a));

  const grand = depts.reduce((s, d) => s + getDeptVal(d), 0);

  depts.forEach(dept => {{
    const val = getDeptVal(dept);
    const svcColor = state.selService
      ? (DATA.services.find(s => s.name === state.selService)?.dot || 'var(--ink)')
      : 'var(--ink)';
    const selected = state.selDept === dept.name;
    const dimmed   = state.selDept && !selected;
    body.appendChild(makeBar(dept.name, val, grand, null, svcColor, selected, dimmed, () => {{
      state.selDept = selected ? null : dept.name;
      hideDetail();
      renderAll();
    }}));
  }});

  $('ctxDept').textContent = state.selService
    ? `Within ${{state.selService}}`
    : 'All departments';
}}

function renderProg() {{
  const body = $('bodyProg');
  body.innerHTML = '';
  const svcs = state.selService
    ? DATA.services.filter(s => s.name === state.selService)
    : DATA.services;

  let allProgs = [];
  svcs.forEach(s => {{
    s.departments.forEach(d => {{
      if (!state.selDept || d.name === state.selDept) {{
        d.programs.forEach(p => allProgs.push({{...p, _svc: s.name, _dept: d.name, _dot: s.dot}}));
      }}
    }});
  }});
  allProgs.sort((a, b) => getProgVal(b) - getProgVal(a));

  const grand = allProgs.reduce((s, p) => s + getProgVal(p), 0);

  if (allProgs.length === 0) {{
    body.innerHTML = '<div class="empty-state">No programs match current filters.</div>';
  }} else {{
    allProgs.forEach(prog => {{
      const val = getProgVal(prog);
      const color = state.selService
        ? (DATA.services.find(s => s.name === state.selService)?.dot || 'var(--ink)')
        : prog._dot || 'var(--ink)';
      body.appendChild(makeBar(prog.name, val, grand, null, color, false, false, () => {{
        showDetail(prog);
      }}));
    }});
  }}

  $('ctxProg').textContent = state.selDept
    ? `Within ${{state.selDept}}`
    : state.selService ? `Within ${{state.selService}}` : 'All programs';
}}

function renderSummaryStrip() {{
  const strip = $('summaryStrip');
  strip.innerHTML = '';
  const grand = DATA.services.reduce((s, sv) => s + getSvcVal(sv), 0);
  DATA.services.forEach(svc => {{
    const val = getSvcVal(svc);
    const pct = grand > 0 ? val / grand * 100 : 0;
    const active = state.selService === svc.name;
    const chip = document.createElement('div');
    chip.className = 'svc-chip' + (active ? ' active' : '');
    chip.innerHTML = `
      <div class="svc-chip-name">${{svc.name}}</div>
      <div class="svc-chip-amt">${{fmt(val)}}</div>
      <div class="svc-chip-bar" style="width:${{Math.min(100,pct*1.5).toFixed(0)}}%;background:${{svc.dot}}"></div>`;
    chip.addEventListener('click', () => {{
      state.selService = active ? null : svc.name;
      state.selDept    = null;
      hideDetail();
      renderAll();
    }});
    strip.appendChild(chip);
  }});
}}

function renderTotalBanner() {{
  const grand = DATA.services.reduce((s, sv) => s + getSvcVal(sv), 0);
  const deptSet = new Set(), progSet = new Set();
  DATA.services.forEach(s => s.departments.forEach(d => {{
    deptSet.add(d.name);
    d.programs.forEach(p => {{ if (getProgVal(p) !== 0) progSet.add(p.name); }});
  }}));
  $('totalBanner').innerHTML = `<strong>${{fmt(grand)}}</strong> total &nbsp;·&nbsp; ${{deptSet.size}} departments &nbsp;·&nbsp; ${{progSet.size}} programs`;
}}

function renderSvcLegend() {{
  const leg = $('svcLegend');
  leg.innerHTML = '';
  DATA.services.forEach(svc => {{
    const item = document.createElement('div');
    item.className = 'svc-legend-item';
    item.innerHTML = `<span class="dot" style="background:${{svc.dot}}"></span><span>${{svc.name}}</span>`;
    item.addEventListener('click', () => {{
      state.selService = state.selService === svc.name ? null : svc.name;
      state.selDept    = null;
      hideDetail();
      renderAll();
    }});
    leg.appendChild(item);
  }});
}}

function renderAll() {{
  renderSummaryStrip();
  renderTotalBanner();
  renderService();
  renderDept();
  renderProg();
}}

// ── Detail column ─────────────────────────────────────────────────────────────
function showDetail(prog) {{
  const total    = getProgVal(prog);
  const labor    = state.fundFilter === 'gf' ? prog.gf_labor    : prog.labor;
  const nlab     = state.fundFilter === 'gf' ? prog.gf_nonlabor : prog.nonlabor;
  const laborPct = total > 0 ? (labor / total * 100) : 0;
  const ftes     = prog.ftes != null ? prog.ftes.toFixed(1) : '—';

  const desc = prog.description
    ? `<div class="detail-desc">${{prog.description}}</div>`
    : `<div class="detail-desc empty">No description available in the 2026 Adopted Budget Book for this program.</div>`;

  const bslLine = prog.bsl
    ? `<div class="detail-bsl" style="margin-top:10px"><strong>BSL:</strong> ${{prog.bsl}}</div>`
    : '';

  const bslDescLine = prog.bslDesc
    ? `<div class="detail-bsl"><strong>BSL context:</strong> ${{prog.bslDesc}}</div>`
    : '';

  const fundsLine = prog.funds && prog.funds.length
    ? `<div class="detail-funds"><div class="detail-section-label" style="margin-top:10px">Funds</div>
       <div class="detail-funds-list">${{prog.funds.map(f => `<span class="fund-tag">${{f}}</span>`).join('')}}</div></div>`
    : '';

  $('bodyDetail').innerHTML = `
    <div class="detail-body">
      <div class="detail-prog-name">${{prog.name}}</div>
      <div class="detail-breadcrumb">${{prog._dept}} · ${{prog._svc}}</div>

      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fmt(total)}}</div>
        <div class="detail-meta-key">Total budget</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fmt(labor)}}</div>
        <div class="detail-meta-key">Labor</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fmt(nlab)}}</div>
        <div class="detail-meta-key">Non-labor</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{ftes}}</div>
        <div class="detail-meta-key">FTEs</div>
      </div>

      <div class="detail-section-label" style="margin-top:10px">Labor split</div>
      <div class="labor-bar-track">
        <div class="labor-bar-fill" style="width:${{laborPct.toFixed(1)}}%"></div>
      </div>
      <div class="labor-bar-labels">
        <span>Labor ${{laborPct.toFixed(0)}}%</span>
        <span>Non-labor ${{(100-laborPct).toFixed(0)}}%</span>
      </div>

      ${{fundsLine}}
      ${{bslLine}}

      <div class="detail-section-label" style="margin-top:12px">Description</div>
      ${{desc}}

      ${{bslDescLine}}
    </div>`;

  $('ctxDetail').textContent = prog.name;
}}

function hideDetail() {{
  $('bodyDetail').innerHTML = '<div class="detail-placeholder">Select a program to see its budget details and description.</div>';
  $('ctxDetail').innerHTML  = '&nbsp;';
}}

// ── Filter controls ──────────────────────────────────────────────────────────
document.querySelectorAll('input[name="fund"]').forEach(el => {{
  el.addEventListener('change', () => {{
    state.fundFilter = el.value;
    hideDetail();
    renderAll();
  }});
}});

document.querySelectorAll('input[name="labor"]').forEach(el => {{
  el.addEventListener('change', () => {{
    state.laborFilter = el.value;
    hideDetail();
    renderAll();
  }});
}});

// ── Init ─────────────────────────────────────────────────────────────────────
renderAll();
</script>
</body>
</html>"""

OUT_PATH.write_text(html, encoding='utf-8')
print(f'Wrote {OUT_PATH}  ({OUT_PATH.stat().st_size / 1024:.0f} KB)')
