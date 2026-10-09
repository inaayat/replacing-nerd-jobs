import { db, ensureSchema } from './db.js';
import {
  emptyStore,
  serializeBook,
  normalizeBookRevision,
  bookSaveGuard,
  bookRevisionGuard,
  bookConflictError,
  preserveServerHistory,
} from '../brag-book/engine.js';

function rowToBook(row) {
  return {
    book: serializeBook(row.payload).book,
    updatedAt: normalizeBookRevision(row.updated_at),
    revision: Number(row.rev) || 1,
    created: false,
  };
}

export async function getBook(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT payload, updated_at, rev
    FROM brag_books
    WHERE user_id = ${userId}
  `;
  if (!rows.length) {
    return { book: emptyStore(), updatedAt: null, revision: null, created: true };
  }
  return rowToBook(rows[0]);
}

export async function putBook(userId, raw, { expectedUpdatedAt, expectedRevision } = {}) {
  await ensureSchema();
  const existing = await db()`
    SELECT payload, updated_at, rev
    FROM brag_books
    WHERE user_id = ${userId}
  `;

  if (!existing.length) {
    const { json } = serializeBook(raw);
    const rows = await db()`
      INSERT INTO brag_books (user_id, payload)
      VALUES (${userId}, ${json}::jsonb)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING payload, updated_at, rev
    `;
    if (!rows.length) throw bookConflictError(await getBook(userId));
    return rowToBook(rows[0]);
  }

  const current = rowToBook(existing[0]);
  const hasRevision = expectedRevision != null;
  const hasLegacyTimestamp = expectedUpdatedAt != null;
  const guard = hasRevision
    ? bookRevisionGuard(current.revision, expectedRevision)
    : (hasLegacyTimestamp
      ? bookSaveGuard(current.updatedAt, expectedUpdatedAt)
      : bookRevisionGuard(current.revision, expectedRevision));
  if (!guard.ok) {
    const err = bookConflictError(current);
    err.status = guard.status || err.status;
    throw err;
  }

  const { json } = serializeBook(preserveServerHistory(raw, current.book));
  const currentRev = Number(existing[0].rev) || 1;
  const rows = await db()`
    UPDATE brag_books
    SET payload = ${json}::jsonb, updated_at = now(), rev = ${currentRev + 1}
    WHERE user_id = ${userId}
      AND rev = ${currentRev}
    RETURNING payload, updated_at, rev
  `;
  if (!rows.length) throw bookConflictError(await getBook(userId));
  return rowToBook(rows[0]);
}

export async function deleteBook(userId) {
  await ensureSchema();
  await db()`DELETE FROM brag_books WHERE user_id = ${userId}`;
}
