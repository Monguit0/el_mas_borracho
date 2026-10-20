import { describe, expect, it } from 'vitest';
import { normalizeName, normalizeRoomCode, parseWireAction } from '../src/index.js';

describe('jugadas que llegan del celular', () => {
  it('acepta las jugadas bien formadas', () => {
    expect(parseWireAction({ type: 'HIT' })).toEqual({ type: 'HIT' });
    expect(parseWireAction({ type: 'STAND' })).toEqual({ type: 'STAND' });
    expect(parseWireAction({ type: 'CHOOSE', optionId: 'p1' })).toEqual({ type: 'CHOOSE', optionId: 'p1' });
    expect(parseWireAction({ type: 'NEXT_ROUND' })).toEqual({ type: 'NEXT_ROUND' });
  });

  it('rechaza campos de más, tipos equivocados y cosas raras', () => {
    expect(parseWireAction({ type: 'HIT', extra: 1 })).toBeNull();
    expect(parseWireAction({ type: 'CHOOSE' })).toBeNull();
    expect(parseWireAction({ type: 'CHOOSE', optionId: 3 })).toBeNull();
    expect(parseWireAction({ type: 'CHOOSE', optionId: 'x'.repeat(40) })).toBeNull();
    expect(parseWireAction({ type: 'HACK' })).toBeNull();
    expect(parseWireAction(null)).toBeNull();
    expect(parseWireAction([{ type: 'HIT' }])).toBeNull();
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
