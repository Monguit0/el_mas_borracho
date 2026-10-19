/**
 * Identidad recuperable de cada participante.
 *
 * - El token tiene 256 bits aleatorios y solo lo recibe su dueño.
 * - El servidor guarda únicamente su hash SHA-256: si alguien leyera la
 *   memoria del proceso no podría hacerse pasar por un jugador.
 * - La identidad nunca se recupera por nombre ni por código de sala.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface SessionTarget {
  readonly roomId: string;
  readonly playerId: string;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessionService {
  private readonly byHash = new Map<string, SessionTarget>();

  issue(target: SessionTarget): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    const hash = hashToken(token);
    this.byHash.set(hash, target);
    return { token, hash };
  }

  resolve(token: unknown): SessionTarget | null {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
    return this.byHash.get(hashToken(token)) ?? null;
  }

  revoke(hash: string): void {
    this.byHash.delete(hash);
  }

  get size(): number {
    return this.byHash.size;
  }
}
