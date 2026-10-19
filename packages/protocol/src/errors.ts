import type { ErrorCode as GameErrorCode } from '@borracho/engine';

export type RoomErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_NAME'
  | 'NAME_TAKEN'
  | 'INVALID_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'ROOM_FINISHED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_IN_USE'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'INVALID_CAPACITY'
  | 'CAPACITY_BELOW_PLAYERS'
  | 'INVALID_OPTIONS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_DISCONNECTED'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_STILL_CONNECTED'
  | 'CANNOT_KICK_SELF'
  | 'WRONG_ROOM_STATUS'
  | 'CARDS_CHANGED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type ErrorCode = RoomErrorCode | GameErrorCode;

export interface AppError {
  readonly code: ErrorCode;
  /** Mensaje en español para mostrar. Nunca incluye detalles internos. */
  readonly message: string;
}

export const ROOM_ERROR_MESSAGES: Readonly<Record<RoomErrorCode, string>> = {
  INVALID_PAYLOAD: 'La solicitud no es válida.',
  INVALID_NAME: 'Escribí un nombre de 1 a 20 caracteres.',
  NAME_TAKEN: 'Ya hay alguien con ese nombre en la sala. Probá con otro.',
  INVALID_CODE: 'El código tiene 6 caracteres, letras y números.',
  ROOM_NOT_FOUND: 'No existe una partida con ese código. Revisalo y probá de nuevo.',
  ROOM_FULL: 'La sala está llena.',
  GAME_IN_PROGRESS: 'Esa partida ya empezó y no admite jugadores nuevos.',
  ROOM_FINISHED: 'Esa partida ya terminó.',
  SESSION_NOT_FOUND: 'Tu partida ya no está disponible. Puede que haya terminado o que el servidor se haya reiniciado.',
  SESSION_IN_USE: 'Ya estás conectado a esta partida desde otra pestaña o dispositivo.',
  ALREADY_IN_ROOM: 'Ya estás en una sala. Salí de esa antes de entrar a otra.',
  NOT_IN_ROOM: 'No estás en ninguna sala.',
  NOT_HOST: 'Solo el anfitrión puede hacer eso.',
  INVALID_CAPACITY: 'La capacidad tiene que ser de 2 a 6 jugadores.',
  CAPACITY_BELOW_PLAYERS: 'Ya hay más jugadores que esa capacidad.',
  INVALID_OPTIONS: 'Esas opciones no son válidas.',
  NOT_ENOUGH_PLAYERS: 'Se necesitan al menos 2 jugadores para empezar.',
  PLAYERS_DISCONNECTED: 'Hay jugadores desconectados. Esperalos o sacalos para empezar.',
  PLAYER_NOT_FOUND: 'Ese jugador no está en la sala.',
  PLAYER_STILL_CONNECTED: 'Solo se puede sacar a un jugador desconectado.',
  CANNOT_KICK_SELF: 'No podés sacarte a vos mismo. Usá "Salir".',
  WRONG_ROOM_STATUS: 'Eso no se puede hacer en este momento de la partida.',
  CARDS_CHANGED: 'Tus cartas cambiaron. Mirá de nuevo y probá otra vez.',
  RATE_LIMITED: 'Demasiados intentos seguidos. Esperá unos segundos.',
  INTERNAL: 'Algo falló en el servidor. Probá de nuevo.',
};

export const GAME_ERROR_MESSAGES: Readonly<Record<GameErrorCode, string>> = {
  GAME_OVER: 'La partida ya terminó.',
  NOT_YOUR_TURN: 'No es tu turno.',
  WRONG_PHASE: 'Eso no se puede hacer ahora.',
  UNKNOWN_PLAYER: 'Ese jugador no está en la partida.',
  CARD_NOT_IN_HAND: 'Esa carta no está en tu mano.',
  DUPLICATE_CARD: 'Elegiste la misma carta dos veces.',
  NO_CARDS: 'Elegí al menos una carta.',
  NOT_ENOUGH_POINTS: 'No te alcanzan los puntos.',
  LIMIT_REACHED: 'Ya no podés hacer eso en este turno.',
  BAD_TARGET: 'A ese jugador no le podés tirar.',
  UNKNOWN_COCKTAIL: 'Ese cóctel no existe.',
  BAD_DISCARD_COUNT: 'Tenés que quedarte con 8 cartas.',
  NO_TABLE_CARD: 'No hay carta en la mesa.',
  MUST_PLAY: 'Sí o sí tenés que tirar algo antes de pasar.',
  SPECIAL_NOT_IN_HAND: 'Esa carta especial no la tenés.',
  WRONG_SPECIAL: 'Esa carta especial no se juega así.',
  SPECIAL_HAND_FULL: 'Ya tenés 3 cartas especiales.',
  NO_SPECIALS_LEFT: 'No quedan cartas especiales.',
};

export function roomError(code: RoomErrorCode, message: string = ROOM_ERROR_MESSAGES[code]): AppError {
  return { code, message };
}

export function gameError(code: GameErrorCode): AppError {
  return { code, message: GAME_ERROR_MESSAGES[code] };
}
