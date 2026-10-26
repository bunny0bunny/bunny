import nextWorker from './.open-next/worker.js';
import { runScheduledPublication } from './src/lib/editorial-scheduler.ts';
import { runMediaMaintenance } from './src/lib/media/maintenance-scheduler.ts';
import routeChunkAliases from './.open-next/route-chunk-aliases.mjs';
import { serveRouteChunk } from './src/lib/route-chunk-assets.mjs';

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

const worker = {
  async fetch(request, env, ctx) {
    return await serveRouteChunk(request, env, routeChunkAliases) ?? nextWorker.fetch(request, env, ctx);
  },
  async scheduled(_controller, env) {
    const results = await Promise.allSettled([runScheduledPublication(env), runMediaMaintenance(env)]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  },
};

export default worker;
