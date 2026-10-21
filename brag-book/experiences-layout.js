/**
 * Experiences dual-panel layout breakpoints (keep in sync with app.css @container rules).
 * Browser-safe ESM.
 */

/** Viewport min width for catalog/posting + Experiences side-by-side column. */
export const EXPERIENCES_DUAL_VIEWPORT_MIN_PX = 1100;

/** @deprecated alias — use viewport dual breakpoint */
export const EXPERIENCES_DUAL_INLINE_MIN_PX = EXPERIENCES_DUAL_VIEWPORT_MIN_PX;

/** Viewport max width where the panel uses the overlay drawer instead of inline column. */
export const EXPERIENCES_DRAWER_VIEWPORT_MAX_PX = EXPERIENCES_DUAL_VIEWPORT_MIN_PX - 1;

export function experiencesDualColumnMediaQuery() {
  return `(min-width: ${EXPERIENCES_DUAL_VIEWPORT_MIN_PX}px)`;
}

/** @deprecated use experiencesDualColumnMediaQuery */
export function experiencesDualInlineMediaQuery() {
  return experiencesDualColumnMediaQuery();
}

export function experiencesDrawerMediaQuery() {
  return `(max-width: ${EXPERIENCES_DRAWER_VIEWPORT_MAX_PX}px)`;
}
