// Server modules under /lib must never be served as static assets
// (`outputDirectory: "."` would otherwise make /lib/db.js fetchable).
// No secrets live in them — everything reads process.env — but SQL and
// auth logic have no business being public.
export const config = {
  matcher: ['/lib/:path*'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/lib/')) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
