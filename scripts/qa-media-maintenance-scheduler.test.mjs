import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../src/lib/media/maintenance-scheduler.ts');
test('maintenance uses the authenticated self binding and a bounded private endpoint',async()=>{
  const {runMediaMaintenance}=await load();let calls=0;
  await runMediaMaintenance({APP_ORIGIN:'https://bunny.test',EDITORIAL_CRON_SECRET:'synthetic',WORKER_SELF_REFERENCE:{fetch:async r=>{calls++;assert.equal(r.url,'https://bunny.test/api/media/maintenance');assert.equal(r.method,'POST');assert.equal(r.headers.get('authorization'),'Bearer synthetic');return Response.json({ok:true,completed:{examined:1,deleted:1,failed:0,skipped:0},abandoned:{examined:0,deleted:0,failed:0,skipped:0},trash:{examined:0,deleted:0,failed:0,skipped:0}});}}});assert.equal(calls,1);
});
test('maintenance configuration and failed batches fail closed without replay',async()=>{
  const {runMediaMaintenance}=await load();let calls=0;const env={APP_ORIGIN:'https://bunny.test',EDITORIAL_CRON_SECRET:'synthetic',WORKER_SELF_REFERENCE:{fetch:async()=>{calls++;return Response.json({ok:true,completed:{examined:1,deleted:0,failed:1,skipped:0},abandoned:{examined:0,deleted:0,failed:0,skipped:0},trash:{examined:0,deleted:0,failed:0,skipped:0}});}}};
  await assert.rejects(runMediaMaintenance({...env,EDITORIAL_CRON_SECRET:''}));assert.equal(calls,0);
  await assert.rejects(runMediaMaintenance({...env,APP_ORIGIN:'http://bunny.test'}));assert.equal(calls,0);
  await assert.rejects(runMediaMaintenance(env));assert.equal(calls,1);
});

test('maintenance rejects missing or failed trash progress',async()=>{
 const {runMediaMaintenance}=await load();
 const empty={examined:0,deleted:0,failed:0,skipped:0};
 for(const trash of [undefined,{...empty,failed:1}]) await assert.rejects(runMediaMaintenance({APP_ORIGIN:'https://bunny.test',EDITORIAL_CRON_SECRET:'synthetic',WORKER_SELF_REFERENCE:{fetch:async()=>Response.json({ok:true,completed:empty,abandoned:empty,trash})}}));
});
