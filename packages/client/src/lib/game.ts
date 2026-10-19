/** Textos y cuentas de la mesa que no dependen de React. */
import { COCKTAILS, DEFAULT_RULES, type Color, type DrunkLevel, type GameEvent, type SpecialKind } from '@borracho/engine';
import type { GameView } from '@borracho/protocol';

export const COLOR_HEX: Record<Color, string> = {
  bordo: '#6E1F2E',
  verde: '#2F5E2B',
  azul: '#1F4A57',
  mostaza: '#C79A2B',
};

export const CATEGORY_LABEL = {
  ingrediente: 'Ingrediente',
  cristaleria: 'Cristalería',
  utensilio: 'Utensilio',
  tecnica: 'Técnica',
} as const;

export const LEVEL_LABEL: Record<DrunkLevel, string> = {
  sobrio: 'Sobrio',
  alegre: 'Alegre',
  mareado: 'Mareado',
  en_pedo: 'En pedo',
  al_borde: 'Al borde',
};

export const KIND_LABEL: Record<SpecialKind, string> = {
  turno: 'De tu turno',
  coctel: 'De cóctel',
  respuesta: 'De respuesta',
};

export const KIND_COLOR: Record<SpecialKind, string> = {
  turno: COLOR_HEX.verde,
  coctel: COLOR_HEX.mostaza,
  respuesta: COLOR_HEX.bordo,
};

/** 0 sin efectos, 1 tiemblan apenas (mareado), 2 tiemblan y ven doble (en pedo), 3 fuerte (al borde). */
export function drunkIntensity(level: DrunkLevel): 0 | 1 | 2 | 3 {
  if (level === 'mareado') return 1;
  if (level === 'en_pedo') return 2;
  if (level === 'al_borde') return 3;
  return 0;
}

/** El tamaño de la mano al cerrar el turno: lo que sobra se tira. Las opciones de la sala no lo cambian. */
export const HAND_SIZE = DEFAULT_RULES.handSize;

export const COCKTAIL_BY_CODE = new Map(COCKTAILS.map((c) => [c.code, c]));

export function cocktailName(code: string): string {
  return COCKTAIL_BY_CODE.get(code)?.name ?? 'un cóctel';
}

export function barColor(pct: number): string {
  if (pct >= 75) return '#C0392B';
  if (pct >= 50) return '#D9822B';
  return '#C79A2B';
}

export const AVATAR_COLORS = [COLOR_HEX.bordo, COLOR_HEX.verde, COLOR_HEX.azul, COLOR_HEX.mostaza, '#7A4A2A', '#4F3B6B'];

/** "Vodka" → "Vdoak" (como el motor): para mostrar los nombres de los cócteles cuando no se puede leer. */
export function scrambleText(text: string, seed: number): string {
  let s = seed || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return text
    .split(' ')
    .map((w) => {
      if (w.length <= 2) return w;
      const mid = w.slice(1).split('');
      for (let i = mid.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [mid[i], mid[j]] = [mid[j]!, mid[i]!];
      }
      return w[0] + mid.join('');
    })
    .join(' ');
}

/** Una línea para el registro de la mesa. null si el evento no merece cartel. */
export function describeEvent(e: GameEvent, name: (id: string) => string, me: string): string | null {
  // Cada línea en dos versiones: cuando el que hace la jugada sos vos, y cuando es otro.
  const say = (id: string, mine: string, other: string) => (id === me ? mine : `${name(id)} ${other}`);
  const whom = (id: string) => (id === me ? 'a vos' : `a ${name(id)}`);
  const c = (code: string) => cocktailName(code);
  switch (e.type) {
    case 'TURN_STARTED':
      return e.playerId === me ? 'Te toca.' : `Le toca a ${name(e.playerId)}.`;
    case 'COCKTAIL_MADE':
      return say(e.playerId, `Le tiraste un ${c(e.cocktailCode)} ${whom(e.targetId)} (${e.alcohol}%).`, `le tiró un ${c(e.cocktailCode)} ${whom(e.targetId)} (${e.alcohol}%).`);
    case 'COCKTAIL_FAILED':
      return say(e.playerId, `Armaste mal un ${c(e.cocktailCode)} y te lo tomaste (+${e.alcohol}%).`, `armó mal un ${c(e.cocktailCode)} y se lo tomó (+${e.alcohol}%).`);
    case 'COCKTAIL_DRUNK': {
      const food = e.halved ? ' (con comida, la mitad)' : '';
      return say(e.drinkerId, `Te tomaste el ${c(e.cocktailCode)}: +${e.alcohol}%${food}.`, `se tomó el ${c(e.cocktailCode)}: +${e.alcohol}%${food}.`);
    }
    case 'COCKTAIL_REFUSED':
      return say(e.targetId, `Le dijiste "No, gracias" al ${c(e.cocktailCode)}.`, `dijo "No, gracias" al ${c(e.cocktailCode)}.`);
    case 'COCKTAIL_PASSED':
      return say(e.fromId, `Lo doblaste y se lo pasaste ${whom(e.toId)} (${e.alcohol}%).`, `lo dobló y se lo pasó ${whom(e.toId)} (${e.alcohol}%).`);
    case 'SPECIAL_PLAYED':
      return say(e.playerId, `Jugaste ${e.special.name}.`, `jugó ${e.special.name}.`);
    case 'SPECIAL_BOUGHT':
      return e.special ? `Compraste ${e.special.name}.` : `${name(e.playerId)} compró una especial.`;
    case 'SHOT_ROUND':
      return say(e.playerId, 'Pediste una ronda de shots para todos.', 'pidió una ronda de shots para todos.');
    case 'SHOT_TAKEN': {
      const n = `${e.count} carta${e.count === 1 ? '' : 's'}`;
      return say(e.playerId, `Te tomaste un shot (+${e.alcohol}%) y cambiaste ${n}.`, `se tomó un shot (+${e.alcohol}%) y cambió ${n}.`);
    }
    case 'WATER_DRUNK':
      return say(e.playerId, `Tomaste agua (−${e.alcohol}%).`, `tomó agua (−${e.alcohol}%).`);
    case 'COFFEE_DRUNK':
      return say(e.playerId, 'Te tomaste un café.', 'se tomó un café.');
    case 'MATCH_DISCARDED':
      return say(e.playerId, `Descartaste ${e.cards.length} por coincidencia.`, `descartó ${e.cards.length} por coincidencia.`);
    case 'SHAME':
      return e.playerId === me ? '¡Papelón! Las cartas no coincidían.' : `¡Papelón de ${name(e.playerId)}! Las cartas no coincidían.`;
    case 'PENALTY_SHOT':
      return say(e.playerId, `Te tomaste el shot de castigo (+${e.alcohol}%).`, `se tomó el shot de castigo (+${e.alcohol}%).`);
    case 'PLAYER_BROKE':
      return say(e.playerId, 'Te pasaste y quedaste afuera.', 'se pasó y quedó afuera.');
    case 'PLAYER_SHAMED':
      return say(e.playerId, 'Quedaste afuera por vergüenza.', 'quedó afuera por vergüenza.');
    case 'PLAYER_LEFT':
      return say(e.playerId, 'Te fuiste de la partida.', 'se fue de la partida.');
    case 'GAME_WON':
      return e.playerId === me ? '¡Ganaste! Sos el que más aguantó.' : `¡Ganó ${name(e.playerId)}!`;
    default:
      return null;
  }
}

/** Los rivales a los que se les puede tirar un cóctel. */
export function targetsFor(game: GameView): GameView['players'] {
  return game.players.filter((p) => p.id !== game.you.id && !p.eliminated && !p.driver);
}
