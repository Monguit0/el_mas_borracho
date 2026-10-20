/** Opciones de la sala: las elige el anfitrión en la sala de espera. */
export interface RoomOptions {
  /** Rondas de la partida. */
  readonly rounds: 5 | 10 | 15;
  /** Segundos que tiene cada uno para jugar su turno. */
  readonly turnSeconds: 30 | 60;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = Object.freeze({ rounds: 10, turnSeconds: 30 });

export const OPTION_VALUES: { readonly [K in keyof RoomOptions]: readonly RoomOptions[K][] } = {
  rounds: [5, 10, 15],
  turnSeconds: [30, 60],
};

export const PLAYER_LIMITS = Object.freeze({ min: 2, max: 6 });
