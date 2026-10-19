/** Registro mínimo. Nunca se registran tokens ni payloads completos. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export const consoleLogger: Logger = {
  info: (message) => console.log(`[borracho] ${message}`),
  warn: (message) => console.warn(`[borracho] ${message}`),
  error: (message, error) => console.error(`[borracho] ${message}`, error instanceof Error ? error.stack : error),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
