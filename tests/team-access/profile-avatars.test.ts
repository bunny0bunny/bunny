import {afterAll,beforeAll,beforeEach,expect,mock,test} from 'bun:test';
import {db,setActor} from './session-fixture';
const deleted:string[]=[],written:string[]=[];
let afterPut:(()=>Promise<void>)|undefined,failStorage=false;
mock.module('../../src/lib/media/storage',()=>({getMediaStorage:async()=>({putPage:async(key:string)=>{if(failStorage)throw Error('storage unavailable');written.push(key);await afterPut?.();return {bytes:26};},deleteObject:async(key:string)=>{deleted.push(key);},signGet:async()=> 'https://example.invalid/me'})}));
const {changeOwnProfileAvatar,getProfileAvatar,removeProfileAvatarAsAdmin}=await import('../../src/lib/profile-avatar');
const {profileAvatarKey,profileAvatarPath,MAX_PROFILE_AVATAR_BYTES}=await import('../../src/lib/profile-avatar-policy');
const {getVisibleComments}=await import('../../src/lib/queries');
let me:string,other:string,admin:string,oldKey:string,seriesId:string;
const image=Uint8Array.from([...Buffer.from('RIFF'),18,0,0,0,...Buffer.from('WEBPVP8L'),6,0,0,0,0x2f,0,0,0,0,0]);
beforeAll(async()=>{
 const stamp=Date.now();
 const make=(tag:string,role:'reader'|'admin')=>db.profile.create({data:{email:`pavatar-${stamp}-${tag}@bunny.test`,nickname:`قارئ ${tag}`,passwordHash:'x',role,emailVerifiedAt:new Date()}});
 me=(await make('me','reader')).id;other=(await make('other','reader')).id;admin=(await make('admin','admin')).id;
 oldKey=profileAvatarKey(me,'original.webp','test');
 const series=await db.series.create({data:{slug:`pavatar-${stamp}`,titleAr:'عمل تجربة الصور',synopsisAr:'عمل لاختبار صور الحسابات',format:'novel',author:'اختبار',coverPath:'/art/covers/warden-of-the-twilight-gate.webp'}});seriesId=series.id;
 await db.comment.create({data:{seriesId,profileId:me,body:'تعليق بصورة'}});
});
beforeEach(async()=>{
 setActor(me);afterPut=undefined;failStorage=false;deleted.length=0;written.length=0;
 await db.profile.update({where:{id:me},data:{emailVerifiedAt:new Date(),disabledAt:null,authVersion:0,avatarKey:oldKey}});
 await db.accountRateLimit.deleteMany({where:{keyHash:{startsWith:`profile-avatar:${me}:`}}});
});
afterAll(async()=>{setActor(null);await db.comment.deleteMany({where:{seriesId}});await db.series.delete({where:{id:seriesId}});await db.accountAudit.deleteMany({where:{OR:[{actorId:{in:[me,other,admin]}},{targetId:{in:[me,other,admin]}}]}});await db.profile.deleteMany({where:{id:{in:[me,other,admin]}}});});
function request(options:{origin?:string;bytes?:Uint8Array;mime?:string;length?:number;remove?:boolean;header?:string}={}){
 const body=options.bytes??image;
 return new Request(`${process.env.APP_ORIGIN}/api/profile-avatar`,{method:options.remove?'DELETE':'POST',headers:{origin:options.origin??process.env.APP_ORIGIN!,'x-profile-avatar':options.header??'1','content-type':options.mime??'image/webp','content-length':String(options.length??body.length)},...(!options.remove?{body:body as BodyInit}:{})});
}
test('a reader replaces and removes only their own picture; the old object is deleted after commit',async()=>{
 const response=await changeOwnProfileAvatar(request());expect(response.status).toBe(200);const result=await response.json();
 expect(result.avatarPath).toStartWith(`/api/profile-avatars/${me}/`);
 const row=await db.profile.findUniqueOrThrow({where:{id:me}});expect(row.avatarKey).toBe(written[0]);expect(written[0]).toStartWith(`media/test/profiles-${me}/`);expect(deleted).toEqual([oldKey]);
 expect(await db.profile.findUniqueOrThrow({where:{id:other},select:{avatarKey:true}})).toEqual({avatarKey:null});
 const file=row.avatarKey!.split('/').at(-1)!;const served=await getProfileAvatar(me,file);expect(served.status).toBe(307);expect(served.headers.get('cache-control')).toBe('private, max-age=240');
 expect((await getProfileAvatar(me,'original.webp')).status).toBe(404);expect((await getProfileAvatar(other,file)).status).toBe(404);
 expect((await changeOwnProfileAvatar(request({remove:true}),true)).status).toBe(200);expect((await db.profile.findUniqueOrThrow({where:{id:me}})).avatarKey).toBeNull();expect(deleted).toContain(row.avatarKey!);
 expect(await db.accountAudit.count({where:{targetId:me,action:{in:['profile_avatar_changed','profile_avatar_removed']}}})).toBeGreaterThanOrEqual(2);
});
test('guests, bad origin, missing header, disabled uploads and stale sessions cannot write storage',async()=>{
 setActor(null);expect((await changeOwnProfileAvatar(request())).status).toBe(401);setActor(me);
 expect((await changeOwnProfileAvatar(request({origin:'https://invalid.example'}))).status).toBe(403);
 expect((await changeOwnProfileAvatar(request({header:'0'}))).status).toBe(403);
 const flag=process.env.MEDIA_UPLOADS_ENABLED;process.env.MEDIA_UPLOADS_ENABLED='0';expect((await changeOwnProfileAvatar(request())).status).toBe(404);process.env.MEDIA_UPLOADS_ENABLED=flag;
 await db.profile.update({where:{id:me},data:{authVersion:1}});expect((await changeOwnProfileAvatar(request())).status).toBe(401);
 expect(written).toHaveLength(0);expect((await db.profile.findUniqueOrThrow({where:{id:me}})).avatarKey).toBe(oldKey);
});
test('oversize, short, wrong type and non-image bodies keep the current picture',async()=>{
 for(const opts of [{length:MAX_PROFILE_AVATAR_BYTES+1},{length:image.length-1},{mime:'image/png'},{bytes:Uint8Array.from([1,2,3])}])expect((await changeOwnProfileAvatar(request(opts))).ok).toBe(false);
 expect((await db.profile.findUniqueOrThrow({where:{id:me}})).avatarKey).toBe(oldKey);expect(written).toHaveLength(0);
});
test('storage outage and a session revoked mid-upload keep the old picture and clean the orphan',async()=>{
 failStorage=true;expect((await changeOwnProfileAvatar(request())).status).toBe(503);expect((await db.profile.findUniqueOrThrow({where:{id:me}})).avatarKey).toBe(oldKey);failStorage=false;
 afterPut=async()=>{await db.profile.update({where:{id:me},data:{disabledAt:new Date()}});};
 expect((await changeOwnProfileAvatar(request())).status).toBe(401);expect((await db.profile.findUniqueOrThrow({where:{id:me}})).avatarKey).toBe(oldKey);expect(deleted).toEqual(written);expect(deleted).not.toContain(oldKey);
});
test('profile picture quota is separate from team logos and stops at 10 per hour',async()=>{
 const bucket=Math.floor(Date.now()/3600000);
 await db.accountRateLimit.upsert({where:{keyHash:`identity-avatar:${me}:${bucket}`},create:{keyHash:`identity-avatar:${me}:${bucket}`,count:10,windowEnd:new Date(Date.now()+3600000)},update:{count:10}});
 expect((await changeOwnProfileAvatar(request())).status).toBe(200);
 await db.accountRateLimit.update({where:{keyHash:`profile-avatar:${me}:${bucket}`},data:{count:10}});
 expect((await changeOwnProfileAvatar(request())).status).toBe(429);
 await db.accountRateLimit.deleteMany({where:{keyHash:`identity-avatar:${me}:${bucket}`}});
});
test('only admins remove someone else\'s picture, audited; disabled accounts stop serving it',async()=>{
 setActor(other);expect((await removeProfileAvatarAsAdmin(me)).ok).toBe(false);expect((await db.profile.findUniqueOrThrow({where:{id:me}})).avatarKey).toBe(oldKey);
 await db.profile.update({where:{id:me},data:{disabledAt:new Date()}});expect((await getProfileAvatar(me,'original.webp')).status).toBe(404);await db.profile.update({where:{id:me},data:{disabledAt:null}});
 setActor(admin);expect((await removeProfileAvatarAsAdmin(me)).ok).toBe(true);expect((await db.profile.findUniqueOrThrow({where:{id:me}})).avatarKey).toBeNull();expect(deleted).toEqual([oldKey]);
 expect(await db.accountAudit.count({where:{actorId:admin,targetId:me,action:'profile_avatar_removed_by_admin'}})).toBe(1);
});
test('comment authors carry their picture path; foreign keys never produce a path',async()=>{
 const [comment]=await getVisibleComments(seriesId,null,null);expect(comment.author.avatarPath).toBe(`/api/profile-avatars/${me}/original.webp`);
 expect(profileAvatarPath(me,profileAvatarKey(other,'x.webp','test'))).toBeNull();
});
