import type { GameState } from '@borracho/engine';
import type { RoomOptions, RoomStatus } from '@borracho/protocol';

/** La sala. Vive solo en el servidor. */
export interface RoomPlayer {
  readonly id: string;
  name: string;
  /** Hash SHA-256 del token de sesión. El token en claro nunca se guarda. */
  sessionHash: string;
  isConnected: boolean;
  disconnectedAt: number | null;
  readonly joinedAt: number;
}

export interface Room {
  readonly id: string;
  readonly code: string;
  hostPlayerId: string;
  maxPlayers: number;
  status: RoomStatus;
  /** En orden de asiento. */
  players: RoomPlayer[];
  options: RoomOptions;
  /** Estado del motor. null en la sala de espera. */
  game: GameState | null;
  /** Hasta cuándo tiene para responder el que tiene un cóctel enfrente. */
  defenseEndsAt: number | null;
  readonly createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  /** Desde cuándo no hay nadie conectado. */
  emptySince: number | null;
  version: number;
  /** Semilla fija para la próxima partida (solo ganchos de prueba). */
  testSeed: number | null;
}
