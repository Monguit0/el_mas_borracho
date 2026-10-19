/**
 * Las jugadas sobre una sala: traduce los handles de cartas que manda el celular a ids, aplica el
 * motor y lleva el reloj de la respuesta. El servidor es la única autoridad: el azar y las cuentas
 * son del motor.
 */
import { applyAction, resolveHandles, type Action, type GameEvent } from '@borracho/engine';
import { gameError, handlesOf, roomError, type AppError, type WireAction } from '@borracho/protocol';
import type { ServerConfig } from '../config.js';
import type { RoomService } from '../rooms/roomService.js';
import type { Room } from '../rooms/types.js';

export type GameOutcome = { readonly ok: true; readonly events: GameEvent[] } | { readonly ok: false; readonly error: AppError };

export class GameService {
  constructor(
    private readonly rooms: RoomService,
    private readonly config: Pick<ServerConfig, 'defenseTimeoutMs'>,
    private readonly now: () => number = Date.now,
  ) {}

  act(room: Room, playerId: string, wire: WireAction): GameOutcome {
    const game = room.game;
    if (!game || room.status !== 'PLAYING') return { ok: false, error: roomError('WRONG_ROOM_STATUS') };
    const handles = handlesOf(wire);
    const ids = handles.length > 0 ? resolveHandles(game, playerId, [...handles]) : [];
    // Un handle viejo (cambió el turno o tu alcohol) o inventado: no se adivina qué carta era.
    if (!ids) return { ok: false, error: roomError('CARDS_CHANGED') };
    return this.apply(room, playerId, toAction(wire, ids));
  }

  /** Se venció el tiempo para responder: se lo toma. */
  autoDrink(room: Room): GameOutcome {
    const target = room.game?.phase === 'defense' ? room.game.pending?.targetId : undefined;
    if (!target || room.status !== 'PLAYING') return { ok: false, error: roomError('WRONG_ROOM_STATUS') };
    return this.apply(room, target, { type: 'RESPOND', choice: 'drink' });
  }

  /** Cuánto tiene para responder el que tiene el cóctel enfrente. */
  defenseMs(room: Room): number {
    return this.config.defenseTimeoutMs ?? room.options.defenseSeconds * 1000;
  }

  private apply(room: Room, playerId: string, action: Action): GameOutcome {
    const result = applyAction(room.game!, playerId, action);
    if (!result.ok) return { ok: false, error: gameError(result.error) };
    room.game = result.state;
    // Cada jugada que deja un cóctel esperando respuesta es un rival nuevo: arranca su reloj.
    room.defenseEndsAt = result.state.phase === 'defense' ? this.now() + this.defenseMs(room) : null;
    this.rooms.settle(room);
    this.rooms.touch(room);
    return { ok: true, events: result.events };
  }
}

function toAction(wire: WireAction, ids: string[]): Action {
  switch (wire.type) {
    case 'SWAP':
      return { type: 'SWAP', cardId: ids[0]! };
    case 'SHOT':
    case 'MATCH_DISCARD':
      return { type: wire.type, cardIds: ids };
    case 'ASK_INGREDIENT':
      return { type: 'ASK_INGREDIENT', cardIds: ids, names: [...wire.names] };
    case 'MAKE_COCKTAIL':
      return {
        type: 'MAKE_COCKTAIL',
        cocktailCode: wire.cocktailCode,
        cardIds: ids,
        targetId: wire.targetId,
        ...(wire.specialIds ? { specialIds: [...wire.specialIds] } : {}),
      };
    case 'END_TURN':
      return { type: 'END_TURN', discardIds: ids };
    case 'RESPOND':
      if (wire.choice === 'drink') return { type: 'RESPOND', choice: 'drink' };
      return {
        type: 'RESPOND',
        choice: 'special',
        specialId: wire.specialId,
        ...(wire.counter ? { counter: { cocktailCode: wire.counter.cocktailCode, cardIds: ids } } : {}),
      };
    default:
      return wire;
  }
}
