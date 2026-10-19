/**
 * Salas: crear, unirse, opciones, empezar, salidas, expulsiones, anfitrión y limpieza. Todas las
 * operaciones son sincrónicas: Node procesa un evento por vez, así que cada una es atómica.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { createGame, makeRules, removePlayer, type GameEvent } from '@borracho/engine';
import {
  DEFAULT_ROOM_OPTIONS,
  PLAYER_LIMITS,
  gameError,
  roomError,
  sameName,
  type AppError,
  type RoomNotice,
  type RoomOptions,
  type SessionEndReason,
} from '@borracho/protocol';
import type { ServerConfig } from '../config.js';
import type { SessionService } from '../sessions/sessionService.js';
import { generateRoomCode } from './roomCode.js';
import type { RoomStore } from './roomStore.js';
import type { Room, RoomPlayer } from './types.js';

export interface RoomChange {
  readonly room: Room;
  readonly deleted: boolean;
  readonly notices: RoomNotice[];
  readonly gameEvents: GameEvent[];
  /** Jugadores con conexión activa cuya sesión terminó (para avisarles). */
  readonly endedPlayers: { playerId: string; reason: SessionEndReason }[];
}

export type Outcome<T> =
  | { readonly ok: true; readonly value: T; readonly change: RoomChange }
  | { readonly ok: false; readonly error: AppError };

export interface Entry {
  readonly room: Room;
  readonly player: RoomPlayer;
  readonly token: string;
}

type Reason = 'LEFT' | 'KICKED';

export class RoomService {
  constructor(
    private readonly store: RoomStore,
    private readonly sessions: SessionService,
    private readonly config: Pick<ServerConfig, 'hostGraceMs' | 'roomIdleTtlMs' | 'finishedRoomTtlMs'>,
    private readonly now: () => number = Date.now,
    private readonly codeGenerator: () => string = generateRoomCode,
  ) {}

  get(roomId: string): Room | undefined {
    return this.store.get(roomId);
  }

  getByCode(code: string): Room | undefined {
    return this.store.getByCode(code);
  }

  rooms(): IterableIterator<Room> {
    return this.store.all();
  }

  // -------------------------------------------------------------------------

  createRoom(name: string, maxPlayers: number, options: RoomOptions = DEFAULT_ROOM_OPTIONS): Outcome<Entry> {
    const now = this.now();
    const room: Room = {
      id: randomUUID(),
      code: this.uniqueCode(),
      hostPlayerId: '',
      maxPlayers,
      status: 'WAITING',
      players: [],
      options: { ...options },
      game: null,
      defenseEndsAt: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      emptySince: null,
      version: 0,
      testSeed: null,
    };
    const { player, token } = this.addPlayer(room, name);
    room.hostPlayerId = player.id;
    this.store.insert(room);
    return { ok: true, value: { room, player, token }, change: change(room) };
  }

  joinRoom(name: string, code: string): Outcome<Entry> {
    const room = this.store.getByCode(code);
    if (!room) return fail('ROOM_NOT_FOUND');
    if (room.status === 'FINISHED') return fail('ROOM_FINISHED');
    if (room.status === 'PLAYING') return fail('GAME_IN_PROGRESS');
    if (room.players.length >= room.maxPlayers) return fail('ROOM_FULL');
    if (room.players.some((p) => sameName(p.name, name))) return fail('NAME_TAKEN');

    const { player, token } = this.addPlayer(room, name);
    this.touch(room);
    return {
      ok: true,
      value: { room, player, token },
      change: change(room, { notices: [{ type: 'PLAYER_JOINED', playerId: player.id, name: player.name }] }),
    };
  }

  setCapacity(roomId: string, playerId: string, maxPlayers: number): Outcome<null> {
    const found = this.requireHost(roomId, playerId);
    if (!found.ok) return found;
    const room = found.value;
    if (room.status !== 'WAITING') return fail('WRONG_ROOM_STATUS');
    if (maxPlayers < room.players.length) return fail('CAPACITY_BELOW_PLAYERS');
    room.maxPlayers = maxPlayers;
    this.touch(room);
    return { ok: true, value: null, change: change(room) };
  }

  /** El anfitrión cambia las opciones antes de empezar (barra, tiempo para responder, mazo). */
  setOptions(roomId: string, playerId: string, options: Partial<RoomOptions>): Outcome<null> {
    const found = this.requireHost(roomId, playerId);
    if (!found.ok) return found;
    const room = found.value;
    if (room.status !== 'WAITING') return fail('WRONG_ROOM_STATUS');
    room.options = { ...room.options, ...options };
    this.touch(room);
    return { ok: true, value: null, change: change(room) };
  }

  /** Cualquiera que esté en la sala puede mandar un emoji; no cambia el estado. */
  canReact(roomId: string, playerId: string): Outcome<Room> {
    const room = this.store.get(roomId);
    if (!room || !room.players.some((p) => p.id === playerId)) return fail('NOT_IN_ROOM');
    return { ok: true, value: room, change: change(room) };
  }

  startGame(roomId: string, playerId: string): Outcome<null> {
    const found = this.requireHost(roomId, playerId);
    if (!found.ok) return found;
    const room = found.value;
    if (room.status !== 'WAITING') return fail('WRONG_ROOM_STATUS');
    if (room.players.length < PLAYER_LIMITS.min) return fail('NOT_ENOUGH_PLAYERS');
    if (room.players.some((p) => !p.isConnected)) return fail('PLAYERS_DISCONNECTED');

    // Las reglas quedan congeladas dentro del estado del motor. El azar lo pone el servidor.
    const rules = makeRules({ barMax: room.options.barMax, deckCopies: room.options.deckCopies });
    const seed = room.testSeed ?? randomInt(2 ** 32 - 1);
    const { state, events } = createGame({ players: room.players.map((p) => ({ id: p.id, name: p.name })), seed, rules });
    room.game = state;
    room.status = 'PLAYING';
    this.touch(room);
    return { ok: true, value: null, change: change(room, { notices: [{ type: 'GAME_STARTED' }], gameEvents: events }) };
  }

  /**
   * Terminada la partida, la misma sala (mismo código, mismos jugadores) vuelve a la espera para
   * jugar otra. La abre el anfitrión; si no está conectado, cualquiera de los que quedaron, y queda a
   * cargo. Las opciones siguen como en la partida anterior.
   */
  reopen(roomId: string, playerId: string): Outcome<null> {
    const room = this.store.get(roomId);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player) return fail('NOT_IN_ROOM');
    if (room.status !== 'FINISHED') return fail('WRONG_ROOM_STATUS');
    const host = room.players.find((p) => p.id === room.hostPlayerId);
    const notices: RoomNotice[] = [];
    if (host?.id !== playerId) {
      if (host?.isConnected) return fail('NOT_HOST');
      room.hostPlayerId = player.id;
      notices.push({ type: 'HOST_CHANGED', playerId: player.id, name: player.name });
    }
    room.status = 'WAITING';
    room.game = null;
    room.defenseEndsAt = null;
    room.finishedAt = null;
    room.testSeed = null;
    this.touch(room);
    return { ok: true, value: null, change: change(room, { notices }) };
  }

  /** Irse por voluntad propia. */
  leave(roomId: string, playerId: string): Outcome<null> {
    const room = this.store.get(roomId);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player) return fail('NOT_IN_ROOM');
    return this.removeFromRoom(room, player, 'LEFT');
  }

  /** El anfitrión saca a un jugador desconectado. */
  kick(roomId: string, hostId: string, targetId: string): Outcome<null> {
    const found = this.requireHost(roomId, hostId);
    if (!found.ok) return found;
    const room = found.value;
    if (room.status === 'FINISHED') return fail('WRONG_ROOM_STATUS');
    if (targetId === hostId) return fail('CANNOT_KICK_SELF');
    const target = room.players.find((p) => p.id === targetId);
    if (!target) return fail('PLAYER_NOT_FOUND');
    if (target.isConnected) return fail('PLAYER_STILL_CONNECTED');
    return this.removeFromRoom(room, target, 'KICKED');
  }

  markConnected(roomId: string, playerId: string): RoomChange | null {
    const room = this.store.get(roomId);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player) return null;
    // disconnectedAt es null en la primera conexión: no es una reconexión.
    const returning = !player.isConnected && player.disconnectedAt !== null;
    player.isConnected = true;
    player.disconnectedAt = null;
    room.emptySince = null;
    this.touch(room);
    return change(room, {
      notices: returning ? [{ type: 'PLAYER_RECONNECTED', playerId: player.id, name: player.name }] : [],
    });
  }

  /** Una desconexión no pasa el turno: solo se marca y se avisa. */
  markDisconnected(roomId: string, playerId: string): RoomChange | null {
    const room = this.store.get(roomId);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player || !player.isConnected) return null;
    const now = this.now();
    player.isConnected = false;
    player.disconnectedAt = now;
    if (room.players.every((p) => !p.isConnected)) room.emptySince = now;
    this.touch(room);
    return change(room, { notices: [{ type: 'PLAYER_DISCONNECTED', playerId: player.id, name: player.name }] });
  }

  /** Mantenimiento periódico: traspaso de anfitrión y borrado de salas abandonadas. */
  sweep(): RoomChange[] {
    const now = this.now();
    const changes: RoomChange[] = [];
    for (const room of [...this.store.all()]) {
      const expiredFinished = room.status === 'FINISHED' && room.finishedAt !== null && now - room.finishedAt >= this.config.finishedRoomTtlMs;
      const expiredIdle = room.emptySince !== null && now - room.emptySince >= this.config.roomIdleTtlMs;
      if (expiredFinished || expiredIdle) {
        changes.push(this.deleteRoom(room, 'ROOM_CLOSED'));
        continue;
      }
      // El anfitrión conserva el rol un rato; después pasa al siguiente conectado.
      const host = room.players.find((p) => p.id === room.hostPlayerId);
      if (
        room.status !== 'FINISHED' &&
        host &&
        !host.isConnected &&
        host.disconnectedAt !== null &&
        now - host.disconnectedAt >= this.config.hostGraceMs
      ) {
        const notice = this.transferHost(room, true);
        if (notice) {
          this.touch(room);
          changes.push(change(room, { notices: [notice] }));
        }
      }
    }
    return changes;
  }

  /** Marca la sala terminada si el motor dice que hay ganador. */
  settle(room: Room): void {
    if (room.game?.phase === 'finished' && room.status !== 'FINISHED') {
      room.status = 'FINISHED';
      room.finishedAt = this.now();
      room.defenseEndsAt = null;
    }
  }

  // -------------------------------------------------------------------------

  private removeFromRoom(room: Room, player: RoomPlayer, reason: Reason): Outcome<null> {
    const notices: RoomNotice[] = [
      { type: reason === 'KICKED' ? 'PLAYER_KICKED' : 'PLAYER_LEFT', playerId: player.id, name: player.name },
    ];
    let gameEvents: GameEvent[] = [];

    // En medio de la partida queda afuera como si hubiera quebrado; su lugar en la mesa se ve igual.
    if (room.status === 'PLAYING' && room.game) {
      const result = removePlayer(room.game, player.id);
      if (!result.ok) return { ok: false, error: gameError(result.error) };
      room.game = result.state;
      gameEvents = result.events;
      this.settle(room);
    }

    const seat = room.players.indexOf(player);
    room.players = room.players.filter((p) => p.id !== player.id);
    this.sessions.revoke(player.sessionHash);

    if (room.players.length === 0) {
      const deleted = this.deleteRoom(room, 'ROOM_CLOSED');
      return { ok: true, value: null, change: { ...deleted, notices, gameEvents } };
    }
    if (room.hostPlayerId === player.id) {
      const notice = this.transferHost(room, false, seat);
      if (notice) notices.push(notice);
    }
    if (room.players.every((p) => !p.isConnected)) room.emptySince ??= this.now();
    this.touch(room);
    return { ok: true, value: null, change: change(room, { notices, gameEvents }) };
  }

  /**
   * Pasa el rol al siguiente jugador en orden de asiento, prefiriendo a los conectados.
   * `departedSeat` es el asiento que dejó el anfitrión si ya salió.
   */
  private transferHost(room: Room, onlyConnected: boolean, departedSeat?: number): RoomNotice | null {
    let ordered: RoomPlayer[];
    if (departedSeat !== undefined) {
      ordered = [...room.players.slice(departedSeat), ...room.players.slice(0, departedSeat)];
    } else {
      const seat = room.players.findIndex((p) => p.id === room.hostPlayerId);
      ordered = [...room.players.slice(seat + 1), ...room.players.slice(0, Math.max(seat, 0))];
    }
    ordered = ordered.filter((p) => p.id !== room.hostPlayerId);
    const next = ordered.find((p) => p.isConnected) ?? (onlyConnected ? undefined : ordered[0]);
    if (!next) return null;
    room.hostPlayerId = next.id;
    return { type: 'HOST_CHANGED', playerId: next.id, name: next.name };
  }

  private deleteRoom(room: Room, reason: SessionEndReason): RoomChange {
    const connected = room.players.filter((p) => p.isConnected);
    for (const p of room.players) this.sessions.revoke(p.sessionHash);
    this.store.delete(room.id);
    return { ...change(room), deleted: true, endedPlayers: connected.map((p) => ({ playerId: p.id, reason })) };
  }

  private addPlayer(room: Room, name: string): { player: RoomPlayer; token: string } {
    const id = `j${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const { token, hash } = this.sessions.issue({ roomId: room.id, playerId: id });
    const now = this.now();
    // Arranca desconectado: se marca conectado cuando el socket queda asociado.
    const player: RoomPlayer = { id, name, sessionHash: hash, isConnected: false, disconnectedAt: null, joinedAt: now };
    room.players.push(player);
    return { player, token };
  }

  private requireHost(roomId: string, playerId: string): { ok: true; value: Room } | { ok: false; error: AppError } {
    const room = this.store.get(roomId);
    if (!room || !room.players.some((p) => p.id === playerId)) return fail('NOT_IN_ROOM');
    if (room.hostPlayerId !== playerId) return fail('NOT_HOST');
    return { ok: true, value: room };
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = this.codeGenerator();
      if (!this.store.getByCode(code)) return code;
    }
    throw new Error('No se pudo generar un código de sala único');
  }

  touch(room: Room): void {
    room.version++;
    room.updatedAt = this.now();
  }
}

function change(room: Room, extra: Partial<Pick<RoomChange, 'notices' | 'gameEvents'>> = {}): RoomChange {
  return { room, deleted: false, notices: extra.notices ?? [], gameEvents: extra.gameEvents ?? [], endedPlayers: [] };
}

function fail(code: Parameters<typeof roomError>[0]): { ok: false; error: AppError } {
  return { ok: false, error: roomError(code) };
}
