import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { withSerializableTx } from '@/lib/editorial';
import { currentProfileOrNull, liveChapterWhere, toCard } from '@/lib/queries';
import { getWorkTitle } from '@/lib/work-title';
import type { Prisma } from '@prisma/client';
import type { IdentityView, IdentityDetail, CreditView, FollowView, IdentityResult } from './contracts';
const live = () => liveChapterWhere();
const identitySelect = {
    id: true, slug: true, displayName: true, bio: true, avatarSeed: true, kind: true, status: true, version: true
} as const;
async function view(row: Prisma.PublicIdentityGetPayload<{
    select: typeof identitySelect;
}>): Promise<IdentityView> {
    const [followerCount, works] = await Promise.all([db.identityFollow.count({ where: { identityId: row.id } }), db.seriesCredit.findMany({
            where: { identityId: row.id, series: { deletedAt: null, chapters: { some: live() } } }, select: { seriesId: true }, distinct: ['seriesId']
        })]);
    return {
        ...row, kind: row.kind as IdentityView['kind'], status: row.status as IdentityView['status'], followerCount, workCount: works.length
    };
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
    return Promise.all((await db.publicIdentity.findMany({
        where: { status: 'active' }, select: identitySelect, orderBy: { displayName: 'asc' }
    })).map(view));
}
export async function listManagedIdentities(): Promise<IdentityView[]> {
    if ((await viewer())?.role !== 'admin')
        return [];
    return Promise.all((await db.publicIdentity.findMany({ select: identitySelect, orderBy: { displayName: 'asc' } })).map(view));
}
export async function getManagedIdentity(id: string): Promise<IdentityView | null> {
    if ((await viewer())?.role !== 'admin')
        return null;
    const row = await db.publicIdentity.findUnique({ where: { id }, select: identitySelect });
    return row ? view(row) : null;
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
    return Promise.all(rows.map(async (row) => ({
        ...await view(row.identity), following: true, alertsEnabled: !!row.alertsEnabledAt
    })));
}
function invalidate() {
    for (const path of ['/translators', '/admin/translators', '/following', '/admin/series'])
        revalidatePath(path);
    for (const path of ['/translators/[slug]', '/admin/translators/[id]', '/admin/series/[id]', '/series/[slug]'])
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
    id: z.string().min(1).optional(), expectedVersion: z.number().int().nonnegative().optional(), slug: z.string().trim().min(1).max(100).transform(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).refine(s => s.length >= 2 && s.length <= 80), displayName: z.string().trim().min(2).max(80), bio: z.string().trim().max(300), avatarSeed: z.enum(['initials', 'bunny', 'violet', 'teal', 'gold']), kind: z.enum(['individual', 'team']), status: z.enum(['active', 'suspended'])
}).strict();
export async function savePublicIdentity(input: unknown): Promise<IdentityResult> {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success)
        return { ok: false, error: 'invalid_input' };
    const value = parsed.data;
    return mutate(async (tx, actor) => {
        if (actor.role !== 'admin')
            return { ok: false, error: 'forbidden' };
        const { id, expectedVersion, ...data } = value;
        if (id) {
            const existing = await tx.publicIdentity.findUnique({ where: { id } });
            if (!existing)
                return { ok: false, error: 'not_found' };
            if (existing.version !== expectedVersion)
                return { ok: false, error: 'conflict' };
            if (existing.slug !== data.slug)
                return { ok: false, error: 'slug_immutable' };
            await tx.publicIdentity.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
            return { ok: true, data: { id } };
        }
        if (await tx.publicIdentity.findUnique({ where: { slug: data.slug }, select: { id: true } }))
            return { ok: false, error: 'slug_taken' };
        const created = await tx.publicIdentity.create({ data });
        return { ok: true, data: { id: created.id } };
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
