// Neon Auth's public base URL. Safe to commit — it's just the endpoint the
// browser talks to (no secret here; the secret-equivalent is the JWKS-based
// verification server-side). Vercel's Neon integration already set this as
// NEON_AUTH_BASE_URL / VITE_NEON_AUTH_URL — copy that value here:
window.NEON_AUTH_URL = '';
