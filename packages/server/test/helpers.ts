import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, RoomView, ServerToClientEvents, SessionGrant } from '@borracho/protocol';
import { testConfig, type ServerConfig } from '../src/config.js';
import { silentLogger } from '../src/logger.js';
import { createBorrachoServer, type BorrachoServer } from '../src/server.js';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class Clock {
  constructor(public value = 1_700_000_000_000) {}
  now = () => this.value;
  advance(ms: number) {
    this.value += ms;
  }
}

export interface TestServer {
  server: BorrachoServer;
  url: string;
  clock: Clock;
  clients: ClientSocket[];
  client(headers?: Record<string, string>): Promise<ClientSocket>;
  close(): Promise<void>;
}

export async function startTestServer(overrides: Partial<ServerConfig> = {}): Promise<TestServer> {
  const clock = new Clock();
  const config = testConfig({
    enableTestHooks: true,
    // Lo bastante largo para no vencerse solo en las pruebas que no lo miran.
    defenseTimeoutMs: 60_000,
    rateLimits: {
      actionsPerSecond: 1000,
      actionsBurst: 1000,
      entriesPerMinute: 10_000,
      entriesBurst: 1000,
      reactionsPerSecond: 1000,
      reactionsBurst: 1000,
    },
    ...overrides,
  });
  const server = createBorrachoServer(config, { now: clock.now, log: silentLogger });
  const port = await server.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${port}`;
  const clients: ClientSocket[] = [];
  return {
    server,
    url,
    clock,
    clients,
    async client(headers) {
      const socket: ClientSocket = connect(url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        ...(headers ? { extraHeaders: headers } : {}),
      });
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      return socket;
    },
    async close() {
      for (const socket of clients) socket.disconnect();
      await server.close();
    },
  };
}

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type AckData<E extends keyof ClientToServerEvents> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

export async function request<E extends keyof ClientToServerEvents>(
  socket: ClientSocket,
  event: E,
  payload: Payload<E> | unknown,
): Promise<AckData<E>> {
  const timed = socket.timeout(3000);
  return await (timed.emitWithAck.bind(timed) as (e: E, p: unknown) => Promise<AckData<E>>)(event, payload);
}

export function expectOk<T>(ack: Ack<T>): T {
  if (!ack.ok) throw new Error(`Se esperaba ok y llegó ${ack.error.code}: ${ack.error.message}`);
  return ack.data;
}

export function expectError<T>(ack: Ack<T>): string {
  if (ack.ok) throw new Error('Se esperaba un error y la operación fue aceptada');
  return ack.error.code;
}

/** Espera el próximo evento que cumpla la condición. */
export function next<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  predicate: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`No llegó ${String(event)} a tiempo`));
    }, timeoutMs);
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(payload);
    };
    socket.on(event, handler as never);
  });
}

/** Junta todo lo que llega por un evento (para comprobar que algo NO llegó). */
export function record<E extends keyof ServerToClientEvents>(socket: ClientSocket, event: E) {
  const items: Parameters<ServerToClientEvents[E]>[0][] = [];
  socket.on(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => items.push(payload)) as never);
  return items;
}

/** El último room:state que llegó a cada celular (se actualiza solo). */
export function latest(socket: ClientSocket): { room: RoomView | null } {
  const box: { room: RoomView | null } = { room: null };
  socket.on('room:state', (room) => {
    if (!box.room || room.version >= box.room.version) box.room = room;
  });
  return box;
}

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Seat {
  socket: ClientSocket;
  grant: SessionGrant;
  id: string;
  name: string;
  view: { room: RoomView | null };
}

/** Crea una sala con el primero y suma al resto. Devuelve los asientos en orden. */
export async function seatPlayers(t: TestServer, names: string[], maxPlayers = 6): Promise<{ code: string; seats: Seat[] }> {
  const [hostName, ...others] = names;
  const host = await t.client();
  const hostView = latest(host);
  const hostGrant = expectOk(await request(host, 'room:create', { name: hostName, maxPlayers }));
  const seats: Seat[] = [{ socket: host, grant: hostGrant, id: hostGrant.playerId, name: hostName!, view: hostView }];
  for (const name of others) {
    const socket = await t.client();
    const view = latest(socket);
    const grant = expectOk(await request(socket, 'room:join', { name, code: hostGrant.room.code }));
    seats.push({ socket, grant, id: grant.playerId, name, view });
  }
  return { code: hostGrant.room.code, seats };
}

/** Sienta a todos y arranca. Devuelve los asientos y quién tiene el turno. */
export async function startGame(t: TestServer, names: string[]) {
  const table = await seatPlayers(t, names);
  const host = table.seats[0]!;
  const states = table.seats.map((s) => next(s.socket, 'room:state', (r) => r.status === 'PLAYING'));
  expectOk(await request(host.socket, 'room:start', {}));
  const views = await Promise.all(states);
  const currentId = views[0]!.game!.currentPlayerId;
  const current = table.seats.find((s) => s.id === currentId)!;
  const others = table.seats.filter((s) => s !== current);
  return { ...table, current, others };
}

export async function hook(t: TestServer, code: string, what: string, body: unknown) {
  const res = await fetch(`${t.url}/__test__/rooms/${code}/${what}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gancho ${what}: ${res.status} ${await res.text()}`);
}

/** Espera a que llegue una vista que cumpla la condición. */
export async function until(seat: Seat, predicate: (room: RoomView) => boolean): Promise<RoomView> {
  if (seat.view.room && predicate(seat.view.room)) return seat.view.room;
  return next(seat.socket, 'room:state', predicate);
}

export function roomOf(t: TestServer, code: string) {
  const room = t.server.rooms.getByCode(code);
  if (!room) throw new Error(`No existe la sala ${code}`);
  return room;
}

export const DESTORNILLADOR = ['Vodka', 'Jugo de naranja', 'Vaso highball', 'Construir'];
export const FERNET = ['Fernet', 'Coca', 'Botella cortada'];
