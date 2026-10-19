import { describe, expect, it } from 'vitest';
import { handlesOf, normalizeName, normalizeRoomCode, parseWireAction } from '../src/index.js';

describe('jugadas que llegan del celular', () => {
  it('acepta las jugadas bien formadas', () => {
    expect(parseWireAction({ type: 'WATER' })).toEqual({ type: 'WATER' });
    expect(parseWireAction({ type: 'SHOT', cards: ['h1', 'h2'] })).toEqual({ type: 'SHOT', cards: ['h1', 'h2'] });
    expect(parseWireAction({ type: 'END_TURN', discards: [] })).toEqual({ type: 'END_TURN', discards: [] });
    const counter = { type: 'RESPOND', choice: 'special', specialId: 's3', counter: { cocktailCode: 'C02', cards: ['h1'] } };
    expect(parseWireAction(counter)).toEqual(counter);
    expect(handlesOf(parseWireAction(counter)!)).toEqual(['h1']);
    const cocktail = { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cards: ['h1'], targetId: 'j1', specialIds: ['s1'] };
    expect(parseWireAction(cocktail)).toEqual(cocktail);
  });

  it('rechaza campos de más, tipos equivocados y listas enormes', () => {
    expect(parseWireAction({ type: 'WATER', extra: 1 })).toBeNull();
    expect(parseWireAction({ type: 'SHOT', cards: [] })).toBeNull();
    expect(parseWireAction({ type: 'SHOT', cards: [1] })).toBeNull();
    expect(parseWireAction({ type: 'SHOT', cards: Array.from({ length: 21 }, (_, i) => `h${i}`) })).toBeNull();
    expect(parseWireAction({ type: 'RESPOND', choice: 'refuse' })).toBeNull();
    expect(parseWireAction({ type: 'RESPOND', choice: 'drink', specialId: 's1' })).toBeNull();
    expect(parseWireAction({ type: 'HACK' })).toBeNull();
    expect(parseWireAction(null)).toBeNull();
    expect(parseWireAction([{ type: 'WATER' }])).toBeNull();
  });
});

describe('nombres y códigos', () => {
  it('limpia nombres y rechaza los raros', () => {
    expect(normalizeName('  Ana   María ')).toBe('Ana María');
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('a'.repeat(21))).toBeNull();
    expect(normalizeName('Ana‮oteb')).toBeNull();
  });

  it('acepta códigos en minúscula o con guiones, sin letras que se confunden', () => {
    expect(normalizeRoomCode('abc-def')).toBe('ABCDEF');
    expect(normalizeRoomCode('ABCDE0')).toBeNull();
    expect(normalizeRoomCode('ABC')).toBeNull();
  });
});
