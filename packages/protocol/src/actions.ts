/**
 * Las jugadas tal como las manda el celular. Las cartas de la mano van por `handle` (el que trae la
 * vista, cambia cada turno), nunca por id: el servidor las traduce con resolveHandles. Las especiales
 * y los jugadores van por id. Todo se valida con un esquema estricto: un campo de más o de otro tipo
 * y se rechaza.
 */

export type WireAction =
  | { readonly type: 'SWAP'; readonly card: string }
  | { readonly type: 'SHOT'; readonly cards: readonly string[] }
  | { readonly type: 'MATCH_DISCARD'; readonly cards: readonly string[] }
  /** names: los nombres de carta que pedís (1, o 2 si las 3 son del mismo color). */
  | { readonly type: 'ASK_INGREDIENT'; readonly cards: readonly string[]; readonly names: readonly string[] }
  | {
      readonly type: 'MAKE_COCKTAIL';
      readonly cocktailCode: string;
      readonly cards: readonly string[];
      readonly targetId: string;
      readonly specialIds?: readonly string[];
    }
  | { readonly type: 'WATER' }
  | { readonly type: 'COFFEE' }
  | { readonly type: 'BUY_SPECIAL' }
  | { readonly type: 'PLAY_SPECIAL'; readonly specialId: string }
  | { readonly type: 'END_TURN'; readonly discards: readonly string[] }
  | { readonly type: 'RESPOND'; readonly choice: 'drink' }
  | {
      readonly type: 'RESPOND';
      readonly choice: 'special';
      readonly specialId: string;
      readonly counter?: { readonly cocktailCode: string; readonly cards: readonly string[] };
    };

const MAX_CARDS = 20;
const MAX_ID = 32;

type Obj = Record<string, unknown>;

function isPlainObject(value: unknown): value is Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function only(o: Obj, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(o);
  return required.every((k) => k in o) && keys.every((k) => required.includes(k) || optional.includes(k));
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const isIds = (v: unknown, min = 0): v is string[] => Array.isArray(v) && v.length >= min && v.length <= MAX_CARDS && v.every(isId);

/** Devuelve la jugada validada, o null si no tiene la forma correcta. */
export function parseWireAction(payload: unknown): WireAction | null {
  if (!isPlainObject(payload) || typeof payload['type'] !== 'string') return null;
  const p = payload;
  switch (p['type']) {
    case 'SWAP':
      return only(p, ['type', 'card']) && isId(p['card']) ? { type: 'SWAP', card: p['card'] } : null;
    case 'SHOT':
    case 'MATCH_DISCARD':
      return only(p, ['type', 'cards']) && isIds(p['cards'], 1) ? { type: p['type'], cards: [...p['cards']] } : null;
    case 'ASK_INGREDIENT': {
      if (!only(p, ['type', 'cards', 'names']) || !isIds(p['cards'], 1)) return null;
      const names = p['names'];
      if (!Array.isArray(names) || names.length < 1 || names.length > 2 || !names.every(isId)) return null;
      return { type: 'ASK_INGREDIENT', cards: [...p['cards']], names: [...names] };
    }
    case 'MAKE_COCKTAIL': {
      if (!only(p, ['type', 'cocktailCode', 'cards', 'targetId'], ['specialIds'])) return null;
      const { cocktailCode, cards, targetId, specialIds } = p;
      if (!isId(cocktailCode) || !isIds(cards, 1) || !isId(targetId)) return null;
      if (specialIds !== undefined && !isIds(specialIds)) return null;
      return { type: 'MAKE_COCKTAIL', cocktailCode, cards: [...cards], targetId, ...(specialIds ? { specialIds: [...specialIds] } : {}) };
    }
    case 'WATER':
    case 'COFFEE':
    case 'BUY_SPECIAL':
      return only(p, ['type']) ? { type: p['type'] } : null;
    case 'PLAY_SPECIAL':
      return only(p, ['type', 'specialId']) && isId(p['specialId']) ? { type: 'PLAY_SPECIAL', specialId: p['specialId'] } : null;
    case 'END_TURN':
      return only(p, ['type', 'discards']) && isIds(p['discards']) ? { type: 'END_TURN', discards: [...p['discards']] } : null;
    case 'RESPOND': {
      if (p['choice'] === 'drink') return only(p, ['type', 'choice']) ? { type: 'RESPOND', choice: 'drink' } : null;
      if (p['choice'] !== 'special' || !only(p, ['type', 'choice', 'specialId'], ['counter']) || !isId(p['specialId'])) return null;
      const counter = p['counter'];
      if (counter === undefined) return { type: 'RESPOND', choice: 'special', specialId: p['specialId'] };
      if (!isPlainObject(counter) || !only(counter, ['cocktailCode', 'cards'])) return null;
      if (!isId(counter['cocktailCode']) || !isIds(counter['cards'], 1)) return null;
      return {
        type: 'RESPOND',
        choice: 'special',
        specialId: p['specialId'],
        counter: { cocktailCode: counter['cocktailCode'], cards: [...counter['cards']] },
      };
    }
    default:
      return null;
  }
}

/** Los handles de cartas de la mano que usa una jugada (para traducirlos a ids). */
export function handlesOf(action: WireAction): readonly string[] {
  switch (action.type) {
    case 'SWAP':
      return [action.card];
    case 'SHOT':
    case 'MATCH_DISCARD':
    case 'ASK_INGREDIENT':
    case 'MAKE_COCKTAIL':
      return action.cards;
    case 'END_TURN':
      return action.discards;
    case 'RESPOND':
      return action.choice === 'special' && action.counter ? action.counter.cards : [];
    default:
      return [];
  }
}
