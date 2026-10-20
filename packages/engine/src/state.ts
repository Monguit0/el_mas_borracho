import type { Card } from './cards.js';

export interface Rules {
  readonly startChips: number;
  /** Lo que pone cada uno en el pozo al empezar la ronda. */
  readonly ante: number;
  /** Rondas de la partida. Al final gana el que tenga más fichas. */
  readonly rounds: number;
}

export const DEFAULT_RULES: Rules = Object.freeze({ startChips: 10, ante: 1, rounds: 10 });

export function makeRules(overrides: Partial<Rules> = {}): Rules {
  return Object.freeze({ ...DEFAULT_RULES, ...overrides });
}

export interface HandCard {
  readonly card: Card;
  /** Boca abajo: solo la ve el dueño (y los que la espiaron). */
  hidden: boolean;
  /** Dada vuelta para todos. */
  revealed: boolean;
  /** Los que la vieron aunque esté boca abajo. */
  seenBy: string[];
}

/** waiting: todavía no jugó · playing: es su turno · stood: se plantó · busted: se pasó · out: fuera de la partida. */
export type SeatStatus = 'waiting' | 'playing' | 'stood' | 'busted' | 'out';

export type OutReason = 'fundido' | 'abandono';

export interface PlayerState {
  readonly id: string;
  readonly name: string;
  chips: number;
  outReason: OutReason | null;
  // --- De la ronda ---
  status: SeatStatus;
  cards: HandCard[];
  /** Ajuste del total por Soborno o Apagafuegos. */
  adjust: number;
  /** Ya jugó su turno en esta ronda (para volver con Indulto). */
  played: boolean;
  hitsThisTurn: number;
  /** Cerrojo: cuántas cartas puede pedir en su turno (null = sin límite). */
  maxHits: number | null;
  /** Manta: efectos de rivales que todavía frena. */
  blankets: number;
  /** Escudo: ningún efecto de rival lo toca en la ronda. */
  shield: boolean;
  loan: boolean;
  cursed: boolean;
  partnerId: string | null;
  usedBribe: boolean;
  usedFirefighter: boolean;
  announced21: boolean;
  /** Fichas al empezar la ronda (para mostrar cuánto ganó o perdió). */
  chipsAtStart: number;
}

export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
  /** Carta para mostrar (por ejemplo, la que se espió). Solo la ve el que elige. */
  readonly card?: Card;
}

export interface Pending {
  readonly playerId: string;
  /** La carta que activó la elección. */
  readonly sourceId: string;
  /** El efecto que se está resolviendo (puede ser otro si es Espejo). */
  readonly effectId: string;
  readonly step: number;
  readonly prompt: string;
  readonly options: readonly ChoiceOption[];
  readonly data: Readonly<Record<string, string>>;
}

export interface RoundResult {
  readonly playerId: string;
  readonly total: number;
  readonly busted: boolean;
  readonly winner: boolean;
  /** Fichas ganadas o perdidas en la ronda (con la apuesta). */
  readonly delta: number;
  readonly note: string | null;
}

export type Phase = 'playing' | 'roundOver' | 'finished';

export interface GameState {
  readonly rules: Rules;
  players: PlayerState[];
  round: number;
  phase: Phase;
  /** El tope del mazo es el final del arreglo. */
  deck: Card[];
  discard: Card[];
  /** Orden de juego de la ronda (ids). */
  order: string[];
  currentId: string | null;
  pending: Pending | null;
  pot: number;
  /** El último efecto "al pedir" que se activó en la ronda (para Espejo). */
  lastEffectId: string | null;
  results: RoundResult[] | null;
  winnerId: string | null;
  /** Mensajes públicos recientes, para el que entra o vuelve. */
  log: string[];
  /** Estado del azar. Nunca sale del servidor. */
  rngState: number;
}
