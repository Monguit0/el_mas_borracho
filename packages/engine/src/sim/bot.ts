// Un bot simple para las partidas simuladas. Ve lo que vería una persona:
// cuanto más borracho, más se equivoca armando y peor elige qué copia usar.

import { CARD_DEFS, COCKTAILS, COMMON_GLASS, type Card } from '../cards.js';
import { actionCost, currentPlayer, requiredDiscards, type Action } from '../engine.js';
import type { Rand } from '../rng.js';
import { drunkLevel, type DrunkLevel, type RecipeMode } from '../rules.js';
import { bestCocktailOptions } from '../scoring.js';
import type { SpecialCode } from '../specials.js';
import type { GameState, PlayerState } from '../state.js';
import { seeingAlcohol } from '../view.js';

const MISTAKE_CHANCE: Record<DrunkLevel, number> = {
  sobrio: 0,
  alegre: 0.05,
  mareado: 0.15,
  en_pedo: 0.3,
  al_borde: 0.5,
};

function pick<T>(arr: T[], rand: Rand): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

/** Próxima acción del jugador activo en su turno. */
export function botTurnAction(state: GameState, rand: Rand): Action {
  const me = currentPlayer(state);
  const r = state.rules;
  const pct = (me.alcohol / r.barMax) * 100;
  const seeing = drunkLevel(seeingAlcohol(state, me), r.barMax);

  if (pct >= 70 && me.points >= actionCost(state, 'water')) return { type: 'WATER' };
  const turnCard = chooseTurnSpecial(state, me, pct);
  if (turnCard) return { type: 'PLAY_SPECIAL', specialId: turnCard };
  if (
    me.specials.length < r.specialHandMax &&
    state.specialDeck.length + state.specialDiscard.length > 0 &&
    me.points >= actionCost(state, 'buy') + r.waterCost &&
    rand() < 0.6
  ) {
    return { type: 'BUY_SPECIAL' };
  }
  const targets = state.players.filter((p) => !p.eliminated && !p.driver && p.id !== me.id);
  if (pct >= 50 && me.coffeeTurnsLeft === 0 && me.points >= actionCost(state, 'coffee') + actionCost(state, 'water') && rand() < 0.3) {
    return { type: 'COFFEE' };
  }

  if (state.cocktailsThisTurn < r.cocktailsPerTurn && targets.length > 0) {
    const options = bestCocktailOptions(me.hand, COCKTAILS, r.bonus, r.recipeMode);
    if (options.length > 0) {
      // Borracho no ve bien los números: agarra cualquier opción válida, no la mejor.
      const choice = seeing === 'en_pedo' || seeing === 'al_borde' ? pick(options, rand) : options[0]!;
      let cardIds = [...choice.cardIds];
      if (rand() < MISTAKE_CHANCE[seeing]) {
        const others = me.hand.filter((c) => !cardIds.includes(c.id));
        if (others.length > 0) cardIds[Math.floor(rand() * cardIds.length)] = pick(others, rand).id;
      }
      // Las especiales de cóctel van siempre con el primero que sale.
      const specialIds = me.specials.filter((x) => x.kind === 'coctel').map((x) => x.id);
      const codes = new Set<string>();
      const unique = specialIds.filter((id) => {
        const code = me.specials.find((x) => x.id === id)!.code;
        if (codes.has(code)) return false;
        codes.add(code);
        return true;
      });
      return { type: 'MAKE_COCKTAIL', cocktailCode: choice.cocktailCode, cardIds, targetId: chooseTarget(targets, rand), specialIds: unique };
    }
    const ranked = rankHand(me.hand, rand, r.recipeMode);
    const asking = chooseAsk(state, me, ranked.map((x) => x.card));
    if (asking) return asking;
    const table = state.discard[state.discard.length - 1];
    const risky = MISTAKE_CHANCE[seeing] > 0 && me.shame >= r.shameLimit - 1;
    if (table && state.matchDiscardsThisTurn < r.matchDiscardsPerTurn && !risky) {
      // Si todavía no jugó nada, tira lo que coincida aunque le sirva; si no, solo lo que no le sirve.
      const mustPlay = r.mustPlay && state.playedThisTurn === 0;
      const junk = ranked.filter((x) => mustPlay || x.value < 0.5).map((x) => x.card);
      const ok = junk.filter((c) => c.number === table.number || c.symbol === table.symbol);
      if (ok.length > 0) {
        const ids = ok.map((c) => c.id);
        // Borracho ve mal la mesa o su mano: a veces mete una que no coincide.
        if (rand() < MISTAKE_CHANCE[seeing]) {
          const wrong = me.hand.find((c) => c.number !== table.number && c.symbol !== table.symbol);
          if (wrong) ids.push(wrong.id);
        }
        return { type: 'MATCH_DISCARD', cardIds: ids };
      }
    }
    const dead = ranked.filter((x) => x.value === 0);
    if (state.usesThisTurn.shot === 0 && pct < 60 && dead.length >= 3) {
      return { type: 'SHOT', cardIds: dead.map((x) => x.card.id) };
    }
    if (me.points >= actionCost(state, 'swap') + r.specialCost && ranked[0]!.value < 0.5 && rand() < 0.8) {
      return { type: 'SWAP', cardId: ranked[0]!.card.id };
    }
  }

  // Tiene que jugar algo: shots (cada vez más caros) hasta que le salga una jugada.
  if (r.mustPlay && state.playedThisTurn === 0 && me.hand.length > 0 && targets.length > 0) {
    const ids = rankHand(me.hand, rand, r.recipeMode).slice(0, Math.min(4, me.hand.length)).map((x) => x.card.id);
    return { type: 'SHOT', cardIds: ids };
  }

  const n = requiredDiscards(state);
  const discardIds = rankHand(me.hand, rand, r.recipeMode).slice(0, n).map((x) => x.card.id);
  return { type: 'END_TURN', discardIds };
}

/**
 * Qué tan útil es cada carta de la mano: lo cerca que está la mejor receta que la usa.
 * 0 = no entra en ninguna receta. Ordenado de menos útil a más útil.
 */
export function rankHand(hand: Card[], rand: Rand, mode: RecipeMode = 'exacta'): { card: Card; value: number }[] {
  // En modo flexible vaso, utensilio y técnica siempre sirven para algo; se guarda uno de cada.
  if (mode === 'flexible') {
    const keep = new Set<string>();
    const ranked = hand.map((card) => {
      let value: number;
      if (card.category === 'ingrediente') {
        value = Math.max(0, ...COCKTAILS.filter((c) => c.recipe.includes(card.name)).map(() => 0.6));
      } else {
        value = keep.has(card.category) ? 0.1 : 0.5;
        keep.add(card.category);
      }
      return { card, value: value + rand() * 0.01 };
    });
    return ranked.sort((a, b) => a.value - b.value);
  }
  const names = new Set(hand.map((c) => c.name));
  const seen = new Set<string>();
  let glassKept = false;
  const ranked = hand.map((card) => {
    let value = 0;
    for (const c of COCKTAILS) {
      if (!c.recipe.includes(card.name)) continue;
      const have = c.recipe.filter((n) => names.has(n)).length;
      value = Math.max(value, have / c.recipe.length);
    }
    if (card.name === COMMON_GLASS) value = 0.5;
    // Con cualquier vaso sirve: se guarda uno (el que más cerca está de una receta).
    if (mode === 'vaso' && card.category === 'cristaleria') {
      value = Math.max(value, glassKept ? 0.1 : 0.5);
      glassKept = true;
    }
    // La segunda copia del mismo nombre sobra casi siempre.
    if (seen.has(card.name)) value *= 0.3;
    seen.add(card.name);
    return { card, value: value + rand() * 0.01 };
  });
  return ranked.sort((a, b) => a.value - b.value);
}

/**
 * Pedir ingrediente: si a un cóctel le faltan 1 o 2 cartas de una misma categoría y tiene 3 de esa
 * categoría que no le sirven para ese cóctel, las cambia (2 a elección solo si las 3 son del mismo color).
 */
function chooseAsk(state: GameState, me: PlayerState, ranked: Card[]): Action | null {
  const r = state.rules;
  if (state.asksThisTurn >= r.asksPerTurn) return null;
  const pool = [...state.deck, ...state.discard.slice(0, -1)];
  const names = new Set(me.hand.map((c) => c.name));
  const hasGlass = me.hand.some((c) => c.category === 'cristaleria');
  for (const cocktail of COCKTAILS) {
    const missing = cocktail.recipe.filter((n) => {
      const def = CARD_DEFS.find((d) => d.name === n)!;
      if (def.category === 'cristaleria' && (hasGlass || names.has(COMMON_GLASS)) && r.recipeMode !== 'exacta') return false;
      return !names.has(n);
    });
    if (missing.length === 0 || missing.length > 2) continue;
    const category = CARD_DEFS.find((d) => d.name === missing[0])!.category;
    if (missing.some((n) => CARD_DEFS.find((d) => d.name === n)!.category !== category)) continue;
    if (!missing.every((n) => pool.filter((c) => c.name === n).length >= missing.filter((m) => m === n).length)) continue;
    const spare = ranked.filter((c) => c.category === category && !cocktail.recipe.includes(c.name));
    let give: Card[] | undefined;
    if (missing.length === 2) {
      const byColor = new Map<string, Card[]>();
      for (const c of spare) byColor.set(c.color, [...(byColor.get(c.color) ?? []), c]);
      give = [...byColor.values()].find((g) => g.length >= r.askCards)?.slice(0, r.askCards);
    } else if (spare.length >= r.askCards) {
      give = spare.slice(0, r.askCards);
    }
    if (give) return { type: 'ASK_INGREDIENT', cardIds: give.map((c) => c.id), names: missing };
  }
  return null;
}

function chooseTarget(targets: PlayerState[], rand: Rand): string {
  // Mezclados para que los empates no castiguen siempre al mismo asiento.
  const rivals = [...targets].sort(() => rand() - 0.5);
  if (rand() < 0.5) return rivals.reduce((a, b) => (b.alcohol > a.alcohol ? b : a)).id;
  return pick(rivals, rand).id;
}

/** Qué carta especial de turno jugar ahora, si alguna. */
function chooseTurnSpecial(state: GameState, me: PlayerState, pct: number): string | null {
  const r = state.rules;
  const has = (code: SpecialCode) => me.specials.find((x) => x.code === code)?.id ?? null;
  if (pct >= 70 && !me.driver && has('conductor')) return has('conductor');
  if (pct >= 60 && !me.choripan && !me.driver && has('choripan')) return has('choripan');
  if (pct >= 40 && me.foodHalves === 0 && !me.choripan) return has('mani') ?? has('empanadas');
  // La ronda conviene si uno de los que toman está más cerca de quebrar que yo.
  const rivals = state.players.filter((p) => !p.eliminated && !p.driver && p.id !== me.id);
  const worst = Math.max(...rivals.map((p) => p.alcohol), 0);
  if (me.alcohol + r.shotAlcohol <= r.barMax * 0.7 && worst >= me.alcohol + 15) return has('ronda_shots');
  return null;
}

/** Qué hace el bot cuando le lanzan un cóctel. */
export function botDefense(state: GameState, rand: Rand): Action {
  const p = state.pending!;
  const me = state.players.find((x) => x.id === p.targetId)!;
  const r = state.rules;
  const drink: Action = { type: 'RESPOND', choice: 'drink' };
  const replies = me.specials.filter((x) => x.kind === 'respuesta');
  if (replies.length === 0) return drink;
  const hit = me.choripan || me.foodHalves > 0 ? Math.ceil(p.alcohol / 2) : p.alcohol;
  const after = me.alcohol + hit;
  if (after < r.barMax * 0.7 && rand() >= 0.15) return drink;
  const use = (code: SpecialCode) => replies.find((x) => x.code === code)?.id;

  const proba = use('proba_el_mio');
  if (proba && after <= r.barMax) {
    const option = bestCocktailOptions(me.hand, COCKTAILS, r.bonus, r.recipeMode)[0];
    if (option) {
      return { type: 'RESPOND', choice: 'special', specialId: proba, counter: { cocktailCode: option.cocktailCode, cardIds: option.cardIds } };
    }
  }
  const back = use('tomatelo_vos');
  if (back) return { type: 'RESPOND', choice: 'special', specialId: back };
  const pass = use('doblalo');
  const someoneElse = state.players.some((x) => !x.eliminated && !x.driver && x.id !== me.id);
  if (pass && someoneElse) return { type: 'RESPOND', choice: 'special', specialId: pass };
  const no = use('no_gracias');
  if (no) return { type: 'RESPOND', choice: 'special', specialId: no };
  const too = use('vos_tambien');
  if (too && after <= r.barMax) return { type: 'RESPOND', choice: 'special', specialId: too };
  return drink;
}
