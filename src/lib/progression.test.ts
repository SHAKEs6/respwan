import { describe, expect, it } from 'vitest';
import { levelForXp, XP_EVENT_VALUES, xpProgress } from './progression';

describe('RESPAWN progression display helpers', () => {
  it('keeps XP awards fixed to recognized server event types', () => {
    expect(XP_EVENT_VALUES).toEqual({
      profile_complete: 50,
      post_approved: 10,
      review_helpful: 2,
      tournament_verified: 25,
      achievement_approved: 20,
    });
  });

  it('computes levels only from XP totals', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(999)).toBe(1);
    expect(levelForXp(1000)).toBe(2);
    expect(levelForXp(2499)).toBe(3);
  });

  it('returns a bounded progress percentage for the current level', () => {
    expect(xpProgress(1350)).toEqual({ level: 2, current: 350, needed: 1000, percent: 35 });
    expect(xpProgress(-1)).toEqual({ level: 1, current: 0, needed: 1000, percent: 0 });
  });
});
