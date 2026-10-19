// Preserve existing bookmarks and account links after the Worker rename.
const origin = "https://bunny.bunny-library.workers.dev";
export default {
  fetch(request) {
    const current = new URL(request.url);
    const target = new URL(origin);
    target.pathname = current.pathname;
    target.search = current.search;
    return new Response(null, { status: 307, headers: { Location: target.href, "Cache-Control": "no-store" } });
  },
};
