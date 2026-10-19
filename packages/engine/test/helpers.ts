import { CARD_DEFS, type Card, type CardSymbol, type Color, type CardNumber } from '../src/cards.js';
import { createGame } from '../src/engine.js';
import { makeRules, type RulesConfig } from '../src/rules.js';
import { SPECIAL_BY_CODE, type SpecialCard, type SpecialCode } from '../src/specials.js';
import type { GameState } from '../src/state.js';

let n = 0;

/** Una carta armada a mano para las pruebas. */
export function card(name: string, color: Color = 'verde', symbol: CardSymbol = 'circulo', number: CardNumber = 1): Card {
  const def = CARD_DEFS.find((d) => d.name === name);
  if (!def) throw new Error(`No existe la carta ${name}`);
  return { id: `t${++n}`, defCode: def.code, name, category: def.category, color, symbol, number };
}

/** Una carta especial armada a mano. */
export function special(code: SpecialCode): SpecialCard {
  const d = SPECIAL_BY_CODE.get(code)!;
  return { id: `sp${++n}`, code, name: d.name, kind: d.kind, rarity: d.rarity };
}

/** Un relleno neutro: no entra en ninguna receta. */
export function filler(count: number): Card[] {
  return Array.from({ length: count }, () => card('Bota de vidrio', 'azul', 'rombo', 0));
}

/**
 * Partida con manos y mazo fijos. Le toca a p0, que ya robó (el mazo se arma con lo que se pase).
 * Sin ruido: las manos arrancan con lo que diga la prueba.
 */
export function fixedGame(opts: {
  players?: number;
  hands: Card[][];
  /** Manos especiales (por defecto, vacías). */
  specials?: SpecialCode[][];
  deck?: Card[];
  /** La carta de la mesa (arriba del descarte). */
  table?: Card;
  rules?: RulesConfig;
  patch?: (s: GameState) => void;
}): GameState {
  const players = Array.from({ length: opts.players ?? opts.hands.length }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));
  // Por defecto sin "jugar sí o sí", así las pruebas pueden cerrar turnos vacíos; las de esa regla la prenden.
  const { state } = createGame({ players, seed: 1, rules: opts.rules ?? makeRules({ mustPlay: false }) });
  state.currentIndex = 0;
  state.turn = 1;
  state.discard = opts.table ? [opts.table] : [];
  state.players.forEach((p, i) => (p.hand = opts.hands[i] ?? []));
  state.specialDeck.push(...state.players.flatMap((p) => p.specials));
  state.players.forEach((p, i) => (p.specials = (opts.specials?.[i] ?? []).map(special)));
  state.deck = opts.deck ?? filler(40);
  state.totalCards = state.deck.length + state.discard.length + state.players.reduce((k, p) => k + p.hand.length, 0);
  opts.patch?.(state);
  return state;
}
