import { escapeHtml, shortDate } from './format.js';

/**
 * Pending showing invites this member sent. The watch log only lists ones
 * they received; Settings is where the waiting ones stay visible.
 */
export function sentInvitesListHtml(outgoing) {
  const items = Array.isArray(outgoing) ? outgoing : [];
  if (!items.length) {
    return '<p class="al-muted al-sent-invites-empty">None waiting.</p>';
  }
  return `
    <ul class="al-invites-outgoing-list">
      ${items.map((invite) => `
        <li class="al-invites-outgoing-item">
          <span class="al-invites-outgoing-text">
            <strong>${escapeHtml(invite.to_username || 'Member')}</strong>
            · ${escapeHtml(invite.title || 'Untitled')}
            · ${escapeHtml(shortDate(invite.watched_on))}
            · ${escapeHtml(invite.location || '—')}
          </span>
          <button type="button" class="al-link-btn al-invites-cancel" data-invite-cancel="${escapeHtml(invite.id)}">Delete</button>
        </li>
      `).join('')}
    </ul>
  `;
}
