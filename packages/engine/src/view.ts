/**
 * Lo que ve cada jugador: sus cartas todas; de los demás, las que están a la vista (y las ocultas que
 * espió). Nunca sale el mazo, el azar ni la carta oculta de otro.
 */
import type { Card } from './cards.js';
import { handTotal, playerTotal, type GameEvent } from './engine.js';
import type { ChoiceOption, GameState, HandCard, Phase, PlayerState, RoundResult, SeatStatus } from './state.js';

export interface ViewCard {
  /** null si está boca abajo y no la podés ver. */
  readonly card: Card | null;
  readonly hidden: boolean;
}

export interface SeatView {
  readonly id: string;
  readonly name: string;
  readonly chips: number;
  readonly status: SeatStatus;
  readonly outReason: PlayerState['outReason'];
  readonly cards: readonly ViewCard[];
  /** El total si ves todas sus cartas; si no, lo que suma lo que se ve. */
  readonly total: number;
  readonly totalKnown: boolean;
  readonly blankets: number;
  readonly shield: boolean;
  readonly maxHits: number | null;
  readonly cursed: boolean;
  readonly loan: boolean;
  readonly partnerId: string | null;
}

export interface PendingView {
  readonly sourceId: string;
  readonly effectId: string;
  readonly prompt: string;
  readonly options: readonly ChoiceOption[];
}

export interface PlayerView {
  readonly me: string;
  readonly round: number;
  readonly rounds: number;
  readonly phase: Phase;
  readonly pot: number;
  readonly ante: number;
  readonly currentId: string | null;
  readonly order: readonly string[];
  readonly players: readonly SeatView[];
  /** La elección que tenés que hacer vos (solo la ve el que elige). */
  readonly pending: PendingView | null;
  /** Quién está eligiendo y por qué carta (para los demás). */
  readonly choosing: { readonly playerId: string; readonly sourceId: string } | null;
  readonly deckCount: number;
  readonly discardTop: Card | null;
  readonly results: readonly RoundResult[] | null;
  readonly winnerId: string | null;
  readonly log: readonly string[];
}

function sees(viewerId: string, owner: PlayerState, h: HandCard): boolean {
  return owner.id === viewerId || !h.hidden || h.revealed || h.seenBy.includes(viewerId);
}

export function playerView(s: GameState, viewerId: string): PlayerView {
  const players = s.players.map((p): SeatView => {
    const cards = p.cards.map((h) => ({ card: sees(viewerId, p, h) ? h.card : null, hidden: h.hidden && !h.revealed }));
    const known = cards.every((c) => c.card !== null);
    const visible = cards.flatMap((c) => (c.card ? [c.card] : []));
    return {
      id: p.id,
      name: p.name,
      chips: p.chips,
      status: p.status,
      outReason: p.outReason,
      cards,
      total: known ? playerTotal(p) : handTotal(visible),
      totalKnown: known,
      blankets: p.blankets,
      shield: p.shield,
      maxHits: p.maxHits,
      cursed: p.cursed,
      loan: p.loan,
      partnerId: p.partnerId,
    };
  });
  const pending = s.pending;
  return {
    me: viewerId,
    round: s.round,
    rounds: s.rules.rounds,
    phase: s.phase,
    pot: s.pot,
    ante: s.rules.ante,
    currentId: s.currentId,
    order: s.order,
    players,
    pending: pending && pending.playerId === viewerId ? { sourceId: pending.sourceId, effectId: pending.effectId, prompt: pending.prompt, options: pending.options } : null,
    choosing: pending ? { playerId: pending.playerId, sourceId: pending.sourceId } : null,
    deckCount: s.deck.length,
    discardTop: s.discard[s.discard.length - 1] ?? null,
    results: s.results,
    winnerId: s.winnerId,
    log: s.log.slice(-12),
  };
}

/** Los eventos como los ve cada uno: la carta oculta de otro y lo que espió otro no viajan. */
export function eventsForViewer(_s: GameState, viewerId: string, events: readonly GameEvent[]): GameEvent[] {
  return events.flatMap((e): GameEvent[] => {
    if (e.type === 'PEEK') return e.playerId === viewerId ? [e] : [];
    // La primera del reparto es la oculta.
    if (e.type === 'DEALT' && e.playerId !== viewerId) return [{ ...e, cards: e.cards.map((c, i) => (i === 0 ? null : c)) }];
    return [e];
  });
}
