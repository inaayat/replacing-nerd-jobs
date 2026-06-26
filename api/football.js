const BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';
const SEASON = 2026;

const cache = new Map();
const TTL = 30 * 60 * 1000; // 30 minutes — matches free tier rate limits

async function fetchFDB(path) {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY || '' },
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}`);
  const data = await res.json();
  cache.set(path, { ts: Date.now(), data });
  return data;
}

function mapStatus(s) {
  if (s === 'FINISHED' || s === 'AWARDED') return 'FT';
  if (s === 'IN_PLAY') return 'LIVE';
  if (s === 'PAUSED') return 'HT';
  return 'NS';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800'); // 30 min CDN cache

  if (!process.env.FOOTBALL_DATA_KEY) {
    return res.status(503).json({ error: 'FOOTBALL_DATA_KEY not configured' });
  }

  const { action } = req.query;

  try {
    if (action === 'all') {
      const data = await fetchFDB(`/competitions/${COMPETITION}/matches?season=${SEASON}`);
      const all = data.matches || [];

      // Group stage: collect results + group membership
      const groupFixtures = all
        .filter(m => m.stage === 'GROUP_STAGE')
        .map(m => ({
          id: m.id,
          group: m.group?.replace('GROUP_', '') || null,
          home: m.homeTeam?.name || null,
          away: m.awayTeam?.name || null,
          homeGoals: m.score?.fullTime?.home ?? null,
          awayGoals: m.score?.fullTime?.away ?? null,
          status: mapStatus(m.status),
          date: m.utcDate,
        }));

      // Knockout stage
      const koFixtures = all
        .filter(m => m.stage !== 'GROUP_STAGE')
        .map(m => ({
          id: m.id,
          stage: m.stage, // LAST_32, LAST_16, QUARTER_FINALS, SEMI_FINALS, THIRD_PLACE, FINAL
          home: m.homeTeam?.name || null,
          away: m.awayTeam?.name || null,
          homeGoals: m.score?.fullTime?.home ?? null,
          awayGoals: m.score?.fullTime?.away ?? null,
          status: mapStatus(m.status),
          date: m.utcDate,
        }));

      return res.status(200).json({ groupFixtures, koFixtures });
    }

    return res.status(400).json({ error: 'use action=all' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
