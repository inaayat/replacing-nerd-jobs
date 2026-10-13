/**
 * Shared bulk-edit draft for a screening: rating plus theater, format, seat,
 * and ticket price. The browser editor and the watch PATCH handler both use
 * this so a row is "changed" only when the saved values would actually differ.
 */

export const OFF_THEATER_LOCATION = 'Not in theaters';
const MAX_TICKET_CENTS = 1_000_000;

export function normalizeRating(rating) {
  if (rating == null || rating === '') return null;
  const n = Number(rating);
  return Number.isFinite(n) ? n : null;
}

/** Dollars typed in the ticket box, or null when the box is empty. */
export function ticketCentsFromInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { cents: null };
  if (!/\d/.test(raw)) return { error: 'Ticket price must be a number.' };
  const n = Number(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return { error: 'Ticket price must be a number.' };
  const cents = Math.round(n * 100);
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_TICKET_CENTS) {
    return { error: 'Ticket price must be a positive amount under $10,000.' };
  }
  return { cents };
}

export function ticketInputFromCents(cents) {
  if (cents == null || cents === '') return '';
  return (Number(cents) / 100).toFixed(2);
}

/**
 * Editor state for one watch. Off-theater rows keep the theater box empty;
 * the stored "Not in theaters" label is not something you edit.
 */
export function screeningDraft(watch) {
  const inTheaters = watch?.in_theaters !== false;
  return {
    rating: normalizeRating(watch?.rating),
    dnf: !!watch?.dnf,
    in_theaters: inTheaters,
    location: inTheaters ? String(watch?.location || '').trim() : '',
    format: String(watch?.format || ''),
    seat: inTheaters ? String(watch?.seat || '') : '',
    ticket: inTheaters ? ticketInputFromCents(watch?.ticket_cents) : '',
  };
}

/**
 * Values that would be written for this draft.
 * @returns {{ data: object } | { error: string }}
 */
export function persistedScreening(draft) {
  const dnf = !!draft?.dnf;
  let rating = null;
  if (!dnf && draft?.rating != null && draft.rating !== '') {
    rating = Number(draft.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return { error: 'Rating must be between 1 and 5.' };
    }
  }

  const inTheaters = draft?.in_theaters !== false;
  const ticket = ticketCentsFromInput(inTheaters ? draft?.ticket : '');
  if (ticket.error) return { error: ticket.error };

  const location = String(draft?.location || '').trim().slice(0, 200);
  const seat = String(draft?.seat || '').trim().slice(0, 40);

  return {
    data: {
      rating,
      dnf,
      in_theaters: inTheaters,
      location: inTheaters ? (location || null) : OFF_THEATER_LOCATION,
      format: inTheaters ? String(draft?.format || '').trim().slice(0, 40) : '',
      seat: inTheaters ? (seat || null) : null,
      ticket_cents: inTheaters ? ticket.cents : null,
    },
  };
}

export function screeningsMatch(a, b) {
  const left = persistedScreening(a);
  const right = persistedScreening(b);
  if (left.error || right.error) return false;
  const keys = ['rating', 'dnf', 'in_theaters', 'location', 'format', 'seat', 'ticket_cents'];
  return keys.every((key) => left.data[key] === right.data[key]);
}

/**
 * One item from PATCH { rating_updates }.
 * A rating-only body (the original bulk editor) still updates just rating and DNF.
 * A body that includes theater fields updates those too.
 * @returns {{ data: object } | { error: string } | null}
 */
export function normalizeBulkUpdate(entry) {
  if (!entry?.id) return null;
  const screeningKeys = ['in_theaters', 'location', 'format', 'seat', 'ticket_cents', 'ticket'];
  const hasScreening = screeningKeys.some((key) => Object.prototype.hasOwnProperty.call(entry, key));

  if (!hasScreening) {
    const dnf = !!entry.dnf;
    let rating = null;
    if (!dnf && entry.rating != null && entry.rating !== '') {
      rating = Number(entry.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return { error: 'Rating must be between 1 and 5.' };
      }
    }
    return { data: { id: String(entry.id), rating, dnf, screening: false } };
  }

  const draft = {
    rating: entry.rating,
    dnf: entry.dnf,
    in_theaters: entry.in_theaters,
    location: entry.location === OFF_THEATER_LOCATION ? '' : entry.location,
    format: entry.format,
    seat: entry.seat,
    ticket: Object.prototype.hasOwnProperty.call(entry, 'ticket')
      ? entry.ticket
      : ticketInputFromCents(entry.ticket_cents),
  };
  const parsed = persistedScreening(draft);
  if (parsed.error) return parsed;
  return { data: { id: String(entry.id), ...parsed.data, screening: true } };
}
