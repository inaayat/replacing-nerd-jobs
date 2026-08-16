/**
 * Map Wikipedia enclave groups to origin countries (ISO 3166-1 alpha-3).
 * Used by the world map: shade a country if NYC has a listed enclave from it.
 *
 * Browser-safe ESM. Diaspora groups without a single origin country
 * (generic Jewish, Romani, African American Great Migration) are left unmapped.
 */
export const GROUP_COUNTRIES = {
  Liberian: ['LR'],
  'West African': ['SN', 'ML', 'GN', 'CI'],
  'Guyanese / Trinidadian / Surinamese': ['GY', 'TT', 'SR'],
  Jamaican: ['JM'],
  Haitian: ['HT'],
  Bangladeshi: ['BD'],
  Indian: ['IN'],
  'Indian / Sikh': ['IN'],
  Pakistani: ['PK'],
  'Sri Lankan': ['LK'],
  Chinese: ['CN'],
  'Chinese (Fuzhou)': ['CN'],
  Japanese: ['JP'],
  Korean: ['KR'],
  Filipino: ['PH'],
  Vietnamese: ['VN'],
  Albanian: ['AL'],
  French: ['FR'],
  German: ['DE'],
  Greek: ['GR'],
  Hungarian: ['HU'],
  Irish: ['IE'],
  Italian: ['IT'],
  Maltese: ['MT'],
  Cypriot: ['CY'],
  'Norwegian / Scandinavian': ['NO', 'SE', 'DK'],
  Finnish: ['FI'],
  'Swedish / Scandinavian': ['SE', 'NO', 'DK'],
  Polish: ['PL'],
  Russian: ['RU'],
  Serbian: ['RS'],
  Ukrainian: ['UA'],
  Spanish: ['ES'],
  Croatian: ['HR'],
  Romanian: ['RO'],
  Brazilian: ['BR'],
  Colombian: ['CO'],
  Dominican: ['DO'],
  Ecuadorian: ['EC'],
  Mexican: ['MX'],
  'Puerto Rican': ['PR'],
  Salvadoran: ['SV'],
  Guatemalan: ['GT'],
  Honduran: ['HN'],
  'Argentinian / Uruguayan / Peruvian': ['AR', 'UY', 'PE'],
  'Syrian / Lebanese': ['SY', 'LB'],
  'Arab / Lebanese / Syrian': ['LB', 'SY'],
  Arab: ['LB', 'SY', 'JO', 'EG'],
  Yemeni: ['YE'],
  'Egyptian / Maghrebi': ['EG', 'DZ', 'MA', 'TN'],
  'Coptic Egyptian': ['EG'],
  Palestinian: ['PS'],
  Israeli: ['IL'],
  Iranian: ['IR'],
  Armenian: ['AM'],
  Australian: ['AU'],
};

/** Natural Earth 110m uses these ADM0/ISO codes instead of strict ISO-3166. */
export const ISO_ALIASES = {
  MT: 'MLT',
  CY: 'CYP',
  PS: 'PSE',
  PR: 'PRI',
  SN: 'SEN',
  ML: 'MLI',
  GN: 'GIN',
  CI: 'CIV',
  GY: 'GUY',
  TT: 'TTO',
  SR: 'SUR',
  JM: 'JAM',
  HT: 'HTI',
  BD: 'BGD',
  IN: 'IND',
  PK: 'PAK',
  LK: 'LKA',
  CN: 'CHN',
  JP: 'JPN',
  KR: 'KOR',
  PH: 'PHL',
  VN: 'VNM',
  AL: 'ALB',
  FR: 'FRA',
  DE: 'DEU',
  GR: 'GRC',
  HU: 'HUN',
  IE: 'IRL',
  IT: 'ITA',
  NO: 'NOR',
  SE: 'SWE',
  DK: 'DNK',
  FI: 'FIN',
  PL: 'POL',
  RU: 'RUS',
  RS: 'SRB',
  UA: 'UKR',
  ES: 'ESP',
  HR: 'HRV',
  RO: 'ROU',
  BR: 'BRA',
  CO: 'COL',
  DO: 'DOM',
  EC: 'ECU',
  MX: 'MEX',
  SV: 'SLV',
  GT: 'GTM',
  HN: 'HND',
  AR: 'ARG',
  UY: 'URY',
  PE: 'PER',
  SY: 'SYR',
  LB: 'LBN',
  JO: 'JOR',
  EG: 'EGY',
  YE: 'YEM',
  DZ: 'DZA',
  MA: 'MAR',
  TN: 'TUN',
  IL: 'ISR',
  IR: 'IRN',
  AM: 'ARM',
  AU: 'AUS',
  LR: 'LBR',
};

export function toIso3(code) {
  const c = String(code || '').toUpperCase();
  if (c.length === 3) return c;
  return ISO_ALIASES[c] || c;
}

export function countriesForGroup(group) {
  return (GROUP_COUNTRIES[group] || []).map(toIso3);
}

export function countryIndex(enclaves, worldFeatures = []) {
  const names = new Map();
  for (const f of worldFeatures) {
    const iso = f.properties?.iso;
    if (iso) names.set(iso, f.properties.name);
  }
  const byIso = new Map();
  for (const enc of enclaves) {
    for (const iso of countriesForGroup(enc.group)) {
      let row = byIso.get(iso);
      if (!row) {
        row = {
          iso,
          name: names.get(iso) || iso,
          regions: new Set(),
          enclaves: [],
        };
        byIso.set(iso, row);
      }
      row.regions.add(enc.region);
      if (!row.enclaves.some((e) => e.id === enc.id)) row.enclaves.push(enc);
    }
  }
  return [...byIso.values()]
    .map((row) => ({
      iso: row.iso,
      name: row.name,
      regions: [...row.regions],
      region: row.regions.size === 1 ? [...row.regions][0] : 'mixed',
      enclaves: row.enclaves,
      places: [...new Set(row.enclaves.flatMap((e) => e.places || []))],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function countryMatchExpr(countries, regionColors) {
  const expr = ['match', ['get', 'iso']];
  for (const c of countries) {
    const color = regionColors[c.region] || regionColors[c.regions[0]] || '#3d6ea8';
    expr.push(c.iso, color);
  }
  expr.push('#e8e0d2');
  return expr;
}

export function countryMatches(row, q) {
  if (!q) return true;
  const hay = `${row.name} ${row.iso} ${row.enclaves.map((e) => `${e.name} ${e.group} ${(e.places || []).join(' ')}`).join(' ')}`.toLowerCase();
  return hay.includes(q);
}
