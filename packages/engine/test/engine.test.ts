import { describe, expect, it } from 'vitest';
import { applyAction, createGame, handTotal, timeoutAction } from '../src/engine.js';
import { playerView, eventsForViewer } from '../src/view.js';
import { act, c, fixedGame, ids, p } from './helpers.js';

describe('cuentas', () => {
  it('el as vale 11 si conviene y 1 si no', () => {
    expect(handTotal([c('AS'), c('KD')])).toBe(21);
    expect(handTotal([c('AS'), c('KD'), c('5C')])).toBe(16);
    expect(handTotal([c('AS'), c('AD'), c('9C')])).toBe(21);
  });
  it('el 6 de diamantes vale 4 si te salva', () => {
    expect(handTotal([c('6D'), c('KS'), c('7C')])).toBe(21);
    expect(handTotal([c('6D'), c('KS')])).toBe(16);
  });
});

describe('ronda', () => {
  it('reparte 2 a cada uno, cobra la apuesta y le toca a alguien', () => {
    const { state, events } = createGame({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seed: 3 });
    expect(state.players.every((x) => x.cards.length === 2)).toBe(true);
    expect(state.pot).toBe(3);
    expect(state.players.every((x) => x.chips === 9)).toBe(true);
    expect(events.some((e) => e.type === 'ROUND_STARTED')).toBe(true);
  });

  it('pedir y pasarse termina tu turno', () => {
    const s = fixedGame({ hands: [['KS', '9C'], ['2D', '3D']], top: ['5D'] });
    const { state, events } = act(s, 'p0', { type: 'HIT' });
    expect(p(state, 'p0').status).toBe('busted');
    expect(state.currentId).toBe('p1');
    expect(events.some((e) => e.type === 'BUST' && e.playerId === 'p0')).toBe(true);
  });

  it('con 21 justo se planta solo y avisa', () => {
    const s = fixedGame({ hands: [['KS', '6H'], ['2D', '3D']], top: ['5D'] });
    const { state, events } = act(s, 'p0', { type: 'HIT' });
    expect(events.some((e) => e.type === 'TWENTY_ONE' && e.playerId === 'p0' && !e.natural)).toBe(true);
    expect(p(state, 'p0').status).toBe('stood');
  });

  it('gana el más cerca de 21 y se lleva el pozo', () => {
    const s = fixedGame({ hands: [['KS', '9C'], ['2D', '3D']], top: ['4H'] });
    let r = act(s, 'p0', { type: 'STAND' });
    r = act(r.state, 'p1', { type: 'STAND' });
    expect(r.state.phase).toBe('roundOver');
    const result = r.state.results!.find((x) => x.playerId === 'p0')!;
    expect(result.winner).toBe(true);
    expect(p(r.state, 'p0').chips).toBe(11);
  });

  it('si todos se pasan, el pozo queda para la próxima', () => {
    const s = fixedGame({ hands: [['KS', '9C'], ['KH', '9D']], top: ['5D', 'QD'] });
    let r = act(s, 'p0', { type: 'HIT' });
    r = act(r.state, 'p1', { type: 'HIT' });
    expect(r.state.phase).toBe('roundOver');
    expect(r.state.pot).toBe(2);
    r = act(r.state, 'p1', { type: 'NEXT_ROUND' });
    expect(r.state.pot).toBe(4);
    expect(r.state.round).toBe(2);
  });

  it('fuera de turno no se puede', () => {
    const s = fixedGame({ hands: [['KS', '9C'], ['2D', '3D']] });
    expect(applyAction(s, 'p1', { type: 'HIT' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('al vencer el tiempo se planta', () => {
    const s = fixedGame({ hands: [['KS', '9C'], ['2D', '3D']] });
    expect(timeoutAction(s)).toEqual({ playerId: 'p0', action: { type: 'STAND' } });
  });

  it('al terminar las rondas gana el que más fichas tiene', () => {
    const s = fixedGame({ hands: [['KS', '9C'], ['2D', '3D']], rules: { rounds: 1 } });
    let r = act(s, 'p0', { type: 'STAND' });
    r = act(r.state, 'p1', { type: 'STAND' });
    expect(r.state.phase).toBe('finished');
    expect(r.state.winnerId).toBe('p0');
  });
});

describe('efectos', () => {
  it('Catalejo: mirás la de arriba y la mandás al fondo', () => {
    const s = fixedGame({ hands: [['3C', '4C'], ['2D', '3D']], top: ['2S', 'KH'] });
    let r = act(s, 'p0', { type: 'HIT' });
    expect(r.state.pending?.options[0]?.card?.id).toBe('KH');
    r = act(r.state, 'p0', { type: 'CHOOSE', optionId: 'bottom' });
    expect(r.state.deck[0]?.id).toBe('KH');
  });

  it('Ojeada: solo el que espía ve la carta', () => {
    const s = fixedGame({ hands: [['3C', '4C'], ['QD', '3D'], ['5D', '6C']], top: ['3S'] });
    let r = act(s, 'p0', { type: 'HIT' });
    r = act(r.state, 'p0', { type: 'CHOOSE', optionId: 'p1' });
    expect(playerView(r.state, 'p0').players[1]!.cards[0]!.card?.id).toBe('QD');
    expect(playerView(r.state, 'p2').players[1]!.cards[0]!.card).toBeNull();
    expect(eventsForViewer(r.state, 'p2', r.events).some((e) => e.type === 'PEEK')).toBe(false);
    expect(eventsForViewer(r.state, 'p0', r.events).some((e) => e.type === 'PEEK')).toBe(true);
  });

  it('Sombra: el 10 de picas queda boca abajo', () => {
    const s = fixedGame({ hands: [['3C', '4C'], ['2D', '3D']], top: ['10S'] });
    const r = act(s, 'p0', { type: 'HIT' });
    const seen = playerView(r.state, 'p1').players[0]!.cards;
    expect(seen.filter((x) => x.card === null)).toHaveLength(2);
  });

  it('Soborno: pasarse por 1 o 2 cuesta una ficha y quedás en 21', () => {
    const s = fixedGame({ hands: [['KD', '9C'], ['2D', '3D']], top: ['3C'] });
    const r = act(s, 'p0', { type: 'HIT' });
    expect(p(r.state, 'p0').status).toBe('stood');
    expect(r.events.some((e) => e.type === 'SAVED' && e.cardId === 'KD')).toBe(true);
    expect(p(r.state, 'p0').chips).toBe(8);
  });

  it('Salvavidas: si te pasás, se va tu carta más alta con Latido', () => {
    const s = fixedGame({ hands: [['3H', 'KC'], ['2D', '3D']], top: ['9S'] });
    const r = act(s, 'p0', { type: 'HIT' });
    expect(ids(r.state, 'p0')).toEqual(['9S']);
    expect(p(r.state, 'p0').status).toBe('playing');
  });

  it('Manotazo frenado por la Manta', () => {
    const s = fixedGame({ hands: [['3C', '5D'], ['2D', '3D']], top: ['4C'] });
    p(s, 'p1').blankets = 1;
    let r = act(s, 'p0', { type: 'HIT' });
    r = act(r.state, 'p0', { type: 'CHOOSE', optionId: 'p1' });
    expect(r.events.some((e) => e.type === 'BLOCKED')).toBe(true);
    expect(p(r.state, 'p1').chips).toBe(9);
  });

  it('Chaparrón: todos los rivales piden', () => {
    const s = fixedGame({ hands: [['2C', '3D'], ['KH', '9D'], ['2H', '3H']], top: ['9C', '5S', '4S'] });
    const r = act(s, 'p0', { type: 'HIT' });
    expect(p(r.state, 'p1').status).toBe('busted');
    expect(p(r.state, 'p2').cards).toHaveLength(3);
  });

  it('Espejo copia el último efecto', () => {
    const s = fixedGame({ hands: [['3C', '4H'], ['2D', '3S']], top: ['2D', 'JC'] });
    let r = act(s, 'p0', { type: 'HIT' });
    expect(p(r.state, 'p0').chips).toBe(10);
    r = act(r.state, 'p0', { type: 'HIT' });
    expect(p(r.state, 'p0').chips).toBe(11);
  });

  it('Suerte: 21 de mano con el as de tréboles cobra el triple', () => {
    const s = fixedGame({ hands: [['AC', 'KD'], ['2D', '3D']] });
    let r = act(s, 'p0', { type: 'STAND' });
    r = act(r.state, 'p1', { type: 'STAND' });
    expect(p(r.state, 'p0').chips).toBe(9 + 2 * 3);
  });
});

describe('partidas al azar', () => {
  it.each([2, 3, 4, 6])('%i jugadores: terminan, sin cartas perdidas ni fichas negativas', (n) => {
    for (let seed = 1; seed <= 25; seed++) {
      const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));
      let { state } = createGame({ players, seed: seed * 31 + n });
      let r = seed;
      const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let step = 0; step < 4000 && state.phase !== 'finished'; step++) {
        let actorId: string;
        let action: Parameters<typeof applyAction>[2];
        if (state.phase === 'roundOver') {
          actorId = state.players.find((x) => x.status !== 'out')!.id;
          action = { type: 'NEXT_ROUND' };
        } else {
          actorId = state.currentId!;
          expect(actorId).toBeTruthy();
          const pending = state.pending;
          if (pending) action = { type: 'CHOOSE', optionId: pending.options[Math.floor(rnd() * pending.options.length)]!.id };
          else action = rnd() < 0.55 ? { type: 'HIT' } : { type: 'STAND' };
        }
        const res = applyAction(state, actorId, action);
        if (!res.ok) {
          expect(['HIT_LIMIT', 'DECK_EMPTY']).toContain(res.error);
          const fallback = applyAction(state, actorId, { type: 'STAND' });
          expect(fallback.ok).toBe(true);
          if (fallback.ok) state = fallback.state;
          continue;
        }
        state = res.state;
        if (state.phase === 'playing') {
          const count = state.deck.length + state.discard.length + state.players.reduce((sum, x) => sum + x.cards.length, 0);
          expect(count).toBe(52);
        }
        expect(state.players.every((x) => x.chips >= 0)).toBe(true);
      }
      expect(state.phase).toBe('finished');
      expect(state.winnerId).toBeTruthy();
    }
  });
});
