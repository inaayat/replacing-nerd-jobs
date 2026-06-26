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

// Knockout venues by date (official 2026 schedule), ordered by kick-off time within each day
const KO_VENUES = {
  '2026-06-28': ['SoFi Stadium, Inglewood CA'],
  '2026-06-29': ['Gillette Stadium, Foxborough MA', 'Estadio BBVA, Monterrey MX', 'NRG Stadium, Houston TX'],
  '2026-06-30': ['MetLife Stadium, East Rutherford NJ', 'AT&T Stadium, Arlington TX', 'Estadio Azteca, Mexico City MX'],
  '2026-07-01': ['Mercedes-Benz Stadium, Atlanta GA', "Levi's Stadium, Santa Clara CA", 'Lumen Field, Seattle WA'],
  '2026-07-02': ['BMO Field, Toronto ON', 'SoFi Stadium, Inglewood CA', 'BC Place, Vancouver BC'],
  '2026-07-03': ['Hard Rock Stadium, Miami Gardens FL', 'Arrowhead Stadium, Kansas City MO', 'AT&T Stadium, Arlington TX'],
  '2026-07-04': ['Lincoln Financial Field, Philadelphia PA', 'NRG Stadium, Houston TX'],
  '2026-07-05': ['MetLife Stadium, East Rutherford NJ', 'Estadio Azteca, Mexico City MX'],
  '2026-07-06': ['AT&T Stadium, Arlington TX', 'Lumen Field, Seattle WA'],
  '2026-07-07': ['Mercedes-Benz Stadium, Atlanta GA', 'BC Place, Vancouver BC'],
  '2026-07-09': ['Gillette Stadium, Foxborough MA'],
  '2026-07-10': ['SoFi Stadium, Inglewood CA'],
  '2026-07-11': ['Hard Rock Stadium, Miami Gardens FL', 'Arrowhead Stadium, Kansas City MO'],
  '2026-07-14': ['AT&T Stadium, Arlington TX'],
  '2026-07-15': ['Mercedes-Benz Stadium, Atlanta GA'],
  '2026-07-18': ['Hard Rock Stadium, Miami Gardens FL'],
  '2026-07-19': ['MetLife Stadium, East Rutherford NJ'],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

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

      // Track position within each date for venue lookup
      const dateCounters = {};
      const koFixtures = all
        .filter(m => m.stage !== 'GROUP_STAGE')
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
        .map(m => {
          const dateKey = m.utcDate.substring(0, 10);
          const idx = dateCounters[dateKey] ?? 0;
          dateCounters[dateKey] = idx + 1;
          const venue = (KO_VENUES[dateKey] || [])[idx] || null;
          return {
            id: m.id,
            stage: m.stage,
            home: m.homeTeam?.name || null,
            away: m.awayTeam?.name || null,
            homeGoals: m.score?.fullTime?.home ?? null,
            awayGoals: m.score?.fullTime?.away ?? null,
            status: mapStatus(m.status),
            date: m.utcDate,
            venue,
          };
        });

      return res.status(200).json({ groupFixtures, koFixtures });
    }

    return res.status(400).json({ error: 'use action=all' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
