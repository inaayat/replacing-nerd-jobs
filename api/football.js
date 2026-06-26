const BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';
const SEASON = 2026;

const cache = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

async function fetchFDB(path) {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY || '' },
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cache.set(path, { ts: Date.now(), data });
  return data;
}

// Map football-data.org status → short codes the client expects
function mapStatus(s) {
  if (s === 'FINISHED' || s === 'AWARDED') return 'FT';
  if (s === 'IN_PLAY') return '1H';
  if (s === 'PAUSED') return 'HT';
  if (s === 'SCHEDULED' || s === 'TIMED') return 'NS';
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const { action } = req.query;

  if (!process.env.FOOTBALL_DATA_KEY) {
    return res.status(503).json({ error: 'FOOTBALL_DATA_KEY not configured' });
  }

  try {
    if (action === 'fixtures') {
      const data = await fetchFDB(`/competitions/${COMPETITION}/matches?season=${SEASON}`);
      const fixtures = (data.matches || []).map(m => ({
        id: m.id,
        date: m.utcDate,
        status: mapStatus(m.status),
        home: m.homeTeam.name,
        away: m.awayTeam.name,
        homeGoals: m.score?.fullTime?.home ?? null,
        awayGoals: m.score?.fullTime?.away ?? null,
        round: m.stage, // GROUP_STAGE, ROUND_OF_32, ROUND_OF_16, etc.
      }));
      return res.status(200).json({ fixtures });
    }

    if (action === 'standings') {
      const data = await fetchFDB(`/competitions/${COMPETITION}/standings?season=${SEASON}`);
      // Transform football-data.org format → same shape the client already parses
      // Client expects: [{ league: { standings: [ [group_A_rows], [group_B_rows], ... ] } }]
      const groups = (data.standings || [])
        .filter(s => s.type === 'TOTAL')
        .map(s => s.table.map(row => ({
          rank: row.position,
          team: { name: row.team.name },
          points: row.points,
          goalsDiff: row.goalDifference,
          all: {
            played: row.playedGames,
            win: row.won,
            draw: row.draw,
            lose: row.lost,
            goals: { for: row.goalsFor, against: row.goalsAgainst },
          },
        })));
      return res.status(200).json({ standings: [{ league: { standings: groups } }] });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
