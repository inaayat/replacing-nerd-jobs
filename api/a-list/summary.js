import { getAuth } from '../../lib/neon-auth.js';
import { upsertUser, listWatches, getMembership } from '../../lib/a-list.js';
import {
  computeSummary,
  theaterStats,
  formatStats,
  rewatchList,
  ratingDistribution,
} from '../../lib/a-list-billing.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_BASE_URL) {
    res.status(503).json({ error: 'Database or auth not configured.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  try {
    const userId = await upsertUser(auth);
    const [watches, membership] = await Promise.all([
      listWatches(userId),
      getMembership(userId),
    ]);
    const normalized = watches.map((w) => ({
      watched_on: w.watched_on,
      title: w.title,
      tmdb_id: w.tmdb_id,
      location: w.location,
      format: w.format || '',
      saw_alone: !!w.saw_alone,
      ticket_cents: w.ticket_cents,
      rating: w.rating != null ? Number(w.rating) : null,
      dnf: !!w.dnf,
    }));

    const summary = computeSummary(normalized, membership);
    res.status(200).json({
      summary,
      theaters: theaterStats(normalized),
      formats: formatStats(normalized),
      rewatches: rewatchList(normalized),
      ratings: ratingDistribution(normalized),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
