// La única puerta de entrada a las reglas: applyAction(estado, jugador, acción).
// No modifica el estado que recibe; devuelve uno nuevo y los eventos de lo que pasó.

import { CARD_DEFS, COCKTAIL_BY_CODE, PRINTED_DECK, copiesFor, type Card } from './cards.js';
import { mulberry32, shuffleInPlace } from './rng.js';
import { DEFAULT_RULES, type RulesConfig } from './rules.js';
import { cocktailAlcohol, matchesRecipe, scoreCocktail, type PointsBreakdown } from './scoring.js';
import { printedSpecials, type SpecialCard, type SpecialCode } from './specials.js';
import type { GameState, OutReason, PaidAction, PlayerState } from './state.js';

export type Action =
  | { type: 'SWAP'; cardId: string }
  | { type: 'SHOT'; cardIds: string[] }
  | { type: 'MATCH_DISCARD'; cardIds: string[] }
  /** Pedir ingrediente: 3 cartas de una categoría por las que elegís de esa categoría (names) y el resto al azar. */
  | { type: 'ASK_INGREDIENT'; cardIds: string[]; names: string[] }
  /** specialIds: cartas especiales de cóctel que se le suman (Semana difícil, Jarra grande). */
  | { type: 'MAKE_COCKTAIL'; cocktailCode: string; cardIds: string[]; targetId: string; specialIds?: string[] }
  | { type: 'WATER' }
  | { type: 'COFFEE' }
  | { type: 'BUY_SPECIAL' }
  | { type: 'PLAY_SPECIAL'; specialId: string }
  | { type: 'END_TURN'; discardIds: string[] }
  | RespondAction;

/** Cuando te tiran un cóctel: te lo tomás, o le respondés con una carta especial de respuesta. */
export type RespondAction =
  | { type: 'RESPOND'; choice: 'drink' }
  | {
      type: 'RESPOND';
      choice: 'special';
      specialId: string;
      /** Solo "¡Probá el mío!": el cóctel de tu mano que le tirás de vuelta. */
      counter?: { cocktailCode: string; cardIds: string[] };
    };

export type GameEvent =
  | { type: 'TURN_STARTED'; playerId: string; turn: number }
  | { type: 'CARDS_DRAWN'; playerId: string; cardIds: string[] }
  | { type: 'DECK_RESHUFFLED'; count: number }
  | { type: 'CARD_SWAPPED'; playerId: string; discarded: Card }
  | { type: 'SHOT_TAKEN'; playerId: string; count: number; alcohol: number }
  | { type: 'COCKTAIL_MADE'; playerId: string; targetId: string; cocktailCode: string; cards: Card[]; points: PointsBreakdown; alcohol: number }
  | { type: 'COCKTAIL_FAILED'; playerId: string; cocktailCode: string; cards: Card[]; alcohol: number }
  | { type: 'DEFENSE_OFFERED'; targetId: string; fromId: string; cocktailCode: string }
  /** halved: la comida le bajó la mitad. */
  | { type: 'COCKTAIL_DRUNK'; drinkerId: string; fromId: string; cocktailCode: string; alcohol: number; halved: boolean }
  | { type: 'COCKTAIL_REFUSED'; targetId: string; fromId: string; cocktailCode: string }
  | { type: 'COCKTAIL_PASSED'; fromId: string; toId: string; cocktailCode: string; alcohol: number }
  /** special es null para los que no son el comprador (lo arma eventsForViewer). */
  | { type: 'SPECIAL_BOUGHT'; playerId: string; cost: number; special: SpecialCard | null }
  | { type: 'SPECIAL_PLAYED'; playerId: string; special: SpecialCard }
  | { type: 'SPECIAL_DECK_RESHUFFLED'; count: number }
  | { type: 'SHOT_ROUND'; playerId: string; drinks: { playerId: string; alcohol: number }[] }
  | { type: 'POINTS_EARNED'; playerId: string; points: number }
  | { type: 'WATER_DRUNK'; playerId: string; alcohol: number }
  | { type: 'COFFEE_DRUNK'; playerId: string }
  | { type: 'PLAYER_BROKE'; playerId: string; alcohol: number }
  | { type: 'TURN_ENDED'; playerId: string; discarded: Card[] }
  | { type: 'PENALTY_SHOT'; playerId: string; alcohol: number }
  | { type: 'MATCH_DISCARDED'; playerId: string; cards: Card[]; tableCard: Card }
  /** names: lo que pidió (lo escucha toda la mesa); lo que le toca al azar llega en CARDS_DRAWN. */
  | { type: 'INGREDIENT_ASKED'; playerId: string; cards: Card[]; names: string[]; sameColor: boolean }
  | { type: 'SHAME'; playerId: string; shame: number; cards: Card[]; tableCard: Card }
  | { type: 'PLAYER_SHAMED'; playerId: string }
  /** Se fue de la sala o lo sacó el anfitrión: queda afuera de la partida. */
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'GAME_WON'; playerId: string };

export type ErrorCode =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'UNKNOWN_PLAYER'
  | 'CARD_NOT_IN_HAND'
  | 'DUPLICATE_CARD'
  | 'NO_CARDS'
  | 'NOT_ENOUGH_POINTS'
  | 'LIMIT_REACHED'
  | 'BAD_TARGET'
  | 'UNKNOWN_COCKTAIL'
  | 'BAD_DISCARD_COUNT'
  | 'NO_TABLE_CARD'
  | 'MUST_PLAY'
  | 'SPECIAL_NOT_IN_HAND'
  | 'WRONG_SPECIAL'
  | 'SPECIAL_HAND_FULL'
  | 'NO_SPECIALS_LEFT'
  | 'BAD_ASK'
  | 'NOT_AVAILABLE';

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ErrorCode };

export interface NewGameOptions {
  players: { id: string; name: string }[];
  seed: number;
  rules?: RulesConfig;
}

export function createGame({ players, seed, rules = DEFAULT_RULES }: NewGameOptions): { state: GameState; events: GameEvent[] } {
  if (players.length < 2 || players.length > 6) throw new Error('Se juega de 2 a 6');
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Jugadores repetidos');
  const rand = mulberry32(seed);
  const printed = shuffleInPlace(
    PRINTED_DECK.filter((c) => rules.deckCopies === 2 || c.copy < Math.ceil(copiesFor(c.name) / 2)),
    rand,
  );
  // Los ids salen del orden mezclado: no dicen nada de qué carta es.
  const deck: Card[] = printed.map((p, i) => ({
    id: `c${i}`,
    defCode: p.defCode,
    name: p.name,
    category: p.category,
    color: p.color,
    symbol: p.symbol,
    number: p.number,
  }));
  shuffleInPlace(deck, rand);
  const specialDeck: SpecialCard[] = shuffleInPlace(printedSpecials(), rand).map((s, i) => ({ id: `s${i}`, ...s }));
  shuffleInPlace(specialDeck, rand);
  const state: GameState = {
    rules,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: [],
      alcohol: 0,
      points: 0,
      eliminated: false,
      outReason: null,
      shame: 0,
      coffeeTurnsLeft: 0,
      specials: [],
      foodHalves: 0,
      choripan: false,
      driver: false,
    })),
    deck,
    discard: [],
    currentIndex: Math.floor(rand() * players.length),
    turn: 0,
    phase: 'main',
    cocktailsThisTurn: 0,
    playedThisTurn: 0,
    matchDiscardsThisTurn: 0,
    asksThisTurn: 0,
    usesThisTurn: freshUses(),
    pending: null,
    specialDeck,
    specialDiscard: [],
    winnerId: null,
    rngState: Math.floor(rand() * 2 ** 32),
    viewSalt: Math.floor(rand() * 2 ** 32),
    totalCards: deck.length,
  };
  const events: GameEvent[] = [];
  for (const p of state.players) draw(state, p, rules.handSize, events);
  for (const p of state.players) for (let i = 0; i < rules.specialStart; i++) drawSpecial(state, p, events);
  // Se da vuelta una carta: es la primera "carta de la mesa".
  state.discard.push(state.deck.pop()!);
  startTurn(state, events);
  return { state, events };
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentIndex]!;
}

export function applyAction(prev: GameState, playerId: string, action: Action): ActionResult {
  if (prev.phase === 'finished') return fail('GAME_OVER');
  const state = structuredClone(prev);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail('UNKNOWN_PLAYER');
  const events: GameEvent[] = [];
  const r = state.rules;

  if (action.type === 'RESPOND') {
    if (state.phase !== 'defense' || state.pending?.targetId !== playerId) return fail('WRONG_PHASE');
    const err = resolveDefense(state, action, events);
    return err ? fail(err) : ok(state, events);
  }

  if (currentPlayer(state).id !== playerId) return fail('NOT_YOUR_TURN');
  if (state.phase !== 'main') return fail('WRONG_PHASE');

  switch (action.type) {
    case 'SWAP': {
      const cost = actionCost(state, 'swap');
      if (player.points < cost) return fail('NOT_ENOUGH_POINTS');
      const cards = takeFromHand(player, [action.cardId]);
      if (typeof cards === 'string') return fail(cards);
      player.points -= cost;
      state.usesThisTurn.swap++;
      state.discard.push(...cards);
      events.push({ type: 'CARD_SWAPPED', playerId, discarded: cards[0]! });
      draw(state, player, 1, events);
      return ok(state, events);
    }
    case 'SHOT': {
      if (state.usesThisTurn.shot >= r.shotsPerTurn) return fail('LIMIT_REACHED');
      if (action.cardIds.length === 0) return fail('NO_CARDS');
      const cards = takeFromHand(player, action.cardIds);
      if (typeof cards === 'string') return fail(cards);
      const alcohol = actionCost(state, 'shot');
      state.usesThisTurn.shot++;
      state.discard.push(...cards);
      player.alcohol += alcohol;
      events.push({ type: 'SHOT_TAKEN', playerId, count: cards.length, alcohol });
      if (checkBroke(state, player, events)) return ok(state, events);
      draw(state, player, cards.length, events);
      return ok(state, events);
    }
    case 'MATCH_DISCARD': {
      if (state.matchDiscardsThisTurn >= r.matchDiscardsPerTurn) return fail('LIMIT_REACHED');
      const tableCard = state.discard[state.discard.length - 1];
      if (!tableCard) return fail('NO_TABLE_CARD');
      if (action.cardIds.length === 0) return fail('NO_CARDS');
      if (new Set(action.cardIds).size !== action.cardIds.length) return fail('DUPLICATE_CARD');
      const chosen = action.cardIds.map((id) => player.hand.find((c) => c.id === id));
      if (chosen.some((c) => !c)) return fail('CARD_NOT_IN_HAND');
      const cards = chosen as Card[];
      state.matchDiscardsThisTurn++;
      const matches = (c: Card) => c.number === tableCard.number || c.symbol === tableCard.symbol;
      if (!cards.every(matches)) {
        // Papelón: no se descarta nada, shot de castigo y se termina tu turno.
        player.shame++;
        events.push({ type: 'SHAME', playerId, shame: player.shame, cards, tableCard });
        if (player.shame >= r.shameLimit) {
          eliminate(state, player, 'verguenza', events);
          return ok(state, events);
        }
        const alcohol = actionCost(state, 'shot');
        player.alcohol += alcohol;
        events.push({ type: 'PENALTY_SHOT', playerId, alcohol });
        if (checkBroke(state, player, events)) return ok(state, events);
        forceEndTurn(state, player, events);
        return ok(state, events);
      }
      state.playedThisTurn++;
      takeFromHand(player, action.cardIds);
      state.discard.push(...cards);
      events.push({ type: 'MATCH_DISCARDED', playerId, cards, tableCard });
      draw(state, player, cards.length, events);
      return ok(state, events);
    }
    case 'ASK_INGREDIENT': {
      if (state.asksThisTurn >= r.asksPerTurn) return fail('LIMIT_REACHED');
      const err = checkInHand(player, action.cardIds);
      if (err) return fail(err);
      if (action.cardIds.length !== r.askCards) return fail('BAD_ASK');
      const given = action.cardIds.map((id) => player.hand.find((c) => c.id === id)!);
      const category = given[0]!.category;
      if (!given.every((c) => c.category === category)) return fail('BAD_ASK');
      // Del mismo color elegís 2; si no, 1. Lo que falta para volver a tener 3 sale al azar.
      const sameColor = given.every((c) => c.color === given[0]!.color);
      const maxNames = sameColor ? r.askCards - 1 : 1;
      if (action.names.length < 1 || action.names.length > maxNames) return fail('BAD_ASK');
      if (!action.names.every((n) => CARD_DEFS.some((d) => d.name === n && d.category === category))) return fail('BAD_ASK');
      // Se busca una copia en el mazo y, si no hay, en el descarte (menos la carta de la mesa).
      const below = state.discard.slice(0, -1);
      const picked: Card[] = [];
      for (const name of action.names) {
        const card =
          [...state.deck].reverse().find((c) => c.name === name && !picked.includes(c)) ??
          below.find((c) => c.name === name && !picked.includes(c));
        if (!card) return fail('NOT_AVAILABLE');
        picked.push(card);
      }
      state.deck = state.deck.filter((c) => !picked.includes(c));
      const top = state.discard.pop();
      state.discard = state.discard.filter((c) => !picked.includes(c));
      if (top) state.discard.push(top);
      takeFromHand(player, action.cardIds);
      state.asksThisTurn++;
      state.discard.push(...given);
      player.hand.push(...picked);
      events.push({ type: 'INGREDIENT_ASKED', playerId, cards: given, names: [...action.names], sameColor });
      events.push({ type: 'CARDS_DRAWN', playerId, cardIds: picked.map((c) => c.id) });
      draw(state, player, r.askCards - picked.length, events);
      return ok(state, events);
    }
    case 'MAKE_COCKTAIL': {
      if (state.cocktailsThisTurn >= r.cocktailsPerTurn) return fail('LIMIT_REACHED');
      const cocktail = COCKTAIL_BY_CODE.get(action.cocktailCode);
      if (!cocktail) return fail('UNKNOWN_COCKTAIL');
      const target = state.players.find((p) => p.id === action.targetId);
      if (!target || !canBeTargeted(target, playerId)) return fail('BAD_TARGET');
      if (action.cardIds.length === 0) return fail('NO_CARDS');
      const specials = findSpecials(player, action.specialIds ?? []);
      if (typeof specials === 'string') return fail(specials);
      const codes = specials.map((x) => x.code);
      if (specials.some((x) => x.kind !== 'coctel') || new Set(codes).size !== codes.length) return fail('WRONG_SPECIAL');
      const cards = takeFromHand(player, action.cardIds);
      if (typeof cards === 'string') return fail(cards);
      state.cocktailsThisTurn++;
      state.discard.push(...cards);
      // Las especiales se gastan aunque el cóctel salga mal.
      for (const sp of specials) discardSpecial(state, player, sp, events);

      if (!matchesRecipe(cocktail, cards, r.recipeMode)) {
        player.alcohol += r.failAlcohol;
        events.push({ type: 'COCKTAIL_FAILED', playerId, cocktailCode: cocktail.code, cards, alcohol: r.failAlcohol });
        if (checkBroke(state, player, events)) return ok(state, events);
        draw(state, player, cards.length, events);
        return ok(state, events);
      }

      state.playedThisTurn++;
      const points = scoreCocktail(cocktail, cards, r.bonus);
      // Los demás rivales en el orden de la mesa, arrancando después del elegido: para cuando le pega a todos.
      const n = state.players.length;
      const start = state.players.indexOf(target);
      const others = Array.from({ length: n - 1 }, (_, k) => state.players[(start + 1 + k) % n]!).filter((p) =>
        canBeTargeted(p, playerId),
      );
      let alcohol = cocktailAlcohol(cocktail, cards, r) + (codes.includes('semana_dificil') ? r.hardWeekAlcohol : 0);
      let queue = r.cocktailTarget === 'todos' ? others.map((p) => p.id) : [];
      if (codes.includes('jarra')) {
        // El doble, repartido entre todos los rivales (redondeando para arriba).
        queue = others.map((p) => p.id);
        alcohol = Math.ceil((alcohol * 2) / (queue.length + 1));
      }
      events.push({ type: 'COCKTAIL_MADE', playerId, targetId: target.id, cocktailCode: cocktail.code, cards, points, alcohol });
      draw(state, player, cards.length, events);
      state.pending = {
        fromId: playerId,
        senderId: playerId,
        targetId: target.id,
        cocktailCode: cocktail.code,
        alcohol,
        baseAlcohol: alcohol,
        points: points.total,
        queue,
        paid: false,
      };
      offerToTarget(state, events);
      return ok(state, events);
    }
    case 'WATER': {
      const cost = actionCost(state, 'water');
      if (player.points < cost) return fail('NOT_ENOUGH_POINTS');
      player.points -= cost;
      state.usesThisTurn.water++;
      const before = player.alcohol;
      player.alcohol = Math.max(0, player.alcohol - r.waterAmount);
      events.push({ type: 'WATER_DRUNK', playerId, alcohol: before - player.alcohol });
      return ok(state, events);
    }
    case 'COFFEE': {
      const cost = actionCost(state, 'coffee');
      if (player.points < cost) return fail('NOT_ENOUGH_POINTS');
      player.points -= cost;
      state.usesThisTurn.coffee++;
      player.coffeeTurnsLeft = r.coffeeTurns;
      events.push({ type: 'COFFEE_DRUNK', playerId });
      return ok(state, events);
    }
    case 'BUY_SPECIAL': {
      const cost = actionCost(state, 'buy');
      if (player.points < cost) return fail('NOT_ENOUGH_POINTS');
      if (player.specials.length >= r.specialHandMax) return fail('SPECIAL_HAND_FULL');
      if (state.specialDeck.length + state.specialDiscard.length === 0) return fail('NO_SPECIALS_LEFT');
      player.points -= cost;
      state.usesThisTurn.buy++;
      const special = drawSpecial(state, player, events)!;
      events.push({ type: 'SPECIAL_BOUGHT', playerId, cost, special });
      return ok(state, events);
    }
    case 'PLAY_SPECIAL': {
      const found = findSpecials(player, [action.specialId]);
      if (typeof found === 'string') return fail(found);
      const special = found[0]!;
      if (special.kind !== 'turno') return fail('WRONG_SPECIAL');
      discardSpecial(state, player, special, events);
      playTurnSpecial(state, player, special.code, events);
      return ok(state, events);
    }
    case 'END_TURN': {
      // Si no hay a quién tirarle (todos son conductores designados), no se exige jugar.
      const anyTarget = state.players.some((p) => canBeTargeted(p, playerId));
      if (r.mustPlay && state.playedThisTurn === 0 && player.hand.length > 0 && anyTarget) return fail('MUST_PLAY');
      const excess = Math.max(0, player.hand.length - r.handSize);
      if (action.discardIds.length !== excess) return fail('BAD_DISCARD_COUNT');
      const cards = takeFromHand(player, action.discardIds);
      if (typeof cards === 'string') return fail(cards);
      state.discard.push(...cards);
      events.push({ type: 'TURN_ENDED', playerId, discarded: cards });
      finishTurn(state, events);
      return ok(state, events);
    }
  }
}

/**
 * Un jugador se va en medio de la partida (o lo saca el anfitrión): queda afuera como si hubiera quebrado.
 * Si era su turno, pasa al siguiente; si le estaban tirando un cóctel, sigue con el próximo de la cola.
 */
export function removePlayer(prev: GameState, playerId: string): ActionResult {
  if (prev.phase === 'finished') return fail('GAME_OVER');
  const state = structuredClone(prev);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail('UNKNOWN_PLAYER');
  const events: GameEvent[] = [];
  if (player.eliminated) return ok(state, events);
  const wasTarget = state.phase === 'defense' && state.pending?.targetId === playerId;
  const ended = eliminate(state, player, 'abandono', events);
  if (!ended && wasTarget && state.pending) nextInQueue(state, events);
  return ok(state, events);
}

/**
 * Lo que cuesta ahora la próxima vez que el jugador activo use algo: el precio base, y el doble por cada
 * vez que ya lo usó en este turno (1, 2, 4, 8…). Cambiar, agua, café y comprar especiales cuestan puntos; el shot, % de alcohol.
 */
export function actionCost(state: GameState, kind: PaidAction): number {
  const r = state.rules;
  const base = { swap: r.swapCost, shot: r.shotAlcohol, water: r.waterCost, coffee: r.coffeeCost, buy: r.specialCost }[kind];
  return base * 2 ** state.usesThisTurn[kind];
}

/**
 * Turno cortado por un papelón: si le sobran cartas, se descartan al azar abajo de la carta de la mesa
 * (así la mesa no cambia) y pasa el turno.
 */
function forceEndTurn(state: GameState, player: PlayerState, events: GameEvent[]) {
  const excess = Math.max(0, player.hand.length - state.rules.handSize);
  const rand = mulberry32(state.rngState);
  state.rngState = Math.floor(rand() * 2 ** 32);
  const dropped = shuffleInPlace([...player.hand], rand).slice(0, excess);
  player.hand = player.hand.filter((c) => !dropped.includes(c));
  const top = state.discard.pop();
  state.discard.push(...dropped);
  if (top) state.discard.push(top);
  events.push({ type: 'TURN_ENDED', playerId: player.id, discarded: dropped });
  finishTurn(state, events);
}

/** Cuántas cartas tiene que descartar el jugador activo para cerrar el turno. */
export function requiredDiscards(state: GameState): number {
  return Math.max(0, currentPlayer(state).hand.length - state.rules.handSize);
}

function resolveDefense(state: GameState, action: RespondAction, events: GameEvent[]): ErrorCode | null {
  const pending = state.pending!;
  const r = state.rules;
  const from = state.players.find((p) => p.id === pending.fromId)!;
  const sender = state.players.find((p) => p.id === pending.senderId)!;
  const target = state.players.find((p) => p.id === pending.targetId)!;
  const base = { fromId: sender.id, cocktailCode: pending.cocktailCode };

  // El que lo armó cobra una sola vez, cuando se lo toma alguien que no es él.
  const pay = (drinker: PlayerState) => {
    if (pending.paid || drinker.id === from.id) return;
    pending.paid = true;
    from.points += pending.points;
    events.push({ type: 'POINTS_EARNED', playerId: from.id, points: pending.points });
  };
  const drinks = (p: PlayerState) => {
    const { alcohol, halved } = drinkCocktail(p, pending.alcohol);
    events.push({ type: 'COCKTAIL_DRUNK', drinkerId: p.id, ...base, alcohol, halved });
  };

  let countered: PlayerState | null = null;
  if (action.choice === 'drink') {
    drinks(target);
    pay(target);
  } else {
    const found = findSpecials(target, [action.specialId]);
    if (typeof found === 'string') return found;
    const special = found[0]!;
    if (special.kind !== 'respuesta') return 'WRONG_SPECIAL';
    let next: PlayerState | undefined;
    if (special.code === 'doblalo') {
      // El siguiente en la mesa que se pueda elegir (puede ser el que lo armó).
      const n = state.players.length;
      const at = state.players.indexOf(target);
      next = Array.from({ length: n - 1 }, (_, k) => state.players[(at + 1 + k) % n]!).find((p) => !p.eliminated && !p.driver);
      if (!next) return 'BAD_TARGET';
    }
    if (special.code === 'proba_el_mio') {
      if (!action.counter) return 'WRONG_SPECIAL';
      if (!COCKTAIL_BY_CODE.get(action.counter.cocktailCode)) return 'UNKNOWN_COCKTAIL';
      if (action.counter.cardIds.length === 0) return 'NO_CARDS';
      const missing = checkInHand(target, action.counter.cardIds);
      if (missing) return missing;
    }
    discardSpecial(state, target, special, events);

    switch (special.code) {
      case 'no_gracias':
        events.push({ type: 'COCKTAIL_REFUSED', targetId: target.id, ...base });
        break;
      case 'tomatelo_vos':
        drinks(sender);
        break;
      case 'vos_tambien':
        drinks(target);
        drinks(sender);
        pay(target);
        break;
      case 'doblalo':
        pending.alcohol *= 2;
        pending.senderId = target.id;
        pending.targetId = next!.id;
        events.push({ type: 'COCKTAIL_PASSED', fromId: target.id, toId: next!.id, cocktailCode: pending.cocktailCode, alcohol: pending.alcohol });
        offerToTarget(state, events);
        return null;
      case 'proba_el_mio': {
        drinks(target);
        pay(target);
        const counter = action.counter!;
        const cocktail = COCKTAIL_BY_CODE.get(counter.cocktailCode)!;
        const cards = takeFromHand(target, counter.cardIds) as Card[];
        state.discard.push(...cards);
        if (matchesRecipe(cocktail, cards, r.recipeMode)) {
          const points = scoreCocktail(cocktail, cards, r.bonus);
          const alcohol = cocktailAlcohol(cocktail, cards, r);
          events.push({ type: 'COCKTAIL_MADE', playerId: target.id, targetId: sender.id, cocktailCode: cocktail.code, cards, points, alcohol });
          const res = drinkCocktail(sender, alcohol);
          events.push({ type: 'COCKTAIL_DRUNK', drinkerId: sender.id, fromId: target.id, cocktailCode: cocktail.code, ...res });
          target.points += points.total;
          events.push({ type: 'POINTS_EARNED', playerId: target.id, points: points.total });
        } else {
          target.alcohol += r.failAlcohol;
          events.push({ type: 'COCKTAIL_FAILED', playerId: target.id, cocktailCode: cocktail.code, cards, alcohol: r.failAlcohol });
        }
        draw(state, target, cards.length, events);
        countered = sender;
        break;
      }
      default:
        return 'WRONG_SPECIAL';
    }
  }

  state.phase = 'main';
  // Primero el que lo tomó; después el que se lo mandó. Si quiebra el del turno, se le cierra.
  checkBroke(state, target, events);
  if (!state.winnerId) checkBroke(state, sender, events);
  if (!state.winnerId && countered) checkBroke(state, countered, events);
  if (state.pending !== pending || state.winnerId) return null; // se cortó el turno o terminó la partida
  nextInQueue(state, events);
  return null;
}

/** Pasa el cóctel al próximo rival de la cola (cuando le pega a varios), o lo cierra. */
function nextInQueue(state: GameState, events: GameEvent[]) {
  const pending = state.pending!;
  const next = pending.queue.shift();
  if (next === undefined) {
    state.pending = null;
    state.phase = 'main';
    return;
  }
  pending.targetId = next;
  pending.senderId = pending.fromId;
  pending.alcohol = pending.baseAlcohol;
  offerToTarget(state, events);
}

/** Le ofrece responder al rival de turno del cóctel, o se lo toma directo si no tiene cartas especiales. */
function offerToTarget(state: GameState, events: GameEvent[]) {
  const pending = state.pending!;
  const target = state.players.find((p) => p.id === pending.targetId)!;
  if (target.eliminated) {
    // Quedó afuera por otra cosa en el medio: se saltea.
    nextInQueue(state, events);
    return;
  }
  // Se abre con cualquier carta especial en la mano, así nadie sabe si tiene una de respuesta.
  if (target.specials.length > 0) {
    state.phase = 'defense';
    events.push({ type: 'DEFENSE_OFFERED', targetId: target.id, fromId: pending.senderId, cocktailCode: pending.cocktailCode });
  } else {
    resolveDefense(state, { type: 'RESPOND', choice: 'drink' }, events);
  }
}

/** Se le puede tirar algo: sigue en juego, no es el que tira y no es conductor designado. */
function canBeTargeted(p: PlayerState, throwerId: string): boolean {
  return !p.eliminated && !p.driver && p.id !== throwerId;
}

/**
 * Tomarse un cóctel, con la comida encima: el choripán baja todo a la mitad; si no, Maní y Empanadas
 * bajan a la mitad los próximos cócteles (uno por porción). Redondea para arriba.
 */
function drinkCocktail(p: PlayerState, amount: number): { alcohol: number; halved: boolean } {
  let halved = false;
  if (p.choripan) halved = true;
  else if (p.foodHalves > 0) {
    p.foodHalves--;
    halved = true;
  }
  const alcohol = halved ? Math.ceil(amount / 2) : amount;
  p.alcohol += alcohol;
  return { alcohol, halved };
}

function playTurnSpecial(state: GameState, player: PlayerState, code: SpecialCode, events: GameEvent[]) {
  switch (code) {
    case 'mani':
      player.foodHalves += 1;
      return;
    case 'empanadas':
      player.foodHalves += 2;
      return;
    case 'choripan':
      player.choripan = true;
      return;
    case 'conductor':
      player.driver = true;
      return;
    case 'ronda_shots': {
      // Todos, en el orden de la mesa, y el que la pidió al final. Los conductores designados no toman.
      const n = state.players.length;
      const at = state.players.indexOf(player);
      const order = Array.from({ length: n }, (_, k) => state.players[(at + 1 + k) % n]!).filter((p) => !p.eliminated && !p.driver);
      const drinks = order.map((p) => {
        const alcohol = p.choripan ? Math.ceil(state.rules.shotAlcohol / 2) : state.rules.shotAlcohol;
        p.alcohol += alcohol;
        return { playerId: p.id, alcohol };
      });
      events.push({ type: 'SHOT_ROUND', playerId: player.id, drinks });
      for (const p of order) {
        checkBroke(state, p, events);
        if (state.winnerId || currentPlayer(state).id !== player.id) return;
      }
      return;
    }
  }
}

function findSpecials(player: PlayerState, ids: string[]): SpecialCard[] | ErrorCode {
  if (new Set(ids).size !== ids.length) return 'DUPLICATE_CARD';
  const found: SpecialCard[] = [];
  for (const id of ids) {
    const sp = player.specials.find((x) => x.id === id);
    if (!sp) return 'SPECIAL_NOT_IN_HAND';
    found.push(sp);
  }
  return found;
}

function discardSpecial(state: GameState, player: PlayerState, special: SpecialCard, events: GameEvent[]) {
  player.specials = player.specials.filter((x) => x.id !== special.id);
  state.specialDiscard.push(special);
  events.push({ type: 'SPECIAL_PLAYED', playerId: player.id, special });
}

/** Roba una especial; si el mazo especial se acabó, se mezcla su descarte. */
function drawSpecial(state: GameState, player: PlayerState, events: GameEvent[]): SpecialCard | null {
  if (state.specialDeck.length === 0) {
    if (state.specialDiscard.length === 0) return null;
    const rand = mulberry32(state.rngState);
    state.specialDeck = shuffleInPlace(state.specialDiscard, rand);
    state.specialDiscard = [];
    state.rngState = Math.floor(rand() * 2 ** 32);
    events.push({ type: 'SPECIAL_DECK_RESHUFFLED', count: state.specialDeck.length });
  }
  const sp = state.specialDeck.pop()!;
  player.specials.push(sp);
  return sp;
}

function freshUses(): Record<PaidAction, number> {
  return { swap: 0, shot: 0, water: 0, coffee: 0, buy: 0 };
}

function checkInHand(player: PlayerState, ids: string[]): ErrorCode | null {
  if (new Set(ids).size !== ids.length) return 'DUPLICATE_CARD';
  return ids.every((id) => player.hand.some((c) => c.id === id)) ? null : 'CARD_NOT_IN_HAND';
}

/** Si pasó la barra, queda afuera. Devuelve true si el turno del jugador activo ya se cerró por esto. */
function checkBroke(state: GameState, player: PlayerState, events: GameEvent[]): boolean {
  if (player.eliminated || player.alcohol <= state.rules.barMax) return false;
  return eliminate(state, player, 'quiebra', events);
}

/** Saca al jugador de la partida. Devuelve true si el turno del jugador activo ya se cerró por esto. */
function eliminate(state: GameState, player: PlayerState, reason: OutReason, events: GameEvent[]): boolean {
  player.eliminated = true;
  player.outReason = reason;
  player.coffeeTurnsLeft = 0;
  player.foodHalves = 0;
  player.choripan = false;
  player.driver = false;
  state.specialDiscard.push(...player.specials);
  player.specials = [];
  // Sus cartas van abajo de la carta de la mesa, para no cambiarla.
  const top = state.discard.pop();
  state.discard.push(...player.hand);
  if (top) state.discard.push(top);
  player.hand = [];
  events.push(
    reason === 'quiebra'
      ? { type: 'PLAYER_BROKE', playerId: player.id, alcohol: player.alcohol }
      : reason === 'verguenza'
        ? { type: 'PLAYER_SHAMED', playerId: player.id }
        : { type: 'PLAYER_LEFT', playerId: player.id },
  );

  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length === 1) {
    state.phase = 'finished';
    state.pending = null;
    state.winnerId = alive[0]!.id;
    events.push({ type: 'GAME_WON', playerId: alive[0]!.id });
    return true;
  }
  if (currentPlayer(state).id === player.id) {
    state.pending = null;
    state.phase = 'main';
    finishTurn(state, events);
    return true;
  }
  return false;
}

function finishTurn(state: GameState, events: GameEvent[]) {
  const player = currentPlayer(state);
  if (player.coffeeTurnsLeft > 0) player.coffeeTurnsLeft--;
  const n = state.players.length;
  let next = state.currentIndex;
  do next = (next + 1) % n;
  while (state.players[next]!.eliminated);
  state.currentIndex = next;
  startTurn(state, events);
}

function startTurn(state: GameState, events: GameEvent[]) {
  state.turn++;
  state.cocktailsThisTurn = 0;
  state.playedThisTurn = 0;
  state.matchDiscardsThisTurn = 0;
  state.asksThisTurn = 0;
  state.usesThisTurn = freshUses();
  const player = currentPlayer(state);
  // Choripán y conductor designado duran hasta que empieza tu próximo turno.
  player.choripan = false;
  player.driver = false;
  events.push({ type: 'TURN_STARTED', playerId: player.id, turn: state.turn });
  draw(state, player, state.rules.drawPerTurn, events);
}

function draw(state: GameState, player: PlayerState, count: number, events: GameEvent[]) {
  const drawn: string[] = [];
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      // Se mezcla el descarte, menos la carta de la mesa, que queda.
      const top = state.discard.pop();
      if (state.discard.length === 0) {
        if (top) state.discard.push(top);
        break;
      }
      const rand = mulberry32(state.rngState);
      state.deck = shuffleInPlace(state.discard, rand);
      state.discard = top ? [top] : [];
      state.rngState = Math.floor(rand() * 2 ** 32);
      events.push({ type: 'DECK_RESHUFFLED', count: state.deck.length });
    }
    const card = state.deck.pop()!;
    player.hand.push(card);
    drawn.push(card.id);
  }
  if (drawn.length > 0) events.push({ type: 'CARDS_DRAWN', playerId: player.id, cardIds: drawn });
}

function takeFromHand(player: PlayerState, ids: string[]): Card[] | ErrorCode {
  if (new Set(ids).size !== ids.length) return 'DUPLICATE_CARD';
  const cards: Card[] = [];
  for (const id of ids) {
    const card = player.hand.find((c) => c.id === id);
    if (!card) return 'CARD_NOT_IN_HAND';
    cards.push(card);
  }
  player.hand = player.hand.filter((c) => !ids.includes(c.id));
  return cards;
}

function ok(state: GameState, events: GameEvent[]): ActionResult {
  return { ok: true, state, events };
}

function fail(error: ErrorCode): ActionResult {
  return { ok: false, error };
}
