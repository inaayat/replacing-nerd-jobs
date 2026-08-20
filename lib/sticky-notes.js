// Server-only Neon queries for Sticky Notes. Mirrors the op semantics defined
// by sticky-notes/notes.js applyOps — that reducer is the source of truth;
// keep the two in sync when adding op kinds.
import { db, ensureSchema } from './db.js';
import {
  COLOR_KEYS,
  ICON_KEYS,
  NOTE_H_MIN,
  NOTE_W_MAX,
  NOTE_W_MIN,
  normalizeInk,
  normalizeNote,
} from '../sticky-notes/notes.js';

const OPS_CAP = 200;

function iso(ts) {
  const d = new Date(ts || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function ids(list) {
  return (Array.isArray(list) ? list : []).map(String).filter(Boolean);
}

export async function getState(userId) {
  await ensureSchema();
  const sql = db();
  const [notes, collections, arrows, ink, legend] = await Promise.all([
    sql`
      SELECT id, text, rich, color_key, icon_key, status, collection_id,
             x, y, w, h, pinned, source_url, source_title,
             created_at, updated_at, filed_at
      FROM sn_notes WHERE user_id = ${userId}
    `,
    sql`
      SELECT id, name, status, created_at, updated_at, filed_at
      FROM sn_collections WHERE user_id = ${userId}
    `,
    sql`
      SELECT id, from_note, to_note, created_at
      FROM sn_arrows WHERE user_id = ${userId}
    `,
    sql`
      SELECT id, text, x, y, created_at, updated_at
      FROM sn_ink WHERE user_id = ${userId}
    `,
    sql`SELECT kind, key, label FROM sn_legend WHERE user_id = ${userId}`,
  ]);

  const legendOut = { colors: {}, icons: {} };
  for (const row of legend) {
    if (row.kind === 'color') legendOut.colors[row.key] = row.label;
    if (row.kind === 'icon') legendOut.icons[row.key] = row.label;
  }

  return {
    notes: notes.map((r) => ({
      id: r.id,
      text: r.text,
      rich: r.rich,
      colorKey: r.color_key,
      iconKey: r.icon_key,
      status: r.status,
      collectionId: r.collection_id,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      pinned: r.pinned,
      sourceUrl: r.source_url,
      sourceTitle: r.source_title,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      filedAt: r.filed_at ? iso(r.filed_at) : null,
    })),
    collections: collections.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      filedAt: r.filed_at ? iso(r.filed_at) : null,
    })),
    arrows: arrows.map((r) => ({
      id: r.id,
      fromId: r.from_note,
      toId: r.to_note,
      createdAt: iso(r.created_at),
    })),
    ink: ink.map((r) => ({
      id: r.id,
      text: r.text,
      x: r.x,
      y: r.y,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    })),
    legend: legendOut,
  };
}

export async function applyOps(userId, rawOps) {
  await ensureSchema();
  const sql = db();
  const ops = (Array.isArray(rawOps) ? rawOps : []).slice(0, OPS_CAP);
  let applied = 0;
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    // eslint-disable-next-line no-await-in-loop
    await applyOne(sql, userId, op);
    applied += 1;
  }
  return applied;
}

async function applyOne(sql, userId, op) {
  const ts = iso(op.ts);
  switch (op.op) {
    case 'note.upsert': {
      const note = normalizeNote(op.note);
      if (!note) return;
      const rich = note.rich ? JSON.stringify(note.rich) : null;
      await sql`
        INSERT INTO sn_notes (
          id, user_id, text, rich, color_key, icon_key, status, collection_id,
          x, y, w, h, pinned, source_url, source_title,
          created_at, updated_at, filed_at
        ) VALUES (
          ${note.id}, ${userId}, ${note.text}, ${rich}::jsonb,
          ${note.colorKey}, ${note.iconKey},
          ${note.status},
          (SELECT id FROM sn_collections WHERE id = ${note.collectionId} AND user_id = ${userId}),
          ${note.x}, ${note.y}, ${note.w}, ${note.h}, ${note.pinned},
          ${note.sourceUrl}, ${note.sourceTitle},
          ${note.createdAt}, ${note.updatedAt}, ${note.filedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          text = EXCLUDED.text,
          rich = EXCLUDED.rich,
          color_key = EXCLUDED.color_key,
          icon_key = EXCLUDED.icon_key,
          status = EXCLUDED.status,
          collection_id = EXCLUDED.collection_id,
          x = EXCLUDED.x, y = EXCLUDED.y, w = EXCLUDED.w, h = EXCLUDED.h,
          pinned = EXCLUDED.pinned,
          source_url = EXCLUDED.source_url,
          source_title = EXCLUDED.source_title,
          updated_at = EXCLUDED.updated_at,
          filed_at = EXCLUDED.filed_at
        WHERE sn_notes.user_id = ${userId}
          AND sn_notes.updated_at <= EXCLUDED.updated_at
      `;
      return;
    }
    case 'note.move':
      await sql`
        UPDATE sn_notes SET x = ${Number(op.x) || 0}, y = ${Number(op.y) || 0}, updated_at = ${ts}
        WHERE id = ${String(op.id)} AND user_id = ${userId}
      `;
      return;
    case 'note.resize': {
      const w = Math.min(NOTE_W_MAX, Math.max(NOTE_W_MIN, Number(op.w) || NOTE_W_MIN));
      const h = Math.max(NOTE_H_MIN, Number(op.h) || NOTE_H_MIN);
      await sql`
        UPDATE sn_notes SET w = ${w}, h = ${h}, updated_at = ${ts}
        WHERE id = ${String(op.id)} AND user_id = ${userId}
      `;
      return;
    }
    case 'note.pin':
      await sql`
        UPDATE sn_notes SET pinned = ${Boolean(op.pinned)}, updated_at = ${ts}
        WHERE id = ANY(${ids(op.ids)}) AND user_id = ${userId}
      `;
      return;
    case 'note.categorize': {
      const list = ids(op.ids);
      if (!list.length) return;
      if ('colorKey' in op) {
        const color = COLOR_KEYS.includes(op.colorKey) ? op.colorKey : null;
        await sql`
          UPDATE sn_notes SET color_key = ${color}, updated_at = ${ts}
          WHERE id = ANY(${list}) AND user_id = ${userId}
        `;
      }
      if ('iconKey' in op) {
        const icon = ICON_KEYS.includes(op.iconKey) ? op.iconKey : null;
        await sql`
          UPDATE sn_notes SET icon_key = ${icon}, updated_at = ${ts}
          WHERE id = ANY(${list}) AND user_id = ${userId}
        `;
      }
      return;
    }
    case 'note.delete':
      await sql`DELETE FROM sn_notes WHERE id = ANY(${ids(op.ids)}) AND user_id = ${userId}`;
      return;
    case 'ink.upsert': {
      const ink = normalizeInk(op.ink);
      if (!ink) return;
      await sql`
        INSERT INTO sn_ink (id, user_id, text, x, y, created_at, updated_at)
        VALUES (${ink.id}, ${userId}, ${ink.text}, ${ink.x}, ${ink.y}, ${ink.createdAt}, ${ink.updatedAt})
        ON CONFLICT (id) DO UPDATE SET
          text = EXCLUDED.text,
          x = EXCLUDED.x,
          y = EXCLUDED.y,
          updated_at = EXCLUDED.updated_at
        WHERE sn_ink.user_id = ${userId}
          AND sn_ink.updated_at <= EXCLUDED.updated_at
      `;
      return;
    }
    case 'ink.move':
      await sql`
        UPDATE sn_ink SET x = ${Number(op.x) || 0}, y = ${Number(op.y) || 0}, updated_at = ${ts}
        WHERE id = ${String(op.id)} AND user_id = ${userId}
      `;
      return;
    case 'ink.delete':
      await sql`DELETE FROM sn_ink WHERE id = ANY(${ids(op.ids)}) AND user_id = ${userId}`;
      return;
    case 'arrow.create': {
      const fromId = String(op.fromId || '');
      const toId = String(op.toId || '');
      if (!fromId || !toId || fromId === toId) return;
      await sql`
        INSERT INTO sn_arrows (id, user_id, from_note, to_note, created_at)
        SELECT ${String(op.id)}, ${userId}, ${fromId}, ${toId}, ${ts}
        WHERE EXISTS (SELECT 1 FROM sn_notes WHERE id = ${fromId} AND user_id = ${userId})
          AND EXISTS (SELECT 1 FROM sn_notes WHERE id = ${toId} AND user_id = ${userId})
          AND NOT EXISTS (
            SELECT 1 FROM sn_arrows
            WHERE user_id = ${userId} AND from_note = ${fromId} AND to_note = ${toId}
          )
        ON CONFLICT (id) DO NOTHING
      `;
      return;
    }
    case 'arrow.delete':
      await sql`DELETE FROM sn_arrows WHERE id = ANY(${ids(op.ids)}) AND user_id = ${userId}`;
      return;
    case 'collection.create': {
      const name = String(op.name ?? '').trim();
      if (!name) return;
      await sql`
        INSERT INTO sn_collections (id, user_id, name, status, created_at, updated_at)
        VALUES (${String(op.id)}, ${userId}, ${name}, 'board', ${ts}, ${ts})
        ON CONFLICT (id) DO NOTHING
      `;
      return;
    }
    case 'collection.rename': {
      const name = String(op.name ?? '').trim();
      if (!name) return;
      await sql`
        UPDATE sn_collections SET name = ${name}, updated_at = ${ts}
        WHERE id = ${String(op.id)} AND user_id = ${userId}
      `;
      return;
    }
    case 'collection.assign': {
      const cid = op.collectionId ? String(op.collectionId) : null;
      await sql`
        UPDATE sn_notes
        SET collection_id = (SELECT id FROM sn_collections WHERE id = ${cid} AND user_id = ${userId}),
            updated_at = ${ts}
        WHERE id = ANY(${ids(op.ids)}) AND user_id = ${userId}
      `;
      return;
    }
    case 'collection.delete': {
      const cid = String(op.id || '');
      if (!cid) return;
      if (op.deleteNotes) {
        await sql`DELETE FROM sn_notes WHERE collection_id = ${cid} AND user_id = ${userId}`;
      } else {
        await sql`
          UPDATE sn_notes SET collection_id = NULL, updated_at = ${ts}
          WHERE collection_id = ${cid} AND user_id = ${userId}
        `;
      }
      await sql`DELETE FROM sn_collections WHERE id = ${cid} AND user_id = ${userId}`;
      return;
    }
    case 'file':
      await transition(sql, userId, op, 'memory', ts);
      return;
    case 'restore':
      await transition(sql, userId, op, 'board', ts);
      return;
    case 'wipe':
      await sql`
        UPDATE sn_notes SET status = 'memory', filed_at = ${ts}, updated_at = ${ts}
        WHERE user_id = ${userId} AND status = 'board' AND NOT pinned
      `;
      // Board ink described the arrangement being wiped; it is deleted, never
      // filed (see applyOp 'wipe' in sticky-notes/notes.js).
      await sql`DELETE FROM sn_ink WHERE user_id = ${userId}`;
      await sql`
        UPDATE sn_collections c SET status = 'memory', filed_at = ${ts}, updated_at = ${ts}
        WHERE c.user_id = ${userId} AND c.status = 'board'
          AND NOT EXISTS (
            SELECT 1 FROM sn_notes n
            WHERE n.user_id = ${userId} AND n.collection_id = c.id AND n.status = 'board'
          )
      `;
      return;
    case 'legend.set': {
      const kind = op.kind === 'color' ? 'color' : op.kind === 'icon' ? 'icon' : null;
      if (!kind) return;
      const valid = kind === 'color' ? COLOR_KEYS : ICON_KEYS;
      if (!valid.includes(op.key)) return;
      const label = String(op.label ?? '').trim();
      if (!label) {
        await sql`
          DELETE FROM sn_legend WHERE user_id = ${userId} AND kind = ${kind} AND key = ${op.key}
        `;
      } else {
        await sql`
          INSERT INTO sn_legend (user_id, kind, key, label)
          VALUES (${userId}, ${kind}, ${op.key}, ${label})
          ON CONFLICT (user_id, kind, key) DO UPDATE SET label = EXCLUDED.label
        `;
      }
      return;
    }
    default:
      /* unknown op kinds are skipped; the client is ahead of the server */
  }
}

async function transition(sql, userId, op, toStatus, ts) {
  const filedAt = toStatus === 'memory' ? ts : null;
  const noteIds = ids(op.ids);
  const cid = op.collectionId ? String(op.collectionId) : null;
  if (cid) {
    await sql`
      UPDATE sn_notes SET status = ${toStatus}, filed_at = ${filedAt}, updated_at = ${ts}
      WHERE user_id = ${userId} AND collection_id = ${cid}
    `;
    await sql`
      UPDATE sn_collections SET status = ${toStatus}, filed_at = ${filedAt}, updated_at = ${ts}
      WHERE user_id = ${userId} AND id = ${cid}
    `;
  }
  if (noteIds.length) {
    await sql`
      UPDATE sn_notes SET status = ${toStatus}, filed_at = ${filedAt}, updated_at = ${ts}
      WHERE user_id = ${userId} AND id = ANY(${noteIds})
    `;
  }
}
