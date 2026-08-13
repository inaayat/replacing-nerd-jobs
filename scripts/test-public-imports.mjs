/**
 * Guards the boundary between browser-loaded modules and server-only code.
 *
 * `outputDirectory: "."` serves the whole repo statically, but `middleware.js`
 * 404s everything under `/lib/` so server modules aren't readable as plain
 * text. A browser module that imports from `lib/` therefore resolves to a 404
 * at runtime and takes its whole page down silently — which is exactly what
 * happened to Plot Points when the `/lib/` block landed.
 *
 * This walks every statically served `.js`/`.html` file, resolves the imports
 * a browser would actually issue, and fails on anything unreachable.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Directories the browser never loads from: server code, tooling, vendored
// deps, and the frozen v1 site.
const SKIP_DIRS = new Set([
  '.git', '.github', '.vercel', 'node_modules', 'api', 'lib', 'scripts',
  'archive', 'test-results', 'fonts', 'index support files',
]);

// Files that live in served directories but the browser never loads:
// middleware runs at the edge, and _template.html is a scaffold whose relative
// paths are written for the subdirectory it gets copied into.
const SKIP_FILES = new Set(['middleware.js', '_template.html']);

// Paths that middleware.js makes unreachable to the browser.
const BLOCKED_PREFIXES = ['lib/'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (['.js', '.mjs', '.html'].includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/** Static `import ... from '<x>'`, bare `import '<x>'`, and `import('<x>')`. */
function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bimport\s[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function exportedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  )) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim();
      if (!bits) continue;
      const as = bits.match(/\sas\s+([A-Za-z_$][\w$]*)$/);
      names.add(as ? as[1] : bits.split(/\s+/)[0]);
    }
  }
  return names;
}

function namedImports(source) {
  const out = [];
  for (const m of source.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const names = [];
    for (const part of m[1].split(',')) {
      const bits = part.trim();
      if (!bits) continue;
      names.push(bits.split(/\s+as\s+/)[0].trim());
    }
    out.push({ spec: m[2], names: names.filter(Boolean) });
  }
  return out;
}

/** `<script src>` and `<link href>` for same-origin assets. */
function htmlAssetPaths(source) {
  const paths = [];
  for (const pattern of [
    /<script[^>]+src\s*=\s*["']([^"']+)["']/gi,
    /<link[^>]+href\s*=\s*["']([^"']+)["']/gi,
  ]) {
    for (const match of source.matchAll(pattern)) paths.push(match[1]);
  }
  return paths;
}

const failures = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP_FILES.has(rel)) continue;
  const source = readFileSync(file, 'utf8');
  const specs = extname(file) === '.html'
    ? [...htmlAssetPaths(source), ...importSpecifiers(source)]
    : importSpecifiers(source);

  for (const spec of specs) {
    // Only same-origin relative paths are our problem; CDN and absolute URLs
    // are resolved by the browser against another host.
    if (!spec.startsWith('./') && !spec.startsWith('../') && !spec.startsWith('/')) continue;
    if (spec.startsWith('//')) continue;

    const target = spec.startsWith('/')
      ? join(ROOT, spec.slice(1))
      : resolve(dirname(file), spec);
    const targetRel = relative(ROOT, target);

    if (BLOCKED_PREFIXES.some((prefix) => targetRel.startsWith(prefix))) {
      failures.push(`${rel} imports ${spec} → /${targetRel} is 404'd by middleware.js`);
      continue;
    }
    // A relative path that doesn't exist on disk is a 404 for the same reason.
    if (extname(target) && !existsSync(target)) {
      failures.push(`${rel} references ${spec} → ${targetRel} does not exist`);
    }
  }

  if (extname(file) === '.js') {
    for (const { spec, names } of namedImports(source)) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
      const target = resolve(dirname(file), spec);
      if (extname(target) !== '.js' || !existsSync(target)) continue;
      const exported = exportedNames(readFileSync(target, 'utf8'));
      for (const name of names) {
        if (!exported.has(name)) {
          failures.push(
            `${rel} imports ${name} from ${spec} but ${relative(ROOT, target)} does not export it`
          );
        }
      }
    }
  }
}

assert.deepEqual(failures, [], `\nUnreachable browser imports:\n  ${failures.join('\n  ')}\n`);

console.log('public import boundary tests passed');
