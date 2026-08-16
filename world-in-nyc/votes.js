/**
 * 2025 NYC mayor general — helpers for ED tallies and enclave rollups.
 * Browser-safe ESM. Keys: Mamdani, Cuomo, Sliwa, Other (Adams + minors + scattered).
 */

export const CANDIDATES = [
  { id: 'm', label: 'Mamdani', color: '#cf4520' },
  { id: 'c', label: 'Cuomo', color: '#3d6ea8' },
  { id: 's', label: 'Sliwa', color: '#e3a72e' },
  { id: 'o', label: 'Other', color: '#6b5f5e' },
];

const SKIP_UNITS = new Set([
  'Public Counter',
  'Manually Counted Emergency',
  'Absentee / Military',
  'Affidavit',
]);

export function emptyVec() {
  return [0, 0, 0, 0];
}

export function addVec(a, b) {
  a[0] += b[0];
  a[1] += b[1];
  a[2] += b[2];
  a[3] += b[3];
  return a;
}

export function totalOf(vec) {
  return (vec[0] || 0) + (vec[1] || 0) + (vec[2] || 0) + (vec[3] || 0);
}

export function bucketUnit(name) {
  if (!name || SKIP_UNITS.has(name)) return -1;
  const n = name.toLowerCase();
  if (n.startsWith('zohran')) return 0;
  if (n.startsWith('andrew')) return 1;
  if (n.startsWith('curtis')) return 2;
  return 3;
}

export function winnerOf(vec) {
  const t = totalOf(vec);
  if (!t) return '';
  let best = 0;
  for (let i = 1; i < 4; i++) if (vec[i] > vec[best]) best = i;
  let ties = 0;
  for (let i = 0; i < 4; i++) if (vec[i] === vec[best]) ties += 1;
  if (ties > 1) return 't';
  return CANDIDATES[best].id;
}

export function winnerMatchExpr(candidates = CANDIDATES) {
  const expr = ['match', ['get', 'w']];
  for (const c of candidates) expr.push(c.id, c.color);
  expr.push('#cfc6b8');
  return expr;
}

export function shareLine(vec, candidates = CANDIDATES) {
  const t = totalOf(vec);
  if (!t) return '';
  return candidates
    .map((c, i) => ({ label: c.label, n: vec[i], pct: Math.round((100 * vec[i]) / t) }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => `${x.label} ${x.pct}%`)
    .join(' · ');
}

export function voteBarHtml(vec, candidates = CANDIDATES, caption = '2025 mayor') {
  const t = totalOf(vec);
  if (!t) return `<p class="mono">${caption}: no recorded votes</p>`;
  const segs = candidates.map((c, i) => {
    const pct = (100 * vec[i]) / t;
    if (pct < 0.5) return '';
    return `<i style="flex:${vec[i]};background:${c.color}" title="${c.label} ${pct.toFixed(1)}%"></i>`;
  }).join('');
  return `<div class="win-vote"><div class="win-vote-cap mono">${caption}</div><div class="win-vote-bar" aria-hidden="true">${segs}</div><div class="mono">${shareLine(vec, candidates)}</div></div>`;
}

export function lookupEd(votes, ed) {
  if (!votes?.byEd || ed == null) return null;
  return votes.byEd[String(ed)] || votes.byEd[ed] || null;
}

export function tagVoteWinners(features, votes) {
  for (const f of features) {
    const vec = lookupEd(votes, f.properties.ed);
    f.properties.w = vec ? winnerOf(vec) : '';
  }
  return features;
}

export function rollupEnclaves(features, enclaves, byEd) {
  const out = {};
  for (const enc of enclaves) {
    if (enc.status === 'historic') continue;
    const i = enclaves.indexOf(enc);
    const primary = emptyVec();
    const all = emptyVec();
    let nPrimary = 0;
    let nAll = 0;
    for (const f of features) {
      const p = f.properties;
      const vec = byEd[String(p.ed)];
      if (!vec || !totalOf(vec)) continue;
      if ((p.ec || []).includes(i)) {
        addVec(all, vec);
        nAll += 1;
      }
      if (p.pc === i) {
        addVec(primary, vec);
        nPrimary += 1;
      }
    }
    out[enc.id] = {
      primary: { v: primary, n: nPrimary },
      all: { v: all, n: nAll },
    };
  }
  return out;
}
