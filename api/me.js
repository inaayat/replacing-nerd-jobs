// Returns the signed-in user's row from Neon, creating/refreshing it on
// the way (upsert keyed on the Clerk user id). This doubles as the sync
// point between Clerk and the database: every authenticated visit to the
// account page keeps email/name current, so future features can join
// their tables against users.id without a separate webhook pipeline.
import { getAuth, clerk } from '../lib/clerk.js';
import { db, ensureSchema } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET.' });
    return;
  }
  if (!process.env.CLERK_SECRET_KEY) {
    res.status(503).json({ error: 'CLERK_SECRET_KEY not configured.' });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: 'DATABASE_URL not configured.' });
    return;
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }

  try {
    // Email/name come from Clerk's API (trusted), not from the client.
    const cu = await clerk().users.getUser(auth.sub);
    const email = cu.primaryEmailAddress?.emailAddress || null;
    const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || cu.username || null;

    await ensureSchema();
    const rows = await db()`
      INSERT INTO users (id, email, name)
      VALUES (${auth.sub}, ${email}, ${name})
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = now()
      RETURNING id, email, name, created_at, last_seen_at
    `;
    res.status(200).json({ user: rows[0] });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
