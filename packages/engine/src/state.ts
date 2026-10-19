import type { Card } from './cards.js';
import type { RulesConfig } from './rules.js';
import type { SpecialCard } from './specials.js';

export interface PlayerState {
  id: string;
  name: string;
  hand: Card[];
  alcohol: number;
  points: number;
  eliminated: boolean;
  /** Por qué quedó afuera. */
  outReason: 'quiebra' | 'verguenza' | null;
  /** Papelones: descartes por coincidencia mal hechos. Con 3, perdés. */
  shame: number;
  /** Turnos propios que le quedan al café (0 = sin café). */
  coffeeTurnsLeft: number;
  /** La mano especial: secreta, los demás solo ven cuántas tiene. */
  specials: SpecialCard[];
  /** Cuántos de los próximos cócteles que tome le pegan la mitad (Maní, Empanadas). */
  foodHalves: number;
  /** Choripán: todo lo que le hagan tomar le pega la mitad, hasta que empiece su próximo turno. */
  choripan: boolean;
  /** Conductor designado: no le pueden tirar nada hasta que empiece su próximo turno. */
  driver: boolean;
}

/** Un cóctel lanzado que espera que el rival decida si se lo toma o le responde con una carta especial. */
export interface PendingCocktail {
  /** El que lo armó: es el que cobra. */
  fromId: string;
  /** El que se lo mandó al rival de ahora (el que lo armó, o el que se lo pasó con "Doblalo"). */
  senderId: string;
  targetId: string;
  cocktailCode: string;
  /** Lo que le pega al rival de ahora. */
  alcohol: number;
  /** Lo que le pega a cada rival de la cola (sin los "Doblalo" del rival anterior). */
  baseAlcohol: number;
  points: number;
  /** Cuando el cóctel le pega a todos: los rivales que todavía faltan, en orden. */
  queue: string[];
  /** Si el que lanzó ya cobró (cobra una sola vez aunque se lo tomen varios). */
  paid: boolean;
}

export type PaidAction = 'swap' | 'shot' | 'water' | 'coffee' | 'buy';

export type Phase = 'main' | 'defense' | 'finished';

export interface GameState {
  rules: RulesConfig;
  players: PlayerState[];
  /** El tope del mazo es el final del arreglo. */
  deck: Card[];
  /** La pila de descarte. La de arriba (la última) es "la carta de la mesa". */
  discard: Card[];
  currentIndex: number;
  /** Turno global, empieza en 1. */
  turn: number;
  phase: Phase;
  /** Cócteles armados este turno (bien o mal). */
  cocktailsThisTurn: number;
  /** Jugadas hechas este turno: cócteles bien armados y descartes por coincidencia bien hechos. Sin ninguna, no podés cerrar. */
  playedThisTurn: number;
  /** Descartes por coincidencia usados este turno. */
  matchDiscardsThisTurn: number;
  /** Cuántas veces se usó cada cosa este turno: cada uso repetido cuesta el doble. */
  usesThisTurn: Record<PaidAction, number>;
  pending: PendingCocktail | null;
  /** Mazo de cartas especiales (el tope es el final). */
  specialDeck: SpecialCard[];
  specialDiscard: SpecialCard[];
  winnerId: string | null;
  /** Estado del azar del motor (rearmar el mazo). Nunca sale del servidor. */
  rngState: number;
  /** Sal secreta para los identificadores que ve cada jugador. Nunca sale del servidor. */
  viewSalt: number;
  totalCards: number;
}
