/**
 * Vistas: lo único que el celular recibe. Nunca incluyen tokens, el mazo, la semilla ni la mano de otro.
 * La partida la arma el motor (playerView) según la borrachera de cada uno.
 */
import type { PlayerView as GamePlayerView } from '@borracho/engine';
import type { RoomOptions } from './options.js';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface RoomPlayerView {
  readonly id: string;
  readonly name: string;
  readonly seatIndex: number;
  readonly isHost: boolean;
  readonly isConnected: boolean;
}

export type GameView = GamePlayerView & {
  /** Hasta cuándo puede responder el que tiene el cóctel enfrente (ms desde 1970), o null. */
  readonly defenseEndsAt: number | null;
};

export interface RoomView {
  readonly code: string;
  readonly status: RoomStatus;
  readonly hostPlayerId: string;
  readonly maxPlayers: number;
  readonly minPlayers: number;
  /** En orden de asiento. Si alguien se fue en medio de la partida, sigue en game.players. */
  readonly players: readonly RoomPlayerView[];
  readonly options: RoomOptions;
  readonly game: GameView | null;
  readonly createdAt: number;
  /** Aumenta con cada cambio; el celular descarta vistas más viejas. */
  readonly version: number;
}
