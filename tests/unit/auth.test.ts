import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '@/lib/auth';

process.env.SESSION_SECRET = 'test-secret-au-moins-32-caracteres!!';

describe('auth', () => {
  it('hache et vérifie un mot de passe', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
    expect(await verifyPassword('mauvais', hash)).toBe(false);
  });
  it('crée et vérifie un jeton de session', async () => {
    const token = await createSessionToken({ userId: 1, role: 'barman', name: 'Bar', locationId: 2 });
    const session = await verifySessionToken(token);
    expect(session).toMatchObject({ userId: 1, role: 'barman', locationId: 2 });
  });
  it('rejette un jeton falsifié', async () => {
    expect(await verifySessionToken('n.importe.quoi')).toBeNull();
  });
});
