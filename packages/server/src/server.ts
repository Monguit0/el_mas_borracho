import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { PLAYER_LIMITS } from '@borracho/protocol';
import type { ServerConfig } from './config.js';
import { ConnectionService } from './connection/connectionService.js';
import { GameService } from './game/gameService.js';
import { createApp } from './http/app.js';
import { consoleLogger, type Logger } from './logger.js';
import { InMemoryRoomStore, type RoomStore } from './rooms/roomStore.js';
import { RoomService } from './rooms/roomService.js';
import type { Room } from './rooms/types.js';
import { RateLimiter } from './security/rateLimiter.js';
import { SessionService } from './sessions/sessionService.js';
import { createBroadcaster, createDefenseWatcher, registerSocketHandlers, type GameServer } from './socket/socketHandlers.js';
import { ValidationService } from './validation/validationService.js';

export interface ServerOptions {
  readonly now?: () => number;
  readonly store?: RoomStore;
  readonly log?: Logger;
}

export interface BorrachoServer {
  readonly http: HttpServer;
  readonly io: GameServer;
  readonly rooms: RoomService;
  readonly sessions: SessionService;
  readonly connections: ConnectionService;
  listen(port?: number, host?: string): Promise<number>;
  /** Hace el mantenimiento de salas ya (las pruebas no esperan al intervalo). */
  sweep(): void;
  close(): Promise<void>;
}

export function createBorrachoServer(config: ServerConfig, options: ServerOptions = {}): BorrachoServer {
  const now = options.now ?? Date.now;
  const log = options.log ?? consoleLogger;
  const sessions = new SessionService();
  const rooms = new RoomService(options.store ?? new InMemoryRoomStore(), sessions, config, now);
  const connections = new ConnectionService();
  const games = new GameService(rooms, config, now);
  const validation = new ValidationService(config.nameMaxLength, PLAYER_LIMITS);
  const limits = {
    actions: RateLimiter.perSecond(config.rateLimits.actionsPerSecond, config.rateLimits.actionsBurst, now),
    entries: RateLimiter.perMinute(config.rateLimits.entriesPerMinute, config.rateLimits.entriesBurst, now),
    reactions: RateLimiter.perSecond(config.rateLimits.reactionsPerSecond, config.rateLimits.reactionsBurst, now),
  };

  // Los ganchos de prueba necesitan el servidor de sockets, que se crea después.
  let ioRef: GameServer | null = null;
  const dropConnection = (roomId: string, playerId: string) => {
    const socketId = connections.socketOf({ roomId, playerId });
    const socket = socketId ? ioRef?.sockets.sockets.get(socketId) : undefined;
    // Cerrar el transporte imita una caída de red: el celular reintenta solo.
    socket?.conn.close();
    return Boolean(socket);
  };
  let broadcastRef: ReturnType<typeof createBroadcaster> | null = null;
  const pushRoom = (room: Room) => broadcastRef?.({ room, deleted: false, notices: [], gameEvents: [], endedPlayers: [] });
  const app = createApp({ config, rooms, log, dropConnection, pushRoom });
  const http = createHttpServer(app);
  const io: GameServer = new Server(http, {
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10_000,
    pingTimeout: 10_000,
    cors: config.clientOrigin ? { origin: config.clientOrigin } : undefined,
  });

  ioRef = io;
  const deps = { io, config, rooms, sessions, connections, games, validation, limits, log };
  const broadcast = createBroadcaster(deps);
  broadcastRef = broadcast;
  const defense = createDefenseWatcher(deps, broadcast);
  registerSocketHandlers(deps, broadcast, defense.watch);

  const sweep = () => {
    for (const change of rooms.sweep()) broadcast(change);
    limits.actions.prune();
    limits.entries.prune();
    limits.reactions.prune();
  };
  const timer = setInterval(sweep, config.sweepIntervalMs);
  timer.unref();

  return {
    http,
    io,
    rooms,
    sessions,
    connections,
    sweep,
    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, host, () => resolve((http.address() as AddressInfo).port));
      });
    },
    async close() {
      clearInterval(timer);
      defense.clear();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
