/**
 * Experiences dual-panel layout breakpoints (keep in sync with app.css @container rules).
 * Browser-safe ESM.
 */

/** Minimum inline width of `.bb-book-dual` before the side panel gets its own grid column. */
export const EXPERIENCES_DUAL_INLINE_MIN_PX = 920;

/** Viewport max width where the panel uses the overlay drawer instead of inline column. */
export const EXPERIENCES_DRAWER_VIEWPORT_MAX_PX = 1099;

export function experiencesDualInlineMediaQuery() {
  return `(min-width: ${EXPERIENCES_DUAL_INLINE_MIN_PX}px)`;
}
