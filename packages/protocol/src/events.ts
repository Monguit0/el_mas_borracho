/**
 * Eventos de Socket.IO. Toda acción del celular usa acknowledgement: recibe { ok: true, data } o
 * { ok: false, error } y nunca queda sin respuesta. El estado completo llega siempre por
 * "room:state"; los eventos de la partida sirven para animaciones y carteles.
 */
import type { GameEvent } from '@borracho/engine';
import type { AppError } from './errors.js';
import type { RoomOptions } from './options.js';
import type { Reaction } from './reactions.js';
import type { RoomView } from './views.js';

export type Ack<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: AppError };
export type AckCallback<T> = (response: Ack<T>) => void;

/** Lo que recibe quien crea, se une o vuelve. El token es secreto: solo lo ve su dueño. */
export interface SessionGrant {
  readonly token: string;
  readonly playerId: string;
  readonly room: RoomView;
}

export interface CreateRoomPayload {
  readonly name: string;
  readonly maxPlayers?: number;
  readonly options?: Partial<RoomOptions>;
}
export interface JoinRoomPayload {
  readonly name: string;
  readonly code: string;
}
export interface ResumePayload {
  readonly token: string;
  /** true para tomar la sesión aunque esté abierta en otra pestaña. */
  readonly takeover?: boolean;
}

export type RoomNotice =
  | { readonly type: 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'PLAYER_KICKED'; readonly playerId: string; readonly name: string }
  | { readonly type: 'PLAYER_DISCONNECTED' | 'PLAYER_RECONNECTED'; readonly playerId: string; readonly name: string }
  | { readonly type: 'HOST_CHANGED'; readonly playerId: string; readonly name: string }
  | { readonly type: 'GAME_STARTED' };

export type SessionEndReason = 'KICKED' | 'REPLACED' | 'ROOM_CLOSED';

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: AckCallback<SessionGrant>) => void;
  'room:join': (payload: JoinRoomPayload, ack: AckCallback<SessionGrant>) => void;
  'session:resume': (payload: ResumePayload, ack: AckCallback<SessionGrant>) => void;
  'room:leave': (payload: Record<string, never>, ack: AckCallback<null>) => void;
  'room:setCapacity': (payload: { readonly maxPlayers: number }, ack: AckCallback<null>) => void;
  /** Solo el anfitrión y solo en la sala de espera. Cambia las opciones que se manden. */
  'room:setOptions': (payload: Partial<RoomOptions>, ack: AckCallback<null>) => void;
  'room:react': (payload: { readonly emoji: string }, ack: AckCallback<null>) => void;
  'room:start': (payload: Record<string, never>, ack: AckCallback<null>) => void;
  /** Con la partida terminada: la misma sala vuelve a la espera para jugar otra. */
  'room:reopen': (payload: Record<string, never>, ack: AckCallback<null>) => void;
  'room:kick': (payload: { readonly playerId: string }, ack: AckCallback<null>) => void;
  /** Una jugada (WireAction). */
  'game:action': (payload: unknown, ack: AckCallback<null>) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'game:events': (batch: { readonly version: number; readonly events: readonly GameEvent[] }) => void;
  'room:notice': (notice: RoomNotice) => void;
  'room:reaction': (reaction: Reaction) => void;
  'session:ended': (payload: { readonly reason: SessionEndReason }) => void;
}

/** Respuesta de GET /api/config. */
export interface PublicConfig {
  readonly nameMaxLength: number;
  readonly players: { readonly min: number; readonly max: number };
  readonly options: RoomOptions;
}
