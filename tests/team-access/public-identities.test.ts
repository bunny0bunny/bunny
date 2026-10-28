import { expect, test } from 'bun:test';
import { db, setActor } from './session-fixture';
import * as service from '../../src/lib/public-identities/service';
test('identity writes require a current verified administrator', async () => {
    setActor(null);
    expect((await service.savePublicIdentity({
        slug: 'test-team', displayName: 'Test Team', bio: '', kind: 'team', status: 'active', avatarSeed: 'bunny'
    })).ok).toBe(false);
});
test('public identities do not serialize account records', async () => {
    const rows = await service.listPublicIdentities();
    expect(JSON.stringify(rows)).not.toContain('passwordHash');
    expect(JSON.stringify(rows)).not.toContain('email');
});
test('admin creates immutable slug with stale version guard', async () => {
    const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
    setActor(admin.id);
    const input = {
        slug: 'Identity Test', displayName: 'Identity Test', bio: '', kind: 'team', status: 'active', avatarSeed: 'bunny'
    };
    const result = await service.savePublicIdentity(input);
    expect(result.ok).toBe(true);
    const row = await db.publicIdentity.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.slug).toBe('identity-test');
    expect((await service.savePublicIdentity({
        ...input, id: row.id, expectedVersion: 0
    })).error).toBe('conflict');
    await db.publicIdentity.delete({ where: { id: row.id } });
    setActor(null);
});
test('follow mute and repeated enable preserve server timestamps; suspended identities allow unfollow', async () => {
    const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
    setActor(admin.id);
    const identity = await db.publicIdentity.create({ data: { slug: 'follow-timestamp-test', displayName: 'Follow Test' } });
    const input = { identityId: identity.id, following: true };
    expect((await service.setIdentityFollow(input)).ok).toBe(true);
    const first = await db.identityFollow.findUniqueOrThrow({ where: { profileId_identityId: { profileId: admin.id, identityId: identity.id } } });
    await service.setIdentityFollow(input);
    expect((await db.identityFollow.findUniqueOrThrow({ where: { id: first.id } })).alertsEnabledAt).toEqual(first.alertsEnabledAt);
    await service.setIdentityAlerts({ identityId: identity.id, enabled: false });
    await service.setIdentityFollow(input);
    expect((await db.identityFollow.findUniqueOrThrow({ where: { id: first.id } })).alertsEnabledAt).toBeNull();
    await service.setIdentityAlerts({ identityId: identity.id, enabled: true });
    const resumed = await db.identityFollow.findUniqueOrThrow({ where: { id: first.id } });
    await service.setIdentityAlerts({ identityId: identity.id, enabled: true });
    expect((await db.identityFollow.findUniqueOrThrow({ where: { id: first.id } })).alertsEnabledAt).toEqual(resumed.alertsEnabledAt);
    await db.publicIdentity.update({ where: { id: identity.id }, data: { status: 'suspended' } });
    expect((await service.setIdentityFollow({ ...input, following: false })).ok).toBe(true);
    await db.publicIdentity.delete({ where: { id: identity.id } });
    setActor(null);
});
test('credits do not confer private access and public work count deduplicates roles', async () => {
    const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
    setActor(admin.id);
    const identity = await db.publicIdentity.create({ data: { slug: 'credits-test', displayName: 'Credits Test' } });
    const series = await db.series.create({ data: {
            slug: 'credits-public-test', titleAr: 'عمل اختبار', titleOriginal: 'English Work', synopsisAr: 'وصف العمل', format: 'novel', author: 'Author', coverPath: ''
        } });
    await db.chapter.create({ data: {
            seriesId: series.id, number: 1, titleAr: 'عنوان', workflow: 'published', publishedAt: new Date()
        } });
    const result = await service.setSeriesPublicCredits({
        seriesId: series.id, expectedUpdatedAt: series.updatedAt.toISOString(), credits: [{ identityId: identity.id, role: 'translation' }, { identityId: identity.id, role: 'editing' }]
    });
    expect(result.ok).toBe(true);
    await db.chapter.create({data:{seriesId:series.id,number:2,titleAr:'Private Draft',novelBody:'private-draft-body'}});
    await db.identityFollow.create({data:{profileId:admin.id,identityId:identity.id,alertsEnabledAt:new Date()}});
    setActor(null);
    const detail=await service.getPublicIdentity(identity.slug);
    expect(detail?.identity.workCount).toBe(1);
    expect(detail?.works[0].chapterCount).toBe(1);
    expect(detail?.recentChapters.length).toBe(1);
    expect(JSON.stringify(detail)).not.toContain('private-draft-body');
    expect(JSON.stringify(detail)).not.toContain('profileId');
    expect(JSON.stringify(detail)).not.toContain(admin.email);
    setActor(admin.id);
    expect(await db.seriesAssignment.count({ where: { seriesId: series.id } })).toBe(0);
    expect((await service.setSeriesPublicCredits({
        seriesId: series.id, expectedUpdatedAt: series.updatedAt.toISOString(), credits: []
    })).error).toBe('conflict');
    await db.series.delete({ where: { id: series.id } });
    await db.publicIdentity.delete({ where: { id: identity.id } });
    setActor(null);
});
test('new suspended credit pairs are rejected but retained pairs can be preserved', async () => {
    const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
    setActor(admin.id);
    const identity = await db.publicIdentity.create({ data: { slug: 'suspended-credit-test', displayName: 'Suspended Test' } });
    const series = await db.series.create({ data: {
            slug: 'suspended-credit-test', titleAr: 'عنوان', format: 'novel', synopsisAr: 'وصف', author: 'Author', coverPath: ''
        } });
    try {
        await db.seriesCredit.create({ data: {
                identityId: identity.id, seriesId: series.id, role: 'translation'
            } });
        await db.publicIdentity.update({ where: { id: identity.id }, data: { status: 'suspended' } });
        expect((await service.setSeriesPublicCredits({
            seriesId: series.id, expectedUpdatedAt: series.updatedAt.toISOString(), credits: [{ identityId: identity.id, role: 'editing' }]
        })).ok).toBe(false);
        expect((await service.setSeriesPublicCredits({
            seriesId: series.id, expectedUpdatedAt: series.updatedAt.toISOString(), credits: [{ identityId: identity.id, role: 'translation' }]
        })).ok).toBe(true);
    }
    finally {
        await db.series.delete({ where: { id: series.id } });
        await db.publicIdentity.delete({ where: { id: identity.id } });
        setActor(null);
    }
});
test('fresh role, verification and authVersion checks reject stale or disabled actors', async () => {
    const reader = await db.profile.create({ data: {
            email: 'identity-auth@bunny.test', nickname: 'Reader', passwordHash: 'x', emailVerifiedAt: new Date()
        } });
    try {
        setActor(reader.id);
        expect((await service.savePublicIdentity({
            slug: 'forbidden-team', displayName: 'Forbidden', bio: '', kind: 'team', status: 'active', avatarSeed: 'bunny'
        })).error).toBe('forbidden');
        await db.profile.update({ where: { id: reader.id }, data: { authVersion: 1 } });
        expect((await service.setIdentityFollow({ identityId: 'missing', following: true })).error).toBe('unauthenticated');
        await db.profile.update({ where: { id: reader.id }, data: { authVersion: 0, emailVerifiedAt: null } });
        expect((await service.setIdentityFollow({ identityId: 'missing', following: true })).ok).toBe(false);
        expect(await service.listManagedIdentities()).toEqual([]);
    }
    finally {
        setActor(null);
        await db.profile.delete({ where: { id: reader.id } });
    }
});

test('concurrent duplicate slug creates return a friendly conflict',async()=>{const admin=await db.profile.findUniqueOrThrow({where:{email:'admin@bunny.demo'}});const input={slug:'slug-race-test',displayName:'Slug Race',bio:'',kind:'team',status:'active',avatarSeed:'bunny'};try{const results=await Promise.all([1,2].map(()=>withIdentityActor(admin.id,()=>service.savePublicIdentity(input))));expect(results.filter(r=>r.ok).length).toBe(1);expect(['slug_taken','conflict']).toContain(results.find(r=>!r.ok)?.error);}finally{await db.publicIdentity.deleteMany({where:{slug:input.slug}});}});
import {withActor as withIdentityActor} from './session-fixture';
