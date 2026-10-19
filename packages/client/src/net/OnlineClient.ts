/**
 * Conexión con el servidor. Vive fuera de React para que la reconexión no
 * dependa del ciclo de vida de los componentes.
 *
 * Identidad: el servidor entrega un token secreto al crear o unirse.
 * Se guarda en sessionStorage (sobrevive a recargar la pestaña) y en
 * localStorage (para ofrecer volver a la partida después de cerrarla). Al
 * reconectar, el cliente presenta el token y recupera su lugar.
 */
import { io, type Socket } from 'socket.io-client';
import type { GameEvent } from '@borracho/engine';
import type {
  Ack,
  AppError,
  ClientToServerEvents,
  PublicConfig,
  RoomNotice,
  RoomOptions,
  RoomView,
  ServerToClientEvents,
  SessionEndReason,
  SessionGrant,
  WireAction,
} from '@borracho/protocol';
import { Emitter, readStorage, writeStorage } from '../lib/util';
import type { ConnectionStatus, FeedEvents } from '../types';

export interface StoredSession {
  token: string;
  playerId: string;
  code: string;
}

export interface OnlineState {
  connection: ConnectionStatus;
  session: StoredSession | null;
  room: RoomView | null;
  /** Reconexión en curso o conflicto con otra pestaña. */
  resume: 'idle' | 'resuming' | 'conflict';
  /** Mensaje para la pantalla de inicio cuando se pierde la partida. */
  notice: string | null;
  /** Partida que se puede retomar desde el inicio (pestaña cerrada). */
  lastSession: StoredSession | null;
  config: PublicConfig | null;
}

const SESSION_KEY = 'borracho.session';
const LAST_KEY = 'borracho.lastSession';
const ACK_TIMEOUT_MS = 10_000;
const RESUME_RETRIES = 3;

const ENDED_MESSAGES: Record<SessionEndReason, string> = {
  KICKED: 'El anfitrión te sacó de la partida.',
  REPLACED: 'Abriste esta partida en otra pestaña o dispositivo.',
  ROOM_CLOSED: 'La sala se cerró.',
};

const TIMEOUT_ERROR: AppError = { code: 'INTERNAL', message: 'El servidor no respondió. Revisá tu conexión y probá de nuevo.' };

type Listener = () => void;

export class OnlineClient {
  readonly feed = new Emitter<FeedEvents>();
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private listeners = new Set<Listener>();
  private resumeAttempts = 0;
  private state: OnlineState;

  constructor(url?: string) {
    const session = readStorage<StoredSession>('session', SESSION_KEY);
    this.state = {
      connection: 'connecting',
      session,
      room: null,
      resume: session ? 'resuming' : 'idle',
      notice: null,
      lastSession: session ? null : readStorage<StoredSession>('local', LAST_KEY),
      config: null,
    };
    this.socket = io(url ?? '', { autoConnect: false, reconnectionDelayMax: 4000 });
    this.bind();
    this.socket.connect();
    void this.loadConfig();
  }

  // --- Suscripción para React (useSyncExternalStore) ---

  getState = (): OnlineState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<OnlineState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // --- Acciones ---

  async create(name: string, maxPlayers: number): Promise<Ack<SessionGrant>> {
    return this.enter(await this.request('room:create', { name, maxPlayers }));
  }

  async join(name: string, code: string): Promise<Ack<SessionGrant>> {
    return this.enter(await this.request('room:join', { name, code }));
  }

  /** Retomar una partida guardada (por ejemplo, después de cerrar la pestaña). */
  async resumeLast(takeover = false): Promise<Ack<SessionGrant>> {
    const session = this.state.session ?? this.state.lastSession;
    if (!session) return { ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'No hay una partida para retomar.' } };
    this.set({ session, resume: 'resuming' });
    return this.resume(session, takeover);
  }

  forgetLast(): void {
    writeStorage('local', LAST_KEY, null);
    this.set({ lastSession: null });
  }

  async leave(): Promise<Ack<null>> {
    const result = await this.request('room:leave', {});
    // Si el servidor ya no tiene la sesión, igual se vuelve al inicio.
    if (result.ok || result.error.code === 'NOT_IN_ROOM') this.clearSession(null);
    return result.ok || result.error.code === 'NOT_IN_ROOM' ? { ok: true, data: null } : result;
  }

  setCapacity(maxPlayers: number) {
    return this.request('room:setCapacity', { maxPlayers });
  }

  setOptions(options: Partial<RoomOptions>) {
    return this.request('room:setOptions', options);
  }

  /** Mandar un emoji a la sala. */
  react(emoji: string) {
    return this.request('room:react', { emoji });
  }

  start() {
    return this.request('room:start', {});
  }

  /** Partida terminada: la misma sala vuelve a la espera para jugar otra. */
  reopen() {
    return this.request('room:reopen', {});
  }

  kick(playerId: string) {
    return this.request('room:kick', { playerId });
  }

  act(action: WireAction) {
    return this.request('game:action', action);
  }

  dismissNotice(): void {
    this.set({ notice: null });
  }

  // --- Internos ---

  private bind() {
    const socket = this.socket;
    socket.on('connect', () => {
      this.set({ connection: 'connected' });
      const session = this.state.session;
      if (session) {
        this.resumeAttempts = 0;
        this.set({ resume: 'resuming' });
        // La sesión es de esta pestaña (está en su sessionStorage): si se recargó, la retoma sola.
        void this.resume(session, false, true);
      }
    });
    socket.on('disconnect', () => this.set({ connection: 'disconnected' }));
    socket.io.on('reconnect_attempt', () => this.set({ connection: 'connecting' }));

    socket.on('room:state', (room) => {
      const current = this.state.room;
      if (current && current.code === room.code && room.version < current.version) return;
      this.set({ room });
    });
    socket.on('game:events', (batch) => this.feed.emit('game', batch.events as readonly GameEvent[]));
    socket.on('room:notice', (notice: RoomNotice) => this.feed.emit('notice', notice));
    socket.on('room:reaction', (reaction) => this.feed.emit('reaction', reaction));
    socket.on('session:ended', ({ reason }) => this.clearSession(ENDED_MESSAGES[reason]));
  }

  private async resume(session: StoredSession, takeover: boolean, own = false): Promise<Ack<SessionGrant>> {
    const result = await this.request('session:resume', { token: session.token, ...(takeover ? { takeover: true } : {}) });
    if (result.ok) {
      this.resumeAttempts = 0;
      return this.enter(result);
    }
    if (result.error.code === 'SESSION_IN_USE') {
      // Al recargar, la conexión vieja puede tardar un instante en cerrarse.
      if (this.resumeAttempts < RESUME_RETRIES) {
        this.resumeAttempts++;
        await new Promise((resolve) => setTimeout(resolve, 700));
        return this.resume(session, takeover, own);
      }
      // Si la partida era de esta misma pestaña (se recargó, o el celu la cerró y la volvió a abrir),
      // la conexión vieja ya no existe aunque el servidor todavía no se dio cuenta: se retoma sin preguntar.
      if (own && !takeover) return this.resume(session, true, own);
      this.set({ resume: 'conflict' });
      return result;
    }
    if (result.error.code === 'SESSION_NOT_FOUND' || result.error.code === 'ROOM_NOT_FOUND') {
      this.clearSession(result.error.message);
    } else {
      this.set({ resume: 'idle' });
    }
    return result;
  }

  private enter(result: Ack<SessionGrant>): Ack<SessionGrant> {
    if (!result.ok) return result;
    const { token, playerId, room } = result.data;
    const session = { token, playerId, code: room.code };
    writeStorage('session', SESSION_KEY, session);
    writeStorage('local', LAST_KEY, session);
    this.set({ session, room, resume: 'idle', notice: null, lastSession: null });
    return result;
  }

  private clearSession(notice: string | null) {
    writeStorage('session', SESSION_KEY, null);
    writeStorage('local', LAST_KEY, null);
    this.set({ session: null, room: null, resume: 'idle', notice, lastSession: null });
  }

  private async request<E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): Promise<AckOf<E>> {
    try {
      const timed = this.socket.timeout(ACK_TIMEOUT_MS);
      const emit = timed.emitWithAck.bind(timed) as (event: E, payload: unknown) => Promise<AckOf<E>>;
      return await emit(event, payload);
    } catch {
      return { ok: false, error: TIMEOUT_ERROR } as AckOf<E>;
    }
  }

  private async loadConfig() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) this.set({ config: (await response.json()) as PublicConfig });
    } catch {
      // Sin configuración se usan los valores por defecto del motor.
    }
  }
}

type AckOf<E extends keyof ClientToServerEvents> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];
