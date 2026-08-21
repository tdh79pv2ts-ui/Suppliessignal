import { describe, expect, it } from 'vitest';
import { dailyBriefPreferenceSchema } from '../../packages/shared/src/news-radar';

describe('daily brief preference validation', () => {
  it('accepts an explicit disabled preference', () => {
    expect(dailyBriefPreferenceSchema.parse({ enabled: false, deliveryTime: '08:00', timezone: 'Europe/Amsterdam', email: 'brief@example.test', language: 'nl' })).toMatchObject({ enabled: false, language: 'nl' });
  });
  it('rejects invalid schedule, timezone and email values', () => {
    expect(dailyBriefPreferenceSchema.safeParse({ enabled: true, deliveryTime: '25:00', timezone: 'Not/AZone', email: 'invalid', language: 'en' }).success).toBe(false);
  });
});
