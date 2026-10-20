/**
 * Configuración del servidor por variables de entorno. Nada de esto le llega al celular salvo lo
 * que devuelve /api/config.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_NAME_MAX_LENGTH } from '@borracho/protocol';

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  /** Origen permitido para Socket.IO si el celular se sirve desde otro dominio. */
  readonly clientOrigin: string | null;
  /** Carpeta con el build del cliente para servirlo desde el mismo origen. */
  readonly clientDist: string | null;
  readonly nameMaxLength: number;
  /** Cuánto conserva el rol un anfitrión desconectado. */
  readonly hostGraceMs: number;
  /** Una sala sin nadie conectado se borra después de este tiempo. */
  readonly roomIdleTtlMs: number;
  /** Una partida terminada se borra después de este tiempo. */
  readonly finishedRoomTtlMs: number;
  readonly sweepIntervalMs: number;
  /** Detrás de un proxy (Render, Fly, Nginx) para tomar la IP real. */
  readonly trustProxy: boolean;
  /** Solo para pruebas: deja fijar manos, fichas y semilla. Nunca en producción. */
  readonly enableTestHooks: boolean;
  /** Si se pasa, reemplaza los segundos de turno de la sala (las pruebas no esperan 30 segundos). */
  readonly turnTimeoutMs: number | null;
  /** La pausa entre rondas: si nadie toca "Siguiente ronda", arranca sola. */
  readonly roundPauseMs: number;
  readonly rateLimits: {
    /** Jugadas por conexión. */
    readonly actionsPerSecond: number;
    readonly actionsBurst: number;
    /** Crear, unirse o volver, por IP. */
    readonly entriesPerMinute: number;
    readonly entriesBurst: number;
    /** Emojis por conexión: alcanza para festejar sin llenar la pantalla. */
    readonly reactionsPerSecond: number;
    readonly reactionsBurst: number;
  };
}

/** El build del cliente dentro del monorepo, si existe. */
const DEFAULT_CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env['NODE_ENV'] === 'production';
  return {
    port: int(env['PORT'], 3001),
    host: env['HOST'] ?? '0.0.0.0',
    clientOrigin: env['CLIENT_ORIGIN'] || null,
    clientDist: env['CLIENT_DIST'] || (env['NODE_ENV'] !== 'test' && existsSync(DEFAULT_CLIENT_DIST) ? DEFAULT_CLIENT_DIST : null),
    nameMaxLength: int(env['NAME_MAX_LENGTH'], DEFAULT_NAME_MAX_LENGTH),
    hostGraceMs: int(env['HOST_GRACE_MS'], 60_000),
    roomIdleTtlMs: int(env['ROOM_IDLE_TTL_MS'], 30 * 60_000),
    finishedRoomTtlMs: int(env['FINISHED_ROOM_TTL_MS'], 15 * 60_000),
    sweepIntervalMs: int(env['SWEEP_INTERVAL_MS'], 5_000),
    trustProxy: env['TRUST_PROXY'] === '1' || env['TRUST_PROXY'] === 'true',
    enableTestHooks: !isProduction && env['ENABLE_TEST_HOOKS'] === '1',
    turnTimeoutMs: env['TURN_TIMEOUT_MS'] ? int(env['TURN_TIMEOUT_MS'], 30_000) : null,
    roundPauseMs: int(env['ROUND_PAUSE_MS'], 15_000),
    rateLimits: {
      actionsPerSecond: int(env['RATE_ACTIONS_PER_SECOND'], 10),
      actionsBurst: int(env['RATE_ACTIONS_BURST'], 30),
      entriesPerMinute: int(env['RATE_ENTRIES_PER_MINUTE'], 20),
      entriesBurst: int(env['RATE_ENTRIES_BURST'], 10),
      reactionsPerSecond: int(env['RATE_REACTIONS_PER_SECOND'], 2),
      reactionsBurst: int(env['RATE_REACTIONS_BURST'], 6),
    },
  };
}

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return { ...loadConfig({ NODE_ENV: 'test' }), port: 0, host: '127.0.0.1', ...overrides };
}

function int(raw: string | undefined, fallback: number): number {
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}
