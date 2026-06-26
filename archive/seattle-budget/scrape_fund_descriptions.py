"""
Scrapes fund descriptions and revenue sources from the 2026 Adopted Budget Book PDF.
Outputs: fund_sources.csv  (one row per revenue source per fund)
         fund_descriptions.csv  (one row per fund with narrative description)
"""

import csv
import re
import pdfplumber
from pathlib import Path

PDF = Path.home() / 'Downloads/seattle-data/2026 Adopted Budget Book.pdf'
OUT_SOURCES = Path.home() / 'Downloads/seattle-data/fund_sources.csv'
OUT_DESC    = Path.home() / 'Downloads/seattle-data/fund_descriptions.csv'

# ── Helper ───────────────────────────────────────────────────────────────────
def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()

def parse_num(s):
    """Parse a number like '312,103' or '(5,411)' → float, or None."""
    s = s.replace(',', '').replace(' ', '').strip()
    if not s or s in ['-', '—', '']:
        return None
    neg = s.startswith('(') and s.endswith(')')
    s = s.strip('()')
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None

# ── Section 1: General Fund revenue table (pages 41–42) ──────────────────────
# Table has columns: Revenue Source | 2024 Actuals | 2025 Adopted | 2026 Endorsed | 2025 Revised | 2026 Adopted
# Values in $thousands

# Regex for a table data row: name followed by 4-5 numbers
# e.g.  "Property Tax  312,103  324,502  324,857  324,099  327,326"
DATA_ROW = re.compile(
    r'^(.+?)\s{2,}(-?\(?\d[\d,]+\)?)(?:\s+(-?\(?\d[\d,]+\)?))?(?:\s+(-?\(?\d[\d,]+\)?))?'
    r'(?:\s+(-?\(?\d[\d,]+\)?))?(?:\s+(-?\(?\d[\d,]+\)?))?$'
)

print("Extracting PDF text...", flush=True)
pages_text = {}
with pdfplumber.open(PDF) as pdf:
    for i, page in enumerate(pdf.pages):
        pages_text[i+1] = page.extract_text() or ''

def get_lines(page_num):
    return [l.strip() for l in pages_text[page_num].split('\n') if l.strip()]

# ── Parse GF revenue table ────────────────────────────────────────────────────
NUM5 = re.compile(r'^(-?\(?\d[\d,]+\)?\s+){4}-?\(?\d[\d,]+\)?$')
ROW5 = re.compile(r'^(.+?)\s+(-?\(?\d[\d,]+\)?)\s+(-?\(?\d[\d,]+\)?)\s+(-?\(?\d[\d,]+\)?)\s+(-?\(?\d[\d,]+\)?)\s+(-?\(?\d[\d,]+\)?)$')
SKIP_NAMES = {'revenue', '2024', '2025', '2026', 'actuals', 'adopted', 'endorsed', 'revised'}
TOTAL_WORDS = {'total', 'subtotal', 'grand total'}

gf_revenue_rows = []
for pg in [41, 42]:
    raw_lines = [l.strip() for l in pages_text[pg].split('\n')]
    i = 0
    while i < len(raw_lines):
        line = raw_lines[i]
        m = ROW5.match(line)
        if m:
            name = clean(m.group(1))
            vals = [parse_num(m.group(j)) for j in range(2, 7)]
        elif NUM5.match(line):
            # Values on their own line — name was on previous line (and maybe continues on next)
            name_parts = []
            if i > 0 and not NUM5.match(raw_lines[i-1]):
                prev = raw_lines[i-1].strip()
                if prev and 'City of Seattle' not in prev:
                    name_parts.append(prev)
            vals = [parse_num(v) for v in line.split()]
            if i+1 < len(raw_lines):
                nxt = raw_lines[i+1].strip()
                if nxt and not NUM5.match(nxt) and not ROW5.match(nxt):
                    skip_starts = ('city of seattle','revenue','total','2024','2025','2026','actuals')
                    if not any(nxt.lower().startswith(s) for s in skip_starts):
                        name_parts.append(nxt)
                        i += 1
            name = clean(' '.join(name_parts))
        else:
            i += 1; continue

        n_low = name.lower()
        if (name and n_low not in SKIP_NAMES
                and not any(t in n_low for t in TOTAL_WORDS)
                and 'city of seattle' not in n_low
                and 'thousands of dollars' not in n_low):
            gf_revenue_rows.append({
                'fund_name': 'General Fund',
                'fund_code': '00100',
                'revenue_source': name,
                'act2024_k': vals[0] if vals else None,
                'adp2025_k': vals[1] if len(vals)>1 else None,
                'end2026_k': vals[2] if len(vals)>2 else None,
                'rev2025_k': vals[3] if len(vals)>3 else None,
                'adp2026_k': vals[4] if len(vals)>4 else None,
            })
        i += 1

print(f"General Fund revenue sources: {len(gf_revenue_rows)}")

# ── Section 2: Per-source descriptions (pages 43-47) ─────────────────────────
# Pages 43-47 use "Source Name. Description..." paragraph format.
# We extract each paragraph that starts with a capitalized phrase followed by a period.

def extract_paragraphs(page_nums):
    paras = []
    current = []
    for pg in page_nums:
        for line in pages_text[pg].split('\n'):
            l = line.strip()
            if not l:
                if current:
                    paras.append(' '.join(current))
                    current = []
            else:
                if 'City of Seattle' in l and 'Adopted Budget' in l:
                    continue
                current.append(l)
    if current:
        paras.append(' '.join(current))
    return paras

# Pages 43-47 use "Source Name. Description..." with no blank lines between paragraphs.
# Strategy: concatenate all lines, then split on lines that start a new named section
# (a line starting with a title phrase "Word(s). Capital-letter-start").

PARA_START = re.compile(r'^([A-Z][A-Za-z0-9 ,/\-–&()\']+)\.\s+[A-Z]')
PAGE_FOOTER = re.compile(r'^City of Seattle.*Adopted Budget\s+\d+$')

gf_source_descs = {}   # name_lower → (name, description)
all_named_paras = []

for pg in range(43, 48):
    raw_lines = [l.strip() for l in pages_text[pg].split('\n')]
    # Group lines into named sections
    current_name = None
    current_lines = []
    for line in raw_lines:
        if PAGE_FOOTER.match(line) or not line:
            continue
        m = PARA_START.match(line)
        if m:
            # Save previous section
            if current_name and current_lines:
                desc = clean(' '.join(current_lines)[:900])
                gf_source_descs[current_name.lower()] = (current_name, desc)
                all_named_paras.append((current_name, desc))
            current_name = clean(m.group(1))
            current_lines = [line]
        else:
            if current_name:
                current_lines.append(line)
    # Save last section on this page
    if current_name and current_lines:
        # Check if this section continues on next page (don't save yet — will merge)
        desc = clean(' '.join(current_lines)[:900])
        # Only save if we haven't seen this source yet (avoid overwrite with truncated version)
        if current_name.lower() not in gf_source_descs:
            gf_source_descs[current_name.lower()] = (current_name, desc)
            all_named_paras.append((current_name, desc))

print(f"Named source descriptions found: {len(gf_source_descs)}")
for name, _ in all_named_paras:
    print(f"  - {name}")

# Match GF revenue rows to their descriptions
# Explicit name normalization: CSV table names → narrative section names
GF_NAME_MAP = {
    'sales & use tax': 'sales and use tax',
    'sales & use tax - criminal justice': 'sales and use tax',
    'business & occupation tax': 'business and occupation (b&o) tax',
    'utilities business tax - private utilities': 'utility business tax – private utilities',
    'utilities business tax - city light': 'utility business tax – public utilities',
    'utilities business tax - city swu': 'utility business tax – public utilities',
    'utilities business tax - city water': 'utility business tax – public utilities',
    'utilities business tax - drainage/waste water': 'utility business tax – public utilities',
    'utility tax - private total': 'utility business tax – private utilities',
    'utility tax - public total': 'utility business tax – public utilities',
    'transportation network company tax': 'transportation network company tax',
    'parking meters': 'parking meters',
    'meter hood service': 'parking meters',
    'court fines': 'court fines',
    'court fees & charges': 'court fines',
    'adult probation and parole': 'court fines',
    'gambling tax': 'gambling tax',
    'leasehold excise tax': 'leasehold excise tax',
    'pleasure boat tax': 'leasehold excise tax',
    'interest on investments': 'interest income',
    'other interest earnings': 'interest income',
    'federal direct grants': 'grant revenues',
    'federal indirect grants': 'grant revenues',
    'other grants': 'grant revenues',
    'state and local grants': 'grant revenues',
    'transfer from - payroll expense tax fund': 'jumpstart payroll expense tax fund',
    'transfer from - other fund': 'fund balance transfers',
    'cost allocations & administrative charges': 'service charges and reimbursements',
    'legal services': 'service charges and reimbursements',
    'personnel service charges': 'service charges and reimbursements',
    'public safety enforcement': 'service charges and reimbursements',
    'use charges': 'service charges and reimbursements',
    'service charges & reimbursements': 'service charges and reimbursements',
    'business license fees': 'licenses and permits',
    'professional & occupational licenses': 'licenses and permits',
    'other business licenses, permits, & fees': 'licenses and permits',
    'animal shelter licenses & fees': 'licenses and permits',
    'emergency alarm fees': 'licenses and permits',
    'fire permits & fees': 'licenses and permits',
    'street use permits': 'licenses and permits',
    'miscellaneous revenue': 'service charges and reimbursements',
    'revenue from other public entities': 'service charges and reimbursements',
    'criminal justice assistance': 'grant revenues',
    'liquor board profits': 'service charges and reimbursements',
    'liquor excise tax': 'service charges and reimbursements',
    'marijuana excise tax': 'service charges and reimbursements',
    'trial court improvement account': 'service charges and reimbursements',
    'e-911 reimbursements & cellular tax': 'service charges and reimbursements',
    'tonnage tax': 'leasehold excise tax',
    'firearms & ammunition tax': 'leasehold excise tax',
    'firearms & ammunition tax': 'leasehold excise tax',
    'payroll expense tax': 'jumpstart payroll expense tax fund',
}

def match_desc(revenue_source):
    src_l = revenue_source.lower()
    # Try exact match
    if src_l in gf_source_descs:
        return gf_source_descs[src_l][1]
    # Try explicit name map
    mapped = GF_NAME_MAP.get(src_l)
    if mapped and mapped in gf_source_descs:
        return gf_source_descs[mapped][1]
    # Try partial containment
    for key, (name, desc) in gf_source_descs.items():
        if key in src_l or src_l in key:
            return desc
    return ''

for row in gf_revenue_rows:
    row['description'] = match_desc(row['revenue_source'])

# ── Section 3: Multi-Department Revenue (pages 49-51) ────────────────────────
# These pages use the same "Title. Description" paragraph format as pages 43-47.
# Extract named sections from pages 49-51 the same way.

multi_named = {}  # name_lower → (name, desc)
for pg in range(49, 52):
    raw_lines = [l.strip() for l in pages_text[pg].split('\n')]
    current_name = None
    current_lines = []
    for line in raw_lines:
        if PAGE_FOOTER.match(line) or not line:
            continue
        m = PARA_START.match(line)
        if m:
            if current_name and current_lines:
                desc = clean(' '.join(current_lines)[:1200])
                key = current_name.lower()
                if key in multi_named:
                    # Extend existing description (paragraph continues across pages)
                    multi_named[key] = (current_name, multi_named[key][1] + ' ' + desc)
                else:
                    multi_named[key] = (current_name, desc)
            current_name = clean(m.group(1))
            current_lines = [line]
        else:
            if current_name:
                current_lines.append(line)
    if current_name and current_lines:
        desc = clean(' '.join(current_lines)[:1200])
        key = current_name.lower()
        if key in multi_named:
            multi_named[key] = (current_name, multi_named[key][1] + ' ' + desc)
        else:
            multi_named[key] = (current_name, desc)

# Also add these to gf_source_descs for cross-reference
gf_source_descs.update(multi_named)

MULTI_DEPT_FUND_MAP = {
    'Payroll Expense Tax': ['payroll expense tax', 'jumpstart payroll expense tax fund'],
    'Sweetened Beverage Tax Fund': ['sweetened beverage tax fund', 'sweetened beverage tax'],
    'Short-Term Rental Tax Fund': ['short-term rental tax fund', 'short-term rental tax'],
    'Arts and Culture Fund': ['arts and culture fund - admission tax', 'admissions tax'],
    'Transportation Benefit District Fund': ['transportation benefit district'],
}

multi_dept_rows = []
for fund_name, lookup_keys in MULTI_DEPT_FUND_MAP.items():
    desc = ''
    for lk in lookup_keys:
        if lk in multi_named:
            desc = multi_named[lk][1]
            break
        if lk in gf_source_descs:
            desc = gf_source_descs[lk][1]
            break
    if desc:
        multi_dept_rows.append({
            'fund_name': fund_name,
            'fund_code': '',
            'revenue_source': fund_name + ' (revenue source)',
            'act2024_k': None, 'adp2025_k': None, 'end2026_k': None,
            'rev2025_k': None, 'adp2026_k': None,
            'description': desc,
        })

print(f"Multi-dept fund rows: {len(multi_dept_rows)}")

# ── Section 4: Reserve and Bond fund descriptions (pages 52-55) ──────────────
reserve_paras = extract_paragraphs(range(52, 56))

RESERVE_FUNDS = {
    'Emergency Fund': ['emergency fund', 'emergency reserve'],
    'Revenue Stabilization Fund': ['revenue stabilization fund', 'rainy day'],
    'UTGO Bond Interest Redemption Fund': ['unlimited tax general obligation', 'utgo bond'],
    'LTGO Bond Interest and Redemption Fund': ['limited tax general obligation', 'ltgo bond', 'councilmanic'],
}

reserve_rows = []
for fund_name, keywords in RESERVE_FUNDS.items():
    matched = []
    for para in reserve_paras:
        para_l = para.lower()
        if any(kw in para_l for kw in keywords) and len(para) > 100:
            matched.append(para)
    if matched:
        combined = ' '.join(matched[:2])
        reserve_rows.append({
            'fund_name': fund_name,
            'fund_code': '',
            'revenue_source': 'Reserve/Bond fund',
            'act2024_k': None, 'adp2025_k': None, 'end2026_k': None,
            'rev2025_k': None, 'adp2026_k': None,
            'description': clean(combined[:1200]),
        })

print(f"Reserve/Bond fund rows: {len(reserve_rows)}")

# ── Section 5: Enterprise fund descriptions (dept overview pages) ─────────────
ENTERPRISE_DEPTS = {
    'Light Fund': (394, 'Seattle City Light'),
    'Drainage and Wastewater Fund': (415, 'Seattle Public Utilities'),
    'Water Fund': (415, 'Seattle Public Utilities'),
    'Solid Waste Fund': (415, 'Seattle Public Utilities'),
    'Library Fund': (None, 'The Seattle Public Library'),
    'Seattle Center Fund': (107, 'Seattle Center'),
    'Construction and Inspections': (None, 'Seattle Department of Construction and Inspections'),
    'Finance and Administrative Services Fund': (535, 'Department of Finance and Administrative Services'),
    'Information Technology Fund': (634, 'Seattle Information Technology Department'),
}

# Find dept overview pages we haven't already scanned
with pdfplumber.open(PDF) as pdf:
    for fund_name, (pg_hint, dept_name) in ENTERPRISE_DEPTS.items():
        if pg_hint:
            text = pages_text.get(pg_hint, '')
        else:
            # Search for the dept overview
            text = ''
            for pg_num, pg_text in pages_text.items():
                if dept_name in pg_text and 'Department Overview' in pg_text:
                    text = pg_text
                    break
        if not text:
            continue
        # Extract the Department Overview paragraph(s)
        lines = text.split('\n')
        in_overview = False
        overview_lines = []
        for line in lines:
            l = line.strip()
            if 'Department Overview' in l:
                in_overview = True
                continue
            if in_overview:
                if l.startswith('Budget Snapshot') or l.startswith('Budget Overview'):
                    break
                if l and 'City of Seattle' not in l:
                    overview_lines.append(l)
        if overview_lines:
            desc = clean(' '.join(overview_lines)[:1200])
            ENTERPRISE_DEPTS[fund_name] = (pg_hint, dept_name, desc)

enterprise_rows = []
for fund_name, info in ENTERPRISE_DEPTS.items():
    if len(info) == 3:
        _, dept_name, desc = info
        enterprise_rows.append({
            'fund_name': fund_name,
            'fund_code': '',
            'revenue_source': 'Ratepayer / Departmental Revenue',
            'act2024_k': None, 'adp2025_k': None, 'end2026_k': None,
            'rev2025_k': None, 'adp2026_k': None,
            'description': desc,
        })

print(f"Enterprise fund rows: {len(enterprise_rows)}")

# ── Section 6: Human Services, Housing, Parks, Library narrative descriptions
# Pull from their dept overview pages
SPECIAL_DEPTS = {
    'Human Services Fund': 'Human Services Department',
    'Low Income Housing Fund': 'Office of Housing',
    'Park And Recreation Fund': 'Seattle Parks and Recreation',
    'Seattle Park District Fund': 'Seattle Parks and Recreation',
    'Transportation Fund': 'Seattle Department of Transportation',
    'Transportation Benefit District Fund': 'Seattle Department of Transportation',
    'Transportation Levy Fund': 'Seattle Department of Transportation',
    'Arts and Culture Fund': 'Office of Arts and Culture',
    'FEPP Levy 2025': 'Department of Education and Early Learning',
    'Families Education Preschool Promise Levy': 'Department of Education and Early Learning',
    'Sweetened Beverage Tax Fund': 'Human Services Department',
    'Short-Term Rental Tax Fund': 'Office of Planning and Community Development',
}

special_rows = []
dept_desc_cache = {}

for fund_name, dept_name in SPECIAL_DEPTS.items():
    if dept_name in dept_desc_cache:
        desc = dept_desc_cache[dept_name]
    else:
        desc = ''
        for pg_num, pg_text in pages_text.items():
            if dept_name in pg_text and 'Department Overview' in pg_text:
                lines = pg_text.split('\n')
                in_overview = False
                overview_lines = []
                for line in lines:
                    l = line.strip()
                    if 'Department Overview' in l:
                        in_overview = True
                        continue
                    if in_overview:
                        if l.startswith('Budget Snapshot') or l.startswith('Budget Overview') or l.startswith('The following'):
                            break
                        if l and 'City of Seattle' not in l:
                            overview_lines.append(l)
                if overview_lines:
                    desc = clean(' '.join(overview_lines[:8])[:800])
                    dept_desc_cache[dept_name] = desc
                    break
    if desc:
        special_rows.append({
            'fund_name': fund_name,
            'fund_code': '',
            'revenue_source': 'Special purpose / levy',
            'act2024_k': None, 'adp2025_k': None, 'end2026_k': None,
            'rev2025_k': None, 'adp2026_k': None,
            'description': desc,
        })

print(f"Special purpose fund rows: {len(special_rows)}")

# ── Section 7: Internal service fund descriptions ─────────────────────────────
INTERNAL_FUNDS = {
    'Health Care Fund': ('Department of Human Resources',
        'Internal service fund covering employee and retiree health insurance costs citywide. '
        'Funded by contributions from all City departments based on headcount and benefits elections.'),
    'Industrial Insurance Fund': ('Department of Human Resources',
        'Internal service fund covering workers compensation claims and industrial insurance costs '
        'for all City employees. Funded by charges to departments based on payroll and claims experience.'),
    'Group Term Life Fund': ('Department of Human Resources',
        'Internal service fund covering group term life insurance premiums for City employees. '
        'Funded by departmental contributions based on employee classifications.'),
    'Unemployment Insurance Fund': ('Department of Human Resources',
        'Internal service fund covering unemployment insurance costs for former City employees. '
        'Funded by contributions from all City departments.'),
    'Fleet Capital Fund': ('Department of Finance and Administrative Services',
        'Internal service fund for vehicle and equipment acquisition and replacement across the City fleet. '
        'Funded by departmental charges based on fleet usage.'),
    'Judgment/Claims Fund': ('Department of Finance and Administrative Services',
        'Citywide reserve fund that pays legal judgments and settlements against the City. '
        'Funded by contributions from all departments based on actuarial risk assessment.'),
}

internal_rows = []
for fund_name, (dept_name, base_desc) in INTERNAL_FUNDS.items():
    # Try to get dept overview description to supplement
    desc = base_desc
    if dept_name in dept_desc_cache:
        dept_overview = dept_desc_cache[dept_name]
        if dept_overview:
            desc = desc + ' Additional context: ' + dept_overview[:300]
    internal_rows.append({
        'fund_name': fund_name,
        'fund_code': '',
        'revenue_source': 'Internal service charges',
        'act2024_k': None, 'adp2025_k': None, 'end2026_k': None,
        'rev2025_k': None, 'adp2026_k': None,
        'description': clean(desc),
    })

# Pension funds
PENSION_FUNDS = [
    ("Fireman's Pension Fund",
     "Pension fund for retired Seattle firefighters. Funded by City contributions, "
     "employee contributions, and investment earnings to meet actuarially determined obligations."),
    ('Police Relief & Pension Fund',
     'Pension fund for retired Seattle police officers hired before the state pension system. '
     'Funded by City contributions and investment earnings.'),
    ("Employees' Retirement Fund",
     'Seattle City Employees Retirement System (SCERS) fund. Funded by employee and employer '
     'contributions based on actuarially determined rates to provide defined benefit pensions.'),
]
for fund_name, desc in PENSION_FUNDS:
    internal_rows.append({
        'fund_name': fund_name,
        'fund_code': '',
        'revenue_source': 'Employer / employee contributions',
        'act2024_k': None, 'adp2025_k': None, 'end2026_k': None,
        'rev2025_k': None, 'adp2026_k': None,
        'description': clean(desc),
    })

# ── Also scrape revenue source descriptions from p40 intro paragraph ──────────
# Page 40 explicitly names the funds covered in the revenue section
p40_lines = get_lines(40)
p40_intro = ' '.join(p40_lines[:10])  # First few lines are the intro

# ── Write fund_sources.csv ────────────────────────────────────────────────────
all_rows = gf_revenue_rows + multi_dept_rows + reserve_rows + enterprise_rows + special_rows + internal_rows

COLUMNS = ['fund_name', 'fund_code', 'revenue_source', 'description',
           'act2024_k', 'adp2025_k', 'end2026_k', 'rev2025_k', 'adp2026_k']

with open(OUT_SOURCES, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=COLUMNS)
    writer.writeheader()
    for row in all_rows:
        writer.writerow({col: row.get(col, '') for col in COLUMNS})

print(f"\nWrote fund_sources.csv: {len(all_rows)} rows → {OUT_SOURCES}")

# ── Write fund_descriptions.csv ───────────────────────────────────────────────
# One row per fund: name, code, category, combined description, source page(s)
# Deduplicate: if a fund appears in multiple sections, combine the descriptions

from collections import defaultdict

def categorize(n):
    n = n.lower()
    if 'general fund' in n:                        return 'General Fund'
    if any(x in n for x in ['light fund','drainage','wastewater','water fund','solid waste']): return 'Utilities'
    if any(x in n for x in ['levy','benefit district','park district','fepp','sweetened',
                              'short-term rental','camera','payroll expense','jumpstart']):  return 'Levies & Special Taxes'
    if any(x in n for x in ['health care','information technology','finance and admin',
                              'industrial insurance','fleet','group term life',
                              'unemployment','transit benefit','fire fighters']):            return 'Internal Service'
    if any(x in n for x in ['pension','retirement','police relief']):                       return 'Pensions & Benefits'
    if any(x in n for x in ['bond','reet','ltgo','utgo','redemption','cumulative reserve',
                              'judgment']):                                                  return 'Bonds & Reserves'
    return 'Special Purpose'

fund_descs = defaultdict(list)
for row in all_rows:
    if row.get('description'):
        fund_descs[row['fund_name']].append(row['description'])

desc_rows = []
for fund_name, descs in sorted(fund_descs.items()):
    combined = ' | '.join(dict.fromkeys(descs))  # deduplicate preserving order
    desc_rows.append({
        'fund_name': fund_name,
        'fund_code': next((r['fund_code'] for r in all_rows if r['fund_name'] == fund_name and r.get('fund_code')), ''),
        'category': categorize(fund_name),
        'description': clean(combined[:2000]),
        'revenue_sources_count': sum(1 for r in all_rows if r['fund_name'] == fund_name),
    })

with open(OUT_DESC, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['fund_name','fund_code','category','description','revenue_sources_count'])
    writer.writeheader()
    writer.writerows(desc_rows)

print(f"Wrote fund_descriptions.csv: {len(desc_rows)} funds → {OUT_DESC}")
print("\nSummary:")
print(f"  General Fund revenue line items: {len(gf_revenue_rows)}")
print(f"  Multi-dept fund rows: {len(multi_dept_rows)}")
print(f"  Reserve/Bond rows: {len(reserve_rows)}")
print(f"  Enterprise fund rows: {len(enterprise_rows)}")
print(f"  Special purpose rows: {len(special_rows)}")
print(f"  Internal/pension rows: {len(internal_rows)}")
print(f"  Total source rows: {len(all_rows)}")
print(f"  Unique funds with descriptions: {len(desc_rows)}")
