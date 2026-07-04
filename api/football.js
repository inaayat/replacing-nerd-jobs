const BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';
const SEASON = 2026;

const cache = new Map();
const TTL = 30 * 60 * 1000;

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

// Official 2026 knockout venues (DirecTV broadcast schedule), one entry per
// bracket slot in kickoff order. FIFA fixes venues/dates to a bracket slot
// months in advance, independent of which teams end up filling it — so each
// stage's real matches are assigned a venue by their chronological position
// within that stage, not by reconstructing a calendar day from the API's own
// timestamp. (An earlier version bucketed by calendar date instead, which
// broke whenever the live API's date for a match didn't land on the day this
// venue list assumed.) Stage names match what football-data.org returns.
const STAGE_VENUES = {
  LAST_32: [
    'Inglewood, CA', 'Houston, TX', 'Foxborough, MA', 'Monterrey, MX',
    'Arlington, TX', 'East Rutherford, NJ', 'Mexico City, MX',
    'Atlanta, GA', 'Seattle, WA', 'Santa Clara, CA',
    'Inglewood, CA', 'Toronto, ON', 'Vancouver, BC',
    'Arlington, TX', 'Miami Gardens, FL', 'Kansas City, MO',
  ],
  LAST_16: [
    'Houston, TX', 'Philadelphia, PA',
    'East Rutherford, NJ', 'Mexico City, MX',
    'Arlington, TX', 'Seattle, WA',
    'Atlanta, GA', 'Vancouver, BC',
  ],
  QUARTER_FINALS: ['Foxborough, MA', 'Inglewood, CA', 'Miami Gardens, FL', 'Kansas City, MO'],
  SEMI_FINALS: ['Arlington, TX', 'Atlanta, GA'],
  THIRD_PLACE: ['Miami Gardens, FL'],
  FINAL: ['East Rutherford, NJ'],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.FOOTBALL_DATA_KEY) {
    return res.status(503).json({ error: 'FOOTBALL_DATA_KEY not configured' });
  }

  const { action } = req.query;

  try {
    if (action === 'all') {
      const data = await fetchFDB(`/competitions/${COMPETITION}/matches?season=${SEASON}`);
      const all = data.matches || [];

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

      // Group knockout matches by stage, then assign venues by chronological
      // position within that stage (see STAGE_VENUES comment above).
      const byStage = {};
      all.filter(m => m.stage !== 'GROUP_STAGE').forEach(m => {
        (byStage[m.stage] ??= []).push(m);
      });

      const koFixtures = [];
      Object.entries(byStage).forEach(([stage, matches]) => {
        const venues = STAGE_VENUES[stage] || [];
        matches
          .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
          .forEach((m, idx) => {
            koFixtures.push({
              id: m.id,
              stage: m.stage,
              home: m.homeTeam?.name || null,
              away: m.awayTeam?.name || null,
              homeGoals: m.score?.fullTime?.home ?? null,
              awayGoals: m.score?.fullTime?.away ?? null,
              status: mapStatus(m.status),
              date: m.utcDate,
              venue: venues[idx] || null,
            });
          });
      });

      return res.status(200).json({ groupFixtures, koFixtures });
    }

    return res.status(400).json({ error: 'use action=all' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
