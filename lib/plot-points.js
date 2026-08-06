/**
 * Plot Points — pure helpers for TMDB director/cast analysis.
 * Aggregation is dependency-free so it can be unit-tested without secrets.
 */

export const QUERY_TYPES = {
  'cast-count': {
    id: 'cast-count',
    label: 'Most frequent collaborators',
    headline: (name) => `Actors who appear in the most ${name} films`,
    metricLabel: 'films',
    description:
      'Ranks actors by how many of this director’s movies they appear in (top-billed cast).',
  },
  'cast-rating': {
    id: 'cast-rating',
    label: 'Highest-rated collaborators',
    headline: (name) => `Actors with the highest average rating in ${name} films`,
    metricLabel: 'avg rating',
    description:
      'Ranks actors by the mean TMDB vote average of the director’s films they appear in.',
  },
  reuse: {
    id: 'reuse',
    label: 'Cast reuse',
    headline: (name) => `Actors ${name} has cast more than once`,
    metricLabel: 'films',
    description:
      'Shows repeat collaborators only, plus how often this director reuses cast.',
  },
};

export function normalizeMinFilms(value, fallback = 2) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 20);
}

/** Deduplicate director crew credits into a movie list. */
export function directorMoviesFromCredits(crew = []) {
  const byId = new Map();
  for (const credit of crew) {
    if (!credit || credit.job !== 'Director' || !credit.id) continue;
    if (byId.has(credit.id)) continue;
    const releaseDate = credit.release_date && /^\d{4}-\d{2}-\d{2}$/.test(credit.release_date)
      ? credit.release_date
      : null;
    byId.set(credit.id, {
      tmdb_id: credit.id,
      title: credit.title || credit.original_title || 'Untitled',
      release_date: releaseDate,
      year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
      poster_path: credit.poster_path || null,
      vote_average: Number(credit.vote_average) || 0,
      vote_count: Number(credit.vote_count) || 0,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const ad = a.release_date || '';
    const bd = b.release_date || '';
    return bd.localeCompare(ad);
  });
}

/**
 * @param {Array<{ tmdb_id:number, title:string, vote_average:number, poster_path?:string|null, year?:number|null, cast:Array<{id:number,name:string,profile_path?:string|null,order?:number}> }>} movies
 * @param {{ minFilms?: number, topCastPerFilm?: number }} opts
 */
export function aggregateDirectorCast(movies, { minFilms = 2, topCastPerFilm = 15 } = {}) {
  const actorMap = new Map();

  for (const movie of movies) {
    const cast = (movie.cast || [])
      .slice()
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, topCastPerFilm);

    for (const person of cast) {
      if (!person?.id || !person.name) continue;
      if (!actorMap.has(person.id)) {
        actorMap.set(person.id, {
          tmdb_id: person.id,
          name: person.name,
          profile_path: person.profile_path || null,
          films: [],
        });
      }
      const row = actorMap.get(person.id);
      if (!row.profile_path && person.profile_path) row.profile_path = person.profile_path;
      if (!row.films.some((f) => f.tmdb_id === movie.tmdb_id)) {
        row.films.push({
          tmdb_id: movie.tmdb_id,
          title: movie.title,
          year: movie.year ?? null,
          poster_path: movie.poster_path || null,
          vote_average: Number(movie.vote_average) || 0,
        });
      }
    }
  }

  const actors = [...actorMap.values()].map((actor) => {
    const count = actor.films.length;
    const ratingSum = actor.films.reduce((sum, f) => sum + (f.vote_average || 0), 0);
    const avg_rating = count ? Math.round((ratingSum / count) * 100) / 100 : 0;
    return {
      tmdb_id: actor.tmdb_id,
      name: actor.name,
      profile_path: actor.profile_path,
      film_count: count,
      avg_rating,
      films: actor.films.sort((a, b) => String(b.year || 0).localeCompare(String(a.year || 0))),
    };
  });

  const uniqueActors = actors.length;
  const repeatActors = actors.filter((a) => a.film_count >= 2);
  const totalCastSlots = movies.reduce(
    (sum, m) => sum + Math.min((m.cast || []).length, topCastPerFilm),
    0,
  );
  const repeatSlots = actors.reduce(
    (sum, a) => sum + (a.film_count >= 2 ? a.film_count : 0),
    0,
  );

  return {
    actors,
    stats: {
      film_count: movies.length,
      unique_actors: uniqueActors,
      repeat_actors: repeatActors.length,
      reuse_rate: uniqueActors
        ? Math.round((repeatActors.length / uniqueActors) * 1000) / 10
        : 0,
      repeat_slot_share: totalCastSlots
        ? Math.round((repeatSlots / totalCastSlots) * 1000) / 10
        : 0,
      min_films: minFilms,
      top_cast_per_film: topCastPerFilm,
    },
  };
}

export function rankActors(actors, type, minFilms) {
  const floor = normalizeMinFilms(minFilms, 2);
  if (type === 'cast-rating') {
    return actors
      .filter((a) => a.film_count >= floor)
      .sort((a, b) => b.avg_rating - a.avg_rating || b.film_count - a.film_count || a.name.localeCompare(b.name));
  }
  if (type === 'reuse') {
    return actors
      .filter((a) => a.film_count >= Math.max(floor, 2))
      .sort((a, b) => b.film_count - a.film_count || b.avg_rating - a.avg_rating || a.name.localeCompare(b.name));
  }
  // cast-count
  return actors
    .filter((a) => a.film_count >= floor)
    .sort((a, b) => b.film_count - a.film_count || b.avg_rating - a.avg_rating || a.name.localeCompare(b.name));
}

export function buildQueryProvenance({
  type,
  person,
  minFilms,
  filmCount,
  topCastPerFilm,
  generatedAt,
  source = 'live',
}) {
  const meta = QUERY_TYPES[type] || QUERY_TYPES['cast-count'];
  const name = person?.name || 'this director';
  return {
    type,
    type_label: meta.label,
    headline: meta.headline(name),
    description: meta.description,
    subject: {
      kind: 'director',
      tmdb_id: person?.tmdb_id ?? person?.id ?? null,
      name,
      profile_path: person?.profile_path || null,
    },
    filters: {
      media: 'movies',
      min_shared_films: normalizeMinFilms(minFilms, 2),
      top_cast_per_film: topCastPerFilm,
      directed_films_scanned: filmCount,
    },
    ranking:
      type === 'cast-rating'
        ? 'Average TMDB vote_average across shared films'
        : 'Number of shared films (top-billed cast)',
    source,
    generated_at: generatedAt || new Date().toISOString(),
    attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
  };
}

export function buildQueryResult({
  type,
  person,
  movies,
  minFilms = 2,
  topCastPerFilm = 15,
  source = 'live',
  generatedAt,
}) {
  const { actors, stats } = aggregateDirectorCast(movies, { minFilms, topCastPerFilm });
  const ranked = rankActors(actors, type, minFilms);
  const provenance = buildQueryProvenance({
    type,
    person,
    minFilms,
    filmCount: movies.length,
    topCastPerFilm,
    generatedAt,
    source,
  });

  return {
    query: provenance,
    stats,
    results: ranked.map((actor, index) => ({
      rank: index + 1,
      tmdb_id: actor.tmdb_id,
      name: actor.name,
      profile_path: actor.profile_path,
      film_count: actor.film_count,
      avg_rating: actor.avg_rating,
      metric: type === 'cast-rating' ? actor.avg_rating : actor.film_count,
      films: actor.films,
    })),
    movies: movies.map((m) => ({
      tmdb_id: m.tmdb_id,
      title: m.title,
      year: m.year,
      poster_path: m.poster_path,
      vote_average: m.vote_average,
    })),
  };
}
