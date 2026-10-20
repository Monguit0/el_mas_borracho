/**
 * Endpoints HTTP: salud, configuración pública, el build del cliente y, solo en pruebas, ganchos
 * para fijar la partida. Los encabezados de seguridad los pone helmet.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { parseCardId, type Card } from '@borracho/engine';
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

    // Fija las cartas de un jugador (la primera es la oculta) y, si se pasa, las de arriba del mazo.
    app.post('/__test__/rooms/:code/hand', json, (req, res) => {
      const room = find(req);
      const body = req.body as { name?: unknown; cards?: unknown; top?: unknown } | undefined;
      const player = room?.game?.players.find((p) => p.name === body?.name);
      if (!room?.game || !player) return void res.status(404).json({ error: 'No hay partida o no existe el jugador' });
      const parse = (raw: unknown): Card[] | null => {
        if (!Array.isArray(raw)) return null;
        const cards = raw.map((id) => (typeof id === 'string' ? parseCardId(id) : null));
        return cards.every(Boolean) ? (cards as Card[]) : null;
      };
      const cards = parse(body?.cards);
      const top = body?.top === undefined ? [] : parse(body.top);
      if (!cards || !top) return void res.status(400).json({ error: 'cartas inválidas' });
      const game = room.game;
      const taken = new Set([...cards, ...top].map((c) => c.id));
      // Las cartas que se piden salen de donde estén, así el mazo sigue teniendo 52.
      for (const p of game.players) p.cards = p.cards.filter((h) => !taken.has(h.card.id));
      game.deck = game.deck.filter((c) => !taken.has(c.id));
      game.discard = game.discard.filter((c) => !taken.has(c.id));
      player.cards = cards.map((card, i) => ({ card, hidden: i === 0, revealed: false, seenBy: [] }));
      game.deck.push(...[...top].reverse());
      rooms.touch(room);
      pushRoom?.(room);
      res.json({ ok: true });
    });

    // Fija las fichas de un jugador para probar finales sin jugar diez rondas.
    app.post('/__test__/rooms/:code/stats', json, (req, res) => {
      const room = find(req);
      const body = req.body as { name?: unknown; chips?: unknown } | undefined;
      const player = room?.game?.players.find((p) => p.name === body?.name);
      if (!room || !player) return void res.status(404).json({ error: 'No hay partida o no existe el jugador' });
      if (!Number.isSafeInteger(body?.chips) || (body!.chips as number) < 0) return void res.status(400).json({ error: 'chips inválido' });
      player.chips = body!.chips as number;
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
