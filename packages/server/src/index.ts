import { loadConfig } from './config.js';
import { consoleLogger } from './logger.js';
import { createBorrachoServer } from './server.js';

const config = loadConfig();
const server = createBorrachoServer(config);

const port = await server.listen();
consoleLogger.info(`Servidor escuchando en http://${config.host}:${port}`);
consoleLogger.info('Las partidas viven en memoria: si el servidor se reinicia, las partidas en curso se pierden.');

const shutdown = (signal: string) => {
  consoleLogger.info(`${signal} recibido, cerrando…`);
  void server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
