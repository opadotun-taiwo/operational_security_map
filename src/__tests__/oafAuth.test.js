import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const { isOafEmail } = await import('../auth/oafAuth');

describe('isOafEmail', () => {
  it('accepts One Acre Fund accounts in any case', () => {
    expect(isOafEmail('Taiwo.Opadotun@OneAcreFund.org')).toBe(true);
    expect(isOafEmail(' zarah.suleiman@oneacrefund.org ')).toBe(true);
  });

  it('rejects everything else, including look-alike domains', () => {
    for (const email of ['someone@gmail.com', 'x@oneacrefund.org.evil.com', 'x@notoneacrefund.org', 'x@sub.oneacrefund.org.com', 'a@b@oneacrefund.org', '', null]) {
      expect(isOafEmail(email)).toBe(false);
    }
  });
});
