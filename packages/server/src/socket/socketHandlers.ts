/**
 * Eventos de Socket.IO. Cada handler:
 * 1. aplica el límite de pedidos,
 * 2. valida el payload con un esquema estricto,
 * 3. identifica al jugador por la conexión (nunca por lo que diga el payload),
 * 4. hace la operación de forma sincrónica (atómica),
 * 5. responde por acknowledgement y manda a cada uno su vista.
 */
import type { Server, Socket } from 'socket.io';
import { eventsForViewer } from '@borracho/engine';
import {
  DEFAULT_ROOM_OPTIONS,
  roomError,
  type Ack,
  type AppError,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionGrant,
} from '@borracho/protocol';
import type { ServerConfig } from '../config.js';
import type { ConnectionService } from '../connection/connectionService.js';
import type { GameService } from '../game/gameService.js';
import type { Logger } from '../logger.js';
import type { RoomChange, RoomService } from '../rooms/roomService.js';
import { toRoomView } from '../rooms/roomView.js';
import type { Room } from '../rooms/types.js';
import type { RateLimiter } from '../security/rateLimiter.js';
import type { SessionService } from '../sessions/sessionService.js';
import type { ValidationService } from '../validation/validationService.js';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface SocketDeps {
  readonly io: GameServer;
  readonly config: ServerConfig;
  readonly rooms: RoomService;
  readonly sessions: SessionService;
  readonly connections: ConnectionService;
  readonly games: GameService;
  readonly validation: ValidationService;
  readonly limits: { readonly actions: RateLimiter; readonly entries: RateLimiter; readonly reactions: RateLimiter };
  readonly log: Logger;
}

type Handled<T> = { ack: Ack<T>; after?: () => void };

export function createBroadcaster({ io, connections }: Pick<SocketDeps, 'io' | 'connections'>) {
  return function broadcast(change: RoomChange): void {
    const { room } = change;
    // Cada jugador recibe su propia vista: sus cartas, y de los demás solo las que se ven.
    const viewers = room.players.flatMap((p) => {
      const socketId = connections.socketOf({ roomId: room.id, playerId: p.id });
      const socket = socketId ? io.sockets.sockets.get(socketId) : undefined;
      return socket ? [{ playerId: p.id, socket }] : [];
    });
    const game = room.game;
    if (change.gameEvents.length > 0 && game) {
      for (const { playerId, socket } of viewers) {
        if (!game.players.some((p) => p.id === playerId)) continue;
        socket.emit('game:events', { version: room.version, events: eventsForViewer(game, playerId, change.gameEvents) });
      }
    }
    for (const notice of change.notices) io.to(room.id).emit('room:notice', notice);
    if (!change.deleted) for (const { playerId, socket } of viewers) socket.emit('room:state', toRoomView(room, playerId));
    for (const ended of change.endedPlayers) {
      const socketId = connections.socketOf({ roomId: room.id, playerId: ended.playerId });
      if (!socketId) continue;
      connections.unbind(socketId);
      const socket = io.sockets.sockets.get(socketId);
      socket?.emit('session:ended', { reason: ended.reason });
      void socket?.leave(room.id);
    }
  };
}

/** El reloj del turno: si el del turno no juega a tiempo, se planta; si nadie arranca la próxima ronda, arranca sola. */
export function createDeadlineWatcher({ rooms, games }: Pick<SocketDeps, 'rooms' | 'games'>, broadcast: (change: RoomChange) => void) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const watch = (room: Room): void => {
    const previous = timers.get(room.id);
    if (previous) clearTimeout(previous);
    timers.delete(room.id);
    if (room.status !== 'PLAYING' || room.deadline === null || room.deadlineKey === null) return;
    const key = room.deadlineKey;
    const timer = setTimeout(() => {
      timers.delete(room.id);
      if (rooms.get(room.id) !== room || room.deadlineKey !== key) return;
      const result = games.timeout(room);
      if (!result.ok) return;
      broadcast({ room, deleted: false, notices: [], gameEvents: result.events, endedPlayers: [] });
      watch(room);
    }, Math.max(0, room.deadline - games.now()));
    timer.unref();
    timers.set(room.id, timer);
  };
  return {
    watch,
    clear() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

export function registerSocketHandlers(deps: SocketDeps, broadcast: (change: RoomChange) => void, watchDeadline: (room: Room) => void): void {
  const { io, config, rooms, sessions, connections, games, validation, limits, log } = deps;
  let reactionSeq = 0;

  /** Difunde un cambio de sala y, si la partida sigue, mira el reloj del turno. */
  const publish = (change: RoomChange) => {
    if (!change.deleted) games.syncDeadline(change.room);
    broadcast(change);
    if (!change.deleted) watchDeadline(change.room);
  };

  io.on('connection', (socket: GameSocket) => {
    const ip = clientIp(socket, config.trustProxy);

    const handle = <T>(
      event: keyof ClientToServerEvents,
      bucket: 'actions' | 'entries' | 'reactions',
      fn: (payload: unknown) => Handled<T>,
    ) => {
      socket.on(event, ((payload: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        const respond = ack as (response: Ack<T>) => void;
        const key = bucket === 'entries' ? `ip:${ip}` : `socket:${socket.id}`;
        if (!limits[bucket].take(key)) return respond(failure(roomError('RATE_LIMITED')));
        let result: Handled<T>;
        try {
          result = fn(payload);
        } catch (error) {
          log.error(`Error en ${event}`, error);
          return respond(failure(roomError('INTERNAL')));
        }
        respond(result.ack);
        result.after?.();
      }) as never);
    };

    const currentRoom = (): { room: Room; playerId: string } | AppError => {
      const binding = connections.bindingOf(socket.id);
      const room = binding && rooms.get(binding.roomId);
      if (!binding || !room) return roomError('NOT_IN_ROOM');
      return { room, playerId: binding.playerId };
    };

    /** Asocia la conexión al jugador y lo marca conectado. */
    const attach = (room: Room, playerId: string): RoomChange | null => {
      const previous = connections.bindingOf(socket.id);
      if (previous && (previous.roomId !== room.id || previous.playerId !== playerId)) detach();
      connections.bind(socket.id, { roomId: room.id, playerId });
      void socket.join(room.id);
      return rooms.markConnected(room.id, playerId);
    };

    /** Suelta la conexión actual (sin sacar al jugador de la sala). */
    const detach = () => {
      const binding = connections.unbind(socket.id);
      if (!binding) return;
      void socket.leave(binding.roomId);
      const change = rooms.markDisconnected(binding.roomId, binding.playerId);
      if (change) broadcast(change);
    };

    const grant = (room: Room, playerId: string, token: string): Ack<SessionGrant> => ({
      ok: true,
      data: { token, playerId, room: toRoomView(room, playerId) },
    });

    /** Los handlers de la sala que solo devuelven ok y difunden el cambio. */
    const simple = <I>(
      event: keyof ClientToServerEvents,
      parse: (payload: unknown) => { ok: true; value: I } | { ok: false; error: AppError },
      run: (room: Room, playerId: string, input: I) => { ok: true; change: RoomChange } | { ok: false; error: AppError },
    ) =>
      handle<null>(event, 'actions', (payload) => {
        const input = parse(payload);
        if (!input.ok) return { ack: failure(input.error) };
        const current = currentRoom();
        if ('code' in current) return { ack: failure(current) };
        const result = run(current.room, current.playerId, input.value);
        if (!result.ok) return { ack: failure(result.error) };
        return { ack: success(), after: () => publish(result.change) };
      });

    // --- Entrar ---

    handle<SessionGrant>('room:create', 'entries', (payload) => {
      const input = validation.createRoom(payload);
      if (!input.ok) return { ack: failure(input.error) };
      if (connections.bindingOf(socket.id)) return { ack: failure(roomError('ALREADY_IN_ROOM')) };
      const options = { ...DEFAULT_ROOM_OPTIONS, ...input.value.options };
      const result = rooms.createRoom(input.value.name, input.value.maxPlayers, options);
      if (!result.ok) return { ack: failure(result.error) };
      const { room, player, token } = result.value;
      attach(room, player.id);
      log.info(`Sala ${room.code} creada`);
      return { ack: grant(room, player.id, token) };
    });

    handle<SessionGrant>('room:join', 'entries', (payload) => {
      const input = validation.joinRoom(payload);
      if (!input.ok) return { ack: failure(input.error) };
      if (connections.bindingOf(socket.id)) return { ack: failure(roomError('ALREADY_IN_ROOM')) };
      const result = rooms.joinRoom(input.value.name, input.value.code);
      if (!result.ok) return { ack: failure(result.error) };
      const { room, player, token } = result.value;
      attach(room, player.id);
      return { ack: grant(room, player.id, token), after: () => broadcast(result.change) };
    });

    handle<SessionGrant>('session:resume', 'entries', (payload) => {
      const input = validation.resume(payload);
      if (!input.ok) return { ack: failure(input.error) };
      const target = sessions.resolve(input.value.token);
      const room = target && rooms.get(target.roomId);
      if (!target || !room || !room.players.some((p) => p.id === target.playerId)) {
        return { ack: failure(roomError('SESSION_NOT_FOUND')) };
      }

      const existing = connections.socketOf(target);
      if (existing && existing !== socket.id) {
        const other = io.sockets.sockets.get(existing);
        if (other?.connected) {
          if (!input.value.takeover) return { ack: failure(roomError('SESSION_IN_USE')) };
          // La pestaña nueva se queda con la sesión; la vieja recibe el aviso.
          connections.unbind(existing);
          void other.leave(room.id);
          other.emit('session:ended', { reason: 'REPLACED' });
        } else {
          connections.unbind(existing);
        }
      }
      const change = attach(room, target.playerId);
      return { ack: grant(room, target.playerId, input.value.token), after: () => change && broadcast(change) };
    });

    // --- Sala de espera ---

    handle<null>('room:leave', 'actions', (payload) => {
      const input = validation.empty(payload);
      if (!input.ok) return { ack: failure(input.error) };
      const current = currentRoom();
      if ('code' in current) return { ack: failure(current) };
      const result = rooms.leave(current.room.id, current.playerId);
      if (!result.ok) return { ack: failure(result.error) };
      connections.unbind(socket.id);
      void socket.leave(current.room.id);
      return { ack: success(), after: () => publish(result.change) };
    });

    simple('room:setCapacity', (p) => validation.setCapacity(p), (room, playerId, max) => rooms.setCapacity(room.id, playerId, max));
    simple('room:setOptions', (p) => validation.options(p), (room, playerId, options) => rooms.setOptions(room.id, playerId, options));
    simple('room:kick', (p) => validation.kick(p), (room, playerId, target) => rooms.kick(room.id, playerId, target));
    simple('room:reopen', (p) => validation.empty(p), (room, playerId) => rooms.reopen(room.id, playerId));
    simple('room:start', (p) => validation.empty(p), (room, playerId) => {
      const result = rooms.startGame(room.id, playerId);
      if (result.ok) log.info(`Sala ${room.code}: empieza la partida con ${room.players.length} jugadores`);
      return result;
    });

    handle<null>('room:react', 'reactions', (payload) => {
      const input = validation.react(payload);
      if (!input.ok) return { ack: failure(input.error) };
      const current = currentRoom();
      if ('code' in current) return { ack: failure(current) };
      const result = rooms.canReact(current.room.id, current.playerId);
      if (!result.ok) return { ack: failure(result.error) };
      const reaction = { id: `r${++reactionSeq}`, playerId: current.playerId, emoji: input.value };
      return { ack: success(), after: () => io.to(current.room.id).emit('room:reaction', reaction) };
    });

    // --- Juego ---

    handle<null>('game:action', 'actions', (payload) => {
      const input = validation.gameAction(payload);
      if (!input.ok) return { ack: failure(input.error) };
      const current = currentRoom();
      if ('code' in current) return { ack: failure(current) };
      const { room, playerId } = current;
      const result = games.act(room, playerId, input.value);
      if (!result.ok) return { ack: failure(result.error) };
      if (room.status === 'FINISHED') log.info(`Sala ${room.code}: partida terminada`);
      return {
        ack: success(),
        after: () => publish({ room, deleted: false, notices: [], gameEvents: result.events, endedPlayers: [] }),
      };
    });

    socket.on('disconnect', () => {
      limits.actions.forget(`socket:${socket.id}`);
      limits.reactions.forget(`socket:${socket.id}`);
      detach();
    });
  });
}

function success(): Ack<null> {
  return { ok: true, data: null };
}

function failure<T>(error: AppError): Ack<T> {
  return { ok: false, error };
}

function clientIp(socket: GameSocket, trustProxy: boolean): string {
  if (trustProxy) {
    // Cloudflare (incluido un túnel de cloudflared) manda la IP real en su propio encabezado.
    const cloudflare = socket.handshake.headers['cf-connecting-ip'];
    if (typeof cloudflare === 'string' && cloudflare.trim()) return cloudflare.trim();
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address;
}
