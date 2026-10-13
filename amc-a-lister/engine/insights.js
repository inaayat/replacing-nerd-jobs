import { bootPage, renderShell, requireSignIn, populateSidebarStats } from './nav.js';
import { summaryApi, watchesApi } from './api.js';
import { renderInsightsHtml, wireInsights } from './insights-view.js';

bootPage(async ({ root, auth }) => {
  if (!requireSignIn(auth, root)) return;

  root.innerHTML = renderShell({
    title: 'Stats',
    subtitle: 'Your membership value, movie taste, theaters, formats, cast, and watching habits.',
    body: `<main class="al-main al-main--insights" id="insights-main"><p class="al-muted">Loading…</p></main>`,
    signedIn: true,
  });

  const main = document.getElementById('insights-main');
  const [data, { watches }] = await Promise.all([
    summaryApi.get(auth.token),
    watchesApi.list(auth.token),
  ]);
  const { summary = {}, rewatches = [], ratings = {}, actors = [] } = data;
  const watchList = (watches || []).filter((watch) => watch.in_theaters !== false);

  main.innerHTML = renderInsightsHtml({
    summary,
    watches: watchList,
    ratings,
    actors,
    rewatches,
    voice: 'you',
  });
  wireInsights(main, { summary, watches: watchList });
}, { quickLogOnSuccess: (auth) => populateSidebarStats(auth) });
