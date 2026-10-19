import { describe, expect, it } from 'vitest';
import { makeRules } from '../src/rules.js';
import { playGame } from '../src/sim/run.js';

describe('partidas simuladas', () => {
  // Pocas partidas por cantidad de jugadores: alcanza para buscar trabas. Para medir equilibrio, npm run sim.
  it.each([2, 3, 4, 5, 6])('%i jugadores: sin trabas, un solo ganador, sin cartas perdidas', (n) => {
    const games = 10;
    for (let i = 0; i < games; i++) {
      const r = playGame(n * 100 + i, n, makeRules());
      expect(r.problems).toEqual([]);
      expect(r.stuck).toBe(false);
      expect(r.winnerSeat).toBeGreaterThanOrEqual(0);
    }
  }, 60000);
});
