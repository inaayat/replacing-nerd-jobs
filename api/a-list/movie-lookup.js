import { getAuth } from '../../lib/neon-auth.js';
import { db, ensureSchema } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  const q = String(req.query?.q || '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'Query q must be at least 2 characters.' });
    return;
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'TMDB_API_KEY not configured.' });
    return;
  }

  try {
    const url = new URL('https://api.themoviedb.org/3/search/movie');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('query', q);
    url.searchParams.set('include_adult', 'false');

    const tmdbRes = await fetch(url);
    if (!tmdbRes.ok) throw new Error(`TMDB request failed (${tmdbRes.status})`);
    const data = await tmdbRes.json();
    const results = (data.results || []).slice(0, 8).map((m) => ({
      tmdb_id: m.id,
      title: m.title,
      year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
      poster_path: m.poster_path,
      overview: m.overview,
    }));

    if (process.env.DATABASE_URL) {
      await ensureSchema();
      for (const m of results) {
        await db()`
          INSERT INTO alist_movie_cache (tmdb_id, title, year, poster_path, raw)
          VALUES (${m.tmdb_id}, ${m.title}, ${m.year}, ${m.poster_path}, ${JSON.stringify(m)})
          ON CONFLICT (tmdb_id) DO UPDATE SET
            title = EXCLUDED.title,
            year = EXCLUDED.year,
            poster_path = EXCLUDED.poster_path,
            fetched_at = now()
        `;
      }
    }

    res.status(200).json({ results });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
