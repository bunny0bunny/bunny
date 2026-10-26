import { getWorkTitle } from '@/lib/work-title';
import "server-only";
import { Prisma, type ContentRequest } from "@prisma/client";
import { db } from "@/lib/db";
import { currentProfileOrNull, getPublishedSeries, liveChapterWhere } from "@/lib/queries";
import { hashRateLimitKey } from "@/lib/account-ratelimit";
import { revalidatePath } from "next/cache";
import { createRequestSchema, statusRequestSchema, replyRequestSchema, mergeRequestSchema, normalizeRequestTitle, requestPage } from "./policy";
import { REQUEST_STATUS_LABELS, type RequestResult, type ReaderRequest, type AdminRequestSummary, type AdminRequestDetail, type CatalogWork, type RequestStatus } from "./contracts";
type Tx = Prisma.TransactionClient;
type Actor = {id:string;role:string};
const fail = (error:string): {ok:false;error:string} => ({ok:false,error});
const ok = <T>(data:T):RequestResult<T> => ({ok:true,data});
const groupWhere = (id:string) => ({OR:[{id},{mergedIntoId:id}]});

/** Recheck identity, verification and current role inside the same serializable snapshot as each operation. */
async function authenticated<T>(admin:boolean, work:(tx:Tx,actor:Actor)=>Promise<RequestResult<T>>, mutate=false):Promise<RequestResult<T>> {
  const session = await currentProfileOrNull();
  if(!session) return fail("unauthenticated");
  for(let attempt=0;attempt<5;attempt++){
    try{
      const result = await db.$transaction(async tx=>{
        const actor=await tx.profile.findUnique({where:{id:session.id},select:{id:true,role:true,emailVerifiedAt:true,disabledAt:true,authVersion:true}});
        if(!actor || actor.disabledAt || !actor.emailVerifiedAt || actor.authVersion!==session.authVersion)return fail("unauthenticated");
        if(admin && actor.role!=="admin")return fail("forbidden");
        return work(tx,actor);
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:15000});
      // Cache invalidation is best effort after commit: never turn a committed mutation into an apparent failure.
      if(result.ok && mutate) invalidate();
      return result;
    }catch(error){
      const code=(error as {code?:string}).code;
      if(["P2034","P2002"].includes(code??"")){
        if(attempt<4){await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));continue;}
        return fail("conflict");
      }
      throw error;
    }
  }
  return fail("conflict");
}
function invalidate(){
  try{
    revalidatePath("/requests");revalidatePath("/requests/[id]","page");
    revalidatePath("/admin/requests");revalidatePath("/admin/requests/[id]","page");
    revalidatePath("/admin","layout");revalidatePath("/notifications");
  }catch{/* No request cache context in background and test invocations. */}
}
async function notify(tx:Tx, recipients:Array<{profileId:string;id:string}>,titleAr:string,bodyAr:string|null=null,admin=false){
  if(!recipients.length)return;
  await tx.notification.createMany({data:recipients.map(row=>({profileId:row.profileId,type:"system",titleAr,bodyAr,href:`/${admin?"admin/":""}requests/${row.id}`}))});
}
function distinctOwners(members:Array<{profileId:string;id:string}>){
  const owners=new Map<string,{profileId:string;id:string}>();for(const member of members)if(!owners.has(member.profileId))owners.set(member.profileId,member);
  return [...owners.values()];
}
async function attemptAllowed(tx:Tx,profileId:string){
  const now=new Date(),keyHash=hashRateLimitKey(`content-request:submit:${profileId}`);
  const row=await tx.accountRateLimit.findUnique({where:{keyHash}});
  if(row && row.windowEnd>now && row.count>=20)return false;
  await tx.accountRateLimit.upsert({where:{keyHash},create:{keyHash,count:1,windowEnd:new Date(now.getTime()+3600000)},update:row && row.windowEnd>now?{count:{increment:1}}:{count:1,windowEnd:new Date(now.getTime()+3600000)}});
  return true;
}
export async function createContentRequest(input:unknown):Promise<RequestResult<{id:string;duplicate:boolean}>>{
  return authenticated<{id:string;duplicate:boolean}>(false,async(tx,actor)=>{
    if(!await attemptAllowed(tx,actor.id))return fail("rate_limited");
    const parsed=createRequestSchema.safeParse(input);if(!parsed.success)return fail("invalid_input");
    const data=parsed.data,normalizedTitle=normalizeRequestTitle(data.title);
    const duplicate=await tx.contentRequest.findUnique({where:{profileId_submissionId:{profileId:actor.id,submissionId:data.submissionId}}}) ?? await tx.contentRequest.findUnique({where:{profileId_category_normalizedTitle:{profileId:actor.id,category:data.category,normalizedTitle}}});
    if(duplicate)return ok({id:duplicate.id,duplicate:true});
    const recent=await tx.contentRequest.count({where:{profileId:actor.id,createdAt:{gte:new Date(Date.now()-86400000)}}});
    if(recent>=3)return fail("quota_exceeded");
    const row=await tx.contentRequest.create({data:{...data,normalizedTitle,profileId:actor.id}});
    const admins=await tx.profile.findMany({where:{role:"admin",disabledAt:null,emailVerifiedAt:{not:null}},select:{id:true}});
    await notify(tx,admins.map(a=>({profileId:a.id,id:row.id})),"طلب عمل جديد",row.title,true);
    return ok({id:row.id,duplicate:false});
  },true);
}
async function readerRequest(tx:Tx,row:ContentRequest):Promise<ReaderRequest>{
  const root=row.mergedIntoId?await tx.contentRequest.findUnique({where:{id:row.mergedIntoId}}):row;
  if(!root)throw new Error("Missing content request group");
  const series=root.status==="available"&&root.fulfilledSeriesId?await tx.series.findFirst({where:{id:root.fulfilledSeriesId,chapters:{some:liveChapterWhere()}},select:{id:true,titleAr:true,titleOriginal:true,slug:true}}):null;
  return {id:row.id,title:row.title,category:row.category,referenceUrl:row.referenceUrl,message:row.message,reply:row.reply,status:root.status,statusNote:root.statusNote,createdAt:row.createdAt.toISOString(),updatedAt:new Date(Math.max(row.updatedAt.getTime(),root.updatedAt.getTime())).toISOString(),availableSeries:series?{id:series.id,title:getWorkTitle(series),href:`/series/${series.slug}`}:null};
}
export async function listMyRequests(input?:{page?:number}):Promise<RequestResult<{items:ReaderRequest[];page:number;pages:number;total:number}>>{
  return authenticated(false,async(tx,actor)=>{
    const total=await tx.contentRequest.count({where:{profileId:actor.id}}),pages=Math.max(1,Math.ceil(total/50)),page=Math.min(requestPage(input?.page),pages);
    const rows=await tx.contentRequest.findMany({where:{profileId:actor.id},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*50,take:50});
    return ok({items:await Promise.all(rows.map(row=>readerRequest(tx,row))),total,pages,page});
  });
}
export async function getMyRequest(id:string):Promise<RequestResult<ReaderRequest>>{
  return authenticated(false,async(tx,actor)=>{
    if(typeof id!=="string"||id.length>128)return fail("not_found");
    const row=await tx.contentRequest.findFirst({where:{id,profileId:actor.id}});
    return row?ok(await readerRequest(tx,row)):fail("not_found");
  });
}
const summaryInclude={members:{select:{profileId:true}}} satisfies Prisma.ContentRequestInclude;
function summary(row:ContentRequest & {members:{profileId:string}[]}):AdminRequestSummary{
  return {id:row.id,title:row.title,category:row.category,status:row.status,version:row.version,requesterCount:new Set([row.profileId,...row.members.map(member=>member.profileId)]).size,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
}
export async function listAdminRequests(input?:{q?:string;status?:string;page?:number}):Promise<RequestResult<{items:AdminRequestSummary[];page:number;pages:number;total:number;newCount:number}>>{
  return authenticated(true,async tx=>{
    const q=typeof input?.q==="string"?input.q.trim().slice(0,150):"";
    const status=input?.status && Object.hasOwn(REQUEST_STATUS_LABELS,input.status)?input.status as RequestStatus:undefined;
    const search:Prisma.ContentRequestWhereInput=q?{OR:[{title:{contains:q,mode:"insensitive"}},{members:{some:{title:{contains:q,mode:"insensitive"}}}}]}:{};
    const where:Prisma.ContentRequestWhereInput={mergedIntoId:null,...(status?{status}:{}),...search};
    const total=await tx.contentRequest.count({where}),pages=Math.max(1,Math.ceil(total/20)),page=Math.min(requestPage(input?.page),pages);
    const rows=await tx.contentRequest.findMany({where,include:summaryInclude,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*20,take:20});
    const newCount=await tx.contentRequest.count({where:{mergedIntoId:null,status:"new"}});
    return ok({items:rows.map(summary),total,pages,page,newCount});
  });
}
export async function getAdminNewRequestCount():Promise<number>{
  const result=await authenticated(true,async tx=>ok(await tx.contentRequest.count({where:{mergedIntoId:null,status:"new"}})));
  return result.ok?result.data:0;
}
export async function findRequestCatalog(q:string):Promise<CatalogWork[]>{
  if(typeof q!=="string"||q.trim().length<2||q.length>150)return [];
  return (await getPublishedSeries({q:q.trim()})).slice(0,8).map(row=>({id:row.id,title:getWorkTitle(row),href:`/series/${row.slug}`,category:row.category??null}));
}
export async function getAdminRequest(id:string):Promise<RequestResult<AdminRequestDetail>>{
  return authenticated(true,async tx=>{
    if(typeof id!=="string"||id.length>128)return fail("not_found");
    const original=await tx.contentRequest.findUnique({where:{id}});if(!original)return fail("not_found");
    const root=await tx.contentRequest.findUnique({where:{id:original.mergedIntoId??id},include:summaryInclude});if(!root)return fail("not_found");
    const members=await tx.contentRequest.findMany({where:groupWhere(root.id),include:{profile:{select:{nickname:true}}},orderBy:[{createdAt:"asc"},{id:"asc"}],take:200});
    const targets=root.status==="available"?[]:await tx.contentRequest.findMany({where:{id:{not:root.id},mergedIntoId:null,category:root.category,status:{not:"available"}},include:summaryInclude,orderBy:[{createdAt:"desc"},{id:"desc"}],take:200});
    const works=await tx.series.findMany({where:{chapters:{some:liveChapterWhere()}},select:{id:true,titleAr:true,titleOriginal:true,slug:true,category:true},orderBy:{titleAr:"asc"},take:200});
    return ok({...summary(root),statusNote:root.statusNote,seriesId:root.fulfilledSeriesId,members:members.map(member=>({id:member.id,nickname:member.profile.nickname,title:member.title,referenceUrl:member.referenceUrl,message:member.message,reply:member.reply,internalNote:member.internalNote,version:member.version,createdAt:member.createdAt.toISOString()})),mergeTargets:targets.filter(target=>target.members.length+members.length+1<=200).map(summary),workOptions:works.map(row=>({id:row.id,title:getWorkTitle(row),href:`/series/${row.slug}`,category:row.category}))});
  });
}
export async function updateRequestStatus(input:unknown):Promise<RequestResult<{id:string}>>{
  return authenticated(true,async tx=>{
    const parsed=statusRequestSchema.safeParse(input);if(!parsed.success)return fail("invalid_input");
    const data=parsed.data,row=await tx.contentRequest.findUnique({where:{id:data.id}});
    if(!row)return fail("not_found");if(row.mergedIntoId)return fail("invalid_merge");if(row.version!==data.expectedVersion)return fail("conflict");
    const seriesId=data.status==="available"?data.seriesId??null:null;
    if(seriesId&&!await tx.series.findFirst({where:{id:seriesId,chapters:{some:liveChapterWhere()}},select:{id:true}}))return fail("invalid_series");
    if(row.status===data.status && row.statusNote===data.statusNote && row.fulfilledSeriesId===seriesId)return ok({id:row.id});
    const changed=await tx.contentRequest.updateMany({where:{id:row.id,version:data.expectedVersion,mergedIntoId:null},data:{status:data.status,statusNote:data.statusNote,fulfilledSeriesId:seriesId,version:{increment:1}}});
    if(changed.count!==1)return fail("conflict");
    const members=await tx.contentRequest.findMany({where:groupWhere(row.id),select:{id:true,profileId:true}});
    await notify(tx,distinctOwners(members),`تحديث طلب العمل: ${REQUEST_STATUS_LABELS[data.status]}`,data.statusNote);
    return ok({id:row.id});
  },true);
}
export async function replyToRequest(input:unknown):Promise<RequestResult<{id:string}>>{
  return authenticated(true,async tx=>{
    const parsed=replyRequestSchema.safeParse(input);if(!parsed.success)return fail("invalid_input");
    const data=parsed.data,row=await tx.contentRequest.findUnique({where:{id:data.id}});
    if(!row)return fail("not_found");if(row.version!==data.expectedVersion)return fail("conflict");
    if(row.reply===data.reply&&row.internalNote===data.internalNote)return ok({id:row.mergedIntoId??row.id});
    const changed=await tx.contentRequest.updateMany({where:{id:row.id,version:data.expectedVersion},data:{reply:data.reply,internalNote:data.internalNote,version:{increment:1}}});
    if(changed.count!==1)return fail("conflict");
    if(data.reply && row.reply!==data.reply)await notify(tx,[{id:row.id,profileId:row.profileId}],"رد الإدارة على طلبك",data.reply);
    return ok({id:row.mergedIntoId??row.id});
  },true);
}
export async function mergeContentRequests(input:unknown):Promise<RequestResult<{id:string}>>{
  return authenticated(true,async tx=>{
    const parsed=mergeRequestSchema.safeParse(input);if(!parsed.success)return fail("invalid_input");
    const data=parsed.data;if(data.sourceId===data.targetId)return fail("invalid_merge");
    const source=await tx.contentRequest.findUnique({where:{id:data.sourceId}}),target=await tx.contentRequest.findUnique({where:{id:data.targetId}});
    if(!source||!target)return fail("not_found");
    if(source.version!==data.expectedSourceVersion||target.version!==data.expectedTargetVersion)return fail("conflict");
    if(source.mergedIntoId||target.mergedIntoId||source.category!==target.category||source.status==="available"||target.status==="available")return fail("invalid_merge");
    const sourceMembers=await tx.contentRequest.findMany({where:groupWhere(source.id),select:{id:true,profileId:true}});
    const targetCount=await tx.contentRequest.count({where:groupWhere(target.id)});
    if(sourceMembers.length+targetCount>200)return fail("group_limit");
    // Increment every moved member so stale member replies cannot race the changed group context.
    await tx.contentRequest.updateMany({where:groupWhere(source.id),data:{mergedIntoId:target.id,version:{increment:1}}});
    await tx.contentRequest.update({where:{id:target.id},data:{version:{increment:1}}});
    if(source.status!==target.status||source.statusNote!==target.statusNote)await notify(tx,distinctOwners(sourceMembers),`تحديث طلب العمل: ${REQUEST_STATUS_LABELS[target.status]}`,target.statusNote);
    return ok({id:target.id});
  },true);
}
