/**
 * Effort derivation: work hours → review/support hours per policy.
 */
export function deriveEffortHours(workHours, reviewHours, policy = {}) {
  const work = Number(workHours || 0);
  const explicitReview = Number(reviewHours || 0);
  if (explicitReview > 0) {
    return { work_hours: work, review_hours: explicitReview, total_hours: work + explicitReview };
  }

  const ratio = Number(policy.review_ratio ?? 0.35);
  const floor = Number(policy.review_floor_hours ?? 0);
  let derivedReview = work * ratio;
  if (floor > 0 && work > 0) derivedReview = Math.max(derivedReview, floor);

  return {
    work_hours: work,
    review_hours: round(derivedReview),
    total_hours: round(work + derivedReview),
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
