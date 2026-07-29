#!/usr/bin/env python3
"""Convert A-List Tracking.xlsx Movies sheet to import JSON.

Usage:
  pip install openpyxl
  python3 scripts/convert-alist-xlsx.py path/to/A-List\\ Tracking.xlsx > scripts/data/movies-bill.json
"""
import json
import re
import sys
from datetime import date, datetime

try:
    import openpyxl
except ImportError:
    sys.exit('pip install openpyxl')


def to_iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    m = re.match(r'(\d{4}-\d{2}-\d{2})', str(value))
    return m.group(1) if m else None


def money_cents(value):
    if value in (None, ''):
        return None
    n = float(str(value).replace('$', '').replace(',', ''))
    return int(round(n * 100))


def cell_text(value):
    if value in (None, ''):
        return None
    s = str(value).strip()
    return s[:-2] if s.endswith('.0') else s


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: convert-alist-xlsx.py <xlsx-path>')

    wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
    ws = wb['Movies']
    watches = []

    for row in ws.iter_rows(min_row=2, max_col=11, values_only=True):
        watched_on = to_iso(row[0])
        title = str(row[3] or '').strip()
        if not watched_on or not title:
            continue
        rating_raw = row[10]
        dnf = str(rating_raw).upper() == 'DNF'
        watches.append({
            'watched_on': watched_on,
            'title': title,
            'location': str(row[4] or '').strip() or None,
            'format': str(row[5] or '').strip(),
            'saw_alone': str(row[6] or '').upper() == 'X',
            'auditorium': cell_text(row[7]),
            'seat': cell_text(row[8]),
            'ticket_cents': money_cents(row[9]),
            'rating': None if dnf else (float(rating_raw) if rating_raw not in (None, '') and not dnf else None),
            'dnf': dnf,
        })

    json.dump(watches, sys.stdout, indent=2)
    print(file=sys.stderr)


if __name__ == '__main__':
    main()
