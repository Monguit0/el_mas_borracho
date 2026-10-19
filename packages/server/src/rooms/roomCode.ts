import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@borracho/protocol';

/**
 * Código de invitación: 6 caracteres de un alfabeto de 31 sin símbolos ambiguos, con azar
 * criptográfico. 31⁶ ≈ 887 millones de códigos; junto con el límite de intentos por IP,
 * adivinar uno activo no es práctico.
 */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}
