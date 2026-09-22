/**
 * Homepage puzzle pieces. Each Voronoi corner is a circular fillet so an acute
 * join does not spike, while the curve still meets the inset edge — that is
 * what keeps the gutter between pieces the same width.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

function extractFunction(src, name) {
  const sig = `function ${name}(`;
  const start = src.indexOf(sig);
  assert.ok(start >= 0, `missing ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const load = new Function(`${extractFunction(html, 'noise')}\n${extractFunction(html, 'piecePath')}\nreturn { noise, piecePath };`);
const { piecePath } = load();

function orient(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a < 0 ? poly.slice().reverse() : poly;
}

function edgeClearance(poly, x, y) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const len = Math.hypot(ex, ey) || 1;
    m = Math.min(m, (ex * (y - p.y) - ey * (x - p.x)) / len);
  }
  return m;
}

function interiorAngle(poly, k) {
  const n = poly.length;
  const prev = poly[(k - 1 + n) % n];
  const v = poly[k];
  const next = poly[(k + 1) % n];
  const px = prev.x - v.x;
  const py = prev.y - v.y;
  const nx = next.x - v.x;
  const ny = next.y - v.y;
  const lp = Math.hypot(px, py) || 1;
  const ln = Math.hypot(nx, ny) || 1;
  const cos = Math.max(-1, Math.min(1, (px * nx + py * ny) / (lp * ln)));
  return Math.acos(cos);
}

function parseCurves(d) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e[+-]?\d+)?/gi);
  const curves = [];
  let i = 0;
  let cmd = '';
  let cur = null;
  const num = () => parseFloat(tokens[i++]);
  const pt = () => ({ x: num(), y: num() });
  while (tokens && i < tokens.length) {
    const t = tokens[i];
    if (/[MLCZ]/i.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === 'Z') break;
      continue;
    }
    if (cmd === 'M' || cmd === 'L') cur = pt();
    else if (cmd === 'C') {
      const c1 = pt();
      const c2 = pt();
      const b = pt();
      curves.push({ a: cur, c1, c2, b });
      cur = b;
    } else {
      throw new Error(`unexpected path command ${cmd}`);
    }
  }
  return curves;
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function quad(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function samples(curve, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(cubic(curve.a, curve.c1, curve.c2, curve.b, i / n));
  return pts;
}

function minDist(origin, pts) {
  let m = Infinity;
  for (const p of pts) m = Math.min(m, Math.hypot(p.x - origin.x, p.y - origin.y));
  return m;
}

function checkPiece(poly, seed) {
  const shape = orient(poly);
  const d = piecePath(shape, seed, 0, 0);
  assert.ok(d.endsWith('Z'), 'path closes');
  assert.equal((d.match(/C/g) || []).length, shape.length, 'one fillet per corner');
  assert.equal((d.match(/Q/g) || []).length, 0, 'corners are cubics, not vertex-hugging quadratics');
  const curves = parseCurves(d);
  assert.equal(curves.length, shape.length);

  for (let k = 0; k < shape.length; k++) {
    const curve = curves[k];
    const v = shape[k];
    const pts = samples(curve, 24);
    for (const p of pts) {
      assert.ok(edgeClearance(shape, p.x, p.y) >= -0.35, `fillet left the cell at corner ${k}`);
    }
    // Contact points sit on the inset edge, so the straight seam — and the
    // gutter it leaves — does not move when the corner rounds.
    assert.ok(Math.abs(edgeClearance(shape, curve.a.x, curve.a.y)) < 0.35, 'entry leaves the edge');
    assert.ok(Math.abs(edgeClearance(shape, curve.b.x, curve.b.y)) < 0.35, 'exit leaves the edge');

    const fillet = minDist(v, pts);
    const old = [];
    for (let i = 0; i <= 24; i++) old.push(quad(curve.a, v, curve.b, i / 24));
    const spiked = minDist(v, old);
    const theta = interiorAngle(shape, k);
    // Obtuse joins were already soft. The spikes are the acute ones, where a
    // control point sitting on the vertex used to pull the curve back out.
    if (theta < (100 * Math.PI) / 180) {
      assert.ok(fillet > spiked * 1.15, `corner ${k} still spikes (${fillet.toFixed(1)} vs ${spiked.toFixed(1)})`);
    }
    if (theta < (45 * Math.PI) / 180) {
      assert.ok(fillet > spiked * 1.45, `acute corner ${k} is still a point`);
    }
  }
}

checkPiece(
  [
    { x: 0, y: 0 },
    { x: 240, y: 28 },
    { x: 210, y: 190 },
    { x: 30, y: 150 },
  ],
  1
);

// A hairline tip, the kind of Voronoi join that used to read as a sharp point.
checkPiece(
  [
    { x: 0, y: 100 },
    { x: 220, y: 60 },
    { x: 220, y: 140 },
  ],
  9
);

checkPiece(
  [
    { x: 0, y: 0 },
    { x: 220, y: 0 },
    { x: 220, y: 180 },
    { x: 0, y: 180 },
  ],
  4
);

checkPiece(
  [
    { x: 10, y: 80 },
    { x: 140, y: 8 },
    { x: 300, y: 40 },
    { x: 340, y: 200 },
    { x: 180, y: 280 },
    { x: 40, y: 220 },
  ],
  7
);

// A vertex sitting almost on the line of its neighbours must not balloon
// outside the cell. The seam still has somewhere to land.
checkPiece(
  [
    { x: 0, y: 80 },
    { x: 160, y: -3 },
    { x: 320, y: 80 },
    { x: 260, y: 220 },
    { x: 40, y: 220 },
  ],
  2
);

assert.equal(piecePath([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1, 0, 0), '');

console.log('homepage blob corners ok');
