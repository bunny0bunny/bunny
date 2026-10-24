import nextWorker from './.open-next/worker.js';
import { runScheduledPublication } from './src/lib/editorial-scheduler.ts';
import { runMediaMaintenance } from './src/lib/media/maintenance-scheduler.ts';

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

const worker = {
  fetch: nextWorker.fetch,
  async scheduled(_controller, env) {
    const results = await Promise.allSettled([runScheduledPublication(env), runMediaMaintenance(env)]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  },
};

export default worker;
