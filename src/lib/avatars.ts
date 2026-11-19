/**
 * Preset profile pictures. Ids are stored in Profile.avatarSeed, so never
 * rename or remove an id; replace the file behind it instead.
 */
export const PRESET_AVATARS = [
  { id: "reader", labelAr: "أرنب قارئ" },
  { id: "scholar", labelAr: "أرنب بنظارة" },
  { id: "dj", labelAr: "أرنب بسماعات" },
  { id: "artist", labelAr: "أرنب فنان" },
  { id: "royal", labelAr: "أرنب بتاج" },
  { id: "sweet", labelAr: "أرنب بفيونكة" },
  { id: "winter", labelAr: "أرنب بوشاح" },
  { id: "dreamer", labelAr: "أرنب حالم" },
  { id: "explorer", labelAr: "أرنب مستكشف" },
  { id: "bloom", labelAr: "أرنب بزهرة" },
  { id: "sporty", labelAr: "أرنب بقبعة" },
  { id: "cozy", labelAr: "أرنب بقلنسوة" },
  { id: "night-reader", labelAr: "قارئ الليل" },
  { id: "nerd", labelAr: "أرنب مجتهد" },
  { id: "melody", labelAr: "أرنب موسيقي" },
  { id: "classic", labelAr: "أرنب كلاسيكي" },
] as const;

export type PresetAvatarId = (typeof PRESET_AVATARS)[number]["id"];

/** File extension of the current preset art (swap to "webp" when final art lands). */
const PRESET_EXT = "svg";

const PRESET_IDS = new Set<string>(PRESET_AVATARS.map((a) => a.id));

export function isPresetAvatar(seed: unknown): seed is PresetAvatarId {
  return typeof seed === "string" && PRESET_IDS.has(seed);
}

export function presetAvatarSrc(id: PresetAvatarId): string {
  return `/avatars/${id}.${PRESET_EXT}`;
}

/** Choices a reader can save: a preset, or the first letter of their name. */
export function isProfileAvatarChoice(seed: unknown): boolean {
  return seed === "initials" || isPresetAvatar(seed);
}

/** A friendly default for new accounts instead of a grey initial. */
export function randomPresetAvatar(): PresetAvatarId {
  return PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)].id;
}
