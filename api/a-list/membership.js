import { getAuth } from '../../lib/neon-auth.js';
import { upsertUser, getMembership } from '../../lib/a-list.js';
import { db } from '../../lib/db.js';

export default async function handler(req, res) {
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

    if (req.method === 'GET') {
      const membership = await getMembership(userId);
      res.status(200).json({ membership });
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const promo = body.promo_cents != null ? Number(body.promo_cents) : undefined;
      const standard = body.standard_cents != null ? Number(body.standard_cents) : undefined;
      const current = body.current_cents != null ? Number(body.current_cents) : undefined;
      const bump = body.price_bump_on != null ? String(body.price_bump_on).slice(0, 10) : undefined;
      const display = body.display_name != null ? String(body.display_name).trim() : undefined;

      const existing = await getMembership(userId);
      const rows = await db()`
        UPDATE alist_membership SET
          promo_cents = ${promo ?? existing.promo_cents},
          standard_cents = ${standard ?? existing.standard_cents},
          current_cents = ${current ?? existing.current_cents},
          price_bump_on = ${bump ?? existing.price_bump_on},
          display_name = ${display ?? existing.display_name},
          updated_at = now()
        WHERE user_id = ${userId}
        RETURNING user_id, promo_cents, standard_cents, current_cents,
                  price_bump_on::text AS price_bump_on, display_name, updated_at
      `;
      res.status(200).json({ membership: rows[0] });
      return;
    }

    res.status(405).json({ error: 'Use GET or PUT.' });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
