/** Uploaded logos are independent of chapter media and retain their transparency. */
export const MAX_IDENTITY_AVATAR_BYTES = 256 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,95}$/;
const filePattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,95}\.webp$/;
export function identityAvatarKey(identityId: string, file: string, prefix: string): string {
  if (!idPattern.test(identityId) || !filePattern.test(file) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(prefix)) throw new Error('invalid_input');
  return `media/${prefix}/identities-${identityId}/${file}`;
}
export function identityAvatarPath(identityId: string, key: string | null): string | null {
  if (!key || !idPattern.test(identityId)) return null;
  const match = /^media\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/identities-([A-Za-z0-9][A-Za-z0-9-]{0,95})\/([A-Za-z0-9][A-Za-z0-9-]{0,95}\.webp)$/.exec(key);
  return match && match[2] === identityId ? `/api/identity-avatars/${identityId}/${match[3]}` : null;
}
export async function readIdentityAvatar(request: Request): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (!length || !/^\d+$/.test(length) || !request.body) throw new Error('invalid_length');
  const expected = Number(length);
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > MAX_IDENTITY_AVATAR_BYTES) throw new Error('invalid_length');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let received = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; received += chunk.value.length; if (received > expected) throw new Error('invalid_length'); chunks.push(chunk.value); }
    if (received !== expected) throw new Error('invalid_length');
    const bytes = new Uint8Array(received); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
  } catch(error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
