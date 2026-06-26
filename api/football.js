const BASE = 'https://v3.football.api-sports.io';
const LEAGUE = 1;    // FIFA World Cup
const SEASON = 2026;

// simple in-memory cache
const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

async function fetchFootball(path) {
  const key = path;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY || '' },
  });
  if (!res.ok) throw new Error(`api-football ${res.status}`);
  const data = await res.json();
  cache.set(key, { ts: Date.now(), data });
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const { action } = req.query;

  if (!process.env.API_FOOTBALL_KEY) {
    return res.status(503).json({ error: 'API_FOOTBALL_KEY not configured' });
  }

  try {
    if (action === 'fixtures') {
      const data = await fetchFootball(`/fixtures?league=${LEAGUE}&season=${SEASON}`);
      // Return only what the client needs: fixture id, match number (referee field has it),
      // teams, goals, status
      const fixtures = (data.response || []).map(f => ({
        id: f.fixture.id,
        // api-football uses fixture.referee for arbitrary string; match number is in name
        date: f.fixture.date,
        status: f.fixture.status?.short,   // NS, 1H, HT, 2H, FT, AET, PEN
        home: f.teams.home.name,
        away: f.teams.away.name,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        round: f.league.round,             // e.g. "Group Stage - 1", "Round of 32"
        venue: f.fixture.venue?.name,
      }));
      return res.status(200).json({ fixtures });
    }

    if (action === 'standings') {
      const data = await fetchFootball(`/standings?league=${LEAGUE}&season=${SEASON}`);
      return res.status(200).json({ standings: data.response || [] });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
