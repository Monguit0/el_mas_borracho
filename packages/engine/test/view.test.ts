import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine.js';
import { eventsForViewer, playerView, resolveHandles } from '../src/view.js';
import { card, filler, fixedGame } from './helpers.js';

const hand = () => [
  card('Vodka', 'bordo', 'estrella', 2),
  card('Jugo de naranja', 'verde', 'estrella', 0),
  card('Vaso highball', 'bordo', 'triangulo', 1),
  card('Construir', 'mostaza', 'circulo', 3),
  ...filler(4),
];

const at = (alcohol: number, coffee = 0) =>
  fixedGame({ hands: [hand(), filler(8)], patch: (s) => { s.players[0]!.alcohol = alcohol; s.players[0]!.coffeeTurnsLeft = coffee; } });

describe('recetario', () => {
  it('sobrio o alegre: te dice qué podés armar, con qué cartas y cuánto paga', () => {
    for (const alcohol of [0, 30]) {
      const s = at(alcohol);
      const book = playerView(s, 'p0').you.recipeBook;
      expect(book.mode).toBe('completo');
      if (book.mode !== 'completo') return;
      expect(book.canMake).toHaveLength(1);
      expect(book.canMake[0]!.cocktailCode).toBe('C01');
      expect(book.canMake[0]!.points.total).toBe(8);
      const ids = resolveHandles(s, 'p0', book.canMake[0]!.handles)!;
      expect(ids.map((id) => s.players[0]!.hand.find((c) => c.id === id)!.name).sort()).toEqual(
        ['Construir', 'Jugo de naranja', 'Vaso highball', 'Vodka'],
      );
    }
  });

  it('mareado: solo el nombre del cóctel', () => {
    expect(playerView(at(60), 'p0').you.recipeBook).toEqual({ mode: 'solo_nombres', canMake: [{ cocktailCode: 'C01' }] });
  });

  it('en pedo o más: no se puede leer', () => {
    expect(playerView(at(80), 'p0').you.recipeBook).toEqual({ mode: 'ilegible' });
    expect(playerView(at(95), 'p0').you.recipeBook).toEqual({ mode: 'ilegible' });
  });

  it('el café ayuda a leerlo', () => {
    expect(playerView(at(80, 2), 'p0').you.recipeBook.mode).toBe('solo_nombres'); // 80% con café se ve como 55%
  });
});

describe('carta de la mesa', () => {
  const withTable = (alcohol: number) =>
    fixedGame({ hands: [hand(), filler(8)], table: card('Jarra', 'azul', 'estrella', 2), patch: (s) => (s.players[0]!.alcohol = alcohol) });

  it('sobrio la ves entera', () => {
    expect(playerView(withTable(0), 'p0').tableCard).toMatchObject({ name: 'Jarra', number: 2, colors: ['azul'], symbol: 'estrella' });
  });

  it('borracho la ves tan mal como tu mano, aunque otro sobrio la vea bien', () => {
    const s = withTable(80);
    expect(playerView(s, 'p0').tableCard).toMatchObject({ number: null });
    expect(playerView(s, 'p1').tableCard).toMatchObject({ number: 2 });
  });

  it('muestra los papelones de cada uno', () => {
    const s = withTable(0);
    s.players[1]!.shame = 2;
    expect(playerView(s, 'p0').players[1]!.shame).toBe(2);
  });
});

describe('vista por jugador', () => {
  it('nunca manda la mano de otro', () => {
    const v = playerView(at(0), 'p1');
    expect(JSON.stringify(v)).not.toContain('Vodka');
    expect(v.players[0]!.handCount).toBe(8);
  });

  it('sobrio: todo nítido y avisa qué podés armar', () => {
    const v = playerView(at(0), 'p0');
    expect(v.you.seeingLevel).toBe('sobrio');
    expect(v.you.hand.find((c) => c.name === 'Vodka')).toMatchObject({ art: 'clear', colors: ['bordo'], number: 2 });
  });

  it('alegre: dibujo borroso', () => {
    const v = playerView(at(30), 'p0');
    expect(v.you.hand.every((c) => c.art === 'blurred')).toBe(true);
    expect(v.you.hand.map((c) => c.name)).toContain('Vodka');
  });

  it('mareado: letras cambiadas, pero ve color, símbolo y número', () => {
    const v = playerView(at(60), 'p0');
    const names = v.you.hand.map((c) => c.name);
    expect(names).not.toContain('Vodka');
    expect(names.some((n) => n.startsWith('V') && n.length === 5)).toBe(true);
    expect(v.you.hand.every((c) => c.number !== null && c.colors.length === 1)).toBe(true);
  });

  it('en pedo: sin número', () => {
    const v = playerView(at(80), 'p0');
    expect(v.you.hand.every((c) => c.number === null)).toBe(true);
  });

  it('al borde: visión doble en el color y sin símbolo', () => {
    const s = at(95);
    const v = playerView(s, 'p0');
    for (const c of v.you.hand) {
      expect(c.colors).toHaveLength(2);
      expect(c.symbol).toBeNull();
      const [id] = resolveHandles(s, 'p0', [c.handle])!;
      const real = s.players[0]!.hand.find((x) => x.id === id)!;
      expect(c.colors).toContain(real.color);
    }
  });

  it('el café hace ver como con 25% menos', () => {
    expect(playerView(at(60, 2), 'p0').you.seeingLevel).toBe('alegre');
    expect(playerView(at(60, 2), 'p0').you.level).toBe('mareado');
  });

  it('los handles se traducen y cambian de un turno a otro', () => {
    const s = at(0);
    const v1 = playerView(s, 'p0');
    const ids = resolveHandles(s, 'p0', v1.you.hand.map((c) => c.handle))!;
    expect(ids.sort()).toEqual(s.players[0]!.hand.map((c) => c.id).sort());
    expect(resolveHandles(s, 'p1', [v1.you.hand[0]!.handle])).toBeNull();
    const next = applyAction(s, 'p0', { type: 'END_TURN', discardIds: [] });
    if (!next.ok) throw new Error(next.error);
    const v2 = playerView(next.state, 'p0');
    expect(v2.you.hand.map((c) => c.handle)).not.toContain(v1.you.hand[0]!.handle);
  });

  it('no se ven las cartas que roban los otros', () => {
    const s = at(0);
    const res = applyAction(s, 'p0', { type: 'END_TURN', discardIds: [] });
    if (!res.ok) throw new Error(res.error);
    const drawn = (viewer: string) => eventsForViewer(res.state, viewer, res.events).find((e) => e.type === 'CARDS_DRAWN');
    const forOther = drawn('p0') as { playerId: string; cardIds: string[] };
    const forMe = drawn('p1') as { playerId: string; cardIds: string[] };
    expect(forOther.playerId).toBe('p1');
    expect(forOther.cardIds).toEqual(['?', '?', '?']);
    expect(forMe.cardIds.every((id) => id.startsWith('h'))).toBe(true);
  });
});
