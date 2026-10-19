import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../src/config.js';
import { silentLogger } from '../src/logger.js';
import { createBorrachoServer } from '../src/server.js';

describe('HTTP', () => {
  it('salud y configuración pública', async () => {
    const server = createBorrachoServer(testConfig(), { log: silentLogger });
    const health = await request(server.http).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
    expect(health.headers['content-security-policy']).toContain("default-src 'self'");
    const config = await request(server.http).get('/api/config');
    expect(config.body).toMatchObject({ players: { min: 2, max: 6 }, options: { barMax: 100, defenseSeconds: 6, deckCopies: 2 } });
    await server.close();
  });

  it('sin ENABLE_TEST_HOOKS no hay ganchos de prueba', async () => {
    const server = createBorrachoServer(testConfig(), { log: silentLogger });
    const res = await request(server.http).post('/__test__/rooms/ABCDEF/stats').send({ name: 'Ana', alcohol: 99 });
    expect(res.status).toBe(404);
    await server.close();
  });

  it('en producción los ganchos no se prenden aunque se pida', async () => {
    const { loadConfig } = await import('../src/config.js');
    expect(loadConfig({ NODE_ENV: 'production', ENABLE_TEST_HOOKS: '1' }).enableTestHooks).toBe(false);
  });
});
