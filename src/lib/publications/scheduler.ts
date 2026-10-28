type DeliveryEnv = {APP_ORIGIN?:string;NEXTAUTH_URL?:string;EDITORIAL_CRON_SECRET?:string;PUBLICATION_DELIVERY_ENABLED?:string;WORKER_SELF_REFERENCE?:{fetch(request:Request):Promise<Response>}};
export async function runPublicationDelivery(env:DeliveryEnv):Promise<void> {
  if (env.PUBLICATION_DELIVERY_ENABLED !== '1') return;
  const secret=env.EDITORIAL_CRON_SECRET?.trim();
  if (!secret || !env.WORKER_SELF_REFERENCE) throw new Error('Publication delivery bindings are missing.');
  const origin=new URL(env.APP_ORIGIN || env.NEXTAUTH_URL || '');
  if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash)throw new Error('Publication delivery requires a trusted HTTPS origin.');
  const response=await env.WORKER_SELF_REFERENCE.fetch(new Request(new URL('/api/notifications/deliver',origin),{method:'POST',headers:{authorization:`Bearer ${secret}`,origin:origin.origin},signal:AbortSignal.timeout(90000)}));
  if(!response.ok){await response.body?.cancel();throw new Error(`Publication delivery failed (${response.status}).`);}
  const result=await response.json() as {ok?:boolean;enabled?:boolean;summary?:Record<string,number>};
  if(!result.ok || !result.enabled || !result.summary || ['examined','delivered','completed','suppressed','failed','skipped'].some(key=>!Number.isSafeInteger(result.summary![key]) || result.summary![key]<0) || result.summary.failed!==0)throw new Error('Publication delivery did not finish its batch.');
}
