import { parseCardId, type Card } from '../src/cards.js';
import { applyAction, createGame, type Action, type GameEvent } from '../src/engine.js';
import { makeRules, type GameState, type Rules } from '../src/state.js';

export function c(id: string): Card {
  const card = parseCardId(id);
  if (!card) throw new Error(`Carta inválida ${id}`);
  return card;
}

/**
 * Partida fijada: cada jugador con las cartas que se digan (la primera es la oculta) y el mazo con
 * las de `top` arriba (la primera es la próxima que sale). Le toca a p0.
 */
export function fixedGame(opts: { hands: string[][]; top?: string[]; rules?: Partial<Rules>; chips?: number[] }): GameState {
  const players = opts.hands.map((_, i) => ({ id: `p${i}`, name: `J${i}` }));
  const { state } = createGame({ players, seed: 7, rules: makeRules(opts.rules) });
  const used = new Set([...opts.hands.flat(), ...(opts.top ?? [])]);
  const all = [...state.deck, ...state.players.flatMap((p) => p.cards.map((h) => h.card))].filter((card) => !used.has(card.id));
  state.players.forEach((p, i) => {
    p.cards = opts.hands[i]!.map((id, j) => ({ card: c(id), hidden: j === 0, revealed: false, seenBy: [] }));
    p.status = i === 0 ? 'playing' : 'waiting';
    p.announced21 = false;
    if (opts.chips?.[i] !== undefined) p.chips = opts.chips[i]!;
    p.chipsAtStart = p.chips;
  });
  state.deck = [...all, ...[...(opts.top ?? [])].reverse().map(c)];
  state.discard = [];
  state.order = players.map((p) => p.id);
  state.currentId = 'p0';
  state.pending = null;
  state.phase = 'playing';
  return state;
}

export function act(state: GameState, playerId: string, action: Action): { state: GameState; events: GameEvent[] } {
  const r = applyAction(state, playerId, action);
  if (!r.ok) throw new Error(`Jugada rechazada: ${r.error}`);
  return { state: r.state, events: r.events };
}

export function p(state: GameState, id: string) {
  return state.players.find((x) => x.id === id)!;
}

export function ids(state: GameState, id: string): string[] {
  return p(state, id).cards.map((h) => h.card.id);
}
