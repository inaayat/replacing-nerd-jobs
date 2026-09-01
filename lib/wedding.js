import { db, ensureSchema } from './db.js';
import { emptyBoard, normalizeBoard } from '../wedding/engine/model.js';

export async function getBoard(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT payload, updated_at
    FROM wedding_boards
    WHERE user_id = ${userId}
  `;
  if (!rows.length) {
    return { board: emptyBoard(), updatedAt: null, created: true };
  }
  return {
    board: normalizeBoard(rows[0].payload),
    updatedAt: rows[0].updated_at,
    created: false,
  };
}

export async function putBoard(userId, raw) {
  await ensureSchema();
  const board = normalizeBoard(raw);
  const rows = await db()`
    INSERT INTO wedding_boards (user_id, payload)
    VALUES (${userId}, ${JSON.stringify(board)}::jsonb)
    ON CONFLICT (user_id) DO UPDATE
      SET payload = EXCLUDED.payload, updated_at = now()
    RETURNING payload, updated_at
  `;
  return {
    board: normalizeBoard(rows[0].payload),
    updatedAt: rows[0].updated_at,
    created: false,
  };
}

export async function deleteBoard(userId) {
  await ensureSchema();
  await db()`DELETE FROM wedding_boards WHERE user_id = ${userId}`;
}
