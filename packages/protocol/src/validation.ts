/**
 * Normalización de lo que escribe la persona. El celular la usa para avisar antes de mandar;
 * el servidor la vuelve a aplicar y es quien decide.
 */

export const DEFAULT_NAME_MAX_LENGTH = 20;

/** Sin 0/O ni 1/I/L para que el código se pueda dictar sin confusiones. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

// Controles, sustitutos sueltos, uso privado, no asignados y overrides bidi
// (que permiten disfrazar un nombre como otro).
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Cs}\p{Co}\p{Cn}‪-‮⁦-⁩]/u;

/** Devuelve el nombre limpio, o null si no es válido. */
export function normalizeName(raw: unknown, maxLength = DEFAULT_NAME_MAX_LENGTH): string | null {
  if (typeof raw !== 'string' || raw.length > maxLength * 8) return null;
  const name = raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (name.length === 0 || FORBIDDEN_IN_NAME.test(name)) return null;
  const length = [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(name)].length;
  return length <= maxLength ? name : null;
}

/** Acepta minúsculas, espacios y guiones; devuelve el código canónico o null. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const char of code) if (!ROOM_CODE_ALPHABET.includes(char)) return null;
  return code;
}

export function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}
