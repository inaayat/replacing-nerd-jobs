/**
 * Homepage puzzle pieces. Short Voronoi nicks are dropped before the corner
 * cut so a triple-point spike cannot cap the radius, while remaining contact
 * points stay on the inset edge — that is what keeps the gutter.
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
const load = new Function(
  `${extractFunction(html, 'noise')}
   ${extractFunction(html, 'bboxOf')}
   ${extractFunction(html, 'smoothPoly')}
   ${extractFunction(html, 'piecePath')}
   return { noise, piecePath, smoothPoly };`
);
const { piecePath, smoothPoly } = load();

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

function allPoints(d) {
  const out = [];
  for (const curve of parseCurves(d)) out.push(...samples(curve, 20));
  return out;
}

function checkPiece(poly, seed) {
  const shape = orient(poly);
  const d = piecePath(shape, seed, 0, 0);
  assert.ok(d.endsWith('Z'), 'path closes');
  assert.ok((d.match(/C/g) || []).length >= 3, 'a cell still has corners');
  assert.equal((d.match(/Q/g) || []).length, 0, 'corners are cubics, not vertex-hugging quadratics');
  const pts = allPoints(d);
  assert.ok(pts.length > 8, 'path has samples');
  for (const p of pts) {
    assert.ok(edgeClearance(shape, p.x, p.y) >= -0.5, 'curve left the cell');
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

checkPiece(
  [
    { x: 0, y: 100 },
    { x: 220, y: 60 },
    { x: 220, y: 140 },
  ],
  9
);

{
  const rect = [
    { x: 0, y: 0 },
    { x: 220, y: 0 },
    { x: 220, y: 180 },
    { x: 0, y: 180 },
  ];
  checkPiece(rect, 4);
  const d = piecePath(orient(rect), 4, 0, 0);
  assert.equal((d.match(/C/g) || []).length, 4, 'a clean rectangle keeps four corners');
}

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

// A 12px nick at a triple point used to cap the radius. After smoothing it
// is gone, and the path stays well clear of that vertex.
const nicked = [
  { x: 0, y: 0 },
  { x: 240, y: 0 },
  { x: 228, y: 10 },
  { x: 240, y: 180 },
  { x: 0, y: 180 },
];
const nick = { x: 228, y: 10 };
const simplified = smoothPoly(orient(nicked));
assert.ok(
  simplified.every((p) => Math.hypot(p.x - nick.x, p.y - nick.y) > 4),
  'short nick should collapse into its edge'
);
const nickedPath = allPoints(piecePath(orient(nicked), 3, 0, 0));
assert.ok(minDist(nick, nickedPath) > 12, 'path still hugs the collapsed nick');

assert.equal(piecePath([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1, 0, 0), '');

console.log('homepage blob corners ok');
