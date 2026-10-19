import { describe, expect, it } from 'vitest';
import { CARD_DEFS, COCKTAILS, COLORS, NUMBERS, PRINTED_DECK, SYMBOLS, copiesFor } from '../src/cards.js';
import { actionCost, applyAction, createGame, removePlayer, type Action, type ActionResult } from '../src/engine.js';
import { makeRules } from '../src/rules.js';
import { bestCocktailOptions, cocktailAlcohol, matchesRecipe, scoreCocktail } from '../src/scoring.js';
import { COCKTAIL_BY_CODE } from '../src/cards.js';
import type { GameState } from '../src/state.js';
import { card, filler, fixedGame } from './helpers.js';
import { printedSpecials, type SpecialCode } from '../src/specials.js';
import { eventsForViewer, playerView } from '../src/view.js';

function act(state: GameState, player: string, action: Action) {
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(`Rechazada: ${res.error}`);
  return res;
}
function err(res: ActionResult) {
  return res.ok ? null : res.error;
}
const destornillador = () => [card('Vodka'), card('Jugo de naranja'), card('Vaso highball'), card('Construir')];

describe('mazo impreso', () => {
  it('tiene 177 cartas: más copias de lo que más se usa, y las copias nunca son iguales', () => {
    expect(PRINTED_DECK).toHaveLength(177);
    expect(PRINTED_DECK.filter((c) => c.name === 'Lima')).toHaveLength(6);
    expect(PRINTED_DECK.filter((c) => c.name === 'Vaso común')).toHaveLength(4);
    const seen = new Set<string>();
    for (const c of PRINTED_DECK) {
      const key = `${c.name}|${c.color}|${c.symbol}|${c.number}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('reparte casi parejo colores, símbolos y números', () => {
    for (const [attr, values] of [['color', COLORS], ['symbol', SYMBOLS], ['number', NUMBERS]] as const) {
      for (const v of values) {
        const n = PRINTED_DECK.filter((c) => c[attr] === v).length;
        expect(n).toBeGreaterThanOrEqual(40);
        expect(n).toBeLessThanOrEqual(50);
      }
    }
  });

  it('todas las cartas (menos el Vaso común) entran en alguna receta, y cada receta lleva un vaso', () => {
    const used = new Set(COCKTAILS.flatMap((c) => c.recipe));
    expect(CARD_DEFS.filter((d) => !used.has(d.name)).map((d) => d.name)).toEqual(['Vaso común']);
    expect(COCKTAILS).toHaveLength(35);
  });
});

describe('arranque', () => {
  it('reparte 8 a cada uno y el primero roba 3', () => {
    const { state } = createGame({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seed: 7 });
    const first = state.players[state.currentIndex]!;
    for (const p of state.players) expect(p.hand.length).toBe(p === first ? 11 : 8);
    expect(state.deck.length).toBe(177 - 27 - 1); // y una boca arriba en la mesa
    expect(state.discard).toHaveLength(1);
  });

  it('el mazo chico usa la mitad de copias de cada nombre', () => {
    const { state } = createGame({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seed: 7, rules: makeRules({ deckCopies: 1 }) });
    const expected = CARD_DEFS.reduce((n, d) => n + Math.ceil(copiesFor(d.name) / 2), 0);
    expect(state.totalCards).toBe(expected);
    expect(expected).toBeLessThan(100);
  });
});

describe('puntos del cóctel', () => {
  it('el ejemplo del documento da 9 (8 más el vaso correcto)', () => {
    const c = COCKTAIL_BY_CODE.get('C01')!;
    const cards = [
      card('Vodka', 'bordo', 'estrella', 2),
      card('Jugo de naranja', 'verde', 'estrella', 0),
      card('Vaso highball', 'bordo', 'triangulo', 1),
      card('Construir', 'mostaza', 'circulo', 3),
    ];
    expect(scoreCocktail(c, cards, makeRules().bonus)).toEqual({ base: 4, color: 2, symbol: 2, sameNumber: 0, glass: 1, total: 9 });
  });

  it('número parejo suma 2', () => {
    const c = COCKTAIL_BY_CODE.get('C02')!;
    const cards = [card('Fernet', 'verde', 'circulo', 3), card('Coca', 'verde', 'circulo', 3), card('Botella cortada', 'verde', 'circulo', 3)];
    expect(scoreCocktail(c, cards, makeRules().bonus).sameNumber).toBe(2);
  });

  it('receta exacta: no sobra ni falta nada', () => {
    const c = COCKTAIL_BY_CODE.get('C01')!;
    expect(matchesRecipe(c, destornillador())).toBe(true);
    expect(matchesRecipe(c, destornillador().slice(0, 3))).toBe(false);
    expect(matchesRecipe(c, [...destornillador(), card('Lima')])).toBe(false);
    expect(matchesRecipe(c, [card('Vodka'), card('Vodka'), card('Vaso highball'), card('Construir')])).toBe(false);
  });

  it('el Vaso común sirve de vaso en cualquier receta y resta 1 punto', () => {
    const c = COCKTAIL_BY_CODE.get('C01')!;
    const cards = [card('Vodka', 'azul', 'rombo', 0), card('Jugo de naranja', 'azul', 'rombo', 1), card('Vaso común', 'azul', 'rombo', 2), card('Construir', 'azul', 'rombo', 3)];
    expect(matchesRecipe(c, cards)).toBe(true);
    expect(scoreCocktail(c, cards, makeRules().bonus).total).toBe(3);
    expect(matchesRecipe(c, [card('Vodka'), card('Jugo de naranja'), card('Vaso común'), card('Vaso highball')])).toBe(false);
    expect(matchesRecipe(c, [card('Vodka'), card('Vaso común'), card('Vaso highball'), card('Construir')])).toBe(false);
  });

  it('cualquier vaso sirve: el de la receta suma 1, otro resta 1 y pega 5% menos', () => {
    const c = COCKTAIL_BY_CODE.get('C01')!;
    const rules = makeRules();
    const other = [card('Vodka', 'azul', 'rombo', 0), card('Jugo de naranja', 'azul', 'rombo', 1), card('Jarra', 'azul', 'rombo', 2), card('Construir', 'azul', 'rombo', 3)];
    expect(matchesRecipe(c, other, 'exacta')).toBe(false);
    expect(matchesRecipe(c, other, 'vaso')).toBe(true);
    expect(scoreCocktail(c, other, rules.bonus)).toMatchObject({ glass: -1, total: 3 });
    expect(cocktailAlcohol(c, other, rules)).toBe(c.alcohol - 5);
    const right = destornillador();
    expect(scoreCocktail(c, right, rules.bonus).glass).toBe(1);
    expect(cocktailAlcohol(c, right, rules)).toBe(c.alcohol);
    // Los ingredientes, utensilios y técnicas siguen siendo los de la receta.
    expect(matchesRecipe(c, [card('Vodka'), card('Jugo de naranja'), card('Jarra'), card('Flamear')], 'vaso')).toBe(false);
    expect(matchesRecipe(c, [card('Vodka'), card('Jarra'), card('Vaso highball'), card('Construir')], 'vaso')).toBe(false);
  });

  it('con otro vaso, la mejor opción prefiere el de la receta si lo tenés', () => {
    const hand = [card('Vodka'), card('Jugo de naranja'), card('Jarra'), card('Vaso highball'), card('Construir')];
    const opt = bestCocktailOptions(hand, [COCKTAIL_BY_CODE.get('C01')!], makeRules().bonus, 'vaso')[0]!;
    expect(opt.wrongGlass).toBe(false);
    expect(opt.cardIds).toContain(hand[3]!.id);
  });

  it('un cóctel nunca vale menos de 0', () => {
    const c = COCKTAIL_BY_CODE.get('C01')!;
    const cards = [card('Vodka', 'azul', 'rombo', 0), card('Jugo de naranja', 'azul', 'rombo', 1), card('Vaso común', 'azul', 'rombo', 2), card('Construir', 'azul', 'rombo', 3)];
    expect(scoreCocktail(c, cards, makeRules({ bonus: { wrongGlass: -10 } }).bonus).total).toBe(0);
  });

  it('receta flexible: vaso y técnica pueden ser cualquiera de su categoría', () => {
    const c = COCKTAIL_BY_CODE.get('C01')!;
    const cards = [card('Vodka'), card('Jugo de naranja'), card('Jarra'), card('Flamear')];
    expect(matchesRecipe(c, cards, 'exacta')).toBe(false);
    expect(matchesRecipe(c, cards, 'flexible')).toBe(true);
    expect(matchesRecipe(c, [card('Gin'), card('Jugo de naranja'), card('Jarra'), card('Flamear')], 'flexible')).toBe(false);
  });
});

describe('armar y lanzar', () => {
  it('el rival se lo toma, el que lanza cobra y repone las cartas usadas', () => {
    const hand = [...destornillador(), ...filler(5)];
    const s = fixedGame({ hands: [hand, filler(8)] });
    const res = act(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1' });
    const [me, rival] = res.state.players;
    expect(rival!.alcohol).toBe(15);
    expect(me!.points).toBe(7); // base 4 + número parejo 2 + vaso correcto 1 (todas verdes ○1: no combinan con bordó ★)
    expect(me!.hand).toHaveLength(9);
    expect(res.state.discard).toHaveLength(4);
    expect(res.events.map((e) => e.type)).toContain('COCKTAIL_DRUNK');
  });

  it('se pueden armar y lanzar varios en el mismo turno', () => {
    const hand = [...destornillador(), ...destornillador()];
    const s = fixedGame({ hands: [hand, filler(8)] });
    const r1 = act(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1' });
    const r2 = act(r1.state, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(4).map((c) => c.id), targetId: 'p1' });
    expect(r2.state.players[1]!.alcohol).toBe(30);
    expect(r2.state.players[0]!.hand).toHaveLength(8);
  });

  it('respeta un límite por turno si la sala lo pone', () => {
    const hand = [...destornillador(), ...destornillador()];
    const s = fixedGame({ hands: [hand, filler(8)], rules: makeRules({ cocktailsPerTurn: 1 }) });
    const r1 = act(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1' });
    const r2 = applyAction(r1.state, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(4).map((c) => c.id), targetId: 'p1' });
    expect(err(r2)).toBe('LIMIT_REACHED');
  });

  it('mal armado: suma 5% al que lo hizo, descarta y repone', () => {
    const hand = [card('Vodka'), card('Lima'), card('Vaso highball'), card('Construir'), ...filler(5)];
    const s = fixedGame({ hands: [hand, filler(8)] });
    const res = act(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1' });
    expect(res.state.players[0]!.alcohol).toBe(5);
    expect(res.state.players[1]!.alcohol).toBe(0);
    expect(res.state.players[0]!.hand).toHaveLength(9);
    expect(res.events[0]!.type).toBe('COCKTAIL_FAILED');
  });

  it('rechaza un blanco inválido sin cobrar nada', () => {
    const hand = [...destornillador(), ...filler(5)];
    const s = fixedGame({ hands: [hand, filler(8)] });
    const ids = hand.slice(0, 4).map((c) => c.id);
    expect(err(applyAction(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: ids, targetId: 'p0' }))).toBe('BAD_TARGET');
    expect(err(applyAction(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'X', cardIds: ids, targetId: 'p1' }))).toBe('UNKNOWN_COCKTAIL');
    expect(err(applyAction(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: ['nope'], targetId: 'p1' }))).toBe('CARD_NOT_IN_HAND');
  });
});

describe('cartas especiales', () => {
  const fernet = () => [card('Fernet'), card('Coca'), card('Botella cortada')];
  const sid = (s: GameState, seat: number, i = 0) => s.players[seat]!.specials[i]!.id;
  /** p0 le tira un Destornillador (15%, 6 puntos) al elegido, con las especiales de cóctel que diga. */
  const throwWith = (opts: { specials?: SpecialCode[][]; players?: number; target?: string; use?: number[]; patch?: (s: GameState) => void }) => {
    const hand = [...destornillador(), ...filler(5)];
    const n = opts.players ?? 2;
    const s = fixedGame({
      hands: [hand, ...Array.from({ length: n - 1 }, () => [...fernet(), ...filler(5)])],
      specials: opts.specials,
      patch: opts.patch,
    });
    const specialIds = (opts.use ?? []).map((i) => sid(s, 0, i));
    return act(s, 'p0', {
      type: 'MAKE_COCKTAIL',
      cocktailCode: 'C01',
      cardIds: hand.slice(0, 4).map((c) => c.id),
      targetId: opts.target ?? 'p1',
      specialIds,
    });
  };

  it('el mazo especial tiene 31 cartas: más copias cuanto menos poderosa', () => {
    const deck = printedSpecials();
    expect(deck).toHaveLength(31);
    expect(deck.filter((x) => x.code === 'no_gracias')).toHaveLength(4);
    expect(deck.filter((x) => x.code === 'ronda_shots')).toHaveLength(3);
    expect(deck.filter((x) => x.code === 'tomatelo_vos')).toHaveLength(2);
    expect(deck.filter((x) => x.code === 'jarra')).toHaveLength(1);
  });

  it('cada uno arranca con 2 especiales', () => {
    const { state } = createGame({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seed: 3 });
    expect(state.players.map((p) => p.specials.length)).toEqual([2, 2]);
    expect(state.specialDeck).toHaveLength(27);
  });

  it('comprar cuesta 4 y se duplica en el turno; tope de 3', () => {
    const s = fixedGame({ hands: [filler(9), filler(8)], specials: [['mani']], patch: (st) => (st.players[0]!.points = 12) });
    let st = act(s, 'p0', { type: 'BUY_SPECIAL' }).state;
    expect(st.players[0]!.points).toBe(8);
    expect(actionCost(st, 'buy')).toBe(8);
    st = act(st, 'p0', { type: 'BUY_SPECIAL' }).state;
    expect(st.players[0]!.points).toBe(0);
    expect(st.players[0]!.specials).toHaveLength(3);
    st.players[0]!.points = 99;
    expect(err(applyAction(st, 'p0', { type: 'BUY_SPECIAL' }))).toBe('SPECIAL_HAND_FULL');
    const poor = fixedGame({ hands: [filler(9), filler(8)], patch: (x) => (x.players[0]!.points = 3) });
    expect(err(applyAction(poor, 'p0', { type: 'BUY_SPECIAL' }))).toBe('NOT_ENOUGH_POINTS');
  });

  it('los demás no ven qué compraste', () => {
    const s = fixedGame({ hands: [filler(9), filler(8)], patch: (st) => (st.players[0]!.points = 4) });
    const res = act(s, 'p0', { type: 'BUY_SPECIAL' });
    const bought = (id: string) => eventsForViewer(res.state, id, res.events).find((e) => e.type === 'SPECIAL_BOUGHT');
    expect(bought('p0')).toMatchObject({ special: { id: res.state.players[0]!.specials[0]!.id } });
    expect(bought('p1')).toMatchObject({ special: null });
    expect(playerView(res.state, 'p1').players[0]!.specialCount).toBe(1);
  });

  it('sin especiales se lo toma directo; con alguna, se abre la respuesta', () => {
    expect(throwWith({}).state.phase).toBe('main');
    const s = throwWith({ specials: [[], ['mani']] }).state;
    expect(s.phase).toBe('defense');
    expect(err(applyAction(s, 'p0', { type: 'WATER' }))).toBe('WRONG_PHASE');
    expect(err(applyAction(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1) }))).toBe('WRONG_SPECIAL');
    const res = act(s, 'p1', { type: 'RESPOND', choice: 'drink' });
    expect(res.state.players[1]!.alcohol).toBe(15);
    expect(res.state.players[0]!.points).toBe(7);
  });

  it('"No, gracias": nadie lo toma y nadie cobra', () => {
    const s = throwWith({ specials: [[], ['no_gracias']] }).state;
    const res = act(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1) });
    expect(res.state.players.map((p) => p.alcohol)).toEqual([0, 0]);
    expect(res.state.players[0]!.points).toBe(0);
    expect(res.state.players[1]!.specials).toHaveLength(0);
    expect(res.state.specialDiscard.map((x) => x.code)).toContain('no_gracias');
  });

  it('"¡Tomátelo vos!": se lo toma el que lo tiró y no cobra', () => {
    const s = throwWith({ specials: [[], ['tomatelo_vos']] }).state;
    const res = act(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1) });
    expect(res.state.players.map((p) => p.alcohol)).toEqual([15, 0]);
    expect(res.state.players[0]!.points).toBe(0);
  });

  it('"¡Vos también!": toman los dos y el que lo tiró cobra', () => {
    const s = throwWith({ specials: [[], ['vos_tambien']] }).state;
    const res = act(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1) });
    expect(res.state.players.map((p) => p.alcohol)).toEqual([15, 15]);
    expect(res.state.players[0]!.points).toBe(7);
  });

  it('"Doblalo": pasa al siguiente con el doble, y ese también puede responder', () => {
    const s = throwWith({ players: 3, specials: [[], ['doblalo'], ['doblalo']] }).state;
    let res = act(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1) });
    expect(res.state.pending).toMatchObject({ targetId: 'p2', senderId: 'p1', alcohol: 30 });
    expect(res.state.phase).toBe('defense');
    // p2 lo vuelve a doblar: le toca al siguiente, que es el que lo armó.
    res = act(res.state, 'p2', { type: 'RESPOND', choice: 'special', specialId: sid(res.state, 2) });
    expect(res.state.phase).toBe('main');
    expect(res.state.players.map((p) => p.alcohol)).toEqual([60, 0, 0]);
    expect(res.state.players[0]!.points).toBe(0);
  });

  it('"Doblalo": si se lo toma otro, cobra el que lo armó', () => {
    const s = throwWith({ players: 3, specials: [[], ['doblalo'], []] }).state;
    const res = act(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1) });
    expect(res.state.players.map((p) => p.alcohol)).toEqual([0, 0, 30]);
    expect(res.state.players[0]!.points).toBe(7);
  });

  it('"¡Probá el mío!": te lo tomás y le tirás uno tuyo, sin respuesta', () => {
    const s = throwWith({ specials: [['no_gracias'], ['proba_el_mio']] }).state;
    const ids = s.players[1]!.hand.slice(0, 3).map((c) => c.id);
    const res = act(s, 'p1', {
      type: 'RESPOND',
      choice: 'special',
      specialId: sid(s, 1),
      counter: { cocktailCode: 'C02', cardIds: ids },
    });
    expect(res.state.phase).toBe('main');
    expect(res.state.players.map((p) => p.alcohol)).toEqual([15, 15]);
    expect(res.state.players.map((p) => p.points)).toEqual([7, 6]);
    expect(res.state.players[1]!.hand).toHaveLength(8);
    expect(res.state.players[0]!.specials).toHaveLength(1); // no pudo usar su "No, gracias"
  });

  it('"¡Probá el mío!" mal armado: te sumás el 5% de castigo', () => {
    const s = throwWith({ specials: [[], ['proba_el_mio']] }).state;
    const ids = s.players[1]!.hand.slice(2, 5).map((c) => c.id);
    const res = act(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1), counter: { cocktailCode: 'C02', cardIds: ids } });
    expect(res.state.players.map((p) => p.alcohol)).toEqual([0, 20]);
    expect(err(applyAction(s, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(s, 1) }))).toBe('WRONG_SPECIAL');
  });

  it('"Semana difícil": el cóctel pega 15% más', () => {
    const res = throwWith({ specials: [['semana_dificil']], use: [0] });
    expect(res.state.players[1]!.alcohol).toBe(30);
    expect(res.state.players[0]!.specials).toHaveLength(0);
  });

  it('"Jarra grande": el doble repartido entre los rivales, y cada uno responde', () => {
    const res = throwWith({ players: 4, specials: [['jarra', 'semana_dificil'], ['no_gracias'], [], []], use: [0, 1] });
    // (15 + 15) × 2 = 60, entre 3 rivales = 20 cada uno. p1 lo rechaza.
    expect(res.state.phase).toBe('defense');
    const st = act(res.state, 'p1', { type: 'RESPOND', choice: 'special', specialId: sid(res.state, 1) }).state;
    expect(st.players.map((p) => p.alcohol)).toEqual([0, 0, 20, 20]);
    expect(st.players[0]!.points).toBe(7);
  });

  it('una carta de turno no sirve para el cóctel, ni dos iguales', () => {
    const r1 = (() => {
      const hand = [...destornillador(), ...filler(5)];
      const s = fixedGame({ hands: [hand, filler(8)], specials: [['mani']] });
      return applyAction(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1', specialIds: [sid(s, 0)] });
    })();
    expect(err(r1)).toBe('WRONG_SPECIAL');
    expect(() => throwWith({ specials: [['semana_dificil', 'semana_dificil']], use: [0, 1] })).toThrow('WRONG_SPECIAL');
  });

  it('"Ronda de shots": todos toman 5%, el que la pidió también', () => {
    const s = fixedGame({ hands: [filler(9), filler(8), filler(8)], specials: [['ronda_shots']] });
    const res = act(s, 'p0', { type: 'PLAY_SPECIAL', specialId: sid(s, 0) });
    expect(res.state.players.map((p) => p.alcohol)).toEqual([5, 5, 5]);
    expect(res.state.playedThisTurn).toBe(0); // no cuenta como jugada
  });

  it('comida: Maní baja a la mitad el próximo cóctel, Empanadas los próximos 2', () => {
    const s = fixedGame({ hands: [filler(9), filler(8)], specials: [['mani', 'empanadas']] });
    let st = act(s, 'p0', { type: 'PLAY_SPECIAL', specialId: sid(s, 0) }).state;
    st = act(st, 'p0', { type: 'PLAY_SPECIAL', specialId: sid(st, 0) }).state;
    expect(st.players[0]!.foodHalves).toBe(3);
    expect(playerView(st, 'p1').players[0]!.foodHalves).toBe(3);
    const res = throwWith({ target: 'p1', patch: (x) => (x.players[1]!.foodHalves = 1) });
    expect(res.state.players[1]!.alcohol).toBe(8);
    expect(res.state.players[1]!.foodHalves).toBe(0);
  });

  it('Choripán: todo a la mitad hasta tu próximo turno', () => {
    const res = throwWith({ patch: (x) => (x.players[1]!.choripan = true) });
    expect(res.state.players[1]!.alcohol).toBe(8);
    expect(res.state.players[1]!.choripan).toBe(true);
    const s = fixedGame({ hands: [filler(9), filler(8)], specials: [['choripan']] });
    let st = act(s, 'p0', { type: 'PLAY_SPECIAL', specialId: sid(s, 0) }).state;
    st = act(st, 'p0', { type: 'END_TURN', discardIds: [st.players[0]!.hand[0]!.id] }).state;
    expect(st.players[0]!.choripan).toBe(true);
    st = act(st, 'p1', { type: 'END_TURN', discardIds: st.players[1]!.hand.slice(0, 3).map((c) => c.id) }).state;
    expect(st.players[0]!.choripan).toBe(false);
  });

  it('Conductor designado: no te pueden tirar ni te toca la ronda', () => {
    const s = fixedGame({
      hands: [[...destornillador(), ...filler(5)], filler(8)],
      specials: [['ronda_shots'], []],
      patch: (x) => (x.players[1]!.driver = true),
    });
    const ids = s.players[0]!.hand.slice(0, 4).map((c) => c.id);
    expect(err(applyAction(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: ids, targetId: 'p1' }))).toBe('BAD_TARGET');
    const st = act(s, 'p0', { type: 'PLAY_SPECIAL', specialId: sid(s, 0) }).state;
    expect(st.players.map((p) => p.alcohol)).toEqual([5, 0]);
    // Sin nadie a quién tirarle, se puede cerrar sin jugar.
    const strict = fixedGame({ hands: [filler(8), filler(8)], rules: makeRules(), patch: (x) => (x.players[1]!.driver = true) });
    expect(err(applyAction(strict, 'p0', { type: 'END_TURN', discardIds: [] }))).toBe(null);
  });
});

describe('cambiar cartas', () => {
  it('por 1 punto cambia una carta', () => {
    const hand = filler(9);
    const s = fixedGame({ hands: [hand, filler(8)], patch: (st) => (st.players[0]!.points = 1) });
    const res = act(s, 'p0', { type: 'SWAP', cardId: hand[0]!.id });
    expect(res.state.players[0]!.points).toBe(0);
    expect(res.state.players[0]!.hand).toHaveLength(9);
    expect(res.state.players[0]!.hand.find((c) => c.id === hand[0]!.id)).toBeUndefined();
    expect(err(applyAction(res.state, 'p0', { type: 'SWAP', cardId: hand[1]!.id }))).toBe('NOT_ENOUGH_POINTS');
  });

  it('el shot suma 5% y cambia las que elijas; el segundo del turno pega el doble', () => {
    const hand = filler(9);
    const s = fixedGame({ hands: [hand, filler(8)] });
    const res = act(s, 'p0', { type: 'SHOT', cardIds: hand.slice(0, 6).map((c) => c.id) });
    expect(res.state.players[0]!.alcohol).toBe(5);
    expect(res.state.players[0]!.hand).toHaveLength(9);
    expect(res.state.discard).toHaveLength(6);
    const res2 = act(res.state, 'p0', { type: 'SHOT', cardIds: [res.state.players[0]!.hand[0]!.id] });
    expect(res2.state.players[0]!.alcohol).toBe(15);
  });

  it('cada cambio por punto en el mismo turno cuesta el doble: 1, 2, 4', () => {
    const hand = filler(9);
    const s = fixedGame({ hands: [hand, filler(8)], patch: (st) => (st.players[0]!.points = 7) });
    let st = s;
    for (const expected of [6, 4, 0]) {
      st = act(st, 'p0', { type: 'SWAP', cardId: st.players[0]!.hand[0]!.id }).state;
      expect(st.players[0]!.points).toBe(expected);
    }
    expect(actionCost(st, 'swap')).toBe(8);
  });

  it('el precio vuelve a la base en el turno siguiente', () => {
    const s = fixedGame({ hands: [filler(8), filler(8)], patch: (st) => { st.players[0]!.points = 10; st.players[1]!.points = 10; } });
    let st = act(s, 'p0', { type: 'WATER' }).state;
    expect(actionCost(st, 'water')).toBe(4);
    st = act(st, 'p0', { type: 'END_TURN', discardIds: [] }).state;
    expect(actionCost(st, 'water')).toBe(2);
  });

  it('un shot que te pasa del 100% te hace quebrar', () => {
    const hand = filler(9);
    const s = fixedGame({ players: 3, hands: [hand, filler(8), filler(8)], patch: (st) => (st.players[0]!.alcohol = 98) });
    const res = act(s, 'p0', { type: 'SHOT', cardIds: [hand[0]!.id] });
    expect(res.state.players[0]!.eliminated).toBe(true);
    expect(res.state.players[1]!.id).toBe(res.state.players[res.state.currentIndex]!.id);
  });
});

describe('descarte por coincidencia', () => {
  const table = () => card('Jarra', 'azul', 'estrella', 2);

  it('descarta las que coinciden en número o símbolo y repone', () => {
    const a = card('Vodka', 'verde', 'estrella', 0); // símbolo
    const b = card('Lima', 'bordo', 'rombo', 2); // número
    const hand = [a, b, ...filler(7)];
    const s = fixedGame({ hands: [hand, filler(8)], table: table() });
    const res = act(s, 'p0', { type: 'MATCH_DISCARD', cardIds: [a.id, b.id] });
    const me = res.state.players[0]!;
    expect(me.hand).toHaveLength(9);
    expect(me.hand.find((c) => c.id === a.id)).toBeUndefined();
    expect(res.state.discard[res.state.discard.length - 1]!.id).toBe(b.id);
    expect(me.shame).toBe(0);
  });

  it('una vez por turno', () => {
    const a = card('Vodka', 'verde', 'estrella', 0);
    const hand = [a, ...filler(8)];
    const s = fixedGame({ hands: [hand, filler(8)], table: table() });
    const st = act(s, 'p0', { type: 'MATCH_DISCARD', cardIds: [a.id] }).state;
    expect(err(applyAction(st, 'p0', { type: 'MATCH_DISCARD', cardIds: [st.players[0]!.hand[0]!.id] }))).toBe('LIMIT_REACHED');
  });

  it('si una no coincide: papelón, shot de castigo y se termina tu turno', () => {
    const a = card('Vodka', 'verde', 'estrella', 0);
    const bad = card('Lima', 'verde', 'circulo', 1);
    const hand = [a, bad, ...filler(9)];
    const s = fixedGame({ hands: [hand, filler(8)], table: table() });
    const res = act(s, 'p0', { type: 'MATCH_DISCARD', cardIds: [a.id, bad.id] });
    const me = res.state.players[0]!;
    expect(me.shame).toBe(1);
    expect(me.alcohol).toBe(5);
    expect(me.hand).toHaveLength(8); // las que sobraban se descartaron al azar
    expect(res.events.map((e) => e.type)).toEqual(expect.arrayContaining(['SHAME', 'PENALTY_SHOT', 'TURN_ENDED']));
    expect(res.state.currentIndex).toBe(1);
    expect(res.state.discard[res.state.discard.length - 1]!.name).toBe('Jarra');
  });

  it('el shot de castigo sale al precio del próximo shot del turno', () => {
    const bad = card('Lima', 'verde', 'circulo', 1);
    const hand = [bad, ...filler(8)];
    const s = fixedGame({ hands: [hand, filler(8)], table: table() });
    const st = act(s, 'p0', { type: 'SHOT', cardIds: [hand[1]!.id] }).state;
    const res = act(st, 'p0', { type: 'MATCH_DISCARD', cardIds: [bad.id] });
    expect(res.state.players[0]!.alcohol).toBe(5 + 10);
  });

  it('con 3 papelones perdés por vergüenza', () => {
    const bad = card('Lima', 'verde', 'circulo', 1);
    const s = fixedGame({
      players: 3,
      hands: [[bad, ...filler(8)], filler(8), filler(8)],
      table: table(),
      patch: (st) => (st.players[0]!.shame = 2),
    });
    const res = act(s, 'p0', { type: 'MATCH_DISCARD', cardIds: [bad.id] });
    const me = res.state.players[0]!;
    expect(me.eliminated).toBe(true);
    expect(me.outReason).toBe('verguenza');
    expect(res.events.map((e) => e.type)).toContain('PLAYER_SHAMED');
    expect(res.state.players[res.state.currentIndex]!.id).toBe('p1');
    // Sus cartas van abajo: la carta de la mesa no cambia.
    expect(res.state.discard[res.state.discard.length - 1]!.name).toBe('Jarra');
  });

  it('sin carta en la mesa no se puede', () => {
    const s = fixedGame({ hands: [filler(9), filler(8)] });
    expect(err(applyAction(s, 'p0', { type: 'MATCH_DISCARD', cardIds: [s.players[0]!.hand[0]!.id] }))).toBe('NO_TABLE_CARD');
  });
});

describe('cerrar el turno', () => {
  it('hay que descartar justo hasta quedar con 8', () => {
    const hand = filler(10);
    const s = fixedGame({ hands: [hand, filler(8)] });
    expect(err(applyAction(s, 'p0', { type: 'END_TURN', discardIds: [hand[0]!.id] }))).toBe('BAD_DISCARD_COUNT');
    const res = act(s, 'p0', { type: 'END_TURN', discardIds: [hand[0]!.id, hand[1]!.id] });
    expect(res.state.players[0]!.hand).toHaveLength(8);
    expect(res.state.currentIndex).toBe(1);
    expect(res.state.players[1]!.hand).toHaveLength(11); // robó 3
  });

  it('no podés cerrar el turno sin jugar algo', () => {
    const a = card('Vodka', 'verde', 'estrella', 0);
    const hand = [a, ...filler(8)];
    const s = fixedGame({ hands: [hand, filler(8)], table: card('Jarra', 'azul', 'estrella', 2), rules: makeRules() });
    expect(err(applyAction(s, 'p0', { type: 'END_TURN', discardIds: [hand[1]!.id] }))).toBe('MUST_PLAY');
    const st = act(s, 'p0', { type: 'MATCH_DISCARD', cardIds: [a.id] }).state;
    expect(act(st, 'p0', { type: 'END_TURN', discardIds: [st.players[0]!.hand[0]!.id] }).state.currentIndex).toBe(1);
  });

  it('un cóctel bien lanzado también cuenta como jugar; uno mal armado no', () => {
    const good = [...destornillador(), ...filler(5)];
    let st = fixedGame({ hands: [good, filler(8)], rules: makeRules() });
    st = act(st, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: good.slice(0, 4).map((c) => c.id), targetId: 'p1' }).state;
    expect(act(st, 'p0', { type: 'END_TURN', discardIds: [st.players[0]!.hand[0]!.id] }).ok).toBe(true);

    const bad = [card('Vodka'), card('Lima'), card('Vaso highball'), card('Construir'), ...filler(5)];
    let st2 = fixedGame({ hands: [bad, filler(8)], rules: makeRules() });
    st2 = act(st2, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: bad.slice(0, 4).map((c) => c.id), targetId: 'p1' }).state;
    expect(err(applyAction(st2, 'p0', { type: 'END_TURN', discardIds: [st2.players[0]!.hand[0]!.id] }))).toBe('MUST_PLAY');
  });

  it('no es tu turno', () => {
    const s = fixedGame({ hands: [filler(9), filler(8)] });
    expect(err(applyAction(s, 'p1', { type: 'END_TURN', discardIds: [] }))).toBe('NOT_YOUR_TURN');
  });

  it('el café dura este turno y los dos siguientes', () => {
    const s = fixedGame({ hands: [filler(8), filler(8)], patch: (st) => (st.players[0]!.points = 3) });
    let st = act(s, 'p0', { type: 'COFFEE' }).state;
    expect(st.players[0]!.coffeeTurnsLeft).toBe(3);
    st = act(st, 'p0', { type: 'END_TURN', discardIds: [] }).state;
    expect(st.players[0]!.coffeeTurnsLeft).toBe(2);
  });

  it('el vaso de agua baja 10% sin pasar de 0', () => {
    const s = fixedGame({ hands: [filler(8), filler(8)], patch: (st) => { st.players[0]!.points = 4; st.players[0]!.alcohol = 6; } });
    const res = act(s, 'p0', { type: 'WATER' });
    expect(res.state.players[0]!.alcohol).toBe(0);
    expect(res.state.players[0]!.points).toBe(2);
  });
});

describe('quiebra y ganador', () => {
  const throwAt = (alcohol: number, players = 2) => {
    const hand = [...destornillador(), ...filler(5)];
    const hands = [hand, ...Array.from({ length: players - 1 }, () => filler(8))];
    const s = fixedGame({ hands, patch: (st) => (st.players[1]!.alcohol = alcohol) });
    return act(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1' });
  };

  it('justo 100% no quiebra', () => {
    const res = throwAt(85);
    expect(res.state.players[1]!.eliminated).toBe(false);
    expect(res.state.phase).toBe('main');
  });

  it('pasar del 100% quiebra; si queda uno, gana', () => {
    const res = throwAt(86);
    expect(res.state.players[1]!.eliminated).toBe(true);
    expect(res.state.players[1]!.hand).toHaveLength(0);
    expect(res.state.phase).toBe('finished');
    expect(res.state.winnerId).toBe('p0');
    expect(err(applyAction(res.state, 'p0', { type: 'WATER' }))).toBe('GAME_OVER');
  });

  it('con más jugadores la partida sigue y el quebrado no juega más', () => {
    const res = throwAt(95, 3);
    expect(res.state.phase).toBe('main');
    const st = act(res.state, 'p0', { type: 'END_TURN', discardIds: [res.state.players[0]!.hand[0]!.id] }).state;
    expect(st.players[st.currentIndex]!.id).toBe('p2');
  });

  it('si te devuelven el trago y quebrás en tu turno, pasa el turno', () => {
    const hand = [...destornillador(), ...filler(5)];
    const s = fixedGame({
      hands: [hand, filler(8), filler(8)],
      specials: [[], ['tomatelo_vos']],
      patch: (st) => { st.players[0]!.alcohol = 95; },
    });
    let st = act(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1' }).state;
    st = act(st, 'p1', { type: 'RESPOND', choice: 'special', specialId: st.players[1]!.specials[0]!.id }).state;
    expect(st.players[0]!.eliminated).toBe(true);
    expect(st.players[st.currentIndex]!.id).toBe('p1');
    expect(st.phase).toBe('main');
  });

  it('no toca el estado que recibe', () => {
    const s = fixedGame({ hands: [filler(9), filler(8)] });
    const copy = structuredClone(s);
    act(s, 'p0', { type: 'SHOT', cardIds: [s.players[0]!.hand[0]!.id] });
    expect(s).toEqual(copy);
  });
});

describe('irse de la partida', () => {
  it('si se va el del turno, pasa al siguiente y queda afuera por abandono', () => {
    const s = fixedGame({ hands: [filler(9), filler(8), filler(8)] });
    const res = removePlayer(s, 'p0');
    if (!res.ok) throw new Error(res.error);
    expect(res.state.players[0]).toMatchObject({ eliminated: true, outReason: 'abandono', hand: [] });
    expect(res.state.players[res.state.currentIndex]!.id).toBe('p1');
    expect(res.events.map((e) => e.type)).toContain('PLAYER_LEFT');
  });

  it('si se va al que le estaban tirando, el cóctel sigue con el próximo o se cierra', () => {
    const hand = [...destornillador(), ...filler(5)];
    const s = fixedGame({ hands: [hand, filler(8), filler(8)], specials: [[], ['mani'], []] });
    const thrown = act(s, 'p0', { type: 'MAKE_COCKTAIL', cocktailCode: 'C01', cardIds: hand.slice(0, 4).map((c) => c.id), targetId: 'p1' }).state;
    expect(thrown.phase).toBe('defense');
    const res = removePlayer(thrown, 'p1');
    if (!res.ok) throw new Error(res.error);
    expect(res.state.phase).toBe('main');
    expect(res.state.pending).toBeNull();
    expect(res.state.players[0]!.points).toBe(0);
  });

  it('con dos jugadores, el que queda gana', () => {
    const res = removePlayer(fixedGame({ hands: [filler(9), filler(8)] }), 'p1');
    if (!res.ok) throw new Error(res.error);
    expect(res.state.winnerId).toBe('p0');
    expect(res.state.phase).toBe('finished');
  });
});

describe('pedir ingrediente', () => {
  const ask = (cardIds: string[], names: string[]): Action => ({ type: 'ASK_INGREDIENT', cardIds, names });

  it('3 de una categoría y distinto color: 1 que elegís y 2 al azar', () => {
    const give = [card('Vodka', 'verde'), card('Gin', 'bordo'), card('Sal', 'verde')];
    const want = card('Fernet');
    const s = fixedGame({ hands: [[...give, ...filler(5)], filler(8)], deck: [want, ...filler(10)], table: card('Jarra') });
    const res = act(s, 'p0', ask(give.map((c) => c.id), ['Fernet']));
    const me = res.state.players[0]!;
    expect(me.hand).toHaveLength(8);
    expect(me.hand.some((c) => c.id === want.id)).toBe(true);
    expect(give.every((c) => !me.hand.includes(c))).toBe(true);
    expect(res.state.discard.slice(-3).map((c) => c.id)).toEqual(give.map((c) => c.id));
    expect(res.state.deck.some((c) => c.id === want.id)).toBe(false);
    expect(res.state.playedThisTurn).toBe(0); // no cuenta como jugada
  });

  it('distinto color: no se pueden elegir 2', () => {
    const give = [card('Vodka', 'verde'), card('Gin', 'bordo'), card('Sal', 'verde')];
    const s = fixedGame({ hands: [[...give, ...filler(5)], filler(8)], deck: [card('Fernet'), card('Coca'), ...filler(5)] });
    expect(err(applyAction(s, 'p0', ask(give.map((c) => c.id), ['Fernet', 'Coca'])))).toBe('BAD_ASK');
  });

  it('mismo color: 2 que elegís y 1 al azar', () => {
    const give = [card('Vodka', 'azul'), card('Gin', 'azul'), card('Sal', 'azul')];
    const a = card('Fernet');
    const b = card('Coca');
    const s = fixedGame({ hands: [[...give, ...filler(5)], filler(8)], deck: [a, ...filler(5), b, ...filler(5)], table: card('Jarra') });
    const res = act(s, 'p0', ask(give.map((c) => c.id), ['Fernet', 'Coca']));
    const me = res.state.players[0]!;
    expect(me.hand).toHaveLength(8);
    expect(me.hand.some((c) => c.id === a.id) && me.hand.some((c) => c.id === b.id)).toBe(true);
    expect(res.events.find((e) => e.type === 'INGREDIENT_ASKED')).toMatchObject({ sameColor: true, names: ['Fernet', 'Coca'] });
  });

  it('tienen que ser 3 de la misma categoría, y lo que pedís también', () => {
    const mixed = [card('Vodka'), card('Gin'), card('Coctelera')];
    const s = fixedGame({ hands: [[...mixed, ...filler(5)], filler(8)], deck: [card('Fernet'), ...filler(5)] });
    expect(err(applyAction(s, 'p0', ask(mixed.map((c) => c.id), ['Fernet'])))).toBe('BAD_ASK');
    const two = mixed.slice(0, 2).map((c) => c.id);
    expect(err(applyAction(s, 'p0', ask(two, ['Fernet'])))).toBe('BAD_ASK');
    const ok3 = [card('Vodka'), card('Gin'), card('Sal')];
    const s2 = fixedGame({ hands: [[...ok3, ...filler(5)], filler(8)], deck: [card('Coctelera'), ...filler(5)] });
    expect(err(applyAction(s2, 'p0', ask(ok3.map((c) => c.id), ['Coctelera'])))).toBe('BAD_ASK');
  });

  it('si no queda en el mazo se busca en el descarte; si no hay, no se puede', () => {
    const give = [card('Vodka', 'verde'), card('Gin', 'bordo'), card('Sal', 'verde')];
    const old = card('Fernet');
    const table = card('Jarra');
    const s = fixedGame({ hands: [[...give, ...filler(5)], filler(8)], deck: filler(10), table, patch: (st) => st.discard.unshift(old) });
    const res = act(s, 'p0', ask(give.map((c) => c.id), ['Fernet']));
    expect(res.state.players[0]!.hand.some((c) => c.id === old.id)).toBe(true);
    expect(err(applyAction(s, 'p0', ask(give.map((c) => c.id), ['Coca'])))).toBe('NOT_AVAILABLE');
    // La carta de la mesa no se puede pedir.
    const s2 = fixedGame({ hands: [[...give, ...filler(5)], filler(8)], deck: filler(10), table: card('Fernet') });
    expect(err(applyAction(s2, 'p0', ask(give.map((c) => c.id), ['Fernet'])))).toBe('NOT_AVAILABLE');
  });

  it('una vez por turno', () => {
    const give = [card('Vodka', 'verde'), card('Gin', 'bordo'), card('Sal', 'verde')];
    const more = [card('Lima', 'verde'), card('Pisco', 'bordo'), card('Coca', 'verde')];
    const s = fixedGame({ hands: [[...give, ...more, ...filler(2)], filler(8)], deck: [card('Fernet'), card('Fernet'), ...filler(10)] });
    const st = act(s, 'p0', ask(give.map((c) => c.id), ['Fernet'])).state;
    expect(err(applyAction(st, 'p0', ask(more.map((c) => c.id), ['Fernet'])))).toBe('LIMIT_REACHED');
  });
});
