import {afterAll,beforeAll,beforeEach,expect,mock,test} from 'bun:test';
import {db,setActor} from './session-fixture';
const deleted:string[]=[],written:string[]=[];
let afterPut:(()=>Promise<void>)|undefined,failStorage=false;
mock.module('../../src/lib/media/storage',()=>({getMediaStorage:async()=>({putPage:async(key:string)=>{if(failStorage)throw Error('storage unavailable');written.push(key);await afterPut?.();return {bytes:26};},deleteObject:async(key:string)=>{deleted.push(key);},signGet:async()=> 'https://example.invalid/logo'})}));
const {changeIdentityAvatar,getIdentityAvatar}=await import('../../src/lib/public-identities/avatar');
const {identityAvatarKey,identityAvatarPath,MAX_IDENTITY_AVATAR_BYTES}=await import('../../src/lib/public-identities/avatar-policy');
let owner:string,other:string,admin:string,id:string,oldKey:string;
const image=Uint8Array.from([...Buffer.from('RIFF'),18,0,0,0,...Buffer.from('WEBPVP8L'),6,0,0,0,0x2f,0,0,0,0,0]);
beforeAll(async()=>{
 const stamp=Date.now();
 for(const role of ['reader','reader','admin'] as const){const p=await db.profile.create({data:{email:`avatar-${stamp}-${owner?other?'admin':'other':'owner'}@bunny.test`,nickname:'Avatar QA',passwordHash:'x',role,emailVerifiedAt:new Date()}});if(!owner)owner=p.id;else if(!other)other=p.id;else admin=p.id;}
 const identity=await db.publicIdentity.create({data:{slug:`avatar-${stamp}`,displayName:'فريق التجربة',kind:'team',ownerProfileId:owner}});id=identity.id;oldKey=identityAvatarKey(id,'original.webp','test');
});
beforeEach(async()=>{
 setActor(owner);afterPut=undefined;failStorage=false;deleted.length=0;written.length=0;
 await db.profile.update({where:{id:owner},data:{emailVerifiedAt:new Date(),disabledAt:null,authVersion:0}});
 await db.publicIdentity.update({where:{id},data:{ownerProfileId:owner,kind:'team',status:'active',avatarKey:oldKey,version:1}});
 await db.accountRateLimit.deleteMany({where:{keyHash:{startsWith:`identity-avatar:${owner}:`}}});
});
afterAll(async()=>{setActor(null);await db.publicIdentity.delete({where:{id}});await db.accountAudit.deleteMany({where:{actorId:{in:[owner,other,admin]}}});await db.profile.deleteMany({where:{id:{in:[owner,other,admin]}}});});
function request(options:{version?:number;origin?:string;bytes?:Uint8Array;mime?:string;length?:number;remove?:boolean}={}){
 const body=options.bytes??image;
 return new Request(`${process.env.APP_ORIGIN}/api/public-identities/${id}/avatar`,{method:options.remove?'DELETE':'POST',headers:{origin:options.origin??process.env.APP_ORIGIN!,'x-identity-avatar':'1','x-identity-version':String(options.version??1),'content-type':options.mime??'image/webp','content-length':String(options.length??body.length)},...(!options.remove?{body:body as BodyInit}:{})});
}
test('verified reader owner can replace/remove logo without chapter permissions; current image is public only while active',async()=>{
 const response=await changeIdentityAvatar(request(),id);expect(response.status).toBe(200);const result=await response.json();expect(result.version).toBe(2);expect(result.avatarPath).toStartWith(`/api/identity-avatars/${id}/`);
 const row=await db.publicIdentity.findUniqueOrThrow({where:{id}});expect(row.avatarKey).toBe(written[0]);expect(deleted).toEqual([oldKey]);expect(identityAvatarPath(id,row.avatarKey)).toBe(result.avatarPath);
 const file=row.avatarKey!.split('/').at(-1)!;expect((await getIdentityAvatar(id,file)).status).toBe(307);expect((await getIdentityAvatar(id,'original.webp')).status).toBe(404);
 await db.publicIdentity.update({where:{id},data:{status:'suspended'}});expect((await getIdentityAvatar(id,file)).status).toBe(404);await db.publicIdentity.update({where:{id},data:{status:'active'}});
 expect((await changeIdentityAvatar(request({version:2,remove:true}),id,true)).status).toBe(200);expect((await db.publicIdentity.findUniqueOrThrow({where:{id}})).avatarKey).toBeNull();expect(deleted).toContain(row.avatarKey!);
});
test('unrelated users, guests, bad origin, suspended owners and stale versions cannot write storage',async()=>{
 setActor(other);expect((await changeIdentityAvatar(request(),id)).status).toBe(403);setActor(null);expect((await changeIdentityAvatar(request(),id)).status).toBe(401);setActor(owner);
 expect((await changeIdentityAvatar(request({origin:'https://invalid.example'}),id)).status).toBe(403);expect((await changeIdentityAvatar(request({version:0}),id)).status).toBe(409);
 await db.publicIdentity.update({where:{id},data:{status:'suspended'}});expect((await changeIdentityAvatar(request(),id)).status).toBe(403);expect(written).toHaveLength(0);expect(deleted).toHaveLength(0);
});
test('oversize, incomplete, wrong MIME and invalid image bodies retain existing photo',async()=>{
 for(const opts of [{length:MAX_IDENTITY_AVATAR_BYTES+1},{length:image.length-1},{mime:'image/svg+xml'},{bytes:Uint8Array.from([1,2,3])}])expect((await changeIdentityAvatar(request(opts),id)).ok).toBe(false);
 expect((await db.publicIdentity.findUniqueOrThrow({where:{id}})).avatarKey).toBe(oldKey);expect(written).toHaveLength(0);expect(deleted).toHaveLength(0);
});
test('storage outage retains current photo and final owner/version revocation cleans only the successful request orphan',async()=>{
 failStorage=true;expect((await changeIdentityAvatar(request(),id)).status).toBe(503);expect((await db.publicIdentity.findUniqueOrThrow({where:{id}})).avatarKey).toBe(oldKey);expect(deleted).toHaveLength(0);failStorage=false;
 afterPut=async()=>{await db.publicIdentity.update({where:{id},data:{ownerProfileId:other,version:{increment:1}}});};
 expect((await changeIdentityAvatar(request(),id)).status).toBe(403);expect((await db.publicIdentity.findUniqueOrThrow({where:{id}})).avatarKey).toBe(oldKey);expect(deleted).toEqual(written);expect(deleted).not.toContain(oldKey);
});
test('fresh disabled/auth-version checks and upload quota prevent writes; key validation rejects foreign identity paths',async()=>{
 await db.profile.update({where:{id:owner},data:{authVersion:1}});expect((await changeIdentityAvatar(request(),id)).status).toBe(401);await db.profile.update({where:{id:owner},data:{authVersion:0,disabledAt:new Date()}});expect((await changeIdentityAvatar(request(),id)).status).toBe(401);await db.profile.update({where:{id:owner},data:{disabledAt:null}});
 const bucket=Math.floor(Date.now()/3600000);await db.accountRateLimit.create({data:{keyHash:`identity-avatar:${owner}:${bucket}`,count:10,windowEnd:new Date(Date.now()+3600000)}});expect((await changeIdentityAvatar(request(),id)).status).toBe(429);expect(written).toHaveLength(0);expect(identityAvatarPath(id,identityAvatarKey(other,'wrong.webp','test'))).toBeNull();
});
