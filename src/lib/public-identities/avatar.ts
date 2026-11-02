import 'server-only';
import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db, withDatabaseScope } from '@/lib/db';
import { withSerializableTx, type EditorialResult } from '@/lib/editorial';
import { getTrustedAppOrigin } from '@/lib/account-mail';
import { getMediaStorage } from '@/lib/media/storage';
import { sniffPage } from '@/lib/media/formats';
import { identityAvatarKey, identityAvatarPath, readIdentityAvatar } from './avatar-policy';

type Actor = {id:string|null;role:string;nickname:string};
const responseHeaders = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function respond(result: EditorialResult): Response {
  if (result.ok) return Response.json({ok:true,...(result.data as object??{})},{headers:responseHeaders});
  const error=result.error??'unavailable';
  const status=error==='unauthenticated'?401:error==='forbidden'?403:error==='not_found'||error==='disabled'?404:error==='conflict'?409:error==='rate_limit'?429:error==='storage_failed'||error==='unavailable'?503:400;
  return Response.json({ok:false,error},{status,headers:responseHeaders});
}
function invalidate() {
  for(const route of ['/translators','/following','/profile/teams','/admin/translators']) revalidatePath(route);
  for(const route of ['/translators/[slug]','/profile/teams/[id]','/admin/translators/[id]','/series/[slug]']) revalidatePath(route,'page');
}
async function authorize(tx: Prisma.TransactionClient, actor: Actor, id:string, version:number) {
  const identity=await tx.publicIdentity.findUnique({where:{id}});
  if(!identity) return {error:'not_found'} as const;
  if(!actor.id || (actor.role!=='admin' && (identity.ownerProfileId!==actor.id || identity.kind!=='team'))) return {error:'forbidden'} as const;
  if(actor.role!=='admin'&&identity.status!=='active') return {error:'forbidden'} as const;
  if(identity.version!==version) return {error:'conflict'} as const;
  return {identity} as const;
}
async function reserve(tx:Prisma.TransactionClient, actorId:string) {
  const windowMs=3600000, now=Date.now(), bucket=Math.floor(now/windowMs),keyHash=`identity-avatar:${actorId}:${bucket}`;
  const previous=await tx.accountRateLimit.findUnique({where:{keyHash}});if((previous?.count??0)>=10)return false;
  await tx.accountRateLimit.upsert({where:{keyHash},create:{keyHash,count:1,windowEnd:new Date((bucket+1)*windowMs)},update:{count:{increment:1}}});return true;
}
/** Origin and actor checks precede body buffering; authorization is rechecked after storage. */
export async function changeIdentityAvatar(request:Request,id:string,remove=false):Promise<Response> {
  try {
    if(request.headers.get('origin')!==getTrustedAppOrigin() || request.headers.get('x-identity-avatar')!=='1')return respond({ok:false,error:'forbidden'});
    if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,95}$/.test(id))return respond({ok:false,error:'invalid_input'});
    const raw=request.headers.get('x-identity-version');if(!raw||!/^\d+$/.test(raw))return respond({ok:false,error:'invalid_input'});
    const version=Number(raw);if(!Number.isSafeInteger(version))return respond({ok:false,error:'invalid_input'});
    if(!remove&&process.env.MEDIA_UPLOADS_ENABLED!=='1')return respond({ok:false,error:'disabled'});
    return await withDatabaseScope(async()=>{
      const check=await withSerializableTx(async(tx,actor)=>{
        const found=await authorize(tx,actor,id,version);if(found.error)return {ok:false,error:found.error};
        if(!remove&&!await reserve(tx,actor.id!))return {ok:false,error:'rate_limit'};
        return {ok:true};
      },{invalidate:false});
      if(!check.ok)return respond(check);
      let key:string|null=null;
      if(!remove) {
        if(request.headers.get('content-type')?.split(';')[0]!=='image/webp')return respond({ok:false,error:'invalid_image'});
        let bytes:Uint8Array;try{bytes=await readIdentityAvatar(request);const image=sniffPage(bytes);if(image.mime!=='image/webp'||image.width!==image.height||image.width>512)throw Error('invalid_image');}
        catch(error){return respond({ok:false,error:error instanceof Error&&error.message==='invalid_length'?'invalid_length':'invalid_image'});}
        key=identityAvatarKey(id,`${crypto.randomUUID()}.webp`,process.env.MEDIA_STORAGE_PREFIX||'prod');
        try{await(await getMediaStorage()).putPage(key,bytes,'image/webp');}catch{return respond({ok:false,error:'storage_failed'});}
      }
      // On an uncertain transaction failure retain the new object: it may be current.
      let oldKey:string|null=null;
      const saved=await withSerializableTx(async(tx,actor)=>{
        const found=await authorize(tx,actor,id,version);if(found.error)return {ok:false,error:found.error};
        const current=found.identity;oldKey=current.avatarKey;
        if(remove&&!oldKey)return {ok:true,data:{avatarPath:null,version:current.version}};
        const updated=await tx.publicIdentity.update({where:{id},data:{avatarKey:key,version:{increment:1}}});
        await tx.accountAudit.create({data:{actorId:actor.id,targetId:current.ownerProfileId??actor.id,action:remove?'identity_avatar_removed':'identity_avatar_changed',metadata:{identityId:id}}});
        return {ok:true,data:{avatarPath:identityAvatarPath(id,key),version:updated.version}};
      },{invalidate:false});
      if(!saved.ok) {if(key)await(await getMediaStorage()).deleteObject(key).catch(()=>{});return respond(saved);}
      if(oldKey&&oldKey!==key&&identityAvatarPath(id,oldKey)) {
        try{await(await getMediaStorage()).deleteObject(oldKey);}catch{/* A cleanup outage never discards the committed replacement. */}
      }
      invalidate();return respond(saved);
    });
  } catch {return respond({ok:false,error:'unavailable'});}
}
export async function getIdentityAvatar(id:string,file:string):Promise<Response> {
  try {
    return await withDatabaseScope(async()=>{
      const identity=await db.publicIdentity.findUnique({where:{id},select:{status:true,avatarKey:true}});
      if(!identity||identity.status!=='active'||identityAvatarPath(id,identity.avatarKey)!==`/api/identity-avatars/${id}/${file}`)return new Response(null,{status:404,headers:responseHeaders});
      const expected=identityAvatarKey(id,file,process.env.MEDIA_STORAGE_PREFIX||'prod');if(identity.avatarKey!==expected)return new Response(null,{status:404,headers:responseHeaders});
      return new Response(null,{status:307,headers:{...responseHeaders,Location:await(await getMediaStorage()).signGet(expected,{expiresIn:300})}});
    });
  }catch{return new Response(null,{status:503,headers:responseHeaders});}
}
