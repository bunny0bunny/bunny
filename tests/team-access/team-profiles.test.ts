import { afterAll, beforeAll, expect, test } from 'bun:test';
import { db, setActor } from './session-fixture';
import { hashRateLimitKey } from '../../src/lib/account-ratelimit';
import * as service from '../../src/lib/public-identities/service';

const prefix = 'team-profile-polish-';
let admin: string, owner: string, reader: string, disabled: string, unverified: string, team: string, individual: string;
const profiles: string[] = [];
const input = (slug: string, ownerProfileId?: string | null) => ({ slug, displayName: 'Team Profile', bio: '', avatarSeed: 'bunny', kind: 'team', status: 'active', ...(ownerProfileId === undefined ? {} : { ownerProfileId }) });
async function edit(id = team) {
  const row = await db.publicIdentity.findUniqueOrThrow({ where: { id } });
  return { id, expectedVersion: row.version, displayName: 'Updated Team', bio: 'Public biography', avatarSeed: 'teal' };
}
beforeAll(async () => {
  admin = (await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } })).id;
  for (const name of ['owner', 'reader', 'disabled', 'unverified']) {
    const row = await db.profile.create({ data: { email: `${prefix}${name}@bunny.test`, nickname: name, passwordHash: 'x', emailVerifiedAt: name === 'unverified' ? null : new Date(), disabledAt: name === 'disabled' ? new Date() : null } });
    profiles.push(row.id);
  }
  [owner, reader, disabled, unverified] = profiles;
  team = (await db.publicIdentity.create({ data: { slug: `${prefix}team`, displayName: 'Team', kind: 'team', ownerProfileId: owner } })).id;
  individual = (await db.publicIdentity.create({ data: { slug: `${prefix}individual`, displayName: 'Individual' } })).id;
});
afterAll(async () => {
  setActor(null);
  await db.publicIdentity.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.accountAudit.deleteMany({ where: { OR: [{ targetId: { in: profiles } }, { action: 'identity_owner_changed', metadata: { path: ['identityId'], equals: team } }] } });
  await db.accountRateLimit.deleteMany({ where: { keyHash: { in: profiles.map(id => hashRateLimitKey(`identity-rating:${id}`)) } } });
  await db.profile.deleteMany({ where: { id: { in: profiles } } });
});
test('reader owner can edit only safe fields on their active team and sees suspended profile for read only', async () => {
  setActor(owner);
  expect((await service.listOwnedIdentities()).map(row => row.id)).toContain(team);
  expect((await service.updateOwnedIdentity(await edit())).ok).toBe(true);
  for (const field of [{ slug: 'forged' }, { kind: 'individual' }, { status: 'active' }, { ownerProfileId: reader }, { credits: [] }, { grants: [] }]) {
    expect((await service.updateOwnedIdentity({ ...await edit(), ...field })).error).toBe('invalid_input');
  }
  expect((await service.updateOwnedIdentity(await edit(individual))).ok).toBe(false);
  expect(await service.getEditableIdentity(individual)).toBeNull();
  await db.publicIdentity.update({ where: { id: team }, data: { status: 'suspended' } });
  expect((await service.getEditableIdentity(team))?.id).toBe(team);
  expect((await service.updateOwnedIdentity(await edit())).ok).toBe(false);
  expect(await service.getViewerIdentityRating(team)).toEqual({ value: null, canRate: false });
  await db.publicIdentity.update({ where: { id: team }, data: { status: 'active' } });
  expect(await db.seriesAssignment.count({ where: { profileId: owner } })).toBe(0);
  expect((await db.profile.findUniqueOrThrow({ where: { id: owner } })).role).toBe('reader');
});
test('fresh owner mapping and fresh account state revoke stale access', async () => {
  setActor(owner);
  const stale = await edit();
  await db.publicIdentity.update({ where: { id: team }, data: { ownerProfileId: reader } });
  expect((await service.updateOwnedIdentity(stale)).ok).toBe(false);
  await db.publicIdentity.update({ where: { id: team }, data: { ownerProfileId: owner } });
  for (const state of [{ disabledAt: new Date() }, { authVersion: 1 }, { emailVerifiedAt: null }]) {
    await db.profile.update({ where: { id: owner }, data: state });
    expect((await service.updateOwnedIdentity(await edit())).error).toBe('unauthenticated');
    await db.profile.update({ where: { id: owner }, data: { disabledAt: null, authVersion: 0, emailVerifiedAt: new Date() } });
  }
});
test('ratings are one editable private vote and preserve followers and alert settings', async () => {
  setActor(reader);
  await service.setIdentityFollow({ identityId: team, following: true });
  await service.setIdentityAlerts({ identityId: team, enabled: false });
  expect((await service.setIdentityRating({ identityId: team, value: 2 })).rating).toEqual({ value: 2, average: 2, count: 1 });
  expect((await service.setIdentityRating({ identityId: team, value: 5 })).rating).toEqual({ value: 5, average: 5, count: 1 });
  expect(await db.identityRating.count({ where: { profileId: reader, identityId: team } })).toBe(1);
  const publicTeam = (await service.listPublicIdentities()).find(row => row.id === team)!;
  expect(publicTeam.ratingAverage).toBe(5);
  expect(publicTeam.followerCount).toBe(1);
  expect(publicTeam).not.toHaveProperty('ownerProfileId');
  expect(publicTeam).not.toHaveProperty('avatarKey');
  expect(JSON.stringify(publicTeam)).not.toContain('@bunny.test');
  expect(await service.getViewerIdentityFollow(team)).toEqual({ following: true, alertsEnabled: false });
  expect((await service.setIdentityRating({ identityId: team, value: null })).rating).toEqual({ value: null, average: null, count: 0 });
  const keyHash = hashRateLimitKey(`identity-rating:${reader}`);
  await db.accountRateLimit.update({ where: { keyHash }, data: { count: 20 } });
  expect((await service.setIdentityRating({ identityId: team, value: 3 })).error).toBe('rate_limited');
  await db.accountRateLimit.update({ where: { keyHash }, data: { count: 0 } });
  await db.identityRating.create({ data: { profileId: owner, identityId: team, value: 1 } });
  expect((await service.listPublicIdentities()).find(row => row.id === team)?.ratingCount).toBe(0);
  await db.identityRating.deleteMany({ where: { profileId: owner, identityId: team } });
  for (const value of [0, 6, 2.5]) expect((await service.setIdentityRating({ identityId: team, value })).ok).toBe(false);
  expect((await service.setIdentityRating({ identityId: team, value: 2, profileId: owner })).error).toBe('invalid_input');
  expect((await service.setIdentityRating({ identityId: individual, value: 2 })).ok).toBe(false);
  await db.publicIdentity.update({ where: { id: team }, data: { status: 'suspended' } });
  expect((await service.setIdentityRating({ identityId: team, value: 2 })).error).toBe('not_found');
  await db.publicIdentity.update({ where: { id: team }, data: { status: 'active' } });
  setActor(owner);
  expect((await service.setIdentityRating({ identityId: team, value: 2 })).error).toBe('forbidden');
  for (const id of [disabled, unverified]) {
    setActor(id);
    expect((await service.setIdentityRating({ identityId: team, value: 2 })).ok).toBe(false);
  }
  setActor(null);
  expect((await service.setIdentityRating({ identityId: team, value: 2 })).error).toBe('unauthenticated');
});
test('admin validates owner assignment, audits transfer and atomically removes new owner vote', async () => {
  setActor(reader);
  expect((await service.setIdentityRating({ identityId: team, value: 4 })).ok).toBe(true);
  expect((await service.savePublicIdentity(input(`${prefix}denied`, reader))).ok).toBe(false);
  expect(await service.listIdentityOwnerCandidates()).toEqual([]);
  setActor(admin);
  const candidates = await service.listIdentityOwnerCandidates();
  expect(candidates.some(row => row.id === owner)).toBe(true);
  expect(candidates.some(row => row.id === disabled || row.id === unverified)).toBe(false);
  for (const id of [disabled, unverified, 'missing']) expect((await service.savePublicIdentity(input(`${prefix}bad`, id))).error).toBe('invalid_owner');
  let current = await db.publicIdentity.findUniqueOrThrow({ where: { id: team } });
  expect((await service.savePublicIdentity({ ...input(current.slug, reader), id: team, expectedVersion: current.version })).ok).toBe(true);
  expect(await db.identityRating.count({ where: { profileId: reader, identityId: team } })).toBe(0);
  expect((await service.getManagedIdentity(team))?.ownerProfileId).toBe(reader);
  expect(await db.accountAudit.count({ where: { targetId: reader, action: 'identity_owner_changed' } })).toBeGreaterThan(0);
  current = await db.publicIdentity.findUniqueOrThrow({ where: { id: team } });
  expect((await service.savePublicIdentity({ ...input(current.slug), id: team, expectedVersion: current.version })).ok).toBe(true);
  expect((await db.publicIdentity.findUniqueOrThrow({ where: { id: team } })).ownerProfileId).toBe(reader);
  current = await db.publicIdentity.findUniqueOrThrow({ where: { id: team } });
  expect((await service.savePublicIdentity({ ...input(current.slug), kind: 'individual', id: team, expectedVersion: current.version })).ok).toBe(true);
  expect((await db.publicIdentity.findUniqueOrThrow({ where: { id: team } })).ownerProfileId).toBeNull();
  expect((await db.profile.findUniqueOrThrow({ where: { id: reader } })).role).toBe('reader');
  expect(await db.seriesAssignment.count({ where: { profileId: reader } })).toBe(0);
});
