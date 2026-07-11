// Hands the Neon Auth base URL to the browser at request time, so
// account.html never needs a hardcoded/committed value — whatever Vercel
// has set for NEON_AUTH_BASE_URL just works on the next deploy, no repo
// edit required. This is public info (same trust level as an OAuth
// client id / publishable key): the real gate is JWT verification in
// lib/neon-auth.js, not secrecy of this URL.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ url: process.env.NEON_AUTH_BASE_URL || null });
}
