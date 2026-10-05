import { db, ensureSchema } from './db.js';
import { emptyStore, serializeBook } from '../brag-book/engine.js';

export async function getBook(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT payload, updated_at
    FROM brag_books
    WHERE user_id = ${userId}
  `;
  if (!rows.length) {
    return { book: emptyStore(), updatedAt: null, created: true };
  }
  return {
    book: serializeBook(rows[0].payload).book,
    updatedAt: rows[0].updated_at,
    created: false,
  };
}

export async function putBook(userId, raw) {
  await ensureSchema();
  const { book, json } = serializeBook(raw);
  const rows = await db()`
    INSERT INTO brag_books (user_id, payload)
    VALUES (${userId}, ${json}::jsonb)
    ON CONFLICT (user_id) DO UPDATE
      SET payload = EXCLUDED.payload, updated_at = now()
    RETURNING updated_at
  `;
  return {
    book,
    updatedAt: rows[0].updated_at,
    created: false,
  };
}

export async function deleteBook(userId) {
  await ensureSchema();
  await db()`DELETE FROM brag_books WHERE user_id = ${userId}`;
}
