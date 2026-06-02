"""
Generates fund-explorer.html — drills from Fund Category → Fund → Department → Program.
Sources: City_of_Seattle_Operating_Budget_20260602.csv + seattle_budget_by_program.xlsx
"""
import csv, json
from collections import defaultdict
from pathlib import Path

try:
    import openpyxl
except ImportError:
    import subprocess, sys
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'openpyxl', '-q'])
    import openpyxl

HERE      = Path(__file__).parent
CSV_PATH  = Path.home() / 'Downloads/seattle-data/City_of_Seattle_Operating_Budget_20260602.csv'
XLSX_PATH = HERE / 'seattle_budget_by_program.xlsx'
OUT_PATH  = HERE / 'fund-explorer.html'

# ── Fund category rules (checked in order, first match wins) ─────────────────
def categorize(fund_name):
    n = fund_name.lower()
    if 'general fund' in n:                                          return 'General Fund'
    if any(x in n for x in ['light fund','drainage','wastewater','water fund','solid waste']): return 'Utilities'
    if any(x in n for x in ['levy','benefit district','park district','fepp','sweetened',
                              'short-term rental','camera fund','opioid','king county parks',
                              'central district','payroll expense']):return 'Levies & Special Taxes'
    if any(x in n for x in ['health care','information technology','finance and admin',
                              'industrial insurance','fleet capital','group term life',
                              'unemployment','transit benefit','fire fighters healthcare',
                              'filelo']):                            return 'Internal Service'
    if any(x in n for x in ['pension','retirement','police relief']): return 'Pensions & Benefits'
    if any(x in n for x in ['bond','reet','ltgo','utgo','redemption',
                              'cumulative reserve','judgment','2014','2017','2026 multi',
                              'waterfront','garage']):               return 'Bonds & Reserves'
    return 'Special Purpose'

# Category colors: (background, dot/accent)
CAT_COLORS = {
    'General Fund':          ('#2c2e25', '#fff8dc'),   # dark ink, inverted
    'Utilities':             ('#c8e0d4', '#5a9e7a'),
    'Levies & Special Taxes':('#f0e8c0', '#a89030'),
    'Internal Service':      ('#c9dae1', '#5a8a9e'),
    'Special Purpose':       ('#f5d8e8', '#c07aa8'),
    'Pensions & Benefits':   ('#e8cccc', '#b05858'),
    'Bonds & Reserves':      ('#d4e4c8', '#6a9e5a'),
}

# Brief descriptions for the most-used funds
FUND_DESCRIPTIONS = {
    'General Fund':
        'The City\'s primary operating fund, supporting general government services: public safety, courts, parks, human services, libraries, and administration. Funded mainly by property taxes, sales taxes, utility taxes, and other general revenues.',
    'Light Fund':
        'Self-sustaining enterprise fund for Seattle City Light, the publicly-owned electric utility. Funded by ratepayer revenue. Covers generation, transmission, distribution, customer service, conservation, and debt service.',
    'Drainage and Wastewater Fund':
        'Enterprise fund for Seattle Public Utilities drainage and wastewater operations. Funded by utility rates. Covers stormwater management, sewer infrastructure, combined sewer overflow (CSO) control, and environmental compliance.',
    'Payroll Expense Tax':
        'Revenue fund sourced from the payroll expense tax on businesses with employees earning over $150k. Supports affordable housing, homelessness services, and economic recovery programs across multiple departments.',
    'Health Care Fund':
        'Internal service fund covering employee and retiree health insurance costs citywide. Funded by contributions from all City departments based on headcount and benefits elections.',
    'Water Fund':
        'Enterprise fund for Seattle Public Utilities water operations. Funded by water utility rates. Covers drinking water treatment, distribution infrastructure, watershed stewardship, and customer service.',
    'Information Technology Fund':
        'Internal service fund for Seattle IT (SCI). Funded by charges to City departments for technology services including infrastructure, cybersecurity, applications development, and digital equity programs.',
    'Solid Waste Fund':
        'Enterprise fund for Seattle Public Utilities solid waste operations. Funded by collection rates. Covers garbage, recycling, composting, transfer stations, and zero-waste initiatives.',
    'Finance and Administrative Services Fund':
        'Internal service fund for FASD providing citywide services: purchasing, fleet management, facilities, risk management, financial services, and regulatory licensing.',
    'Low Income Housing Fund':
        'Special revenue fund for the Office of Housing. Sources include linkage fees, the Mandatory Housing Affordability program, short-term rental taxes, and federal grants. Supports affordable housing development and preservation.',
    'Transportation Fund':
        'Special revenue fund for SDOT transportation operations. Funded by a mix of general fund transfer, gas taxes, parking revenue, and federal/state grants. Covers street maintenance, signals, bridges, and multimodal programs.',
    'FEPP Levy 2025':
        'Families, Education, Preschool, and Promise Levy fund for 2025 (renewed by voters Nov 2025 for 2026–2031). Supports early learning, K-12 programs, college promise scholarships, and out-of-school youth services.',
    'Construction and Inspections':
        'Enterprise fund for the Seattle Department of Construction and Inspections. Funded by permit fees and inspection charges. Covers land use permits, building inspections, code enforcement, and tenant services.',
    'Human Services Fund':
        'Special revenue fund for the Human Services Department. Funded by federal grants (CDBG, ESG), state contracts, and other sources. Supports food security, youth development, homelessness, and community safety programs.',
    'Seattle Park District Fund':
        'Special levy district fund created by voter approval in 2014. Property tax revenue dedicated to parks maintenance, recreation affordability, park development, and community events.',
    'Transportation Benefit District Fund':
        'Voter-approved levy fund supporting transit access. Funded by the Seattle Transportation Benefit District property tax. Covers Metro bus service hours, reduced-fare ORCA cards, and accessibility programs.',
    'Library Fund':
        'Operating fund for The Seattle Public Library. Funded by General Fund support plus fines and fees. Covers branch operations, collections, digital services, and community programming.',
    'Families Education Preschool Promise Levy':
        'Families, Education, Preschool, and Promise (FEPP) Levy fund. Voter-approved property tax levy supporting DEEL\'s education programs, preschool subsidies, and college promise scholarships.',
    'Industrial Insurance Fund':
        'Internal service fund covering workers\' compensation claims and industrial insurance costs for all City employees. Funded by charges to departments based on payroll and claims experience.',
    'Park And Recreation Fund':
        'Enterprise-style fund for Seattle Parks and Recreation supporting self-sustaining operations such as golf courses, community centers, aquatics, and partnerships. Revenue from user fees and program charges.',
    'Judgment/Claims Fund':
        'Citywide reserve fund that pays legal judgments and settlements against the City. Funded by contributions from all departments based on actuarial risk.',
    'Sweetened Beverage Tax Fund':
        'Revenue from the Seattle sweetened beverage tax. Dedicated to food access programs, healthy development initiatives in communities of color, and nutrition education.',
    'Short-Term Rental Tax Fund':
        'Revenue from the short-term rental tax (e.g., Airbnb). Directed to affordable housing programs through the Office of Housing.',
    'Automated Traffic Safety Camera Fund':
        'Revenue from automated speed and school-zone safety cameras. Restricted to transportation safety improvements and pedestrian/cyclist safety programs.',
    'Arts and Culture Fund':
        'Special revenue fund for the Office of Arts & Culture. Funded by the Admission Tax and other sources. Supports arts grants, public art, Langston Hughes Performing Arts Institute, and cultural programs.',
}

# ── 1. Load Excel enrichment ─────────────────────────────────────────────────
enrichment = {}
wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
ws = wb['Programs']
cols = [c.value for c in next(ws.rows)]
ci = {c: i for i, c in enumerate(cols) if c}
for row in ws.iter_rows(min_row=2):
    def g(col): return row[ci[col]].value if col in ci else None
    dept = (g('Department (CSV)') or '').strip()
    prog = (g('Program') or '').strip()
    enrichment[(dept.lower(), prog.lower())] = {
        'description': (g('Program Description') or '').strip(),
        'bsl':         (g('Budget Summary Level') or '').strip(),
        'bslDesc':     (g('BSL Description') or '').strip(),
        'ftes':        g('2026 Adopted FTEs'),
    }
wb.close()
print(f'Enrichment records: {len(enrichment)}')

# ── 2. Load CSV ───────────────────────────────────────────────────────────────
agg = defaultdict(lambda: {'total':0,'labor':0,'nonlabor':0})
fund_meta = {}   # fund_key -> {name, code, fund_type}
funds_by_key = defaultdict(lambda: defaultdict(lambda: defaultdict(
    lambda: {'total':0,'labor':0,'nonlabor':0}
)))   # fund_key -> dept -> prog -> {total,labor,nonlabor}

with open(CSV_PATH, encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        if row['Fiscal Year'] != '2026': continue
        fund  = row['Fund'].strip()
        ftype = row['Fund Type'].strip()
        dept  = row['Department'].strip()
        prog  = row['Program'].strip()
        desc  = row['Description'].strip().lower()
        is_labor = 'non' not in desc
        try: amt = float(row['Approved Amount'].replace(',','').strip())
        except: amt = 0

        # Extract code and name from fund key like "00100 - General Fund"
        parts = fund.split(' - ', 1)
        code  = parts[0].strip()
        name  = parts[1].strip() if len(parts) > 1 else fund
        fund_meta[fund] = {'name': name, 'code': code, 'fund_type': ftype}

        funds_by_key[fund][dept][prog]['total']    += amt
        if is_labor: funds_by_key[fund][dept][prog]['labor']   += amt
        else:        funds_by_key[fund][dept][prog]['nonlabor'] += amt

print(f'Funds loaded: {len(fund_meta)}')

# ── 3. Build JSON structure ───────────────────────────────────────────────────
cat_order = list(CAT_COLORS.keys())

funds_list = []
for fund_key, depts_map in funds_by_key.items():
    meta  = fund_meta[fund_key]
    fname = meta['name']
    fcode = meta['code']

    # Aggregate fund totals
    ftotal = flabor = fnonlabor = 0
    depts_list = []
    for dept_name, progs_map in depts_map.items():
        progs_list = []
        dtotal = dlabor = dnonlabor = 0
        for prog_name, pdata in progs_map.items():
            enr = enrichment.get((dept_name.lower(), prog_name.lower()), {})
            progs_list.append({
                'name':        prog_name,
                'total':       round(pdata['total']),
                'labor':       round(pdata['labor']),
                'nonlabor':    round(pdata['nonlabor']),
                'description': enr.get('description', ''),
                'bsl':         enr.get('bsl', ''),
                'bslDesc':     enr.get('bslDesc', ''),
                'ftes':        enr.get('ftes'),
            })
            dtotal    += pdata['total']
            dlabor    += pdata['labor']
            dnonlabor += pdata['nonlabor']
        progs_list.sort(key=lambda p: -p['total'])
        depts_list.append({'name': dept_name, 'total': round(dtotal),
                           'labor': round(dlabor), 'nonlabor': round(dnonlabor),
                           'programs': progs_list})
        ftotal    += dtotal
        flabor    += dlabor
        fnonlabor += dnonlabor

    if abs(ftotal) < 1000: continue   # skip near-zero funds

    depts_list.sort(key=lambda d: -d['total'])
    cat   = categorize(fname)
    color, dot = CAT_COLORS[cat]
    funds_list.append({
        'name':        fname,
        'code':        fcode,
        'category':    cat,
        'total':       round(ftotal),
        'labor':       round(flabor),
        'nonlabor':    round(fnonlabor),
        'color':       color,
        'dot':         dot,
        'description': FUND_DESCRIPTIONS.get(fname, ''),
        'departments': depts_list,
    })

funds_list.sort(key=lambda f: -f['total'])

# Build category totals
cat_totals = defaultdict(float)
for f in funds_list: cat_totals[f['category']] += f['total']

categories = []
for cname in cat_order:
    if cat_totals[cname] > 0:
        color, dot = CAT_COLORS[cname]
        categories.append({'name': cname, 'total': round(cat_totals[cname]), 'color': color, 'dot': dot})

grand_total = sum(f['total'] for f in funds_list)
DATA = {'total': round(grand_total), 'categories': categories, 'funds': funds_list}
data_json = json.dumps(DATA, separators=(',', ':'), ensure_ascii=True)

print(f'Grand total: ${grand_total:,.0f}')
print(f'Funds (non-zero): {len(funds_list)}')
print(f'Categories: {[c["name"] for c in categories]}')

# ── 4. Generate HTML ──────────────────────────────────────────────────────────
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>2026 Seattle Budget by Fund</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../site.css">
<style>
/* ── Layout ── */
.page-layout {{ display: flex; align-items: flex-start; }}
.page-layout .main {{ flex: 1; min-width: 0; max-width: none; margin: 0; }}
.main {{ padding: 14px 20px 24px; }}

/* ── Sidebar ── */
.sidebar {{
  width: 210px; flex-shrink: 0;
  border-right: var(--border);
  position: sticky; top: 0;
  height: 100vh; overflow-y: auto;
}}
.sidebar-block {{ padding: 16px; border-bottom: var(--border); }}
.sidebar-block .section-label {{ margin-bottom: 10px; }}
.sidebar-links {{ display: flex; flex-direction: column; gap: 10px; }}
.sidebar-links a,
.sidebar-links label {{
  font-size: 0.65rem; color: var(--mid); text-decoration: none;
  line-height: 1.4; cursor: pointer; display: flex; align-items: center; gap: 6px;
}}
.sidebar-links a:hover,
.sidebar-links label:hover {{ color: var(--ink); text-decoration: underline; }}
.sidebar-links input[type="radio"] {{ accent-color: var(--ink); cursor: pointer; margin: 0; flex-shrink: 0; }}
@media (max-width: 768px) {{
  .page-layout {{ flex-direction: column; }}
  .sidebar {{ width: 100%; height: auto; position: static; border-right: none; border-bottom: var(--border); }}
}}

/* ── Page header ── */
.page-header {{ display: flex; align-items: baseline; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }}
.page-header h1 {{ font-size: 1.05rem; font-weight: 500; margin: 0; letter-spacing: 0.5px; flex-shrink: 0; }}
.total-banner {{ font-size: 0.65rem; color: var(--mid); letter-spacing: 1.2px; text-transform: uppercase; }}
.total-banner strong {{ color: var(--ink); font-size: 0.9rem; letter-spacing: 0; text-transform: none; font-weight: 500; }}

/* ── Category strip ── */
.cat-strip {{
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: var(--border);
  border-bottom: none;
}}
.cat-chip {{
  padding: 8px 10px; border-right: var(--border);
  cursor: pointer; transition: background 0.1s;
}}
.cat-chip:last-child {{ border-right: none; }}
.cat-chip:hover  {{ background: var(--hover); }}
.cat-chip.active {{ background: var(--faint); }}
.cat-chip-name {{ font-size: 0.58rem; color: var(--mid); text-transform: uppercase; letter-spacing: 1px; line-height: 1.3; }}
.cat-chip-amt  {{ font-size: 0.8rem; font-weight: 500; color: var(--ink); margin-top: 2px; }}
.cat-chip-bar  {{ height: 3px; border-radius: 2px; margin-top: 5px; }}

/* ── Four-column explorer ── */
.explorer-grid {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: var(--border);
}}
.explorer-col {{
  border-right: var(--border);
  height: 64vh; min-height: 320px;
  display: flex; flex-direction: column;
}}
.explorer-col:last-child {{ border-right: none; }}
.col-header {{
  padding: 10px 14px 6px;
  border-bottom: var(--border);
  position: sticky; top: 0; background: var(--bg); z-index: 1;
}}
.col-header .section-label {{ margin-bottom: 2px; }}
.col-context {{ font-size: 0.65rem; color: var(--mid); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }}
.col-body {{ flex: 1; overflow-y: auto; padding: 4px 0; }}

/* ── Bar rows ── */
.bar-row {{
  padding: 7px 14px; cursor: pointer;
  border-bottom: 1px solid var(--faint); transition: background 0.1s;
}}
.bar-row:last-child {{ border-bottom: none; }}
.bar-row:hover   {{ background: var(--hover); }}
.bar-row.selected {{ background: var(--faint); }}
.bar-row.dimmed  {{ opacity: 0.35; }}
.bar-label {{
  display: flex; align-items: center; gap: 6px;
  font-size: 0.72rem; font-weight: 400; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}}
.bar-row.selected .bar-label {{ font-weight: 500; }}
.bar-track {{ height: 5px; background: var(--faint); border-radius: 3px; overflow: hidden; }}
.bar-fill  {{ height: 100%; border-radius: 3px; transition: width 0.25s ease; }}
.bar-amount {{ font-size: 0.63rem; color: var(--mid); margin-top: 3px; display: flex; justify-content: space-between; }}
.bar-pct {{ color: var(--ink); font-weight: 500; }}

/* ── Detail column ── */
.detail-body    {{ padding: 12px 14px; }}
.detail-placeholder {{
  display: flex; align-items: center; justify-content: center;
  height: 100%; padding: 20px 14px;
  font-size: 0.68rem; color: var(--mid); font-style: italic; text-align: center; line-height: 1.6;
}}
.detail-fund-name   {{ font-size: 0.85rem; font-weight: 500; color: var(--ink); margin-bottom: 3px; line-height: 1.3; }}
.detail-fund-cat    {{ font-size: 0.62rem; color: var(--mid); margin-bottom: 12px; }}
.detail-prog-name   {{ font-size: 0.82rem; font-weight: 500; color: var(--ink); margin-bottom: 2px; line-height: 1.3; }}
.detail-breadcrumb  {{ font-size: 0.62rem; color: var(--mid); margin-bottom: 12px; line-height: 1.4; }}
.detail-meta-item   {{ border: 1px solid var(--faint); padding: 7px 10px; margin-bottom: 6px; }}
.detail-meta-val    {{ font-size: 0.85rem; font-weight: 500; color: var(--ink); }}
.detail-meta-key    {{ font-size: 0.58rem; color: var(--mid); text-transform: uppercase; letter-spacing: 1px; margin-top: 1px; }}
.detail-section-label {{
  font-size: 0.58rem; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--mid); margin-bottom: 6px;
}}
.detail-desc     {{ font-size: 0.68rem; line-height: 1.65; color: var(--ink); margin-top: 4px; }}
.detail-desc.empty {{ color: var(--mid); font-style: italic; }}
.detail-bsl      {{ font-size: 0.62rem; color: var(--mid); margin-top: 8px; line-height: 1.5; }}
.detail-funds    {{ font-size: 0.62rem; color: var(--mid); margin-top: 8px; }}
.fund-tag        {{ display: inline-block; padding: 2px 6px; margin: 2px 2px 0 0; background: var(--faint); font-size: 0.58rem; }}
.labor-bar-track {{ height: 14px; background: var(--faint); position: relative; border-radius: 2px; overflow: hidden; margin: 4px 0 3px; }}
.labor-bar-fill  {{ height: 100%; background: var(--ink); position: absolute; left: 0; top: 0; transition: width .3s; }}
.labor-bar-labels {{ display: flex; justify-content: space-between; font-size: 0.58rem; color: var(--mid); }}

/* ── Fund category badge ── */
.cat-badge {{
  display: inline-block; padding: 2px 8px; font-size: 0.58rem;
  letter-spacing: 0.5px; margin-bottom: 10px;
}}

/* ── Divider ── */
.detail-divider {{ border: none; border-top: 1px solid var(--faint); margin: 10px 0; }}

/* ── Empty state ── */
.empty-state {{ padding: 24px 14px; color: var(--mid); font-size: 0.68rem; text-align: center; font-style: italic; }}

/* ── Responsive ── */
@media (max-width: 1100px) {{
  .cat-strip      {{ grid-template-columns: repeat(4, 1fr); }}
  .explorer-grid  {{ grid-template-columns: repeat(2, 1fr); }}
  .explorer-col   {{ height: 44vh; }}
}}
@media (max-width: 900px) {{
  .cat-strip     {{ grid-template-columns: repeat(3, 1fr); }}
  .explorer-grid {{ grid-template-columns: 1fr; }}
  .explorer-col  {{ height: 38vh; border-right: none; border-bottom: var(--border); }}
}}
</style>
</head>
<body>
<div class="page-layout">

<aside class="sidebar">
  <div class="sidebar-block">
    <div class="section-label">Navigate</div>
    <nav class="sidebar-links">
      <a href="index.html">&#8592; Budget Overview</a>
      <a href="budget-explorer.html">Budget by Program &#8594;</a>
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

<div class="main">
  <div class="page-header">
    <h1>2026 Seattle Budget by Fund</h1>
    <div class="total-banner" id="totalBanner"></div>
  </div>

  <div class="cat-strip" id="catStrip"></div>

  <div class="explorer-grid">
    <div class="explorer-col">
      <div class="col-header">
        <div class="section-label">Fund</div>
        <div class="col-context" id="ctxFund">All funds</div>
      </div>
      <div class="col-body" id="bodyFund"></div>
    </div>
    <div class="explorer-col">
      <div class="col-header">
        <div class="section-label">Department</div>
        <div class="col-context" id="ctxDept">Select a fund</div>
      </div>
      <div class="col-body" id="bodyDept"></div>
    </div>
    <div class="explorer-col">
      <div class="col-header">
        <div class="section-label">Program</div>
        <div class="col-context" id="ctxProg">Select a department</div>
      </div>
      <div class="col-body" id="bodyProg"></div>
    </div>
    <div class="explorer-col">
      <div class="col-header">
        <div class="section-label">Detail</div>
        <div class="col-context" id="ctxDetail">&nbsp;</div>
      </div>
      <div class="col-body" id="bodyDetail">
        <div class="detail-placeholder">Select a fund to see what it funds, then drill into departments and programs.</div>
      </div>
    </div>
  </div>
</div>
</div>

<script>
const DATA = {data_json};

let state = {{ catFilter: null, selFund: null, selDept: null, laborFilter: 'all' }};

const $ = id => document.getElementById(id);
const fmt = n => n == null ? '—'
  : Math.abs(n) >= 1e9 ? '$' + (n/1e9).toFixed(2) + 'B'
  : Math.abs(n) >= 1e6 ? '$' + (n/1e6).toFixed(1) + 'M'
  : '$' + Math.round(n).toLocaleString();

function val(obj) {{
  if (state.laborFilter === 'labor')    return obj.labor    || 0;
  if (state.laborFilter === 'nonlabor') return obj.nonlabor || 0;
  return obj.total || 0;
}}

function visibleFunds() {{
  return DATA.funds.filter(f => !state.catFilter || f.category === state.catFilter);
}}

// ── Category strip ────────────────────────────────────────────────────────────
function renderCatStrip() {{
  const strip = $('catStrip');
  strip.innerHTML = '';
  const grand = visibleFunds().reduce((s, f) => s + val(f), 0) ||
                 DATA.funds.reduce((s, f) => s + val(f), 0);
  DATA.categories.forEach(cat => {{
    const catTotal = DATA.funds
      .filter(f => f.category === cat.name)
      .reduce((s, f) => s + val(f), 0);
    const active = state.catFilter === cat.name;
    const chip = document.createElement('div');
    chip.className = 'cat-chip' + (active ? ' active' : '');
    chip.innerHTML = `
      <div class="cat-chip-name">${{cat.name}}</div>
      <div class="cat-chip-amt">${{fmt(catTotal)}}</div>
      <div class="cat-chip-bar" style="width:${{Math.min(100,(catTotal/grand*100*2)).toFixed(0)}}%;background:${{cat.dot}}"></div>`;
    chip.addEventListener('click', () => {{
      state.catFilter = active ? null : cat.name;
      state.selFund = null; state.selDept = null;
      renderAll();
    }});
    strip.appendChild(chip);
  }});
}}

// ── Column 1: Funds ───────────────────────────────────────────────────────────
function renderFunds() {{
  const body = $('bodyFund');
  body.innerHTML = '';
  const funds = visibleFunds();
  const grand = funds.reduce((s, f) => s + val(f), 0);
  if (!funds.length) {{ body.innerHTML = '<div class="empty-state">No funds in this category.</div>'; return; }}
  funds.forEach(fund => {{
    const v = val(fund);
    const pct = grand > 0 ? v/grand*100 : 0;
    const sel = state.selFund === fund.name;
    const dim = state.selFund && !sel;
    const row = document.createElement('div');
    row.className = 'bar-row' + (sel?' selected':'') + (dim?' dimmed':'');
    row.innerHTML = `
      <div class="bar-label">
        <span class="dot" style="background:${{fund.dot}}"></span>
        <span style="overflow:hidden;text-overflow:ellipsis">${{fund.name}}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${{pct.toFixed(1)}}%;background:${{fund.dot}}"></div></div>
      <div class="bar-amount"><span>${{fmt(v)}}</span><span class="bar-pct">${{pct.toFixed(1)}}%</span></div>`;
    row.addEventListener('click', () => {{
      state.selFund = sel ? null : fund.name;
      state.selDept = null;
      renderAll();
      if (state.selFund) showFundDetail(fund);
      else clearDetail();
    }});
    body.appendChild(row);
  }});
  $('ctxFund').textContent = state.catFilter
    ? `${{state.catFilter}} · ${{fmt(grand)}}`
    : `All funds · ${{fmt(grand)}}`;
}}

// ── Column 2: Departments ─────────────────────────────────────────────────────
function renderDepts() {{
  const body = $('bodyDept');
  body.innerHTML = '';
  if (!state.selFund) {{
    body.innerHTML = '<div class="empty-state">Select a fund.</div>';
    $('ctxDept').textContent = 'Select a fund';
    return;
  }}
  const fund = DATA.funds.find(f => f.name === state.selFund);
  if (!fund) return;
  const grand = fund.departments.reduce((s, d) => s + val(d), 0);
  fund.departments.forEach(dept => {{
    const v = val(dept);
    const pct = grand > 0 ? v/grand*100 : 0;
    const sel = state.selDept === dept.name;
    const dim = state.selDept && !sel;
    const row = document.createElement('div');
    row.className = 'bar-row' + (sel?' selected':'') + (dim?' dimmed':'');
    row.innerHTML = `
      <div class="bar-label">
        <span style="overflow:hidden;text-overflow:ellipsis">${{dept.name}}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${{pct.toFixed(1)}}%;background:${{fund.dot}}"></div></div>
      <div class="bar-amount"><span>${{fmt(v)}}</span><span class="bar-pct">${{pct.toFixed(1)}}%</span></div>`;
    row.addEventListener('click', () => {{
      state.selDept = sel ? null : dept.name;
      renderAll();
    }});
    body.appendChild(row);
  }});
  $('ctxDept').textContent = `Within ${{state.selFund}}`;
}}

// ── Column 3: Programs ────────────────────────────────────────────────────────
function renderProgs() {{
  const body = $('bodyProg');
  body.innerHTML = '';
  if (!state.selFund) {{
    body.innerHTML = '<div class="empty-state">Select a fund, then a department.</div>';
    $('ctxProg').textContent = 'Select a department';
    return;
  }}
  const fund = DATA.funds.find(f => f.name === state.selFund);
  if (!fund) return;

  let progs = [];
  fund.departments.forEach(d => {{
    if (!state.selDept || d.name === state.selDept) {{
      d.programs.forEach(p => progs.push({{...p, _dept: d.name, _fund: fund}}));
    }}
  }});
  progs.sort((a,b) => val(b) - val(a));
  const grand = progs.reduce((s,p) => s + val(p), 0);

  if (!progs.length) {{ body.innerHTML = '<div class="empty-state">No programs found.</div>'; return; }}

  progs.forEach(prog => {{
    const v = val(prog);
    const pct = grand > 0 ? v/grand*100 : 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label">
        <span style="overflow:hidden;text-overflow:ellipsis">${{prog.name}}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${{pct.toFixed(1)}}%;background:${{fund.dot}}"></div></div>
      <div class="bar-amount"><span>${{fmt(v)}}</span><span class="bar-pct">${{pct.toFixed(1)}}%</span></div>`;
    row.addEventListener('click', () => showProgDetail(prog));
    body.appendChild(row);
  }});
  $('ctxProg').textContent = state.selDept
    ? `${{state.selDept}} · ${{fmt(grand)}}`
    : `${{state.selFund}} · ${{fmt(grand)}}`;
}}

// ── Total banner ──────────────────────────────────────────────────────────────
function renderBanner() {{
  const funds = visibleFunds();
  const grand = funds.reduce((s, f) => s + val(f), 0);
  const deptSet = new Set(), progSet = new Set();
  funds.forEach(f => f.departments.forEach(d => {{
    deptSet.add(d.name);
    d.programs.forEach(p => {{ if (val(p) !== 0) progSet.add(p.name); }});
  }}));
  $('totalBanner').innerHTML = `<strong>${{fmt(grand)}}</strong> total &nbsp;·&nbsp; ${{funds.length}} funds &nbsp;·&nbsp; ${{deptSet.size}} departments &nbsp;·&nbsp; ${{progSet.size}} programs`;
}}

// ── Detail column ─────────────────────────────────────────────────────────────
function showFundDetail(fund) {{
  const total = val(fund);
  const laborPct = total > 0 ? fund.labor/total*100 : 0;
  const color = fund.dot;
  const catColor = CAT_COLOR_MAP[fund.category] || '#e8e0c0';
  $('ctxDetail').textContent = fund.name;
  $('bodyDetail').innerHTML = `
    <div class="detail-body">
      <span class="cat-badge" style="background:${{catColor}};color:var(--ink)">${{fund.category}}</span>
      <div class="detail-fund-name">${{fund.name}}</div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fmt(total)}}</div>
        <div class="detail-meta-key">2026 Adopted Budget</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fund.departments.length}} dept${{fund.departments.length !== 1 ? 's' : ''}}</div>
        <div class="detail-meta-key">Departments funded</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fund.departments.reduce((s,d)=>s+d.programs.length,0)}} programs</div>
        <div class="detail-meta-key">Programs funded</div>
      </div>
      <div class="detail-section-label" style="margin-top:10px">Labor split</div>
      <div class="labor-bar-track">
        <div class="labor-bar-fill" style="width:${{laborPct.toFixed(1)}}%"></div>
      </div>
      <div class="labor-bar-labels">
        <span>Labor ${{laborPct.toFixed(0)}}%</span>
        <span>Non-labor ${{(100-laborPct).toFixed(0)}}%</span>
      </div>
      ${{fund.description ? `
      <hr class="detail-divider">
      <div class="detail-section-label">About this fund</div>
      <div class="detail-desc">${{fund.description}}</div>` : ''}}
      <hr class="detail-divider">
      <div class="detail-section-label">Top departments</div>
      ${{fund.departments.slice(0,5).map(d => `
        <div style="display:flex;justify-content:space-between;font-size:0.65rem;padding:3px 0;border-bottom:1px solid var(--faint)">
          <span style="overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:8px">${{d.name}}</span>
          <span style="flex-shrink:0;color:var(--ink)">${{fmt(val(d))}}</span>
        </div>`).join('')}}
    </div>`;
}}

function showProgDetail(prog) {{
  const total = val(prog);
  const laborPct = total > 0 ? prog.labor/total*100 : 0;
  const ftes = prog.ftes != null ? prog.ftes.toFixed(1) : '—';
  const desc = prog.description
    ? `<div class="detail-desc">${{prog.description}}</div>`
    : `<div class="detail-desc empty">No description available in the 2026 Adopted Budget Book.</div>`;
  $('ctxDetail').textContent = prog.name;
  $('bodyDetail').innerHTML = `
    <div class="detail-body">
      <div class="detail-prog-name">${{prog.name}}</div>
      <div class="detail-breadcrumb">${{prog._dept}} · ${{prog._fund.name}}</div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fmt(total)}}</div>
        <div class="detail-meta-key">Budget in this fund</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fmt(prog.labor)}}</div>
        <div class="detail-meta-key">Labor</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-val">${{fmt(prog.nonlabor)}}</div>
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
      ${{prog.bsl ? `<div class="detail-bsl" style="margin-top:8px"><strong>BSL:</strong> ${{prog.bsl}}</div>` : ''}}
      <hr class="detail-divider">
      <div class="detail-section-label">Description</div>
      ${{desc}}
      ${{prog.bslDesc ? `<div class="detail-bsl" style="margin-top:8px"><strong>BSL context:</strong> ${{prog.bslDesc}}</div>` : ''}}
    </div>`;
}}

function clearDetail() {{
  $('ctxDetail').innerHTML = '&nbsp;';
  $('bodyDetail').innerHTML = '<div class="detail-placeholder">Select a fund to see what it funds, then drill into departments and programs.</div>';
}}

// Build a quick cat→color map for badges
const CAT_COLOR_MAP = {{}};
DATA.categories.forEach(c => {{ CAT_COLOR_MAP[c.name] = c.color; }});

function renderAll() {{
  renderCatStrip();
  renderBanner();
  renderFunds();
  renderDepts();
  renderProgs();
}}

document.querySelectorAll('input[name="labor"]').forEach(el => {{
  el.addEventListener('change', () => {{
    state.laborFilter = el.value;
    renderAll();
    // Re-render detail if something is selected
    if (state.selFund) {{
      const fund = DATA.funds.find(f => f.name === state.selFund);
      if (fund) showFundDetail(fund);
    }}
  }});
}});

renderAll();
</script>
</body>
</html>"""

OUT_PATH.write_text(html, encoding='utf-8')
print(f'Wrote {OUT_PATH}  ({OUT_PATH.stat().st_size/1024:.0f} KB)')
