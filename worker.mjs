import nextWorker from './.open-next/worker.js';
import { runScheduledPublication } from './src/lib/editorial-scheduler.ts';

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

const worker = {
  fetch: nextWorker.fetch,
  async scheduled(_controller, env) {
    await runScheduledPublication(env);
  },
};

export default worker;
