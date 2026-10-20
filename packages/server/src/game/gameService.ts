/**
 * Las jugadas sobre una sala: aplica el motor y lleva el reloj del turno. El servidor es la única
 * autoridad: el azar y las cuentas son del motor.
 */
import { applyAction, timeoutAction, type Action, type GameEvent } from '@borracho/engine';
import { gameError, roomError, type AppError, type WireAction } from '@borracho/protocol';
import type { ServerConfig } from '../config.js';
import type { RoomService } from '../rooms/roomService.js';
import type { Room } from '../rooms/types.js';

export type GameOutcome = { readonly ok: true; readonly events: GameEvent[] } | { readonly ok: false; readonly error: AppError };

export class GameService {
  constructor(
    private readonly rooms: RoomService,
    private readonly config: Pick<ServerConfig, 'turnTimeoutMs' | 'roundPauseMs'>,
    readonly now: () => number = Date.now,
  ) {}

  act(room: Room, playerId: string, wire: WireAction): GameOutcome {
    if (!room.game || room.status !== 'PLAYING') return { ok: false, error: roomError('WRONG_ROOM_STATUS') };
    return this.apply(room, playerId, wire);
  }

  /** Se venció el reloj: el del turno se planta (o elige la primera opción), o arranca la próxima ronda. */
  timeout(room: Room): GameOutcome {
    const next = room.game && room.status === 'PLAYING' ? timeoutAction(room.game) : null;
    if (!next) return { ok: false, error: roomError('WRONG_ROOM_STATUS') };
    return this.apply(room, next.playerId, next.action);
  }

  /** Pone en hora el reloj: arranca de nuevo solo si cambió el turno, la elección o la ronda. */
  syncDeadline(room: Room): void {
    const game = room.game;
    if (!game || room.status !== 'PLAYING' || game.phase === 'finished') {
      room.deadline = null;
      room.deadlineKey = null;
      return;
    }
    const key = `${game.round}:${game.phase}:${game.currentId ?? ''}:${game.pending?.effectId ?? ''}:${game.pending?.step ?? 0}`;
    if (key === room.deadlineKey) return;
    room.deadlineKey = key;
    room.deadline = this.now() + (game.phase === 'roundOver' ? this.config.roundPauseMs : this.turnMs(room));
  }

  turnMs(room: Room): number {
    return this.config.turnTimeoutMs ?? room.options.turnSeconds * 1000;
  }

  private apply(room: Room, playerId: string, action: Action): GameOutcome {
    const result = applyAction(room.game!, playerId, action);
    if (!result.ok) return { ok: false, error: gameError(result.error) };
    room.game = result.state;
    this.rooms.settle(room);
    this.syncDeadline(room);
    this.rooms.touch(room);
    return { ok: true, events: result.events };
  }
}
