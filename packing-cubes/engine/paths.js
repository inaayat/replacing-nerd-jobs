// Resolve cube JSON paths from the engine module location (not the page URL).
const CUBES_DIR = new URL('../cubes/', import.meta.url);

export const catalogUrl = new URL('index.json', CUBES_DIR).href;

export function cubeJsonUrl(id) {
  return new URL(`${encodeURIComponent(id)}.json`, CUBES_DIR).href;
}

/** For inline/page scripts where import.meta.url is the HTML document. */
export function cubesBaseFromPage() {
  const path = location.pathname;
  if (path.endsWith('/')) return path;
  if (/\.[a-z0-9]+$/i.test(path.split('/').pop() || '')) {
    return path.replace(/\/[^/]*$/, '/');
  }
  return `${path}/`;
}
