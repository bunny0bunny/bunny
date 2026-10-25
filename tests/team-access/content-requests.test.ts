import { afterAll, beforeAll, expect, test } from "bun:test";
const { db, setActor, withActor } = await import("./session-fixture");
const requests = await import("../../src/lib/content-requests/service");
const prefix = `request-${crypto.randomUUID()}`;
let admin:string, one:string, two:string, editor:string;
const ids:string[]=[];
async function submit(actor:string,title:string,category="manga",submissionId=crypto.randomUUID()) { return withActor(actor,()=>requests.createContentRequest({title,category,submissionId})); }
function saved(result:Awaited<ReturnType<typeof submit>>) { expect(result.ok).toBe(true); if(!result.ok)throw Error(result.error); ids.push(result.data.id); return result.data.id; }
beforeAll(async()=>{
  const make = async (suffix:string,role:"admin"|"reader"|"editor") => (await db.profile.create({data:{email:`${prefix}-${suffix}@bunny.test`,nickname:suffix,passwordHash:"x",role,emailVerifiedAt:new Date()}})).id;
  admin=await make("admin","admin");one=await make("one","reader");two=await make("two","reader");editor=await make("editor","editor");
});
afterAll(async()=>{
  setActor(null);
  await db.contentRequest.updateMany({where:{profileId:{in:[admin,one,two,editor]}},data:{mergedIntoId:null}});
  await db.profile.deleteMany({where:{id:{in:[admin,one,two,editor]}}});
  await db.$disconnect();
});
test("request mutations recheck active verified accounts and admin role", async()=>{
  setActor(null);expect((await requests.createContentRequest({title:"guest",category:"manga",submissionId:crypto.randomUUID()})).ok).toBe(false);
  for(const data of [{disabledAt:new Date()},{emailVerifiedAt:null},{authVersion:1}]) {
    await db.profile.update({where:{id:editor},data});
    expect((await submit(editor,"blocked")).ok).toBe(false);
    await db.profile.update({where:{id:editor},data:{disabledAt:null,emailVerifiedAt:new Date(),authVersion:0}});
  }
  expect(await withActor(editor,()=>requests.getAdminNewRequestCount())).toBe(0);
  expect((await withActor(editor,()=>requests.listAdminRequests())).ok).toBe(false);
});
test("concurrent duplicate submissions persist once and preserve first original text", async()=>{
  const key=crypto.randomUUID();const results=await Promise.all([submit(one,"Original Work","manga",key),submit(one,"Original Work","manga",key)]);
  expect(results.every(r=>r.ok)).toBe(true); const id=saved(results[0]);
  if(results[1].ok)expect(results[1].data.id).toBe(id);
  const dup=await submit(one,"  ORIGINAL   Work  ");expect(dup.ok).toBe(true);if(dup.ok)expect(dup.data.id).toBe(id);
  expect((await db.contentRequest.findUniqueOrThrow({where:{id}})).title).toBe("Original Work");
  expect(await db.notification.count({where:{profileId:admin,href:`/admin/requests/${id}`}})).toBe(1);
  expect((await withActor(two,()=>requests.getMyRequest(id))).ok).toBe(false);
});
test("merges flatten roots, preserve each private reply and reject stale updates", async()=>{
  const a=saved(await submit(one,"Second Work"));const b=saved(await submit(two,"Other Work"));const c=saved(await submit(two,"Another Work"));
  expect((await withActor(admin,()=>requests.replyToRequest({id:a,expectedVersion:1,reply:"only one",internalNote:"secret one"}))).ok).toBe(true);
  expect((await withActor(admin,()=>requests.replyToRequest({id:b,expectedVersion:1,reply:"only two",internalNote:"secret two"}))).ok).toBe(true);
  expect((await withActor(admin,()=>requests.mergeContentRequests({sourceId:a,targetId:b,expectedSourceVersion:2,expectedTargetVersion:2}))).ok).toBe(true);
  const bv=(await db.contentRequest.findUniqueOrThrow({where:{id:b}})).version;
  expect((await withActor(admin,()=>requests.mergeContentRequests({sourceId:b,targetId:c,expectedSourceVersion:bv,expectedTargetVersion:1}))).ok).toBe(true);
  expect((await db.contentRequest.findUniqueOrThrow({where:{id:a}})).mergedIntoId).toBe(c);
  const own=await withActor(one,()=>requests.getMyRequest(a));expect(own.ok).toBe(true);
  if(own.ok){expect(own.data.reply).toBe("only one");expect(own.data).not.toHaveProperty("internalNote");expect(own.data).not.toHaveProperty("mergedIntoId");expect(own.data).not.toHaveProperty("profileId");}
  const detail=await withActor(admin,()=>requests.getAdminRequest(c));expect(detail.ok).toBe(true);if(detail.ok){expect(detail.data.requesterCount).toBe(2);expect(detail.data.members).toHaveLength(3);}
  const version=(await db.contentRequest.findUniqueOrThrow({where:{id:c}})).version;
  const input={id:c,expectedVersion:version,status:"preparing",statusNote:"shared note"};
  expect((await withActor(admin,()=>requests.updateRequestStatus(input))).ok).toBe(true);
  const count=await db.notification.count({where:{profileId:{in:[one,two]}}});
  expect((await withActor(admin,()=>requests.updateRequestStatus(input))).ok).toBe(false);
  expect((await withActor(admin,()=>requests.updateRequestStatus({...input,expectedVersion:version+1}))).ok).toBe(true);
  expect(await db.notification.count({where:{profileId:{in:[one,two]}}})).toBe(count);
  const reader=await withActor(one,()=>requests.getMyRequest(a));if(reader.ok)expect(reader.data.statusNote).toBe("shared note");
});
test("quota counts persisted originals including merged members",async()=>{
  saved(await submit(one,"Third Work"));
  expect(await submit(one,"Fourth Work")).toEqual({ok:false,error:"quota_exceeded"});
});
test("available requires public live chapters and withdrawal removes private link",async()=>{
  const id=saved(await submit(two,"Available Work"));
  const series=await db.series.create({data:{slug:prefix,titleAr:"available fixture",synopsisAr:"fixture",format:"novel",author:"fixture",coverPath:"/fixture"}});
  try{
    expect(await withActor(admin,()=>requests.updateRequestStatus({id,expectedVersion:1,status:"available",seriesId:series.id}))).toEqual({ok:false,error:"invalid_series"});
    await db.chapter.create({data:{seriesId:series.id,number:1,titleAr:"chapter",workflow:"published"}});
    expect((await withActor(admin,()=>requests.updateRequestStatus({id,expectedVersion:1,status:"available",seriesId:series.id}))).ok).toBe(true);
    const live=await withActor(two,()=>requests.getMyRequest(id));if(live.ok)expect(live.data.availableSeries?.href).toBe(`/series/${prefix}`);
    await db.chapter.updateMany({where:{seriesId:series.id},data:{workflow:"draft"}});
    const withdrawn=await withActor(two,()=>requests.getMyRequest(id));if(withdrawn.ok)expect(withdrawn.data.availableSeries).toBeNull();
  }finally{await db.series.delete({where:{id:series.id}});}
});

test("member replies notify their owner only and internal notes stay silent",async()=>{
  const row=await db.contentRequest.findFirstOrThrow({where:{profileId:one,title:"Second Work"}});
  const baselineOne=await db.notification.count({where:{profileId:one}}),baselineTwo=await db.notification.count({where:{profileId:two}});
  expect((await withActor(admin,()=>requests.replyToRequest({id:row.id,expectedVersion:row.version,reply:"private change",internalNote:"private admin note"}))).ok).toBe(true);
  expect(await db.notification.count({where:{profileId:one}})).toBe(baselineOne+1);
  expect(await db.notification.count({where:{profileId:two}})).toBe(baselineTwo);
  expect((await withActor(admin,()=>requests.replyToRequest({id:row.id,expectedVersion:row.version+1,reply:"private change",internalNote:"changed admin note"}))).ok).toBe(true);
  expect(await db.notification.count({where:{profileId:one}})).toBe(baselineOne+1);
  expect((await withActor(admin,()=>requests.replyToRequest({id:row.id,expectedVersion:row.version+2,reply:"private change",internalNote:"changed admin note"}))).ok).toBe(true);
  expect(await db.notification.count({where:{profileId:one}})).toBe(baselineOne+1);
});
test("merge rejects cycles, unlike categories, available roots and groups above 200 originals",async()=>{
  const create=async(title:string,category:"manga"|"novel"="manga",mergedIntoId:string|null=null)=>db.contentRequest.create({data:{profileId:editor,title,normalizedTitle:title,category,submissionId:crypto.randomUUID(),mergedIntoId}});
  const source=await create("cap-source"),target=await create("cap-target"),unlike=await create("unlike","novel");
  const merge=(sourceId:string,targetId:string,expectedSourceVersion=1,expectedTargetVersion=1)=>withActor(admin,()=>requests.mergeContentRequests({sourceId,targetId,expectedSourceVersion,expectedTargetVersion}));
  expect(await merge(source.id,source.id)).toEqual({ok:false,error:"invalid_merge"});
  expect(await merge(source.id,unlike.id)).toEqual({ok:false,error:"invalid_merge"});
  await db.contentRequest.createMany({data:Array.from({length:199},(_,i)=>({profileId:editor,title:`cap-member-${i}`,normalizedTitle:`cap-member-${i}`,category:"manga" as const,submissionId:crypto.randomUUID(),mergedIntoId:target.id}))});
  expect(await merge(source.id,target.id)).toEqual({ok:false,error:"group_limit"});
  const available=await db.contentRequest.findFirstOrThrow({where:{title:"Available Work",profileId:two}});
  expect(await merge(source.id,available.id,1,available.version)).toEqual({ok:false,error:"invalid_merge"});
  const child=await create("already-merged","manga",source.id);
  expect(await merge(child.id,source.id)).toEqual({ok:false,error:"invalid_merge"});
});
test("attempt throttling bounds invalid retries without spending persisted quota",async()=>{
  // No earlier submit attempts use this account: direct setup above deliberately bypasses submit.
  for(let i=0;i<20;i++)expect(await submit(editor,"x")).toEqual({ok:false,error:"invalid_input"});
  expect(await submit(editor,"Valid after spam")).toEqual({ok:false,error:"rate_limited"});
  expect(await db.contentRequest.count({where:{profileId:editor,title:"Valid after spam"}})).toBe(0);
});
