import { identityAvatarPath } from "./avatar-policy";
import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { hashRateLimitKey } from '@/lib/account-ratelimit';
import { withSerializableTx } from '@/lib/editorial';
import { currentProfileOrNull, liveChapterWhere, toCard } from '@/lib/queries';
import { getWorkTitle } from '@/lib/work-title';
import type { Prisma } from '@prisma/client';
import type { IdentityView, IdentityDetail, CreditView, FollowView, IdentityResult, ManagedIdentityView } from './contracts';
const live = () => liveChapterWhere();
const identitySelect = {
    id: true, slug: true, displayName: true, bio: true, avatarSeed: true, kind: true, status: true, version: true, avatarKey: true
} as const;
type IdentityRow = Prisma.PublicIdentityGetPayload<{select: typeof identitySelect}>;
type RatingStats = {ratingAverage:number|null;ratingCount:number};
export { identityAvatarPath } from "./avatar-policy";
async function ratingStats(rows:IdentityRow[]):Promise<Map<string,RatingStats>> {
    const teams = rows.filter(row => row.kind === 'team');
    if (!teams.length) return new Map();
    // Batch team aggregates while excluding each current owner's vote.
    const owners = await db.publicIdentity.findMany({where:{id:{in:teams.map(row=>row.id)}},select:{id:true,ownerProfileId:true}});
    const aggregates = await db.identityRating.groupBy({by:['identityId'],where:{OR:owners.map(row=>({identityId:row.id,...(row.ownerProfileId?{profileId:{not:row.ownerProfileId}}:{})}))},_avg:{value:true},_count:{value:true}});
    return new Map(aggregates.map(row=>[row.identityId,{ratingAverage:row._avg.value,ratingCount:row._count.value}]));
}
async function view(row: IdentityRow, stats?:Map<string,RatingStats>): Promise<IdentityView> {
    const [followerCount, works, ratings] = await Promise.all([db.identityFollow.count({where:{identityId:row.id}}), db.seriesCredit.findMany({
        where:{identityId:row.id,series:{deletedAt:null,chapters:{some:live()}}},select:{seriesId:true},distinct:['seriesId']
    }), stats ?? ratingStats([row])]);
    const {avatarKey,...publicRow} = row;
    return {...publicRow,kind:row.kind as IdentityView['kind'],status:row.status as IdentityView['status'],followerCount,workCount:works.length,
        avatarPath:identityAvatarPath(row.id,avatarKey),...(ratings.get(row.id)??{ratingAverage:null,ratingCount:0})};
}
async function views(rows:IdentityRow[]):Promise<IdentityView[]> {
    const stats=await ratingStats(rows);
    return Promise.all(rows.map(row=>view(row,stats)));
}
async function viewer() {
    const session = await currentProfileOrNull();
    if (!session)
        return null;
    return db.profile.findFirst({ where: {
            id: session.id, disabledAt: null, emailVerifiedAt: { not: null }, authVersion: session.authVersion
        }, select: { id: true, role: true } });
}
export async function listPublicIdentities(): Promise<IdentityView[]> {
    return views(await db.publicIdentity.findMany({where:{status:'active'},select:identitySelect,orderBy:{displayName:'asc'}}));
}
export async function listManagedIdentities(): Promise<IdentityView[]> {
    if ((await viewer())?.role !== 'admin')
        return [];
    return views(await db.publicIdentity.findMany({select:identitySelect,orderBy:{displayName:'asc'}}));
}
export async function getManagedIdentity(id: string): Promise<ManagedIdentityView | null> {
    if ((await viewer())?.role !== 'admin')
        return null;
    const row = await db.publicIdentity.findUnique({where:{id},select:{...identitySelect,ownerProfileId:true}});
    if(!row)return null;
    const {ownerProfileId,...publicRow}=row;
    return {...await view(publicRow),ownerProfileId};
}
export async function getPublicIdentity(slug: string): Promise<IdentityDetail | null> {
    const row = await db.publicIdentity.findFirst({ where: { slug, status: 'active' }, select: identitySelect });
    if (!row)
        return null;
    const series = await db.series.findMany({
        where: {
            deletedAt: null, publicCredits: { some: { identityId: row.id } }, chapters: { some: live() }
        }, include: { chapters: { where: live(), orderBy: { number: 'desc' } } }, orderBy: { updatedAt: 'desc' }
    });
    const recent = await db.chapter.findMany({
        where: { ...live(), series: { deletedAt: null, publicCredits: { some: { identityId: row.id } } } }, include: { series: true }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 20
    });
    return {
        identity: await view(row), works: series.map(toCard), recentChapters: recent.map(ch => ({
            id: ch.id, number: ch.number, title: ch.series.isAdult ? '' : ch.titleAr, seriesTitle: getWorkTitle(ch.series), seriesSlug: ch.series.slug, format: ch.series.format, isAdult: ch.series.isAdult, isPremium: ch.isPremiumDemo, publishedAt: (ch.publishedAt ?? ch.createdAt).toISOString()
        }))
    };
}
export async function getSeriesCredits(seriesId: string, includeSuspended = false): Promise<CreditView[]> {
    if (includeSuspended && (await viewer())?.role !== 'admin')
        return [];
    const rows = await db.seriesCredit.findMany({
        where: {
            seriesId, series: { deletedAt: null, ...(!includeSuspended ? { chapters: { some: live() } } : {}) }, ...(!includeSuspended ? { identity: { status: 'active' } } : {})
        }, include: { identity: { select: identitySelect } }, orderBy: [{ position: 'asc' }, { id: 'asc' }]
    });
    return rows.map(r => ({
        identityId: r.identityId, slug: r.identity.slug, displayName: r.identity.displayName, role: r.role as CreditView['role'], status: r.identity.status as CreditView['status']
    }));
}
export async function getViewerIdentityFollow(identityId: string): Promise<FollowView> {
    const actor = await viewer();
    if (!actor)
        return { following: false, alertsEnabled: false };
    const row = await db.identityFollow.findUnique({ where: { profileId_identityId: { profileId: actor.id, identityId } } });
    return { following: !!row, alertsEnabled: !!row?.alertsEnabledAt };
}
export async function getFollowingIdentities(): Promise<(IdentityView & FollowView)[]> {
    const actor = await viewer();
    if (!actor)
        return [];
    const rows = await db.identityFollow.findMany({
        where: { profileId: actor.id }, include: { identity: { select: identitySelect } }, orderBy: { followedAt: 'desc' }
    });
    const stats = await ratingStats(rows.map(row=>row.identity));
    return Promise.all(rows.map(async (row) => ({
        ...await view(row.identity,stats), following: true, alertsEnabled: !!row.alertsEnabledAt
    })));
}
function invalidate() {
    for (const path of ['/translators', '/admin/translators', '/following', '/admin/series', '/profile/teams'])
        revalidatePath(path);
    for (const path of ['/translators/[slug]', '/admin/translators/[id]', '/admin/series/[id]', '/series/[slug]', '/profile/teams/[id]'])
        revalidatePath(path, 'page');
}
async function mutate(work: Parameters<typeof withSerializableTx>[0]): Promise<IdentityResult> {
    const result = await withSerializableTx(work, { invalidate: false });
    if (result.ok)
        invalidate();
    return {
        ok: result.ok, error: result.error, ...(result.data as object ?? {})
    };
}
const saveSchema = z.object({
    ownerProfileId: z.string().min(1).nullable().optional(), id: z.string().min(1).optional(), expectedVersion: z.number().int().nonnegative().optional(), slug: z.string().trim().min(1).max(100).transform(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).refine(s => s.length >= 2 && s.length <= 80), displayName: z.string().trim().min(2).max(80), bio: z.string().trim().max(300), avatarSeed: z.enum(['initials', 'bunny', 'violet', 'teal', 'gold']), kind: z.enum(['individual', 'team']), status: z.enum(['active', 'suspended'])
}).strict();
export async function savePublicIdentity(input: unknown): Promise<IdentityResult> {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success)
        return { ok: false, error: 'invalid_input' };
    const value = parsed.data;
    return mutate(async (tx, actor) => {
        if (actor.role !== 'admin')
            return { ok: false, error: 'forbidden' };
        const { id, expectedVersion, ownerProfileId: requestedOwner, ...data } = value;
        const existing = id ? await tx.publicIdentity.findUnique({where:{id}}) : null;
        if (id && !existing) return {ok:false,error:'not_found'};
        if (existing && existing.version !== expectedVersion) return {ok:false,error:'conflict'};
        if (existing && existing.slug !== data.slug) return {ok:false,error:'slug_immutable'};
        if (data.kind !== 'team' && requestedOwner && existing?.kind !== 'team') return {ok:false,error:'invalid_input'};
        const ownerProfileId = data.kind === 'team' ? requestedOwner === undefined ? existing?.ownerProfileId ?? null : requestedOwner : null;
        if (ownerProfileId && ownerProfileId !== existing?.ownerProfileId && !await tx.profile.findFirst({where:{id:ownerProfileId,disabledAt:null,emailVerifiedAt:{not:null}},select:{id:true}})) return {ok:false,error:'invalid_owner'};
        if (!existing && await tx.publicIdentity.findUnique({where:{slug:data.slug},select:{id:true}})) return {ok:false,error:'slug_taken'};
        const saved = existing
            ? await tx.publicIdentity.update({where:{id:existing.id},data:{...data,ownerProfileId,version:{increment:1}}})
            : await tx.publicIdentity.create({data:{...data,ownerProfileId}});
        if ((existing?.ownerProfileId ?? null) !== ownerProfileId) {
            if(ownerProfileId) await tx.identityRating.deleteMany({where:{identityId:saved.id,profileId:ownerProfileId}});
            await tx.accountAudit.create({data:{actorId:actor.id,targetId:ownerProfileId ?? existing?.ownerProfileId,action:'identity_owner_changed',metadata:{identityId:saved.id,oldOwnerProfileId:existing?.ownerProfileId ?? null,newOwnerProfileId:ownerProfileId}}});
        }
        return {ok:true,data:{id:saved.id,version:saved.version}};
    });
}
const creditsSchema = z.object({
    seriesId: z.string().min(1), expectedUpdatedAt: z.string().datetime(), credits: z.array(z.object({ identityId: z.string().min(1), role: z.enum(['translation', 'editing', 'preparation']) }).strict()).max(20)
}).strict();
export async function setSeriesPublicCredits(input: unknown): Promise<IdentityResult> {
    const parsed = creditsSchema.safeParse(input);
    if (!parsed.success)
        return { ok: false, error: 'invalid_input' };
    const value = parsed.data;
    return mutate(async (tx, actor) => {
        if (actor.role !== 'admin')
            return { ok: false, error: 'forbidden' };
        const series = await tx.series.findFirst({ where: { id: value.seriesId, deletedAt: null } });
        if (!series)
            return { ok: false, error: 'not_found' };
        if (series.updatedAt.toISOString() !== value.expectedUpdatedAt)
            return { ok: false, error: 'conflict' };
        const ids = [...new Set(value.credits.map(c => c.identityId))];
        if (await tx.publicIdentity.count({ where: { id: { in: ids } } }) !== ids.length)
            return { ok: false, error: 'not_found' };
        if (new Set(value.credits.map(c => c.identityId + ':' + c.role)).size !== value.credits.length)
            return { ok: false, error: 'invalid_input' };
        const [existing, suspended] = await Promise.all([tx.seriesCredit.findMany({ where: { seriesId: series.id }, select: { identityId: true, role: true } }), tx.publicIdentity.findMany({ where: { id: { in: ids }, status: 'suspended' }, select: { id: true } })]);
        const suspendedIds = new Set(suspended.map(i => i.id));
        if (value.credits.some(c => suspendedIds.has(c.identityId) && !existing.some(e => e.identityId === c.identityId && e.role === c.role)))
            return { ok: false, error: 'identity_suspended' };
        await tx.seriesCredit.deleteMany({ where: { seriesId: series.id } });
        await tx.seriesCredit.createMany({ data: value.credits.map((c, position) => ({
                ...c, seriesId: series.id, position
            })) });
        await tx.series.update({ where: { id: series.id }, data: { updatedAt: new Date() } });
        return { ok: true };
    });
}
const followSchema = z.object({ identityId: z.string().min(1), following: z.boolean() }).strict();
export async function setIdentityFollow(input: {
    identityId: string;
    following: boolean;
}): Promise<IdentityResult> {
    const parsed = followSchema.safeParse(input);
    if (!parsed.success)
        return { ok: false, error: 'invalid_input' };
    return mutate(async (tx, actor) => {
        if (!actor.id)
            return { ok: false, error: 'forbidden' };
        const { identityId, following } = parsed.data;
        const identity = await tx.publicIdentity.findUnique({ where: { id: identityId } });
        if (!identity || following && identity.status !== 'active')
            return { ok: false, error: 'not_found' };
        const where = { profileId_identityId: { profileId: actor.id, identityId } };
        if (following)
            await tx.identityFollow.upsert({
                where, update: {}, create: {
                    profileId: actor.id, identityId, alertsEnabledAt: new Date()
                }
            });
        else
            await tx.identityFollow.deleteMany({ where: { profileId: actor.id, identityId } });
        const row = await tx.identityFollow.findUnique({ where });
        return { ok: true, data: { follow: { following: !!row, alertsEnabled: !!row?.alertsEnabledAt } } };
    });
}
const alertsSchema = z.object({ identityId: z.string().min(1), enabled: z.boolean() }).strict();
export async function setIdentityAlerts(input: {
    identityId: string;
    enabled: boolean;
}): Promise<IdentityResult> {
    const parsed = alertsSchema.safeParse(input);
    if (!parsed.success)
        return { ok: false, error: 'invalid_input' };
    return mutate(async (tx, actor) => {
        if (!actor.id)
            return { ok: false, error: 'forbidden' };
        const { identityId, enabled } = parsed.data;
        const row = await tx.identityFollow.findUnique({ where: { profileId_identityId: { profileId: actor.id, identityId } }, include: { identity: { select: { status: true } } } });
        if (!row || enabled && row.identity.status !== 'active')
            return { ok: false, error: 'not_found' };
        if (enabled !== !!row.alertsEnabledAt)
            await tx.identityFollow.update({ where: { id: row.id }, data: { alertsEnabledAt: enabled ? new Date() : null } });
        return { ok: true, data: { follow: { following: true, alertsEnabled: enabled } } };
    });
}

export async function listIdentityOwnerCandidates():Promise<{id:string;nickname:string;email:string}[]> {
    if((await viewer())?.role!=='admin')return [];
    return db.profile.findMany({where:{disabledAt:null,emailVerifiedAt:{not:null}},select:{id:true,nickname:true,email:true},orderBy:{nickname:'asc'}});
}
export async function getEditableIdentity(id:string):Promise<ManagedIdentityView|null> {
    const actor=await viewer();
    if(!actor)return null;
    const row=await db.publicIdentity.findFirst({where:{id,...(actor.role==='admin'?{}:{ownerProfileId:actor.id,kind:'team'})},select:{...identitySelect,ownerProfileId:true}});
    if(!row)return null;
    const {ownerProfileId,...publicRow}=row;
    return {...await view(publicRow),ownerProfileId};
}
export async function listOwnedIdentities():Promise<ManagedIdentityView[]> {
    const actor=await viewer();
    if(!actor)return [];
    const rows=await db.publicIdentity.findMany({where:{ownerProfileId:actor.id,kind:'team'},select:{...identitySelect,ownerProfileId:true},orderBy:{displayName:'asc'}});
    const stats=await ratingStats(rows);
    return Promise.all(rows.map(async({ownerProfileId,...row})=>({...await view(row,stats),ownerProfileId})));
}
const ownerSchema=z.object({id:z.string().min(1),expectedVersion:z.number().int().nonnegative(),displayName:z.string().trim().min(2).max(80),bio:z.string().trim().max(300),avatarSeed:z.enum(['initials','bunny','violet','teal','gold'])}).strict();
export async function updateOwnedIdentity(input:unknown):Promise<IdentityResult> {
    const parsed=ownerSchema.safeParse(input);
    if(!parsed.success)return {ok:false,error:'invalid_input'};
    return mutate(async(tx,actor)=>{
        const {id,expectedVersion,...data}=parsed.data;
        const row=await tx.publicIdentity.findUnique({where:{id}});
        if(!row || row.kind!=='team' || row.ownerProfileId!==actor.id)return {ok:false,error:'forbidden'};
        if(row.status!=='active')return {ok:false,error:'identity_suspended'};
        if(row.version!==expectedVersion)return {ok:false,error:'conflict'};
        const updated=await tx.publicIdentity.update({where:{id},data:{...data,version:{increment:1}}});
        return {ok:true,data:{id,version:updated.version}};
    });
}
export async function getViewerIdentityRating(identityId:string):Promise<{value:number|null;canRate:boolean}> {
    const actor=await viewer();
    if(!actor)return {value:null,canRate:false};
    const identity=await db.publicIdentity.findFirst({where:{id:identityId,status:'active',kind:'team'},select:{ownerProfileId:true}});
    if(!identity || identity.ownerProfileId===actor.id)return {value:null,canRate:false};
    const row=await db.identityRating.findUnique({where:{profileId_identityId:{profileId:actor.id,identityId}},select:{value:true}});
    return {value:row?.value??null,canRate:true};
}
const ratingSchema=z.object({identityId:z.string().min(1),value:z.number().int().min(1).max(5).nullable()}).strict();
export async function setIdentityRating(input:unknown):Promise<IdentityResult> {
    const parsed=ratingSchema.safeParse(input);
    if(!parsed.success)return {ok:false,error:'invalid_input'};
    return mutate(async(tx,actor)=>{
        if(!actor.id)return {ok:false,error:'forbidden'};
        const {identityId,value}=parsed.data;
        const identity=await tx.publicIdentity.findFirst({where:{id:identityId,status:'active',kind:'team'},select:{ownerProfileId:true}});
        if(!identity)return {ok:false,error:'not_found'};
        if(identity.ownerProfileId===actor.id)return {ok:false,error:'forbidden'};
        if(value!==null) {
        const now=new Date(),keyHash=hashRateLimitKey(`identity-rating:${actor.id}`);
        const bucket=await tx.accountRateLimit.findUnique({where:{keyHash}});
        if(bucket && bucket.windowEnd>now && bucket.count>=20)return {ok:false,error:'rate_limited'};
        await tx.accountRateLimit.upsert({where:{keyHash},create:{keyHash,count:1,windowEnd:new Date(now.getTime()+3600000)},update:bucket && bucket.windowEnd>now?{count:{increment:1}}:{count:1,windowEnd:new Date(now.getTime()+3600000)}});
        }
        if(value===null)await tx.identityRating.deleteMany({where:{profileId:actor.id,identityId}});
        else await tx.identityRating.upsert({where:{profileId_identityId:{profileId:actor.id,identityId}},create:{profileId:actor.id,identityId,value},update:{value}});
        const aggregate=await tx.identityRating.aggregate({where:{identityId,...(identity.ownerProfileId?{profileId:{not:identity.ownerProfileId}}:{})},_avg:{value:true},_count:{value:true}});
        return {ok:true,data:{rating:{value,average:aggregate._avg.value,count:aggregate._count.value}}};
    });
}
