import { db, ensureSchema } from './db.js';
import { emptySheet, normalizeSheet } from '../table-manners/engine/sheet.js';

export async function getSheet(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT payload, updated_at
    FROM table_manners_sheets
    WHERE user_id = ${userId}
  `;
  if (!rows.length) {
    return { sheet: emptySheet(), updatedAt: null, created: true };
  }
  return {
    sheet: normalizeSheet(rows[0].payload),
    updatedAt: rows[0].updated_at,
    created: false,
  };
}

export async function putSheet(userId, raw) {
  await ensureSchema();
  const sheet = normalizeSheet(raw);
  const rows = await db()`
    INSERT INTO table_manners_sheets (user_id, payload)
    VALUES (${userId}, ${JSON.stringify(sheet)}::jsonb)
    ON CONFLICT (user_id) DO UPDATE
      SET payload = EXCLUDED.payload, updated_at = now()
    RETURNING payload, updated_at
  `;
  return {
    sheet: normalizeSheet(rows[0].payload),
    updatedAt: rows[0].updated_at,
    created: false,
  };
}

export async function deleteSheet(userId) {
  await ensureSchema();
  await db()`DELETE FROM table_manners_sheets WHERE user_id = ${userId}`;
}
