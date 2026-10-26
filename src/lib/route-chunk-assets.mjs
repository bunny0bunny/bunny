// Only generated, content-addressed framework chunks are eligible. Application
// routes and private assets never pass through this delivery fallback.
export async function serveRouteChunk(request, env, aliases) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/_next/static/chunks/')) return null;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (!Object.hasOwn(aliases, pathname)) return null;
  const target = aliases[pathname];
  if (!/^\/_next\/static\/route-chunks\/[a-f0-9]{64}\.(js|css)$/.test(target)) return null;
  url.pathname = target; url.search = '';
  return env.ASSETS.fetch(new Request(url, request));
}
