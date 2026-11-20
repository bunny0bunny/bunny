/** Uploaded profile pictures: same limits as team logos, separate storage prefix. */
export const MAX_PROFILE_AVATAR_BYTES = 256 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,95}$/;
const filePattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,95}\.webp$/;
const prefixPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export function profileAvatarKey(profileId: string, file: string, prefix: string): string {
  if (!idPattern.test(profileId) || !filePattern.test(file) || !prefixPattern.test(prefix)) throw new Error("invalid_input");
  return `media/${prefix}/profiles-${profileId}/${file}`;
}
/** Public path for a stored key, or null when the key does not belong to this profile. */
export function profileAvatarPath(profileId: string, key: string | null | undefined): string | null {
  if (!key || !idPattern.test(profileId)) return null;
  const match = /^media\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/profiles-([A-Za-z0-9][A-Za-z0-9-]{0,95})\/([A-Za-z0-9][A-Za-z0-9-]{0,95}\.webp)$/.exec(key);
  return match && match[2] === profileId ? `/api/profile-avatars/${profileId}/${match[3]}` : null;
}
