/** Default planning policy knobs for new cycles. */
export const DEFAULT_POLICY_CONFIG = {
  tracking_granularity: 'week',
  weekly_capacity_default: 32,
  review_ratio: 0.35,
  review_floor_hours: 0,
  review_lag_days: 7,
  overload_threshold: 1.0,
  spread_lag_weeks: 0,
  working_days_per_week: 5,
  alert_proximity_days: 14,
  band_yellow_remaining: 8,
  band_red_remaining: 0,
};
