import { expect, mock, test } from "bun:test";
let session: {id:string;authVersion:number}|null=null;
let current: {id:string;role:string;authVersion:number;emailVerifiedAt:Date|null;disabledAt:Date|null}|null=null;
let replyRow={id:"member",profileId:"owner",reply:"old reply",internalNote:null as string|null,version:1,mergedIntoId:null as string|null};
const notices:unknown[]=[];
mock.module("server-only",()=>({}));
mock.module("@/lib/queries",()=>({getPublishedSeries:async()=>[],currentProfileOrNull:async()=>session,liveChapterWhere:()=>({workflow:"published"})}));
mock.module("@/lib/db",()=>({db:{$transaction:async(work:(tx:unknown)=>unknown)=>{
  if(!session)throw Error("guest reached database mutation");
  return work({profile:{findUnique:async()=>current},contentRequest:{findUnique:async()=>({...replyRow}),updateMany:async({data}:{data:{reply:string|null;internalNote:string|null}})=>{replyRow={...replyRow,...data,version:replyRow.version+1};return {count:1};}},notification:{createMany:async({data}:{data:unknown[]})=>{notices.push(...data);}}});
}}}));
mock.module("next/cache",()=>({revalidatePath:()=>{}}));
const service=await import("../../src/lib/content-requests/service");
test("unauthenticated mutations return safe errors before opening a transaction",async()=>{
  expect(await service.createContentRequest({title:"valid",category:"manga",submissionId:crypto.randomUUID()})).toEqual({ok:false,error:"unauthenticated"});
  expect(await service.listMyRequests()).toEqual({ok:false,error:"unauthenticated"});
  expect(await service.getAdminNewRequestCount()).toBe(0);
});
test("transaction uses fresh role and rejects revoked verification or session version",async()=>{
  session={id:"actor",authVersion:0};
  current={id:"actor",role:"reader",authVersion:0,emailVerifiedAt:new Date(),disabledAt:null};
  expect(await service.updateRequestStatus({id:"owned",expectedVersion:1,status:"reviewing"})).toEqual({ok:false,error:"forbidden"});
  for(const data of [{disabledAt:new Date()},{emailVerifiedAt:null},{authVersion:1}]){
    current={id:"actor",role:"admin",authVersion:0,emailVerifiedAt:new Date(),disabledAt:null,...data};
    expect(await service.updateRequestStatus({id:"owned",expectedVersion:1,status:"reviewing"})).toEqual({ok:false,error:"unauthenticated"});
  }
  session=null;current=null;
});

test("clearing a private reply remains silent",async()=>{
  session={id:"actor",authVersion:0};current={id:"actor",role:"admin",authVersion:0,emailVerifiedAt:new Date(),disabledAt:null};
  expect((await service.replyToRequest({id:"member",expectedVersion:1,reply:"",internalNote:"admin only"})).ok).toBe(true);
  expect(replyRow.reply).toBeNull();
  expect(notices).toHaveLength(0);
  session=null;current=null;
});
