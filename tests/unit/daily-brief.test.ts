import { describe, expect, it } from 'vitest';
import { newsletterPreferenceSchema } from '../../packages/shared/src/news-radar';

describe('daily brief preference validation', () => {
  it('accepts an explicit disabled preference', () => {
    expect(newsletterPreferenceSchema.parse({ enabled: false, deliveryTime: '08:00', timezone: 'Europe/Amsterdam', email: 'brief@example.test' })).toMatchObject({ enabled: false });
  });
  it('rejects invalid schedule, timezone and email values', () => {
    expect(newsletterPreferenceSchema.safeParse({ enabled: true, deliveryTime: '25:00', timezone: 'Not/AZone', email: 'invalid' }).success).toBe(false);
  });
});
