import { playerView } from '@borracho/engine';
import { PLAYER_LIMITS, type RoomView } from '@borracho/protocol';
import type { Room } from './types.js';

/**
 * La sala como la ve un jugador. Lo de la sala es igual para todos; la partida la arma el motor para
 * cada uno (su mano, según su borrachera). No incluye hashes de sesión ni nada interno.
 */
export function toRoomView(room: Room, viewerId: string): RoomView {
  const game = room.game;
  const inGame = game?.players.some((p) => p.id === viewerId) ?? false;
  return {
    code: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    maxPlayers: room.maxPlayers,
    minPlayers: PLAYER_LIMITS.min,
    players: room.players.map((p, seatIndex) => ({
      id: p.id,
      name: p.name,
      seatIndex,
      isHost: p.id === room.hostPlayerId,
      isConnected: p.isConnected,
    })),
    options: room.options,
    game: game && inGame ? { ...playerView(game, viewerId), defenseEndsAt: room.defenseEndsAt } : null,
    createdAt: room.createdAt,
    version: room.version,
  };
}
