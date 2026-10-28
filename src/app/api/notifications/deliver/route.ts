import { withDatabaseScope } from '@/lib/db';
import { drainPublications } from '@/lib/publications/service';
export async function POST(request:Request) {
  const secret=process.env.EDITORIAL_CRON_SECRET?.trim();
  if(!secret || request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({ok:false},{status:401});
  if(process.env.PUBLICATION_DELIVERY_ENABLED!=='1')return Response.json({ok:true,enabled:false},{headers:{'Cache-Control':'no-store'}});
  try {
    const summary=await withDatabaseScope(()=>drainPublications({limit:3,recipientLimit:200}));
    return Response.json({ok:summary.failed===0,enabled:true,summary},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({ok:false},{status:503});}
}
