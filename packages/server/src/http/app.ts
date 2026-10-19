/**
 * Endpoints HTTP: salud, configuración pública, el build del cliente y, solo en pruebas, ganchos
 * para fijar la partida. Los encabezados de seguridad los pone helmet.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { CARD_DEFS, SPECIAL_BY_CODE, type Card, type SpecialCard, type SpecialCode } from '@borracho/engine';
import { DEFAULT_ROOM_OPTIONS, PLAYER_LIMITS, normalizeRoomCode, type PublicConfig } from '@borracho/protocol';
import type { ServerConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { RoomService } from '../rooms/roomService.js';
import type { Room } from '../rooms/types.js';

export interface AppDeps {
  readonly config: ServerConfig;
  readonly rooms: RoomService;
  readonly log: Logger;
  /** Solo pruebas: corta la conexión de un jugador como si se cayera la red. */
  readonly dropConnection?: (roomId: string, playerId: string) => boolean;
  /** Solo pruebas: manda a cada uno la vista de la sala después de tocarla por un gancho. */
  readonly pushRoom?: (room: Room) => void;
}

export function createApp({ config, rooms, log, dropConnection, pushRoom }: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const connectSrc = ["'self'", 'ws:', 'wss:', ...(config.clientOrigin ? [config.clientOrigin] : [])];
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc,
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });

  app.get('/api/config', (_req, res) => {
    const body: PublicConfig = { nameMaxLength: config.nameMaxLength, players: PLAYER_LIMITS, options: DEFAULT_ROOM_OPTIONS };
    res.set('Cache-Control', 'public, max-age=300').json(body);
  });

  if (config.enableTestHooks) {
    log.warn('Ganchos de prueba habilitados: no usar en producción.');
    const find = (req: Request) => {
      const code = normalizeRoomCode(req.params['code']);
      return code ? rooms.getByCode(code) : undefined;
    };
    const json = express.json({ limit: '4kb' });

    // Semilla fija para la próxima partida de la sala (antes de empezar).
    app.post('/__test__/rooms/:code/seed', json, (req, res) => {
      const room = find(req);
      const seed = (req.body as { seed?: unknown } | undefined)?.seed;
      if (!room) return void res.status(404).json({ error: 'Sala inexistente' });
      if (!Number.isSafeInteger(seed)) return void res.status(400).json({ error: 'seed inválido' });
      room.testSeed = seed as number;
      res.json({ ok: true });
    });

    app.post('/__test__/rooms/:code/drop', json, (req, res) => {
      const room = find(req);
      const name = (req.body as { name?: unknown } | undefined)?.name;
      const player = room?.players.find((p) => p.name === name);
      if (!room || !player || !dropConnection) return void res.status(404).json({ error: 'No existe' });
      res.json({ dropped: dropConnection(room.id, player.id) });
    });

    // Fija la mano (por nombres de carta) y, si se pasa, la mano especial de un jugador.
    app.post('/__test__/rooms/:code/hand', json, (req, res) => {
      const room = find(req);
      const body = req.body as { name?: unknown; cards?: unknown; specials?: unknown } | undefined;
      const player = room?.game?.players.find((p) => p.name === body?.name);
      if (!room?.game || !player) return void res.status(404).json({ error: 'No hay partida o no existe el jugador' });
      const names = body?.cards;
      const codes = body?.specials;
      const defs = Array.isArray(names) ? names.map((n) => CARD_DEFS.find((d) => d.name === n)) : null;
      if (!defs || defs.some((d) => !d)) return void res.status(400).json({ error: 'cartas inválidas' });
      if (codes !== undefined && !(Array.isArray(codes) && codes.every((c) => SPECIAL_BY_CODE.has(c as SpecialCode)))) {
        return void res.status(400).json({ error: 'especiales inválidas' });
      }
      player.hand = defs.map((d, i): Card => ({
        id: `t-${player.id}-${i}`,
        defCode: d!.code,
        name: d!.name,
        category: d!.category,
        color: 'verde',
        symbol: 'circulo',
        number: 1,
      }));
      if (codes) {
        player.specials = (codes as SpecialCode[]).map((code, i): SpecialCard => {
          const d = SPECIAL_BY_CODE.get(code)!;
          return { id: `ts-${player.id}-${i}`, code, name: d.name, kind: d.kind, rarity: d.rarity };
        });
      }
      rooms.touch(room);
      pushRoom?.(room);
      res.json({ ok: true });
    });

    // Fija alcohol y puntos de un jugador para probar finales sin jugar veinte turnos.
    app.post('/__test__/rooms/:code/stats', json, (req, res) => {
      const room = find(req);
      const body = req.body as { name?: unknown; alcohol?: unknown; points?: unknown } | undefined;
      const player = room?.game?.players.find((p) => p.name === body?.name);
      if (!room || !player) return void res.status(404).json({ error: 'No hay partida o no existe el jugador' });
      for (const key of ['alcohol', 'points'] as const) {
        const value = body?.[key];
        if (value === undefined) continue;
        if (!Number.isSafeInteger(value) || (value as number) < 0) return void res.status(400).json({ error: `${key} inválido` });
        player[key] = value as number;
      }
      rooms.touch(room);
      pushRoom?.(room);
      res.json({ ok: true });
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No existe ese recurso.' } });
  });

  if (config.clientDist) {
    const dist = path.resolve(config.clientDist);
    const index = path.join(dist, 'index.html');
    if (!existsSync(index)) log.warn(`No se encontró el build del cliente en ${dist}`);
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, file) => {
          // Los archivos con hash pueden cachearse para siempre; el HTML no.
          res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(index);
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No existe ese recurso.' } });
  });

  // Errores inesperados: se registran completos y se responden sin detalles.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error('Error HTTP', error);
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 500;
    res.status(status >= 400 && status < 500 ? status : 500).json({
      error: { code: status >= 400 && status < 500 ? 'BAD_REQUEST' : 'INTERNAL', message: 'No se pudo procesar la solicitud.' },
    });
  });

  return app;
}
