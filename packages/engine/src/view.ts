// Lo que ve cada jugador. El servidor nunca manda el estado entero: manda esto.
// Lo que un jugador borracho no puede ver directamente no viaja, así no hay trampa posible mirando la página.

import { COCKTAILS, COLORS, type Card, type CardSymbol, type Category, type Color, type CardNumber } from './cards.js';
import { actionCost, type GameEvent } from './engine.js';
import { hashString, mulberry32, shuffleInPlace } from './rng.js';
import { drunkLevel, type DrunkLevel } from './rules.js';
import { bestCocktailOptions, type CocktailOption } from './scoring.js';
import { SPECIAL_BY_CODE, type SpecialCard } from './specials.js';
import type { GameState, OutReason, PaidAction, PlayerState } from './state.js';

export interface HandCardView {
  /** Identificador que cambia cada turno y con cada cambio de alcohol: no sirve para recordar cartas. */
  handle: string;
  category: Category;
  name: string;
  art: 'clear' | 'blurred';
  /** Uno solo, o dos en visión doble (uno es el verdadero). */
  colors: Color[];
  /** null cuando ya no lo ves (al borde). */
  symbol: CardSymbol | null;
  /** null cuando ya no lo ves. */
  number: CardNumber | null;
}

/**
 * El recetario de costado, según lo que ve el jugador:
 * - 'completo' (sobrio o alegre): se lee entero y marca qué cócteles podés armar, con qué cartas y cuánto pagan.
 * - 'solo_nombres' (mareado): se lee, pero solo te dice el nombre de los que podés armar.
 * - 'ilegible' (en pedo o al borde): no se puede leer y no te avisa nada.
 * Las recetas en sí son públicas: el cliente las tiene en su catálogo y las borronea cuando es 'ilegible'.
 */
export type RecipeBookView =
  | { mode: 'completo'; canMake: (Omit<CocktailOption, 'cardIds'> & { handles: string[] })[] }
  | { mode: 'solo_nombres'; canMake: { cocktailCode: string }[] }
  | { mode: 'ilegible' };

export interface PlayerView {
  you: {
    id: string;
    alcohol: number;
    points: number;
    level: DrunkLevel;
    /** El nivel con el que ves tus cartas (el café lo baja). */
    seeingLevel: DrunkLevel;
    coffeeTurnsLeft: number;
    eliminated: boolean;
    hand: HandCardView[];
    /** Solo sobrio: qué cócteles podés armar y cuántos puntos darían. */
    recipeBook: RecipeBookView;
    /** Lo que cuesta ahora cada cosa (sube al doble con cada uso en el turno). El shot, en % de alcohol. */
    costs: Record<PaidAction, number>;
    /** Todavía no jugaste nada este turno: no podés cerrarlo. */
    mustPlay: boolean;
    /** Tu mano especial. Se lee siempre, por más borracho que estés. */
    specials: (SpecialCard & { text: string })[];
  };
  players: {
    id: string;
    name: string;
    alcohol: number;
    points: number;
    handCount: number;
    shame: number;
    eliminated: boolean;
    outReason: OutReason | null;
    /** Cuántas especiales tiene (cuáles, no se ve). */
    specialCount: number;
    /** Lo que está a la vista en su lugar de la mesa: comida y conductor designado. */
    foodHalves: number;
    choripan: boolean;
    driver: boolean;
  }[];
  currentPlayerId: string;
  phase: GameState['phase'];
  pending: GameState['pending'];
  turn: number;
  deckCount: number;
  specialDeckCount: number;
  /** La carta de la mesa, vista con los ojos del jugador (borrosa si está borracho). */
  tableCard: Omit<HandCardView, 'handle'> | null;
  discardCount: number;
  winnerId: string | null;
  barMax: number;
}

export function seeingAlcohol(state: GameState, p: PlayerState): number {
  return p.coffeeTurnsLeft > 0 ? Math.max(0, p.alcohol - state.rules.coffeeReduction) : p.alcohol;
}

export function handleFor(state: GameState, viewer: PlayerState, cardId: string): string {
  return 'h' + hashString(`${state.viewSalt}|${viewer.id}|${state.turn}|${viewer.alcohol}|${viewer.coffeeTurnsLeft}|${cardId}`).toString(36);
}

/** El servidor traduce los handles que manda el celular a ids reales antes de llamar al motor. */
export function resolveHandles(state: GameState, viewerId: string, handles: string[]): string[] | null {
  const viewer = state.players.find((p) => p.id === viewerId);
  if (!viewer) return null;
  const map = new Map(viewer.hand.map((c) => [handleFor(state, viewer, c.id), c.id]));
  const ids = handles.map((h) => map.get(h));
  return ids.every((id): id is string => id !== undefined) ? ids : null;
}

export function playerView(state: GameState, viewerId: string): PlayerView {
  const viewer = state.players.find((p) => p.id === viewerId);
  if (!viewer) throw new Error('Jugador desconocido');
  const level = drunkLevel(viewer.alcohol, state.rules.barMax);
  const seeingLevel = drunkLevel(seeingAlcohol(state, viewer), state.rules.barMax);
  const seed = hashString(`${state.viewSalt}|${viewer.id}|${state.turn}`);

  let hand = viewer.hand.map((c) => viewCard(state, viewer, c, seeingLevel));
  if (seeingLevel === 'en_pedo' || seeingLevel === 'al_borde') {
    hand = shuffleInPlace(hand, mulberry32(seed));
  }

  const recipeBook = recipeBookFor(state, viewer, seeingLevel);

  return {
    you: {
      id: viewer.id,
      alcohol: viewer.alcohol,
      points: viewer.points,
      level,
      seeingLevel,
      coffeeTurnsLeft: viewer.coffeeTurnsLeft,
      eliminated: viewer.eliminated,
      hand,
      recipeBook,
      costs: costsFor(state, viewer),
      mustPlay: state.rules.mustPlay && state.playedThisTurn === 0 && state.players[state.currentIndex]!.id === viewer.id,
      specials: viewer.specials.map((sp) => ({ ...sp, text: SPECIAL_BY_CODE.get(sp.code)!.text })),
    },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      alcohol: p.alcohol,
      points: p.points,
      handCount: p.hand.length,
      shame: p.shame,
      eliminated: p.eliminated,
      outReason: p.outReason,
      specialCount: p.specials.length,
      foodHalves: p.foodHalves,
      choripan: p.choripan,
      driver: p.driver,
    })),
    currentPlayerId: state.players[state.currentIndex]!.id,
    phase: state.phase,
    pending: state.pending,
    turn: state.turn,
    deckCount: state.deck.length,
    specialDeckCount: state.specialDeck.length,
    tableCard: tableCardView(state, viewer, seeingLevel),
    discardCount: state.discard.length,
    winnerId: state.winnerId,
    barMax: state.rules.barMax,
  };
}

function recipeBookFor(state: GameState, viewer: PlayerState, level: DrunkLevel): RecipeBookView {
  if (level === 'en_pedo' || level === 'al_borde') return { mode: 'ilegible' };
  const options = bestCocktailOptions(viewer.hand, COCKTAILS, state.rules.bonus, state.rules.recipeMode);
  if (level === 'mareado') return { mode: 'solo_nombres', canMake: options.map((o) => ({ cocktailCode: o.cocktailCode })) };
  return {
    mode: 'completo',
    canMake: options.map(({ cardIds, ...rest }) => ({ ...rest, handles: cardIds.map((id) => handleFor(state, viewer, id)) })),
  };
}

function costsFor(state: GameState, viewer: PlayerState): Record<PaidAction, number> {
  const kinds: PaidAction[] = ['swap', 'shot', 'water', 'coffee', 'buy'];
  const isCurrent = state.players[state.currentIndex]!.id === viewer.id;
  // Fuera de tu turno ves lo que te va a costar cuando te toque (los usos se reinician cada turno).
  const fresh = { ...state, usesThisTurn: { swap: 0, shot: 0, water: 0, coffee: 0, buy: 0 } };
  return Object.fromEntries(kinds.map((k) => [k, actionCost(isCurrent ? state : fresh, k)])) as Record<PaidAction, number>;
}

function tableCardView(state: GameState, viewer: PlayerState, level: DrunkLevel): Omit<HandCardView, 'handle'> | null {
  const top = state.discard[state.discard.length - 1];
  if (!top) return null;
  const { handle: _handle, ...rest } = viewCard(state, viewer, top, level, `mesa|${top.id}`);
  return rest;
}

function viewCard(state: GameState, viewer: PlayerState, card: Card, level: DrunkLevel, handleSeed?: string): HandCardView {
  const handle = handleFor(state, viewer, handleSeed ?? card.id);
  const rand = mulberry32(hashString(`${state.viewSalt}|${handle}`));
  const v: HandCardView = {
    handle,
    category: card.category,
    name: card.name,
    art: level === 'sobrio' ? 'clear' : 'blurred',
    colors: [card.color],
    symbol: card.symbol,
    number: card.number,
  };
  if (level === 'mareado' || level === 'en_pedo' || level === 'al_borde') v.name = scramble(card.name, rand);
  if (level === 'en_pedo' || level === 'al_borde') v.number = null;
  if (level === 'al_borde') {
    v.colors = doubleVision(card.color, COLORS, rand);
    v.symbol = null;
  }
  return v;
}

function doubleVision<T>(real: T, all: readonly T[], rand: () => number): T[] {
  const others = all.filter((x) => x !== real);
  const fake = others[Math.floor(rand() * others.length)]!;
  return rand() < 0.5 ? [real, fake] : [fake, real];
}

/** "Vodka" → "Vdoak": deja la primera letra de cada palabra y mezcla el resto. */
export function scramble(name: string, rand: () => number): string {
  return name
    .split(' ')
    .map((word) => {
      if (word.length < 4) return word;
      const rest = word.slice(1).split('');
      for (let tries = 0; tries < 5; tries++) {
        shuffleInPlace(rest, rand);
        if (rest.join('') !== word.slice(1)) break;
      }
      return word[0] + rest.join('');
    })
    .join(' ');
}

/** Los eventos tal como los ve cada jugador: las cartas que roban o compran los otros no se ven. */
export function eventsForViewer(state: GameState, viewerId: string, events: GameEvent[]): GameEvent[] {
  const viewer = state.players.find((p) => p.id === viewerId);
  return events.map((e) => {
    if (e.type === 'SPECIAL_BOUGHT') return e.playerId === viewerId ? e : { ...e, special: null };
    if (e.type !== 'CARDS_DRAWN') return e;
    if (e.playerId !== viewerId || !viewer) return { ...e, cardIds: e.cardIds.map(() => '?') };
    return { ...e, cardIds: e.cardIds.map((id) => handleFor(state, viewer, id)) };
  });
}
