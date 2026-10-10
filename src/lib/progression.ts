export const XP_EVENT_VALUES = {
  profile_complete: 50,
  post_approved: 10,
  review_helpful: 2,
  tournament_verified: 25,
  achievement_approved: 20,
} as const;

export type XpEvent = keyof typeof XP_EVENT_VALUES;

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  return Math.floor(xp / 1000) + 1;
}

export function xpProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const current = safeXp % 1000;
  return { level: levelForXp(safeXp), current, needed: 1000, percent: Math.floor(current / 10) };
}
