/**
 * Current vs historic Wikipedia enclaves.
 * Browser-safe ESM. Historic is opt-in; the maps show current by default.
 */

export function isHistoric(enc) {
  return enc?.status === 'historic';
}

export function enclavesForEra(enclaves, includeHistoric) {
  if (includeHistoric) return enclaves;
  return enclaves.filter((enc) => !isHistoric(enc));
}

function pickPrimary(eids, enclaves, counts) {
  if (!eids.length) return { p: null, r: '', rs: [] };
  const sorted = [...eids].sort((a, b) => {
    const bboxA = enclaves[a].bbox ? 0 : 1;
    const bboxB = enclaves[b].bbox ? 0 : 1;
    if (bboxA !== bboxB) return bboxA - bboxB;
    return counts[a] - counts[b];
  });
  return {
    p: sorted[0],
    r: enclaves[sorted[0]].region,
    rs: [...new Set(eids.map((i) => enclaves[i].region))],
  };
}

/** Tag each ED with current-only enclave ids (`ec`) and primary region (`rc`). */
export function tagCurrentEnclaves(features, enclaves) {
  const counts = Array(enclaves.length).fill(0);
  for (const f of features) {
    for (const i of f.properties.e || []) {
      if (!isHistoric(enclaves[i])) counts[i] += 1;
    }
  }
  for (const f of features) {
    const e = f.properties.e || [];
    const ec = e.filter((i) => enclaves[i] && !isHistoric(enclaves[i]));
    const cur = pickPrimary(ec, enclaves, counts);
    f.properties.ec = ec;
    f.properties.rc = cur.r;
    f.properties.rsc = cur.rs;
    f.properties.pc = cur.p;
  }
  return features;
}
